/**
 * sign-in.js — the sign-in screen.
 *
 * Two audiences on one screen, and they are not the same person:
 *
 *   - A tutor or the coordinator types a username and a password they chose.
 *   - A family types an access code the coordinator gave them. They never
 *     invented it, never have to remember it, and there is nothing here for
 *     them to fill in beyond the code itself (principle 5).
 *
 * The failure message never says which half was wrong. Telling somebody the
 * username exists tells anyone holding a copy of the file which accounts are
 * real.
 *
 * Nothing on this screen claims to protect anybody's data, because while the
 * app is local it does not — see the header of js/auth.js.
 */

import { el, button, toast } from '../dom.js';
import { t } from '../i18n.js';

export function render(container, { store, navigate }) {
  const data = store.getState();

  const username = el('input', {
    id: 'signin-user', class: 'field__input', type: 'text',
    autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false'
  });

  const secret = el('input', {
    id: 'signin-secret', class: 'field__input', type: 'password',
    autocomplete: 'current-password'
  });

  const error = el('p', { class: 'field__error', role: 'alert', hidden: true });

  const submit = button(t('auth.signIn'), { variant: 'primary', type: 'submit' });
  submit.classList.add('btn--block');

  const form = el('form', {
    class: 'signin__form',
    onSubmit: async (event) => {
      event.preventDefault();
      error.hidden = true;
      submit.disabled = true;
      submit.textContent = t('auth.signingIn');

      try {
        const result = await store.signIn(username.value, secret.value);
        if (result.ok) {
          // A fresh navigation rather than a re-render: language, nav and
          // home screen all depend on who is now looking.
          location.hash = '#/';
          location.reload();
          return;
        }
        error.textContent = t('auth.wrong');
        error.hidden = false;
        secret.value = '';
        secret.focus();
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      } finally {
        submit.disabled = false;
        submit.textContent = t('auth.signIn');
      }
    }
  },
    field(t('auth.username'), username, t('auth.usernameHint')),
    field(t('auth.password'), secret, t('auth.passwordHint')),
    error,
    submit
  );

  container.append(
    el('section', { class: 'signin' },
      el('h1', { text: t('auth.title') }),
      el('p', { class: 'small faint', text: t('auth.lede', { program: data.program.name }) }),
      form,
      el('aside', { class: 'notice', role: 'note' },
        el('p', { class: 'small', text: t('auth.forgot') })
      ),
      // The honest footnote. It is not hidden behind a link, because a family
      // deciding whether to type a child's details deserves to read it.
      el('p', { class: 'small faint signin__caveat', text: t('auth.notSecurity') })
    )
  );

  username.focus();
}

function field(label, input, hint) {
  const hintId = `${input.id}-hint`;
  input.setAttribute('aria-describedby', hintId);
  return el('div', { class: 'field' },
    el('label', { class: 'field__label', for: input.id, text: label }),
    input,
    el('p', { id: hintId, class: 'field__hint small faint', text: hint })
  );
}
