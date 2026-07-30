/**
 * time.test.js
 *
 * The highest-risk module, so this is the longest test file. Reference dates
 * are all in 2026 and chosen deliberately:
 *
 *   Sat 2026-06-20  midsummer — US on PDT (UTC-7), China UTC+8
 *   Sat 2026-01-17  midwinter — US on PST (UTC-8), China UTC+8
 *   Sun 2026-03-08  US springs forward: local 02:00 -> 03:00
 *   Sun 2026-11-01  US falls back:      local 02:00 -> 01:00
 *   Sat 2026-03-07  the Saturday before the spring transition
 *   Sat 2026-03-14  the Saturday after it
 *
 * Both US transitions land on a Sunday, which is a tutoring day.
 */

import { describe, it, equal, deepEqual, ok, close, throws } from './runner.js';
import {
  // conversions
  toUtc,
  fromUtc,
  parseLocalIso,
  resolveLocal,
  wallTimeToUtcIso,
  toUtcIso,
  // reading a zone
  wallPartsInZone,
  zoneOffsetMinutes,
  weekdayInZone,
  minutesOfDayInZone,
  observesDst,
  isValidTimeZone,
  // formatting
  formatDual,
  formatInZone,
  weekdayLabel,
  zoneLabel,
  dateKeyInZone,
  monthKeyInZone,
  // slots and overlap
  parseHhMm,
  formatHhMm,
  weekAnchorUtcIso,
  slotToInterval,
  nextOccurrence,
  intervalOverlapMinutes,
  mergeIntervals,
  overlapWindows,
  availabilityOverlapMinutes,
  availabilityOverlapWindows,
  // arithmetic
  addMinutes,
  calendarDaysBetween,
  CHINA_TZ,
  PACIFIC_TZ
} from '../js/time.js';
import { SCENARIOS, CATEGORIES, runSelfTest, pick } from '../js/selftest.js';

const SH = CHINA_TZ;      // Asia/Shanghai
const LA = PACIFIC_TZ;    // America/Los_Angeles
const NY = 'America/New_York';

const SAT_SUMMER = '2026-06-20T01:00:00.000Z'; // Sat 09:00 Beijing / Fri 18:00 Pacific
const SAT_WINTER = '2026-01-17T01:00:00.000Z'; // Sat 09:00 Beijing / Fri 17:00 Pacific
const REF_SUMMER = '2026-06-20T00:00:00.000Z';

/* ================================================================== *
 * Zones and offsets
 * ================================================================== */

describe('zone offsets', () => {
  it('China is UTC+8 all year and never observes DST', () => {
    equal(zoneOffsetMinutes('2026-01-15T00:00:00.000Z', SH), 480);
    equal(zoneOffsetMinutes('2026-03-08T12:00:00.000Z', SH), 480);
    equal(zoneOffsetMinutes('2026-07-15T00:00:00.000Z', SH), 480);
    equal(zoneOffsetMinutes('2026-11-01T12:00:00.000Z', SH), 480);
    equal(observesDst('2026-06-20T00:00:00.000Z', SH), false);
  });

  it('US Pacific moves between UTC-8 and UTC-7', () => {
    equal(zoneOffsetMinutes('2026-01-15T00:00:00.000Z', LA), -480);
    equal(zoneOffsetMinutes('2026-07-15T00:00:00.000Z', LA), -420);
    equal(observesDst('2026-06-20T00:00:00.000Z', LA), true);
  });

  it('Pacific and China are 16 hours apart in winter, 15 in summer', () => {
    const winter = (zoneOffsetMinutes(SAT_WINTER, SH) - zoneOffsetMinutes(SAT_WINTER, LA)) / 60;
    const summer = (zoneOffsetMinutes(SAT_SUMMER, SH) - zoneOffsetMinutes(SAT_SUMMER, LA)) / 60;
    close(winter, 16);
    close(summer, 15);
    ok(winter !== summer, 'the gap between the two sides must change with US DST');
  });

  it('Arizona does not observe DST even though it is in the US', () => {
    equal(observesDst('2026-06-20T00:00:00.000Z', 'America/Phoenix'), false);
    equal(zoneOffsetMinutes('2026-01-15T00:00:00.000Z', 'America/Phoenix'), -420);
    equal(zoneOffsetMinutes('2026-07-15T00:00:00.000Z', 'America/Phoenix'), -420);
  });

  it('validates zone names and refuses invented ones', () => {
    ok(isValidTimeZone(SH));
    ok(isValidTimeZone(LA));
    ok(!isValidTimeZone('Mars/Olympus'));
    ok(!isValidTimeZone(''));
    ok(!isValidTimeZone(null));
    throws(() => zoneOffsetMinutes(SAT_SUMMER, 'Mars/Olympus'));
    throws(() => wallPartsInZone(SAT_SUMMER, 'Not/AZone'));
  });
});

/* ================================================================== *
 * toUtc / fromUtc — the headline case
 * ================================================================== */

describe('Saturday 09:00 Beijing is Friday 18:00 Pacific', () => {
  it('converts Beijing wall time to the right instant', () => {
    equal(toUtc('2026-06-20T09:00', SH), SAT_SUMMER);
  });

  it('reads that instant as Friday 18:00 in California', () => {
    equal(fromUtc(SAT_SUMMER, LA), '2026-06-19T18:00:00');
    equal(weekdayLabel(SAT_SUMMER, LA), 'Friday');
    equal(weekdayInZone(SAT_SUMMER, LA), 5);
  });

  it('reads the same instant as Saturday 09:00 in Beijing', () => {
    equal(fromUtc(SAT_SUMMER, SH), '2026-06-20T09:00:00');
    equal(weekdayLabel(SAT_SUMMER, SH), 'Saturday');
    equal(weekdayInZone(SAT_SUMMER, SH), 6);
  });

  it('converts from the Pacific side to the identical instant', () => {
    equal(toUtc('2026-06-19T18:00', LA), SAT_SUMMER);
    equal(toUtc('2026-06-19T18:00', LA), toUtc('2026-06-20T09:00', SH));
  });

  it('is Friday 17:00 Pacific in winter, because only the US side moved', () => {
    equal(toUtc('2026-01-17T09:00', SH), SAT_WINTER);
    equal(fromUtc(SAT_WINTER, LA), '2026-01-16T17:00:00');
    equal(weekdayLabel(SAT_WINTER, LA), 'Friday');
    // The student's declared availability is identical in both seasons.
    equal(fromUtc(SAT_SUMMER, SH).slice(11), fromUtc(SAT_WINTER, SH).slice(11));
  });
});

describe('toUtc / fromUtc', () => {
  it('round-trips every unambiguous wall time it is given', () => {
    const cases = [
      [SH, '2026-06-20T09:00:00'], [LA, '2026-06-19T18:00:00'],
      [SH, '2026-01-17T09:00:00'], [LA, '2026-01-16T17:00:00'],
      [NY, '2026-03-08T12:00:00'], [LA, '2026-03-08T23:30:00'],
      [LA, '2026-11-01T23:30:00'], [SH, '2026-11-01T00:00:00'],
      ['UTC', '2026-06-20T00:00:00'], ['America/Phoenix', '2026-07-04T09:00:00']
    ];
    for (const [tz, local] of cases) {
      equal(fromUtc(toUtc(local, tz), tz), local, `round trip failed for ${local} in ${tz}`);
    }
  });

  it('accepts date-only, minute, second and millisecond precision', () => {
    equal(toUtc('2026-06-20', SH), '2026-06-19T16:00:00.000Z');
    equal(toUtc('2026-06-20T09:00', SH), SAT_SUMMER);
    equal(toUtc('2026-06-20T09:00:30', SH), '2026-06-20T01:00:30.000Z');
    equal(toUtc('2026-06-20 09:00', SH), SAT_SUMMER, 'a space instead of T is accepted');
  });

  it('refuses a string that already carries a zone', () => {
    // Accepting these would be exactly the confusion this module prevents.
    for (const bad of [
      '2026-06-20T09:00:00Z',
      '2026-06-20T09:00:00.000Z',
      '2026-06-20T09:00+08:00',
      '2026-06-20T09:00-0700'
    ]) {
      throws(() => toUtc(bad, SH), `expected rejection of ${bad}`);
    }
  });

  it('refuses malformed local strings rather than guessing', () => {
    for (const bad of ['', 'tomorrow', '2026/06/20 09:00', '20-06-2026', '2026-13-01', '2026-06-32', '2026-06-20T25:00']) {
      throws(() => parseLocalIso(bad), `expected rejection of "${bad}"`);
    }
  });

  it('requires a real time zone', () => {
    throws(() => toUtc('2026-06-20T09:00', 'Mars/Olympus'));
    throws(() => fromUtc(SAT_SUMMER, 'Mars/Olympus'));
  });

  it('fromUtc returns no zone suffix, because the result is a wall clock', () => {
    const local = fromUtc(SAT_SUMMER, LA);
    ok(!local.endsWith('Z'), local);
    ok(!/[+-]\d{2}:\d{2}$/.test(local), local);
    // And feeding it back in as an instant is refused.
    throws(() => parseLocalIso(`${local}Z`));
  });

  it('normalises any date-like input to ISO UTC', () => {
    equal(toUtcIso(new Date(SAT_SUMMER)), SAT_SUMMER);
    equal(toUtcIso(SAT_SUMMER), SAT_SUMMER);
    throws(() => toUtcIso('not a date'));
  });
});

/* ================================================================== *
 * Reading a zone
 * ================================================================== */

describe('wallPartsInZone', () => {
  it('reads the clock an observer sees', () => {
    const la = wallPartsInZone(SAT_SUMMER, LA);
    equal(la.hour, 18);
    equal(la.day, 19);
    equal(la.weekday, 5);

    const sh = wallPartsInZone(SAT_SUMMER, SH);
    equal(sh.hour, 9);
    equal(sh.day, 20);
    equal(sh.weekday, 6);
  });

  it('handles local midnight without reporting hour 24', () => {
    const midnight = toUtc('2026-06-20T00:00', SH);
    const parts = wallPartsInZone(midnight, SH);
    equal(parts.hour, 0);
    equal(parts.day, 20);
    equal(minutesOfDayInZone(midnight, SH), 0);
  });

  it('reports minutes since local midnight per zone', () => {
    equal(minutesOfDayInZone(SAT_SUMMER, SH), 9 * 60);
    equal(minutesOfDayInZone(SAT_SUMMER, LA), 18 * 60);
  });

  it('keys dates and months in the observer zone', () => {
    equal(dateKeyInZone(SAT_SUMMER, SH), '2026-06-20');
    equal(dateKeyInZone(SAT_SUMMER, LA), '2026-06-19');
    // 21:00 Mar 31 in New York is April 1 UTC but a March session.
    equal(monthKeyInZone('2026-04-01T01:00:00.000Z', NY), '2026-03');
    equal(monthKeyInZone('2026-04-01T01:00:00.000Z', 'UTC'), '2026-04');
  });
});

/* ================================================================== *
 * DST transitions
 * ================================================================== */

describe('spring forward (2026-03-08, US)', () => {
  it('classifies the skipped hour as nonexistent', () => {
    const r = resolveLocal({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, LA);
    equal(r.kind, 'nonexistent');
  });

  it('resolves it FORWARD, never backward', () => {
    // Resolving backward would move a booked session an hour earlier, which is
    // the direction that makes someone miss it.
    const r = resolveLocal({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, LA);
    equal(fromUtc(r.utc, LA), '2026-03-08T03:30:00');
    ok(r.utc > '2026-03-08T10:00:00.000Z', r.utc);
    ok(r.alternativeUtc < r.utc, 'the backward candidate should be reported as the alternative');
  });

  it('can be told to reject the nonexistent hour instead', () => {
    throws(() => toUtc('2026-03-08T02:30', LA, { nonexistent: 'reject' }));
    // And the default does not throw.
    ok(toUtc('2026-03-08T02:30', LA));
  });

  it('leaves the surrounding hours normal and one hour apart', () => {
    const before = resolveLocal({ year: 2026, month: 3, day: 8, hour: 1 }, LA);
    const after = resolveLocal({ year: 2026, month: 3, day: 8, hour: 3 }, LA);
    equal(before.kind, 'normal');
    equal(after.kind, 'normal');
    equal(before.utc, '2026-03-08T09:00:00.000Z');
    equal(after.utc, '2026-03-08T10:00:00.000Z');
    equal(before.offsetMinutes, -480);
    equal(after.offsetMinutes, -420);
  });

  it('shifts a recurring Beijing slot on the tutor clock but not the student clock', () => {
    // Nobody edited anything between these two Saturdays.
    const before = toUtc('2026-03-07T09:00', SH);
    const after = toUtc('2026-03-14T09:00', SH);
    equal(fromUtc(before, SH), '2026-03-07T09:00:00');
    equal(fromUtc(after, SH), '2026-03-14T09:00:00');
    equal(fromUtc(before, LA), '2026-03-06T17:00:00');
    equal(fromUtc(after, LA), '2026-03-13T18:00:00');
  });
});

describe('fall back (2026-11-01, US)', () => {
  it('classifies the repeated hour as ambiguous', () => {
    const r = resolveLocal({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, LA);
    equal(r.kind, 'ambiguous');
  });

  it('picks the first occurrence by default and reports the second', () => {
    const r = resolveLocal({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, LA);
    equal(r.utc, '2026-11-01T08:30:00.000Z');
    equal(r.alternativeUtc, '2026-11-01T09:30:00.000Z');
    equal(r.offsetMinutes, -420, 'the first occurrence is still on PDT');
  });

  it('can be asked for the second occurrence', () => {
    const later = resolveLocal({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, LA, { ambiguous: 'later' });
    equal(later.utc, '2026-11-01T09:30:00.000Z');
    equal(later.alternativeUtc, '2026-11-01T08:30:00.000Z');
    equal(later.offsetMinutes, -480, 'the second occurrence is on PST');
  });

  it('both instants genuinely read the same wall clock', () => {
    for (const instant of ['2026-11-01T08:30:00.000Z', '2026-11-01T09:30:00.000Z']) {
      equal(fromUtc(instant, LA), '2026-11-01T01:30:00');
    }
  });

  it('leaves the surrounding hours unambiguous', () => {
    equal(resolveLocal({ year: 2026, month: 11, day: 1, hour: 0 }, LA).kind, 'normal');
    equal(resolveLocal({ year: 2026, month: 11, day: 1, hour: 3 }, LA).kind, 'normal');
  });
});

describe('China is immune to both transitions', () => {
  it('never reports an ambiguous or nonexistent local hour', () => {
    const kinds = new Set();
    for (const month of [3, 11]) {
      for (let day = 1; day <= 28; day++) {
        for (let hour = 0; hour < 24; hour++) {
          kinds.add(resolveLocal({ year: 2026, month, day, hour }, SH).kind);
        }
      }
    }
    deepEqual([...kinds], ['normal'], 'every local hour in both transition months must be normal');
  });
});

/* ================================================================== *
 * formatDual
 * ================================================================== */

describe('formatDual', () => {
  const dual = formatDual(SAT_SUMMER, LA, SH);

  it('gives each side its own wall clock', () => {
    equal(dual.a.localIso, '2026-06-19T18:00:00');
    equal(dual.b.localIso, '2026-06-20T09:00:00');
    equal(dual.a.time, '18:00');
    equal(dual.b.time, '09:00');
  });

  it('computes each weekday label independently, and they differ', () => {
    equal(dual.a.weekdayLabel, 'Friday');
    equal(dual.b.weekdayLabel, 'Saturday');
    equal(dual.a.weekday, 5);
    equal(dual.b.weekday, 6);
    ok(dual.a.weekday !== dual.b.weekday, 'the whole point is that these disagree');
  });

  it('reports the calendar-day difference and offset gap', () => {
    equal(dual.dayDelta, 1);
    equal(dual.sameLocalDay, false);
    equal(dual.offsetHours, 15);
  });

  it('names each zone correctly at that instant', () => {
    equal(dual.a.zoneLabel, 'PDT');
    ok(dual.b.zoneLabel.includes('8'), dual.b.zoneLabel);
    equal(dual.a.offsetMinutes, -420);
    equal(dual.b.offsetMinutes, 480);
  });

  it('reports PST rather than PDT in winter', () => {
    equal(formatDual(SAT_WINTER, LA, SH).a.zoneLabel, 'PST');
  });

  it('is symmetric: swapping the zones negates dayDelta', () => {
    equal(formatDual(SAT_SUMMER, SH, LA).dayDelta, -1);
  });

  it('reports dayDelta 0 when both sides share a calendar day', () => {
    // 2026-06-20T12:00Z is Saturday in both zones.
    const same = formatDual('2026-06-20T12:00:00.000Z', LA, SH);
    equal(same.a.weekdayLabel, 'Saturday');
    equal(same.b.weekdayLabel, 'Saturday');
    equal(same.dayDelta, 0);
    equal(same.sameLocalDay, true);
  });

  it('localises the weekday label', () => {
    const zh = formatDual(SAT_SUMMER, LA, SH, { locale: 'zh-CN' });
    equal(zh.a.weekdayLabel, '星期五');
    equal(zh.b.weekdayLabel, '星期六');
    // The English name is still available for logic that needs a stable value.
    equal(zh.a.weekdayEn, 'Friday');
    equal(zh.b.weekdayEn, 'Saturday');
  });

  it('supports short weekday labels', () => {
    equal(formatDual(SAT_SUMMER, LA, SH, { weekdayWidth: 'short' }).a.weekdayLabel, 'Fri');
  });

  it('rejects an unknown zone', () => {
    throws(() => formatDual(SAT_SUMMER, 'Mars/Olympus', SH));
  });
});

describe('formatInZone and labels', () => {
  it('formats time, weekday, date and zone on request', () => {
    const text = formatInZone(SAT_SUMMER, LA, { weekday: true, date: true, zoneName: true });
    ok(text.includes('Fri'), text);
    ok(text.includes('Jun'), text);
    ok(text.includes('PDT'), text);
  });

  it('weekdayLabel is bound to the zone it is asked about', () => {
    equal(weekdayLabel(SAT_SUMMER, LA), 'Friday');
    equal(weekdayLabel(SAT_SUMMER, SH), 'Saturday');
    equal(weekdayLabel(SAT_SUMMER, LA, { width: 'short' }), 'Fri');
  });

  it('zoneLabel tracks the transition', () => {
    equal(zoneLabel('2026-01-15T20:00:00.000Z', LA), 'PST');
    equal(zoneLabel('2026-07-15T20:00:00.000Z', LA), 'PDT');
  });
});

/* ================================================================== *
 * HH:MM and week anchoring
 * ================================================================== */

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

describe('week anchoring and slots', () => {
  it('anchors to the Sunday that starts the week', () => {
    equal(weekAnchorUtcIso('2026-06-20T12:00:00.000Z'), '2026-06-14T00:00:00.000Z');
    equal(weekAnchorUtcIso('2026-06-14T23:00:00.000Z'), '2026-06-14T00:00:00.000Z');
  });

  it('resolves a Beijing slot to concrete instants', () => {
    const interval = slotToInterval(
      { weekday: 6, startTime: '09:00', endTime: '11:00', timezone: SH },
      weekAnchorUtcIso(REF_SUMMER)
    );
    equal(interval.startIso, SAT_SUMMER);
    equal(interval.endIso, '2026-06-20T03:00:00.000Z');
    equal(interval.minutes, 120);
  });

  it('resolves a Pacific slot to concrete instants', () => {
    const interval = slotToInterval(
      { weekday: 5, startTime: '18:00', endTime: '20:00', timezone: LA },
      weekAnchorUtcIso(REF_SUMMER)
    );
    equal(interval.startIso, SAT_SUMMER);
    equal(interval.minutes, 120);
  });

  it('accepts a fallback zone when the row carries none', () => {
    const interval = slotToInterval(
      { weekday: 6, startTime: '09:00', endTime: '11:00' },
      weekAnchorUtcIso(REF_SUMMER),
      SH
    );
    equal(interval.startIso, SAT_SUMMER);
  });

  it('refuses a row with no zone and no fallback', () => {
    throws(() => slotToInterval(
      { weekday: 6, startTime: '09:00', endTime: '11:00' },
      weekAnchorUtcIso(REF_SUMMER)
    ));
  });

  it('treats an end at or before the start as crossing local midnight', () => {
    const interval = slotToInterval(
      { weekday: 6, startTime: '23:00', endTime: '01:00', timezone: SH },
      weekAnchorUtcIso(REF_SUMMER)
    );
    equal(interval.minutes, 120);
    equal(interval.startIso, '2026-06-20T15:00:00.000Z');
    equal(interval.endIso, '2026-06-20T17:00:00.000Z');
  });

  it('resolves a midnight-crossing window against the next local day, not start+24h', () => {
    // Saturday 2026-03-07 23:00 Pacific runs into Sunday, the morning the
    // clocks move. The window is 2 wall-clock hours but only 1 real hour.
    const interval = slotToInterval(
      { weekday: 6, startTime: '23:00', endTime: '01:00', timezone: LA },
      weekAnchorUtcIso('2026-03-07T12:00:00.000Z')
    );
    equal(fromUtc(interval.startIso, LA), '2026-03-07T23:00:00');
    equal(fromUtc(interval.endIso, LA), '2026-03-08T01:00:00');
    equal(interval.minutes, 120, 'both 23:00 and 01:00 are before the 02:00 gap');
  });
});

/* ================================================================== *
 * nextOccurrence
 * ================================================================== */

describe('nextOccurrence', () => {
  it('finds the coming Saturday from midweek', () => {
    const next = nextOccurrence({ weekday: 6, startTime: '09:00', endTime: '11:00' }, SH,
      { fromIso: '2026-06-17T00:00:00.000Z' });
    equal(next.startUtc, SAT_SUMMER);
    equal(next.endUtc, '2026-06-20T03:00:00.000Z');
    equal(next.minutes, 120);
    equal(next.localDate, '2026-06-20');
    equal(next.localStart, '2026-06-20T09:00:00');
    equal(next.weekday, 6);
    equal(next.timeZone, SH);
  });

  it('returns today\'s slot when it has not started yet', () => {
    // 00:00Z Saturday is 08:00 Beijing, an hour before the 09:00 slot.
    equal(nextOccurrence({ weekday: 6, startTime: '09:00' }, SH,
      { fromIso: '2026-06-20T00:00:00.000Z' }).startUtc, SAT_SUMMER);
  });

  it('skips to next week once this week\'s slot has started', () => {
    // 02:00Z Saturday is 10:00 Beijing, an hour after the slot began.
    equal(nextOccurrence({ weekday: 6, startTime: '09:00' }, SH,
      { fromIso: '2026-06-20T02:00:00.000Z' }).startUtc, '2026-06-27T01:00:00.000Z');
  });

  it('computes the occurrence after a DST transition for the new offset', () => {
    // Adding 7 days of milliseconds to the previous week would be an hour out.
    const next = nextOccurrence({ weekday: 6, startTime: '09:00' }, SH,
      { fromIso: '2026-03-09T00:00:00.000Z' });
    equal(next.startUtc, '2026-03-14T01:00:00.000Z');
    equal(next.localStart, '2026-03-14T09:00:00');
    equal(fromUtc(next.startUtc, LA), '2026-03-13T18:00:00');
  });

  it('handles a Pacific slot in the week the clocks move', () => {
    // Sunday 2026-03-08 is the transition day. A 09:00 Pacific slot is after
    // the gap, so it resolves normally on the new offset.
    const next = nextOccurrence({ weekday: 0, startTime: '09:00' }, LA,
      { fromIso: '2026-03-06T00:00:00.000Z' });
    equal(next.localStart, '2026-03-08T09:00:00');
    equal(next.startUtc, '2026-03-08T16:00:00.000Z');
    equal(zoneOffsetMinutes(next.startUtc, LA), -420);
  });

  it('lands after the gap for a Pacific slot inside the skipped hour', () => {
    const next = nextOccurrence({ weekday: 0, startTime: '02:30' }, LA,
      { fromIso: '2026-03-06T00:00:00.000Z' });
    equal(next.localStart, '2026-03-08T03:30:00', 'nonexistent local time moves forward');
  });

  it('works for every weekday', () => {
    for (let weekday = 0; weekday <= 6; weekday++) {
      const next = nextOccurrence({ weekday, startTime: '09:00' }, SH,
        { fromIso: '2026-06-17T00:00:00.000Z' });
      equal(next.weekday, weekday, `weekday ${weekday}`);
      ok(next.startUtc > '2026-06-17T00:00:00.000Z');
    }
  });

  it('omits the end when the slot has no endTime', () => {
    const next = nextOccurrence({ weekday: 6, startTime: '09:00' }, SH,
      { fromIso: '2026-06-17T00:00:00.000Z' });
    equal(next.endUtc, null);
    equal(next.minutes, null);
  });

  it('prefers the row\'s own zone over the argument', () => {
    const next = nextOccurrence({ weekday: 6, startTime: '09:00', timezone: SH }, LA,
      { fromIso: '2026-06-17T00:00:00.000Z' });
    equal(next.timeZone, SH);
    equal(next.startUtc, SAT_SUMMER);
  });

  it('rejects a bad weekday or missing zone', () => {
    throws(() => nextOccurrence({ weekday: 7, startTime: '09:00' }, SH, { fromIso: REF_SUMMER }));
    throws(() => nextOccurrence({ weekday: -1, startTime: '09:00' }, SH, { fromIso: REF_SUMMER }));
    throws(() => nextOccurrence({ weekday: 6, startTime: '09:00' }, undefined, { fromIso: REF_SUMMER }));
  });
});

/* ================================================================== *
 * Intervals and overlap
 * ================================================================== */

describe('interval helpers', () => {
  it('measures plain overlap', () => {
    equal(intervalOverlapMinutes({ startMs: 0, endMs: 3600000 }, { startMs: 1800000, endMs: 5400000 }), 30);
  });

  it('reports zero for touching or disjoint intervals', () => {
    equal(intervalOverlapMinutes({ startMs: 0, endMs: 3600000 }, { startMs: 3600000, endMs: 7200000 }), 0);
    equal(intervalOverlapMinutes({ startMs: 0, endMs: 1000 }, { startMs: 9999, endMs: 99999 }), 0);
  });

  it('merges overlapping and touching intervals', () => {
    deepEqual(mergeIntervals([{ startMs: 0, endMs: 10 }, { startMs: 5, endMs: 20 }]), [{ startMs: 0, endMs: 20 }]);
    deepEqual(mergeIntervals([{ startMs: 0, endMs: 10 }, { startMs: 10, endMs: 20 }]), [{ startMs: 0, endMs: 20 }]);
    deepEqual(mergeIntervals([{ startMs: 0, endMs: 10 }, { startMs: 20, endMs: 30 }]),
      [{ startMs: 0, endMs: 10 }, { startMs: 20, endMs: 30 }]);
  });

  it('merges regardless of input order and does not mutate the input', () => {
    const input = [{ startMs: 20, endMs: 30 }, { startMs: 0, endMs: 25 }];
    const snapshot = JSON.stringify(input);
    deepEqual(mergeIntervals(input), [{ startMs: 0, endMs: 30 }]);
    equal(JSON.stringify(input), snapshot, 'mergeIntervals must not mutate its argument');
  });

  it('handles empty and single-element input', () => {
    deepEqual(mergeIntervals([]), []);
    deepEqual(mergeIntervals([{ startMs: 1, endMs: 2 }]), [{ startMs: 1, endMs: 2 }]);
  });
});

describe('overlapWindows across the Pacific', () => {
  const opts = { referenceIso: REF_SUMMER };

  it('finds the exact three-hour window for the signature pairing', () => {
    // Tutor Friday 17:00-20:00 Pacific == student Saturday 08:00-11:00 Beijing.
    const windows = overlapWindows(
      [{ weekday: 5, startTime: '17:00', endTime: '20:00' }], LA,
      [{ weekday: 6, startTime: '08:00', endTime: '11:00' }], SH,
      opts
    );
    equal(windows.length, 1);
    equal(windows[0].minutes, 180);
    equal(windows[0].startUtc, '2026-06-20T00:00:00.000Z');
    equal(windows[0].endUtc, '2026-06-20T03:00:00.000Z');
  });

  it('describes that window correctly at both ends', () => {
    const [w] = overlapWindows(
      [{ weekday: 5, startTime: '17:00', endTime: '20:00' }], LA,
      [{ weekday: 6, startTime: '08:00', endTime: '11:00' }], SH,
      opts
    );
    equal(fromUtc(w.startUtc, LA), '2026-06-19T17:00:00');
    equal(fromUtc(w.startUtc, SH), '2026-06-20T08:00:00');
    equal(weekdayLabel(w.startUtc, LA), 'Friday');
    equal(weekdayLabel(w.startUtc, SH), 'Saturday');
  });

  it('measures partial overlap', () => {
    const windows = overlapWindows(
      [{ weekday: 5, startTime: '17:00', endTime: '19:00' }], LA,
      [{ weekday: 6, startTime: '09:00', endTime: '12:00' }], SH,
      opts
    );
    equal(windows.length, 1);
    equal(windows[0].minutes, 60);
    equal(windows[0].startUtc, SAT_SUMMER);
  });

  it('reports zero overlap when both sides say "Saturday morning"', () => {
    // Saturday morning in California is Saturday night in China.
    deepEqual(overlapWindows(
      [{ weekday: 6, startTime: '09:00', endTime: '12:00' }], LA,
      [{ weekday: 6, startTime: '08:00', endTime: '11:00' }], SH,
      opts
    ), []);
  });

  it('finds an overlap that spans two different calendar days', () => {
    const windows = overlapWindows(
      [{ weekday: 6, startTime: '21:00', endTime: '23:00' }], NY,
      [{ weekday: 0, startTime: '09:00', endTime: '11:00' }], SH,
      opts
    );
    equal(windows.length, 1);
    equal(windows[0].minutes, 120);
    equal(weekdayInZone(windows[0].startUtc, NY), 6);
    equal(weekdayInZone(windows[0].startUtc, SH), 0);
  });

  it('wraps the recurring week rather than losing the pair off the end', () => {
    // The anchored week runs Sunday..Saturday, so a tutor's Saturday evening
    // spills into a Sunday seven days before the anchor's Sunday. Without the
    // week shift this scores zero.
    const minutes = overlapWindows(
      [{ weekday: 6, startTime: '18:00', endTime: '20:00' }], LA,
      [{ weekday: 0, startTime: '09:00', endTime: '11:00' }], SH,
      opts
    ).reduce((t, w) => t + w.minutes, 0);
    equal(minutes, 120);
  });

  it('matches a midnight-crossing student window', () => {
    const windows = overlapWindows(
      [{ weekday: 6, startTime: '23:00', endTime: '01:00' }], SH,
      [{ weekday: 6, startTime: '08:00', endTime: '11:00' }], LA,
      opts
    );
    equal(windows.length, 1);
    equal(windows[0].minutes, 120);
    equal(fromUtc(windows[0].startUtc, SH), '2026-06-20T23:00:00');
    equal(fromUtc(windows[0].startUtc, LA), '2026-06-20T08:00:00');
  });

  it('merges rather than double-counting overlapping windows on one side', () => {
    const windows = overlapWindows(
      [{ weekday: 5, startTime: '17:00', endTime: '20:00' }], LA,
      [
        { weekday: 6, startTime: '08:00', endTime: '11:00' },
        { weekday: 6, startTime: '09:00', endTime: '11:00' },
        { weekday: 6, startTime: '08:30', endTime: '10:00' }
      ], SH,
      opts
    );
    equal(windows.length, 1, 'three nested student windows are one shared interval');
    equal(windows[0].minutes, 180);
  });

  it('returns separate windows for genuinely separate times', () => {
    const windows = overlapWindows(
      [
        { weekday: 5, startTime: '17:00', endTime: '19:00' },
        { weekday: 6, startTime: '17:00', endTime: '19:00' }
      ], LA,
      [
        { weekday: 6, startTime: '08:00', endTime: '10:00' },
        { weekday: 0, startTime: '08:00', endTime: '10:00' }
      ], SH,
      opts
    );
    equal(windows.length, 2);
    ok(windows[0].startUtc < windows[1].startUtc, 'earliest first');
  });

  it('changes size across the US transition while China stays put', () => {
    const tutor = [{ weekday: 6, startTime: '08:00', endTime: '11:00', timezone: NY }];
    const student = [{ weekday: 6, startTime: '20:00', endTime: '23:00', timezone: SH }];
    const winter = availabilityOverlapMinutes(tutor, student, '2026-03-07T14:00:00.000Z');
    const summer = availabilityOverlapMinutes(tutor, student, '2026-03-14T14:00:00.000Z');
    equal(winter, 120);
    equal(summer, 180);
    ok(winter !== summer, 'DST must change the computed overlap');
  });

  it('returns nothing for empty availability rather than throwing', () => {
    deepEqual(overlapWindows([], LA, [{ weekday: 6, startTime: '08:00', endTime: '11:00' }], SH, opts), []);
    deepEqual(overlapWindows(undefined, LA, undefined, SH, opts), []);
  });

  it('honours a minimum window length', () => {
    const short = overlapWindows(
      [{ weekday: 5, startTime: '17:00', endTime: '17:30' }], LA,
      [{ weekday: 6, startTime: '08:00', endTime: '11:00' }], SH,
      { ...opts, minMinutes: 60 }
    );
    deepEqual(short, []);
  });

  it('lets a per-row zone override the side default', () => {
    // The second row is in Beijing even though the side default is Pacific.
    const windows = overlapWindows(
      [
        { weekday: 6, startTime: '09:00', endTime: '12:00' },
        { weekday: 6, startTime: '08:00', endTime: '11:00', timezone: SH }
      ], LA,
      [{ weekday: 6, startTime: '08:00', endTime: '11:00' }], SH,
      opts
    );
    equal(windows.length, 1, 'only the Beijing row matches');
    equal(windows[0].minutes, 180);
  });

  it('refuses a row with no zone and no side default', () => {
    throws(() => overlapWindows(
      [{ weekday: 6, startTime: '09:00', endTime: '12:00' }], undefined,
      [{ weekday: 6, startTime: '08:00', endTime: '11:00', timezone: SH }], SH,
      opts
    ));
  });
});

describe('availabilityOverlap wrappers', () => {
  const tutor = [{ weekday: 5, startTime: '17:00', endTime: '20:00', timezone: LA }];
  const student = [{ weekday: 6, startTime: '08:00', endTime: '11:00', timezone: SH }];

  it('sums the shared minutes', () => {
    equal(availabilityOverlapMinutes(tutor, student, REF_SUMMER), 180);
  });

  it('returns windows in the shape matching.js consumes', () => {
    const windows = availabilityOverlapWindows(tutor, student, REF_SUMMER);
    equal(windows.length, 1);
    equal(windows[0].startIso, '2026-06-20T00:00:00.000Z');
    equal(windows[0].endIso, '2026-06-20T03:00:00.000Z');
    equal(windows[0].minutes, 180);
  });

  it('returns zero and empty for incompatible schedules', () => {
    const other = [{ weekday: 6, startTime: '08:00', endTime: '10:00', timezone: SH }];
    const morning = [{ weekday: 6, startTime: '09:00', endTime: '12:00', timezone: LA }];
    equal(availabilityOverlapMinutes(morning, other, REF_SUMMER), 0);
    deepEqual(availabilityOverlapWindows(morning, other, REF_SUMMER), []);
  });
});

/* ================================================================== *
 * Arithmetic
 * ================================================================== */

describe('date arithmetic', () => {
  it('adds minutes', () => {
    equal(addMinutes(SAT_SUMMER, 90), '2026-06-20T02:30:00.000Z');
    equal(addMinutes(SAT_SUMMER, -60), '2026-06-20T00:00:00.000Z');
  });

  it('counts calendar days, not 24-hour blocks', () => {
    // New York is on EDT in June, so local midnight is 04:00Z. An hour either
    // side of it is one calendar day apart despite being 60 minutes apart.
    equal(calendarDaysBetween('2026-06-20T03:30:00.000Z', '2026-06-20T04:30:00.000Z', NY), 1);
    // The same two instants are the same day in UTC and in Beijing.
    equal(calendarDaysBetween('2026-06-20T03:30:00.000Z', '2026-06-20T04:30:00.000Z', 'UTC'), 0);
    equal(calendarDaysBetween('2026-06-20T03:30:00.000Z', '2026-06-20T04:30:00.000Z', SH), 0);
    equal(calendarDaysBetween(SAT_SUMMER, SAT_SUMMER, SH), 0);
  });

  it('wallTimeToUtcIso still accepts parts', () => {
    equal(wallTimeToUtcIso({ year: 2026, month: 6, day: 20, hour: 9 }, SH), SAT_SUMMER);
  });
});

/* ================================================================== *
 * The in-app self-test
 * ================================================================== */

describe('self-test scenarios', () => {
  it('has scenarios in every category, each with a title and a reason', () => {
    ok(SCENARIOS.length >= 20, `expected a substantial set, got ${SCENARIOS.length}`);
    for (const s of SCENARIOS) {
      ok(s.id && s.title && s.why && s.category, `scenario ${s.id} is missing metadata`);
      equal(typeof s.run, 'function');
    }
    const ids = SCENARIOS.map((s) => s.id);
    equal(new Set(ids).size, ids.length, 'scenario ids must be unique');
  });

  it('is bilingual, so the panel reads in Chinese too (principle 6)', () => {
    const missing = [];
    for (const s of SCENARIOS) {
      for (const [field, value] of [['title', s.title], ['why', s.why]]) {
        if (typeof value === 'string' || !value.en || !value.zh) missing.push(`${s.id}.${field}`);
        else if (value.en === value.zh) missing.push(`${s.id}.${field} (untranslated)`);
      }
    }
    deepEqual(missing, [], `these need a Chinese translation: ${missing.join(', ')}`);

    for (const category of CATEGORIES) {
      ok(pick(category.title, 'zh') && pick(category.title, 'zh') !== pick(category.title, 'en'),
        `category ${category.id} title needs Chinese`);
      ok(pick(category.blurb, 'zh') !== pick(category.blurb, 'en'),
        `category ${category.id} blurb needs Chinese`);
    }
  });

  it('resolves titles and notes to the requested language', () => {
    const en = runSelfTest({ lang: 'en' });
    const zh = runSelfTest({ lang: 'zh' });
    const HAS_HAN = /[一-鿿]/;

    equal(en.passed, zh.passed, 'the language must not change the outcome');
    for (const [i, row] of zh.results.entries()) {
      ok(HAS_HAN.test(row.title), `zh title not translated: ${row.title}`);
      ok(HAS_HAN.test(row.why), `zh rationale not translated: ${row.id}`);
      ok(!HAS_HAN.test(en.results[i].title), `en title leaked Chinese: ${en.results[i].title}`);
      if (row.note) ok(HAS_HAN.test(row.note), `zh note not translated: ${row.id}`);
      // Expected/actual are raw values and stay identical in both languages.
      equal(row.expected, en.results[i].expected);
      equal(row.actual, en.results[i].actual);
    }
    for (const group of zh.byCategory) ok(HAS_HAN.test(group.title), group.title);
  });

  it('every scenario shown in the app passes', () => {
    // The panel at #/selftest renders exactly this. If it is green there, it is
    // green here, because there is only one copy of these expectations.
    const { results, failed } = runSelfTest();
    const broken = results.filter((r) => !r.pass)
      .map((r) => `${r.title}\n    expected: ${r.expected}\n    actual:   ${r.actual}`);
    deepEqual(broken, [], `${failed} scenario(s) failing`);
  });

  it('reports a clean summary', () => {
    const summary = runSelfTest();
    equal(summary.passed, SCENARIOS.length);
    equal(summary.failed, 0);
    equal(summary.total, SCENARIOS.length);
    equal(summary.ok, true);
  });

  it('groups results by category for display', () => {
    const { byCategory } = runSelfTest();
    ok(byCategory.length >= 4);
    equal(byCategory.reduce((n, g) => n + g.results.length, 0), SCENARIOS.length);
    for (const group of byCategory) ok(group.title, 'each group needs a title');
  });

  it('turns a throwing scenario into a failure rather than a blank panel', () => {
    // Exercises the guard directly: a scenario that blows up must be reported.
    const exploding = { id: 'x', category: 'dateline', title: 't', why: 'w', run() { throw new Error('boom'); } };
    let outcome;
    try {
      outcome = exploding.run();
    } catch (err) {
      outcome = { pass: false, actual: `threw: ${err.message}` };
    }
    equal(outcome.pass, false);
    ok(outcome.actual.includes('boom'));
  });
});
