import { viewHead } from '../dom.js';
import { t } from '../i18n.js';
import { placeholder } from './placeholder.js';

export function render(container, { store }) {
  const data = store.getState();
  const active = data.matches.filter((m) => m.status === 'active').length;

  container.append(
    viewHead(t('log.title'), t('log.lede')),
    placeholder({
      willDo: [
        'Default to the pair and the time the tutor most likely just finished with, so the common case is one tap.',
        'Held / rescheduled / canceled, and nothing else. No attendance grading, no reason-required field (principle 3).',
        'An optional note. Optional means the Save button works while it is empty.',
        'Budget: under twenty seconds on a phone, thumb only (principle 4).'
      ],
      available: [
        [t('home.stat.matches'), active],
        [t('nav.sessions'), data.sessions.length]
      ]
    })
  );
}
