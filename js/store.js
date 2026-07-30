/**
 * store.js — the data layer and the data model.
 *
 * The exported JSON file is the source of truth. localStorage is a
 * convenience cache so a coordinator does not lose a half-finished session
 * log when a phone browser evicts the tab. If localStorage vanished
 * tomorrow, re-importing the export would lose nothing that mattered.
 *
 * ── The document ─────────────────────────────────────────────────────
 *
 *   {
 *     version: 2,
 *     program:      { name, adminTimeZone, studentTimeZone, ... },
 *     people:       [{ id, role, name, preferredName, email, wechat,
 *                      timezone, locale, active, ...roleFields }],
 *     pairings:     [{ id, tutorId, studentId, status, startedAt, endedAt, notes }],
 *     sessions:     [{ id, pairingId, scheduledAt, occurred, durationMinutes,
 *                      prepMinutes, followupMinutes, covered, homework, loggedAt }],
 *     availability: [{ personId, weekday, startTime, endTime, timezone }]
 *   }
 *
 * Tutors and students are one table with a `role` discriminator. They share
 * most of their fields, every screen that lists "people" wants both, and a
 * tutor who later becomes a student coordinator should not need a new row.
 *
 * Sessions hang off `pairingId`, not off a tutor and a student directly. The
 * pairing is the thing that exists over time; a session is one instance of
 * it. Resolving a session to its people goes through the pairing, which is
 * why hours.js takes the pairings table as an argument.
 *
 * Availability is its own table rather than nested in a person. It is
 * queried by time far more than it is read per-person, rows get added and
 * removed independently of the person, and a nested array is the shape that
 * makes bulk CSV import awkward.
 *
 * ── Time ─────────────────────────────────────────────────────────────
 *
 * Instants (`scheduledAt`, `loggedAt`, `startedAt`, `endedAt`) are ISO 8601
 * UTC strings, always. Recurring availability is a weekday plus a wall-clock
 * range plus a zone, and must NOT be normalised to UTC — see js/time.js.
 *
 * ── Changing the model ───────────────────────────────────────────────
 *
 * Add a MIGRATIONS entry keyed by the version you are migrating FROM, bump
 * SCHEMA_VERSION, and add a fixture test. Never edit a shipped migration.
 * Old exports must keep opening: a coordinator's backup from last spring is
 * the program's memory.
 */

import { canPost, composeMessage } from './chat.js';
import {
  parseCsvToObjects,
  objectsToCsv,
  parseList,
  formatList,
  parseBoolean,
  parseNumber
} from './csv.js';
import { isValidTimeZone, parseHhMm } from './time.js';

export const SCHEMA_VERSION = 6;

const STORAGE_KEY = 'evf.program.v1';
const LANG_KEY = 'evf.lang';
const VIEW_AS_KEY = 'evf.viewAs';

export const ROLES = Object.freeze(['tutor', 'student']);

/**
 * The club is in California, so that is the coordinator's clock and the
 * default for a newly added tutor. A constant rather than a guess from the
 * browser: a coordinator travelling, or opening the app on a school machine
 * set to UTC, must not silently reinterpret every date in the program.
 */
export const PROGRAM_TIME_ZONE = 'America/Los_Angeles';

/** Mainland China has one time zone and no daylight saving. */
export const STUDENT_TIME_ZONE = 'Asia/Shanghai';
export const PAIRING_STATUSES = Object.freeze(['active', 'paused', 'ended']);

/** English levels, coarsest first. Tutors say which they are comfortable with. */
export const ENGLISH_LEVELS = Object.freeze(['beginner', 'elementary', 'intermediate', 'advanced']);

/**
 * Who can be in a class thread.
 *
 * `admin` has no person record — the coordinator is whoever is holding the
 * role, not a row in the roster.
 */
export const MESSAGE_ROLES = Object.freeze(['tutor', 'student', 'guardian', 'admin']);

/**
 * The program teaches English and only English, so a tutor's skills and a
 * student's goals are drawn from the same short list. Free text is still
 * accepted — a student who writes something not on this list has said
 * something useful, and the matcher simply will not find a keyword match.
 */
export const ENGLISH_SKILLS = Object.freeze([
  'conversation', 'reading', 'writing', 'grammar',
  'pronunciation', 'vocabulary', 'listening', 'exam prep', 'presentation skills'
]);

/* ------------------------------------------------------------------ *
 * Shape
 * ------------------------------------------------------------------ */

export function emptyProgram() {
  return {
    version: SCHEMA_VERSION,
    exportedAt: null,
    program: {
      name: 'PeerBridges 2.0',
      adminTimeZone: PROGRAM_TIME_ZONE,
      studentTimeZone: STUDENT_TIME_ZONE,
      defaultSessionMinutes: 60,
      // True only for the committed demo dataset. Deliberately part of the
      // document rather than a browser flag, so an export of the demo still
      // announces itself to whoever opens it next.
      sampleData: false,
      terms: []
    },
    people: [],
    pairings: [],
    sessions: [],
    availability: [],
    messages: []
  };
}

/**
 * Only reachable from the two legacy migrations below, which is why its
 * fallback is still Eastern: those are shipped and must not be edited.
 *
 * Nothing current calls it. A new program and a newly added tutor both get
 * `PROGRAM_TIME_ZONE` — the club tutors out of California, and the clock must
 * not depend on what machine somebody happened to open the app on.
 */
export function guessTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

/** A tutor with every field present, so forms and imports agree on the shape. */
export function newTutor(fields = {}) {
  return {
    id: fields.id ?? newId('tut'),
    role: 'tutor',
    name: '',
    preferredName: '',
    email: '',
    wechat: '',
    timezone: PROGRAM_TIME_ZONE,
    locale: 'en',
    active: true,
    school: '',
    grade: null,
    subjects: [],
    levelsComfortable: [],
    maxStudents: 2,
    // Separate from `active`. A tutor mid-term with a full plate is still very
    // much active; they just are not looking for another student this week.
    acceptingStudents: true,
    // Matched against a student's interests. A shared one is never why a
    // pairing happens, but it is often why the first session goes well.
    interests: [],
    bio: '',
    meetingLink: '',
    createdAt: new Date().toISOString(),
    ...fields,
    role: 'tutor'
  };
}

/**
 * A student with every field present.
 *
 * Only `name` is ever meaningfully required, and even that accepts whatever
 * the student wants to be called. Principle 5: students and guardians never
 * have required data entry, so every guardian field defaults to empty and
 * nothing downstream may assume otherwise.
 */
export function newStudent(fields = {}) {
  return {
    id: fields.id ?? newId('stu'),
    role: 'student',
    name: '',
    preferredName: '',
    email: '',
    wechat: '',
    timezone: STUDENT_TIME_ZONE,
    locale: 'zh',
    active: true,
    grade: null,
    englishLevel: 'beginner',
    goals: [],
    interests: [],
    guardianName: '',
    guardianWechat: '',
    guardianEmail: '',
    createdAt: new Date().toISOString(),
    ...fields,
    role: 'student'
  };
}

export function newPairing(fields = {}) {
  return {
    id: fields.id ?? newId('pair'),
    tutorId: '',
    studentId: '',
    status: 'active',
    startedAt: new Date().toISOString(),
    endedAt: null,
    notes: '',
    ...fields
  };
}

export function newSession(fields = {}) {
  return {
    id: fields.id ?? newId('ses'),
    pairingId: '',
    scheduledAt: new Date().toISOString(),
    occurred: true,
    durationMinutes: 60,
    prepMinutes: 0,
    followupMinutes: 0,
    covered: '',
    homework: '',
    loggedAt: new Date().toISOString(),
    ...fields
  };
}

/**
 * A session that is on the calendar but has not been logged yet.
 *
 * `loggedAt: null` is the marker, and `occurred: null` follows from it: until
 * a tutor says otherwise, whether it happened is genuinely unknown. Writing
 * `false` there would read as "did not happen", and writing `true` would count
 * hours nobody has confirmed.
 */
export function newScheduledSession(fields = {}) {
  return {
    id: fields.id ?? newId('ses'),
    pairingId: '',
    scheduledAt: new Date().toISOString(),
    occurred: null,
    durationMinutes: null,
    prepMinutes: 0,
    followupMinutes: 0,
    covered: '',
    homework: '',
    loggedAt: null,
    ...fields
  };
}

/** True once a tutor has actually filled this in. */
export function isLogged(session) {
  return session?.loggedAt != null;
}

/* ------------------------------------------------------------------ *
 * Migrations
 * ------------------------------------------------------------------ */

/**
 * Keyed by the version being migrated FROM. Each returns data one version
 * newer. Never edit a shipped migration — add the next one.
 */
const MIGRATIONS = {
  /**
   * 5 -> 6: adds `messages`, one thread per pairing. Nothing existing has any,
   * so this is an empty table plus the collection so views never guard for it.
   */
  5(data) {
    return { ...data, version: 6, messages: Array.isArray(data.messages) ? data.messages : [] };
  },

  /**
   * 4 -> 5: the program gains `sampleData`, so the app can say out loud when
   * what is on screen is the demo. Anything that already exists is somebody's
   * real program, so it migrates to false.
   */
  4(data) {
    return {
      ...data,
      version: 5,
      program: { ...(data.program ?? {}), sampleData: data.program?.sampleData === true }
    };
  },

  /**
   * 0 -> 1: the pre-versioned prototype had no version field, kept program
   * settings as loose top-level keys, and stored session length as an end
   * timestamp.
   */
  0(data) {
    return {
      version: 1,
      exportedAt: data.exportedAt ?? null,
      program: {
        name: data.programName ?? 'Weekend Tutoring',
        adminTimeZone: data.adminTimeZone ?? guessTimeZone(),
        studentTimeZone: data.studentTimeZone ?? 'Asia/Shanghai',
        defaultSessionMinutes: 60,
        terms: []
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
  },

  /**
   * 1 -> 2: separate `tutors` and `students` tables become one `people`
   * table with a role discriminator; `matches` becomes `pairings`; nested
   * per-person availability is lifted into its own table; sessions lose
   * their denormalised tutorId/studentId in favour of pairingId, and their
   * `status` string becomes an `occurred` boolean.
   *
   * Sessions that recorded a tutor and student but no match get a
   * reconstructed pairing, because dropping them would silently delete
   * logged volunteer hours.
   */
  1(data) {
    const people = [
      ...(data.tutors ?? []).map((t) => liftTutor(t)),
      ...(data.students ?? []).map((s) => liftStudent(s))
    ];

    const availability = [
      ...(data.tutors ?? []).flatMap((t) => liftAvailability(t)),
      ...(data.students ?? []).flatMap((s) => liftAvailability(s))
    ];

    const pairings = (data.matches ?? []).map((m) => ({
      id: m.id ?? newId('pair'),
      tutorId: m.tutorId ?? '',
      studentId: m.studentId ?? '',
      status: m.status === 'ended' ? 'ended' : m.status === 'paused' ? 'paused' : 'active',
      startedAt: m.startedAt ?? m.createdAt ?? null,
      endedAt: m.endedAt ?? null,
      // The old model pinned one subject per match. It is not a field any
      // more, so carry it into notes rather than dropping it.
      notes: [m.notes, m.subject ? `Subject at pairing time: ${m.subject}` : null]
        .filter(Boolean)
        .join(' ')
    }));

    const pairingByPair = new Map(pairings.map((p) => [`${p.tutorId}|${p.studentId}`, p]));

    const sessions = (data.sessions ?? []).map((s) => {
      let pairingId = s.matchId ?? '';
      if (!pairingId || !pairings.some((p) => p.id === pairingId)) {
        const key = `${s.tutorId ?? ''}|${s.studentId ?? ''}`;
        let pairing = pairingByPair.get(key);
        if (!pairing && s.tutorId && s.studentId) {
          pairing = {
            id: newId('pair'),
            tutorId: s.tutorId,
            studentId: s.studentId,
            status: 'ended',
            startedAt: s.startsAt ?? null,
            endedAt: s.startsAt ?? null,
            notes: 'Reconstructed during the v1 to v2 migration from a session with no match.'
          };
          pairings.push(pairing);
          pairingByPair.set(key, pairing);
        }
        pairingId = pairing?.id ?? '';
      }

      return {
        id: s.id ?? newId('ses'),
        pairingId,
        scheduledAt: s.startsAt ?? null,
        occurred: s.status === 'held',
        durationMinutes: s.status === 'held' ? (s.durationMinutes ?? 0) : 0,
        prepMinutes: 0,
        followupMinutes: 0,
        covered: s.note ?? '',
        homework: '',
        loggedAt: s.loggedAt ?? s.startsAt ?? null
      };
    });

    return {
      version: 2,
      exportedAt: data.exportedAt ?? null,
      program: { ...(data.program ?? {}) },
      people,
      pairings,
      sessions,
      availability
    };
  }
  ,

  /**
   * 3 -> 4: tutors gain `interests`, so the matcher can notice that a tutor
   * and a student both like chess. Empty is a fine answer and simply scores
   * nothing.
   */
  3(data) {
    return {
      ...data,
      version: 4,
      people: (data.people ?? []).map((person) =>
        person.role === 'tutor' && person.interests === undefined
          ? { ...person, interests: [] }
          : person
      )
    };
  },

  /**
   * 2 -> 3: tutors gain `acceptingStudents`, which is separate from `active`
   * — a tutor with a full plate is still active, just not looking for another
   * student. Sessions may now carry `occurred: null`, meaning scheduled but
   * not yet logged; every session that already exists has been logged, so
   * this migration leaves them alone.
   */
  2(data) {
    return {
      ...data,
      version: 3,
      people: (data.people ?? []).map((person) =>
        person.role === 'tutor' && person.acceptingStudents === undefined
          ? { ...person, acceptingStudents: true }
          : person
      )
    };
  }
};

function liftCommon(person, role) {
  return {
    id: person.id,
    role,
    name: person.displayName ?? person.name ?? '',
    preferredName: person.preferredName ?? '',
    email: person.email ?? '',
    wechat: person.wechat ?? '',
    timezone: person.timeZone ?? person.timezone ?? (role === 'student' ? 'Asia/Shanghai' : guessTimeZone()),
    locale: person.locale ?? (role === 'student' ? 'zh' : 'en'),
    active: person.active !== false,
    createdAt: person.createdAt ?? null
  };
}

function liftTutor(t) {
  return {
    ...liftCommon(t, 'tutor'),
    school: t.school ?? '',
    grade: t.gradeLevel ?? t.grade ?? null,
    subjects: t.subjects ?? [],
    // The v1 model had no notion of which levels a tutor could handle.
    // Empty means "unstated", which the scorer treats as no constraint.
    levelsComfortable: t.levelsComfortable ?? [],
    maxStudents: t.maxStudents ?? 2,
    bio: t.notes ?? t.bio ?? '',
    meetingLink: t.meetingLink ?? ''
  };
}

function liftStudent(s) {
  return {
    ...liftCommon(s, 'student'),
    grade: s.gradeLevel ?? s.grade ?? null,
    englishLevel: s.englishLevel ?? 'beginner',
    // v1 called these "subjects"; from a student's side they are goals.
    goals: s.goals ?? s.subjects ?? [],
    interests: s.interests ?? [],
    guardianName: s.guardianName ?? '',
    guardianWechat: s.guardianWechat ?? '',
    guardianEmail: s.guardianEmail ?? (typeof s.guardianContact === 'string' ? s.guardianContact : '')
  };
}

function liftAvailability(person) {
  return (person.availability ?? []).map((slot) => ({
    personId: person.id,
    weekday: slot.weekday ?? slot.day ?? 0,
    startTime: slot.startTime ?? slot.start ?? '00:00',
    endTime: slot.endTime ?? slot.end ?? '00:00',
    timezone: slot.timezone ?? slot.tz ?? person.timeZone ?? person.timezone ?? 'UTC'
  }));
}

/**
 * Bring any historical export up to the current schema.
 *
 * Called on every load and every import. Accepts the pre-versioned shape
 * (no version field at all) as version 0.
 *
 * @returns {{data: object, applied: number[]}}
 */
export function migrate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Not a program file: expected a JSON object at the top level.');
  }

  let data = input;
  let version = detectVersion(data);
  const applied = [];

  if (version > SCHEMA_VERSION) {
    throw new Error(
      `This file was saved by a newer version of the app (version ${version}; ` +
      `this build understands ${SCHEMA_VERSION}). Update the app before importing.`
    );
  }

  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`No migration path from version ${version}.`);
    data = step(data);
    applied.push(version);
    if (detectVersion(data) !== version + 1) {
      throw new Error(`Migration from version ${version} did not produce version ${version + 1}.`);
    }
    version += 1;
  }

  return { data: normalise(data), applied };
}

function detectVersion(data) {
  if (Number.isInteger(data.version)) return data.version;
  // v1 wrote `schemaVersion`; v0 wrote nothing at all.
  if (Number.isInteger(data.schemaVersion)) return data.schemaVersion;
  return 0;
}

/** Fill in absent collections so views never guard against undefined. */
function normalise(data) {
  const base = emptyProgram();
  return {
    version: SCHEMA_VERSION,
    exportedAt: data.exportedAt ?? null,
    program: { ...base.program, ...(data.program ?? {}) },
    people: asArray(data.people),
    pairings: asArray(data.pairings),
    sessions: asArray(data.sessions),
    availability: asArray(data.availability),
    messages: asArray(data.messages)
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function isIsoUtc(value) {
  return typeof value === 'string' && ISO_UTC.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * Structural check, run before anything is allowed to replace live state.
 *
 * `errors` are things that would corrupt the app: bad types, duplicate ids,
 * references to records that do not exist. An import carrying any of these is
 * refused outright — a half-applied import is worse than a rejected one.
 *
 * `warnings` are things that are merely odd: a tutor with no availability, an
 * unrecognised English level. These pass through and get surfaced, because a
 * coordinator hand-editing JSON at 11pm should get their data back plus a
 * list of what looks off.
 *
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validate(data) {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== 'object') {
    return { errors: ['Not a program file: expected a JSON object.'], warnings };
  }

  for (const key of ['people', 'pairings', 'sessions', 'availability', 'messages']) {
    if (!Array.isArray(data[key])) errors.push(`"${key}" must be an array.`);
  }
  if (errors.length) return { errors, warnings };

  /* People */
  const personIds = new Set();
  const tutorIds = new Set();
  const studentIds = new Set();

  data.people.forEach((p, i) => {
    const at = `people[${i}]`;
    if (!p || typeof p !== 'object') { errors.push(`${at} is not an object.`); return; }
    if (!p.id || typeof p.id !== 'string') { errors.push(`${at} has no id.`); return; }
    if (personIds.has(p.id)) { errors.push(`Duplicate person id "${p.id}".`); return; }
    personIds.add(p.id);

    if (!ROLES.includes(p.role)) {
      errors.push(`Person "${p.id}" has role "${p.role}"; expected one of ${ROLES.join(', ')}.`);
      return;
    }
    if (p.role === 'tutor') tutorIds.add(p.id); else studentIds.add(p.id);

    if (typeof p.name !== 'string' || p.name.trim() === '') {
      warnings.push(`Person "${p.id}" has no name.`);
    }
    if (p.timezone != null && !isValidTimeZone(p.timezone)) {
      errors.push(`Person "${p.id}" has an unknown time zone "${p.timezone}".`);
    }
    if (p.role === 'tutor') {
      if (p.maxStudents != null && !(Number.isFinite(Number(p.maxStudents)) && Number(p.maxStudents) >= 0)) {
        errors.push(`Tutor "${p.id}" has a non-numeric maxStudents "${p.maxStudents}".`);
      }
      for (const field of ['subjects', 'levelsComfortable', 'interests']) {
        if (p[field] != null && !Array.isArray(p[field])) {
          errors.push(`Tutor "${p.id}" field "${field}" must be an array.`);
        }
      }
    } else {
      for (const field of ['goals', 'interests']) {
        if (p[field] != null && !Array.isArray(p[field])) {
          errors.push(`Student "${p.id}" field "${field}" must be an array.`);
        }
      }
      if (p.englishLevel && !ENGLISH_LEVELS.includes(p.englishLevel)) {
        warnings.push(`Student "${p.id}" has an unrecognised English level "${p.englishLevel}".`);
      }
    }
  });

  /* Pairings */
  const pairingIds = new Set();
  data.pairings.forEach((p, i) => {
    const at = `pairings[${i}]`;
    if (!p || typeof p !== 'object') { errors.push(`${at} is not an object.`); return; }
    if (!p.id || typeof p.id !== 'string') { errors.push(`${at} has no id.`); return; }
    if (pairingIds.has(p.id)) { errors.push(`Duplicate pairing id "${p.id}".`); return; }
    pairingIds.add(p.id);

    if (!PAIRING_STATUSES.includes(p.status)) {
      errors.push(`Pairing "${p.id}" has status "${p.status}"; expected one of ${PAIRING_STATUSES.join(', ')}.`);
    }
    if (!personIds.has(p.tutorId)) {
      errors.push(`Pairing "${p.id}" references tutor "${p.tutorId}", who is not in this file.`);
    } else if (!tutorIds.has(p.tutorId)) {
      errors.push(`Pairing "${p.id}" references "${p.tutorId}" as a tutor, but that person is a student.`);
    }
    if (!personIds.has(p.studentId)) {
      errors.push(`Pairing "${p.id}" references student "${p.studentId}", who is not in this file.`);
    } else if (!studentIds.has(p.studentId)) {
      errors.push(`Pairing "${p.id}" references "${p.studentId}" as a student, but that person is a tutor.`);
    }
    for (const field of ['startedAt', 'endedAt']) {
      if (p[field] != null && !isIsoUtc(p[field])) {
        errors.push(`Pairing "${p.id}" field "${field}" is not an ISO 8601 UTC string: "${p[field]}".`);
      }
    }
    if (p.status === 'ended' && p.endedAt == null) {
      warnings.push(`Pairing "${p.id}" is ended but has no endedAt.`);
    }
  });

  /* Sessions */
  const sessionIds = new Set();
  data.sessions.forEach((s, i) => {
    const at = `sessions[${i}]`;
    if (!s || typeof s !== 'object') { errors.push(`${at} is not an object.`); return; }
    if (!s.id || typeof s.id !== 'string') { errors.push(`${at} has no id.`); return; }
    if (sessionIds.has(s.id)) { errors.push(`Duplicate session id "${s.id}".`); return; }
    sessionIds.add(s.id);

    if (!pairingIds.has(s.pairingId)) {
      errors.push(`Session "${s.id}" references pairing "${s.pairingId}", which is not in this file.`);
    }
    if (!isIsoUtc(s.scheduledAt)) {
      errors.push(`Session "${s.id}" scheduledAt is not an ISO 8601 UTC string: "${s.scheduledAt}".`);
    }
    if (s.loggedAt != null && !isIsoUtc(s.loggedAt)) {
      errors.push(`Session "${s.id}" loggedAt is not an ISO 8601 UTC string: "${s.loggedAt}".`);
    }
    // A session on the calendar but not yet logged has occurred: null. Once
    // loggedAt is set, a tutor has answered and it must be a real boolean.
    if (s.loggedAt == null) {
      if (s.occurred !== null && typeof s.occurred !== 'boolean') {
        errors.push(`Session "${s.id}" is not logged, so "occurred" must be null or a boolean, not "${s.occurred}".`);
      }
    } else if (typeof s.occurred !== 'boolean') {
      errors.push(`Session "${s.id}" field "occurred" must be true or false, not "${s.occurred}".`);
    }
    for (const field of ['durationMinutes', 'prepMinutes', 'followupMinutes']) {
      const value = s[field];
      if (value == null) continue;
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0) {
        errors.push(`Session "${s.id}" field "${field}" must be a number of minutes, not "${value}".`);
      }
    }
  });

  /* Availability */
  data.availability.forEach((a, i) => {
    const at = `availability[${i}]`;
    if (!a || typeof a !== 'object') { errors.push(`${at} is not an object.`); return; }
    if (!personIds.has(a.personId)) {
      errors.push(`${at} references person "${a.personId}", who is not in this file.`);
      return;
    }
    if (!Number.isInteger(a.weekday) || a.weekday < 0 || a.weekday > 6) {
      errors.push(`${at} weekday must be an integer 0 (Sunday) to 6 (Saturday), not "${a.weekday}".`);
    }
    for (const field of ['startTime', 'endTime']) {
      try {
        parseHhMm(a[field]);
      } catch {
        errors.push(`${at} ${field} must be "HH:MM", not "${a[field]}".`);
      }
    }
    if (!isValidTimeZone(a.timezone)) {
      errors.push(`${at} has an unknown time zone "${a.timezone}".`);
    }
  });

  /* Messages */
  const messageIds = new Set();
  (data.messages ?? []).forEach((m, i) => {
    const at = `messages[${i}]`;
    if (!m || typeof m !== 'object') { errors.push(`${at} is not an object.`); return; }
    if (!m.id || typeof m.id !== 'string') { errors.push(`${at} has no id.`); return; }
    if (messageIds.has(m.id)) { errors.push(`Duplicate message id "${m.id}".`); return; }
    messageIds.add(m.id);

    if (!pairingIds.has(m.pairingId)) {
      errors.push(`Message "${m.id}" belongs to pairing "${m.pairingId}", which is not in this file.`);
    }
    if (!MESSAGE_ROLES.includes(m.authorRole)) {
      errors.push(`Message "${m.id}" has author role "${m.authorRole}"; expected one of ${MESSAGE_ROLES.join(', ')}.`);
    }
    // The coordinator is not a person record, so only the others resolve.
    if (m.authorRole !== 'admin' && !personIds.has(m.authorId)) {
      errors.push(`Message "${m.id}" was written by "${m.authorId}", who is not in this file.`);
    }
    if (!isIsoUtc(m.sentAt)) {
      errors.push(`Message "${m.id}" sentAt is not an ISO 8601 UTC string: "${m.sentAt}".`);
    }
    if (typeof m.body !== 'string') errors.push(`Message "${m.id}" has no body.`);
    if (m.deletedAt != null && !isIsoUtc(m.deletedAt)) {
      errors.push(`Message "${m.id}" deletedAt is not an ISO 8601 UTC string.`);
    }
  });

  /* Soft observations */
  for (const person of data.people) {
    if (person.active === false) continue;
    if (!data.availability.some((a) => a.personId === person.id)) {
      warnings.push(`${person.name || person.id} is active but has no availability, so they cannot be matched.`);
    }
  }

  return { errors, warnings };
}

/** Aggregate errors into one message a human can act on. */
function validationMessage(errors) {
  const shown = errors.slice(0, 8);
  const rest = errors.length - shown.length;
  return [
    `That file has ${errors.length} problem${errors.length === 1 ? '' : 's'} and was not imported:`,
    ...shown.map((e) => `  • ${e}`),
    rest > 0 ? `  • …and ${rest} more.` : null,
    'Nothing was changed.'
  ].filter(Boolean).join('\n');
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
 * @param {(current: object) => object} updater must return the next state
 */
export function update(updater) {
  const next = updater(state);
  if (!next || typeof next !== 'object') throw new TypeError('update() must return the next state');
  state = normalise(next);
  save();
  emit();
  return state;
}

export function replaceState(next) {
  return update(() => next);
}

/* ------------------------------------------------------------------ *
 * load / save / reset
 * ------------------------------------------------------------------ */

let saveTimer = null;

/**
 * Persist to the localStorage cache. Debounced, so typing into a form is not
 * forty serialisations.
 */
export function save() {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}

export function saveNow() {
  saveTimer = null;
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
 * Read the cache into memory, migrating on the way. Safe to call once at boot.
 *
 * A cache that fails validation is left on disk untouched and reported: it is
 * still the only copy of something, and silently discarding it would be the
 * one unrecoverable move available here.
 *
 * @returns {{loaded: boolean, migrated: number[], warnings: string[], error: string|null}}
 */
export function load() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    return { loaded: false, migrated: [], warnings: [], error: `Storage unavailable: ${err?.message ?? err}` };
  }
  if (!raw) return { loaded: false, migrated: [], warnings: [], error: null };

  try {
    const { data, applied } = migrate(JSON.parse(raw));
    const { errors, warnings } = validate(data);
    if (errors.length) {
      console.error('[store] cached data failed validation, starting empty:', errors);
      return { loaded: false, migrated: [], warnings: [], error: validationMessage(errors) };
    }
    state = data;
    if (applied.length) saveNow();
    emit();
    return { loaded: true, migrated: applied, warnings, error: null };
  } catch (err) {
    console.error('[store] cache unreadable, starting empty:', err);
    return { loaded: false, migrated: [], warnings: [], error: err.message };
  }
}

/** Clear the cache and return to an empty program. */
export function reset() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* nothing to do */ }
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
 * JSON export / import
 * ------------------------------------------------------------------ */

/** Pretty-printed so a human can read and diff it. */
export function toJson(data = state) {
  const payload = {
    ...data,
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString()
  };
  return JSON.stringify(payload, null, 2);
}

export function suggestedFilename(data = state, extension = 'json') {
  const date = new Date().toISOString().slice(0, 10);
  const slug = (data.program?.name ?? 'program')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'program';
  return `${slug}-${date}.${extension}`;
}

/**
 * Trigger a browser download. The only DOM-touching code in this module, and
 * it lives here because "the export is the source of truth" is a data-layer
 * concern rather than a screen's.
 */
function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
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

/** Download the whole program as one dated JSON file. */
export function exportJson(data = state) {
  return download(suggestedFilename(data, 'json'), toJson(data), 'application/json');
}

/**
 * Parse and validate JSON text without touching live state.
 *
 * Exposed separately from importJson so the round-trip test can exercise it
 * without writing to the localStorage key the real app uses.
 *
 * @returns {{data: object, migrated: number[], warnings: string[]}}
 * @throws {Error} with a human-readable message; state is untouched
 */
export function parseProgramJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`That file is not valid JSON: ${err.message}`);
  }

  const { data, applied } = migrate(parsed);
  const { errors, warnings } = validate(data);
  if (errors.length) throw new Error(validationMessage(errors));

  return { data, migrated: applied, warnings };
}

/**
 * Import a program file, replacing everything in memory.
 *
 * Validated in full before anything is replaced: a malformed file is refused
 * with a clear message and leaves the current program exactly as it was.
 *
 * @param {File|Blob|string} file a File from an <input>, or raw JSON text
 * @returns {Promise<{data: object, migrated: number[], warnings: string[]}>}
 */
export async function importJson(file) {
  const text = typeof file === 'string' ? file : await readFileAsText(file);
  const result = parseProgramJson(text);
  replaceState(result.data);
  saveNow();
  return result;
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file?.name ?? 'that file'}.`));
    reader.readAsText(file);
  });
}

/**
 * Load the committed demo dataset.
 *
 * Resolved against import.meta.url rather than the page path so it works at
 * a domain root and under a GitHub Pages project subpath alike, without
 * either being configured anywhere.
 */
export async function loadSampleData() {
  const url = new URL('../data/sample.json', import.meta.url);
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(
      'Could not read data/sample.json. If this page was opened as a file:// ' +
      'URL, serve the folder over HTTP instead.'
    );
  }
  if (!res.ok) throw new Error(`Could not read data/sample.json (HTTP ${res.status}).`);
  const result = await importJson(await res.text());

  // Belt and braces: the committed file says so, and so does the loader, so a
  // hand-edited sample.json cannot quietly lose the marker.
  if (getState().program.sampleData !== true) markAsSampleData(true);
  return result;
}

/**
 * Mark the loaded program as demo data, or as real.
 *
 * Clearing it is the coordinator's call and nothing else's: somebody who loads
 * the demo, deletes it and types in their own roster has real data, and only
 * they know that.
 */
export function markAsSampleData(isSample) {
  update((current) => ({
    ...current,
    program: { ...current.program, sampleData: Boolean(isSample) }
  }));
  return getState().program.sampleData;
}

/** True when what is loaded is the demo dataset. */
export function isSampleData(data = state) {
  return data.program?.sampleData === true;
}

/* ------------------------------------------------------------------ *
 * CSV export / import
 * ------------------------------------------------------------------ */

/**
 * Column definitions per table. `to` reads a record into a cell; `from`
 * reads a cell back into a record. Symmetric on purpose, so a CSV export
 * re-imports.
 */
const CSV_TABLES = {
  messages: {
    label: 'Messages',
    columns: [
      ['id', (m) => m.id, (c) => c || undefined],
      ['pairingId', (m) => m.pairingId, (c) => c],
      ['authorId', (m) => m.authorId, (c) => c],
      ['authorRole', (m) => m.authorRole, (c) => c],
      ['sentAt', (m) => m.sentAt, (c) => c],
      ['body', (m) => m.body, (c) => c],
      ['deletedAt', (m) => m.deletedAt ?? '', (c) => c || null]
    ],
    rows: (data) => data.messages,
    key: 'messages'
  },
  tutors: {
    label: 'Tutors',
    columns: [
      ['id', (p) => p.id, (c) => c || undefined],
      ['name', (p) => p.name, (c) => c],
      ['preferredName', (p) => p.preferredName, (c) => c],
      ['email', (p) => p.email, (c) => c],
      ['wechat', (p) => p.wechat, (c) => c],
      ['timezone', (p) => p.timezone, (c) => c || undefined],
      ['locale', (p) => p.locale, (c) => c || undefined],
      ['active', (p) => p.active, (c) => parseBoolean(c, true)],
      ['school', (p) => p.school, (c) => c],
      ['grade', (p) => p.grade, (c) => parseNumber(c, null)],
      ['subjects', (p) => formatList(p.subjects), (c) => parseList(c)],
      ['levelsComfortable', (p) => formatList(p.levelsComfortable), (c) => parseList(c)],
      ['maxStudents', (p) => p.maxStudents, (c) => parseNumber(c, 2)],
      ['acceptingStudents', (p) => p.acceptingStudents, (c) => parseBoolean(c, true)],
      ['interests', (p) => formatList(p.interests), (c) => parseList(c)],
      ['bio', (p) => p.bio, (c) => c],
      ['meetingLink', (p) => p.meetingLink, (c) => c],
      ['createdAt', (p) => p.createdAt, (c) => c || undefined]
    ],
    select: (data) => data.people.filter((p) => p.role === 'tutor'),
    build: (fields) => newTutor(fields)
  },

  students: {
    label: 'Students',
    columns: [
      ['id', (p) => p.id, (c) => c || undefined],
      ['name', (p) => p.name, (c) => c],
      ['preferredName', (p) => p.preferredName, (c) => c],
      ['email', (p) => p.email, (c) => c],
      ['wechat', (p) => p.wechat, (c) => c],
      ['timezone', (p) => p.timezone, (c) => c || undefined],
      ['locale', (p) => p.locale, (c) => c || undefined],
      ['active', (p) => p.active, (c) => parseBoolean(c, true)],
      ['grade', (p) => p.grade, (c) => parseNumber(c, null)],
      ['englishLevel', (p) => p.englishLevel, (c) => c || undefined],
      ['goals', (p) => formatList(p.goals), (c) => parseList(c)],
      ['interests', (p) => formatList(p.interests), (c) => parseList(c)],
      ['guardianName', (p) => p.guardianName, (c) => c],
      ['guardianWechat', (p) => p.guardianWechat, (c) => c],
      ['guardianEmail', (p) => p.guardianEmail, (c) => c],
      ['createdAt', (p) => p.createdAt, (c) => c || undefined]
    ],
    select: (data) => data.people.filter((p) => p.role === 'student'),
    build: (fields) => newStudent(fields)
  },

  availability: {
    label: 'Availability',
    columns: [
      ['personId', (a) => a.personId, (c) => c],
      ['weekday', (a) => a.weekday, (c) => parseNumber(c, null)],
      ['startTime', (a) => a.startTime, (c) => c],
      ['endTime', (a) => a.endTime, (c) => c],
      ['timezone', (a) => a.timezone, (c) => c]
    ],
    select: (data) => data.availability,
    build: (fields) => fields
  },

  pairings: {
    label: 'Pairings',
    columns: [
      ['id', (p) => p.id, (c) => c || undefined],
      ['tutorId', (p) => p.tutorId, (c) => c],
      ['studentId', (p) => p.studentId, (c) => c],
      ['status', (p) => p.status, (c) => c || 'active'],
      ['startedAt', (p) => p.startedAt, (c) => c || null],
      ['endedAt', (p) => p.endedAt, (c) => c || null],
      ['notes', (p) => p.notes, (c) => c]
    ],
    select: (data) => data.pairings,
    build: (fields) => newPairing(fields)
  },

  sessions: {
    label: 'Sessions',
    columns: [
      ['id', (s) => s.id, (c) => c || undefined],
      ['pairingId', (s) => s.pairingId, (c) => c],
      ['scheduledAt', (s) => s.scheduledAt, (c) => c],
      ['occurred', (s) => s.occurred, (c) => parseBoolean(c, true)],
      ['durationMinutes', (s) => s.durationMinutes, (c) => parseNumber(c, 0)],
      ['prepMinutes', (s) => s.prepMinutes, (c) => parseNumber(c, 0)],
      ['followupMinutes', (s) => s.followupMinutes, (c) => parseNumber(c, 0)],
      ['covered', (s) => s.covered, (c) => c],
      ['homework', (s) => s.homework, (c) => c],
      ['loggedAt', (s) => s.loggedAt, (c) => c || null]
    ],
    select: (data) => data.sessions,
    build: (fields) => newSession(fields)
  }
};

export const CSV_TYPES = Object.freeze(Object.keys(CSV_TABLES));

function csvTable(type) {
  const table = CSV_TABLES[type];
  if (!table) {
    throw new Error(`Unknown CSV type "${type}". Expected one of: ${CSV_TYPES.join(', ')}.`);
  }
  return table;
}

/** CSV text for one table. */
export function toCsvText(type, data = state) {
  const table = csvTable(type);
  const header = table.columns.map(([name]) => name);
  const records = table.select(data).map((record) => {
    const row = {};
    for (const [name, read] of table.columns) row[name] = read(record);
    return row;
  });
  return objectsToCsv(header, records);
}

/** Download one table as a dated CSV file. */
export function exportCsv(type, data = state) {
  const filename = suggestedFilename(data, 'csv').replace(/\.csv$/, `-${type}.csv`);
  return download(filename, toCsvText(type, data), 'text/csv;charset=utf-8');
}

/**
 * Parse CSV text into records for `type`, without touching live state.
 *
 * `providedColumns` lists the columns the file actually contained. Callers
 * merging into existing records must use it: every returned record is fully
 * populated with defaults so a genuinely new row is complete, which means
 * blindly spreading one over an existing record would overwrite real values
 * with defaults. A roster CSV carrying only `name` must not reset anybody's
 * join date, subjects, or maximum.
 *
 * @returns {{records: object[], providedColumns: string[], errors: string[], warnings: string[]}}
 */
export function parseCsvText(type, text) {
  const table = csvTable(type);
  const { header, records: raw } = parseCsvToObjects(text);
  const errors = [];
  const warnings = [];

  if (raw.length === 0) {
    return { records: [], providedColumns: [], errors: ['That CSV has no data rows.'], warnings };
  }

  const known = new Set(table.columns.map(([name]) => name));
  const required = type === 'availability'
    ? ['personId', 'weekday', 'startTime', 'endTime']
    : type === 'tutors' || type === 'students' ? ['name'] : ['id'];

  for (const column of required) {
    if (!header.includes(column)) {
      errors.push(`That CSV is missing a required "${column}" column. Found: ${header.join(', ') || '(none)'}.`);
    }
  }
  for (const column of header) {
    if (!known.has(column)) warnings.push(`Ignoring unrecognised column "${column}".`);
  }
  if (errors.length) return { records: [], providedColumns: [], errors, warnings };

  const providedColumns = table.columns.map(([name]) => name).filter((name) => header.includes(name));

  const records = raw.map((row, i) => {
    const fields = {};
    for (const [name, , write] of table.columns) {
      if (!header.includes(name)) continue;
      const value = write(row[name]);
      if (value !== undefined) fields[name] = value;
    }
    if (type === 'availability') {
      fields.timezone = fields.timezone || undefined;
      if (!fields.timezone) {
        errors.push(`Row ${i + 2} has no timezone, and availability without a zone is meaningless.`);
      }
    }
    return table.build(fields);
  });

  return { records, providedColumns, errors, warnings };
}

/**
 * Bulk roster import. Adds new records and updates existing ones by id;
 * never deletes. A roster CSV is someone adding this term's signups, not
 * declaring the program's entire membership.
 *
 * Validated as a whole before anything is committed, so a bad row leaves the
 * program untouched rather than half-updated.
 *
 * @param {File|Blob|string} file
 * @param {'tutors'|'students'|'availability'|'pairings'|'sessions'} type
 * @returns {Promise<{added: number, updated: number, warnings: string[]}>}
 */
export async function importCsv(file, type) {
  const table = csvTable(type);
  const text = typeof file === 'string' ? file : await readFileAsText(file);
  const { records, providedColumns, errors, warnings } = parseCsvText(type, text);
  if (errors.length) throw new Error(validationMessage(errors));

  // Only the columns the file carried may overwrite an existing record. The
  // parsed records are fully defaulted so a new row is complete; spreading
  // those defaults over somebody's existing row would quietly erase fields
  // the CSV never mentioned.
  const provided = new Set(providedColumns);
  const patchOf = (record) =>
    Object.fromEntries(Object.entries(record).filter(([key]) => provided.has(key)));

  const current = state;
  let next;
  let added = 0;
  let updated = 0;

  if (type === 'availability') {
    // Availability rows have no id. Replacing every row for the people named
    // in the file is the only sane merge: a person's availability is a set,
    // and appending would silently double it on a re-import.
    const touched = new Set(records.map((r) => r.personId));
    const kept = current.availability.filter((a) => !touched.has(a.personId));
    added = records.length;
    next = { ...current, availability: [...kept, ...records] };
  } else if (type === 'tutors' || type === 'students') {
    const byId = new Map(current.people.map((p) => [p.id, p]));
    for (const record of records) {
      if (byId.has(record.id)) { byId.set(record.id, { ...byId.get(record.id), ...patchOf(record) }); updated += 1; }
      else { byId.set(record.id, record); added += 1; }
    }
    next = { ...current, people: [...byId.values()] };
  } else {
    const key = type === 'pairings' ? 'pairings' : 'sessions';
    const byId = new Map(current[key].map((r) => [r.id, r]));
    for (const record of records) {
      if (byId.has(record.id)) { byId.set(record.id, { ...byId.get(record.id), ...patchOf(record) }); updated += 1; }
      else { byId.set(record.id, record); added += 1; }
    }
    next = { ...current, [key]: [...byId.values()] };
  }

  const check = validate(normalise(next));
  if (check.errors.length) throw new Error(validationMessage(check.errors));

  replaceState(next);
  saveNow();
  return { added, updated, warnings: [...warnings, ...check.warnings] };
}

/* ------------------------------------------------------------------ *
 * Query helpers
 * ------------------------------------------------------------------ */

export function peopleByRole(role, data = state) {
  return data.people.filter((p) => p.role === role);
}

export function tutors(data = state) {
  return peopleByRole('tutor', data);
}

export function students(data = state) {
  return peopleByRole('student', data);
}

export function personById(id, data = state) {
  return data.people.find((p) => p.id === id) ?? null;
}

export function pairingById(id, data = state) {
  return data.pairings.find((p) => p.id === id) ?? null;
}

/** Availability rows for one person. */
export function availabilityFor(personId, data = state) {
  return data.availability.filter((a) => a.personId === personId);
}

/**
 * Active pairings involving `personId`, whichever side they are on.
 * Paused pairings are excluded: paused means "not right now", and a screen
 * asking for active pairings is asking what is happening this weekend.
 */
export function activePairingsFor(personId, data = state) {
  return data.pairings.filter(
    (p) => p.status === 'active' && (p.tutorId === personId || p.studentId === personId)
  );
}

/** Every pairing involving `personId`, any status, newest first. */
export function allPairingsFor(personId, data = state) {
  return data.pairings
    .filter((p) => p.tutorId === personId || p.studentId === personId)
    .sort((a, b) => String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')));
}

/** Sessions for one pairing, most recent first. */
export function sessionsFor(pairingId, data = state) {
  return data.sessions
    .filter((s) => s.pairingId === pairingId)
    .sort((a, b) => String(b.scheduledAt ?? '').localeCompare(String(a.scheduledAt ?? '')));
}

/** Sessions for one person, across all their pairings, most recent first. */
export function sessionsForPerson(personId, data = state) {
  const ids = new Set(allPairingsFor(personId, data).map((p) => p.id));
  return data.sessions
    .filter((s) => ids.has(s.pairingId))
    .sort((a, b) => String(b.scheduledAt ?? '').localeCompare(String(a.scheduledAt ?? '')));
}

/**
 * Active students with no active pairing — the coordinator's actual to-do
 * list. Paused counts as unpaired: somebody has to pick it back up.
 */
export function unpairedStudents(data = state) {
  const paired = new Set(
    data.pairings.filter((p) => p.status === 'active').map((p) => p.studentId)
  );
  return students(data).filter((s) => s.active !== false && !paired.has(s.id));
}

/**
 * Active tutors below their own stated maximum, with the room they have left.
 * `maxStudents` is a limit the tutor set for themselves, so it is respected
 * rather than treated as a target to fill (principle 1).
 *
 * @returns {Array<{tutor: object, active: number, capacity: number, remaining: number}>}
 */
export function tutorsWithCapacity(data = state) {
  return tutors(data)
    .filter((t) => t.active !== false)
    .map((tutor) => {
      const active = data.pairings.filter(
        (p) => p.status === 'active' && p.tutorId === tutor.id
      ).length;
      const capacity = Number.isFinite(Number(tutor.maxStudents)) ? Number(tutor.maxStudents) : 2;
      return { tutor, active, capacity, remaining: capacity - active };
    })
    .filter((row) => row.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining || a.tutor.name.localeCompare(b.tutor.name));
}

/** Active-pairing count per tutor, including those at zero. */
export function tutorLoads(data = state) {
  return tutors(data).map((tutor) => ({
    tutorId: tutor.id,
    name: tutor.name,
    active: data.pairings.filter((p) => p.status === 'active' && p.tutorId === tutor.id).length,
    capacity: Number(tutor.maxStudents ?? 2)
  }));
}

/** Counts for the dashboard, in one pass a view can render directly. */
export function summary(data = state) {
  return {
    tutors: tutors(data).length,
    students: students(data).length,
    activePairings: data.pairings.filter((p) => p.status === 'active').length,
    pausedPairings: data.pairings.filter((p) => p.status === 'paused').length,
    sessions: data.sessions.length,
    sessionsOccurred: data.sessions.filter((s) => s.occurred === true).length,
    unpairedStudents: unpairedStudents(data).length,
    tutorsWithCapacity: tutorsWithCapacity(data).length
  };
}

/* ------------------------------------------------------------------ *
 * Mutations
 * ------------------------------------------------------------------ */

/** Minutes a single session may contribute in total. */
export const SESSION_MINUTE_CAP = 120;

/**
 * Record what happened in a session, creating the row if the session was
 * never on the calendar.
 *
 * Total minutes are capped at two hours. The cap is applied here rather than
 * only in the form, so it holds however the entry point changes — and it
 * trims follow-up first, then prep, never the time actually spent with the
 * student.
 *
 * @param {{id?:string, pairingId:string, scheduledAt:string, occurred:boolean,
 *          durationMinutes?:number, prepMinutes?:number, followupMinutes?:number,
 *          covered?:string, homework?:string}} entry
 * @returns {object} the saved session
 */
export function logSession(entry) {
  if (!entry?.pairingId) throw new TypeError('logSession requires a pairingId.');
  if (typeof entry.occurred !== 'boolean') {
    throw new TypeError('logSession requires occurred to be true or false.');
  }

  const capped = capSessionMinutes(entry);
  const saved = {
    ...newSession({
      id: entry.id,
      pairingId: entry.pairingId,
      scheduledAt: entry.scheduledAt ?? new Date().toISOString()
    }),
    occurred: entry.occurred,
    durationMinutes: entry.occurred ? capped.durationMinutes : 0,
    prepMinutes: entry.occurred ? capped.prepMinutes : 0,
    followupMinutes: entry.occurred ? capped.followupMinutes : 0,
    covered: entry.covered ?? '',
    homework: entry.homework ?? '',
    loggedAt: new Date().toISOString()
  };

  update((current) => {
    const index = current.sessions.findIndex((s) => s.id === saved.id);
    const sessions = index === -1
      ? [...current.sessions, saved]
      : current.sessions.map((s) => (s.id === saved.id ? { ...s, ...saved } : s));
    return { ...current, sessions };
  });

  return saved;
}

/**
 * Clamp a session's minutes to the cap, trimming follow-up first and prep
 * second. Pure, so the form can show the same numbers it will save.
 */
export function capSessionMinutes({ durationMinutes, prepMinutes, followupMinutes }, cap = SESSION_MINUTE_CAP) {
  const clean = (n) => {
    const value = Number(n);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  };

  let duration = Math.min(clean(durationMinutes), cap);
  let prep = clean(prepMinutes);
  let followup = clean(followupMinutes);

  let spare = cap - duration;
  prep = Math.min(prep, Math.max(0, spare));
  spare -= prep;
  followup = Math.min(followup, Math.max(0, spare));

  return {
    durationMinutes: duration,
    prepMinutes: prep,
    followupMinutes: followup,
    totalMinutes: duration + prep + followup,
    capped: clean(durationMinutes) + clean(prepMinutes) + clean(followupMinutes) > cap
  };
}

/**
 * Create a pairing. The only way one comes into existence.
 *
 * Called when a human presses Accept on a suggestion — the matcher never
 * writes anything itself.
 */
export function createPairing({ tutorId, studentId, notes = '' }) {
  const tutor = personById(tutorId);
  const student = personById(studentId);
  if (tutor?.role !== 'tutor') throw new TypeError(`createPairing: "${tutorId}" is not a tutor.`);
  if (student?.role !== 'student') throw new TypeError(`createPairing: "${studentId}" is not a student.`);

  const existing = getState().pairings.find(
    (p) => p.tutorId === tutorId && p.studentId === studentId && p.status === 'active'
  );
  if (existing) return existing;

  const pairing = newPairing({ tutorId, studentId, notes, status: 'active' });
  update((current) => ({ ...current, pairings: [...current.pairings, pairing] }));
  return pairing;
}

/** Change a pairing's status. Ending one stamps when it ended. */
export function setPairingStatus(pairingId, status) {
  if (!PAIRING_STATUSES.includes(status)) {
    throw new TypeError(`setPairingStatus: unknown status "${status}".`);
  }
  update((current) => ({
    ...current,
    pairings: current.pairings.map((p) => (p.id === pairingId
      ? { ...p, status, endedAt: status === 'ended' ? (p.endedAt ?? new Date().toISOString()) : null }
      : p))
  }));
  return pairingById(pairingId);
}

/** Put a session on the calendar without logging it. */
export function scheduleSession(fields) {
  const session = newScheduledSession(fields);
  update((current) => ({ ...current, sessions: [...current.sessions, session] }));
  return session;
}

export function deleteSession(sessionId) {
  update((current) => ({
    ...current,
    sessions: current.sessions.filter((s) => s.id !== sessionId)
  }));
}

/**
 * Add a person to the roster.
 *
 * @param {'tutor'|'student'} role
 * @param {object} fields
 */
export function addPerson(role, fields = {}) {
  if (!ROLES.includes(role)) throw new TypeError(`addPerson: unknown role "${role}".`);
  const person = role === 'tutor' ? newTutor(fields) : newStudent(fields);
  update((current) => ({ ...current, people: [...current.people, person] }));
  return person;
}

/**
 * Remove somebody from the roster.
 *
 * Refuses when they have logged sessions, because those sessions are somebody's
 * volunteer hours and a coordinator tidying a list should not be able to delete
 * them with one click. Deactivating is the right move there, and the error says
 * so. Availability and pairings that carry no history go with the person.
 */
export function removePerson(personId) {
  const data = getState();
  const person = data.people.find((p) => p.id === personId);
  if (!person) return { removed: false, reason: 'not-found' };

  const theirPairings = data.pairings.filter(
    (p) => p.tutorId === personId || p.studentId === personId
  );
  const pairingIds = new Set(theirPairings.map((p) => p.id));
  const loggedSessions = data.sessions.filter(
    (s) => pairingIds.has(s.pairingId) && s.loggedAt != null
  );

  if (loggedSessions.length > 0) {
    const error = new Error(
      `${person.name || personId} has ${loggedSessions.length} logged session(s). ` +
      'Removing them would delete volunteer hours somebody earned. Mark them inactive instead.'
    );
    error.code = 'has-history';
    error.sessions = loggedSessions.length;
    throw error;
  }

  update((current) => ({
    ...current,
    people: current.people.filter((p) => p.id !== personId),
    pairings: current.pairings.filter((p) => !pairingIds.has(p.id)),
    sessions: current.sessions.filter((s) => !pairingIds.has(s.pairingId)),
    availability: current.availability.filter((a) => a.personId !== personId)
  }));

  return { removed: true, pairings: theirPairings.length };
}

/** Mark somebody active or inactive without touching their history. */
export function setPersonActive(personId, active) {
  return updatePerson(personId, { active: Boolean(active) });
}

/** Patch one person by id. */
export function updatePerson(personId, patch) {
  update((current) => ({
    ...current,
    people: current.people.map((p) => (p.id === personId ? { ...p, ...patch } : p))
  }));
  return personById(personId);
}

/**
 * Post a message to a class thread.
 *
 * The store stamps the id and the time; `chat.composeMessage` decides the
 * shape. Returns the stored message so a view can render it optimistically.
 */
export function postMessage({ pairingId, view, body }) {
  const pairing = state.pairings.find((p) => p.id === pairingId);
  if (!pairing) {
    const err = new Error(`No such class: ${pairingId}`);
    err.code = 'no-pairing';
    throw err;
  }
  if (!canPost(pairing, view)) {
    // Not a permission check — there is no auth here. It catches a screen
    // trying to write a message that would make no sense.
    const err = new Error('This person is not in that class.');
    err.code = 'not-a-member';
    throw err;
  }

  const message = composeMessage({
    pairingId,
    view,
    body,
    id: newId('msg'),
    sentAt: new Date().toISOString()
  });

  update((current) => ({ ...current, messages: [...current.messages, message] }));
  return message;
}

/**
 * Withdraw a message.
 *
 * A tombstone, never a removal: the row stays with `deletedAt` set and the
 * body cleared. In a thread involving a child, a message that disappears
 * without trace is worse than one visibly withdrawn — a parent who saw
 * something and came back to find nothing has been left with no recourse.
 *
 * The author may withdraw their own; the coordinator may withdraw any.
 */
export function deleteMessage(messageId, view) {
  const message = state.messages.find((m) => m.id === messageId);
  if (!message) {
    const err = new Error(`No such message: ${messageId}`);
    err.code = 'no-message';
    throw err;
  }

  const isAuthor = view.role === message.authorRole
    && (view.role === 'admin' || view.person?.id === message.authorId);
  if (!isAuthor && view.role !== 'admin') {
    const err = new Error('Only the person who wrote a message, or the coordinator, can withdraw it.');
    err.code = 'not-author';
    throw err;
  }

  update((current) => ({
    ...current,
    messages: current.messages.map((m) => (m.id === messageId
      ? {
        ...m,
        body: '',
        deletedAt: new Date().toISOString(),
        deletedBy: view.role === 'admin' ? 'admin' : view.role
      }
      : m))
  }));
}

/**
 * When this browser last opened a thread.
 *
 * Kept in localStorage, keyed by who is looking, and **never written into the
 * program document.** Two reasons: it is a fact about this device rather than
 * about the program, and the moment read state travels between people it
 * becomes "the tutor has seen your message and not replied", which is a
 * compliance surface built out of a convenience feature (principle 3).
 */
export function readState(viewKey = loadViewAs()) {
  try {
    const raw = localStorage.getItem(`${READ_KEY}:${viewKey}`);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Mark a thread read as of now, for this browser only. */
export function markThreadRead(pairingId, viewKey = loadViewAs()) {
  const next = { ...readState(viewKey), [pairingId]: new Date().toISOString() };
  try {
    localStorage.setItem(`${READ_KEY}:${viewKey}`, JSON.stringify(next));
  } catch {
    /* Private browsing, or a full quota. Unread badges are not worth an error. */
  }
  return next;
}

/**
 * Guardian contact details, editable only from the guardian view.
 *
 * Every field is optional and blank is always a valid answer (principle 5).
 * A guardian who wants to leave nothing has left nothing, and no screen may
 * treat that as incomplete.
 */
export function setGuardianContact(studentId, { guardianName, guardianWechat, guardianEmail }) {
  return updatePerson(studentId, {
    guardianName: (guardianName ?? '').trim(),
    guardianWechat: (guardianWechat ?? '').trim(),
    guardianEmail: (guardianEmail ?? '').trim()
  });
}

/** The "not taking new students right now" toggle. */
export function setAcceptingStudents(tutorId, accepting) {
  return updatePerson(tutorId, { acceptingStudents: Boolean(accepting) });
}

/**
 * Replace one person's availability wholesale.
 *
 * Availability is a set, not a log: editing it means declaring the current
 * state, so a partial merge would leave stale windows behind.
 */
export function setAvailabilityFor(personId, rows) {
  const clean = (rows ?? []).map((row) => ({
    personId,
    weekday: Number(row.weekday),
    startTime: row.startTime,
    endTime: row.endTime,
    timezone: row.timezone
  }));

  update((current) => ({
    ...current,
    availability: [...current.availability.filter((a) => a.personId !== personId), ...clean]
  }));
  return clean;
}

/* ------------------------------------------------------------------ *
 * Who am I looking at this as
 * ------------------------------------------------------------------ */

/**
 * There is no auth yet, so the app asks. `viewAs` is either 'admin' or a
 * person id, persisted separately from program data — it is a preference
 * about this browser, not a fact about the program, and it must never travel
 * inside an export.
 */
export function loadViewAs() {
  try {
    return localStorage.getItem(VIEW_AS_KEY) || 'admin';
  } catch {
    return 'admin';
  }
}

export function saveViewAs(value) {
  try {
    localStorage.setItem(VIEW_AS_KEY, value);
  } catch { /* a preference is not worth an error */ }
  return value;
}

const GUARDIAN_PREFIX = 'guardian:';

/**
 * Who is looking, as a role and a person.
 *
 * 'admin' | '<tutorId>' | '<studentId>' | 'guardian:<studentId>'.
 *
 * A guardian is not a separate record — they are whoever is holding the
 * student's phone. Modelling them as a person would mean asking a family to
 * register before they can read their own child's homework, which principle 5
 * rules out.
 *
 * @returns {{role:'admin'|'tutor'|'student'|'guardian', person: object|null}}
 */
export function currentView(data = state, viewAs = loadViewAs()) {
  if (!viewAs || viewAs === 'admin') return { role: 'admin', person: null };

  const guardian = viewAs.startsWith(GUARDIAN_PREFIX);
  const id = guardian ? viewAs.slice(GUARDIAN_PREFIX.length) : viewAs;
  const person = data.people.find((p) => p.id === id) ?? null;

  if (!person) return { role: 'admin', person: null };
  if (person.role === 'tutor') return { role: 'tutor', person };
  return { role: guardian ? 'guardian' : 'student', person };
}

export function guardianViewFor(studentId) {
  return `${GUARDIAN_PREFIX}${studentId}`;
}

/** The tutor currently being viewed as, or null when that is not the case. */
export function currentTutor(data = state, viewAs = loadViewAs()) {
  const view = currentView(data, viewAs);
  return view.role === 'tutor' ? view.person : null;
}

/** The student currently being viewed as, whether by them or their guardian. */
export function currentStudent(data = state, viewAs = loadViewAs()) {
  const view = currentView(data, viewAs);
  return view.role === 'student' || view.role === 'guardian' ? view.person : null;
}

/* ------------------------------------------------------------------ *
 * Language preference — a UI setting, but it belongs with persistence
 * ------------------------------------------------------------------ */

/**
 * Language preference, stored per person.
 *
 * A coordinator handing their phone to a student's parent, or a tutor and a
 * student sharing a machine at a school, should not have to re-pick the
 * language every time. The key is scoped to whoever is selected, so each
 * person's choice sticks to them.
 */
function langKeyFor(viewAs = loadViewAs()) {
  return `${LANG_KEY}:${viewAs || 'admin'}`;
}

export function loadLangPreference(viewAs) {
  try {
    // Fall back to the old unscoped key so an existing choice is not lost.
    return localStorage.getItem(langKeyFor(viewAs)) ?? localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

export function saveLangPreference(lang, viewAs) {
  try {
    localStorage.setItem(langKeyFor(viewAs), lang);
  } catch { /* a preference is not worth an error */ }
}

/* ------------------------------------------------------------------ *
 * Ids
 * ------------------------------------------------------------------ */

let idCounter = 0;

/**
 * Readable, collision-resistant, and stable inside an export a human might
 * hand-edit. Not cryptographic; nothing here needs it to be. The counter
 * guarantees uniqueness within a session even when called in a tight loop,
 * which Date.now() alone does not.
 */
export function newId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  const stamp = Date.now().toString(36).slice(-4);
  idCounter = (idCounter + 1) % 46656;
  return `${prefix}_${stamp}${rand}${idCounter.toString(36)}`;
}
