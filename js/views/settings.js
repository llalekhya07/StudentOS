// js/views/settings.js - attendance threshold, reminders, grading scheme, storage and data tools.

import { settings, updateSettings, currentScheme, ensureGradeScheme, save, wipeAllData } from '../state.js';
import { parseGradeScheme, schemeToText } from '../logic/grades.js';
import * as svc from '../services.js';
import { confirmDialog, toast, pageHeader, emitChange } from '../ui.js';
import { escapeHtml as esc } from '../utils.js';

function showStorageEstimate(root) {
  if (typeof root.querySelector !== 'function' || typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) return;
  navigator.storage.estimate().then(({ usage, quota }) => {
    const el = root.querySelector('#storage-info');
    if (el) el.textContent = `Using about ${(usage / 1048576).toFixed(1)} MB of roughly ${Math.round(quota / 1048576)} MB available to this site.`;
  }).catch(() => {});
}

export function render(root) {
  ensureGradeScheme();
  const scheme = currentScheme();
  const notifSupported = typeof Notification !== 'undefined';
  root.innerHTML = `${pageHeader('Settings')}
    <section class="card"><h2>Attendance and reminders</h2>
      <form id="prefs" class="stack">
        <div class="field"><label for="threshold">Default attendance requirement (%)</label><input id="threshold" type="number" min="1" max="100" step="1" value="${settings.attendanceThreshold}" required>
          <span class="hint">A course can override this in its own settings.</span></div>
        <div class="field"><label for="soon">"Due soon" window (days)</label><input id="soon" type="number" min="0" max="30" step="1" value="${settings.deadlineSoonDays}" required></div>
        <div><button class="btn btn-primary" type="submit">Save</button></div></form></section>

    <section class="section card"><h2>Browser notifications</h2>
      <p class="muted">Optional. They only appear while StudentOS is open in a browser tab; there is no background service.</p>
      <p>Status: <strong>${notifSupported ? (settings.browserNotifications && Notification.permission === 'granted' ? 'On' : 'Off') : 'Not supported in this browser'}</strong></p>
      ${notifSupported ? `<button class="btn" type="button" data-action="notif">${settings.browserNotifications ? 'Turn off' : 'Turn on'}</button>` : ''}</section>

    <section class="section card"><h2>Grading scheme</h2>
      <p class="muted">Institutions differ, so nothing is hard-coded. One grade per line: <code>label, points, minimum score (optional)</code>. Saved grades keep the points they had when you chose them.</p>
      <form id="scheme" class="stack">
        <div class="field"><label for="scheme-name">Scheme name</label><input id="scheme-name" type="text" value="${esc(scheme.name)}" required></div>
        <div class="field" style="max-width:none"><label for="scheme-text">Grades</label><textarea id="scheme-text" rows="9">${esc(schemeToText(scheme))}</textarea></div>
        <p class="form-error" id="scheme-error" role="alert" hidden></p>
        <div><button class="btn btn-primary" type="submit">Save grading scheme</button></div></form></section>

    <section class="section card"><h2>Storage</h2><p id="storage-info" class="muted">Checking...</p>
      <p class="muted small">Everything is stored in this browser (IndexedDB and LocalStorage). Clearing site data deletes it, so download a backup from Reports regularly.</p>
      <button class="btn" type="button" data-action="persist">Ask the browser to keep my data</button></section>

    <section class="section card"><h2>Data</h2><div class="btn-row">
      <button class="btn" type="button" data-action="sample">Load sample semester</button>
      <button class="btn btn-danger" type="button" data-action="wipe">Delete ALL data</button></div></section>`;
  showStorageEstimate(root);

  root.onsubmit = (e) => {
    e.preventDefault();
    if (e.target.id === 'prefs') {
      const t = Number(root.querySelector('#threshold').value);
      const s = Number(root.querySelector('#soon').value);
      if (!Number.isInteger(t) || t < 1 || t > 100) return toast('The attendance requirement must be a whole number from 1 to 100.', 'error');
      if (!Number.isInteger(s) || s < 0 || s > 30) return toast('The due-soon window must be a whole number from 0 to 30.', 'error');
      updateSettings({ attendanceThreshold: t, deadlineSoonDays: s });
      toast('Settings saved.');
      emitChange();
    } else if (e.target.id === 'scheme') {
      const parsed = parseGradeScheme(root.querySelector('#scheme-text').value);
      const err = root.querySelector('#scheme-error');
      if (parsed.error) { err.textContent = parsed.error; err.hidden = false; return; }
      err.hidden = true;
      save('gradeSchemes', { ...scheme, name: root.querySelector('#scheme-name').value.trim(), grades: parsed.grades });
      toast('Grading scheme saved.');
    }
  };

  root.onclick = async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'notif') {
      if (settings.browserNotifications) updateSettings({ browserNotifications: false });
      else {
        const perm = await Notification.requestPermission();
        updateSettings({ browserNotifications: perm === 'granted' });
        if (perm !== 'granted') toast('Permission was not granted.', 'error');
      }
      render(root);
    } else if (a === 'persist') {
      const ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false;
      toast(ok ? 'The browser will try to keep your data.' : 'The browser did not grant persistent storage.');
    } else if (a === 'sample') { svc.loadSampleData(); toast('Sample semester loaded.'); emitChange(); }
    else if (a === 'wipe' && await confirmDialog({ title: 'Delete ALL data?', message: 'Every semester, course, record, file and setting is permanently deleted. Download a backup first if unsure.', confirmLabel: 'Delete everything', danger: true })) {
      await wipeAllData();
      toast('All data deleted.');
      emitChange();
      render(root);
    }
  };
}
