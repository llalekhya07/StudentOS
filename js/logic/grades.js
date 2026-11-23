// js/logic/grades.js - PURE SGPA / CGPA maths and grade-scheme parsing.
//
// SGPA = sum(credits * gradePoint) / sum(credits)          for the semester's graded, included courses
// CGPA = sum(credits * gradePoint) / sum(credits)          over ALL graded, included courses of included semesters
// (CGPA is NOT the average of SGPAs: semesters with more credits weigh more.)
// A result is "final" only when the semester is marked final AND no included course is missing a grade.

/** A SAMPLE scheme only. Grade labels, points and boundaries are user-editable in Settings. */
export const DEFAULT_SCHEME = {
  name: 'Sample 10-point scale (edit in Settings)',
  grades: [
    { label: 'O', points: 10, minScore: 90 },
    { label: 'A+', points: 9, minScore: 80 },
    { label: 'A', points: 8, minScore: 70 },
    { label: 'B+', points: 7, minScore: 60 },
    { label: 'B', points: 6, minScore: 50 },
    { label: 'C', points: 5, minScore: 40 },
    { label: 'F', points: 0, minScore: 0 },
  ],
};

export const gradePointFor = (scheme, label) => {
  const g = scheme && scheme.grades.find((x) => x.label === label);
  return g ? g.points : null;
};

/** Text editor format: one grade per line "label, points, minScore(optional)". */
export function parseGradeScheme(text) {
  const grades = [];
  const seen = new Set();
  for (const [i, raw] of text.split('\n').entries()) {
    const line = raw.trim();
    if (!line) continue;
    const [label, points, minScore] = line.split(',').map((s) => s.trim());
    const p = Number(points);
    if (!label) return { error: `Line ${i + 1}: grade label is missing.` };
    if (points === undefined || points === '' || Number.isNaN(p) || p < 0) return { error: `Line ${i + 1}: grade points must be a number, 0 or more.` };
    if (seen.has(label)) return { error: `Line ${i + 1}: grade "${label}" appears twice.` };
    if (minScore !== undefined && minScore !== '' && Number.isNaN(Number(minScore))) return { error: `Line ${i + 1}: minimum score must be a number.` };
    seen.add(label);
    grades.push({ label, points: p, minScore: minScore === undefined || minScore === '' ? null : Number(minScore) });
  }
  if (grades.length === 0) return { error: 'Add at least one grade.' };
  return { grades };
}

export const schemeToText = (scheme) =>
  scheme.grades.map((g) => `${g.label}, ${g.points}${g.minScore !== null && g.minScore !== undefined ? ', ' + g.minScore : ''}`).join('\n');

/** One semester. results[] hold {courseId, gradePoint, includedInGPA}. */
export function semesterGpa(courses, results, semester) {
  const resultOf = (c) => results.find((r) => r.courseId === c.id);
  const included = courses.filter((c) => (resultOf(c) ? resultOf(c).includedInGPA !== false : true));
  const graded = included.filter((c) => resultOf(c) && typeof resultOf(c).gradePoint === 'number');
  const credits = graded.reduce((s, c) => s + c.credits, 0);
  const points = graded.reduce((s, c) => s + c.credits * resultOf(c).gradePoint, 0);
  const missing = included.length - graded.length;
  const hasEstimate = graded.some((c) => resultOf(c).estimated);
  return {
    sgpa: credits > 0 ? points / credits : null,
    gradedCredits: credits,
    points,
    missing,
    hasEstimate,
    isFinal: Boolean(semester.finalized) && missing === 0 && credits > 0 && !hasEstimate,
  };
}

/** items: array of semesterGpa() results for the semesters that count. */
export function cumulativeGpa(items) {
  const credits = items.reduce((s, x) => s + x.gradedCredits, 0);
  const points = items.reduce((s, x) => s + x.points, 0);
  return {
    cgpa: credits > 0 ? points / credits : null,
    credits,
    allFinal: items.length > 0 && items.every((x) => x.isFinal),
  };
}

/** Suggest a grade for a percentage using the scheme's minimum scores. Returns the grade or null. */
export function estimateGrade(scheme, percent) {
  if (!scheme || percent === null || percent === undefined) return null;
  const bands = scheme.grades.filter((g) => g.minScore !== null && g.minScore !== undefined)
    .sort((a, b) => b.minScore - a.minScore);
  return bands.find((g) => percent >= g.minScore) || null;
}

/**
 * WHAT-IF: SGPA needed next semester to reach a target CGPA.
 *   (curPoints + x * nextCredits) / (curCredits + nextCredits) = target   =>   x = (target*(cur+next) - curPoints) / next
 */
export function requiredSgpa({ currentPoints, currentCredits, nextCredits, targetCgpa, maxPoints }) {
  if (!(nextCredits > 0)) return { status: 'invalid' };
  const required = (targetCgpa * (currentCredits + nextCredits) - currentPoints) / nextCredits;
  if (required <= 0) return { status: 'met', required: 0 };
  if (required > maxPoints) return { status: 'impossible', required, maxPoints };
  return { status: 'possible', required };
}
