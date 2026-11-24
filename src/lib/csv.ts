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

export type ProductImportField = 'reference' | 'name' | 'make' | 'brand' | 'unit' | 'price' | 'category' | 'description' | 'tax_rate_pct';

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
  tax_rate_pct: ['tax', 'tax %', 'tax rate', 'tax rate %', 'gst', 'gst %', 'tax_rate_pct'],
};

const normHeader = (h: string) => h.replace(/^﻿/, '').trim().toLowerCase().replace(/[_\-\s]+/g, ' ');

/**
 * Header text for matching one of the client's own columns. `buildProductTemplateCsv` writes a required
 * column as "Label *", so the trailing marker is dropped here — otherwise the template you just downloaded
 * would come back with its required column reported as ignored. A label that really ends in "*" is still
 * reachable by its field_key.
 */
const normCustomHeader = (h: string) => normHeader(h.replace(/\s*\*+\s*$/, ''));

export interface ProductImportRow {
  /** 1-based product row number, not counting the header line (the first product is row 1). The server numbers its error rows the same way. */
  row: number;
  reference: string; name: string; make?: string; brand?: string; unit?: string; price?: number; category?: string; description?: string;
  tax_rate_pct?: number;
  /** The client's OWN columns, keyed by field_key. Absent when the sheet carries none. */
  custom_fields?: Record<string, unknown>;
}

/**
 * One of the client's own product columns — a crm_custom_field_defs row with entity_type 'product',
 * narrowed to what the import and the template need. Pass the client's list to `parseProductCsv` /
 * `buildProductTemplateCsv` and both the accepted headers and the downloadable template follow it, so
 * adding a column in Settings → Custom Fields updates the template with no code change.
 */
export interface ProductCustomColumn {
  field_key: string;
  label: string;
  field_type: string;
  options?: string[] | null;
  required?: boolean;
  hidden?: boolean;
  position?: number;
}

/** The built-in template columns, in the order the template writes them. */
export const PRODUCT_BUILTIN_COLUMNS: Array<{ field: ProductImportField; label: string }> = [
  { field: 'reference', label: 'Reference' },
  { field: 'name', label: 'Name' },
  { field: 'make', label: 'Make' },
  { field: 'brand', label: 'Brand' },
  { field: 'unit', label: 'Unit' },
  { field: 'price', label: 'Price' },
  { field: 'tax_rate_pct', label: 'Tax %' },
  { field: 'category', label: 'Category' },
  { field: 'description', label: 'Description' },
];

// A formula column is computed server-side from the other columns, so it is never asked for in the
// template and a value for it in the file is ignored. Hidden columns are left out the same way.
const importableCustom = (cols: ProductCustomColumn[]): ProductCustomColumn[] =>
  cols.filter((c) => c.field_type !== 'formula' && c.hidden !== true && !!c.field_key && !!c.label)
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

/** A number cell for a `number` / `currency` column. Reuses the money-tolerant reader. */
function parseNumberCell(raw: string): number | null {
  return parsePrice(raw);
}

/** `yes` / `true` / `1` / `y` / `on` → true, and the negatives → false. Anything else is not a boolean. */
function parseBooleanCell(raw: string): boolean | null {
  const t = raw.trim().toLowerCase();
  if (['yes', 'true', '1', 'y', 'on'].includes(t)) return true;
  if (['no', 'false', '0', 'n', 'off'].includes(t)) return false;
  return null;
}

/** `2026-04-20`, `20/04/2026` or `20-04-2026` → an ISO date; null when it is not a date. */
function parseDateCell(raw: string): string | null {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return Number.isNaN(Date.parse(t)) ? null : t;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (!m) return null;
  const [, d, mo, y] = m;
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/**
 * One cell for one of the client's own columns, typed by its definition. `error` is a note for the
 * row (the value is then left out); the server validates again and reports per-row errors of its own.
 */
export function parseCustomCell(col: ProductCustomColumn, raw: string): { value?: unknown; error?: string } {
  const t = raw.trim();
  if (!t) return {};
  switch (col.field_type) {
    case 'number':
    case 'currency': {
      const n = parseNumberCell(t);
      return n === null ? { error: `"${t}" is not a number` } : { value: n };
    }
    case 'boolean': {
      const b = parseBooleanCell(t);
      return b === null ? { error: `"${t}" is not a yes / no value` } : { value: b };
    }
    case 'date':
    case 'datetime': {
      const d = parseDateCell(t);
      return d === null ? { error: `"${t}" is not a date (use 2026-04-20)` } : { value: d };
    }
    case 'multiselect': {
      // Semicolons first so a quoted cell can also use commas between values.
      const parts = (t.includes(';') ? t.split(';') : t.split(',')).map((x) => x.trim()).filter(Boolean);
      return parts.length ? { value: parts } : {};
    }
    default:
      // text / longtext / select / radio / email / phone / url / image / file / lookup / address
      return { value: t };
  }
}

export interface ProductImportParse {
  rows: ProductImportRow[];
  /** Problems that stop the import (a required column is missing, nothing to import). */
  problems: string[];
  /** Non-blocking notes: ignored columns, rows with a price that is not a number. */
  warnings: string[];
  /** Which file column feeds each field (header text as written), for display. */
  mapped: Partial<Record<ProductImportField, string>>;
  /** Which file column feeds each of the client's own columns: field_key -> header text as written. */
  customColumns: Record<string, string>;
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

/** A tax-rate cell like "18", "18%", "18.5 %" to a 0-100 number; null when it is not a number in range. */
export function parsePercent(raw: string): number | null {
  const t = raw.trim().replace(/%$/, '').replace(/\s/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/**
 * Map a parsed sheet (header row first) onto product rows, resolving header aliases.
 *
 * `custom` is the client's own product columns. A header that is not a built-in alias is matched
 * against each column's label or field_key (case / spacing insensitive) and its value lands in
 * `row.custom_fields[field_key]`; only a header that matches neither is reported as ignored.
 */
export function mapProductRows(table: string[][], custom: ProductCustomColumn[] = []): ProductImportParse {
  const out: ProductImportParse = { rows: [], problems: [], warnings: [], mapped: {}, ignoredColumns: [], customColumns: {}, totalRows: 0 };
  if (table.length === 0) { out.problems.push('The file is empty.'); return out; }
  const header = table[0];
  const colOf: Partial<Record<ProductImportField, number>> = {};
  const aliasToField = new Map<string, ProductImportField>();
  (Object.keys(PRODUCT_HEADER_ALIASES) as ProductImportField[]).forEach((f) => PRODUCT_HEADER_ALIASES[f].forEach((a) => aliasToField.set(a, f)));
  // The client's own columns, reachable by label or by field_key. Built-ins are matched first, so a
  // custom column whose label collides with one (another "Price") can never shadow it.
  const customCols = importableCustom(custom);
  const customByHeader = new Map<string, ProductCustomColumn>();
  for (const c of customCols) {
    for (const key of [c.label, c.field_key]) {
      for (const n of [normHeader(key), normCustomHeader(key)]) {
        if (n && !customByHeader.has(n)) customByHeader.set(n, c);
      }
    }
  }
  const customAt: Array<{ col: ProductCustomColumn; index: number }> = [];
  const takenCustom = new Set<string>();
  header.forEach((h, i) => {
    const label = h.replace(/^﻿/, '').trim();
    if (!label) return;
    const f = aliasToField.get(normHeader(label));
    if (f && colOf[f] === undefined) { colOf[f] = i; out.mapped[f] = label; return; }
    if (!f) {
      const c = customByHeader.get(normHeader(label)) ?? customByHeader.get(normCustomHeader(label));
      if (c && !takenCustom.has(c.field_key)) {
        takenCustom.add(c.field_key);
        customAt.push({ col: c, index: i });
        out.customColumns[c.field_key] = label;
        return;
      }
    }
    out.ignoredColumns.push(label);
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
    const taxRaw = cell(r, 'tax_rate_pct');
    const taxPct = taxRaw ? parsePercent(taxRaw) : null;
    if (taxRaw && taxPct === null) out.warnings.push(`Row ${row}: "${taxRaw}" is not a tax rate between 0 and 100, so it is left out.`);
    const item: ProductImportRow = { row, reference, name };
    (['make', 'brand', 'unit', 'category', 'description'] as const).forEach((f) => { const v = cell(r, f); if (v) item[f] = v; });
    if (price !== null) item.price = price;
    if (taxPct !== null) item.tax_rate_pct = taxPct;
    const cf: Record<string, unknown> = {};
    for (const { col, index } of customAt) {
      const parsedCell = parseCustomCell(col, (r[index] ?? '').trim());
      if (parsedCell.error) { out.warnings.push(`Row ${row}, ${col.label}: ${parsedCell.error}, so it is left out.`); continue; }
      if (parsedCell.value !== undefined) cf[col.field_key] = parsedCell.value;
    }
    if (Object.keys(cf).length) item.custom_fields = cf;
    out.rows.push(item);
  });
  if (out.rows.length === 0) out.problems.push('The file has a header but no product rows.');
  return out;
}

/** Parse CSV text straight into product rows, honouring the client's own product columns. */
export function parseProductCsv(text: string, custom: ProductCustomColumn[] = []): ProductImportParse {
  return mapProductRows(parseCsv(text), custom);
}

/** The request body rows (without the local row number). `custom_fields` rides along when the sheet had any. */
export function toBulkRows(rows: ProductImportRow[]) {
  return rows.map(({ row: _row, ...rest }) => rest);
}

/** Quote a CSV cell when it holds a comma, a quote or a line break. */
function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const csvLine = (cells: string[]): string => `${cells.map(csvCell).join(',')}\r\n`;

/** A plausible sample value for one of the client's own columns, by type. */
function sampleCustomValue(col: ProductCustomColumn): string {
  const first = (col.options ?? [])[0] ?? '';
  switch (col.field_type) {
    case 'number': return '0';
    case 'currency': return '0.00';
    case 'boolean': return 'yes';
    case 'date': return '2026-04-20';
    case 'datetime': return '2026-04-20';
    case 'select':
    case 'radio': return first;
    case 'multiselect': return (col.options ?? []).slice(0, 2).join('; ');
    default: return '';
  }
}

/**
 * The downloadable import template. The header is the built-in columns followed by the client's own
 * product columns, so an admin who adds a column in Settings → Custom Fields gets it in the next
 * template download — nothing here is hard-coded per client. A required column is marked in the header
 * so the person filling the sheet can see it.
 */
export function buildProductTemplateCsv(custom: ProductCustomColumn[] = []): string {
  const cols = importableCustom(custom);
  const header = [
    ...PRODUCT_BUILTIN_COLUMNS.map((c) => c.label),
    ...cols.map((c) => (c.required ? `${c.label} *` : c.label)),
  ];
  const sampleA = ['13280', 'Pneumatic cylinder 32mm', 'Festo', 'MAC', 'each', '4250', '18', 'Cylinders', 'Double acting'];
  const sampleB = ['20415', 'Vacuum cup, 40mm', 'Piab', 'PIAB', 'each', '1180.50', '18', 'Vacuum', 'Flat cup, NBR'];
  return csvLine(header)
    + csvLine([...sampleA, ...cols.map(sampleCustomValue)])
    + csvLine([...sampleB, ...cols.map(sampleCustomValue)]);
}

/** The built-in-only template, kept as a constant for callers with no column list to hand. */
export const PRODUCT_TEMPLATE_CSV = buildProductTemplateCsv();

// ── Turning an unmatched header into one of the client's own columns ────────

/**
 * A column the file has but the client has not defined yet: the header as written, a legal field_key
 * derived from it, and a field type guessed from the column's own values. The import screen offers these
 * as "add this column", which creates the crm_custom_field_defs row — after which the header maps, the
 * value imports, and the next template download already includes it.
 */
export interface SuggestedProductColumn {
  /** Header text exactly as the file writes it. */
  header: string;
  /** A legal crm_custom_field_defs.field_key: /^[a-z][a-z0-9_]*$/, at most 80 characters. */
  field_key: string;
  /** Guessed from the column's values; the admin can change it before adding. */
  field_type: 'text' | 'number' | 'currency' | 'boolean' | 'date';
  /** Up to three non-empty sample values, so the admin can see what they are typing. */
  samples: string[];
}

/** "DP With GST" -> "dp_with_gst". Always a legal field_key, or '' when nothing usable is left. */
export function toFieldKey(label: string): string {
  let k = String(label ?? '')
    .replace(/\s*\*+\s*$/, '')          // the template's required marker
    .trim().toLowerCase()
    .replace(/%/g, ' pct ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!k) return '';
  if (!/^[a-z]/.test(k)) k = `f_${k}`;
  return k.slice(0, 80).replace(/_+$/, '');
}

/** Guess a field type from a column's values: every value numeric -> currency, yes/no -> boolean, and so on. */
function guessFieldType(values: string[]): SuggestedProductColumn['field_type'] {
  const vals = values.map((v) => v.trim()).filter(Boolean);
  if (!vals.length) return 'text';
  const all = (fn: (v: string) => boolean) => vals.every(fn);
  if (all((v) => ['yes', 'no', 'true', 'false', 'y', 'n', '1', '0', 'on', 'off'].includes(v.toLowerCase()))) return 'boolean';
  if (all((v) => parseDateCell(v) !== null)) return 'date';
  if (all((v) => parseNumberCell(v) !== null)) {
    // A money-looking column (a currency mark, or decimals / thousands separators) reads as currency.
    return vals.some((v) => /[₹$]|rs\.?|inr/i.test(v) || /[.,]\d/.test(v)) ? 'currency' : 'number';
  }
  return 'text';
}

/**
 * The columns in `text` that are neither a built-in nor one of `custom` — i.e. what the import would
 * otherwise ignore. `taken` (existing field_keys) keeps a suggestion from colliding with a column the
 * client already has under a different label.
 */
export function suggestProductColumns(
  text: string,
  custom: ProductCustomColumn[] = [],
  taken: string[] = [],
): SuggestedProductColumn[] {
  const table = parseCsv(text);
  if (table.length === 0) return [];
  const parsed = mapProductRows(table, custom);
  if (!parsed.ignoredColumns.length) return [];
  const header = table[0];
  const body = table.slice(1);
  const usedKeys = new Set<string>([...taken, ...custom.map((c) => c.field_key)]);
  const out: SuggestedProductColumn[] = [];
  const seenHeader = new Set<string>();
  parsed.ignoredColumns.forEach((label) => {
    if (seenHeader.has(label)) return;
    seenHeader.add(label);
    const base = toFieldKey(label);
    if (!base) return;
    let key = base;
    for (let n = 2; usedKeys.has(key); n++) key = `${base}_${n}`.slice(0, 80);
    usedKeys.add(key);
    const index = header.findIndex((h) => h.replace(/^﻿/, '').trim() === label);
    const values = index < 0 ? [] : body.map((r) => (r[index] ?? '').trim());
    out.push({
      header: label,
      field_key: key,
      field_type: guessFieldType(values),
      samples: values.filter(Boolean).slice(0, 3),
    });
  });
  return out;
}
