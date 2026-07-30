/**
 * hours.js — volunteer hour computation.
 *
 * Pure functions. Imports only time.js. No DOM, no store.
 *
 * Principle 2 lives here. Nobody logs hours. Tutors log that a session
 * happened, because knowing what happened is useful to them and to the
 * student. Hours are derived from those records afterwards. If a tutor never
 * opens the Hours screen, their hours are still correct.
 *
 * **Every class that happened is credited at a flat two hours**
 * (`SESSION_CREDIT_MINUTES`), whatever the clock said. That is the program's
 * standard block: a class plus the preparation before it and the notes after
 * it, which is what an hour of this volunteering actually costs somebody.
 * Nobody has to itemise their Friday night, and nobody is worse off for a
 * class that ran short because the student got it quickly.
 *
 * Two totals, because they answer different questions:
 *
 *   contactMinutes    time actually spent with the student
 *   volunteerMinutes  the credited figure — held classes x 2 hours
 *
 * A school service-hours form is asking for volunteered time, so
 * volunteerMinutes is the headline. contactMinutes is kept alongside and is
 * still the real measured class time, because the printed record has to be
 * able to say what it is counting and on what basis.
 *
 * That disclosure is not optional. The record is signed by an adult for NHS,
 * the Congressional Award and the President's Volunteer Service Award, so it
 * states the standard credit on its face. A record that showed two hours
 * while implying two hours were measured would be asking somebody to attest
 * to something nobody checked.
 *
 * Sessions with `occurred: false` contribute nothing and are counted
 * separately. A session that did not happen is a neutral fact about a
 * calendar, never subtracted from anything and never shown as a demerit
 * (principle 3).
 *
 * Sessions reference a pairing, not a tutor. Every function that scopes by
 * person therefore takes the pairings table too.
 */

import { monthKeyInZone, dateKeyInZone } from './time.js';

/** Granularity for reported totals. Most hour forms want quarter hours. */
export const ROUNDING_MINUTES = 15;

/**
 * What one held class is worth. Flat, deliberately.
 *
 * Set by the program, not measured per session. Changing this number changes
 * every historical total, which is correct — it is a crediting policy, not a
 * record of what a clock said.
 */
export const SESSION_CREDIT_MINUTES = 120;

/** Map pairing id -> pairing, for resolving a session to its people. */
export function indexPairings(pairings) {
  return new Map((pairings ?? []).map((p) => [p.id, p]));
}

function minutesField(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.round(num) : 0;
}

/** Time spent with the student. Zero unless the session occurred. */
export function sessionContactMinutes(session) {
  if (!session || session.occurred !== true) return 0;
  return minutesField(session.durationMinutes);
}

/**
 * The credited figure: a flat two hours for a class that happened, nothing
 * for one that did not.
 *
 * Deliberately ignores durationMinutes, prepMinutes and followupMinutes. A
 * tutor who runs forty minutes because the student understood it quickly has
 * given the same slot of their Saturday as one who ran ninety.
 */
export function sessionVolunteerMinutes(session, credit = SESSION_CREDIT_MINUTES) {
  if (!session || session.occurred !== true) return 0;
  return credit;
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
  if (!iso) return false;
  if (fromIso && iso < fromIso) return false;
  if (toIso && iso >= toIso) return false;
  return true;
}

/**
 * Filter sessions by person, pairing, and half-open instant range.
 *
 * @param {object[]} sessions
 * @param {object[]} pairings
 * @param {{tutorId?:string, studentId?:string, pairingId?:string,
 *          fromIso?:string, toIso?:string, occurredOnly?:boolean}} [filter]
 */
export function filterSessions(sessions, pairings, filter = {}) {
  const { tutorId, studentId, pairingId, fromIso, toIso, occurredOnly } = filter;
  const index = indexPairings(pairings);

  return (sessions ?? []).filter((s) => {
    if (pairingId && s.pairingId !== pairingId) return false;
    if (occurredOnly && s.occurred !== true) return false;

    if (tutorId || studentId) {
      const pairing = index.get(s.pairingId);
      // A session whose pairing is missing cannot be attributed to anyone.
      // It is excluded from person-scoped queries rather than guessed at.
      if (!pairing) return false;
      if (tutorId && pairing.tutorId !== tutorId) return false;
      if (studentId && pairing.studentId !== studentId) return false;
    }

    return inRange(s.scheduledAt, fromIso, toIso);
  });
}

/** The tutor and student behind a session, or nulls if the pairing is gone. */
export function peopleForSession(session, pairings) {
  const pairing = indexPairings(pairings).get(session?.pairingId);
  return { tutorId: pairing?.tutorId ?? null, studentId: pairing?.studentId ?? null, pairing: pairing ?? null };
}

/**
 * Totals for whatever the filter selects. The number a school hour form asks
 * for is `volunteerHours`.
 *
 * @returns {{
 *   occurredCount:number, missedCount:number,
 *   contactMinutes:number, volunteerMinutes:number,
 *   contactHours:number, volunteerHours:number,
 *   hoursLabel:string, contactHoursLabel:string,
 *   prepMinutes:number, followupMinutes:number,
 *   firstSessionIso:string|null, lastSessionIso:string|null,
 *   studentIds:string[], pairingIds:string[]
 * }}
 */
export function computeHours(sessions, pairings, filter = {}) {
  const scoped = filterSessions(sessions, pairings, { ...filter, occurredOnly: false });
  const index = indexPairings(pairings);

  let contactMinutes = 0;
  let volunteerMinutes = 0;
  let prepMinutes = 0;
  let followupMinutes = 0;
  let occurredCount = 0;
  let missedCount = 0;
  let firstSessionIso = null;
  let lastSessionIso = null;
  const studentIds = new Set();
  const pairingIds = new Set();

  for (const s of scoped) {
    if (s.occurred !== true) { missedCount += 1; continue; }

    const contact = sessionContactMinutes(s);
    contactMinutes += contact;
    volunteerMinutes += sessionVolunteerMinutes(s);
    prepMinutes += minutesField(s.prepMinutes);
    followupMinutes += minutesField(s.followupMinutes);
    occurredCount += 1;

    if (!firstSessionIso || s.scheduledAt < firstSessionIso) firstSessionIso = s.scheduledAt;
    if (!lastSessionIso || s.scheduledAt > lastSessionIso) lastSessionIso = s.scheduledAt;

    pairingIds.add(s.pairingId);
    const studentId = index.get(s.pairingId)?.studentId;
    if (studentId) studentIds.add(studentId);
  }

  const volunteerHours = toRoundedHours(volunteerMinutes);
  const contactHours = toRoundedHours(contactMinutes);

  return {
    // The basis travels with the total, so every screen and the printed
    // record say the same thing about where the number came from.
    creditMinutesPerSession: SESSION_CREDIT_MINUTES,
    occurredCount,
    missedCount,
    contactMinutes,
    volunteerMinutes,
    contactHours,
    volunteerHours,
    hoursLabel: formatHours(volunteerHours),
    contactHoursLabel: formatHours(contactHours),
    prepMinutes,
    followupMinutes,
    firstSessionIso,
    lastSessionIso,
    studentIds: [...studentIds].sort(),
    pairingIds: [...pairingIds].sort()
  };
}

/**
 * Per-tutor totals, highest first. Tutors with no sessions are included with
 * zeros — an empty row is information, and leaving people off a list is how a
 * program loses track of who volunteered.
 *
 * @param {object[]} sessions
 * @param {object[]} pairings
 * @param {object[]} tutors people with role 'tutor'
 * @param {{fromIso?:string, toIso?:string}} [range]
 */
export function summarizeByTutor(sessions, pairings, tutors, range = {}) {
  return (tutors ?? [])
    .map((tutor) => ({
      tutorId: tutor.id,
      name: tutor.preferredName || tutor.name || tutor.id,
      ...computeHours(sessions, pairings, { ...range, tutorId: tutor.id })
    }))
    .sort((a, b) => b.volunteerMinutes - a.volunteerMinutes || a.name.localeCompare(b.name));
}

/** Per-student totals, most tutored first. */
export function summarizeByStudent(sessions, pairings, students, range = {}) {
  return (students ?? [])
    .map((student) => ({
      studentId: student.id,
      name: student.preferredName || student.name || student.id,
      ...computeHours(sessions, pairings, { ...range, studentId: student.id })
    }))
    .sort((a, b) => b.contactMinutes - a.contactMinutes || a.name.localeCompare(b.name));
}

/**
 * Monthly buckets, oldest first. Months with no sessions are omitted rather
 * than zero-filled; callers wanting a continuous axis can fill the gaps.
 *
 * @param {object[]} sessions
 * @param {object[]} pairings
 * @param {{tz:string, tutorId?:string, studentId?:string}} opts month
 *        boundaries are decided in `tz` — a session at 22:00 on Mar 31 in New
 *        York is a March session on a US tutor's form even though it is
 *        April 1 in UTC.
 */
export function hoursByMonth(sessions, pairings, opts) {
  const { tz, tutorId, studentId } = opts ?? {};
  if (!tz) throw new TypeError('hoursByMonth requires opts.tz');

  const buckets = new Map();
  for (const s of filterSessions(sessions, pairings, { tutorId, studentId })) {
    const minutes = sessionVolunteerMinutes(s);
    if (minutes === 0) continue;
    const key = monthKeyInZone(s.scheduledAt, tz);
    const bucket = buckets.get(key) ?? { month: key, volunteerMinutes: 0, contactMinutes: 0, occurredCount: 0 };
    bucket.volunteerMinutes += minutes;
    bucket.contactMinutes += sessionContactMinutes(s);
    bucket.occurredCount += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map((b) => ({
      ...b,
      volunteerHours: toRoundedHours(b.volunteerMinutes),
      hoursLabel: formatHours(toRoundedHours(b.volunteerMinutes))
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Distinct weeks containing at least one session that happened.
 *
 * Reported, never enforced. Nothing anywhere consumes a low number here, and
 * there is no screen that tells someone a streak was broken (principle 3).
 */
export function activeWeeks(sessions, pairings, opts) {
  const { tz, tutorId } = opts ?? {};
  if (!tz) throw new TypeError('activeWeeks requires opts.tz');

  const weeks = new Set();
  for (const s of filterSessions(sessions, pairings, { tutorId })) {
    if (sessionVolunteerMinutes(s) === 0) continue;
    weeks.add(weekKey(s.scheduledAt, tz));
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
 * Active pairings whose most recent session that actually happened is older
 * than `weeks`, oldest first.
 *
 * This is a support tool, not an enforcement one. A pairing goes quiet
 * because of exam season, a family trip, or a tutor who needs someone to ask
 * whether they are stuck — and the coordinator can only help if they can see
 * it. Nothing here penalises anybody, no count is stored against a person,
 * and a quiet pairing is never surfaced to the tutor as a warning.
 *
 * @param {object[]} sessions
 * @param {object[]} pairings
 * @param {{asOfIso: string, weeks?: number}} opts asOfIso is required rather
 *        than defaulted to now, so this is testable and so a report run over
 *        a historical window gives the same answer every time.
 * @returns {Array<{pairingId:string, tutorId:string, studentId:string,
 *                  lastSessionIso:string|null, daysSince:number|null}>}
 */
export function pairingsNeedingCheckIn(sessions, pairings, opts) {
  const { asOfIso, weeks = 4 } = opts ?? {};
  if (!asOfIso) throw new TypeError('pairingsNeedingCheckIn requires opts.asOfIso');

  const asOfMs = new Date(asOfIso).getTime();
  const cutoffMs = asOfMs - weeks * 7 * 86400000;

  const lastByPairing = new Map();
  for (const s of sessions ?? []) {
    if (s.occurred !== true || !s.scheduledAt) continue;
    if (s.scheduledAt > asOfIso) continue; // ignore anything in the future
    const current = lastByPairing.get(s.pairingId);
    if (!current || s.scheduledAt > current) lastByPairing.set(s.pairingId, s.scheduledAt);
  }

  return (pairings ?? [])
    .filter((p) => p.status === 'active')
    .map((p) => {
      const lastSessionIso = lastByPairing.get(p.id) ?? null;
      return {
        pairingId: p.id,
        tutorId: p.tutorId,
        studentId: p.studentId,
        lastSessionIso,
        daysSince: lastSessionIso
          ? Math.floor((asOfMs - new Date(lastSessionIso).getTime()) / 86400000)
          : null
      };
    })
    .filter((row) => row.lastSessionIso === null || new Date(row.lastSessionIso).getTime() < cutoffMs)
    .sort((a, b) => {
      // Never-met pairings first, then longest quiet.
      if (a.lastSessionIso === null && b.lastSessionIso !== null) return -1;
      if (b.lastSessionIso === null && a.lastSessionIso !== null) return 1;
      return String(a.lastSessionIso).localeCompare(String(b.lastSessionIso));
    });
}

/**
 * Program-wide roll-up for the admin screen. Every figure here is derived
 * from tutors logging sessions for their own reasons.
 */
export function programTotals(sessions, pairings, people, range = {}) {
  const tutors = (people ?? []).filter((p) => p.role === 'tutor');
  const students = (people ?? []).filter((p) => p.role === 'student');

  const overall = computeHours(sessions, pairings, range);
  const perTutor = summarizeByTutor(sessions, pairings, tutors, range);
  const activeTutors = perTutor.filter((t) => t.occurredCount > 0).length;

  return {
    occurredCount: overall.occurredCount,
    missedCount: overall.missedCount,
    contactMinutes: overall.contactMinutes,
    volunteerMinutes: overall.volunteerMinutes,
    contactHours: overall.contactHours,
    volunteerHours: overall.volunteerHours,
    hoursLabel: overall.hoursLabel,
    prepMinutes: overall.prepMinutes,
    followupMinutes: overall.followupMinutes,
    activeTutors,
    rosteredTutors: tutors.length,
    studentsReached: overall.studentIds.length,
    rosteredStudents: students.length,
    activePairings: (pairings ?? []).filter((p) => p.status === 'active').length,
    medianHoursPerTutor: median(perTutor.filter((t) => t.occurredCount > 0).map((t) => t.volunteerHours))
  };
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
