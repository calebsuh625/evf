/**
 * csv.js — CSV parsing and serialising.
 *
 * Pure functions, no DOM, no imports. Lives apart from store.js because
 * "how do we spell a list inside one cell" is not a question about the data
 * model, and store.js is long enough already.
 *
 * A coordinator's roster arrives as a spreadsheet export. Which means it has
 * quoted fields, commas inside names, and a stray BOM from Excel. This
 * handles all three rather than splitting on commas and hoping.
 *
 * RFC 4180, plus the concessions reality demands:
 *   - CRLF or LF line endings
 *   - a UTF-8 BOM at the start of the file
 *   - a trailing newline
 *   - "" as an escaped quote inside a quoted field
 */

/** Separator for list-valued cells: subjects, goals, interests. */
export const LIST_SEPARATOR = ';';

/**
 * Parse CSV text into a header row and data rows.
 *
 * @param {string} text
 * @returns {{header: string[], rows: string[][]}}
 * @throws {Error} on an unterminated quoted field
 */
export function parseCsv(text) {
  const source = stripBom(String(text ?? ''));
  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  let i = 0;

  // Tracked only so an error message can name the line a human can go find.
  let line = 1;

  while (i < source.length) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false;
        i += 1;
        continue;
      }
      if (char === '\n') line += 1;
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      // A quote only opens a field at its start; mid-field it is literal.
      if (field === '') { inQuotes = true; i += 1; continue; }
      field += char;
      i += 1;
      continue;
    }

    if (char === ',') {
      record.push(field);
      field = '';
      i += 1;
      continue;
    }

    if (char === '\r' || char === '\n') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      record.push(field);
      records.push(record);
      field = '';
      record = [];
      line += 1;
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  if (inQuotes) {
    throw new Error(`Unterminated quoted field starting before line ${line}. Check for a missing closing quote.`);
  }

  // Flush the last record unless the file simply ended with a newline.
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => !(r.length === 1 && r[0].trim() === ''));
  if (nonEmpty.length === 0) return { header: [], rows: [] };

  const [header, ...rows] = nonEmpty;
  return { header: header.map((h) => h.trim()), rows };
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Pair each row against the header.
 *
 * Short rows are padded rather than rejected: trailing empty cells are
 * routinely dropped by spreadsheet exporters, and a missing optional column
 * is not a reason to refuse someone's roster.
 *
 * @returns {Array<Record<string, string>>}
 */
export function rowsToObjects(header, rows) {
  return rows.map((row) => {
    const obj = {};
    header.forEach((key, index) => {
      obj[key] = (row[index] ?? '').trim();
    });
    return obj;
  });
}

/** parseCsv + rowsToObjects in one step. */
export function parseCsvToObjects(text) {
  const { header, rows } = parseCsv(text);
  return { header, records: rowsToObjects(header, rows) };
}

/**
 * Serialise rows to CSV. Quotes only where needed, so the output stays
 * readable in a text editor.
 *
 * @param {string[]} header
 * @param {Array<Array<string|number|boolean|null|undefined>>} rows
 */
export function toCsv(header, rows) {
  const lines = [header.map(escapeCell).join(',')];
  for (const row of rows) lines.push(row.map(escapeCell).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/** Serialise objects to CSV using `header` for both order and key lookup. */
export function objectsToCsv(header, records) {
  return toCsv(header, records.map((r) => header.map((key) => r[key])));
}

function escapeCell(value) {
  if (value == null) return '';
  const str = typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);
  // A leading/trailing space survives only inside quotes, and a cell that
  // starts with one is almost always an accident worth preserving verbatim.
  return /[",\r\n]|^\s|\s$/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/* ------------------------------------------------------------------ *
 * Cell codecs
 * ------------------------------------------------------------------ */

/** "algebra; geometry" -> ["algebra", "geometry"]. Empty cell -> []. */
export function parseList(cell) {
  return String(cell ?? '')
    .split(LIST_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** ["algebra", "geometry"] -> "algebra; geometry". */
export function formatList(list) {
  return (list ?? []).join(`${LIST_SEPARATOR} `);
}

/**
 * Spreadsheet booleans. Accepts what a human or an exporter actually writes.
 * Anything unrecognised returns `fallback` rather than silently reading false.
 */
export function parseBoolean(cell, fallback = null) {
  const value = String(cell ?? '').trim().toLowerCase();
  if (value === '') return fallback;
  if (['yes', 'y', 'true', '1', 'active', '是'].includes(value)) return true;
  if (['no', 'n', 'false', '0', 'inactive', '否'].includes(value)) return false;
  return fallback;
}

/** A number, or `fallback` if the cell is blank or not numeric. */
export function parseNumber(cell, fallback = null) {
  const value = String(cell ?? '').trim();
  if (value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}
