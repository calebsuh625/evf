/**
 * pending.js — what a self-created account sees until it is recognised.
 *
 * The only screen a pending account can reach. No roster, no students, no
 * contact details, no messages: with no server there is no way to check that
 * somebody claiming to be a tutor is that tutor, so nothing opens until an
 * adult has said which person on the roster they are.
 *
 * It is written to be reassuring rather than obstructive. The person on the
 * other side did the right thing and is now waiting on somebody else; the
 * screen tells them what happens next and how to hurry it along, and offers
 * the way out (sign out) rather than trapping them.
 */

import { el, button } from '../dom.js';
import { t } from '../i18n.js';

export function render(container, { store }) {
  const account = store.currentAccount();
  const data = store.getState();

  container.append(
    el('section', { class: 'signin pending' },
      el('h1', { text: t('auth.pending.title') }),
      el('p', { text: t('auth.pending.body', { program: data.program.name }) }),

      el('dl', { class: 'card kv' },
        el('dt', { text: t('auth.up.name') }),
        el('dd', { text: account?.claimedName || '—' }),
        el('dt', { text: t('auth.username') }),
        el('dd', { class: 'mono', text: account?.username ?? '—' })
      ),

      el('p', { class: 'small', text: t('auth.pending.next') }),

      // Deliberately not a "resend" or "remind" button. Nothing in this app
      // messages anybody automatically, and a request queue is not a reason
      // to start.
      el('p', { class: 'small faint', text: t('auth.pending.nudge') }),

      button(t('auth.signOut'), {
        onClick: () => { store.signOut(); location.hash = '#/'; location.reload(); }
      })
    )
  );
}
