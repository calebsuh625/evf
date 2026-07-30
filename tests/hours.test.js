import { describe, it, equal, ok, deepEqual, throws } from './runner.js';
import {
  sessionContactMinutes,
  sessionVolunteerMinutes,
  toRoundedHours,
  formatHours,
  indexPairings,
  peopleForSession,
  filterSessions,
  computeHours,
  summarizeByTutor,
  summarizeByStudent,
  hoursByMonth,
  activeWeeks,
  pairingsNeedingCheckIn,
  programTotals
} from '../js/hours.js';

const NY = 'America/New_York';

const PAIRINGS = [
  { id: 'p1', tutorId: 't1', studentId: 's1', status: 'active' },
  { id: 'p2', tutorId: 't2', studentId: 's2', status: 'active' },
  { id: 'p3', tutorId: 't1', studentId: 's2', status: 'ended' },
  { id: 'p4', tutorId: 't3', studentId: 's3', status: 'active' } // never met
];

const PEOPLE = [
  { id: 't1', role: 'tutor', name: 'Avery Alpha', preferredName: 'Avery' },
  { id: 't2', role: 'tutor', name: 'Blake Beta', preferredName: 'Blake' },
  { id: 't3', role: 'tutor', name: 'Corin Gamma', preferredName: 'Corin' },
  { id: 't4', role: 'tutor', name: 'Devon Delta', preferredName: 'Devon' }, // never tutored
  { id: 's1', role: 'student', name: 'Ming Nu', preferredName: 'Ming' },
  { id: 's2', role: 'student', name: 'Yara Xi', preferredName: 'Yara' },
  { id: 's3', role: 'student', name: 'Bo Omicron', preferredName: 'Bo' }
];

function session(overrides = {}) {
  return {
    id: 'x1',
    pairingId: 'p1',
    scheduledAt: '2026-03-07T14:00:00.000Z',
    occurred: true,
    durationMinutes: 60,
    prepMinutes: 0,
    followupMinutes: 0,
    covered: '',
    homework: '',
    loggedAt: '2026-03-07T15:00:00.000Z',
    ...overrides
  };
}

describe('session minutes', () => {
  it('counts contact time for a session that happened', () => {
    equal(sessionContactMinutes(session()), 60);
  });

  it('adds prep and follow-up into volunteer time', () => {
    const s = session({ durationMinutes: 60, prepMinutes: 15, followupMinutes: 10 });
    equal(sessionContactMinutes(s), 60);
    equal(sessionVolunteerMinutes(s), 85);
  });

  it('counts nothing for a session that did not happen', () => {
    const s = session({ occurred: false, durationMinutes: 60, prepMinutes: 15 });
    equal(sessionContactMinutes(s), 0);
    equal(sessionVolunteerMinutes(s), 0);
  });

  it('requires occurred to be exactly true, not merely truthy', () => {
    equal(sessionContactMinutes(session({ occurred: 'yes' })), 0);
    equal(sessionContactMinutes(session({ occurred: 1 })), 0);
    equal(sessionContactMinutes(session({ occurred: undefined })), 0);
  });

  it('shrugs off malformed minutes instead of producing NaN', () => {
    for (const bad of [null, 'sixty', -30, 0, undefined, NaN]) {
      equal(sessionContactMinutes(session({ durationMinutes: bad })), 0, `duration ${String(bad)}`);
    }
    equal(sessionVolunteerMinutes(session({ durationMinutes: 60, prepMinutes: 'ten' })), 60);
    equal(sessionContactMinutes(null), 0);
    equal(sessionVolunteerMinutes(undefined), 0);
  });

  it('accepts a numeric string, as a hand-edited export might hold', () => {
    equal(sessionContactMinutes(session({ durationMinutes: '45' })), 45);
  });
});

describe('rounding', () => {
  it('rounds to the nearest quarter hour', () => {
    equal(toRoundedHours(60), 1);
    equal(toRoundedHours(45), 0.75);
    equal(toRoundedHours(50), 0.75);
    equal(toRoundedHours(53), 1);
    equal(toRoundedHours(0), 0);
  });

  it('formats without trailing noise', () => {
    equal(formatHours(1), '1');
    equal(formatHours(2.5), '2.5');
    equal(formatHours(2.25), '2.25');
    equal(formatHours(0), '0');
  });
});

describe('resolving a session to its people', () => {
  it('goes through the pairing', () => {
    const { tutorId, studentId } = peopleForSession(session(), PAIRINGS);
    equal(tutorId, 't1');
    equal(studentId, 's1');
  });

  it('returns nulls rather than guessing when the pairing is gone', () => {
    const { tutorId, studentId, pairing } = peopleForSession(session({ pairingId: 'ghost' }), PAIRINGS);
    equal(tutorId, null);
    equal(studentId, null);
    equal(pairing, null);
  });

  it('indexPairings maps id to pairing', () => {
    equal(indexPairings(PAIRINGS).get('p2').tutorId, 't2');
    equal(indexPairings(undefined).size, 0);
  });
});

describe('filterSessions', () => {
  const sessions = [
    session({ id: 'a', pairingId: 'p1', scheduledAt: '2026-02-01T14:00:00.000Z' }),
    session({ id: 'b', pairingId: 'p2', scheduledAt: '2026-03-01T14:00:00.000Z' }),
    session({ id: 'c', pairingId: 'p3', scheduledAt: '2026-04-01T14:00:00.000Z' }),
    session({ id: 'd', pairingId: 'p1', scheduledAt: '2026-05-01T14:00:00.000Z', occurred: false })
  ];

  it('filters by tutor through the pairing table', () => {
    // t1 owns p1 and p3.
    deepEqual(filterSessions(sessions, PAIRINGS, { tutorId: 't1' }).map((s) => s.id), ['a', 'c', 'd']);
  });

  it('filters by student through the pairing table', () => {
    // s2 appears in p2 and p3.
    deepEqual(filterSessions(sessions, PAIRINGS, { studentId: 's2' }).map((s) => s.id), ['b', 'c']);
  });

  it('filters by pairing directly', () => {
    deepEqual(filterSessions(sessions, PAIRINGS, { pairingId: 'p1' }).map((s) => s.id), ['a', 'd']);
  });

  it('filters by a half-open range', () => {
    const inRange = filterSessions(sessions, PAIRINGS, {
      fromIso: '2026-03-01T14:00:00.000Z',
      toIso: '2026-04-01T14:00:00.000Z'
    });
    deepEqual(inRange.map((s) => s.id), ['b']);
  });

  it('can restrict to sessions that happened', () => {
    deepEqual(filterSessions(sessions, PAIRINGS, { occurredOnly: true }).map((s) => s.id), ['a', 'b', 'c']);
  });

  it('excludes an orphaned session from person-scoped queries rather than guessing', () => {
    const orphan = [session({ id: 'z', pairingId: 'ghost' })];
    deepEqual(filterSessions(orphan, PAIRINGS, { tutorId: 't1' }), []);
    // With no person filter there is nothing to resolve, so it is included.
    equal(filterSessions(orphan, PAIRINGS, {}).length, 1);
  });

  it('handles absent lists', () => {
    deepEqual(filterSessions(undefined, undefined, {}), []);
  });
});

describe('computeHours', () => {
  const sessions = [
    session({ id: 'a', pairingId: 'p1', durationMinutes: 60, prepMinutes: 10, followupMinutes: 5 }),
    session({ id: 'b', pairingId: 'p1', durationMinutes: 45, prepMinutes: 0, followupMinutes: 0 }),
    session({ id: 'c', pairingId: 'p3', durationMinutes: 75, prepMinutes: 5, followupMinutes: 0 }),
    session({ id: 'd', pairingId: 'p1', occurred: false, durationMinutes: 60 }),
    session({ id: 'e', pairingId: 'p2', durationMinutes: 120, prepMinutes: 0, followupMinutes: 0 })
  ];

  it('totals one tutor across all their pairings', () => {
    // t1 owns p1 (60+45) and p3 (75) = 180 contact minutes.
    const r = computeHours(sessions, PAIRINGS, { tutorId: 't1' });
    equal(r.occurredCount, 3);
    equal(r.contactMinutes, 180);
    equal(r.contactHours, 3);
    equal(r.volunteerMinutes, 200); // + 15 prep/followup + 5 prep
    equal(r.volunteerHours, 3.25);
    equal(r.hoursLabel, '3.25');
  });

  it('reports prep and follow-up separately', () => {
    const r = computeHours(sessions, PAIRINGS, { tutorId: 't1' });
    equal(r.prepMinutes, 15);
    equal(r.followupMinutes, 5);
  });

  it('counts sessions that did not happen separately and never subtracts them', () => {
    const r = computeHours(sessions, PAIRINGS, { tutorId: 't1' });
    equal(r.missedCount, 1);
    equal(r.contactMinutes, 180, 'a missed session must not reduce the total');
  });

  it('reports the students reached and the date range', () => {
    const r = computeHours(sessions, PAIRINGS, { tutorId: 't1' });
    deepEqual(r.studentIds, ['s1', 's2']);
    deepEqual(r.pairingIds, ['p1', 'p3']);
    equal(r.firstSessionIso, '2026-03-07T14:00:00.000Z');
  });

  it('returns zeros rather than nulls for someone with no sessions', () => {
    const r = computeHours(sessions, PAIRINGS, { tutorId: 't4' });
    equal(r.occurredCount, 0);
    equal(r.volunteerMinutes, 0);
    equal(r.volunteerHours, 0);
    equal(r.hoursLabel, '0');
    equal(r.firstSessionIso, null);
    deepEqual(r.studentIds, []);
  });

  it('totals the whole program when no person is named', () => {
    equal(computeHours(sessions, PAIRINGS).contactMinutes, 300);
  });
});

describe('summarizeByTutor', () => {
  const tutors = PEOPLE.filter((p) => p.role === 'tutor');
  const sessions = [
    session({ id: 'a', pairingId: 'p1', durationMinutes: 60 }),
    session({ id: 'b', pairingId: 'p2', durationMinutes: 120 })
  ];

  it('sorts by volunteer minutes, highest first', () => {
    deepEqual(summarizeByTutor(sessions, PAIRINGS, tutors).map((r) => r.tutorId),
      ['t2', 't1', 't3', 't4']);
  });

  it('includes tutors with no sessions rather than dropping them', () => {
    const rows = summarizeByTutor(sessions, PAIRINGS, tutors);
    equal(rows.length, 4);
    equal(rows.find((r) => r.tutorId === 't4').volunteerHours, 0);
  });

  it('prefers the name the tutor chose', () => {
    equal(summarizeByTutor(sessions, PAIRINGS, tutors)[0].name, 'Blake');
  });

  it('summarizeByStudent works the same way from the other side', () => {
    const students = PEOPLE.filter((p) => p.role === 'student');
    const rows = summarizeByStudent(sessions, PAIRINGS, students);
    equal(rows.find((r) => r.studentId === 's1').contactMinutes, 60);
    equal(rows.find((r) => r.studentId === 's2').contactMinutes, 120);
    equal(rows.find((r) => r.studentId === 's3').contactMinutes, 0);
  });
});

describe('hoursByMonth', () => {
  it('requires a zone, because month boundaries depend on one', () => {
    throws(() => hoursByMonth([session()], PAIRINGS, {}));
  });

  it('buckets by month in the given zone, oldest first', () => {
    const sessions = [
      session({ id: 'a', scheduledAt: '2026-02-14T14:00:00.000Z' }),
      session({ id: 'b', scheduledAt: '2026-03-07T14:00:00.000Z' }),
      session({ id: 'c', scheduledAt: '2026-03-14T14:00:00.000Z' })
    ];
    const months = hoursByMonth(sessions, PAIRINGS, { tz: NY });
    deepEqual(months.map((m) => m.month), ['2026-02', '2026-03']);
    equal(months[1].occurredCount, 2);
    equal(months[1].volunteerHours, 2);
  });

  it('assigns a late-evening session to the tutor\'s month, not UTC\'s', () => {
    // 01:00 UTC on Apr 1 is 21:00 on Mar 31 in New York.
    const late = session({ scheduledAt: '2026-04-01T01:00:00.000Z' });
    equal(hoursByMonth([late], PAIRINGS, { tz: NY })[0].month, '2026-03');
    equal(hoursByMonth([late], PAIRINGS, { tz: 'UTC' })[0].month, '2026-04');
  });

  it('includes prep and follow-up in the monthly figure', () => {
    const s = session({ durationMinutes: 60, prepMinutes: 15, followupMinutes: 15 });
    equal(hoursByMonth([s], PAIRINGS, { tz: NY })[0].volunteerHours, 1.5);
    equal(hoursByMonth([s], PAIRINGS, { tz: NY })[0].contactMinutes, 60);
  });

  it('omits months with nothing that happened', () => {
    deepEqual(hoursByMonth([session({ occurred: false })], PAIRINGS, { tz: NY }), []);
  });
});

describe('activeWeeks', () => {
  it('counts distinct weeks containing a session that happened', () => {
    const sessions = [
      session({ id: 'a', scheduledAt: '2026-03-07T14:00:00.000Z' }), // week of Mar 1
      session({ id: 'b', scheduledAt: '2026-03-08T14:00:00.000Z' }), // week of Mar 8
      session({ id: 'c', scheduledAt: '2026-03-14T14:00:00.000Z' })  // week of Mar 8
    ];
    equal(activeWeeks(sessions, PAIRINGS, { tz: NY }), 2);
  });

  it('ignores sessions that did not happen', () => {
    equal(activeWeeks([session({ occurred: false })], PAIRINGS, { tz: NY }), 0);
  });

  it('requires a zone', () => {
    throws(() => activeWeeks([session()], PAIRINGS, {}));
  });
});

describe('pairingsNeedingCheckIn', () => {
  const AS_OF = '2026-04-05T00:00:00.000Z';

  it('requires an explicit asOf, so the answer is reproducible', () => {
    throws(() => pairingsNeedingCheckIn([], PAIRINGS, {}));
  });

  it('finds an active pairing quiet for longer than the window', () => {
    const sessions = [
      session({ id: 'a', pairingId: 'p1', scheduledAt: '2026-03-01T14:00:00.000Z' }), // 35 days before
      session({ id: 'b', pairingId: 'p2', scheduledAt: '2026-04-04T14:00:00.000Z' })  // yesterday
    ];
    const quiet = pairingsNeedingCheckIn(sessions, PAIRINGS, { asOfIso: AS_OF, weeks: 4 });
    const ids = quiet.map((r) => r.pairingId);
    ok(ids.includes('p1'), 'p1 has been quiet for five weeks');
    ok(!ids.includes('p2'), 'p2 met yesterday');
  });

  it('includes an active pairing that has never met, listed first', () => {
    // p1 is quiet, p2 met yesterday, p4 has never met at all. Only p4 has no
    // session, so it must sort above p1.
    const sessions = [
      session({ id: 'a', pairingId: 'p1', scheduledAt: '2026-03-01T14:00:00.000Z' }),
      session({ id: 'b', pairingId: 'p2', scheduledAt: '2026-04-04T14:00:00.000Z' })
    ];
    const quiet = pairingsNeedingCheckIn(sessions, PAIRINGS, { asOfIso: AS_OF, weeks: 4 });
    deepEqual(quiet.map((r) => r.pairingId), ['p4', 'p1']);
    equal(quiet[0].lastSessionIso, null);
    equal(quiet[0].daysSince, null);
  });

  it('reports how long it has been', () => {
    const sessions = [session({ id: 'a', pairingId: 'p1', scheduledAt: '2026-03-01T00:00:00.000Z' })];
    const row = pairingsNeedingCheckIn(sessions, PAIRINGS, { asOfIso: AS_OF, weeks: 4 })
      .find((r) => r.pairingId === 'p1');
    equal(row.daysSince, 35);
  });

  it('ignores ended and paused pairings', () => {
    // p3 is ended and has no sessions; it must not appear.
    const quiet = pairingsNeedingCheckIn([], PAIRINGS, { asOfIso: AS_OF, weeks: 4 });
    ok(!quiet.some((r) => r.pairingId === 'p3'));
  });

  it('does not count a session that did not happen as contact', () => {
    const sessions = [
      session({ id: 'a', pairingId: 'p1', scheduledAt: '2026-03-01T14:00:00.000Z' }),
      session({ id: 'b', pairingId: 'p1', scheduledAt: '2026-04-04T14:00:00.000Z', occurred: false })
    ];
    const row = pairingsNeedingCheckIn(sessions, PAIRINGS, { asOfIso: AS_OF, weeks: 4 })
      .find((r) => r.pairingId === 'p1');
    ok(row, 'a cancelled session must not reset the clock');
    equal(row.lastSessionIso, '2026-03-01T14:00:00.000Z');
  });

  it('ignores sessions scheduled in the future', () => {
    const sessions = [
      session({ id: 'a', pairingId: 'p1', scheduledAt: '2026-03-01T14:00:00.000Z' }),
      session({ id: 'b', pairingId: 'p1', scheduledAt: '2026-05-01T14:00:00.000Z' })
    ];
    const row = pairingsNeedingCheckIn(sessions, PAIRINGS, { asOfIso: AS_OF, weeks: 4 })
      .find((r) => r.pairingId === 'p1');
    ok(row, 'a session booked for next month does not mean they have met');
    equal(row.lastSessionIso, '2026-03-01T14:00:00.000Z');
  });

  it('respects the window length', () => {
    const sessions = [session({ id: 'a', pairingId: 'p1', scheduledAt: '2026-03-22T14:00:00.000Z' })];
    // 14 days before asOf: quiet at a 1-week window, fine at a 4-week one.
    ok(pairingsNeedingCheckIn(sessions, PAIRINGS, { asOfIso: AS_OF, weeks: 1 })
      .some((r) => r.pairingId === 'p1'));
    ok(!pairingsNeedingCheckIn(sessions, PAIRINGS, { asOfIso: AS_OF, weeks: 4 })
      .some((r) => r.pairingId === 'p1'));
  });

  it('sorts the longest-quiet pairing first among those that have met', () => {
    const sessions = [
      session({ id: 'a', pairingId: 'p1', scheduledAt: '2026-03-01T14:00:00.000Z' }),
      session({ id: 'b', pairingId: 'p2', scheduledAt: '2026-02-01T14:00:00.000Z' })
    ];
    const met = pairingsNeedingCheckIn(sessions, PAIRINGS, { asOfIso: AS_OF, weeks: 4 })
      .filter((r) => r.lastSessionIso !== null);
    deepEqual(met.map((r) => r.pairingId), ['p2', 'p1']);
  });
});

describe('programTotals', () => {
  const sessions = [
    session({ id: 'a', pairingId: 'p1', durationMinutes: 60, prepMinutes: 0 }),
    session({ id: 'b', pairingId: 'p2', durationMinutes: 120, prepMinutes: 0 }),
    session({ id: 'c', pairingId: 'p1', occurred: false })
  ];

  it('rolls up the program', () => {
    const totals = programTotals(sessions, PAIRINGS, PEOPLE);
    equal(totals.occurredCount, 2);
    equal(totals.missedCount, 1);
    equal(totals.volunteerHours, 3);
    equal(totals.activeTutors, 2);
    equal(totals.rosteredTutors, 4);
    equal(totals.studentsReached, 2);
    equal(totals.rosteredStudents, 3);
    equal(totals.activePairings, 3);
  });

  it('takes the median over tutors who actually tutored', () => {
    // t1: 1h, t2: 2h. Tutors with no sessions must not drag it to 0.
    equal(programTotals(sessions, PAIRINGS, PEOPLE).medianHoursPerTutor, 1.5);
  });

  it('survives an empty program', () => {
    const totals = programTotals([], [], []);
    equal(totals.occurredCount, 0);
    equal(totals.volunteerHours, 0);
    equal(totals.medianHoursPerTutor, 0);
    equal(totals.hoursLabel, '0');
  });
});
