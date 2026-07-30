/**
 * runner.js — a test runner small enough to read in one sitting.
 *
 * No dependencies, because a dependency here is a thing that can stop
 * working. Tests register synchronously on import; test.html calls run().
 */

const suites = [];
let currentSuite = null;

export function describe(name, body) {
  currentSuite = { name, tests: [] };
  suites.push(currentSuite);
  body();
  currentSuite = null;
}

export function it(name, fn) {
  if (!currentSuite) throw new Error(`it("${name}") called outside describe()`);
  currentSuite.tests.push({ name, fn });
}

/* ---------------------------------------------------------------- *
 * Assertions
 * ---------------------------------------------------------------- */

export class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function ok(value, message = 'Expected a truthy value') {
  if (!value) throw new AssertionError(`${message} (got ${show(value)})`);
}

export function equal(actual, expected, message = 'Values differ') {
  if (actual !== expected) {
    throw new AssertionError(`${message}\n  expected: ${show(expected)}\n  actual:   ${show(actual)}`);
  }
}

export function deepEqual(actual, expected, message = 'Structures differ') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new AssertionError(`${message}\n  expected: ${b}\n  actual:   ${a}`);
  }
}

export function close(actual, expected, tolerance = 0.01, message = 'Numbers differ') {
  if (!(Math.abs(actual - expected) <= tolerance)) {
    throw new AssertionError(
      `${message}\n  expected: ${expected} ±${tolerance}\n  actual:   ${actual}`
    );
  }
}

export function throws(fn, message = 'Expected the function to throw') {
  try {
    fn();
  } catch {
    return;
  }
  throw new AssertionError(message);
}

function show(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

/* ---------------------------------------------------------------- *
 * Execution
 * ---------------------------------------------------------------- */

/**
 * @param {(event: object) => void} [report] called per suite and per test
 * @returns {Promise<{passed:number, failed:number, total:number}>}
 */
export async function run(report = () => {}) {
  let passed = 0;
  let failed = 0;

  for (const suite of suites) {
    report({ type: 'suite', name: suite.name });

    for (const test of suite.tests) {
      try {
        await test.fn();
        passed += 1;
        report({ type: 'pass', suite: suite.name, name: test.name });
      } catch (err) {
        failed += 1;
        report({
          type: 'fail',
          suite: suite.name,
          name: test.name,
          error: err?.message ?? String(err),
          stack: err?.stack ?? ''
        });
      }
    }
  }

  const summary = { passed, failed, total: passed + failed };
  report({ type: 'done', ...summary });
  return summary;
}
