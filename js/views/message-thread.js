/**
 * message-thread.js — one class chat.
 *
 * Everyone in the class reads the same thread: tutor, student, parent if they
 * are using the app, and the coordinator always. The membership panel says so
 * out loud at the top, including *why* the coordinator is there, because a
 * parent in China deciding whether this is safe for their child should not
 * have to infer it.
 *
 * Deliberately absent: read receipts, typing indicators, "last seen", and any
 * per-person message count. See the header of `js/chat.js`.
 */

import { el, button, toast } from '../dom.js';
import { t, getLocale } from '../i18n.js';
import { stampInZone, formatInZone } from '../time.js';
import { threadFor, participantsOf, canPost, groupByDay, MAX_MESSAGE_LENGTH } from '../chat.js';
import { roleLabel, zoneFor } from './messages.js';

export function render(container, { store, navigate, params, view }) {
  const data = store.getState();
  const pairing = data.pairings.find((p) => p.id === params.pairingId);

  if (!pairing || !canPost(pairing, view)) {
    container.append(
      el('div', { class: 'empty' },
        el('p', { text: t('chat.empty') }),
        button(t('chat.backToList'), { onClick: () => navigate('/messages') })
      )
    );
    return;
  }

  const locale = getLocale();
  const zone = zoneFor(view, data);
  const people = participantsOf(pairing, data);

  // Opening the thread is what marks it read, for this browser only.
  store.markThreadRead(pairing.id);

  const log = el('div', { class: 'thread__log', role: 'log', 'aria-label': t('chat.threadTitle') });

  const repaint = () => {
    const fresh = store.getState();
    const entries = threadFor(pairing.id, fresh);
    log.replaceChildren(
      ...(entries.length
        ? renderDays(entries, { zone, locale, view, store, navigate, pairing, repaint })
        : [threadEmpty()])
    );
    log.scrollTop = log.scrollHeight;
  };

  container.append(
    el('header', { class: 'thread__head' },
      el('div', { class: 'thread__nav' },
        button(`← ${t('chat.backToList')}`, {
          variant: 'quiet',
          onClick: () => navigate('/messages')
        })
      ),
      el('h1', { text: threadTitle(people, view) })
    ),

    membershipPanel(people, view),

    el('p', { class: 'small faint thread__local', text: t('chat.localOnlyShort') }),

    log,
    composer(pairing, view, store, repaint)
  );

  repaint();
}

/**
 * Who is in this chat, and why the coordinator is one of them.
 *
 * Not collapsed behind an info icon. The safeguarding claim only counts if the
 * person it protects can see it without looking for it.
 */
function membershipPanel(people, view) {
  const chips = [
    people.tutor ? memberChip(people.tutor.preferredName || people.tutor.name, 'tutor', view) : null,
    people.student ? memberChip(people.student.preferredName || people.student.name, 'student', view) : null,
    people.guardian
      ? memberChip(t('chat.roleGuardian'), 'guardian', view)
      : el('span', { class: 'member member--maybe', text: t('chat.guardianMaybe') }),
    memberChip(t('chat.roleAdmin'), 'admin', view)
  ].filter(Boolean);

  return el('section', { class: 'thread__members' },
    el('h2', { class: 'small caps faint', text: t('chat.inThisChat') }),
    el('div', { class: 'member-row' }, ...chips),
    el('p', { class: 'small faint', text: t('chat.coordinatorWhy') })
  );
}

/**
 * Whose class this is, from the reader's side. A tutor identifies it by the
 * student and a student by their tutor; the coordinator needs both names,
 * since every class in the program is on their list.
 */
function threadTitle(people, view) {
  const tutorName = people.tutor?.preferredName || people.tutor?.name || '—';
  const studentName = people.student?.preferredName || people.student?.name || '—';
  if (view.role === 'admin') return `${tutorName} · ${studentName}`;
  return t('chat.classWith', { name: view.role === 'tutor' ? studentName : tutorName });
}

/**
 * A chip is a name over a role. The coordinator and the parent have no name
 * to show — they are a role, not a roster entry — so those chips carry the
 * role once rather than printing "Parent" twice.
 *
 * The role has to match as well as the id: a guardian and their child share
 * a person record, and a parent must not see "You" on their child's chip.
 */
function memberChip(name, role, view) {
  const isYou = view.role === role;
  const label = roleLabel(role);
  const named = name !== label;

  return el('span', { class: `member member--${role}` },
    el('span', { class: 'member__name', text: named ? name : label }),
    named || isYou
      ? el('span', { class: 'member__role', text: isYou ? t('chat.you') : label })
      : null
  );
}

function renderDays(entries, ctx) {
  const days = groupByDay(entries, ctx.zone, (iso, zone) =>
    stampInZone(iso, zone, { locale: ctx.locale, weekday: true }));

  return days.map((day) => el('div', { class: 'thread__day' },
    el('p', { class: 'thread__date', text: day.dateKey }),
    ...day.entries.map((entry) => messageBubble(entry, ctx))
  ));
}

function messageBubble(entry, { zone, locale, view, store, repaint }) {
  const { message, author, authorRole, deleted } = entry;

  const mine = authorRole === view.role
    && (authorRole === 'admin' || author?.id === view.person?.id);

  const name = authorRole === 'admin'
    ? t('chat.roleAdmin')
    : (author?.preferredName || author?.name || '—');

  if (deleted) {
    return el('div', { class: 'bubble bubble--gone' },
      el('p', { class: 'small faint', text: t('chat.withdrawn') })
    );
  }

  const canWithdraw = mine || view.role === 'admin';
  const at = formatInZone(message.sentAt, zone, { locale });

  return el('div', { class: `bubble${mine ? ' bubble--mine' : ''}` },
    el('p', { class: 'bubble__who' },
      el('span', { class: 'bubble__name', text: mine ? t('chat.you') : name }),
      el('span', { class: 'bubble__role', text: roleLabel(authorRole) }),
      el('time', { class: 'bubble__time', datetime: message.sentAt, text: at })
    ),
    // textContent, never innerHTML — this is typed by a teenager on a phone
    // and read on a coordinator's screen. `el` cannot produce markup.
    el('p', { class: 'bubble__body', text: message.body }),
    canWithdraw
      ? button(t('chat.withdraw'), {
        variant: 'quiet small',
        // The author's name alone repeats across their messages, so a screen
        // reader announced "Withdraw — Avery" twice for two different
        // messages. The time makes each one distinct.
        'aria-label': `${t('chat.withdraw')} — ${name}, ${at}`,
        onClick: () => {
          if (!window.confirm(t('chat.withdrawConfirm'))) return;
          try {
            store.deleteMessage(message.id, view);
            repaint();
          } catch (err) {
            toast(err.message, 'error');
          }
        }
      })
      : null
  );
}

function threadEmpty() {
  return el('div', { class: 'empty empty--thread' },
    el('p', { text: t('chat.threadEmpty') }),
    el('p', { class: 'small faint', text: t('chat.threadEmptyHint') })
  );
}

/**
 * The box.
 *
 * A textarea rather than an input, because a parent explaining that Saturday
 * is a school exam day writes sentences. Enter inserts a newline and does not
 * send: sending on Enter, on a phone keyboard, posts half-written messages.
 */
function composer(pairing, view, store, repaint) {
  const box = el('textarea', {
    id: 'msg-body',
    class: 'composer__box',
    rows: '2',
    maxlength: String(MAX_MESSAGE_LENGTH),
    'aria-describedby': 'msg-hint'
  });

  const send = button(t('chat.send'), {
    variant: 'primary',
    onClick: () => {
      const body = box.value.trim();
      if (!body) return;
      try {
        store.postMessage({ pairingId: pairing.id, view, body });
        box.value = '';
        repaint();
      } catch (err) {
        toast(err.message, 'error');
      }
      box.focus();
    }
  });

  return el('form', {
    class: 'composer',
    onSubmit: (event) => { event.preventDefault(); send.click(); }
  },
    el('label', { class: 'sr-only', for: 'msg-body', text: t('chat.compose') }),
    box,
    el('div', { class: 'composer__foot' },
      el('p', { id: 'msg-hint', class: 'small faint', text: t('chat.composeHint') }),
      send
    )
  );
}
