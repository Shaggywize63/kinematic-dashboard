'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { crmLeads } from '../../lib/crmApi';

/**
 * Bulk lat/long backfill for existing leads. The user uploads (or pastes) a
 * CSV whose rows match a lead by id (preferred), email, or phone, plus a
 * latitude + longitude. We parse client-side into the shape the
 * /leads/bulk-coordinates endpoint expects and report updated/skipped counts.
 *
 * Kept dependency-free (no papaparse/xlsx in the bundle) with a small CSV
 * parser that handles quoted fields — the coordinates sheet is simple.
 */

type Row = { id?: string; email?: string; phone?: string; latitude: number; longitude: number };

// Minimal CSV: handles double-quoted fields with embedded commas/quotes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((c) => c.trim() !== '')) rows.push(row); }
  return rows;
}

const TEMPLATE = 'id,email,phone,latitude,longitude\n,,,23.795700,86.430400\n';

export default function BulkCoordinatesModal({ open, onClose, onDone }: {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ updated: number; skipped: number; errors: Array<{ row: number; reason: string }> } | null>(null);
  const [parseSkipped, setParseSkipped] = useState(0);

  if (!open) return null;

  const readFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.readAsText(f);
  };

  const buildRows = (): Row[] => {
    const grid = parseCsv(text);
    if (grid.length < 2) return [];
    const header = grid[0].map((h) => h.trim().toLowerCase());
    const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
    const iId = idx(['id', 'lead_id']);
    const iEmail = idx(['email']);
    const iPhone = idx(['phone', 'mobile']);
    const iLat = idx(['latitude', 'lat']);
    const iLng = idx(['longitude', 'long', 'lng', 'lon']);

    if (iLat === -1 || iLng === -1) {
      toast.error('CSV needs latitude and longitude columns.');
      return [];
    }

    let skipped = 0;
    const rows: Row[] = [];
    for (let r = 1; r < grid.length; r++) {
      const cells = grid[r];
      const lat = Number((cells[iLat] ?? '').trim());
      const lng = Number((cells[iLng] ?? '').trim());
      const id = iId >= 0 ? (cells[iId] ?? '').trim() : '';
      const email = iEmail >= 0 ? (cells[iEmail] ?? '').trim() : '';
      const phone = iPhone >= 0 ? (cells[iPhone] ?? '').trim() : '';
      const hasMatcher = id || email || phone;
      const validCoords = Number.isFinite(lat) && Number.isFinite(lng)
        && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
      if (!hasMatcher || !validCoords) { skipped++; continue; }
      rows.push({
        ...(id ? { id } : {}),
        ...(!id && email ? { email } : {}),
        ...(!id && !email && phone ? { phone } : {}),
        latitude: lat,
        longitude: lng,
      });
    }
    setParseSkipped(skipped);
    return rows;
  };

  const submit = async () => {
    const rows = buildRows();
    if (rows.length === 0) { toast.error('No valid rows found to upload.'); return; }
    if (rows.length > 10000) { toast.error('Max 10,000 rows per upload.'); return; }
    setBusy(true);
    setResult(null);
    try {
      const r = await crmLeads.bulkCoordinates({ rows });
      setResult(r.data);
      toast.success(`Geotagged ${r.data.updated} lead${r.data.updated === 1 ? '' : 's'}`);
      onDone?.();
    } catch (e: any) {
      toast.error(e.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, width: 560, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Upload coordinates for old leads</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 0 }}>
          CSV with a <strong>latitude</strong> and <strong>longitude</strong> column, plus an <strong>id</strong> (preferred), <strong>email</strong>, or <strong>phone</strong> to match each lead.
          {' '}
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
            download="lead-coordinates-template.csv"
            style={{ color: 'var(--accent, #E01E2C)', fontWeight: 600 }}
          >Download template</a>
        </p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0' }}>
          <label style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Choose CSV file
            <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
          </label>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>or paste below</span>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'id,email,phone,latitude,longitude\n9f3...,,,23.7957,86.4304'}
          rows={7}
          style={{ width: '100%', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: 10, fontSize: 12.5, fontFamily: 'ui-monospace, monospace', resize: 'vertical', boxSizing: 'border-box' }}
        />

        {result && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text)', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div>✅ Geotagged: <strong>{result.updated}</strong></div>
            <div>⏭️ Skipped (no match): <strong>{result.skipped}</strong></div>
            {parseSkipped > 0 && <div>⚠️ Rows ignored (missing coords/match in file): <strong>{parseSkipped}</strong></div>}
            {result.errors.length > 0 && (
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--text-dim)' }}>{result.errors.length} unmatched row{result.errors.length === 1 ? '' : 's'}</summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--text-dim)', fontSize: 12 }}>
                  {result.errors.slice(0, 50).map((er, i) => <li key={i}>Row {er.row}: {er.reason}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '9px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Close</button>
          <button onClick={submit} disabled={busy || !text.trim()} style={{ background: 'var(--accent, #E01E2C)', border: 'none', color: '#fff', padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy || !text.trim() ? 0.6 : 1 }}>
            {busy ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
