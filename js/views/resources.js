// js/views/resources.js - per-course library of files (IndexedDB), links and notes.

import { state, activeSemester, activeCourses, getById, save, uiState } from '../state.js';
import { filterResources, ALLOWED_EXTENSIONS, MAX_FILE_BYTES } from '../logic/resources.js';
import * as svc from '../services.js';
import { openForm, openDialog, confirmDialog, toast, pageHeader, emptyState, noSemesterHtml, badge, emitChange } from '../ui.js';
import { courseOptions, courseLabel } from '../components.js';
import { escapeHtml as esc, uid } from '../utils.js';

const filters = { type: '', q: '' };

function relatedOptions(sem) {
  const ids = new Set(state.courses.filter((c) => c.semesterId === sem.id).map((c) => c.id));
  return [
    ...state.deadlines.filter((d) => ids.has(d.courseId)).map((d) => ({ value: `deadline:${d.id}`, label: `Assignment: ${d.title}` })),
    ...state.assessments.filter((a) => ids.has(a.courseId)).map((a) => ({ value: `assessment:${a.id}`, label: `Exam: ${a.title}` })),
  ];
}

function resourceForm(sem, kind, existing, onDone) {
  const common = [
    { name: 'courseId', label: 'Course', type: 'select', required: true, options: courseOptions(sem.id), value: uiState.resourceCourseId || undefined },
    { name: 'title', label: 'Title', type: 'text', required: true },
    { name: 'topic', label: 'Unit / topic (optional)', type: 'text', placeholder: 'Unit 3' },
  ];
  const related = { name: 'relatedTo', label: 'Related to (optional)', type: 'select', allowEmpty: true, options: relatedOptions(sem) };
  const specific = kind === 'file'
    ? [{ name: 'file', label: 'File', type: 'file', required: !existing, accept: ALLOWED_EXTENSIONS.map((e) => '.' + e).join(','), hint: `Up to ${MAX_FILE_BYTES / 1048576} MB. Stored only in this browser.` }]
    : kind === 'link' ? [{ name: 'url', label: 'URL', type: 'url', required: true, placeholder: 'https://' }]
    : [{ name: 'text', label: 'Note', type: 'textarea', required: true }];
  openForm({
    title: `${existing ? 'Edit' : 'Add'} ${kind}`,
    values: existing || {},
    fields: existing && kind === 'file' ? [...common, related] : [...common, ...specific, related],
    validate: (v) => (kind === 'link' && !/^https?:\/\//i.test(v.url) ? 'The URL must start with http:// or https://' : null),
    onSubmit: async (v) => {
      const { file, ...meta } = v;
      if (existing) { save('resources', { ...existing, ...meta }); }
      else if (kind === 'file') await svc.addFileResource(file, { ...meta, topic: meta.topic });
      else save('resources', { id: uid(), resourceType: kind, ...meta });
      toast('Resource saved.');
      onDone();
    },
  });
}

export function render(root) {
  const sem = activeSemester();
  if (!sem) { root.innerHTML = noSemesterHtml(); return; }
  const courses = activeCourses();
  if (!courses.length) { root.innerHTML = emptyState('Add a course first', 'Resources belong to a course.', '<a class="btn btn-primary" href="#/courses">Go to courses</a>'); return; }
  const refresh = () => { emitChange(); render(root); };
  const ids = new Set(courses.map((c) => c.id));
  const courseFilter = ids.has(uiState.resourceCourseId) ? uiState.resourceCourseId : '';
  const list = filterResources(state.resources.filter((r) => ids.has(r.courseId)), { course: courseFilter, ...filters })
    .sort((a, b) => (a.topic || '').localeCompare(b.topic || '') || a.title.localeCompare(b.title));

  const items = list.map((r) => {
    const open = r.resourceType === 'file'
      ? `<button class="btn btn-sm" data-action="open" data-file="${r.fileId}">Open</button><button class="btn btn-sm" data-action="download" data-file="${r.fileId}">Download</button>`
      : r.resourceType === 'link' ? `<a class="btn btn-sm" href="${esc(r.url)}" target="_blank" rel="noopener">Open link</a>`
      : `<button class="btn btn-sm" data-action="view-note" data-id="${r.id}">Read</button>`;
    const meta = r.resourceType === 'file' ? `${esc(r.fileName)} (${Math.max(1, Math.round(r.fileSize / 1024))} KB)` : r.resourceType === 'link' ? esc(r.url) : 'Note';
    return `<li class="row row-between"><div><strong>${esc(r.title)}</strong> ${badge(r.resourceType, 'badge-class')}${r.topic ? ' ' + badge(r.topic, 'badge-muted') : ''}
      <div class="muted small">${esc(courseLabel(getById('courses', r.courseId)))} | ${meta}</div></div>
      <span class="btn-row">${open}<button class="btn btn-sm" data-action="edit" data-id="${r.id}">Edit</button><button class="btn btn-sm btn-danger" data-action="delete" data-id="${r.id}">Delete</button></span></li>`;
  }).join('');

  root.innerHTML = `${pageHeader('Resources', '<button class="btn btn-sm btn-primary" data-action="add-file">Add file</button><button class="btn btn-sm" data-action="add-link">Add link</button><button class="btn btn-sm" data-action="add-note">Add note</button>')}
    <p class="banner">Files are stored in <strong>this browser only</strong> (IndexedDB). They are not uploaded anywhere and are only included in the <strong>full backup</strong> (Reports). Clearing browser data deletes them.</p>
    <div class="filters">
      <div class="field"><label for="flt-course">Course</label><select id="flt-course" data-filter="course"><option value="">All courses</option>${courses.map((c) => `<option value="${c.id}"${c.id === courseFilter ? ' selected' : ''}>${esc(courseLabel(c))}</option>`).join('')}</select></div>
      <div class="field"><label for="flt-type">Type</label><select id="flt-type" data-filter="type"><option value="">All</option>${['file', 'link', 'note'].map((t) => `<option${t === filters.type ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label for="flt-q">Search title or topic</label><input id="flt-q" type="search" value="${esc(filters.q)}"></div></div>
    ${list.length ? `<div class="card"><ul class="list">${items}</ul></div>` : emptyState('No resources found', 'Add a file, link or note, or change the filters.')}`;

  root.onchange = (e) => {
    const f = e.target.dataset.filter;
    if (f === 'course') uiState.resourceCourseId = e.target.value || null;
    else if (f === 'type') filters.type = e.target.value;
    else if (e.target.id === 'flt-q') filters.q = e.target.value;
    else return;
    render(root);
  };
  root.onclick = async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const { action, id, file } = b.dataset;
    try {
      if (action.startsWith('add-')) resourceForm(sem, action.slice(4), null, refresh);
      else if (action === 'edit') { const r = getById('resources', id); resourceForm(sem, r.resourceType, r, refresh); }
      else if (action === 'open' || action === 'download') await svc.openStoredFile(file, action === 'download');
      else if (action === 'view-note') { const r = getById('resources', id); openDialog(`<div class="modal-body"><h2>${esc(r.title)}</h2><p style="white-space:pre-wrap">${esc(r.text)}</p><div class="btn-row modal-actions"><button class="btn" onclick="this.closest('dialog').close()">Close</button></div></div>`); }
      else if (action === 'delete') {
        const r = getById('resources', id);
        if (await confirmDialog({ title: `Delete "${r.title}"?`, message: r.fileId ? 'The stored file is deleted from this browser too.' : 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) {
          svc.deleteResource(id);
          refresh();
        }
      }
    } catch (err) { toast(err.message, 'error'); }
  };
}
