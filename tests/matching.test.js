import { describe, it, equal, ok, deepEqual, throws } from './runner.js';
import {
  scorePair,
  rankPairs,
  suggestPairings,
  meetingWindowsFor,
  diagnoseUnmatched,
  OVERLAP_TARGET_MINUTES,
  DEFAULT_WEIGHTS
} from '../js/matching.js';

const REF = '2026-03-07T14:00:00.000Z'; // a Saturday, US clocks on standard time

/** A tutor free Saturday morning Eastern — Saturday night in China. */
function tutor(overrides = {}) {
  return {
    id: 'tut_a',
    displayName: 'Tutor A',
    active: true,
    subjects: ['algebra', 'geometry'],
    languages: ['english', 'mandarin'],
    availability: [{ day: 6, start: '08:00', end: '11:00', tz: 'America/New_York' }],
    ...overrides
  };
}

function student(overrides = {}) {
  return {
    id: 'stu_1',
    displayName: 'Student 1',
    active: true,
    subjects: ['algebra'],
    languages: ['mandarin'],
    availability: [{ day: 6, start: '20:00', end: '23:00', tz: 'Asia/Shanghai' }],
    ...overrides
  };
}

describe('scorePair', () => {
  it('requires a reference week rather than silently picking one', () => {
    throws(() => scorePair(tutor(), student(), {}));
  });

  it('scores a good pair highly and marks it eligible', () => {
    const pair = scorePair(tutor(), student(), { referenceIso: REF });
    ok(pair.eligible, `expected eligible, blockers: ${pair.blockers}`);
    equal(pair.overlapMinutes, 120);
    deepEqual(pair.sharedSubjects, ['algebra']);
    deepEqual(pair.sharedLanguages, ['mandarin']);
    ok(pair.score > 70, `expected a high score, got ${pair.score}`);
  });

  it('caps the overlap component at the target', () => {
    const generous = tutor({
      availability: [{ day: 6, start: '00:00', end: '23:59', tz: 'America/New_York' }]
    });
    const pair = scorePair(generous, student(), { referenceIso: REF });
    ok(pair.overlapMinutes > OVERLAP_TARGET_MINUTES);
    equal(pair.breakdown.overlap, DEFAULT_WEIGHTS.overlap);
  });

  it('blocks a pair with no shared time', () => {
    const mismatched = student({
      availability: [{ day: 6, start: '08:00', end: '10:00', tz: 'Asia/Shanghai' }]
    });
    const pair = scorePair(tutor(), mismatched, { referenceIso: REF });
    ok(!pair.eligible);
    ok(pair.blockers.includes('no-shared-time'));
  });

  it('blocks a pair with no shared subject', () => {
    const pair = scorePair(tutor(), student({ subjects: ['chemistry'] }), { referenceIso: REF });
    ok(!pair.eligible);
    ok(pair.blockers.includes('no-shared-subject'));
  });

  it('treats a student with no stated subject as neither match nor mismatch', () => {
    const pair = scorePair(tutor(), student({ subjects: [] }), { referenceIso: REF });
    ok(pair.eligible, 'a student who stated no preference must still be matchable');
    ok(!pair.blockers.includes('no-shared-subject'));
    equal(pair.breakdown.subject, DEFAULT_WEIGHTS.subject / 2);
  });

  it('blocks inactive people without penalising them', () => {
    const paused = scorePair(tutor({ active: false }), student(), { referenceIso: REF });
    ok(paused.blockers.includes('tutor-inactive'));
    // The score itself is unchanged: being on a break is not a demerit.
    const activePair = scorePair(tutor(), student(), { referenceIso: REF });
    equal(paused.score, activePair.score);
  });

  it('is case- and whitespace-insensitive about subjects', () => {
    const pair = scorePair(
      tutor({ subjects: ['  Algebra '] }),
      student({ subjects: ['ALGEBRA'] }),
      { referenceIso: REF }
    );
    deepEqual(pair.sharedSubjects, ['algebra']);
  });

  it('scores no shared language lower than a shared one', () => {
    const withLang = scorePair(tutor(), student(), { referenceIso: REF });
    const withoutLang = scorePair(
      tutor({ languages: ['english'] }),
      student({ languages: ['mandarin'] }),
      { referenceIso: REF }
    );
    ok(withoutLang.score < withLang.score);
    equal(withLang.score - withoutLang.score, DEFAULT_WEIGHTS.language);
    ok(withoutLang.eligible, 'no shared language is a downside, not a disqualification');
  });
});

describe('rankPairs', () => {
  const tutors = [
    tutor({ id: 'tut_good' }),
    tutor({ id: 'tut_nolang', languages: ['english'] }),
    tutor({ id: 'tut_notime', availability: [{ day: 3, start: '08:00', end: '10:00', tz: 'America/New_York' }] })
  ];
  const students = [student()];

  it('puts eligible pairs above every ineligible one', () => {
    const ranked = rankPairs(tutors, students, { referenceIso: REF });
    const firstIneligible = ranked.findIndex((p) => !p.eligible);
    const lastEligible = ranked.reduce((acc, p, i) => (p.eligible ? i : acc), -1);
    ok(firstIneligible === -1 || lastEligible < firstIneligible);
  });

  it('ranks the best pair first', () => {
    const ranked = rankPairs(tutors, students, { referenceIso: REF });
    equal(ranked[0].tutorId, 'tut_good');
  });

  it('can drop ineligible pairs entirely', () => {
    const ranked = rankPairs(tutors, students, { referenceIso: REF, includeIneligible: false });
    ok(ranked.every((p) => p.eligible));
    equal(ranked.length, 2);
  });

  it('is stable: the same input always ranks the same way', () => {
    const a = rankPairs(tutors, students, { referenceIso: REF }).map((p) => p.tutorId);
    const b = rankPairs([...tutors].reverse(), students, { referenceIso: REF }).map((p) => p.tutorId);
    deepEqual(a, b);
  });

  it('handles empty rosters', () => {
    deepEqual(rankPairs([], [], { referenceIso: REF }), []);
    deepEqual(rankPairs(tutors, [], { referenceIso: REF }), []);
  });
});

describe('suggestPairings', () => {
  const tutors = [tutor({ id: 'tut_a' }), tutor({ id: 'tut_b' })];
  const students = [student({ id: 'stu_1' }), student({ id: 'stu_2' }), student({ id: 'stu_3' })];

  it('gives each student at most one tutor by default', () => {
    const { suggestions } = suggestPairings(tutors, students, { referenceIso: REF });
    const perStudent = new Map();
    for (const s of suggestions) perStudent.set(s.studentId, (perStudent.get(s.studentId) ?? 0) + 1);
    ok([...perStudent.values()].every((n) => n === 1));
  });

  it('respects the tutor load cap', () => {
    const { suggestions } = suggestPairings(tutors, students, {
      referenceIso: REF,
      load: { maxStudentsPerTutor: 1, maxTutorsPerStudent: 1 }
    });
    equal(suggestions.length, 2); // two tutors, one student each
  });

  it('counts existing active matches against the cap', () => {
    const { suggestions } = suggestPairings(tutors, students, {
      referenceIso: REF,
      existingMatches: [{ tutorId: 'tut_a', studentId: 'stu_1', status: 'active' }],
      load: { maxStudentsPerTutor: 1, maxTutorsPerStudent: 1 }
    });
    ok(!suggestions.some((s) => s.tutorId === 'tut_a'), 'tut_a is already at capacity');
    ok(!suggestions.some((s) => s.studentId === 'stu_1'), 'stu_1 already has a tutor');
  });

  it('ignores ended matches when counting load', () => {
    const { suggestions } = suggestPairings(tutors, students, {
      referenceIso: REF,
      existingMatches: [{ tutorId: 'tut_a', studentId: 'stu_1', status: 'ended' }],
      load: { maxStudentsPerTutor: 1, maxTutorsPerStudent: 1 }
    });
    ok(suggestions.some((s) => s.tutorId === 'tut_a'), 'an ended match must free the tutor up');
  });

  it('never suggests an ineligible pair', () => {
    const impossible = student({
      id: 'stu_x',
      availability: [{ day: 6, start: '08:00', end: '09:00', tz: 'Asia/Shanghai' }]
    });
    const { suggestions, unmatchedStudents } = suggestPairings(tutors, [impossible], { referenceIso: REF });
    equal(suggestions.length, 0);
    deepEqual(unmatchedStudents, ['stu_x']);
  });

  it('reports who is left over', () => {
    const { unmatchedStudents, unusedTutors } = suggestPairings(tutors, students, {
      referenceIso: REF,
      load: { maxStudentsPerTutor: 1, maxTutorsPerStudent: 1 }
    });
    // Three students, two tutors capped at one each: one student unplaced.
    equal(unmatchedStudents.length, 1);
    deepEqual(unusedTutors, []);
  });
});

describe('meetingWindowsFor', () => {
  it('returns only windows long enough to hold a session', () => {
    const windows = meetingWindowsFor(tutor(), student(), REF, 60);
    ok(windows.length > 0);
    ok(windows.every((w) => w.minutes >= 60));
  });

  it('returns nothing when the shared window is too short', () => {
    const brief = student({
      availability: [{ day: 6, start: '22:30', end: '23:00', tz: 'Asia/Shanghai' }]
    });
    deepEqual(meetingWindowsFor(tutor(), brief, REF, 60), []);
  });
});

describe('diagnoseUnmatched', () => {
  it('says why, and how close the nearest tutors were', () => {
    const impossible = student({
      id: 'stu_x',
      subjects: ['latin'],
      availability: [{ day: 6, start: '08:00', end: '09:00', tz: 'Asia/Shanghai' }]
    });
    const report = diagnoseUnmatched(impossible, [tutor(), tutor({ id: 'tut_b' })], { referenceIso: REF });

    equal(report.studentId, 'stu_x');
    equal(report.reasons['no-shared-time'], 2);
    equal(report.reasons['no-shared-subject'], 2);
    ok(report.nearest.length > 0 && report.nearest.length <= 3);
  });

  it('reports no reasons when the student is in fact matchable', () => {
    const report = diagnoseUnmatched(student(), [tutor()], { referenceIso: REF });
    deepEqual(report.reasons, {});
    deepEqual(report.nearest, []);
  });
});
