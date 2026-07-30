import { viewHead, el } from '../dom.js';
import { t } from '../i18n.js';
import { placeholder } from './placeholder.js';

export function render(container, { store }) {
  const data = store.getState();

  container.append(
    viewHead(t('settings.title'), t('settings.lede')),

    // Read-only for now: these values already drive the dashboard clocks and
    // every hours calculation, so showing them proves the store round-trips.
    el('dl', { class: 'card kv', style: 'margin-bottom:16px' },
      row(t('home.zone.here'), data.program.adminTimeZone),
      row(t('home.zone.students'), data.program.studentTimeZone),
      row('Default session length', `${data.program.defaultSessionMinutes} min`)
    ),

    placeholder({
      willDo: [
        'Editable program name, admin time zone, student time zone, and default session length.',
        'Language preference, which is already persisted separately from program data.',
        'Terms and date ranges, so hours can be reported per semester.'
      ]
    })
  );
}

function row(label, value) {
  const frag = document.createDocumentFragment();
  frag.append(el('dt', { text: label }), el('dd', { text: String(value) }));
  return frag;
}
