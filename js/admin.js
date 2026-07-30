/**
 * admin.js — what the coordinator's screens compute.
 *
 * Pure functions. Imports time.js and hours.js. No DOM, no store.
 *
 * ── The rule these screens are built on ──────────────────────────────
 *
 * **Everything here is computed.** No admin screen may be populated by asking
 * somebody to fill something in. Every number below is derived from things
 * people did for their own reasons — a tutor logging a session so they can
 * remember what they covered, a person stating when they are free so they can
 * be matched. That is principle 2, and it is the difference between an
 * administrative tool and an administrative burden.
 *
 * If a figure cannot be computed from existing records, the answer is that the
 * program does not get that figure, not that volunteers get a new form.
 *
 * ── What is deliberately absent ──────────────────────────────────────
 *
 * No strike counts, no suspension state, no compliance percentages, no
 * "reliability" score, and nothing that produces an automated message to a
 * volunteer. `quietPairings` exists so a human can notice a pairing has gone
 * quiet and ask whether someone needs help — it stores nothing against
 * anybody, and it must never acquire a threshold that triggers an action.
 */

import { monthKeyInZone, dateKeyInZone, addMinutes } from './time.js';
import {
  computeHours,
  summarizeByTutor,
  filterSessions,
  toRoundedHours,
  formatHours
} from './hours.js';

const DAY_MS = 86400000;

/* ------------------------------------------------------------------ *
 * Counts
 * ------------------------------------------------------------------ */

/** The headline numbers, all derived. */
export function programCounts(data) {
  const tutors = data.people.filter((p) => p.role === 'tutor');
  const students = data.people.filter((p) => p.role === 'student');
  const active = data.pairings.filter((p) => p.status === 'active');

  return {
    activePairings: active.length,
    pausedPairings: data.pairings.filter((p) => p.status === 'paused').length,
    endedPairings: data.pairings.filter((p) => p.status === 'ended').length,
    tutors: tutors.length,
    activeTutors: tutors.filter((t) => t.active !== false).length,
    students: students.length,
    activeStudents: students.filter((s) => s.active !== false).length,
    sessionsLogged: data.sessions.filter((s) => s.loggedAt != null).length,
    sessionsHeld: data.sessions.filter((s) => s.occurred === true).length
  };
}

/* ------------------------------------------------------------------ *
 * Hours by period
 * ------------------------------------------------------------------ */

/** Start of the week (Monday) containing `iso`, in `tz`, as an instant. */
function startOfWeek(iso, tz) {
  const key = dateKeyInZone(iso, tz);
  const [y, m, d] = key.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const weekday = new Date(utc).getUTCDay();          // 0 = Sunday
  const backToMonday = (weekday + 6) % 7;             // Monday-based week
  return new Date(utc - backToMonday * DAY_MS).toISOString();
}

function startOfMonth(iso, tz) {
  const [y, m] = monthKeyInZone(iso, tz).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toISOString();
}

/**
 * Hours this week, this month, this term and all time.
 *
 * Boundaries resolve in the program's admin zone, so "this week" means the
 * week the coordinator is living in rather than the week UTC is having.
 *
 * @param {object} data
 * @param {{nowIso: string, tz?: string}} opts
 */
export function periodTotals(data, opts) {
  const { nowIso } = opts ?? {};
  if (!nowIso) throw new TypeError('periodTotals requires opts.nowIso');
  const tz = opts.tz ?? data.program?.adminTimeZone ?? 'UTC';

  const term = (data.program?.terms ?? []).find(
    (t) => t.startsAt <= nowIso && nowIso < t.endsAt
  ) ?? null;

  const scope = (fromIso, toIso) => {
    const totals = computeHours(data.sessions, data.pairings, { fromIso, toIso });
    return {
      fromIso: fromIso ?? null,
      toIso: toIso ?? null,
      minutes: totals.volunteerMinutes,
      contactMinutes: totals.contactMinutes,
      hours: totals.volunteerHours,
      label: totals.hoursLabel,
      sessions: totals.occurredCount
    };
  };

  // The window ends an instant after now so a session logged this minute counts.
  const end = addMinutes(nowIso, 1);

  return {
    week: scope(startOfWeek(nowIso, tz), end),
    month: scope(startOfMonth(nowIso, tz), end),
    term: term ? { ...scope(term.startsAt, term.endsAt), label2: term.label, id: term.id } : null,
    allTime: scope(undefined, undefined),
    timezone: tz
  };
}

/* ------------------------------------------------------------------ *
 * Growth
 * ------------------------------------------------------------------ */

function monthRange(fromKey, toKey) {
  const out = [];
  let [y, m] = fromKey.split('-').map(Number);
  const [ty, tm] = toKey.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/**
 * People and activity per month, cumulative — the shape of the program over
 * time, computed from when records were created and when sessions happened.
 *
 * Months with nothing in them are still emitted, because a flat stretch is
 * information and a chart that silently skips it lies about the shape.
 *
 * @param {object} data
 * @param {{tz?: string, nowIso: string}} opts
 * @returns {Array<{month, joinedTutors, joinedStudents, tutors, students,
 *                  sessions, hours}>}
 */
export function growthByMonth(data, opts) {
  const { nowIso } = opts ?? {};
  if (!nowIso) throw new TypeError('growthByMonth requires opts.nowIso');
  const tz = opts.tz ?? data.program?.adminTimeZone ?? 'UTC';

  const stamps = [
    ...data.people.map((p) => p.createdAt).filter(Boolean),
    ...data.sessions.map((s) => s.scheduledAt).filter(Boolean)
  ];
  if (!stamps.length) return [];

  const first = monthKeyInZone(stamps.reduce((a, b) => (a < b ? a : b)), tz);
  const months = monthRange(first, monthKeyInZone(nowIso, tz));

  const joined = new Map(months.map((m) => [m, { tutors: 0, students: 0 }]));
  for (const person of data.people) {
    if (!person.createdAt) continue;
    const key = monthKeyInZone(person.createdAt, tz);
    const bucket = joined.get(key);
    if (!bucket) continue;
    if (person.role === 'tutor') bucket.tutors += 1;
    else bucket.students += 1;
  }

  const activity = new Map(months.map((m) => [m, { sessions: 0, minutes: 0 }]));
  for (const session of data.sessions) {
    if (session.occurred !== true || !session.scheduledAt) continue;
    const bucket = activity.get(monthKeyInZone(session.scheduledAt, tz));
    if (!bucket) continue;
    bucket.sessions += 1;
    bucket.minutes += Number(session.durationMinutes) || 0;
  }

  let tutors = 0;
  let students = 0;
  return months.map((month) => {
    const j = joined.get(month);
    const a = activity.get(month);
    tutors += j.tutors;
    students += j.students;
    return {
      month,
      joinedTutors: j.tutors,
      joinedStudents: j.students,
      tutors,
      students,
      sessions: a.sessions,
      hours: toRoundedHours(a.minutes)
    };
  });
}

/* ------------------------------------------------------------------ *
 * Needs attention
 * ------------------------------------------------------------------ */

/**
 * Active pairings with nothing logged for `weeks`, longest quiet first.
 *
 * The hardest thing to see in a program like this: nobody reports that a
 * pairing has drifted, because neither side wants to be the one who says it.
 * This is a prompt for a human to ask how it is going — it stores nothing
 * against anybody, and there is deliberately no threshold at which anything
 * happens automatically.
 */
export function quietPairings(data, opts) {
  const { nowIso, weeks = 2 } = opts ?? {};
  if (!nowIso) throw new TypeError('quietPairings requires opts.nowIso');

  const cutoffMs = Date.parse(nowIso) - weeks * 7 * DAY_MS;
  const byId = new Map(data.people.map((p) => [p.id, p]));

  const lastHeld = new Map();
  for (const session of data.sessions) {
    if (session.occurred !== true || !session.scheduledAt) continue;
    if (session.scheduledAt > nowIso) continue;
    const current = lastHeld.get(session.pairingId);
    if (!current || session.scheduledAt > current) lastHeld.set(session.pairingId, session.scheduledAt);
  }

  return data.pairings
    .filter((p) => p.status === 'active')
    .map((pairing) => {
      const last = lastHeld.get(pairing.id) ?? null;
      const since = last ?? pairing.startedAt ?? null;
      return {
        pairing,
        tutor: byId.get(pairing.tutorId) ?? null,
        student: byId.get(pairing.studentId) ?? null,
        lastSessionIso: last,
        // A pairing that has never met is measured from when it started, so a
        // brand-new pairing does not appear on day one.
        daysQuiet: since ? Math.floor((Date.parse(nowIso) - Date.parse(since)) / DAY_MS) : null,
        neverMet: last === null
      };
    })
    .filter((row) => {
      const since = row.lastSessionIso ?? row.pairing.startedAt;
      return since ? Date.parse(since) < cutoffMs : false;
    })
    .sort((a, b) => (b.daysQuiet ?? 0) - (a.daysQuiet ?? 0));
}

/** Active students with no active pairing. Paused counts as unpaired. */
export function studentsWaiting(data) {
  const paired = new Set(
    data.pairings.filter((p) => p.status === 'active').map((p) => p.studentId)
  );
  return data.people
    .filter((p) => p.role === 'student' && p.active !== false && !paired.has(p.id))
    .map((student) => ({
      student,
      // Whether they have ever had a tutor changes the conversation entirely.
      previousPairings: data.pairings.filter((p) => p.studentId === student.id).length
    }));
}

/** Active tutors below the maximum they set for themselves. */
export function tutorsWithCapacity(data) {
  const load = new Map();
  for (const p of data.pairings) {
    if (p.status !== 'active') continue;
    load.set(p.tutorId, (load.get(p.tutorId) ?? 0) + 1);
  }

  return data.people
    .filter((p) => p.role === 'tutor' && p.active !== false)
    .map((tutor) => {
      const used = load.get(tutor.id) ?? 0;
      const capacity = Number.isFinite(Number(tutor.maxStudents)) ? Number(tutor.maxStudents) : 2;
      return { tutor, used, capacity, remaining: capacity - used };
    })
    .filter((row) => row.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining || a.tutor.name.localeCompare(b.tutor.name));
}

/**
 * Classes recently logged as not having happened.
 *
 * Shown so a coordinator can notice a run of them and ask whether something
 * has changed — a clashing school timetable, an exam period, a family move.
 * A single one is normal and means nothing. Nothing here is counted against
 * anyone, and there is no total per person by design.
 */
export function recentMisses(data, opts) {
  const { nowIso, days = 28 } = opts ?? {};
  if (!nowIso) throw new TypeError('recentMisses requires opts.nowIso');

  const fromIso = new Date(Date.parse(nowIso) - days * DAY_MS).toISOString();
  const byId = new Map(data.people.map((p) => [p.id, p]));
  const byPairing = new Map(data.pairings.map((p) => [p.id, p]));

  return data.sessions
    .filter((s) => s.occurred === false && s.scheduledAt >= fromIso && s.scheduledAt <= nowIso)
    .map((session) => {
      const pairing = byPairing.get(session.pairingId) ?? null;
      return {
        session,
        pairing,
        tutor: pairing ? byId.get(pairing.tutorId) ?? null : null,
        student: pairing ? byId.get(pairing.studentId) ?? null : null,
        note: session.covered ?? ''
      };
    })
    .sort((a, b) => b.session.scheduledAt.localeCompare(a.session.scheduledAt));
}

/** Everything the attention screen shows, in one pass. */
export function attentionReport(data, opts) {
  const { nowIso, quietWeeks = 2, missWindowDays = 28 } = opts ?? {};
  if (!nowIso) throw new TypeError('attentionReport requires opts.nowIso');

  const quiet = quietPairings(data, { nowIso, weeks: quietWeeks });
  const waiting = studentsWaiting(data);
  const capacity = tutorsWithCapacity(data);
  const misses = recentMisses(data, { nowIso, days: missWindowDays });

  return {
    quiet,
    waiting,
    capacity,
    misses,
    counts: {
      quiet: quiet.length,
      waiting: waiting.length,
      capacity: capacity.reduce((n, row) => n + row.remaining, 0),
      misses: misses.length
    },
    // True when there is genuinely nothing to do, which is worth saying out
    // loud rather than showing four empty boxes.
    allClear: quiet.length === 0 && waiting.length === 0 && misses.length === 0
  };
}

/* ------------------------------------------------------------------ *
 * Roster
 * ------------------------------------------------------------------ */

/**
 * Everyone, with their computed status. Nothing here is a stored field: a
 * person's "status" is derived from their pairings every time it is asked for,
 * so it cannot fall out of date.
 */
export function rosterRows(data) {
  const load = new Map();
  for (const p of data.pairings) {
    if (p.status !== 'active') continue;
    load.set(p.tutorId, (load.get(p.tutorId) ?? 0) + 1);
    load.set(p.studentId, (load.get(p.studentId) ?? 0) + 1);
  }

  const sessionsByPerson = new Map();
  const byPairing = new Map(data.pairings.map((p) => [p.id, p]));
  for (const session of data.sessions) {
    if (session.occurred !== true) continue;
    const pairing = byPairing.get(session.pairingId);
    if (!pairing) continue;
    for (const id of [pairing.tutorId, pairing.studentId]) {
      sessionsByPerson.set(id, (sessionsByPerson.get(id) ?? 0) + 1);
    }
  }

  return data.people.map((person) => {
    const activePairings = load.get(person.id) ?? 0;
    const capacity = person.role === 'tutor'
      ? (Number.isFinite(Number(person.maxStudents)) ? Number(person.maxStudents) : 2)
      : 1;

    return {
      person,
      role: person.role,
      active: person.active !== false,
      activePairings,
      capacity,
      remaining: person.role === 'tutor' ? capacity - activePairings : 0,
      sessions: sessionsByPerson.get(person.id) ?? 0,
      status: statusOf(person, activePairings)
    };
  });
}

function statusOf(person, activePairings) {
  if (person.active === false) return 'inactive';
  if (activePairings > 0) return 'paired';
  if (person.role === 'tutor' && person.acceptingStudents === false) return 'not-accepting';
  return 'unpaired';
}

/** Filter roster rows without the view having to know the shape. */
export function filterRoster(rows, { role = 'all', status = 'all', query = '' } = {}) {
  const needle = query.trim().toLowerCase();

  return rows.filter((row) => {
    if (role !== 'all' && row.role !== role) return false;
    if (status !== 'all' && row.status !== status) return false;
    if (!needle) return true;

    const haystack = [
      row.person.name, row.person.preferredName, row.person.email,
      row.person.wechat, row.person.school,
      ...(row.person.subjects ?? []), ...(row.person.goals ?? [])
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(needle);
  });
}

/** One person's full history, for their detail page. */
export function personHistory(personId, data) {
  const pairings = data.pairings
    .filter((p) => p.tutorId === personId || p.studentId === personId)
    .sort((a, b) => String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')));

  const ids = new Set(pairings.map((p) => p.id));
  const sessions = data.sessions
    .filter((s) => ids.has(s.pairingId))
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));

  const totals = data.people.find((p) => p.id === personId)?.role === 'tutor'
    ? computeHours(data.sessions, data.pairings, { tutorId: personId })
    : computeHours(data.sessions, data.pairings, { studentId: personId });

  return { pairings, sessions, totals };
}

/* ------------------------------------------------------------------ *
 * Export rows
 * ------------------------------------------------------------------ */

/**
 * Hours per tutor, as rows ready for CSV.
 *
 * A report rather than a table: it is derived, so it is deliberately not one
 * of store.js's round-trippable CSV types. Exporting it is useful; importing
 * it would mean typing hours in by hand, which is the thing this program does
 * not do.
 */
export function hoursByTutorRows(data, range = {}) {
  const tutors = data.people.filter((p) => p.role === 'tutor');

  return summarizeByTutor(data.sessions, data.pairings, tutors, range).map((row) => ({
    tutorId: row.tutorId,
    name: row.name,
    sessions: row.occurredCount,
    teachingMinutes: row.contactMinutes,
    prepMinutes: row.prepMinutes,
    followupMinutes: row.followupMinutes,
    totalMinutes: row.volunteerMinutes,
    totalHours: formatHours(row.volunteerHours),
    students: row.studentIds.length,
    firstSession: row.firstSessionIso ? row.firstSessionIso.slice(0, 10) : '',
    lastSession: row.lastSessionIso ? row.lastSessionIso.slice(0, 10) : ''
  }));
}

export const HOURS_BY_TUTOR_COLUMNS = Object.freeze([
  'tutorId', 'name', 'sessions', 'teachingMinutes', 'prepMinutes',
  'followupMinutes', 'totalMinutes', 'totalHours', 'students',
  'firstSession', 'lastSession'
]);

/** Sessions with the people resolved, for an export a human will read. */
export function sessionReportRows(data, opts = {}) {
  const tz = opts.tz ?? data.program?.adminTimeZone ?? 'UTC';
  const byId = new Map(data.people.map((p) => [p.id, p]));
  const byPairing = new Map(data.pairings.map((p) => [p.id, p]));

  return filterSessions(data.sessions, data.pairings, opts)
    .filter((s) => s.loggedAt != null)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
    .map((session) => {
      const pairing = byPairing.get(session.pairingId);
      const tutor = pairing ? byId.get(pairing.tutorId) : null;
      const student = pairing ? byId.get(pairing.studentId) : null;
      return {
        date: dateKeyInZone(session.scheduledAt, tz),
        tutor: tutor?.name ?? '',
        student: student?.name ?? '',
        occurred: session.occurred === true ? 'yes' : 'no',
        teachingMinutes: Number(session.durationMinutes) || 0,
        prepMinutes: Number(session.prepMinutes) || 0,
        followupMinutes: Number(session.followupMinutes) || 0,
        covered: session.covered ?? '',
        homework: session.homework ?? ''
      };
    });
}

export const SESSION_REPORT_COLUMNS = Object.freeze([
  'date', 'tutor', 'student', 'occurred', 'teachingMinutes',
  'prepMinutes', 'followupMinutes', 'covered', 'homework'
]);
