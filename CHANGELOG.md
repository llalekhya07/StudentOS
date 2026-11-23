# Changelog

## 1.1.0

### Added
- **Skip planner** (Timetable & Attendance): a what-if showing each course's attendance if you skip or attend the unmarked classes on a date, with an integer-safe "safe to skip" verdict.
- **Attendance trend chart** on each course page, with the required-attendance line.
- **Undo** after marking attendance (toast with an Undo button).
- **Estimated grades**: suggests a grade from weighted marks using the grading scheme's minimum scores. Accepted estimates stay flagged, and SGPA is labelled *Estimated* until you choose the grade yourself.
- **"What SGPA do I need?"** calculator for a target CGPA.
- **Week view** in the calendar (alongside month and list).
- **Calendar export (.ics)** for Google Calendar, Outlook and Apple Calendar.
- **Full backup including attached files** (base64 inside the JSON), plus restore of those files.
- **Progressive Web App**: installable, works offline (network-first service worker), app icons and manifest.
- GitHub Actions workflow running the tests on Node 20 and 22.
- 12 new automated tests (47 in total).

### Changed
- Minimum Node version is now 20 (the test suite uses `CustomEvent`).
- `npm test` now uses `node --test` so it works on Windows shells too.

## 1.0.0
- First complete version: semesters, courses, timetable generation, attendance with shortage predictor, exams and marks with target calculator, assignments, resources with file storage, calendar, planner, SGPA/CGPA, notifications, reports, JSON backup with validated restore, light/dark themes, responsive layout.
