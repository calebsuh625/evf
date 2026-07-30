/**
 * admin-overview.js — the state of the program.
 *
 * Every number here is computed from records people keep for their own
 * reasons. Nothing on this screen exists because somebody was asked to report
 * it (principle 2).
 *
 * The growth chart is inline SVG built from js/chart.js. No charting library:
 * one would be a CDN dependency or a build step, and neither is available to
 * an app that has to load from mainland China.
 */

import { el, viewHead, statCard, linkButton, button, toast } from '../dom.js';
import { t, getLocale } from '../i18n.js';
import { programCounts, periodTotals, growthByMonth, attentionReport } from '../admin.js';
import { lineChart } from '../chart.js';

export function render(container, { store, nowIso }) {
  const data = store.getState();

  if (data.people.length === 0) {
    container.append(viewHead(t('admin.ov.title'), t('admin.ov.lede')), emptyState(store));
    return;
  }

  const counts = programCounts(data);
  const totals = periodTotals(data, { nowIso });
  const attention = attentionReport(data, { nowIso });
  const growth = growthByMonth(data, { nowIso });

  container.append(
    viewHead(t('admin.ov.title'), t('admin.ov.lede')),

    el('div', { class: 'grid' },
      countCard(t('admin.ov.activePairings'), counts.activePairings,
        counts.pausedPairings ? t('admin.ov.paused', { n: counts.pausedPairings }) : null),
      countCard(t('admin.ov.tutors'), counts.activeTutors,
        counts.tutors - counts.activeTutors ? t('admin.ov.inactive', { n: counts.tutors - counts.activeTutors }) : null),
      countCard(t('admin.ov.students'), counts.activeStudents,
        attention.counts.waiting ? t('admin.ov.waiting', { n: attention.counts.waiting }) : null)
    ),

    hoursSection(totals),
    growth.length > 1 ? growthSection(growth) : null,

    el('div', { class: 'row', style: 'margin-top:24px' },
      linkButton(t('admin.ov.attentionCta'), '#/admin/attention', 'primary'),
      linkButton(t('match.nav'), '#/admin/matching')
    ),

    el('p', { class: 'small faint admin-computed', text: t('admin.computed') })
  );
}

function countCard(label, value, footnote) {
  return el('div', { class: 'card stat' },
    el('span', { class: 'stat__value tnum', text: String(value) }),
    el('span', { class: 'stat__label', text: label }),
    footnote ? el('span', { class: 'small faint', text: footnote }) : null
  );
}

/* ------------------------------------------------------------------ */

function hoursSection(totals) {
  return el('section', { class: 'card admin-hours' },
    el('h2', { class: 'card__title', text: t('admin.ov.hours') }),
    el('div', { class: 'admin-hours__grid' },
      period(t('admin.ov.week'), totals.week),
      period(t('admin.ov.month'), totals.month),
      totals.term ? period(totals.term.label2, totals.term) : null,
      period(t('admin.ov.allTime'), totals.allTime, true)
    )
  );
}

function period(label, scope, strong = false) {
  return el('div', { class: `admin-hours__cell${strong ? ' is-total' : ''}` },
    el('span', { class: 'admin-hours__value tnum' },
      scope.label,
      el('span', { class: 'stat__unit', text: t('tutor.hours.hoursShort') })
    ),
    el('span', { class: 'admin-hours__label', text: label })
  );
}

/* ------------------------------------------------------------------ *
 * Growth
 * ------------------------------------------------------------------ */

const SVG = 'http://www.w3.org/2000/svg';

/** SVG needs createElementNS, so it cannot go through el(). */
function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function growthSection(growth) {
  const box = { width: 640, height: 190, padding: { top: 10, right: 12, bottom: 24, left: 32 } };

  const people = lineChart(growth, {
    box,
    x: (row) => row.month.slice(2),
    series: [
      { key: 'students', of: (row) => row.students },
      { key: 'tutors', of: (row) => row.tutors }
    ]
  });

  const sessions = lineChart(growth, {
    box: { ...box, height: 110 },
    x: (row) => row.month.slice(2),
    series: [{ key: 'sessions', of: (row) => row.sessions }]
  });

  return el('section', { class: 'card admin-growth' },
    el('h2', { class: 'card__title', text: t('admin.ov.growth') }),
    el('p', { class: 'small muted', text: t('admin.ov.growthBody') }),

    el('div', { class: 'admin-growth__legend' },
      legend('students', t('admin.ov.students'), growth[growth.length - 1].students),
      legend('tutors', t('admin.ov.tutors'), growth[growth.length - 1].tutors)
    ),

    el('div', { class: 'admin-growth__chart' }, peopleChart(people)),

    el('p', { class: 'small muted', style: 'margin-top:16px', text: t('admin.ov.sessionsPerMonth') }),
    el('div', { class: 'admin-growth__chart' }, sessionsChart(sessions))
  );
}

function legend(key, label, value) {
  return el('span', { class: `admin-growth__key is-${key}` },
    el('span', { class: 'admin-growth__swatch', 'aria-hidden': 'true' }),
    `${label} `,
    el('strong', { class: 'tnum', text: String(value) })
  );
}

function peopleChart(chart) {
  const { box } = chart;
  const root = svg('svg', {
    viewBox: `0 0 ${box.width} ${box.height}`,
    class: 'chart',
    role: 'img',
    preserveAspectRatio: 'none',
    'aria-label': `${t('admin.ov.growth')}: ${t('admin.ov.students')}, ${t('admin.ov.tutors')}`
  });

  for (const tick of chart.ticks) {
    root.append(
      svg('line', { class: 'chart__grid', x1: 32, x2: box.width - 12, y1: tick.y, y2: tick.y }),
      svg('text', { class: 'chart__tick', x: 26, y: tick.y + 4, 'text-anchor': 'end' }, String(tick.value))
    );
  }

  for (const [i, series] of chart.series.entries()) {
    const name = i === 0 ? 'students' : 'tutors';
    root.append(
      svg('path', { class: `chart__area is-${name}`, d: series.area }),
      svg('path', { class: `chart__line is-${name}`, d: series.line })
    );
    for (const point of series.points) {
      root.append(svg('circle', { class: `chart__dot is-${name}`, cx: point.x, cy: point.y, r: 3 }));
    }
  }

  // Anchor the outermost labels inward, or they hang off the viewBox edges.
  const last = chart.labels.length - 1;
  for (const [i, label] of chart.labels.entries()) {
    root.append(svg('text', {
      class: 'chart__label',
      x: label.x,
      y: box.height - 6,
      'text-anchor': i === 0 ? 'start' : i === last ? 'end' : 'middle'
    }, label.text));
  }

  return root;
}

function sessionsChart(chart) {
  const { box } = chart;
  const root = svg('svg', {
    viewBox: `0 0 ${box.width} ${box.height}`,
    class: 'chart',
    role: 'img',
    preserveAspectRatio: 'none',
    'aria-label': t('admin.ov.sessionsPerMonth')
  });

  const [series] = chart.series;
  const width = Math.max(6, (box.width - 44) / Math.max(series.points.length, 1) - 10);

  for (const point of series.points) {
    root.append(svg('rect', {
      class: 'chart__bar',
      x: point.x - width / 2,
      y: point.y,
      width,
      height: Math.max(0, chart.baselineY - point.y),
      rx: 2
    }));
  }

  for (const tick of [chart.ticks[chart.ticks.length - 1]]) {
    root.append(svg('text', { class: 'chart__tick', x: 26, y: tick.y + 4, 'text-anchor': 'end' },
      String(tick.value)));
  }

  return root;
}

/* ------------------------------------------------------------------ */

function emptyState(store) {
  const load = button(t('action.loadSample'), {
    variant: 'primary',
    onClick: async () => {
      load.disabled = true;
      try {
        await store.loadSampleData();
        toast(t('toast.sampleLoaded'));
      } catch (err) {
        toast(err.message.split('\n')[0], 'error');
        load.disabled = false;
      }
    }
  });

  return el('section', { class: 'empty' },
    el('h2', { text: t('home.empty.title') }),
    el('p', { text: t('home.empty.body') }),
    el('div', { class: 'empty__actions row', style: 'justify-content:center' },
      load,
      linkButton(t('action.goToData'), '#/admin/export')
    )
  );
}
