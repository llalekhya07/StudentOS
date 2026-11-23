# StudentOS: Personal Academic Management System

A semester-based student organizer that keeps **courses, timetable, daily attendance, exams and marks, assignments, course resources, a calendar, a personal planner, grades (SGPA/CGPA), reminders and reports** in one app.

It is **local-first**: no account, no backend, no cloud. All data lives in your browser (IndexedDB + LocalStorage), and you can export a JSON backup at any time.

Built with plain **HTML, CSS and vanilla JavaScript (ES modules)**. Node.js is used only for a tiny dev server and the test runner. There are **zero dependencies** to install.

---

## Quick start

You need [Node.js](https://nodejs.org) 20 or newer (for the dev server only).

```bash
cd StudentOS
npm start          # serves the app at http://localhost:5173
npm test           # runs the automated tests (47 tests)
```

Open <http://localhost:5173>. On an empty dashboard click **Load sample data** to see everything populated, or click **Create a semester** to start with your own data.

> **Why a server?** The app uses ES modules (`<script type="module">`). Browsers refuse to load modules from `file://`, so double-clicking `index.html` will not work. Any static server works: `npm start`, VS Code's *Live Server*, or `python3 -m http.server`.

---

## Features

| Area | What it does |
|---|---|
| **Semesters** | Create/switch/delete semesters with start/end dates, working days and holidays. Overlapping semesters are blocked. |
| **Courses** | Name, code, credits, faculty, venue, optional per-course attendance requirement. A detail page per course. |
| **Timetable** | Weekly template; dated class occurrences are **generated automatically** for the whole semester. Edit "from a date onward" without touching past classes. |
| **Attendance** | Mark Present / Absent / Cancelled-Holiday / Cancelled-Other per dated class. Shift a class, add extra or replacement classes. Unmarked classes are never counted as absent. |
| **Shortage predictor** | Per course: percentage, how many classes you can still miss, how many you must attend to recover, projection for upcoming classes, and an attendance trend chart. Integer-safe maths. |
| **Skip planner** | A what-if for any date: your attendance per course if you skip or attend that day's unmarked classes, with a "safe to skip" verdict. Nothing is saved. |
| **Exams and marks** | Per-course assessments with max marks, weightage, date, status. Weighted marks, completed/remaining weightage, and a **"marks needed for target" calculator** that handles impossible targets. |
| **Assignments** | Assignments, projects, demos, vivas with priority, progress (Not started / In progress / Submitted), optional score, filters and sorting. Overdue and due-soon highlighting. |
| **Resources** | Per-course files (stored in IndexedDB), links and notes, with search and topic organisation. |
| **Calendar** | Month, week and list views combining classes, exams, deadlines and personal events, with category colours and filters. Export everything as an `.ics` file for Google/Outlook/Apple Calendar. |
| **Planner** | Personal/weekend to-do lists, separate from course work. Daily and weekly progress; carry overdue tasks forward. |
| **History and grades** | Editable grading scheme, per-course grades, **SGPA and CGPA**, provisional vs estimated vs final, **suggested grades** from your marks, a **"what SGPA do I need?"** calculator, SGPA trend chart. |
| **Notifications** | In-app alerts derived from your data (deadlines, exams, attendance, unmarked classes, tasks, events). Optional browser notifications while the app is open. |
| **Reports** | Printable report (Save as PDF), CSV and `.ics` exports, JSON backup (data only, or **full with attached files**) and a **validated** restore (merge or replace). |
| **Offline / install** | A Progressive Web App: install it from the browser and it keeps working without internet. Your data never leaves the device. |
| **UI** | Light/dark theme, responsive layout with a mobile drawer, keyboard-friendly, accessible labels. |

---

## Project structure

```
StudentOS/
├── index.html            Page skeleton (sidebar, top bar, dialog, toast area)
├── manifest.webmanifest  PWA manifest (name, icons, colours)
├── sw.js                 Service worker: offline support (network-first)
├── icons/                App icons (192 and 512 px)
├── CHANGELOG.md          What changed in each version
├── .github/workflows/    CI: runs the tests on every push
├── style.css             Design system (tokens, light/dark), layout, components, print styles
├── server.js             Zero-dependency static dev server (npm start)
├── package.json          Scripts: start, test
├── README.md             This file
├── docs/
│   ├── ARCHITECTURE.md   How the code is organised and why
│   ├── CALCULATIONS.md   Every formula with worked examples
│   ├── USER_GUIDE.md     How to use each page
│   ├── TESTING.md        Automated tests + manual browser checklist
│   └── Questions.md  Pitch, walkthrough and likely questions with answers
├── tests/
│   ├── logic.test.js     Unit tests for the pure logic modules
│   └── app.test.js       Integration tests: services, state, every page renders
└── js/
    ├── app.js            Startup, router, navigation, theme, semester switcher
    ├── state.js          In-memory data + write-through persistence + selectors + cascades
    ├── storage.js        The ONLY file that talks to IndexedDB
    ├── services.js       Multi-record operations and integrity rules
    ├── ui.js             Toasts, modal, generic form builder, confirm dialog, SVG chart
    ├── components.js     Shared HTML (attendance row) and its click handling
    ├── utils.js          Dates, ids, escaping, formatting, CSV
    ├── logic/            PURE modules: no DOM, no storage (fully unit-tested)
    │   attendance, timetable, assessments, grades, deadlines, semesters, planner,
    │   calendar, ics, notifications, backup, reports, resources
    └── views/            One module per page (13 pages)
```

**Layering in one line:** `views` (what you see) → `services` / `state` (changing data) → `logic` (pure calculations) and `storage` (IndexedDB). Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full explanation.

---

## Technology decisions

| Decision | Reason |
|---|---|
| Vanilla JS + ES modules, no framework | Original project requirement; keeps the code understandable and dependency-free. React was *permitted later* but not used (see below). |
| IndexedDB for records and files | LocalStorage is ~5 MB and string-only; IndexedDB stores structured data and file blobs. |
| In-memory state, write-through | Rendering stays synchronous and simple; every change is persisted in the background. |
| Pure `logic/` modules | Calculations are testable without a browser and easy to explain. |
| Dates as `"YYYY-MM-DD"` strings | Sort correctly, serialise cleanly, and avoid timezone off-by-one bugs. |
| Print-to-PDF and SVG charts | Avoids jsPDF and Chart.js entirely: fewer dependencies, nothing to load from a CDN. |
| Node only for tooling | `server.js` serves files, `node --test` runs tests. No `npm install` needed. |

**Why not React?** The project was designed, written and tested as vanilla JS, and the environment used to build it had no network access, so a React/Vite toolchain could not have been installed or verified. A React port would reuse `js/logic/`, `js/state.js`, `js/services.js` and `js/storage.js` unchanged; only `js/views/` and `js/ui.js` would be rewritten as components.

---

## Testing

```bash
npm test
```

- **47 automated tests** cover attendance maths (including a brute-force check of the formulas), the skip planner and trend, timetable generation, weighted marks and the required-marks calculator, SGPA/CGPA, estimated grades and the required-SGPA calculator, `.ics` export, backup validation (including attached files), notifications, cascading deletes, holiday/shift/extra-class behaviour, PWA file consistency, and that **every page renders** against sample data.
- These run in Node with a stubbed DOM and no IndexedDB, so they verify **logic and generated HTML, not real browser behaviour** (clicking, dialogs, IndexedDB persistence, layout).
- Use the manual checklist in [docs/TESTING.md](docs/TESTING.md) to verify the browser behaviour before relying on it.

---

## Known limitations (intentional scope for version 1)

- Data is stored **per browser**. No sync across devices, no accounts, no collaboration.
- Clearing site data deletes everything. Download a backup (Reports → Download backup) regularly.
- The default JSON backup is data-only; use **Download full backup (with files)** to include attachments (the file can be large).
- Browser notifications only work **while the app is open**; there is no background push.
- Grade suggestions are only as good as your scheme's minimum scores; you always confirm the grade yourself.
- There is no integration with a college portal and no automatic attendance detection.

---

## Deploying to GitHub Pages

1. Push the `StudentOS` folder to a GitHub repository.
2. Repository **Settings → Pages**, choose the branch and the root folder.
3. Open the published URL. Everything is static, so no build step is needed.

---

## Install as an app (PWA)

Open the app over `http://localhost` (or any https host). In Chrome or Edge use the install icon in the address bar (or menu → *Install StudentOS*). It then opens in its own window and works offline. The service worker is network-first, so you always get the newest code when online.

## How this project was built

The product requirements and architecture (the project blueprint) were written by the author. The implementation, automated tests and documentation were generated with an AI assistant (Claude, by Anthropic) working from that blueprint, and then run, reviewed and tested by the author. This note is here for transparency; edit it to describe your own contribution accurately.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Calculations](docs/CALCULATIONS.md)
- [User guide](docs/USER_GUIDE.md)
- [Testing](docs/TESTING.md)
- [Questions](docs/Questions.md)
