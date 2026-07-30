/**
 * admin-accounts.js — who can sign in.
 *
 * The coordinator's screen. Three jobs, in the order they actually happen:
 * set sign-in up for the first time, hand out access to people who do not
 * have it, and reissue a code somebody lost.
 *
 * A generated code is shown **once, immediately, in full**, because the
 * coordinator has to read it into WeChat and there is no way to recover it
 * afterwards — only to issue a new one. Storing it in readable form so it
 * could be shown again would defeat hashing it at all.
 *
 * Students and guardians never appear here as people who must "sign up".
 * They appear as people the coordinator can hand a code to (principle 5).
 */

import { el, viewHead, button, toast, mount } from '../dom.js';
import { t } from '../i18n.js';
import { stampInZone } from '../time.js';
import { generateAccessCode, peopleWithoutAccounts, suggestUsername, pendingAccounts, isPending, CODE_ROLES } from '../auth.js';

export function render(container, { store, navigate }) {
  const data = store.getState();
  const repaint = () => { container.replaceChildren(); render(container, { store, navigate }); };

  mount(container, 
    viewHead(t('auth.admin.title'), t('auth.admin.lede')),
    el('aside', { class: 'notice notice--warn', role: 'note' },
      el('p', { class: 'notice__title', text: t('auth.notSecurityTitle') }),
      el('p', { class: 'small', text: t('auth.notSecurity') })
    ),
    data.accounts.length ? null : firstRunPanel(store, repaint),
    // First: people already waiting on a human. Anything else on this screen
    // can wait; somebody who signed up cannot see a thing until this is done.
    data.accounts.length ? pendingPanel(data, store, repaint) : null,
    data.accounts.length ? existingAccounts(data, store, repaint) : null,
    data.accounts.length ? invitePanel(data, store, repaint) : null
  );
}

/* ------------------------------------------------------------------ *
 * First run — there is nobody yet
 * ------------------------------------------------------------------ */

function firstRunPanel(store, repaint) {
  const username = el('input', { id: 'first-user', class: 'field__input', type: 'text',
    value: 'coordinator', autocapitalize: 'none', spellcheck: 'false' });
  const secret = el('input', { id: 'first-secret', class: 'field__input', type: 'password',
    autocomplete: 'new-password' });
  const error = el('p', { class: 'field__error', role: 'alert', hidden: true });

  const go = button(t('auth.admin.createFirst'), {
    variant: 'primary',
    onClick: async () => {
      error.hidden = true;
      try {
        await store.createAccount({ role: 'admin', username: username.value, secret: secret.value });
        // Sign them in straight away. They just proved they know the
        // password, and bouncing somebody to a sign-in screen one second
        // after they set it up reads as the app having locked them out.
        await store.signIn(username.value, secret.value);
        // A full reload rather than a repaint: the header, the nav and the
        // language all depend on who is now signed in, and none of those live
        // inside this container.
        location.reload();
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      }
    }
  });

  return el('section', { class: 'card' },
    el('h2', { class: 'card__title', text: t('auth.admin.firstTitle') }),
    el('p', { class: 'muted', text: t('auth.admin.firstBody') }),
    labelled(t('auth.username'), username),
    labelled(t('auth.password'), secret),
    error,
    go,
    // The thing that goes wrong: one person makes an account, closes the tab,
    // and the program is now behind a password they have not written down.
    el('p', { class: 'small faint', text: t('auth.admin.firstWarning') })
  );
}

/* ------------------------------------------------------------------ *
 * People who signed themselves up
 * ------------------------------------------------------------------ */

/**
 * The approval queue.
 *
 * Confirming is one select and one button, because the coordinator doing it
 * twelve times in a row is the whole reason self sign-up exists. The choices
 * are filtered to people of the matching role, so a tutor account cannot be
 * pointed at a student record.
 */
function pendingPanel(data, store, repaint) {
  const waiting = pendingAccounts(data);

  if (!waiting.length) {
    return el('section', { class: 'card' },
      el('h2', { class: 'card__title', text: t('auth.admin.pending') }),
      el('p', { class: 'muted', text: t('auth.admin.pendingNone') })
    );
  }

  return el('section', { class: 'card is-primary' },
    el('h2', { class: 'card__title', text: `${t('auth.admin.pending')} (${waiting.length})` }),
    el('p', { class: 'muted', text: t('auth.admin.pendingBody') }),
    el('ul', { class: 'invite-list' }, waiting.map((account) => pendingRow(account, data, store, repaint)))
  );
}

function pendingRow(account, data, store, repaint) {
  const wantedRole = account.role === 'tutor' ? 'tutor' : 'student';
  const candidates = data.people.filter((p) => p.role === wantedRole && p.active !== false);

  const select = el('select', {
    class: 'field__input',
    id: `link-${account.id}`,
    'aria-label': `${t('auth.admin.linkTo')} ${account.claimedName || account.username}`
  },
    el('option', { value: '', text: t('auth.admin.choosePerson') }),
    ...candidates.map((p) => el('option', { value: p.id, text: p.name }))
  );

  const confirm = button(t('auth.admin.confirm'), {
    variant: 'small',
    onClick: () => {
      if (!select.value) { select.focus(); return; }
      try {
        store.approveAccount(account.id, select.value);
        toast(t('auth.admin.confirmed'));
        repaint();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });

  return el('li', { class: 'invite-row invite-row--pending' },
    el('div', { class: 'pending-who' },
      el('span', { class: 'pending-name', text: account.claimedName || account.username }),
      el('span', { class: 'small faint',
        text: `${t('auth.admin.signedUpAs')} ${roleLabel(account.role)}` }),
      // Only worth showing when it is not already the name above it.
      account.claimedName ? el('span', { class: 'small mono faint', text: account.username }) : null
    ),
    el('div', { class: 'pending-act' },
      select,
      confirm,
      button(t('auth.admin.reject'), {
        variant: 'small quiet',
        'aria-label': `${t('auth.admin.reject')} — ${account.username}`,
        onClick: () => { store.setAccountDisabled(account.id, true); repaint(); }
      })
    )
  );
}

/* ------------------------------------------------------------------ *
 * Everybody who already has access
 * ------------------------------------------------------------------ */

function existingAccounts(data, store, repaint) {
  const zone = data.program.adminTimeZone;
  const byId = new Map(data.people.map((p) => [p.id, p]));

  return el('section', { class: 'card' },
    el('h2', { class: 'card__title', text: t('auth.admin.existing') }),
    el('div', { class: 'table-wrap' },
      el('table', {},
        el('thead', {}, el('tr', {},
          el('th', { text: t('auth.admin.who') }),
          el('th', { text: t('auth.username') }),
          el('th', { text: t('auth.admin.lastSignIn') }),
          el('th', { text: t('auth.admin.actions') })
        )),
        el('tbody', {}, data.accounts.map((account) => {
          const person = account.personId ? byId.get(account.personId) : null;
          const role = roleLabel(account.role);
          /*
           * Falls back through the roster name, the name they typed, and then
           * the username — so this cell always says something a human can act
           * on. The coordinator has no roster row and no typed name, so they
           * fall back to their role rather than to a lowercase username that
           * would then read "coordinator · Coordinator".
           */
          const who = person?.name
            || account.claimedName
            || (account.role === 'admin' ? role : account.username);

          return el('tr', { class: account.disabled ? 'is-muted' : '' },
            el('td', { class: 'who-cell' },
              el('span', { text: who }),
              // The coordinator's name *is* their role, and "Coordinator ·
              // Coordinator" reads like a bug.
              who === role ? null : el('span', { class: 'small faint', text: role }),
              account.disabled ? el('span', { class: 'tag tag--muted', text: t('auth.admin.disabled') }) : null,
              isPending(account) ? el('span', { class: 'tag tag--warn', text: t('auth.admin.pendingTag') }) : null
            ),
            el('td', { class: 'mono', text: account.username }),
            el('td', { class: 'small faint', text: account.lastSignInAt
              ? stampInZone(account.lastSignInAt, zone, { time: true })
              : t('auth.admin.never') }),
            el('td', {},
              button(t('auth.admin.reissue'), {
                variant: 'small quiet',
                'aria-label': `${t('auth.admin.reissue')} — ${account.username}`,
                onClick: () => reissue(account, store, repaint)
              }),
              button(account.disabled ? t('auth.admin.enable') : t('auth.admin.disable'), {
                variant: 'small quiet',
                'aria-label': `${account.disabled ? t('auth.admin.enable') : t('auth.admin.disable')} — ${account.username}`,
                onClick: () => { store.setAccountDisabled(account.id, !account.disabled); repaint(); }
              })
            )
          );
        }))
      )
    )
  );
}

async function reissue(account, store, repaint) {
  const code = generateAccessCode();
  try {
    await store.setAccountSecret(account.id, code);
    showCode(account.username, code);
    repaint();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ------------------------------------------------------------------ *
 * Handing access to somebody who does not have it
 * ------------------------------------------------------------------ */

function invitePanel(data, store, repaint) {
  const waiting = peopleWithoutAccounts(data);

  if (!waiting.length) {
    return el('section', { class: 'card' },
      el('h2', { class: 'card__title', text: t('auth.admin.invite') }),
      el('p', { class: 'muted', text: t('auth.admin.everyoneHas') })
    );
  }

  return el('section', { class: 'card' },
    el('h2', { class: 'card__title', text: t('auth.admin.invite') }),
    el('p', { class: 'muted', text: t('auth.admin.inviteBody') }),
    el('ul', { class: 'invite-list' }, waiting.map(({ person, role }) =>
      el('li', { class: 'invite-row' },
        el('span', {},
          el('span', { text: person.name }),
          el('span', { class: 'small faint', text: ` · ${roleLabel(role)}` })
        ),
        button(t('auth.admin.giveAccess'), {
          variant: 'small',
          'aria-label': `${t('auth.admin.giveAccess')} — ${person.name}, ${roleLabel(role)}`,
          onClick: async () => {
            const username = suggestUsername(person, role, data.accounts);
            const code = generateAccessCode();
            try {
              await store.createAccount({ personId: person.id, role, username, secret: code });
              showCode(username, code);
              repaint();
            } catch (err) {
              toast(err.message, 'error');
            }
          }
        })
      )
    ))
  );
}

/**
 * Show a freshly issued code, once.
 *
 * A dialog rather than a toast: this is the only moment the code is readable,
 * so it must not time out while somebody is copying it into WeChat.
 */
function showCode(username, code) {
  const dialog = el('div', { class: 'code-card', role: 'alertdialog', 'aria-label': t('auth.admin.codeTitle') },
    el('h2', { text: t('auth.admin.codeTitle') }),
    el('p', { class: 'small', text: t('auth.admin.codeBody') }),
    el('dl', { class: 'code-card__pair' },
      el('dt', { text: t('auth.username') }), el('dd', { class: 'mono', text: username }),
      el('dt', { text: t('auth.accessCode') }), el('dd', { class: 'mono code-card__code', text: code })
    ),
    el('p', { class: 'small faint', text: t('auth.admin.codeOnce') }),
    button(t('auth.admin.copied'), {
      variant: 'primary',
      onClick: () => dialog.remove()
    })
  );
  document.body.append(dialog);
  dialog.querySelector('button').focus();
}

function roleLabel(role) {
  return {
    admin: t('chat.roleAdmin'),
    tutor: t('chat.roleTutor'),
    student: t('chat.roleStudent'),
    guardian: t('chat.roleGuardian')
  }[role] ?? role;
}

function labelled(label, input) {
  return el('div', { class: 'field' },
    el('label', { class: 'field__label', for: input.id, text: label }),
    input
  );
}
