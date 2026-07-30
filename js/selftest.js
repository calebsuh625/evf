/**
 * selftest.js — the timezone assertions, as runnable scenarios.
 *
 * Pure functions. Imports only time.js. No DOM.
 *
 * These exist to be *shown to someone*. A club officer deciding whether to
 * trust this app with a term of scheduling cannot read a test suite, but they
 * can read "Saturday 09:00 in Beijing is Friday 18:00 in California — checked,
 * passing" on a page. So each scenario carries a plain-English title, the
 * reason it matters, and its expected and actual values.
 *
 * This is also the single source of truth for these facts:
 * `js/views/selftest.js` renders them, and `tests/time.test.js` imports the
 * same list and asserts every one passes. Neither restates an expectation.
 *
 * Every date here is a fixed instant. Nothing calls Date.now(), so a run today
 * and a run next year give the same answer.
 */

import {
  toUtc,
  fromUtc,
  formatDual,
  overlapWindows,
  nextOccurrence,
  resolveLocal,
  zoneOffsetMinutes,
  observesDst,
  weekdayLabel,
  slotToInterval,
  weekAnchorUtcIso,
  availabilityOverlapMinutes,
  CHINA_TZ,
  PACIFIC_TZ
} from './time.js';

const SH = CHINA_TZ;      // Asia/Shanghai — UTC+8, no DST, ever
const LA = PACIFIC_TZ;    // America/Los_Angeles — PST/PDT

/* Fixed reference dates, all 2026.
 *
 *   Sat 2026-06-20  midsummer, US on PDT (UTC-7)
 *   Sat 2026-01-17  midwinter, US on PST (UTC-8)
 *   Sun 2026-03-08  US springs forward: local 02:00 -> 03:00
 *   Sun 2026-11-01  US falls back:      local 02:00 -> 01:00
 */

export const CATEGORIES = Object.freeze([
  { id: 'dateline',
    title: { en: 'The date line', zh: '跨日期线' },
    blurb: { en: 'A shared hour, named differently at each end.', zh: '同一个小时，两端的称法不同。' } },
  { id: 'dst',
    title: { en: 'Daylight saving', zh: '夏令时' },
    blurb: { en: 'The US moves twice a year. China never does.', zh: '美国每年调整两次时钟，中国从不调整。' } },
  { id: 'midnight',
    title: { en: 'Midnight boundaries', zh: '午夜边界' },
    blurb: { en: 'Windows that cross a local midnight.', zh: '跨越当地午夜的时间段。' } },
  { id: 'overlap',
    title: { en: 'Shared availability', zh: '共同可用时间' },
    blurb: { en: 'Zero, partial and exact overlap.', zh: '无重叠、部分重叠与完全重叠。' } },
  { id: 'recurring',
    title: { en: 'Recurring slots', zh: '每周固定时段' },
    blurb: { en: 'When does this actually happen next.', zh: '下一次究竟是什么时候。' } }
]);

/** Pick a language from a { en, zh } pair, falling back to English. */
export function pick(value, lang = 'en') {
  if (value == null) return '';
  return typeof value === 'string' ? value : (value[lang] ?? value.en ?? '');
}

/** Build a passing/failing result by string comparison. */
function expect(expected, actual, note) {
  return { pass: String(expected) === String(actual), expected: String(expected), actual: String(actual), note };
}

function expectAll(pairs, note) {
  const expected = pairs.map(([e]) => e).join(' · ');
  const actual = pairs.map(([, a]) => a).join(' · ');
  return { pass: expected === actual, expected, actual, note };
}

/**
 * Scenario notes are authored as { en, zh } pairs alongside the assertion, so
 * the expectation and its explanation cannot drift apart.
 */

export const SCENARIOS = Object.freeze([
  /* ---------------- the date line ---------------- */
  {
    id: 'beijing-saturday-is-pacific-friday',
    category: 'dateline',
    title: { en: 'Saturday 09:00 in Beijing is Friday 18:00 in California', zh: '北京时间周六 09:00 就是加州时间周五 18:00' },
    why: { en: 'The single most common slot in the program, and the one that gets people to show up on the wrong day.', zh: '本项目中最常见的时段，也是最容易让人在错误的日子出现的时段。' },
    run() {
      const utc = toUtc('2026-06-20T09:00', SH);
      return expectAll([
        ['2026-06-20T01:00:00.000Z', utc],
        ['2026-06-19T18:00:00', fromUtc(utc, LA)],
        ['Friday', weekdayLabel(utc, LA)],
        ['Saturday', weekdayLabel(utc, SH)]
      ], { en: 'Both directions agree: 09:00 Beijing and 18:00 Pacific name one instant.', zh: '两个方向一致：北京 09:00 与太平洋时间 18:00 指的是同一时刻。' });
    }
  },
  {
    id: 'pacific-friday-is-beijing-saturday',
    category: 'dateline',
    title: { en: 'And the reverse: Friday 18:00 Pacific resolves to the same instant', zh: '反向换算：太平洋时间周五 18:00 指向同一时刻' },
    why: { en: 'Converting each way must land on the same moment, or a tutor and a student booking from opposite ends drift apart.', zh: '两个方向必须换算到同一时刻，否则辅导员与学生各自预约时会逐渐错开。' },
    run() {
      return expect(toUtc('2026-06-20T09:00', SH), toUtc('2026-06-19T18:00', LA));
    }
  },
  {
    id: 'weekdays-computed-independently',
    category: 'dateline',
    title: { en: 'Each side gets its own weekday label, never the other side\'s', zh: '每一端都有各自的星期标签，绝不共用对方的' },
    why: { en: 'A weekday shared between zones is the bug. formatDual computes both from formatters bound to one zone each.', zh: '两个时区共用一个星期值就是错误本身。formatDual 分别用绑定到各自时区的格式化器计算。' },
    run() {
      const dual = formatDual('2026-06-20T01:00:00.000Z', LA, SH);
      return expectAll([
        ['Friday', dual.a.weekdayLabel],
        ['Saturday', dual.b.weekdayLabel],
        ['5', dual.a.weekday],
        ['6', dual.b.weekday],
        ['1', dual.dayDelta],
        ['false', dual.sameLocalDay]
      ], { en: 'Different weekday index and different label, from the same instant.', zh: '同一时刻，星期序号与星期标签都不相同。' });
    }
  },
  {
    id: 'winter-shifts-the-pacific-hour',
    category: 'dateline',
    title: { en: 'In winter the same Beijing slot is Friday 17:00, not 18:00', zh: '到了冬天，同一个北京时段变成周五 17:00，而不是 18:00' },
    why: { en: 'China stays put, so the tutor\'s clock time for an unchanged student slot differs by season.', zh: '中国不调整时钟，因此学生时段不变时，辅导员一侧的钟点会随季节改变。' },
    run() {
      const summer = fromUtc(toUtc('2026-06-20T09:00', SH), LA);
      const winter = fromUtc(toUtc('2026-01-17T09:00', SH), LA);
      return expectAll([
        ['2026-06-19T18:00:00', summer],
        ['2026-01-16T17:00:00', winter]
      ], { en: 'Same declared student availability, an hour apart on the tutor\'s clock.', zh: '学生填报的可用时间完全相同，但辅导员钟面上相差一小时。' });
    }
  },
  {
    id: 'round-trip-both-zones',
    category: 'dateline',
    title: { en: 'Converting to UTC and back returns the original wall clock', zh: '换算成 UTC 再换算回来，得到原本的当地钟点' },
    why: { en: 'A round trip that loses an hour is how a schedule quietly rots over a term.', zh: '往返换算若丢失一小时，整个学期的日程就会悄悄失准。' },
    run() {
      const pairs = [];
      for (const [tz, local] of [
        [SH, '2026-06-20T09:00:00'], [LA, '2026-06-19T18:00:00'],
        [SH, '2026-01-17T09:00:00'], [LA, '2026-01-16T17:00:00'],
        [LA, '2026-03-08T23:30:00'], [LA, '2026-11-01T23:30:00']
      ]) {
        pairs.push([local, fromUtc(toUtc(local, tz), tz)]);
      }
      return expectAll(pairs, { en: 'Six wall times, including both DST weekends.', zh: '六个当地钟点，包含两个夏令时切换周末。' });
    }
  },

  /* ---------------- daylight saving ---------------- */
  {
    id: 'china-never-changes',
    category: 'dst',
    title: { en: 'China is UTC+8 in January and in July', zh: '中国在一月和七月都是 UTC+8' },
    why: { en: 'If this ever reports otherwise, every student-side calculation is suspect.', zh: '若此项出现其他结果，学生一侧的全部计算都不可信。' },
    run() {
      return expectAll([
        ['480', zoneOffsetMinutes('2026-01-15T00:00:00.000Z', SH)],
        ['480', zoneOffsetMinutes('2026-07-15T00:00:00.000Z', SH)],
        ['false', observesDst('2026-06-20T00:00:00.000Z', SH)]
      ], { en: 'One offset all year, and no DST flag.', zh: '全年只有一个时差，且没有夏令时标记。' });
    }
  },
  {
    id: 'pacific-does-change',
    category: 'dst',
    title: { en: 'US Pacific is UTC-8 in January and UTC-7 in July', zh: '美国太平洋时间一月为 UTC-8，七月为 UTC-7' },
    why: { en: 'The asymmetry with China is the whole problem. This confirms the tutor side really does move.', zh: '与中国的这种不对称正是问题所在。此项确认辅导员一侧确实会变动。' },
    run() {
      return expectAll([
        ['-480', zoneOffsetMinutes('2026-01-15T00:00:00.000Z', LA)],
        ['-420', zoneOffsetMinutes('2026-07-15T00:00:00.000Z', LA)],
        ['true', observesDst('2026-06-20T00:00:00.000Z', LA)]
      ]);
    }
  },
  {
    id: 'spring-forward-nonexistent-hour',
    category: 'dst',
    title: { en: 'Spring forward: 02:30 on Sunday 8 March does not exist in California', zh: '夏令时开始：加州 3 月 8 日周日的 02:30 并不存在' },
    why: { en: 'The clock jumps 02:00 to 03:00. Resolving backwards would move a session an hour EARLIER than booked — the dangerous direction.', zh: '时钟从 02:00 直接跳到 03:00。若向前回退解析，会把课程提早一小时——这是更危险的方向。' },
    run() {
      const r = resolveLocal({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, LA);
      return expectAll([
        ['nonexistent', r.kind],
        ['2026-03-08T03:30:00', fromUtc(r.utc, LA)]
      ], { en: 'Detected as nonexistent, and shifted forward past the gap to 03:30.', zh: '被判定为不存在，并向前越过缺口调整到 03:30。' });
    }
  },
  {
    id: 'spring-forward-neighbours-normal',
    category: 'dst',
    title: { en: 'The hours either side of that gap resolve normally', zh: '该缺口前后的整点均正常解析' },
    why: { en: 'A transition must not contaminate the rest of the day.', zh: '时钟切换不得影响当天其余时间。' },
    run() {
      const before = resolveLocal({ year: 2026, month: 3, day: 8, hour: 1 }, LA);
      const after = resolveLocal({ year: 2026, month: 3, day: 8, hour: 3 }, LA);
      return expectAll([
        ['normal', before.kind], ['normal', after.kind],
        ['2026-03-08T09:00:00.000Z', before.utc],
        ['2026-03-08T10:00:00.000Z', after.utc]
      ], { en: 'One hour apart on the clock; one hour apart in UTC.', zh: '钟面相差一小时，UTC 也相差一小时。' });
    }
  },
  {
    id: 'fall-back-ambiguous-hour',
    category: 'dst',
    title: { en: 'Fall back: 01:30 on Sunday 1 November happens twice in California', zh: '夏令时结束：加州 11 月 1 日周日的 01:30 出现两次' },
    why: { en: 'Two real instants share one wall clock. The app must know which it picked and that another exists.', zh: '两个真实时刻对应同一个钟面读数。应用必须知道自己选了哪一个，并且知道另一个存在。' },
    run() {
      const r = resolveLocal({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, LA);
      const later = resolveLocal({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, LA, { ambiguous: 'later' });
      return expectAll([
        ['ambiguous', r.kind],
        ['2026-11-01T08:30:00.000Z', r.utc],
        ['2026-11-01T09:30:00.000Z', r.alternativeUtc],
        ['2026-11-01T09:30:00.000Z', later.utc],
        ['2026-11-01T01:30:00', fromUtc(r.utc, LA)],
        ['2026-11-01T01:30:00', fromUtc(later.utc, LA)]
      ], { en: 'Both instants read 01:30 locally. The earlier one is chosen by default.', zh: '两个时刻在当地都读作 01:30。默认选择较早的那一个。' });
    }
  },
  {
    id: 'china-unaffected-by-us-transitions',
    category: 'dst',
    title: { en: 'Neither US transition produces an odd hour in China', zh: '美国的两次时钟切换都不会在中国产生异常小时' },
    why: { en: 'A student-side slot must never be reported ambiguous or nonexistent.', zh: '学生一侧的时段绝不应被判定为重复或不存在。' },
    run() {
      const kinds = new Set();
      for (const month of [3, 11]) {
        for (let day = 1; day <= 28; day++) {
          for (const hour of [0, 1, 2, 3]) {
            kinds.add(resolveLocal({ year: 2026, month, day, hour }, SH).kind);
          }
        }
      }
      return expect('normal', [...kinds].join(','), { en: '448 local hours across both transition months.', zh: '覆盖两个切换月份共 448 个当地小时。' });
    }
  },
  {
    id: 'recurring-slot-shifts-for-tutor-only',
    category: 'dst',
    title: { en: 'Across the spring transition, an unchanged student slot moves on the tutor\'s clock', zh: '夏令时开始后，未改动的学生时段在辅导员钟面上发生了移动' },
    why: { en: 'This is the silent failure the module exists to prevent: nobody edited anything, but the tutor now has to show up an hour later.', zh: '这正是本模块要防止的隐性故障：没有人改动任何设置，但辅导员现在要晚一小时出现。' },
    run() {
      const before = toUtc('2026-03-07T09:00', SH); // Saturday before
      const after = toUtc('2026-03-14T09:00', SH);  // Saturday after
      return expectAll([
        ['2026-03-06T17:00:00', fromUtc(before, LA)],
        ['2026-03-13T18:00:00', fromUtc(after, LA)],
        ['09:00:00', fromUtc(before, SH).slice(11)],
        ['09:00:00', fromUtc(after, SH).slice(11)]
      ], { en: 'Student: 09:00 both weeks. Tutor: 17:00 then 18:00.', zh: '学生：两周都是 09:00。辅导员：先是 17:00，后变为 18:00。' });
    }
  },

  /* ---------------- midnight ---------------- */
  {
    id: 'window-crossing-local-midnight',
    category: 'midnight',
    title: { en: 'A student free 23:00–01:00 Beijing is a single two-hour window', zh: '学生的北京时间 23:00–01:00 是一个完整的两小时时段' },
    why: { en: 'An end time before the start time means the window crosses midnight, not that it is invalid or negative.', zh: '结束时间早于开始时间意味着跨越午夜，而不是数据无效或时长为负。' },
    run() {
      const slot = { weekday: 6, startTime: '23:00', endTime: '01:00', timezone: SH };
      const interval = slotToInterval(slot, weekAnchorUtcIso('2026-06-20T00:00:00.000Z'));
      return expectAll([
        ['120', interval.minutes],
        ['2026-06-20T15:00:00.000Z', interval.startIso],
        ['2026-06-20T17:00:00.000Z', interval.endIso]
      ], { en: 'Saturday 23:00 Beijing through Sunday 01:00, as one unbroken interval.', zh: '北京时间周六 23:00 至周日 01:00，是一段连续的时间。' });
    }
  },
  {
    id: 'midnight-window-still-matches',
    category: 'midnight',
    title: { en: 'That midnight-crossing window still matches a Pacific Saturday morning', zh: '这个跨午夜时段仍能匹配太平洋时间的周六上午' },
    why: { en: 'The late-night student and the Saturday-morning tutor are the program\'s other natural pairing, and it straddles a local midnight on one side.', zh: '深夜的学生与周六上午的辅导员是本项目另一种自然搭配，而它在一端跨越了当地午夜。' },
    run() {
      const windows = overlapWindows(
        [{ weekday: 6, startTime: '23:00', endTime: '01:00' }], SH,
        [{ weekday: 6, startTime: '08:00', endTime: '11:00' }], LA,
        { referenceIso: '2026-06-20T00:00:00.000Z' }
      );
      return expectAll([
        ['1', windows.length],
        ['120', windows[0]?.minutes],
        ['2026-06-20T15:00:00.000Z', windows[0]?.startUtc],
        ['2026-06-20T08:00:00', fromUtc(windows[0]?.startUtc, LA)],
        ['2026-06-20T23:00:00', fromUtc(windows[0]?.startUtc, SH)]
      ], { en: 'Tutor 08:00 Saturday Pacific, student 23:00 Saturday Beijing, running into Sunday.', zh: '辅导员为太平洋时间周六 08:00，学生为北京时间周六 23:00，并延续到周日。' });
    }
  },
  {
    id: 'midnight-in-beijing-is-morning-in-california',
    category: 'midnight',
    title: { en: 'Saturday 00:00 Beijing is Friday 09:00 in California', zh: '北京时间周六 00:00 是加州时间周五 09:00' },
    why: { en: 'Local midnight is where off-by-one-day errors surface.', zh: '当地午夜正是最容易出现差一天错误的地方。' },
    run() {
      const utc = toUtc('2026-06-20T00:00', SH);
      return expectAll([
        ['2026-06-19T16:00:00.000Z', utc],
        ['2026-06-19T09:00:00', fromUtc(utc, LA)],
        ['Friday', weekdayLabel(utc, LA)]
      ]);
    }
  },

  /* ---------------- overlap ---------------- */
  {
    id: 'exact-overlap',
    category: 'overlap',
    title: { en: 'Tutor Friday 17:00–20:00 Pacific exactly meets student Saturday 08:00–11:00 Beijing', zh: '辅导员太平洋时间周五 17:00–20:00 恰好对应学生北京时间周六 08:00–11:00' },
    why: { en: 'Different weekdays, different clock times, same three hours. A matcher comparing weekdays first scores this zero.', zh: '星期不同、钟点不同，却是同样的三个小时。先比较星期的匹配算法会把这一对判为零。' },
    run() {
      const windows = overlapWindows(
        [{ weekday: 5, startTime: '17:00', endTime: '20:00' }], LA,
        [{ weekday: 6, startTime: '08:00', endTime: '11:00' }], SH,
        { referenceIso: '2026-06-20T00:00:00.000Z' }
      );
      return expectAll([
        ['1', windows.length],
        ['180', windows[0]?.minutes],
        ['2026-06-20T00:00:00.000Z', windows[0]?.startUtc],
        ['2026-06-20T03:00:00.000Z', windows[0]?.endUtc]
      ], { en: 'Three hours, fully shared.', zh: '三个小时，完全重合。' });
    }
  },
  {
    id: 'partial-overlap',
    category: 'overlap',
    title: { en: 'A two-hour tutor window overlapping a three-hour student window gives one hour', zh: '两小时的辅导员时段与三小时的学生时段重叠一小时' },
    why: { en: 'Partial overlap has to be measured, not rounded to all-or-nothing.', zh: '部分重叠必须精确计算，不能简化为全有或全无。' },
    run() {
      const windows = overlapWindows(
        [{ weekday: 5, startTime: '17:00', endTime: '19:00' }], LA,
        [{ weekday: 6, startTime: '09:00', endTime: '12:00' }], SH,
        { referenceIso: '2026-06-20T00:00:00.000Z' }
      );
      return expectAll([
        ['1', windows.length],
        ['60', windows[0]?.minutes],
        ['2026-06-20T01:00:00.000Z', windows[0]?.startUtc]
      ]);
    }
  },
  {
    id: 'zero-overlap',
    category: 'overlap',
    title: { en: 'Saturday morning in California does not meet Saturday morning in Beijing', zh: '加州的周六上午与北京的周六上午并不相遇' },
    why: { en: 'Both say "Saturday morning" and they are fifteen hours apart. The honest answer is no shared time.', zh: '双方都说“周六上午”，实际相差十五小时。诚实的答案是没有共同时间。' },
    run() {
      const minutes = availabilityOverlapMinutes(
        [{ weekday: 6, startTime: '09:00', endTime: '12:00', timezone: LA }],
        [{ weekday: 6, startTime: '08:00', endTime: '11:00', timezone: SH }],
        '2026-06-20T00:00:00.000Z'
      );
      return expect('0', minutes, { en: 'No window, and no pretending otherwise.', zh: '没有可用时间段，也不会假装有。' });
    }
  },
  {
    id: 'no-double-counting',
    category: 'overlap',
    title: { en: 'Two overlapping student windows cannot inflate one tutor window', zh: '学生两个相互重叠的时段不会放大辅导员的单一时段' },
    why: { en: 'Shared time feeds the pairing score. Counting the same hour twice would rank a pair above one with genuinely more time.', zh: '共同时间会影响配对评分。同一小时重复计算会让这一对排在真正时间更多的配对之前。' },
    run() {
      const minutes = availabilityOverlapMinutes(
        [{ weekday: 5, startTime: '17:00', endTime: '20:00', timezone: LA }],
        [
          { weekday: 6, startTime: '08:00', endTime: '11:00', timezone: SH },
          { weekday: 6, startTime: '09:00', endTime: '11:00', timezone: SH }
        ],
        '2026-06-20T00:00:00.000Z'
      );
      return expect('180', minutes, { en: 'The tutor only has 180 minutes, so 180 is the ceiling.', zh: '辅导员只有 180 分钟，因此上限就是 180。' });
    }
  },

  /* ---------------- recurring ---------------- */
  {
    id: 'next-occurrence-upcoming',
    category: 'recurring',
    title: { en: 'From a Wednesday, the next Saturday 09:00 Beijing slot is that weekend', zh: '从周三查询，下一个北京时间周六 09:00 的时段就在本周末' },
    why: { en: 'Scheduling the next session must not silently skip a week.', zh: '安排下一次课程不能悄悄跳过一周。' },
    run() {
      const next = nextOccurrence({ weekday: 6, startTime: '09:00', endTime: '11:00' }, SH,
        { fromIso: '2026-06-17T00:00:00.000Z' });
      return expectAll([
        ['2026-06-20T01:00:00.000Z', next.startUtc],
        ['2026-06-20T03:00:00.000Z', next.endUtc],
        ['2026-06-20', next.localDate],
        ['120', next.minutes]
      ]);
    }
  },
  {
    id: 'next-occurrence-already-past',
    category: 'recurring',
    title: { en: 'Asked after this week\'s slot has started, it returns next week\'s', zh: '若在本周时段开始之后查询，返回的是下周的时段' },
    why: { en: 'Otherwise "next session" points at one that already happened.', zh: '否则“下一次课程”会指向一个已经发生的时段。' },
    run() {
      const next = nextOccurrence({ weekday: 6, startTime: '09:00' }, SH,
        { fromIso: '2026-06-20T02:00:00.000Z' }); // Saturday 10:00 Beijing
      return expect('2026-06-27T01:00:00.000Z', next.startUtc, { en: 'Asked at 10:00 Beijing Saturday, it skips to the following Saturday.', zh: '在北京时间周六 10:00 查询时，跳到下一个周六。' });
    }
  },
  {
    id: 'next-occurrence-across-transition',
    category: 'recurring',
    title: { en: 'The occurrence after the spring transition is computed for the new offset', zh: '夏令时切换之后的那一次按新的时差计算' },
    why: { en: 'Adding seven days of milliseconds to last week\'s instant would be an hour wrong here.', zh: '直接给上周的时刻加上七天的毫秒数，在这里会差一小时。' },
    run() {
      const next = nextOccurrence({ weekday: 6, startTime: '09:00' }, SH,
        { fromIso: '2026-03-09T00:00:00.000Z' });
      return expectAll([
        ['2026-03-14T01:00:00.000Z', next.startUtc],
        ['2026-03-14T09:00:00', next.localStart],
        ['2026-03-13T18:00:00', fromUtc(next.startUtc, LA)]
      ], { en: 'Student still 09:00 Saturday; tutor now 18:00 Friday rather than 17:00.', zh: '学生仍是周六 09:00；辅导员现在是周五 18:00，而不是 17:00。' });
    }
  }
]);

/**
 * Run every scenario. Never throws: a scenario that blows up is reported as a
 * failure with its error, because a panel that goes blank tells you nothing.
 *
 * Titles and rationales are resolved to `lang` here rather than in the view,
 * so the panel never has to know these are bilingual pairs.
 *
 * @param {{lang?: 'en'|'zh'}} [opts]
 * @returns {{results: object[], passed: number, failed: number, total: number,
 *            ok: boolean, byCategory: object[]}}
 */
export function runSelfTest({ lang = 'en' } = {}) {
  const results = SCENARIOS.map((scenario) => {
    let outcome;
    try {
      outcome = scenario.run();
    } catch (err) {
      outcome = { pass: false, expected: '(no error)', actual: `threw: ${err?.message ?? err}`, note: null };
    }
    return {
      id: scenario.id,
      category: scenario.category,
      title: pick(scenario.title, lang),
      why: pick(scenario.why, lang),
      ...outcome,
      note: pick(outcome.note, lang) || null
    };
  });

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;

  const byCategory = CATEGORIES.map((category) => ({
    id: category.id,
    title: pick(category.title, lang),
    blurb: pick(category.blurb, lang),
    results: results.filter((r) => r.category === category.id)
  })).filter((group) => group.results.length > 0);

  return { results, passed, failed, total: results.length, ok: failed === 0, byCategory };
}
