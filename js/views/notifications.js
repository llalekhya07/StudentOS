// js/views/notifications.js - in-app alerts derived from your data, plus optional browser notifications.
// Only the "read" and "already pushed" flags are stored (state.notifState); the alerts themselves are recomputed.

import { state, settings, activeSemester, save } from '../state.js';
import { buildNotifications } from '../logic/notifications.js';
import { pageHeader, emptyState, noSemesterHtml, badge, emitChange } from '../ui.js';
import { escapeHtml as esc, todayISO, formatDate } from '../utils.js';

let showAll = false;
const SEV = { high: ['Urgent', 'badge-bad'], medium: ['Soon', 'badge-warn'], low: ['Note', 'badge-muted'] };

export function currentNotifications() {
  const sem = activeSemester();
  return sem ? buildNotifications({ state, settings, semesterId: sem.id, today: todayISO() }) : [];
}
const flagOf = (id) => state.notifState.find((n) => n.id === id);
const isRead = (id) => Boolean(flagOf(id) && flagOf(id).read);

export const unreadCount = () => currentNotifications().filter((n) => !isRead(n.id)).length;
export const markRead = (id) => save('notifState', { ...(flagOf(id) || { id }), read: true });

/** Browser notification while the app is open (permission-based; not a background push service). */
export function pushBrowserNotifications() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !settings.browserNotifications) return;
  for (const n of currentNotifications()) {
    const f = flagOf(n.id);
    if (f && (f.read || f.notified)) continue;
    new Notification('StudentOS', { body: n.message });
    save('notifState', { ...(f || { id: n.id }), notified: true });
  }
}

export function render(root) {
  const sem = activeSemester();
  if (!sem) { root.innerHTML = noSemesterHtml(); return; }
  const all = currentNotifications();
  const list = showAll ? all : all.filter((n) => !isRead(n.id));
  const refresh = () => { emitChange(); render(root); };

  root.innerHTML = `${pageHeader('Notifications', `<button class="btn btn-sm" data-action="toggle">${showAll ? 'Show unread only' : 'Show all'}</button>${list.some((n) => !isRead(n.id)) ? '<button class="btn btn-sm btn-primary" data-action="read-all">Mark all read</button>' : ''}`)}
    ${list.length ? `<div class="card"><ul class="list">${list.map((n) => `<li class="row row-between"><div>${badge(...SEV[n.severity])} ${isRead(n.id) ? '' : '<strong>New</strong> '}${esc(n.message)}
      <div class="muted small">${esc(formatDate(n.date))}</div></div><span class="btn-row"><a class="btn btn-sm" href="${n.link}">Open</a>${isRead(n.id) ? '' : `<button class="btn btn-sm" data-action="read" data-id="${esc(n.id)}">Mark read</button>`}</span></li>`).join('')}</ul></div>`
      : emptyState(showAll ? 'No alerts' : 'You are all caught up', 'Deadlines, exams, attendance warnings, unmarked classes and tasks show up here automatically.')}
    <p class="muted small">Browser notifications can be turned on in Settings. They only appear while StudentOS is open in a tab.</p>`;

  root.onclick = (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    if (b.dataset.action === 'toggle') { showAll = !showAll; render(root); }
    else if (b.dataset.action === 'read') { markRead(b.dataset.id); refresh(); }
    else if (b.dataset.action === 'read-all') { list.forEach((n) => markRead(n.id)); refresh(); }
  };
}
