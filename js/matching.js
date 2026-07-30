/**
 * matching.js — pairing scorer.
 *
 * Pure functions. Imports only time.js. No DOM, no store.
 *
 * The scorer's job is to put plausible pairs at the top of a list a human
 * then reads. It does not assign anyone to anyone. Every score comes with a
 * breakdown so the coordinator can see why a pair ranked where it did and
 * overrule it.
 *
 * A pair with no shared time is not a low-scoring pair; it is not a pair.
 * Same for no shared subject. Those are hard gates, reported as `blockers`.
 */

import { availabilityOverlapMinutes, availabilityOverlapWindows } from './time.js';

/** Minutes of weekly overlap that count as fully sufficient. */
export const OVERLAP_TARGET_MINUTES = 120;

/** Below this there is no realistic weekly session. */
export const OVERLAP_FLOOR_MINUTES = 45;

export const DEFAULT_WEIGHTS = Object.freeze({
  overlap: 40,     // can they actually meet, and with room to reschedule
  subject: 30,     // does the tutor cover what the student asked for
  language: 15     // can they talk to each other while the English catches up
});

export const DEFAULT_LOAD = Object.freeze({
  maxStudentsPerTutor: 2,
  maxTutorsPerStudent: 1
});

function normalise(list) {
  return new Set((list ?? []).map((s) => String(s).trim().toLowerCase()).filter(Boolean));
}

function intersect(a, b) {
  const out = [];
  for (const item of a) if (b.has(item)) out.push(item);
  return out.sort();
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

/**
 * Score one tutor/student pair.
 *
 * @param {object} tutor
 * @param {object} student
 * @param {{referenceIso: string, weights?: object}} opts
 * @returns {{
 *   tutorId: string, studentId: string, score: number, eligible: boolean,
 *   blockers: string[], overlapMinutes: number, sharedSubjects: string[],
 *   sharedLanguages: string[], breakdown: object
 * }}
 */
export function scorePair(tutor, student, opts) {
  const { referenceIso, weights = DEFAULT_WEIGHTS } = opts ?? {};
  if (!referenceIso) throw new TypeError('scorePair requires opts.referenceIso');

  const overlapMinutes = availabilityOverlapMinutes(
    tutor.availability,
    student.availability,
    referenceIso
  );

  const tutorSubjects = normalise(tutor.subjects);
  const studentSubjects = normalise(student.subjects);
  const sharedSubjects = intersect(tutorSubjects, studentSubjects);

  const tutorLangs = normalise(tutor.languages);
  const studentLangs = normalise(student.languages);
  const sharedLanguages = intersect(tutorLangs, studentLangs);

  const overlapScore = clamp01(overlapMinutes / OVERLAP_TARGET_MINUTES);
  const subjectScore = studentSubjects.size === 0
    ? 0.5 // student stated no preference: neither a match nor a mismatch
    : clamp01(sharedSubjects.length / studentSubjects.size);
  const languageScore = sharedLanguages.length > 0 ? 1 : 0;

  const breakdown = {
    overlap: round1(overlapScore * weights.overlap),
    subject: round1(subjectScore * weights.subject),
    language: round1(languageScore * weights.language)
  };

  const blockers = [];
  if (overlapMinutes < OVERLAP_FLOOR_MINUTES) blockers.push('no-shared-time');
  if (studentSubjects.size > 0 && sharedSubjects.length === 0) blockers.push('no-shared-subject');
  if (tutor.active === false) blockers.push('tutor-inactive');
  if (student.active === false) blockers.push('student-inactive');

  return {
    tutorId: tutor.id,
    studentId: student.id,
    score: round1(breakdown.overlap + breakdown.subject + breakdown.language),
    eligible: blockers.length === 0,
    blockers,
    overlapMinutes,
    sharedSubjects,
    sharedLanguages,
    breakdown
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Every candidate pair, best first. Ineligible pairs are kept — a
 * coordinator needs to see "close, but no shared Saturday" to know what to
 * ask for — but sort below every eligible one.
 *
 * @param {object[]} tutors
 * @param {object[]} students
 * @param {{referenceIso: string, weights?: object, includeIneligible?: boolean}} opts
 */
export function rankPairs(tutors, students, opts) {
  const { includeIneligible = true } = opts ?? {};
  const pairs = [];

  for (const tutor of tutors ?? []) {
    for (const student of students ?? []) {
      const pair = scorePair(tutor, student, opts);
      if (pair.eligible || includeIneligible) pairs.push(pair);
    }
  }

  pairs.sort(comparePairs);
  return pairs;
}

function comparePairs(a, b) {
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  if (b.score !== a.score) return b.score - a.score;
  if (b.overlapMinutes !== a.overlapMinutes) return b.overlapMinutes - a.overlapMinutes;
  // Stable, data-independent tiebreak so the same dataset always ranks the
  // same way. Reviewers notice when a list reshuffles between visits.
  return `${a.tutorId}|${a.studentId}`.localeCompare(`${b.tutorId}|${b.studentId}`);
}

/**
 * Greedy assignment over the ranked list, respecting load caps and any
 * pairings that already exist.
 *
 * Greedy, not optimal, and that is deliberate: a coordinator can predict and
 * explain "we took the best available pair, then the next" to a parent. They
 * cannot explain the output of a global optimiser, and every suggestion here
 * is a proposal a human accepts or rejects anyway.
 *
 * @param {object[]} tutors
 * @param {object[]} students
 * @param {{
 *   referenceIso: string,
 *   existingMatches?: Array<{tutorId:string, studentId:string, status?:string}>,
 *   load?: {maxStudentsPerTutor:number, maxTutorsPerStudent:number},
 *   weights?: object
 * }} opts
 * @returns {{
 *   suggestions: object[],
 *   unmatchedStudents: string[],
 *   unusedTutors: string[]
 * }}
 */
export function suggestPairings(tutors, students, opts) {
  const {
    existingMatches = [],
    load = DEFAULT_LOAD
  } = opts ?? {};

  const tutorLoad = new Map();
  const studentLoad = new Map();
  const alreadyPaired = new Set();

  for (const m of existingMatches) {
    if (m.status && m.status !== 'active') continue;
    tutorLoad.set(m.tutorId, (tutorLoad.get(m.tutorId) ?? 0) + 1);
    studentLoad.set(m.studentId, (studentLoad.get(m.studentId) ?? 0) + 1);
    alreadyPaired.add(`${m.tutorId}|${m.studentId}`);
  }

  const suggestions = [];
  for (const pair of rankPairs(tutors, students, { ...opts, includeIneligible: false })) {
    const key = `${pair.tutorId}|${pair.studentId}`;
    if (alreadyPaired.has(key)) continue;
    if ((tutorLoad.get(pair.tutorId) ?? 0) >= load.maxStudentsPerTutor) continue;
    if ((studentLoad.get(pair.studentId) ?? 0) >= load.maxTutorsPerStudent) continue;

    suggestions.push(pair);
    alreadyPaired.add(key);
    tutorLoad.set(pair.tutorId, (tutorLoad.get(pair.tutorId) ?? 0) + 1);
    studentLoad.set(pair.studentId, (studentLoad.get(pair.studentId) ?? 0) + 1);
  }

  const unmatchedStudents = (students ?? [])
    .filter((s) => s.active !== false && (studentLoad.get(s.id) ?? 0) === 0)
    .map((s) => s.id);

  const unusedTutors = (tutors ?? [])
    .filter((t) => t.active !== false && (tutorLoad.get(t.id) ?? 0) === 0)
    .map((t) => t.id);

  return { suggestions, unmatchedStudents, unusedTutors };
}

/**
 * Concrete meeting windows for a pair — what to actually propose once a
 * suggestion is accepted.
 */
export function meetingWindowsFor(tutor, student, referenceIso, minMinutes = 60) {
  return availabilityOverlapWindows(tutor.availability, student.availability, referenceIso)
    .filter((w) => w.minutes >= minMinutes);
}

/**
 * Why a student has no eligible tutor. Answers the only question worth
 * asking about an unmatched student: what would we have to change?
 *
 * @returns {{studentId:string, reasons:Record<string,number>, nearest:object[]}}
 */
export function diagnoseUnmatched(student, tutors, opts) {
  const reasons = {};
  const scored = (tutors ?? []).map((t) => scorePair(t, student, opts));

  for (const pair of scored) {
    for (const blocker of pair.blockers) {
      reasons[blocker] = (reasons[blocker] ?? 0) + 1;
    }
  }

  const nearest = scored
    .filter((p) => !p.eligible)
    .sort((a, b) => b.score - a.score || a.blockers.length - b.blockers.length)
    .slice(0, 3);

  return { studentId: student.id, reasons, nearest };
}
