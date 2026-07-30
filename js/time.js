/**
 * time.js — timezone math.
 *
 * Pure functions only. No DOM, no store, no imports. Every timezone
 * conversion in the app goes through here so that when this moves to a
 * backend it moves as one file with its tests.
 *
 * Two kinds of time exist in this app, and they are not the same thing:
 *
 *   1. Instants — a specific moment. Always an ISO 8601 UTC string
 *      ("2026-03-14T13:30:00.000Z"). Sessions happen at instants.
 *
 *   2. Recurring wall times — "Saturdays, 9:00am, in Shanghai". These are
 *      NOT instants and must not be stored as UTC: 9am Shanghai is a
 *      different UTC time depending on whether the *other* side is in DST.
 *      Stored as { day, start, end, tz } and resolved to instants against a
 *      reference week.
 *
 * Weekday numbering is 0 = Sunday .. 6 = Saturday, matching Date#getUTCDay.
 */

export const MINUTES_PER_DAY = 1440;
export const MINUTES_PER_WEEK = 10080;

/** Fixed reference: China has one timezone and no DST. */
export const CHINA_TZ = 'Asia/Shanghai';

const _formatters = new Map();

function partsFormatter(tz) {
  let f = _formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short'
    });
    _formatters.set(tz, f);
  }
  return f;
}

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** True if `tz` is an IANA zone this runtime understands. */
export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || tz === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function toDate(instant) {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) throw new TypeError(`Not a valid instant: ${instant}`);
  return d;
}

/** Normalise anything date-like to an ISO 8601 UTC string. */
export function toUtcIso(instant) {
  return toDate(instant).toISOString();
}

/**
 * Break an instant into the calendar/clock fields an observer in `tz` sees.
 * @returns {{year:number, month:number, day:number, hour:number,
 *            minute:number, second:number, weekday:number}}
 */
export function wallPartsInZone(instant, tz) {
  const parts = partsFormatter(tz).formatToParts(toDate(instant));
  const out = {};
  for (const { type, value } of parts) {
    if (type === 'weekday') out.weekday = WEEKDAY_INDEX[value];
    else if (type !== 'literal') out[type] = Number(value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour % 24,
    minute: out.minute,
    second: out.second,
    weekday: out.weekday
  };
}

/**
 * Offset of `tz` from UTC at `instant`, in minutes east of UTC.
 * New York in winter is -300; Shanghai is always +480.
 */
export function zoneOffsetMinutes(instant, tz) {
  const p = wallPartsInZone(instant, tz);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asIfUtc - toDate(instant).getTime()) / 60000);
}

/** Weekday (0=Sun) that `instant` falls on for an observer in `tz`. */
export function weekdayInZone(instant, tz) {
  return wallPartsInZone(instant, tz).weekday;
}

/** Minutes since local midnight that `instant` falls on for an observer in `tz`. */
export function minutesOfDayInZone(instant, tz) {
  const p = wallPartsInZone(instant, tz);
  return p.hour * 60 + p.minute;
}

/**
 * Inverse of wallPartsInZone: the instant at which the clock in `tz` reads
 * the given wall time.
 *
 * The offset depends on the instant we are solving for, so this tries the
 * two candidate offsets and checks which one actually reads back. That makes
 * the DST edges deterministic instead of dependent on an iteration count:
 *
 *   - Normal times: exactly one candidate reads back. Returned.
 *   - Ambiguous (the hour repeated when DST ends): both read back. Returns
 *     the FIRST occurrence.
 *   - Nonexistent (the hour skipped when DST starts): neither reads back.
 *     Returns the instant just past the gap, so the time moves forward
 *     rather than backward. Matches Temporal's "compatible" disambiguation.
 *
 * @param {{year:number, month:number, day:number, hour?:number,
 *          minute?:number, second?:number}} wall
 * @param {string} tz
 * @returns {string} ISO 8601 UTC
 */
export function wallTimeToUtcIso(wall, tz) {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = wall;
  const target = Date.UTC(year, month - 1, day, hour, minute, second);

  const readsBack = (ts) => {
    const p = wallPartsInZone(new Date(ts), tz);
    return p.year === year && p.month === month && p.day === day &&
           p.hour === hour && p.minute === minute && p.second === second;
  };

  const offsetA = zoneOffsetMinutes(new Date(target), tz);
  const candidateA = target - offsetA * 60000;

  const offsetB = zoneOffsetMinutes(new Date(candidateA), tz);
  if (offsetB === offsetA) return new Date(candidateA).toISOString();

  const candidateB = target - offsetB * 60000;
  const okA = readsBack(candidateA);
  const okB = readsBack(candidateB);

  let resolved;
  if (okA && okB) resolved = Math.min(candidateA, candidateB); // ambiguous
  else if (okA) resolved = candidateA;
  else if (okB) resolved = candidateB;
  else resolved = Math.max(candidateA, candidateB);            // nonexistent

  return new Date(resolved).toISOString();
}

/** Parse "HH:MM" into minutes since midnight. Throws on anything else. */
export function parseHhMm(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim());
  if (!m) throw new TypeError(`Expected "HH:MM", got: ${value}`);
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 24 || minutes > 59) throw new RangeError(`Out of range time: ${value}`);
  return hours * 60 + minutes;
}

/** Inverse of parseHhMm. 570 -> "09:30". */
export function formatHhMm(totalMinutes) {
  const wrapped = ((Math.round(totalMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * The instant of UTC midnight on the Sunday that starts the week containing
 * `instant`. Used as the anchor when resolving recurring availability.
 */
export function weekAnchorUtcIso(instant) {
  const d = toDate(instant);
  const sunday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
    d.getUTCDay() * MINUTES_PER_DAY * 60000;
  return new Date(sunday).toISOString();
}

/**
 * Resolve a recurring availability slot to a concrete instant interval in the
 * week anchored at `weekAnchorIso`.
 *
 * @param {{day:number, start:string, end:string, tz:string}} slot
 * @param {string} weekAnchorIso from weekAnchorUtcIso()
 * @returns {{startMs:number, endMs:number, startIso:string, endIso:string}}
 */
export function slotToInterval(slot, weekAnchorIso) {
  const anchor = new Date(weekAnchorIso);
  const dateMs = anchor.getTime() + slot.day * MINUTES_PER_DAY * 60000;
  const date = new Date(dateMs);

  const wall = {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };

  const startMin = parseHhMm(slot.start);
  const endMin = parseHhMm(slot.end);

  const startIso = wallTimeToUtcIso(
    { ...wall, hour: Math.floor(startMin / 60), minute: startMin % 60 },
    slot.tz
  );
  // An end before the start means the slot runs past local midnight.
  const spansMidnight = endMin <= startMin;
  const endIso = wallTimeToUtcIso(
    { ...wall, hour: Math.floor(endMin / 60), minute: endMin % 60 },
    slot.tz
  );

  const startMs = new Date(startIso).getTime();
  let endMs = new Date(endIso).getTime();
  if (spansMidnight) endMs += MINUTES_PER_DAY * 60000;

  return { startMs, endMs, startIso, endIso: new Date(endMs).toISOString() };
}

/** Overlap of two half-open millisecond intervals, in minutes. */
export function intervalOverlapMinutes(a, b) {
  const start = Math.max(a.startMs, b.startMs);
  const end = Math.min(a.endMs, b.endMs);
  return end <= start ? 0 : Math.round((end - start) / 60000);
}

const WEEK_SHIFTS = [-MINUTES_PER_WEEK * 60000, 0, MINUTES_PER_WEEK * 60000];

/**
 * Total minutes two availability sets share, for the week containing
 * `referenceIso`.
 *
 * Slots are resolved to real instants first, so a tutor's "Saturday 21:00
 * New York" correctly meets a student's "Sunday 09:00 Shanghai" — the same
 * moment on two different calendar days. Each pair is also tested against
 * the adjacent weeks so matches across the week boundary are not lost.
 *
 * @param {Array<{day:number,start:string,end:string,tz:string}>} slotsA
 * @param {Array<{day:number,start:string,end:string,tz:string}>} slotsB
 * @param {string} referenceIso any instant in the week to evaluate
 * @returns {number} minutes
 */
export function availabilityOverlapMinutes(slotsA, slotsB, referenceIso) {
  if (!slotsA?.length || !slotsB?.length) return 0;
  const anchor = weekAnchorUtcIso(referenceIso);

  const a = slotsA.map((s) => slotToInterval(s, anchor));
  const b = slotsB.map((s) => slotToInterval(s, anchor));

  let total = 0;
  for (const x of a) {
    let best = 0;
    for (const y of b) {
      for (const shift of WEEK_SHIFTS) {
        best = Math.max(
          best,
          intervalOverlapMinutes(x, { startMs: y.startMs + shift, endMs: y.endMs + shift })
        );
      }
    }
    total += best;
  }
  return total;
}

/**
 * The concrete windows two availability sets share, sorted earliest first.
 * Same math as availabilityOverlapMinutes, but returns the instants so a
 * screen can offer "Saturday 9:00pm your time / Sunday 9:00am theirs".
 *
 * @returns {Array<{startIso:string, endIso:string, minutes:number}>}
 */
export function availabilityOverlapWindows(slotsA, slotsB, referenceIso) {
  if (!slotsA?.length || !slotsB?.length) return [];
  const anchor = weekAnchorUtcIso(referenceIso);

  const a = slotsA.map((s) => slotToInterval(s, anchor));
  const b = slotsB.map((s) => slotToInterval(s, anchor));

  const windows = [];
  for (const x of a) {
    for (const y of b) {
      for (const shift of WEEK_SHIFTS) {
        const shifted = { startMs: y.startMs + shift, endMs: y.endMs + shift };
        const minutes = intervalOverlapMinutes(x, shifted);
        if (minutes === 0) continue;
        windows.push({
          startIso: new Date(Math.max(x.startMs, shifted.startMs)).toISOString(),
          endIso: new Date(Math.min(x.endMs, shifted.endMs)).toISOString(),
          minutes
        });
      }
    }
  }
  windows.sort((p, q) => p.startIso.localeCompare(q.startIso));
  return windows;
}

/** Add minutes to an instant. */
export function addMinutes(instant, minutes) {
  return new Date(toDate(instant).getTime() + minutes * 60000).toISOString();
}

/**
 * Whole days between two instants as seen in `tz`. Calendar days, not
 * 24-hour blocks, so "yesterday at 11pm" is 1 and not 0.
 */
export function calendarDaysBetween(fromInstant, toInstant, tz) {
  const a = wallPartsInZone(fromInstant, tz);
  const b = wallPartsInZone(toInstant, tz);
  const da = Date.UTC(a.year, a.month - 1, a.day);
  const db = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((db - da) / (MINUTES_PER_DAY * 60000));
}

/** "YYYY-MM-DD" for the calendar date `instant` falls on in `tz`. */
export function dateKeyInZone(instant, tz) {
  const p = wallPartsInZone(instant, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** "YYYY-MM" for the calendar month `instant` falls in, in `tz`. */
export function monthKeyInZone(instant, tz) {
  const p = wallPartsInZone(instant, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}

/**
 * Human-readable time in a zone. Locale-aware, so the same instant reads
 * naturally in English or Chinese.
 *
 * @param {string} instant ISO UTC
 * @param {string} tz
 * @param {{locale?:string, weekday?:boolean, date?:boolean, zoneName?:boolean}} [opts]
 */
export function formatInZone(instant, tz, opts = {}) {
  const { locale = 'en-US', weekday = false, date = false, zoneName = false } = opts;
  const config = { timeZone: tz, hour: 'numeric', minute: '2-digit' };
  if (weekday) config.weekday = 'short';
  if (date) { config.month = 'short'; config.day = 'numeric'; }
  if (zoneName) config.timeZoneName = 'short';
  return new Intl.DateTimeFormat(locale, config).format(toDate(instant));
}

/** Just the zone's short name at that instant, e.g. "EDT", "GMT+8". */
export function zoneLabel(instant, tz, locale = 'en-US') {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    timeZoneName: 'short',
    hour: 'numeric'
  }).formatToParts(toDate(instant));
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
}

/**
 * One instant described from both ends of the pairing. This is the string
 * that stops a tutor in Ohio and a student in Chengdu from showing up an
 * hour apart.
 */
export function describeAcrossZones(instant, tzA, tzB, opts = {}) {
  const { locale = 'en-US' } = opts;
  const shared = { locale, weekday: true, date: true, zoneName: true };
  return {
    instant: toUtcIso(instant),
    a: formatInZone(instant, tzA, shared),
    b: formatInZone(instant, tzB, shared),
    dayDelta: calendarDaysBetween(instant, instant, tzA) === 0
      ? weekdayInZone(instant, tzB) - weekdayInZone(instant, tzA)
      : 0,
    offsetHours:
      (zoneOffsetMinutes(instant, tzB) - zoneOffsetMinutes(instant, tzA)) / 60
  };
}
