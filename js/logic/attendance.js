// js/logic/attendance.js - PURE attendance maths (no DOM, no storage).
//
// Terms:  A = attended (Present),  C = conducted (Present + Absent),  T = threshold in whole percent.
// Pending (not yet marked) and Cancelled classes are NOT in C. They are not "absent".
//
// INTEGER-SAFE RULE: never compare rounded percentages. "A/C >= T/100" is rewritten as
// "100*A >= T*C", which uses only integers, so 74.999 can never be displayed as 75 and pass.

export const STATUS = {
  PENDING: 'pending',
  PRESENT: 'present',
  ABSENT: 'absent',
  CANCEL_HOLIDAY: 'cancelled_holiday',
  CANCEL_OTHER: 'cancelled_other',
};

export const STATUS_LABELS = {
  pending: 'Not marked',
  present: 'Present',
  absent: 'Absent',
  cancelled_holiday: 'Cancelled - Holiday',
  cancelled_other: 'Cancelled - Other reason',
};

import { startOfWeek, formatDate } from '../utils.js';

export const isCancelled = (s) => s === STATUS.CANCEL_HOLIDAY || s === STATUS.CANCEL_OTHER;

/** Count occurrences by status. This is the single source of truth for every attendance number. */
export function tally(occurrences) {
  let attended = 0, absent = 0, pending = 0, cancelled = 0;
  for (const o of occurrences) {
    if (o.status === STATUS.PRESENT) attended++;
    else if (o.status === STATUS.ABSENT) absent++;
    else if (isCancelled(o.status)) cancelled++;
    else pending++;
  }
  return { attended, absent, pending, cancelled, conducted: attended + absent };
}

/**
 * Most additional consecutive absences that still leave attendance >= T.
 * Need: 100*A >= T*(C + x)  =>  x <= (100*A - T*C) / T  =>  x = floor(...), clamped at 0.
 * (Same as the blueprint's floor(A/T - C) with T as a fraction, but integer-only.)
 */
export function maxMissable(A, C, T) {
  if (T <= 0) return Infinity;
  const numerator = 100 * A - T * C;
  return numerator < 0 ? 0 : Math.floor(numerator / T);
}

/**
 * Fewest consecutive classes to attend to reach T.
 * Need: 100*(A + y) >= T*(C + y)  =>  y >= (T*C - 100*A) / (100 - T)  =>  y = ceil(...).
 * At T = 100 you can never recover once you have missed a class.
 */
export function minToAttend(A, C, T) {
  if (100 * A >= T * C) return 0;
  if (T >= 100) return Infinity;
  return Math.ceil((T * C - 100 * A) / (100 - T));
}

/** 'none' (nothing conducted yet) | 'shortage' | 'close' (can miss at most 1 more) | 'ok' */
export function attendanceState(A, C, T) {
  if (C === 0) return 'none';
  if (100 * A < T * C) return 'shortage';
  return maxMissable(A, C, T) <= 1 ? 'close' : 'ok';
}

/** Best/worst case if every upcoming scheduled class takes place. Assumption, not a promise. */
export function projection(A, C, upcoming) {
  const total = C + upcoming;
  if (total === 0) return null;
  return { ifAttendAll: ((A + upcoming) / total) * 100, ifMissAll: (A / total) * 100 };
}

/** Everything the UI needs for one course. `today` is "YYYY-MM-DD". */
export function courseAttendance(occurrences, threshold, today) {
  const t = tally(occurrences);
  const unmarkedPast = occurrences.filter((o) => o.status === STATUS.PENDING && o.date < today).length;
  const upcoming = occurrences.filter((o) => o.status === STATUS.PENDING && o.date >= today).length;
  return {
    ...t,
    threshold,
    percent: t.conducted ? (t.attended / t.conducted) * 100 : null, // display only
    state: attendanceState(t.attended, t.conducted, threshold),
    canMiss: maxMissable(t.attended, t.conducted, threshold),
    mustAttend: minToAttend(t.attended, t.conducted, threshold),
    unmarkedPast,
    upcoming,
    projection: projection(t.attended, t.conducted, upcoming),
  };
}

/**
 * SKIP PLANNER (what-if). `onDate` = this course's still-unmarked classes on one date (n of them).
 * Shows the attendance if the student attends them all, or misses them all. Nothing is saved.
 * "safe" means missing them all still leaves attendance at or above the threshold (integer-safe).
 */
export function skipImpact(courseOccurrences, date, threshold) {
  const { attended: A, conducted: C } = tally(courseOccurrences);
  const n = courseOccurrences.filter((o) => o.date === date && o.status === STATUS.PENDING).length;
  const pct = (a, c) => (c ? (a / c) * 100 : null);
  return {
    n,
    nowPercent: pct(A, C),
    nowState: attendanceState(A, C, threshold),
    ifSkipPercent: pct(A, C + n),
    ifSkipState: attendanceState(A, C + n, threshold),
    safe: 100 * A >= threshold * (C + n),
    ifAttendPercent: pct(A + n, C + n),
  };
}

/** Cumulative attendance % at the end of each week that has marked classes (for the trend chart). */
export function attendanceTrend(occurrences) {
  const marked = occurrences.filter((o) => o.status === STATUS.PRESENT || o.status === STATUS.ABSENT)
    .sort((a, b) => a.date.localeCompare(b.date));
  const points = [];
  let A = 0, C = 0, week = null;
  for (const o of marked) {
    const w = startOfWeek(o.date);
    if (week !== null && w !== week) points.push({ label: formatDate(week).slice(0, 6), value: (A / C) * 100 });
    week = w;
    C++;
    if (o.status === STATUS.PRESENT) A++;
  }
  if (week !== null) points.push({ label: formatDate(week).slice(0, 6), value: (A / C) * 100 });
  return points;
}
