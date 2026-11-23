// js/views/reports.js - printable report (Save as PDF), CSV exports, JSON backup and validated restore.

import { state, settings, STORES, activeSemester, coursesOf, replaceAllData } from '../state.js';
import { courseSummaryRows, attendanceLogRows, assessmentRows, SUMMARY_HEADER, ATTENDANCE_HEADER, ASSESSMENT_HEADER } from '../logic/reports.js';
import { buildBackup, validateBackup } from '../logic/backup.js';
import { collectItems } from '../logic/calendar.js';
import { buildICS } from '../logic/ics.js';
import * as svc from '../services.js';
import { openForm, toast, pageHeader, noSemesterHtml, emitChange } from '../ui.js';
import { escapeHtml as esc, todayISO, formatDate, toCSV, downloadText } from '../utils.js';

const csv = (header, rows) => '\uFEFF' + toCSV([header, ...rows]); // BOM so Excel reads UTF-8

function semesterData(sem) {
  const courses = coursesOf(sem.id);
  const ids = new Set(courses.map((c) => c.id));
  return {
    courses,
    occurrences: state.occurrences.filter((o) => o.semesterId === sem.id),
    assessments: state.assessments.filter((a) => ids.has(a.courseId)),
    results: state.results.filter((r) => ids.has(r.courseId)),
  };
}

async function restore(file, root) {
  let parsed;
  try { parsed = JSON.parse(await file.text()); } catch (e) { toast('That file is not valid JSON.', 'error'); return; }
  const check = validateBackup(parsed, STORES);
  if (!check.ok) { toast(check.errors.slice(0, 3).join(' '), 'error'); return; }
  const summary = Object.entries(check.counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ') || 'no records';
  openForm({
    title: 'Restore backup',
    intro: `This backup contains: ${summary}.${parsed.files ? '' : ' It has no attached files.'}`,
    submitLabel: 'Restore',
    values: { mode: 'merge' },
    fields: [{ name: 'mode', label: 'How should it be applied?', type: 'select', options: [
      { value: 'merge', label: 'Merge: keep my data, add or update records from the backup' },
      { value: 'replace', label: 'Replace: delete my current records and use the backup' }] }],
    onSubmit: async (v) => {
      await replaceAllData(parsed.data, v.mode);
      const n = parsed.files ? await svc.importFilesFromBackup(parsed.files) : 0;
      toast(n ? `Backup restored with ${n} attached file${n === 1 ? '' : 's'}.` : 'Backup restored.');
      emitChange();
      render(root);
    },
  });
}

export function render(root) {
  const sem = activeSemester();
  if (!sem) { root.innerHTML = noSemesterHtml(); return; }
  const today = todayISO();
  const d = semesterData(sem);
  const summary = courseSummaryRows({ ...d, defaultThreshold: settings.attendanceThreshold, today });

  root.innerHTML = `${pageHeader('Reports', '<button class="btn btn-sm btn-primary" data-action="print">Print / Save as PDF</button>')}
    <section class="card"><h2>${esc(sem.name)} report</h2>
      <p class="muted">${esc(formatDate(sem.startDate))} to ${esc(formatDate(sem.endDate))} | generated ${esc(formatDate(today))}</p>
      <div class="table-wrap"><table class="data"><thead><tr>${SUMMARY_HEADER.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${summary.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${SUMMARY_HEADER.length}">No courses.</td></tr>`}</tbody></table></div></section>

    <section class="section card no-print"><h2>Export CSV</h2><div class="btn-row">
      <button class="btn" data-action="csv-summary">Course summary</button><button class="btn" data-action="csv-attendance">Attendance log</button><button class="btn" data-action="csv-assessments">Assessments</button><button class="btn" data-action="ics">Calendar (.ics)</button></div>
      <p class="muted small">The .ics file (classes, exams, deadlines, events) imports into Google Calendar, Outlook or Apple Calendar.</p>
      <p class="muted small">"Print / Save as PDF" opens your browser's print dialog: choose "Save as PDF" as the destination.</p></section>

    <section class="section card no-print"><h2>Backup and restore</h2>
      <p class="muted">A JSON file with all your data. The <strong>data-only</strong> backup is small but leaves attached files in this browser. The <strong>full backup</strong> also embeds attached files and can be large.</p>
      <div class="btn-row"><button class="btn btn-primary" data-action="backup">Download backup (data only)</button><button class="btn" data-action="backup-full">Download full backup (with files)</button>
        <div class="field"><label for="restore">Restore from a backup file</label><input type="file" id="restore" accept=".json,application/json"></div></div></section>`;

  root.onclick = async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'print') window.print();
    else if (a === 'csv-summary') downloadText(`studentos-${sem.name}-summary.csv`, csv(SUMMARY_HEADER, summary), 'text/csv');
    else if (a === 'csv-attendance') downloadText(`studentos-${sem.name}-attendance.csv`, csv(ATTENDANCE_HEADER, attendanceLogRows(d)), 'text/csv');
    else if (a === 'csv-assessments') downloadText(`studentos-${sem.name}-assessments.csv`, csv(ASSESSMENT_HEADER, assessmentRows(d)), 'text/csv');
    else if (a === 'ics') downloadText(`studentos-${sem.name}.ics`, buildICS(collectItems({ state, semesterId: sem.id, from: sem.startDate, to: sem.endDate }), { calName: sem.name }), 'text/calendar');
    else if (a === 'backup-full') {
      try { downloadText(`studentos-full-backup-${today}.json`, JSON.stringify(buildBackup(state, settings, await svc.exportFilesForBackup())), 'application/json'); }
      catch (err) { toast(`Could not build the full backup: ${err.message}`, 'error'); }
    } else if (a === 'backup') downloadText(`studentos-backup-${today}.json`, JSON.stringify(buildBackup(state, settings), null, 2), 'application/json');
  };
  root.onchange = (e) => {
    if (e.target.id === 'restore' && e.target.files[0]) restore(e.target.files[0], root);
  };
}
