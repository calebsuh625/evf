import { viewHead } from '../dom.js';
import { t } from '../i18n.js';
import { placeholder } from './placeholder.js';

export function render(container, { store }) {
  const counts = store.summary(store.getState());

  container.append(
    viewHead(t('tutors.title'), t('tutors.lede')),
    placeholder({
      willDo: [
        'List every volunteer with their weekend availability shown in their own time zone.',
        'Add and edit a tutor: display name, grade, subjects, languages, availability slots.',
        'Show each tutor their own hours without them having to ask an admin for it.'
      ],
      available: [
        [t('nav.tutors'), counts.tutors],
        [t('home.stat.pairings'), counts.activePairings],
        [t('data.status.capacity'), counts.tutorsWithCapacity]
      ]
    })
  );
}
