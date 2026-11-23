# StudentOS User Guide

## First run

1. Start the app (`npm start`, then open <http://localhost:5173>).
2. **Quick look:** on the empty dashboard click **Load sample data**. A "Sample Semester" with four courses, a timetable, marks, assignments, resources, events and tasks appears. Delete it later from **My Semesters**.
3. **Your own data:** click **Create a semester** and follow the order below.

## Recommended setup order

| Step | Page | What to do |
|---|---|---|
| 1 | **My Semesters** | New semester: name, start and end date, working days. Overlapping semesters are rejected. |
| 2 | **My Semesters** | Add holidays (adding one marks that day's unmarked classes "Cancelled - Holiday"). |
| 3 | **Courses** | Add each course with credits. Optionally set a course-specific attendance requirement. |
| 4 | **Timetable & Attendance** | Add weekly slots. Dated classes for the whole semester are generated automatically. |
| 5 | **Exams & Marks** | Add each course's assessments (max marks, weightage). Keep the total at 100%. |
| 6 | **Settings** | Check the default attendance requirement and edit the grading scheme to match your institution. |

Then use the app daily: mark attendance, enter marks as they arrive, tick tasks off.

## Pages

### Dashboard
Today's classes with one-click attendance buttons, attendance warnings, upcoming exams and deadlines (next 14 days), personal tasks and events, semester progress and recent marks. It stores nothing itself; it is a summary of the other pages.

### My Semesters
Create, edit, switch and delete semesters. The dropdown in the top bar also switches the active semester. Editing dates re-syncs classes: unmarked classes outside the new range are removed, marked ones are kept. Deleting a semester shows exactly what will be deleted before you confirm.

### Courses
List of courses with attendance. Open a course for its attendance (with a weekly trend chart), marks, deadlines, resources and weekly slots. Deleting a course lists everything that goes with it.

### Timetable & Attendance
- **Day view:** pick a date, mark each class **Present, Absent, Holiday** (cancelled for a holiday) or **Cancelled** (other reason, with an optional reason). Click the highlighted status again to un-mark it.
- **Shift:** cancels that dated class and creates a new one at another date/time. The weekly timetable is not changed.
- **Add extra class:** one-off extra or replacement classes.
- **Attendance by course:** attended/conducted, percentage, status, how many classes you can still miss, how many you must attend to recover, unmarked past classes, and a projection if you attend everything upcoming.
- **Unmarked past classes:** a catch-up list so nothing is forgotten.
- **Weekly timetable:** add/edit/delete slots. When editing, choose *Apply this change from* a date: earlier classes stay exactly as they were.
- **Skip planner (what if?):** for the selected date, shows each course's attendance if you skip or attend that day's unmarked classes and whether skipping is safe. Nothing is saved.
- **Undo:** after marking attendance a toast offers *Undo* for a few seconds.
- **Regenerate missing classes:** safe to press any time; it never duplicates and never deletes marked classes.

### Exams & Marks
Pick a course. Add assessments (name, type, max marks, weightage, date, status, marks). Leave marks empty until graded (empty is not 0). Weighted totals update automatically. A banner warns while weightages do not total 100%. The **calculator** tells you the marks needed in remaining assessments for a target score, or says clearly that the target is unreachable.

### Assignments & Projects
Assignments, projects, demos, vivas and more, with priority, progress (Not started / In progress / Submitted), optional link and optional score. Filter by course, type, priority or progress; sort by due date or priority. Overdue and due-soon items are flagged. Change progress straight from the table.

### Resources
Per-course files, links and notes. Files are limited to 10 MB and common study formats (PDF, Office documents, images, text). **Files live only in this browser** and are included only in the **full backup** (Reports), not in the data-only backup. Search by title or topic.

### Academic Calendar
Month view, week view and a 30-day list. Colours: classes, exams, deadlines, personal events. Use the checkboxes to filter categories. Click a day for details; add events (club meetings, contests, hackathons, workshops, festivals, sports, appointments) with an optional reminder.

### Personal Planner
Your own to-do lists (for example *Weekend Goals*, *Personal Learning*), separate from course deadlines. Daily and weekly progress bars. Overdue tasks can be moved to today individually or all at once.

### Notifications
Alerts built from your data: overdue/due-soon items, exams within a week, attendance shortage or near-shortage, unmarked past classes, tasks due, events with reminders. Mark as read individually or all at once. Browser notifications are optional (Settings) and only work while the app is open in a tab.

### Academic History
Enter each course's final grade from your grading scheme, choose which courses count, and mark a semester's results as final. Shows SGPA per semester, CGPA across semesters you include, and an SGPA trend chart. Results are labelled **Provisional** until the semester is marked final and every included course has a grade. **Suggested** grades are computed from your marks and your scheme's minimum scores; *Use* accepts one and flags it *est.*, and results containing estimates are labelled **Estimated** (never Final). The **What SGPA do I need?** card tells you the SGPA required next semester for a target CGPA.

### Reports
- **Print / Save as PDF:** opens the print dialog with a clean printable report; choose "Save as PDF".
- **CSV exports:** course summary, attendance log, assessments.
- **Calendar (.ics):** classes, exams, deadlines and events for the whole semester, importable into Google Calendar, Outlook or Apple Calendar.
- **Download backup (data only)** is small; **Download full backup (with files)** also embeds attached files and can be large.
- **Restore:** choose a backup file. It is validated first, then you choose **Merge** (keep existing, add/update from the backup) or **Replace**.

### Settings
Default attendance requirement, "due soon" window, browser notifications, the grading scheme editor, storage information, sample data and "Delete ALL data".

## Grading scheme format

One grade per line: `label, points, minimum score (optional)`

```
O, 10, 90
A+, 9, 80
A, 8, 70
F, 0, 0
```

## Install and offline use

In Chrome or Edge, use the install icon in the address bar (or menu → *Install StudentOS*). The installed app opens in its own window and works without internet. Your data stays on your device.

## Keyboard and accessibility

- **Tab** reaches every control; the first stop is "Skip to content".
- Forms have labels and error messages announced as alerts.
- **Esc** closes dialogs and the mobile menu.
- Status is shown with text as well as colour.

## Protecting your data

Everything is stored in your browser. Clearing site data, using a different browser or a private window means the data is not there. Use **Reports → Download backup** regularly, and remember that the data-only backup does not include files attached in Resources; use the full backup for those.
