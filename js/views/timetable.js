// js/views/timetable.js - daily attendance marking, per-course attendance summary with the shortage
// predictor, and the weekly timetable template.

import { state, activeSemester, activeCourses, thresholdFor, getById } from '../state.js';
import { courseAttendance, skipImpact } from '../logic/attendance.js';
import * as svc from '../services.js';
import { classRowHtml, handleClassAction, attendanceBadge, courseOptions, courseLabel, fmtCount } from '../components.js';
import { openForm, confirmDialog, toast, pageHeader, emptyState, noSemesterHtml, badge, emitChange } from '../ui.js';
import { escapeHtml as esc, todayISO, addDays, formatDate, fmtPct, WEEKDAYS, maxDate } from '../utils.js';

let selectedDate = null;
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

function slotForm(sem, entry, onDone) {
  const fields = [
    { name: 'courseId', label: 'Course', type: 'select', required: true, options: courseOptions(sem.id) },
    { name: 'weekday', label: 'Weekday', type: 'select', numeric: true, required: true,
      options: MON_FIRST.filter((d) => sem.workingDays.includes(d)).map((d) => ({ value: d, label: WEEKDAYS[d] })) },
    { name: 'startTime', label: 'Start time', type: 'time', required: true },
    { name: 'endTime', label: 'End time', type: 'time', required: true },
    { name: 'venue', label: 'Classroom / venue (optional)', type: 'text' },
    { name: 'faculty', label: 'Faculty (optional)', type: 'text' },
  ];
  if (entry) {
    fields.push({ name: 'changeFrom', label: 'Apply this change from', type: 'date', required: true,
      value: maxDate(todayISO(), entry.effectiveFrom || sem.startDate),
      hint: 'Classes before this date stay exactly as they are.' });
  } else {
    fields.push({ name: 'effectiveFrom', label: 'Starts on (optional)', type: 'date', hint: 'Leave empty to start with the semester.' });
  }
  openForm({
    title: entry ? 'Edit weekly slot' : 'Add weekly slot',
    values: entry || {},
    fields,
    onSubmit: (v) => {
      const { changeFrom, ...data } = v;
      const r = entry
        ? svc.changeTimetableFrom(entry.id, { courseId: data.courseId, weekday: data.weekday, startTime: data.startTime, endTime: data.endTime, venue: data.venue, faculty: data.faculty }, changeFrom)
        : svc.saveTimetableEntry({ semesterId: sem.id, ...data });
      toast(`${r.added} class${r.added === 1 ? '' : 'es'} generated, ${r.removed} unmarked removed.`);
      onDone();
    },
  });
}

function extraForm(sem, date, onDone) {
  openForm({
    title: 'Add extra / replacement class',
    values: { date },
    fields: [
      { name: 'courseId', label: 'Course', type: 'select', required: true, options: courseOptions(sem.id) },
      { name: 'kind', label: 'Type', type: 'select', options: [{ value: 'extra', label: 'Extra class' }, { value: 'replacement', label: 'Replacement class' }] },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'startTime', label: 'Start time', type: 'time', required: true },
      { name: 'endTime', label: 'End time', type: 'time', required: true },
      { name: 'venue', label: 'Venue (optional)', type: 'text' },
    ],
    onSubmit: (v) => { svc.addExtraClass({ semesterId: sem.id, ...v }); toast('Class added.'); onDone(); },
  });
}

export function render(root) {
  const sem = activeSemester();
  if (!sem) { root.innerHTML = noSemesterHtml(); return; }
  const courses = activeCourses();
  if (!courses.length) {
    root.innerHTML = emptyState('Add a course first', 'The timetable is built from your courses.', '<a class="btn btn-primary" href="#/courses">Go to courses</a>');
    return;
  }
  const refresh = () => { emitChange(); render(root); };
  const today = todayISO();
  if (!selectedDate) selectedDate = today;

  const occs = state.occurrences.filter((o) => o.semesterId === sem.id);
  const day = occs.filter((o) => o.date === selectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const rows = courses.map((c) => ({ c, a: courseAttendance(occs.filter((o) => o.courseId === c.id), thresholdFor(c), today) }));
  const skipRows = courses.map((c) => ({ c, k: skipImpact(occs.filter((o) => o.courseId === c.id), selectedDate, thresholdFor(c)) })).filter((x) => x.k.n > 0);
  const unmarked = occs.filter((o) => o.status === 'pending' && o.date < today)
    .sort((a, b) => b.date.localeCompare(a.date) || a.startTime.localeCompare(b.startTime)).slice(0, 10);
  const entries = state.timetable.filter((e) => e.semesterId === sem.id);

  const summary = rows.map(({ c, a }) => `<tr><td>${esc(courseLabel(c))}</td><td>${a.attended} / ${a.conducted}</td><td>${fmtPct(a.percent)}</td>
    <td>${attendanceBadge(a.state)}</td><td>${a.threshold}%</td><td>${fmtCount(a.canMiss)}</td><td>${fmtCount(a.mustAttend)}</td><td>${a.unmarkedPast}</td><td>${a.upcoming}</td>
    <td>${a.projection ? fmtPct(a.projection.ifAttendAll) : '-'}</td></tr>`).join('');

  const weekly = MON_FIRST.map((d) => {
    const list = entries.filter((e) => e.weekday === d).sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (!list.length) return '';
    return `<h3>${WEEKDAYS[d]}</h3><ul class="list">${list.map((e) => `<li class="row row-between"><span>${esc(e.startTime)}-${esc(e.endTime)} ${esc(courseLabel(getById('courses', e.courseId)))}${e.venue ? ' | ' + esc(e.venue) : ''}
      ${e.effectiveFrom || e.effectiveTo ? `<span class="muted small"> (${e.effectiveFrom ? 'from ' + esc(formatDate(e.effectiveFrom)) : ''}${e.effectiveTo ? ' until ' + esc(formatDate(e.effectiveTo)) : ''})</span>` : ''}</span>
      <span class="btn-row"><button class="btn btn-sm" data-action="edit-slot" data-id="${e.id}">Edit</button><button class="btn btn-sm btn-danger" data-action="delete-slot" data-id="${e.id}">Delete</button></span></li>`).join('')}</ul>`;
  }).join('');

  root.innerHTML = `${pageHeader('Timetable & Attendance', '<button class="btn btn-sm btn-primary" data-action="add-extra">Add extra class</button>')}
    <section class="card"><div class="row"><button class="btn btn-sm" data-action="prev">&larr; Previous</button>
      <label class="sr-only" for="day-picker">Choose date</label><input type="date" id="day-picker" value="${selectedDate}">
      <button class="btn btn-sm" data-action="next">Next &rarr;</button><button class="btn btn-sm" data-action="today">Today</button></div>
      <h2 style="margin-top:12px">${esc(formatDate(selectedDate))}</h2>
      ${day.length ? day.map((o) => classRowHtml(o)).join('') : '<p class="muted">No classes on this date. Weekends, holidays and dates outside the semester have none.</p>'}
      <p class="muted small">Unmarked classes are never counted as absent. Click a highlighted status again to un-mark it.</p></section>

    <section class="section card"><h2>Skip planner (what if?)</h2>
      ${skipRows.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Course</th><th>Unmarked classes</th><th>Now</th><th>If you skip all</th><th>If you attend all</th><th>Verdict</th></tr></thead><tbody>${skipRows.map(({ c, k }) => `<tr><td>${esc(courseLabel(c))}</td><td>${k.n}</td><td>${fmtPct(k.nowPercent)}</td><td>${fmtPct(k.ifSkipPercent)}</td><td>${fmtPct(k.ifAttendPercent)}</td>
        <td>${k.safe ? badge('Safe to skip', 'badge-ok') : badge(k.nowState === 'shortage' ? 'Already short, do not skip' : 'Would cause shortage', 'badge-bad')}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">No unmarked classes on this date to plan for.</p>'}
      <p class="muted small">A what-if for the selected date only. Nothing is saved until you mark the classes.</p></section>

    <section class="section card"><h2>Attendance by course</h2><div class="table-wrap"><table class="data"><thead><tr>
      <th>Course</th><th>Attended / conducted</th><th>%</th><th>Status</th><th>Required</th><th>Can miss</th><th>Must attend</th><th>Unmarked past</th><th>Upcoming</th><th>If you attend all upcoming</th></tr></thead><tbody>${summary}</tbody></table></div>
      <p class="muted small">Conducted = Present + Absent. Cancelled and unmarked classes are not counted. "Can miss" and "Must attend" are consecutive classes. The projection assumes every upcoming class takes place as scheduled.</p></section>

    ${unmarked.length ? `<section class="section"><h2>Unmarked past classes</h2>${unmarked.map((o) => classRowHtml(o, { showDate: true })).join('')}</section>` : ''}

    <section class="section card"><div class="row row-between"><h2>Weekly timetable</h2>
      <span class="btn-row"><button class="btn btn-sm" data-action="regen">Regenerate missing classes</button><button class="btn btn-sm btn-primary" data-action="add-slot">Add slot</button></span></div>
      ${entries.length ? weekly : '<p class="muted">No weekly slots yet. Add one and its dated classes are generated for the whole semester.</p>'}</section>`;

  root.onchange = (e) => {
    if (e.target.id === 'day-picker' && e.target.value) { selectedDate = e.target.value; render(root); }
  };
  root.onclick = async (e) => {
    if (await handleClassAction(e.target, refresh)) return;
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const { action, id } = b.dataset;
    if (action === 'prev') { selectedDate = addDays(selectedDate, -1); render(root); }
    else if (action === 'next') { selectedDate = addDays(selectedDate, 1); render(root); }
    else if (action === 'today') { selectedDate = today; render(root); }
    else if (action === 'add-extra') extraForm(sem, selectedDate, refresh);
    else if (action === 'add-slot') slotForm(sem, null, refresh);
    else if (action === 'edit-slot') slotForm(sem, getById('timetable', id), refresh);
    else if (action === 'regen') { const r = svc.syncOccurrences(sem.id); toast(`${r.added} added, ${r.removed} removed.`); refresh(); }
    else if (action === 'delete-slot') {
      const ok = await confirmDialog({ title: 'Delete this weekly slot?', message: 'Its unmarked future classes are removed. Classes you already marked are kept.', confirmLabel: 'Delete slot', danger: true });
      if (ok) { svc.deleteTimetableEntry(id); refresh(); }
    }
  };
}
