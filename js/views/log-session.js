import { viewHead } from '../dom.js';
import { t } from '../i18n.js';
import { placeholder } from './placeholder.js';

export function render(container, { store }) {
  const counts = store.summary(store.getState());

  container.append(
    viewHead(t('log.title'), t('log.lede')),
    placeholder({
      willDo: [
        'Default to the pair and the time the tutor most likely just finished with, so the common case is one tap.',
        'Did it happen, yes or no, and nothing else. No attendance grading, no reason-required field (principle 3).',
        'Optional prep and follow-up minutes, and optional notes on what was covered. Optional means the Save button works while they are all empty.',
        'Budget: under twenty seconds on a phone, thumb only (principle 4).'
      ],
      available: [
        [t('home.stat.pairings'), counts.activePairings],
        [t('nav.sessions'), counts.sessions]
      ]
    })
  );
}
