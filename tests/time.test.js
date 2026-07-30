import { describe, it, equal, deepEqual, ok, close, throws } from './runner.js';
import {
  wallPartsInZone,
  zoneOffsetMinutes,
  weekdayInZone,
  minutesOfDayInZone,
  wallTimeToUtcIso,
  parseHhMm,
  formatHhMm,
  weekAnchorUtcIso,
  slotToInterval,
  intervalOverlapMinutes,
  availabilityOverlapMinutes,
  availabilityOverlapWindows,
  addMinutes,
  calendarDaysBetween,
  dateKeyInZone,
  monthKeyInZone,
  isValidTimeZone,
  toUtcIso
} from '../js/time.js';

// 2026-03-07 is a Saturday, before US daylight saving starts (Mar 8, 2026).
const SAT_WINTER = '2026-03-07T14:00:00.000Z';
// 2026-03-14 is the Saturday after the US clocks moved forward.
const SAT_SUMMER = '2026-03-14T14:00:00.000Z';

describe('zone offsets', () => {
  it('Shanghai is always +480, DST or not', () => {
    equal(zoneOffsetMinutes(SAT_WINTER, 'Asia/Shanghai'), 480);
    equal(zoneOffsetMinutes(SAT_SUMMER, 'Asia/Shanghai'), 480);
    equal(zoneOffsetMinutes('2026-07-04T00:00:00.000Z', 'Asia/Shanghai'), 480);
  });

  it('New York moves with daylight saving', () => {
    equal(zoneOffsetMinutes(SAT_WINTER, 'America/New_York'), -300);
    equal(zoneOffsetMinutes(SAT_SUMMER, 'America/New_York'), -240);
  });

  it('UTC is zero', () => {
    equal(zoneOffsetMinutes(SAT_WINTER, 'UTC'), 0);
  });

  it('validates zone names', () => {
    ok(isValidTimeZone('Asia/Shanghai'));
    ok(isValidTimeZone('America/New_York'));
    ok(!isValidTimeZone('Mars/Olympus'));
    ok(!isValidTimeZone(''));
    ok(!isValidTimeZone(null));
  });
});

describe('wall time <-> instant', () => {
  it('reads the clock an observer sees', () => {
    // 14:00 UTC on Mar 7 is 09:00 in New York (EST) and 22:00 in Shanghai.
    const ny = wallPartsInZone(SAT_WINTER, 'America/New_York');
    equal(ny.hour, 9);
    equal(ny.day, 7);
    equal(ny.weekday, 6); // Saturday

    const sh = wallPartsInZone(SAT_WINTER, 'Asia/Shanghai');
    equal(sh.hour, 22);
    equal(sh.day, 7);
    equal(sh.weekday, 6);
  });

  it('crosses the date line into the next day in China', () => {
    // 20:00 UTC Saturday is 04:00 Sunday in Shanghai.
    const sh = wallPartsInZone('2026-03-07T20:00:00.000Z', 'Asia/Shanghai');
    equal(sh.hour, 4);
    equal(sh.day, 8);
    equal(sh.weekday, 0); // Sunday
  });

  it('round-trips wall time back to the same instant', () => {
    // Unambiguous instants only. A wall time inside a DST fall-back hour
    // names two instants and cannot round-trip by definition; that case is
    // pinned separately below.
    const instants = [
      SAT_WINTER, SAT_SUMMER,
      '2026-11-01T20:00:00.000Z',
      '2026-07-04T16:00:00.000Z',
      '2026-01-15T03:00:00.000Z'
    ];
    for (const tz of ['America/New_York', 'America/Los_Angeles', 'America/Denver', 'Asia/Shanghai', 'UTC']) {
      for (const iso of instants) {
        const parts = wallPartsInZone(iso, tz);
        equal(wallTimeToUtcIso(parts, tz), iso, `round trip failed for ${tz} at ${iso}`);
      }
    }
  });

  it('resolves an ambiguous wall time to the first occurrence', () => {
    // US clocks fall back on 2026-11-01. In Los Angeles the local clock
    // reads 01:30 twice: at 08:30Z (PDT) and again at 09:30Z (PST).
    const LA = 'America/Los_Angeles';
    const both = ['2026-11-01T08:30:00.000Z', '2026-11-01T09:30:00.000Z'];
    for (const iso of both) {
      equal(wallPartsInZone(iso, LA).hour, 1);
      equal(wallPartsInZone(iso, LA).minute, 30);
    }
    equal(
      wallTimeToUtcIso({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, LA),
      both[0],
      'ambiguous wall time must resolve to the earlier instant'
    );
  });

  it('resolves a nonexistent wall time forward, past the gap', () => {
    // US clocks spring forward on 2026-03-08: in Los Angeles the local clock
    // jumps 02:00 -> 03:00, so 02:30 never happens that day.
    const LA = 'America/Los_Angeles';
    const resolved = wallTimeToUtcIso({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, LA);
    const parts = wallPartsInZone(resolved, LA);
    equal(parts.hour, 3, 'must land after the gap, not before it');
    equal(parts.minute, 30);
    equal(parts.day, 8);
    // Landing before the gap (01:30) would silently move a scheduled session
    // an hour earlier, which is the failure mode this pins down.
    ok(resolved > '2026-03-08T10:00:00.000Z', `resolved to ${resolved}`);
  });

  it('resolves 9am Shanghai to the right instant', () => {
    // 09:00 Shanghai = 01:00 UTC the same calendar day.
    equal(
      wallTimeToUtcIso({ year: 2026, month: 3, day: 8, hour: 9, minute: 0 }, 'Asia/Shanghai'),
      '2026-03-08T01:00:00.000Z'
    );
  });

  it('resolves 9am New York differently either side of the DST switch', () => {
    equal(
      wallTimeToUtcIso({ year: 2026, month: 3, day: 7, hour: 9 }, 'America/New_York'),
      '2026-03-07T14:00:00.000Z'
    );
    equal(
      wallTimeToUtcIso({ year: 2026, month: 3, day: 14, hour: 9 }, 'America/New_York'),
      '2026-03-14T13:00:00.000Z'
    );
  });

  it('normalises any date-like input to ISO UTC', () => {
    equal(toUtcIso(new Date(SAT_WINTER)), SAT_WINTER);
    equal(toUtcIso(SAT_WINTER), SAT_WINTER);
    throws(() => toUtcIso('not a date'));
  });

  it('reports weekday and minutes-of-day in zone', () => {
    equal(weekdayInZone(SAT_WINTER, 'America/New_York'), 6);
    equal(minutesOfDayInZone(SAT_WINTER, 'America/New_York'), 9 * 60);
    equal(minutesOfDayInZone(SAT_WINTER, 'Asia/Shanghai'), 22 * 60);
  });
});

describe('HH:MM parsing', () => {
  it('parses and formats', () => {
    equal(parseHhMm('09:30'), 570);
    equal(parseHhMm('9:30'), 570);
    equal(parseHhMm('00:00'), 0);
    equal(parseHhMm('23:59'), 1439);
    equal(formatHhMm(570), '09:30');
    equal(formatHhMm(0), '00:00');
  });

  it('rejects nonsense rather than guessing', () => {
    throws(() => parseHhMm('9'));
    throws(() => parseHhMm('nine'));
    throws(() => parseHhMm('09:70'));
    throws(() => parseHhMm(''));
  });
});

describe('week anchoring', () => {
  it('anchors to the Sunday that starts the week', () => {
    // Sat Mar 7 belongs to the week starting Sun Mar 1.
    equal(weekAnchorUtcIso(SAT_WINTER), '2026-03-01T00:00:00.000Z');
    // Sunday anchors to itself.
    equal(weekAnchorUtcIso('2026-03-01T23:00:00.000Z'), '2026-03-01T00:00:00.000Z');
  });

  it('resolves a slot to a concrete interval', () => {
    const anchor = weekAnchorUtcIso(SAT_WINTER);
    const slot = { weekday: 6, startTime: '09:00', endTime: '11:00', timezone: 'America/New_York' };
    const interval = slotToInterval(slot, anchor);
    equal(interval.startIso, '2026-03-07T14:00:00.000Z');
    equal(interval.endIso, '2026-03-07T16:00:00.000Z');
  });

  it('handles a slot that runs past local midnight', () => {
    const anchor = weekAnchorUtcIso(SAT_WINTER);
    const slot = { weekday: 6, startTime: '23:00', endTime: '01:00', timezone: 'America/New_York' };
    const interval = slotToInterval(slot, anchor);
    equal((interval.endMs - interval.startMs) / 60000, 120);
  });
});

describe('interval overlap', () => {
  it('measures plain overlap', () => {
    equal(intervalOverlapMinutes({ startMs: 0, endMs: 3600000 }, { startMs: 1800000, endMs: 5400000 }), 30);
  });

  it('reports zero for touching intervals', () => {
    equal(intervalOverlapMinutes({ startMs: 0, endMs: 3600000 }, { startMs: 3600000, endMs: 7200000 }), 0);
  });

  it('reports zero for disjoint intervals', () => {
    equal(intervalOverlapMinutes({ startMs: 0, endMs: 1000 }, { startMs: 9999, endMs: 99999 }), 0);
  });
});

describe('availability overlap across the Pacific', () => {
  // The signature case: Saturday morning in the US is Saturday night in China.
  const tutorSatMorningNY = [{ weekday: 6, startTime: '08:00', endTime: '11:00', timezone: 'America/New_York' }];
  const studentSatNightSH = [{ weekday: 6, startTime: '20:00', endTime: '23:00', timezone: 'Asia/Shanghai' }];

  it('finds the overlap that a naive day-number comparison would also find', () => {
    // Sat 08:00–11:00 EST = Sat 13:00–16:00 UTC = Sat 21:00–24:00 Shanghai.
    // Student is free Sat 20:00–23:00 Shanghai = Sat 12:00–15:00 UTC.
    // Overlap: 13:00–15:00 UTC = 120 minutes.
    equal(availabilityOverlapMinutes(tutorSatMorningNY, studentSatNightSH, SAT_WINTER), 120);
  });

  it('finds an overlap that spans two different calendar days', () => {
    // Tutor: Saturday 21:00–23:00 New York = Sunday 02:00–04:00 UTC.
    // Student: Sunday 10:00–12:00 Shanghai = Sunday 02:00–04:00 UTC.
    // Same two hours, on days labelled differently at each end. A comparison
    // that matched on day-of-week first would score this zero.
    const tutor = [{ weekday: 6, startTime: '21:00', endTime: '23:00', timezone: 'America/New_York' }];
    const student = [{ weekday: 0, startTime: '10:00', endTime: '12:00', timezone: 'Asia/Shanghai' }];
    equal(availabilityOverlapMinutes(tutor, student, SAT_WINTER), 120);
  });

  it('wraps the recurring week rather than losing the pair off the end', () => {
    // The anchored week runs Sunday..Saturday. A tutor's Saturday evening
    // spills into Sunday UTC, which is a Sunday *seven days before* the
    // anchor's Sunday. Without the ±7-day shift this scores zero, and the
    // most natural weekend slot in the whole program would look impossible.
    const tutor = [{ weekday: 6, startTime: '21:00', endTime: '23:00', timezone: 'America/New_York' }];
    const student = [{ weekday: 0, startTime: '10:00', endTime: '12:00', timezone: 'Asia/Shanghai' }];

    equal(availabilityOverlapMinutes(tutor, student, SAT_WINTER), 120);

    const [window] = availabilityOverlapWindows(tutor, student, SAT_WINTER);
    ok(window, 'expected a concrete window');
    // The same instant is Saturday for the tutor and Sunday for the student.
    equal(weekdayInZone(window.startIso, 'America/New_York'), 6);
    equal(weekdayInZone(window.startIso, 'Asia/Shanghai'), 0);
    equal(minutesOfDayInZone(window.startIso, 'America/New_York'), 21 * 60);
    equal(minutesOfDayInZone(window.startIso, 'Asia/Shanghai'), 10 * 60);
  });

  it('shifts by an hour when US daylight saving starts, China unchanged', () => {
    // Same declared availability. In winter, tutor Sat 08:00 EST = 13:00 UTC.
    // In summer, tutor Sat 08:00 EDT = 12:00 UTC. The student never moved,
    // so the shared window changes size. This is the bug the whole module
    // exists to prevent.
    const winter = availabilityOverlapMinutes(tutorSatMorningNY, studentSatNightSH, SAT_WINTER);
    const summer = availabilityOverlapMinutes(tutorSatMorningNY, studentSatNightSH, SAT_SUMMER);
    equal(winter, 120);
    equal(summer, 180); // tutor's window slides an hour earlier in UTC, fully covering the student's
    ok(winter !== summer, 'DST must change the computed overlap');
  });

  it('returns zero for genuinely incompatible schedules', () => {
    const tutor = [{ weekday: 6, startTime: '08:00', endTime: '10:00', timezone: 'America/New_York' }];
    const student = [{ weekday: 6, startTime: '08:00', endTime: '10:00', timezone: 'Asia/Shanghai' }];
    // Sat 08:00 NY is Sat 21:00 Shanghai. No overlap with Sat morning there.
    equal(availabilityOverlapMinutes(tutor, student, SAT_WINTER), 0);
  });

  it('returns zero rather than throwing on empty availability', () => {
    equal(availabilityOverlapMinutes([], studentSatNightSH, SAT_WINTER), 0);
    equal(availabilityOverlapMinutes(tutorSatMorningNY, [], SAT_WINTER), 0);
    equal(availabilityOverlapMinutes(undefined, undefined, SAT_WINTER), 0);
  });

  it('does not double-count one tutor slot against two student slots', () => {
    // A single 3-hour tutor window cannot yield 6 hours of tutoring just
    // because the student listed two overlapping windows.
    const student = [
      { weekday: 6, startTime: '20:00', endTime: '23:00', timezone: 'Asia/Shanghai' },
      { weekday: 6, startTime: '21:00', endTime: '23:59', timezone: 'Asia/Shanghai' }
    ];
    const total = availabilityOverlapMinutes(tutorSatMorningNY, student, SAT_WINTER);
    ok(total <= 180, `expected at most the tutor's 180 minutes, got ${total}`);
  });

  it('reports concrete windows, earliest first', () => {
    const windows = availabilityOverlapWindows(tutorSatMorningNY, studentSatNightSH, SAT_WINTER);
    ok(windows.length > 0);
    equal(windows[0].startIso, '2026-03-07T13:00:00.000Z');
    equal(windows[0].minutes, 120);
    for (let i = 1; i < windows.length; i++) {
      ok(windows[i - 1].startIso <= windows[i].startIso, 'windows must be sorted');
    }
  });
});

describe('date arithmetic', () => {
  it('adds minutes', () => {
    equal(addMinutes(SAT_WINTER, 90), '2026-03-07T15:30:00.000Z');
    equal(addMinutes(SAT_WINTER, -60), '2026-03-07T13:00:00.000Z');
  });

  it('counts calendar days, not 24-hour blocks', () => {
    // 23:30 to 00:30 the next day is one calendar day apart, not zero.
    equal(
      calendarDaysBetween('2026-03-07T04:30:00.000Z', '2026-03-07T05:30:00.000Z', 'America/New_York'),
      1
    );
  });

  it('keys dates and months in the observer zone', () => {
    // 2026-03-07 20:00 UTC is already Mar 8 in Shanghai.
    equal(dateKeyInZone('2026-03-07T20:00:00.000Z', 'Asia/Shanghai'), '2026-03-08');
    equal(dateKeyInZone('2026-03-07T20:00:00.000Z', 'America/New_York'), '2026-03-07');
    // A session at 21:00 Mar 31 in New York is April 1 UTC but a March session.
    equal(monthKeyInZone('2026-04-01T01:00:00.000Z', 'America/New_York'), '2026-03');
    equal(monthKeyInZone('2026-04-01T01:00:00.000Z', 'UTC'), '2026-04');
  });

  it('keeps offsets consistent between zones', () => {
    const delta =
      (zoneOffsetMinutes(SAT_WINTER, 'Asia/Shanghai') -
       zoneOffsetMinutes(SAT_WINTER, 'America/New_York')) / 60;
    close(delta, 13); // 13 hours apart in winter
  });
});
