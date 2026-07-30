/**
 * dom.js — the small amount of DOM helper shared by views.
 *
 * Deliberately tiny. This is not a framework and must not grow into one; if
 * a view needs something exotic it writes it inline.
 *
 * `el()` sets textContent, never innerHTML, so nothing from a data file can
 * become markup. Session notes come from a text field a volunteer typed on a
 * phone and get rendered on a coordinator's screen — that is exactly the path
 * that has to be safe.
 */

/**
 * @param {string} tag
 * @param {object|string|Node|Array} [props] attributes, or children if not a plain object
 * @param {...(string|Node|null|undefined|Array)} children
 */
export function el(tag, props, ...children) {
  const node = document.createElement(tag);

  const isProps =
    props != null &&
    typeof props === 'object' &&
    !Array.isArray(props) &&
    !(props instanceof Node);

  if (isProps) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;

      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') throw new Error('el(): html is not supported on purpose');
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) node.setAttribute(key, '');
      else node.setAttribute(key, String(value));
    }
  } else if (props != null) {
    children.unshift(props);
  }

  append(node, children);
  return node;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

/** A page header: title, one-line explanation, optional actions. */
export function viewHead(title, lede, actions = []) {
  return el('div', { class: 'view-head' },
    el('div', { class: 'view-head__text' },
      el('h1', { text: title }),
      lede && el('p', { text: lede })
    ),
    actions.length ? el('div', { class: 'view-head__actions' }, actions) : null
  );
}

/** A labelled statistic card. */
export function statCard(label, value) {
  return el('div', { class: 'card stat' },
    el('span', { class: 'stat__value tnum', text: String(value) }),
    el('span', { class: 'stat__label', text: label })
  );
}

export function button(label, { onClick, variant = '', type = 'button', ...rest } = {}) {
  return el('button', {
    type,
    class: `btn${variant ? ` btn--${variant}` : ''}`,
    text: label,
    onClick,
    ...rest
  });
}

export function linkButton(label, href, variant = '') {
  return el('a', { href, class: `btn${variant ? ` btn--${variant}` : ''}`, text: label });
}

/**
 * Run an async action with an honest busy state.
 *
 * Every long action in the app goes through this, so they all behave the same
 * way: the control disables and says what it is doing, failures surface the
 * real message rather than "something went wrong", and the control always
 * comes back — a button stuck disabled after an error is worse than the error.
 *
 * @param {HTMLButtonElement} control
 * @param {{busyLabel: string, run: () => Promise<any>, onError?: (err) => void}} opts
 */
export async function withBusy(control, { busyLabel, run, onError }) {
  const original = control.textContent;
  control.disabled = true;
  control.dataset.busy = 'true';
  if (busyLabel) control.textContent = busyLabel;

  try {
    return await run();
  } catch (err) {
    // The real message, first line, never a generic apology.
    toast(err?.message?.split('\n')[0] ?? String(err), 'error');
    onError?.(err);
    return null;
  } finally {
    control.disabled = false;
    delete control.dataset.busy;
    control.textContent = original;
  }
}

let toastTimer = null;

/**
 * Transient status message. Uses the live region already in index.html so
 * screen readers announce it without a second element.
 */
export function toast(message, tone = 'info') {
  const node = document.getElementById('toast');
  if (!node) return;

  node.textContent = message;
  node.dataset.tone = tone;
  node.dataset.open = 'true';

  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.dataset.open = 'false';
    toastTimer = null;
  }, tone === 'error' ? 6000 : 3200);
}
