// js/logic/deadlines.js - PURE helpers for assignments / projects / demos / vivas.
// Submission progress is kept separate from evaluation (score), so a submitted item can be scored later.

import { daysBetween } from '../utils.js';

export const DEADLINE_TYPES = ['Assignment', 'Project', 'Demo', 'Viva', 'Quiz deadline', 'Submission', 'Other'];
export const PROGRESS = ['Not started', 'In progress', 'Submitted'];
export const PRIORITIES = ['Low', 'Medium', 'High'];
export const priorityRank = (p) => ({ High: 0, Medium: 1, Low: 2 }[p] ?? 3);

/** 'done' | 'overdue' | 'soon' | 'upcoming' */
export function deadlineState(d, today, soonDays) {
  if (d.progressStatus === 'Submitted') return 'done';
  if (d.dueDate < today) return 'overdue';
  return daysBetween(today, d.dueDate) <= soonDays ? 'soon' : 'upcoming';
}

export function dueLabel(d, today) {
  if (d.progressStatus === 'Submitted') return d.submittedAt ? `Submitted ${d.submittedAt}` : 'Submitted';
  const n = daysBetween(today, d.dueDate);
  if (n < 0) return `Overdue by ${-n} day${n === -1 ? '' : 's'}`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `Due in ${n} days`;
}
