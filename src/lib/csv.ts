// A small, dependency-free CSV reader and the product-import mapping built on it. Pure: no DOM, no API calls.

/**
 * Parse CSV text into rows of cells. Handles a leading BOM, CRLF / LF / lone CR line breaks, quoted cells with commas
 * and line breaks inside, and "" as an escaped quote. A semicolon- or tab-separated sheet is detected from the header
 * line (spreadsheets in some locales save that way). Blank lines are dropped; cells are not trimmed here.
 */
export function parseCsv(text: string): string[][] {
  let s = String(text ?? '');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const delim = detectDelimiter(s);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let cellStarted = false; // a quote (even an empty "") makes an empty cell count as a real value
  const endCell = () => { row.push(cell); cell = ''; cellStarted = false; };
  const endRow = () => {
    endCell();
    if (row.length > 1 || row[0].trim() !== '' ) rows.push(row);
    row = [];
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && !cell.trim()) { quoted = true; cell = ''; cellStarted = true; continue; }
    if (c === delim) { endCell(); continue; }
    if (c === '\r') { if (s[i + 1] === '\n') i++; endRow(); continue; }
    if (c === '\n') { endRow(); continue; }
    cell += c;
  }
  if (cell !== '' || cellStarted || row.length > 0) endRow();
  return rows;
}

/** Comma unless the first line (outside quotes) clearly uses a tab or a semicolon instead. */
function detectDelimiter(s: string): string {
  let quoted = false;
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (c === '\n' || c === '\r') break;
    if (c in counts) counts[c]++;
  }
  if (counts['\t'] > counts[','] && counts['\t'] >= counts[';']) return '\t';
  if (counts[';'] > counts[',']) return ';';
  return ',';
}

// ── Product import ──────────────────────────────────────────────────────────

export const PRODUCT_IMPORT_MAX_ROWS = 2000;

export type ProductImportField = 'reference' | 'name' | 'make' | 'brand' | 'unit' | 'price' | 'category' | 'description';

/** Accepted header names (compared lower-case, with spaces / underscores / hyphens collapsed to one space). */
export const PRODUCT_HEADER_ALIASES: Record<ProductImportField, string[]> = {
  reference: ['reference', 'ref', 'sku', 'product reference', 'reference number', 'ref no', 'ref number', 'part number', 'part no'],
  name: ['name', 'product name', 'product', 'description of goods'],
  make: ['make', 'manufacturer'],
  brand: ['brand'],
  unit: ['unit', 'uom'],
  price: ['price', 'rate', 'unit price'],
  category: ['category'],
  description: ['description', 'desc', 'details'],
};

const normHeader = (h: string) => h.replace(/^﻿/, '').trim().toLowerCase().replace(/[_\-\s]+/g, ' ');

export interface ProductImportRow {
  /** 1-based product row number, not counting the header line (the first product is row 1). The server numbers its error rows the same way. */
  row: number;
  reference: string; name: string; make?: string; brand?: string; unit?: string; price?: number; category?: string; description?: string;
}

export interface ProductImportParse {
  rows: ProductImportRow[];
  /** Problems that stop the import (a required column is missing, nothing to import). */
  problems: string[];
  /** Non-blocking notes: ignored columns, rows with a price that is not a number. */
  warnings: string[];
  /** Which file column feeds each field (header text as written), for display. */
  mapped: Partial<Record<ProductImportField, string>>;
  ignoredColumns: string[];
  /** Data rows read, including the ones left out for being empty of a reference and a name. */
  totalRows: number;
}

/** A price like "1,250.50", "₹ 1250", "Rs. 99" or "(10)" to a number; null when it is not a number. */
export function parsePrice(raw: string): number | null {
  // Drop a currency prefix / suffix ("₹", "Rs.", "INR", "/-") and thousands separators, then require a plain number.
  const t = raw.trim().replace(/^(?:[^\d.\-]|\.(?!\d))+/, '').replace(/[^\d]+$/, '').replace(/[,\s]/g, '');
  if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Map a parsed sheet (header row first) onto product rows, resolving header aliases. */
export function mapProductRows(table: string[][]): ProductImportParse {
  const out: ProductImportParse = { rows: [], problems: [], warnings: [], mapped: {}, ignoredColumns: [], totalRows: 0 };
  if (table.length === 0) { out.problems.push('The file is empty.'); return out; }
  const header = table[0];
  const colOf: Partial<Record<ProductImportField, number>> = {};
  const aliasToField = new Map<string, ProductImportField>();
  (Object.keys(PRODUCT_HEADER_ALIASES) as ProductImportField[]).forEach((f) => PRODUCT_HEADER_ALIASES[f].forEach((a) => aliasToField.set(a, f)));
  header.forEach((h, i) => {
    const label = h.replace(/^﻿/, '').trim();
    if (!label) return;
    const f = aliasToField.get(normHeader(label));
    if (f && colOf[f] === undefined) { colOf[f] = i; out.mapped[f] = label; }
    else out.ignoredColumns.push(label);
  });
  if (colOf.reference === undefined) out.problems.push('No "Reference" column found. Add a column named Reference (or Ref, SKU or Product reference).');
  if (colOf.name === undefined) out.problems.push('No "Name" column found. Add a column named Name (or Product name).');
  if (out.ignoredColumns.length) out.warnings.push(`Ignored columns: ${out.ignoredColumns.join(', ')}.`);
  const cell = (r: string[], f: ProductImportField): string => (colOf[f] === undefined ? '' : (r[colOf[f] as number] ?? '').trim());

  const body = table.slice(1);
  out.totalRows = body.length;
  if (out.problems.length) return out;
  body.forEach((r, i) => {
    const reference = cell(r, 'reference');
    const name = cell(r, 'name');
    const row = i + 1;
    const priceRaw = cell(r, 'price');
    const price = priceRaw ? parsePrice(priceRaw) : null;
    if (priceRaw && price === null) out.warnings.push(`Row ${row}: "${priceRaw}" is not a number, so the price is left out.`);
    const item: ProductImportRow = { row, reference, name };
    (['make', 'brand', 'unit', 'category', 'description'] as const).forEach((f) => { const v = cell(r, f); if (v) item[f] = v; });
    if (price !== null) item.price = price;
    out.rows.push(item);
  });
  if (out.rows.length === 0) out.problems.push('The file has a header but no product rows.');
  return out;
}

/** Parse CSV text straight into product rows. */
export function parseProductCsv(text: string): ProductImportParse {
  return mapProductRows(parseCsv(text));
}

/** The request body rows (without the local row number). */
export function toBulkRows(rows: ProductImportRow[]) {
  return rows.map(({ row: _row, ...rest }) => rest);
}

export const PRODUCT_TEMPLATE_CSV =
  'Reference,Name,Make,Brand,Unit,Price,Category,Description\r\n'
  + '13280,Pneumatic cylinder 32mm,Festo,MAC,each,4250,Cylinders,Double acting\r\n'
  + '20415,"Vacuum cup, 40mm",Piab,PIAB,each,1180.50,Vacuum,"Flat cup, NBR"\r\n';
