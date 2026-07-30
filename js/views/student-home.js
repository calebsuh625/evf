/**
 * student-home.js — what a student, or their guardian, sees.
 *
 * Core rule: **they never have required data entry.** They are being served,
 * not managed. There is no form on this screen a student must complete, no
 * profile to keep up to date, no attendance to confirm, and nothing that
 * nags. Everything here is information they wanted.
 *
 * Deliberately not built, and not to be added later without a very good
 * reason: browsing and booking tutors from a list, cancellation flows,
 * penalties, required forms, ratings.
 *
 * Built for a phone on a slow connection: no images, no icon font, no
 * external anything, and a small DOM — the history is capped and expands on
 * demand rather than rendering a year of sessions nobody scrolled to.
 */

import { el, button, toast } from '../dom.js';
import { t, getLocale } from '../i18n.js';
import { formatDual, formatInZone, dateKeyInZone } from '../time.js';
import { nextClassFor, lastHeldSession } from '../tutor.js';

/** How much history to render before asking. Keeps the DOM small on a phone. */
const HISTORY_PAGE = 6;

export function render(container, { store, student, isGuardian, nowIso }) {
  const data = store.getState();
  const locale = getLocale();

  const pairings = data.pairings
    .filter((p) => p.studentId === student.id)
    .sort((a, b) => String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')));
  const active = pairings.find((p) => p.status === 'active') ?? null;
  const tutor = active ? data.people.find((p) => p.id === active.tutorId) : null;

  const pairingIds = new Set(pairings.map((p) => p.id));
  const history = data.sessions
    .filter((s) => pairingIds.has(s.pairingId) && s.loggedAt != null)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));

  const lastHeld = active ? lastHeldSession(active.id, data.sessions, nowIso) : null;

  container.append(
    el('header', { class: 'st-head' },
      el('h1', { text: t('st.greeting', { name: student.preferredName || student.name }) }),
      el('p', { class: 'small faint', text: t('st.nothingRequired') })
    ),

    active && tutor ? nextClassCard(active, tutor, student, data, locale, nowIso) : null,
    homeworkCard(lastHeld, student, locale),
    tutor ? tutorCard(tutor, locale) : noTutorCard(),
    historyCard(history, student, locale),
    isGuardian ? guardianCard(student, store) : null
  );
}

/* ------------------------------------------------------------------ *
 * Next class — in Beijing time, because that is the clock they live on
 * ------------------------------------------------------------------ */

function nextClassCard(pairing, tutor, student, data, locale, nowIso) {
  const next = nextClassFor(pairing, data, { asOfIso: nowIso });

  if (!next) {
    return el('section', { class: 'card st-next' },
      el('h2', { class: 'card__title', text: t('st.next.title') }),
      el('p', { class: 'muted', text: t('st.next.none') })
    );
  }

  const dual = formatDual(next.startUtc, student.timezone, tutor.timezone, { locale });

  return el('section', { class: 'card st-next' },
    el('h2', { class: 'card__title', text: t('st.next.title') }),

    el('p', { class: 'st-next__day', text: dual.a.weekdayLabel }),
    el('p', { class: 'st-next__time tnum', text: dual.a.time }),
    el('p', { class: 'small muted', text: `${dual.a.dateKey} · ${dual.a.zoneLabel}` }),

    // The tutor's clock, quietly, so a family can see why the tutor says a
    // different day without having to work it out.
    el('p', { class: 'small faint st-next__theirs',
      text: `${t('st.next.tutorTime')}: ${dual.b.weekdayLabel} ${dual.b.time}` }),

    tutor.meetingLink
      ? el('a', {
          class: 'btn btn--primary btn--block st-next__join',
          href: tutor.meetingLink,
          target: '_blank',
          rel: 'noopener noreferrer',
          text: t('st.next.join')
        })
      : null
  );
}

/* ------------------------------------------------------------------ *
 * Homework
 * ------------------------------------------------------------------ */

function homeworkCard(lastHeld, student, locale) {
  const homework = lastHeld?.homework?.trim();

  return el('section', { class: `card st-homework${homework ? '' : ' is-empty'}` },
    el('h2', { class: 'card__title', text: t('st.homework.title') }),
    homework
      ? el('div', {},
          el('p', { class: 'st-homework__text', text: homework }),
          el('p', { class: 'small faint', text:
            t('st.homework.from', { date: dateKeyInZone(lastHeld.scheduledAt, student.timezone) }) })
        )
      : el('p', { class: 'muted', text: t('st.homework.none') })
  );
}

/* ------------------------------------------------------------------ *
 * The tutor
 * ------------------------------------------------------------------ */

function tutorCard(tutor, locale) {
  return el('section', { class: 'card st-tutor' },
    el('h2', { class: 'card__title', text: t('st.tutor.title') }),
    el('p', { class: 'st-tutor__name', text: tutor.preferredName || tutor.name }),
    tutor.bio ? el('p', { class: 'muted', text: tutor.bio }) : null,

    tutor.subjects?.length
      ? el('p', { class: 'small' },
          el('span', { class: 'clock__zone', text: t('st.tutor.teaches') }), ' ',
          tutor.subjects.join('、'))
      : null,

    tutor.wechat || tutor.email
      ? el('p', { class: 'small' },
          el('span', { class: 'clock__zone', text: t('st.tutor.contact') }), ' ',
          [tutor.wechat, tutor.email].filter(Boolean).join(' · '))
      : null
  );
}

function noTutorCard() {
  return el('section', { class: 'card' },
    el('h2', { class: 'card__title', text: t('st.tutor.title') }),
    el('p', { class: 'muted', text: t('st.tutor.none') })
  );
}

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

function historyCard(history, student, locale) {
  if (!history.length) {
    return el('section', { class: 'card' },
      el('h2', { class: 'card__title', text: t('st.history.title') }),
      el('p', { class: 'muted', text: t('st.history.none') })
    );
  }

  const list = el('ol', { class: 'st-history' });
  let shown = 0;

  const more = button('', {
    variant: 'quiet',
    onClick: () => { paint(shown + HISTORY_PAGE); }
  });

  // Render a page at a time: a student with a year of weekly classes should
  // not pay to download fifty entries on a phone to read the last two.
  function paint(count) {
    shown = Math.min(count, history.length);
    list.replaceChildren(...history.slice(0, shown).map((s) => item(s, student, locale)));
    const remaining = history.length - shown;
    more.textContent = remaining > 0 ? `+ ${remaining}` : '';
    more.hidden = remaining === 0;
  }

  paint(HISTORY_PAGE);

  return el('section', { class: 'card' },
    el('h2', { class: 'card__title', text: t('st.history.title') }),
    list,
    more
  );
}

function item(session, student, locale) {
  const held = session.occurred === true;

  return el('li', { class: `st-history__item${held ? '' : ' is-missed'}` },
    el('span', { class: 'st-history__date tnum',
      text: dateKeyInZone(session.scheduledAt, student.timezone) }),

    held
      ? el('div', {},
          session.covered
            ? el('p', { class: 'st-history__covered', text: session.covered })
            : null,
          session.homework
            ? el('p', { class: 'small muted' },
                el('span', { class: 'clock__zone', text: t('st.history.homework') }), ' ',
                session.homework)
            : null
        )
      : el('p', { class: 'small faint', text: t('st.history.didNotHappen') })
  );
}

/* ------------------------------------------------------------------ *
 * Guardian contact details
 *
 * The one editable thing on this screen, and only from the guardian view.
 * Every field is optional; blank is a complete answer. There is no validation
 * beyond what the browser does for free, because rejecting a guardian's input
 * would be exactly the kind of gatekeeping principle 5 rules out.
 * ------------------------------------------------------------------ */

function guardianCard(student, store) {
  const fields = {
    guardianName: student.guardianName ?? '',
    guardianWechat: student.guardianWechat ?? '',
    guardianEmail: student.guardianEmail ?? ''
  };

  const input = (key, label, type = 'text') => el('label', { class: 'gd-field' },
    el('span', { class: 'gd-field__label', text: label }),
    el('input', {
      type,
      value: fields[key],
      autocomplete: 'off',
      onInput: (e) => { fields[key] = e.target.value; }
    })
  );

  return el('section', { class: 'card gd-contact' },
    el('h2', { class: 'card__title', text: t('gd.contact.title') }),
    el('p', { class: 'small muted', text: t('gd.contact.body') }),

    el('div', { class: 'gd-fields' },
      input('guardianName', t('gd.contact.name')),
      input('guardianWechat', t('gd.contact.wechat')),
      input('guardianEmail', t('gd.contact.email'), 'email')
    ),

    el('div', { class: 'row' },
      button(t('gd.contact.save'), {
        variant: 'primary',
        onClick: () => {
          store.setGuardianContact(student.id, fields);
          toast(t('gd.contact.saved'));
        }
      }),
      el('span', { class: 'small faint', text: t('gd.contact.onlyYou') })
    )
  );
}
