// js/views/semesters.js - create, edit, switch and delete semesters; manage holidays.

import { state, updateSettings, activeSemester, getById, semesterDependents, deleteSemester } from '../state.js';
import * as svc from '../services.js';
import { validateSemester, validateHoliday, semesterProgress } from '../logic/semesters.js';
import { openForm, confirmDialog, toast, pageHeader, emptyState, emitChange } from '../ui.js';
import { escapeHtml as esc, formatDate, todayISO, WEEKDAYS } from '../utils.js';

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: d, label: WEEKDAYS[d].slice(0, 3) }));

function cardHtml(s, activeId) {
  const courses = state.courses.filter((c) => c.semesterId === s.id).length;
  const p = semesterProgress(s, todayISO());
  return `<article class="card">
    <h2>${esc(s.name)} ${s.id === activeId ? '<span class="badge badge-ok">Active</span>' : ''}${s.sample ? ' <span class="badge badge-muted">Sample data</span>' : ''}</h2>
    <p class="muted">${esc(formatDate(s.startDate))} to ${esc(formatDate(s.endDate))}<br>${courses} course${courses === 1 ? '' : 's'} | ${p.phase}</p>
    <div class="progress" role="progressbar" aria-label="Semester progress" aria-valuenow="${Math.round(p.percent)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p.percent}%"></span></div>
    <div class="btn-row" style="margin-top:12px">
      ${s.id === activeId ? '' : `<button class="btn btn-sm btn-primary" data-action="switch" data-id="${s.id}">Switch to this</button>`}
      <button class="btn btn-sm" data-action="edit" data-id="${s.id}">Edit</button>
      <button class="btn btn-sm btn-danger" data-action="delete" data-id="${s.id}">Delete</button>
    </div></article>`;
}

function holidaysHtml(sem) {
  const rows = sem.holidays.map((h) => `<tr><td>${esc(formatDate(h.date))}</td><td>${esc(h.name)}</td>
    <td><button class="btn btn-sm btn-danger" data-action="remove-holiday" data-date="${h.date}">Remove</button></td></tr>`).join('');
  return `<section class="section card"><div class="row row-between"><h2>Holidays in ${esc(sem.name)}</h2>
    <button class="btn btn-sm btn-primary" data-action="add-holiday">Add holiday</button></div>
    <p class="muted small">Working days: ${sem.workingDays.map((d) => WEEKDAYS[d].slice(0, 3)).join(', ')}. Adding a holiday marks that day's unmarked classes as "Cancelled - Holiday".</p>
    ${sem.holidays.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Name</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">No holidays added.</p>'}</section>`;
}

function semesterForm(existing, onDone) {
  openForm({
    title: existing ? 'Edit semester' : 'New semester',
    values: existing || { workingDays: [1, 2, 3, 4, 5] },
    fields: [
      { name: 'name', label: 'Semester name', type: 'text', required: true, placeholder: 'Semester 4' },
      { name: 'startDate', label: 'Start date', type: 'date', required: true },
      { name: 'endDate', label: 'End date', type: 'date', required: true },
      { name: 'workingDays', label: 'Working days', type: 'checkboxes', numeric: true, options: DAY_OPTIONS },
    ],
    validate: (v) => validateSemester(v, state.semesters.filter((s) => !existing || s.id !== existing.id)),
    onSubmit: (v) => {
      const sem = svc.saveSemester({ ...(existing ? { id: existing.id } : {}), ...v });
      toast(existing ? 'Semester updated.' : `${sem.name} created and set as active.`);
      if (existing) onDone();
      else { emitChange(); location.hash = '#/courses'; } // new semester: go add its courses
    },
  });
}

export function render(root) {
  const sems = [...state.semesters].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const active = activeSemester();
  const refresh = () => { emitChange(); render(root); };

  root.innerHTML = `${pageHeader('My Semesters', '<button class="btn btn-primary" data-action="new">New semester</button>')}
    ${sems.length ? `<div class="grid">${sems.map((s) => cardHtml(s, active && active.id)).join('')}</div>`
      : emptyState('No semesters yet', 'A semester holds its courses, timetable, attendance, marks and results.')}
    ${active ? holidaysHtml(active) : ''}`;

  root.onclick = async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const { action, id, date } = b.dataset;
    if (action === 'new') semesterForm(null, refresh);
    else if (action === 'edit') semesterForm(getById('semesters', id), refresh);
    else if (action === 'switch') { updateSettings({ activeSemesterId: id }); refresh(); }
    else if (action === 'delete') {
      const sem = getById('semesters', id);
      const ok = await confirmDialog({
        title: `Delete ${sem.name}?`, message: 'This permanently deletes the semester and everything in it:',
        details: semesterDependents(id), confirmLabel: 'Delete semester', danger: true,
      });
      if (ok) { deleteSemester(id); toast('Semester deleted.'); refresh(); }
    } else if (action === 'add-holiday') {
      openForm({
        title: 'Add holiday',
        fields: [
          { name: 'date', label: 'Date', type: 'date', required: true },
          { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Festival break' },
        ],
        validate: (v) => validateHoliday(active, v.date, v.name),
        onSubmit: (v) => {
          const n = svc.addHoliday(active.id, v.date, v.name);
          toast(n ? `${n} class${n === 1 ? '' : 'es'} marked Cancelled - Holiday.` : 'Holiday added.');
          refresh();
        },
      });
    } else if (action === 'remove-holiday') {
      svc.removeHoliday(active.id, date);
      refresh();
    }
  };
}
