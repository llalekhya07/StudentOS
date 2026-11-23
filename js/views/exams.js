// js/views/exams.js - course-specific assessments, weighted marks and the "marks needed" calculator.

import { state, activeSemester, activeCourses, getById, save, remove, uiState } from '../state.js';
import { courseMarks, requiredMarks, validateAssessment, isGraded, weightedScore, ASSESSMENT_TYPES } from '../logic/assessments.js';
import { openForm, confirmDialog, toast, pageHeader, emptyState, noSemesterHtml, badge, emitChange } from '../ui.js';
import { courseLabel } from '../components.js';
import { escapeHtml as esc, formatDate, fmtNum, uid } from '../utils.js';

function assessmentForm(course, existing, others, onDone) {
  openForm({
    title: existing ? 'Edit assessment' : 'Add assessment',
    values: existing || { status: 'Upcoming' },
    fields: [
      { name: 'title', label: 'Name', type: 'text', required: true, placeholder: 'Mid-Semester Exam' },
      { name: 'type', label: 'Type', type: 'text', required: true, datalist: ASSESSMENT_TYPES, hint: 'Pick a standard type or type your own.' },
      { name: 'maxMarks', label: 'Maximum marks', type: 'number', required: true, min: 0, step: 'any' },
      { name: 'weightage', label: 'Weightage (% of the course grade)', type: 'number', required: true, min: 0, max: 100, step: 'any' },
      { name: 'date', label: 'Date', type: 'date' },
      { name: 'status', label: 'Status', type: 'select', options: ['Upcoming', 'Conducted'] },
      { name: 'marksObtained', label: 'Marks obtained', type: 'number', min: 0, step: 'any', hint: 'Leave empty until graded. Empty is not the same as 0.' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    validate: (v) => validateAssessment(v, others),
    onSubmit: (v) => {
      save('assessments', {
        ...(existing || { id: uid(), courseId: course.id }), ...v,
        status: v.marksObtained !== null ? 'Conducted' : v.status, // entering marks implies it was conducted
        updatedAt: new Date().toISOString(),
      });
      toast('Assessment saved.');
      onDone();
    },
  });
}

function resultHtml(r) {
  if (r.status === 'achieved') return `<p class="banner">You have already reached this target (${fmtNum(r.earned)} weighted points earned).</p>`;
  if (r.status === 'impossible') return `<p class="banner bad"><strong>Not reachable.</strong> ${esc(r.reason)}</p>`;
  return `<p>You need <strong>${fmtNum(r.needed)}</strong> more weighted points, which is <strong>${fmtNum(r.percentNeeded, 1)}%</strong> in every remaining assessment:</p>
    <ul class="list">${r.perAssessment.map((p) => `<li>${esc(p.title)}: <strong>${fmtNum(p.marksNeeded)}</strong> out of ${fmtNum(p.maxMarks)} <span class="muted small">(weightage ${fmtNum(p.weightage)}%)</span></li>`).join('')}</ul>
    <p class="muted small">Assumes you score the same percentage in each remaining assessment.</p>`;
}

export function render(root) {
  const sem = activeSemester();
  if (!sem) { root.innerHTML = noSemesterHtml(); return; }
  const courses = activeCourses();
  if (!courses.length) { root.innerHTML = emptyState('Add a course first', 'Assessments belong to a course.', '<a class="btn btn-primary" href="#/courses">Go to courses</a>'); return; }
  if (!courses.some((c) => c.id === uiState.examCourseId)) uiState.examCourseId = courses[0].id;
  const course = getById('courses', uiState.examCourseId);
  const list = state.assessments.filter((a) => a.courseId === course.id).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const m = courseMarks(list);
  const refresh = () => { emitChange(); render(root); };

  const overview = courses.map((c) => {
    const x = courseMarks(state.assessments.filter((a) => a.courseId === c.id));
    return `<tr><td>${esc(courseLabel(c))}</td><td>${fmtNum(x.earned)}</td><td>${fmtNum(x.completedWeight)}%</td><td>${fmtNum(x.remainingWeight)}%</td>
      <td>${x.count === 0 ? badge('No assessments', 'badge-muted') : x.isComplete ? badge('Totals 100%', 'badge-ok') : badge(`Totals ${fmtNum(x.totalWeight)}%`, 'badge-warn')}</td></tr>`;
  }).join('');

  const rows = list.map((a) => `<tr><td>${esc(a.title)}${a.notes ? `<div class="muted small">${esc(a.notes)}</div>` : ''}</td><td>${esc(a.type)}</td><td>${esc(formatDate(a.date))}</td>
    <td>${a.status === 'Conducted' ? badge(isGraded(a) ? 'Graded' : 'Awaiting marks', isGraded(a) ? 'badge-ok' : 'badge-warn') : badge('Upcoming', 'badge-class')}</td>
    <td>${isGraded(a) ? `${fmtNum(a.marksObtained)} / ${fmtNum(a.maxMarks)}` : `- / ${fmtNum(a.maxMarks)}`}</td><td>${fmtNum(a.weightage)}%</td>
    <td>${isGraded(a) ? fmtNum(weightedScore(a)) : '-'}</td>
    <td><span class="btn-row"><button class="btn btn-sm" data-action="edit" data-id="${a.id}">Edit</button><button class="btn btn-sm btn-danger" data-action="delete" data-id="${a.id}">Delete</button></span></td></tr>`).join('');

  root.innerHTML = `${pageHeader('Exams & Marks', '<button class="btn btn-sm btn-primary" data-action="add">Add assessment</button>')}
    <div class="filters"><div class="field"><label for="course-select">Course</label>
      <select id="course-select">${courses.map((c) => `<option value="${c.id}"${c.id === course.id ? ' selected' : ''}>${esc(courseLabel(c))}</option>`).join('')}</select></div></div>
    ${list.length && !m.isComplete ? `<p class="banner">Weightages total <strong>${fmtNum(m.totalWeight)}%</strong>, not 100%. You can keep working, but results are incomplete until it totals 100%.</p>` : ''}
    <div class="grid">
      <section class="card"><h2>Weighted marks earned</h2><p class="stat">${fmtNum(m.earned)}</p><p class="muted">out of ${fmtNum(m.completedWeight)} graded so far</p></section>
      <section class="card"><h2>Completed / remaining</h2><p class="stat">${fmtNum(m.completedWeight)}% / ${fmtNum(m.remainingWeight)}%</p><p class="muted">of weightage</p></section>
      <section class="card"><h2>Performance so far</h2><p class="stat">${m.percentOfCompleted === null ? '-' : fmtNum(m.percentOfCompleted, 1) + '%'}</p><p class="muted">earned / graded weightage</p></section>
    </div>
    <section class="section card"><h2>Assessments</h2>${list.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Type</th><th>Date</th><th>Status</th><th>Marks</th><th>Weight</th><th>Weighted</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<p class="muted">No assessments yet. Add the quizzes and exams this course uses.</p>'}</section>
    <section class="section card"><h2>Marks required calculator</h2>
      <form id="calc" class="row"><div class="field"><label for="target">Target overall score (%)</label><input id="target" type="number" min="0" max="100" step="any" value="75" required></div>
      <button class="btn btn-primary" type="submit">Calculate</button></form><div id="calc-result" aria-live="polite" style="margin-top:12px"></div></section>
    <section class="section card"><h2>All courses</h2><div class="table-wrap"><table class="data"><thead><tr><th>Course</th><th>Earned</th><th>Completed</th><th>Remaining</th><th>Configuration</th></tr></thead><tbody>${overview}</tbody></table></div></section>`;

  root.onchange = (e) => { if (e.target.id === 'course-select') { uiState.examCourseId = e.target.value; render(root); } };
  root.onsubmit = (e) => {
    if (e.target.id !== 'calc') return;
    e.preventDefault();
    const target = Number(root.querySelector('#target').value);
    root.querySelector('#calc-result').innerHTML = list.length ? resultHtml(requiredMarks(list, target)) : '<p class="muted">Add assessments first.</p>';
  };
  root.onclick = async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const { action, id } = b.dataset;
    if (action === 'add') assessmentForm(course, null, list, refresh);
    else if (action === 'edit') assessmentForm(course, getById('assessments', id), list.filter((a) => a.id !== id), refresh);
    else if (action === 'delete' && await confirmDialog({ title: 'Delete this assessment?', message: 'Its marks are removed from the course total.', confirmLabel: 'Delete', danger: true })) {
      remove('assessments', id); refresh();
    }
  };
}
