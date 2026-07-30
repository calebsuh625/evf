/**
 * auth.test.js — accounts and sign-in.
 *
 * The most important assertion in this file is the one about a program with
 * no accounts: it must stay open. An update that silently locked a
 * coordinator out of their own records would be the worst bug this codebase
 * could ship, because the records are the program.
 *
 * Nothing here asserts that the app is secure, because it is not while it is
 * local — see the header of js/auth.js. These test that credentials are
 * stored the way a server would store them, so moving to one is a change of
 * venue rather than a re-registration of forty people.
 */

import { describe, it, ok, equal, deepEqual, throws } from './runner.js';
import {
  hashSecret, verifySecret, newSalt, newAccount, attemptSignIn, findAccount,
  normalizeSecret, normalizeUsername, generateAccessCode, describeSecretProblem,
  viewAsFor, hasAccounts, peopleWithoutAccounts, suggestUsername,
  PBKDF2_ITERATIONS, ACCOUNT_ROLES, CODE_ROLES
} from '../js/auth.js';

const PASSWORD = 'saturday mornings';

async function tutorAccount(overrides = {}) {
  return newAccount({
    id: 'acct_1', personId: 'p_t01', role: 'tutor',
    username: 'avery', secret: PASSWORD, ...overrides
  });
}

/* ---------------------------------------------------------------- *
 * Hashing
 * ---------------------------------------------------------------- */

describe('password storage', () => {
  it('never keeps the secret itself', async () => {
    const account = await tutorAccount();
    const serialised = JSON.stringify(account);
    ok(!serialised.includes(PASSWORD), 'the password must not survive anywhere in the record');
    ok(!serialised.includes('saturday'), 'nor any recognisable part of it');
  });

  it('salts every account separately', async () => {
    // Two people who pick the same password must not share a hash, or one
    // leaked backup cracks both at once.
    const a = await tutorAccount({ id: 'a', username: 'one' });
    const b = await tutorAccount({ id: 'b', username: 'two' });
    ok(a.salt !== b.salt, 'salts differ');
    ok(a.hash !== b.hash, 'so the hashes differ despite the same password');
  });

  it('is deterministic for the same secret and salt', async () => {
    const salt = newSalt();
    equal(await hashSecret('hello there', salt), await hashSecret('hello there', salt));
  });

  it('records the iteration count it used', async () => {
    // Stored per account, so raising the cost later does not invalidate
    // everybody's existing password.
    const account = await tutorAccount();
    equal(account.iterations, PBKDF2_ITERATIONS);

    const legacy = { ...account, iterations: 1000, hash: await hashSecret(PASSWORD, account.salt, 1000) };
    ok(await verifySecret(PASSWORD, legacy), 'an account hashed at an older cost still verifies');
  });

  it('rejects the wrong secret', async () => {
    const account = await tutorAccount();
    ok(await verifySecret(PASSWORD, account));
    ok(!await verifySecret('saturday morning', account), 'one character off');
    ok(!await verifySecret('', account));
  });

  it('refuses to verify an account with no stored hash', async () => {
    ok(!await verifySecret('anything', { username: 'x' }));
    ok(!await verifySecret('anything', { username: 'x', salt: newSalt() }));
  });
});

/* ---------------------------------------------------------------- *
 * What people actually type
 * ---------------------------------------------------------------- */

describe('normalising input', () => {
  it('forgives the trailing space a phone keyboard adds', async () => {
    const account = await tutorAccount();
    ok(await verifySecret(`${PASSWORD} `, account));
    ok(await verifySecret(`  ${PASSWORD}`, account));
  });

  it('matches a username whatever the case', () => {
    equal(normalizeUsername('  Avery  '), 'avery');
    equal(normalizeUsername('AVERY'), 'avery');
  });

  it('normalises unicode, so an IME and a US keyboard agree', () => {
    // Full-width characters are what a Chinese keyboard produces by default,
    // and a parent should not be locked out for leaving the IME on.
    equal(normalizeSecret('ＡＢＣ１２３'), 'ABC123');
  });

  it('does not fold case in a password', async () => {
    const account = await tutorAccount({ secret: 'CorrectHorse' });
    ok(await verifySecret('CorrectHorse', account));
    ok(!await verifySecret('correcthorse', account), 'passwords stay case-sensitive');
  });
});

/* ---------------------------------------------------------------- *
 * Signing in
 * ---------------------------------------------------------------- */

describe('attemptSignIn', () => {
  it('accepts the right credentials', async () => {
    const account = await tutorAccount();
    const result = await attemptSignIn([account], 'Avery', PASSWORD);
    ok(result.ok);
    equal(result.account.id, 'acct_1');
  });

  it('gives the same answer for a wrong password and a missing account', async () => {
    // Distinguishing them tells anybody holding a copy of the file which
    // accounts are real.
    const account = await tutorAccount();
    deepEqual(
      await attemptSignIn([account], 'avery', 'wrong'),
      await attemptSignIn([account], 'nobody-at-all', 'wrong')
    );
  });

  it('refuses a disabled account', async () => {
    const account = { ...await tutorAccount(), disabled: true };
    equal(findAccount([account], 'avery'), null);
    ok(!(await attemptSignIn([account], 'avery', PASSWORD)).ok);
  });

  it('copes with an empty accounts table', async () => {
    ok(!(await attemptSignIn([], 'anyone', 'anything')).ok);
    ok(!(await attemptSignIn(undefined, 'anyone', 'anything')).ok);
  });
});

/* ---------------------------------------------------------------- *
 * Nobody gets locked out
 * ---------------------------------------------------------------- */

describe('a program with no accounts', () => {
  it('is not considered to have sign-in set up', () => {
    // The assertion this file exists for. A coordinator who never set sign-in
    // up must keep full access to their own program after any update.
    equal(hasAccounts({ accounts: [] }), false);
    equal(hasAccounts({}), false);
    equal(hasAccounts({ accounts: undefined }), false);
  });

  it('is considered set up as soon as one account exists', async () => {
    equal(hasAccounts({ accounts: [await tutorAccount()] }), true);
  });
});

/* ---------------------------------------------------------------- *
 * Roles map onto the existing view model
 * ---------------------------------------------------------------- */

describe('viewAsFor', () => {
  it('maps each role onto the viewAs value the app already uses', () => {
    equal(viewAsFor({ role: 'admin', personId: null }), 'admin');
    equal(viewAsFor({ role: 'tutor', personId: 'p_t01' }), 'p_t01');
    equal(viewAsFor({ role: 'student', personId: 'p_s01' }), 'p_s01');
    equal(viewAsFor({ role: 'guardian', personId: 'p_s01' }), 'guardian:p_s01');
  });

  it('falls back to the coordinator rather than to nothing', () => {
    equal(viewAsFor(null), 'admin');
  });

  it('covers every declared role', () => {
    for (const role of ACCOUNT_ROLES) {
      ok(viewAsFor({ role, personId: 'p_s01' }), `no viewAs for ${role}`);
    }
  });
});

/* ---------------------------------------------------------------- *
 * Access codes — principle 5
 * ---------------------------------------------------------------- */

describe('access codes', () => {
  it('avoids characters that are misread down a phone line', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateAccessCode();
      ok(!/[O0I1L]/i.test(code.replace('-', '')), `ambiguous character in ${code}`);
    }
  });

  it('cannot accidentally spell a word', () => {
    // No vowels in the alphabet, so no code is ever an unfortunate one.
    for (let i = 0; i < 200; i += 1) {
      ok(!/[AEIOU]/i.test(generateAccessCode()), 'a vowel got into the alphabet');
    }
  });

  it('is grouped for reading aloud', () => {
    ok(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(generateAccessCode()));
  });

  it('does not repeat itself', () => {
    const seen = new Set();
    for (let i = 0; i < 500; i += 1) seen.add(generateAccessCode());
    equal(seen.size, 500, 'codes must not collide');
  });

  it('holds a family to nothing beyond typing the code', () => {
    // Principle 5: students and guardians never invent a credential, so the
    // rules a tutor's chosen password must satisfy do not apply to them. A
    // six-character code is fine for a family and too short for a tutor.
    for (const role of CODE_ROLES) {
      equal(describeSecretProblem(generateAccessCode(), role), null, `generated code for ${role}`);
      equal(describeSecretProblem('K7MP2X', role), null, `short code for ${role}`);
    }
    ok(describeSecretProblem('K7MP2X', 'tutor'), 'a tutor choosing their own needs more length');
    ok(describeSecretProblem('K7MP2X', 'admin'), 'and so does the coordinator');
  });
});

describe('describeSecretProblem', () => {
  it('asks for length rather than a wall of complexity rules', () => {
    ok(describeSecretProblem('short'), 'seven characters is not enough');
    equal(describeSecretProblem('a short phrase'), null, 'a passphrase is fine');
    ok(describeSecretProblem(''), 'blank is not');
    ok(describeSecretProblem('x'.repeat(500)), 'nor is something absurd');
  });
});

/* ---------------------------------------------------------------- *
 * Who still needs access
 * ---------------------------------------------------------------- */

describe('peopleWithoutAccounts', () => {
  const data = () => ({
    people: [
      { id: 't1', role: 'tutor', name: 'Avery Alpha', preferredName: 'Avery' },
      { id: 's1', role: 'student', name: 'Ming Mu', preferredName: 'Ming' }
    ],
    accounts: []
  });

  it('offers a student and their guardian as separate handovers', () => {
    // One person record, two people who might hold the phone.
    const waiting = peopleWithoutAccounts(data());
    deepEqual(waiting.map((w) => `${w.role}:${w.person.id}`), ['tutor:t1', 'student:s1', 'guardian:s1']);
  });

  it('drops somebody once they have that role', () => {
    const d = data();
    d.accounts = [{ id: 'a', role: 'guardian', personId: 's1', username: 'ming-parent' }];
    const waiting = peopleWithoutAccounts(d);
    deepEqual(waiting.map((w) => `${w.role}:${w.person.id}`), ['tutor:t1', 'student:s1']);
  });
});

describe('suggestUsername', () => {
  it('reads out easily over a phone', () => {
    equal(suggestUsername({ preferredName: 'Avery' }, 'tutor', []), 'avery');
    equal(suggestUsername({ preferredName: 'Ming' }, 'guardian', []), 'ming-parent');
  });

  it('disambiguates two people with the same name', () => {
    const taken = [{ username: 'avery' }];
    equal(suggestUsername({ preferredName: 'Avery' }, 'tutor', taken), 'avery2');
  });

  it('survives a name with no latin characters at all', () => {
    const name = suggestUsername({ preferredName: '明' }, 'student', []);
    ok(name.length > 0, 'must still produce something typable');
  });
});

/* ---------------------------------------------------------------- *
 * Building an account
 * ---------------------------------------------------------------- */

describe('newAccount', () => {
  it('rejects an unknown role', async () => {
    let threw = false;
    try {
      await newAccount({ id: 'x', role: 'superuser', username: 'root', secret: 'a long password' });
    } catch { threw = true; }
    ok(threw, 'an unrecognised role must not become an account');
  });

  it('rejects a blank username', async () => {
    let threw = false;
    try { await newAccount({ id: 'x', role: 'admin', username: '  ', secret: 'a long password' }); }
    catch { threw = true; }
    ok(threw);
  });

  it('rejects a password that is too short to bother hashing', async () => {
    let threw = false;
    try { await newAccount({ id: 'x', role: 'admin', username: 'a', secret: 'abc' }); }
    catch { threw = true; }
    ok(threw);
  });

  it('starts enabled and never signed in', async () => {
    const account = await tutorAccount();
    equal(account.disabled, false);
    equal(account.lastSignInAt, null);
    ok(account.createdAt);
  });

  it('gives the coordinator no person record', async () => {
    const account = await newAccount({ id: 'x', role: 'admin', username: 'coordinator', secret: 'a long password' });
    equal(account.personId, null);
  });
});
