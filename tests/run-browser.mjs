/**
 * run-browser.mjs — the whole suite in a real headless browser.
 *
 * Loads tests/test.html, waits for the run to finish, and reports. This is the
 * only way to exercise the checks that read the browser itself: colour
 * contrast from the live stylesheet, accessible names from the rendered DOM,
 * and asset provenance from Resource Timing.
 *
 * Playwright is a CI tool, not an app dependency. Nothing in js/ or css/ needs
 * npm, and the site still deploys as static files with no build step.
 *
 *   node tests/run-browser.mjs [baseUrl]
 */

import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:8899';
const url = `${base}/tests/test.html`;

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(`uncaught: ${err.message}`));

console.log(`opening ${url}`);
await page.goto(url, { waitUntil: 'load' });

// The suite sets window.__TEST_RESULT when it finishes.
await page.waitForFunction(() => window.__TEST_RESULT !== undefined, { timeout: 120000 });
const result = await page.evaluate(() => window.__TEST_RESULT);

const failures = await page.evaluate(() =>
  [...document.querySelectorAll('.case--fail')].map((row) => row.innerText.replace(/\s+/g, ' ').trim())
);

for (const failure of failures) console.error(`FAIL  ${failure}`);

// A test page that throws in the console is a failure even if every
// assertion passed — an uncaught error means something is quietly broken.
const realErrors = consoleErrors.filter((text) => !text.includes('no string for'));
for (const text of realErrors) console.error(`CONSOLE  ${text}`);

console.log(`\n${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped — ${result.total} total`);

await browser.close();
process.exit(result.failed > 0 || realErrors.length > 0 ? 1 : 0);
