/**
 * admin-roster.js — everyone in the program.
 *
 * Status is computed from pairings every time it is asked for, never stored.
 * A stored status is a field somebody has to remember to update, and it is
 * wrong the moment they forget.
 *
 * Adding a person asks for a name and nothing else. Everything else can be
 * filled in later, or never — a roster row with only a name is a valid roster
 * row, and refusing to create one would push a coordinator back to a
 * spreadsheet.
 */

import { el, viewHead, button, toast, clear, linkButton } from '../dom.js';
import { t } from '../i18n.js';
import { rosterRows, filterRoster } from '../admin.js';

const STATUSES = ['paired', 'unpaired', 'not-accepting', 'inactive'];

export function render(container, { store, navigate }) {
  const data = store.getState();
  const rows = rosterRows(data);

  const filters = { role: 'all', status: 'all', query: '' };
  const tableMount = el('div');
  const countLabel = el('span', { class: 'small faint' });

  function paint() {
    const shown = filterRoster(rows, filters);
    countLabel.textContent = t('admin.roster.showing', { shown: shown.length, total: rows.length });
    clear(tableMount);
    tableMount.append(shown.length ? table(shown) : el('p', { class: 'faint', text: t('admin.roster.none') }));
  }

  const search = el('input', {
    type: 'search',
    class: 'roster-search',
    placeholder: t('admin.roster.searchHint'),
    'aria-label': t('admin.roster.search'),
    autocomplete: 'off',
    onInput: (e) => { filters.query = e.target.value; paint(); }
  });

  const roleSelect = select(t('admin.roster.role'), [
    ['all', t('admin.roster.all')], ['tutor', t('nav.tutors')], ['student', t('nav.students')]
  ], (value) => { filters.role = value; paint(); });

  const statusSelect = select(t('admin.roster.status'), [
    ['all', t('admin.roster.all')],
    ...STATUSES.map((s) => [s, t(`admin.status.${s}`)])
  ], (value) => { filters.status = value; paint(); });

  container.append(
    viewHead(t('admin.roster.title'), t('admin.roster.lede')),

    el('section', { class: 'card roster-controls' },
      el('div', { class: 'roster-filters' }, search, roleSelect, statusSelect, countLabel),
      el('div', { class: 'row roster-actions' },
        addPersonControl('tutor', store, navigate),
        addPersonControl('student', store, navigate),
        csvImport(store)
      )
    ),

    tableMount,
    el('p', { class: 'small faint admin-computed', text: t('admin.computed') })
  );

  paint();
}

/* ------------------------------------------------------------------ */

function select(label, options, onChange) {
  return el('select', {
    class: 'roster-select', 'aria-label': label,
    onChange: (e) => onChange(e.target.value)
  }, options.map(([value, text]) => el('option', { value, text })));
}

function table(rows) {
  return el('div', { class: 'table-wrap' },
    el('table', { class: 'roster-table' },
      el('thead', {}, el('tr', {},
        el('th', { text: t('admin.roster.name') }),
        el('th', { text: t('admin.roster.role') }),
        el('th', { text: t('admin.roster.status') }),
        el('th', { text: t('admin.roster.pairings') }),
        el('th', { text: t('admin.roster.sessions') })
      )),
      el('tbody', {}, rows.map((row) =>
        el('tr', {},
          el('td', {},
            el('a', {
              href: `#/admin/roster/${encodeURIComponent(row.person.id)}`,
              text: row.person.preferredName || row.person.name || row.person.id
            })
          ),
          el('td', { text: row.role === 'tutor' ? t('nav.tutors') : t('nav.students') }),
          el('td', {}, el('span', {
            class: `badge ${row.status === 'paired' ? 'badge--good' : row.status === 'inactive' ? '' : 'badge--warn'}`,
            text: t(`admin.status.${row.status}`)
          })),
          el('td', { class: 'tnum', text: row.role === 'tutor'
            ? `${row.activePairings} / ${row.capacity}` : String(row.activePairings) }),
          el('td', { class: 'tnum', text: String(row.sessions) })
        )
      ))
    )
  );
}

/* ------------------------------------------------------------------ *
 * Adding somebody
 * ------------------------------------------------------------------ */

function addPersonControl(role, store, navigate) {
  const input = el('input', {
    type: 'text', class: 'roster-new__input',
    placeholder: t('admin.roster.newName'),
    'aria-label': t('admin.roster.newName'),
    autocomplete: 'off'
  });

  function create() {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    const person = store.addPerson(role, { name, preferredName: name.split(/\s+/)[0] });
    input.value = '';
    toast(t('admin.roster.added', { name }));
    navigate(`/admin/roster/${encodeURIComponent(person.id)}`);
  }

  const form = el('form', {
    class: 'roster-new',
    onSubmit: (e) => { e.preventDefault(); create(); }
  },
    el('span', { class: 'roster-new__label',
      text: role === 'tutor' ? t('admin.roster.addTutor') : t('admin.roster.addStudent') }),
    input,
    button(t('admin.roster.create'), { type: 'submit' })
  );

  return form;
}

/* ------------------------------------------------------------------ *
 * Bulk roster CSV
 * ------------------------------------------------------------------ */

function csvImport(store) {
  const input = el('input', { type: 'file', accept: 'text/csv,.csv' });
  const type = el('select', { class: 'roster-select', 'aria-label': t('admin.roster.importCsv') },
    el('option', { value: 'tutors', text: t('nav.tutors') }),
    el('option', { value: 'students', text: t('nav.students') })
  );

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = await store.importCsv(file, type.value);
      toast(t('admin.roster.imported', { added: result.added, updated: result.updated }));
    } catch (err) {
      toast(err.message.split('\n')[0], 'error');
    } finally {
      input.value = '';
    }
  });

  return el('div', { class: 'roster-import' },
    type,
    el('label', { class: 'btn' }, t('admin.roster.importCsv'), input),
    el('span', { class: 'field__hint', text: t('admin.roster.importHint') })
  );
}
