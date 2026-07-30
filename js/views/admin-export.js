/**
 * admin-export.js — continuity.
 *
 * Principle 7, and the reason this screen is not an afterthought: the program
 * has to survive any individual leaving, including whoever built this. One
 * JSON file restores everything, on any machine, with no account and no
 * server anybody has to keep paying for. Handing the program on is sending
 * that file and this URL.
 *
 * Spreadsheets are offered alongside because a coordinator will want the
 * numbers in Excel, and refusing them would push the real record back into a
 * spreadsheet somebody keeps privately.
 */

import { el, viewHead, button, toast, clear, withBusy } from '../dom.js';
import { t, getLocale } from '../i18n.js';
import { stampInZone } from '../time.js';
import { objectsToCsv } from '../csv.js';
import {
  hoursByTutorRows, HOURS_BY_TUTOR_COLUMNS,
  sessionReportRows, SESSION_REPORT_COLUMNS,
  programCounts
} from '../admin.js';

export function render(container, { store, nowIso }) {
  const data = store.getState();

  container.append(
    viewHead(t('admin.exp.title'), t('admin.exp.lede')),
    backupPanel(store, data),
    reportsPanel(store, data),
    restorePanel(store),
    statusPanel(store, data, nowIso),
    handoverPanel(),
    dangerPanel(store)
  );
}

/* ------------------------------------------------------------------ *
 * The backup that matters
 * ------------------------------------------------------------------ */

function backupPanel(store, data) {
  return el('section', { class: 'card export-panel is-primary' },
    el('h2', { class: 'card__title', text: t('admin.exp.backup.title') }),
    el('p', { class: 'muted', text: t('admin.exp.backup.body') }),
    el('div', { class: 'row' },
      button(t('admin.exp.backup.action'), {
        variant: 'primary',
        onClick: () => toast(t('toast.exported', { name: store.exportJson() }))
      }),
      el('span', { class: 'small faint', text: store.suggestedFilename(data) })
    )
  );
}

/* ------------------------------------------------------------------ *
 * Spreadsheets
 * ------------------------------------------------------------------ */

function reportsPanel(store, data) {
  /* The round-trippable tables come from the store; the two reports are
   * derived and deliberately export-only — importing hours would mean typing
   * them in by hand, which is exactly what this program does not do. */
  const tables = [
    ['tutors', t('admin.exp.tutors')],
    ['students', t('admin.exp.students')],
    ['availability', t('admin.exp.availability')],
    ['pairings', t('admin.exp.pairings')],
    ['sessions', t('admin.exp.sessions')]
  ];

  return el('section', { class: 'card export-panel' },
    el('h2', { class: 'card__title', text: t('admin.exp.reports.title') }),
    el('p', { class: 'muted', text: t('admin.exp.reports.body') }),

    el('div', { class: 'export-grid' },
      tables.map(([type, label]) =>
        button(label, { onClick: () => toast(t('toast.exported', { name: store.exportCsv(type) })) })
      ),

      button(`${t('admin.exp.hoursByTutor')} · ${t('admin.exp.exportOnly')}`, {
        onClick: () => {
          const name = downloadCsv(store, data, 'hours-by-tutor',
            HOURS_BY_TUTOR_COLUMNS, hoursByTutorRows(data));
          toast(t('toast.exported', { name }));
        }
      }),

      button(`${t('admin.exp.sessions')} (${t('admin.exp.exportOnly')})`, {
        onClick: () => {
          const name = downloadCsv(store, data, 'session-report',
            SESSION_REPORT_COLUMNS, sessionReportRows(data));
          toast(t('toast.exported', { name }));
        }
      })
    )
  );
}

/** Download a derived report. Named apart from the table exports on purpose. */
function downloadCsv(store, data, slug, columns, rows) {
  const filename = store.suggestedFilename(data, 'csv').replace(/\.csv$/, `-${slug}.csv`);
  const blob = new Blob([objectsToCsv(columns, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename, rel: 'noopener' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return filename;
}

/* ------------------------------------------------------------------ *
 * Restore
 * ------------------------------------------------------------------ */

function restorePanel(store) {
  const input = el('input', { type: 'file', accept: 'application/json,.json' });
  const report = el('div', { class: 'stack--sm' });

  const drop = el('label', { class: 'file-drop' },
    el('span', { text: t('data.import.drop') }),
    input
  );

  async function ingest(file) {
    if (!file) return;
    clear(report);
    try {
      const result = await store.importJson(file);
      const count = result.data.people.length + result.data.pairings.length +
        result.data.sessions.length + result.data.availability.length;
      toast(t('toast.imported', { count }));
      for (const warning of result.warnings ?? []) {
        report.append(el('p', { class: 'small muted', text: warning }));
      }
      if (result.migrated.length) {
        report.append(el('p', { class: 'small' },
          el('span', { class: 'badge badge--accent',
            text: t('toast.migrated', { from: result.migrated[0], to: store.SCHEMA_VERSION }) })));
      }
    } catch (err) {
      toast(err.message.split('\n')[0], 'error');
      for (const [i, line] of err.message.split('\n').entries()) {
        report.append(el('p', {
          class: i === 0 ? 'small is-error' : 'small muted',
          text: line
        }));
      }
    } finally {
      input.value = '';
    }
  }

  input.addEventListener('change', () => ingest(input.files?.[0]));
  for (const type of ['dragenter', 'dragover']) {
    drop.addEventListener(type, (e) => { e.preventDefault(); drop.dataset.drag = 'true'; });
  }
  for (const type of ['dragleave', 'drop']) {
    drop.addEventListener(type, (e) => { e.preventDefault(); drop.dataset.drag = 'false'; });
  }
  drop.addEventListener('drop', (e) => ingest(e.dataTransfer?.files?.[0]));

  return el('section', { class: 'card export-panel' },
    el('h2', { class: 'card__title', text: t('admin.exp.restore.title') }),
    el('p', { class: 'muted', text: t('admin.exp.restore.body') }),
    drop,
    report
  );
}

/* ------------------------------------------------------------------ */

function statusPanel(store, data, nowIso) {
  const locale = getLocale();
  const counts = programCounts(data);

  return el('section', { class: 'card' },
    el('h2', { class: 'card__title', text: t('data.status.title') }),
    el('dl', { class: 'kv' },
      row(t('nav.tutors'), counts.tutors),
      row(t('nav.students'), counts.students),
      row(t('data.status.pairings'), `${counts.activePairings} / ${data.pairings.length}`),
      row(t('nav.sessions'), `${counts.sessionsHeld} / ${data.sessions.length}`),
      row(t('data.status.availability'), data.availability.length),
      row(t('data.status.schema'), String(data.version)),
      row(t('data.status.cache'), `${(store.cacheSizeBytes() / 1024).toFixed(1)} KB`),
      row(t('data.status.exported'), data.exportedAt
        ? stampInZone(data.exportedAt, data.program.adminTimeZone, { locale, time: true })
        : t('data.status.never'))
    )
  );
}

function row(label, value) {
  const frag = document.createDocumentFragment();
  frag.append(el('dt', { text: label }), el('dd', { text: String(value) }));
  return frag;
}

function handoverPanel() {
  return el('section', { class: 'card export-panel is-handover' },
    el('h2', { class: 'card__title', text: t('admin.exp.handover.title') }),
    el('p', { class: 'muted', text: t('admin.exp.handover.body') })
  );
}

function dangerPanel(store) {
  const load = button(t('data.sample.action'), {
    onClick: () => withBusy(load, {
      busyLabel: t('busy.loading'),
      run: async () => {
        await store.loadSampleData();
        toast(t('toast.sampleLoaded'));
      }
    })
  });

  return el('section', { class: 'card danger-zone' },
    el('h2', { class: 'card__title', text: t('data.reset.title') }),
    el('p', { class: 'muted', text: t('data.reset.body') }),
    el('div', { class: 'row' },
      load,
      button(t('data.reset.action'), {
        variant: 'danger',
        onClick: () => {
          if (!confirm(t('data.reset.confirm'))) return;
          store.reset();
          toast(t('toast.cleared'));
        }
      })
    )
  );
}
