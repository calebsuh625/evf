/**
 * app.js — bootstrap, hash routing, view switching.
 *
 * Hash routing rather than History API: GitHub Pages serves static files and
 * has no rewrite rules, so /pairings would 404 on a hard refresh while
 * #/pairings always resolves to index.html.
 */

import * as store from './store.js';
import {
  t, applyStaticStrings, toggleLang, getLang, setLang,
  hasExplicitLang, storedLang, defaultLangFor
} from './i18n.js';
import { el, clear, toast, button } from './dom.js';
import { totalUnread } from './chat.js';

/*
 * Views load on demand.
 *
 * Static imports would make every visitor download every screen — a student on
 * a phone in China pulling the admin dashboards, the matcher and the chart
 * module before they can read their homework. Dynamic import is native to ES
 * modules, so this costs no build step, and the browser caches each module
 * after its first use.
 */

/**
 * The route table is the app's map.
 *
 * `nav` lists the roles that get a header link. `role` gates the screen: a
 * tutor screen needs somebody selected in the role picker. There is no auth
 * yet, so this is navigation, not security — nothing here is a permission
 * check and it must not be mistaken for one.
 *
 * A `:param` segment binds into ctx.params.
 */
const ROUTES = [
  // Coordinator. Everything on these screens is computed — see js/admin.js.
  { path: '/',                key: 'admin.nav.overview',  nav: [],        load: () => import('./views/admin-overview.js') },
  { path: '/admin',           key: 'admin.nav.overview',  nav: ['admin'], load: () => import('./views/admin-overview.js') },
  { path: '/admin/attention', key: 'admin.nav.attention', nav: ['admin'], load: () => import('./views/admin-attention.js') },
  { path: '/admin/matching',  key: 'match.nav',           nav: ['admin'], load: () => import('./views/matching.js') },
  { path: '/admin/roster',    key: 'admin.nav.roster',    nav: ['admin'], load: () => import('./views/admin-roster.js') },
  { path: '/admin/roster/:personId', key: 'admin.nav.roster', nav: [],    load: () => import('./views/admin-person.js') },
  { path: '/admin/export',    key: 'admin.nav.export',    nav: ['admin'], load: () => import('./views/admin-export.js') },
  { path: '/settings',        key: 'nav.settings',        nav: ['admin'], load: () => import('./views/settings.js') },
  { path: '/admin/accounts',  key: 'auth.admin.title',    nav: ['admin'], load: () => import('./views/admin-accounts.js') },

  // No `nav`: reached by being signed out, not by choosing to go there.
  { path: '/sign-in',         key: 'auth.title',          nav: [],        load: () => import('./views/sign-in.js'), screen: 'sign-in' },

  // Tutor
  { path: '/tutor',                   key: 'tutor.nav.home',         nav: ['tutor'], role: 'tutor', load: () => import('./views/tutor-home.js') },
  { path: '/tutor/hours',             key: 'tutor.nav.hours',        nav: ['tutor'], role: 'tutor', load: () => import('./views/tutor-hours.js') },
  { path: '/tutor/availability',      key: 'tutor.nav.availability', nav: ['tutor'], role: 'tutor', load: () => import('./views/tutor-availability.js') },
  { path: '/tutor/log/:pairingId',    key: 'tutor.log.title',        nav: [],        role: 'tutor', load: () => import('./views/tutor-log.js'), screen: 'tutor-log' },
  { path: '/tutor/student/:studentId', key: 'tutor.student.title',   nav: [],        role: 'tutor', load: () => import('./views/tutor-student.js') },

  // Student and guardian
  { path: '/student', key: 'st.nav.home', nav: ['student', 'guardian'], role: 'student', load: () => import('./views/student-home.js') },

  // Class chat. One screen serving all four roles — the row a tutor sees and
  // the row a parent sees are the same row, differing only in the query
  // `chat.threadsFor` runs. No `role` guard: everybody belongs to some thread,
  // and the coordinator belongs to all of them.
  { path: '/messages', key: 'chat.nav', nav: ['admin', 'tutor', 'student', 'guardian'], load: () => import('./views/messages.js') },
  { path: '/messages/:pairingId', key: 'chat.threadTitle', nav: [], load: () => import('./views/message-thread.js'), screen: 'thread' },

  // Reachable from the footer rather than the main nav: it is a proof, not
  // a screen anyone works in day to day.
  { path: '/selftest', key: 'selftest.title', nav: [], load: () => import('./views/selftest.js') }
];

const NOT_FOUND = { path: null, key: 'notfound.title', load: () => import('./views/not-found.js') };

/* ------------------------------------------------------------------ *
 * Routing
 * ------------------------------------------------------------------ */

/** "#/pairings?x=1" -> { path: "/pairings", params: URLSearchParams } */
export function parseHash(hash) {
  const raw = String(hash ?? '').replace(/^#/, '');
  const [pathPart, queryPart = ''] = raw.split('?');

  let path = pathPart.trim();
  if (path === '' || path === '/') path = '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  return { path, params: new URLSearchParams(queryPart) };
}

/**
 * Match a path against the route table, binding `:param` segments.
 * Static routes win over parameterised ones at the same depth.
 *
 * @returns {{route: object, params: Record<string,string>}}
 */
export function matchRoute(path) {
  const wanted = path.split('/').filter(Boolean);

  let best = null;
  for (const route of ROUTES) {
    const parts = route.path.split('/').filter(Boolean);
    if (parts.length !== wanted.length) continue;

    const params = {};
    let score = 0;
    let ok = true;
    for (const [i, part] of parts.entries()) {
      if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(wanted[i]);
      else if (part === wanted[i]) score += 1;
      else { ok = false; break; }
    }
    if (!ok) continue;
    if (!best || score > best.score) best = { route, params, score };
  }

  return best ? { route: best.route, params: best.params } : { route: NOT_FOUND, params: {} };
}

let currentPath = null;

function currentRole() {
  return store.currentView(store.getState()).role;
}

/**
 * Apply the language this browser should be in.
 *
 * An explicit choice always wins. Otherwise the role decides, which is how a
 * student or guardian lands in Chinese without touching anything.
 */
function applyLangForRole() {
  setLang(hasExplicitLang() ? storedLang() : defaultLangFor(currentRole()));
}

function renderNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  clear(nav);

  const role = currentRole();
  for (const route of ROUTES) {
    if (!route.nav?.includes(role)) continue;
    const link = el('a', {
      class: 'nav__link',
      href: `#${route.path}`,
      text: t(route.key)
    });
    if (route.path === currentPath) link.setAttribute('aria-current', 'page');

    // A count of unread messages is the one number in this app that is a
    // service rather than a score: it is about what somebody said to you, it
    // is computed from this browser's own read markers, and it never travels
    // to anyone else. Contrast the tutor nudge, which is deliberately a list
    // with no number at all.
    if (route.path === '/messages') {
      const unread = unreadForNav();
      if (unread) {
        link.append(el('span', {
          class: 'nav__badge',
          text: String(unread),
          'aria-label': t('chat.unread', { count: unread })
        }));
      }
    }

    nav.append(link);
  }
}

/**
 * Signed in, so the picker becomes a name and a way out.
 *
 * The free role picker stays for a program with no accounts, because that is
 * still the only way to look around a demo.
 */
function renderSessionControls() {
  const mount = document.getElementById('role-picker');
  if (!mount) return false;

  const account = store.currentAccount();
  if (!account) return false;

  const data = store.getState();
  const person = account.personId ? data.people.find((p) => p.id === account.personId) : null;

  clear(mount);
  mount.append(
    el('span', { class: 'session__who', text: person?.preferredName || person?.name || t('chat.roleAdmin') }),
    button(t('auth.signOut'), {
      variant: 'small quiet',
      onClick: () => { store.signOut(); location.hash = '#/'; location.reload(); }
    })
  );
  return true;
}

/** Unread across every thread the selected person belongs to. */
function unreadForNav() {
  try {
    const data = store.getState();
    const view = store.currentView(data);
    return totalUnread(view, data, store.readState());
  } catch {
    return 0;
  }
}

/**
 * The "this is demo data" banner.
 *
 * Driven by program.sampleData, which travels inside the document — so an
 * export of the demo still announces itself, and a coordinator who has typed
 * in real records can say so once and be believed.
 */
function renderSampleBanner() {
  const mount = document.getElementById('sample-banner');
  if (!mount) return;

  const showing = store.isSampleData(store.getState());
  mount.hidden = !showing;
  clear(mount);
  if (!showing) return;

  mount.append(el('div', { class: 'sample-banner', role: 'status' },
    el('span', { class: 'sample-banner__mark', 'aria-hidden': 'true', text: '!' }),
    el('div', { class: 'sample-banner__body' },
      el('strong', { text: t('sample.title') }),
      el('span', { class: 'sample-banner__text', text: t('sample.body') })
    ),
    el('div', { class: 'sample-banner__actions' },
      el('a', { class: 'btn btn--sm', href: '#/admin/export', text: t('sample.replace') }),
      button(t('sample.dismiss'), {
        variant: 'sm',
        onClick: () => {
          if (!confirm(t('sample.dismissConfirm'))) return;
          store.markAsSampleData(false);
          toast(t('sample.dismissed'));
        }
      })
    )
  ));
}

/**
 * The role picker. No auth yet, so the app simply asks who is looking, and
 * remembers. Listing real tutors is what makes the tutor screens usable at
 * all before there are accounts.
 */
function renderRolePicker() {
  const mount = document.getElementById('role-picker');
  if (!mount) return;
  // Once somebody is signed in, who they are is settled — swapping role at
  // will would make the account meaningless.
  if (renderSessionControls()) return;
  clear(mount);

  const data = store.getState();
  const tutors = store.tutors(data).filter((x) => x.active !== false);
  const students = store.students(data).filter((x) => x.active !== false);
  const viewAs = store.loadViewAs();

  const select = el('select', {
    id: 'role-select',
    class: 'role-picker__select',
    'aria-label': t('role.label'),
    onChange: (e) => {
      const value = e.target.value;
      store.saveViewAs(value);
      applyLangForRole();
      applyStaticStrings();
      navigate(homeFor(store.currentView(store.getState()).role));
      renderRoute();
    }
  },
    el('option', { value: 'admin', text: t('role.admin') }),
    tutors.length
      ? el('optgroup', { label: t('role.tutors') },
          tutors.map((x) => el('option', {
            value: x.id,
            text: x.preferredName || x.name,
            selected: x.id === viewAs
          })))
      : null,
    students.length
      ? el('optgroup', { label: t('role.students') },
          students.map((x) => el('option', {
            value: x.id,
            text: x.preferredName || x.name,
            selected: x.id === viewAs
          })))
      : null,
    // A guardian is not a record — they are whoever is holding the phone.
    students.length
      ? el('optgroup', { label: t('role.guardians') },
          students.map((x) => el('option', {
            value: store.guardianViewFor(x.id),
            text: t('role.guardianOf', { name: x.preferredName || x.name }),
            selected: store.guardianViewFor(x.id) === viewAs
          })))
      : null
  );

  // A person id no longer in the data falls back to the coordinator rather
  // than leaving the app pointed at nobody.
  if (viewAs !== 'admin' && store.currentView(data, viewAs).role === 'admin') select.value = 'admin';

  mount.append(select);
}

/** Guards against a slow module landing after the user has moved on. */
let renderToken = 0;

async function renderRoute({ scrollToTop = true } = {}) {
  const container = document.getElementById('view');
  if (!container) return;
  const token = ++renderToken;

  const { path, params: query } = parseHash(location.hash);
  const { route, params } = matchRoute(path);
  currentPath = route.path;
  document.body.dataset.role = currentRole();
  // Lets a focused screen reclaim the chrome it does not need — see the
  // tutor-log rules in css/tutor.css.
  document.body.dataset.screen = route.screen ?? '';

  clear(container);

  /*
   * The gate. Only closes once somebody has actually set sign-in up — a
   * program with no accounts must keep working exactly as it did, or an
   * update would lock a coordinator out of their own records.
   *
   * This is navigation, not access control: the data is already in the
   * browser and anyone with developer tools can read it. See js/auth.js.
   */
  if (store.needsSignIn() && route.path !== '/sign-in') {
    const module = await import('./views/sign-in.js');
    if (token !== renderToken) return;
    module.render(container, { store, navigate });
    renderSampleBanner();
    document.title = `${t('auth.title')} · ${t('app.title')}`;
    return;
  }

  const view = store.currentView(store.getState());

  // A role-specific screen with nobody selected explains itself rather than
  // throwing. This is navigation, not access control — there is no auth here.
  if (route.role && route.role !== view.role && !(route.role === 'student' && view.role === 'guardian')) {
    container.append(needsPerson(route.role));
    renderRolePicker();
    renderSampleBanner();
    renderNav();
    document.title = `${t(route.key)} · ${t('app.title')}`;
    return;
  }

  // Only show a placeholder if the module is genuinely slow to arrive; on a
  // warm cache it resolves in the same tick and a flash would be worse than
  // nothing.
  const pending = setTimeout(() => {
    if (token === renderToken) container.append(loadingState());
  }, 250);

  try {
    const module = await route.load();
    clearTimeout(pending);
    // The user navigated again while this was in flight.
    if (token !== renderToken) return;
    clear(container);

    module.render(container, {
      params,
      query,
      navigate,
      store,
      tutor: view.role === 'tutor' ? view.person : null,
      student: view.role === 'student' || view.role === 'guardian' ? view.person : null,
      isGuardian: view.role === 'guardian',
      role: view.role,
      view,
      nowIso: new Date().toISOString()
    });
  } catch (err) {
    clearTimeout(pending);
    if (token !== renderToken) return;
    console.error(`[app] ${path} failed to render`, err);
    clear(container);
    container.append(renderRenderError(err));
  }

  document.title = path === '/'
    ? t('app.title')
    : `${t(route.key)} · ${t('app.title')}`;

  renderRolePicker();
  renderSampleBanner();
  renderNav();
  if (scrollToTop) window.scrollTo({ top: 0 });
}

/** Shown only when a view module takes long enough that silence would confuse. */
function loadingState() {
  return el('div', { class: 'view-loading', role: 'status', 'aria-live': 'polite' },
    el('span', { class: 'view-loading__spinner', 'aria-hidden': 'true' }),
    el('span', { text: t('busy.loading') })
  );
}

function needsPerson(role) {
  const key = role === 'student' ? 'role.needStudent' : 'role.needTutor';
  return el('section', { class: 'empty' },
    el('h2', { text: t(`${key}.title`) }),
    el('p', { text: t(`${key}.body`) }),
    el('div', { class: 'empty__actions' },
      el('a', { class: 'btn btn--primary', href: '#/', text: t('role.needTutor.action') })
    )
  );
}

/** Where each role's home is. */
function homeFor(role) {
  if (role === 'tutor') return '/tutor';
  if (role === 'student' || role === 'guardian') return '/student';
  return '/admin';
}

/** One broken screen should not take down the shell. */
function renderRenderError(err) {
  return el('section', { class: 'placeholder' },
    el('h2', { text: t('error.render.title') }),
    el('p', { class: 'muted', text: String(err?.message ?? err) }),
    el('p', { class: 'small faint', text: t('error.render.body') }),
    el('a', { class: 'btn', href: '#/admin/export', text: t('admin.nav.export') })
  );
}

export function navigate(path) {
  const target = path.startsWith('#') ? path : `#${path}`;
  if (location.hash === target) renderRoute();
  else location.hash = target;
}

/* ------------------------------------------------------------------ *
 * Language
 * ------------------------------------------------------------------ */

function wireLangToggle() {
  const btn = document.getElementById('lang-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    // Saves against the person currently selected — see store.saveLangPreference.
    toggleLang();
    applyStaticStrings();
    renderRoute({ scrollToTop: false });
  });
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function boot() {
  // Tell the file:// guard in index.html that modules did load.
  window.__EVF_BOOTED = true;

  const cache = store.load();

  applyLangForRole();
  applyStaticStrings();
  wireLangToggle();
  document.body.dataset.role = currentRole();
  if (cache.error) {
    console.warn('[app] cache did not load:', cache.error);
  }

  window.addEventListener('hashchange', () => renderRoute());

  // Any state change re-renders the current screen. Crude, and correct: the
  // dataset is a few hundred records, so a full re-render is imperceptible
  // and there is no stale-view class of bug to debug.
  store.subscribe(() => {
    document.body.dataset.role = currentRole();
    renderRoute({ scrollToTop: false });
  });

  renderRoute();

  if (cache.migrated.length) {
    toast(t('toast.migrated', {
      from: cache.migrated[0],
      to: store.SCHEMA_VERSION
    }));
  }

  // Flush the debounced cache write if the tab goes away mid-edit.
  window.addEventListener('pagehide', () => store.saveNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.saveNow();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

export { ROUTES };
