// js/logic/planner.js - PURE helpers for personal tasks (separate from course deadlines).

import { addDays, startOfWeek } from '../utils.js';

export const DEFAULT_LISTS = ['Weekend Goals', 'Personal Learning'];

export const weekRange = (today) => {
  const from = startOfWeek(today);
  return { from, to: addDays(from, 6) };
};

/** Done/total for tasks whose target date falls in [from, to]. */
export function taskProgress(tasks, from, to) {
  const inRange = tasks.filter((t) => t.targetDate && t.targetDate >= from && t.targetDate <= to);
  const done = inRange.filter((t) => t.status === 'done').length;
  return { done, total: inRange.length, percent: inRange.length ? (done / inRange.length) * 100 : 0 };
}

export const isOverdue = (t, today) => t.status !== 'done' && t.targetDate && t.targetDate < today;
