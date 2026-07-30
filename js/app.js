/**
 * app.js — bootstrap, hash routing, view switching.
 *
 * Hash routing rather than History API: GitHub Pages serves static files and
 * has no rewrite rules, so /matches would 404 on a hard refresh while
 * #/matches always resolves to index.html.
 */

import * as store from './store.js';
import { t, applyStaticStrings, toggleLang, getLang, setLang } from './i18n.js';
import { el, clear, toast } from './dom.js';

import { render as renderHome } from './views/home.js';
import { render as renderTutors } from './views/tutors.js';
import { render as renderStudents } from './views/students.js';
import { render as renderMatches } from './views/matches.js';
import { render as renderLogSession } from './views/log-session.js';
import { render as renderSessions } from './views/sessions.js';
import { render as renderHours } from './views/hours.js';
import { render as renderData } from './views/data.js';
import { render as renderSettings } from './views/settings.js';
import { render as renderNotFound } from './views/not-found.js';

/**
 * The route table is the app's map. `nav: true` puts it in the header.
 */
const ROUTES = [
  { path: '/',         key: 'nav.home',     nav: true,  render: renderHome },
  { path: '/tutors',   key: 'nav.tutors',   nav: true,  render: renderTutors },
  { path: '/students', key: 'nav.students', nav: true,  render: renderStudents },
  { path: '/matches',  key: 'nav.matches',  nav: true,  render: renderMatches },
  { path: '/log',      key: 'nav.log',      nav: true,  render: renderLogSession },
  { path: '/sessions', key: 'nav.sessions', nav: true,  render: renderSessions },
  { path: '/hours',    key: 'nav.hours',    nav: true,  render: renderHours },
  { path: '/data',     key: 'nav.data',     nav: true,  render: renderData },
  { path: '/settings', key: 'nav.settings', nav: true,  render: renderSettings }
];

const NOT_FOUND = { path: null, key: 'notfound.title', render: renderNotFound };

/* ------------------------------------------------------------------ *
 * Routing
 * ------------------------------------------------------------------ */

/** "#/matches?x=1" -> { path: "/matches", params: URLSearchParams } */
export function parseHash(hash) {
  const raw = String(hash ?? '').replace(/^#/, '');
  const [pathPart, queryPart = ''] = raw.split('?');

  let path = pathPart.trim();
  if (path === '' || path === '/') path = '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  return { path, params: new URLSearchParams(queryPart) };
}

export function matchRoute(path) {
  return ROUTES.find((r) => r.path === path) ?? NOT_FOUND;
}

let currentPath = null;

function renderNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  clear(nav);

  for (const route of ROUTES) {
    if (!route.nav) continue;
    const link = el('a', {
      class: 'nav__link',
      href: `#${route.path}`,
      text: t(route.key)
    });
    if (route.path === currentPath) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
}

function renderRoute({ scrollToTop = true } = {}) {
  const container = document.getElementById('view');
  if (!container) return;

  const { path, params } = parseHash(location.hash);
  const route = matchRoute(path);
  currentPath = route.path;

  clear(container);
  try {
    route.render(container, { params, navigate, store });
  } catch (err) {
    console.error(`[app] ${path} failed to render`, err);
    container.append(renderRenderError(err));
  }

  document.title = path === '/'
    ? t('app.title')
    : `${t(route.key)} · ${t('app.title')}`;

  renderNav();
  if (scrollToTop) window.scrollTo({ top: 0 });
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

  const cache = store.loadFromCache();
  if (cache.error) {
    console.warn('[app] cache did not load:', cache.error);
  }

  window.addEventListener('hashchange', () => renderRoute());

  // Any state change re-renders the current screen. Crude, and correct: the
  // dataset is a few hundred records, so a full re-render is imperceptible
  // and there is no stale-view class of bug to debug.
  store.subscribe(() => renderRoute({ scrollToTop: false }));

  renderRoute();

  if (cache.migrated.length) {
    toast(t('toast.migrated', {
      from: cache.migrated[0],
      to: store.SCHEMA_VERSION
    }));
  }

  // Flush the debounced cache write if the tab goes away mid-edit.
  window.addEventListener('pagehide', () => store.persistNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.persistNow();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

export { ROUTES };
