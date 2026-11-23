// js/logic/assessments.js - PURE weighted-marks maths.
//
// weighted contribution = (marksObtained / maxMarks) * weightage
// Marks that are not entered yet are NULL (not zero): a missing mark is "not graded", not "scored 0".

const EPS = 1e-9;
const round2 = (n) => Math.round(n * 100) / 100;

export const ASSESSMENT_TYPES = [
  'Quiz', 'Short Quiz', 'Mid-Semester Examination', 'End-Semester Examination',
  'Lab Test', 'Practical', 'Presentation', 'Other',
];

export const isGraded = (a) => a.marksObtained !== null && a.marksObtained !== undefined && a.marksObtained !== '';
export const weightedScore = (a) => (a.marksObtained / a.maxMarks) * a.weightage;

/** Totals for one course. weights are "percent of the course grade". */
export function courseMarks(assessments) {
  let earned = 0, completed = 0, total = 0;
  for (const a of assessments) {
    total += a.weightage;
    if (isGraded(a)) {
      earned += weightedScore(a);
      completed += a.weightage;
    }
  }
  return {
    earned,
    completedWeight: completed,
    remainingWeight: total - completed,
    totalWeight: total,
    percentOfCompleted: completed > 0 ? (earned / completed) * 100 : null,
    isComplete: Math.abs(total - 100) < 1e-6, // configuration totals 100%
    count: assessments.length,
  };
}

/**
 * "What do I need to reach target% overall?"
 * needed = target - earned (in weighted points). If needed > remaining weight, it is impossible.
 * Otherwise we assume the SAME percentage in every remaining assessment:
 *   fraction = needed / remainingWeight  ->  marks for each = fraction * its maxMarks.
 */
export function requiredMarks(assessments, target) {
  const m = courseMarks(assessments);
  const needed = target - m.earned;
  if (needed <= EPS) return { status: 'achieved', earned: m.earned };

  const remaining = assessments.filter((a) => !isGraded(a) && a.weightage > 0);
  if (remaining.length === 0 || m.remainingWeight <= EPS) {
    return { status: 'impossible', reason: 'No ungraded assessments are left to earn more marks.', maxPossible: m.earned };
  }
  const maxPossible = m.earned + m.remainingWeight;
  if (needed > m.remainingWeight + EPS) {
    return { status: 'impossible', reason: `Even full marks in everything left gives at most ${round2(maxPossible)}%.`, maxPossible };
  }
  const fraction = needed / m.remainingWeight;
  return {
    status: 'possible',
    needed,
    percentNeeded: fraction * 100,
    perAssessment: remaining.map((a) => ({
      title: a.title, maxMarks: a.maxMarks, weightage: a.weightage, marksNeeded: round2(fraction * a.maxMarks),
    })),
  };
}

/** Returns an error message or null. `others` = the course's other assessments. */
export function validateAssessment(data, others) {
  if (!(data.maxMarks > 0)) return 'Maximum marks must be greater than 0.';
  if (data.weightage === null || data.weightage < 0 || data.weightage > 100) return 'Weightage must be between 0 and 100.';
  if (isGraded(data)) {
    if (data.marksObtained < 0) return 'Marks obtained cannot be negative.';
    if (data.marksObtained > data.maxMarks) return 'Marks obtained cannot exceed the maximum marks.';
  }
  const total = others.reduce((s, a) => s + a.weightage, 0) + data.weightage;
  if (total > 100 + EPS) return `Total weightage would be ${round2(total)}%. It cannot exceed 100%.`;
  return null;
}

/**
 * Estimated overall % for a course, used to SUGGEST a grade.
 *  - 'final'     : every assessment graded and weightages total 100% -> the real total.
 *  - 'projected' : some graded -> earned / completed weightage (assumes the rest goes the same way).
 */
export function estimatedPercent(assessments) {
  const m = courseMarks(assessments);
  if (m.completedWeight <= 0) return { percent: null, basis: null };
  if (m.isComplete && m.remainingWeight <= 1e-9) return { percent: m.earned, basis: 'final' };
  return { percent: m.percentOfCompleted, basis: 'projected' };
}
