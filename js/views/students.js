import { viewHead } from '../dom.js';
import { t } from '../i18n.js';
import { placeholder } from './placeholder.js';

export function render(container, { store }) {
  const counts = store.summary(store.getState());

  container.append(
    viewHead(t('students.title'), t('students.lede')),
    placeholder({
      willDo: [
        'List students with availability shown in China time, and in the tutor\'s time where a match exists.',
        'Add a student with a display name and nothing else required — every other field optional (principle 5).',
        'Show what a student has been working on, in Chinese, for a guardian who wants to look.'
      ],
      available: [
        [t('nav.students'), counts.students],
        [t('data.status.unpaired'), counts.unpairedStudents]
      ]
    })
  );
}
