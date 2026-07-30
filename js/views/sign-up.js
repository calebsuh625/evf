/**
 * sign-up.js — making your own account.
 *
 * For the case where twelve tutors join in a week and nobody wants to read
 * out twelve codes. It does not replace the coordinator handing somebody
 * access: a family that fills in nothing must still be able to get in, which
 * is why the code path stays (principle 5).
 *
 * **What this screen creates is a request, not access.** The account lands
 * pending and sees one waiting screen until a coordinator says which person
 * on the roster it belongs to. The screen says so before anybody types, so
 * nobody signs up expecting to be let straight in.
 *
 * The name field is the only piece of information asked for, and it exists
 * solely so the coordinator can recognise the request. It is never treated as
 * identity — anybody can type any name, which is exactly why approval exists.
 */

import { el, button } from '../dom.js';
import { t } from '../i18n.js';
import { describeSecretProblem } from '../auth.js';

const ROLES = [
  { value: 'tutor', key: 'auth.up.roleTutor' },
  { value: 'student', key: 'auth.up.roleStudent' },
  { value: 'guardian', key: 'auth.up.roleGuardian' }
];

export function render(container, { store, navigate }) {
  const data = store.getState();

  const name = el('input', { id: 'up-name', class: 'field__input', type: 'text',
    autocomplete: 'name', required: true });
  const username = el('input', { id: 'up-user', class: 'field__input', type: 'text',
    autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' });
  const secret = el('input', { id: 'up-secret', class: 'field__input', type: 'password',
    autocomplete: 'new-password' });

  const role = el('select', { id: 'up-role', class: 'field__input' },
    ...ROLES.map((r) => el('option', { value: r.value, text: t(r.key) })));

  const error = el('p', { class: 'field__error', role: 'alert', hidden: true });

  const submit = button(t('auth.up.submit'), { variant: 'primary', type: 'submit' });
  submit.classList.add('btn--block');

  const form = el('form', {
    class: 'signin__form',
    onSubmit: async (event) => {
      event.preventDefault();
      error.hidden = true;

      // Without this the coordinator gets a row saying "—" and no way to tell
      // who is asking. It is the one field that has to be filled in, and this
      // is a form somebody chose to open.
      if (!name.value.trim()) {
        error.textContent = t('auth.up.nameRequired');
        error.hidden = false;
        name.focus();
        return;
      }

      // Check the password here rather than letting the store throw, so the
      // message lands under the field it is about.
      const problem = describeSecretProblem(secret.value, role.value);
      if (problem) {
        error.textContent = problem;
        error.hidden = false;
        secret.focus();
        return;
      }

      submit.disabled = true;
      submit.textContent = t('auth.up.submitting');
      try {
        await store.signUp({
          role: role.value,
          username: username.value,
          secret: secret.value,
          claimedName: name.value
        });
        await store.signIn(username.value, secret.value);
        location.hash = '#/';
        location.reload();
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        submit.disabled = false;
        submit.textContent = t('auth.up.submit');
      }
    }
  },
    field(t('auth.up.name'), name, t('auth.up.nameHint')),
    field(t('auth.up.role'), role, t('auth.up.roleHint')),
    field(t('auth.username'), username, t('auth.up.usernameHint')),
    field(t('auth.password'), secret, t('auth.up.passwordHint')),
    error,
    submit
  );

  container.append(
    el('section', { class: 'signin' },
      el('h1', { text: t('auth.up.title') }),
      el('p', { class: 'small faint', text: t('auth.up.lede', { program: data.program.name }) }),

      // Said before the form, not after it.
      el('aside', { class: 'notice', role: 'note' },
        el('p', { class: 'notice__title', text: t('auth.up.approvalTitle') }),
        el('p', { class: 'small', text: t('auth.up.approvalBody') })
      ),

      form,
      el('p', { class: 'small' },
        el('a', { href: '#/sign-in', text: t('auth.up.haveAccount') })
      ),
      el('p', { class: 'small faint signin__caveat', text: t('auth.notSecurity') })
    )
  );

  name.focus();
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
