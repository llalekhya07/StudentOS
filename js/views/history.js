// js/views/history.js - semester-wise history, grade entry, SGPA / CGPA and the SGPA trend.

import { state, activeSemester, coursesOf, currentScheme, ensureGradeScheme, getById, save, uiState } from '../state.js';
import { semesterGpa, cumulativeGpa, gradePointFor, estimateGrade, requiredSgpa } from '../logic/grades.js';
import { estimatedPercent } from '../logic/assessments.js';
import { tally } from '../logic/attendance.js';
import { lineChartSvg, emptyState, noSemesterHtml, badge, pageHeader, emitChange } from '../ui.js';
import { escapeHtml as esc, formatDate, fmtNum, fmtPct, uid } from '../utils.js';

function saveResult(sem, course, patch) {
  const existing = state.results.find((r) => r.courseId === course.id);
  save('results', { id: uid(), semesterId: sem.id, courseId: course.id, finalGrade: '', gradePoint: null, includedInGPA: true, ...existing, ...patch });
}

const gpaBadge = (g) => (g.sgpa === null ? badge('No grades yet', 'badge-muted') : g.isFinal ? badge('Final', 'badge-ok') : g.hasEstimate ? badge('Estimated', 'badge-warn') : badge('Provisional', 'badge-warn'));

export function render(root) {
  ensureGradeScheme();
  const scheme = currentScheme();
  const sems = [...state.semesters].sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (!sems.length) { root.innerHTML = noSemesterHtml(); return; }
  const refresh = () => { emitChange(); render(root); };

  const data = sems.map((s) => {
    const courses = coursesOf(s.id);
    const results = state.results.filter((r) => r.semesterId === s.id);
    const occs = state.occurrences.filter((o) => o.semesterId === s.id);
    return { s, courses, results, g: semesterGpa(courses, results, s), att: tally(occs) };
  });
  const counted = data.filter((d) => d.s.includeInCGPA !== false).map((d) => d.g);
  const cum = cumulativeGpa(counted);
  const curPoints = counted.reduce((s, x) => s + x.points, 0);
  const act = activeSemester();
  if (!sems.some((s) => s.id === uiState.historySemesterId)) uiState.historySemesterId = (act || sems[sems.length - 1]).id;
  const cur = data.find((d) => d.s.id === uiState.historySemesterId);
  const maxPoints = Math.max(10, ...scheme.grades.map((g) => g.points));

  const resultOf = (c) => cur.results.find((r) => r.courseId === c.id);
  const editor = cur.courses.map((c) => {
    const r = resultOf(c);
    const labels = scheme.grades.map((g) => g.label);
    if (r && r.finalGrade && !labels.includes(r.finalGrade)) labels.push(r.finalGrade);
    const est = estimatedPercent(state.assessments.filter((a) => a.courseId === c.id));
    const eg = estimateGrade(scheme, est.percent);
    const suggest = eg && !(r && r.finalGrade === eg.label)
      ? `${esc(eg.label)} <span class="muted small">(${fmtPct(est.percent)}, ${est.basis})</span> <button type="button" class="btn btn-sm" data-estimate="${c.id}" data-label="${esc(eg.label)}">Use</button>`
      : '<span class="muted small">-</span>';
    return `<tr><td>${esc(c.name)}</td><td>${c.credits}</td><td>${suggest}</td>
      <td><label class="sr-only" for="g-${c.id}">Grade for ${esc(c.name)}</label><select id="g-${c.id}" data-grade="${c.id}"><option value="">Not graded</option>${labels.map((l) => `<option${r && r.finalGrade === l ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></td>
      <td>${r && typeof r.gradePoint === 'number' ? r.gradePoint : '-'}${r && r.estimated ? ' <span class="badge badge-warn">est.</span>' : ''}</td>
      <td><label class="check"><input type="checkbox" data-include="${c.id}"${!r || r.includedInGPA !== false ? ' checked' : ''}> Counts</label></td></tr>`;
  }).join('');

  root.innerHTML = `${pageHeader('Academic History')}
    <div class="grid">
      <section class="card"><h2>CGPA</h2><p class="stat">${cum.cgpa === null ? '-' : fmtNum(cum.cgpa)}</p>
        <p>${cum.cgpa === null ? badge('No grades yet', 'badge-muted') : cum.allFinal ? badge('Final', 'badge-ok') : badge('Estimated (some semesters not final)', 'badge-warn')}</p>
        <p class="muted small">${fmtNum(cum.credits)} graded credits in the semesters that count.</p></section>
      <section class="card"><h2>SGPA trend</h2>${lineChartSvg(data.filter((d) => d.g.sgpa !== null).map((d) => ({ label: d.s.name.slice(0, 12), value: d.g.sgpa })), { max: maxPoints }) || '<p class="muted">Enter grades to see the trend.</p>'}</section>
    </div>
    <section class="section card"><h2>Semesters</h2><div class="table-wrap"><table class="data"><thead><tr><th>Semester</th><th>Dates</th><th>Attendance</th><th>SGPA</th><th>Counts in CGPA</th><th></th></tr></thead><tbody>
      ${data.map((d) => `<tr><td>${esc(d.s.name)}</td><td>${esc(formatDate(d.s.startDate))} to ${esc(formatDate(d.s.endDate))}</td>
        <td>${d.att.conducted ? fmtPct((d.att.attended / d.att.conducted) * 100) : '-'}</td><td>${d.g.sgpa === null ? '-' : fmtNum(d.g.sgpa)} ${gpaBadge(d.g)}</td>
        <td><label class="check"><input type="checkbox" data-cgpa="${d.s.id}"${d.s.includeInCGPA !== false ? ' checked' : ''}> Yes</label></td>
        <td><button class="btn btn-sm" data-action="edit-results" data-id="${d.s.id}">Edit grades</button></td></tr>`).join('')}</tbody></table></div></section>
    <section class="section card"><h2>What SGPA do I need?</h2>
      <p class="muted">Based on your graded credits so far (${fmtNum(cum.credits)}).</p>
      <form id="gpa-calc" class="row"><div class="field"><label for="tgt">Target CGPA</label><input id="tgt" type="number" step="any" min="0" max="${maxPoints}" value="8" required></div>
        <div class="field"><label for="nc">Credits next semester</label><input id="nc" type="number" step="any" min="1" value="20" required></div>
        <button class="btn btn-primary" type="submit">Calculate</button></form><div id="gpa-result" aria-live="polite" style="margin-top:12px"></div></section>
    <section class="section card"><h2>Grades: ${esc(cur.s.name)}</h2>
      ${cur.courses.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Course</th><th>Credits</th><th>Suggested</th><th>Final grade</th><th>Points</th><th></th></tr></thead><tbody>${editor}</tbody></table></div>
      <p>SGPA: <strong>${cur.g.sgpa === null ? '-' : fmtNum(cur.g.sgpa)}</strong> ${gpaBadge(cur.g)} ${cur.g.missing ? `<span class="muted small">(${cur.g.missing} included course${cur.g.missing === 1 ? '' : 's'} not graded)</span>` : ''}</p>
      <label class="check"><input type="checkbox" data-final="${cur.s.id}"${cur.s.finalized ? ' checked' : ''}> Mark this semester's results as final</label>
      <p class="muted small">"Suggested" maps your weighted marks to your scheme's minimum scores. A grade you accept stays marked <em>estimated</em> until you pick it yourself.</p>
      <p class="muted small">Grades come from your grading scheme (Settings). Untick "Counts" to exclude a course, such as an audit course.</p>` : emptyState('No courses in this semester', 'Add courses first.')}</section>`;

  root.onchange = (e) => {
    const t = e.target;
    if (t.dataset.grade) {
      const c = getById('courses', t.dataset.grade);
      saveResult(cur.s, c, { finalGrade: t.value, gradePoint: t.value ? gradePointFor(scheme, t.value) : null, estimated: false });
    } else if (t.dataset.include) {
      saveResult(cur.s, getById('courses', t.dataset.include), { includedInGPA: t.checked });
    } else if (t.dataset.final) {
      save('semesters', { ...cur.s, finalized: t.checked });
    } else if (t.dataset.cgpa) {
      save('semesters', { ...getById('semesters', t.dataset.cgpa), includeInCGPA: t.checked });
    } else return;
    refresh();
  };
  root.onsubmit = (e) => {
    if (e.target.id !== 'gpa-calc') return;
    e.preventDefault();
    const r = requiredSgpa({ currentPoints: curPoints, currentCredits: cum.credits, nextCredits: Number(root.querySelector('#nc').value), targetCgpa: Number(root.querySelector('#tgt').value), maxPoints });
    root.querySelector('#gpa-result').innerHTML = r.status === 'met' ? '<p class="banner">You already meet that target, whatever you score next semester.</p>'
      : r.status === 'impossible' ? `<p class="banner bad"><strong>Not reachable.</strong> It would need an SGPA of ${fmtNum(r.required)}, above the scheme's maximum of ${fmtNum(r.maxPoints)}.</p>`
      : r.status === 'possible' ? `<p>You need an SGPA of <strong>${fmtNum(r.required)}</strong> next semester.</p>` : '<p class="muted">Enter the credits for next semester.</p>';
  };
  root.onclick = (e) => {
    const est = e.target.closest('[data-estimate]');
    if (est) {
      saveResult(cur.s, getById('courses', est.dataset.estimate), { finalGrade: est.dataset.label, gradePoint: gradePointFor(scheme, est.dataset.label), estimated: true });
      refresh();
      return;
    }
    const b = e.target.closest('[data-action="edit-results"]');
    if (b) { uiState.historySemesterId = b.dataset.id; render(root); }
  };
}
