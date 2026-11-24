import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PRODUCT_TEMPLATE_CSV, buildProductTemplateCsv, mapProductRows, parseCsv, parsePercent, parsePrice,
  parseProductCsv, suggestProductColumns, toBulkRows, toFieldKey, type ProductCustomColumn,
} from '../src/lib/csv';

/** Pure tests for the small CSV reader and the product-import mapping (no browser, no API). */

test.describe('parseCsv', () => {
  test('plain rows, LF and CRLF and a lone CR', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\r1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  test('quoted cells keep commas, line breaks and escaped quotes', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
    expect(parseCsv('a,b\n"line1\nline2",z')).toEqual([['a', 'b'], ['line1\nline2', 'z']]);
    expect(parseCsv('a,b\r\n"line1\r\nline2",z\r\n')).toEqual([['a', 'b'], ['line1\r\nline2', 'z']]);
  });

  test('a leading BOM is dropped', () => {
    expect(parseCsv('﻿reference,name\n1,x')[0]).toEqual(['reference', 'name']);
  });

  test('blank lines are skipped but empty cells are kept', () => {
    expect(parseCsv('a,b,c\n\n1,,3\n\n')).toEqual([['a', 'b', 'c'], ['1', '', '3']]);
    expect(parseCsv('a,b\n,\n1,2')).toEqual([['a', 'b'], ['', ''], ['1', '2']]);
    expect(parseCsv('a,b\n"",x')).toEqual([['a', 'b'], ['', 'x']]);
  });

  test('a last line with no line break still counts; empty input gives no rows', () => {
    expect(parseCsv('a\n1')).toEqual([['a'], ['1']]);
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\n\n')).toEqual([]);
  });

  test('semicolon and tab separated sheets are detected from the header line', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
    // A comma inside quotes on the header does not make it comma separated.
    expect(parseCsv('"a,x";b\n1;2')).toEqual([['a,x', 'b'], ['1', '2']]);
  });
});

test.describe('parsePrice', () => {
  test('numbers with currency marks and thousands separators', () => {
    expect(parsePrice('1250')).toBe(1250);
    expect(parsePrice('1,250.50')).toBe(1250.5);
    expect(parsePrice('₹ 4,250')).toBe(4250);
    expect(parsePrice('Rs. 99')).toBe(99);
    expect(parsePrice(' 0 ')).toBe(0);
  });
  test('not a number gives null', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('abc')).toBeNull();
    expect(parsePrice('-')).toBeNull();
  });
});

test.describe('parsePercent', () => {
  test('a plain or %-suffixed number in range', () => {
    expect(parsePercent('18')).toBe(18);
    expect(parsePercent('18%')).toBe(18);
    expect(parsePercent(' 12.5 % ')).toBe(12.5);
    expect(parsePercent('0')).toBe(0);
    expect(parsePercent('100')).toBe(100);
  });
  test('out of range or not a number gives null', () => {
    expect(parsePercent('')).toBeNull();
    expect(parsePercent('abc')).toBeNull();
    expect(parsePercent('-5')).toBeNull();
    expect(parsePercent('101')).toBeNull();
  });
});

test.describe('product import mapping', () => {
  test('the template parses cleanly with every column mapped', () => {
    const r = parseProductCsv(PRODUCT_TEMPLATE_CSV);
    expect(r.problems).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({ row: 1, reference: '13280', name: 'Pneumatic cylinder 32mm', make: 'Festo', brand: 'MAC', unit: 'each', price: 4250, tax_rate_pct: 18, category: 'Cylinders', description: 'Double acting' });
    expect(r.rows[1]).toMatchObject({ row: 2, reference: '20415', name: 'Vacuum cup, 40mm', description: 'Flat cup, NBR', price: 1180.5, tax_rate_pct: 18 });
    expect(Object.keys(r.mapped).sort()).toEqual(['brand', 'category', 'description', 'make', 'name', 'price', 'reference', 'tax_rate_pct', 'unit']);
  });

  test('a Tax % / GST column is recognised and a bad value is dropped with a warning', () => {
    const r = parseProductCsv('Reference,Name,GST\n1,A,18\n2,B,120');
    expect(r.mapped.tax_rate_pct).toBe('GST');
    expect(r.rows[0].tax_rate_pct).toBe(18);
    expect(r.rows[1].tax_rate_pct).toBeUndefined();
    expect(r.warnings).toEqual(['Row 2: "120" is not a tax rate between 0 and 100, so it is left out.']);
  });

  test('header aliases are case-insensitive and tolerate spaces / underscores', () => {
    const cases: Array<[string, Record<string, string>]> = [
      ['Ref,Product Name,Manufacturer,Brand,Rate', { reference: 'Ref', name: 'Product Name', make: 'Manufacturer', brand: 'Brand', price: 'Rate' }],
      ['SKU,NAME,MAKE,BRAND,UNIT PRICE,CATEGORY', { reference: 'SKU', name: 'NAME', make: 'MAKE', brand: 'BRAND', price: 'UNIT PRICE', category: 'CATEGORY' }],
      ['product_reference,product-name,Price', { reference: 'product_reference', name: 'product-name', price: 'Price' }],
      ['  Product Reference ,Name', { reference: 'Product Reference', name: 'Name' }],
    ];
    for (const [header, mapped] of cases) {
      const cols = header.split(',').length;
      const r = parseProductCsv(`${header}\n${Array.from({ length: cols }, (_, i) => `v${i}`).join(',')}`);
      expect(r.problems, header).toEqual([]);
      expect(r.mapped, header).toEqual(mapped);
    }
  });

  test('a BOM on the first header does not hide the Reference column', () => {
    const r = parseProductCsv('﻿Reference,Name\n13280,Cylinder');
    expect(r.problems).toEqual([]);
    expect(r.rows[0]).toMatchObject({ reference: '13280', name: 'Cylinder' });
  });

  test('missing Reference or Name column is a problem and no rows are returned', () => {
    const noRef = parseProductCsv('Name,Make\nCylinder,Festo');
    expect(noRef.problems.join(' ')).toContain('No "Reference" column');
    expect(noRef.rows).toEqual([]);
    const noName = parseProductCsv('Reference,Make\n1,Festo');
    expect(noName.problems.join(' ')).toContain('No "Name" column');
    const both = parseProductCsv('Foo,Bar\n1,2');
    expect(both.problems).toHaveLength(2);
  });

  test('unknown columns are ignored with a note; the first of a repeated alias wins', () => {
    const r = parseProductCsv('Reference,Name,Colour,Ref\n1,Cyl,Red,999');
    expect(r.ignoredColumns).toEqual(['Colour', 'Ref']);
    expect(r.warnings[0]).toContain('Colour, Ref');
    expect(r.rows[0].reference).toBe('1');
  });

  test('references keep leading zeros and are trimmed; empty optional cells are left out', () => {
    const r = parseProductCsv('Reference,Name,Make,Price\n 00123 , Cyl ,,');
    expect(r.rows[0]).toEqual({ row: 1, reference: '00123', name: 'Cyl' });
    expect(toBulkRows(r.rows)).toEqual([{ reference: '00123', name: 'Cyl' }]);
  });

  test('a price that is not a number is dropped with a warning naming the row', () => {
    const r = parseProductCsv('Reference,Name,Price\n1,A,ten\n2,B,"1,200"');
    expect(r.rows[0].price).toBeUndefined();
    expect(r.rows[1].price).toBe(1200);
    expect(r.warnings).toEqual(['Row 1: "ten" is not a number, so the price is left out.']);
  });

  test('empty file, header only, and a short row are handled', () => {
    expect(parseProductCsv('').problems).toEqual(['The file is empty.']);
    expect(parseProductCsv('Reference,Name').problems).toEqual(['The file has a header but no product rows.']);
    const r = parseProductCsv('Reference,Name,Make\n1');
    expect(r.rows[0]).toEqual({ row: 1, reference: '1', name: '' });
  });

  test('mapProductRows works on an already parsed table and counts every data row', () => {
    const r = mapProductRows([['ref', 'name'], ['1', 'a'], ['2', 'b'], ['', '']]);
    expect(r.totalRows).toBe(3);
    expect(r.rows.map((x) => x.row)).toEqual([1, 2, 3]);
  });

  test('a file of 2,001 rows parses all of them (the limit is enforced by the modal)', () => {
    const lines = ['Reference,Name'];
    for (let i = 1; i <= 2001; i++) lines.push(`${i},Item ${i}`);
    expect(parseProductCsv(lines.join('\r\n')).rows).toHaveLength(2001);
  });
});

/**
 * The client's OWN product columns (crm_custom_field_defs, entity_type 'product'). The import and the
 * template are driven by this list, so adding a column in Settings -> Custom Fields needs no code change.
 */
test.describe('product import: the client\'s own columns', () => {
  const COLS: ProductCustomColumn[] = [
    { field_key: 'mrp', label: 'MRP', field_type: 'currency', position: 1 },
    { field_key: 'dp_with_gst', label: 'DP With GST', field_type: 'currency', position: 2 },
    { field_key: 'is_imported', label: 'Imported item', field_type: 'boolean', position: 3 },
    { field_key: 'fitments', label: 'Fitments', field_type: 'multiselect', options: ['Rifle', 'Tripod'], position: 4 },
    { field_key: 'launch_on', label: 'Launch date', field_type: 'date', position: 5 },
    { field_key: 'grade', label: 'Grade', field_type: 'select', options: ['A', 'B'], required: true, position: 6 },
  ];

  test('a column is matched by its label or by its field_key, and typed by its definition', () => {
    const csv = 'Reference,Name,MRP,dp_with_gst,Imported item,Fitments,Launch date,Grade\n'
      + '1,Binocular,"4,300.00",2950,yes,Rifle; Tripod,20/04/2026,A';
    const r = parseProductCsv(csv, COLS);
    expect(r.problems).toEqual([]);
    expect(r.ignoredColumns).toEqual([]);
    expect(r.customColumns).toEqual({
      mrp: 'MRP', dp_with_gst: 'dp_with_gst', is_imported: 'Imported item',
      fitments: 'Fitments', launch_on: 'Launch date', grade: 'Grade',
    });
    expect(r.rows[0].custom_fields).toEqual({
      mrp: 4300, dp_with_gst: 2950, is_imported: true,
      fitments: ['Rifle', 'Tripod'], launch_on: '2026-04-20', grade: 'A',
    });
    // custom_fields rides along in the request body.
    expect(toBulkRows(r.rows)[0].custom_fields).toEqual(r.rows[0].custom_fields);
  });

  test('a bad value in a typed column is dropped with a note naming the row and column; the row still imports', () => {
    const r = parseProductCsv('Reference,Name,MRP,Imported item,Launch date\n1,Cyl,n/a,maybe,someday', COLS);
    expect(r.problems).toEqual([]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].custom_fields).toBeUndefined();
    expect(r.warnings).toEqual([
      'Row 1, MRP: "n/a" is not a number, so it is left out.',
      'Row 1, Imported item: "maybe" is not a yes / no value, so it is left out.',
      'Row 1, Launch date: "someday" is not a date (use 2026-04-20), so it is left out.',
    ]);
  });

  test('a built-in column always wins over a custom column with the same label', () => {
    const clash: ProductCustomColumn[] = [{ field_key: 'their_price', label: 'Price', field_type: 'currency' }];
    const r = parseProductCsv('Reference,Name,Price\n1,Cyl,99', clash);
    expect(r.mapped.price).toBe('Price');
    expect(r.rows[0].price).toBe(99);
    expect(r.rows[0].custom_fields).toBeUndefined();
  });

  test('a header that matches nothing is still reported as ignored', () => {
    const r = parseProductCsv('Reference,Name,MRP,Colour\n1,Cyl,100,Red', COLS);
    expect(r.ignoredColumns).toEqual(['Colour']);
    expect(r.rows[0].custom_fields).toEqual({ mrp: 100 });
  });

  test('no column list = the old behaviour: the same headers read as ignored', () => {
    const r = parseProductCsv('Reference,Name,MRP\n1,Cyl,100');
    expect(r.ignoredColumns).toEqual(['MRP']);
    expect(r.rows[0].custom_fields).toBeUndefined();
    expect(r.customColumns).toEqual({});
  });

  test('the template carries the client\'s columns, marks required ones, and re-parses with everything mapped', () => {
    const csv = buildProductTemplateCsv(COLS);
    const header = csv.split('\r\n')[0];
    expect(header).toBe('Reference,Name,Make,Brand,Unit,Price,Tax %,Category,Description,MRP,DP With GST,Imported item,Fitments,Launch date,Grade *');
    const r = parseProductCsv(csv, COLS);
    expect(r.problems).toEqual([]);
    // "Grade *" still resolves to the Grade column — the marker is not part of the name.
    expect(Object.keys(r.customColumns).sort()).toEqual(['dp_with_gst', 'fitments', 'grade', 'is_imported', 'launch_on', 'mrp']);
    expect(r.ignoredColumns).toEqual([]);
    expect(r.rows).toHaveLength(2);
  });

  test('a computed or hidden column is never asked for in the template and is not accepted from a file', () => {
    const cols: ProductCustomColumn[] = [
      { field_key: 'margin', label: 'Margin', field_type: 'formula', position: 1 },
      { field_key: 'old_code', label: 'Old code', field_type: 'text', hidden: true, position: 2 },
      { field_key: 'mrp', label: 'MRP', field_type: 'currency', position: 3 },
    ];
    expect(buildProductTemplateCsv(cols).split('\r\n')[0]).toBe('Reference,Name,Make,Brand,Unit,Price,Tax %,Category,Description,MRP');
    const r = parseProductCsv('Reference,Name,Margin,Old code,MRP\n1,Cyl,50,X1,100', cols);
    expect(r.ignoredColumns).toEqual(['Margin', 'Old code']);
    expect(r.rows[0].custom_fields).toEqual({ mrp: 100 });
  });

  test('the built-in-only template is unchanged for a client with no columns of its own', () => {
    expect(PRODUCT_TEMPLATE_CSV).toBe(buildProductTemplateCsv([]));
    expect(PRODUCT_TEMPLATE_CSV.split('\r\n')[0]).toBe('Reference,Name,Make,Brand,Unit,Price,Tax %,Category,Description');
  });

  test('mapProductRows takes the column list on an already parsed table', () => {
    const r = mapProductRows([['Reference', 'Name', 'MRP'], ['1', 'a', '10']], COLS);
    expect(r.rows[0].custom_fields).toEqual({ mrp: 10 });
  });
});

/** Turning a header the client has not defined yet into one of its own columns. */
test.describe('product import: suggesting a new column', () => {
  test('a header becomes a legal field_key', () => {
    expect(toFieldKey('DP With GST')).toBe('dp_with_gst');
    expect(toFieldKey('MRP')).toBe('mrp');
    expect(toFieldKey('Margin %')).toBe('margin_pct');
    expect(toFieldKey('  Lead time (days) ')).toBe('lead_time_days');
    expect(toFieldKey('Grade *')).toBe('grade');
    expect(toFieldKey('2026 price')).toBe('f_2026_price');
    expect(toFieldKey('!!!')).toBe('');
  });

  test('the type is guessed from the column\'s own values', () => {
    const csv = 'Reference,Name,MRP,Qty,Imported,Launch,Notes\n'
      + '1,A,"1,699.00",5,yes,2026-04-20,blue\n'
      + '2,B,"2,199.00",7,no,20/05/2026,red';
    const sug = suggestProductColumns(csv);
    expect(sug.map((s) => [s.header, s.field_key, s.field_type])).toEqual([
      ['MRP', 'mrp', 'currency'],
      ['Qty', 'qty', 'number'],
      ['Imported', 'imported', 'boolean'],
      ['Launch', 'launch', 'date'],
      ['Notes', 'notes', 'text'],
    ]);
    expect(sug[0].samples).toEqual(['1,699.00', '2,199.00']);
  });

  test('a column the client already has is not suggested again — by label or by field_key', () => {
    const byLabel: ProductCustomColumn[] = [{ field_key: 'mrp', label: 'MRP', field_type: 'currency' }];
    expect(suggestProductColumns('Reference,Name,MRP\n1,A,10', byLabel)).toEqual([]);
    // The header matches the field_key even though the label reads differently, so it maps rather
    // than being offered as new (field_key matching is deliberate: a sheet can use either name).
    const byKey: ProductCustomColumn[] = [{ field_key: 'mrp', label: 'List price', field_type: 'currency' }];
    expect(suggestProductColumns('Reference,Name,MRP\n1,A,10', byKey)).toEqual([]);
  });

  test('a derived key that is already taken gets a numbered suffix', () => {
    // "Margin %" derives margin_pct, which this column holds under an unrelated label, so the header
    // matches nothing and is offered as new — but it cannot reuse the key.
    const taken: ProductCustomColumn[] = [{ field_key: 'margin_pct', label: 'Markup', field_type: 'number' }];
    const sug = suggestProductColumns('Reference,Name,Margin %\n1,A,12', taken);
    expect(sug).toHaveLength(1);
    expect(sug[0].header).toBe('Margin %');
    expect(sug[0].field_key).toBe('margin_pct_2');
  });

  test('built-in columns are never suggested', () => {
    expect(suggestProductColumns('Reference,Name,Price,Tax %,Category\n1,A,10,18,X')).toEqual([]);
  });
});

/**
 * The real Vanrakshak dealer price list (68 rows transcribed from "Final Binocular MRP Vanrakshak"),
 * imported with the two columns that sheet needs beyond the built-ins.
 */
test.describe('product import: the Vanrakshak dealer price list', () => {
  const csv = readFileSync(join(__dirname, 'fixtures/vanrakshak-dealer-price-list.csv'), 'utf8');
  const COLS: ProductCustomColumn[] = [
    { field_key: 'mrp', label: 'MRP', field_type: 'currency', position: 1 },
    { field_key: 'dp_with_gst', label: 'DP With GST', field_type: 'currency', position: 2 },
  ];

  test('every row maps, with no ignored column and no warning', () => {
    const r = parseProductCsv(csv, COLS);
    expect(r.problems).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ignoredColumns).toEqual([]);
    expect(r.rows).toHaveLength(68);
    expect(r.customColumns).toEqual({ mrp: 'MRP', dp_with_gst: 'DP With GST' });
    // Reference and Name are present on every row, so nothing is reported as an error row.
    expect(r.rows.filter((row) => !row.reference || !row.name)).toEqual([]);
    // References are unique, so no row supersedes another.
    expect(new Set(r.rows.map((row) => row.reference.toLowerCase())).size).toBe(68);
  });

  test('prices, tax and the two own columns land as numbers', () => {
    const r = parseProductCsv(csv, COLS);
    const first = r.rows[0];
    expect(first.reference).toBe('FL-ZH01');
    expect(first.price).toBe(800);
    expect(first.tax_rate_pct).toBe(18);
    expect(first.custom_fields).toEqual({ mrp: 1699, dp_with_gst: 944 });
    // Every row is 18% GST and carries a DP; MRP is absent only where the PDF does not print one.
    expect(r.rows.every((row) => row.tax_rate_pct === 18)).toBe(true);
    expect(r.rows.every((row) => typeof row.price === 'number' && (row.price as number) > 0)).toBe(true);
    expect(r.rows.filter((row) => (row.custom_fields?.mrp ?? null) === null).map((row) => row.reference))
      .toEqual(['VNK-DRONE-RAPTOR-10T', 'KHU73']);
  });

  test('without the two columns defined, the sheet still imports and both are offered as new columns', () => {
    const r = parseProductCsv(csv);
    expect(r.rows).toHaveLength(68);
    expect(r.ignoredColumns).toEqual(['MRP', 'DP With GST']);
    expect(suggestProductColumns(csv).map((s) => [s.header, s.field_key, s.field_type])).toEqual([
      ['MRP', 'mrp', 'currency'],
      ['DP With GST', 'dp_with_gst', 'currency'],
    ]);
  });
});
