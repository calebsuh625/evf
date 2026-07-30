/**
 * tutor.test.js — the tutor-facing logic.
 *
 * As with the rest of the suite, only pure functions are exercised: js/tutor.js
 * takes its data as an argument and never reads the clock, so every assertion
 * here is stable. The store mutations that write to localStorage are covered
 * through their pure parts (capSessionMinutes) rather than by calling them.
 */

import { describe, it, equal, ok, deepEqual, throws } from './runner.js';
import {
  isUnlogged,
  tutorPairings,
  lastHeldSession,
  nextClassFor,
  sharedWindows,
  studentCard,
  outstandingLogs,
  nextClassOverall,
  hourBreakdown,
  hoursByTerm,
  sessionLog
} from '../js/tutor.js';
import { capSessionMinutes, SESSION_MINUTE_CAP, migrate, validate } from '../js/store.js';
import { fromUtc, weekdayLabel } from '../js/time.js';

const LA = 'America/Los_Angeles';
const SH = 'Asia/Shanghai';

/* A Friday-evening Pacific tutor meeting a Saturday-morning Beijing student —
 * the program's signature pairing, and the one that spans two weekdays. */
const NOW = '2026-06-17T00:00:00.000Z'; // a Wednesday

function fixture(overrides = {}) {
  return {
    // Stamped, or migrate() would read it as the pre-versioned prototype and
    // run the whole v0 chain over a shape that is already current.
    version: 3,
    program: {
      name: 'PeerBridges 2.0',
      adminTimeZone: LA,
      studentTimeZone: SH,
      defaultSessionMinutes: 60,
      terms: [
        { id: 'spring', label: 'Spring 2026', startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-05-01T00:00:00.000Z' },
        { id: 'summer', label: 'Summer 2026', startsAt: '2026-05-01T00:00:00.000Z', endsAt: '2026-09-01T00:00:00.000Z' }
      ]
    },
    people: [
      { id: 't1', role: 'tutor', name: 'Avery Alpha', preferredName: 'Avery', timezone: LA, active: true, acceptingStudents: true, meetingLink: 'https://meet.example.org/demo' },
      { id: 't2', role: 'tutor', name: 'Blake Beta', preferredName: 'Blake', timezone: LA, active: true, acceptingStudents: false },
      { id: 's1', role: 'student', name: 'Ming Nu', preferredName: 'Ming', timezone: SH, active: true, englishLevel: 'beginner', goals: ['reading'], interests: ['chess'] },
      { id: 's2', role: 'student', name: 'Yara Xi', preferredName: 'Yara', timezone: SH, active: true, englishLevel: 'intermediate', goals: ['listening'], interests: [] }
    ],
    pairings: [
      { id: 'p1', tutorId: 't1', studentId: 's1', status: 'active', startedAt: '2026-05-01T00:00:00.000Z', endedAt: null, notes: '' },
      { id: 'p2', tutorId: 't1', studentId: 's2', status: 'active', startedAt: '2026-05-01T00:00:00.000Z', endedAt: null, notes: '' },
      { id: 'p3', tutorId: 't2', studentId: 's1', status: 'ended', startedAt: '2026-01-05T00:00:00.000Z', endedAt: '2026-04-01T00:00:00.000Z', notes: '' }
    ],
    sessions: [
      logged('x1', 'p1', '2026-06-06T01:00:00.000Z', { durationMinutes: 60, prepMinutes: 15, followupMinutes: 10, covered: 'One-step equations.', homework: 'Five problems.' }),
      logged('x2', 'p1', '2026-06-13T01:00:00.000Z', { durationMinutes: 60, prepMinutes: 0, followupMinutes: 0, covered: 'Two-step equations.', homework: 'Read chapter 4.' }),
      logged('x3', 'p2', '2026-06-13T01:00:00.000Z', { durationMinutes: 45, prepMinutes: 5, followupMinutes: 0, covered: 'Forces.', homework: '' }),
      // Happened but nobody wrote it up.
      { id: 'x4', pairingId: 'p1', scheduledAt: '2026-06-06T01:00:00.000Z', occurred: null, durationMinutes: null, prepMinutes: 0, followupMinutes: 0, covered: '', homework: '', loggedAt: null },
      // Did not happen, and was logged as such.
      logged('x5', 'p2', '2026-06-06T01:00:00.000Z', { occurred: false, durationMinutes: 0, prepMinutes: 0, followupMinutes: 0, covered: 'Family travel.', homework: '' })
    ],
    availability: [
      { personId: 't1', weekday: 5, startTime: '17:00', endTime: '20:00', timezone: LA },
      { personId: 's1', weekday: 6, startTime: '08:00', endTime: '11:00', timezone: SH },
      { personId: 's2', weekday: 6, startTime: '09:00', endTime: '10:00', timezone: SH }
    ],
    ...overrides
  };
}

function logged(id, pairingId, scheduledAt, extra = {}) {
  return {
    id, pairingId, scheduledAt,
    occurred: true, durationMinutes: 60, prepMinutes: 0, followupMinutes: 0,
    covered: '', homework: '', loggedAt: scheduledAt,
    ...extra
  };
}

/* ================================================================== *
 * The unlogged marker
 * ================================================================== */

describe('unlogged sessions', () => {
  it('is unlogged when loggedAt is null and the class is in the past', () => {
    ok(isUnlogged({ loggedAt: null, scheduledAt: '2026-06-06T01:00:00.000Z' }, NOW));
  });

  it('is not unlogged once loggedAt is set', () => {
    ok(!isUnlogged({ loggedAt: '2026-06-06T02:00:00.000Z', scheduledAt: '2026-06-06T01:00:00.000Z' }, NOW));
  });

  it('is not unlogged while the class is still in the future', () => {
    // A class that has not happened is not something anyone forgot.
    ok(!isUnlogged({ loggedAt: null, scheduledAt: '2026-06-20T01:00:00.000Z' }, NOW));
  });

  it('the sample data model accepts occurred:null only while unlogged', () => {
    const data = migrate(fixture()).data;
    deepEqual(validate(data).errors, []);

    const bad = migrate(fixture({
      sessions: [{ ...fixture().sessions[0], occurred: null, loggedAt: '2026-06-06T02:00:00.000Z' }]
    })).data;
    ok(validate(bad).errors.some((e) => e.includes('occurred')), 'a logged session must answer yes or no');
  });
});

/* ================================================================== *
 * Pairings and history
 * ================================================================== */

describe('tutorPairings', () => {
  const data = fixture();

  it('returns active pairings with the student attached', () => {
    const rows = tutorPairings('t1', data);
    deepEqual(rows.map((r) => r.pairing.id), ['p1', 'p2']);
    equal(rows[0].student.preferredName, 'Ming');
  });

  it('excludes other tutors and ended pairings', () => {
    deepEqual(tutorPairings('t2', data), []);
    equal(tutorPairings('t2', data, { includeInactive: true }).length, 1);
  });

  it('drops a pairing whose student is missing rather than rendering a blank card', () => {
    const orphaned = fixture({ people: fixture().people.filter((p) => p.id !== 's2') });
    deepEqual(tutorPairings('t1', orphaned).map((r) => r.pairing.id), ['p1']);
  });
});

describe('lastHeldSession', () => {
  const data = fixture();

  it('finds the most recent class that actually happened', () => {
    const last = lastHeldSession('p1', data.sessions, NOW);
    equal(last.id, 'x2');
    equal(last.homework, 'Read chapter 4.');
  });

  it('ignores unlogged and did-not-happen sessions', () => {
    const last = lastHeldSession('p2', data.sessions, NOW);
    equal(last.id, 'x3', 'x5 did not happen and must not be treated as the last class');
  });

  it('ignores anything in the future', () => {
    equal(lastHeldSession('p1', data.sessions, '2026-06-07T00:00:00.000Z').id, 'x1');
  });

  it('returns null when there is no history', () => {
    equal(lastHeldSession('nope', data.sessions, NOW), null);
  });
});

/* ================================================================== *
 * Next class
 * ================================================================== */

describe('nextClassFor', () => {
  const data = fixture();

  it('falls back to the shared weekly window when nothing is scheduled', () => {
    const next = nextClassFor(data.pairings[0], data, { asOfIso: NOW });
    ok(next, 'a pairing with shared availability always has a next class');
    equal(next.source, 'recurring');
    // Friday 17:00 Pacific is Saturday 08:00 Beijing.
    equal(fromUtc(next.startUtc, LA), '2026-06-19T17:00:00');
    equal(fromUtc(next.startUtc, SH), '2026-06-20T08:00:00');
    equal(weekdayLabel(next.startUtc, LA), 'Friday');
    equal(weekdayLabel(next.startUtc, SH), 'Saturday');
  });

  it('prefers a session already on the calendar', () => {
    const scheduled = fixture({
      sessions: [...fixture().sessions, {
        id: 'future', pairingId: 'p1', scheduledAt: '2026-06-18T01:00:00.000Z',
        occurred: null, durationMinutes: null, prepMinutes: 0, followupMinutes: 0,
        covered: '', homework: '', loggedAt: null
      }]
    });
    const next = nextClassFor(scheduled.pairings[0], scheduled, { asOfIso: NOW });
    equal(next.source, 'scheduled');
    equal(next.sessionId, 'future');
    equal(next.startUtc, '2026-06-18T01:00:00.000Z');
  });

  it('does not offer a future session that was logged as not happening', () => {
    const cancelled = fixture({
      sessions: [...fixture().sessions,
        logged('gone', 'p1', '2026-06-18T01:00:00.000Z', { occurred: false, durationMinutes: 0 })]
    });
    const next = nextClassFor(cancelled.pairings[0], cancelled, { asOfIso: NOW });
    equal(next.source, 'recurring', 'a cancelled class is not the next class');
  });

  it('returns null when the two never share a window', () => {
    const noOverlap = fixture({
      availability: [
        { personId: 't1', weekday: 6, startTime: '09:00', endTime: '12:00', timezone: LA },
        { personId: 's1', weekday: 6, startTime: '08:00', endTime: '11:00', timezone: SH }
      ]
    });
    equal(nextClassFor(noOverlap.pairings[0], noOverlap, { asOfIso: NOW }), null);
  });
});

describe('sharedWindows', () => {
  const data = fixture();

  it('describes the shared window on the tutor\'s clock', () => {
    const windows = sharedWindows(data.pairings[0], data.availability, NOW);
    equal(windows.length, 1);
    equal(windows[0].weekday, 5, 'Friday for the tutor');
    equal(windows[0].startTime, '17:00');
    equal(windows[0].endTime, '20:00');
    equal(windows[0].timezone, LA);
  });

  it('narrows to the genuinely shared part', () => {
    // s2 is only free 09:00-10:00 Beijing = 18:00-19:00 Pacific.
    const windows = sharedWindows(data.pairings[1], data.availability, NOW);
    equal(windows.length, 1);
    equal(windows[0].startTime, '18:00');
    equal(windows[0].endTime, '19:00');
  });

  it('returns nothing when either side has no availability', () => {
    deepEqual(sharedWindows(data.pairings[2], data.availability, NOW), []);
  });
});

describe('nextClassOverall', () => {
  it('picks the soonest across every pairing and brings the last session with it', () => {
    const data = fixture();
    const next = nextClassOverall('t1', data, { asOfIso: NOW });
    ok(next);
    equal(next.student.id, 's1', 'p1 starts at 17:00, p2 at 18:00');
    equal(next.lastSession.homework, 'Read chapter 4.', 'the dashboard shows what was set last time');
  });

  it('returns null for a tutor with no students', () => {
    equal(nextClassOverall('t2', fixture(), { asOfIso: NOW }), null);
  });
});

/* ================================================================== *
 * The nudge
 * ================================================================== */

describe('outstandingLogs', () => {
  const data = fixture();

  it('lists past classes with nothing written up, oldest first', () => {
    const rows = outstandingLogs('t1', data, { asOfIso: NOW });
    deepEqual(rows.map((r) => r.session.id), ['x4']);
    equal(rows[0].student.preferredName, 'Ming');
  });

  it('is empty for a tutor who is up to date', () => {
    deepEqual(outstandingLogs('t2', data, { asOfIso: NOW }), []);
  });

  it('never includes a future class', () => {
    const future = fixture({
      sessions: [{
        id: 'later', pairingId: 'p1', scheduledAt: '2026-06-27T01:00:00.000Z',
        occurred: null, durationMinutes: null, prepMinutes: 0, followupMinutes: 0,
        covered: '', homework: '', loggedAt: null
      }]
    });
    deepEqual(outstandingLogs('t1', future, { asOfIso: NOW }), []);
  });

  it('carries no count, streak or deadline (principle 3)', () => {
    // The shape is deliberately just the rows. Anything that looked like a
    // score would be a compliance mechanism.
    const rows = outstandingLogs('t1', data, { asOfIso: NOW });
    deepEqual(Object.keys(rows[0]).sort(), ['pairing', 'session', 'student']);
  });
});

/* ================================================================== *
 * Student cards
 * ================================================================== */

describe('studentCard', () => {
  const data = fixture();

  it('gathers what a dashboard tile shows', () => {
    const card = studentCard(data.pairings[0], data.people[2], data, { asOfIso: NOW });
    equal(card.sessionCount, 2);
    equal(card.minutes, 120);
    equal(card.covered, 'Two-step equations.');
    equal(card.homework, 'Read chapter 4.');
    ok(card.nextClass);
  });

  it('handles a pairing that has never met', () => {
    const fresh = fixture({ sessions: [] });
    const card = studentCard(fresh.pairings[0], fresh.people[2], fresh, { asOfIso: NOW });
    equal(card.sessionCount, 0);
    equal(card.lastSession, null);
    equal(card.covered, '');
  });
});

/* ================================================================== *
 * Hours
 * ================================================================== */

describe('hourBreakdown', () => {
  const data = fixture();

  it('splits teaching, prep and follow-up', () => {
    const b = hourBreakdown('t1', data);
    // x1 60+15+10, x2 60, x3 45+5. x4 unlogged, x5 did not happen.
    equal(b.teachingMinutes, 165);
    equal(b.prepMinutes, 20);
    equal(b.followupMinutes, 10);
    equal(b.totalMinutes, 195);
    equal(b.sessionCount, 3);
    deepEqual(b.studentIds, ['s1', 's2']);
  });

  it('reports hours rounded for a form', () => {
    const b = hourBreakdown('t1', data);
    equal(b.totalHours, 3.25);
    equal(b.totalLabel, '3.25');
  });

  it('counts nothing for unlogged or did-not-happen sessions', () => {
    const onlyUnlogged = fixture({ sessions: [fixture().sessions[3], fixture().sessions[4]] });
    equal(hourBreakdown('t1', onlyUnlogged).totalMinutes, 0);
  });

  it('respects a date range', () => {
    const b = hourBreakdown('t1', data, { fromIso: '2026-06-10T00:00:00.000Z' });
    equal(b.sessionCount, 2, 'only the 13 June classes');
    equal(b.teachingMinutes, 105);
  });
});

describe('hoursByTerm', () => {
  const data = fixture();

  it('reports each term plus an all-time total', () => {
    const { terms, currentTerm, allTime } = hoursByTerm('t1', data, { asOfIso: NOW });
    equal(terms.length, 2);
    equal(currentTerm.id, 'summer');
    equal(currentTerm.totalMinutes, 195);
    equal(allTime.totalMinutes, 195);
  });

  it('sorts terms newest first', () => {
    deepEqual(hoursByTerm('t1', data, { asOfIso: NOW }).terms.map((t) => t.id), ['summer', 'spring']);
  });

  it('still gives an all-time figure when no terms are defined', () => {
    const noTerms = fixture({ program: { ...fixture().program, terms: [] } });
    const result = hoursByTerm('t1', noTerms, { asOfIso: NOW });
    deepEqual(result.terms, []);
    equal(result.currentTerm, null);
    equal(result.allTime.totalMinutes, 195);
  });
});

describe('sessionLog', () => {
  const data = fixture();

  it('lists logged classes newest first with the student resolved', () => {
    const rows = sessionLog('t1', data);
    deepEqual(rows.map((r) => r.session.id), ['x2', 'x3', 'x1']);
    equal(rows[0].studentName, 'Ming');
  });

  it('excludes unlogged and did-not-happen classes', () => {
    const ids = sessionLog('t1', data).map((r) => r.session.id);
    ok(!ids.includes('x4'), 'unlogged');
    ok(!ids.includes('x5'), 'did not happen');
  });

  it('breaks each row into its minute parts for the export', () => {
    const row = sessionLog('t1', data).find((r) => r.session.id === 'x1');
    equal(row.teachingMinutes, 60);
    equal(row.prepMinutes, 15);
    equal(row.followupMinutes, 10);
    equal(row.minutes, 85);
  });
});

/* ================================================================== *
 * The two-hour cap
 * ================================================================== */

describe('capSessionMinutes', () => {
  it('leaves an ordinary session alone', () => {
    const capped = capSessionMinutes({ durationMinutes: 60, prepMinutes: 15, followupMinutes: 0 });
    equal(capped.totalMinutes, 75);
    equal(capped.capped, false);
  });

  it('allows exactly two hours', () => {
    const capped = capSessionMinutes({ durationMinutes: 60, prepMinutes: 30, followupMinutes: 30 });
    equal(capped.totalMinutes, SESSION_MINUTE_CAP);
    equal(capped.capped, false);
  });

  it('trims follow-up first, then prep, and never the teaching time', () => {
    const capped = capSessionMinutes({ durationMinutes: 60, prepMinutes: 60, followupMinutes: 30 });
    equal(capped.durationMinutes, 60, 'time with the student is never the thing that gets cut');
    equal(capped.prepMinutes, 60);
    equal(capped.followupMinutes, 0);
    equal(capped.totalMinutes, 120);
    equal(capped.capped, true);
  });

  it('caps a single absurd duration', () => {
    const capped = capSessionMinutes({ durationMinutes: 600, prepMinutes: 60, followupMinutes: 30 });
    equal(capped.durationMinutes, 120);
    equal(capped.prepMinutes, 0);
    equal(capped.followupMinutes, 0);
  });

  it('treats junk as zero rather than producing NaN', () => {
    const capped = capSessionMinutes({ durationMinutes: 'x', prepMinutes: null, followupMinutes: -5 });
    equal(capped.totalMinutes, 0);
    equal(capped.capped, false);
  });
});
