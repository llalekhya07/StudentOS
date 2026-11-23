# StudentOS Testing

## 1. Automated tests

```bash
npm test        # node --test, 47 tests, no dependencies
```

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs the same command on Node 20 and 22 for every push.

| File | What it covers |
|---|---|
| `tests/logic.test.js` | Pure logic: attendance maths (including a **brute-force check** of both shortage formulas), timetable generation (weekday, holidays, effective dates, idempotence), weighted marks, the required-marks calculator (possible / achieved / impossible), SGPA and CGPA (credit-weighted, excluded and ungraded courses, provisional vs final), grade-scheme parsing, semester overlap validation, planner progress, calendar grid, file validation, backup validation, derived notifications. |
| `tests/app.test.js` | Integration: sample data generation, holiday cancellation, shifting, extra classes, duplicate prevention, changing a slot from a date, deleting slots, editing semester dates, cascading deletes with dependent counts, backup merge/replace, click handlers, and that **every page renders** (with and without data) without `undefined`, `NaN` or `[object` leaking into the HTML. |

### What the automated tests do NOT prove
They run in Node with a stubbed DOM and **no IndexedDB**, so they verify logic, data flow and the HTML that pages generate. They do **not** verify real browser behaviour: layout and responsiveness, dialogs, focus handling, IndexedDB persistence across reloads, file upload/download, the print dialog, or browser notifications. Use the checklist below for those.

---

## 2. Manual browser checklist

Start the app (`npm start`) and open <http://localhost:5173>. Use a normal (not private) window.

### A. Shell and navigation
- [ ] Every sidebar item opens its page; the title, tab title and highlighted link match.
- [ ] Back/forward buttons work. Reloading on `#/courses` stays on Courses. An unknown hash falls back to the Dashboard.
- [ ] Theme toggle switches light/dark and survives a reload (no white flash).
- [ ] Below ~860 px wide: sidebar becomes a drawer; it closes on link click, scrim click and Esc.
- [ ] Tab key: first stop is "Skip to content"; every control shows a focus ring.

### B. Persistence (IndexedDB)
- [ ] Click **Load sample data**, reload the page: everything is still there.
- [ ] Mark a class Present, reload: it is still Present.
- [ ] DevTools → Application → IndexedDB → `studentos` shows the object stores.

### C. Blueprint acceptance checklist

| # | Requirement | How to check |
|---|---|---|
| 1 | Create a semester with dates, working days, holidays | My Semesters → New semester; add a holiday. |
| 2 | Add courses with credits and a per-course attendance requirement | Courses → Add course (set requirement 80). |
| 3 | Timetable generates dated classes only inside the semester | Add a weekly slot; check the day view on the first/last date and just outside. |
| 4 | One-off cancellation leaves the template alone; cancelled excluded | Mark one class Cancelled; the weekly timetable is unchanged and the conducted count does not include it. |
| 5 | Shifted/extra class is a separate occurrence | Use **Shift** and **Add extra class**; the original is Cancelled, a new class exists. |
| 6 | Daily view lists classes with Present/Absent/Cancelled | Timetable & Attendance → pick a date. |
| 7 | Unmarked stays pending | Leave a past class unmarked; it appears under "Unmarked past classes" and is not counted. |
| 8 | Percentage and predictions update after each change | Mark Present/Absent and watch "Can miss" and "Must attend" change. |
| 9 | Per-course assessments with marks and weightage | Exams & Marks → add assessments. |
| 10 | Weighted marks; incomplete and impossible targets handled | Total ≠ 100 shows a banner; use target 95+ to see "Not reachable". |
| 11 | Assignments with 3 statuses | Assignments & Projects → change the Progress dropdown. |
| 12 | Files, links, notes; files survive reload | Resources → add a small PDF, reload, Open and Download it. |
| 13 | Academic and personal events in one calendar | Calendar → add an event; filter categories. |
| 14 | Personal tasks separate from submissions | Personal Planner → add a task; it does not appear in Assignments. |
| 15 | Custom grading gives correct SGPA/CGPA | Settings → edit scheme; Academic History → grade courses and compare with a hand calculation. |
| 16 | Semesters stay separate and revisitable | Create a second semester; switch with the top-bar dropdown. |
| 17 | CSV/PDF exports correct; JSON restore safe | Reports → export CSV, print to PDF, download a backup, then restore it (try Merge and Replace). Try restoring a random JSON file: it must be rejected with a message. |
| 18 | Responsive, validated forms, empty/error states | Submit forms with missing/invalid values; view each page with no data. |

### D. Edge cases worth trying
- [ ] Create a semester whose dates overlap another: it must be rejected.
- [ ] Add a holiday on a day that has an unmarked class: that class becomes "Cancelled - Holiday".
- [ ] Edit a weekly slot with "Apply this change from" a future date: earlier classes keep the old time.
- [ ] Set attendance requirement to 100 and mark one Absent: the app must say recovery is impossible instead of showing a number.
- [ ] Enter marks of 0 for an assessment: it counts as graded (not blank).
- [ ] Add assessment weightages that would exceed 100: rejected.
- [ ] Upload a `.exe` or a file over 10 MB: rejected with a clear message.
- [ ] Delete a course: the dialog lists what will be deleted (classes, assessments, …).
- [ ] Type `<b>bold</b>` as a course name: it is shown literally, not rendered.
- [ ] Settings → "Delete ALL data" then reload: the app returns to the empty state without errors.
- [ ] Restore a backup in a browser that does not hold the attached files: file resources show a clear "not stored in this browser" message when opened.

### E. New in v1.1
- [ ] **Skip planner:** on a date with unmarked classes, the table shows Now / If you skip all / If you attend all and a verdict; marking classes updates it.
- [ ] **Undo:** mark a class, click *Undo* in the toast within a few seconds; the previous status returns.
- [ ] **Trend chart:** a course page shows the weekly line with the dashed required-attendance line.
- [ ] **Estimated grades:** Academic History shows *Suggested*; *Use* fills the grade and shows *est.*; SGPA shows *Estimated*; picking a grade by hand removes *est.*
- [ ] **What SGPA do I need?:** a reachable target gives a number; an unreachable target says so.
- [ ] **Week view:** Calendar → Week; arrows move by a week.
- [ ] **.ics:** Reports → Calendar (.ics), then import the file into Google/Outlook/Apple Calendar and check times.
- [ ] **Full backup:** add a small PDF in Resources, download a full backup, delete all data (Settings), restore the backup: the file opens again.
- [ ] **PWA:** in Chrome/Edge the install icon appears; after installing, go offline (DevTools → Network → Offline) and reload: the app still opens with your data.

### F. Browser notifications
- [ ] Settings → Turn on, grant permission; with an overdue item present, a notification appears while the tab is open. (No background delivery by design.)
