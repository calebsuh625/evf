/**
 * run-node.mjs — the suite in Node, no browser, no dependencies.
 *
 * The pure modules import cleanly outside a browser, which is the point of
 * keeping them free of DOM code. Tests that genuinely need a browser report as
 * skipped here rather than passing quietly; tests/run-browser.mjs covers those.
 *
 *   node tests/run-node.mjs
 */

import { run } from './runner.js';

const FILES = ['time', 'matching', 'hours', 'csv', 'store', 'chat', 'tutor', 'admin', 'i18n', 'assets', 'a11y'];

for (const file of FILES) {
  await import(`./${file}.test.js`);
}

let suite = '';
const summary = await run((event) => {
  if (event.type === 'suite') suite = event.name;
  if (event.type === 'fail') {
    console.error(`FAIL  [${suite}] ${event.name}`);
    console.error(`      ${String(event.error).replace(/\n/g, '\n      ')}`);
  }
  if (event.type === 'done') {
    const parts = [`${event.passed} passed`, `${event.failed} failed`];
    if (event.skipped) parts.push(`${event.skipped} skipped (browser only)`);
    console.log(`\n${parts.join(', ')} — ${event.total} total`);
  }
});

process.exit(summary.failed > 0 ? 1 : 0);
