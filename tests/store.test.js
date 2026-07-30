/**
 * store.test.js
 *
 * Only the pure half of store.js is exercised here — migrate(), toJson(),
 * checkIntegrity(), and friends, all of which take their data as an argument.
 *
 * importJson() and replaceState() are deliberately NOT called: they write to
 * the same localStorage key the real app uses, so a coordinator who opened the
 * test page would find their program replaced by fixtures. A test that can
 * destroy the thing it is testing is not worth having.
 */

import { describe, it, equal, ok, deepEqual, throws } from './runner.js';
import {
  SCHEMA_VERSION,
  emptyProgram,
  migrate,
  checkIntegrity,
  toJson,
  suggestedFilename,
  newId
} from '../js/store.js';

describe('emptyProgram', () => {
  it('is stamped with the current schema version', () => {
    equal(emptyProgram().schemaVersion, SCHEMA_VERSION);
  });

  it('has every collection present and empty', () => {
    const p = emptyProgram();
    deepEqual(p.tutors, []);
    deepEqual(p.students, []);
    deepEqual(p.matches, []);
    deepEqual(p.sessions, []);
  });

  it('defaults students to China time', () => {
    equal(emptyProgram().program.studentTimeZone, 'Asia/Shanghai');
  });

  it('returns a fresh object each time, not a shared one', () => {
    const a = emptyProgram();
    a.tutors.push({ id: 'x' });
    equal(emptyProgram().tutors.length, 0);
  });
});

describe('migrate', () => {
  it('passes a current-version file through unchanged', () => {
    const input = { ...emptyProgram(), tutors: [{ id: 'tut_a', displayName: 'A' }] };
    const { data, applied } = migrate(input);
    equal(data.schemaVersion, SCHEMA_VERSION);
    deepEqual(applied, []);
    equal(data.tutors.length, 1);
  });

  it('treats a file with no schemaVersion as version 0 and migrates it', () => {
    const legacy = {
      programName: 'Old Program',
      adminTimeZone: 'America/Chicago',
      tutors: [{ id: 'tut_a', displayName: 'A' }],
      students: [],
      matches: [],
      sessions: []
    };
    const { data, applied } = migrate(legacy);
    deepEqual(applied, [0]);
    equal(data.schemaVersion, 1);
    equal(data.program.name, 'Old Program');
    equal(data.program.adminTimeZone, 'America/Chicago');
    equal(data.tutors.length, 1);
  });

  it('converts a v0 endsAt into durationMinutes', () => {
    const legacy = {
      sessions: [{
        id: 'ses_1',
        tutorId: 'tut_a',
        startsAt: '2026-03-07T14:00:00.000Z',
        endsAt: '2026-03-07T15:30:00.000Z',
        status: 'held'
      }]
    };
    const { data } = migrate(legacy);
    equal(data.sessions[0].durationMinutes, 90);
    equal(data.sessions[0].endsAt, undefined, 'endsAt should be gone once converted');
    equal(data.sessions[0].startsAt, '2026-03-07T14:00:00.000Z', 'startsAt must survive');
  });

  it('leaves a v0 session that already has durationMinutes alone', () => {
    const legacy = {
      sessions: [{ id: 'ses_1', tutorId: 'tut_a', startsAt: '2026-03-07T14:00:00.000Z', durationMinutes: 45 }]
    };
    equal(migrate(legacy).data.sessions[0].durationMinutes, 45);
  });

  it('fills in collections a partial file omitted', () => {
    const { data } = migrate({ schemaVersion: 1, tutors: [{ id: 'tut_a' }] });
    deepEqual(data.students, []);
    deepEqual(data.sessions, []);
    ok(data.program.studentTimeZone, 'program settings must be backfilled');
  });

  it('refuses a file from a newer build rather than mangling it', () => {
    throws(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 }));
  });

  it('rejects things that are not program files', () => {
    throws(() => migrate(null));
    throws(() => migrate([]));
    throws(() => migrate('a string'));
    throws(() => migrate(42));
  });
});

describe('checkIntegrity', () => {
  const base = emptyProgram();

  it('finds nothing wrong with a consistent program', () => {
    const data = {
      ...base,
      tutors: [{ id: 'tut_a' }],
      students: [{ id: 'stu_1' }],
      matches: [{ id: 'mat_1', tutorId: 'tut_a', studentId: 'stu_1' }],
      sessions: [{ id: 'ses_1', matchId: 'mat_1', tutorId: 'tut_a', startsAt: '2026-03-07T14:00:00.000Z' }]
    };
    const { errors, warnings } = checkIntegrity(data);
    deepEqual(errors, []);
    deepEqual(warnings, []);
  });

  it('flags duplicate ids as errors', () => {
    const data = { ...base, tutors: [{ id: 'tut_a' }, { id: 'tut_a' }] };
    ok(checkIntegrity(data).errors.some((e) => e.includes('Duplicate tutor id')));
  });

  it('flags a record with no id', () => {
    const data = { ...base, students: [{ displayName: 'nameless' }] };
    ok(checkIntegrity(data).errors.length > 0);
  });

  it('warns about dangling references without erroring', () => {
    const data = { ...base, matches: [{ id: 'mat_1', tutorId: 'ghost', studentId: 'ghost' }] };
    const { errors, warnings } = checkIntegrity(data);
    deepEqual(errors, []);
    equal(warnings.length, 2);
  });

  it('errors on a timestamp that is not ISO UTC', () => {
    const data = {
      ...base,
      tutors: [{ id: 'tut_a' }],
      sessions: [{ id: 'ses_1', tutorId: 'tut_a', startsAt: '2026-03-07 09:00' }]
    };
    ok(checkIntegrity(data).errors.some((e) => e.includes('ISO UTC')));
  });
});

describe('export', () => {
  it('produces parseable, re-importable JSON', () => {
    const data = { ...emptyProgram(), tutors: [{ id: 'tut_a', displayName: 'A' }] };
    const round = migrate(JSON.parse(toJson(data))).data;
    equal(round.tutors[0].id, 'tut_a');
    equal(round.schemaVersion, SCHEMA_VERSION);
  });

  it('stamps exportedAt on the way out', () => {
    const parsed = JSON.parse(toJson(emptyProgram()));
    ok(parsed.exportedAt, 'export must record when it happened');
    ok(parsed.exportedAt.endsWith('Z'), 'exportedAt must be ISO UTC');
  });

  it('is pretty-printed so a human can read and diff it', () => {
    ok(toJson(emptyProgram()).includes('\n  '), 'expected indented output');
  });

  it('survives a full round trip with every collection populated', () => {
    const data = {
      ...emptyProgram(),
      tutors: [{ id: 'tut_a', availability: [{ day: 6, start: '08:00', end: '11:00', tz: 'America/New_York' }] }],
      students: [{ id: 'stu_1', guardianContact: null }],
      matches: [{ id: 'mat_1', tutorId: 'tut_a', studentId: 'stu_1', status: 'active' }],
      sessions: [{ id: 'ses_1', tutorId: 'tut_a', startsAt: '2026-03-07T14:00:00.000Z', durationMinutes: 60, status: 'held' }]
    };
    const round = migrate(JSON.parse(toJson(data))).data;
    deepEqual(round.tutors, data.tutors);
    deepEqual(round.students, data.students);
    deepEqual(round.matches, data.matches);
    deepEqual(round.sessions, data.sessions);
  });

  it('suggests a filesystem-safe filename', () => {
    const name = suggestedFilename({ program: { name: 'Weekend Tutoring / Spring!' } });
    ok(/^[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.json$/.test(name), `got ${name}`);
  });

  it('falls back to a filename when the program has no name', () => {
    ok(suggestedFilename({ program: { name: '!!!' } }).startsWith('program-'));
  });
});

describe('newId', () => {
  it('is prefixed and unique across a burst', () => {
    const ids = new Set();
    for (let i = 0; i < 500; i++) ids.add(newId('tut'));
    equal(ids.size, 500);
    ok([...ids].every((id) => id.startsWith('tut_')));
  });
});
