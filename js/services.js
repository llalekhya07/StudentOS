// js/services.js - operations that change MORE THAN ONE kind of record, or enforce data-integrity rules.
// Views call these instead of juggling several save()/remove() calls themselves.
// Rule of thumb:  logic/*  decides (pure)  ->  services.js  applies (mutates state)  ->  views  show.

import * as db from './storage.js';
import { validateFile } from './logic/resources.js';
import { state, save, remove, removeWhere, getById, updateSettings, ensureGradeScheme } from './state.js';
import { uid, addDays, todayISO, weekdayOf, blobToBase64, base64ToBlob } from './utils.js';
import { generateOccurrences, entryApplies, occurrenceKey, validateEntry, validateOccurrence } from './logic/timetable.js';
import { STATUS, isCancelled } from './logic/attendance.js';

/**
 * Bring a semester's occurrences in line with its timetable.
 *  1. PRUNE pending regular occurrences that no longer belong (template deleted, dates/holidays changed).
 *     Occurrences the student already marked are NEVER removed.
 *  2. GENERATE missing ones (duplicates are impossible: same course + date + start time is skipped).
 */
export function syncOccurrences(semesterId) {
  const sem = getById('semesters', semesterId);
  if (!sem) return { added: 0, removed: 0 };
  const holidays = new Set(sem.holidays.map((h) => h.date));
  const entries = state.timetable.filter((e) => e.semesterId === semesterId);
  const entryById = new Map(entries.map((e) => [e.id, e]));

  const stale = state.occurrences.filter((o) =>
    o.semesterId === semesterId && o.kind === 'regular' && o.status === STATUS.PENDING && (
      o.date < sem.startDate || o.date > sem.endDate || holidays.has(o.date) ||
      !sem.workingDays.includes(weekdayOf(o.date)) ||
      !entryById.has(o.timetableEntryId) || !entryApplies(entryById.get(o.timetableEntryId), o.date)));
  stale.forEach((o) => remove('occurrences', o.id));

  let added = 0;
  for (const entry of entries) {
    const existing = state.occurrences.filter((o) => o.semesterId === semesterId);
    const fresh = generateOccurrences(sem, entry, existing);
    fresh.forEach((o) => save('occurrences', o));
    added += fresh.length;
  }
  return { added, removed: stale.length };
}

/* ---------- semesters & holidays ---------- */
export function saveSemester(data) {
  const isNew = !data.id;
  const existing = isNew ? { holidays: [], finalized: false, includeInCGPA: true } : getById('semesters', data.id);
  const sem = save('semesters', { ...existing, ...data, id: data.id || uid() });
  if (isNew) updateSettings({ activeSemesterId: sem.id });
  else syncOccurrences(sem.id); // dates / working days may have changed
  return sem;
}

/** Adding a holiday marks that day's pending classes "Cancelled - Holiday" (kept, not deleted). Returns the count. */
export function addHoliday(semesterId, date, name) {
  const sem = getById('semesters', semesterId);
  const holidays = [...sem.holidays, { date, name }].sort((a, b) => a.date.localeCompare(b.date));
  save('semesters', { ...sem, holidays });
  const affected = state.occurrences.filter((o) => o.semesterId === semesterId && o.date === date && o.status === STATUS.PENDING);
  affected.forEach((o) => save('occurrences', { ...o, status: STATUS.CANCEL_HOLIDAY, reason: name }));
  return affected.length;
}

export function removeHoliday(semesterId, date) {
  const sem = getById('semesters', semesterId);
  save('semesters', { ...sem, holidays: sem.holidays.filter((h) => h.date !== date) });
  return syncOccurrences(semesterId);
}

/* ---------- timetable templates ---------- */
export function saveTimetableEntry(data) {
  const sem = getById('semesters', data.semesterId);
  const err = validateEntry(data, sem);
  if (err) throw new Error(err);
  save('timetable', { id: uid(), venue: '', faculty: '', effectiveFrom: '', effectiveTo: '', ...data });
  return syncOccurrences(sem.id);
}

/**
 * Change a template FROM a date onward; earlier generated classes stay exactly as they were.
 * If the date is after the template's own start, the old template is closed the day before and a new one starts.
 */
export function changeTimetableFrom(entryId, changes, fromDate) {
  const entry = getById('timetable', entryId);
  const sem = getById('semesters', entry.semesterId);
  const updated = { ...entry, ...changes };
  const err = validateEntry(updated, sem);
  if (err) throw new Error(err);

  const start = entry.effectiveFrom || sem.startDate;
  if (fromDate <= start) {
    save('timetable', updated);
  } else {
    save('timetable', { ...entry, effectiveTo: addDays(fromDate, -1) });
    save('timetable', { ...updated, id: uid(), effectiveFrom: fromDate });
  }
  // Old pending classes from that date are replaced by regenerated ones. Marked classes are untouched.
  state.occurrences
    .filter((o) => o.timetableEntryId === entry.id && o.kind === 'regular' && o.status === STATUS.PENDING && o.date >= fromDate)
    .forEach((o) => remove('occurrences', o.id));
  return syncOccurrences(sem.id);
}

export function deleteTimetableEntry(entryId) {
  const entry = getById('timetable', entryId);
  remove('timetable', entryId);
  return syncOccurrences(entry.semesterId); // prunes its pending classes, keeps marked ones
}

/* ---------- single occurrences ---------- */
export function markOccurrence(id, status, reason = '') {
  const o = getById('occurrences', id);
  save('occurrences', { ...o, status, reason: isCancelled(status) ? reason : '' });
}

export function addExtraClass(data) {
  const sem = getById('semesters', data.semesterId);
  const err = validateOccurrence(data, sem, state.occurrences.filter((o) => o.semesterId === sem.id));
  if (err) throw new Error(err);
  return save('occurrences', { id: uid(), timetableEntryId: null, venue: '', status: STATUS.PENDING, reason: '', ...data });
}

/** Shift = cancel the original dated class + create a separate class at the new date/time. The template is untouched. */
export function shiftOccurrence(id, { date, startTime, endTime, venue }) {
  const o = getById('occurrences', id);
  const sem = getById('semesters', o.semesterId);
  const fresh = { courseId: o.courseId, semesterId: o.semesterId, date, startTime, endTime, venue };
  const err = validateOccurrence(fresh, sem, state.occurrences.filter((x) => x.semesterId === sem.id));
  if (err) throw new Error(err);
  save('occurrences', { ...o, status: STATUS.CANCEL_OTHER, reason: `Shifted to ${date} ${startTime}` });
  save('occurrences', { id: uid(), timetableEntryId: null, status: STATUS.PENDING, reason: '', kind: 'shifted', shiftedFromId: o.id, ...fresh });
}

export function deleteOccurrence(id) {
  remove('occurrences', id);
}

/* ---------- sample data (one removable semester) ---------- */
export function loadSampleData() {
  ensureGradeScheme();
  const today = todayISO();
  const sem = save('semesters', {
    id: uid(), name: 'Sample Semester', startDate: addDays(today, -35), endDate: addDays(today, 84),
    workingDays: [1, 2, 3, 4, 5], holidays: [{ date: addDays(today, 10), name: 'Sample holiday' }],
    finalized: false, includeInCGPA: true, sample: true,
  });
  updateSettings({ activeSemesterId: sem.id });

  const defs = [
    ['CS301', 'Database Systems', 4, 'Dr. Rao', 'LH-1', null],
    ['CS302', 'Operating Systems', 4, 'Dr. Iyer', 'LH-2', null],
    ['CS303', 'Computer Networks', 3, 'Dr. Das', 'LH-3', null],
    ['MA301', 'Discrete Mathematics', 3, 'Dr. Khan', 'LH-4', 80],
  ];
  const courses = defs.map(([code, name, credits, faculty, venue, attendanceThreshold]) =>
    save('courses', { id: uid(), semesterId: sem.id, code, name, credits, faculty, venue, attendanceThreshold }));

  // [course index, weekday (1=Mon), start, end]
  [[0, 1, '09:00', '10:00'], [0, 3, '09:00', '10:00'], [0, 5, '11:00', '12:00'],
   [1, 2, '10:00', '11:00'], [1, 4, '10:00', '11:00'],
   [2, 1, '11:00', '12:00'], [2, 3, '11:00', '12:00'],
   [3, 2, '09:00', '10:00'], [3, 4, '09:00', '10:00']].forEach(([ci, weekday, startTime, endTime]) =>
    save('timetable', { id: uid(), semesterId: sem.id, courseId: courses[ci].id, weekday, startTime, endTime, venue: courses[ci].venue, faculty: courses[ci].faculty, effectiveFrom: '', effectiveTo: '' }));
  syncOccurrences(sem.id);

  // Mark past classes with a repeatable pattern; leave the 2 most recent unmarked to show "pending".
  const past = state.occurrences.filter((o) => o.semesterId === sem.id && o.date < today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  past.slice(0, -2).forEach((o, i) => {
    const ci = courses.findIndex((c) => c.id === o.courseId);
    let status = (i + ci) % (ci === 1 ? 3 : 7) === 0 ? STATUS.ABSENT : STATUS.PRESENT;
    if (i === 9) status = STATUS.CANCEL_OTHER;
    save('occurrences', { ...o, status, reason: status === STATUS.CANCEL_OTHER ? 'Faculty on leave' : '' });
  });

  courses.forEach((c, ci) => {
    [['Quiz 1', 'Quiz', 10, 10, addDays(today, -14), 'Conducted', [8, 6, 9, 7][ci]],
     ['Mid-Semester Exam', 'Mid-Semester Examination', 50, 30, addDays(today, 14), 'Upcoming', null],
     ['End-Semester Exam', 'End-Semester Examination', 100, 50, addDays(sem.endDate, -7), 'Upcoming', null],
     ['Lab Test', 'Practical', 25, 10, addDays(today, 40), 'Upcoming', null],
    ].forEach(([title, type, maxMarks, weightage, date, status, marksObtained]) =>
      save('assessments', { id: uid(), courseId: c.id, title, type, maxMarks, weightage, date, status, marksObtained, notes: '', updatedAt: new Date().toISOString() }));
  });

  [[0, 'ER diagram assignment', 'Assignment', 3, 'Medium', 'Not started'],
   [1, 'Scheduler project', 'Project', 12, 'High', 'In progress'],
   [2, 'Subnetting worksheet', 'Assignment', -2, 'Medium', 'Not started'],
   [3, 'Proof set 2', 'Assignment', -5, 'Low', 'Submitted'],
  ].forEach(([ci, title, type, offset, priority, progressStatus]) =>
    save('deadlines', { id: uid(), courseId: courses[ci].id, title, type, description: '', dueDate: addDays(today, offset), dueTime: '', priority, progressStatus, link: '', score: null, scoreMax: null, relatedAssessmentId: '', submittedAt: progressStatus === 'Submitted' ? addDays(today, -6) : '', history: [{ status: progressStatus, date: today }] }));

  save('resources', { id: uid(), courseId: courses[0].id, title: 'SQL tutorial', resourceType: 'link', topic: 'Unit 1', url: 'https://www.w3schools.com/sql/', text: '', relatedTo: '' });
  save('resources', { id: uid(), courseId: courses[1].id, title: 'Scheduling cheat sheet', resourceType: 'note', topic: 'Unit 2', url: '', text: 'FCFS, SJF, Round Robin: compare waiting times on the same example.', relatedTo: '' });

  save('events', { id: uid(), semesterId: sem.id, title: 'Coding club meeting', category: 'Club meeting', date: addDays(today, 2), startTime: '17:00', endTime: '18:00', location: 'Lab 2', description: '', reminderDays: 1 });
  save('events', { id: uid(), semesterId: null, title: 'Weekend hackathon', category: 'Hackathon', date: addDays(today, 6), startTime: '', endTime: '', location: '', description: '', reminderDays: 3 });

  save('tasks', { id: uid(), title: 'Revise graph algorithms', list: 'Weekend Goals', targetDate: addDays(today, 2), priority: 'High', notes: '', status: 'todo' });
  save('tasks', { id: uid(), title: 'Solve 3 contest problems', list: 'Personal Learning', targetDate: addDays(today, -1), priority: 'Medium', notes: '', status: 'todo' });
  return sem;
}

/* ---------- file attachments (blob in IndexedDB "files", metadata in the resource record) ---------- */
export async function addFileResource(file, meta) {
  const problem = validateFile(file);
  if (problem) throw new Error(problem);
  const fileId = uid();
  try {
    await db.putFile({ id: fileId, blob: file, name: file.name, type: file.type, size: file.size });
  } catch (e) {
    throw new Error('The browser could not store this file (storage may be full).');
  }
  return save('resources', { id: uid(), resourceType: 'file', url: '', text: '', relatedTo: '', ...meta, fileId, fileName: file.name, fileType: file.type, fileSize: file.size });
}

export async function openStoredFile(fileId, download) {
  const rec = await db.getFile(fileId);
  if (!rec) throw new Error('This file is not stored in this browser. Files are not part of JSON backups.');
  const url = URL.createObjectURL(rec.blob);
  const a = document.createElement('a');
  a.href = url;
  if (download) a.download = rec.name; else { a.target = '_blank'; a.rel = 'noopener'; }
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function deleteResource(id) {
  const r = getById('resources', id);
  if (r && r.fileId) db.persist(db.deleteFile(r.fileId));
  remove('resources', id);
}

/* ---------- full backup: attached files <-> base64 ---------- */
export async function exportFilesForBackup() {
  const out = [];
  for (const r of state.resources.filter((x) => x.fileId)) {
    const rec = await db.getFile(r.fileId);
    if (rec) out.push({ id: rec.id, name: rec.name, type: rec.type, size: rec.size, data: await blobToBase64(rec.blob) });
  }
  return out;
}

export async function importFilesFromBackup(files) {
  let n = 0;
  for (const f of files || []) {
    await db.putFile({ id: f.id, blob: base64ToBlob(f.data, f.type), name: f.name, type: f.type, size: f.size });
    n++;
  }
  return n;
}
