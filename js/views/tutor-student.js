/**
 * tutor-student.js — everything about one student, in one page.
 *
 * Written for the moment a tutor leaves and somebody else picks the student
 * up. That person needs to know where to start, and the only honest source
 * for that is the actual session history: what was covered, in order, with
 * the homework that was set. So the history is the body of the page, not an
 * appendix to a profile.
 *
 * Principle 1 again: this also serves the current tutor, who reads the last
 * two entries before every class.
 */

import { el, linkButton } from '../dom.js';
import { t, getLocale } from '../i18n.js';
import { formatDual, stampInZone } from '../time.js';
import { computeHours, toRoundedHours, formatHours } from '../hours.js';
import { sharedWindows } from '../tutor.js';

export function render(container, { store, tutor, params, nowIso }) {
  const data = store.getState();
  const student = data.people.find((p) => p.id === params.studentId && p.role === 'student');

  // Any pairing between these two, including ended ones: a tutor picking a
  // student back up next term should still see the history they wrote.
  const pairings = data.pairings.filter(
    (p) => p.studentId === params.studentId && p.tutorId === tutor.id
  );

  if (!student || pairings.length === 0) {
    container.append(el('section', { class: 'empty' },
      el('h2', { text: t('tutor.student.notYours') }),
      el('div', { class: 'empty__actions' },
        linkButton(t('role.needTutor.action'), '#/tutor', 'primary'))
    ));
    return;
  }

  const locale = getLocale();
  const pairingIds = new Set(pairings.map((p) => p.id));
  const sessions = data.sessions
    .filter((s) => pairingIds.has(s.pairingId) && s.loggedAt != null)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));

  const totals = computeHours(data.sessions, data.pairings, { studentId: student.id, tutorId: tutor.id });
  const active = pairings.find((p) => p.status === 'active') ?? pairings[0];

  container.append(
    el('div', { class: 'student-head' },
      el('a', { class: 'log-head__back', href: '#/tutor', text: '←' }),
      el('div', {},
        el('h1', { text: student.preferredName || student.name }),
        el('p', { class: 'small muted', text:
          t('tutor.student.totals', {
            sessions: totals.occurredCount,
            hours: formatHours(toRoundedHours(totals.contactMinutes))
          }) })
      ),
      el('div', { class: 'student-head__actions' },
        linkButton(t('tutor.students.log'), `#/tutor/log/${encodeURIComponent(active.id)}`, 'primary')
      )
    ),

    aboutCard(student, active, tutor, data, locale, nowIso),
    handoverCard(sessions, student),
    historyCard(sessions, student, tutor, locale)
  );
}

/* ------------------------------------------------------------------ */

function aboutCard(student, pairing, tutor, data, locale, nowIso) {
  const windows = sharedWindows(pairing, data.availability, nowIso);

  return el('section', { class: 'card' },
    el('h2', { class: 'card__title', text: t('tutor.student.about') }),
    el('dl', { class: 'kv' },
      row(t('tutor.student.level'), student.englishLevel),
      student.grade != null ? row(t('tutor.student.grade'), String(student.grade)) : null,
      student.goals?.length ? row(t('tutor.student.goals'), student.goals.join(', ')) : null,
      student.interests?.length ? row(t('tutor.student.interests'), student.interests.join(', ')) : null,
      row(t('tutor.student.timezone'), student.timezone),
      pairing.startedAt
        ? row(t('tutor.student.pairedSince'),
            stampInZone(pairing.startedAt, tutor.timezone, { locale }))
        : null
    ),

    windows.length
      ? el('div', { class: 'student-windows' },
          el('div', { class: 'clock__zone', text: t('tutor.avail.windows') }),
          el('ul', { class: 'plain-list' }, windows.map((w) =>
            el('li', { class: 'small', text:
              `${t(`weekday.${w.weekday}`)} ${w.startTime}–${w.endTime}` })
          ))
        )
      : null,

    pairing.notes ? el('p', { class: 'small muted', text: pairing.notes }) : null
  );
}

function row(label, value) {
  const frag = document.createDocumentFragment();
  frag.append(el('dt', { text: label }), el('dd', { text: String(value ?? '') }));
  return frag;
}

/**
 * The two things a new tutor reads first: where the last session got to, and
 * what the student was asked to do before the next one.
 */
function handoverCard(sessions, student) {
  const lastHeld = sessions.find((s) => s.occurred === true);

  return el('section', { class: 'card handover' },
    el('h2', { class: 'card__title', text: t('tutor.student.handover') }),
    el('p', { class: 'small muted', text: t('tutor.student.handoverBody') }),

    lastHeld
      ? el('div', { class: 'handover__body' },
          lastHeld.covered
            ? el('div', {},
                el('div', { class: 'clock__zone', text: t('tutor.student.covered') }),
                el('p', { text: lastHeld.covered })
              )
            : null,
          lastHeld.homework
            ? el('div', {},
                el('div', { class: 'clock__zone', text: t('tutor.student.homework') }),
                el('p', { text: lastHeld.homework })
              )
            : null,
          student.goals?.length
            ? el('div', {},
                el('div', { class: 'clock__zone', text: t('tutor.student.goals') }),
                el('p', { text: student.goals.join(', ') })
              )
            : null
        )
      : el('p', { class: 'faint', text: t('tutor.student.noHistory') })
  );
}

function historyCard(sessions, student, tutor, locale) {
  if (!sessions.length) {
    return el('section', { class: 'empty' }, el('p', { text: t('tutor.student.noHistory') }));
  }

  return el('section', { class: 'card' },
    el('h2', { class: 'card__title', text: t('tutor.student.history') }),
    el('ol', { class: 'history' }, sessions.map((session) => historyItem(session, student, tutor, locale)))
  );
}

function historyItem(session, student, tutor, locale) {
  const held = session.occurred === true;
  const dual = formatDual(session.scheduledAt, tutor.timezone, student.timezone, { locale });

  return el('li', { class: `history__item${held ? '' : ' is-missed'}` },
    el('div', { class: 'history__when' },
      el('span', { class: 'history__date', text: stampInZone(session.scheduledAt, tutor.timezone, { locale }) }),
      el('span', { class: 'small faint', text: `${dual.a.weekdayLabel} · ${dual.a.time} / ${dual.b.time}` })
    ),

    held
      ? el('div', { class: 'history__body' },
          el('p', { class: 'history__covered', text: session.covered || '—' }),
          session.homework
            ? el('p', { class: 'small muted' },
                el('span', { class: 'history__tag', text: t('tutor.student.homework') }), ' ',
                session.homework)
            : null,
          el('span', { class: 'small faint', text: `${session.durationMinutes} ${t('tutor.log.minutes', { n: '' }).trim()}` })
        )
      : el('p', { class: 'small faint', text: session.covered || t('tutor.student.didNotHappen') })
  );
}
