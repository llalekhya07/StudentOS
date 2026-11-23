// js/logic/timetable.js - PURE: turns weekly templates into dated class occurrences.
//
// TimetableEntry = the weekly TEMPLATE ("DBMS, Monday 09:00-10:00").
// ClassOccurrence = one dated lecture generated from it, with its OWN status.
// Cancelling/shifting changes an occurrence, never the template.

import { uid, eachDate, weekdayOf, maxDate, minDate, timeToMinutes, isISODate } from '../utils.js';

/** Identity of an occurrence: used to prevent duplicates. */
export const occurrenceKey = (o) => `${o.courseId}|${o.date}|${o.startTime}`;

/** Does this template apply on this date? (effective dates keep past classes intact) */
export function entryApplies(entry, date) {
  return (!entry.effectiveFrom || date >= entry.effectiveFrom) &&
         (!entry.effectiveTo || date <= entry.effectiveTo);
}

/**
 * Generate the occurrences for one entry that don't exist yet.
 * Only dates inside the semester, inside the entry's effective range, on its weekday,
 * on a working day and not on a holiday. Safe to call repeatedly (idempotent).
 */
export function generateOccurrences(semester, entry, existing) {
  const holidays = new Set(semester.holidays.map((h) => h.date));
  const have = new Set(existing.map(occurrenceKey));
  const from = maxDate(semester.startDate, entry.effectiveFrom || semester.startDate);
  const to = minDate(semester.endDate, entry.effectiveTo || semester.endDate);
  const created = [];
  if (!semester.workingDays.includes(entry.weekday)) return created;

  for (const date of eachDate(from, to)) {
    if (weekdayOf(date) !== entry.weekday || holidays.has(date)) continue;
    const occ = {
      id: uid(),
      semesterId: semester.id,
      courseId: entry.courseId,
      timetableEntryId: entry.id,
      date,
      startTime: entry.startTime,
      endTime: entry.endTime,
      venue: entry.venue || '',
      status: 'pending',
      reason: '',
      kind: 'regular', // regular | extra | replacement | shifted
    };
    const key = occurrenceKey(occ);
    if (have.has(key)) continue;
    have.add(key);
    created.push(occ);
  }
  return created;
}

export function validateEntry(data, semester) {
  if (!data.courseId) return 'Choose a course.';
  if (!data.startTime || !data.endTime) return 'Start and end time are required.';
  if (timeToMinutes(data.endTime) <= timeToMinutes(data.startTime)) return 'End time must be after start time.';
  if (!semester.workingDays.includes(data.weekday)) return `That weekday is not a working day in ${semester.name}.`;
  if (data.effectiveFrom && (!isISODate(data.effectiveFrom) || data.effectiveFrom < semester.startDate || data.effectiveFrom > semester.endDate)) {
    return 'The effective-from date must be inside the semester.';
  }
  return null;
}

/** For extra / replacement / shifted classes. `ignoreId` lets an edit not clash with itself. */
export function validateOccurrence(data, semester, existing, ignoreId = null) {
  if (!data.courseId) return 'Choose a course.';
  if (!isISODate(data.date)) return 'Choose a valid date.';
  if (data.date < semester.startDate || data.date > semester.endDate) return 'The date must be inside the semester.';
  if (!data.startTime || !data.endTime) return 'Start and end time are required.';
  if (timeToMinutes(data.endTime) <= timeToMinutes(data.startTime)) return 'End time must be after start time.';
  if (existing.some((o) => o.id !== ignoreId && occurrenceKey(o) === occurrenceKey(data))) {
    return 'A class for this course already exists at that date and time.';
  }
  return null;
}
