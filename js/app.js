/**
 * app.js — bootstrap, hash routing, view switching.
 *
 * Hash routing rather than History API: GitHub Pages serves static files and
 * has no rewrite rules, so /pairings would 404 on a hard refresh while
 * #/pairings always resolves to index.html.
 */

import * as store from './store.js';
import { t, applyStaticStrings, toggleLang, getLang, setLang } from './i18n.js';
import { el, clear, toast } from './dom.js';

import { render as renderHome } from './views/home.js';
import { render as renderTutors } from './views/tutors.js';
import { render as renderStudents } from './views/students.js';
import { render as renderPairings } from './views/pairings.js';
import { render as renderLogSession } from './views/log-session.js';
import { render as renderSessions } from './views/sessions.js';
import { render as renderHours } from './views/hours.js';
import { render as renderData } from './views/data.js';
import { render as renderSettings } from './views/settings.js';
import { render as renderSelfTest } from './views/selftest.js';
import { render as renderTutorHome } from './views/tutor-home.js';
import { render as renderTutorLog } from './views/tutor-log.js';
import { render as renderTutorHours } from './views/tutor-hours.js';
import { render as renderTutorStudent } from './views/tutor-student.js';
import { render as renderTutorAvailability } from './views/tutor-availability.js';
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
  // Coordinator
  { path: '/',         key: 'nav.home',     nav: ['admin'], render: renderHome },
  { path: '/tutors',   key: 'nav.tutors',   nav: ['admin'], render: renderTutors },
  { path: '/students', key: 'nav.students', nav: ['admin'], render: renderStudents },
  { path: '/pairings', key: 'nav.pairings', nav: ['admin'], render: renderPairings },
  { path: '/log',      key: 'nav.log',      nav: ['admin'], render: renderLogSession },
  { path: '/sessions', key: 'nav.sessions', nav: ['admin'], render: renderSessions },
  { path: '/hours',    key: 'nav.hours',    nav: ['admin'], render: renderHours },
  { path: '/data',     key: 'nav.data',     nav: ['admin'], render: renderData },
  { path: '/settings', key: 'nav.settings', nav: ['admin'], render: renderSettings },

  // Tutor
  { path: '/tutor',                   key: 'tutor.nav.home',         nav: ['tutor'], role: 'tutor', render: renderTutorHome },
  { path: '/tutor/hours',             key: 'tutor.nav.hours',        nav: ['tutor'], role: 'tutor', render: renderTutorHours },
  { path: '/tutor/availability',      key: 'tutor.nav.availability', nav: ['tutor'], role: 'tutor', render: renderTutorAvailability },
  { path: '/tutor/log/:pairingId',    key: 'tutor.log.title',        nav: [],        role: 'tutor', render: renderTutorLog, screen: 'tutor-log' },
  { path: '/tutor/student/:studentId', key: 'tutor.student.title',   nav: [],        role: 'tutor', render: renderTutorStudent },

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
  return store.currentTutor(store.getState()) ? 'tutor' : 'admin';
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
  const viewAs = store.loadViewAs();

  const select = el('select', {
    id: 'role-select',
    class: 'role-picker__select',
    'aria-label': t('role.label'),
    onChange: (e) => {
      const value = e.target.value;
      store.saveViewAs(value);
      navigate(value === 'admin' ? '/' : '/tutor');
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
      : null
  );

  // A tutor id that is no longer in the data falls back to the coordinator
  // rather than leaving the app pointed at nobody.
  if (viewAs !== 'admin' && !tutors.some((x) => x.id === viewAs)) select.value = 'admin';

  mount.append(select);
}

function renderRoute({ scrollToTop = true } = {}) {
  const container = document.getElementById('view');
  if (!container) return;

  const { path, params: query } = parseHash(location.hash);
  const { route, params } = matchRoute(path);
  currentPath = route.path;
  // Lets a focused screen reclaim the chrome it does not need — see the
  // tutor-log rules in css/tutor.css.
  document.body.dataset.screen = route.screen ?? '';

  clear(container);

  // A tutor screen with no tutor selected explains itself instead of throwing.
  if (route.role === 'tutor' && !store.currentTutor(store.getState())) {
    container.append(needsTutor());
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
      tutor: store.currentTutor(store.getState()),
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

function needsTutor() {
  return el('section', { class: 'empty' },
    el('h2', { text: t('role.needTutor.title') }),
    el('p', { text: t('role.needTutor.body') }),
    el('div', { class: 'empty__actions' },
      el('a', { class: 'btn btn--primary', href: '#/', text: t('role.needTutor.action') })
    )
  );
}

/** One broken screen should not take down the shell. */
function renderRenderError(err) {
  return el('section', { class: 'placeholder' },
    el('h2', { text: 'This screen failed to render' }),
    el('p', { class: 'muted', text: String(err?.message ?? err) }),
    el('p', { class: 'small faint', text: 'Your data is untouched. The Data screen still works if you need to export.' }),
    el('a', { class: 'btn', href: '#/data', text: t('nav.data') })
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

  setLang(getLang());
  applyStaticStrings();
  wireLangToggle();
  document.body.dataset.role = store.currentTutor(store.getState()) ? 'tutor' : 'admin';

  const cache = store.load();
  if (cache.error) {
    console.warn('[app] cache did not load:', cache.error);
  }

  window.addEventListener('hashchange', () => renderRoute());

  // Any state change re-renders the current screen. Crude, and correct: the
  // dataset is a few hundred records, so a full re-render is imperceptible
  // and there is no stale-view class of bug to debug.
  store.subscribe(() => {
    document.body.dataset.role = store.currentTutor(store.getState()) ? 'tutor' : 'admin';
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
