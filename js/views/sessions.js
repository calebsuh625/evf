import { viewHead } from '../dom.js';
import { t } from '../i18n.js';
import { placeholder } from './placeholder.js';

export function render(container, { store }) {
  const data = store.getState();
  const held = data.sessions.filter((s) => s.status === 'held').length;

  container.append(
    viewHead(t('sessions.title'), t('sessions.lede')),
    placeholder({
      willDo: [
        'Every logged session, newest first, each timestamp shown in both time zones.',
        'Filter by tutor, student, or date range.',
        'Edit or delete a session a tutor logged by mistake, without ceremony.'
      ],
      available: [
        [t('nav.sessions'), data.sessions.length],
        ['held', held]
      ]
    })
  );
}
