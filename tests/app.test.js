// tests/app.test.js - integration tests: services + state + every page's render() against sample data.
// IndexedDB and the DOM do not exist in Node, so persistence calls fail silently (errors are swallowed by a
// test handler) and pages render into a fake root object. This verifies data flow and generated HTML, NOT browser behaviour.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = { getElementById: () => null, dispatchEvent: () => {}, createElement: () => ({}) };

const { state, settings, STORES, getById, save, deleteSemester, deleteCourse, courseDependents, semesterDependents, replaceAllData, activeSemester } = await import('../js/state.js');
const { setErrorHandler } = await import('../js/storage.js');
const svc = await import('../js/services.js');
const { addDays, todayISO } = await import('../js/utils.js');
const { semesterGpa } = await import('../js/logic/grades.js');

setErrorHandler(() => {}); // no IndexedDB in Node

const views = {
  dashboard: await import('../js/views/dashboard.js'),
  semesters: await import('../js/views/semesters.js'),
  courses: await import('../js/views/courses.js'),
  timetable: await import('../js/views/timetable.js'),
  exams: await import('../js/views/exams.js'),
  assignments: await import('../js/views/assignments.js'),
  resources: await import('../js/views/resources.js'),
  calendar: await import('../js/views/calendar.js'),
  planner: await import('../js/views/planner.js'),
  notifications: await import('../js/views/notifications.js'),
  history: await import('../js/views/history.js'),
  reports: await import('../js/views/reports.js'),
  settings: await import('../js/views/settings.js'),
};

function reset() {
  STORES.forEach((s) => { state[s] = []; });
  settings.activeSemesterId = null;
  settings.gradeSchemeId = null;
  settings.attendanceThreshold = 75;
  settings.deadlineSoonDays = 3;
}
beforeEach(reset);

const BAD = /undefined|NaN|\[object|null</;
const fakeRoot = () => ({ innerHTML: '', querySelector: () => ({ value: '75', innerHTML: '', hidden: true, textContent: '' }) });

test('every page renders sensible HTML with no semester (empty state)', () => {
  for (const [name, v] of Object.entries(views)) {
    const root = fakeRoot();
    v.render(root);
    assert.ok(root.innerHTML.length > 20, `${name} rendered nothing`);
    assert.doesNotMatch(root.innerHTML, BAD, `${name} (empty) has a bad value`);
  }
});

test('every page renders sensible HTML with sample data', () => {
  const sem = svc.loadSampleData();
  assert.equal(activeSemester().id, sem.id);
  for (const [name, v] of Object.entries(views)) {
    const root = fakeRoot();
    v.render(root);
    assert.ok(root.innerHTML.length > 200, `${name} rendered too little`);
    assert.doesNotMatch(root.innerHTML, BAD, `${name} has a bad value`);
  }
  const root = fakeRoot();
  views.courses.render(root, state.courses[0].id);
  assert.match(root.innerHTML, /Database Systems/);
  assert.doesNotMatch(root.innerHTML, BAD);
  const missing = fakeRoot();
  views.courses.render(missing, 'nope');
  assert.match(missing.innerHTML, /not found/i);
});

test('sample data: generated only inside the semester, past marked, recent pending', () => {
  const sem = svc.loadSampleData();
  assert.ok(state.occurrences.length > 40);
  assert.ok(state.occurrences.every((o) => o.date >= sem.startDate && o.date <= sem.endDate));
  assert.ok(state.occurrences.every((o) => !sem.holidays.some((h) => h.date === o.date)));
  const keys = state.occurrences.map((o) => `${o.courseId}|${o.date}|${o.startTime}`);
  assert.equal(new Set(keys).size, keys.length, 'no duplicate occurrences');
  assert.ok(state.occurrences.some((o) => o.status === 'present'));
  assert.ok(state.occurrences.some((o) => o.status === 'absent'));
  assert.ok(state.occurrences.some((o) => o.status === 'cancelled_other'));
  assert.ok(state.occurrences.filter((o) => o.date < todayISO() && o.status === 'pending').length >= 2);
});

function basicSemester() {
  const sem = svc.saveSemester({ name: 'T', startDate: '2026-01-05', endDate: '2026-02-01', workingDays: [1, 2, 3, 4, 5] });
  const course = save('courses', { semesterId: sem.id, name: 'Math', code: 'M1', credits: 4, attendanceThreshold: null });
  return { sem, course };
}

test('timetable: generate, holiday cancel, shift, extra class, duplicates', () => {
  const { sem, course } = basicSemester();
  const r = svc.saveTimetableEntry({ semesterId: sem.id, courseId: course.id, weekday: 1, startTime: '09:00', endTime: '10:00' });
  assert.equal(r.added, 4);
  assert.equal(svc.syncOccurrences(sem.id).added, 0, 'second sync adds nothing');

  const n = svc.addHoliday(sem.id, '2026-01-12', 'Festival');
  assert.equal(n, 1);
  const cancelled = state.occurrences.find((o) => o.date === '2026-01-12');
  assert.equal(cancelled.status, 'cancelled_holiday');
  assert.equal(state.timetable.length, 1, 'template untouched');

  const first = state.occurrences.find((o) => o.date === '2026-01-05');
  svc.shiftOccurrence(first.id, { date: '2026-01-06', startTime: '14:00', endTime: '15:00', venue: '' });
  assert.equal(getById('occurrences', first.id).status, 'cancelled_other');
  assert.ok(state.occurrences.some((o) => o.kind === 'shifted' && o.date === '2026-01-06' && o.status === 'pending'));
  assert.throws(() => svc.shiftOccurrence(state.occurrences.find((o) => o.date === '2026-01-19').id, { date: '2026-01-06', startTime: '14:00', endTime: '15:00', venue: '' }), /already exists/);

  svc.addExtraClass({ semesterId: sem.id, courseId: course.id, date: '2026-01-07', startTime: '10:00', endTime: '11:00', kind: 'extra' });
  assert.throws(() => svc.addExtraClass({ semesterId: sem.id, courseId: course.id, date: '2026-01-07', startTime: '10:00', endTime: '11:00', kind: 'extra' }), /already exists/);
  assert.throws(() => svc.addExtraClass({ semesterId: sem.id, courseId: course.id, date: '2027-01-07', startTime: '10:00', endTime: '11:00', kind: 'extra' }), /inside the semester/);
});

test('attendance marking keeps cancelled out of the denominator', async () => {
  const { sem, course } = basicSemester();
  svc.saveTimetableEntry({ semesterId: sem.id, courseId: course.id, weekday: 1, startTime: '09:00', endTime: '10:00' });
  const [a, b, c, d] = state.occurrences.sort((x, y) => x.date.localeCompare(y.date));
  svc.markOccurrence(a.id, 'present');
  svc.markOccurrence(b.id, 'absent');
  svc.markOccurrence(c.id, 'cancelled_other', 'strike');
  const { courseAttendance } = await import('../js/logic/attendance.js');
  const att = courseAttendance(state.occurrences, 75, '2026-01-31');
  assert.equal(att.conducted, 2);
  assert.equal(att.percent, 50);
  assert.equal(att.state, 'shortage');
  assert.equal(att.mustAttend, 2);   // (75*2-100*1)/(25) = 2
  assert.equal(d.status, 'pending');
  assert.equal(getById('occurrences', c.id).reason, 'strike');
  svc.markOccurrence(c.id, 'pending');
  assert.equal(getById('occurrences', c.id).reason, '');
});

test('changing a slot from a date keeps earlier classes intact', () => {
  const { sem, course } = basicSemester();
  svc.saveTimetableEntry({ semesterId: sem.id, courseId: course.id, weekday: 1, startTime: '09:00', endTime: '10:00' });
  const jan5 = state.occurrences.find((o) => o.date === '2026-01-05');
  svc.markOccurrence(jan5.id, 'present');
  const entry = state.timetable[0];
  svc.changeTimetableFrom(entry.id, { startTime: '11:00', endTime: '12:00' }, '2026-01-19');
  const regular = state.occurrences.filter((o) => o.kind === 'regular').sort((x, y) => x.date.localeCompare(y.date));
  assert.deepEqual(regular.map((o) => `${o.date} ${o.startTime}`), ['2026-01-05 09:00', '2026-01-12 09:00', '2026-01-19 11:00', '2026-01-26 11:00']);
  assert.equal(getById('occurrences', jan5.id).status, 'present');
  assert.equal(state.timetable.length, 2);
});

test('deleting a slot removes unmarked classes but keeps marked ones', () => {
  const { sem, course } = basicSemester();
  svc.saveTimetableEntry({ semesterId: sem.id, courseId: course.id, weekday: 1, startTime: '09:00', endTime: '10:00' });
  svc.markOccurrence(state.occurrences.find((o) => o.date === '2026-01-05').id, 'absent');
  svc.deleteTimetableEntry(state.timetable[0].id);
  assert.equal(state.occurrences.length, 1);
  assert.equal(state.occurrences[0].status, 'absent');
});

test('semester date edit prunes unmarked classes outside, keeps marked', () => {
  const { sem, course } = basicSemester();
  svc.saveTimetableEntry({ semesterId: sem.id, courseId: course.id, weekday: 1, startTime: '09:00', endTime: '10:00' });
  svc.markOccurrence(state.occurrences.find((o) => o.date === '2026-01-26').id, 'present');
  svc.saveSemester({ id: sem.id, name: 'T', startDate: '2026-01-05', endDate: '2026-01-13', workingDays: [1, 2, 3, 4, 5] });
  const dates = state.occurrences.map((o) => o.date).sort();
  assert.deepEqual(dates, ['2026-01-05', '2026-01-12', '2026-01-26']);
});

test('cascade delete with dependents counts', () => {
  const sem = svc.loadSampleData();
  const course = state.courses[0];
  const deps = courseDependents(course.id);
  assert.ok(deps.some(([label]) => label === 'class records'));
  assert.ok(semesterDependents(sem.id).some(([label, n]) => label === 'courses' && n === 4));
  deleteCourse(course.id);
  assert.equal(state.occurrences.filter((o) => o.courseId === course.id).length, 0);
  assert.equal(state.assessments.filter((a) => a.courseId === course.id).length, 0);
  assert.equal(state.courses.length, 3);
  deleteSemester(sem.id);
  assert.equal(state.courses.length, 0);
  assert.equal(state.occurrences.length, 0);
  assert.equal(state.semesters.length, 0);
  assert.equal(settings.activeSemesterId, null);
});

test('click handlers: mark attendance from the dashboard, calculator on exams', () => {
  svc.loadSampleData();
  const root = fakeRoot();
  views.timetable.render(root);
  const target = state.occurrences.find((o) => o.status === 'pending');
  const btn = { dataset: { action: 'mark', id: target.id, status: 'present' } };
  return root.onclick({ target: { closest: () => btn } }).then(() => {
    assert.equal(getById('occurrences', target.id).status, 'present');
  }).then(() => {
    const exams = fakeRoot();
    const out = { value: '75', innerHTML: '' };
    exams.querySelector = (sel) => (sel === '#calc-result' ? out : { value: '75' });
    views.exams.render(exams);
    exams.onsubmit({ target: { id: 'calc' }, preventDefault() {} });
    assert.match(out.innerHTML, /need|reached|Not reachable/);
  });
});

test('backup restore merge and replace', async () => {
  const sem = svc.loadSampleData();
  const courseCount = state.courses.length;
  const snapshot = JSON.parse(JSON.stringify(state));
  state.courses = state.courses.slice(0, 1);
  await replaceAllData(snapshot, 'merge').catch(() => {}); // persistence fails in Node; memory state is still updated
  assert.equal(state.courses.length, courseCount, 'merge restores missing records');
  const extra = save('semesters', { name: 'Extra', startDate: '2030-01-01', endDate: '2030-05-01', workingDays: [1], holidays: [] });
  await replaceAllData(snapshot, 'replace').catch(() => {});
  assert.ok(!state.semesters.some((s) => s.id === extra.id), 'replace drops records not in the backup');
  assert.ok(state.semesters.some((s) => s.id === sem.id));
});

test('SGPA from stored results uses course credits', () => {
  const { sem } = basicSemester();
  const c2 = save('courses', { semesterId: sem.id, name: 'Phys', credits: 2 });
  const c1 = state.courses[0];
  save('results', { semesterId: sem.id, courseId: c1.id, finalGrade: 'A', gradePoint: 8, includedInGPA: true });
  save('results', { semesterId: sem.id, courseId: c2.id, finalGrade: 'O', gradePoint: 10, includedInGPA: true });
  const g = semesterGpa(state.courses, state.results, sem);
  assert.equal(g.sgpa, (4 * 8 + 2 * 10) / 6);
});

/* =============== v1.1 additions =============== */
test('calendar week view, timetable skip planner, course trend chart render', async () => {
  svc.loadSampleData();
  const cal = fakeRoot();
  views.calendar.render(cal);
  await cal.onclick({ target: { closest: () => ({ dataset: { action: 'mode', mode: 'week' } }) } });
  assert.match(cal.innerHTML, /class="week"/);
  assert.match(cal.innerHTML, /Week of/);
  assert.doesNotMatch(cal.innerHTML, BAD);
  await cal.onclick({ target: { closest: () => ({ dataset: { action: 'next' } }) } });   // navigates a week without error
  assert.match(cal.innerHTML, /class="week"/);
  await cal.onclick({ target: { closest: () => ({ dataset: { action: 'mode', mode: 'month' } }) } });

  const tt = fakeRoot();
  views.timetable.render(tt);
  const pending = state.occurrences.find((o) => o.status === 'pending' && o.date >= todayISO());
  tt.onchange({ target: { id: 'day-picker', value: pending.date } });
  assert.match(tt.innerHTML, /Skip planner/);
  assert.match(tt.innerHTML, /Safe to skip|Would cause shortage|do not skip/);
  assert.doesNotMatch(tt.innerHTML, BAD);

  const course = fakeRoot();
  views.courses.render(course, state.courses[0].id);
  assert.match(course.innerHTML, /Attendance trend/);
  assert.match(course.innerHTML, /<svg/);
  assert.match(course.innerHTML, /% required/);
});

test('history: suggested grades, accepting an estimate, what-if SGPA', async () => {
  svc.loadSampleData();
  const root = fakeRoot();
  const out = { innerHTML: '' };
  root.querySelector = (sel) => ({ '#nc': { value: '20' }, '#tgt': { value: '8' }, '#gpa-result': out })[sel];
  views.history.render(root);
  assert.match(root.innerHTML, /data-estimate/);
  assert.match(root.innerHTML, /What SGPA do I need/);
  const course = state.courses[0];
  await root.onclick({ target: { closest: (sel) => (sel === '[data-estimate]' ? { dataset: { estimate: course.id, label: 'A+' } } : null) } });
  const res = state.results.find((r) => r.courseId === course.id);
  assert.equal(res.finalGrade, 'A+');
  assert.equal(res.gradePoint, 9);
  assert.equal(res.estimated, true);
  const sem = activeSemester();
  assert.equal(semesterGpa(state.courses, state.results, sem).hasEstimate, true);
  assert.match(root.innerHTML, /est\./);
  root.onsubmit({ target: { id: 'gpa-calc' }, preventDefault() {} });
  assert.match(out.innerHTML, /SGPA|reachable|already meet/i);
  // choosing a grade manually clears the "estimated" flag
  await root.onchange({ target: { dataset: { grade: course.id }, value: 'A' } });
  assert.equal(state.results.find((r) => r.courseId === course.id).estimated, false);
});

test('reports page offers the new exports', () => {
  svc.loadSampleData();
  const root = fakeRoot();
  views.reports.render(root);
  assert.match(root.innerHTML, /\.ics/);
  assert.match(root.innerHTML, /full backup/i);
  assert.doesNotMatch(root.innerHTML, BAD);
});
