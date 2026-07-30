/**
 * matching.js — the pairing scorer.
 *
 * Pure functions. Imports only time.js. No DOM, no store, no i18n.
 *
 * This is the hard problem the product exists to solve: a coordinator holding
 * a list of students and a list of volunteers, fifteen hours apart, trying to
 * work out who can actually meet whom.
 *
 * ── Two rules shape everything here ──────────────────────────────────
 *
 * 1. **Schedule overlap is a hard requirement.** Zero shared time is not a low
 *    score, it is not a pairing. Nothing else can compensate for it, because
 *    there is no session to have.
 *
 * 2. **A score is never surfaced without its reasoning.** Every suggestion
 *    carries `reasons` (why this pair) and `weaknesses` (what is fragile about
 *    it), and the view is expected to show them. A number on its own tells a
 *    coordinator nothing they can act on or explain to a parent.
 *
 * Reasons and weaknesses are returned as `{ code, values }` rather than as
 * English sentences. That keeps this module free of UI copy so the same
 * reasoning renders in Chinese (principle 6), and it makes the tests assert on
 * facts rather than on wording.
 *
 * ── What this module does not do ─────────────────────────────────────
 *
 * It never assigns anybody. It ranks, explains, and hands the list to a human.
 * Greedy rather than optimal is a deliberate choice: a coordinator can predict
 * and defend "we took the best available pair, then the next" to a parent, and
 * cannot defend the output of a global optimiser.
 */

import { overlapWindows, wallPartsInZone } from './time.js';

/* ------------------------------------------------------------------ *
 * Tuning
 * ------------------------------------------------------------------ */

/** Weekly shared minutes that count as fully sufficient. */
export const OVERLAP_TARGET_MINUTES = 180;

/** Below this there is no realistic weekly session, so there is no pairing. */
export const OVERLAP_FLOOR_MINUTES = 45;

/** A single shared window this short is workable but fragile. */
export const FRAGILE_OVERLAP_MINUTES = 90;

export const DEFAULT_WEIGHTS = Object.freeze({
  overlap: 30,    // can they meet at all, and with room to move
  goals: 25,      // does the tutor teach what the student asked for
  level: 20,      // is the tutor comfortable at this English level
  interests: 10   // something to talk about while the English catches up
  // `balance` is added below; it is scored separately because it is a fact
  // about the roster rather than about the pair.
});

/** Spreading students across volunteers rather than loading the best fit. */
export const BALANCE_WEIGHT = 15;

/**
 * Blockers grouped by the underlying problem.
 *
 * "At capacity" and "not accepting" are two ways of saying the same thing
 * about a full tutor, so counting them separately would make a near-miss look
 * twice as far away as it is when ranking the closest candidates.
 */
const BLOCKER_CATEGORY = Object.freeze({
  'no-shared-time': 'time',
  'no-shared-goal': 'subject',
  'level-outside-comfort': 'level',
  'tutor-at-capacity': 'tutor-unavailable',
  'tutor-not-accepting': 'tutor-unavailable',
  'tutor-inactive': 'tutor-unavailable',
  'student-inactive': 'student-unavailable'
});

/** How many distinct problems stand between this pair and a pairing. */
function distanceOf(pair) {
  return new Set(pair.blockers.map((b) => BLOCKER_CATEGORY[b] ?? b)).size;
}

export const BLOCKERS = Object.freeze([
  'no-shared-time',
  'no-shared-goal',
  'level-outside-comfort',
  'tutor-at-capacity',
  'tutor-not-accepting',
  'tutor-inactive',
  'student-inactive'
]);

/* ------------------------------------------------------------------ *
 * Indexes
 * ------------------------------------------------------------------ */

/** Group availability rows by person. */
export function indexAvailability(rows) {
  const index = new Map();
  for (const row of rows ?? []) {
    const list = index.get(row.personId);
    if (list) list.push(row);
    else index.set(row.personId, [row]);
  }
  return index;
}

/** Active-pairing count per tutor. */
export function indexTutorLoad(pairings) {
  const load = new Map();
  for (const p of pairings ?? []) {
    if (p.status !== 'active') continue;
    load.set(p.tutorId, (load.get(p.tutorId) ?? 0) + 1);
  }
  return load;
}

function capacityOf(tutor) {
  const max = Number(tutor.maxStudents);
  return Number.isFinite(max) && max >= 0 ? max : 2;
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

/** Morning / afternoon / evening, for describing a window in words. */
function partOfDay(hour) {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/**
 * Describe a shared window as the student would experience it. The student is
 * the one in the fixed time zone, so their reading is the stable one.
 */
function describeWindow(window, studentTimeZone) {
  const start = wallPartsInZone(window.startUtc, studentTimeZone);
  const end = wallPartsInZone(window.endUtc, studentTimeZone);
  return {
    weekday: start.weekday,
    part: partOfDay(start.hour),
    startTime: `${String(start.hour).padStart(2, '0')}:${String(start.minute).padStart(2, '0')}`,
    endTime: `${String(end.hour).padStart(2, '0')}:${String(end.minute).padStart(2, '0')}`,
    minutes: window.minutes,
    timezone: studentTimeZone
  };
}

/** Minutes as a readable hour count: 180 -> "3", 90 -> "1.5". */
function hoursLabel(minutes) {
  return String(Number((Math.round(minutes / 15) * 15 / 60).toFixed(2)));
}

/* ------------------------------------------------------------------ *
 * Scoring one pair
 * ------------------------------------------------------------------ */

/**
 * Score a single tutor/student pair, with the reasoning that produced it.
 *
 * @param {object} tutor
 * @param {object} student
 * @param {{
 *   referenceIso: string,
 *   availability: Map<string, object[]>,
 *   tutorLoad?: Map<string, number>,
 *   weights?: object
 * }} opts
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

  /* --- schedule --- */
  const windows = overlapWindows(
    availability.get(tutor.id), tutor.timezone,
    availability.get(student.id), student.timezone,
    { referenceIso }
  );
  const overlapMinutes = windows.reduce((total, w) => total + w.minutes, 0);

  /* --- subjects, level, interests --- */
  const tutorSubjects = normalise(tutor.subjects);
  const studentGoals = normalise(student.goals);
  const sharedGoals = intersect(tutorSubjects, studentGoals);
  const missingGoals = [...studentGoals].filter((g) => !tutorSubjects.has(g)).sort();

  const levels = normalise(tutor.levelsComfortable);
  const studentLevel = String(student.englishLevel ?? '').trim().toLowerCase();
  const levelStated = levels.size > 0 && studentLevel !== '';
  const levelOk = !levelStated || levels.has(studentLevel);

  const sharedInterests = intersect(normalise(tutor.interests), normalise(student.interests));

  /* --- capacity --- */
  const total = capacityOf(tutor);
  const used = tutorLoad.get(tutor.id) ?? 0;
  const remaining = total - used;
  const capacity = { used, total, remaining };

  /* --- components --- */
  const overlapScore = clamp01(overlapMinutes / OVERLAP_TARGET_MINUTES);
  const goalScore = studentGoals.size === 0
    ? 0.5 // stated no preference: neither a match nor a mismatch
    : clamp01(sharedGoals.length / studentGoals.size);
  const levelScore = levelOk ? (levelStated ? 1 : 0.5) : 0;
  const interestScore = clamp01(sharedInterests.length / 2);
  // Emptier tutors score higher, which is what spreads the load rather than
  // piling every student onto whoever happens to fit best.
  const balanceScore = total === 0 ? 0 : clamp01(remaining / total);

  const breakdown = {
    overlap: round1(overlapScore * weights.overlap),
    goals: round1(goalScore * weights.goals),
    level: round1(levelScore * weights.level),
    interests: round1(interestScore * weights.interests),
    balance: round1(balanceScore * BALANCE_WEIGHT)
  };
  const score = round1(Object.values(breakdown).reduce((a, b) => a + b, 0));

  /* --- hard gates --- */
  const blockers = [];
  if (overlapMinutes < OVERLAP_FLOOR_MINUTES) blockers.push('no-shared-time');
  if (studentGoals.size > 0 && sharedGoals.length === 0) blockers.push('no-shared-goal');
  if (!levelOk) blockers.push('level-outside-comfort');
  if (tutor.active === false) blockers.push('tutor-inactive');
  if (student.active === false) blockers.push('student-inactive');
  if (tutor.acceptingStudents === false) blockers.push('tutor-not-accepting');
  if (remaining <= 0) blockers.push('tutor-at-capacity');

  /* --- reasoning --- */
  const reasons = [];
  const weaknesses = [];

  if (overlapMinutes > 0) {
    const first = describeWindow(windows[0], student.timezone);
    reasons.push({
      code: 'overlap',
      values: {
        hours: hoursLabel(overlapMinutes),
        minutes: overlapMinutes,
        weekday: first.weekday,
        part: first.part,
        startTime: first.startTime,
        endTime: first.endTime,
        windows: windows.length
      }
    });
  }
  if (sharedGoals.length) reasons.push({ code: 'goals', values: { list: sharedGoals, count: sharedGoals.length } });
  if (levelOk && levelStated) reasons.push({ code: 'level', values: { level: studentLevel } });
  if (sharedInterests.length) {
    reasons.push({ code: 'interests', values: { list: sharedInterests, count: sharedInterests.length } });
  }
  if (remaining > 0) reasons.push({ code: 'capacity', values: { used, total, remaining } });

  /* Weaknesses are things a coordinator should know before accepting, none of
   * which stop the pairing. Saying them out loud is what makes the suggestion
   * trustworthy. */
  if (overlapMinutes >= OVERLAP_FLOOR_MINUTES) {
    if (windows.length === 1) weaknesses.push({ code: 'single-window', values: {} });
    if (overlapMinutes < FRAGILE_OVERLAP_MINUTES) {
      weaknesses.push({ code: 'short-overlap', values: { minutes: overlapMinutes } });
    }
  }
  if (studentGoals.size > 0 && missingGoals.length && sharedGoals.length) {
    weaknesses.push({ code: 'goals-partial', values: { list: missingGoals, count: missingGoals.length } });
  }
  if (!levelStated) weaknesses.push({ code: 'level-unstated', values: {} });
  if (!sharedInterests.length) weaknesses.push({ code: 'no-shared-interests', values: {} });
  // A US tutor and a Chinese student not sharing a language is the norm here,
  // so flagging it on every pair would be noise. It is only worth saying when
  // the student cannot yet fall back on English.
  if (studentLevel === 'beginner' && tutor.locale && student.locale && tutor.locale !== student.locale) {
    weaknesses.push({ code: 'no-shared-language', values: {} });
  }
  if (remaining === 1 && total > 1) weaknesses.push({ code: 'tutor-last-slot', values: {} });

  return {
    tutorId: tutor.id,
    studentId: student.id,
    score,
    eligible: blockers.length === 0,
    blockers,
    reasons,
    weaknesses,
    overlapMinutes,
    windows,
    sharedGoals,
    missingGoals,
    sharedInterests,
    levelOk,
    capacity,
    breakdown
  };
}

/* ------------------------------------------------------------------ *
 * Ranking
 * ------------------------------------------------------------------ */

function comparePairs(a, b) {
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  if (b.score !== a.score) return b.score - a.score;
  if (b.overlapMinutes !== a.overlapMinutes) return b.overlapMinutes - a.overlapMinutes;
  // Stable, data-independent tiebreak so the same roster always ranks the
  // same way. A list that reshuffles between visits is not trustworthy.
  return `${a.tutorId}|${a.studentId}`.localeCompare(`${b.tutorId}|${b.studentId}`);
}

/** Every tutor ranked for one student, best first. */
export function rankCandidatesFor(student, tutors, opts) {
  const { includeIneligible = true } = opts ?? {};
  return (tutors ?? [])
    .map((tutor) => scorePair(tutor, student, opts))
    .filter((pair) => pair.eligible || includeIneligible)
    .sort(comparePairs);
}

/** Every candidate pair across both lists, best first. */
export function rankPairs(tutors, students, opts) {
  const { includeIneligible = true } = opts ?? {};
  const pairs = [];
  for (const tutor of tutors ?? []) {
    for (const student of students ?? []) {
      const pair = scorePair(tutor, student, opts);
      if (pair.eligible || includeIneligible) pairs.push(pair);
    }
  }
  return pairs.sort(comparePairs);
}

/* ------------------------------------------------------------------ *
 * The matching screen's data
 * ------------------------------------------------------------------ */

/**
 * For each unpaired student, their best candidates with full reasoning.
 *
 * This is what the coordinator reads. It deliberately does NOT assign: every
 * student is scored against every tutor independently, so a coordinator who
 * disagrees with the top suggestion can take the second without the list
 * rearranging itself underneath them.
 *
 * @param {object[]} students already filtered to those needing a tutor
 * @param {object[]} tutors
 * @param {object} opts as scorePair, plus `limit`
 * @returns {Array<{student, candidates: object[], diagnosis: object|null}>}
 */
export function suggestionsFor(students, tutors, opts) {
  const { limit = 3 } = opts ?? {};

  return (students ?? []).map((student) => {
    const ranked = rankCandidatesFor(student, tutors, opts);
    const eligible = ranked.filter((p) => p.eligible);

    return {
      student,
      candidates: eligible.slice(0, limit),
      // Only diagnose when there is nothing to offer; otherwise the screen
      // would explain a problem the coordinator does not have.
      diagnosis: eligible.length === 0 ? diagnose(student, ranked, tutors.length) : null
    };
  });
}

/**
 * Greedy assignment across the whole roster, respecting each tutor's own
 * maximum. Suggestions only — nothing is written anywhere.
 */
export function suggestPairings(tutors, students, opts) {
  const { pairings = [] } = opts ?? {};
  const tutorLoad = indexTutorLoad(pairings);
  const capacity = new Map((tutors ?? []).map((t) => [t.id, capacityOf(t)]));
  const placed = new Set();
  const taken = new Set();

  for (const p of pairings) {
    if (p.status !== 'active') continue;
    placed.add(p.studentId);
    taken.add(`${p.tutorId}|${p.studentId}`);
  }

  /*
   * One assignment per round, re-scoring in between.
   *
   * Ranking once up front and walking the list looks equivalent and is not:
   * the balance term would then be computed against the starting load and
   * never see the load it was itself creating, so every student would be
   * handed to whichever tutor happened to score best and the balancing would
   * silently do nothing. Re-scoring each round is what actually spreads them.
   */
  const suggestions = [];
  const remainingStudents = () => (students ?? []).filter((s) => !placed.has(s.id));

  while (remainingStudents().length) {
    const ranked = rankPairs(tutors, remainingStudents(), {
      ...opts, tutorLoad, includeIneligible: false
    });

    const next = ranked.find((pair) =>
      !taken.has(`${pair.tutorId}|${pair.studentId}`) &&
      (tutorLoad.get(pair.tutorId) ?? 0) < (capacity.get(pair.tutorId) ?? 2));

    if (!next) break; // nobody left who can be placed

    suggestions.push(next);
    placed.add(next.studentId);
    taken.add(`${next.tutorId}|${next.studentId}`);
    tutorLoad.set(next.tutorId, (tutorLoad.get(next.tutorId) ?? 0) + 1);
  }

  return {
    suggestions,
    unmatchedStudents: (students ?? [])
      .filter((s) => s.active !== false && !placed.has(s.id))
      .map((s) => s.id),
    tutorsWithRoomLeft: (tutors ?? [])
      .filter((t) => t.active !== false && t.acceptingStudents !== false)
      .map((t) => ({ tutorId: t.id, remaining: (capacity.get(t.id) ?? 2) - (tutorLoad.get(t.id) ?? 0) }))
      .filter((row) => row.remaining > 0)
  };
}

/* ------------------------------------------------------------------ *
 * The three things a coordinator needs surfaced
 * ------------------------------------------------------------------ */

/**
 * Why this student cannot be matched, and what would change it.
 *
 * Reasons from the CLOSEST candidates rather than a blocker tally. On any real
 * roster "no shared time" wins a headcount every time — most tutors are busy
 * when any given student is free — which would bury the useful case of one
 * tutor who fits perfectly and is simply full.
 */
function diagnose(student, ranked, tutorCount) {
  const reasons = {};
  for (const pair of ranked) {
    for (const blocker of pair.blockers) reasons[blocker] = (reasons[blocker] ?? 0) + 1;
  }

  const ineligible = ranked.filter((p) => !p.eligible);
  const nearest = [...ineligible]
    .sort((a, b) => distanceOf(a) - distanceOf(b) || b.score - a.score)
    .slice(0, 3);

  let leading = null;
  let heldBy = 0;

  if (ineligible.length) {
    const fewest = Math.min(...ineligible.map(distanceOf));
    const closest = ineligible.filter((p) => distanceOf(p) === fewest);
    // Most specific obstacle first: one tutor at capacity is a different
    // problem, with a different fix, from nobody being free.
    const PRIORITY = [
      'tutor-at-capacity', 'tutor-not-accepting', 'level-outside-comfort',
      'no-shared-goal', 'no-shared-time', 'tutor-inactive', 'student-inactive'
    ];
    const present = new Set(closest.flatMap((p) => p.blockers));
    leading = PRIORITY.find((b) => present.has(b)) ?? null;
    heldBy = closest.filter((p) => p.blockers.includes(leading)).length;
  }

  return {
    studentId: student.id,
    reasons,
    nearest,
    leading,
    heldBy,
    tutorCount,
    // What the coordinator should go and do, as a code the view translates.
    fix: fixFor(leading, heldBy, tutorCount)
  };
}

function fixFor(leading, heldBy, tutorCount) {
  if (tutorCount === 0) return { code: 'no-tutors', values: {} };
  if (!leading) return { code: 'matchable', values: {} };
  if (leading === 'tutor-at-capacity') {
    return { code: heldBy === 1 ? 'one-tutor-full' : 'all-tutors-full', values: { heldBy } };
  }
  return { code: leading, values: { heldBy } };
}

/** Exposed for a coordinator looking at one student in isolation. */
export function diagnoseUnmatched(student, tutors, opts) {
  return diagnose(student, rankCandidatesFor(student, tutors, opts), (tutors ?? []).length);
}

/**
 * Students nobody can currently take, with the reason for each.
 */
export function studentsWithNoViableTutor(students, tutors, opts) {
  return suggestionsFor(students, tutors, opts)
    .filter((row) => row.candidates.length === 0)
    .map((row) => ({ student: row.student, diagnosis: row.diagnosis }));
}

/**
 * Volunteers sitting idle: room for a student, and nobody they can take.
 *
 * The mirror image of the above, and the one a coordinator is most likely to
 * miss — an unused volunteer does not complain, they just drift away.
 */
export function tutorsWithNoViableStudent(tutors, students, opts) {
  const { tutorLoad = new Map() } = opts ?? {};

  return (tutors ?? [])
    .filter((t) => t.active !== false && t.acceptingStudents !== false)
    .map((tutor) => {
      const remaining = capacityOf(tutor) - (tutorLoad.get(tutor.id) ?? 0);
      if (remaining <= 0) return null;

      const ranked = (students ?? []).map((student) => scorePair(tutor, student, opts));
      if (ranked.some((p) => p.eligible)) return null;

      const reasons = {};
      for (const pair of ranked) {
        for (const blocker of pair.blockers) reasons[blocker] = (reasons[blocker] ?? 0) + 1;
      }
      return {
        tutor,
        remaining,
        reasons,
        nearest: ranked.sort((a, b) => a.blockers.length - b.blockers.length || b.score - a.score).slice(0, 2)
      };
    })
    .filter(Boolean);
}

/**
 * Active pairings whose two sides no longer share any time.
 *
 * Availability drifts — a term starts, a school timetable changes, the US
 * moves its clocks. A pairing that quietly stopped being schedulable will not
 * announce itself, and the tutor and student are usually too polite to say so.
 *
 * @returns {Array<{pairing, tutor, student, overlapMinutes, hadAvailability}>}
 */
export function stalePairings(pairings, people, availability, opts) {
  const { referenceIso } = opts ?? {};
  if (!referenceIso) throw new TypeError('stalePairings requires opts.referenceIso');

  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  const index = indexAvailability(availability);

  return (pairings ?? [])
    .filter((p) => p.status === 'active')
    .map((pairing) => {
      const tutor = byId.get(pairing.tutorId);
      const student = byId.get(pairing.studentId);
      if (!tutor || !student) return null;

      const tutorRows = index.get(tutor.id) ?? [];
      const studentRows = index.get(student.id) ?? [];
      const windows = overlapWindows(
        tutorRows, tutor.timezone, studentRows, student.timezone, { referenceIso }
      );
      const overlapMinutes = windows.reduce((total, w) => total + w.minutes, 0);
      if (overlapMinutes >= OVERLAP_FLOOR_MINUTES) return null;

      return {
        pairing,
        tutor,
        student,
        overlapMinutes,
        // Distinguishes "their times stopped lining up" from "one of them
        // never filled this in", which need different conversations.
        hadAvailability: tutorRows.length > 0 && studentRows.length > 0
      };
    })
    .filter(Boolean);
}

/**
 * Everything the matching screen renders, in one pass.
 *
 * @param {object} data the program document
 * @param {{referenceIso: string, limit?: number, weights?: object}} opts
 */
export function matchingReport(data, opts) {
  const { referenceIso, limit = 3 } = opts ?? {};
  if (!referenceIso) throw new TypeError('matchingReport requires opts.referenceIso');

  const availability = indexAvailability(data.availability);
  const tutorLoad = indexTutorLoad(data.pairings);
  const scoring = { referenceIso, availability, tutorLoad, limit, weights: opts.weights };

  const tutors = data.people.filter((p) => p.role === 'tutor');
  const students = data.people.filter((p) => p.role === 'student');

  const pairedStudentIds = new Set(
    data.pairings.filter((p) => p.status === 'active').map((p) => p.studentId)
  );
  const waiting = students.filter((s) => s.active !== false && !pairedStudentIds.has(s.id));

  const suggestions = suggestionsFor(waiting, tutors, scoring);

  return {
    referenceIso,
    waiting: suggestions.filter((row) => row.candidates.length > 0),
    blocked: suggestions.filter((row) => row.candidates.length === 0),
    idleTutors: tutorsWithNoViableStudent(tutors, waiting, scoring),
    stale: stalePairings(data.pairings, data.people, data.availability, scoring),
    counts: {
      waiting: waiting.length,
      matchable: suggestions.filter((row) => row.candidates.length > 0).length,
      blocked: suggestions.filter((row) => row.candidates.length === 0).length
    }
  };
}

/**
 * Concrete meeting windows for a pair, once a suggestion is accepted.
 */
export function meetingWindowsFor(tutor, student, opts, minMinutes = 60) {
  const { referenceIso, availability } = opts ?? {};
  return overlapWindows(
    availability.get(tutor.id), tutor.timezone,
    availability.get(student.id), student.timezone,
    { referenceIso }
  ).filter((w) => w.minutes >= minMinutes);
}
