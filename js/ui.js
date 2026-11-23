// js/ui.js - small DOM helpers shared by all views: toasts, modal dialog, a generic form builder,
// confirm dialog, page header / empty state snippets and an SVG line chart.
// Nothing here touches the DOM at import time, only inside functions.

import { escapeHtml as esc } from './utils.js';

/** Tell app.js that data changed (refresh semester dropdown + notification badge). */
export function emitChange() {
  document.dispatchEvent(new CustomEvent('studentos:changed'));
}

export function toast(message, type = 'info', action = null) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-action';
    b.textContent = action.label;
    b.onclick = () => { action.onClick(); el.remove(); };
    el.appendChild(b);
  }
  box.appendChild(el);
  setTimeout(() => el.remove(), action ? 7000 : 4500);
}

/* ---------- small HTML snippets ---------- */
export const pageHeader = (title, actionsHtml = '') =>
  `<div class="page-head"><h2>${esc(title)}</h2><div class="row no-print">${actionsHtml}</div></div>`;

export const emptyState = (title, text, actionHtml = '') =>
  `<div class="empty-state"><h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>${actionHtml}</div>`;

export const badge = (text, cls = 'badge-muted') => `<span class="badge ${cls}">${esc(text)}</span>`;

export function noSemesterHtml(withSample = false) {
  return emptyState(
    'No semester yet',
    'Create a semester to start adding courses, a timetable and attendance.',
    `<div class="btn-row" style="justify-content:center">
       <a class="btn btn-primary" href="#/semesters">Create a semester</a>
       ${withSample ? '<button class="btn" type="button" data-action="sample">Load sample data</button>' : ''}
     </div>`);
}

/* ---------- modal dialog ---------- */
export function openDialog(html) {
  const dlg = document.getElementById('modal');
  dlg.innerHTML = html;
  dlg.onclose = null;
  if (!dlg.open) dlg.showModal();
  return dlg;
}

export function confirmDialog({ title, message, details = [], confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const list = details.length
      ? `<ul>${details.map(([label, n]) => `<li>${n} ${esc(label)}</li>`).join('')}</ul>` : '';
    const dlg = openDialog(`<div class="modal-body"><h2>${esc(title)}</h2><p>${esc(message)}</p>${list}
      <div class="btn-row modal-actions">
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(confirmLabel)}</button>
        <button type="button" class="btn" data-cancel>Cancel</button></div></div>`);
    let result = false;
    dlg.querySelector('[data-ok]').onclick = () => { result = true; dlg.close(); };
    dlg.querySelector('[data-cancel]').onclick = () => dlg.close();
    dlg.onclose = () => resolve(result);
  });
}

/* ---------- generic form builder ----------
   openForm({ title, fields, values, submitLabel, validate(values)->msg|null, onSubmit(values) })
   field = { name, label, type: text|number|date|time|url|select|textarea|checkbox|checkboxes|file,
             required, options, numeric, allowEmpty, min, max, step, hint, placeholder, datalist, accept }
   onSubmit may throw: the message is shown in the form instead of closing it. */
function optionsHtml(options, current, allowEmpty) {
  const empty = allowEmpty ? '<option value="">None</option>' : '';
  return empty + options.map((o) => {
    const opt = typeof o === 'object' ? o : { value: o, label: o };
    return `<option value="${esc(opt.value)}"${String(opt.value) === String(current) ? ' selected' : ''}>${esc(opt.label)}</option>`;
  }).join('');
}

function fieldHtml(f, values) {
  const id = `f-${f.name}`;
  const cur = values[f.name] ?? f.value ?? (f.type === 'checkbox' ? false : '');
  const hint = f.hint ? `<span class="hint" id="${id}-hint">${esc(f.hint)}</span>` : '';
  const desc = f.hint ? ` aria-describedby="${id}-hint"` : '';
  const req = f.required ? ' required' : '';

  if (f.type === 'checkbox') {
    return `<div class="field field-check"><label><input type="checkbox" id="${id}" name="${f.name}"${cur ? ' checked' : ''}${desc}> ${esc(f.label)}</label>${hint}</div>`;
  }
  if (f.type === 'checkboxes') {
    const set = new Set((cur || []).map(String));
    return `<fieldset class="field"><legend>${esc(f.label)}</legend><div class="row">${f.options.map((o) =>
      `<label class="check"><input type="checkbox" name="${f.name}" value="${esc(o.value)}"${set.has(String(o.value)) ? ' checked' : ''}> ${esc(o.label)}</label>`).join('')}</div>${hint}</fieldset>`;
  }
  const label = `<label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>`;
  let control;
  if (f.type === 'select') {
    control = `<select id="${id}" name="${f.name}"${req}${desc}>${optionsHtml(f.options || [], cur, f.allowEmpty)}</select>`;
  } else if (f.type === 'textarea') {
    control = `<textarea id="${id}" name="${f.name}" rows="3"${req}${desc}>${esc(cur)}</textarea>`;
  } else if (f.type === 'file') {
    control = `<input type="file" id="${id}" name="${f.name}"${f.accept ? ` accept="${esc(f.accept)}"` : ''}${req}${desc}>`;
  } else {
    const attrs = ['min', 'max', 'step', 'placeholder'].filter((k) => f[k] !== undefined).map((k) => ` ${k}="${esc(f[k])}"`).join('');
    control = `<input type="${f.type || 'text'}" id="${id}" name="${f.name}" value="${esc(cur)}"${attrs}${req}${desc}${f.datalist ? ` list="${id}-list"` : ''}>`;
    if (f.datalist) control += `<datalist id="${id}-list">${f.datalist.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
  }
  return `<div class="field">${label}${control}${hint}</div>`;
}

function readValues(form, fields) {
  const out = {};
  for (const f of fields) {
    const el = form.elements[f.name];
    if (f.type === 'checkbox') out[f.name] = el.checked;
    else if (f.type === 'checkboxes') {
      out[f.name] = [...form.querySelectorAll(`input[name="${f.name}"]:checked`)].map((i) => (f.numeric ? Number(i.value) : i.value));
    } else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
    else if (f.type === 'file') out[f.name] = el.files[0] || null;
    else if (f.type === 'select' && f.numeric) out[f.name] = el.value === '' ? null : Number(el.value);
    else out[f.name] = el.value.trim();
  }
  return out;
}

function checkRequired(fields, values) {
  for (const f of fields) {
    if (f.type === 'checkbox' || f.type === 'checkboxes') continue;
    const v = values[f.name];
    const empty = v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));
    if (empty) { if (f.required) return `${f.label} is required.`; continue; }
    if (f.type === 'number') {
      if (f.min !== undefined && v < f.min) return `${f.label} must be at least ${f.min}.`;
      if (f.max !== undefined && v > f.max) return `${f.label} must be at most ${f.max}.`;
    }
  }
  return null;
}

export function openForm(cfg) {
  const values = cfg.values || {};
  const dlg = openDialog(`<form class="modal-body" novalidate>
    <h2>${esc(cfg.title)}</h2>
    ${cfg.intro ? `<p class="muted">${esc(cfg.intro)}</p>` : ''}
    <div class="form-grid">${cfg.fields.map((f) => fieldHtml(f, values)).join('')}</div>
    <p class="form-error" role="alert" hidden></p>
    <div class="btn-row modal-actions">
      <button type="submit" class="btn btn-primary">${esc(cfg.submitLabel || 'Save')}</button>
      <button type="button" class="btn" data-cancel>Cancel</button></div></form>`);
  const form = dlg.querySelector('form');
  const errBox = dlg.querySelector('.form-error');
  const fail = (msg) => { errBox.textContent = msg; errBox.hidden = false; };

  dlg.querySelector('[data-cancel]').onclick = () => dlg.close();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const vals = readValues(form, cfg.fields);
    const problem = checkRequired(cfg.fields, vals) || (cfg.validate ? cfg.validate(vals) : null);
    if (problem) return fail(problem);
    try {
      await cfg.onSubmit(vals);
      dlg.close();
    } catch (ex) {
      fail(ex.message || 'Something went wrong.');
    }
  };
  const first = form.querySelector('input,select,textarea');
  if (first) first.focus();
}

/* ---------- SVG line chart (no chart library needed) ---------- */
export function lineChartSvg(points, { max = 10, width = 520, height = 200, refLine = null } = {}) {
  if (!points.length) return '';
  const padL = 32, padR = 16, padT = 16, padB = 36;
  const w = width - padL - padR, h = height - padT - padB;
  const x = (i) => padL + (points.length === 1 ? w / 2 : (i * w) / (points.length - 1));
  const y = (v) => padT + h - (v / max) * h;
  const grid = [0, max / 2, max].map((v) =>
    `<line x1="${padL}" x2="${width - padR}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/>` +
    `<text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--text-muted)">${v}</text>`).join('');
  const ref = refLine ? `<line x1="${padL}" x2="${width - padR}" y1="${y(refLine.value)}" y2="${y(refLine.value)}" stroke="var(--danger)" stroke-dasharray="5 4"/><text x="${width - padR}" y="${y(refLine.value) - 4}" text-anchor="end" font-size="11" fill="var(--danger)">${esc(refLine.label)}</text>` : '';
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const dots = points.map((p, i) =>
    `<circle cx="${x(i)}" cy="${y(p.value)}" r="4" fill="var(--accent)"><title>${esc(p.label)}: ${p.value.toFixed(2)}</title></circle>` +
    `<text x="${x(i)}" y="${height - 12}" text-anchor="middle" font-size="11" fill="var(--text-muted)">${esc(p.label)}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Trend chart">${grid}${ref}<polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2"/>${dots}</svg>`;
}
