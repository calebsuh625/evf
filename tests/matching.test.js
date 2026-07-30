/**
 * matching.test.js
 *
 * Known inputs, expected rankings.
 *
 * The fixture is built around the program's real geometry: a Pacific tutor
 * free Friday evening meets a Beijing student free Saturday morning. Every
 * expectation below is a fact about that arrangement rather than about
 * wording, because reasons and weaknesses are returned as `{ code, values }`
 * and translated in the view.
 */

import { describe, it, equal, ok, deepEqual, throws } from './runner.js';
import {
  scorePair,
  rankPairs,
  rankCandidatesFor,
  suggestionsFor,
  suggestPairings,
  diagnoseUnmatched,
  studentsWithNoViableTutor,
  tutorsWithNoViableStudent,
  stalePairings,
  matchingReport,
  meetingWindowsFor,
  indexAvailability,
  indexTutorLoad,
  OVERLAP_TARGET_MINUTES,
  OVERLAP_FLOOR_MINUTES,
  DEFAULT_WEIGHTS,
  BALANCE_WEIGHT
} from '../js/matching.js';

const LA = 'America/Los_Angeles';
const SH = 'Asia/Shanghai';
const REF = '2026-06-17T00:00:00.000Z'; // a Wednesday

/* Friday 17:00–20:00 Pacific == Saturday 08:00–11:00 Beijing. */
const TUTOR_SLOT = { weekday: 5, startTime: '17:00', endTime: '20:00', timezone: LA };
const STUDENT_SLOT = { weekday: 6, startTime: '08:00', endTime: '11:00', timezone: SH };

function tutor(overrides = {}) {
  return {
    id: 'tut_a', role: 'tutor', name: 'Avery Alpha', preferredName: 'Avery',
    timezone: LA, locale: 'en', active: true, acceptingStudents: true,
    subjects: ['reading', 'writing'],
    levelsComfortable: ['beginner', 'intermediate'],
    interests: ['chess', 'cooking'],
    maxStudents: 2,
    ...overrides
  };
}

function student(overrides = {}) {
  return {
    id: 'stu_1', role: 'student', name: 'Ming Nu', preferredName: 'Ming',
    timezone: SH, locale: 'zh', active: true,
    goals: ['reading'],
    englishLevel: 'beginner',
    interests: ['chess'],
    ...overrides
  };
}

/** Build the availability index these functions expect. */
function av(entries) {
  return indexAvailability(
    Object.entries(entries).flatMap(([personId, slots]) => slots.map((s) => ({ personId, ...s })))
  );
}

const BASE_AV = av({ tut_a: [TUTOR_SLOT], stu_1: [STUDENT_SLOT] });

function opts(extra = {}) {
  return { referenceIso: REF, availability: BASE_AV, ...extra };
}

const codes = (list) => list.map((r) => r.code);

/* ================================================================== *
 * Requirements
 * ================================================================== */

describe('scorePair requirements', () => {
  it('needs a reference week and an availability index', () => {
    throws(() => scorePair(tutor(), student(), { availability: BASE_AV }));
    throws(() => scorePair(tutor(), student(), { referenceIso: REF }));
  });

  it('scores a strong pair and marks it eligible', () => {
    const pair = scorePair(tutor(), student(), opts());
    ok(pair.eligible, `blockers: ${pair.blockers}`);
    equal(pair.overlapMinutes, 180);
    deepEqual(pair.sharedGoals, ['reading']);
    deepEqual(pair.sharedInterests, ['chess']);
    ok(pair.levelOk);
  });

  it('never returns a score without reasoning', () => {
    // The rule the whole module is built around.
    const pairs = rankPairs([tutor(), tutor({ id: 'tut_b', subjects: ['latin'] })], [student()], opts());
    for (const pair of pairs) {
      ok(Array.isArray(pair.reasons), `${pair.tutorId} has no reasons array`);
      ok(Array.isArray(pair.weaknesses), `${pair.tutorId} has no weaknesses array`);
      if (pair.eligible) ok(pair.reasons.length > 0, `${pair.tutorId} is eligible but explains nothing`);
    }
  });

  it('sums its breakdown to the score it reports', () => {
    const pair = scorePair(tutor(), student(), opts());
    const sum = Object.values(pair.breakdown).reduce((a, b) => a + b, 0);
    equal(Math.round(sum * 10) / 10, pair.score);
  });
});

/* ================================================================== *
 * 1. Schedule overlap is a hard requirement
 * ================================================================== */

describe('schedule overlap is hard', () => {
  it('never suggests a pair with zero overlap, however well they fit otherwise', () => {
    // Same subject, same level, same interests, same language — and no time.
    const availability = av({
      tut_a: [{ weekday: 6, startTime: '09:00', endTime: '12:00', timezone: LA }],
      stu_1: [STUDENT_SLOT]
    });
    const perfect = scorePair(
      tutor({ locale: 'zh' }),
      student(),
      opts({ availability })
    );
    equal(perfect.overlapMinutes, 0);
    ok(!perfect.eligible);
    ok(perfect.blockers.includes('no-shared-time'));

    // And it is absent from the suggestion list entirely.
    const { candidates } = suggestionsFor([student()], [tutor({ locale: 'zh' })], opts({ availability }))[0];
    deepEqual(candidates, []);
  });

  it('blocks anything under the floor', () => {
    const availability = av({
      tut_a: [{ weekday: 5, startTime: '17:00', endTime: '17:30', timezone: LA }],
      stu_1: [STUDENT_SLOT]
    });
    const pair = scorePair(tutor(), student(), opts({ availability }));
    equal(pair.overlapMinutes, 30);
    ok(pair.overlapMinutes < OVERLAP_FLOOR_MINUTES);
    ok(pair.blockers.includes('no-shared-time'));
  });

  it('caps the overlap component once there is plenty', () => {
    const availability = av({
      tut_a: [{ weekday: 5, startTime: '00:00', endTime: '23:59', timezone: LA }],
      stu_1: [STUDENT_SLOT]
    });
    const pair = scorePair(tutor(), student(), opts({ availability }));
    ok(pair.overlapMinutes >= OVERLAP_TARGET_MINUTES);
    equal(pair.breakdown.overlap, DEFAULT_WEIGHTS.overlap);
  });

  it('reports the shared window in the student\'s own clock', () => {
    const overlap = scorePair(tutor(), student(), opts()).reasons.find((r) => r.code === 'overlap');
    ok(overlap, 'a pair that can meet must say when');
    equal(overlap.values.hours, '3');
    equal(overlap.values.weekday, 6, 'Saturday for the student');
    equal(overlap.values.part, 'morning');
    equal(overlap.values.startTime, '08:00');
    equal(overlap.values.endTime, '11:00');
  });
});

/* ================================================================== *
 * 2-4. Subject, level, interests
 * ================================================================== */

describe('subject and goal fit', () => {
  it('blocks a tutor who does not teach what was asked for', () => {
    const pair = scorePair(tutor(), student({ goals: ['pronunciation'] }), opts());
    ok(pair.blockers.includes('no-shared-goal'));
  });

  it('treats no stated goal as neither match nor mismatch', () => {
    const pair = scorePair(tutor(), student({ goals: [] }), opts());
    ok(pair.eligible);
    equal(pair.breakdown.goals, DEFAULT_WEIGHTS.goals / 2);
  });

  it('scores partial coverage proportionally and says what is missing', () => {
    const pair = scorePair(tutor(), student({ goals: ['reading', 'listening'] }), opts());
    ok(pair.eligible, 'one shared goal is enough to be worth suggesting');
    deepEqual(pair.sharedGoals, ['reading']);
    deepEqual(pair.missingGoals, ['listening']);
    equal(pair.breakdown.goals, DEFAULT_WEIGHTS.goals / 2);
    ok(codes(pair.weaknesses).includes('goals-partial'));
  });

  it('is case- and whitespace-insensitive', () => {
    const pair = scorePair(tutor({ subjects: ['  Reading '] }), student({ goals: ['READING'] }), opts());
    deepEqual(pair.sharedGoals, ['reading']);
  });
});

describe('level appropriateness', () => {
  it('blocks a level the tutor said they do not take', () => {
    const pair = scorePair(tutor(), student({ englishLevel: 'advanced' }), opts());
    ok(pair.blockers.includes('level-outside-comfort'));
    equal(pair.levelOk, false);
    equal(pair.breakdown.level, 0);
  });

  it('treats an unstated comfort range as no constraint, but flags it', () => {
    const pair = scorePair(tutor({ levelsComfortable: [] }), student({ englishLevel: 'advanced' }), opts());
    ok(pair.eligible);
    ok(codes(pair.weaknesses).includes('level-unstated'));
    equal(pair.breakdown.level, DEFAULT_WEIGHTS.level / 2, 'unconfirmed scores below confirmed');
  });

  it('scores a confirmed level above an unstated one', () => {
    const confirmed = scorePair(tutor(), student(), opts());
    const unstated = scorePair(tutor({ levelsComfortable: [] }), student(), opts());
    ok(confirmed.score > unstated.score);
  });
});

describe('shared interests', () => {
  it('rewards a shared interest without ever requiring one', () => {
    const withShared = scorePair(tutor(), student(), opts());
    const without = scorePair(tutor({ interests: ['football'] }), student(), opts());
    ok(withShared.score > without.score);
    ok(without.eligible, 'no shared interest is never a blocker');
    ok(codes(without.weaknesses).includes('no-shared-interests'));
    ok(codes(withShared.reasons).includes('interests'));
  });

  it('scores two shared interests above one', () => {
    const one = scorePair(tutor(), student(), opts());
    const two = scorePair(tutor(), student({ interests: ['chess', 'cooking'] }), opts());
    ok(two.score > one.score);
    equal(two.breakdown.interests, DEFAULT_WEIGHTS.interests);
  });
});

/* ================================================================== *
 * 5. Load balancing
 * ================================================================== */

describe('load balancing', () => {
  it('prefers the emptier of two otherwise identical tutors', () => {
    const empty = tutor({ id: 'tut_empty', maxStudents: 3 });
    const busy = tutor({ id: 'tut_busy', maxStudents: 3 });
    const availability = av({
      tut_empty: [TUTOR_SLOT], tut_busy: [TUTOR_SLOT], stu_1: [STUDENT_SLOT]
    });

    const ranked = rankCandidatesFor(student(), [busy, empty], opts({
      availability,
      tutorLoad: new Map([['tut_busy', 2]])
    }));

    equal(ranked[0].tutorId, 'tut_empty', 'the emptier tutor ranks first');
    ok(ranked[0].score > ranked[1].score);
  });

  it('gives a full tutor no balance credit and blocks them', () => {
    const pair = scorePair(tutor({ maxStudents: 2 }), student(), opts({
      tutorLoad: new Map([['tut_a', 2]])
    }));
    equal(pair.breakdown.balance, 0);
    ok(pair.blockers.includes('tutor-at-capacity'));
    deepEqual(pair.capacity, { used: 2, total: 2, remaining: 0 });
  });

  it('gives an empty tutor the full balance weight', () => {
    equal(scorePair(tutor(), student(), opts()).breakdown.balance, BALANCE_WEIGHT);
  });

  it('spreads students across tutors rather than filling one', () => {
    // Three identical students, two tutors with three places each. A scorer
    // without a balance term would hand all three to whichever tutor sorted
    // first; this one alternates.
    const tutors = [tutor({ id: 'tut_a', maxStudents: 3 }), tutor({ id: 'tut_b', maxStudents: 3 })];
    const students = [student({ id: 's1' }), student({ id: 's2' }), student({ id: 's3' })];
    const availability = av({
      tut_a: [TUTOR_SLOT], tut_b: [TUTOR_SLOT],
      s1: [STUDENT_SLOT], s2: [STUDENT_SLOT], s3: [STUDENT_SLOT]
    });

    const { suggestions } = suggestPairings(tutors, students, opts({ availability }));
    equal(suggestions.length, 3);

    const perTutor = new Map();
    for (const s of suggestions) perTutor.set(s.tutorId, (perTutor.get(s.tutorId) ?? 0) + 1);
    const counts = [...perTutor.values()].sort();
    deepEqual(counts, [1, 2], 'two on one tutor and one on the other, not three and none');
  });

  it('counts existing active pairings against capacity', () => {
    const { suggestions } = suggestPairings(
      [tutor({ maxStudents: 1 })], [student()],
      opts({ pairings: [{ tutorId: 'tut_a', studentId: 'other', status: 'active' }] })
    );
    equal(suggestions.length, 0);
  });

  it('ignores ended pairings when counting capacity', () => {
    const { suggestions } = suggestPairings(
      [tutor({ maxStudents: 1 })], [student()],
      opts({ pairings: [{ tutorId: 'tut_a', studentId: 'other', status: 'ended' }] })
    );
    equal(suggestions.length, 1);
  });
});

/* ================================================================== *
 * Other hard gates
 * ================================================================== */

describe('availability gates', () => {
  it('blocks a tutor who is not taking new students', () => {
    const pair = scorePair(tutor({ acceptingStudents: false }), student(), opts());
    ok(!pair.eligible);
    ok(pair.blockers.includes('tutor-not-accepting'));
  });

  it('blocks an inactive tutor or student', () => {
    ok(scorePair(tutor({ active: false }), student(), opts()).blockers.includes('tutor-inactive'));
    ok(scorePair(tutor(), student({ active: false }), opts()).blockers.includes('student-inactive'));
  });

  it('does not reduce the score for being unavailable', () => {
    // Being full or on a break is a fact about a calendar, not a judgement on
    // the quality of the pairing.
    const base = scorePair(tutor(), student(), opts()).score;
    const paused = scorePair(tutor({ active: false }), student(), opts()).score;
    const notAccepting = scorePair(tutor({ acceptingStudents: false }), student(), opts()).score;
    equal(paused, base);
    equal(notAccepting, base);
  });
});

/* ================================================================== *
 * Reasoning and weaknesses
 * ================================================================== */

describe('reasoning', () => {
  it('gives the reasons a coordinator would repeat to a parent', () => {
    const pair = scorePair(tutor({ maxStudents: 3 }), student(), opts());
    deepEqual(codes(pair.reasons), ['overlap', 'goals', 'level', 'interests', 'capacity']);

    const capacity = pair.reasons.find((r) => r.code === 'capacity');
    deepEqual(capacity.values, { used: 0, total: 3, remaining: 3 });

    const goals = pair.reasons.find((r) => r.code === 'goals');
    deepEqual(goals.values.list, ['reading']);
  });

  it('flags a single shared window as fragile', () => {
    const pair = scorePair(tutor(), student(), opts());
    ok(codes(pair.weaknesses).includes('single-window'));
  });

  it('does not flag fragility when there are several windows', () => {
    const availability = av({
      tut_a: [TUTOR_SLOT, { weekday: 6, startTime: '17:00', endTime: '20:00', timezone: LA }],
      stu_1: [STUDENT_SLOT, { weekday: 0, startTime: '08:00', endTime: '11:00', timezone: SH }]
    });
    const pair = scorePair(tutor(), student(), opts({ availability }));
    ok(pair.windows.length > 1);
    ok(!codes(pair.weaknesses).includes('single-window'));
  });

  it('flags a short overlap with the actual number of minutes', () => {
    const availability = av({
      tut_a: [{ weekday: 5, startTime: '17:00', endTime: '18:00', timezone: LA }],
      stu_1: [STUDENT_SLOT]
    });
    const pair = scorePair(tutor(), student(), opts({ availability }));
    const weak = pair.weaknesses.find((w) => w.code === 'short-overlap');
    ok(weak);
    equal(weak.values.minutes, 60);
  });

  it('flags the tutor\'s last place', () => {
    const pair = scorePair(tutor({ maxStudents: 2 }), student(), opts({
      tutorLoad: new Map([['tut_a', 1]])
    }));
    ok(codes(pair.weaknesses).includes('tutor-last-slot'));
  });

  it('mentions language only where it actually bites', () => {
    // A US tutor and a Chinese student not sharing a language is the norm, so
    // saying it every time would be noise. It matters for a beginner.
    const beginner = scorePair(tutor(), student({ englishLevel: 'beginner' }), opts());
    const intermediate = scorePair(tutor(), student({ englishLevel: 'intermediate' }), opts());
    ok(codes(beginner.weaknesses).includes('no-shared-language'));
    ok(!codes(intermediate.weaknesses).includes('no-shared-language'));
  });

  it('says nothing about language when they share one', () => {
    const pair = scorePair(tutor({ locale: 'zh' }), student(), opts());
    ok(!codes(pair.weaknesses).includes('no-shared-language'));
  });
});

/* ================================================================== *
 * Ranking
 * ================================================================== */

describe('expected rankings', () => {
  const availability = av({
    tut_best: [TUTOR_SLOT],
    tut_nointerest: [TUTOR_SLOT],
    tut_partial: [TUTOR_SLOT],
    tut_short: [{ weekday: 5, startTime: '17:00', endTime: '18:00', timezone: LA }],
    tut_notime: [{ weekday: 2, startTime: '17:00', endTime: '20:00', timezone: LA }],
    stu_1: [STUDENT_SLOT]
  });

  const tutors = [
    // Deliberately out of order in the input.
    tutor({ id: 'tut_notime' }),
    tutor({ id: 'tut_short' }),
    tutor({ id: 'tut_partial', subjects: ['reading'], interests: ['chess'] }),
    tutor({ id: 'tut_nointerest', interests: ['football'] }),
    tutor({ id: 'tut_best' })
  ];
  const target = student({ goals: ['reading', 'writing'] });

  it('ranks by fit, best first', () => {
    const ranked = rankCandidatesFor(target, tutors, opts({ availability }));
    deepEqual(
      ranked.map((p) => p.tutorId),
      ['tut_best', 'tut_nointerest', 'tut_partial', 'tut_short', 'tut_notime']
    );
  });

  it('puts every eligible pair above every ineligible one', () => {
    const ranked = rankCandidatesFor(target, tutors, opts({ availability }));
    const lastEligible = ranked.reduce((acc, p, i) => (p.eligible ? i : acc), -1);
    const firstIneligible = ranked.findIndex((p) => !p.eligible);
    ok(firstIneligible === -1 || lastEligible < firstIneligible);
    // A single 60-minute window clears the floor, so only the tutor with no
    // shared time at all is blocked.
    equal(ranked.filter((p) => p.eligible).length, 4);
    deepEqual(ranked.filter((p) => !p.eligible).map((p) => p.tutorId), ['tut_notime']);
  });

  it('is stable regardless of input order', () => {
    const a = rankCandidatesFor(target, tutors, opts({ availability })).map((p) => p.tutorId);
    const b = rankCandidatesFor(target, [...tutors].reverse(), opts({ availability })).map((p) => p.tutorId);
    deepEqual(a, b);
  });

  it('offers only the top three, best first', () => {
    const [row] = suggestionsFor([target], tutors, opts({ availability, limit: 3 }));
    deepEqual(row.candidates.map((c) => c.tutorId), ['tut_best', 'tut_nointerest', 'tut_partial']);
    equal(row.diagnosis, null, 'a student with candidates needs no diagnosis');
  });

  it('handles empty rosters', () => {
    deepEqual(rankPairs([], [], opts()), []);
    deepEqual(suggestionsFor([], tutors, opts({ availability })), []);
  });
});

/* ================================================================== *
 * Students with no viable tutor
 * ================================================================== */

describe('students with no viable tutor', () => {
  it('leads with the closest obstacle, not the most common one', () => {
    // One tutor fits perfectly but is full; two others share nothing. A tally
    // would report "no shared time" and bury the fixable case.
    const ideal = tutor({ id: 'tut_ideal', maxStudents: 1 });
    const busy1 = tutor({ id: 'tut_busy1', subjects: ['history'] });
    const busy2 = tutor({ id: 'tut_busy2', subjects: ['history'] });
    const availability = av({
      tut_ideal: [TUTOR_SLOT],
      tut_busy1: [{ weekday: 2, startTime: '17:00', endTime: '20:00', timezone: LA }],
      tut_busy2: [{ weekday: 3, startTime: '17:00', endTime: '20:00', timezone: LA }],
      stu_1: [STUDENT_SLOT]
    });

    const report = diagnoseUnmatched(student(), [ideal, busy1, busy2], opts({
      availability, tutorLoad: new Map([['tut_ideal', 1]])
    }));

    equal(report.leading, 'tutor-at-capacity');
    equal(report.fix.code, 'one-tutor-full');
    equal(report.nearest[0].tutorId, 'tut_ideal', 'the near miss ranks first');
    equal(report.reasons['no-shared-time'], 2);
    equal(report.reasons['tutor-at-capacity'], 1);
  });

  it('does not let a redundant blocker push a near miss down the list', () => {
    // A full tutor who is also not accepting has two blockers but only one
    // problem. Counting them separately would make them look further away
    // than a tutor who simply teaches the wrong subject.
    const full = tutor({ id: 'tut_full', maxStudents: 1, acceptingStudents: false });
    const wrongSubject = tutor({ id: 'tut_wrong', subjects: ['history'] });
    const availability = av({ tut_full: [TUTOR_SLOT], tut_wrong: [TUTOR_SLOT], stu_1: [STUDENT_SLOT] });

    const report = diagnoseUnmatched(student(), [full, wrongSubject], opts({
      availability, tutorLoad: new Map([['tut_full', 1]])
    }));
    equal(report.nearest[0].tutorId, 'tut_full');
    equal(report.fix.code, 'one-tutor-full');
  });

  it('says so when the obstacle really is the subject', () => {
    const report = diagnoseUnmatched(student({ goals: ['latin'] }), [tutor()], opts());
    equal(report.leading, 'no-shared-goal');
    equal(report.fix.code, 'no-shared-goal');
  });

  it('says so when the obstacle really is the clock', () => {
    const availability = av({
      tut_a: [{ weekday: 2, startTime: '17:00', endTime: '20:00', timezone: LA }],
      stu_1: [STUDENT_SLOT]
    });
    equal(diagnoseUnmatched(student(), [tutor()], opts({ availability })).leading, 'no-shared-time');
  });

  it('says so when the obstacle is the English level', () => {
    equal(diagnoseUnmatched(student({ englishLevel: 'advanced' }), [tutor()], opts()).leading,
      'level-outside-comfort');
  });

  it('reports an empty roster plainly', () => {
    equal(diagnoseUnmatched(student(), [], opts()).fix.code, 'no-tutors');
  });

  it('lists only the students who genuinely have nobody', () => {
    const matchable = student({ id: 'ok' });
    const stuck = student({ id: 'stuck', goals: ['latin'] });
    const availability = av({ tut_a: [TUTOR_SLOT], ok: [STUDENT_SLOT], stuck: [STUDENT_SLOT] });

    const rows = studentsWithNoViableTutor([matchable, stuck], [tutor()], opts({ availability }));
    deepEqual(rows.map((r) => r.student.id), ['stuck']);
    equal(rows[0].diagnosis.fix.code, 'no-shared-goal');
  });
});

/* ================================================================== *
 * Tutors with capacity and nobody to take
 * ================================================================== */

describe('tutors with capacity and no viable student', () => {
  it('finds a willing tutor nobody fits', () => {
    const idle = tutor({ id: 'tut_idle', subjects: ['latin'] });
    const availability = av({ tut_idle: [TUTOR_SLOT], stu_1: [STUDENT_SLOT] });

    const rows = tutorsWithNoViableStudent([idle], [student()], opts({ availability }));
    deepEqual(rows.map((r) => r.tutor.id), ['tut_idle']);
    equal(rows[0].remaining, 2);
    equal(rows[0].reasons['no-shared-goal'], 1);
  });

  it('excludes a tutor who has somebody they could take', () => {
    deepEqual(tutorsWithNoViableStudent([tutor()], [student()], opts()), []);
  });

  it('excludes a tutor who is full, on a break, or not accepting', () => {
    const availability = av({ tut_a: [TUTOR_SLOT], stu_1: [STUDENT_SLOT] });
    const wrong = [student({ goals: ['latin'] })];
    deepEqual(tutorsWithNoViableStudent([tutor({ maxStudents: 1 })], wrong,
      opts({ availability, tutorLoad: new Map([['tut_a', 1]]) })), []);
    deepEqual(tutorsWithNoViableStudent([tutor({ active: false })], wrong, opts({ availability })), []);
    deepEqual(tutorsWithNoViableStudent([tutor({ acceptingStudents: false })], wrong, opts({ availability })), []);
  });
});

/* ================================================================== *
 * Pairings that no longer overlap
 * ================================================================== */

describe('stale pairings', () => {
  const people = [tutor(), student()];

  it('requires an explicit reference week', () => {
    throws(() => stalePairings([], people, [], {}));
  });

  it('finds an active pairing whose two sides no longer share time', () => {
    const availability = [
      { personId: 'tut_a', weekday: 2, startTime: '17:00', endTime: '20:00', timezone: LA },
      { personId: 'stu_1', ...STUDENT_SLOT }
    ];
    const pairings = [{ id: 'p1', tutorId: 'tut_a', studentId: 'stu_1', status: 'active' }];

    const rows = stalePairings(pairings, people, availability, { referenceIso: REF });
    equal(rows.length, 1);
    equal(rows[0].overlapMinutes, 0);
    equal(rows[0].hadAvailability, true, 'both sides filled it in; the times drifted');
  });

  it('distinguishes drift from somebody never filling it in', () => {
    const availability = [{ personId: 'tut_a', ...TUTOR_SLOT }];
    const pairings = [{ id: 'p1', tutorId: 'tut_a', studentId: 'stu_1', status: 'active' }];
    equal(stalePairings(pairings, people, availability, { referenceIso: REF })[0].hadAvailability, false);
  });

  it('leaves a healthy pairing alone', () => {
    const availability = [
      { personId: 'tut_a', ...TUTOR_SLOT },
      { personId: 'stu_1', ...STUDENT_SLOT }
    ];
    deepEqual(stalePairings(
      [{ id: 'p1', tutorId: 'tut_a', studentId: 'stu_1', status: 'active' }],
      people, availability, { referenceIso: REF }
    ), []);
  });

  it('ignores paused and ended pairings', () => {
    const availability = [{ personId: 'tut_a', ...TUTOR_SLOT }];
    for (const status of ['paused', 'ended']) {
      deepEqual(stalePairings(
        [{ id: 'p1', tutorId: 'tut_a', studentId: 'stu_1', status }],
        people, availability, { referenceIso: REF }
      ), [], status);
    }
  });
});

/* ================================================================== *
 * The whole report
 * ================================================================== */

describe('matchingReport', () => {
  function program(overrides = {}) {
    return {
      version: 4,
      program: { name: 'PeerBridges 2.0', studentTimeZone: SH, terms: [] },
      people: [
        tutor({ id: 'tut_a', maxStudents: 2 }),
        tutor({ id: 'tut_latin', subjects: ['latin'] }),
        student({ id: 'stu_ok' }),
        student({ id: 'stu_stuck', goals: ['latin'], englishLevel: 'advanced' }),
        student({ id: 'stu_paired' })
      ],
      pairings: [{ id: 'p1', tutorId: 'tut_a', studentId: 'stu_paired', status: 'active' }],
      sessions: [],
      availability: [
        { personId: 'tut_a', ...TUTOR_SLOT },
        { personId: 'tut_latin', ...TUTOR_SLOT },
        { personId: 'stu_ok', ...STUDENT_SLOT },
        { personId: 'stu_stuck', ...STUDENT_SLOT },
        { personId: 'stu_paired', ...STUDENT_SLOT }
      ],
      ...overrides
    };
  }

  it('requires a reference week', () => {
    throws(() => matchingReport(program(), {}));
  });

  it('separates matchable from blocked, and skips anyone already paired', () => {
    const report = matchingReport(program(), { referenceIso: REF });
    deepEqual(report.waiting.map((r) => r.student.id), ['stu_ok']);
    deepEqual(report.blocked.map((r) => r.student.id), ['stu_stuck']);
    deepEqual(report.counts, { waiting: 2, matchable: 1, blocked: 1 });
  });

  it('surfaces the idle tutor', () => {
    const report = matchingReport(program(), { referenceIso: REF });
    deepEqual(report.idleTutors.map((r) => r.tutor.id), ['tut_latin']);
  });

  it('surfaces a pairing that has drifted apart', () => {
    const drifted = program({
      availability: [
        { personId: 'tut_a', weekday: 2, startTime: '17:00', endTime: '20:00', timezone: LA },
        { personId: 'stu_paired', ...STUDENT_SLOT }
      ]
    });
    const report = matchingReport(drifted, { referenceIso: REF });
    deepEqual(report.stale.map((r) => r.pairing.id), ['p1']);
  });

  it('every surfaced candidate carries its reasoning', () => {
    const report = matchingReport(program(), { referenceIso: REF });
    for (const row of report.waiting) {
      for (const candidate of row.candidates) {
        ok(candidate.reasons.length > 0, `${candidate.tutorId} explains nothing`);
        ok(candidate.reasons.some((r) => r.code === 'overlap'), 'a suggestion must say when they can meet');
      }
    }
  });

  it('suggests without assigning: the pairings table is untouched', () => {
    const data = program();
    const before = JSON.stringify(data.pairings);
    matchingReport(data, { referenceIso: REF });
    equal(JSON.stringify(data.pairings), before, 'the matcher must never write');
  });
});

describe('meetingWindowsFor', () => {
  it('returns windows long enough to hold a class', () => {
    const windows = meetingWindowsFor(tutor(), student(), opts(), 60);
    equal(windows.length, 1);
    equal(windows[0].minutes, 180);
  });

  it('returns nothing when the shared window is too short', () => {
    const availability = av({
      tut_a: [{ weekday: 5, startTime: '17:00', endTime: '17:30', timezone: LA }],
      stu_1: [STUDENT_SLOT]
    });
    deepEqual(meetingWindowsFor(tutor(), student(), opts({ availability }), 60), []);
  });
});

describe('indexTutorLoad', () => {
  it('counts only active pairings', () => {
    const load = indexTutorLoad([
      { tutorId: 't1', status: 'active' }, { tutorId: 't1', status: 'active' },
      { tutorId: 't1', status: 'ended' }, { tutorId: 't1', status: 'paused' },
      { tutorId: 't2', status: 'active' }
    ]);
    equal(load.get('t1'), 2);
    equal(load.get('t2'), 1);
    equal(load.get('t3'), undefined);
  });
});
