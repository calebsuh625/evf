/**
 * data.js — export, import, sample data, reset.
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
        onClick: () => {
          const name = store.downloadJson();
          toast(t('toast.exported', { name }));
        }
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
      const text = await store.readFileAsText(file);
      const result = store.importJson(text);
      const count =
        result.data.tutors.length + result.data.students.length +
        result.data.matches.length + result.data.sessions.length;

      toast(t('toast.imported', { count }));
      report.append(integrityReport(result));
    } catch (err) {
      toast(err.message, 'error');
      report.append(el('p', { class: 'small', style: 'color:#8a1c1c', text: err.message }));
    } finally {
      input.value = '';
    }
  }

  input.addEventListener('change', () => ingest(input.files?.[0]));

  for (const type of ['dragenter', 'dragover']) {
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.dataset.drag = 'true';
    });
  }
  for (const type of ['dragleave', 'drop']) {
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.dataset.drag = 'false';
    });
  }
  drop.addEventListener('drop', (e) => ingest(e.dataTransfer?.files?.[0]));

  return panel('data.import.title', 'data.import.body', drop, report);
}

/**
 * Migrations and integrity findings, surfaced rather than swallowed. An
 * import that quietly fixed things is an import a coordinator cannot trust.
 */
function integrityReport({ migrated, integrity }) {
  const rows = [];

  if (migrated.length) {
    rows.push(el('p', { class: 'small' },
      el('span', { class: 'badge badge--accent', text: t('toast.migrated', { from: migrated[0], to: 1 }) })
    ));
  }

  for (const message of integrity.errors) {
    rows.push(el('p', { class: 'small' },
      el('span', { class: 'badge badge--warn', text: '!' }), ' ', message
    ));
  }
  for (const message of integrity.warnings) {
    rows.push(el('p', { class: 'small muted', text: message }));
  }

  if (!rows.length) {
    rows.push(el('p', { class: 'small' },
      el('span', { class: 'badge badge--good', text: 'OK' }), ' ',
      'No integrity problems found.'
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
        toast(err.message, 'error');
      } finally {
        load.disabled = false;
      }
    }
  });

  return panel('data.sample.title', 'data.sample.body', el('div', { class: 'row' }, load));
}

function statusPanel(store, data) {
  const locale = getLocale();
  const total =
    data.tutors.length + data.students.length + data.matches.length + data.sessions.length;

  return el('section', { class: 'card data-panel' },
    el('h2', { class: 'card__title', text: t('data.status.title') }),
    el('dl', { class: 'kv' },
      row(t('nav.tutors'), data.tutors.length),
      row(t('nav.students'), data.students.length),
      row(t('nav.matches'), data.matches.length),
      row(t('nav.sessions'), data.sessions.length),
      row(t('data.status.schema'), String(data.schemaVersion)),
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
            store.resetAll();
            toast(t('toast.cleared'));
          }
        })
      )
    )
  );
}
