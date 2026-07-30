/**
 * hours.js — volunteer hour computation.
 *
 * Pure functions. Imports only time.js. No DOM, no store.
 *
 * Principle 2 lives here. Nobody logs hours. Tutors log that a session
 * happened, because knowing what happened is useful to them and to the
 * student. Hours are derived from those records afterwards. If a tutor never
 * looks at this screen, their hours are still correct.
 *
 * Only sessions with status 'held' contribute. A canceled session is a
 * neutral fact about a calendar, not a mark against anyone (principle 3),
 * so it is counted separately and never subtracted from anything.
 */

import { monthKeyInZone, dateKeyInZone } from './time.js';

/** Statuses that represent time actually spent tutoring. */
export const COUNTED_STATUSES = Object.freeze(['held']);

/** Granularity for reported totals. Most hour forms want quarter hours. */
export const ROUNDING_MINUTES = 15;

/** Minutes a session contributes. Anything unheld or malformed contributes 0. */
export function sessionMinutes(session) {
  if (!session || !COUNTED_STATUSES.includes(session.status)) return 0;
  const minutes = Number(session.durationMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.round(minutes);
}

/** Minutes to hours, rounded to the nearest quarter hour. */
export function toRoundedHours(minutes, granularity = ROUNDING_MINUTES) {
  const rounded = Math.round(minutes / granularity) * granularity;
  return rounded / 60;
}

/** Hours as a form-ready string: 2 -> "2", 2.5 -> "2.5", 2.25 -> "2.25". */
export function formatHours(hours) {
  return String(Number(hours.toFixed(2)));
}

function inRange(iso, fromIso, toIso) {
  if (fromIso && iso < fromIso) return false;
  if (toIso && iso >= toIso) return false;
  return true;
}

/**
 * Filter sessions by tutor, student, and half-open instant range.
 *
 * @param {object[]} sessions
 * @param {{tutorId?:string, studentId?:string, fromIso?:string, toIso?:string,
 *          status?:string}} [filter]
 */
export function filterSessions(sessions, filter = {}) {
  const { tutorId, studentId, fromIso, toIso, status } = filter;
  return (sessions ?? []).filter((s) => {
    if (tutorId && s.tutorId !== tutorId) return false;
    if (studentId && s.studentId !== studentId) return false;
    if (status && s.status !== status) return false;
    return inRange(s.startsAt, fromIso, toIso);
  });
}

/**
 * One tutor's totals. The number a school hour form asks for is `hours`.
 *
 * @returns {{
 *   tutorId: string|null, heldCount: number, canceledCount: number,
 *   minutes: number, hours: number, hoursLabel: string,
 *   firstSessionIso: string|null, lastSessionIso: string|null,
 *   studentIds: string[]
 * }}
 */
export function computeHours(sessions, filter = {}) {
  const scoped = filterSessions(sessions, { ...filter, status: undefined });

  let minutes = 0;
  let heldCount = 0;
  let canceledCount = 0;
  let firstSessionIso = null;
  let lastSessionIso = null;
  const studentIds = new Set();

  for (const s of scoped) {
    const m = sessionMinutes(s);
    if (m > 0) {
      minutes += m;
      heldCount += 1;
      if (!firstSessionIso || s.startsAt < firstSessionIso) firstSessionIso = s.startsAt;
      if (!lastSessionIso || s.startsAt > lastSessionIso) lastSessionIso = s.startsAt;
      if (s.studentId) studentIds.add(s.studentId);
    } else if (s.status === 'canceled') {
      canceledCount += 1;
    }
  }

  const hours = toRoundedHours(minutes);
  return {
    tutorId: filter.tutorId ?? null,
    heldCount,
    canceledCount,
    minutes,
    hours,
    hoursLabel: formatHours(hours),
    firstSessionIso,
    lastSessionIso,
    studentIds: [...studentIds].sort()
  };
}

/**
 * Per-tutor totals, highest first. Tutors with zero held sessions are
 * included with zeros — an empty row is information, and leaving people off
 * a list is how a program loses track of who volunteered.
 *
 * @param {object[]} sessions
 * @param {object[]} tutors
 * @param {{fromIso?:string, toIso?:string}} [range]
 */
export function summarizeByTutor(sessions, tutors, range = {}) {
  return (tutors ?? [])
    .map((tutor) => ({
      tutorId: tutor.id,
      displayName: tutor.displayName ?? tutor.id,
      ...computeHours(sessions, { ...range, tutorId: tutor.id })
    }))
    .sort((a, b) => b.minutes - a.minutes || a.displayName.localeCompare(b.displayName));
}

/**
 * Monthly buckets, oldest first. Months with no sessions are omitted rather
 * than zero-filled; callers that want a continuous axis can fill gaps.
 *
 * @param {object[]} sessions
 * @param {{tz: string, tutorId?: string}} opts month boundaries are decided
 *        in `tz` — a session at 22:00 Mar 31 in New York is a March session
 *        for a US tutor's form, even though it is April 1 in UTC.
 */
export function hoursByMonth(sessions, opts) {
  const { tz, tutorId } = opts ?? {};
  if (!tz) throw new TypeError('hoursByMonth requires opts.tz');

  const buckets = new Map();
  for (const s of filterSessions(sessions, { tutorId })) {
    const m = sessionMinutes(s);
    if (m === 0) continue;
    const key = monthKeyInZone(s.startsAt, tz);
    const bucket = buckets.get(key) ?? { month: key, minutes: 0, heldCount: 0 };
    bucket.minutes += m;
    bucket.heldCount += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map((b) => ({ ...b, hours: toRoundedHours(b.minutes), hoursLabel: formatHours(toRoundedHours(b.minutes)) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Weekly streak of consecutive weeks with at least one held session, ending
 * at the most recent session.
 *
 * Reported, never enforced. There is no screen that says a streak was
 * broken, and nothing anywhere consumes a zero here (principle 3).
 */
export function activeWeeks(sessions, opts) {
  const { tz, tutorId } = opts ?? {};
  if (!tz) throw new TypeError('activeWeeks requires opts.tz');

  const weeks = new Set();
  for (const s of filterSessions(sessions, { tutorId })) {
    if (sessionMinutes(s) === 0) continue;
    weeks.add(weekKey(s.startsAt, tz));
  }
  return weeks.size;
}

function weekKey(iso, tz) {
  // Anchor on the date in-zone, then snap back to that week's Sunday.
  const [y, m, d] = dateKeyInZone(iso, tz).split('-').map(Number);
  const asUtc = Date.UTC(y, m - 1, d);
  const sunday = asUtc - new Date(asUtc).getUTCDay() * 86400000;
  return new Date(sunday).toISOString().slice(0, 10);
}

/**
 * Program-wide roll-up for the admin screen. Every figure here is derived
 * from tutors logging sessions for their own reasons.
 */
export function programTotals(sessions, tutors, students, range = {}) {
  const overall = computeHours(sessions, range);
  const perTutor = summarizeByTutor(sessions, tutors, range);
  const activeTutors = perTutor.filter((t) => t.heldCount > 0).length;

  const studentsReached = new Set();
  for (const s of filterSessions(sessions, range)) {
    if (sessionMinutes(s) > 0 && s.studentId) studentsReached.add(s.studentId);
  }

  return {
    heldCount: overall.heldCount,
    canceledCount: overall.canceledCount,
    minutes: overall.minutes,
    hours: overall.hours,
    hoursLabel: overall.hoursLabel,
    activeTutors,
    rosteredTutors: (tutors ?? []).length,
    studentsReached: studentsReached.size,
    rosteredStudents: (students ?? []).length,
    medianHoursPerTutor: median(perTutor.filter((t) => t.heldCount > 0).map((t) => t.hours))
  };
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
