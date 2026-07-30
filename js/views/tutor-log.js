/**
 * tutor-log.js — logging a session.
 *
 * The most important interaction in the app, and the one with a hard budget:
 * under twenty seconds, on a phone, thumb only, without scrolling
 * (principle 4). That drives every decision here.
 *
 *   - Everything is a chip. No dropdowns, no steppers, no time pickers.
 *   - Every value is pre-filled from the scheduled session, so the common
 *     case — it happened, for the usual hour — is one tap on Save.
 *   - "No" collapses the rest of the form, because a class that did not
 *     happen has nothing to fill in and nothing to answer for (principle 3).
 *   - The text fields sit last so the on-screen keyboard covers nothing that
 *     still needs tapping.
 *   - Save writes immediately and returns to the dashboard. No confirm step.
 *
 * **The form does not ask how long anything took.** Every class that happened
 * is credited a flat two hours (`SESSION_CREDIT_MINUTES`), so a question about
 * minutes would change nothing and principle 2 forbids collecting data for its
 * own sake. What is left is the only thing that varies — did it happen, what
 * did you cover, what is the homework — which is also the only thing the
 * student and the next tutor actually need.
 *
 * That takes logging from four taps to one, plus whatever the tutor chooses
 * to type.
 */

import { el, viewHead, button, toast } from '../dom.js';
import { t, getLocale } from '../i18n.js';
import { formatDual, stampInZone } from '../time.js';
import { lastHeldSession, nextClassFor } from '../tutor.js';

export function render(container, { store, tutor, params, query, navigate, nowIso }) {
  const data = store.getState();
  const pairing = data.pairings.find((p) => p.id === params.pairingId);

  if (!pairing || pairing.tutorId !== tutor.id) {
    container.append(el('section', { class: 'empty' },
      el('h2', { text: t('tutor.student.notYours') }),
      el('a', { class: 'btn btn--primary', href: '#/tutor', text: t('role.needTutor.action') })
    ));
    return;
  }

  const student = data.people.find((p) => p.id === pairing.studentId);
  const target = resolveTarget(pairing, query, data, nowIso);
  const locale = getLocale();

  /* The working copy. Nothing is written until Save. */
  const form = {
    occurred: true,
    covered: target.session?.covered ?? '',
    homework: target.session?.homework ?? ''
  };

  const totalLine = el('p', { class: 'log-total small' });
  const details = el('div', { class: 'log-details' });

  function refresh() {
    // What this save is worth. Constant when it happened, nothing when it did
    // not — and saying so here means a tutor never wonders whether a short
    // class shortchanged them.
    totalLine.replaceChildren(el('span', {
      text: form.occurred ? t('tutor.log.credits') : t('tutor.log.creditsNone')
    }));
    details.dataset.hidden = form.occurred ? 'false' : 'true';
  }

  const save = button(t('tutor.log.save'), {
    variant: 'primary',
    onClick: () => {
      store.logSession({
        id: target.session?.id,
        pairingId: pairing.id,
        scheduledAt: target.scheduledAt,
        occurred: form.occurred,
        covered: form.covered.trim(),
        homework: form.homework.trim()
      });
      toast(t('tutor.log.saved'));
      navigate('/tutor');
    }
  });
  save.classList.add('btn--block', 'log-save');

  container.append(
    header(student, target, tutor, locale),

    el('form', {
      class: 'log-form',
      onSubmit: (e) => { e.preventDefault(); save.click(); }
    },
      chipGroup(t('tutor.log.happened'), [
        { value: true, label: t('tutor.log.yes') },
        { value: false, label: t('tutor.log.no') }
      ], () => form.occurred, (v) => { form.occurred = v; refresh(); }, 'log-chips--yesno'),

      details,
      totalLine,
      save
    )
  );

  details.append(
    textLine(t('tutor.log.covered'), form.covered, (v) => { form.covered = v; },
      target.lastSession?.covered
        ? t('tutor.log.lastTime', { text: target.lastSession.covered })
        : t('tutor.log.coveredHint')),

    textLine(`${t('tutor.log.homework')} · ${t('tutor.log.optional')}`, form.homework,
      (v) => { form.homework = v; })
  );

  refresh();
}

/* ------------------------------------------------------------------ */

function header(student, target, tutor, locale) {
  const dual = formatDual(target.scheduledAt, tutor.timezone, student.timezone, { locale });

  return el('div', { class: 'log-head' },
    el('a', { class: 'log-head__back', href: '#/tutor', text: '←' }),
    el('div', {},
      el('h1', { class: 'log-head__title', text: t('tutor.log.title') }),
      el('p', { class: 'log-head__sub small muted' },
        t('tutor.log.with', { name: student.preferredName || student.name }),
        ' · ',
        stampInZone(target.scheduledAt, tutor.timezone, { locale, weekday: true })
      )
    )
  );
}

/**
 * A row of chips. Each is a real button with aria-pressed, so it works with a
 * keyboard and a screen reader as well as a thumb.
 *
 * Each chip carries an explicit aria-label combining its group and its value.
 * The visible text has to stay short enough for a thumb — "30", "None" — but
 * those labels repeat across groups, and reading the accessibility tree showed
 * a screen reader announcing "button 30 … button 30" for two entirely
 * different questions. The group's own label is not reliably announced with
 * each button, so each button says what it means.
 */
function chipGroup(label, options, get, set, extraClass = '') {
  const row = el('div', { class: `log-chips ${extraClass}`, role: 'group', 'aria-label': label });

  const chips = options.map((option) => {
    const chip = el('button', {
      type: 'button',
      class: 'chip',
      text: option.label,
      'aria-label': `${label} ${option.spoken ?? option.label}`,
      'aria-pressed': String(get() === option.value),
      onClick: () => {
        set(option.value);
        for (const c of chips) c.setAttribute('aria-pressed', String(c === chip));
      }
    });
    return chip;
  });

  row.append(...chips);

  return el('div', { class: 'log-field' },
    el('span', { class: 'log-field__label', text: label }),
    row
  );
}

let fieldSeq = 0;

/**
 * A single-line field.
 *
 * The label is associated by id rather than only by wrapping, and the hint
 * sits in its own element referenced by aria-describedby. Putting last
 * session's notes in the placeholder — as this did — makes the field read as
 * though it already has a value, and a placeholder is never a substitute for
 * a label.
 */
function textLine(label, value, set, hint) {
  const id = `log-field-${++fieldSeq}`;
  const hintId = hint ? `${id}-hint` : null;

  const input = el('input', {
    id,
    type: 'text',
    class: 'log-input',
    value,
    enterkeyhint: 'done',
    autocomplete: 'off',
    'aria-describedby': hintId,
    onInput: (e) => set(e.target.value)
  });

  return el('div', { class: 'log-field' },
    el('label', { class: 'log-field__label', for: id, text: label }),
    input,
    hint ? el('span', { class: 'log-field__hint', id: hintId, text: hint }) : null
  );
}

/**
 * Which session is being logged.
 *
 * Prefers an explicit `?session=`, then the oldest unlogged class that has
 * already happened, then the pairing's most recent shared window. The tutor
 * should almost never have to think about which class this is.
 */
function resolveTarget(pairing, query, data, nowIso) {
  const lastSession = lastHeldSession(pairing.id, data.sessions, nowIso);

  const requested = query?.get?.('session');
  if (requested) {
    const session = data.sessions.find((s) => s.id === requested && s.pairingId === pairing.id);
    if (session) return { session, scheduledAt: session.scheduledAt, lastSession };
  }

  const unlogged = data.sessions
    .filter((s) => s.pairingId === pairing.id && s.loggedAt == null && s.scheduledAt <= nowIso)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  if (unlogged) return { session: unlogged, scheduledAt: unlogged.scheduledAt, lastSession };

  // Nothing outstanding: this is a class being logged as it finishes. Use the
  // shared window it would have fallen in, so the timestamp is the class time
  // rather than whenever the tutor got round to opening the app.
  const next = nextClassFor(pairing, data, { asOfIso: nowIso });
  const scheduledAt = next?.source === 'recurring' && next.startUtc > nowIso
    ? previousWeek(next.startUtc, nowIso)
    : nowIso;

  return { session: null, scheduledAt, lastSession };
}

/** The same weekly slot, one week earlier — but never in the future. */
function previousWeek(iso, nowIso) {
  const candidate = new Date(Date.parse(iso) - 7 * 86400000).toISOString();
  return candidate <= nowIso ? candidate : nowIso;
}
