// js/components.js - HTML fragments and click handling reused by more than one view
// (the attendance class row is used on both the Dashboard and the Timetable page).

import { state, getById } from './state.js';
import { STATUS, STATUS_LABELS, isCancelled } from './logic/attendance.js';
import { escapeHtml as esc, formatDate } from './utils.js';
import { openForm, confirmDialog, toast, badge } from './ui.js';
import * as svc from './services.js';

export const courseLabel = (c) => (c ? (c.code ? `${c.code} - ${c.name}` : c.name) : 'Deleted course');

export const courseOptions = (semesterId) =>
  state.courses.filter((c) => c.semesterId === semesterId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: courseLabel(c) }));

export const fmtCount = (n) => (n === Infinity ? 'Any number' : String(n));

const ATT_BADGE = {
  none: ['No classes yet', 'badge-muted'],
  ok: ['On track', 'badge-ok'],
  close: ['Close to shortage', 'badge-warn'],
  shortage: ['Shortage', 'badge-bad'],
};
export const attendanceBadge = (st) => badge(...ATT_BADGE[st]);

export function statusBadge(status) {
  const cls = { present: 'badge-ok', absent: 'badge-bad', pending: 'badge-muted' }[status] || 'badge-warn';
  return badge(STATUS_LABELS[status], cls);
}

const KIND_LABEL = { extra: 'Extra class', replacement: 'Replacement', shifted: 'Shifted' };

export function classRowHtml(o, { showDate = false } = {}) {
  const c = getById('courses', o.courseId);
  const mark = (status, label) =>
    `<button type="button" class="btn btn-sm${o.status === status ? ' btn-primary' : ''}" data-action="mark" data-status="${status}" data-id="${o.id}" aria-pressed="${o.status === status}">${label}</button>`;
  const kind = KIND_LABEL[o.kind] ? ` ${badge(KIND_LABEL[o.kind], 'badge-class')}` : '';
  const reason = o.reason ? `<div class="muted small">${esc(o.reason)}</div>` : '';
  return `<div class="class-row${isCancelled(o.status) ? ' cancelled' : ''}">
    <div><strong>${esc(courseLabel(c))}</strong>${kind}
      <div class="muted small">${showDate ? esc(formatDate(o.date)) + ' | ' : ''}${esc(o.startTime)}-${esc(o.endTime)}${o.venue ? ' | ' + esc(o.venue) : ''}</div>${reason}</div>
    <div class="seg" role="group" aria-label="Mark attendance for ${esc(courseLabel(c))}">
      ${mark('present', 'Present')}${mark('absent', 'Absent')}${mark('cancelled_holiday', 'Holiday')}${mark('cancelled_other', 'Cancelled')}
      <button type="button" class="btn btn-sm" data-action="shift" data-id="${o.id}">Shift</button>
      ${o.kind !== 'regular' ? `<button type="button" class="btn btn-sm btn-danger" data-action="delete-occ" data-id="${o.id}">Delete</button>` : ''}
    </div></div>`;
}

/**
 * Handle a click on a class row. Returns true if the click was an attendance action.
 * Clicking the status that is already selected un-marks it (back to "Not marked").
 */
export async function handleClassAction(target, onChange) {
  const btn = target.closest('[data-action]');
  if (!btn || !['mark', 'shift', 'delete-occ'].includes(btn.dataset.action)) return false;
  const { action, id, status } = btn.dataset;
  const o = getById('occurrences', id);
  if (!o) return true;

  if (action === 'mark') {
    if (status === STATUS.CANCEL_OTHER && o.status !== status) {
      openForm({
        title: 'Class cancelled', submitLabel: 'Save',
        fields: [{ name: 'reason', label: 'Reason (optional)', type: 'text', value: o.reason }],
        onSubmit: (v) => { svc.markOccurrence(id, status, v.reason); onChange(); },
      });
    } else {
      const before = { status: o.status, reason: o.reason };
      const next = o.status === status ? STATUS.PENDING : status;
      svc.markOccurrence(id, next, '');
      onChange();
      toast(`Marked ${STATUS_LABELS[next].toLowerCase()}.`, 'info', { label: 'Undo', onClick: () => { svc.markOccurrence(id, before.status, before.reason); onChange(); } });
    }
  } else if (action === 'shift') {
    openForm({
      title: 'Shift this class', submitLabel: 'Shift class',
      intro: 'The original class is marked cancelled and a new class is created. Your weekly timetable does not change.',
      fields: [
        { name: 'date', label: 'New date', type: 'date', required: true, value: o.date },
        { name: 'startTime', label: 'Start time', type: 'time', required: true, value: o.startTime },
        { name: 'endTime', label: 'End time', type: 'time', required: true, value: o.endTime },
        { name: 'venue', label: 'Venue', type: 'text', value: o.venue },
      ],
      onSubmit: (v) => { svc.shiftOccurrence(id, v); toast('Class shifted.'); onChange(); },
    });
  } else if (action === 'delete-occ') {
    if (await confirmDialog({ title: 'Delete this class?', message: 'Only extra, replacement and shifted classes can be deleted.', confirmLabel: 'Delete', danger: true })) {
      svc.deleteOccurrence(id);
      onChange();
    }
  }
  return true;
}
