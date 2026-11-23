// js/views/calendar.js - one calendar for classes, exams, deadlines and personal events (month + list views).

import { state, activeSemester, getById, save, remove } from '../state.js';
import { collectItems, monthGrid, shiftMonth, CATEGORIES, EVENT_CATEGORIES } from '../logic/calendar.js';
import { openForm, confirmDialog, toast, pageHeader, noSemesterHtml, emitChange } from '../ui.js';
import { escapeHtml as esc, todayISO, addDays, formatDate, parseISO, startOfWeek, uid } from '../utils.js';

let month = null;
let selected = null;
let mode = 'month'; // 'month' | 'list'
const filters = new Set(CATEGORIES.map((c) => c.key));
const CAT_BADGE = { class: 'badge-class', exam: 'badge-exam', deadline: 'badge-deadline', personal: 'badge-personal' };
const REMINDERS = [
  { value: '', label: 'No reminder' }, { value: '0', label: 'On the day' },
  { value: '1', label: '1 day before' }, { value: '3', label: '3 days before' },
];

function eventForm(sem, existing, date, onDone) {
  openForm({
    title: existing ? 'Edit event' : 'Add event',
    values: existing ? { ...existing, reminder: existing.reminderDays === null || existing.reminderDays === undefined ? '' : String(existing.reminderDays), onlyThisSemester: Boolean(existing.semesterId) } : { date, category: 'Club meeting', reminder: '1' },
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'category', label: 'Category', type: 'select', options: EVENT_CATEGORIES },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'startTime', label: 'Start time (optional)', type: 'time' },
      { name: 'endTime', label: 'End time (optional)', type: 'time' },
      { name: 'location', label: 'Location (optional)', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'reminder', label: 'Reminder', type: 'select', options: REMINDERS },
      { name: 'onlyThisSemester', label: `Show only in ${sem.name}`, type: 'checkbox' },
    ],
    validate: (v) => (v.startTime && v.endTime && v.endTime <= v.startTime ? 'End time must be after start time.' : null),
    onSubmit: (v) => {
      const { reminder, onlyThisSemester, ...rest } = v;
      save('events', { ...(existing || { id: uid() }), ...rest, reminderDays: reminder === '' ? null : Number(reminder), semesterId: onlyThisSemester ? sem.id : null });
      toast('Event saved.');
      onDone();
    },
  });
}

const itemLine = (i, withDate) => `<li class="item-line cat-${i.category}"><strong>${esc(i.title)}</strong> ${i.time ? `<span class="muted small">${esc(i.time)}</span>` : ''}
  <span class="badge ${CAT_BADGE[i.category]}">${esc(i.sub || i.category)}</span>${withDate ? `<div class="muted small">${esc(formatDate(i.date))}</div>` : ''}
  ${i.eventId ? `<div class="btn-row"><button class="btn btn-sm" data-action="edit-event" data-id="${i.eventId}">Edit</button><button class="btn btn-sm btn-danger" data-action="delete-event" data-id="${i.eventId}">Delete</button></div>` : ''}</li>`;

export function render(root) {
  const sem = activeSemester();
  if (!sem) { root.innerHTML = noSemesterHtml(); return; }
  const today = todayISO();
  if (!month) month = today.slice(0, 7);
  if (!selected) selected = today;
  const refresh = () => { emitChange(); render(root); };

  let body;
  if (mode === 'month') {
    const grid = monthGrid(month);
    const items = collectItems({ state, semesterId: sem.id, from: grid[0], to: grid[41] }).filter((i) => filters.has(i.category));
    const byDate = new Map();
    items.forEach((i) => byDate.set(i.date, [...(byDate.get(i.date) || []), i]));
    const cells = grid.map((d) => {
      const list = byDate.get(d) || [];
      return `<button type="button" class="cal-cell${d.slice(0, 7) !== month ? ' other' : ''}${d === today ? ' today' : ''}${d === selected ? ' selected' : ''}" data-action="select" data-date="${d}" aria-label="${esc(formatDate(d))}, ${list.length} items">
        <span class="cal-num">${Number(d.slice(8))}</span>${list.slice(0, 3).map((i) => `<span class="cal-item cat-${i.category}">${esc(i.title)}</span>`).join('')}${list.length > 3 ? `<span class="small muted">+${list.length - 3} more</span>` : ''}</button>`;
    }).join('');
    const dayItems = items.filter((i) => i.date === selected);
    body = `<div class="cal" role="group" aria-label="Month view">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="cal-head">${d}</div>`).join('')}${cells}</div>
      <section class="section card"><div class="row row-between"><h2>${esc(formatDate(selected))}</h2><button class="btn btn-sm btn-primary" data-action="add-event">Add event</button></div>
      ${dayItems.length ? `<ul class="list">${dayItems.map((i) => itemLine(i, false)).join('')}</ul>` : '<p class="muted">Nothing on this day.</p>'}</section>`;
  } else if (mode === 'week') {
    const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(selected), i));
    const items = collectItems({ state, semesterId: sem.id, from: days[0], to: days[6] }).filter((i) => filters.has(i.category));
    body = `<div class="week">${days.map((d) => {
      const list = items.filter((i) => i.date === d);
      return `<section class="card${d === today ? ' today' : ''}"><h3>${esc(parseISO(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }))}</h3>${list.length ? `<ul class="list">${list.map((i) => itemLine(i, false)).join('')}</ul>` : '<p class="muted small">Free</p>'}</section>`;
    }).join('')}</div>`;
  } else {
    const items = collectItems({ state, semesterId: sem.id, from: today, to: addDays(today, 30) }).filter((i) => filters.has(i.category));
    body = `<section class="card"><h2>Next 30 days</h2>${items.length ? `<ul class="list">${items.map((i) => itemLine(i, true)).join('')}</ul>` : '<p class="muted">Nothing coming up.</p>'}</section>`;
  }

  root.innerHTML = `${pageHeader('Academic Calendar', `<button class="btn btn-sm${mode === 'month' ? ' btn-primary' : ''}" data-action="mode" data-mode="month">Month</button><button class="btn btn-sm${mode === 'week' ? ' btn-primary' : ''}" data-action="mode" data-mode="week">Week</button><button class="btn btn-sm${mode === 'list' ? ' btn-primary' : ''}" data-action="mode" data-mode="list">List</button><button class="btn btn-sm" data-action="add-event">Add event</button>`)}
    <div class="filters"><fieldset class="field"><legend>Show</legend><div class="row">${CATEGORIES.map((c) => `<label class="check"><input type="checkbox" data-filter="${c.key}"${filters.has(c.key) ? ' checked' : ''}> <span class="badge ${CAT_BADGE[c.key]}">${c.label}</span></label>`).join('')}</div></fieldset></div>
    ${mode !== 'list' ? `<div class="row row-between" style="margin-bottom:12px"><button class="btn btn-sm" data-action="prev">&larr;</button><h2>${esc(mode === 'week' ? `Week of ${formatDate(startOfWeek(selected))}` : parseISO(month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }))}</h2><span class="btn-row"><button class="btn btn-sm" data-action="today">Today</button><button class="btn btn-sm" data-action="next">&rarr;</button></span></div>` : ''}
    ${body}`;

  root.onchange = (e) => {
    const f = e.target.dataset.filter;
    if (!f) return;
    if (e.target.checked) filters.add(f); else filters.delete(f);
    render(root);
  };
  root.onclick = async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const { action, id, date } = b.dataset;
    if (action === 'mode') { mode = b.dataset.mode; render(root); }
    else if (action === 'prev') { if (mode === 'week') { selected = addDays(selected, -7); month = selected.slice(0, 7); } else month = shiftMonth(month, -1); render(root); }
    else if (action === 'next') { if (mode === 'week') { selected = addDays(selected, 7); month = selected.slice(0, 7); } else month = shiftMonth(month, 1); render(root); }
    else if (action === 'today') { month = today.slice(0, 7); selected = today; render(root); }
    else if (action === 'select') { selected = date; render(root); }
    else if (action === 'add-event') eventForm(sem, null, selected, refresh);
    else if (action === 'edit-event') eventForm(sem, getById('events', id), selected, refresh);
    else if (action === 'delete-event' && await confirmDialog({ title: 'Delete this event?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) { remove('events', id); refresh(); }
  };
}
