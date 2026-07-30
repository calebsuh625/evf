/**
 * store.js — the data layer.
 *
 * The exported JSON file is the source of truth. localStorage is a
 * convenience cache so a coordinator does not lose a half-finished session
 * log when a phone browser evicts the tab. If localStorage vanished
 * tomorrow, re-importing the export would lose nothing that mattered.
 *
 * Every shape change to the data model gets a MIGRATIONS entry and a
 * SCHEMA_VERSION bump. Old exports must keep opening: a coordinator's
 * backup from last spring is the program's memory.
 */

export const SCHEMA_VERSION = 1;

const STORAGE_KEY = 'evf.program.v1';
const LANG_KEY = 'evf.lang';

/* ------------------------------------------------------------------ *
 * Shape
 * ------------------------------------------------------------------ */

export function emptyProgram() {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: null,
    program: {
      name: 'Weekend Tutoring',
      adminTimeZone: guessTimeZone(),
      studentTimeZone: 'Asia/Shanghai',
      defaultSessionMinutes: 60,
      terms: []
    },
    tutors: [],
    students: [],
    matches: [],
    sessions: []
  };
}

export function guessTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

/* ------------------------------------------------------------------ *
 * Migrations
 * ------------------------------------------------------------------ */

/**
 * Keyed by the version being migrated FROM. Each returns data at version
 * key+1. Never edit a shipped migration — add the next one.
 */
const MIGRATIONS = {
  /**
   * 0 -> 1: the pre-versioned prototype had no schemaVersion, kept program
   * settings as loose top-level keys, and stored session length as an
   * end-time string. Normalise into the v1 shape.
   */
  0(data) {
    const base = emptyProgram();
    return {
      ...base,
      schemaVersion: 1,
      program: {
        ...base.program,
        name: data.programName ?? base.program.name,
        adminTimeZone: data.adminTimeZone ?? base.program.adminTimeZone,
        studentTimeZone: data.studentTimeZone ?? base.program.studentTimeZone
      },
      tutors: data.tutors ?? [],
      students: data.students ?? [],
      matches: data.matches ?? [],
      sessions: (data.sessions ?? []).map((s) => {
        if (s.durationMinutes != null || !s.endsAt || !s.startsAt) return s;
        const minutes = Math.round(
          (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 60000
        );
        const { endsAt, ...rest } = s;
        return { ...rest, durationMinutes: Number.isFinite(minutes) ? minutes : null };
      })
    };
  }
};

/**
 * Bring any historical export up to the current schema.
 * @returns {{data: object, applied: number[]}}
 */
export function migrate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Not a program file: expected a JSON object at the top level.');
  }

  let data = input;
  let version = Number.isInteger(data.schemaVersion) ? data.schemaVersion : 0;
  const applied = [];

  if (version > SCHEMA_VERSION) {
    throw new Error(
      `This file was saved by a newer version of the app (schema ${version}; ` +
      `this build understands ${SCHEMA_VERSION}). Update the app before importing.`
    );
  }

  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`No migration from schema version ${version}.`);
    data = step(data);
    applied.push(version);
    version = data.schemaVersion;
  }

  return { data: normalise(data), applied };
}

/** Fill in absent collections so views never guard against undefined. */
function normalise(data) {
  const base = emptyProgram();
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: data.exportedAt ?? null,
    program: { ...base.program, ...(data.program ?? {}) },
    tutors: Array.isArray(data.tutors) ? data.tutors : [],
    students: Array.isArray(data.students) ? data.students : [],
    matches: Array.isArray(data.matches) ? data.matches : [],
    sessions: Array.isArray(data.sessions) ? data.sessions : []
  };
}

/* ------------------------------------------------------------------ *
 * Integrity
 * ------------------------------------------------------------------ */

/**
 * Non-fatal report on referential integrity. Import never rejects a file for
 * these — a coordinator hand-editing JSON at 11pm should get their data
 * back plus a list of what looks off, not a wall.
 *
 * @returns {{errors: string[], warnings: string[]}}
 */
export function checkIntegrity(data) {
  const errors = [];
  const warnings = [];

  const tutorIds = new Set(data.tutors.map((t) => t.id));
  const studentIds = new Set(data.students.map((s) => s.id));
  const matchIds = new Set(data.matches.map((m) => m.id));

  dupes(data.tutors, 'tutor').forEach((m) => errors.push(m));
  dupes(data.students, 'student').forEach((m) => errors.push(m));
  dupes(data.matches, 'match').forEach((m) => errors.push(m));
  dupes(data.sessions, 'session').forEach((m) => errors.push(m));

  for (const m of data.matches) {
    if (!tutorIds.has(m.tutorId)) warnings.push(`Match ${m.id} points at unknown tutor ${m.tutorId}.`);
    if (!studentIds.has(m.studentId)) warnings.push(`Match ${m.id} points at unknown student ${m.studentId}.`);
  }

  for (const s of data.sessions) {
    if (s.matchId && !matchIds.has(s.matchId)) {
      warnings.push(`Session ${s.id} points at unknown match ${s.matchId}.`);
    }
    if (!tutorIds.has(s.tutorId)) warnings.push(`Session ${s.id} points at unknown tutor ${s.tutorId}.`);
    if (typeof s.startsAt !== 'string' || !s.startsAt.endsWith('Z')) {
      errors.push(`Session ${s.id} has a startsAt that is not an ISO UTC string.`);
    }
  }

  return { errors, warnings };
}

function dupes(list, label) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item?.id) { out.push(`A ${label} record has no id.`); continue; }
    if (seen.has(item.id)) out.push(`Duplicate ${label} id: ${item.id}.`);
    seen.add(item.id);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * In-memory state + subscribers
 * ------------------------------------------------------------------ */

let state = emptyProgram();
const listeners = new Set();

export function getState() {
  return state;
}

/** Subscribe to state changes. Returns an unsubscribe function. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (err) {
      console.error('[store] listener threw', err);
    }
  }
}

/**
 * Replace state via an updater, persist, notify.
 * @param {(draft: object) => object} updater must return the next state
 */
export function update(updater) {
  const next = updater(state);
  if (!next || typeof next !== 'object') throw new TypeError('update() must return the next state');
  state = normalise(next);
  persist();
  emit();
  return state;
}

export function replaceState(next) {
  return update(() => next);
}

/* ------------------------------------------------------------------ *
 * localStorage cache
 * ------------------------------------------------------------------ */

let persistTimer = null;

/** Debounced so typing into a form is not 40 serialisations. */
function persist() {
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 250);
}

export function persistNow() {
  persistTimer = null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    // Private browsing, disabled storage, or a full quota. The app keeps
    // working from memory; export is the real save mechanism.
    console.warn('[store] could not write cache:', err?.message ?? err);
    return false;
  }
}

/**
 * Read the cache into memory. Safe to call once at boot.
 * @returns {{loaded: boolean, migrated: number[], error: string|null}}
 */
export function loadFromCache() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    return { loaded: false, migrated: [], error: `Storage unavailable: ${err?.message ?? err}` };
  }
  if (!raw) return { loaded: false, migrated: [], error: null };

  try {
    const { data, applied } = migrate(JSON.parse(raw));
    state = data;
    if (applied.length) persistNow();
    emit();
    return { loaded: true, migrated: applied, error: null };
  } catch (err) {
    // Do not delete it. A corrupt cache is still the only copy of something.
    console.error('[store] cache unreadable, starting empty:', err);
    return { loaded: false, migrated: [], error: err.message };
  }
}

export function clearCache() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* nothing to do */ }
}

export function resetAll() {
  clearCache();
  state = emptyProgram();
  emit();
  return state;
}

/** Rough byte size of the cached copy, for the data screen. */
export function cacheSizeBytes() {
  try {
    return new Blob([localStorage.getItem(STORAGE_KEY) ?? '']).size;
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------ *
 * Export / import — the real save mechanism
 * ------------------------------------------------------------------ */

/** Pretty-printed so a human can read and diff it. */
export function toJson(data = state) {
  const payload = {
    ...data,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString()
  };
  return JSON.stringify(payload, null, 2);
}

export function suggestedFilename(data = state) {
  const date = new Date().toISOString().slice(0, 10);
  const slug = (data.program?.name ?? 'program')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'program';
  return `${slug}-${date}.json`;
}

/**
 * Trigger a file download. This is the only function in store.js that
 * touches the DOM, and it is here rather than in a view because "the
 * export is the source of truth" is a data-layer concern.
 */
export function downloadJson(data = state) {
  const filename = suggestedFilename(data);
  const blob = new Blob([toJson(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Revoke late: Safari needs the URL alive past the click.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return filename;
}

/**
 * Import a program file, replacing everything in memory.
 *
 * @param {string} text raw JSON
 * @returns {{data: object, migrated: number[], integrity: {errors:string[], warnings:string[]}}}
 * @throws if the text is not parseable JSON or not a program file
 */
export function importJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`That file is not valid JSON: ${err.message}`);
  }

  const { data, applied } = migrate(parsed);
  const integrity = checkIntegrity(data);

  replaceState(data);
  persistNow();

  return { data, migrated: applied, integrity };
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsText(file);
  });
}

/**
 * Load the committed demo dataset.
 *
 * Resolved against import.meta.url rather than the page path so it works at
 * the domain root and under a GitHub Pages project subpath (/evf/) without
 * either being configured anywhere.
 */
export async function loadSampleData() {
  const url = new URL('../data/sample.json', import.meta.url);
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(
      'Could not read data/sample.json. If this page was opened as a file:// ' +
      'URL, serve the folder over HTTP instead.'
    );
  }
  if (!res.ok) throw new Error(`Could not read data/sample.json (HTTP ${res.status}).`);
  return importJson(await res.text());
}

/* ------------------------------------------------------------------ *
 * Language preference — a UI setting, but it belongs with persistence
 * ------------------------------------------------------------------ */

export function loadLangPreference() {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

export function saveLangPreference(lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch { /* preference is not worth an error */ }
}

/* ------------------------------------------------------------------ *
 * Ids
 * ------------------------------------------------------------------ */

/**
 * Readable, collision-resistant, and stable in an export a human might edit.
 * Not cryptographic; nothing here needs it to be.
 */
export function newId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  const stamp = Date.now().toString(36).slice(-4);
  return `${prefix}_${stamp}${rand}`;
}
