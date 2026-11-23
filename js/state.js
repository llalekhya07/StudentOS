// js/state.js - the app's data layer.
//
// ARCHITECTURE: all records are loaded from IndexedDB ONCE at startup into the in-memory `state`
// object. Reads are then plain synchronous array operations (simple rendering code). Every write
// updates `state` first and writes through to IndexedDB (storage.js) in the background.
// Views never touch IndexedDB; they call save()/remove() here or the functions in services.js.

import * as db from './storage.js';
import { uid, todayISO } from './utils.js';
import { DEFAULT_SCHEME } from './logic/grades.js';

export const STORES = db.RECORD_STORES;
export const state = Object.fromEntries(STORES.map((s) => [s, []]));

/** UI-only selections that survive navigation (not persisted). */
export const uiState = { examCourseId: null, resourceCourseId: null, historySemesterId: null };

/* ---------- settings (small preferences -> LocalStorage) ---------- */
const SETTINGS_KEY = 'studentos.settings';
const DEFAULTS = { attendanceThreshold: 75, deadlineSoonDays: 3, activeSemesterId: null, gradeSchemeId: null, browserNotifications: false };
export const settings = { ...DEFAULTS };

export function loadSettings() {
  try {
    Object.assign(settings, DEFAULTS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
  } catch (e) {
    Object.assign(settings, DEFAULTS);
  }
}
export function updateSettings(patch) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    db.reportError(e);
  }
}

/* ---------- generic record operations ---------- */
export async function initState() {
  const data = await db.loadAll();
  for (const store of STORES) state[store] = data[store] || [];
  ensureActiveSemester();
  ensureGradeScheme();
}

export function save(store, record) {
  if (!record.id) record.id = uid();
  const list = state[store];
  const i = list.findIndex((r) => r.id === record.id);
  if (i >= 0) list[i] = record; else list.push(record);
  db.persist(db.putRecord(store, record));
  return record;
}

export function remove(store, id) {
  state[store] = state[store].filter((r) => r.id !== id);
  db.persist(db.deleteRecord(store, id));
}

export function removeWhere(store, predicate) {
  const doomed = state[store].filter(predicate);
  state[store] = state[store].filter((r) => !predicate(r));
  doomed.forEach((r) => db.persist(db.deleteRecord(store, r.id)));
  return doomed.length;
}

/* ---------- selectors ---------- */
export const getById = (store, id) => state[store].find((r) => r.id === id) || null;
export const activeSemester = () => getById('semesters', settings.activeSemesterId);
export const coursesOf = (semesterId) =>
  state.courses.filter((c) => c.semesterId === semesterId).sort((a, b) => a.name.localeCompare(b.name));
export const activeCourses = () => (activeSemester() ? coursesOf(activeSemester().id) : []);
/** Per-course override wins; otherwise the global default. (?? keeps a legitimate 0 override.) */
export const thresholdFor = (course) => course.attendanceThreshold ?? settings.attendanceThreshold;
export const currentScheme = () => getById('gradeSchemes', settings.gradeSchemeId) || state.gradeSchemes[0] || null;

export function ensureActiveSemester() {
  if (getById('semesters', settings.activeSemesterId)) return;
  const today = todayISO();
  const sorted = [...state.semesters].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const pick = sorted.find((s) => s.startDate <= today && today <= s.endDate) || sorted[0] || null;
  updateSettings({ activeSemesterId: pick ? pick.id : null });
}

export function ensureGradeScheme() {
  if (state.gradeSchemes.length === 0) {
    const scheme = save('gradeSchemes', { id: uid(), ...DEFAULT_SCHEME });
    updateSettings({ gradeSchemeId: scheme.id });
  } else if (!getById('gradeSchemes', settings.gradeSchemeId)) {
    updateSettings({ gradeSchemeId: state.gradeSchemes[0].id });
  }
}

/* ---------- deleting with dependents (the UI confirms first, using these counts) ---------- */
const COURSE_CHILDREN = [
  ['timetable', 'timetable slots'], ['occurrences', 'class records'], ['assessments', 'assessments'],
  ['deadlines', 'assignments/deadlines'], ['resources', 'resources'], ['results', 'grade results'],
];

export function courseDependents(courseId) {
  return COURSE_CHILDREN
    .map(([store, label]) => [label, state[store].filter((r) => r.courseId === courseId).length])
    .filter(([, n]) => n > 0);
}

export function semesterDependents(semesterId) {
  const courses = coursesOf(semesterId);
  const rows = [['courses', courses.length]];
  for (const [store, label] of COURSE_CHILDREN) {
    rows.push([label, state[store].filter((r) => courses.some((c) => c.id === r.courseId)).length]);
  }
  rows.push(['events', state.events.filter((e) => e.semesterId === semesterId).length]);
  return rows.filter(([, n]) => n > 0);
}

export function deleteCourse(courseId) {
  state.resources.filter((r) => r.courseId === courseId && r.fileId)
    .forEach((r) => db.persist(db.deleteFile(r.fileId)));
  COURSE_CHILDREN.forEach(([store]) => removeWhere(store, (r) => r.courseId === courseId));
  remove('courses', courseId);
}

export function deleteSemester(semesterId) {
  coursesOf(semesterId).forEach((c) => deleteCourse(c.id));
  removeWhere('events', (e) => e.semesterId === semesterId);
  remove('semesters', semesterId);
  ensureActiveSemester();
}

/* ---------- backup restore / wipe ---------- */
/** mode 'replace' clears the record stores first; 'merge' upserts by id. Stored file blobs are left alone. */
export async function replaceAllData(data, mode) {
  // Step 1: update the in-memory state for every store, so the app is consistent immediately.
  const incomingByStore = {};
  for (const store of STORES) {
    const incoming = Array.isArray(data[store]) ? data[store] : [];
    incomingByStore[store] = incoming;
    if (mode === 'replace') state[store] = [];
    for (const rec of incoming) {
      const i = state[store].findIndex((r) => r.id === rec.id);
      if (i >= 0) state[store][i] = rec; else state[store].push(rec);
    }
  }
  ensureActiveSemester();
  ensureGradeScheme();
  // Step 2: write through to IndexedDB. A failure here is reported to the user by the caller.
  for (const store of STORES) {
    if (mode === 'replace') await db.clearStore(store);
    await db.putMany(store, state[store]);
  }
}

export async function wipeAllData() {
  STORES.forEach((s) => { state[s] = []; });
  await db.clearEverything();
  updateSettings({ activeSemesterId: null, gradeSchemeId: null });
  ensureGradeScheme();
}
