// js/logic/reports.js - PURE: builds the row arrays used for CSV export and the printable report.

import { courseAttendance, STATUS_LABELS } from './attendance.js';
import { courseMarks, isGraded, weightedScore } from './assessments.js';
import { fmtNum } from '../utils.js';

export const SUMMARY_HEADER = [
  'Code', 'Course', 'Credits', 'Faculty', 'Attended', 'Conducted', 'Attendance %', 'Threshold %',
  'Weighted marks earned', 'Completed weightage', 'Total weightage', 'Grade', 'Grade points',
];

export function courseSummaryRows({ courses, occurrences, assessments, results, defaultThreshold, today }) {
  return courses.map((c) => {
    const threshold = c.attendanceThreshold ?? defaultThreshold;
    const att = courseAttendance(occurrences.filter((o) => o.courseId === c.id), threshold, today);
    const marks = courseMarks(assessments.filter((a) => a.courseId === c.id));
    const res = results.find((r) => r.courseId === c.id);
    return [
      c.code || '', c.name, c.credits, c.faculty || '', att.attended, att.conducted,
      att.percent === null ? '' : fmtNum(att.percent, 1), threshold,
      fmtNum(marks.earned), fmtNum(marks.completedWeight), fmtNum(marks.totalWeight),
      res ? res.finalGrade || '' : '', res && typeof res.gradePoint === 'number' ? res.gradePoint : '',
    ];
  });
}

export const ATTENDANCE_HEADER = ['Date', 'Start', 'End', 'Course', 'Type', 'Status', 'Reason'];
export function attendanceLogRows({ courses, occurrences }) {
  const name = (id) => (courses.find((c) => c.id === id) || {}).name || 'Deleted course';
  return [...occurrences]
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .map((o) => [o.date, o.startTime, o.endTime, name(o.courseId), o.kind, STATUS_LABELS[o.status], o.reason || '']);
}

export const ASSESSMENT_HEADER = ['Course', 'Assessment', 'Type', 'Date', 'Status', 'Max marks', 'Weightage', 'Marks obtained', 'Weighted contribution'];
export function assessmentRows({ courses, assessments }) {
  const name = (id) => (courses.find((c) => c.id === id) || {}).name || 'Deleted course';
  return assessments.map((a) => [
    name(a.courseId), a.title, a.type, a.date || '', a.status, a.maxMarks, a.weightage,
    isGraded(a) ? a.marksObtained : '', isGraded(a) ? fmtNum(weightedScore(a)) : '',
  ]);
}
