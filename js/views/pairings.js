import { viewHead } from '../dom.js';
import { t } from '../i18n.js';
import { placeholder } from './placeholder.js';

export function render(container, { store }) {
  const counts = store.summary(store.getState());

  container.append(
    viewHead(t('pairings.title'), t('pairings.lede')),
    placeholder({
      willDo: [
        'Rank candidate pairs with js/matching.js and show the score breakdown, so a coordinator can overrule it.',
        'Propose concrete meeting windows in both time zones for any pair.',
        'Explain why an unmatched student has no eligible tutor, and what would have to change.',
        'Confirm, pause, or end a pairing. No automatic assignment: a person decides.'
      ],
      available: [
        [t('nav.tutors'), counts.tutors],
        [t('nav.students'), counts.students],
        [t('home.stat.pairings'), counts.activePairings],
        [t('data.status.unpaired'), counts.unpairedStudents],
        [t('data.status.capacity'), counts.tutorsWithCapacity]
      ]
    })
  );
}
