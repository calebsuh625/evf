import { viewHead } from '../dom.js';
import { t } from '../i18n.js';
import { placeholder } from './placeholder.js';

export function render(container, { store }) {
  const data = store.getState();
  const active = data.matches.filter((m) => m.status === 'active').length;

  container.append(
    viewHead(t('matches.title'), t('matches.lede')),
    placeholder({
      willDo: [
        'Rank candidate pairs with js/matching.js and show the score breakdown, so a coordinator can overrule it.',
        'Propose concrete meeting windows in both time zones for any pair.',
        'Explain why an unmatched student has no eligible tutor, and what would have to change.',
        'Confirm or end a match. No automatic assignment: a person decides.'
      ],
      available: [
        [t('nav.tutors'), data.tutors.length],
        [t('nav.students'), data.students.length],
        [t('home.stat.matches'), active]
      ]
    })
  );
}
