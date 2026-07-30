import { viewHead } from '../dom.js';
import { t } from '../i18n.js';
import { placeholder } from './placeholder.js';
import { programTotals } from '../hours.js';

export function render(container, { store }) {
  const data = store.getState();
  const totals = programTotals(data.sessions, data.tutors, data.students);

  container.append(
    viewHead(t('hours.title'), t('hours.lede')),
    placeholder({
      willDo: [
        'Per-tutor totals a school hour form will accept, computed by js/hours.js from logged sessions.',
        'Monthly breakdown, with month boundaries decided in the tutor\'s own time zone.',
        'A printable summary a tutor can hand to a service-hours coordinator.',
        'Nothing on this screen is a target, a quota, or a ranking (principle 3).'
      ],
      available: [
        [t('home.stat.hours'), totals.hoursLabel],
        ['sessions held', totals.heldCount],
        ['active tutors', totals.activeTutors]
      ]
    })
  );
}
