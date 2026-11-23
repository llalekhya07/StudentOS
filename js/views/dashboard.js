// js/views/dashboard.js - a summary of everything. It stores nothing: every number is derived from the records.

import { state, settings, activeSemester, activeCourses, thresholdFor, getById } from '../state.js';
import { courseAttendance } from '../logic/attendance.js';
import { dueLabel } from '../logic/deadlines.js';
import { semesterProgress } from '../logic/semesters.js';
import { isGraded } from '../logic/assessments.js';
import { classRowHtml, handleClassAction, attendanceBadge, courseLabel } from '../components.js';
import { noSemesterHtml, badge, toast, emitChange } from '../ui.js';
import * as svc from '../services.js';
import { escapeHtml as esc, todayISO, addDays, formatDate, fmtPct, fmtNum } from '../utils.js';

export function render(root) {
  const sem = activeSemester();
  if (!sem) {
    root.innerHTML = noSemesterHtml(true);
    root.onclick = (e) => {
      if (!e.target.closest('[data-action="sample"]')) return;
      svc.loadSampleData();
      toast('Sample semester loaded. Delete it any time from My Semesters.');
      emitChange();
      render(root);
    };
    return;
  }

  const today = todayISO();
  const courses = activeCourses();
  const ids = new Set(courses.map((c) => c.id));
  const occs = state.occurrences.filter((o) => o.semesterId === sem.id);
  const todays = occs.filter((o) => o.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const att = courses.map((c) => ({ c, a: courseAttendance(occs.filter((o) => o.courseId === c.id), thresholdFor(c), today) }));
  const warnings = att.filter((x) => x.a.state === 'shortage' || x.a.state === 'close');
  const unmarked = att.reduce((s, x) => s + x.a.unmarkedPast, 0);
  const horizon = addDays(today, 14);

  const upcoming = [
    ...state.deadlines.filter((d) => ids.has(d.courseId) && d.progressStatus !== 'Submitted' && d.dueDate <= horizon)
      .map((d) => ({ date: d.dueDate, title: d.title, courseId: d.courseId, kind: d.type, note: dueLabel(d, today), overdue: d.dueDate < today })),
    ...state.assessments.filter((a) => ids.has(a.courseId) && a.status === 'Upcoming' && a.date && a.date >= today && a.date <= horizon)
      .map((a) => ({ date: a.date, title: a.title, courseId: a.courseId, kind: 'Exam', note: formatDate(a.date), overdue: false })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);

  const tasks = state.tasks.filter((t) => t.status !== 'done' && t.targetDate && t.targetDate <= addDays(today, 7))
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate)).slice(0, 5);
  const events = state.events.filter((e) => (!e.semesterId || e.semesterId === sem.id) && e.date >= today && e.date <= addDays(today, 7))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const recent = state.assessments.filter((a) => ids.has(a.courseId) && isGraded(a))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 4);
  const prog = semesterProgress(sem, today);

  root.innerHTML = `<div class="grid">
    <section class="card" style="grid-column: 1 / -1"><h2>Today, ${esc(formatDate(today))}</h2>
      ${todays.length ? todays.map((o) => classRowHtml(o)).join('') : '<p class="muted">No classes scheduled today.</p>'}</section>

    <section class="card"><h2>Attendance warnings</h2>
      ${warnings.length ? `<ul class="list">${warnings.map(({ c, a }) => `<li><strong>${esc(c.name)}</strong> ${attendanceBadge(a.state)}<br>
        <span class="muted small">${fmtPct(a.percent)} (needs ${a.threshold}%). ${a.state === 'shortage' ? `Attend the next ${a.mustAttend} classes.` : `Can miss ${a.canMiss} more.`}</span></li>`).join('')}</ul>`
        : '<p class="muted">All courses are comfortably above their requirement.</p>'}
      ${unmarked ? `<p><a href="#/timetable">${unmarked} past class${unmarked === 1 ? '' : 'es'} not marked yet</a></p>` : ''}</section>

    <section class="card"><h2>Upcoming (14 days)</h2>
      ${upcoming.length ? `<ul class="list">${upcoming.map((u) => `<li>${esc(u.title)} ${badge(u.kind, u.kind === 'Exam' ? 'badge-bad' : 'badge-warn')}
        <div class="muted small">${esc(courseLabel(getById('courses', u.courseId)))} | ${esc(u.note)}${u.overdue ? ' ' + badge('Overdue', 'badge-bad') : ''}</div></li>`).join('')}</ul>`
        : '<p class="muted">Nothing due in the next two weeks.</p>'}</section>

    <section class="card"><h2>Personal tasks and events</h2>
      ${tasks.length || events.length ? `<ul class="list">
        ${tasks.map((t) => `<li>${esc(t.title)} <span class="muted small">task, ${esc(formatDate(t.targetDate))}</span></li>`).join('')}
        ${events.map((e) => `<li>${esc(e.title)} <span class="muted small">${esc(e.category)}, ${esc(formatDate(e.date))}</span></li>`).join('')}</ul>`
        : '<p class="muted">Nothing planned this week.</p>'}</section>

    <section class="card"><h2>Semester progress</h2>
      <p class="stat">${Math.round(prog.percent)}%</p>
      <div class="progress" role="progressbar" aria-label="Semester progress" aria-valuenow="${Math.round(prog.percent)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${prog.percent}%"></span></div>
      <p class="muted">${esc(sem.name)}: day ${prog.elapsed} of ${prog.total}. ${courses.length} courses, ${courses.reduce((s, c) => s + c.credits, 0)} credits.</p></section>

    <section class="card"><h2>Recent marks</h2>
      ${recent.length ? `<ul class="list">${recent.map((a) => `<li>${esc(a.title)} <span class="muted small">${esc(courseLabel(getById('courses', a.courseId)))}</span><br>
        <strong>${fmtNum(a.marksObtained)} / ${fmtNum(a.maxMarks)}</strong></li>`).join('')}</ul>` : '<p class="muted">No marks entered yet.</p>'}</section>
  </div>`;

  root.onclick = async (e) => {
    await handleClassAction(e.target, () => { emitChange(); render(root); });
  };
}
