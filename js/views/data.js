/**
 * data.js — export, import, sample data, spreadsheets, reset.
 *
 * The most important screen in the app. Principle 7: everything exports, so
 * the program survives any individual leaving. Everything else is a view over
 * data; this is where the data comes in and goes out.
 */

import { el, viewHead, button, toast, clear } from '../dom.js';
import { t, getLocale } from '../i18n.js';
import { formatInZone } from '../time.js';

export function render(container, { store }) {
  const data = store.getState();

  container.append(
    viewHead(t('data.title'), t('data.lede')),
    exportPanel(store, data),
    importPanel(store),
    samplePanel(store),
    csvPanel(store),
    statusPanel(store, data),
    resetPanel(store)
  );
}

/* ------------------------------------------------------------------ */

function panel(titleKey, bodyKey, ...children) {
  return el('section', { class: 'card data-panel' },
    el('h2', { class: 'card__title', text: t(titleKey) }),
    el('div', { class: 'data-panel__body' },
      el('p', { class: 'muted', text: t(bodyKey) }),
      ...children
    )
  );
}

function exportPanel(store, data) {
  const preview = el('pre', { class: 'json-peek' },
    el('code', { text: previewOf(store, data) })
  );

  return panel('data.export.title', 'data.export.body',
    el('div', { class: 'row' },
      button(t('data.export.action'), {
        variant: 'primary',
        onClick: () => toast(t('toast.exported', { name: store.exportJson() }))
      }),
      el('span', { class: 'small faint', text: store.suggestedFilename(data) })
    ),
    el('details', {},
      el('summary', { class: 'small muted', text: t('data.peek') }),
      preview
    )
  );
}

/** First lines of the real export, so the download is not a leap of faith. */
function previewOf(store, data) {
  const json = store.toJson(data);
  const lines = json.split('\n');
  if (lines.length <= 40) return json;
  return `${lines.slice(0, 40).join('\n')}\n  … ${lines.length - 40} more lines`;
}

function importPanel(store) {
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
      const count =
        result.data.people.length + result.data.pairings.length +
        result.data.sessions.length + result.data.availability.length;

      toast(t('toast.imported', { count }));
      report.append(importReport(result));
    } catch (err) {
      toast(err.message.split('\n')[0], 'error');
      report.append(problemList(err.message));
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

  return panel('data.import.title', 'data.import.body', drop, report);
}

/**
 * A rejected import explains itself in full. The message is multi-line by
 * design — one bullet per problem — because "that file is malformed" is not
 * something a coordinator can act on.
 */
function problemList(message) {
  const lines = message.split('\n').filter(Boolean);
  return el('div', { class: 'stack--sm' },
    lines.map((line, i) =>
      el('p', {
        class: i === 0 ? 'small' : 'small muted',
        style: i === 0 ? 'color:#8a1c1c' : null,
        text: line
      })
    )
  );
}

/** Migrations and soft warnings, surfaced rather than swallowed. */
function importReport({ migrated, warnings }) {
  const rows = [];

  if (migrated.length) {
    rows.push(el('p', { class: 'small' },
      el('span', {
        class: 'badge badge--accent',
        text: t('toast.migrated', { from: migrated[0], to: 2 })
      })
    ));
  }

  for (const message of warnings ?? []) {
    rows.push(el('p', { class: 'small muted', text: message }));
  }

  if (!rows.length) {
    rows.push(el('p', { class: 'small' },
      el('span', { class: 'badge badge--good', text: 'OK' }), ' ',
      'No problems found.'
    ));
  }

  return el('div', { class: 'stack--sm' }, rows);
}

function samplePanel(store) {
  const load = button(t('data.sample.action'), {
    onClick: async () => {
      load.disabled = true;
      try {
        await store.loadSampleData();
        toast(t('toast.sampleLoaded'));
      } catch (err) {
        toast(err.message.split('\n')[0], 'error');
      } finally {
        load.disabled = false;
      }
    }
  });

  return panel('data.sample.title', 'data.sample.body', el('div', { class: 'row' }, load));
}

/**
 * Spreadsheet in, spreadsheet out. A roster arrives as a CSV far more often
 * than as JSON, and a coordinator who wants to sort by availability in Excel
 * should be able to.
 */
function csvPanel(store) {
  const select = el('select', { 'aria-label': t('data.csv.table') },
    store.CSV_TYPES.map((type) => el('option', { value: type, text: type }))
  );

  const input = el('input', { type: 'file', accept: 'text/csv,.csv' });
  const report = el('div', { class: 'stack--sm' });

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    clear(report);
    try {
      const result = await store.importCsv(file, select.value);
      toast(t('toast.csvImported', { added: result.added, updated: result.updated }));
      report.append(importReport({ migrated: [], warnings: result.warnings }));
    } catch (err) {
      toast(err.message.split('\n')[0], 'error');
      report.append(problemList(err.message));
    } finally {
      input.value = '';
    }
  });

  return panel('data.csv.title', 'data.csv.body',
    el('div', { class: 'row' },
      select,
      button(t('data.csv.export'), {
        onClick: () => toast(t('toast.exported', { name: store.exportCsv(select.value) }))
      }),
      el('label', { class: 'btn' },
        t('data.csv.import'),
        input
      )
    ),
    el('p', { class: 'field__hint', text: t('data.csv.importHint') }),
    report
  );
}

function statusPanel(store, data) {
  const locale = getLocale();
  const counts = store.summary(data);
  const total =
    data.people.length + data.pairings.length + data.sessions.length + data.availability.length;

  return el('section', { class: 'card data-panel' },
    el('h2', { class: 'card__title', text: t('data.status.title') }),
    el('dl', { class: 'kv' },
      row(t('nav.tutors'), counts.tutors),
      row(t('nav.students'), counts.students),
      row(t('data.status.pairings'), `${counts.activePairings} / ${data.pairings.length}`),
      row(t('nav.sessions'), `${counts.sessionsOccurred} / ${counts.sessions}`),
      row(t('data.status.availability'), data.availability.length),
      row(t('data.status.unpaired'), counts.unpairedStudents),
      row(t('data.status.capacity'), counts.tutorsWithCapacity),
      row(t('data.status.schema'), String(data.version)),
      row(t('data.status.cache'), `${(store.cacheSizeBytes() / 1024).toFixed(1)} KB`),
      row(
        t('data.status.exported'),
        data.exportedAt
          ? formatInZone(data.exportedAt, data.program.adminTimeZone, { locale, date: true })
          : t('data.status.never')
      )
    ),
    el('p', { class: 'small faint', text: `${total} ${t('count.records')}` })
  );
}

/** A fragment, so dt/dd stay direct children of the grid. */
function row(label, value) {
  const frag = document.createDocumentFragment();
  frag.append(el('dt', { text: label }), el('dd', { text: String(value) }));
  return frag;
}

function resetPanel(store) {
  return el('section', { class: 'card data-panel danger-zone' },
    el('h2', { class: 'card__title', text: t('data.reset.title') }),
    el('div', { class: 'data-panel__body' },
      el('p', { class: 'muted', text: t('data.reset.body') }),
      el('div', { class: 'row' },
        button(t('data.reset.action'), {
          variant: 'danger',
          onClick: () => {
            if (!confirm(t('data.reset.confirm'))) return;
            store.reset();
            toast(t('toast.cleared'));
          }
        })
      )
    )
  );
}
