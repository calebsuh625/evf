import { describe, it, equal, ok, deepEqual, throws } from './runner.js';
import {
  sessionMinutes,
  toRoundedHours,
  formatHours,
  filterSessions,
  computeHours,
  summarizeByTutor,
  hoursByMonth,
  activeWeeks,
  programTotals
} from '../js/hours.js';

const NY = 'America/New_York';

function session(overrides = {}) {
  return {
    id: 'ses_1',
    matchId: 'mat_1',
    tutorId: 'tut_a',
    studentId: 'stu_1',
    subject: 'algebra',
    startsAt: '2026-03-07T14:00:00.000Z',
    durationMinutes: 60,
    status: 'held',
    ...overrides
  };
}

const TUTORS = [
  { id: 'tut_a', displayName: 'Tutor A' },
  { id: 'tut_b', displayName: 'Tutor B' },
  { id: 'tut_c', displayName: 'Tutor C' } // never tutored
];

const STUDENTS = [{ id: 'stu_1' }, { id: 'stu_2' }];

describe('sessionMinutes', () => {
  it('counts a held session', () => {
    equal(sessionMinutes(session()), 60);
  });

  it('counts nothing for a canceled session', () => {
    equal(sessionMinutes(session({ status: 'canceled', durationMinutes: 60 })), 0);
  });

  it('counts nothing for an unknown status', () => {
    equal(sessionMinutes(session({ status: 'rescheduled' })), 0);
    equal(sessionMinutes(session({ status: undefined })), 0);
  });

  it('shrugs off malformed durations instead of producing NaN', () => {
    equal(sessionMinutes(session({ durationMinutes: null })), 0);
    equal(sessionMinutes(session({ durationMinutes: 'sixty' })), 0);
    equal(sessionMinutes(session({ durationMinutes: -30 })), 0);
    equal(sessionMinutes(session({ durationMinutes: 0 })), 0);
    equal(sessionMinutes(null), 0);
    equal(sessionMinutes(undefined), 0);
  });

  it('accepts a string that is really a number, as a hand-edited export might hold', () => {
    equal(sessionMinutes(session({ durationMinutes: '45' })), 45);
  });
});

describe('rounding', () => {
  it('rounds to the nearest quarter hour', () => {
    equal(toRoundedHours(60), 1);
    equal(toRoundedHours(45), 0.75);
    equal(toRoundedHours(50), 0.75); // 50 -> 45
    equal(toRoundedHours(53), 1);    // 53 -> 60
    equal(toRoundedHours(0), 0);
  });

  it('formats without trailing noise', () => {
    equal(formatHours(1), '1');
    equal(formatHours(2.5), '2.5');
    equal(formatHours(2.25), '2.25');
    equal(formatHours(0), '0');
  });
});

describe('filterSessions', () => {
  const sessions = [
    session({ id: 's1', tutorId: 'tut_a', startsAt: '2026-02-01T14:00:00.000Z' }),
    session({ id: 's2', tutorId: 'tut_b', startsAt: '2026-03-01T14:00:00.000Z' }),
    session({ id: 's3', tutorId: 'tut_a', startsAt: '2026-04-01T14:00:00.000Z' })
  ];

  it('filters by tutor', () => {
    deepEqual(filterSessions(sessions, { tutorId: 'tut_a' }).map((s) => s.id), ['s1', 's3']);
  });

  it('filters by a half-open range', () => {
    const inRange = filterSessions(sessions, {
      fromIso: '2026-03-01T14:00:00.000Z',
      toIso: '2026-04-01T14:00:00.000Z'
    });
    // from is inclusive, to is exclusive
    deepEqual(inRange.map((s) => s.id), ['s2']);
  });

  it('handles an absent list', () => {
    deepEqual(filterSessions(undefined, {}), []);
  });
});

describe('computeHours', () => {
  const sessions = [
    session({ id: 's1', durationMinutes: 60 }),
    session({ id: 's2', durationMinutes: 45 }),
    session({ id: 's3', durationMinutes: 75 }),
    session({ id: 's4', status: 'canceled', durationMinutes: 60 }),
    session({ id: 's5', tutorId: 'tut_b', durationMinutes: 120 })
  ];

  it('totals one tutor', () => {
    const result = computeHours(sessions, { tutorId: 'tut_a' });
    equal(result.heldCount, 3);
    equal(result.minutes, 180);
    equal(result.hours, 3);
    equal(result.hoursLabel, '3');
  });

  it('counts cancellations separately and never subtracts them', () => {
    const result = computeHours(sessions, { tutorId: 'tut_a' });
    equal(result.canceledCount, 1);
    // Held minutes are unaffected by the cancellation (principle 3).
    equal(result.minutes, 180);
  });

  it('reports the students reached and the date range', () => {
    const result = computeHours(sessions, { tutorId: 'tut_a' });
    deepEqual(result.studentIds, ['stu_1']);
    equal(result.firstSessionIso, '2026-03-07T14:00:00.000Z');
    equal(result.lastSessionIso, '2026-03-07T14:00:00.000Z');
  });

  it('returns zeros rather than nulls for someone with no sessions', () => {
    const result = computeHours(sessions, { tutorId: 'tut_c' });
    equal(result.heldCount, 0);
    equal(result.minutes, 0);
    equal(result.hours, 0);
    equal(result.hoursLabel, '0');
    equal(result.firstSessionIso, null);
    deepEqual(result.studentIds, []);
  });

  it('totals the whole program when no tutor is named', () => {
    equal(computeHours(sessions).minutes, 300);
  });
});

describe('summarizeByTutor', () => {
  const sessions = [
    session({ id: 's1', tutorId: 'tut_a', durationMinutes: 60 }),
    session({ id: 's2', tutorId: 'tut_b', durationMinutes: 120 })
  ];

  it('sorts by minutes, highest first', () => {
    const rows = summarizeByTutor(sessions, TUTORS);
    deepEqual(rows.map((r) => r.tutorId), ['tut_b', 'tut_a', 'tut_c']);
  });

  it('includes tutors with no sessions rather than dropping them', () => {
    const rows = summarizeByTutor(sessions, TUTORS);
    equal(rows.length, 3);
    const idle = rows.find((r) => r.tutorId === 'tut_c');
    ok(idle, 'a tutor with no sessions must still appear');
    equal(idle.hours, 0);
  });

  it('carries the display name through', () => {
    equal(summarizeByTutor(sessions, TUTORS)[0].displayName, 'Tutor B');
  });
});

describe('hoursByMonth', () => {
  it('requires a zone, because month boundaries depend on one', () => {
    throws(() => hoursByMonth([session()], {}));
  });

  it('buckets by month in the given zone, oldest first', () => {
    const sessions = [
      session({ id: 's1', startsAt: '2026-02-14T14:00:00.000Z' }),
      session({ id: 's2', startsAt: '2026-03-07T14:00:00.000Z' }),
      session({ id: 's3', startsAt: '2026-03-14T14:00:00.000Z' })
    ];
    const months = hoursByMonth(sessions, { tz: NY });
    deepEqual(months.map((m) => m.month), ['2026-02', '2026-03']);
    equal(months[1].heldCount, 2);
    equal(months[1].hours, 2);
  });

  it('assigns a late-evening session to the tutor\'s month, not UTC\'s', () => {
    // 01:00 UTC on Apr 1 is 21:00 on Mar 31 in New York. For a US tutor's
    // March hour form, this is a March session.
    const late = session({ startsAt: '2026-04-01T01:00:00.000Z' });
    equal(hoursByMonth([late], { tz: NY })[0].month, '2026-03');
    equal(hoursByMonth([late], { tz: 'UTC' })[0].month, '2026-04');
  });

  it('omits months with no held sessions', () => {
    const sessions = [session({ status: 'canceled', startsAt: '2026-02-14T14:00:00.000Z' })];
    deepEqual(hoursByMonth(sessions, { tz: NY }), []);
  });
});

describe('activeWeeks', () => {
  it('counts distinct weeks with at least one held session', () => {
    const sessions = [
      session({ id: 's1', startsAt: '2026-03-07T14:00:00.000Z' }), // week of Mar 1
      session({ id: 's2', startsAt: '2026-03-08T14:00:00.000Z' }), // week of Mar 8
      session({ id: 's3', startsAt: '2026-03-14T14:00:00.000Z' })  // week of Mar 8
    ];
    equal(activeWeeks(sessions, { tz: NY }), 2);
  });

  it('ignores canceled sessions', () => {
    equal(activeWeeks([session({ status: 'canceled' })], { tz: NY }), 0);
  });

  it('requires a zone', () => {
    throws(() => activeWeeks([session()], {}));
  });
});

describe('programTotals', () => {
  const sessions = [
    session({ id: 's1', tutorId: 'tut_a', studentId: 'stu_1', durationMinutes: 60 }),
    session({ id: 's2', tutorId: 'tut_b', studentId: 'stu_2', durationMinutes: 120 }),
    session({ id: 's3', tutorId: 'tut_a', studentId: 'stu_1', status: 'canceled' })
  ];

  it('rolls up the program', () => {
    const totals = programTotals(sessions, TUTORS, STUDENTS);
    equal(totals.heldCount, 2);
    equal(totals.canceledCount, 1);
    equal(totals.hours, 3);
    equal(totals.activeTutors, 2);
    equal(totals.rosteredTutors, 3);
    equal(totals.studentsReached, 2);
    equal(totals.rosteredStudents, 2);
  });

  it('takes the median over tutors who actually tutored', () => {
    // tut_a: 1h, tut_b: 2h. tut_c has no sessions and must not drag it to 0.
    equal(programTotals(sessions, TUTORS, STUDENTS).medianHoursPerTutor, 1.5);
  });

  it('survives an empty program', () => {
    const totals = programTotals([], [], []);
    equal(totals.heldCount, 0);
    equal(totals.hours, 0);
    equal(totals.medianHoursPerTutor, 0);
    equal(totals.hoursLabel, '0');
  });
});
