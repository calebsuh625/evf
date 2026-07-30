/**
 * home.js — the dashboard.
 *
 * Two clocks at the top, because the single most common coordination mistake
 * in this program is a tutor and a student showing up an hour apart.
 */

import { el, statCard, linkButton, button, toast } from '../dom.js';
import { t, getLocale } from '../i18n.js';
import { formatInZone, zoneLabel, zoneOffsetMinutes } from '../time.js';
import { programTotals } from '../hours.js';

export function render(container, { store }) {
  const data = store.getState();
  const isEmpty = data.tutors.length === 0 && data.students.length === 0;

  container.append(hero(isEmpty, store));

  if (isEmpty) {
    container.append(emptyState(store));
    return;
  }

  const totals = programTotals(data.sessions, data.tutors, data.students);
  const activeMatches = data.matches.filter((m) => m.status === 'active').length;

  container.append(
    el('div', { class: 'grid' },
      statCard(t('home.stat.tutors'), data.tutors.length),
      statCard(t('home.stat.students'), data.students.length),
      statCard(t('home.stat.matches'), activeMatches),
      statCard(t('home.stat.hours'), totals.hoursLabel)
    ),

    el('div', { class: 'card', style: 'margin-top:24px' },
      el('h2', { class: 'card__title', text: t('home.next') }),
      el('div', { class: 'row' },
        linkButton(t('action.logSession'), '#/log', 'primary'),
        linkButton(t('action.viewTutors'), '#/tutors'),
        linkButton(t('nav.matches'), '#/matches'),
        linkButton(t('data.export.title'), '#/data')
      )
    )
  );
}

function hero(isEmpty, store) {
  const node = el('section', { class: 'dash-hero' },
    el('h1', { text: t('home.title') }),
    el('p', { text: t('home.lede') })
  );

  if (!isEmpty) node.append(clocks(store.getState()));
  return node;
}

/**
 * Both sides of every pairing, live. Rendered once per route change rather
 * than on a timer: a ticking clock is a reason for the page to never be idle,
 * and minute precision is all this needs.
 */
function clocks(data) {
  const now = new Date().toISOString();
  const locale = getLocale();
  const here = data.program.adminTimeZone;
  const there = data.program.studentTimeZone;

  const offsetHours =
    (zoneOffsetMinutes(now, there) - zoneOffsetMinutes(now, here)) / 60;

  return el('div', { class: 'clocks' },
    clock(t('home.zone.here'), formatInZone(now, here, { locale, weekday: true }), zoneLabel(now, here, locale)),
    clock(
      t('home.zone.students'),
      formatInZone(now, there, { locale, weekday: true }),
      `${zoneLabel(now, there, locale)} · ${offsetHours >= 0 ? '+' : ''}${offsetHours}h`
    )
  );
}

function clock(zoneLabelText, timeText, detail) {
  return el('div', { class: 'clock' },
    el('div', { class: 'clock__zone', text: zoneLabelText }),
    el('div', { class: 'clock__time tnum', text: timeText }),
    el('div', { class: 'clock__delta', text: detail })
  );
}

function emptyState(store) {
  const load = button(t('action.loadSample'), {
    variant: 'primary',
    onClick: async () => {
      load.disabled = true;
      try {
        await store.loadSampleData();
        toast(t('toast.sampleLoaded'));
      } catch (err) {
        toast(err.message, 'error');
        load.disabled = false;
      }
    }
  });

  return el('section', { class: 'empty' },
    el('h2', { text: t('home.empty.title') }),
    el('p', { text: t('home.empty.body') }),
    el('div', { class: 'empty__actions row', style: 'justify-content:center' },
      load,
      linkButton(t('action.goToData'), '#/data')
    )
  );
}
