import { test, expect } from '@playwright/test';
import { PRODUCT_TEMPLATE_CSV, mapProductRows, parseCsv, parsePrice, parseProductCsv, toBulkRows } from '../src/lib/csv';

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

test.describe('product import mapping', () => {
  test('the template parses cleanly with every column mapped', () => {
    const r = parseProductCsv(PRODUCT_TEMPLATE_CSV);
    expect(r.problems).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({ row: 1, reference: '13280', name: 'Pneumatic cylinder 32mm', make: 'Festo', brand: 'MAC', unit: 'each', price: 4250, category: 'Cylinders', description: 'Double acting' });
    expect(r.rows[1]).toMatchObject({ row: 2, reference: '20415', name: 'Vacuum cup, 40mm', description: 'Flat cup, NBR', price: 1180.5 });
    expect(Object.keys(r.mapped).sort()).toEqual(['brand', 'category', 'description', 'make', 'name', 'price', 'reference', 'unit']);
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
