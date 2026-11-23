# StudentOS Questions

Use this to prepare. Read [ARCHITECTURE.md](ARCHITECTURE.md) and [CALCULATIONS.md](CALCULATIONS.md) first; this page tells you how to talk about them.

## 30-second pitch

> "StudentOS is a local-first academic manager for students. It tracks a semester's courses, a recurring timetable that generates dated classes automatically, daily attendance with a shortage predictor, weighted marks with a target calculator, assignments, a resource library, a calendar, a personal planner, and SGPA/CGPA with a configurable grading scheme. It is built in vanilla JavaScript with ES modules and IndexedDB, with no backend and no dependencies. The calculations are pure, unit-tested functions, and the app follows a layered architecture so the data layer, the logic and the UI are separate."

## 2-minute architecture walkthrough

1. **Layers:** views → services → state → storage, with pure `logic/` used by all. Logic has no DOM or storage, so it is tested with plain Node.
2. **State:** everything is loaded from IndexedDB once into memory; reads are synchronous, writes are write-through.
3. **Core idea:** store facts, derive numbers. Attendance is computed from per-class statuses; nothing like "total attended" is stored.
4. **Timetable:** a weekly *template* generates dated *occurrences*; each occurrence has its own status, so cancelling or shifting one class never rewrites the template or history.
5. **Quality:** 47 automated tests, including a brute-force check of the attendance formulas, plus CI on every push.
6. **Offline:** it is a PWA with a network-first service worker; all data stays in IndexedDB on the device.

## Demo script (3 minutes)

1. Load sample data → Dashboard (today's classes, warnings).
2. Mark a class Absent → watch the percentage and "can miss" change on the Timetable page.
3. Shift a class → show the original cancelled and a new class created, template untouched.
4. Exams & Marks → target calculator with a reachable and an impossible target.
5. Academic History → grade courses, show Provisional vs Final SGPA and CGPA.
6. Reports → download a backup, restore it (show validation).
7. Open DevTools → Application → IndexedDB to show where data lives.

---

## Likely questions and answers

### Architecture
**Why vanilla JS and no framework?**
The project goal was to understand the fundamentals and keep the code explainable. Layering and pure functions give most of what a framework would for an app this size. The logic, state, services and storage layers could be reused unchanged under React; only the views would be rewritten.

**How is the code organised?**
Five layers with one-way dependencies: views → services → state → storage, and everyone can use pure logic. Details in ARCHITECTURE.md section 1.

**Why in-memory state plus IndexedDB?**
Rendering stays synchronous and simple, and every write is persisted in the background. The trade-off is that all records must fit in memory, which is fine for one student's data. File blobs stay out of memory in a separate store.

**Why IndexedDB instead of LocalStorage?**
LocalStorage is ~5 MB, string-only and synchronous. IndexedDB holds structured records and binary file blobs with far larger capacity. LocalStorage is still used for tiny preferences like the theme, which must be read synchronously before first paint.

**How do pages avoid stacking duplicate event listeners when they re-render?**
Handlers are assigned with `root.onclick = ...`, which replaces the previous handler. They use event delegation (`closest('[data-action]')`), so one handler covers all buttons.

**How do you prevent XSS?**
Pages build HTML strings, so every user-typed value goes through `escapeHtml()` first. There is a test-checklist item that types `<b>bold</b>` as a course name.

### Data and correctness
**Template vs occurrence: why?**
A timetable entry is a recurring rule. Statuses (present, absent, cancelled) belong to specific dates, so each date is its own record. That is why a one-off cancellation or a shift does not alter the template, and why changing the timetable "from a date" does not rewrite the past (effective dates).

**How do you avoid duplicate generated classes?**
Identity is `course | date | startTime`. Generation skips existing keys, so running it repeatedly (the "Regenerate" button) is safe. Classes already marked are never deleted by a re-sync.

**Why store dates as strings?**
`new Date("2026-01-05")` parses as UTC and can display as the previous day in some time zones. ISO strings sort correctly with `<`, serialise cleanly and avoid timezone bugs.

**Why is `null` marks different from 0?**
0 is a real score; null means not graded. Treating them the same would silently lower a student's average.

**What happens to pending classes?**
They are excluded from the denominator and surfaced as "unmarked past classes". The app never guesses absent.

**How does deleting a course or semester work?**
The UI first shows counts of everything that would be deleted (`courseDependents`), then `deleteCourse` removes the dependents in one go. Nothing cascades silently.

**How is backup restore made safe?**
`validateBackup` checks the app name, version, that stores are lists of objects with ids, and that references point to existing records. The user then picks merge or replace. The default backup leaves attached files out (the UI says so); the full backup embeds them as base64.

### Calculations (be ready to derive these on a whiteboard)
**Attendance: how many classes can I miss?**
Need `100·A ≥ T·(C + x)`, so `x = floor((100·A − T·C) / T)`, clamped at 0. For 27/30 at 75% it is 6, and the 7th absence gives 27/37 = 72.97%.

**How many must I attend to recover?**
Need `100·(A+y) ≥ T·(C+y)`, so `y = ceil((T·C − 100·A)/(100 − T))`. For 20/30 at 75% it is 10. At T = 100 recovery is impossible.

**Why integers instead of percentages?**
Comparing rounded or floating-point percentages can pass or fail incorrectly at the boundary. `100·A ≥ T·C` is exact.

**Weighted marks?**
`(obtained / max) × weightage` summed over graded assessments. Completed and remaining weightage are tracked separately, and the target calculator reports "impossible" if the needed points exceed the remaining weightage.

**SGPA and CGPA?**
Credit-weighted averages of grade points. CGPA is **not** the mean of SGPAs: a 2-credit semester must weigh less than an 8-credit one (there is a test for exactly that). Provisional vs final is shown explicitly.

**Why is the grading scheme user-editable?**
Institutions use different scales and boundaries; hard-coding one would be wrong for most users.

### Features added in v1.1
**What is the skip planner and how is it computed?**
For a chosen date it takes each course's unmarked classes (n) and recomputes attendance as if all were absent: `A/(C+n)`. "Safe" is the integer test `100·A ≥ T·(C+n)`, so being exactly on the threshold counts as safe. It saves nothing.

**How are estimated grades produced, and why are they flagged?**
Weighted marks give a percentage (final if every assessment is graded and weightages total 100%, otherwise projected from what is graded). The scheme's minimum scores map it to a grade. An accepted estimate is stored with `estimated: true`, and SGPA is labelled *Estimated* (never *Final*) until the student picks the grade themselves.

**How does the "what SGPA do I need?" calculator work?**
`(target·(curCredits + nextCredits) − curPoints) / nextCredits`. If that exceeds the scheme's maximum points the target is reported as unreachable.

**How does offline mode work?**
A service worker caches static files with a network-first strategy (always fresh when online, cached when offline). It never touches IndexedDB, where the data lives.

### Testing and quality
**How did you test it?**
47 automated tests with Node's built-in runner: logic unit tests (including brute-force verification of the attendance formulas), integration tests for services and cascades, and a render test of every page against sample data. Browser-only behaviour (layout, IndexedDB persistence, dialogs) is covered by a manual checklist in TESTING.md.

**You said this was built with AI. What did you do?**
(Answer truthfully in your own words.) For example: "I wrote the product requirements and the architecture: the layers, the data model, the attendance and grading rules. I used an AI assistant to generate the implementation, then ran it, read the code, tested it manually and through the test suite, and I can explain every module." The honest, defensible version is the one that matches what you actually did, so make sure you have read `logic/`, `state.js` and `services.js`.

**What are the limitations?** (Answer honestly; it shows maturity.)
Data is per-browser with no sync; the data-only backup leaves files behind (the full backup includes them but can be large); notifications only work while the app is open; grade suggestions depend on the scheme's minimum scores and you confirm them yourself.

### Trade-offs and next steps
**What would you do differently or add next?**
- Background reminders via push notifications (needs a small server) and drag-and-drop rescheduling.
- Streaming/compressed full backups for very large attachments.
- An optional backend with auth for cross-device sync (not needed for v1).
- Port views to React or Web Components if the UI grows.

**How would you scale it to many users?**
It is intentionally single-user and local. For multiple users I would add a backend API and database behind the same `services` interface, keep `logic/` unchanged, and replace `storage.js`.

---

## Things you should be able to say without notes
- The five layers and the direction of dependencies.
- "Store facts, derive numbers."
- Template vs occurrence, and effective dates.
- The two attendance formulas and why they use integers.
- null vs 0 for marks, pending vs absent.
- CGPA is credit-weighted, not an average of SGPAs.
- Where data lives and what is *not* in the backup.
