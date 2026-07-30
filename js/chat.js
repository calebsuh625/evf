/**
 * chat.js — one thread per class.
 *
 * Pure functions. Imports time.js only. No DOM, no store.
 *
 * ── The shape ────────────────────────────────────────────────────────
 *
 * A thread is a pairing. Tutor A with students B and C has two threads: one
 * with B (plus B's guardian, plus the coordinator) and one with C. Threads are
 * derived from the pairings table, never stored — there is no way for a thread
 * to exist without a class behind it, and no way for a class to be missing one.
 *
 * ── Two rules that are not preferences ───────────────────────────────
 *
 * **The coordinator is in every thread.** Not as a moderator who can be
 * removed, not as an audit log somebody could turn off: structurally, always.
 * These are conversations between a teenaged volunteer and a child, and an
 * adult with responsibility for the program can see all of them.
 *
 * **There are no private messages.** No tutor-to-student channel, no
 * student-to-student channel, no direct line that bypasses the thread. If a
 * future version adds one, it will have removed the only safeguard this design
 * has, so it must not.
 *
 * Both rules are enforced by `participantsOf` and `canPost`, and there are
 * tests for them. They exist because the audience is minors.
 *
 * ── What is deliberately absent ──────────────────────────────────────
 *
 * No read receipts, no typing indicators, no "last seen", no message counts
 * per person. A chat that reports who has read what turns a conversation into
 * a compliance surface, which principle 3 rules out. "New since you last
 * looked" is computed from a marker stored in the reader's own browser and
 * never travels in the program file — it is nobody else's business.
 */

import { toUtcIso } from './time.js';

/** The longest a single message may be. Long enough for a paragraph. */
export const MAX_MESSAGE_LENGTH = 2000;

/**
 * Everyone who belongs to a class thread.
 *
 * The guardian is not a separate record — a guardian is whoever is holding the
 * student's phone, so they participate as `guardian` against the student's id.
 * They are listed as present once there are contact details on file or they
 * have posted, because before that nobody knows whether a guardian is using
 * the program at all.
 *
 * @returns {{tutor, student, guardian: object|null, adminPresent: true}}
 */
export function participantsOf(pairing, data) {
  const byId = new Map((data.people ?? []).map((p) => [p.id, p]));
  const student = byId.get(pairing.studentId) ?? null;

  const guardianHasContact = Boolean(
    student && (student.guardianName || student.guardianWechat || student.guardianEmail)
  );
  const guardianHasPosted = (data.messages ?? []).some(
    (m) => m.pairingId === pairing.id && m.authorRole === 'guardian'
  );

  return {
    tutor: byId.get(pairing.tutorId) ?? null,
    student,
    guardian: guardianHasContact || guardianHasPosted ? student : null,
    // Never conditional. See the module header.
    adminPresent: true
  };
}

/**
 * Whether the person currently being viewed as may post in this thread.
 *
 * This is membership, not security — there is no auth in this app and nothing
 * here should ever be mistaken for it. It stops a screen offering a box that
 * would write a nonsensical message.
 */
export function canPost(pairing, view) {
  if (!pairing || !view) return false;
  if (view.role === 'admin') return true;
  if (view.role === 'tutor') return view.person?.id === pairing.tutorId;
  if (view.role === 'student' || view.role === 'guardian') {
    return view.person?.id === pairing.studentId;
  }
  return false;
}

/** Build a message from whoever is looking. Pure: the store stamps and saves. */
export function composeMessage({ pairingId, view, body, id, sentAt }) {
  const text = String(body ?? '').trim();
  if (!pairingId) throw new TypeError('composeMessage requires a pairingId.');
  if (!text) throw new TypeError('A message needs something in it.');
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new RangeError(`A message may be at most ${MAX_MESSAGE_LENGTH} characters.`);
  }

  return {
    id,
    pairingId,
    // The coordinator has no person record, so their messages carry the role
    // and an empty author id.
    authorId: view.role === 'admin' ? '' : view.person.id,
    authorRole: view.role,
    body: text,
    sentAt: sentAt ?? new Date().toISOString(),
    deletedAt: null,
    deletedBy: null
  };
}

/**
 * One thread, oldest first, with authors resolved and days grouped.
 *
 * Deleted messages are kept as tombstones rather than removed. In a
 * conversation involving children, a message that vanishes without trace is
 * worse than one marked as withdrawn.
 */
export function threadFor(pairingId, data, { locale = 'en-US' } = {}) {
  const byId = new Map((data.people ?? []).map((p) => [p.id, p]));

  return (data.messages ?? [])
    .filter((m) => m.pairingId === pairingId)
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
    .map((message) => ({
      message,
      author: message.authorRole === 'admin' ? null : byId.get(message.authorId) ?? null,
      authorRole: message.authorRole,
      deleted: message.deletedAt != null
    }));
}

/** The last message in a thread, ignoring tombstones. Null when never used. */
export function lastMessageOf(pairingId, data) {
  const live = (data.messages ?? [])
    .filter((m) => m.pairingId === pairingId && m.deletedAt == null)
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  return live[live.length - 1] ?? null;
}

/**
 * How many messages have arrived since this reader last opened the thread.
 *
 * `lastOpenedIso` comes from the reader's own browser, never from the program
 * file. Their own messages never count as unread.
 */
export function unreadCount(pairingId, data, { lastOpenedIso, viewerId, viewerRole }) {
  return (data.messages ?? []).filter((m) => {
    if (m.pairingId !== pairingId || m.deletedAt != null) return false;
    if (m.authorRole === viewerRole && m.authorId === (viewerId ?? '')) return false;
    return !lastOpenedIso || m.sentAt > lastOpenedIso;
  }).length;
}

/**
 * Every thread the person being viewed as belongs to, most recently active
 * first, then the ones that have never been used.
 *
 * A pairing with no messages still appears. An empty thread is an invitation;
 * hiding it would mean a student never discovers they can ask a question.
 *
 * @param {{role: string, person: object|null}} view
 * @param {object} data
 * @param {{readState?: Record<string,string>, includeEnded?: boolean}} [opts]
 */
export function threadsFor(view, data, opts = {}) {
  const { readState = {}, includeEnded = false } = opts;

  const mine = (data.pairings ?? []).filter((pairing) => {
    if (!includeEnded && pairing.status === 'ended') return false;
    return canPost(pairing, view);
  });

  const viewerId = view.role === 'admin' ? '' : view.person?.id;

  return mine
    .map((pairing) => {
      const people = participantsOf(pairing, data);
      const last = lastMessageOf(pairing.id, data);
      return {
        pairing,
        ...people,
        lastMessage: last,
        lastActivityIso: last?.sentAt ?? null,
        unread: unreadCount(pairing.id, data, {
          lastOpenedIso: readState[pairing.id],
          viewerId,
          viewerRole: view.role
        }),
        total: (data.messages ?? []).filter((m) => m.pairingId === pairing.id && m.deletedAt == null).length
      };
    })
    .sort((a, b) => {
      if (a.lastActivityIso && b.lastActivityIso) return b.lastActivityIso.localeCompare(a.lastActivityIso);
      if (a.lastActivityIso) return -1;
      if (b.lastActivityIso) return 1;
      // Never used: fall back to a stable order by name.
      return (a.student?.name ?? '').localeCompare(b.student?.name ?? '');
    });
}

/** Total unread across every thread, for a nav badge. */
export function totalUnread(view, data, readState = {}) {
  return threadsFor(view, data, { readState }).reduce((n, thread) => n + thread.unread, 0);
}

/**
 * Group a thread into day blocks, so a screen can print one date heading per
 * day rather than a timestamp on every line.
 *
 * Days are the reader's own days: a message at 22:00 in California and the
 * reply at 14:00 in Shanghai are the same conversation, and each side should
 * see it filed under the date they lived it.
 */
export function groupByDay(entries, timeZone, dateKeyFn) {
  const days = [];
  for (const entry of entries) {
    const key = dateKeyFn(entry.message.sentAt, timeZone);
    const last = days[days.length - 1];
    if (last && last.dateKey === key) last.entries.push(entry);
    else days.push({ dateKey: key, iso: entry.message.sentAt, entries: [entry] });
  }
  return days;
}

/** Messages as rows for an export a human will read. */
export function messageReportRows(data, dateKeyFn, timeZone) {
  const byId = new Map((data.people ?? []).map((p) => [p.id, p]));
  const byPairing = new Map((data.pairings ?? []).map((p) => [p.id, p]));

  return (data.messages ?? [])
    .slice()
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
    .map((m) => {
      const pairing = byPairing.get(m.pairingId);
      const tutor = pairing ? byId.get(pairing.tutorId) : null;
      const student = pairing ? byId.get(pairing.studentId) : null;
      const author = m.authorRole === 'admin' ? null : byId.get(m.authorId);
      return {
        date: dateKeyFn(m.sentAt, timeZone),
        sentAt: toUtcIso(m.sentAt),
        tutor: tutor?.name ?? '',
        student: student?.name ?? '',
        authorRole: m.authorRole,
        author: m.authorRole === 'admin' ? 'coordinator' : (author?.name ?? ''),
        body: m.deletedAt ? '(withdrawn)' : m.body
      };
    });
}

export const MESSAGE_REPORT_COLUMNS = Object.freeze([
  'date', 'sentAt', 'tutor', 'student', 'authorRole', 'author', 'body'
]);
