// js/logic/notifications.js - PURE: notifications are DERIVED from existing data, never stored.
// Only the "read" flag is stored (state.notifState), keyed by the deterministic id built here.

import { daysBetween, formatDate } from '../utils.js';
import { courseAttendance } from './attendance.js';
import { deadlineState } from './deadlines.js';

const SEVERITY = { high: 0, medium: 1, low: 2 };

export function buildNotifications({ state, settings, semesterId, today }) {
  const out = [];
  const courses = state.courses.filter((c) => c.semesterId === semesterId);
  const ids = new Set(courses.map((c) => c.id));
  const nameOf = (id) => (courses.find((c) => c.id === id) || {}).name || 'Course';
  const when = (date) => {
    const n = daysBetween(today, date);
    return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
  };

  for (const d of state.deadlines) {
    if (!ids.has(d.courseId)) continue;
    const st = deadlineState(d, today, settings.deadlineSoonDays);
    if (st === 'overdue') {
      out.push({ id: `deadline:${d.id}:overdue`, severity: 'high', date: d.dueDate, link: '#/assignments', message: `Overdue: ${d.title} (${nameOf(d.courseId)}) was due ${formatDate(d.dueDate)}.` });
    } else if (st === 'soon') {
      out.push({ id: `deadline:${d.id}:soon`, severity: 'medium', date: d.dueDate, link: '#/assignments', message: `${d.title} (${nameOf(d.courseId)}) is due ${when(d.dueDate)}.` });
    }
  }

  for (const a of state.assessments) {
    if (!ids.has(a.courseId) || a.status !== 'Upcoming' || !a.date) continue;
    const n = daysBetween(today, a.date);
    if (n >= 0 && n <= 7) {
      out.push({ id: `exam:${a.id}`, severity: n <= 2 ? 'high' : 'medium', date: a.date, link: '#/exams', message: `${a.title} (${nameOf(a.courseId)}) is ${when(a.date)}.` });
    }
  }

  for (const c of courses) {
    const threshold = c.attendanceThreshold ?? settings.attendanceThreshold;
    const att = courseAttendance(state.occurrences.filter((o) => o.courseId === c.id), threshold, today);
    if (att.state === 'shortage') {
      out.push({ id: `attendance:${c.id}:shortage`, severity: 'high', date: today, link: '#/timetable', message: `${c.name}: attendance is below ${threshold}%. Attend the next ${att.mustAttend === Infinity ? 'all' : att.mustAttend} classes to recover.` });
    } else if (att.state === 'close') {
      out.push({ id: `attendance:${c.id}:close`, severity: 'medium', date: today, link: '#/timetable', message: `${c.name}: close to shortage. You can miss at most ${att.canMiss} more class${att.canMiss === 1 ? '' : 'es'}.` });
    }
    if (att.unmarkedPast > 0) {
      out.push({ id: `unmarked:${c.id}`, severity: 'low', date: today, link: '#/timetable', message: `${c.name}: ${att.unmarkedPast} past class${att.unmarkedPast === 1 ? ' is' : 'es are'} not marked yet.` });
    }
  }

  for (const t of state.tasks) {
    if (t.status === 'done' || !t.targetDate || t.targetDate > today) continue;
    out.push({ id: `task:${t.id}`, severity: t.targetDate < today ? 'medium' : 'low', date: t.targetDate, link: '#/planner', message: `${t.targetDate < today ? 'Overdue task' : 'Task due today'}: ${t.title}` });
  }

  for (const e of state.events) {
    if ((e.semesterId && e.semesterId !== semesterId) || e.reminderDays === null || e.reminderDays === undefined) continue;
    const n = daysBetween(today, e.date);
    if (n >= 0 && n <= e.reminderDays) {
      out.push({ id: `event:${e.id}`, severity: 'low', date: e.date, link: '#/calendar', message: `${e.title} is ${when(e.date)}.` });
    }
  }

  return out.sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity] || a.date.localeCompare(b.date));
}
