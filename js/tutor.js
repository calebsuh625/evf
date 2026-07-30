/**
 * tutor.js — what a tutor's screens need to know.
 *
 * Pure functions. Imports time.js and hours.js. No DOM, no store.
 *
 * Everything here answers a question a tutor actually has:
 *
 *   "When am I next teaching, and what time is that for them?"
 *   "What did we do last time, and what did I set as homework?"
 *   "Did I forget to log anything?"
 *   "How many hours do I have?"
 *
 * Principle 1: these screens serve the tutor. Nothing on them exists to
 * extract data. The coordinator's numbers are a byproduct of a tutor keeping
 * their own record straight (principle 2).
 *
 * Every function takes an explicit `asOfIso` rather than reading the clock,
 * so a screen renders the same way twice and a test can assert on it.
 */

import {
  nextOccurrence,
  formatDual,
  weekAnchorUtcIso,
  slotToInterval
} from './time.js';
import {
  computeHours,
  filterSessions,
  sessionVolunteerMinutes,
  toRoundedHours,
  formatHours
} from './hours.js';

/** A session is outstanding when it is in the past and nobody has logged it. */
export function isUnlogged(session, asOfIso) {
  return session?.loggedAt == null && session?.scheduledAt != null && session.scheduledAt <= asOfIso;
}

/** Active pairings for one tutor, with the student attached. */
export function tutorPairings(tutorId, { people, pairings }, { includeInactive = false } = {}) {
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  return (pairings ?? [])
    .filter((p) => p.tutorId === tutorId && (includeInactive || p.status === 'active'))
    .map((pairing) => ({ pairing, student: byId.get(pairing.studentId) ?? null }))
    .filter((row) => row.student !== null);
}

/**
 * The most recent session that actually happened for a pairing — the source
 * of "what we covered" and "what I set as homework".
 */
export function lastHeldSession(pairingId, sessions, asOfIso) {
  return (sessions ?? [])
    .filter((s) => s.pairingId === pairingId && s.occurred === true && s.scheduledAt <= asOfIso)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))[0] ?? null;
}

/**
 * When this pairing next meets.
 *
 * Prefers a session already on the calendar. Falls back to the next time the
 * two people's shared availability comes round, because in a program that
 * runs on recurring weekend slots that is the honest answer — and a tutor
 * asking "when am I next teaching" should not get "nothing scheduled" just
 * because nobody pressed a button.
 *
 * @returns {{startUtc:string, endUtc:string|null, source:'scheduled'|'recurring',
 *            sessionId:string|null}|null}
 */
export function nextClassFor(pairing, { sessions, availability }, { asOfIso }) {
  const upcoming = (sessions ?? [])
    .filter((s) => s.pairingId === pairing.id && s.scheduledAt > asOfIso && s.occurred !== false)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];

  if (upcoming) {
    return {
      startUtc: upcoming.scheduledAt,
      endUtc: null,
      source: 'scheduled',
      sessionId: upcoming.id
    };
  }

  const shared = sharedWindows(pairing, availability, asOfIso);
  if (!shared.length) return null;

  // Resolve each shared weekly window forward from now and take the soonest.
  const candidates = shared
    .map((slot) => {
      try {
        return nextOccurrence(slot, slot.timezone, { fromIso: asOfIso });
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.startUtc.localeCompare(b.startUtc));

  const next = candidates[0];
  return next
    ? { startUtc: next.startUtc, endUtc: next.endUtc, source: 'recurring', sessionId: null }
    : null;
}

/**
 * The weekly windows a pairing can actually meet in, expressed as availability
 * rows so they can be fed back to nextOccurrence.
 *
 * Derived by intersecting the two sides in real instants, then describing the
 * result in the tutor's own zone — the tutor is who is reading it.
 */
export function sharedWindows(pairing, availability, referenceIso) {
  const rows = availability ?? [];
  const tutorRows = rows.filter((a) => a.personId === pairing.tutorId);
  const studentRows = rows.filter((a) => a.personId === pairing.studentId);
  if (!tutorRows.length || !studentRows.length) return [];

  const anchor = weekAnchorUtcIso(referenceIso);
  const tutorIntervals = tutorRows.map((row) => ({ row, ...slotToInterval(row, anchor) }));
  const studentIntervals = studentRows.map((row) => ({ row, ...slotToInterval(row, anchor) }));

  const out = [];
  for (const t of tutorIntervals) {
    for (const s of studentIntervals) {
      for (const shift of [-604800000, 0, 604800000]) {
        const start = Math.max(t.startMs, s.startMs + shift);
        const end = Math.min(t.endMs, s.endMs + shift);
        if (end <= start) continue;
        // Describe the shared window on the tutor's clock.
        out.push(intervalAsSlot(start, end, t.row.timezone));
      }
    }
  }
  return dedupeSlots(out);
}

function intervalAsSlot(startMs, endMs, timezone) {
  const dual = formatDual(new Date(startMs).toISOString(), timezone, timezone);
  const endLocal = formatDual(new Date(endMs).toISOString(), timezone, timezone);
  return {
    weekday: dual.a.weekday,
    startTime: dual.a.time,
    endTime: endLocal.a.time,
    timezone,
    minutes: Math.round((endMs - startMs) / 60000)
  };
}

function dedupeSlots(slots) {
  const seen = new Map();
  for (const slot of slots) {
    const key = `${slot.weekday}|${slot.startTime}|${slot.endTime}|${slot.timezone}`;
    if (!seen.has(key)) seen.set(key, slot);
  }
  return [...seen.values()].sort(
    (a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)
  );
}

/**
 * Everything the dashboard needs for one student card.
 *
 * @returns {{pairing, student, lastSession, nextClass, sessionCount,
 *            minutes, homework, covered}}
 */
export function studentCard(pairing, student, data, { asOfIso }) {
  const lastSession = lastHeldSession(pairing.id, data.sessions, asOfIso);
  const totals = computeHours(data.sessions, data.pairings, { pairingId: pairing.id });

  return {
    pairing,
    student,
    lastSession,
    nextClass: nextClassFor(pairing, data, { asOfIso }),
    sessionCount: totals.occurredCount,
    minutes: totals.contactMinutes,
    covered: lastSession?.covered ?? '',
    homework: lastSession?.homework ?? ''
  };
}

/**
 * Sessions this tutor has not written up yet, oldest first.
 *
 * Deliberately a plain list with no counter, no streak, and no deadline. It
 * exists so a tutor can find the thing they meant to do, not so the app can
 * tell them off (principle 3).
 */
export function outstandingLogs(tutorId, { sessions, pairings, people }, { asOfIso }) {
  const byPerson = new Map((people ?? []).map((p) => [p.id, p]));
  const mine = new Map(
    (pairings ?? []).filter((p) => p.tutorId === tutorId).map((p) => [p.id, p])
  );

  return (sessions ?? [])
    .filter((s) => mine.has(s.pairingId) && isUnlogged(s, asOfIso))
    .map((session) => ({
      session,
      pairing: mine.get(session.pairingId),
      student: byPerson.get(mine.get(session.pairingId).studentId) ?? null
    }))
    .sort((a, b) => a.session.scheduledAt.localeCompare(b.session.scheduledAt));
}

/**
 * The next class across all of a tutor's pairings — the single most useful
 * line on the dashboard.
 */
export function nextClassOverall(tutorId, data, { asOfIso }) {
  const candidates = tutorPairings(tutorId, data)
    .map(({ pairing, student }) => {
      const next = nextClassFor(pairing, data, { asOfIso });
      return next ? { ...next, pairing, student } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.startUtc.localeCompare(b.startUtc));

  if (!candidates[0]) return null;

  const chosen = candidates[0];
  return {
    ...chosen,
    lastSession: lastHeldSession(chosen.pairing.id, data.sessions, asOfIso)
  };
}

/* ------------------------------------------------------------------ *
 * Hours
 * ------------------------------------------------------------------ */

/**
 * A tutor's hours, and the basis they were computed on.
 *
 * The total is classes held x the program's standard credit, so the figures a
 * supervisor is entitled to see are the count, the rate and the product —
 * not a teaching/prep/follow-up split, which no longer adds up to anything.
 * `classTime` is the real measured time with the student, reported alongside
 * so the record can say what was counted as well as what it came to.
 */
export function hourBreakdown(tutorId, { sessions, pairings }, range = {}) {
  const totals = computeHours(sessions, pairings, { ...range, tutorId });
  return {
    creditMinutesPerSession: totals.creditMinutesPerSession,
    classTimeMinutes: totals.contactMinutes,
    classTimeHours: toRoundedHours(totals.contactMinutes),
    /* Retained so historical exports keep their columns; no longer summed. */
    teachingMinutes: totals.contactMinutes,
    prepMinutes: totals.prepMinutes,
    followupMinutes: totals.followupMinutes,
    totalMinutes: totals.volunteerMinutes,
    teachingHours: toRoundedHours(totals.contactMinutes),
    prepHours: toRoundedHours(totals.prepMinutes),
    followupHours: toRoundedHours(totals.followupMinutes),
    totalHours: totals.volunteerHours,
    totalLabel: formatHours(totals.volunteerHours),
    sessionCount: totals.occurredCount,
    firstSessionIso: totals.firstSessionIso,
    lastSessionIso: totals.lastSessionIso,
    studentIds: totals.studentIds
  };
}

/**
 * Hours per term plus an all-time row.
 *
 * Terms come from `program.terms`; a program that has not defined any still
 * gets a meaningful all-time figure rather than an empty screen.
 */
export function hoursByTerm(tutorId, data, { asOfIso }) {
  const terms = (data.program?.terms ?? []).map((term) => ({
    id: term.id,
    label: term.label,
    startsAt: term.startsAt,
    endsAt: term.endsAt,
    current: term.startsAt <= asOfIso && asOfIso < term.endsAt,
    ...hourBreakdown(tutorId, data, { fromIso: term.startsAt, toIso: term.endsAt })
  }));

  return {
    terms: terms.sort((a, b) => String(b.startsAt).localeCompare(String(a.startsAt))),
    currentTerm: terms.find((t) => t.current) ?? null,
    allTime: hourBreakdown(tutorId, data)
  };
}

/**
 * Every logged session for a tutor, newest first, with the student resolved —
 * the table on the hours screen and the rows in the CSV and the printout.
 */
export function sessionLog(tutorId, data, range = {}) {
  const byPerson = new Map(data.people.map((p) => [p.id, p]));
  const byPairing = new Map(data.pairings.map((p) => [p.id, p]));

  return filterSessions(data.sessions, data.pairings, { ...range, tutorId })
    .filter((s) => s.occurred === true)
    .map((session) => {
      const pairing = byPairing.get(session.pairingId);
      const student = byPerson.get(pairing?.studentId);
      return {
        session,
        student,
        studentName: student?.preferredName || student?.name || 'Unknown',
        minutes: sessionVolunteerMinutes(session),
        teachingMinutes: Number(session.durationMinutes) || 0,
        prepMinutes: Number(session.prepMinutes) || 0,
        followupMinutes: Number(session.followupMinutes) || 0
      };
    })
    .sort((a, b) => b.session.scheduledAt.localeCompare(a.session.scheduledAt));
}
