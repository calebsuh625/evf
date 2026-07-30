/**
 * chart.js — just enough geometry to draw a line chart.
 *
 * Pure functions, no DOM, no imports. Returns coordinates and path strings;
 * the view turns them into SVG elements.
 *
 * There is no charting library here and there should not be one. Every
 * charting library is a CDN dependency or a build step, and this app can
 * afford neither: the students are in mainland China, where a blocked script
 * host does not degrade a page, it breaks it. A growth chart is about forty
 * lines of arithmetic.
 *
 * Kept separate from the view so the arithmetic can be tested — an off-by-one
 * in a y-scale is invisible on screen and obvious in an assertion.
 */

/** Default drawing box. Callers override per chart. */
export const DEFAULT_BOX = Object.freeze({
  width: 640,
  height: 180,
  padding: { top: 8, right: 8, bottom: 20, left: 28 }
});

/**
 * A "nice" upper bound and tick step for an axis, so labels land on round
 * numbers rather than on whatever the data happened to reach.
 *
 * @returns {{max:number, step:number, ticks:number[]}}
 */
export function niceScale(maxValue, targetTicks = 4) {
  const max = Math.max(0, Number(maxValue) || 0);
  if (max === 0) return { max: 1, step: 1, ticks: [0, 1] };

  const rough = max / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;

  // Steps humans read without thinking.
  const step = (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude;
  const top = Math.ceil(max / step) * step;

  const ticks = [];
  for (let value = 0; value <= top + step / 2; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  return { max: top, step, ticks };
}

/**
 * Map a series of numbers onto points inside the box.
 *
 * A single-point series is placed at the left edge rather than dividing by
 * zero; a chart of one month is legitimate and should not crash.
 *
 * @param {number[]} values
 * @param {{box?: object, max?: number}} [opts]
 * @returns {Array<{x:number, y:number, value:number, index:number}>}
 */
export function scaleSeries(values, opts = {}) {
  const box = { ...DEFAULT_BOX, ...(opts.box ?? {}) };
  const pad = { ...DEFAULT_BOX.padding, ...(box.padding ?? {}) };

  const plotWidth = box.width - pad.left - pad.right;
  const plotHeight = box.height - pad.top - pad.bottom;
  const max = opts.max ?? niceScale(Math.max(0, ...values)).max;

  const lastIndex = values.length - 1;
  return values.map((raw, index) => {
    const value = Number(raw) || 0;
    const t = lastIndex === 0 ? 0 : index / lastIndex;
    return {
      index,
      value,
      x: round2(pad.left + t * plotWidth),
      y: round2(pad.top + plotHeight - (max === 0 ? 0 : value / max) * plotHeight)
    };
  });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** "M x y L x y L x y". Empty string for an empty series. */
export function linePath(points) {
  if (!points?.length) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');
}

/** The same line closed down to a baseline, for a soft fill under it. */
export function areaPath(points, baselineY) {
  if (!points?.length) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points)} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}

/** Y positions for axis ticks, matching scaleSeries' mapping. */
export function tickPositions(ticks, opts = {}) {
  const box = { ...DEFAULT_BOX, ...(opts.box ?? {}) };
  const pad = { ...DEFAULT_BOX.padding, ...(box.padding ?? {}) };
  const plotHeight = box.height - pad.top - pad.bottom;
  const max = opts.max ?? Math.max(...ticks, 1);

  return ticks.map((value) => ({
    value,
    y: round2(pad.top + plotHeight - (max === 0 ? 0 : value / max) * plotHeight)
  }));
}

/**
 * Which labels to draw along the x axis.
 *
 * A year of months will not fit, so this thins them evenly while always
 * keeping the first and last — the two a reader looks for.
 */
export function labelIndices(count, maxLabels = 6) {
  if (count <= 0) return [];
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);

  const stride = Math.ceil((count - 1) / (maxLabels - 1));
  const out = [];
  for (let i = 0; i < count; i += stride) out.push(i);
  if (out[out.length - 1] !== count - 1) out.push(count - 1);
  return out;
}

/**
 * Everything a two-series line chart needs, ready to render.
 *
 * @param {Array<object>} rows
 * @param {{x: (row)=>string, series: Array<{key:string, of:(row)=>number}>, box?: object}} spec
 */
export function lineChart(rows, spec) {
  const box = { ...DEFAULT_BOX, ...(spec.box ?? {}) };
  const pad = { ...DEFAULT_BOX.padding, ...(box.padding ?? {}) };

  const allValues = spec.series.flatMap((s) => rows.map((r) => Number(s.of(r)) || 0));
  const scale = niceScale(Math.max(0, ...allValues));
  const baselineY = box.height - pad.bottom;

  return {
    box,
    max: scale.max,
    baselineY,
    ticks: tickPositions(scale.ticks, { box, max: scale.max }),
    labels: labelIndices(rows.length).map((index) => ({
      index,
      text: spec.x(rows[index]),
      x: scaleSeries(rows.map(() => 0), { box, max: scale.max })[index].x
    })),
    series: spec.series.map((s) => {
      const points = scaleSeries(rows.map((r) => Number(s.of(r)) || 0), { box, max: scale.max });
      return {
        key: s.key,
        points,
        line: linePath(points),
        area: areaPath(points, baselineY),
        last: points[points.length - 1] ?? null
      };
    })
  };
}
