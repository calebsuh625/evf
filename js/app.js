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
import { el, clear, toast } from './dom.js';

import { render as renderAdminOverview } from './views/admin-overview.js';
import { render as renderAdminAttention } from './views/admin-attention.js';
import { render as renderAdminRoster } from './views/admin-roster.js';
import { render as renderAdminPerson } from './views/admin-person.js';
import { render as renderAdminExport } from './views/admin-export.js';
import { render as renderSettings } from './views/settings.js';
import { render as renderSelfTest } from './views/selftest.js';
import { render as renderTutorHome } from './views/tutor-home.js';
import { render as renderTutorLog } from './views/tutor-log.js';
import { render as renderTutorHours } from './views/tutor-hours.js';
import { render as renderTutorStudent } from './views/tutor-student.js';
import { render as renderTutorAvailability } from './views/tutor-availability.js';
import { render as renderMatching } from './views/matching.js';
import { render as renderStudentHome } from './views/student-home.js';
import { render as renderNotFound } from './views/not-found.js';

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
  { path: '/',                key: 'admin.nav.overview',  nav: [],        render: renderAdminOverview },
  { path: '/admin',           key: 'admin.nav.overview',  nav: ['admin'], render: renderAdminOverview },
  { path: '/admin/attention', key: 'admin.nav.attention', nav: ['admin'], render: renderAdminAttention },
  { path: '/admin/matching',  key: 'match.nav',           nav: ['admin'], render: renderMatching },
  { path: '/admin/roster',    key: 'admin.nav.roster',    nav: ['admin'], render: renderAdminRoster },
  { path: '/admin/roster/:personId', key: 'admin.nav.roster', nav: [],    render: renderAdminPerson },
  { path: '/admin/export',    key: 'admin.nav.export',    nav: ['admin'], render: renderAdminExport },
  { path: '/settings',        key: 'nav.settings',        nav: ['admin'], render: renderSettings },

  // Tutor
  { path: '/tutor',                   key: 'tutor.nav.home',         nav: ['tutor'], role: 'tutor', render: renderTutorHome },
  { path: '/tutor/hours',             key: 'tutor.nav.hours',        nav: ['tutor'], role: 'tutor', render: renderTutorHours },
  { path: '/tutor/availability',      key: 'tutor.nav.availability', nav: ['tutor'], role: 'tutor', render: renderTutorAvailability },
  { path: '/tutor/log/:pairingId',    key: 'tutor.log.title',        nav: [],        role: 'tutor', render: renderTutorLog, screen: 'tutor-log' },
  { path: '/tutor/student/:studentId', key: 'tutor.student.title',   nav: [],        role: 'tutor', render: renderTutorStudent },

  // Student and guardian
  { path: '/student', key: 'st.nav.home', nav: ['student', 'guardian'], role: 'student', render: renderStudentHome },

  // Reachable from the footer rather than the main nav: it is a proof, not
  // a screen anyone works in day to day.
  { path: '/selftest', key: 'selftest.title', nav: [], render: renderSelfTest }
];

const NOT_FOUND = { path: null, key: 'notfound.title', render: renderNotFound };

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
    nav.append(link);
  }
}

/**
 * The role picker. No auth yet, so the app simply asks who is looking, and
 * remembers. Listing real tutors is what makes the tutor screens usable at
 * all before there are accounts.
 */
function renderRolePicker() {
  const mount = document.getElementById('role-picker');
  if (!mount) return;
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

function renderRoute({ scrollToTop = true } = {}) {
  const container = document.getElementById('view');
  if (!container) return;

  const { path, params: query } = parseHash(location.hash);
  const { route, params } = matchRoute(path);
  currentPath = route.path;
  document.body.dataset.role = currentRole();
  // Lets a focused screen reclaim the chrome it does not need — see the
  // tutor-log rules in css/tutor.css.
  document.body.dataset.screen = route.screen ?? '';

  clear(container);

  const view = store.currentView(store.getState());

  // A role-specific screen with nobody selected explains itself rather than
  // throwing. This is navigation, not access control — there is no auth here.
  if (route.role && route.role !== view.role && !(route.role === 'student' && view.role === 'guardian')) {
    container.append(needsPerson(route.role));
    renderRolePicker();
    renderNav();
    document.title = `${t(route.key)} · ${t('app.title')}`;
    return;
  }

  try {
    route.render(container, {
      params,
      query,
      navigate,
      store,
      tutor: view.role === 'tutor' ? view.person : null,
      student: view.role === 'student' || view.role === 'guardian' ? view.person : null,
      isGuardian: view.role === 'guardian',
      role: view.role,
      nowIso: new Date().toISOString()
    });
  } catch (err) {
    console.error(`[app] ${path} failed to render`, err);
    container.append(renderRenderError(err));
  }

  document.title = path === '/'
    ? t('app.title')
    : `${t(route.key)} · ${t('app.title')}`;

  renderRolePicker();
  renderNav();
  if (scrollToTop) window.scrollTo({ top: 0 });
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
    el('h2', { text: 'This screen failed to render' }),
    el('p', { class: 'muted', text: String(err?.message ?? err) }),
    el('p', { class: 'small faint', text: 'Your data is untouched. The export screen still works if you need a backup.' }),
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
