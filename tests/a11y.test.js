/**
 * a11y.test.js — accessibility, checked against what the browser actually
 * computed rather than against what the source appears to say.
 *
 * Two halves:
 *
 *   1. **Contrast**, read out of the live stylesheet — both the light palette
 *      and the `prefers-color-scheme: dark` block — so a token nudged for
 *      aesthetics cannot quietly drop below WCAG AA.
 *
 *   2. **The session-logging flow**, loaded in an iframe and inspected through
 *      the accessibility tree: every control has a name, a role, and a state,
 *      and the whole form is reachable and operable from the keyboard.
 *
 * Both need a browser; in Node they report as skipped rather than passing.
 *
 * An honest limit: this inspects the accessibility tree, which is what a
 * screen reader reads. It is not the same as listening to VoiceOver or NVDA,
 * and does not replace doing that before a real launch.
 */

import { describe, it, equal, ok, deepEqual, inBrowser } from './runner.js';

/* ---------------------------------------------------------------- *
 * Colour maths
 * ---------------------------------------------------------------- */

function parseColour(value) {
  const v = String(value).trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const rgb = /rgba?\(([^)]+)\)/.exec(v);
  if (rgb) return rgb[1].split(/[,\s/]+/).slice(0, 3).map(Number);
  return null;
}

function luminance(colour) {
  const [r, g, b] = colour.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pull `--token: value` declarations out of a CSS rule's text. */
function tokensFrom(cssText) {
  const out = {};
  for (const m of cssText.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out[m[1].trim()] = m[2].trim();
  }
  return out;
}

/**
 * Both palettes, read from the stylesheet itself rather than from
 * getComputedStyle — which would only ever show whichever theme this machine
 * happens to be in.
 */
function readPalettes() {
  const light = {};
  const dark = {};

  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of rules ?? []) {
      if (rule.selectorText === ':root') Object.assign(light, tokensFrom(rule.cssText));
      if (rule.media && String(rule.media.mediaText).includes('prefers-color-scheme: dark')) {
        for (const inner of rule.cssRules ?? []) {
          if (inner.selectorText === ':root') Object.assign(dark, tokensFrom(inner.cssText));
        }
      }
    }
  }
  return { light, dark: { ...light, ...dark } };
}

/** Every foreground/background pair the app actually renders. */
const PAIRS = [
  ['ink', 'paper', 'body text'],
  ['ink', 'paper-2', 'body on subtle surface'],
  ['ink', 'paper-3', 'body on chip'],
  ['ink-soft', 'paper', 'muted text'],
  ['ink-soft', 'paper-2', 'muted on subtle'],
  ['ink-soft', 'paper-3', 'muted on chip'],
  ['ink-faint', 'paper', 'faint text'],
  ['ink-faint', 'paper-2', 'faint on subtle'],
  ['ink-faint', 'paper-3', 'faint on chip'],
  ['accent', 'paper', 'links'],
  ['accent', 'paper-2', 'links on subtle'],
  ['accent', 'accent-soft', 'accent badge'],
  ['accent-ink', 'accent', 'primary button'],
  ['good', 'paper', 'good text'],
  ['good', 'good-soft', 'good badge'],
  ['warn', 'paper', 'warn text'],
  ['warn', 'warn-soft', 'warn badge'],
  ['danger', 'paper', 'error text'],
  ['danger', 'danger-soft', 'danger surface'],
  ['danger-ink', 'danger-soft', 'danger button']
];

const AA_NORMAL = 4.5;

describe('colour contrast (WCAG AA)', () => {
  if (!inBrowser) {
    it.skip('every text pair clears 4.5:1 in light mode', 'needs a browser: reads the live stylesheet');
    it.skip('every text pair clears 4.5:1 in dark mode', 'needs a browser: reads the live stylesheet');
    return;
  }

  const palettes = readPalettes();

  it('finds both palettes in the stylesheet', () => {
    ok(Object.keys(palettes.light).length > 10, 'light palette not found');
    ok(palettes.dark.ink !== palettes.light.ink, 'dark palette not found or identical');
  });

  for (const theme of ['light', 'dark']) {
    it(`every text pair clears ${AA_NORMAL}:1 in ${theme} mode`, () => {
      const palette = palettes[theme];
      const failures = [];

      for (const [fg, bg, label] of PAIRS) {
        const a = parseColour(palette[fg]);
        const b = parseColour(palette[bg]);
        if (!a || !b) { failures.push(`${label}: token missing (--${fg} / --${bg})`); continue; }
        const ratio = contrast(a, b);
        if (ratio < AA_NORMAL) {
          failures.push(`${label} (--${fg} on --${bg}): ${ratio.toFixed(2)}:1`);
        }
      }
      deepEqual(failures, []);
    });
  }
});

/* ---------------------------------------------------------------- *
 * The session-logging flow
 * ---------------------------------------------------------------- */

const APP = '../index.html';

/** Load a route in an iframe, seeded as a tutor with sample data. */
function openApp(hash, { width = 390, height = 844 } = {}) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = `position:fixed;left:-9999px;top:0;width:${width}px;height:${height}px;border:0`;
    frame.src = `${APP}?a11y=${Date.now()}${Math.random()}${hash}`;
    frame.onload = () => setTimeout(() => resolve(frame), 700);
    frame.onerror = reject;
    document.body.appendChild(frame);
  });
}

/**
 * The accessible name of a control, by the rules a screen reader applies:
 * aria-label, then aria-labelledby, then an associated or wrapping <label>,
 * then the element's own text.
 */
function accessibleName(node) {
  const aria = node.getAttribute('aria-label');
  if (aria?.trim()) return aria.trim();

  const labelledBy = node.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy.split(/\s+/)
      .map((id) => node.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ').trim();
    if (text) return text;
  }

  if (node.id) {
    const forLabel = node.ownerDocument.querySelector(`label[for="${CSS.escape(node.id)}"]`);
    if (forLabel?.textContent.trim()) return forLabel.textContent.trim();
  }

  const wrapping = node.closest('label');
  if (wrapping?.textContent.trim()) return wrapping.textContent.trim();

  if (node.title?.trim()) return node.title.trim();
  return (node.textContent ?? '').trim();
}

describe('session logging is usable without sight or a mouse', () => {
  if (!inBrowser) {
    it.skip('every control has an accessible name', 'needs a browser');
    it.skip('the yes/no and chip groups expose their state', 'needs a browser');
    it.skip('every control is reachable by keyboard', 'needs a browser');
    it.skip('the page announces saves through a live region', 'needs a browser');
    return;
  }

  let frame;
  let doc;

  it('loads the log screen as a tutor', async () => {
    // Seeded through the shared origin's storage before the frame loads.
    const store = await import('../js/store.js');
    if (store.getState().people.length === 0) await store.loadSampleData();
    store.saveViewAs('p_t01');

    frame = await openApp('#/tutor/log/pair_01');
    doc = frame.contentDocument;
    ok(doc.querySelector('.log-form'), 'the log form did not render');
  });

  it('every control has an accessible name', () => {
    const unnamed = [];
    for (const node of doc.querySelectorAll('button, input, select, textarea, a[href]')) {
      if (node.type === 'hidden' || node.hidden) continue;
      if (!accessibleName(node)) {
        unnamed.push(`${node.tagName.toLowerCase()}.${node.className || '(no class)'}`);
      }
    }
    deepEqual(unnamed, []);
  });

  it('the chip groups expose their state', () => {
    /*
     * One group now, not four. The form stopped asking how long anything took
     * once every class became a flat two hours — see SESSION_CREDIT_MINUTES.
     * All that is left to tap is whether it happened.
     */
    const groups = [...doc.querySelectorAll('.log-chips')];
    ok(groups.length >= 1, `expected at least one chip group, found ${groups.length}`);

    for (const group of groups) {
      equal(group.getAttribute('role'), 'group', 'a chip row must be a labelled group');
      ok(accessibleName(group), 'the group needs a name, or its chips are unexplained');

      const chips = [...group.querySelectorAll('.chip')];
      ok(chips.length >= 2);
      for (const chip of chips) {
        equal(chip.tagName, 'BUTTON', 'chips must be real buttons, not styled divs');
        ok(['true', 'false'].includes(chip.getAttribute('aria-pressed')),
          'a chip must say whether it is the chosen one');
      }
      equal(chips.filter((c) => c.getAttribute('aria-pressed') === 'true').length, 1,
        'exactly one chip in a group is selected');
    }
  });

  it('gives every chip a name that is unambiguous on its own', () => {
    /*
     * The visible text has to be thumb-sized — "30", "None" — and those repeat
     * across the duration, prep and follow-up groups. Reading the real
     * accessibility tree showed a screen reader announcing "button 30 …
     * button 30" for two different questions, because a group label is not
     * reliably repeated per button. Each chip must therefore stand alone.
     */
    const chips = [...doc.querySelectorAll('.chip')];
    const names = chips.map(accessibleName);
    const duplicates = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    deepEqual(duplicates, [], `these chips are indistinguishable by name: ${duplicates.join(', ')}`);

    // And the name must still relate to what is on the button.
    for (const chip of chips) {
      ok(accessibleName(chip).includes(chip.textContent.trim()),
        `"${accessibleName(chip)}" does not contain its visible text`);
    }
  });

  it('labels text fields properly rather than leaning on a placeholder', () => {
    for (const input of doc.querySelectorAll('.log-input')) {
      const name = accessibleName(input);
      ok(name, 'a text field with no accessible name');
      ok(!input.placeholder || name !== input.placeholder,
        'the placeholder is standing in for a label, which disappears as soon as the user types');
      // An associated label element, not just a wrapper.
      ok(input.id && doc.querySelector(`label[for="${CSS.escape(input.id)}"]`),
        `${input.id || '(no id)'} has no label[for]`);
    }
  });

  it('describes the covered field with last session\'s note, without prefilling it', () => {
    const covered = doc.querySelector('.log-input');
    const describedBy = covered.getAttribute('aria-describedby');
    ok(describedBy, 'no hint associated with the covered field');
    const hint = doc.getElementById(describedBy);
    ok(hint?.textContent.trim(), 'the hint element is empty');
    ok(covered.value !== hint.textContent.trim(), 'the hint must not be the value');
  });

  it('announces the selection change when a chip is pressed', () => {
    const group = doc.querySelector('.log-chips');
    const [yes, no] = group.querySelectorAll('.chip');
    no.click();
    equal(no.getAttribute('aria-pressed'), 'true');
    equal(yes.getAttribute('aria-pressed'), 'false');
    yes.click();
    equal(yes.getAttribute('aria-pressed'), 'true');
  });

  it('every control is reachable by keyboard', () => {
    const unreachable = [];
    for (const node of doc.querySelectorAll('.log-form button, .log-form input, .log-head a')) {
      if (node.hidden) continue;
      const tabindex = node.getAttribute('tabindex');
      // Buttons, inputs and links are focusable by default; only an explicit
      // negative tabindex takes them out of the order.
      if (tabindex !== null && Number(tabindex) < 0) unreachable.push(node.className);
    }
    deepEqual(unreachable, []);
  });

  it('keeps a focus ring on browsers without :focus-visible', async () => {
    // Safari below 15.4 ignores a :focus-visible-only rule entirely, which
    // would leave keyboard users with nothing.
    const css = await fetch('../css/base.css').then((r) => r.text());
    ok(/(^|\n):focus\s*\{[^}]*outline:\s*2px/.test(css),
      'no plain :focus fallback — old WebKit would show no ring at all');
    ok(css.includes(':focus:not(:focus-visible)'),
      'the fallback needs withdrawing for pointer focus on capable browsers');
  });

  it('gives focus a visible outline rather than removing it', () => {
    const chip = doc.querySelector('.chip');
    chip.focus();
    equal(doc.activeElement, chip, 'a chip must be focusable');

    /*
     * No rule may remove the focus ring, with exactly one exception:
     * `:focus:not(:focus-visible)` is the canonical way to keep a ring for
     * keyboard users on old WebKit while not showing it on a mouse click.
     * Anything else that sets outline:none on :focus is a real regression.
     */
    const killers = [];
    for (const sheet of frame.contentDocument.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of rules ?? []) {
        const selector = rule.selectorText;
        if (!selector?.includes(':focus')) continue;
        const outline = rule.style?.getPropertyValue('outline');
        if (!outline || !/^\s*(none|0)\s*$/.test(outline)) continue;
        if (/:focus:not\(\s*:focus-visible\s*\)/.test(selector)) continue;
        killers.push(selector);
      }
    }
    deepEqual(killers, [], 'these rules remove the keyboard focus ring');
  });

  it('the save control is a real button with a name', () => {
    const save = doc.querySelector('.log-save');
    ok(save, 'no save control');
    equal(save.tagName, 'BUTTON');
    ok(accessibleName(save));
  });

  it('the page announces saves through a live region', () => {
    const toast = doc.getElementById('toast');
    ok(toast, 'no toast element');
    equal(toast.getAttribute('role'), 'status');
    equal(toast.getAttribute('aria-live'), 'polite');
  });

  it('has a skip link and a labelled main landmark', () => {
    ok(doc.querySelector('.skip-link'), 'no skip link');
    const main = doc.querySelector('main');
    ok(main, 'no main landmark');
  });

  it('cleans up', () => {
    frame?.remove();
    ok(true);
  });
});

/* ---------------------------------------------------------------- *
 * Touch targets
 * ---------------------------------------------------------------- */

describe('touch targets on a phone', () => {
  if (!inBrowser) {
    it.skip('every interactive control is at least 44px tall on a coarse pointer', 'needs a browser');
    return;
  }

  /*
   * The iframe inherits this machine's pointer type, so `pointer: coarse` may
   * not match here. Assert the rule exists and covers the controls that
   * measured short on a phone, which is the thing that can regress — a value
   * changed in one place and not the other.
   */
  it('declares a coarse-pointer rule covering the controls that measured short', async () => {
    const css = await fetch('../css/components.css').then((r) => r.text());
    const block = /@media \(pointer: coarse\)\s*\{([\s\S]*?)\n\}/.exec(css);
    ok(block, 'no coarse-pointer rule found');
    for (const selector of ['.btn--sm', '.nav__link', '.lang-toggle', '.role-picker__select', '.chip']) {
      ok(block[1].includes(selector), `${selector} is not covered`);
    }
    ok(/min-height:\s*44px/.test(block[1]), 'the rule must set a 44px minimum');
  });

  it('never shrinks a control below 24px, even with a mouse', async () => {
    const frame = await openApp('#/tutor', { width: 1024, height: 900 });
    const d = frame.contentDocument;
    const tiny = [...d.querySelectorAll('#view button, #view a.btn, #view .chip, .nav__link')]
      .map((e) => ({ sel: e.className, h: e.getBoundingClientRect().height }))
      .filter((r) => r.h > 0 && r.h < 24);
    frame.remove();
    deepEqual(tiny, [], 'WCAG 2.5.8 asks for 24px as an absolute floor');
  });
});

/* ---------------------------------------------------------------- *
 * Form controls across the rest of the app
 * ---------------------------------------------------------------- */

describe('form controls everywhere have names', () => {
  if (!inBrowser) {
    it.skip('every control on every screen has an accessible name', 'needs a browser');
    return;
  }

  const ROUTES = [
    '#/admin', '#/admin/attention', '#/admin/roster', '#/admin/export',
    '#/admin/matching', '#/tutor', '#/tutor/hours', '#/tutor/availability'
  ];

  for (const route of ROUTES) {
    it(`${route} labels every control`, async () => {
      const store = await import('../js/store.js');
      if (store.getState().people.length === 0) await store.loadSampleData();
      store.saveViewAs(route.startsWith('#/tutor') ? 'p_t01' : 'admin');

      const frame = await openApp(route, { width: 1024, height: 900 });
      const d = frame.contentDocument;
      const unnamed = [];
      for (const node of d.querySelectorAll('#view button, #view input, #view select, #view textarea')) {
        if (node.type === 'hidden' || node.hidden) continue;
        if (!accessibleName(node)) unnamed.push(`${node.tagName.toLowerCase()}.${node.className || '?'}`);
      }
      frame.remove();
      deepEqual(unnamed, [], `${route}: unnamed controls`);
    });
  }
});
