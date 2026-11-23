# StudentOS Architecture

This document explains how the code is organised, how data flows, and why the main design choices were made. If you can explain this page, you can defend the project.

---

## 1. The big picture

```
┌────────────────────────────── Browser ──────────────────────────────┐
│                                                                      │
│   index.html + style.css                                             │
│        │                                                             │
│        ▼                                                             │
│   js/app.js  ── router, nav, theme, semester dropdown                │
│        │                                                             │
│        ▼                                                             │
│   js/views/*      13 pages: build HTML strings, attach click handlers│
│        │   uses                                                      │
│        ├────────────► js/ui.js, js/components.js  (shared UI)        │
│        │                                                             │
│        ▼  changes data via                                           │
│   js/services.js   multi-record operations + integrity rules         │
│        │                                                             │
│        ▼                                                             │
│   js/state.js      in-memory data, selectors, save()/remove()        │
│        │                         │                                   │
│        │ reads                   │ writes through                    │
│        ▼                         ▼                                   │
│   js/logic/*  (PURE)       js/storage.js  ──►  IndexedDB             │
│   calculations only                              LocalStorage        │
└──────────────────────────────────────────────────────────────────────┘
```

### The five layers and their rules

| Layer | Files | Rule |
|---|---|---|
| **Logic** | `js/logic/*.js`, `js/utils.js` | Pure functions: data in, result out. **No DOM, no storage, no global state.** This is where attendance, marks, SGPA/CGPA and timetable generation live. |
| **Storage** | `js/storage.js` | The **only** file that touches IndexedDB. Everything else is unaware that IndexedDB exists. |
| **State** | `js/state.js` | Holds all records in memory, loads them at startup, writes changes through to storage. Provides selectors and cascading deletes. |
| **Services** | `js/services.js` | Operations that change **more than one** kind of record or enforce integrity rules (generating class occurrences, holidays, shifting a class, file attachments, sample data). |
| **Views** | `js/views/*.js`, `js/ui.js`, `js/components.js` | Turn data into HTML and handle clicks. Never contain calculations; they call `logic/`. |

The dependency direction is one-way: views → services → state → storage, and everyone may use logic. Logic never imports from the layers above it. That is what makes it unit-testable without a browser.

---

## 2. Startup sequence

1. `index.html` runs a tiny inline script that sets `data-theme` **before first paint**, so a dark-theme user never sees a white flash. (It is not a module on purpose: modules are deferred and would run too late.)
2. `app.js` runs `loadSettings()` (LocalStorage), registers a storage-error handler that shows a toast, and builds the sidebar from the route table.
3. `initState()` reads **every** IndexedDB store once into the in-memory `state` object. It then makes sure an active semester and a grading scheme exist.
4. The router renders the page for `location.hash`.
5. A 60-second timer checks for browser notifications and refreshes the unread badge.

If IndexedDB is blocked (some private-browsing modes), the app shows a clear "Storage unavailable" message instead of failing silently.

---

## 3. In-memory state with write-through persistence

All records are loaded into `state` once:

```js
state = { semesters: [...], courses: [...], occurrences: [...], assessments: [...], ... }
```

- **Reads** are synchronous array operations (`state.courses.filter(...)`), so rendering code needs no `async/await`.
- **Writes** go through `save(store, record)` / `remove(store, id)`. They update `state` first, then write to IndexedDB in the background. A failure (e.g. quota exceeded) is reported to the user via a toast instead of being lost silently.

**Trade-off:** all data must fit in memory. For one student's records (thousands of small objects) that is trivial. File blobs are *not* in memory: they stay in a separate IndexedDB `files` store and are read on demand.

---

## 4. Data model

```
Semester ──< Course ──< TimetableEntry   (weekly TEMPLATE)
    │          │   │
    │          │   └──< ClassOccurrence  (one DATED class, has its own status)
    │          ├──< Assessment            (exam/quiz, marks, weightage)
    │          ├──< DeadlineItem          (assignment/project/demo/viva)
    │          ├──< Resource ──fileId──►  IndexedDB "files" blob store
    │          └──── CourseResult         (final grade, counts in GPA?)
    └──< Event (semesterId optional)

Global: Settings (LocalStorage), GradeScheme, PersonalTask, notifState (read flags only)
```

| Entity | Key fields |
|---|---|
| Semester | `id, name, startDate, endDate, workingDays[], holidays[{date,name}], finalized, includeInCGPA` |
| Course | `id, semesterId, name, code, credits, faculty, venue, attendanceThreshold (null = use default)` |
| TimetableEntry | `id, semesterId, courseId, weekday, startTime, endTime, venue, faculty, effectiveFrom, effectiveTo` |
| ClassOccurrence | `id, semesterId, courseId, timetableEntryId (null for extra/shifted), date, startTime, endTime, status, reason, kind` |
| Assessment | `id, courseId, title, type, maxMarks, weightage, date, status, marksObtained (null until graded), notes` |
| DeadlineItem | `id, courseId, type, title, dueDate, dueTime, priority, progressStatus, score, scoreMax, relatedAssessmentId, history[]` |
| Resource | `id, courseId, resourceType (file/link/note), title, topic, url / text / fileId, relatedTo` |
| Event | `id, semesterId (optional), title, category, date, startTime, endTime, location, reminderDays` |
| PersonalTask | `id, title, list, targetDate, priority, status, notes` |
| GradeScheme | `id, name, grades[{label, points, minScore}]` |
| CourseResult | `id, semesterId, courseId, finalGrade, gradePoint, includedInGPA` |

Conventions:
- IDs are `crypto.randomUUID()` strings, never array positions.
- Dates are `"YYYY-MM-DD"` and times `"HH:MM"` strings (see decision D3).
- Every course belongs to a semester; every other course-level record carries a `courseId`.

---

## 5. Key design decisions (and the reasoning)

### D1. Store facts, derive numbers
Nothing like "total attended" or "SGPA" is ever stored. Attendance is computed from `ClassOccurrence.status` every time; marks are computed from `Assessment` records; notifications are recomputed from data. **Benefit:** there is one source of truth, so numbers can never disagree between the dashboard, the course page and the reports. **Cost:** recomputation on every render, which is negligible at this data size.

### D2. Template vs occurrence (timetable)
A `TimetableEntry` is a weekly *template*. `generateOccurrences()` expands it into dated `ClassOccurrence` rows for the semester. Each occurrence has its own status, so:
- cancelling one date changes only that row, never the template;
- a shifted class = cancel the original + create a separate occurrence;
- a timetable change "from a date onward" closes the old template the day before and starts a new one (effective dates), so past classes are never rewritten.

`syncOccurrences()` keeps occurrences consistent: it **prunes** unmarked regular occurrences that no longer belong, and **generates** missing ones. It is idempotent (duplicates are impossible because `course|date|startTime` is the identity) and **never deletes an occurrence the student already marked**.

### D3. Dates as strings
`new Date("2026-01-05")` is parsed as UTC midnight, which can render as the previous day in some timezones. ISO strings sort correctly with plain `<`/`>`, survive JSON and IndexedDB, and are compared by `localeCompare`. Helper functions in `utils.js` convert to/from `Date` using **local** time only when arithmetic is needed.

### D4. Integer-safe attendance maths
Percentages are for display only. Decisions use integers: `100*A >= T*C`. This avoids floating-point surprises (e.g. 74.999 displayed as 75). See [CALCULATIONS.md](CALCULATIONS.md).

### D5. Missing marks are `null`, not `0`
A mark of 0 is a real score; an empty mark means "not graded yet". The two must never be conflated, or a student's average silently drops.

### D6. Pending is not absent
Unmarked classes are excluded from the denominator until the student records a decision. The app highlights unmarked *past* classes instead of guessing.

### D7. Delete with confirmation, never silently cascade
`courseDependents()` / `semesterDependents()` count what would be deleted; the UI shows those counts in a confirmation dialog before `deleteCourse()` / `deleteSemester()` run.

### D8. Generic form builder
`openForm({ fields, validate, onSubmit })` builds a labelled, validated modal form from a field list. It removes hundreds of lines of repeated form HTML and gives consistent accessibility (labels, hints, `role="alert"` errors). An `onSubmit` that throws shows its message in the form instead of closing it, which is how service-layer validation errors reach the user.

### D9. Event handling by property assignment
Views set `root.onclick = ...` after rendering. Assigning a property **replaces** the previous handler, so re-rendering can never stack duplicate listeners. Handlers use event delegation (`e.target.closest('[data-action]')`), so one handler covers every button in the page.

### D10. Escape everything the user typed
Pages build HTML strings, so every user-provided value passes through `escapeHtml()` before being inserted. Otherwise a course named `<img onerror=...>` would execute code (XSS).

### D11. Derived notifications
Alerts are rebuilt from data by `buildNotifications()`; only a `read` / `notified` flag is stored, keyed by a deterministic id such as `deadline:<id>:overdue`.

### D12. Backup validation before touching data
`validateBackup()` checks the app name, version, that every store is a list of objects with ids, and that references point at records that exist in the backup. Only then does the user choose **merge** or **replace**. In-memory state is updated first, then written to IndexedDB.

---

## 6. How a typical action flows

**Marking a class "Present" on the dashboard**

1. `dashboard.js` rendered a button with `data-action="mark" data-status="present" data-id="…"`.
2. The click bubbles to `root.onclick`, which calls `handleClassAction()` in `components.js`.
3. That calls `services.markOccurrence(id, 'present')`, which calls `state.save('occurrences', {...})`.
4. `save()` updates the in-memory array and writes to IndexedDB in the background.
5. `emitChange()` fires `studentos:changed` (the header refreshes its notification badge) and the view re-renders itself.
6. During re-render, `courseAttendance()` (pure logic) recomputes the percentage from the occurrences. No total was stored anywhere.

**Adding a weekly slot**

`timetable.js` form → `services.saveTimetableEntry()` → `validateEntry()` (logic) → `save('timetable')` → `syncOccurrences()` → `generateOccurrences()` (logic) → `save('occurrences')` for each new dated class → page re-renders.

---

## 7. Module reference

### Logic (`js/logic/`)
| Module | Responsibility |
|---|---|
| `attendance.js` | Status constants, `tally`, `maxMissable`, `minToAttend`, `attendanceState`, `projection`, `courseAttendance` |
| `timetable.js` | `generateOccurrences`, `entryApplies`, `occurrenceKey`, entry/occurrence validation |
| `assessments.js` | `courseMarks`, `requiredMarks`, `validateAssessment`, assessment types |
| `grades.js` | `semesterGpa`, `cumulativeGpa`, grade-scheme parsing, default sample scheme |
| `deadlines.js` | Types, progress statuses, overdue/soon state, due labels |
| `semesters.js` | Semester/holiday validation (overlap blocking), progress |
| `planner.js` | Weekly range, task progress, overdue test |
| `calendar.js` | `collectItems`, `monthGrid`, `shiftMonth` |
| `notifications.js` | `buildNotifications` (derived alerts) |
| `backup.js` | `buildBackup`, `validateBackup` |
| `reports.js` | Row builders for CSV / printable report |
| `ics.js` | `buildICS`: iCalendar export (timed and all-day events, escaping, line folding) |
| `resources.js` | File validation (type/size), resource filtering |

### Infrastructure
| Module | Responsibility |
|---|---|
| `storage.js` | IndexedDB open/upgrade, `getAll/putRecord/deleteRecord/putMany/clearStore`, file blobs, error reporting |
| `state.js` | `state`, `settings`, `save/remove/removeWhere`, selectors, `thresholdFor`, cascades, restore/wipe |
| `services.js` | `syncOccurrences`, semesters/holidays, timetable changes, occurrence actions, file attachments, sample data |
| `ui.js` | `toast`, `openForm`, `confirmDialog`, `emptyState`, `lineChartSvg` |
| `components.js` | `classRowHtml`, `handleClassAction`, attendance badge, course options |
| `utils.js` | Date helpers, `escapeHtml`, `uid`, formatting, CSV, downloads |
| `app.js` | Route table, navigation, theme, semester switcher, startup |

---

## 8. Storage details

| What | Where | Why |
|---|---|---|
| All records (semesters, courses, occurrences, …) | IndexedDB, one object store per type, key `id` | Structured, large capacity |
| Attachment blobs | IndexedDB `files` store | Binary data does not belong in LocalStorage |
| Preferences (threshold, soon-days, active semester, grading scheme id) | LocalStorage `studentos.settings` | Small and needed synchronously |
| Theme | LocalStorage `studentos.theme` | Read by the inline script before first paint |

Browser storage limits apply and the browser may evict data under storage pressure. Settings → "Ask the browser to keep my data" requests persistent storage, and Reports → Download backup is the real safety net.

---

## 9. Offline support (PWA)

`manifest.webmanifest` + `icons/` make the app installable. `sw.js` is a service worker with a **network-first** strategy for same-origin GET requests: online you always get the newest files; offline it serves the cached copies and falls back to `index.html`. It never touches IndexedDB, so user data is independent of caching. A test checks that every script is listed in the precache list and that the manifest's icons exist. Bump `CACHE_VERSION` in `sw.js` to discard old caches.

## 10. Extending the project

| To add… | Do this |
|---|---|
| A new page | Create `js/views/foo.js` exporting `render(root)`, import it in `app.js`, add one object to the `routes` array. |
| A new record type | Add its store name to `RECORD_STORES` in `storage.js` (bump `DB_VERSION`); `state.js` picks it up automatically. |
| A new calculation | Add a pure function in `js/logic/`, write a unit test, call it from a view. |
| A React port | Keep `logic/`, `state.js`, `services.js`, `storage.js`. Rewrite `views/` and `ui.js` as components. |
