/**
 * assets.test.js — everything this app loads comes from this repository.
 *
 * The students are in mainland China. A CDN that is slow, blocked or simply
 * unreachable from there does not degrade the app, it breaks it — and it
 * breaks it for exactly the people with the least ability to work around it.
 * So the rule is absolute: no external fonts, no icon sets, no script hosts,
 * no analytics, nothing.
 *
 * This is checked against what the browser ACTUALLY fetched, using the
 * Resource Timing entries, rather than by reading the source and hoping the
 * source is the whole story. It therefore only runs in a browser; in Node it
 * reports as skipped rather than quietly passing.
 */

import { describe, it, equal, ok, deepEqual, inBrowser } from './runner.js';

describe('asset provenance', () => {
  if (!inBrowser) {
    it.skip('every asset loads from this repository', 'needs a browser: reads Resource Timing');
    it.skip('no external fonts or images', 'needs a browser: reads Resource Timing');
    it.skip('the page declares no off-origin references', 'needs a browser: reads the DOM');
    return;
  }

  const resources = () => performance.getEntriesByType('resource');

  it('every asset loads from this repository', () => {
    const foreign = resources()
      .map((r) => r.name)
      .filter((url) => new URL(url, location.href).origin !== location.origin);
    deepEqual(foreign, [], `these came from somewhere else: ${foreign.join(', ')}`);
  });

  it('loads something, so the check above is not vacuous', () => {
    ok(resources().length > 0, 'no resources recorded — the assertion above would pass trivially');
  });

  it('no external fonts or images', () => {
    const heavy = resources().filter((r) => ['css', 'img', 'font', 'image'].includes(r.initiatorType));
    const foreign = heavy.filter((r) => new URL(r.name, location.href).origin !== location.origin);
    deepEqual(foreign.map((r) => r.name), []);
  });

  it('declares no off-origin stylesheet, script, image or preload in the document', () => {
    const offOrigin = [];
    for (const el of document.querySelectorAll('link[href], script[src], img[src], source[src], iframe[src]')) {
      const raw = el.getAttribute('href') ?? el.getAttribute('src');
      if (!raw) continue;
      // Skip the iframes the measurement harness itself creates.
      if (raw.startsWith('data:') || raw.startsWith('blob:')) continue;
      if (new URL(raw, location.href).origin !== location.origin) offOrigin.push(raw);
    }
    deepEqual(offOrigin, []);
  });

  it('uses no @font-face pointing outside this origin', () => {
    const foreign = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        // A stylesheet we cannot read is, by definition, not one of ours.
        foreign.push(sheet.href ?? '(opaque stylesheet)');
        continue;
      }
      for (const rule of rules ?? []) {
        if (rule.constructor.name !== 'CSSFontFaceRule') continue;
        const src = rule.style.getPropertyValue('src');
        const urls = [...src.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]);
        for (const url of urls) {
          if (url.startsWith('data:')) continue;
          if (new URL(url, location.href).origin !== location.origin) foreign.push(url);
        }
      }
    }
    deepEqual(foreign, [], 'a web font is the classic thing that fails from mainland China');
  });
});
