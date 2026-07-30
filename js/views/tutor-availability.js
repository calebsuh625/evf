/**
 * tutor-availability.js — when a tutor could take a new student.
 *
 * Deliberately framed as a recruiting tool, not a weekly obligation. A tutor
 * who is full, busy, or simply not looking should be able to say so in one
 * tap and stop thinking about this screen — so the toggle is the first thing
 * on it, and turning it off changes nothing else about their teaching
 * (principle 3: no screen here exists to hold anyone to a schedule).
 *
 * Every window is entered in the tutor's own clock and immediately echoed in
 * Beijing time, because "Saturday 18:00" means nothing to a tutor until they
 * can see it is Sunday morning for the student.
 */

import { el, viewHead, button, toast, linkButton } from '../dom.js';
import { t, getLocale } from '../i18n.js';
import { formatDual, weekAnchorUtcIso, slotToInterval, parseHhMm } from '../time.js';

/** Weekends first: this is a weekend program, and it is what people pick. */
const DAY_ORDER = [6, 0, 5, 1, 2, 3, 4];

export function render(container, { store, tutor, nowIso }) {
  const data = store.getState();
  const studentZone = data.program.studentTimeZone;
  const locale = getLocale();

  // Working copy; nothing is written until Save.
  let rows = store.availabilityFor(tutor.id, data).map((row) => ({ ...row }));
  const list = el('div', { class: 'avail-list' });

  function paint() {
    list.replaceChildren(
      ...(rows.length
        ? rows.map((row, index) => windowRow(row, index))
        : [el('p', { class: 'faint', text: t('tutor.avail.none') })])
    );
  }

  function windowRow(row, index) {
    const echo = el('span', { class: 'avail-row__echo small' });

    function refreshEcho() {
      echo.replaceChildren(...describeInBeijing(row, studentZone, nowIso, locale));
    }

    const day = el('select', {
      class: 'avail-row__day',
      'aria-label': t('tutor.avail.day'),
      onChange: (e) => { row.weekday = Number(e.target.value); refreshEcho(); }
    }, DAY_ORDER.map((d) => el('option', {
      value: String(d), text: t(`weekday.${d}`), selected: d === row.weekday
    })));

    const from = el('input', {
      type: 'time', class: 'avail-row__time', value: row.startTime,
      'aria-label': t('tutor.avail.from'),
      onInput: (e) => { row.startTime = e.target.value || '00:00'; refreshEcho(); }
    });

    const to = el('input', {
      type: 'time', class: 'avail-row__time', value: row.endTime,
      'aria-label': t('tutor.avail.to'),
      onInput: (e) => { row.endTime = e.target.value || '00:00'; refreshEcho(); }
    });

    const node = el('div', { class: 'avail-row' },
      el('div', { class: 'avail-row__controls' },
        day, from, el('span', { class: 'avail-row__dash', text: '–' }), to,
        button(t('tutor.avail.remove'), {
          variant: 'quiet', 'aria-label': t('tutor.avail.remove'),
          onClick: () => { rows.splice(index, 1); paint(); }
        })
      ),
      echo
    );

    refreshEcho();
    return node;
  }

  const toggle = el('button', {
    type: 'button',
    class: 'switch',
    role: 'switch',
    'aria-checked': String(tutor.acceptingStudents !== false),
    onClick: () => {
      const next = tutor.acceptingStudents === false;
      store.setAcceptingStudents(tutor.id, next);
    }
  },
    el('span', { class: 'switch__track' }, el('span', { class: 'switch__thumb' })),
    el('span', { class: 'switch__label', text: t('tutor.avail.accepting') })
  );

  container.append(
    viewHead(t('tutor.avail.title'), t('tutor.avail.lede')),

    el('section', { class: `card accepting ${tutor.acceptingStudents === false ? 'is-off' : 'is-on'}` },
      toggle,
      el('p', { class: 'small muted', text:
        tutor.acceptingStudents === false ? t('tutor.avail.acceptingOff') : t('tutor.avail.acceptingOn') })
    ),

    el('section', { class: 'card' },
      el('h2', { class: 'card__title', text: t('tutor.avail.windows') }),
      el('p', { class: 'small muted', text: t('tutor.avail.windowsBody') }),
      list,
      el('div', { class: 'row avail-actions' },
        button(t('tutor.avail.add'), {
          onClick: () => {
            rows.push({
              personId: tutor.id, weekday: 6,
              startTime: '09:00', endTime: '11:00', timezone: tutor.timezone
            });
            paint();
          }
        }),
        button(t('tutor.avail.save'), {
          variant: 'primary',
          onClick: () => {
            store.setAvailabilityFor(tutor.id, rows.filter(isUsable));
            toast(t('tutor.avail.saved'));
          }
        })
      )
    ),

    el('div', { class: 'row' },
      linkButton(t('tutor.nav.home'), '#/tutor')
    )
  );

  paint();
}

/** A window with no length is not a window; drop it rather than saving it. */
function isUsable(row) {
  try {
    return parseHhMm(row.startTime) !== parseHhMm(row.endTime);
  } catch {
    return false;
  }
}

/**
 * The same window on a Beijing clock. Resolved through real instants rather
 * than by adding an offset, so it stays right across a US DST change while
 * China does not move.
 */
function describeInBeijing(row, studentZone, nowIso, locale) {
  let interval;
  try {
    interval = slotToInterval(row, weekAnchorUtcIso(nowIso), row.timezone);
  } catch {
    return [el('span', { class: 'faint', text: '—' })];
  }

  const start = formatDual(interval.startIso, row.timezone, studentZone, { locale });
  const end = formatDual(interval.endIso, row.timezone, studentZone, { locale });
  const overnight = start.b.weekday !== end.b.weekday;

  return [
    el('span', { class: 'clock__zone', text: t('tutor.avail.theirs') }),
    ' ',
    el('strong', { text: `${start.b.weekdayLabel} ${start.b.time}–${end.b.time}` }),
    overnight ? el('span', { class: 'badge', text: t('tutor.avail.overnight') }) : null
  ].filter(Boolean);
}
