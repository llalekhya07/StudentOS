// js/app.js - startup, router, navigation, theme, semester switcher.
// Pages are modules in js/views/. Each exports render(root, param).

import { loadSettings, initState, state, settings, updateSettings, activeSemester } from './state.js';
import { setErrorHandler } from './storage.js';
import { toast } from './ui.js';
import { escapeHtml as esc } from './utils.js';
import * as dashboard from './views/dashboard.js';
import * as semesters from './views/semesters.js';
import * as courses from './views/courses.js';
import * as timetable from './views/timetable.js';
import * as exams from './views/exams.js';
import * as assignments from './views/assignments.js';
import * as resources from './views/resources.js';
import * as calendar from './views/calendar.js';
import * as planner from './views/planner.js';
import * as notifications from './views/notifications.js';
import * as history from './views/history.js';
import * as reports from './views/reports.js';
import * as settingsView from './views/settings.js';

/* The route table is the single source of truth for the sidebar, titles and routing. */
const routes = [
  { path: 'dashboard', title: 'Dashboard', view: dashboard },
  { path: 'semesters', title: 'My Semesters', view: semesters },
  { path: 'courses', title: 'Courses', view: courses },
  { path: 'timetable', title: 'Timetable & Attendance', view: timetable },
  { path: 'exams', title: 'Exams & Marks', view: exams },
  { path: 'assignments', title: 'Assignments & Projects', view: assignments },
  { path: 'resources', title: 'Resources', view: resources },
  { path: 'calendar', title: 'Academic Calendar', view: calendar },
  { path: 'planner', title: 'Personal Planner', view: planner },
  { path: 'notifications', title: 'Notifications', view: notifications },
  { path: 'history', title: 'Academic History', view: history },
  { path: 'reports', title: 'Reports', view: reports },
  { path: 'settings', title: 'Settings', view: settingsView },
];

const $ = (id) => document.getElementById(id);
const navEl = $('nav'), mainEl = $('main'), titleEl = $('pageTitle'), sidebarEl = $('sidebar');
const scrimEl = $('scrim'), menuBtn = $('menuBtn'), themeBtn = $('themeBtn'), semSelect = $('semesterSelect');

function buildNav() {
  navEl.innerHTML = routes.map((r) =>
    `<a href="#/${r.path}" data-path="${r.path}">${esc(r.title)}${r.path === 'notifications' ? ' <span id="notif-badge" class="badge badge-bad" hidden></span>' : ''}</a>`).join('');
}

function refreshHeader() {
  const sems = [...state.semesters].sort((a, b) => b.startDate.localeCompare(a.startDate));
  semSelect.innerHTML = sems.length
    ? sems.map((s) => `<option value="${s.id}"${s.id === settings.activeSemesterId ? ' selected' : ''}>${esc(s.name)}</option>`).join('')
    : '<option value="">No semester yet</option>';
  semSelect.disabled = sems.length === 0;
  const n = activeSemester() ? notifications.unreadCount() : 0;
  const badge = $('notif-badge');
  if (badge) { badge.hidden = n === 0; badge.textContent = n; }
}

function currentRoute() {
  const [path, param] = location.hash.replace(/^#\/?/, '').split('/');
  return { route: routes.find((r) => r.path === path) || routes[0], param };
}

function renderRoute({ moveFocus = false } = {}) {
  const { route, param } = currentRoute();
  titleEl.textContent = route.title;
  document.title = `${route.title} - StudentOS`;
  try {
    route.view.render(mainEl, param);
  } catch (err) {
    console.error(err);
    mainEl.innerHTML = `<div class="empty-state"><h2>Something went wrong</h2><p class="muted">${esc(err.message)}</p></div>`;
  }
  navEl.querySelectorAll('a').forEach((a) => {
    if (a.dataset.path === route.path) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  refreshHeader();
  closeDrawer();
  window.scrollTo(0, 0);
  if (moveFocus) mainEl.focus({ preventScroll: true });
}

function openDrawer() { sidebarEl.classList.add('open'); scrimEl.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); }
function closeDrawer() { sidebarEl.classList.remove('open'); scrimEl.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }

function updateThemeButton() {
  themeBtn.setAttribute('aria-label', document.documentElement.dataset.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('studentos.theme', next); } catch (e) { console.warn('Could not save theme', e); }
  updateThemeButton();
}

async function init() {
  loadSettings();
  setErrorHandler((e) => toast(`Could not save: ${e && e.message ? e.message : 'storage error'}. Your last change may be lost.`, 'error'));
  buildNav();
  try {
    await initState();
  } catch (e) {
    mainEl.innerHTML = '<div class="empty-state"><h2>Storage unavailable</h2><p class="muted">StudentOS needs IndexedDB, which this browser blocked (private mode?). Try a normal window.</p></div>';
    return;
  }
  renderRoute();
  updateThemeButton();

  window.addEventListener('hashchange', () => renderRoute({ moveFocus: true }));
  document.addEventListener('studentos:changed', refreshHeader);
  menuBtn.addEventListener('click', () => (sidebarEl.classList.contains('open') ? closeDrawer() : openDrawer()));
  scrimEl.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  themeBtn.addEventListener('click', toggleTheme);
  semSelect.addEventListener('change', () => {
    updateSettings({ activeSemesterId: semSelect.value });
    if (location.hash.startsWith('#/courses/')) location.hash = '#/courses'; else renderRoute();
  });

  // Offline support + installability (needs http(s) or localhost, not file://)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

  notifications.pushBrowserNotifications();
  setInterval(() => { notifications.pushBrowserNotifications(); refreshHeader(); }, 60000);
}

init();
