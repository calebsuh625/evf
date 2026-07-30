/**
 * selftest.js (view) — the timezone assertions, rendered.
 *
 * This screen exists to be shown to a person who is deciding whether to trust
 * the app. It runs the real assertions in their browser, on their machine, at
 * the moment they look at it — not a badge, not a screenshot, not a claim.
 *
 * The scenarios come from js/selftest.js, which tests/time.test.js also
 * imports. A green panel here and a green suite there are the same facts.
 */

import { el, viewHead, button, toast } from '../dom.js';
import { t, getLang, getLocale } from '../i18n.js';
import { runSelfTest } from '../selftest.js';
import { formatDual, CHINA_TZ, PACIFIC_TZ } from '../time.js';

export function render(container) {
  const started = performance.now();
  const summary = runSelfTest({ lang: getLang() });
  const elapsed = Math.max(1, Math.round(performance.now() - started));

  container.append(
    viewHead(t('selftest.title'), t('selftest.lede'), [
      button(t('selftest.rerun'), {
        onClick: () => {
          container.replaceChildren();
          render(container);
          toast(t('selftest.reran'));
        }
      })
    ]),
    verdict(summary, elapsed),
    liveExample(),
    ...summary.byCategory.map(categorySection),
    footnote()
  );
}

/* ------------------------------------------------------------------ */

function verdict(summary, elapsed) {
  const ok = summary.ok;
  return el('section', {
    class: `selftest-verdict ${ok ? 'is-pass' : 'is-fail'}`,
    role: 'status'
  },
    el('div', { class: 'selftest-verdict__mark', 'aria-hidden': 'true' }, ok ? '✓' : '✕'),
    el('div', {},
      el('h2', { class: 'selftest-verdict__headline',
        text: ok
          ? t('selftest.pass', { total: summary.total })
          : t('selftest.fail', { failed: summary.failed, total: summary.total })
      }),
      el('p', { class: 'small muted', text: t('selftest.ranIn', { ms: elapsed }) })
    )
  );
}

/**
 * The headline fact, computed live rather than quoted. Uses the current moment
 * so a reader can see it is really running: the next Saturday 09:00 in Beijing
 * and what that is on a Pacific clock.
 */
function liveExample() {
  const locale = getLocale();
  // A fixed instant, so the example matches the scenario below it exactly.
  const instant = '2026-06-20T01:00:00.000Z';
  const dual = formatDual(instant, PACIFIC_TZ, CHINA_TZ, { locale });

  return el('section', { class: 'card selftest-example' },
    el('h2', { class: 'card__title', text: t('selftest.example') }),
    el('div', { class: 'selftest-example__grid' },
      side(t('selftest.tutorSide'), dual.a),
      el('div', { class: 'selftest-example__eq', 'aria-hidden': 'true' }, '='),
      side(t('selftest.studentSide'), dual.b)
    ),
    el('p', { class: 'small faint', text: t('selftest.exampleNote', { utc: dual.utc }) })
  );
}

function side(label, s) {
  return el('div', { class: 'selftest-example__side' },
    el('div', { class: 'clock__zone', text: label }),
    el('div', { class: 'selftest-example__weekday', text: s.weekdayLabel }),
    el('div', { class: 'selftest-example__time tnum', text: s.time }),
    el('div', { class: 'small faint', text: `${s.dateKey} · ${s.zoneLabel}` })
  );
}

function categorySection(group) {
  const failed = group.results.filter((r) => !r.pass).length;

  return el('section', { class: 'selftest-group' },
    el('div', { class: 'selftest-group__head' },
      el('h2', { text: group.title }),
      el('span', {
        class: failed === 0 ? 'badge badge--good' : 'badge badge--warn',
        text: failed === 0
          ? `${group.results.length}/${group.results.length}`
          : t('selftest.nFailing', { failed })
      })
    ),
    el('p', { class: 'small muted', text: group.blurb }),
    el('ul', { class: 'selftest-list' }, group.results.map(resultRow))
  );
}

function resultRow(result) {
  const detail = el('div', { class: 'selftest-row__detail' },
    el('p', { class: 'small muted', text: result.why }),
    result.note ? el('p', { class: 'small', text: result.note }) : null,
    el('dl', { class: 'kv small' },
      el('dt', { text: t('selftest.expected') }),
      el('dd', { class: 'selftest-row__value', text: result.expected }),
      el('dt', { text: t('selftest.actual') }),
      el('dd', {
        class: `selftest-row__value${result.pass ? '' : ' is-wrong'}`,
        text: result.actual
      })
    )
  );

  // Failures open by default: nobody should have to click to find the problem.
  const wrapper = el('details', { class: 'selftest-row', open: !result.pass },
    el('summary', { class: 'selftest-row__summary' },
      el('span', {
        class: `selftest-row__mark ${result.pass ? 'is-pass' : 'is-fail'}`,
        'aria-hidden': 'true',
        text: result.pass ? '✓' : '✕'
      }),
      el('span', { class: 'selftest-row__title', text: result.title }),
      el('span', { class: 'visually-hidden', text: result.pass ? t('selftest.passed') : t('selftest.failed') })
    ),
    detail
  );

  return el('li', {}, wrapper);
}

function footnote() {
  return el('p', { class: 'small faint selftest-footnote' },
    t('selftest.footnote'), ' ',
    el('a', { href: 'tests/test.html', text: t('footer.tests') }),
    '.'
  );
}
