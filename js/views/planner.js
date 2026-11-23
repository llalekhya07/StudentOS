// js/views/planner.js - personal / weekend to-do lists. Deliberately separate from course deadlines.

import { state, getById, save, remove } from '../state.js';
import { taskProgress, weekRange, isOverdue, DEFAULT_LISTS } from '../logic/planner.js';
import { PRIORITIES, priorityRank } from '../logic/deadlines.js';
import { openForm, confirmDialog, toast, pageHeader, emptyState, badge, emitChange } from '../ui.js';
import { escapeHtml as esc, todayISO, formatDate, uid } from '../utils.js';

const filters = { list: '', status: 'open' };

function taskForm(existing, onDone) {
  const lists = [...new Set([...DEFAULT_LISTS, ...state.tasks.map((t) => t.list)])];
  openForm({
    title: existing ? 'Edit task' : 'Add task',
    values: existing || { list: lists[0], priority: 'Medium' },
    fields: [
      { name: 'title', label: 'Task', type: 'text', required: true, placeholder: 'Revise graph algorithms' },
      { name: 'list', label: 'List', type: 'text', required: true, datalist: lists },
      { name: 'targetDate', label: 'Target date (optional)', type: 'date' },
      { name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
      { name: 'notes', label: 'Notes (optional)', type: 'textarea' },
    ],
    onSubmit: (v) => { save('tasks', { status: 'todo', ...(existing || { id: uid() }), ...v }); toast('Task saved.'); onDone(); },
  });
}

export function render(root) {
  const today = todayISO();
  const week = weekRange(today);
  const refresh = () => { emitChange(); render(root); };
  const lists = [...new Set(state.tasks.map((t) => t.list))].sort();
  const dayP = taskProgress(state.tasks, today, today);
  const weekP = taskProgress(state.tasks, week.from, week.to);
  const overdue = state.tasks.filter((t) => isOverdue(t, today));

  const list = state.tasks
    .filter((t) => (!filters.list || t.list === filters.list) && (filters.status === 'all' || (filters.status === 'open' ? t.status !== 'done' : t.status === 'done')))
    .sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.targetDate || '9999').localeCompare(b.targetDate || '9999') || priorityRank(a.priority) - priorityRank(b.priority));

  const bar = (p, label) => `<div><p class="muted small">${label}: ${p.done} of ${p.total} done</p><div class="progress" role="progressbar" aria-label="${label}" aria-valuenow="${Math.round(p.percent)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p.percent}%"></span></div></div>`;
  const items = list.map((t) => `<li class="row row-between"><div><label class="check"><input type="checkbox" data-toggle="${t.id}"${t.status === 'done' ? ' checked' : ''}>
      <span class="${t.status === 'done' ? 'done-text' : ''}">${esc(t.title)}</span></label>
      <div class="muted small">${esc(t.list)}${t.targetDate ? ' | ' + esc(formatDate(t.targetDate)) : ''} ${badge(t.priority, t.priority === 'High' ? 'badge-bad' : 'badge-muted')} ${isOverdue(t, today) ? badge('Overdue', 'badge-bad') : ''}</div>
      ${t.notes ? `<div class="muted small">${esc(t.notes)}</div>` : ''}</div>
    <span class="btn-row">${isOverdue(t, today) ? `<button class="btn btn-sm" data-action="carry" data-id="${t.id}">Move to today</button>` : ''}<button class="btn btn-sm" data-action="edit" data-id="${t.id}">Edit</button><button class="btn btn-sm btn-danger" data-action="delete" data-id="${t.id}">Delete</button></span></li>`).join('');

  root.innerHTML = `${pageHeader('Personal Planner', `${overdue.length ? '<button class="btn btn-sm" data-action="carry-all">Carry all overdue to today</button>' : ''}<button class="btn btn-sm btn-primary" data-action="add">Add task</button>`)}
    <div class="grid"><section class="card"><h2>Progress</h2>${bar(dayP, 'Today')}<br>${bar(weekP, 'This week')}</section></div>
    <div class="filters section"><div class="field"><label for="flt-list">List</label><select id="flt-list" data-filter="list"><option value="">All lists</option>${lists.map((l) => `<option${l === filters.list ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="field"><label for="flt-status">Show</label><select id="flt-status" data-filter="status">${[['open', 'Open tasks'], ['done', 'Completed'], ['all', 'All']].map(([v, l]) => `<option value="${v}"${v === filters.status ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
    ${list.length ? `<div class="card"><ul class="list">${items}</ul></div>` : emptyState('No tasks here', 'Add goals like "Solve 3 contest problems" or "Read a paper". These are separate from course deadlines.')}`;

  root.onchange = (e) => {
    if (e.target.dataset.filter) { filters[e.target.dataset.filter] = e.target.value; render(root); }
    else if (e.target.dataset.toggle) {
      const t = getById('tasks', e.target.dataset.toggle);
      save('tasks', { ...t, status: e.target.checked ? 'done' : 'todo', completedAt: e.target.checked ? today : '' });
      refresh();
    }
  };
  root.onclick = async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const { action, id } = b.dataset;
    if (action === 'add') taskForm(null, refresh);
    else if (action === 'edit') taskForm(getById('tasks', id), refresh);
    else if (action === 'carry') { save('tasks', { ...getById('tasks', id), targetDate: today }); refresh(); }
    else if (action === 'carry-all') { overdue.forEach((t) => save('tasks', { ...t, targetDate: today })); toast(`${overdue.length} task${overdue.length === 1 ? '' : 's'} moved to today.`); refresh(); }
    else if (action === 'delete' && await confirmDialog({ title: 'Delete this task?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) { remove('tasks', id); refresh(); }
  };
}
