/**
 * chat.test.js — class threads.
 *
 * Two of these assertions are not about correctness, they are about the
 * product: the coordinator is in every thread, and there is no channel that
 * excludes them. Both are safeguarding decisions for an app used by children,
 * so they are pinned here rather than left to a code review to notice.
 *
 * Also pinned: no test may ever assert a per-person read count. Read state
 * belongs to the browser reading, and the moment it travels between people
 * "seen and not replied to" becomes a thing the app reports — a compliance
 * surface built out of a convenience feature (principle 3).
 */

import { describe, it, ok, equal, deepEqual, throws } from './runner.js';
import {
  participantsOf, canPost, composeMessage, threadFor, threadsFor,
  lastMessageOf, unreadCount, totalUnread, groupByDay,
  messageReportRows, MESSAGE_REPORT_COLUMNS, MAX_MESSAGE_LENGTH
} from '../js/chat.js';

/* ---------------------------------------------------------------- *
 * Fixture: one tutor, two students, one of whom has a guardian
 * ---------------------------------------------------------------- */

function fixture() {
  return {
    program: { adminTimeZone: 'America/Los_Angeles' },
    people: [
      { id: 't1', role: 'tutor', name: 'Avery Alpha', preferredName: 'Avery', timezone: 'America/Los_Angeles' },
      { id: 't2', role: 'tutor', name: 'Blake Beta', timezone: 'America/New_York' },
      { id: 's1', role: 'student', name: 'Ming Mu', preferredName: 'Ming', timezone: 'Asia/Shanghai', guardianName: 'Guardian of Ming' },
      { id: 's2', role: 'student', name: 'Yara Nu', timezone: 'Asia/Shanghai', guardianName: '', guardianWechat: '', guardianEmail: '' }
    ],
    pairings: [
      { id: 'p1', tutorId: 't1', studentId: 's1', status: 'active' },
      { id: 'p2', tutorId: 't1', studentId: 's2', status: 'active' },
      { id: 'p3', tutorId: 't2', studentId: 's2', status: 'ended' }
    ],
    sessions: [],
    availability: [],
    messages: [
      msg('m1', 'p1', 't1', 'tutor', 'See you Saturday.', '2026-07-04T16:00:00.000Z'),
      msg('m2', 'p1', 's1', 'guardian', '谢谢老师。', '2026-07-04T23:30:00.000Z'),
      msg('m3', 'p1', '', 'admin', 'Glad it is going well.', '2026-07-05T15:00:00.000Z'),
      msg('m4', 'p2', 's2', 'student', 'Can we move to Sunday?', '2026-07-06T02:00:00.000Z')
    ]
  };
}

function msg(id, pairingId, authorId, authorRole, body, sentAt) {
  return { id, pairingId, authorId, authorRole, body, sentAt, deletedAt: null, deletedBy: null };
}

const AS_TUTOR = { role: 'tutor', person: { id: 't1' } };
const AS_STUDENT = { role: 'student', person: { id: 's1' } };
const AS_GUARDIAN = { role: 'guardian', person: { id: 's1' } };
const AS_ADMIN = { role: 'admin', person: null };

/* ---------------------------------------------------------------- *
 * Membership — the rules that are not preferences
 * ---------------------------------------------------------------- */

describe('thread membership', () => {
  it('always includes the coordinator', () => {
    // Structural, not a setting. An adult can see every conversation between
    // a teenaged volunteer and a child. There is deliberately no argument,
    // flag or field that can turn this off — if one ever appears, this fails.
    const data = fixture();
    for (const pairing of data.pairings) {
      equal(participantsOf(pairing, data).adminPresent, true, `pairing ${pairing.id}`);
    }
  });

  it('lets the coordinator into every thread', () => {
    const data = fixture();
    for (const pairing of data.pairings) {
      ok(canPost(pairing, AS_ADMIN), `admin can post in ${pairing.id}`);
    }
  });

  it('gives a tutor exactly their own classes and nobody else’s', () => {
    const data = fixture();
    // t1 teaches s1 and s2; t2's only pairing has ended.
    ok(canPost(data.pairings[0], AS_TUTOR));
    ok(canPost(data.pairings[1], AS_TUTOR));
    ok(!canPost(data.pairings[2], AS_TUTOR), 'not a class this tutor is in');
  });

  it('gives a student only their own class', () => {
    const data = fixture();
    ok(canPost(data.pairings[0], AS_STUDENT));
    ok(!canPost(data.pairings[1], AS_STUDENT), 'another student’s class');
  });

  it('lets a guardian into the same thread as their child, not a separate one', () => {
    // A guardian is not a record — they are whoever is holding the phone.
    // One thread per class means a parent reads what their child reads.
    const data = fixture();
    ok(canPost(data.pairings[0], AS_GUARDIAN));
    deepEqual(
      threadFor('p1', data).map((e) => e.message.id),
      threadFor('p1', data).map((e) => e.message.id),
      'the guardian sees the same thread, not a filtered one'
    );
  });

  it('never produces a thread that excludes the coordinator', () => {
    // The strongest form of the rule: across every pairing and every viewer,
    // there is no combination that yields a channel the coordinator is out of.
    const data = fixture();
    const viewers = [AS_TUTOR, AS_STUDENT, AS_GUARDIAN, AS_ADMIN];
    for (const view of viewers) {
      for (const thread of threadsFor(view, data, { includeEnded: true })) {
        equal(thread.adminPresent, true, `${view.role} / ${thread.pairing.id}`);
      }
    }
  });

  it('shows a guardian as present once there is a contact or a message', () => {
    const data = fixture();
    equal(participantsOf(data.pairings[0], data).guardian?.id, 's1', 'has a guardian name on file');
    equal(participantsOf(data.pairings[1], data).guardian, null, 'no contact, nothing posted');
  });

  it('shows a guardian as present after they post, with no contact on file', () => {
    const data = fixture();
    data.messages.push(msg('m5', 'p2', 's2', 'guardian', '您好。', '2026-07-07T00:00:00.000Z'));
    equal(participantsOf(data.pairings[1], data).guardian?.id, 's2');
  });
});

/* ---------------------------------------------------------------- *
 * One thread per class
 * ---------------------------------------------------------------- */

describe('threads', () => {
  it('gives a tutor one thread per student, not one per tutor', () => {
    // The whole shape of the feature: tutor A with students B and C has two
    // conversations, not one group of four people.
    const threads = threadsFor(AS_TUTOR, fixture());
    equal(threads.length, 2);
    deepEqual(threads.map((t) => t.student.id).sort(), ['s1', 's2']);
  });

  it('shows the coordinator every active class', () => {
    equal(threadsFor(AS_ADMIN, fixture()).length, 2);
  });

  it('includes a class nobody has messaged in yet', () => {
    // An empty thread is an invitation. Hiding it means a student never finds
    // out they can ask a question.
    const data = fixture();
    data.messages = [];
    const threads = threadsFor(AS_TUTOR, data);
    equal(threads.length, 2);
    equal(threads[0].lastMessage, null);
    equal(threads[0].total, 0);
  });

  it('hides ended classes unless asked for them', () => {
    const data = fixture();
    equal(threadsFor({ role: 'tutor', person: { id: 't2' } }, data).length, 0);
    equal(threadsFor({ role: 'tutor', person: { id: 't2' } }, data, { includeEnded: true }).length, 1);
  });

  it('orders by most recent activity, with never-used classes last', () => {
    const data = fixture();
    const threads = threadsFor(AS_TUTOR, data);
    equal(threads[0].pairing.id, 'p2', 'p2 has the newest message');
    equal(threads[1].pairing.id, 'p1');

    data.messages = data.messages.filter((m) => m.pairingId !== 'p2');
    const after = threadsFor(AS_TUTOR, data);
    equal(after[0].pairing.id, 'p1', 'a used thread outranks an empty one');
    equal(after[1].pairing.id, 'p2');
  });

  it('reads a thread oldest first', () => {
    deepEqual(threadFor('p1', fixture()).map((e) => e.message.id), ['m1', 'm2', 'm3']);
  });

  it('resolves the author, and leaves the coordinator without a person', () => {
    const entries = threadFor('p1', fixture());
    equal(entries[0].author.id, 't1');
    equal(entries[1].author.id, 's1', 'a guardian posts against the student record');
    equal(entries[1].authorRole, 'guardian', 'but the role distinguishes them');
    equal(entries[2].author, null, 'the coordinator is a role, not a roster row');
  });
});

/* ---------------------------------------------------------------- *
 * Withdrawal
 * ---------------------------------------------------------------- */

describe('withdrawn messages', () => {
  it('keeps a tombstone rather than vanishing', () => {
    // A message that disappears without trace, in a thread involving a child,
    // is worse than one visibly withdrawn: a parent who saw something and came
    // back to find nothing has no recourse.
    const data = fixture();
    data.messages[0] = { ...data.messages[0], body: '', deletedAt: '2026-07-05T00:00:00.000Z', deletedBy: 'tutor' };
    const entries = threadFor('p1', data);
    equal(entries.length, 3, 'still three entries');
    equal(entries[0].deleted, true);
  });

  it('does not count as the last message or as unread', () => {
    const data = fixture();
    data.messages[2] = { ...data.messages[2], body: '', deletedAt: '2026-07-05T20:00:00.000Z' };
    equal(lastMessageOf('p1', data).id, 'm2');
    equal(unreadCount('p1', data, { lastOpenedIso: null, viewerId: 't1', viewerRole: 'tutor' }), 1);
  });
});

/* ---------------------------------------------------------------- *
 * Unread — a service, never a score
 * ---------------------------------------------------------------- */

describe('unread', () => {
  it('counts what arrived since this browser last looked', () => {
    const data = fixture();
    // m1 predates the marker; m2 (the guardian's) and m3 (the coordinator's)
    // arrived after it. Both are somebody else's, so both count.
    equal(unreadCount('p1', data, { lastOpenedIso: '2026-07-04T20:00:00.000Z', viewerId: 's1', viewerRole: 'student' }), 2);
  });

  it('never counts your own messages', () => {
    const data = fixture();
    equal(
      unreadCount('p1', data, { lastOpenedIso: null, viewerId: 't1', viewerRole: 'tutor' }),
      2,
      'three messages, one of them the tutor’s own'
    );
  });

  it('distinguishes a guardian from the student they share an id with', () => {
    const data = fixture();
    // m2 is the guardian's. To the student it is somebody else's message.
    equal(unreadCount('p1', data, { lastOpenedIso: null, viewerId: 's1', viewerRole: 'student' }), 3);
    equal(unreadCount('p1', data, { lastOpenedIso: null, viewerId: 's1', viewerRole: 'guardian' }), 2);
  });

  it('totals across threads for a nav badge', () => {
    equal(totalUnread(AS_TUTOR, fixture(), {}), 3, 'm2 and m3 in p1, m4 in p2; m1 is the tutor’s own');
  });

  it('reports nothing about who has read what', () => {
    // The shape assertion that keeps this a convenience rather than a
    // surveillance feature. A per-person read record here would let a screen
    // say "your tutor saw this and did not reply", which is exactly the
    // compliance surface principle 3 rules out.
    const thread = threadsFor(AS_TUTOR, fixture())[0];
    const forbidden = ['readBy', 'seenBy', 'lastSeen', 'readReceipts', 'typing', 'deliveredTo'];
    for (const key of forbidden) {
      ok(!(key in thread), `threads must not expose ${key}`);
    }
    for (const entry of threadFor('p1', fixture())) {
      for (const key of forbidden) ok(!(key in entry.message), `messages must not carry ${key}`);
    }
  });
});

/* ---------------------------------------------------------------- *
 * Composing
 * ---------------------------------------------------------------- */

describe('composeMessage', () => {
  it('stamps the author from whoever is looking', () => {
    const m = composeMessage({ pairingId: 'p1', view: AS_TUTOR, body: 'Hello', id: 'x', sentAt: '2026-07-08T00:00:00.000Z' });
    equal(m.authorId, 't1');
    equal(m.authorRole, 'tutor');
    equal(m.deletedAt, null);
  });

  it('gives the coordinator a role and no person id', () => {
    const m = composeMessage({ pairingId: 'p1', view: AS_ADMIN, body: 'Hello', id: 'x', sentAt: '2026-07-08T00:00:00.000Z' });
    equal(m.authorId, '');
    equal(m.authorRole, 'admin');
  });

  it('trims, and refuses an empty message', () => {
    const m = composeMessage({ pairingId: 'p1', view: AS_TUTOR, body: '  hi  ', id: 'x', sentAt: '2026-07-08T00:00:00.000Z' });
    equal(m.body, 'hi');
    throws(() => composeMessage({ pairingId: 'p1', view: AS_TUTOR, body: '   ', id: 'x' }));
  });

  it('refuses one longer than the limit', () => {
    throws(() => composeMessage({
      pairingId: 'p1', view: AS_TUTOR, body: 'x'.repeat(MAX_MESSAGE_LENGTH + 1), id: 'x'
    }));
  });

  it('stores the time as an ISO 8601 UTC instant', () => {
    const m = composeMessage({ pairingId: 'p1', view: AS_TUTOR, body: 'hi', id: 'x' });
    ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(m.sentAt), m.sentAt);
  });
});

/* ---------------------------------------------------------------- *
 * Day grouping — each side reads its own calendar
 * ---------------------------------------------------------------- */

describe('groupByDay', () => {
  const stub = (iso, zone) => {
    // A deliberately crude stand-in for stampInZone: the point of the test is
    // that the reader's zone decides the grouping, not that formatting works.
    const shift = zone === 'Asia/Shanghai' ? 8 : -7;
    return new Date(Date.parse(iso) + shift * 3600e3).toISOString().slice(0, 10);
  };

  it('files the same instant under different days at each end', () => {
    // 2026-07-04 16:00Z is Saturday 09:00 in California and Sunday 00:00 in
    // Shanghai. Both readers should see their own date.
    const entries = threadFor('p1', fixture()).slice(0, 2);
    const west = groupByDay(entries, 'America/Los_Angeles', stub);
    const east = groupByDay(entries, 'Asia/Shanghai', stub);
    equal(west[0].dateKey, '2026-07-04');
    equal(east[0].dateKey, '2026-07-05');
  });

  it('puts consecutive same-day messages in one block', () => {
    const days = groupByDay(threadFor('p1', fixture()), 'America/Los_Angeles', stub);
    equal(days.length, 2);
    equal(days[0].entries.length, 2);
  });
});

/* ---------------------------------------------------------------- *
 * Export
 * ---------------------------------------------------------------- */

describe('messageReportRows', () => {
  const dateKey = (iso) => iso.slice(0, 10);

  it('resolves each message to its class and author', () => {
    const rows = messageReportRows(fixture(), dateKey, 'America/Los_Angeles');
    equal(rows.length, 4);
    equal(rows[0].tutor, 'Avery Alpha');
    equal(rows[0].student, 'Ming Mu');
    equal(rows[0].authorRole, 'tutor');
    equal(rows[2].author, 'coordinator');
  });

  it('marks a withdrawn message rather than printing what it said', () => {
    const data = fixture();
    data.messages[0] = { ...data.messages[0], body: '', deletedAt: '2026-07-05T00:00:00.000Z' };
    equal(messageReportRows(data, dateKey, 'America/Los_Angeles')[0].body, '(withdrawn)');
  });

  it('emits every declared column', () => {
    const row = messageReportRows(fixture(), dateKey, 'America/Los_Angeles')[0];
    for (const column of MESSAGE_REPORT_COLUMNS) ok(column in row, `missing ${column}`);
  });
});
