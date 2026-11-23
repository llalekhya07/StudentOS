# StudentOS Calculations

Every number the app shows is computed from stored facts by a pure function in `js/logic/`. This page gives each formula, why it is correct, and a worked example. These are the answers to "how does it calculate X?" in an interview.

Notation: **A** = attended classes, **C** = conducted classes, **T** = threshold as a whole percent (75 means 75%).

---

## 1. Attendance

### 1.1 What counts

| Status | Conducted (C) | Attended (A) |
|---|---|---|
| Present | +1 | +1 |
| Absent | +1 | +0 |
| Cancelled - Holiday | not counted | not counted |
| Cancelled - Other | not counted | not counted |
| Not marked (pending) | not counted | not counted |

`attendance % = A / C × 100`. If `C = 0`, there is no percentage (shown as "-"); the app never divides by zero.

**Why pending is not absent:** the student may simply not have marked it yet. Counting it as absent would make the numbers wrong and punish forgetfulness. The app instead shows "unmarked past classes" as a reminder.

### 1.2 Integer-safe comparison

A decision such as "is attendance at least 75%?" is **never** made on a rounded or floating-point percentage. Instead:

```
A / C ≥ T / 100   ⇔   100·A ≥ T·C
```

This uses only integers, so there is no rounding error. (A percentage like 74.999… cannot be displayed as "75%" and pass.) Thresholds are therefore whole numbers from 1 to 100.

### 1.3 How many classes can I still miss?

Find the largest x such that attendance stays ≥ T after x more consecutive absences (A stays the same, C grows by x):

```
100·A ≥ T·(C + x)
x ≤ (100·A − T·C) / T
x = floor((100·A − T·C) / T), and 0 if that is negative
```

This is the blueprint's `floor(A/T − C)` with T as a fraction, rewritten with integers. If T = 0 there is no limit (∞).

**Worked example (blueprint):** A = 27, C = 30, T = 75
`(100·27 − 75·30) / 75 = (2700 − 2250) / 75 = 6`.
After 6 absences: 27/36 = 75% (still OK). After 7: 27/37 = 72.97% (below). ✔

### 1.4 How many classes must I attend to recover?

Find the smallest y such that attendance reaches T after y more consecutive classes attended (both A and C grow by y):

```
100·(A + y) ≥ T·(C + y)
y·(100 − T) ≥ T·C − 100·A
y = ceil((T·C − 100·A) / (100 − T)), or 0 if already at/above T
```

If T = 100 and you have missed a class, recovery is impossible (∞).

**Worked example:** A = 20, C = 30, T = 75
`(75·30 − 100·20) / 25 = 250 / 25 = 10`. After 10 more: 30/40 = 75%. ✔ After 9: 29/39 = 74.4% (not enough).

The test suite checks both formulas against a brute-force search for all A ≤ C ≤ 30 and T in {50, 60, 75, 80, 90}.

### 1.5 Status labels

| State | Rule |
|---|---|
| No classes yet | C = 0 |
| Shortage | 100·A < T·C |
| Close to shortage | at/above T but can miss at most 1 more class |
| On track | otherwise |

### 1.6 Projection

For `U` upcoming unmarked scheduled classes (pending with date today or later):

```
if you attend all:  (A + U) / (C + U)
if you miss all:    A / (C + U)
```

This **assumes every upcoming class takes place as scheduled**. Cancellations later will change it. Unmarked *past* classes are not in `U`; they are reported separately because they are unresolved, not future.

### 1.7 Threshold resolution

A course's own requirement wins; otherwise the global default is used. The code uses `??` (not `||`), so a legitimate override is respected and only `null`/`undefined` falls back.

---

## 2. Weighted marks

```
weighted contribution = (marks obtained / max marks) × weightage
```

| Quantity | Definition |
|---|---|
| Earned | Sum of weighted contributions of **graded** assessments |
| Completed weightage | Sum of weightage of graded assessments |
| Total weightage | Sum of weightage of all assessments |
| Remaining weightage | Total − Completed |
| Performance so far | Earned / Completed × 100 (undefined if nothing graded) |

An assessment is **graded** when `marksObtained` is a number (including 0). `null` means not graded. Entering marks automatically sets the status to Conducted; a Conducted assessment without marks is "Awaiting marks" and still counts as remaining.

**Validation:** max marks > 0; 0 ≤ weightage ≤ 100; 0 ≤ marks ≤ max marks; total weightage may not exceed 100. A total *below* 100 is allowed while setting up, with a visible warning until it reaches 100.

**Worked example:** Quiz 8/10 (weight 10) → 8.0. Mid 30/50 (weight 30) → 18.0. Earned = 26, completed = 40, remaining = 60 (End-Sem 100 marks, weight 60), performance so far = 26/40 = 65%.

---

## 3. Marks required for a target

Given a target overall score `Tgt` (out of 100 weighted points):

```
needed = Tgt − earned
```

| Case | Result |
|---|---|
| needed ≤ 0 | Already achieved |
| No ungraded assessments left | Impossible |
| needed > remaining weightage | Impossible: even full marks give `earned + remaining` |
| otherwise | `fraction = needed / remaining weightage`; each remaining assessment needs `fraction × its max marks` |

The assumption is stated in the UI: the **same percentage** is scored in every remaining assessment. It is one defensible way to split the requirement, not the only one.

**Worked example (continuing above):** target 75 → needed 49 → fraction 49/60 = 81.67% → End-Sem needs 81.67/100. Target 95 → needed 69 > 60 → impossible, maximum reachable 86%.

---

## 4. SGPA and CGPA

```
SGPA = Σ(credits × grade points) / Σ(credits)       over graded, included courses of one semester
CGPA = Σ(credits × grade points) / Σ(credits)       over graded, included courses of all included semesters
```

- **CGPA is not the average of SGPAs.** A 2-credit semester must weigh less than an 8-credit one. The test suite includes this exact case.
- A course is *included* unless the user unticks "Counts" (e.g. an audit course).
- Courses with no grade yet are excluded from the sums and reported as "missing".
- **Final vs provisional:** a semester's result is *Final* only when the user marked it final **and** no included course is missing a grade. Otherwise it is labelled *Provisional*. CGPA is *Final* only if every counted semester is.
- Grade labels, points and optional score boundaries come from the user-editable grading scheme (Settings). The sample scheme is only an example; nothing assumes one institution's rules. A saved grade keeps the points it had when chosen, so editing the scheme later does not silently rewrite history.

**Worked example:** credits 4, 3, 3 with grade points 9, 8, 10:
`(4·9 + 3·8 + 3·10) / 10 = 90/10 = 9.0`.

---

## 5. Deadline states

| State | Rule |
|---|---|
| Done | progress = Submitted |
| Overdue | due date before today and not submitted |
| Due soon | due within *N* days (default 3, in Settings) |
| Upcoming | otherwise |

Submission progress is stored separately from the score, so a submitted assignment can be scored later without losing its submission history (a `history[]` of status changes is kept).

---

## 6. Semester progress

`elapsed days / total days × 100`, where `total = end − start + 1` and `elapsed` is clamped between 0 and `total`. Before the semester starts it is 0%; after it ends, 100%.

---

## 7. Skip planner (what-if)

For a chosen date, let `n` be a course's classes that are **unmarked** on that date:

```
if you skip all:    A / (C + n)         safe  ⇔  100·A ≥ T·(C + n)
if you attend all:  (A + n) / (C + n)
```

Nothing is stored. Example: A = 9, C = 10, T = 75, n = 2 → 9/12 = 75% → exactly on the threshold, so it is *safe* (900 ≥ 900). With n = 3: 9/13 = 69.2% → not safe.

## 8. Attendance trend

Marked classes (Present/Absent only) are sorted by date and grouped by Monday-start week. The chart plots the **cumulative** attendance after each week: `A_so_far / C_so_far`.

## 9. Estimated grades and the target-CGPA calculator

**Estimated percentage:** if every assessment is graded and weightages total 100%, the estimate is the real total (*final*). Otherwise it is `earned / completed weightage × 100` (*projected*, assuming the rest goes the same way).

**Suggested grade:** among the scheme's grades that have a minimum score, take the highest whose minimum is ≤ the percentage. Accepting it stores `estimated: true`; the SGPA is then labelled *Estimated*, never *Final*.

**Required SGPA for a target CGPA:** with `P` grade points earned over `K` credits so far and `k` credits next semester,

```
(P + x·k) / (K + k) = target   ⇒   x = (target·(K + k) − P) / k
```

`x ≤ 0` means the target is already met; `x` above the scheme's maximum points means it is unreachable. Example: CGPA 8.0 over 20 credits (P = 160), next 20 credits, target 9 → `(9·40 − 160)/20 = 10`.

## 10. Timetable generation

For one weekly entry, the app creates an occurrence for each date `d` where:

1. `start ≤ d ≤ end` of the semester, **and** within the entry's effective-from/to dates;
2. `weekday(d)` equals the entry's weekday and is a working day of the semester;
3. `d` is not a holiday;
4. no occurrence with the same `course | date | startTime` exists.

Rule 4 makes generation idempotent. Marked occurrences are never deleted by re-syncing.
