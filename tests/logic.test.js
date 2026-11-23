// tests/logic.test.js - unit tests for the PURE logic modules. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tally, maxMissable, minToAttend, attendanceState, projection, courseAttendance } from '../js/logic/attendance.js';
import { generateOccurrences, validateEntry, validateOccurrence, entryApplies } from '../js/logic/timetable.js';
import { courseMarks, requiredMarks, validateAssessment } from '../js/logic/assessments.js';
import { semesterGpa, cumulativeGpa, parseGradeScheme, gradePointFor, DEFAULT_SCHEME } from '../js/logic/grades.js';
import { validateBackup } from '../js/logic/backup.js';
import { buildNotifications } from '../js/logic/notifications.js';
import { validateSemester, semesterProgress } from '../js/logic/semesters.js';
import { taskProgress } from '../js/logic/planner.js';
import { monthGrid, shiftMonth } from '../js/logic/calendar.js';
import { validateFile, filterResources } from '../js/logic/resources.js';
import { addDays, weekdayOf, isISODate, toCSV } from '../js/utils.js';

const occ = (status, date = '2026-01-05') => ({ status, date });

/* ---------------- attendance ---------------- */
test('tally: pending and cancelled are excluded from conducted', () => {
  const t = tally([occ('present'), occ('present'), occ('absent'), occ('pending'), occ('cancelled_holiday'), occ('cancelled_other')]);
  assert.deepEqual(t, { attended: 2, absent: 1, pending: 1, cancelled: 2, conducted: 3 });
});

test('blueprint example: 27/30 at 75% -> can miss 6, 7th drops below', () => {
  assert.equal(maxMissable(27, 30, 75), 6);
  assert.ok(100 * 27 >= 75 * (30 + 6));      // after 6 absences still OK
  assert.ok(100 * 27 < 75 * (30 + 7));       // after 7 absences below the threshold
  assert.equal(minToAttend(27, 30, 75), 0);
});

test('recovery: 20/30 at 75% needs 10 consecutive classes', () => {
  assert.equal(minToAttend(20, 30, 75), 10);
  assert.ok(100 * 30 >= 75 * 40);
  assert.ok(100 * 29 < 75 * 39);
});

test('exactly on the threshold counts as OK, with zero spare absences', () => {
  assert.equal(maxMissable(3, 4, 75), 0);
  assert.equal(attendanceState(3, 4, 75), 'close');
  assert.equal(attendanceState(2, 4, 75), 'shortage');
  assert.equal(attendanceState(27, 30, 75), 'ok');
  assert.equal(attendanceState(0, 0, 75), 'none');
});

test('edge cases: nothing conducted, 100% threshold, 0% threshold', () => {
  assert.equal(maxMissable(0, 0, 75), 0);
  assert.equal(minToAttend(0, 0, 75), 0);
  assert.equal(minToAttend(3, 4, 100), Infinity);
  assert.equal(maxMissable(4, 4, 100), 0);
  assert.equal(maxMissable(0, 5, 0), Infinity);
});

test('formulas agree with brute force for many (A, C, T)', () => {
  for (const T of [50, 60, 75, 80, 90]) {
    for (let C = 0; C <= 30; C++) {
      for (let A = 0; A <= C; A++) {
        let x = 0;
        while (100 * A >= T * (C + x + 1)) x++;
        const expectMiss = 100 * A >= T * C ? x : 0;
        assert.equal(maxMissable(A, C, T), expectMiss, `miss A=${A} C=${C} T=${T}`);
        let y = 0;
        while (100 * (A + y) < T * (C + y)) y++;
        assert.equal(minToAttend(A, C, T), y, `attend A=${A} C=${C} T=${T}`);
      }
    }
  }
});

test('projection and courseAttendance separate unmarked past from upcoming', () => {
  assert.equal(projection(0, 0, 0), null);
  const p = projection(8, 10, 10);
  assert.equal(p.ifAttendAll, 90);
  assert.equal(p.ifMissAll, 40);
  const a = courseAttendance([occ('present', '2026-01-05'), occ('pending', '2026-01-06'), occ('pending', '2026-01-20')], 75, '2026-01-10');
  assert.equal(a.unmarkedPast, 1);
  assert.equal(a.upcoming, 1);
  assert.equal(a.percent, 100);
});

/* ---------------- timetable generation ---------------- */
const sem = { id: 's1', name: 'Sem', startDate: '2026-01-05', endDate: '2026-02-01', workingDays: [1, 2, 3, 4, 5], holidays: [] };
const entry = { id: 'e1', courseId: 'c1', weekday: 1, startTime: '09:00', endTime: '10:00', venue: '', effectiveFrom: '', effectiveTo: '' };

test('generation: only the entry weekday, inside the semester', () => {
  assert.equal(weekdayOf('2026-01-05'), 1);
  const out = generateOccurrences(sem, entry, []);
  assert.deepEqual(out.map((o) => o.date), ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']);
  assert.ok(out.every((o) => o.status === 'pending' && o.kind === 'regular'));
});

test('generation skips holidays and is idempotent', () => {
  const withHoliday = { ...sem, holidays: [{ date: '2026-01-12', name: 'X' }] };
  const out = generateOccurrences(withHoliday, entry, []);
  assert.equal(out.length, 3);
  assert.equal(generateOccurrences(withHoliday, entry, out).length, 0);
});

test('generation respects effective dates and non-working days', () => {
  assert.equal(generateOccurrences(sem, { ...entry, effectiveFrom: '2026-01-19' }, []).length, 2);
  assert.equal(generateOccurrences(sem, { ...entry, effectiveTo: '2026-01-12' }, []).length, 2);
  assert.equal(generateOccurrences({ ...sem, workingDays: [2, 3] }, entry, []).length, 0);
  assert.equal(entryApplies({ effectiveFrom: '2026-01-10', effectiveTo: '' }, '2026-01-09'), false);
});

test('timetable validation', () => {
  assert.match(validateEntry({ ...entry, endTime: '08:00' }, sem), /End time/);
  assert.match(validateEntry({ ...entry, weekday: 0 }, sem), /working day/);
  assert.equal(validateEntry(entry, sem), null);
  const o = { courseId: 'c1', date: '2026-01-05', startTime: '09:00', endTime: '10:00' };
  assert.match(validateOccurrence(o, sem, [o]), /already exists/);
  assert.match(validateOccurrence({ ...o, date: '2027-01-01' }, sem, []), /inside the semester/);
  assert.equal(validateOccurrence({ ...o, startTime: '11:00', endTime: '12:00' }, sem, [o]), null);
});

/* ---------------- assessments ---------------- */
const A = (o) => ({ marksObtained: null, ...o });
const assessments = [
  A({ title: 'Quiz', maxMarks: 10, weightage: 10, marksObtained: 8 }),
  A({ title: 'Mid', maxMarks: 50, weightage: 30, marksObtained: 30 }),
  A({ title: 'End', maxMarks: 100, weightage: 60 }),
];

test('weighted marks', () => {
  const m = courseMarks(assessments);
  assert.equal(m.earned, 26);                 // 8/10*10 + 30/50*30
  assert.equal(m.completedWeight, 40);
  assert.equal(m.remainingWeight, 60);
  assert.equal(m.isComplete, true);
  assert.equal(courseMarks([A({ maxMarks: 10, weightage: 50 })]).isComplete, false);
  assert.equal(courseMarks([]).percentOfCompleted, null);
});

test('a 0 mark is graded, an empty mark is not', () => {
  assert.equal(courseMarks([A({ maxMarks: 10, weightage: 10, marksObtained: 0 })]).completedWeight, 10);
  assert.equal(courseMarks([A({ maxMarks: 10, weightage: 10 })]).completedWeight, 0);
});

test('required marks: possible, achieved, impossible', () => {
  const ok = requiredMarks(assessments, 75);
  assert.equal(ok.status, 'possible');
  assert.ok(Math.abs(ok.perAssessment[0].marksNeeded - 81.67) < 0.01);
  assert.equal(requiredMarks(assessments, 20).status, 'achieved');
  const no = requiredMarks(assessments, 95);
  assert.equal(no.status, 'impossible');
  assert.equal(no.maxPossible, 86);
  const done = requiredMarks(assessments.map((a) => ({ ...a, marksObtained: 5 })), 99);
  assert.equal(done.status, 'impossible');
});

test('assessment validation', () => {
  assert.match(validateAssessment({ maxMarks: 0, weightage: 10 }, []), /greater than 0/);
  assert.match(validateAssessment({ maxMarks: 10, weightage: 10, marksObtained: 11 }, []), /exceed/);
  assert.match(validateAssessment({ maxMarks: 10, weightage: 50 }, assessments), /exceed 100/);
  assert.equal(validateAssessment({ maxMarks: 10, weightage: 10, marksObtained: 10 }, []), null);
});

/* ---------------- grades ---------------- */
test('SGPA = sum(credits*points)/sum(credits)', () => {
  const courses = [{ id: 'a', credits: 4 }, { id: 'b', credits: 3 }, { id: 'c', credits: 3 }];
  const results = [{ courseId: 'a', gradePoint: 9 }, { courseId: 'b', gradePoint: 8 }, { courseId: 'c', gradePoint: 10 }];
  const g = semesterGpa(courses, results, { finalized: true });
  assert.equal(g.sgpa, 9);
  assert.equal(g.isFinal, true);
});

test('SGPA excludes ungraded and excluded courses, and is only provisional then', () => {
  const courses = [{ id: 'a', credits: 4 }, { id: 'b', credits: 3 }, { id: 'c', credits: 3 }];
  const g1 = semesterGpa(courses, [{ courseId: 'a', gradePoint: 10 }], { finalized: true });
  assert.equal(g1.sgpa, 10);
  assert.equal(g1.missing, 2);
  assert.equal(g1.isFinal, false);
  const g2 = semesterGpa(courses, [{ courseId: 'a', gradePoint: 10 }, { courseId: 'b', gradePoint: 4, includedInGPA: false }, { courseId: 'c', gradePoint: 8 }], { finalized: true });
  assert.equal(g2.sgpa, (40 + 24) / 7);
  assert.equal(g2.missing, 0);
  assert.equal(semesterGpa([], [], {}).sgpa, null);
});

test('CGPA is credit-weighted, not the average of SGPAs', () => {
  const s1 = semesterGpa([{ id: 'a', credits: 2 }], [{ courseId: 'a', gradePoint: 10 }], { finalized: true });
  const s2 = semesterGpa([{ id: 'b', credits: 8 }], [{ courseId: 'b', gradePoint: 5 }], { finalized: false });
  const c = cumulativeGpa([s1, s2]);
  assert.equal(c.cgpa, (20 + 40) / 10);
  assert.notEqual(c.cgpa, (10 + 5) / 2);
  assert.equal(c.allFinal, false);
  assert.equal(cumulativeGpa([]).cgpa, null);
});

test('grade scheme parsing', () => {
  const ok = parseGradeScheme('A, 9, 80\nB, 8\n\nF, 0, 0');
  assert.equal(ok.grades.length, 3);
  assert.equal(ok.grades[1].minScore, null);
  assert.match(parseGradeScheme('A, x').error, /Line 1/);
  assert.match(parseGradeScheme('A, 9\nA, 8').error, /twice/);
  assert.match(parseGradeScheme('  ').error, /at least one/);
  assert.equal(gradePointFor(DEFAULT_SCHEME, 'A+'), 9);
  assert.equal(gradePointFor(DEFAULT_SCHEME, 'Z'), null);
});

/* ---------------- semesters, planner, calendar, resources, utils ---------------- */
test('semester validation blocks overlap and bad dates', () => {
  const base = { name: 'S', startDate: '2026-01-01', endDate: '2026-05-01', workingDays: [1] };
  assert.equal(validateSemester(base, []), null);
  assert.match(validateSemester({ ...base, endDate: '2026-01-01' }, []), /after/);
  assert.match(validateSemester(base, [{ name: 'Old', startDate: '2026-04-01', endDate: '2026-08-01' }]), /overlap/);
  assert.match(validateSemester({ ...base, workingDays: [] }, []), /working day/);
  assert.equal(semesterProgress({ startDate: '2026-01-01', endDate: '2026-01-10' }, '2025-12-01').percent, 0);
  assert.equal(semesterProgress({ startDate: '2026-01-01', endDate: '2026-01-10' }, '2026-02-01').percent, 100);
});

test('planner progress, calendar grid, resources, utils', () => {
  const p = taskProgress([{ targetDate: '2026-01-05', status: 'done' }, { targetDate: '2026-01-06', status: 'todo' }, { targetDate: '2026-02-01', status: 'todo' }], '2026-01-05', '2026-01-11');
  assert.deepEqual([p.done, p.total, p.percent], [1, 2, 50]);
  const grid = monthGrid('2026-01');
  assert.equal(grid.length, 42);
  assert.equal(weekdayOf(grid[0]), 1);
  assert.ok(grid.includes('2026-01-31'));
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.match(validateFile({ name: 'x.exe', size: 5 }), /not supported/);
  assert.match(validateFile({ name: 'x.pdf', size: 11 * 1048576 }), /10 MB/);
  assert.equal(validateFile({ name: 'x.PDF', size: 5 }), null);
  assert.equal(filterResources([{ title: 'SQL', topic: 'Unit 1', resourceType: 'link', courseId: 'a' }, { title: 'OS', topic: '', resourceType: 'note', courseId: 'b' }], { q: 'unit' }).length, 1);
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(isISODate('2026-02-30'), false);
  assert.equal(toCSV([['a', 'b,c', 'd"e']]), 'a,"b,c","d""e"');
});

/* ---------------- backup + notifications ---------------- */
test('backup validation', () => {
  const stores = ['semesters', 'courses', 'occurrences'];
  assert.equal(validateBackup(null, stores).ok, false);
  assert.equal(validateBackup({ app: 'Other', version: 1, data: {} }, stores).ok, false);
  assert.equal(validateBackup({ app: 'StudentOS', version: 99, data: {} }, stores).ok, false);
  assert.equal(validateBackup({ app: 'StudentOS', version: 1, data: { courses: 'x' } }, stores).ok, false);
  assert.equal(validateBackup({ app: 'StudentOS', version: 1, data: { semesters: [{ id: 's' }], courses: [{ id: 'c', semesterId: 's' }] } }, stores).ok, true);
  const orphan = validateBackup({ app: 'StudentOS', version: 1, data: { courses: [{ id: 'c', semesterId: 'missing' }] } }, stores);
  assert.equal(orphan.ok, false);
  assert.match(orphan.errors[0], /missing/);
});

test('notifications are derived from data', () => {
  const state = {
    courses: [{ id: 'c1', semesterId: 's1', name: 'DBMS' }],
    occurrences: [{ courseId: 'c1', status: 'absent', date: '2026-01-05' }, { courseId: 'c1', status: 'absent', date: '2026-01-06' }, { courseId: 'c1', status: 'pending', date: '2026-01-12' }],
    deadlines: [{ id: 'd1', courseId: 'c1', title: 'Lab', dueDate: '2026-01-08', progressStatus: 'Not started' }, { id: 'd2', courseId: 'c1', title: 'Done', dueDate: '2026-01-01', progressStatus: 'Submitted' }],
    assessments: [{ id: 'a1', courseId: 'c1', title: 'Mid', status: 'Upcoming', date: '2026-01-11' }],
    tasks: [{ id: 't1', title: 'Revise', status: 'todo', targetDate: '2026-01-09' }],
    events: [{ id: 'e1', title: 'Club', date: '2026-01-11', reminderDays: 3 }, { id: 'e2', title: 'Quiet', date: '2026-01-11', reminderDays: null }],
  };
  const list = buildNotifications({ state, settings: { attendanceThreshold: 75, deadlineSoonDays: 3 }, semesterId: 's1', today: '2026-01-10' });
  const ids = list.map((n) => n.id);
  assert.ok(ids.includes('deadline:d1:overdue'));
  assert.ok(!ids.some((i) => i.startsWith('deadline:d2')), 'submitted items are not alerted');
  assert.ok(ids.includes('exam:a1'));
  assert.ok(ids.includes('attendance:c1:shortage'));
  assert.ok(ids.includes('unmarked:c1') === false, 'pending today/future is not "unmarked past"');
  assert.ok(ids.includes('task:t1'));
  assert.ok(ids.includes('event:e1'));
  assert.ok(!ids.includes('event:e2'));
  assert.equal(list[0].severity, 'high');
});

/* =============== v1.1 additions =============== */
import { skipImpact, attendanceTrend } from '../js/logic/attendance.js';
import { estimatedPercent } from '../js/logic/assessments.js';
import { estimateGrade, requiredSgpa } from '../js/logic/grades.js';
import { buildICS } from '../js/logic/ics.js';
import { buildBackup } from '../js/logic/backup.js';
import { blobToBase64, base64ToBlob } from '../js/utils.js';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const mk = (status, date) => ({ status, date, courseId: 'c1', startTime: '09:00' });

test('skip planner: what if I skip the unmarked classes on a date', () => {
  const marked = [...Array(9).fill(0).map((_, i) => mk('present', `2026-01-${String(i + 1).padStart(2, '0')}`)), mk('absent', '2026-01-10')];
  const two = [...marked, mk('pending', '2026-01-12'), mk('pending', '2026-01-12')];
  const k = skipImpact(two, '2026-01-12', 75);
  assert.equal(k.n, 2);
  assert.equal(k.nowPercent, 90);
  assert.equal(k.ifSkipPercent, 75);          // 9/12, exactly on the threshold
  assert.equal(k.safe, true);                 // integer-safe: 900 >= 75*12
  assert.equal(k.ifAttendPercent, (11 / 12) * 100);
  const three = [...two, mk('pending', '2026-01-12')];
  assert.equal(skipImpact(three, '2026-01-12', 75).safe, false);   // 9/13 < 75%
  assert.equal(skipImpact(marked, '2026-01-12', 75).n, 0);         // nothing unmarked that day
});

test('attendance trend is cumulative per week and ignores pending/cancelled', () => {
  const occs = [mk('present', '2026-01-05'), mk('absent', '2026-01-06'), mk('present', '2026-01-12'), mk('present', '2026-01-13'),
    mk('pending', '2026-01-19'), mk('cancelled_other', '2026-01-20')];
  const t = attendanceTrend(occs);
  assert.equal(t.length, 2);
  assert.equal(t[0].value, 50);               // week 1: 1/2
  assert.equal(t[1].value, 75);               // cumulative: 3/4
  assert.deepEqual(attendanceTrend([]), []);
});

test('estimated percent and estimated grade', () => {
  const part = [A({ maxMarks: 10, weightage: 10, marksObtained: 8 }), A({ maxMarks: 50, weightage: 90 })];
  assert.deepEqual(estimatedPercent(part), { percent: 80, basis: 'projected' });
  const full = [A({ maxMarks: 10, weightage: 40, marksObtained: 5 }), A({ maxMarks: 10, weightage: 60, marksObtained: 10 })];
  assert.deepEqual(estimatedPercent(full), { percent: 80, basis: 'final' });
  assert.deepEqual(estimatedPercent([A({ maxMarks: 10, weightage: 100 })]), { percent: null, basis: null });
  assert.equal(estimateGrade(DEFAULT_SCHEME, 85).label, 'A+');
  assert.equal(estimateGrade(DEFAULT_SCHEME, 90).label, 'O');
  assert.equal(estimateGrade(DEFAULT_SCHEME, 89.99).label, 'A+');
  assert.equal(estimateGrade(DEFAULT_SCHEME, 12).label, 'F');
  assert.equal(estimateGrade({ grades: [{ label: 'A', points: 9, minScore: null }] }, 99), null);   // no boundaries configured
  assert.equal(estimateGrade(DEFAULT_SCHEME, null), null);
});

test('an estimated grade keeps SGPA provisional even when the semester is marked final', () => {
  const courses = [{ id: 'a', credits: 4 }];
  const g = semesterGpa(courses, [{ courseId: 'a', gradePoint: 9, estimated: true }], { finalized: true });
  assert.equal(g.hasEstimate, true);
  assert.equal(g.isFinal, false);
  assert.equal(semesterGpa(courses, [{ courseId: 'a', gradePoint: 9, estimated: false }], { finalized: true }).isFinal, true);
});

test('required SGPA for a target CGPA', () => {
  const base = { currentPoints: 160, currentCredits: 20, nextCredits: 20, maxPoints: 10 };   // CGPA 8.0 so far
  assert.equal(requiredSgpa({ ...base, targetCgpa: 9 }).required, 10);
  assert.equal(requiredSgpa({ ...base, targetCgpa: 9 }).status, 'possible');
  assert.equal(requiredSgpa({ ...base, targetCgpa: 9.5 }).status, 'impossible');
  assert.equal(requiredSgpa({ ...base, targetCgpa: 7 }).required, 6);
  assert.equal(requiredSgpa({ ...base, targetCgpa: 3 }).status, 'met');
  assert.equal(requiredSgpa({ ...base, nextCredits: 0, targetCgpa: 9 }).status, 'invalid');
});

test('iCalendar export: structure, all-day vs timed, escaping, folding', () => {
  const ics = buildICS([
    { date: '2026-01-05', time: '09:00', endTime: '10:00', title: 'Math, Lab; Room 2', sub: 'Class', category: 'class' },
    { date: '2026-01-06', time: '', title: 'Assignment due', sub: 'Assignment due', category: 'deadline' },
    { date: '2026-01-07', time: '23:30', title: 'x'.repeat(200), sub: '', category: 'personal' },
  ], { calName: 'Sem 1', now: new Date('2026-01-01T00:00:00Z') });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTAMP:20260101T000000Z'));
  assert.ok(ics.includes('DTSTART:20260105T090000\r\nDTEND:20260105T100000'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20260106\r\nDTEND;VALUE=DATE:20260107'));
  assert.ok(ics.includes('SUMMARY:Math\\, Lab\\; Room 2'));
  assert.ok(ics.includes('DTSTART:20260107T233000\r\nDTEND:20260107T235900'), 'end is capped at the same day');
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.ok(ics.split('\r\n').every((l) => l.length <= 75), 'every line is folded to 75 characters');
});

test('full backup: includes files, validates the files section', () => {
  const state = { semesters: [], courses: [] };
  const b = buildBackup(state, { attendanceThreshold: 75, deadlineSoonDays: 3 }, [{ id: 'f1', name: 'a.pdf', type: 'application/pdf', size: 3, data: 'AAEC' }]);
  assert.equal(b.includesFiles, true);
  assert.equal(validateBackup(b, ['semesters', 'courses']).ok, true);
  assert.equal(validateBackup(b, ['semesters', 'courses']).counts.files, 1);
  assert.equal(validateBackup({ ...b, files: [{ id: 'f1' }] }, ['semesters', 'courses']).ok, false);
  assert.equal(buildBackup(state, { attendanceThreshold: 75, deadlineSoonDays: 3 }).includesFiles, false);
});

test('base64 round trip keeps every byte (large binary file)', async () => {
  const bytes = Uint8Array.from({ length: 200000 }, (_, i) => i % 256);
  const blob = base64ToBlob(await blobToBase64(new Blob([bytes])), 'application/pdf');
  assert.equal(blob.type, 'application/pdf');
  const back = new Uint8Array(await blob.arrayBuffer());
  assert.equal(back.length, bytes.length);
  assert.ok(back.every((v, i) => v === bytes[i]));
});

test('PWA files are consistent: precache lists every script, manifest and icons exist', () => {
  const sw = readFileSync('sw.js', 'utf8');
  const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  for (const f of walk('js').filter((x) => x.endsWith('.js'))) assert.ok(sw.includes(`"${f.replaceAll('\\', '/')}"`), `${f} missing from sw.js PRECACHE`);
  const manifest = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert.ok(existsSync(icon.src), `${icon.src} is missing`);
  assert.ok(readFileSync('index.html', 'utf8').includes('rel="manifest"'));
});
