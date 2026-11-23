// js/views/assignments.js - assignments, projects, demos, vivas. Submission progress is separate from the score.

import { state, settings, activeSemester, activeCourses, getById, save, remove } from '../state.js';
import { DEADLINE_TYPES, PROGRESS, PRIORITIES, deadlineState, dueLabel, priorityRank } from '../logic/deadlines.js';
import { openForm, confirmDialog, toast, pageHeader, emptyState, noSemesterHtml, badge, emitChange } from '../ui.js';
import { courseOptions, courseLabel } from '../components.js';
import { escapeHtml as esc, todayISO, formatDate, fmtNum, uid } from '../utils.js';

const filters = { course: '', type: '', priority: '', status: '', sort: 'due' };

function deadlineForm(sem, existing, onDone) {
  const assessments = state.assessments
    .filter((a) => state.courses.some((c) => c.id === a.courseId && c.semesterId === sem.id))
    .map((a) => ({ value: a.id, label: `${courseLabel(getById('courses', a.courseId))}: ${a.title}` }));
  openForm({
    title: existing ? 'Edit item' : 'Add assignment / project / viva',
    values: existing || { priority: 'Medium', progressStatus: 'Not started', type: 'Assignment' },
    fields: [
      { name: 'courseId', label: 'Course', type: 'select', required: true, options: courseOptions(sem.id) },
      { name: 'type', label: 'Type', type: 'select', options: DEADLINE_TYPES },
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'dueDate', label: 'Due date', type: 'date', required: true },
      { name: 'dueTime', label: 'Due time (optional)', type: 'time' },
      { name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
      { name: 'progressStatus', label: 'Progress', type: 'select', options: PROGRESS },
      { name: 'link', label: 'Link (optional)', type: 'url', placeholder: 'https://' },
      { name: 'score', label: 'Score (optional)', type: 'number', min: 0, step: 'any', hint: 'Evaluation is separate from submission status.' },
      { name: 'scoreMax', label: 'Out of (optional)', type: 'number', min: 0, step: 'any' },
      { name: 'relatedAssessmentId', label: 'Related assessment (optional)', type: 'select', allowEmpty: true, options: assessments },
    ],
    validate: (v) => {
      if (v.link && !/^https?:\/\//i.test(v.link)) return 'The link must start with http:// or https://';
      if (v.score !== null && v.scoreMax !== null && v.score > v.scoreMax) return 'The score cannot exceed the maximum.';
      return null;
    },
    onSubmit: (v) => {
      const today = todayISO();
      const old = existing || {};
      const changed = !existing || old.progressStatus !== v.progressStatus;
      save('deadlines', {
        ...old, ...v, id: old.id || uid(),
        submittedAt: v.progressStatus === 'Submitted' ? (old.submittedAt || today) : '',
        history: changed ? [...(old.history || []), { status: v.progressStatus, date: today }] : old.history,
      });
      toast('Saved.');
      onDone();
    },
  });
}

export function render(root) {
  const sem = activeSemester();
  if (!sem) { root.innerHTML = noSemesterHtml(); return; }
  const courses = activeCourses();
  if (!courses.length) { root.innerHTML = emptyState('Add a course first', 'Assignments belong to a course.', '<a class="btn btn-primary" href="#/courses">Go to courses</a>'); return; }
  const refresh = () => { emitChange(); render(root); };
  const today = todayISO();
  const ids = new Set(courses.map((c) => c.id));

  let list = state.deadlines.filter((d) => ids.has(d.courseId) &&
    (!filters.course || d.courseId === filters.course) && (!filters.type || d.type === filters.type) &&
    (!filters.priority || d.priority === filters.priority) && (!filters.status || d.progressStatus === filters.status));
  list = list.sort((a, b) => filters.sort === 'priority'
    ? priorityRank(a.priority) - priorityRank(b.priority) || a.dueDate.localeCompare(b.dueDate)
    : a.dueDate.localeCompare(b.dueDate));

  const sel = (name, label, options, current) => `<div class="field"><label for="flt-${name}">${label}</label><select id="flt-${name}" data-filter="${name}"><option value="">All</option>${options.map((o) => {
    const opt = typeof o === 'object' ? o : { value: o, label: o };
    return `<option value="${esc(opt.value)}"${opt.value === current ? ' selected' : ''}>${esc(opt.label)}</option>`;
  }).join('')}</select></div>`;

  const rows = list.map((d) => {
    const st = deadlineState(d, today, settings.deadlineSoonDays);
    const stBadge = { overdue: badge('Overdue', 'badge-bad'), soon: badge('Due soon', 'badge-warn'), done: badge('Done', 'badge-ok'), upcoming: '' }[st];
    return `<tr><td><strong>${esc(d.title)}</strong> ${stBadge}${d.description ? `<div class="muted small">${esc(d.description)}</div>` : ''}${d.link ? `<div class="small"><a href="${esc(d.link)}" target="_blank" rel="noopener">Open link</a></div>` : ''}</td>
      <td>${esc(courseLabel(getById('courses', d.courseId)))}</td><td>${esc(d.type)}</td>
      <td>${esc(formatDate(d.dueDate))}${d.dueTime ? ' ' + esc(d.dueTime) : ''}<div class="muted small">${esc(dueLabel(d, today))}</div></td>
      <td>${badge(d.priority, d.priority === 'High' ? 'badge-bad' : d.priority === 'Medium' ? 'badge-warn' : 'badge-muted')}</td>
      <td><label class="sr-only" for="prog-${d.id}">Progress for ${esc(d.title)}</label><select id="prog-${d.id}" data-progress="${d.id}">${PROGRESS.map((p) => `<option${p === d.progressStatus ? ' selected' : ''}>${p}</option>`).join('')}</select></td>
      <td>${d.score !== null && d.score !== undefined ? `${fmtNum(d.score)}${d.scoreMax ? ' / ' + fmtNum(d.scoreMax) : ''}` : '-'}</td>
      <td><span class="btn-row"><button class="btn btn-sm" data-action="edit" data-id="${d.id}">Edit</button><button class="btn btn-sm btn-danger" data-action="delete" data-id="${d.id}">Delete</button></span></td></tr>`;
  }).join('');

  root.innerHTML = `${pageHeader('Assignments & Projects', '<button class="btn btn-sm btn-primary" data-action="add">Add item</button>')}
    <div class="filters">${sel('course', 'Course', courseOptions(sem.id), filters.course)}${sel('type', 'Type', DEADLINE_TYPES, filters.type)}
      ${sel('priority', 'Priority', PRIORITIES, filters.priority)}${sel('status', 'Progress', PROGRESS, filters.status)}
      <div class="field"><label for="flt-sort">Sort by</label><select id="flt-sort" data-filter="sort"><option value="due"${filters.sort === 'due' ? ' selected' : ''}>Due date</option><option value="priority"${filters.sort === 'priority' ? ' selected' : ''}>Priority</option></select></div></div>
    ${list.length ? `<div class="card table-wrap"><table class="data"><thead><tr><th>Title</th><th>Course</th><th>Type</th><th>Due</th><th>Priority</th><th>Progress</th><th>Score</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : emptyState('Nothing here', 'Add an assignment, project, demo or viva, or clear the filters.')}`;

  root.onchange = (e) => {
    if (e.target.dataset.filter) { filters[e.target.dataset.filter] = e.target.value; render(root); }
    else if (e.target.dataset.progress) {
      const d = getById('deadlines', e.target.dataset.progress);
      const status = e.target.value;
      save('deadlines', { ...d, progressStatus: status, submittedAt: status === 'Submitted' ? (d.submittedAt || today) : '', history: [...(d.history || []), { status, date: today }] });
      refresh();
    }
  };
  root.onclick = async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const { action, id } = b.dataset;
    if (action === 'add') deadlineForm(sem, null, refresh);
    else if (action === 'edit') deadlineForm(sem, getById('deadlines', id), refresh);
    else if (action === 'delete' && await confirmDialog({ title: 'Delete this item?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) { remove('deadlines', id); refresh(); }
  };
}
