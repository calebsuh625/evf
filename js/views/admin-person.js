/**
 * admin-person.js — one person, editable, with their full history.
 *
 * Every field is optional. A record with only a name is valid and the Save
 * button works on it: a coordinator adding twelve people from a signup sheet
 * should not have to invent data to get past validation, and a student is
 * never blocked on a field somebody forgot to collect (principle 5).
 *
 * Removing somebody is refused when they have logged sessions, because those
 * are volunteer hours a real person earned. The store raises that, and this
 * screen offers marking them inactive instead — which preserves the history
 * and takes them off every active list.
 */

import { el, button, toast, linkButton, clear } from '../dom.js';
import { t, getLocale } from '../i18n.js';
import { formatInZone, dateKeyInZone } from '../time.js';
import { personHistory } from '../admin.js';
import { toRoundedHours, formatHours } from '../hours.js';

export function render(container, { store, params, navigate }) {
  const data = store.getState();
  const person = data.people.find((p) => p.id === params.personId);

  if (!person) {
    container.append(el('section', { class: 'empty' },
      el('h2', { text: t('admin.person.notFound') }),
      el('div', { class: 'empty__actions' },
        linkButton(t('admin.person.back'), '#/admin/roster', 'primary'))
    ));
    return;
  }

  const locale = getLocale();
  const tz = data.program.adminTimeZone;
  const history = personHistory(person.id, data);

  container.append(
    el('div', { class: 'person-head' },
      el('a', { class: 'log-head__back', href: '#/admin/roster', text: '←' }),
      el('div', {},
        el('h1', { text: person.name || person.id }),
        el('p', { class: 'small muted', text:
          t('admin.person.totals', {
            sessions: history.totals.occurredCount,
            hours: formatHours(toRoundedHours(history.totals.volunteerMinutes))
          }) })
      ),
      el('div', { class: 'person-head__actions row' },
        button(person.active === false ? t('admin.person.activate') : t('admin.person.deactivate'), {
          onClick: () => {
            store.setPersonActive(person.id, person.active === false);
            toast(t('admin.person.saved'));
          }
        }),
        removeButton(person, store, navigate)
      )
    ),

    editor(person, store),
    historySection(history, data, person, tz, locale)
  );
}

/* ------------------------------------------------------------------ *
 * Editing
 * ------------------------------------------------------------------ */

const COMMON = [
  ['name', 'text'], ['preferredName', 'text'], ['email', 'email'],
  ['wechat', 'text'], ['timezone', 'text']
];
const TUTOR_FIELDS = [
  ['school', 'text'], ['grade', 'number'], ['maxStudents', 'number'],
  ['subjects', 'list'], ['levels', 'list'], ['interests', 'list'],
  ['meetingLink', 'text'], ['bio', 'textarea']
];
const STUDENT_FIELDS = [
  ['grade', 'number'], ['englishLevel', 'text'],
  ['goals', 'list'], ['interests', 'list']
];

/** `levels` is stored as levelsComfortable; everything else matches its key. */
function fieldKey(name) {
  return name === 'levels' ? 'levelsComfortable' : name;
}

function editor(person, store) {
  const draft = {};
  const fields = [...COMMON, ...(person.role === 'tutor' ? TUTOR_FIELDS : STUDENT_FIELDS)];

  const inputs = fields.map(([name, type]) => {
    const key = fieldKey(name);
    const current = person[key];
    const value = type === 'list'
      ? (Array.isArray(current) ? current.join('; ') : '')
      : current == null ? '' : String(current);

    draft[key] = value;

    const control = type === 'textarea'
      ? el('textarea', { rows: '2', value, onInput: (e) => { draft[key] = e.target.value; } })
      : el('input', {
          type: type === 'list' ? 'text' : type,
          value,
          autocomplete: 'off',
          onInput: (e) => { draft[key] = e.target.value; }
        });

    return el('label', { class: `person-field${type === 'textarea' ? ' is-wide' : ''}` },
      el('span', { class: 'person-field__label', text: t(`admin.person.field.${name}`) }),
      control,
      type === 'list' ? el('span', { class: 'field__hint', text: t('admin.person.listHint') }) : null
    );
  });

  return el('section', { class: 'card person-editor' },
    el('h2', { class: 'card__title', text: t('admin.person.details') }),
    el('div', { class: 'person-fields' }, inputs),
    el('div', { class: 'row' },
      button(t('admin.person.save'), {
        variant: 'primary',
        onClick: () => {
          store.updatePerson(person.id, coerce(draft, fields));
          toast(t('admin.person.saved'));
        }
      })
    )
  );
}

/** Turn the string draft back into the shapes the model expects. */
function coerce(draft, fields) {
  const patch = {};
  for (const [name, type] of fields) {
    const key = fieldKey(name);
    const raw = draft[key] ?? '';
    if (type === 'list') {
      patch[key] = String(raw).split(';').map((s) => s.trim()).filter(Boolean);
    } else if (type === 'number') {
      const trimmed = String(raw).trim();
      // Blank stays blank rather than becoming 0 — nobody is in grade zero.
      patch[key] = trimmed === '' ? null : (Number.isFinite(Number(trimmed)) ? Number(trimmed) : null);
    } else {
      patch[key] = String(raw).trim();
    }
  }
  return patch;
}

function removeButton(person, store, navigate) {
  return button(t('admin.person.remove'), {
    variant: 'danger',
    onClick: () => {
      if (!confirm(t('admin.person.removeConfirm', { name: person.name || person.id }))) return;
      try {
        store.removePerson(person.id);
        toast(t('admin.person.removed', { name: person.name || person.id }));
        navigate('/admin/roster');
      } catch (err) {
        // The store refuses when there are logged sessions. Say why, plainly.
        toast(`${t('admin.person.cannotRemove')}: ${err.message}`, 'error');
      }
    }
  });
}

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

function historySection(history, data, person, tz, locale) {
  const byId = new Map(data.people.map((p) => [p.id, p]));

  if (!history.pairings.length && !history.sessions.length) {
    return el('section', { class: 'card' },
      el('h2', { class: 'card__title', text: t('admin.person.history') }),
      el('p', { class: 'faint', text: t('admin.person.noHistory') })
    );
  }

  const other = (pairing) =>
    byId.get(pairing.tutorId === person.id ? pairing.studentId : pairing.tutorId);

  return el('section', { class: 'card' },
    el('h2', { class: 'card__title', text: t('admin.person.history') }),

    el('h3', { class: 'small', text: t('admin.person.pairings') }),
    el('ul', { class: 'plain-list' }, history.pairings.map((pairing) =>
      el('li', { class: 'small person-pairing' },
        el('span', { class: `badge ${pairing.status === 'active' ? 'badge--good' : ''}`,
          text: t(`admin.status.${pairing.status === 'active' ? 'paired' : 'inactive'}`) }),
        ' ',
        el('a', {
          href: `#/admin/roster/${encodeURIComponent(other(pairing)?.id ?? '')}`,
          text: other(pairing)?.name ?? '—'
        }),
        pairing.startedAt
          ? el('span', { class: 'faint', text: ` · ${dateKeyInZone(pairing.startedAt, tz)}` })
          : null
      )
    )),

    el('h3', { class: 'small', style: 'margin-top:16px', text: t('admin.person.sessions') }),
    el('ol', { class: 'history' }, history.sessions.slice(0, 40).map((session) =>
      el('li', { class: `history__item${session.occurred === true ? '' : ' is-missed'}` },
        el('div', { class: 'history__when' },
          el('span', { class: 'history__date', text: dateKeyInZone(session.scheduledAt, tz) })
        ),
        el('div', { class: 'history__body' },
          session.occurred === true
            ? el('p', { class: 'history__covered', text: session.covered || '—' })
            : el('p', { class: 'small faint', text: session.covered || t('tutor.student.didNotHappen') }),
          session.homework
            ? el('p', { class: 'small muted' },
                el('span', { class: 'history__tag', text: t('tutor.student.homework') }), ' ', session.homework)
            : null
        )
      )
    ))
  );
}
