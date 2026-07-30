/**
 * auth.js — accounts and sign-in.
 *
 * Pure functions over WebCrypto. No DOM, no store, no globals beyond
 * `crypto`, so it runs in Node and ports to a server unchanged.
 *
 * ── Read this before trusting it ─────────────────────────────────────
 *
 * **This is not a security boundary, and it cannot be until there is a
 * server.** Everything runs in the browser against a document the reader
 * already has. Anyone willing to open developer tools can read the whole
 * program, edit their own role, or delete the accounts table. Nothing here
 * stops them and nothing here is designed to.
 *
 * What it *does* buy, and why it is worth building now:
 *
 *   - **Identity.** Sessions, messages, availability and language attach to
 *     the person who did them, instead of to whoever last used the role
 *     picker on this device.
 *   - **A real credential store**, hashed the way a server would hash it, so
 *     moving to a backend is changing where `verifySecret` runs — not asking
 *     forty people to sign up again.
 *   - **A shoulder-surfing barrier.** A tutor handing their laptop to a
 *     friend, or a family sharing a tablet, no longer exposes every other
 *     student's guardian contacts by default.
 *
 * The moment a backend exists, verification moves server-side and this file
 * keeps only the hashing helpers. Until then, no screen may describe this as
 * protecting anybody's data, because it does not.
 *
 * ── Passwords are PBKDF2, and salted per account ─────────────────────
 *
 * Not because a local app needs it, but because the accounts table travels
 * inside the program export — the file a coordinator emails to their
 * successor. A stolen backup should not hand over reusable passwords, and
 * teenagers reuse passwords. Salted PBKDF2-SHA-256 at a high iteration count
 * is what a server would store, so it is what is stored here.
 *
 * ── Two ways in, and principle 5 needs both ──────────────────────────
 *
 * **The coordinator hands somebody access.** They generate a username and a
 * short code and read it out. The family types it once and are never asked to
 * invent anything, remember anything, or fill in a form. This path must always
 * exist: requiring a parent in Chengdu to devise a password before they can
 * read their child's homework is exactly the required data entry the program
 * does not do.
 *
 * **Or somebody signs themselves up.** Useful when twelve tutors join at once
 * and nobody wants to read out twelve codes. They choose a username, a
 * password and the name they go by, and the account is created **pending**.
 *
 * A pending account can sign in and sees exactly one screen: the coordinator
 * has been asked. No roster, no students, no contact details, no messages.
 * That is the entire safeguard for open sign-up, and it has to be, because
 * with no server there is no way to check that somebody claiming to be a tutor
 * is that tutor. An adult decides which person on the roster they are, and
 * only then does anything open up.
 *
 * Self sign-up is therefore an addition, never a replacement. The moment it
 * becomes the only way in, principle 5 is broken.
 */

/**
 * PBKDF2 rounds. High enough to make an offline attack on a leaked backup
 * expensive, low enough that an older phone signs in without a visible pause
 * — measured at roughly a quarter second on a modern laptop.
 */
export const PBKDF2_ITERATIONS = 210_000;

/** Roles that hold an account. 'guardian' shares the student's person row. */
export const ACCOUNT_ROLES = Object.freeze(['admin', 'tutor', 'student', 'guardian']);

/**
 * An account is either waiting to be recognised or in use.
 *
 * 'pending' is what somebody who signed themselves up gets. They can sign in,
 * and they see one screen saying the coordinator has been asked — nothing
 * else. This is the whole safeguard for open sign-up: with no server there is
 * no way to check that a person claiming to be a tutor is that tutor, so
 * nobody reaches a child's contact details until an adult has said which
 * person on the roster they are.
 *
 * 'active' means a coordinator linked the account to a roster entry.
 */
export const ACCOUNT_STATUSES = Object.freeze(['pending', 'active']);

/** Roles the coordinator issues an access code to, rather than a password. */
export const CODE_ROLES = Object.freeze(['student', 'guardian']);

const encoder = new TextEncoder();

function subtle() {
  const api = globalThis.crypto?.subtle;
  if (!api) {
    // Non-secure origins have no WebCrypto. The app already refuses to run
    // over file://, so in practice this means a very old browser.
    throw new Error('This browser cannot sign in securely (no WebCrypto). Use a current browser over https.');
  }
  return api;
}

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

/** A fresh random salt, unique per account. */
export function newSalt(bytes = 16) {
  return toBase64(crypto.getRandomValues(new Uint8Array(bytes)));
}

/**
 * Derive the stored hash for a secret.
 *
 * @param {string} secret the password or access code as typed
 * @param {string} salt base64, from `newSalt`
 */
export async function hashSecret(secret, salt, iterations = PBKDF2_ITERATIONS) {
  const key = await subtle().importKey('raw', encoder.encode(normalizeSecret(secret)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt: fromBase64(salt), iterations, hash: 'SHA-256' },
    key,
    256
  );
  return toBase64(new Uint8Array(bits));
}

/**
 * Check a typed secret against a stored account.
 *
 * Compares in constant time. That is close to pointless in a browser where
 * the attacker holds the hash anyway, but this function is meant to move to a
 * server unchanged, and there it matters.
 */
export async function verifySecret(secret, account) {
  if (!account?.salt || !account?.hash) return false;
  const candidate = await hashSecret(secret, account.salt, account.iterations ?? PBKDF2_ITERATIONS);
  return timingSafeEqual(candidate, account.hash);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Trim and normalise a typed secret.
 *
 * Unicode-normalised so a code typed on a Chinese IME matches one typed on a
 * US keyboard, and trimmed because phone keyboards add a trailing space and
 * nobody should be locked out by one.
 */
export function normalizeSecret(secret) {
  return String(secret ?? '').trim().normalize('NFKC');
}

/** Usernames are matched case- and space-insensitively. */
export function normalizeUsername(username) {
  return String(username ?? '').trim().toLowerCase().normalize('NFKC');
}

/**
 * An access code for a student or guardian.
 *
 * Digits and unambiguous consonants only: no O/0, no I/1/l, no vowels, so it
 * cannot spell anything and cannot be misread down a phone line. Grouped for
 * reading aloud, which is how these actually get delivered.
 */
const CODE_ALPHABET = '23456789CDFGHJKMNPQRTVWXY';

export function generateAccessCode(groups = 2, size = 4) {
  const bytes = crypto.getRandomValues(new Uint8Array(groups * size));
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  const out = [];
  for (let i = 0; i < groups; i += 1) out.push(chars.slice(i * size, (i + 1) * size).join(''));
  return out.join('-');
}

/**
 * Build an account record. Async because hashing is.
 *
 * `personId` is null for the coordinator, who has no roster row — see the
 * chat module for the same decision.
 */
export async function newAccount({ id, personId = null, role, username, secret, createdAt, status = 'active', claimedName = '' }) {
  if (!ACCOUNT_ROLES.includes(role)) {
    throw new TypeError(`Unknown account role: ${role}`);
  }
  const clean = normalizeUsername(username);
  if (!clean) throw new TypeError('An account needs a username.');

  const problem = describeSecretProblem(secret, role);
  if (problem) throw new RangeError(problem);

  const salt = newSalt();
  return {
    id,
    personId,
    role,
    username: clean,
    salt,
    hash: await hashSecret(secret, salt),
    iterations: PBKDF2_ITERATIONS,
    status: ACCOUNT_STATUSES.includes(status) ? status : 'pending',
    /* What they typed when signing themselves up, so the coordinator has
       something to recognise them by. Never trusted as identity. */
    claimedName: String(claimedName ?? '').trim(),
    createdAt: createdAt ?? new Date().toISOString(),
    lastSignInAt: null,
    disabled: false
  };
}

/**
 * Why a secret is unacceptable, or null if it is fine.
 *
 * Deliberately thin. A tutor is a volunteer, not an employee, and a wall of
 * complexity rules produces `Password1!` on a sticky note. Length is the rule
 * that actually helps; the rest is theatre.
 */
export function describeSecretProblem(secret, role = 'tutor') {
  const clean = normalizeSecret(secret);
  if (!clean) return 'Enter a password.';
  // Codes are generated, not chosen, so they are held to their own shape.
  if (CODE_ROLES.includes(role)) return clean.length < 6 ? 'That code looks too short.' : null;
  if (clean.length < 8) return 'Use at least 8 characters. A short phrase works well.';
  if (clean.length > 200) return 'That is too long.';
  return null;
}

/** The account matching a typed username, or null. Disabled ones do not match. */
export function findAccount(accounts, username) {
  const wanted = normalizeUsername(username);
  return (accounts ?? []).find((a) => a.username === wanted && !a.disabled) ?? null;
}

/**
 * Attempt a sign-in. Pure: returns a result, changes nothing.
 *
 * The failure message never distinguishes an unknown username from a wrong
 * password. Saying which one was wrong tells an attacker half the answer, and
 * tells anybody holding a leaked backup which accounts exist.
 *
 * @returns {Promise<{ok: true, account: object} | {ok: false, reason: string}>}
 */
export async function attemptSignIn(accounts, username, secret) {
  const account = findAccount(accounts, username);
  if (!account) {
    // Hash anyway, so a missing account does not return noticeably faster.
    await hashSecret(secret, newSalt());
    return { ok: false, reason: 'bad-credentials' };
  }
  const ok = await verifySecret(secret, account);
  return ok ? { ok: true, account } : { ok: false, reason: 'bad-credentials' };
}

/**
 * The viewAs value an account maps to.
 *
 * Keeps the existing role model exactly as it is — 'admin', a person id, or
 * `guardian:<studentId>` — so every screen, route and read-state key already
 * built keeps working, and accounts are additive rather than a rewrite.
 */
export function viewAsFor(account) {
  if (!account) return 'admin';
  if (account.role === 'admin') return 'admin';
  if (account.role === 'guardian') return `guardian:${account.personId}`;
  return account.personId;
}

/**
 * Whether this account has been recognised by a coordinator yet.
 *
 * The coordinator's own account is always in use — there is nobody above them
 * to approve it, and the first one is created by whoever already holds the
 * program file.
 */
export function isPending(account) {
  if (!account) return false;
  if (account.role === 'admin') return false;
  return account.status === 'pending' || !account.personId;
}

/** Accounts waiting for somebody to say who they are. */
export function pendingAccounts(data) {
  return (data?.accounts ?? []).filter((a) => isPending(a) && !a.disabled);
}

/** Whether anybody has set up sign-in yet. */
export function hasAccounts(data) {
  return (data?.accounts ?? []).length > 0;
}

/**
 * Who does not have an account yet, so the coordinator can see at a glance
 * who still needs a code rather than working it out from two lists.
 */
export function peopleWithoutAccounts(data) {
  const claimed = new Set((data.accounts ?? []).map((a) => `${a.role}:${a.personId}`));
  const out = [];
  for (const person of data.people ?? []) {
    if (person.role === 'tutor' && !claimed.has(`tutor:${person.id}`)) {
      out.push({ person, role: 'tutor' });
    }
    if (person.role === 'student') {
      if (!claimed.has(`student:${person.id}`)) out.push({ person, role: 'student' });
      if (!claimed.has(`guardian:${person.id}`)) out.push({ person, role: 'guardian' });
    }
  }
  return out;
}

/**
 * A username suggestion that is easy to read out over WeChat: the preferred
 * name plus a short disambiguator when two people share one.
 */
export function suggestUsername(person, role, existing = []) {
  const base = normalizeUsername(person.preferredName || person.name || role)
    .replace(/[^a-z0-9]+/g, '') || role;
  const stem = role === 'guardian' ? `${base}-parent` : base;
  const taken = new Set((existing ?? []).map((a) => a.username));
  if (!taken.has(stem)) return stem;
  for (let n = 2; n < 99; n += 1) {
    if (!taken.has(`${stem}${n}`)) return `${stem}${n}`;
  }
  return `${stem}-${Date.now().toString(36).slice(-4)}`;
}
