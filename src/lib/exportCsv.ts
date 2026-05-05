/**
 * Generic CSV export helper for report tables.
 *   downloadCsv('forecast', [{period:'Q1', value: 100}], ['period','value'])
 */
export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>, columns?: string[]) {
  if (!rows || rows.length === 0) return;
  const cols = columns && columns.length > 0 ? columns : Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => escape(r[c])).join(','));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
