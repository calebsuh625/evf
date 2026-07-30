/**
 * time.js — timezone math.
 *
 * The highest-risk correctness area in the program, and the reason it is one
 * file of pure functions with no DOM, no store, and no imports: it moves to a
 * backend later as a unit, with its tests.
 *
 * ── The problem ──────────────────────────────────────────────────────
 *
 * Tutors are in the US (mostly Pacific). Students are in mainland China,
 * which is UTC+8 everywhere and observes no daylight saving at all. The US
 * does. So:
 *
 *   - Saturday 09:00 in Beijing is FRIDAY 18:00 in California. A tutor and a
 *     student describing the same hour will name different days of the week.
 *   - Twice a year the US side moves and the China side does not, so every
 *     recurring pairing silently shifts by an hour relative to the student.
 *   - Both US transitions fall on a Sunday, which is a tutoring day. One
 *     Sunday has a local 02:00–03:00 that does not exist; another has a
 *     01:00–02:00 that happens twice.
 *
 * ── Two kinds of time, never conflated ───────────────────────────────
 *
 *   1. Instants — a specific moment. Always an ISO 8601 UTC string
 *      ("2026-06-20T01:00:00.000Z"). Sessions happen at instants.
 *
 *   2. Recurring wall times — "Saturdays 09:00–11:00, Beijing". These are
 *      NOT instants and must never be stored as UTC, because the UTC time
 *      they correspond to changes when the *other* side enters DST. Stored as
 *      { weekday, startTime, endTime, timezone } and resolved to instants
 *      against a reference week.
 *
 * A "local ISO" string in this module means a naive wall clock with no zone
 * attached: "2026-06-20T09:00". Passing one of those without a timezone, or
 * passing a Z-suffixed instant where a local time is expected, is an error
 * rather than a guess — that confusion is the bug class this module exists
 * to eliminate.
 *
 * ── Conventions ──────────────────────────────────────────────────────
 *
 * Weekday numbering is 0 = Sunday .. 6 = Saturday, matching Date#getUTCDay.
 *
 * Every weekday and every wall-clock reading is computed by asking
 * Intl.DateTimeFormat about one specific timeZone. Offsets are never
 * hand-rolled, and a weekday computed for one zone is never reused for
 * another — see formatDual.
 */

export const MINUTES_PER_DAY = 1440;
export const MINUTES_PER_WEEK = 10080;
const MS_PER_MINUTE = 60000;
const MS_PER_DAY = MINUTES_PER_DAY * MS_PER_MINUTE;
const MS_PER_WEEK = MINUTES_PER_WEEK * MS_PER_MINUTE;

/** Mainland China: one zone for the whole country, and no DST, ever. */
export const CHINA_TZ = 'Asia/Shanghai';

/** Where most of the tutors are. */
export const PACIFIC_TZ = 'America/Los_Angeles';

export const WEEKDAY_NAMES_EN = Object.freeze([
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
]);

/* ------------------------------------------------------------------ *
 * Formatters
 * ------------------------------------------------------------------ */

const _partsFormatters = new Map();
const _labelFormatters = new Map();

/**
 * Parts formatter, always en-US so the weekday INDEX derivation below is
 * stable regardless of the user's locale. Display labels use a separate,
 * locale-aware formatter.
 */
function partsFormatter(timeZone) {
  let f = _partsFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short'
    });
    _partsFormatters.set(timeZone, f);
  }
  return f;
}

function labelFormatter(timeZone, locale, options) {
  const key = `${timeZone}|${locale}|${JSON.stringify(options)}`;
  let f = _labelFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { timeZone, ...options });
    _labelFormatters.set(key, f);
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

function requireZone(tz, where) {
  if (!isValidTimeZone(tz)) {
    throw new TypeError(`${where}: "${tz}" is not a time zone this browser knows.`);
  }
  return tz;
}

function toDate(instant) {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) throw new TypeError(`Not a valid instant: ${instant}`);
  return d;
}

function iso(ms) {
  return new Date(ms).toISOString();
}

/* ------------------------------------------------------------------ *
 * Reading an instant in a zone
 * ------------------------------------------------------------------ */

/** Normalise anything date-like to an ISO 8601 UTC string. */
export function toUtcIso(instant) {
  return toDate(instant).toISOString();
}

/**
 * Break an instant into the calendar/clock fields an observer in `tz` sees.
 *
 * @returns {{year:number, month:number, day:number, hour:number,
 *            minute:number, second:number, weekday:number}}
 */
export function wallPartsInZone(instant, tz) {
  const parts = partsFormatter(requireZone(tz, 'wallPartsInZone')).formatToParts(toDate(instant));
  const out = {};
  for (const { type, value } of parts) {
    if (type === 'weekday') out.weekday = WEEKDAY_INDEX[value];
    else if (type !== 'literal') out[type] = Number(value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    // Some engines render midnight as hour 24 under h23.
    hour: out.hour % 24,
    minute: out.minute,
    second: out.second,
    weekday: out.weekday
  };
}

/**
 * Offset of `tz` from UTC at `instant`, in minutes east of UTC.
 * Los Angeles is -480 in winter and -420 in summer; Shanghai is always +480.
 */
export function zoneOffsetMinutes(instant, tz) {
  const p = wallPartsInZone(instant, tz);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asIfUtc - toDate(instant).getTime()) / MS_PER_MINUTE);
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

/** True if `tz` uses more than one UTC offset during the year containing `instant`. */
export function observesDst(instant, tz) {
  const year = wallPartsInZone(instant, tz).year;
  const january = zoneOffsetMinutes(Date.UTC(year, 0, 15), tz);
  const july = zoneOffsetMinutes(Date.UTC(year, 6, 15), tz);
  return january !== july;
}

/* ------------------------------------------------------------------ *
 * Local wall time -> instant
 * ------------------------------------------------------------------ */

const LOCAL_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;

/**
 * Parse a naive local ISO string into calendar/clock fields.
 *
 * Rejects anything carrying a zone — "…Z" or "…+08:00" is an instant, not a
 * local wall time, and silently accepting one would reintroduce exactly the
 * bug this module prevents.
 *
 * @param {string} localIso e.g. "2026-06-20T09:00", "2026-06-20 09:00:00", "2026-06-20"
 */
export function parseLocalIso(localIso) {
  const raw = String(localIso ?? '').trim();

  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
    throw new TypeError(
      `parseLocalIso: "${raw}" carries a UTC offset, so it is an instant rather than a ` +
      'local wall time. Use fromUtc() to read an instant in a zone.'
    );
  }

  const m = LOCAL_ISO.exec(raw);
  if (!m) {
    throw new TypeError(`parseLocalIso: expected "YYYY-MM-DDTHH:MM", got "${raw}".`);
  }

  const [, y, mo, d, h = '0', mi = '0', s = '0', ms = '0'] = m;
  const parts = {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h),
    minute: Number(mi),
    second: Number(s),
    millisecond: Number(ms.padEnd(3, '0'))
  };

  if (parts.month < 1 || parts.month > 12) throw new RangeError(`Month out of range in "${raw}".`);
  if (parts.day < 1 || parts.day > 31) throw new RangeError(`Day out of range in "${raw}".`);
  if (parts.hour > 23 || parts.minute > 59 || parts.second > 59) {
    throw new RangeError(`Time out of range in "${raw}".`);
  }
  return parts;
}

/**
 * Resolve a local wall time in `tz` to the instant it names, reporting which
 * of the three cases applied.
 *
 * The offset depends on the very instant being solved for, so this tries both
 * candidate offsets and checks which actually reads back. That makes the DST
 * edges deterministic rather than dependent on an iteration count:
 *
 *   - `normal`       exactly one candidate reads back.
 *   - `ambiguous`    both do. The clock shows this time twice, on the Sunday
 *                    the US falls back. Resolves to the FIRST occurrence by
 *                    default (`opts.ambiguous: 'later'` for the second).
 *   - `nonexistent`  neither does. The clock skips this time on the Sunday the
 *                    US springs forward. Resolves FORWARD, past the gap, so a
 *                    session never silently moves an hour earlier
 *                    (`opts.nonexistent: 'reject'` to throw instead).
 *
 * Forward-shifting matches Temporal's "compatible" disambiguation.
 *
 * @param {{year:number, month:number, day:number, hour?:number, minute?:number,
 *          second?:number, millisecond?:number}} wall
 * @param {string} tz
 * @param {{ambiguous?:'earlier'|'later', nonexistent?:'forward'|'reject'}} [opts]
 * @returns {{utc:string, kind:'normal'|'ambiguous'|'nonexistent',
 *            offsetMinutes:number, alternativeUtc:string|null}}
 */
export function resolveLocal(wall, tz, opts = {}) {
  const { ambiguous = 'earlier', nonexistent = 'forward' } = opts;
  requireZone(tz, 'resolveLocal');

  const { year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0 } = wall;
  const target = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);

  const readsBack = (ms) => {
    const p = wallPartsInZone(ms, tz);
    return p.year === year && p.month === month && p.day === day &&
           p.hour === hour && p.minute === minute && p.second === second;
  };

  // Bracket the naive target with the offsets in force a day either side. Any
  // single transition falls inside that bracket, and real zones never have two
  // within a day, so these are the only two offsets that can apply. Deriving
  // both candidates up front is what lets the ambiguous case be *detected*
  // rather than merely landing on the right instant by luck.
  const offsetBefore = zoneOffsetMinutes(target - MS_PER_DAY, tz);
  const offsetAfter = zoneOffsetMinutes(target + MS_PER_DAY, tz);

  const candidateEarly = target - offsetBefore * MS_PER_MINUTE;
  const candidateLate = target - offsetAfter * MS_PER_MINUTE;

  const okEarly = readsBack(candidateEarly);
  const okLate = readsBack(candidateLate);

  if (okEarly && okLate && candidateEarly !== candidateLate) {
    // The clock shows this wall time twice — the Sunday the US falls back.
    const earlier = Math.min(candidateEarly, candidateLate);
    const later = Math.max(candidateEarly, candidateLate);
    const chosen = ambiguous === 'later' ? later : earlier;
    return {
      utc: iso(chosen),
      kind: 'ambiguous',
      offsetMinutes: zoneOffsetMinutes(chosen, tz),
      alternativeUtc: iso(chosen === earlier ? later : earlier)
    };
  }

  if (okEarly || okLate) {
    const chosen = okEarly ? candidateEarly : candidateLate;
    return {
      utc: iso(chosen),
      kind: 'normal',
      offsetMinutes: zoneOffsetMinutes(chosen, tz),
      alternativeUtc: null
    };
  }

  // Neither reads back: the local clock skipped this time entirely.
  if (nonexistent === 'reject') {
    throw new RangeError(
      `resolveLocal: ${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)} ` +
      `does not exist in ${tz} — the clock skips it when daylight saving starts.`
    );
  }
  const forward = Math.max(candidateEarly, candidateLate);
  return {
    utc: iso(forward),
    kind: 'nonexistent',
    offsetMinutes: zoneOffsetMinutes(forward, tz),
    alternativeUtc: iso(Math.min(candidateEarly, candidateLate))
  };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * A local wall-clock string in `timeZone` -> the ISO 8601 UTC instant it names.
 *
 *   toUtc('2026-06-20T09:00', 'Asia/Shanghai')      -> '2026-06-20T01:00:00.000Z'
 *   toUtc('2026-06-19T18:00', 'America/Los_Angeles') -> '2026-06-20T01:00:00.000Z'
 *
 * Those are the same instant: Saturday morning in Beijing is Friday evening
 * in California.
 *
 * @param {string} localIso naive wall clock, no zone suffix
 * @param {string} timeZone IANA zone name
 * @param {{ambiguous?:'earlier'|'later', nonexistent?:'forward'|'reject'}} [opts]
 * @returns {string} ISO 8601 UTC
 */
export function toUtc(localIso, timeZone, opts) {
  return resolveLocal(parseLocalIso(localIso), timeZone, opts).utc;
}

/**
 * The inverse: an instant -> the naive local wall-clock string an observer in
 * `timeZone` reads off their clock.
 *
 *   fromUtc('2026-06-20T01:00:00.000Z', 'Asia/Shanghai')       -> '2026-06-20T09:00:00'
 *   fromUtc('2026-06-20T01:00:00.000Z', 'America/Los_Angeles') -> '2026-06-19T18:00:00'
 *
 * Deliberately returns no zone suffix: the result is a wall clock, not an
 * instant, and re-parsing it as an instant would be wrong. Pair it with the
 * same `timeZone` to get back where you started. Round-tripping a wall time
 * inside a DST fall-back hour cannot be exact, because that hour names two
 * instants — see resolveLocal.
 *
 * @returns {string} "YYYY-MM-DDTHH:MM:SS"
 */
export function fromUtc(utcIso, timeZone) {
  const p = wallPartsInZone(utcIso, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/**
 * Kept for callers that already hold parts rather than a string.
 * @deprecated within this codebase — prefer toUtc(localIso, tz).
 */
export function wallTimeToUtcIso(wall, tz, opts) {
  return resolveLocal(wall, tz, opts).utc;
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

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
  const config = { hour: 'numeric', minute: '2-digit' };
  if (weekday) config.weekday = 'short';
  if (date) { config.month = 'short'; config.day = 'numeric'; }
  if (zoneName) config.timeZoneName = 'short';
  return labelFormatter(requireZone(tz, 'formatInZone'), locale, config).format(toDate(instant));
}

/** The zone's short name at that instant, e.g. "PDT", "GMT+8". */
export function zoneLabel(instant, tz, locale = 'en-US') {
  const parts = labelFormatter(requireZone(tz, 'zoneLabel'), locale, {
    timeZoneName: 'short',
    hour: 'numeric'
  }).formatToParts(toDate(instant));
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
}

/**
 * The localised weekday name for `instant` **as seen in `tz`**.
 *
 * Always derived from a formatter bound to that one zone. Never pass a
 * weekday from one zone into a label for another: the whole point is that
 * these disagree.
 */
export function weekdayLabel(instant, tz, { locale = 'en-US', width = 'long' } = {}) {
  return labelFormatter(requireZone(tz, 'weekdayLabel'), locale, { weekday: width })
    .format(toDate(instant));
}

/** "YYYY-MM-DD" for the calendar date `instant` falls on in `tz`. */
export function dateKeyInZone(instant, tz) {
  const p = wallPartsInZone(instant, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "YYYY-MM" for the calendar month `instant` falls in, in `tz`. */
export function monthKeyInZone(instant, tz) {
  const p = wallPartsInZone(instant, tz);
  return `${p.year}-${pad(p.month)}`;
}

/**
 * One instant, described from both ends of a pairing.
 *
 * This is the function that stops a tutor in California and a student in
 * Chengdu from showing up a day apart. Each side's weekday index AND weekday
 * label are computed from a formatter bound to that side's own timeZone —
 * nothing is shared, derived, or offset-adjusted between them, because for
 * this program they routinely differ:
 *
 *   formatDual('2026-06-20T01:00:00.000Z', 'America/Los_Angeles', 'Asia/Shanghai')
 *     a: Friday   2026-06-19 18:00 PDT
 *     b: Saturday 2026-06-20 09:00 GMT+8
 *     dayDelta: +1
 *
 * @param {string} utcIso
 * @param {string} tzA
 * @param {string} tzB
 * @param {{locale?:string, weekdayWidth?:'long'|'short'}} [opts]
 * @returns {{
 *   utc: string,
 *   a: object, b: object,
 *   dayDelta: number, sameLocalDay: boolean, offsetHours: number
 * }}
 */
export function formatDual(utcIso, tzA, tzB, opts = {}) {
  const { locale = 'en-US', weekdayWidth = 'long' } = opts;
  const instant = toUtcIso(utcIso);

  const side = (tz) => {
    requireZone(tz, 'formatDual');
    const parts = wallPartsInZone(instant, tz);
    return {
      timeZone: tz,
      localIso: fromUtc(instant, tz),
      dateKey: dateKeyInZone(instant, tz),
      time: `${pad(parts.hour)}:${pad(parts.minute)}`,
      // Index and label both come from this zone's own formatter.
      weekday: parts.weekday,
      weekdayLabel: weekdayLabel(instant, tz, { locale, width: weekdayWidth }),
      weekdayEn: WEEKDAY_NAMES_EN[parts.weekday],
      zoneLabel: zoneLabel(instant, tz, locale),
      offsetMinutes: zoneOffsetMinutes(instant, tz),
      text: `${weekdayLabel(instant, tz, { locale, width: weekdayWidth })} ` +
            `${formatInZone(instant, tz, { locale, date: true, zoneName: true })}`
    };
  };

  const a = side(tzA);
  const b = side(tzB);

  return {
    utc: instant,
    a,
    b,
    // Calendar-day difference between the two local dates, computed from the
    // two date keys rather than from either weekday.
    dayDelta: Math.round(
      (Date.parse(`${b.dateKey}T00:00:00Z`) - Date.parse(`${a.dateKey}T00:00:00Z`)) / MS_PER_DAY
    ),
    sameLocalDay: a.dateKey === b.dateKey,
    offsetHours: (b.offsetMinutes - a.offsetMinutes) / 60
  };
}

/* ------------------------------------------------------------------ *
 * HH:MM
 * ------------------------------------------------------------------ */

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
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

/* ------------------------------------------------------------------ *
 * Recurring slots
 * ------------------------------------------------------------------ */

/**
 * The instant of UTC midnight on the Sunday that starts the week containing
 * `instant`. The anchor for resolving recurring availability.
 */
export function weekAnchorUtcIso(instant) {
  const d = toDate(instant);
  const sunday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
    d.getUTCDay() * MS_PER_DAY;
  return iso(sunday);
}

function slotZone(slot, fallbackTz, where) {
  const tz = slot.timezone ?? fallbackTz;
  if (!tz) {
    throw new TypeError(`${where}: availability row has no timezone and no fallback was given.`);
  }
  return requireZone(tz, where);
}

/**
 * Resolve a recurring availability row to a concrete instant interval in the
 * week anchored at `weekAnchorIso`.
 *
 * `endTime` at or before `startTime` means the window crosses local midnight
 * ("22:00–01:00"), which real students do use.
 *
 * @param {{weekday:number, startTime:string, endTime:string, timezone?:string}} slot
 * @param {string} weekAnchorIso from weekAnchorUtcIso()
 * @param {string} [fallbackTz] used when the row carries no timezone
 * @returns {{startMs:number, endMs:number, startIso:string, endIso:string, minutes:number}}
 */
export function slotToInterval(slot, weekAnchorIso, fallbackTz) {
  const tz = slotZone(slot, fallbackTz, 'slotToInterval');
  const anchor = Date.parse(weekAnchorIso);
  const date = new Date(anchor + slot.weekday * MS_PER_DAY);

  const wall = {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };

  const startMin = parseHhMm(slot.startTime);
  const endMin = parseHhMm(slot.endTime);
  const spansMidnight = endMin <= startMin;

  const start = resolveLocal(
    { ...wall, hour: Math.floor(startMin / 60), minute: startMin % 60 }, tz
  ).utc;

  // For a midnight-spanning window the end belongs to the NEXT local day, so
  // resolve it against that date rather than adding 24h to the start — the
  // two differ by an hour across a DST boundary.
  const endDate = spansMidnight ? new Date(anchor + (slot.weekday + 1) * MS_PER_DAY) : date;
  const end = resolveLocal({
    year: endDate.getUTCFullYear(),
    month: endDate.getUTCMonth() + 1,
    day: endDate.getUTCDate(),
    hour: Math.floor(endMin / 60),
    minute: endMin % 60
  }, tz).utc;

  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  return { startMs, endMs, startIso: start, endIso: end, minutes: (endMs - startMs) / MS_PER_MINUTE };
}

/**
 * The next time a recurring slot comes around, as instants.
 *
 * Walks forward day by day in the target zone and resolves each candidate, so
 * a week containing a DST transition produces the correct UTC instant rather
 * than one an hour out. Weekday matching is done on the local calendar date,
 * never on a UTC weekday.
 *
 * @param {{weekday:number, startTime:string, endTime?:string, timezone?:string}} slot
 * @param {string} timeZone used when the slot carries no timezone of its own
 * @param {{fromIso?:string, inclusive?:boolean}} [opts] `fromIso` defaults to
 *        now; pass it explicitly anywhere the result is asserted on.
 * @returns {{startUtc:string, endUtc:string|null, minutes:number|null,
 *            localDate:string, localStart:string, weekday:number, timeZone:string}}
 */
export function nextOccurrence(slot, timeZone, opts = {}) {
  const { fromIso = new Date().toISOString(), inclusive = true } = opts;
  const tz = slotZone(slot, timeZone, 'nextOccurrence');
  const from = Date.parse(toUtcIso(fromIso));

  const startMin = parseHhMm(slot.startTime);
  const wanted = Number(slot.weekday);
  if (!Number.isInteger(wanted) || wanted < 0 || wanted > 6) {
    throw new RangeError(`nextOccurrence: weekday must be 0..6, got ${slot.weekday}.`);
  }

  // Start from the local calendar date `from` falls on in tz, and step
  // forward. 8 days is enough to find any weekday plus today.
  const base = wallPartsInZone(from, tz);
  for (let offset = 0; offset <= 8; offset++) {
    const probe = new Date(Date.UTC(base.year, base.month - 1, base.day) + offset * MS_PER_DAY);
    const wall = {
      year: probe.getUTCFullYear(),
      month: probe.getUTCMonth() + 1,
      day: probe.getUTCDate()
    };

    // Which weekday is this local date? Resolve local noon (never inside a
    // DST gap) and read the weekday back in the same zone.
    const noon = resolveLocal({ ...wall, hour: 12 }, tz).utc;
    if (weekdayInZone(noon, tz) !== wanted) continue;

    const start = resolveLocal(
      { ...wall, hour: Math.floor(startMin / 60), minute: startMin % 60 }, tz
    ).utc;
    const startMs = Date.parse(start);
    if (inclusive ? startMs < from : startMs <= from) continue;

    let endUtc = null;
    let minutes = null;
    if (slot.endTime != null) {
      const interval = slotToInterval(
        { ...slot, timezone: tz }, weekAnchorUtcIso(start), tz
      );
      // slotToInterval anchors on the slot's weekday within that week, which
      // is the same local date we just resolved.
      endUtc = interval.endIso;
      minutes = interval.minutes;
    }

    return {
      startUtc: start,
      endUtc,
      minutes,
      localDate: dateKeyInZone(start, tz),
      localStart: fromUtc(start, tz),
      weekday: weekdayInZone(start, tz),
      timeZone: tz
    };
  }

  // Unreachable for a valid weekday, but better than returning undefined.
  throw new Error(`nextOccurrence: could not find weekday ${wanted} within 8 days in ${tz}.`);
}

/* ------------------------------------------------------------------ *
 * Overlap
 * ------------------------------------------------------------------ */

/** Overlap of two half-open millisecond intervals, in minutes. */
export function intervalOverlapMinutes(a, b) {
  const start = Math.max(a.startMs, b.startMs);
  const end = Math.min(a.endMs, b.endMs);
  return end <= start ? 0 : Math.round((end - start) / MS_PER_MINUTE);
}

/** Merge overlapping or touching intervals. Input is not mutated. */
export function mergeIntervals(intervals) {
  if (intervals.length <= 1) return [...intervals];
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  const out = [{ ...sorted[0] }];
  for (const next of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (next.startMs <= last.endMs) last.endMs = Math.max(last.endMs, next.endMs);
    else out.push({ ...next });
  }
  return out;
}

const WEEK_SHIFTS = [-MS_PER_WEEK, 0, MS_PER_WEEK];

function expandSlots(avail, fallbackTz, anchorIso, shifts) {
  const out = [];
  for (const slot of avail ?? []) {
    const base = slotToInterval(slot, anchorIso, fallbackTz);
    for (const shift of shifts) {
      out.push({ startMs: base.startMs + shift, endMs: base.endMs + shift });
    }
  }
  return out;
}

/**
 * The concrete instants two people share, for the week containing
 * `opts.referenceIso`.
 *
 * Both sides are resolved to real instants before being compared, which is
 * what makes a tutor's "Friday 18:00 Pacific" meet a student's "Saturday
 * 09:00 Beijing" — the same hour, on days both sides would name differently.
 * A comparison that matched on weekday first would score that pair zero.
 *
 * Each side may carry its own `timezone` per row (a tutor who travels); `tzA`
 * and `tzB` are the defaults for rows that do not. One of the two must be
 * available for every row.
 *
 * Side B is also tested against the adjacent weeks, so a pairing straddling
 * the week boundary is not lost. Results are merged, so a tutor's single
 * three-hour window cannot yield six hours just because the student listed
 * two overlapping windows inside it.
 *
 * @param {Array<{weekday:number,startTime:string,endTime:string,timezone?:string}>} availA
 * @param {string} tzA
 * @param {Array} availB
 * @param {string} tzB
 * @param {{referenceIso?:string, minMinutes?:number}} [opts]
 * @returns {Array<{startUtc:string, endUtc:string, minutes:number}>} earliest first
 */
export function overlapWindows(availA, tzA, availB, tzB, opts = {}) {
  const { referenceIso = new Date().toISOString(), minMinutes = 0 } = opts;
  if (!availA?.length || !availB?.length) return [];

  const anchor = weekAnchorUtcIso(referenceIso);
  // A stays in the reference week; B is shifted, so every result lies inside
  // one of A's own windows and nothing is counted twice.
  const a = expandSlots(availA, tzA, anchor, [0]);
  const b = expandSlots(availB, tzB, anchor, WEEK_SHIFTS);

  const raw = [];
  for (const x of a) {
    for (const y of b) {
      const startMs = Math.max(x.startMs, y.startMs);
      const endMs = Math.min(x.endMs, y.endMs);
      if (endMs > startMs) raw.push({ startMs, endMs });
    }
  }

  return mergeIntervals(raw)
    .map((i) => ({
      startUtc: iso(i.startMs),
      endUtc: iso(i.endMs),
      minutes: Math.round((i.endMs - i.startMs) / MS_PER_MINUTE)
    }))
    .filter((w) => w.minutes >= minMinutes)
    .sort((p, q) => p.startUtc.localeCompare(q.startUtc));
}

/**
 * Total minutes two availability sets share in the reference week.
 * Rows must carry their own `timezone`.
 */
export function availabilityOverlapMinutes(slotsA, slotsB, referenceIso) {
  return overlapWindows(slotsA, undefined, slotsB, undefined, { referenceIso })
    .reduce((total, w) => total + w.minutes, 0);
}

/**
 * The shared windows, earliest first. Rows must carry their own `timezone`.
 * Kept as the shape matching.js consumes.
 */
export function availabilityOverlapWindows(slotsA, slotsB, referenceIso) {
  return overlapWindows(slotsA, undefined, slotsB, undefined, { referenceIso })
    .map((w) => ({ startIso: w.startUtc, endIso: w.endUtc, minutes: w.minutes }));
}

/* ------------------------------------------------------------------ *
 * Date arithmetic
 * ------------------------------------------------------------------ */

/** Add minutes to an instant. */
export function addMinutes(instant, minutes) {
  return iso(toDate(instant).getTime() + minutes * MS_PER_MINUTE);
}

/**
 * Whole calendar days between two instants as seen in `tz`. Calendar days,
 * not 24-hour blocks, so "yesterday at 11pm" to "today at 1am" is 1.
 */
export function calendarDaysBetween(fromInstant, toInstant, tz) {
  const a = wallPartsInZone(fromInstant, tz);
  const b = wallPartsInZone(toInstant, tz);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / MS_PER_DAY
  );
}
