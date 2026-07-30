import { describe, it, equal, ok, deepEqual, throws } from './runner.js';
import {
  scorePair,
  rankPairs,
  suggestPairings,
  meetingWindowsFor,
  diagnoseUnmatched,
  indexAvailability,
  indexTutorLoad,
  OVERLAP_TARGET_MINUTES,
  DEFAULT_WEIGHTS
} from '../js/matching.js';

const REF = '2026-03-07T14:00:00.000Z'; // a Saturday, US clocks on standard time

/** Tutor free Saturday morning Eastern — Saturday night in China. */
function tutor(overrides = {}) {
  return {
    id: 'tut_a',
    role: 'tutor',
    name: 'Avery Alpha',
    active: true,
    locale: 'zh',
    subjects: ['algebra', 'geometry'],
    levelsComfortable: ['beginner', 'intermediate'],
    maxStudents: 2,
    ...overrides
  };
}

function student(overrides = {}) {
  return {
    id: 'stu_1',
    role: 'student',
    name: 'Ming Nu',
    active: true,
    locale: 'zh',
    goals: ['algebra'],
    englishLevel: 'beginner',
    ...overrides
  };
}

const TUTOR_SLOT = { weekday: 6, startTime: '08:00', endTime: '11:00', timezone: 'America/New_York' };
const STUDENT_SLOT = { weekday: 6, startTime: '20:00', endTime: '23:00', timezone: 'Asia/Shanghai' };

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

describe('scorePair', () => {
  it('requires a reference week rather than silently picking one', () => {
    throws(() => scorePair(tutor(), student(), { availability: BASE_AV }));
  });

  it('requires an availability index rather than reading it off the person', () => {
    throws(() => scorePair(tutor(), student(), { referenceIso: REF }));
  });

  it('scores a good pair highly and marks it eligible', () => {
    const pair = scorePair(tutor(), student(), opts());
    ok(pair.eligible, `expected eligible, blockers: ${pair.blockers}`);
    equal(pair.overlapMinutes, 120);
    deepEqual(pair.sharedGoals, ['algebra']);
    ok(pair.levelOk);
    ok(pair.sharedLocale);
    equal(pair.score, 100, 'a perfect fit should score 100');
  });

  it('caps the overlap component at the target', () => {
    const generous = av({
      tut_a: [{ weekday: 6, startTime: '00:00', endTime: '23:59', timezone: 'America/New_York' }],
      stu_1: [STUDENT_SLOT]
    });
    const pair = scorePair(tutor(), student(), opts({ availability: generous }));
    ok(pair.overlapMinutes > OVERLAP_TARGET_MINUTES);
    equal(pair.breakdown.overlap, DEFAULT_WEIGHTS.overlap);
  });

  it('blocks a pair with no shared time', () => {
    const mismatched = av({
      tut_a: [TUTOR_SLOT],
      stu_1: [{ weekday: 6, startTime: '08:00', endTime: '10:00', timezone: 'Asia/Shanghai' }]
    });
    const pair = scorePair(tutor(), student(), opts({ availability: mismatched }));
    ok(!pair.eligible);
    ok(pair.blockers.includes('no-shared-time'));
  });

  it('blocks a pair with no shared goal', () => {
    const pair = scorePair(tutor(), student({ goals: ['chemistry'] }), opts());
    ok(!pair.eligible);
    ok(pair.blockers.includes('no-shared-goal'));
  });

  it('treats a student with no stated goal as neither match nor mismatch', () => {
    const pair = scorePair(tutor(), student({ goals: [] }), opts());
    ok(pair.eligible, 'a student who stated no preference must still be matchable');
    ok(!pair.blockers.includes('no-shared-goal'));
    equal(pair.breakdown.goals, DEFAULT_WEIGHTS.goals / 2);
  });

  it('blocks a level the tutor said they are not comfortable with', () => {
    const pair = scorePair(tutor(), student({ englishLevel: 'advanced' }), opts());
    ok(!pair.eligible);
    ok(pair.blockers.includes('level-outside-comfort'));
    equal(pair.levelOk, false);
    equal(pair.breakdown.level, 0);
  });

  it('treats an unstated comfort range as no constraint at all', () => {
    const pair = scorePair(tutor({ levelsComfortable: [] }), student({ englishLevel: 'advanced' }), opts());
    ok(pair.eligible);
    ok(pair.levelOk);
  });

  it('blocks a tutor already at the maximum they set for themselves', () => {
    const load = new Map([['tut_a', 2]]);
    const pair = scorePair(tutor({ maxStudents: 2 }), student(), opts({ tutorLoad: load }));
    ok(!pair.eligible);
    ok(pair.blockers.includes('tutor-at-capacity'));
  });

  it('leaves the score untouched when a tutor is full or paused', () => {
    // Being at capacity or on a break is a fact about availability, not a
    // demerit against the pairing's quality.
    const base = scorePair(tutor(), student(), opts());
    const full = scorePair(tutor(), student(), opts({ tutorLoad: new Map([['tut_a', 2]]) }));
    const paused = scorePair(tutor({ active: false }), student(), opts());
    equal(full.score, base.score);
    equal(paused.score, base.score);
    ok(paused.blockers.includes('tutor-inactive'));
  });

  it('is case- and whitespace-insensitive about subjects', () => {
    const pair = scorePair(tutor({ subjects: ['  Algebra '] }), student({ goals: ['ALGEBRA'] }), opts());
    deepEqual(pair.sharedGoals, ['algebra']);
  });

  it('scores a shared locale above none, without disqualifying', () => {
    const shared = scorePair(tutor(), student(), opts());
    const not = scorePair(tutor({ locale: 'en' }), student({ locale: 'zh' }), opts());
    equal(shared.score - not.score, DEFAULT_WEIGHTS.locale);
    ok(not.eligible, 'no shared locale is a downside, not a disqualification');
  });

  it('reports a breakdown that sums to the score', () => {
    const pair = scorePair(tutor(), student(), opts());
    const sum = Object.values(pair.breakdown).reduce((a, b) => a + b, 0);
    equal(Math.round(sum * 10) / 10, pair.score);
  });
});

describe('rankPairs', () => {
  const tutors = [
    tutor({ id: 'tut_good' }),
    tutor({ id: 'tut_nolocale', locale: 'en' }),
    tutor({ id: 'tut_notime' })
  ];
  const students = [student()];
  const availability = av({
    tut_good: [TUTOR_SLOT],
    tut_nolocale: [TUTOR_SLOT],
    tut_notime: [{ weekday: 3, startTime: '08:00', endTime: '10:00', timezone: 'America/New_York' }],
    stu_1: [STUDENT_SLOT]
  });
  const o = { referenceIso: REF, availability };

  it('puts eligible pairs above every ineligible one', () => {
    const ranked = rankPairs(tutors, students, o);
    const firstIneligible = ranked.findIndex((p) => !p.eligible);
    const lastEligible = ranked.reduce((acc, p, i) => (p.eligible ? i : acc), -1);
    ok(firstIneligible === -1 || lastEligible < firstIneligible);
  });

  it('ranks the best pair first', () => {
    equal(rankPairs(tutors, students, o)[0].tutorId, 'tut_good');
  });

  it('can drop ineligible pairs entirely', () => {
    const ranked = rankPairs(tutors, students, { ...o, includeIneligible: false });
    ok(ranked.every((p) => p.eligible));
    equal(ranked.length, 2);
  });

  it('is stable: the same input always ranks the same way', () => {
    const a = rankPairs(tutors, students, o).map((p) => p.tutorId);
    const b = rankPairs([...tutors].reverse(), students, o).map((p) => p.tutorId);
    deepEqual(a, b);
  });

  it('handles empty rosters', () => {
    deepEqual(rankPairs([], [], o), []);
    deepEqual(rankPairs(tutors, [], o), []);
  });
});

describe('indexTutorLoad', () => {
  it('counts only active pairings', () => {
    const load = indexTutorLoad([
      { tutorId: 't1', studentId: 's1', status: 'active' },
      { tutorId: 't1', studentId: 's2', status: 'active' },
      { tutorId: 't1', studentId: 's3', status: 'ended' },
      { tutorId: 't1', studentId: 's4', status: 'paused' },
      { tutorId: 't2', studentId: 's5', status: 'active' }
    ]);
    equal(load.get('t1'), 2);
    equal(load.get('t2'), 1);
    equal(load.get('t3'), undefined);
  });
});

describe('suggestPairings', () => {
  const tutors = [tutor({ id: 'tut_a' }), tutor({ id: 'tut_b' })];
  const students = [student({ id: 'stu_1' }), student({ id: 'stu_2' }), student({ id: 'stu_3' })];
  const availability = av({
    tut_a: [TUTOR_SLOT], tut_b: [TUTOR_SLOT],
    stu_1: [STUDENT_SLOT], stu_2: [STUDENT_SLOT], stu_3: [STUDENT_SLOT]
  });
  const o = { referenceIso: REF, availability };

  it('gives each student at most one tutor', () => {
    const { suggestions } = suggestPairings(tutors, students, o);
    const perStudent = new Map();
    for (const s of suggestions) perStudent.set(s.studentId, (perStudent.get(s.studentId) ?? 0) + 1);
    ok([...perStudent.values()].every((n) => n === 1));
  });

  it('respects each tutor\'s own maxStudents within a single run', () => {
    const capped = [tutor({ id: 'tut_a', maxStudents: 1 }), tutor({ id: 'tut_b', maxStudents: 1 })];
    const { suggestions } = suggestPairings(capped, students, o);
    equal(suggestions.length, 2, 'two tutors at one student each');
    const perTutor = new Map();
    for (const s of suggestions) perTutor.set(s.tutorId, (perTutor.get(s.tutorId) ?? 0) + 1);
    ok([...perTutor.values()].every((n) => n === 1));
  });

  it('fills a tutor up to their maximum but no further', () => {
    const one = [tutor({ id: 'tut_a', maxStudents: 3 })];
    equal(suggestPairings(one, students, o).suggestions.length, 3);
    const two = [tutor({ id: 'tut_a', maxStudents: 2 })];
    equal(suggestPairings(two, students, o).suggestions.length, 2);
  });

  it('counts existing active pairings against the maximum', () => {
    const { suggestions } = suggestPairings(
      [tutor({ id: 'tut_a', maxStudents: 1 })], students,
      { ...o, pairings: [{ tutorId: 'tut_a', studentId: 'stu_1', status: 'active' }] }
    );
    equal(suggestions.length, 0, 'tut_a is already full');
  });

  it('ignores ended pairings when counting load', () => {
    const { suggestions } = suggestPairings(
      [tutor({ id: 'tut_a', maxStudents: 1 })], students,
      { ...o, pairings: [{ tutorId: 'tut_a', studentId: 'stu_1', status: 'ended' }] }
    );
    ok(suggestions.length > 0, 'an ended pairing must free the tutor up');
  });

  it('will suggest resuming a paused pairing', () => {
    // Paused means "not right now", not "never again".
    const { suggestions } = suggestPairings(
      [tutor({ id: 'tut_a', maxStudents: 1 })], [student({ id: 'stu_1' })],
      { ...o, pairings: [{ tutorId: 'tut_a', studentId: 'stu_1', status: 'paused' }] }
    );
    equal(suggestions.length, 1);
    equal(suggestions[0].studentId, 'stu_1');
  });

  it('never suggests an ineligible pair', () => {
    const impossible = student({ id: 'stu_x' });
    const availability2 = av({
      tut_a: [TUTOR_SLOT], tut_b: [TUTOR_SLOT],
      stu_x: [{ weekday: 6, startTime: '08:00', endTime: '09:00', timezone: 'Asia/Shanghai' }]
    });
    const { suggestions, unmatchedStudents } =
      suggestPairings(tutors, [impossible], { ...o, availability: availability2 });
    equal(suggestions.length, 0);
    deepEqual(unmatchedStudents, ['stu_x']);
  });

  it('reports who is left over and who still has room', () => {
    const capped = [tutor({ id: 'tut_a', maxStudents: 1 }), tutor({ id: 'tut_b', maxStudents: 1 })];
    const { unmatchedStudents, tutorsWithRoomLeft } = suggestPairings(capped, students, o);
    equal(unmatchedStudents.length, 1, 'three students, two slots');
    deepEqual(tutorsWithRoomLeft, []);
  });
});

describe('meetingWindowsFor', () => {
  it('returns only windows long enough to hold a session', () => {
    const windows = meetingWindowsFor(tutor(), student(), opts(), 60);
    ok(windows.length > 0);
    ok(windows.every((w) => w.minutes >= 60));
  });

  it('returns nothing when the shared window is too short', () => {
    const brief = av({
      tut_a: [TUTOR_SLOT],
      stu_1: [{ weekday: 6, startTime: '22:30', endTime: '23:00', timezone: 'Asia/Shanghai' }]
    });
    deepEqual(meetingWindowsFor(tutor(), student(), opts({ availability: brief }), 60), []);
  });
});

describe('diagnoseUnmatched', () => {
  it('leads with the closest obstacle, not the most common one', () => {
    // One tutor fits perfectly but is full; the others share nothing. A tally
    // would report "no shared time" (2 of 3) and bury the actionable case.
    const ideal = tutor({ id: 'tut_ideal', maxStudents: 1 });
    const busy1 = tutor({ id: 'tut_busy1', subjects: ['history'] });
    const busy2 = tutor({ id: 'tut_busy2', subjects: ['history'] });
    const availability = av({
      tut_ideal: [TUTOR_SLOT],
      tut_busy1: [{ weekday: 3, startTime: '08:00', endTime: '10:00', timezone: 'America/New_York' }],
      tut_busy2: [{ weekday: 2, startTime: '08:00', endTime: '10:00', timezone: 'America/New_York' }],
      stu_1: [STUDENT_SLOT]
    });

    const report = diagnoseUnmatched(student(), [ideal, busy1, busy2], {
      referenceIso: REF,
      availability,
      tutorLoad: new Map([['tut_ideal', 1]])
    });

    equal(report.reasons['no-shared-time'], 2);
    equal(report.reasons['tutor-at-capacity'], 1);
    ok(report.suggestion.includes('One tutor fits'), report.suggestion);
    ok(report.suggestion.includes('another tutor'), report.suggestion);
    equal(report.nearest[0].tutorId, 'tut_ideal', 'the near miss should rank first');
  });

  it('says so when the obstacle really is the subject', () => {
    const report = diagnoseUnmatched(student({ goals: ['latin'] }), [tutor()], opts());
    ok(report.suggestion.includes('covers what this student asked for'), report.suggestion);
  });

  it('says so when the obstacle really is the clock', () => {
    const availability = av({
      tut_a: [{ weekday: 6, startTime: '08:00', endTime: '10:00', timezone: 'Asia/Shanghai' }],
      stu_1: [STUDENT_SLOT]
    });
    const report = diagnoseUnmatched(student(), [tutor()], opts({ availability }));
    ok(report.suggestion.includes('weekend window'), report.suggestion);
  });

  it('says so when the obstacle is the English level', () => {
    const report = diagnoseUnmatched(student({ englishLevel: 'advanced' }), [tutor()], opts());
    ok(report.suggestion.includes('English level'), report.suggestion);
  });

  it('counts blockers across the whole roster', () => {
    const availability = av({
      tut_a: [{ weekday: 6, startTime: '08:00', endTime: '09:00', timezone: 'Asia/Shanghai' }],
      tut_b: [{ weekday: 6, startTime: '08:00', endTime: '09:00', timezone: 'Asia/Shanghai' }],
      stu_x: [STUDENT_SLOT]
    });
    const report = diagnoseUnmatched(
      student({ id: 'stu_x', goals: ['latin'] }),
      [tutor({ id: 'tut_a' }), tutor({ id: 'tut_b' })],
      opts({ availability })
    );
    equal(report.studentId, 'stu_x');
    equal(report.reasons['no-shared-time'], 2);
    equal(report.reasons['no-shared-goal'], 2);
    ok(report.nearest.length > 0 && report.nearest.length <= 3);
  });

  it('reports no reasons when the student is in fact matchable', () => {
    const report = diagnoseUnmatched(student(), [tutor()], opts());
    deepEqual(report.reasons, {});
    deepEqual(report.nearest, []);
    ok(report.suggestion.includes('matchable'));
  });

  it('says so when there are no tutors at all', () => {
    const report = diagnoseUnmatched(student(), [], opts());
    ok(report.suggestion.includes('No tutors'));
  });
});
