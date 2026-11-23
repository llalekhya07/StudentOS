// js/logic/semesters.js - PURE validation and progress for semesters.

import { daysBetween, isISODate } from '../utils.js';

/** `others` = all OTHER semesters (to block overlaps). Returns an error message or null. */
export function validateSemester(data, others) {
  if (!data.name) return 'Semester name is required.';
  if (!isISODate(data.startDate) || !isISODate(data.endDate)) return 'Start and end dates are required.';
  if (data.endDate <= data.startDate) return 'The end date must be after the start date.';
  if (!data.workingDays || data.workingDays.length === 0) return 'Choose at least one working day.';
  const clash = others.find((s) => data.startDate <= s.endDate && s.startDate <= data.endDate);
  if (clash) return `These dates overlap with "${clash.name}". Semesters cannot overlap.`;
  return null;
}

export function validateHoliday(semester, date, name) {
  if (!isISODate(date)) return 'Choose a date.';
  if (!name) return 'Give the holiday a name.';
  if (date < semester.startDate || date > semester.endDate) return 'The holiday must be inside the semester.';
  if (semester.holidays.some((h) => h.date === date)) return 'That date is already a holiday.';
  return null;
}

export function semesterProgress(sem, today) {
  const total = daysBetween(sem.startDate, sem.endDate) + 1;
  const elapsed = Math.min(Math.max(daysBetween(sem.startDate, today) + 1, 0), total);
  return {
    total,
    elapsed,
    percent: (elapsed / total) * 100,
    phase: today < sem.startDate ? 'upcoming' : today > sem.endDate ? 'completed' : 'ongoing',
  };
}
