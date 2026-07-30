import { describe, it, equal, ok, deepEqual, throws } from './runner.js';
import {
  parseCsv,
  rowsToObjects,
  parseCsvToObjects,
  toCsv,
  objectsToCsv,
  parseList,
  formatList,
  parseBoolean,
  parseNumber
} from '../js/csv.js';

describe('parseCsv', () => {
  it('parses a plain file', () => {
    const { header, rows } = parseCsv('name,grade\nAvery,11\nBlake,12\n');
    deepEqual(header, ['name', 'grade']);
    deepEqual(rows, [['Avery', '11'], ['Blake', '12']]);
  });

  it('handles CRLF line endings', () => {
    const { rows } = parseCsv('a,b\r\n1,2\r\n');
    deepEqual(rows, [['1', '2']]);
  });

  it('strips a UTF-8 BOM, which is what Excel writes', () => {
    const { header } = parseCsv('﻿name,grade\nAvery,11\n');
    deepEqual(header, ['name', 'grade']);
  });

  it('keeps commas inside quoted fields', () => {
    const { rows } = parseCsv('name,bio\nAvery,"Likes maths, chess, and naps"\n');
    deepEqual(rows, [['Avery', 'Likes maths, chess, and naps']]);
  });

  it('unescapes doubled quotes', () => {
    const { rows } = parseCsv('name,bio\nAvery,"She said ""hello"" first"\n');
    deepEqual(rows, [['Avery', 'She said "hello" first']]);
  });

  it('keeps newlines inside quoted fields', () => {
    const { rows } = parseCsv('name,bio\nAvery,"line one\nline two"\n');
    equal(rows.length, 1);
    equal(rows[0][1], 'line one\nline two');
  });

  it('handles an empty trailing field', () => {
    const { rows } = parseCsv('a,b,c\n1,,3\n');
    deepEqual(rows, [['1', '', '3']]);
  });

  it('does not invent a row from a trailing newline', () => {
    equal(parseCsv('a,b\n1,2\n').rows.length, 1);
    equal(parseCsv('a,b\n1,2').rows.length, 1);
  });

  it('skips blank lines', () => {
    const { rows } = parseCsv('a,b\n1,2\n\n3,4\n');
    deepEqual(rows, [['1', '2'], ['3', '4']]);
  });

  it('returns empty for empty input rather than throwing', () => {
    deepEqual(parseCsv('').header, []);
    deepEqual(parseCsv('   ').rows, []);
  });

  it('refuses an unterminated quoted field, naming the line', () => {
    let message = '';
    try {
      parseCsv('a,b\n1,"never closed\n');
    } catch (err) {
      message = err.message;
    }
    ok(message.includes('Unterminated'), message);
    ok(/line \d/.test(message), `expected a line number in: ${message}`);
  });

  it('treats a mid-field quote as literal rather than guessing', () => {
    const { rows } = parseCsv('a\n12"34\n');
    deepEqual(rows, [['12"34']]);
  });
});

describe('rowsToObjects', () => {
  it('pairs cells to the header and trims', () => {
    const { header, rows } = parseCsv('name, grade \nAvery , 11 \n');
    deepEqual(rowsToObjects(header, rows), [{ name: 'Avery', grade: '11' }]);
  });

  it('pads short rows instead of rejecting them', () => {
    // Spreadsheet exporters routinely drop trailing empty cells.
    const records = rowsToObjects(['a', 'b', 'c'], [['1']]);
    deepEqual(records, [{ a: '1', b: '', c: '' }]);
  });

  it('parseCsvToObjects does both steps', () => {
    const { records } = parseCsvToObjects('a,b\n1,2\n');
    deepEqual(records, [{ a: '1', b: '2' }]);
  });
});

describe('toCsv', () => {
  it('quotes only what needs quoting', () => {
    const text = toCsv(['a', 'b'], [['plain', 'has,comma']]);
    ok(text.includes('plain,'), text);
    ok(text.includes('"has,comma"'), text);
  });

  it('escapes embedded quotes', () => {
    ok(toCsv(['a'], [['say "hi"']]).includes('"say ""hi"""'));
  });

  it('quotes cells with leading or trailing spaces', () => {
    ok(toCsv(['a'], [[' padded ']]).includes('" padded "'));
  });

  it('writes booleans as yes/no', () => {
    ok(toCsv(['a'], [[true]]).includes('yes'));
    ok(toCsv(['a'], [[false]]).includes('no'));
  });

  it('writes null and undefined as empty cells', () => {
    equal(toCsv(['a', 'b'], [[null, undefined]]).trim(), 'a,b\r\n,');
  });

  it('round-trips anything it writes', () => {
    const header = ['name', 'bio', 'active'];
    const rows = [
      ['Avery Alpha', 'Likes maths, chess, and "naps"', 'yes'],
      ['Blake Beta', 'line one\nline two', 'no'],
      ['Corin Gamma', '', 'yes'],
      ['Devon Delta', ' padded ', 'yes']
    ];
    const { header: h2, rows: r2 } = parseCsv(toCsv(header, rows));
    deepEqual(h2, header);
    deepEqual(r2, rows);
  });

  it('objectsToCsv uses the header for order', () => {
    const text = objectsToCsv(['b', 'a'], [{ a: 1, b: 2 }]);
    equal(text.split('\r\n')[0], 'b,a');
    equal(text.split('\r\n')[1], '2,1');
  });
});

describe('cell codecs', () => {
  it('parses and formats lists', () => {
    deepEqual(parseList('algebra; geometry'), ['algebra', 'geometry']);
    deepEqual(parseList('algebra;geometry'), ['algebra', 'geometry']);
    deepEqual(parseList(''), []);
    deepEqual(parseList(null), []);
    deepEqual(parseList('  a ;; b  '), ['a', 'b']);
    equal(formatList(['algebra', 'geometry']), 'algebra; geometry');
    equal(formatList([]), '');
    equal(formatList(undefined), '');
  });

  it('round-trips a list', () => {
    const list = ['english reading', 'sat vocabulary'];
    deepEqual(parseList(formatList(list)), list);
  });

  it('reads the booleans humans and exporters actually write', () => {
    for (const yes of ['yes', 'Yes', 'Y', 'true', 'TRUE', '1', 'active', '是']) {
      equal(parseBoolean(yes), true, `expected ${yes} -> true`);
    }
    for (const no of ['no', 'N', 'false', '0', 'inactive', '否']) {
      equal(parseBoolean(no), false, `expected ${no} -> false`);
    }
  });

  it('falls back rather than reading an unknown value as false', () => {
    // Reading "maybe" as false would silently deactivate a volunteer.
    equal(parseBoolean('maybe', true), true);
    equal(parseBoolean('', true), true);
    equal(parseBoolean(null, true), true);
    equal(parseBoolean('maybe'), null);
  });

  it('parses numbers and falls back on junk', () => {
    equal(parseNumber('11'), 11);
    equal(parseNumber(' 2.5 '), 2.5);
    equal(parseNumber('', 7), 7);
    equal(parseNumber('eleven', 7), 7);
    equal(parseNumber('Infinity', 7), 7);
    equal(parseNumber('0'), 0);
  });
});
