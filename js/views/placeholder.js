/**
 * placeholder.js — the scaffold every unbuilt screen renders.
 *
 * A placeholder that states what the screen will do, and proves the data it
 * needs is already loaded and reachable. That second part is the point: it
 * turns "the router works" from a claim into something visible.
 */

import { el } from '../dom.js';
import { t } from '../i18n.js';

/**
 * @param {{title: string, lede: string, willDo: string[], available?: Array<[string, number]>}} spec
 */
export function placeholder(spec) {
  const { willDo = [], available = [] } = spec;

  return el('section', { class: 'placeholder' },
    el('span', { class: 'placeholder__tag', text: t('placeholder.tag') }),
    el('p', { text: t('placeholder.body') }),

    willDo.length
      ? el('div', {},
          el('h3', { text: t('placeholder.willDo') }),
          el('ul', {}, willDo.map((item) => el('li', { text: item })))
        )
      : null,

    available.length
      ? el('div', {},
          el('h3', { text: t('placeholder.dataReady') }),
          el('div', { class: 'row' },
            available.map(([label, count]) =>
              el('span', {
                class: count > 0 ? 'badge badge--good' : 'badge',
                text: `${label}: ${count}`
              })
            )
          )
        )
      : null
  );
}
