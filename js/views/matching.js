/**
 * matching.js (view) — the coordinator's pairing screen.
 *
 * The system suggests; a human accepts. Nothing on this screen assigns
 * anybody, and there is deliberately no "accept all" button — every pairing
 * is a decision somebody made about two named people.
 *
 * Every suggestion shows its reasoning and its weaknesses. A score without
 * reasoning is not shown at all: the number exists to order the list, and the
 * sentences are what a coordinator actually reads and repeats to a parent.
 *
 * The reasoning arrives from js/matching.js as `{ code, values }` pairs and is
 * translated here, which is why the same explanation reads correctly in
 * Chinese.
 */

import { el, viewHead, button, toast, linkButton, mount } from '../dom.js';
import { t, getLocale } from '../i18n.js';
import { matchingReport } from '../matching.js';

export function render(container, { store, nowIso }) {
  const data = store.getState();
  const report = matchingReport(data, { referenceIso: nowIso });

  mount(container, 
    viewHead(t('match.title'), t('match.lede'), [
      el('span', { class: 'badge badge--accent', text: t('match.counts', report.counts) })
    ]),

    report.waiting.length
      ? el('section', { class: 'match-block' },
          el('h2', { text: t('match.waiting.title') }),
          el('div', { class: 'stack' }, report.waiting.map((row) => studentBlock(row, store)))
        )
      : el('section', { class: 'empty' }, el('p', { text: t('match.waiting.none') })),

    report.blocked.length ? blockedBlock(report.blocked) : null,
    report.idleTutors.length ? idleBlock(report.idleTutors) : null,
    report.stale.length ? staleBlock(report.stale, store) : null
  );
}

/* ------------------------------------------------------------------ *
 * A waiting student and their candidates
 * ------------------------------------------------------------------ */

function studentBlock(row, store) {
  const { student, candidates } = row;

  return el('section', { class: 'card match-student' },
    el('header', { class: 'match-student__head' },
      el('h3', { class: 'match-student__name', text: student.preferredName || student.name }),
      el('span', { class: 'small muted', text: describeStudent(student) })
    ),
    el('div', { class: 'match-candidates' },
      candidates.map((candidate, index) => candidateCard(candidate, student, index, store))
    )
  );
}

function describeStudent(student) {
  return [
    student.englishLevel,
    student.goals?.length ? student.goals.join(', ') : null
  ].filter(Boolean).join(' · ');
}

function candidateCard(candidate, student, index, store) {
  const data = store.getState();
  const tutor = data.people.find((p) => p.id === candidate.tutorId);

  const accept = button(t('match.accept'), {
    variant: index === 0 ? 'primary' : '',
    onClick: () => {
      store.createPairing({ tutorId: candidate.tutorId, studentId: student.id });
      toast(t('match.accepted', {
        student: student.preferredName || student.name,
        tutor: tutor.preferredName || tutor.name
      }));
    }
  });

  return el('article', { class: `match-candidate${index === 0 ? ' is-top' : ''}` },
    el('div', { class: 'match-candidate__head' },
      el('span', { class: 'match-candidate__rank', text: t('match.candidate', { n: index + 1 }) }),
      el('span', { class: 'match-candidate__name', text: tutor.preferredName || tutor.name }),
      el('span', { class: 'match-candidate__score tnum',
        title: t('match.score'), text: String(Math.round(candidate.score)) })
    ),

    // Reasoning is not optional decoration; it is why the number is allowed
    // on screen at all.
    reasonList(t('match.why'), candidate.reasons, 'is-why'),
    candidate.weaknesses.length
      ? reasonList(t('match.watch'), candidate.weaknesses, 'is-watch', 'match.weak.')
      : null,

    el('div', { class: 'match-candidate__actions' }, accept)
  );
}

/**
 * Render `{ code, values }` reasoning through the dictionary.
 *
 * Weekday and part-of-day arrive as raw data and are translated here too, so
 * "Saturday morning" becomes "星期六上午" rather than a half-translated line.
 */
function reasonList(title, entries, modifier, prefix = 'match.reason.') {
  return el('div', { class: `match-reasons ${modifier}` },
    el('span', { class: 'match-reasons__title', text: title }),
    el('ul', {}, entries.map((entry) =>
      el('li', { text: t(prefix + entry.code, translateValues(entry.values)) })
    ))
  );
}

function translateValues(values = {}) {
  const out = { ...values };
  if (Array.isArray(values.list)) out.list = values.list.join(', ');
  if (typeof values.weekday === 'number') out.weekday = t(`weekday.${values.weekday}`);
  if (values.part) out.part = t(`match.part.${values.part}`);
  return out;
}

/* ------------------------------------------------------------------ *
 * Students nobody can take
 * ------------------------------------------------------------------ */

function blockedBlock(blocked) {
  return el('section', { class: 'match-block' },
    el('h2', { text: t('match.blocked.title') }),
    el('p', { class: 'small muted', text: t('match.blocked.body') }),
    el('div', { class: 'stack' }, blocked.map(({ student, diagnosis }) =>
      el('section', { class: 'card match-blocked' },
        el('h3', { class: 'match-student__name', text: student.preferredName || student.name }),
        el('p', { class: 'small muted', text: describeStudent(student) }),
        el('p', { class: 'match-blocked__fix',
          text: t(`match.fix.${diagnosis.fix.code}`, diagnosis.fix.values) }),

        diagnosis.nearest.length
          ? el('details', { class: 'match-blocked__nearest' },
              el('summary', { class: 'small muted', text: t('match.nearest') }),
              el('ul', { class: 'plain-list' }, diagnosis.nearest.map((pair) =>
                el('li', { class: 'small' },
                  el('strong', { text: pair.tutorId }), ' — ',
                  pair.blockers.map((b) => t(`match.blocker.${b}`)).join(' · '))
              ))
            )
          : null
      )
    ))
  );
}

/* ------------------------------------------------------------------ *
 * Volunteers with nothing to do
 * ------------------------------------------------------------------ */

function idleBlock(idle) {
  return el('section', { class: 'match-block' },
    el('h2', { text: t('match.idle.title') }),
    el('p', { class: 'small muted', text: t('match.idle.body') }),
    el('div', { class: 'table-wrap' },
      el('table', {},
        el('thead', {}, el('tr', {},
          el('th', { text: t('nav.tutors') }),
          el('th', { text: t('match.slotsOpen', { remaining: '', total: '' }).trim() }),
          el('th', { text: t('match.blockedBy') })
        )),
        el('tbody', {}, idle.map(({ tutor, remaining, reasons }) =>
          el('tr', {},
            el('td', { text: tutor.preferredName || tutor.name }),
            el('td', { class: 'tnum', text: String(remaining) }),
            el('td', { text: Object.keys(reasons).map((b) => t(`match.blocker.${b}`)).join(' · ') || '—' })
          )
        ))
      )
    )
  );
}

/* ------------------------------------------------------------------ *
 * Pairings that have drifted apart
 * ------------------------------------------------------------------ */

function staleBlock(stale, store) {
  return el('section', { class: 'match-block' },
    el('h2', { text: t('match.stale.title') }),
    el('p', { class: 'small muted', text: t('match.stale.body') }),
    el('div', { class: 'stack' }, stale.map(({ pairing, tutor, student, hadAvailability }) =>
      el('section', { class: 'card match-stale' },
        el('p', { class: 'match-stale__who' },
          el('strong', { text: tutor.preferredName || tutor.name }),
          ' · ',
          el('strong', { text: student.preferredName || student.name })
        ),
        el('p', { class: 'small muted',
          text: hadAvailability ? t('match.stale.noOverlap') : t('match.stale.missing') })
      )
    ))
  );
}
