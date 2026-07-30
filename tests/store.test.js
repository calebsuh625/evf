/**
 * store.test.js
 *
 * Only the pure half of store.js is exercised here: migrate(), validate(),
 * toJson(), parseProgramJson(), toCsvText(), parseCsvText(), and the query
 * helpers, all of which take their data as an argument.
 *
 * load(), save(), importJson(), importCsv() and reset() are deliberately NOT
 * called: they write to the same localStorage key the real app uses, so a
 * coordinator who opened the test page would find their program replaced by
 * fixtures. A test that can destroy the thing it is testing is not worth
 * having. parseProgramJson() and parseCsvText() exist precisely so the
 * import path can be tested without that risk.
 */

import { describe, it, equal, ok, deepEqual, throws } from './runner.js';
import {
  SCHEMA_VERSION,
  ROLES,
  PAIRING_STATUSES,
  emptyProgram,
  newTutor,
  newStudent,
  newPairing,
  newSession,
  migrate,
  validate,
  toJson,
  parseProgramJson,
  suggestedFilename,
  toCsvText,
  parseCsvText,
  CSV_TYPES,
  newId,
  peopleByRole,
  tutors,
  students,
  personById,
  availabilityFor,
  activePairingsFor,
  allPairingsFor,
  sessionsFor,
  sessionsForPerson,
  unpairedStudents,
  tutorsWithCapacity,
  summary
} from '../js/store.js';

/* ---------------------------------------------------------------- *
 * Fixtures
 * ---------------------------------------------------------------- */

const SAT = '2026-06-20T13:00:00.000Z';

function fixture(overrides = {}) {
  const base = emptyProgram();
  return {
    ...base,
    people: [
      newTutor({ id: 't1', name: 'Avery Alpha', subjects: ['algebra'], levelsComfortable: ['beginner'], maxStudents: 2, timezone: 'America/New_York' }),
      newTutor({ id: 't2', name: 'Blake Beta', subjects: ['physics'], maxStudents: 1, timezone: 'America/Los_Angeles' }),
      newTutor({ id: 't3', name: 'Corin Gamma', subjects: ['biology'], maxStudents: 2, active: false }),
      newStudent({ id: 's1', name: 'Ming Nu', goals: ['algebra'], englishLevel: 'beginner' }),
      newStudent({ id: 's2', name: 'Yara Xi', goals: ['physics'], englishLevel: 'intermediate' }),
      newStudent({ id: 's3', name: 'Bo Omicron', goals: ['biology'], englishLevel: 'beginner' })
    ],
    pairings: [
      newPairing({ id: 'p1', tutorId: 't1', studentId: 's1', status: 'active', startedAt: SAT }),
      newPairing({ id: 'p2', tutorId: 't2', studentId: 's2', status: 'active', startedAt: SAT }),
      newPairing({ id: 'p3', tutorId: 't1', studentId: 's3', status: 'ended', startedAt: SAT, endedAt: SAT })
    ],
    sessions: [
      newSession({ id: 'x1', pairingId: 'p1', scheduledAt: SAT, occurred: true, durationMinutes: 60, prepMinutes: 10, followupMinutes: 5, loggedAt: SAT }),
      newSession({ id: 'x2', pairingId: 'p1', scheduledAt: '2026-06-27T13:00:00.000Z', occurred: false, durationMinutes: 0, prepMinutes: 0, followupMinutes: 0, loggedAt: SAT }),
      newSession({ id: 'x3', pairingId: 'p2', scheduledAt: SAT, occurred: true, durationMinutes: 45, prepMinutes: 0, followupMinutes: 0, loggedAt: SAT })
    ],
    availability: [
      { personId: 't1', weekday: 6, startTime: '09:00', endTime: '12:00', timezone: 'America/New_York' },
      { personId: 't2', weekday: 6, startTime: '18:00', endTime: '21:00', timezone: 'America/Los_Angeles' },
      { personId: 't3', weekday: 6, startTime: '09:00', endTime: '12:00', timezone: 'America/New_York' },
      { personId: 's1', weekday: 6, startTime: '21:00', endTime: '23:00', timezone: 'Asia/Shanghai' },
      { personId: 's2', weekday: 0, startTime: '09:00', endTime: '12:00', timezone: 'Asia/Shanghai' },
      { personId: 's3', weekday: 6, startTime: '21:00', endTime: '23:00', timezone: 'Asia/Shanghai' }
    ],
    ...overrides
  };
}

/* ---------------------------------------------------------------- *
 * Shape
 * ---------------------------------------------------------------- */

describe('emptyProgram', () => {
  it('is stamped with the current version', () => {
    equal(emptyProgram().version, SCHEMA_VERSION);
    equal(SCHEMA_VERSION, 3);
  });

  it('has every collection present and empty', () => {
    const p = emptyProgram();
    deepEqual(p.people, []);
    deepEqual(p.pairings, []);
    deepEqual(p.sessions, []);
    deepEqual(p.availability, []);
  });

  it('defaults students to China time', () => {
    equal(emptyProgram().program.studentTimeZone, 'Asia/Shanghai');
  });

  it('returns a fresh object each time, not a shared one', () => {
    emptyProgram().people.push({ id: 'x' });
    equal(emptyProgram().people.length, 0);
  });
});

describe('record constructors', () => {
  it('force the role, so a tutor cannot be built as a student by accident', () => {
    equal(newTutor({ role: 'student' }).role, 'tutor');
    equal(newStudent({ role: 'tutor' }).role, 'student');
  });

  it('give every field a value so forms and imports agree on the shape', () => {
    const t = newTutor();
    for (const key of ['school', 'subjects', 'levelsComfortable', 'maxStudents', 'bio', 'meetingLink']) {
      ok(key in t, `tutor is missing ${key}`);
    }
    const s = newStudent();
    for (const key of ['englishLevel', 'goals', 'interests', 'guardianName', 'guardianWechat', 'guardianEmail']) {
      ok(key in s, `student is missing ${key}`);
    }
  });

  it('leave every guardian field blank by default (principle 5)', () => {
    const s = newStudent();
    equal(s.guardianName, '');
    equal(s.guardianWechat, '');
    equal(s.guardianEmail, '');
  });

  it('default a student to China time and Chinese, a tutor to English', () => {
    equal(newStudent().timezone, 'Asia/Shanghai');
    equal(newStudent().locale, 'zh');
    equal(newTutor().locale, 'en');
  });

  it('mint an id when none is given and keep one that is', () => {
    ok(newTutor().id.startsWith('tut_'));
    equal(newTutor({ id: 'keep-me' }).id, 'keep-me');
  });

  it('default a session to occurred, since that is the common case', () => {
    equal(newSession().occurred, true);
    equal(newSession().prepMinutes, 0);
  });
});

/* ---------------------------------------------------------------- *
 * Migrations
 * ---------------------------------------------------------------- */

describe('migrate', () => {
  it('passes a current-version file through unchanged', () => {
    const { data, applied } = migrate(fixture());
    equal(data.version, SCHEMA_VERSION);
    deepEqual(applied, []);
    equal(data.people.length, 6);
  });

  it('reads a v1 file by its schemaVersion key', () => {
    const { applied } = migrate({ schemaVersion: 1, tutors: [], students: [], matches: [], sessions: [] });
    deepEqual(applied, [1, 2]);
  });

  it('treats a file with no version field as version 0', () => {
    const { applied } = migrate({ tutors: [], students: [] });
    deepEqual(applied, [0, 1, 2]);
  });

  it('migrates the full v0 chain through to the current version', () => {
    const legacy = {
      programName: 'Old Program',
      adminTimeZone: 'America/Chicago',
      tutors: [{ id: 'tut_a', displayName: 'Avery Alpha', timeZone: 'America/Chicago', subjects: ['algebra'], gradeLevel: 11,
                 availability: [{ day: 6, start: '09:00', end: '11:00', tz: 'America/Chicago' }] }],
      students: [{ id: 'stu_1', displayName: 'Ming Nu', subjects: ['algebra'], guardianContact: 'someone@example.org',
                   availability: [{ day: 6, start: '22:00', end: '23:00', tz: 'Asia/Shanghai' }] }],
      matches: [{ id: 'mat_1', tutorId: 'tut_a', studentId: 'stu_1', status: 'active', subject: 'algebra', createdAt: '2026-03-01T00:00:00.000Z' }],
      sessions: [{ id: 'ses_1', matchId: 'mat_1', tutorId: 'tut_a', studentId: 'stu_1',
                   startsAt: '2026-03-07T14:00:00.000Z', endsAt: '2026-03-07T15:30:00.000Z',
                   status: 'held', note: 'Covered equations.' }]
    };

    const { data, applied } = migrate(legacy);
    deepEqual(applied, [0, 1, 2]);
    equal(data.version, SCHEMA_VERSION);
    equal(data.program.name, 'Old Program');

    // tutors + students became one people table with roles
    equal(data.people.length, 2);
    equal(peopleByRole('tutor', data).length, 1);
    equal(peopleByRole('student', data).length, 1);
    equal(data.people[0].name, 'Avery Alpha', 'displayName should become name');
    equal(data.people[0].grade, 11, 'gradeLevel should become grade');

    // a student's old "subjects" are goals from their side
    deepEqual(peopleByRole('student', data)[0].goals, ['algebra']);
    equal(peopleByRole('student', data)[0].guardianEmail, 'someone@example.org');

    // nested availability was lifted into its own table with new field names
    equal(data.availability.length, 2);
    const slot = data.availability.find((a) => a.personId === 'tut_a');
    equal(slot.weekday, 6);
    equal(slot.startTime, '09:00');
    equal(slot.timezone, 'America/Chicago');

    // matches became pairings, and the dropped subject went into notes
    equal(data.pairings.length, 1);
    equal(data.pairings[0].id, 'mat_1');
    ok(data.pairings[0].notes.includes('algebra'), 'the match subject should survive in notes');

    // sessions lost their denormalised ids and gained `occurred`
    equal(data.sessions.length, 1);
    equal(data.sessions[0].pairingId, 'mat_1');
    equal(data.sessions[0].occurred, true);
    equal(data.sessions[0].durationMinutes, 90, 'endsAt should have become durationMinutes');
    equal(data.sessions[0].scheduledAt, '2026-03-07T14:00:00.000Z');
    equal(data.sessions[0].covered, 'Covered equations.');
    equal(data.sessions[0].tutorId, undefined, 'the denormalised tutorId should be gone');
  });

  it('turns a v1 canceled session into occurred:false without losing it', () => {
    const { data } = migrate({
      schemaVersion: 1,
      tutors: [{ id: 'tut_a' }], students: [{ id: 'stu_1' }],
      matches: [{ id: 'mat_1', tutorId: 'tut_a', studentId: 'stu_1', status: 'active' }],
      sessions: [{ id: 'ses_1', matchId: 'mat_1', startsAt: '2026-03-07T14:00:00.000Z', status: 'canceled', durationMinutes: 60 }]
    });
    equal(data.sessions.length, 1);
    equal(data.sessions[0].occurred, false);
    equal(data.sessions[0].durationMinutes, 0, 'a session that did not happen contributes no minutes');
  });

  it('reconstructs a pairing rather than dropping logged hours', () => {
    // A v1 session with a tutor and student but no match would otherwise have
    // nowhere to hang, silently deleting volunteer time someone earned.
    const { data } = migrate({
      schemaVersion: 1,
      tutors: [{ id: 'tut_a' }], students: [{ id: 'stu_1' }],
      matches: [],
      sessions: [{ id: 'ses_1', tutorId: 'tut_a', studentId: 'stu_1', startsAt: '2026-03-07T14:00:00.000Z', status: 'held', durationMinutes: 60 }]
    });
    equal(data.sessions.length, 1, 'the session must survive');
    equal(data.pairings.length, 1, 'a pairing should have been reconstructed');
    equal(data.pairings[0].tutorId, 'tut_a');
    equal(data.sessions[0].pairingId, data.pairings[0].id);
    ok(data.pairings[0].notes.toLowerCase().includes('reconstructed'));
  });

  it('maps v1 match statuses onto the pairing statuses', () => {
    const { data } = migrate({
      schemaVersion: 1,
      tutors: [{ id: 'tut_a' }], students: [{ id: 'stu_1' }, { id: 'stu_2' }, { id: 'stu_3' }],
      matches: [
        { id: 'm1', tutorId: 'tut_a', studentId: 'stu_1', status: 'active' },
        { id: 'm2', tutorId: 'tut_a', studentId: 'stu_2', status: 'ended' },
        { id: 'm3', tutorId: 'tut_a', studentId: 'stu_3', status: 'something-odd' }
      ],
      sessions: []
    });
    deepEqual(data.pairings.map((p) => p.status), ['active', 'ended', 'active']);
    ok(PAIRING_STATUSES.includes(data.pairings[2].status));
  });

  it('gives v2 tutors an acceptingStudents flag, separate from active', () => {
    const v2 = {
      version: 2,
      people: [
        { id: 't1', role: 'tutor', name: 'Avery', active: true },
        { id: 't2', role: 'tutor', name: 'Blake', active: false },
        { id: 's1', role: 'student', name: 'Ming', active: true }
      ],
      pairings: [], sessions: [], availability: []
    };
    const { data, applied } = migrate(v2);
    deepEqual(applied, [2]);
    equal(data.people[0].acceptingStudents, true);
    equal(data.people[1].acceptingStudents, true, 'a tutor on a break is still open to pairing later');
    equal(data.people[1].active, false, 'and active is untouched');
    equal(data.people[2].acceptingStudents, undefined, 'students have no such field');
  });

  it('does not overwrite an acceptingStudents flag that is already there', () => {
    const { data } = migrate({
      version: 2,
      people: [{ id: 't1', role: 'tutor', name: 'Avery', active: true, acceptingStudents: false }],
      pairings: [], sessions: [], availability: []
    });
    equal(data.people[0].acceptingStudents, false);
  });

  it('fills in collections a partial file omitted', () => {
    const { data } = migrate({ version: 2, people: [] });
    deepEqual(data.pairings, []);
    deepEqual(data.availability, []);
    ok(data.program.studentTimeZone);
  });

  it('refuses a file from a newer build rather than mangling it', () => {
    throws(() => migrate({ version: SCHEMA_VERSION + 1 }));
  });

  it('rejects things that are not program files', () => {
    throws(() => migrate(null));
    throws(() => migrate([]));
    throws(() => migrate('a string'));
    throws(() => migrate(42));
  });
});

/* ---------------------------------------------------------------- *
 * Validation
 * ---------------------------------------------------------------- */

describe('validate', () => {
  it('finds nothing wrong with a consistent program', () => {
    const { errors, warnings } = validate(fixture());
    deepEqual(errors, []);
    deepEqual(warnings, []);
  });

  it('requires the four collections to be arrays', () => {
    for (const key of ['people', 'pairings', 'sessions', 'availability']) {
      const { errors } = validate({ ...fixture(), [key]: 'nope' });
      ok(errors.some((e) => e.includes(key)), `expected an error naming ${key}`);
    }
  });

  it('rejects duplicate ids in every table', () => {
    const f = fixture();
    ok(validate({ ...f, people: [...f.people, f.people[0]] }).errors.some((e) => e.includes('Duplicate person')));
    ok(validate({ ...f, pairings: [...f.pairings, f.pairings[0]] }).errors.some((e) => e.includes('Duplicate pairing')));
    ok(validate({ ...f, sessions: [...f.sessions, f.sessions[0]] }).errors.some((e) => e.includes('Duplicate session')));
  });

  it('rejects an unknown role', () => {
    const f = fixture();
    const errors = validate({ ...f, people: [{ ...f.people[0], role: 'volunteer' }, ...f.people.slice(1)] }).errors;
    ok(errors.some((e) => e.includes('role')), errors.join(' '));
  });

  it('rejects a pairing that points at somebody who is not in the file', () => {
    const f = fixture();
    // Sessions cleared too: leaving them would also (correctly) error for
    // pointing at pairings that no longer exist, which is a different case.
    const errors = validate({
      ...f,
      pairings: [newPairing({ id: 'zz', tutorId: 'ghost', studentId: 'ghost' })],
      sessions: []
    }).errors;
    equal(errors.length, 2, errors.join(' | '));
    ok(errors.every((e) => e.includes('ghost')));
  });

  it('rejects a pairing with the roles the wrong way round', () => {
    const f = fixture();
    const errors = validate({
      ...f,
      pairings: [newPairing({ id: 'zz', tutorId: 's1', studentId: 't1' })]
    }).errors;
    ok(errors.some((e) => e.includes('is a student')), errors.join(' '));
    ok(errors.some((e) => e.includes('is a tutor')), errors.join(' '));
  });

  it('rejects an unknown pairing status', () => {
    const f = fixture();
    ok(validate({ ...f, pairings: [{ ...f.pairings[0], status: 'maybe' }] }).errors
      .some((e) => e.includes('status')));
  });

  it('rejects a session pointing at a pairing that is not in the file', () => {
    const f = fixture();
    ok(validate({ ...f, sessions: [{ ...f.sessions[0], pairingId: 'ghost' }] }).errors
      .some((e) => e.includes('ghost')));
  });

  it('rejects timestamps that are not ISO 8601 UTC', () => {
    const f = fixture();
    for (const bad of ['2026-06-20 13:00', '2026-06-20T13:00:00+08:00', 'yesterday', '']) {
      const errors = validate({ ...f, sessions: [{ ...f.sessions[0], scheduledAt: bad }] }).errors;
      ok(errors.some((e) => e.includes('ISO 8601 UTC')), `expected rejection of "${bad}"`);
    }
  });

  it('accepts ISO UTC with and without milliseconds', () => {
    const f = fixture();
    for (const good of ['2026-06-20T13:00:00Z', '2026-06-20T13:00:00.000Z']) {
      deepEqual(validate({ ...f, sessions: [{ ...f.sessions[0], scheduledAt: good }] }).errors, []);
    }
  });

  it('requires occurred to be an actual boolean', () => {
    const f = fixture();
    for (const bad of ['yes', 1, null, undefined]) {
      ok(validate({ ...f, sessions: [{ ...f.sessions[0], occurred: bad }] }).errors
        .some((e) => e.includes('occurred')), `expected rejection of ${String(bad)}`);
    }
  });

  it('rejects negative or non-numeric minute fields', () => {
    const f = fixture();
    for (const field of ['durationMinutes', 'prepMinutes', 'followupMinutes']) {
      ok(validate({ ...f, sessions: [{ ...f.sessions[0], [field]: -5 }] }).errors
        .some((e) => e.includes(field)), `expected rejection of negative ${field}`);
      ok(validate({ ...f, sessions: [{ ...f.sessions[0], [field]: 'sixty' }] }).errors
        .some((e) => e.includes(field)), `expected rejection of non-numeric ${field}`);
    }
  });

  it('rejects an unknown time zone anywhere it appears', () => {
    const f = fixture();
    ok(validate({ ...f, people: [{ ...f.people[0], timezone: 'Mars/Olympus' }, ...f.people.slice(1)] }).errors
      .some((e) => e.includes('Mars/Olympus')));
    ok(validate({ ...f, availability: [{ ...f.availability[0], timezone: 'Mars/Olympus' }] }).errors
      .some((e) => e.includes('Mars/Olympus')));
  });

  it('rejects a bad weekday or time in availability', () => {
    const f = fixture();
    for (const weekday of [-1, 7, 'Saturday', 1.5, null]) {
      ok(validate({ ...f, availability: [{ ...f.availability[0], weekday }] }).errors
        .some((e) => e.includes('weekday')), `expected rejection of weekday ${String(weekday)}`);
    }
    ok(validate({ ...f, availability: [{ ...f.availability[0], startTime: '9am' }] }).errors
      .some((e) => e.includes('startTime')));
  });

  it('rejects availability for somebody who is not in the file', () => {
    const f = fixture();
    ok(validate({ ...f, availability: [{ ...f.availability[0], personId: 'ghost' }] }).errors
      .some((e) => e.includes('ghost')));
  });

  it('warns rather than errors on soft problems', () => {
    const f = fixture();
    // An active person with no availability cannot be matched, but their
    // record is not corrupt and must still import.
    const noAvail = { ...f, availability: f.availability.filter((a) => a.personId !== 's1') };
    const { errors, warnings } = validate(noAvail);
    deepEqual(errors, []);
    ok(warnings.some((w) => w.includes('Ming Nu')), warnings.join(' '));
  });

  it('warns about an unrecognised English level without rejecting it', () => {
    const f = fixture();
    const people = f.people.map((p) => (p.id === 's1' ? { ...p, englishLevel: 'fluent-ish' } : p));
    const { errors, warnings } = validate({ ...f, people });
    deepEqual(errors, []);
    ok(warnings.some((w) => w.includes('fluent-ish')));
  });

  it('warns about a missing name without rejecting the record', () => {
    const f = fixture();
    const people = f.people.map((p) => (p.id === 's1' ? { ...p, name: '' } : p));
    const { errors, warnings } = validate({ ...f, people });
    deepEqual(errors, []);
    ok(warnings.some((w) => w.includes('no name')));
  });
});

/* ---------------------------------------------------------------- *
 * JSON round trip — the requirement
 * ---------------------------------------------------------------- */

describe('JSON export/import round trip', () => {
  it('export then import produces identical data', () => {
    const original = migrate(fixture()).data;
    const { data: returned } = parseProgramJson(toJson(original));

    // exportedAt is stamped at export time by design; everything else must
    // come back byte-identical.
    const strip = (d) => { const { exportedAt, ...rest } = d; return JSON.stringify(rest); };
    equal(strip(returned), strip(original), 'round trip changed the data');
  });

  it('survives a second round trip unchanged', () => {
    const once = parseProgramJson(toJson(migrate(fixture()).data)).data;
    const twice = parseProgramJson(toJson(once)).data;
    const strip = (d) => { const { exportedAt, ...rest } = d; return JSON.stringify(rest); };
    equal(strip(twice), strip(once));
  });

  it('preserves every collection exactly', () => {
    const original = migrate(fixture()).data;
    const { data } = parseProgramJson(toJson(original));
    deepEqual(data.people, original.people);
    deepEqual(data.pairings, original.pairings);
    deepEqual(data.sessions, original.sessions);
    deepEqual(data.availability, original.availability);
    deepEqual(data.program, original.program);
  });

  it('stamps exportedAt as ISO UTC on the way out', () => {
    const parsed = JSON.parse(toJson(emptyProgram()));
    ok(parsed.exportedAt?.endsWith('Z'), 'exportedAt must be ISO UTC');
  });

  it('is pretty-printed so a human can read and diff it', () => {
    ok(toJson(emptyProgram()).includes('\n  '));
  });

  it('rejects invalid JSON with a message that says so', () => {
    let message = '';
    try { parseProgramJson('{ not json'); } catch (err) { message = err.message; }
    ok(message.includes('not valid JSON'), message);
  });

  it('rejects a structurally broken file and says what is wrong', () => {
    const f = fixture();
    const broken = JSON.stringify({ ...f, sessions: [{ ...f.sessions[0], pairingId: 'ghost' }] });
    let message = '';
    try { parseProgramJson(broken); } catch (err) { message = err.message; }
    ok(message.includes('ghost'), `expected the offending id in: ${message}`);
    ok(message.includes('Nothing was changed'), message);
  });

  it('lists several problems at once rather than only the first', () => {
    const f = fixture();
    const broken = JSON.stringify({
      ...f,
      pairings: [newPairing({ id: 'z1', tutorId: 'ghost1', studentId: 'ghost2', status: 'weird' })]
    });
    let message = '';
    try { parseProgramJson(broken); } catch (err) { message = err.message; }
    ok(message.includes('ghost1') && message.includes('ghost2'), message);
    ok(/\d+ problems/.test(message), message);
  });

  it('migrates a v0 file on import', () => {
    const legacy = JSON.stringify({ programName: 'Legacy', tutors: [], students: [], matches: [], sessions: [] });
    const { data, migrated } = parseProgramJson(legacy);
    deepEqual(migrated, [0, 1, 2]);
    equal(data.version, SCHEMA_VERSION);
    equal(data.program.name, 'Legacy');
  });

  it('suggests a filesystem-safe dated filename', () => {
    const name = suggestedFilename({ program: { name: 'Weekend Tutoring / Spring!' } });
    ok(/^[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.json$/.test(name), name);
    ok(suggestedFilename({ program: { name: '!!!' } }).startsWith('program-'));
    ok(suggestedFilename(emptyProgram(), 'csv').endsWith('.csv'));
  });
});

/* ---------------------------------------------------------------- *
 * CSV
 * ---------------------------------------------------------------- */

describe('CSV export/import', () => {
  it('covers every table', () => {
    deepEqual(CSV_TYPES, ['tutors', 'students', 'availability', 'pairings', 'sessions']);
  });

  it('rejects an unknown table name', () => {
    throws(() => toCsvText('teachers', fixture()));
    throws(() => parseCsvText('teachers', 'a\n1\n'));
  });

  it('round-trips tutors through CSV', () => {
    const f = migrate(fixture()).data;
    const text = toCsvText('tutors', f);
    const { records, errors } = parseCsvText('tutors', text);
    deepEqual(errors, []);
    equal(records.length, 3);

    const original = tutors(f);
    for (const [i, rec] of records.entries()) {
      equal(rec.id, original[i].id);
      equal(rec.name, original[i].name);
      deepEqual(rec.subjects, original[i].subjects);
      deepEqual(rec.levelsComfortable, original[i].levelsComfortable);
      equal(rec.maxStudents, original[i].maxStudents);
      equal(rec.active, original[i].active, `active flag lost for ${rec.id}`);
      equal(rec.timezone, original[i].timezone);
    }
  });

  it('round-trips students through CSV, guardian fields included', () => {
    const f = migrate(fixture({
      people: fixture().people.map((p) =>
        p.id === 's1' ? { ...p, guardianName: 'A Guardian', guardianWechat: 'wx-demo' } : p)
    })).data;
    const { records, errors } = parseCsvText('students', toCsvText('students', f));
    deepEqual(errors, []);
    const s1 = records.find((r) => r.id === 's1');
    equal(s1.guardianName, 'A Guardian');
    equal(s1.guardianWechat, 'wx-demo');
    deepEqual(s1.goals, ['algebra']);
    equal(s1.englishLevel, 'beginner');
  });

  it('round-trips availability, including a midnight-spanning window', () => {
    const f = migrate(fixture({
      availability: [{ personId: 't1', weekday: 6, startTime: '22:00', endTime: '01:00', timezone: 'Asia/Shanghai' }]
    })).data;
    const { records, errors } = parseCsvText('availability', toCsvText('availability', f));
    deepEqual(errors, []);
    deepEqual(records, [{ personId: 't1', weekday: 6, startTime: '22:00', endTime: '01:00', timezone: 'Asia/Shanghai' }]);
  });

  it('round-trips sessions, keeping occurred and the minute fields', () => {
    const f = migrate(fixture()).data;
    const { records, errors } = parseCsvText('sessions', toCsvText('sessions', f));
    deepEqual(errors, []);
    const x1 = records.find((r) => r.id === 'x1');
    equal(x1.occurred, true);
    equal(x1.durationMinutes, 60);
    equal(x1.prepMinutes, 10);
    equal(x1.followupMinutes, 5);
    const x2 = records.find((r) => r.id === 'x2');
    equal(x2.occurred, false, 'a session that did not happen must stay that way');
  });

  it('keeps a comma inside a bio intact', () => {
    const f = migrate(fixture({
      people: fixture().people.map((p) => (p.id === 't1' ? { ...p, bio: 'Likes maths, chess, and "naps"' } : p))
    })).data;
    const { records } = parseCsvText('tutors', toCsvText('tutors', f));
    equal(records.find((r) => r.id === 't1').bio, 'Likes maths, chess, and "naps"');
  });

  it('accepts a minimal roster CSV with only a name column', () => {
    const { records, errors } = parseCsvText('students', 'name\nMing Nu\nYara Xi\n');
    deepEqual(errors, []);
    equal(records.length, 2);
    equal(records[0].name, 'Ming Nu');
    equal(records[0].role, 'student');
    ok(records[0].id, 'a new record should be given an id');
    equal(records[0].englishLevel, 'beginner', 'defaults should be filled in');
  });

  it('refuses a roster CSV with no name column', () => {
    const { errors } = parseCsvText('tutors', 'school,grade\nNorthline,11\n');
    ok(errors.some((e) => e.includes('name')), errors.join(' '));
  });

  it('refuses a CSV with no data rows', () => {
    ok(parseCsvText('tutors', 'name,school\n').errors.length > 0);
  });

  it('warns about unrecognised columns instead of failing', () => {
    const { records, errors, warnings } = parseCsvText('tutors', 'name,favourite_colour\nAvery,blue\n');
    deepEqual(errors, []);
    equal(records.length, 1);
    ok(warnings.some((w) => w.includes('favourite_colour')));
  });

  it('does not read a blank active cell as inactive', () => {
    // Blank must mean "unstated", not "deactivate this volunteer".
    const { records } = parseCsvText('tutors', 'name,active\nAvery,\n');
    equal(records[0].active, true);
  });

  it('reads yes/no in the active column', () => {
    const { records } = parseCsvText('tutors', 'name,active\nAvery,no\nBlake,yes\n');
    equal(records[0].active, false);
    equal(records[1].active, true);
  });

  it('requires a timezone on every availability row', () => {
    const { errors } = parseCsvText('availability', 'personId,weekday,startTime,endTime\nt1,6,09:00,12:00\n');
    ok(errors.some((e) => e.toLowerCase().includes('timezone')), errors.join(' '));
  });

  it('round-trips createdAt, so a re-import does not rewrite join dates', () => {
    const f = migrate(fixture()).data;
    const { records } = parseCsvText('tutors', toCsvText('tutors', f));
    const original = tutors(f);
    for (const [i, rec] of records.entries()) {
      equal(rec.createdAt, original[i].createdAt, `createdAt lost for ${rec.id}`);
    }
  });

  it('reports which columns a CSV actually carried', () => {
    // This is what lets an importer avoid overwriting fields the file omitted.
    const minimal = parseCsvText('tutors', 'id,name\nt1,Renamed\n');
    deepEqual(minimal.providedColumns, ['id', 'name']);

    const full = parseCsvText('tutors', toCsvText('tutors', migrate(fixture()).data));
    ok(full.providedColumns.includes('subjects'));
    ok(full.providedColumns.includes('maxStudents'));
    ok(full.providedColumns.includes('createdAt'));
  });

  it('a minimal roster CSV carries no columns it did not mention', () => {
    // The defaults are present on the record so a NEW person is complete, but
    // providedColumns must not claim them — otherwise merging this row over an
    // existing tutor would blank their subjects and reset their maximum.
    const { records, providedColumns } = parseCsvText('tutors', 'id,name\nt1,Renamed\n');
    deepEqual(providedColumns, ['id', 'name']);
    // The record itself still has defaults, which is correct for a new row.
    equal(records[0].maxStudents, 2);
    deepEqual(records[0].subjects, []);
    // But neither field is claimed as provided.
    ok(!providedColumns.includes('maxStudents'));
    ok(!providedColumns.includes('subjects'));
  });
});

/* ---------------------------------------------------------------- *
 * Query helpers
 * ---------------------------------------------------------------- */

describe('query helpers', () => {
  const f = migrate(fixture()).data;

  it('splits people by role', () => {
    equal(tutors(f).length, 3);
    equal(students(f).length, 3);
    deepEqual(ROLES, ['tutor', 'student']);
  });

  it('finds a person by id, or null', () => {
    equal(personById('t1', f).name, 'Avery Alpha');
    equal(personById('nobody', f), null);
  });

  it('returns availability for one person only', () => {
    const rows = availabilityFor('t1', f);
    equal(rows.length, 1);
    equal(rows[0].personId, 't1');
    deepEqual(availabilityFor('nobody', f), []);
  });

  it('activePairingsFor works from either side of the pairing', () => {
    equal(activePairingsFor('t1', f).length, 1, 'tutor side');
    equal(activePairingsFor('s1', f).length, 1, 'student side');
    equal(activePairingsFor('s3', f).length, 0, 'the s3 pairing is ended');
  });

  it('allPairingsFor includes ended ones', () => {
    equal(allPairingsFor('t1', f).length, 2);
    equal(allPairingsFor('s3', f).length, 1);
  });

  it('sessionsFor returns one pairing, most recent first', () => {
    const rows = sessionsFor('p1', f);
    equal(rows.length, 2);
    ok(rows[0].scheduledAt >= rows[1].scheduledAt, 'expected newest first');
    deepEqual(sessionsFor('nope', f), []);
  });

  it('sessionsForPerson spans every pairing they have had', () => {
    equal(sessionsForPerson('t1', f).length, 2);
    equal(sessionsForPerson('s2', f).length, 1);
    deepEqual(sessionsForPerson('t3', f), []);
  });

  it('unpairedStudents lists active students with no active pairing', () => {
    // s1 and s2 are actively paired; s3's only pairing has ended.
    deepEqual(unpairedStudents(f).map((s) => s.id), ['s3']);
  });

  it('counts a paused pairing as unpaired, because somebody must pick it up', () => {
    const paused = { ...f, pairings: f.pairings.map((p) => (p.id === 'p1' ? { ...p, status: 'paused' } : p)) };
    ok(unpairedStudents(paused).some((s) => s.id === 's1'));
  });

  it('skips inactive students', () => {
    const inactive = { ...f, people: f.people.map((p) => (p.id === 's3' ? { ...p, active: false } : p)) };
    deepEqual(unpairedStudents(inactive), []);
  });

  it('tutorsWithCapacity respects each tutor\'s own maximum', () => {
    // t1: 1 of 2 used -> room. t2: 1 of 1 used -> full. t3: inactive.
    const rows = tutorsWithCapacity(f);
    deepEqual(rows.map((r) => r.tutor.id), ['t1']);
    equal(rows[0].remaining, 1);
    equal(rows[0].capacity, 2);
    equal(rows[0].active, 1);
  });

  it('does not count ended or paused pairings against capacity', () => {
    const ended = { ...f, pairings: f.pairings.map((p) => (p.id === 'p2' ? { ...p, status: 'ended' } : p)) };
    ok(tutorsWithCapacity(ended).some((r) => r.tutor.id === 't2'), 't2 should have room once p2 ends');
  });

  it('excludes inactive tutors from capacity, whatever their maximum', () => {
    ok(!tutorsWithCapacity(f).some((r) => r.tutor.id === 't3'));
  });

  it('summary counts what the dashboard shows', () => {
    const s = summary(f);
    equal(s.tutors, 3);
    equal(s.students, 3);
    equal(s.activePairings, 2);
    equal(s.sessions, 3);
    equal(s.sessionsOccurred, 2);
    equal(s.unpairedStudents, 1);
    equal(s.tutorsWithCapacity, 1);
  });
});

describe('newId', () => {
  it('is prefixed and unique across a tight burst', () => {
    const ids = new Set();
    for (let i = 0; i < 2000; i++) ids.add(newId('tut'));
    equal(ids.size, 2000);
    ok([...ids].every((id) => id.startsWith('tut_')));
  });
});
