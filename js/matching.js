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
 * Some things are not low scores, they are non-starters, and are reported as
 * `blockers` rather than folded into a number:
 *
 *   - no shared time            → there is no session to have
 *   - no shared goal            → the student asked for something else
 *   - level outside comfort     → the tutor said so themselves
 *   - tutor at their own max    → a limit the tutor set, not a target to fill
 *
 * Availability lives in its own table, so every entry point takes an index
 * built by indexAvailability() rather than reading it off the person.
 */

import { availabilityOverlapMinutes, availabilityOverlapWindows } from './time.js';

/** Minutes of weekly overlap that count as fully sufficient. */
export const OVERLAP_TARGET_MINUTES = 120;

/** Below this there is no realistic weekly session. */
export const OVERLAP_FLOOR_MINUTES = 45;

export const DEFAULT_WEIGHTS = Object.freeze({
  overlap: 35,   // can they actually meet, with room to reschedule
  goals: 30,     // does the tutor cover what the student asked for
  level: 20,     // is the tutor comfortable at the student's English level
  locale: 15     // can they talk to each other while the English catches up
});

export const DEFAULT_LOAD = Object.freeze({
  maxTutorsPerStudent: 1
});

/**
 * Group availability rows by person.
 * @param {Array<{personId:string}>} rows
 * @returns {Map<string, object[]>}
 */
export function indexAvailability(rows) {
  const index = new Map();
  for (const row of rows ?? []) {
    const list = index.get(row.personId);
    if (list) list.push(row);
    else index.set(row.personId, [row]);
  }
  return index;
}

/** Active-pairing count per tutor, from the pairings table. */
export function indexTutorLoad(pairings) {
  const load = new Map();
  for (const p of pairings ?? []) {
    if (p.status !== 'active') continue;
    load.set(p.tutorId, (load.get(p.tutorId) ?? 0) + 1);
  }
  return load;
}

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

function round1(n) {
  return Math.round(n * 10) / 10;
}

function capacityOf(tutor) {
  const max = Number(tutor.maxStudents);
  return Number.isFinite(max) ? max : 2;
}

/**
 * Score one tutor/student pair.
 *
 * @param {object} tutor person with role 'tutor'
 * @param {object} student person with role 'student'
 * @param {{
 *   referenceIso: string,
 *   availability: Map<string, object[]>,
 *   tutorLoad?: Map<string, number>,
 *   weights?: object
 * }} opts
 * @returns {{
 *   tutorId: string, studentId: string, score: number, eligible: boolean,
 *   blockers: string[], overlapMinutes: number, sharedGoals: string[],
 *   levelOk: boolean, sharedLocale: boolean, breakdown: object
 * }}
 */
export function scorePair(tutor, student, opts) {
  const {
    referenceIso,
    availability,
    tutorLoad = new Map(),
    weights = DEFAULT_WEIGHTS
  } = opts ?? {};

  if (!referenceIso) throw new TypeError('scorePair requires opts.referenceIso');
  if (!availability) throw new TypeError('scorePair requires opts.availability (see indexAvailability)');

  const overlapMinutes = availabilityOverlapMinutes(
    availability.get(tutor.id),
    availability.get(student.id),
    referenceIso
  );

  const tutorSubjects = normalise(tutor.subjects);
  const studentGoals = normalise(student.goals);
  const sharedGoals = intersect(tutorSubjects, studentGoals);

  // An empty levelsComfortable means unstated, which is not a constraint.
  const levels = normalise(tutor.levelsComfortable);
  const studentLevel = String(student.englishLevel ?? '').trim().toLowerCase();
  const levelOk = levels.size === 0 || studentLevel === '' || levels.has(studentLevel);

  const sharedLocale = Boolean(tutor.locale && student.locale && tutor.locale === student.locale);

  const overlapScore = clamp01(overlapMinutes / OVERLAP_TARGET_MINUTES);
  const goalScore = studentGoals.size === 0
    ? 0.5 // stated no preference: neither a match nor a mismatch
    : clamp01(sharedGoals.length / studentGoals.size);

  const breakdown = {
    overlap: round1(overlapScore * weights.overlap),
    goals: round1(goalScore * weights.goals),
    level: round1((levelOk ? 1 : 0) * weights.level),
    locale: round1((sharedLocale ? 1 : 0) * weights.locale)
  };

  const blockers = [];
  if (overlapMinutes < OVERLAP_FLOOR_MINUTES) blockers.push('no-shared-time');
  if (studentGoals.size > 0 && sharedGoals.length === 0) blockers.push('no-shared-goal');
  if (!levelOk) blockers.push('level-outside-comfort');
  if (tutor.active === false) blockers.push('tutor-inactive');
  if (student.active === false) blockers.push('student-inactive');
  if ((tutorLoad.get(tutor.id) ?? 0) >= capacityOf(tutor)) blockers.push('tutor-at-capacity');

  return {
    tutorId: tutor.id,
    studentId: student.id,
    score: round1(breakdown.overlap + breakdown.goals + breakdown.level + breakdown.locale),
    eligible: blockers.length === 0,
    blockers,
    overlapMinutes,
    sharedGoals,
    levelOk,
    sharedLocale,
    breakdown
  };
}

/**
 * Every candidate pair, best first. Ineligible pairs are kept by default — a
 * coordinator needs to see "close, but no shared Saturday" to know what to
 * ask for — but sort below every eligible one.
 *
 * @param {object[]} tutors
 * @param {object[]} students
 * @param {object} opts as scorePair, plus `includeIneligible`
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
 * Greedy assignment over the ranked list, respecting each tutor's own
 * maxStudents and any pairings that already exist.
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
 *   availability: Map<string, object[]>,
 *   pairings?: object[],
 *   load?: {maxTutorsPerStudent:number},
 *   weights?: object
 * }} opts
 * @returns {{
 *   suggestions: object[],
 *   unmatchedStudents: string[],
 *   tutorsWithRoomLeft: Array<{tutorId:string, remaining:number}>
 * }}
 */
export function suggestPairings(tutors, students, opts) {
  const { pairings = [], load = DEFAULT_LOAD } = opts ?? {};

  const tutorLoad = indexTutorLoad(pairings);
  const studentLoad = new Map();
  const taken = new Set();

  for (const p of pairings) {
    if (p.status !== 'active') continue;
    studentLoad.set(p.studentId, (studentLoad.get(p.studentId) ?? 0) + 1);
    taken.add(`${p.tutorId}|${p.studentId}`);
  }

  // Score once against the real starting load, then walk the ranking. The
  // running load is checked as we go so a tutor is not suggested past their
  // own maximum inside a single run.
  const ranked = rankPairs(tutors, students, { ...opts, tutorLoad, includeIneligible: false });
  const capacity = new Map((tutors ?? []).map((t) => [t.id, capacityOf(t)]));

  const suggestions = [];
  for (const pair of ranked) {
    const key = `${pair.tutorId}|${pair.studentId}`;
    if (taken.has(key)) continue;
    if ((tutorLoad.get(pair.tutorId) ?? 0) >= (capacity.get(pair.tutorId) ?? 2)) continue;
    if ((studentLoad.get(pair.studentId) ?? 0) >= load.maxTutorsPerStudent) continue;

    suggestions.push(pair);
    taken.add(key);
    tutorLoad.set(pair.tutorId, (tutorLoad.get(pair.tutorId) ?? 0) + 1);
    studentLoad.set(pair.studentId, (studentLoad.get(pair.studentId) ?? 0) + 1);
  }

  const unmatchedStudents = (students ?? [])
    .filter((s) => s.active !== false && (studentLoad.get(s.id) ?? 0) === 0)
    .map((s) => s.id);

  const tutorsWithRoomLeft = (tutors ?? [])
    .filter((t) => t.active !== false)
    .map((t) => ({ tutorId: t.id, remaining: (capacity.get(t.id) ?? 2) - (tutorLoad.get(t.id) ?? 0) }))
    .filter((row) => row.remaining > 0);

  return { suggestions, unmatchedStudents, tutorsWithRoomLeft };
}

/**
 * Concrete meeting windows for a pair — what to actually propose once a
 * suggestion is accepted.
 */
export function meetingWindowsFor(tutor, student, opts, minMinutes = 60) {
  const { referenceIso, availability } = opts ?? {};
  return availabilityOverlapWindows(
    availability.get(tutor.id),
    availability.get(student.id),
    referenceIso
  ).filter((w) => w.minutes >= minMinutes);
}

/**
 * Why a student has no eligible tutor. Answers the only question worth
 * asking about an unmatched student: what would we have to change?
 *
 * @returns {{
 *   studentId: string,
 *   reasons: Record<string, number>,
 *   nearest: object[],
 *   suggestion: string
 * }}
 */
export function diagnoseUnmatched(student, tutors, opts) {
  const reasons = {};
  const scored = (tutors ?? []).map((t) => scorePair(t, student, opts));

  for (const pair of scored) {
    for (const blocker of pair.blockers) {
      reasons[blocker] = (reasons[blocker] ?? 0) + 1;
    }
  }

  const ineligible = scored.filter((p) => !p.eligible);
  const nearest = [...ineligible]
    .sort((a, b) => a.blockers.length - b.blockers.length || b.score - a.score)
    .slice(0, 3);

  return {
    studentId: student.id,
    reasons,
    nearest,
    suggestion: suggestFix(ineligible, scored.length)
  };
}

/**
 * The one action most likely to unblock this student.
 *
 * Reasons from the CLOSEST candidates rather than the blocker tally. On a
 * roster of any size "no shared time" always wins a headcount — most tutors
 * are busy when any given student is free — so a tally would report that
 * every time and bury the useful case: one tutor who fits perfectly and is
 * simply full. What matters is the smallest set of things standing between
 * this student and the tutor they nearly have.
 *
 * Recruiting advice, not a verdict on anybody.
 */
function suggestFix(ineligible, tutorCount) {
  if (tutorCount === 0) return 'No tutors on the roster yet.';
  if (ineligible.length === 0) return 'This student is matchable.';

  const fewest = Math.min(...ineligible.map((p) => p.blockers.length));
  const closest = ineligible.filter((p) => p.blockers.length === fewest);

  // Among the closest candidates, lead with the most specific obstacle: a
  // single tutor at capacity is a different problem from nobody being free.
  const PRIORITY = ['tutor-at-capacity', 'level-outside-comfort', 'no-shared-goal', 'no-shared-time'];
  const present = new Set(closest.flatMap((p) => p.blockers));
  const leading = PRIORITY.find((b) => present.has(b));

  // Several candidates can tie at the same blocker COUNT while being blocked
  // by different things. What matters for the wording is how many are held up
  // by the leading blocker specifically, not how many tied overall.
  const heldBy = closest.filter((p) => p.blockers.includes(leading)).length;

  switch (leading) {
    case 'tutor-at-capacity':
      return heldBy === 1
        ? 'One tutor fits this student well but is at the maximum they set for themselves. This needs another tutor with the same subject and hours, not more asking.'
        : 'Every otherwise-suitable tutor is at the maximum they set for themselves. This needs another tutor, not more asking.';
    case 'level-outside-comfort':
      return 'No available tutor has said they are comfortable at this English level. Worth asking a tutor whether they would like to try it.';
    case 'no-shared-goal':
      return 'No tutor covers what this student asked for. Recruit for that subject, or ask the student what else would help.';
    case 'no-shared-time':
      return 'Nobody shares a weekend window. Ask this student for one more available slot, or recruit a tutor in a west-coast time zone.';
    default:
      return 'Review the nearest candidates below.';
  }
}
