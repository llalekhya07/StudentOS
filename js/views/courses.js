// js/views/courses.js - course list and a per-course detail page that connects everything about one course.

import { state, activeSemester, activeCourses, getById, save, thresholdFor, courseDependents, deleteCourse, uiState } from '../state.js';
import { courseAttendance, attendanceTrend } from '../logic/attendance.js';
import { courseMarks } from '../logic/assessments.js';
import { deadlineState, dueLabel } from '../logic/deadlines.js';
import { settings } from '../state.js';
import { openForm, confirmDialog, toast, pageHeader, emptyState, noSemesterHtml, badge, emitChange, lineChartSvg } from '../ui.js';
import { attendanceBadge, fmtCount, courseLabel } from '../components.js';
import { escapeHtml as esc, fmtPct, fmtNum, todayISO, WEEKDAYS, uid } from '../utils.js';

function courseForm(sem, existing, onDone) {
  openForm({
    title: existing ? 'Edit course' : 'Add course',
    values: existing || {},
    fields: [
      { name: 'name', label: 'Course name', type: 'text', required: true },
      { name: 'code', label: 'Course code', type: 'text', placeholder: 'CS301' },
      { name: 'credits', label: 'Credits', type: 'number', required: true, min: 0, step: 0.5 },
      { name: 'faculty', label: 'Faculty', type: 'text' },
      { name: 'venue', label: 'Venue (optional)', type: 'text' },
      { name: 'attendanceThreshold', label: 'Attendance requirement % (optional)', type: 'number', min: 1, max: 100, step: 1,
        hint: `Leave empty to use the default (${settings.attendanceThreshold}%).` },
    ],
    validate: (v) => {
      if (!(v.credits > 0)) return 'Credits must be greater than 0.';
      if (v.attendanceThreshold !== null && !Number.isInteger(v.attendanceThreshold)) return 'Attendance requirement must be a whole number.';
      return null;
    },
    onSubmit: (v) => {
      save('courses', { ...(existing || { id: uid(), semesterId: sem.id }), ...v });
      toast(existing ? 'Course updated.' : 'Course added.');
      onDone();
    },
  });
}

function listHtml(sem) {
  const courses = activeCourses();
  if (!courses.length) return emptyState('No courses yet', `Add the courses you take in ${sem.name}.`);
  const today = todayISO();
  return `<div class="grid">${courses.map((c) => {
    const att = courseAttendance(state.occurrences.filter((o) => o.courseId === c.id), thresholdFor(c), today);
    return `<article class="card"><h2><a href="#/courses/${c.id}">${esc(c.name)}</a></h2>
      <p class="muted">${esc(c.code || 'No code')} | ${c.credits} credits${c.faculty ? ' | ' + esc(c.faculty) : ''}</p>
      <p>Attendance: <strong>${fmtPct(att.percent)}</strong> ${attendanceBadge(att.state)}</p>
      <a class="btn btn-sm" href="#/courses/${c.id}">Open course</a></article>`;
  }).join('')}</div>`;
}

function detailHtml(c, sem) {
  const today = todayISO();
  const att = courseAttendance(state.occurrences.filter((o) => o.courseId === c.id), thresholdFor(c), today);
  const marks = courseMarks(state.assessments.filter((a) => a.courseId === c.id));
  const deadlines = state.deadlines.filter((d) => d.courseId === c.id && d.progressStatus !== 'Submitted')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5);
  const slots = state.timetable.filter((e) => e.courseId === c.id).sort((a, b) => a.weekday - b.weekday);
  const resources = state.resources.filter((r) => r.courseId === c.id).length;
  const trend = attendanceTrend(state.occurrences.filter((o) => o.courseId === c.id));
  return `<p><a href="#/courses">&larr; All courses</a></p>
    ${pageHeader(courseLabel(c), `<button class="btn btn-sm" data-action="edit">Edit</button><button class="btn btn-sm btn-danger" data-action="delete">Delete</button>`)}
    <p class="muted">${c.credits} credits${c.faculty ? ' | ' + esc(c.faculty) : ''}${c.venue ? ' | ' + esc(c.venue) : ''} | attendance requirement ${thresholdFor(c)}%${c.attendanceThreshold == null ? ' (default)' : ''}</p>
    <div class="grid">
      <section class="card"><h2>Attendance</h2>
        <p class="stat">${fmtPct(att.percent)}</p><p>${attendanceBadge(att.state)} ${att.attended} attended of ${att.conducted} conducted</p>
        <p class="muted small">Can miss ${fmtCount(att.canMiss)} more | must attend ${fmtCount(att.mustAttend)} to recover | ${att.unmarkedPast} unmarked</p>
        <a class="btn btn-sm" href="#/timetable">Open attendance</a></section>
      <section class="card"><h2>Marks</h2>
        <p class="stat">${fmtNum(marks.earned)} / ${fmtNum(marks.completedWeight)}</p>
        <p class="muted">weighted marks earned out of the ${fmtNum(marks.completedWeight)}% graded so far (course total ${fmtNum(marks.totalWeight)}%)</p>
        <button class="btn btn-sm" data-action="open-marks">Open exams &amp; marks</button></section>
      <section class="card"><h2>Resources</h2><p class="stat">${resources}</p><p class="muted">files, links and notes</p>
        <button class="btn btn-sm" data-action="open-resources">Open resources</button></section>
    </div>
    <section class="section card"><h2>Attendance trend</h2>
      ${trend.length ? lineChartSvg(trend, { max: 100, refLine: { value: thresholdFor(c), label: `${thresholdFor(c)}% required` } }) + '<p class="muted small">Cumulative attendance at the end of each week (marked classes only).</p>' : '<p class="muted">Mark some classes to see the trend.</p>'}</section>
    <section class="section card"><h2>Upcoming deadlines</h2>
      ${deadlines.length ? `<ul class="list">${deadlines.map((d) => `<li>${esc(d.title)} ${badge(d.type, 'badge-class')}
        <span class="muted">${esc(dueLabel(d, today))}</span> ${deadlineState(d, today, settings.deadlineSoonDays) === 'overdue' ? badge('Overdue', 'badge-bad') : ''}</li>`).join('')}</ul>` : '<p class="muted">Nothing pending.</p>'}</section>
    <section class="section card"><h2>Weekly timetable</h2>
      ${slots.length ? `<ul class="list">${slots.map((e) => `<li>${WEEKDAYS[e.weekday]} ${esc(e.startTime)}-${esc(e.endTime)}${e.venue ? ' | ' + esc(e.venue) : ''}</li>`).join('')}</ul>` : '<p class="muted">No weekly slots yet.</p>'}</section>`;
}

export function render(root, courseId) {
  const sem = activeSemester();
  if (!sem) { root.innerHTML = noSemesterHtml(); return; }
  const refresh = () => { emitChange(); render(root, courseId); };
  const course = courseId ? getById('courses', courseId) : null;
  if (courseId && (!course || course.semesterId !== sem.id)) {
    root.innerHTML = emptyState('Course not found', 'It may belong to another semester or have been deleted.', '<a class="btn" href="#/courses">Back to courses</a>');
    return;
  }

  root.innerHTML = course ? detailHtml(course, sem)
    : `${pageHeader('Courses', '<button class="btn btn-primary" data-action="add">Add course</button>')}${listHtml(sem)}`;

  root.onclick = async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const { action } = b.dataset;
    if (action === 'add') courseForm(sem, null, refresh);
    else if (action === 'edit') courseForm(sem, course, refresh);
    else if (action === 'open-marks') { uiState.examCourseId = course.id; location.hash = '#/exams'; }
    else if (action === 'open-resources') { uiState.resourceCourseId = course.id; location.hash = '#/resources'; }
    else if (action === 'delete') {
      const ok = await confirmDialog({
        title: `Delete ${course.name}?`, message: 'This permanently deletes the course and:',
        details: courseDependents(course.id), confirmLabel: 'Delete course', danger: true,
      });
      if (ok) { deleteCourse(course.id); toast('Course deleted.'); emitChange(); location.hash = '#/courses'; }
    }
  };
}
