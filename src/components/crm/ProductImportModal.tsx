'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { crmProducts } from '../../lib/crmApi';
import { apiErrorText } from '../../lib/sparkAccounts';
import {
  PRODUCT_IMPORT_MAX_ROWS, PRODUCT_TEMPLATE_CSV, parseProductCsv, toBulkRows, type ProductImportRow,
} from '../../lib/csv';
import type { ProductBulkResult } from '../../types/crm';
import { Button, T } from '../ui';

// Products -> "Import from file" (connected-B2B). The CSV is read in the browser, previewed, and sent in one call to
// POST /crm/products/bulk. Makes and brands that are not in the lists yet can be added on the way, and products whose
// reference already exists can be updated instead of skipped.

const PREVIEW_ROWS = 10;

function downloadTemplate() {
  const blob = new Blob([PRODUCT_TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'products-template.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ProductImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [createMissing, setCreateMissing] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ProductBulkResult | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [busy, onClose]);

  const parsed = useMemo(() => (text.trim() ? parseProductCsv(text) : null), [text]);
  const rows: ProductImportRow[] = parsed?.rows ?? [];
  const tooMany = rows.length > PRODUCT_IMPORT_MAX_ROWS;
  const blank = rows.filter((r) => !r.reference || !r.name).length;
  // The server lists every row it did not import in `errors` (rows passed over on purpose are in `skipped` as well), so the
  // list is the count; `skipped` is not added on top of it.
  const notImported = result ? Math.max(result.errors?.length ?? 0, result.skipped ?? 0) : 0;
  const canImport = !!parsed && parsed.problems.length === 0 && rows.length > 0 && !tooMany && !busy;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setResult(null); setError('');
    try { setText(await f.text()); setFileName(f.name); }
    catch { setError('Could not read that file.'); }
  };

  const run = async () => {
    if (!canImport) return;
    setBusy(true); setError('');
    try {
      const r = await crmProducts.bulk({ rows: toBulkRows(rows), create_missing: createMissing, update_existing: updateExisting });
      setResult(r.data);
      onImported();
    } catch (e) { setError(apiErrorText(e, 'The import failed.')); }
    finally { setBusy(false); }
  };

  const th: React.CSSProperties = { padding: '7px 10px', fontSize: 11, color: T.dim, textTransform: 'uppercase', textAlign: 'left', borderBottom: `1px solid ${T.border}`, background: 'var(--s2)', fontWeight: 700, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, color: T.text, borderBottom: `1px solid ${T.border}`, verticalAlign: 'top' };
  const note = (tone: 'err' | 'warn'): React.CSSProperties => ({
    fontSize: 12.5, lineHeight: 1.45, padding: '8px 12px', borderRadius: T.radius.md,
    color: tone === 'err' ? T.red : T.text, background: tone === 'err' ? T.redWash : T.warnWash, border: `1px solid ${T.border}`,
  });

  return (
    <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-label="Import products from a file" data-testid="product-import"
        style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, width: '100%', maxWidth: 820, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: T.text }}>Import products from a file</h2>
            <div style={{ fontSize: 13, color: T.dim, marginTop: 4, lineHeight: 1.45 }}>
              A CSV file with one product per line. Columns: Reference and Name are required; Make, Brand, Unit, Price, Category and Description are optional.
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={downloadTemplate}>Download template</Button>
        </div>

        {!result && (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" aria-label="Choose a CSV file" data-testid="import-file"
                onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} style={{ fontSize: 13, color: T.text, maxWidth: '100%' }} />
              {fileName && <span style={{ fontSize: 12, color: T.mute }}>{fileName}</span>}
            </div>
            <textarea aria-label="Or paste the CSV text here" placeholder="Or paste CSV text here, starting with the header line" value={text} data-testid="import-text"
              onChange={(e) => { setText(e.target.value); setFileName(''); setError(''); }} rows={5} spellCheck={false}
              style={{ width: '100%', boxSizing: 'border-box', background: T.field, border: `1px solid ${T.border}`, borderRadius: T.radius.sm, color: T.text, fontFamily: T.mono, fontSize: 12, padding: 10, resize: 'vertical' }} />

            {parsed && parsed.problems.length > 0 && (
              <div role="alert" data-testid="import-problems" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {parsed.problems.map((p, i) => <div key={i} style={note('err')}>{p}</div>)}
              </div>
            )}
            {tooMany && (
              <div role="alert" data-testid="import-too-many" style={note('err')}>
                {`This file has ${rows.length.toLocaleString('en-IN')} products. A single import can hold up to ${PRODUCT_IMPORT_MAX_ROWS.toLocaleString('en-IN')}. Split the file into parts and import them one after the other.`}
              </div>
            )}

            {parsed && parsed.problems.length === 0 && rows.length > 0 && (
              <div data-testid="import-preview" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, color: T.text }} data-testid="import-counts">
                  {`${rows.length.toLocaleString('en-IN')} ${rows.length === 1 ? 'product' : 'products'} found`}
                  {(() => {
                    const mk = new Set(rows.map((r) => (r.make || '').toLowerCase()).filter(Boolean)).size;
                    const br = new Set(rows.map((r) => (r.brand || '').toLowerCase()).filter(Boolean)).size;
                    return ` · ${mk} ${mk === 1 ? 'make' : 'makes'} · ${br} ${br === 1 ? 'brand' : 'brands'}`;
                  })()}
                </div>
                {blank > 0 && <div style={note('warn')}>{`${blank} ${blank === 1 ? 'row has' : 'rows have'} no reference or no name and will be reported as errors.`}</div>}
                {parsed.warnings.slice(0, 5).map((w, i) => <div key={i} style={note('warn')}>{w}</div>)}
                {parsed.warnings.length > 5 && <div style={note('warn')}>{`${parsed.warnings.length - 5} more notes not shown.`}</div>}
                <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.md }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                    <thead><tr>
                      {['Row', 'Reference', 'Name', 'Make', 'Brand', 'Unit', 'Price', 'Category'].map((h) => <th key={h} style={th}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {rows.slice(0, PREVIEW_ROWS).map((r) => (
                        <tr key={r.row} data-testid="import-preview-row">
                          <td style={{ ...td, color: T.mute }}>{r.row}</td>
                          <td style={{ ...td, fontWeight: 600 }}>{r.reference || '—'}</td>
                          <td style={td}>{r.name || '—'}</td>
                          <td style={td}>{r.make || '—'}</td>
                          <td style={td}>{r.brand || '—'}</td>
                          <td style={td}>{r.unit || '—'}</td>
                          <td style={td}>{r.price != null ? r.price : '—'}</td>
                          <td style={td}>{r.category || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > PREVIEW_ROWS && <div style={{ fontSize: 12, color: T.mute }}>{`Showing the first ${PREVIEW_ROWS} of ${rows.length.toLocaleString('en-IN')} products.`}</div>}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: T.text }}>
                <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
                Add makes and brands that are not in the lists yet
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: T.text }}>
                <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
                Update products that already exist
              </label>
            </div>

            {error && <div role="alert" data-testid="import-error" style={note('err')}>{error}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={run} disabled={!canImport}>
                {busy ? 'Importing...' : rows.length > 0 && !tooMany ? `Import ${rows.length.toLocaleString('en-IN')} ${rows.length === 1 ? 'product' : 'products'}` : 'Import'}
              </Button>
            </div>
          </>
        )}

        {result && (
          <div data-testid="import-result" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 14, color: T.text, fontWeight: 600 }} data-testid="import-result-counts">
              {`${result.created} created · ${result.updated} updated · ${notImported} not imported`}
            </div>
            {(result.makes_created?.length ?? 0) > 0 && (
              <div style={{ fontSize: 13, color: T.text }} data-testid="import-new-makes">{`New makes added: ${result.makes_created.join(', ')}`}</div>
            )}
            {(result.brands_created?.length ?? 0) > 0 && (
              <div style={{ fontSize: 13, color: T.text }} data-testid="import-new-brands">{`New brands added: ${result.brands_created.join(', ')}`}</div>
            )}
            {(result.errors?.length ?? 0) > 0 ? (
              <>
                <div style={{ fontSize: 13, color: T.red }} data-testid="import-not-imported">{`Not imported (${result.errors.length})`}</div>
                <div style={{ fontSize: 12, color: T.mute }}>Rows are counted without the header line.</div>
                <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.md, maxHeight: 280, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={th}>Row</th><th style={th}>Reference</th><th style={th}>Problem</th></tr></thead>
                    <tbody>
                      {result.errors.map((er, i) => (
                        <tr key={i} data-testid="import-error-row">
                          <td style={td}>{er.row}</td>
                          <td style={td}>{er.reference || '—'}</td>
                          <td style={{ ...td, color: T.red }}>{er.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <div style={{ fontSize: 13, color: T.dim }}>Every row was imported without problems.</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => { setResult(null); setText(''); setFileName(''); }}>Import another file</Button>
              <Button variant="primary" onClick={onClose}>Done</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
