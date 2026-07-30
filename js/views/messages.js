/**
 * messages.js — the list of class chats.
 *
 * One screen for all four roles. A tutor sees one row per student, a student
 * or parent sees the one row that is their class, and the coordinator sees
 * every class in the program. The row is the same row; only the query differs,
 * which is `chat.threadsFor` doing the work.
 *
 * A class with no messages still gets a row. An empty thread is an invitation
 * to use it — hiding it would mean a student never discovers they can ask.
 */

import { el, button } from '../dom.js';
import { t, getLocale } from '../i18n.js';
import { stampInZone } from '../time.js';
import { threadsFor } from '../chat.js';

export function render(container, { store, navigate, view }) {
  const data = store.getState();
  const locale = getLocale();
  const readState = store.readState();
  const threads = threadsFor(view, data, { readState });

  const zone = zoneFor(view, data);

  container.append(
    el('header', { class: 'msg-head' },
      el('h1', { text: t('chat.title') }),
      el('p', { class: 'small faint', text: t('chat.subtitle') })
    ),

    localOnlyNotice(),

    threads.length
      ? el('ul', { class: 'msg-list', 'aria-label': t('chat.title') },
        ...threads.map((thread) => threadRow(thread, { view, navigate, locale, zone })))
      : emptyState(view)
  );
}

/**
 * The honest notice.
 *
 * The app has no server, so a message written here does not reach anybody.
 * Saying so plainly on the screen that looks most like a messaging app is the
 * only defensible option: a student who believes they have told their tutor
 * they cannot make Saturday, and has not, is worse off than with no chat at
 * all.
 */
function localOnlyNotice() {
  return el('aside', { class: 'notice notice--warn', role: 'note' },
    el('p', { class: 'notice__title', text: t('chat.localOnlyTitle') }),
    el('p', { class: 'small', text: t('chat.localOnly') })
  );
}

function threadRow(thread, { view, navigate, locale, zone }) {
  const { pairing, tutor, student, lastMessage, unread } = thread;

  // Whose name identifies this class depends on who is reading. A tutor knows
  // which of their classes this is by the student; a student, by the tutor.
  const other = view.role === 'tutor' ? student : tutor;
  const title = view.role === 'admin'
    ? `${tutor?.name ?? '—'} · ${student?.name ?? '—'}`
    : (other?.preferredName || other?.name || '—');

  const preview = lastMessage
    ? previewLine(lastMessage, thread)
    : t('chat.noMessagesYet');

  return el('li', { class: 'msg-row' },
    el('button', {
      class: 'msg-row__btn',
      type: 'button',
      'aria-label': `${t('chat.openThread')} — ${title}`,
      onClick: () => navigate(`/messages/${pairing.id}`)
    },
      el('span', { class: 'msg-row__main' },
        el('span', { class: 'msg-row__name', text: title }),
        el('span', { class: 'msg-row__preview', text: preview })
      ),
      el('span', { class: 'msg-row__meta' },
        unread
          ? el('span', { class: 'msg-badge', text: t('chat.unread', { count: unread }) })
          : null,
        lastMessage
          ? el('span', {
            class: 'small faint',
            text: stampInZone(lastMessage.sentAt, zone, { locale })
          })
          : null,
        pairing.status === 'paused'
          ? el('span', { class: 'tag tag--muted', text: t('chat.paused') })
          : null
      )
    )
  );
}

/** "Tutor: see you Saturday" — the role, so it reads without opening. */
function previewLine(message, thread) {
  if (message.deletedAt) return t('chat.withdrawn');
  const who = roleLabel(message.authorRole);
  return `${who}: ${message.body}`;
}

export function roleLabel(role) {
  return {
    tutor: t('chat.roleTutor'),
    student: t('chat.roleStudent'),
    guardian: t('chat.roleGuardian'),
    admin: t('chat.roleAdmin')
  }[role] ?? role;
}

function emptyState(view) {
  const copy = view.role === 'tutor' ? 'chat.emptyTutor'
    : view.role === 'admin' ? 'chat.empty'
      : 'chat.emptyStudent';
  return el('div', { class: 'empty' }, el('p', { text: t(copy) }));
}

/** Everyone reads timestamps on their own clock. */
export function zoneFor(view, data) {
  if (view.role === 'admin') return data.program.adminTimeZone;
  return view.person?.timezone || data.program.adminTimeZone;
}
