/**
 * tutor-home.js — the dashboard a tutor opens.
 *
 * Principle 1: every element here is something the tutor wants. The next
 * class and its two clock readings, what they set as homework, what they
 * covered, and their hours. The coordinator's figures fall out of this as a
 * byproduct (principle 2) — nothing on this screen exists to collect data.
 *
 * The nudge for unlogged classes is a list, not a counter. No streak, no
 * deadline, no red badge (principle 3).
 */

import { el, viewHead, linkButton, statCard } from '../dom.js';
import { t, getLocale, getLang } from '../i18n.js';
import { formatDual, formatInZone } from '../time.js';
import {
  nextClassOverall,
  tutorPairings,
  studentCard,
  outstandingLogs,
  hoursByTerm
} from '../tutor.js';

export function render(container, { store, tutor, nowIso }) {
  const data = store.getState();
  const name = tutor.preferredName || tutor.name;
  const pairs = tutorPairings(tutor.id, data);

  container.append(
    viewHead(t('tutor.home.greeting', { name }), t('tutor.home.lede'))
  );

  if (pairs.length === 0) {
    container.append(noStudents());
    container.append(hoursBlock(tutor, data, nowIso));
    return;
  }

  const outstanding = outstandingLogs(tutor.id, data, { asOfIso: nowIso });

  container.append(
    nextClassCard(tutor, data, nowIso),
    outstanding.length ? nudge(outstanding, data, nowIso) : null,
    hoursBlock(tutor, data, nowIso),
    studentsBlock(tutor, pairs, data, nowIso)
  );
}

/* ------------------------------------------------------------------ *
 * Next class
 * ------------------------------------------------------------------ */

function nextClassCard(tutor, data, nowIso) {
  const next = nextClassOverall(tutor.id, data, { asOfIso: nowIso });

  if (!next) {
    return el('section', { class: 'card next-class next-class--empty' },
      el('h2', { class: 'card__title', text: t('tutor.next.title') }),
      el('p', { class: 'muted', text: t('tutor.next.none') }),
      linkButton(t('tutor.home.setAvailability'), '#/tutor/availability')
    );
  }

  const locale = getLocale();
  const student = next.student;
  // Two independently computed readings of one instant — see js/time.js.
  const dual = formatDual(next.startUtc, tutor.timezone, student.timezone, { locale });

  return el('section', { class: 'card next-class' },
    el('h2', { class: 'card__title', text: t('tutor.next.title') }),

    el('div', { class: 'next-class__who' },
      el('a', {
        class: 'next-class__name',
        href: `#/tutor/student/${encodeURIComponent(student.id)}`,
        text: student.preferredName || student.name
      }),
      el('span', {
        class: 'badge',
        text: next.source === 'scheduled' ? t('tutor.next.scheduled') : t('tutor.next.recurring')
      })
    ),

    el('div', { class: 'next-class__clocks' },
      clock(t('tutor.next.yourTime'), dual.a, locale),
      el('div', { class: 'next-class__eq', 'aria-hidden': 'true' }, '='),
      clock(t('tutor.next.theirTime'), dual.b, locale)
    ),

    el('div', { class: 'next-class__actions row' },
      linkButton(t('tutor.next.logIt'), `#/tutor/log/${encodeURIComponent(next.pairing.id)}`, 'primary'),
      tutor.meetingLink
        ? el('a', {
            class: 'btn',
            href: tutor.meetingLink,
            target: '_blank',
            rel: 'noopener noreferrer',
            text: t('tutor.next.join')
          })
        : null
    ),

    lastTimeBlock(next.lastSession)
  );
}

function clock(label, side, locale) {
  return el('div', { class: 'next-class__clock' },
    el('div', { class: 'clock__zone', text: label }),
    el('div', { class: 'next-class__weekday', text: side.weekdayLabel }),
    el('div', { class: 'next-class__time tnum', text: side.time }),
    el('div', { class: 'small faint', text: `${side.dateKey} · ${side.zoneLabel}` })
  );
}

/** What you set them last time — the thing you actually need before a class. */
function lastTimeBlock(lastSession) {
  if (!lastSession) return null;

  return el('div', { class: 'next-class__last' },
    lastSession.homework
      ? el('div', {},
          el('div', { class: 'clock__zone', text: t('tutor.next.homework') }),
          el('p', { class: 'next-class__homework', text: lastSession.homework })
        )
      : el('p', { class: 'small faint', text: t('tutor.next.noHomework') }),
    lastSession.covered
      ? el('div', {},
          el('div', { class: 'clock__zone', text: t('tutor.next.lastCovered') }),
          el('p', { class: 'small muted', text: lastSession.covered })
        )
      : null
  );
}

/* ------------------------------------------------------------------ *
 * The nudge
 * ------------------------------------------------------------------ */

function nudge(outstanding, data, nowIso) {
  const locale = getLocale();
  const byId = new Map(data.people.map((p) => [p.id, p]));

  return el('section', { class: 'card nudge' },
    el('h2', { class: 'card__title', text: t('tutor.nudge.title') }),
    el('p', { class: 'muted small', text: t('tutor.nudge.body') }),
    el('ul', { class: 'nudge__list' },
      outstanding.map(({ session, pairing, student }) =>
        el('li', { class: 'nudge__item' },
          el('span', { class: 'nudge__when', text:
            formatInZone(session.scheduledAt, byId.get(pairing.tutorId)?.timezone ?? 'UTC',
              { locale, weekday: true, date: true }) }),
          el('span', { class: 'nudge__who', text: student?.preferredName || student?.name || '' }),
          linkButton(t('tutor.nudge.log'), `#/tutor/log/${encodeURIComponent(pairing.id)}?session=${encodeURIComponent(session.id)}`, 'sm')
        )
      )
    )
  );
}

/* ------------------------------------------------------------------ *
 * Hours
 * ------------------------------------------------------------------ */

function hoursBlock(tutor, data, nowIso) {
  const { currentTerm, allTime } = hoursByTerm(tutor.id, data, { asOfIso: nowIso });

  return el('section', { class: 'hours-block' },
    el('div', { class: 'grid grid--two' },
      bigStat(currentTerm ? currentTerm.label : t('tutor.hours.thisTerm'),
        currentTerm ? currentTerm.totalLabel : '0'),
      bigStat(t('tutor.hours.allTime'), allTime.totalLabel)
    ),
    el('div', { class: 'row', style: 'margin-top:12px' },
      linkButton(t('tutor.hours.export.print'), '#/tutor/hours', 'primary')
    )
  );
}

function bigStat(label, hours) {
  return el('div', { class: 'card stat stat--hours' },
    el('span', { class: 'stat__value tnum' },
      hours,
      el('span', { class: 'stat__unit', text: t('tutor.hours.hoursShort') })
    ),
    el('span', { class: 'stat__label', text: label })
  );
}

/* ------------------------------------------------------------------ *
 * Students
 * ------------------------------------------------------------------ */

function studentsBlock(tutor, pairs, data, nowIso) {
  const locale = getLocale();

  return el('section', { class: 'students-block' },
    el('h2', { text: t('tutor.students.title') }),
    el('div', { class: 'grid' },
      pairs.map(({ pairing, student }) => {
        const card = studentCard(pairing, student, data, { asOfIso: nowIso });
        return studentTile(card, tutor, locale);
      })
    )
  );
}

function studentTile(card, tutor, locale) {
  const { student, pairing, lastSession } = card;

  return el('article', { class: 'card student-tile' },
    el('a', {
      class: 'student-tile__name',
      href: `#/tutor/student/${encodeURIComponent(student.id)}`,
      text: student.preferredName || student.name
    }),

    el('div', { class: 'row student-tile__tags' },
      el('span', { class: 'badge badge--accent', text: student.englishLevel }),
      el('span', { class: 'badge', text: t('tutor.students.sessions', { count: card.sessionCount }) })
    ),

    student.goals?.length
      ? el('div', { class: 'student-tile__row' },
          el('div', { class: 'clock__zone', text: t('tutor.students.goals') }),
          el('p', { class: 'small', text: student.goals.join(', ') })
        )
      : null,

    el('div', { class: 'student-tile__row' },
      el('div', { class: 'clock__zone', text: t('tutor.students.lastSession') }),
      lastSession
        ? el('p', { class: 'small' },
            formatInZone(lastSession.scheduledAt, tutor.timezone, { locale, date: true, weekday: true }))
        : el('p', { class: 'small faint', text: t('tutor.students.never') })
    ),

    lastSession?.covered
      ? el('p', { class: 'small muted student-tile__covered', text: lastSession.covered })
      : null,

    el('div', { class: 'row student-tile__actions' },
      linkButton(t('tutor.students.log'), `#/tutor/log/${encodeURIComponent(pairing.id)}`, 'sm'),
      linkButton(t('tutor.students.open'), `#/tutor/student/${encodeURIComponent(student.id)}`, 'sm')
    )
  );
}

function noStudents() {
  return el('section', { class: 'empty' },
    el('h2', { text: t('tutor.home.noStudents.title') }),
    el('p', { text: t('tutor.home.noStudents.body') }),
    el('div', { class: 'empty__actions' },
      linkButton(t('tutor.home.setAvailability'), '#/tutor/availability', 'primary')
    )
  );
}
