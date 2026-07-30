import { el, linkButton } from '../dom.js';
import { t } from '../i18n.js';

export function render(container) {
  container.append(
    el('section', { class: 'empty' },
      el('h2', { text: t('notfound.title') }),
      el('p', { text: t('notfound.body') }),
      el('p', { class: 'small faint', text: location.hash || '#/' }),
      el('div', { class: 'empty__actions' },
        linkButton(t('notfound.action'), '#/', 'primary')
      )
    )
  );
}
