// js/logic/calendar.js - PURE: gathers every dated thing into one list of calendar items.
// The calendar stores nothing of its own; it is a VIEW over occurrences, assessments, deadlines and events.

import { addDays, startOfWeek, toISO } from '../utils.js';
import { isCancelled } from './attendance.js';

export const CATEGORIES = [
  { key: 'class', label: 'Classes' },
  { key: 'exam', label: 'Exams' },
  { key: 'deadline', label: 'Deadlines' },
  { key: 'personal', label: 'Personal events' },
];
export const EVENT_CATEGORIES = [
  'Club meeting', 'Programming contest', 'Hackathon', 'Workshop', 'College festival', 'Sports', 'Appointment', 'Other',
];

/** Items between `from` and `to` (inclusive) for one semester, sorted by date then time. */
export function collectItems({ state, semesterId, from, to }) {
  const items = [];
  const inRange = (d) => d && d >= from && d <= to;
  const courses = state.courses.filter((c) => c.semesterId === semesterId);
  const name = (id) => (courses.find((c) => c.id === id) || {}).name || 'Course';
  const courseIds = new Set(courses.map((c) => c.id));

  for (const o of state.occurrences) {
    if (o.semesterId === semesterId && !isCancelled(o.status) && inRange(o.date)) {
      items.push({ date: o.date, time: o.startTime, endTime: o.endTime, title: name(o.courseId), sub: `${o.startTime}-${o.endTime}`, category: 'class' });
    }
  }
  for (const a of state.assessments) {
    if (courseIds.has(a.courseId) && inRange(a.date)) {
      items.push({ date: a.date, time: '', title: `${name(a.courseId)}: ${a.title}`, sub: a.type, category: 'exam' });
    }
  }
  for (const d of state.deadlines) {
    if (courseIds.has(d.courseId) && inRange(d.dueDate)) {
      items.push({ date: d.dueDate, time: d.dueTime || '', title: `${name(d.courseId)}: ${d.title}`, sub: `${d.type} due`, category: 'deadline' });
    }
  }
  for (const e of state.events) {
    if ((!e.semesterId || e.semesterId === semesterId) && inRange(e.date)) {
      items.push({ date: e.date, time: e.startTime || '', endTime: e.endTime || '', title: e.title, sub: e.category, category: 'personal', eventId: e.id });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

/** 42 ISO dates (6 weeks, Monday first) covering the month "YYYY-MM". */
export function monthGrid(yearMonth) {
  const first = `${yearMonth}-01`;
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function shiftMonth(yearMonth, delta) {
  const [y, m] = yearMonth.split('-').map(Number);
  return toISO(new Date(y, m - 1 + delta, 1)).slice(0, 7);
}
