/**
 * admin-attention.js — the highest-value screen in the app.
 *
 * It answers the question a coordinator cannot answer any other way: which
 * pairings have quietly stopped? Nobody reports that. The tutor assumes the
 * student is busy, the student assumes the tutor is busy, and a pairing can be
 * over for two months before anyone says so.
 *
 * Everything here is computed. Nobody is asked to confirm anything, check in,
 * or report status so this page can be populated (principle 2).
 *
 * And everything here is a prompt for a person to have a conversation. There
 * are no strikes, no counts against anybody, no thresholds that trigger an
 * action, and nothing that sends a message automatically (principle 3). Each
 * row carries contact details precisely because the intended next step is a
 * human writing to another human.
 */

import { el, viewHead, linkButton } from '../dom.js';
import { t, getLocale } from '../i18n.js';
import { stampInZone } from '../time.js';
import { attentionReport } from '../admin.js';

const QUIET_WEEKS = 2;
const MISS_WINDOW_DAYS = 28;

export function render(container, { store, nowIso }) {
  const data = store.getState();
  const locale = getLocale();
  const tz = data.program.adminTimeZone;
  const report = attentionReport(data, {
    nowIso, quietWeeks: QUIET_WEEKS, missWindowDays: MISS_WINDOW_DAYS
  });

  container.append(viewHead(t('admin.att.title'), t('admin.att.lede')));

  if (report.allClear) {
    container.append(el('section', { class: 'card attention-clear' },
      el('p', { text: t('admin.att.allClear') })
    ));
  }

  container.append(
    quietSection(report.quiet, tz, locale),
    waitingSection(report.waiting),
    capacitySection(report.capacity),
    missesSection(report.misses, tz, locale),
    el('p', { class: 'small faint admin-computed', text: t('admin.computed') })
  );
}

/* ------------------------------------------------------------------ *
 * Contact details — the point of the screen is that you can act on it
 * ------------------------------------------------------------------ */

function contactLine(person) {
  if (!person) return null;
  const bits = [person.wechat, person.email].filter(Boolean);
  return el('span', { class: 'attention-contact small' },
    el('span', { class: 'clock__zone', text: t('admin.att.contact') }), ' ',
    bits.length
      ? bits.join(' · ')
      : el('span', { class: 'faint', text: t('admin.att.noContact') })
  );
}

function personLink(person) {
  if (!person) return el('span', { text: '—' });
  return el('a', {
    class: 'attention-name',
    href: `#/admin/roster/${encodeURIComponent(person.id)}`,
    text: person.preferredName || person.name
  });
}

function block(titleKey, bodyText, emptyText, rows, extraClass = '') {
  return el('section', { class: `attention-block ${extraClass}` },
    el('div', { class: 'attention-block__head' },
      el('h2', { text: t(titleKey) }),
      rows.length ? el('span', { class: 'badge', text: String(rows.length) }) : null
    ),
    el('p', { class: 'small muted', text: bodyText }),
    rows.length
      ? el('ul', { class: 'attention-list' }, rows)
      : el('p', { class: 'small faint', text: emptyText })
  );
}

/* ------------------------------------------------------------------ *
 * Pairings that have gone quiet
 * ------------------------------------------------------------------ */

function quietSection(quiet, tz, locale) {
  const rows = quiet.map(({ pairing, tutor, student, lastSessionIso, daysQuiet, neverMet }) =>
    el('li', { class: 'attention-row is-quiet' },
      el('span', { class: 'attention-row__lead tnum',
        text: t('admin.att.quiet.days', { n: daysQuiet ?? 0 }) }),

      el('div', { class: 'attention-row__body' },
        el('div', { class: 'attention-row__who' },
          personLink(tutor), el('span', { class: 'faint', text: ' · ' }), personLink(student)
        ),
        el('p', { class: 'small muted', text: neverMet
          ? t('admin.att.quiet.never')
          : t('admin.att.quiet.lastMet', { date: stampInZone(lastSessionIso, tz, { locale }) }) }),
        contactLine(tutor),
        contactLine(student)
      )
    )
  );

  return block('admin.att.quiet.title',
    t('admin.att.quiet.body', { weeks: QUIET_WEEKS }),
    t('admin.att.quiet.none'), rows, 'is-primary');
}

/* ------------------------------------------------------------------ *
 * Students with no tutor
 * ------------------------------------------------------------------ */

function waitingSection(waiting) {
  const rows = waiting.map(({ student, previousPairings }) =>
    el('li', { class: 'attention-row' },
      el('span', { class: 'attention-row__lead' },
        el('span', {
          class: previousPairings > 0 ? 'badge badge--warn' : 'badge',
          text: previousPairings > 0 ? t('admin.att.waiting.returning') : t('admin.att.waiting.new')
        })
      ),
      el('div', { class: 'attention-row__body' },
        el('div', { class: 'attention-row__who' }, personLink(student)),
        el('p', { class: 'small muted', text: [
          student.englishLevel,
          student.goals?.length ? student.goals.join(', ') : null
        ].filter(Boolean).join(' · ') }),
        contactLine(student)
      )
    )
  );

  const section = block('admin.att.waiting.title', t('admin.att.waiting.body'),
    t('admin.att.waiting.none'), rows);

  if (rows.length) {
    section.append(el('div', { class: 'row' },
      linkButton(t('admin.att.openMatching'), '#/admin/matching', 'sm')));
  }
  return section;
}

/* ------------------------------------------------------------------ *
 * Tutors with room
 * ------------------------------------------------------------------ */

function capacitySection(capacity) {
  const rows = capacity.map(({ tutor, used, remaining }) =>
    el('li', { class: 'attention-row' },
      el('span', { class: 'attention-row__lead tnum',
        text: t('admin.att.capacity.open', { remaining, capacity: used + remaining }) }),
      el('div', { class: 'attention-row__body' },
        el('div', { class: 'attention-row__who' }, personLink(tutor)),
        el('p', { class: 'small muted', text: (tutor.subjects ?? []).join(', ') }),
        contactLine(tutor)
      )
    )
  );

  return block('admin.att.capacity.title', t('admin.att.capacity.body'),
    t('admin.att.capacity.none'), rows);
}

/* ------------------------------------------------------------------ *
 * Classes that did not happen
 * ------------------------------------------------------------------ */

function missesSection(misses, tz, locale) {
  const rows = misses.map(({ session, tutor, student, note }) =>
    el('li', { class: 'attention-row' },
      el('span', { class: 'attention-row__lead',
        text: stampInZone(session.scheduledAt, tz, { locale }) }),
      el('div', { class: 'attention-row__body' },
        el('div', { class: 'attention-row__who' },
          personLink(tutor), el('span', { class: 'faint', text: ' · ' }), personLink(student)
        ),
        // The tutor's own words about why, if they wrote any. Never a category,
        // never a reason code, and never required of them.
        note ? el('p', { class: 'small muted', text: note }) : null
      )
    )
  );

  return block('admin.att.misses.title',
    t('admin.att.misses.body', { days: MISS_WINDOW_DAYS }),
    t('admin.att.misses.none', { days: MISS_WINDOW_DAYS }), rows);
}
