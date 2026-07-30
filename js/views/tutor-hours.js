/**
 * tutor-hours.js — a tutor's hours, and the export that makes logging worth it.
 *
 * A high schooler logs sessions because at the end of the year they need a
 * signed piece of paper saying how many hours they did. NHS, the Congressional
 * Award and the President's Volunteer Service Award all want the same things:
 * who, what organisation, what activity, over what dates, how many hours, and
 * a supervisor's signature. So the printed page produces exactly that, and it
 * is treated as the point of the screen rather than a button in a corner.
 *
 * The printable record is rendered into the page itself and revealed by
 * css/print.css, so `window.print()` needs no popup, no new document, and no
 * second code path that could disagree with what is on screen.
 */

import { el, viewHead, button, linkButton, toast } from '../dom.js';
import { t, getLocale } from '../i18n.js';
import { formatInZone, dateKeyInZone } from '../time.js';
import { hoursByTerm, sessionLog, hourBreakdown } from '../tutor.js';
import { formatHours, toRoundedHours } from '../hours.js';
import { objectsToCsv } from '../csv.js';

export function render(container, { store, tutor, nowIso }) {
  const data = store.getState();
  const locale = getLocale();
  const { terms, currentTerm, allTime } = hoursByTerm(tutor.id, data, { asOfIso: nowIso });

  // Which period the export covers. Defaults to the current term when there
  // is one, because that is what a form is usually asking about.
  let selected = currentTerm ?? null;

  const rowsMount = el('div');
  const certMount = el('div', { class: 'cert', id: 'print-record' });

  function paint() {
    const range = selected ? { fromIso: selected.startsAt, toIso: selected.endsAt } : {};
    const rows = sessionLog(tutor.id, data, range);
    const totals = hourBreakdown(tutor.id, data, range);

    rowsMount.replaceChildren(
      breakdown(totals),
      rows.length ? sessionTable(rows, tutor, locale) : emptyTable()
    );
    certMount.replaceChildren(...certificate(tutor, data, rows, totals, selected, nowIso, locale));
  }

  container.append(
    viewHead(t('tutor.hours.title'), t('tutor.hours.lede')),

    el('div', { class: 'grid grid--two' },
      headline(currentTerm ? currentTerm.label : t('tutor.hours.thisTerm'),
        currentTerm ? currentTerm.totalLabel : '0'),
      headline(t('tutor.hours.allTime'), allTime.totalLabel)
    ),

    exportPanel({
      terms, selected, onSelect: (term) => { selected = term; paint(); },
      onCsv: () => {
        const range = selected ? { fromIso: selected.startsAt, toIso: selected.endsAt } : {};
        const name = downloadCsv(tutor, data, range, selected, locale);
        toast(t('toast.exported', { name }));
      }
    }),

    rowsMount,
    certMount
  );

  paint();
}

/* ------------------------------------------------------------------ */

function headline(label, hours) {
  return el('div', { class: 'card stat stat--hours' },
    el('span', { class: 'stat__value tnum' },
      hours,
      el('span', { class: 'stat__unit', text: t('tutor.hours.hoursShort') })
    ),
    el('span', { class: 'stat__label', text: label })
  );
}

function breakdown(totals) {
  return el('section', { class: 'card breakdown' },
    el('h2', { class: 'card__title', text: t('tutor.hours.total') }),
    el('div', { class: 'breakdown__grid' },
      part(t('tutor.hours.teaching'), totals.teachingHours),
      part(t('tutor.hours.prep'), totals.prepHours),
      part(t('tutor.hours.followup'), totals.followupHours),
      part(t('tutor.hours.total'), totals.totalHours, true)
    ),
    el('p', { class: 'small faint' },
      `${t('tutor.hours.sessions')}: ${totals.sessionCount} · `,
      `${t('tutor.hours.students')}: ${totals.studentIds.length}`
    )
  );
}

function part(label, hours, strong = false) {
  return el('div', { class: `breakdown__part${strong ? ' is-total' : ''}` },
    el('span', { class: 'breakdown__value tnum', text: formatHours(hours) }),
    el('span', { class: 'breakdown__label', text: label })
  );
}

/* ------------------------------------------------------------------ *
 * Export
 * ------------------------------------------------------------------ */

function exportPanel({ terms, selected, onSelect, onCsv }) {
  const options = [{ id: '', label: t('tutor.hours.export.allTime'), term: null },
    ...terms.map((term) => ({ id: term.id, label: term.label, term }))];

  const select = el('select', {
    class: 'period-select',
    'aria-label': t('tutor.hours.export.term'),
    onChange: (e) => onSelect(options.find((o) => o.id === e.target.value)?.term ?? null)
  }, options.map((o) => el('option', {
    value: o.id, text: o.label, selected: (selected?.id ?? '') === o.id
  })));

  return el('section', { class: 'card export-panel' },
    el('h2', { class: 'card__title', text: t('tutor.hours.export.title') }),
    el('p', { class: 'muted', text: t('tutor.hours.export.body') }),
    el('div', { class: 'row export-panel__actions' },
      select,
      button(t('tutor.hours.export.print'), { variant: 'primary', onClick: () => window.print() }),
      button(t('tutor.hours.export.csv'), { onClick: onCsv })
    )
  );
}

function downloadCsv(tutor, data, range, selected, locale) {
  const rows = sessionLog(tutor.id, data, range).map((row) => ({
    date: dateKeyInZone(row.session.scheduledAt, tutor.timezone),
    localTime: formatInZone(row.session.scheduledAt, tutor.timezone, { locale: 'en-US' }),
    student: row.studentName,
    teachingMinutes: row.teachingMinutes,
    prepMinutes: row.prepMinutes,
    followupMinutes: row.followupMinutes,
    totalMinutes: row.minutes,
    totalHours: formatHours(toRoundedHours(row.minutes)),
    covered: row.session.covered ?? '',
    homework: row.session.homework ?? ''
  }));

  const header = ['date', 'localTime', 'student', 'teachingMinutes', 'prepMinutes',
    'followupMinutes', 'totalMinutes', 'totalHours', 'covered', 'homework'];

  const slug = (tutor.preferredName || tutor.name || 'volunteer')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const period = selected ? `-${selected.id}` : '-all-time';
  const filename = `${slug}-hours${period}.csv`;

  const blob = new Blob([objectsToCsv(header, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename, rel: 'noopener' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return filename;
}

/* ------------------------------------------------------------------ *
 * The on-screen table
 * ------------------------------------------------------------------ */

function sessionTable(rows, tutor, locale) {
  return el('section', { class: 'card' },
    el('h2', { class: 'card__title', text: t('tutor.hours.tableTitle') }),
    el('div', { class: 'table-wrap' },
      el('table', {},
        el('thead', {}, el('tr', {},
          el('th', { text: t('tutor.hours.date') }),
          el('th', { text: t('tutor.hours.student') }),
          el('th', { text: t('tutor.hours.duration') }),
          el('th', { text: t('tutor.hours.prep') }),
          el('th', { text: t('tutor.hours.followup') }),
          el('th', { text: t('tutor.hours.total') })
        )),
        el('tbody', {}, rows.map((row) =>
          el('tr', {},
            el('td', { text: formatInZone(row.session.scheduledAt, tutor.timezone, { locale, date: true, weekday: true }) }),
            el('td', { text: row.studentName }),
            el('td', { class: 'tnum', text: String(row.teachingMinutes) }),
            el('td', { class: 'tnum', text: String(row.prepMinutes) }),
            el('td', { class: 'tnum', text: String(row.followupMinutes) }),
            el('td', { class: 'tnum', text: formatHours(toRoundedHours(row.minutes)) })
          )
        ))
      )
    )
  );
}

function emptyTable() {
  return el('section', { class: 'empty' },
    el('p', { text: t('tutor.hours.empty') })
  );
}

/* ------------------------------------------------------------------ *
 * The printable record
 *
 * Hidden on screen, revealed by css/print.css. Everything a verifier needs is
 * on the page: who did it, for whom, what it was, over what dates, the totals
 * broken down, the sessions behind them, and somewhere to sign.
 * ------------------------------------------------------------------ */

function certificate(tutor, data, rows, totals, selected, nowIso, locale) {
  const zone = tutor.timezone;
  const periodLabel = selected
    ? `${selected.label} (${dateKeyInZone(selected.startsAt, zone)} – ${dateKeyInZone(selected.endsAt, zone)})`
    : totals.firstSessionIso
      ? `${dateKeyInZone(totals.firstSessionIso, zone)} – ${dateKeyInZone(totals.lastSessionIso, zone)}`
      : t('tutor.hours.export.allTime');

  return [
    el('header', { class: 'cert__head' },
      el('h1', { class: 'cert__title', text: t('tutor.cert.title') }),
      el('p', { class: 'cert__org', text: data.program.name })
    ),

    el('dl', { class: 'cert__facts' },
      fact(t('tutor.cert.volunteer'), tutor.name || tutor.preferredName),
      tutor.school ? fact(t('tutor.cert.school'), tutor.school) : null,
      fact(t('tutor.cert.organisation'), data.program.name),
      fact(t('tutor.cert.period'), periodLabel),
      fact(t('tutor.cert.generated'), formatInZone(nowIso, zone, { locale: 'en-US', date: true })),
      fact(t('tutor.cert.activity'), t('tutor.cert.activityBody'))
    ),

    el('section', { class: 'cert__section' },
      el('h2', { text: t('tutor.cert.summary') }),
      el('table', { class: 'cert__summary' },
        el('tbody', {},
          summaryRow(t('tutor.hours.teaching'), totals.teachingHours),
          summaryRow(t('tutor.hours.prep'), totals.prepHours),
          summaryRow(t('tutor.hours.followup'), totals.followupHours),
          summaryRow(t('tutor.hours.total'), totals.totalHours, true)
        )
      ),
      el('p', { class: 'cert__note' },
        `${t('tutor.hours.sessions')}: ${totals.sessionCount} · ${t('tutor.hours.students')}: ${totals.studentIds.length}`
      )
    ),

    rows.length
      ? el('section', { class: 'cert__section' },
          el('h2', { text: t('tutor.cert.detail') }),
          el('table', { class: 'cert__table' },
            el('thead', {}, el('tr', {},
              el('th', { text: t('tutor.hours.date') }),
              el('th', { text: t('tutor.hours.student') }),
              el('th', { text: t('tutor.hours.teaching') }),
              el('th', { text: t('tutor.hours.prep') }),
              el('th', { text: t('tutor.hours.followup') }),
              el('th', { text: t('tutor.hours.total') })
            )),
            el('tbody', {}, rows.map((row) => el('tr', {},
              el('td', { text: dateKeyInZone(row.session.scheduledAt, zone) }),
              el('td', { text: row.studentName }),
              el('td', { class: 'tnum', text: String(row.teachingMinutes) }),
              el('td', { class: 'tnum', text: String(row.prepMinutes) }),
              el('td', { class: 'tnum', text: String(row.followupMinutes) }),
              el('td', { class: 'tnum', text: formatHours(toRoundedHours(row.minutes)) })
            )))
          )
        )
      : null,

    el('section', { class: 'cert__section cert__verify' },
      el('h2', { text: t('tutor.cert.verify') }),
      el('p', { text: t('tutor.cert.verifyBody') }),
      el('div', { class: 'cert__signatures' },
        signatureLine(t('tutor.cert.supervisor')),
        signatureLine(t('tutor.cert.signature')),
        signatureLine(t('tutor.cert.date'))
      )
    ),

    el('p', { class: 'cert__footnote', text: t('tutor.cert.note') })
  ];
}

function fact(label, value) {
  const frag = document.createDocumentFragment();
  frag.append(el('dt', { text: label }), el('dd', { text: String(value ?? '') }));
  return frag;
}

function summaryRow(label, hours, strong = false) {
  return el('tr', { class: strong ? 'is-total' : '' },
    el('th', { scope: 'row', text: label }),
    el('td', { class: 'tnum', text: `${formatHours(hours)} ${t('tutor.hours.hoursShort')}` })
  );
}

function signatureLine(label) {
  return el('div', { class: 'cert__sig' },
    el('div', { class: 'cert__sig-rule' }),
    el('span', { class: 'cert__sig-label', text: label })
  );
}
