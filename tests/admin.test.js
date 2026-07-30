/**
 * admin.test.js — the coordinator's computed figures, and the chart geometry.
 *
 * The rule under test throughout: every number on an admin screen is derived
 * from records people already keep. If an assertion here ever needs a new
 * field on a person or a session to pass, that is the signal that a screen is
 * about to start asking volunteers for something.
 */

import { describe, it, equal, ok, deepEqual, throws } from './runner.js';
import {
  programCounts,
  periodTotals,
  growthByMonth,
  quietPairings,
  studentsWaiting,
  tutorsWithCapacity,
  recentMisses,
  attentionReport,
  rosterRows,
  filterRoster,
  personHistory,
  hoursByTutorRows,
  HOURS_BY_TUTOR_COLUMNS,
  sessionReportRows
} from '../js/admin.js';
import {
  niceScale, scaleSeries, linePath, areaPath, labelIndices, tickPositions, lineChart, DEFAULT_BOX
} from '../js/chart.js';

const NY = 'America/New_York';
const SH = 'Asia/Shanghai';

/* A Wednesday, so "this week" has a Monday behind it and a weekend ahead. */
const NOW = '2026-06-17T12:00:00.000Z';

function fixture(overrides = {}) {
  return {
    version: 4,
    program: {
      name: 'Weekend Tutoring',
      adminTimeZone: NY,
      studentTimeZone: SH,
      terms: [
        { id: 'spring', label: 'Spring 2026', startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-05-01T00:00:00.000Z' },
        { id: 'summer', label: 'Summer 2026', startsAt: '2026-05-01T00:00:00.000Z', endsAt: '2026-09-01T00:00:00.000Z' }
      ]
    },
    people: [
      person('t1', 'tutor', { createdAt: '2026-04-10T00:00:00.000Z', maxStudents: 2, wechat: 'wx-t1' }),
      person('t2', 'tutor', { createdAt: '2026-05-10T00:00:00.000Z', maxStudents: 3, email: 't2@example.org' }),
      person('t3', 'tutor', { createdAt: '2026-06-02T00:00:00.000Z', maxStudents: 2, active: false }),
      person('s1', 'student', { createdAt: '2026-04-12T00:00:00.000Z' }),
      person('s2', 'student', { createdAt: '2026-05-12T00:00:00.000Z' }),
      person('s3', 'student', { createdAt: '2026-06-01T00:00:00.000Z' }),
      person('s4', 'student', { createdAt: '2026-06-05T00:00:00.000Z', active: false })
    ],
    pairings: [
      // Met recently.
      { id: 'p1', tutorId: 't1', studentId: 's1', status: 'active', startedAt: '2026-04-15T00:00:00.000Z', endedAt: null, notes: '' },
      // Quiet for six weeks.
      { id: 'p2', tutorId: 't1', studentId: 's2', status: 'active', startedAt: '2026-04-20T00:00:00.000Z', endedAt: null, notes: '' },
      // Started long ago and never met at all.
      { id: 'p3', tutorId: 't2', studentId: 's3', status: 'active', startedAt: '2026-05-01T00:00:00.000Z', endedAt: null, notes: '' },
      { id: 'p4', tutorId: 't2', studentId: 's4', status: 'ended', startedAt: '2026-05-01T00:00:00.000Z', endedAt: '2026-05-20T00:00:00.000Z', notes: '' }
    ],
    sessions: [
      held('x1', 'p1', '2026-06-15T14:00:00.000Z', { durationMinutes: 60, prepMinutes: 10 }),
      held('x2', 'p1', '2026-06-08T14:00:00.000Z', { durationMinutes: 60 }),
      held('x3', 'p1', '2026-05-11T14:00:00.000Z', { durationMinutes: 60 }),
      held('x4', 'p2', '2026-05-04T14:00:00.000Z', { durationMinutes: 60 }),
      // Did not happen, recently.
      { id: 'x5', pairingId: 'p2', scheduledAt: '2026-06-08T14:00:00.000Z', occurred: false, durationMinutes: 0, prepMinutes: 0, followupMinutes: 0, covered: 'Exams.', homework: '', loggedAt: '2026-06-08T15:00:00.000Z' },
      // Did not happen, long ago — outside the window.
      { id: 'x6', pairingId: 'p1', scheduledAt: '2026-04-20T14:00:00.000Z', occurred: false, durationMinutes: 0, prepMinutes: 0, followupMinutes: 0, covered: '', homework: '', loggedAt: '2026-04-20T15:00:00.000Z' },
      // Scheduled but not logged: contributes nothing anywhere.
      { id: 'x7', pairingId: 'p1', scheduledAt: '2026-06-16T14:00:00.000Z', occurred: null, durationMinutes: null, prepMinutes: 0, followupMinutes: 0, covered: '', homework: '', loggedAt: null }
    ],
    availability: [],
    ...overrides
  };
}

function person(id, role, extra = {}) {
  return {
    id, role, name: `${role} ${id}`, preferredName: id,
    email: '', wechat: '', timezone: role === 'tutor' ? NY : SH,
    locale: role === 'tutor' ? 'en' : 'zh', active: true,
    ...(role === 'tutor'
      ? { subjects: ['algebra'], levelsComfortable: ['beginner'], interests: [], maxStudents: 2, acceptingStudents: true, school: '' }
      : { goals: ['algebra'], interests: [], englishLevel: 'beginner' }),
    ...extra
  };
}

function held(id, pairingId, scheduledAt, extra = {}) {
  return {
    id, pairingId, scheduledAt, occurred: true,
    durationMinutes: 60, prepMinutes: 0, followupMinutes: 0,
    covered: '', homework: '', loggedAt: scheduledAt, ...extra
  };
}

/* ================================================================== *
 * Counts
 * ================================================================== */

describe('programCounts', () => {
  const c = programCounts(fixture());

  it('counts pairings by status', () => {
    equal(c.activePairings, 3);
    equal(c.endedPairings, 1);
    equal(c.pausedPairings, 0);
  });

  it('separates rostered from active people', () => {
    equal(c.tutors, 3);
    equal(c.activeTutors, 2);
    equal(c.students, 4);
    equal(c.activeStudents, 3);
  });

  it('counts only logged sessions, and only held ones as held', () => {
    equal(c.sessionsLogged, 6, 'the unlogged one does not count');
    equal(c.sessionsHeld, 4);
  });
});

/* ================================================================== *
 * Hours by period
 * ================================================================== */

describe('periodTotals', () => {
  it('requires an explicit now', () => {
    throws(() => periodTotals(fixture(), {}));
  });

  it('scopes to the week the coordinator is in', () => {
    // NOW is Wednesday 17 June. Only x1 (Mon 15 June) is in that week.
    const totals = periodTotals(fixture(), { nowIso: NOW });
    equal(totals.week.sessions, 1);
    equal(totals.week.minutes, 70, '60 teaching plus 10 prep');
  });

  it('scopes to the calendar month', () => {
    const totals = periodTotals(fixture(), { nowIso: NOW });
    equal(totals.month.sessions, 2, 'x1 and x2 are both in June');
    equal(totals.month.minutes, 130);
  });

  it('picks the term containing now, and reports its label', () => {
    const totals = periodTotals(fixture(), { nowIso: NOW });
    equal(totals.term.id, 'summer');
    equal(totals.term.label2, 'Summer 2026');
    equal(totals.term.sessions, 4, 'everything from 1 May onward');
  });

  it('reports null for a term when none contains now', () => {
    equal(periodTotals(fixture(), { nowIso: '2026-12-01T00:00:00.000Z' }).term, null);
  });

  it('all time counts everything held', () => {
    const totals = periodTotals(fixture(), { nowIso: NOW });
    equal(totals.allTime.sessions, 4);
    equal(totals.allTime.minutes, 250);
  });

  it('counts a session logged in this very minute', () => {
    const now = '2026-06-17T14:00:00.000Z';
    const data = fixture({ sessions: [held('now', 'p1', now)] });
    equal(periodTotals(data, { nowIso: now }).week.sessions, 1);
  });
});

/* ================================================================== *
 * Growth
 * ================================================================== */

describe('growthByMonth', () => {
  it('requires an explicit now', () => {
    throws(() => growthByMonth(fixture(), {}));
  });

  it('accumulates people month by month', () => {
    const growth = growthByMonth(fixture(), { nowIso: NOW });
    deepEqual(growth.map((g) => g.month), ['2026-04', '2026-05', '2026-06']);
    deepEqual(growth.map((g) => g.tutors), [1, 2, 3]);
    deepEqual(growth.map((g) => g.students), [1, 3, 4]);
  });

  it('buckets a join date by the admin zone, not by UTC', () => {
    // s3 joined at 2026-06-01T00:00Z, which is 31 May in New York — so they
    // belong to May on a chart the coordinator is reading. Getting this wrong
    // moves people between months at the boundary.
    const growth = growthByMonth(fixture(), { nowIso: NOW });
    deepEqual(growth.map((g) => g.joinedStudents), [1, 2, 1]);

    const utc = growthByMonth({ ...fixture(), program: { ...fixture().program, adminTimeZone: 'UTC' } },
      { nowIso: NOW });
    deepEqual(utc.map((g) => g.joinedStudents), [1, 1, 2], 'in UTC they belong to June');
  });

  it('counts held classes and hours per month', () => {
    const growth = growthByMonth(fixture(), { nowIso: NOW });
    deepEqual(growth.map((g) => g.sessions), [0, 2, 2]);
    equal(growth[2].hours, 2);
  });

  it('emits months with nothing in them rather than skipping', () => {
    // A flat stretch is information; a chart that skips it lies about shape.
    const sparse = fixture({
      people: [person('t1', 'tutor', { createdAt: '2026-01-05T00:00:00.000Z' })],
      pairings: [], sessions: []
    });
    const growth = growthByMonth(sparse, { nowIso: NOW });
    deepEqual(growth.map((g) => g.month), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
    deepEqual(growth.map((g) => g.tutors), [1, 1, 1, 1, 1, 1]);
  });

  it('returns nothing for an empty program', () => {
    deepEqual(growthByMonth({ people: [], sessions: [], pairings: [], program: {} }, { nowIso: NOW }), []);
  });
});

/* ================================================================== *
 * Needs attention
 * ================================================================== */

describe('quietPairings', () => {
  it('requires an explicit now', () => {
    throws(() => quietPairings(fixture(), {}));
  });

  it('finds active pairings with nothing logged for two weeks, longest first', () => {
    const quiet = quietPairings(fixture(), { nowIso: NOW, weeks: 2 });
    deepEqual(quiet.map((q) => q.pairing.id), ['p3', 'p2']);
    equal(quiet[0].neverMet, true, 'p3 started in May and has never met');
    equal(quiet[1].lastSessionIso, '2026-05-04T14:00:00.000Z');
  });

  it('measures a pairing that never met from when it started', () => {
    const quiet = quietPairings(fixture(), { nowIso: NOW, weeks: 2 });
    const p3 = quiet.find((q) => q.pairing.id === 'p3');
    equal(p3.daysQuiet, 47, 'from 1 May to 17 June');
  });

  it('leaves a brand-new pairing alone', () => {
    // Started yesterday, never met: not something anyone has neglected.
    const data = fixture({
      pairings: [{ id: 'fresh', tutorId: 't1', studentId: 's1', status: 'active', startedAt: '2026-06-16T00:00:00.000Z', endedAt: null, notes: '' }],
      sessions: []
    });
    deepEqual(quietPairings(data, { nowIso: NOW, weeks: 2 }), []);
  });

  it('does not count a class that did not happen as having met', () => {
    // p2's only recent session is x5, which did not happen.
    const quiet = quietPairings(fixture(), { nowIso: NOW, weeks: 2 });
    ok(quiet.some((q) => q.pairing.id === 'p2'));
  });

  it('ignores paused and ended pairings', () => {
    const quiet = quietPairings(fixture(), { nowIso: NOW, weeks: 2 });
    ok(!quiet.some((q) => q.pairing.id === 'p4'));
  });

  it('respects the window', () => {
    ok(quietPairings(fixture(), { nowIso: NOW, weeks: 8 }).length
      < quietPairings(fixture(), { nowIso: NOW, weeks: 2 }).length);
  });

  it('brings the people with it, so a coordinator can make contact', () => {
    const [first] = quietPairings(fixture(), { nowIso: NOW, weeks: 2 });
    ok(first.tutor, 'the tutor record must come with the row');
    ok(first.student, 'and the student');
  });
});

describe('studentsWaiting', () => {
  it('lists active students with no active pairing', () => {
    // s4 is inactive; s1..s3 are all paired.
    deepEqual(studentsWaiting(fixture()).map((r) => r.student.id), []);
  });

  it('finds a student whose only pairing ended', () => {
    const data = fixture({
      pairings: fixture().pairings.map((p) => (p.id === 'p1' ? { ...p, status: 'ended' } : p))
    });
    const waiting = studentsWaiting(data);
    deepEqual(waiting.map((r) => r.student.id), ['s1']);
    equal(waiting[0].previousPairings, 1, 'knowing they had a tutor before changes the conversation');
  });

  it('treats paused as waiting', () => {
    const data = fixture({
      pairings: fixture().pairings.map((p) => (p.id === 'p1' ? { ...p, status: 'paused' } : p))
    });
    ok(studentsWaiting(data).some((r) => r.student.id === 's1'));
  });

  it('skips inactive students', () => {
    ok(!studentsWaiting(fixture()).some((r) => r.student.id === 's4'));
  });
});

describe('tutorsWithCapacity', () => {
  it('reports remaining places against each tutor\'s own maximum', () => {
    const rows = tutorsWithCapacity(fixture());
    // t1: 2 of 2 used -> none. t2: 1 of 3 -> 2 left. t3 inactive.
    deepEqual(rows.map((r) => r.tutor.id), ['t2']);
    equal(rows[0].remaining, 2);
    equal(rows[0].used, 1);
  });

  it('excludes inactive tutors whatever their maximum', () => {
    ok(!tutorsWithCapacity(fixture()).some((r) => r.tutor.id === 't3'));
  });

  it('does not count ended pairings against capacity', () => {
    const rows = tutorsWithCapacity(fixture());
    equal(rows.find((r) => r.tutor.id === 't2').used, 1, 'p4 ended and must not count');
  });
});

describe('recentMisses', () => {
  it('finds classes logged as not having happened, newest first', () => {
    const misses = recentMisses(fixture(), { nowIso: NOW, days: 28 });
    deepEqual(misses.map((m) => m.session.id), ['x5']);
    equal(misses[0].note, 'Exams.', 'the tutor\'s own words, never a reason code');
  });

  it('respects the window', () => {
    const wide = recentMisses(fixture(), { nowIso: NOW, days: 120 });
    deepEqual(wide.map((m) => m.session.id), ['x5', 'x6']);
  });

  it('resolves the people involved', () => {
    const [miss] = recentMisses(fixture(), { nowIso: NOW, days: 28 });
    equal(miss.tutor.id, 't1');
    equal(miss.student.id, 's2');
  });

  it('keeps no tally against anybody (principle 3)', () => {
    // The shape is per-session. Anything keyed by person would be a strike count.
    const [miss] = recentMisses(fixture(), { nowIso: NOW, days: 28 });
    deepEqual(Object.keys(miss).sort(), ['note', 'pairing', 'session', 'student', 'tutor']);
  });
});

describe('attentionReport', () => {
  it('gathers all four lists with counts', () => {
    const report = attentionReport(fixture(), { nowIso: NOW });
    equal(report.counts.quiet, 2);
    equal(report.counts.waiting, 0);
    equal(report.counts.capacity, 2, 'total open places, not tutors');
    equal(report.counts.misses, 1);
    equal(report.allClear, false);
  });

  it('says so plainly when there is nothing to do', () => {
    const calm = {
      ...fixture(),
      pairings: [{ id: 'p1', tutorId: 't1', studentId: 's1', status: 'active', startedAt: '2026-06-10T00:00:00.000Z', endedAt: null, notes: '' }],
      sessions: [held('x1', 'p1', '2026-06-15T14:00:00.000Z')],
      people: fixture().people.filter((p) => ['t1', 's1'].includes(p.id))
    };
    const report = attentionReport(calm, { nowIso: NOW });
    equal(report.allClear, true);
  });
});

/* ================================================================== *
 * Roster
 * ================================================================== */

describe('rosterRows', () => {
  const rows = rosterRows(fixture());
  const find = (id) => rows.find((r) => r.person.id === id);

  it('computes status rather than reading a stored field', () => {
    equal(find('t1').status, 'paired');
    equal(find('t3').status, 'inactive');
    equal(find('s4').status, 'inactive');
  });

  it('marks a tutor who is not taking students', () => {
    const data = fixture({
      people: fixture().people.map((p) => (p.id === 't2' ? { ...p, acceptingStudents: false } : p)),
      pairings: []
    });
    equal(rosterRows(data).find((r) => r.person.id === 't2').status, 'not-accepting');
  });

  it('counts active pairings and held classes per person', () => {
    equal(find('t1').activePairings, 2);
    equal(find('t1').sessions, 4, 'three on p1 plus one on p2');
    equal(find('t1').remaining, 0);
    equal(find('t2').remaining, 2);
  });

  it('reports unpaired for an active person with no pairing', () => {
    const data = fixture({ pairings: [] });
    equal(rosterRows(data).find((r) => r.person.id === 's1').status, 'unpaired');
  });
});

describe('filterRoster', () => {
  const rows = rosterRows(fixture());

  it('filters by role and status', () => {
    equal(filterRoster(rows, { role: 'tutor' }).length, 3);
    equal(filterRoster(rows, { role: 'student' }).length, 4);
    equal(filterRoster(rows, { status: 'inactive' }).length, 2);
  });

  it('searches name, contact and subjects', () => {
    const data = fixture({
      people: fixture().people.map((p) => (p.id === 't2' ? { ...p, school: 'Northline High' } : p))
    });
    const searched = filterRoster(rosterRows(data), { query: 'northline' });
    deepEqual(searched.map((r) => r.person.id), ['t2']);
  });

  it('is case-insensitive and ignores surrounding space', () => {
    equal(filterRoster(rows, { query: '  TUTOR T1 ' }).length, 1);
  });

  it('returns everything when nothing is asked for', () => {
    equal(filterRoster(rows, {}).length, rows.length);
  });

  it('combines filters', () => {
    equal(filterRoster(rows, { role: 'tutor', status: 'inactive' }).length, 1);
  });
});

describe('personHistory', () => {
  it('gathers pairings, sessions and totals for one person', () => {
    const history = personHistory('t1', fixture());
    deepEqual(history.pairings.map((p) => p.id), ['p2', 'p1']);
    equal(history.sessions.length, 7, 'every session on either pairing, logged or not');
    equal(history.totals.occurredCount, 4);
  });

  it('works from the student side too', () => {
    equal(personHistory('s1', fixture()).totals.occurredCount, 3);
  });

  it('returns empty structures for somebody with no history', () => {
    const history = personHistory('t3', fixture());
    deepEqual(history.pairings, []);
    deepEqual(history.sessions, []);
    equal(history.totals.occurredCount, 0);
  });
});

/* ================================================================== *
 * Export rows
 * ================================================================== */

describe('hoursByTutorRows', () => {
  it('reports every tutor, including those with nothing', () => {
    const rows = hoursByTutorRows(fixture());
    equal(rows.length, 3);
    ok(rows.some((r) => r.tutorId === 't3' && r.totalMinutes === 0));
  });

  it('splits the minutes and reports hours ready for a form', () => {
    const row = hoursByTutorRows(fixture()).find((r) => r.tutorId === 't1');
    equal(row.sessions, 4);
    equal(row.teachingMinutes, 240);
    equal(row.prepMinutes, 10);
    equal(row.totalMinutes, 250);
    equal(row.totalHours, '4.25');
    equal(row.students, 2);
  });

  it('has a column list matching its rows', () => {
    const row = hoursByTutorRows(fixture())[0];
    for (const column of HOURS_BY_TUTOR_COLUMNS) ok(column in row, `missing ${column}`);
    deepEqual(Object.keys(row).sort(), [...HOURS_BY_TUTOR_COLUMNS].sort());
  });
});

describe('sessionReportRows', () => {
  it('resolves people and reports occurrence plainly', () => {
    const rows = sessionReportRows(fixture());
    equal(rows.length, 6, 'logged sessions only');
    equal(rows[0].date, '2026-06-15');
    equal(rows[0].tutor, 'tutor t1');
    equal(rows[0].occurred, 'yes');
    ok(rows.some((r) => r.occurred === 'no'));
  });

  it('dates in the admin zone', () => {
    // 01:00 UTC on 16 June is still 15 June in New York.
    const data = fixture({ sessions: [held('late', 'p1', '2026-06-16T01:00:00.000Z')] });
    equal(sessionReportRows(data)[0].date, '2026-06-15');
  });
});

/* ================================================================== *
 * Chart geometry
 * ================================================================== */

describe('niceScale', () => {
  it('rounds up to a readable ceiling with round ticks', () => {
    deepEqual(niceScale(20).ticks, [0, 5, 10, 15, 20]);
    deepEqual(niceScale(7).ticks, [0, 2, 4, 6, 8]);
    // 23 rounds to a step of 10 rather than an awkward 25.
    equal(niceScale(23).max, 30);
    deepEqual(niceScale(23).ticks, [0, 10, 20, 30]);
  });

  it('handles zero and empty data without dividing by it', () => {
    deepEqual(niceScale(0), { max: 1, step: 1, ticks: [0, 1] });
    deepEqual(niceScale(undefined).max, 1);
  });

  it('scales to large numbers', () => {
    equal(niceScale(1234).max, 1500);
    equal(niceScale(1234).step, 500);
  });
});

describe('scaleSeries', () => {
  const box = { width: 100, height: 100, padding: { top: 0, right: 0, bottom: 0, left: 0 } };

  it('spreads points evenly across the plot', () => {
    const points = scaleSeries([0, 5, 10], { box, max: 10 });
    deepEqual(points.map((p) => p.x), [0, 50, 100]);
  });

  it('puts larger values higher, since SVG y grows downward', () => {
    const points = scaleSeries([0, 5, 10], { box, max: 10 });
    deepEqual(points.map((p) => p.y), [100, 50, 0]);
  });

  it('places a single point at the left edge rather than dividing by zero', () => {
    const points = scaleSeries([4], { box, max: 10 });
    equal(points.length, 1);
    equal(points[0].x, 0);
    ok(Number.isFinite(points[0].y));
  });

  it('handles an all-zero series', () => {
    const points = scaleSeries([0, 0], { box, max: 1 });
    deepEqual(points.map((p) => p.y), [100, 100]);
  });

  it('respects padding', () => {
    const padded = scaleSeries([0, 10], {
      box: { width: 100, height: 100, padding: { top: 10, right: 10, bottom: 10, left: 10 } },
      max: 10
    });
    equal(padded[0].x, 10);
    equal(padded[1].x, 90);
    equal(padded[1].y, 10);
  });
});

describe('paths', () => {
  it('builds a move-then-lines path', () => {
    equal(linePath([{ x: 0, y: 1 }, { x: 2, y: 3 }]), 'M 0 1 L 2 3');
  });

  it('closes an area down to the baseline', () => {
    equal(areaPath([{ x: 0, y: 1 }, { x: 2, y: 3 }], 10), 'M 0 1 L 2 3 L 2 10 L 0 10 Z');
  });

  it('returns empty for no points rather than a broken path', () => {
    equal(linePath([]), '');
    equal(areaPath([], 10), '');
    equal(linePath(undefined), '');
  });
});

describe('labelIndices', () => {
  it('labels everything when it fits', () => {
    deepEqual(labelIndices(4), [0, 1, 2, 3]);
  });

  it('thins evenly but always keeps the first and last', () => {
    const indices = labelIndices(24, 6);
    equal(indices[0], 0);
    equal(indices[indices.length - 1], 23);
    ok(indices.length <= 7, `got ${indices.length}`);
  });

  it('handles empty input', () => {
    deepEqual(labelIndices(0), []);
  });
});

describe('lineChart', () => {
  const rows = [{ m: 'a', v: 1, w: 4 }, { m: 'b', v: 3, w: 2 }];
  const chart = lineChart(rows, {
    x: (r) => r.m,
    series: [{ key: 'v', of: (r) => r.v }, { key: 'w', of: (r) => r.w }]
  });

  it('scales both series against one shared maximum', () => {
    equal(chart.max, 4);
    // The highest value in either series touches the top of the plot.
    const tops = chart.series.flatMap((s) => s.points).filter((p) => p.value === 4);
    ok(tops.every((p) => p.y === DEFAULT_BOX.padding.top));
  });

  it('produces a drawable path and a last point per series', () => {
    for (const series of chart.series) {
      ok(series.line.startsWith('M '));
      ok(series.area.endsWith('Z'));
      ok(series.last);
    }
  });

  it('emits ticks and labels positioned in the same space', () => {
    ok(chart.ticks.length >= 2);
    equal(chart.labels.length, 2);
    deepEqual(chart.labels.map((l) => l.text), ['a', 'b']);
  });

  it('survives a single row', () => {
    const single = lineChart([{ m: 'a', v: 2 }], { x: (r) => r.m, series: [{ key: 'v', of: (r) => r.v }] });
    equal(single.series[0].points.length, 1);
    ok(single.series[0].line.startsWith('M '));
  });
});
