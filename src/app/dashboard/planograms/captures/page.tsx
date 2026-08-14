'use client';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import planogramApi from '../../../../lib/planogramApi';
import { useCityScope } from '../../../../context/CityScopeContext';
import type { CaptureListItem } from '../../../../types/planogram';
import {
  PC,
  fmtDate,
  fmtPct,
  ScorePill,
  CaptureFlags,
  SectionCard,
  StateBlock,
  selyStyle,
  TableScroll,
  th,
  thR,
  td,
  tdR,
} from '../_components/planogramUi';

type ScoreBand = 'any' | 'good' | 'warn' | 'bad';
type FlagFilter = 'any' | 'recovered' | 'review' | 'competitor';

const SCORE_BANDS: { value: ScoreBand; label: string; min?: number; max?: number }[] = [
  { value: 'any', label: 'Score: any' },
  { value: 'good', label: 'Score: 80+', min: 80 },
  { value: 'warn', label: 'Score: 65–79', min: 65, max: 79 },
  { value: 'bad', label: 'Score: < 65', max: 64 },
];

const FLAG_FILTERS: { value: FlagFilter; label: string }[] = [
  { value: 'any', label: 'Flags: all' },
  { value: 'recovered', label: 'Recovered' },
  { value: 'review', label: 'Needs review' },
  { value: 'competitor', label: 'Competitor' },
];

export default function CapturesPage() {
  const { selectedCity } = useCityScope();
  const router = useRouter();

  const [storeId, setStoreId] = useState('');
  const [scoreBand, setScoreBand] = useState<ScoreBand>('any');
  const [flag, setFlag] = useState<FlagFilter>('any');

  const [rows, setRows] = useState<CaptureListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Web shelf-audit: upload a shelf photo and run the same AI capture pipeline
  // the mobile camera uses — so a MoiSoi demo can be run entirely in the browser.
  const [uploading, setUploading] = useState(false);
  const shelfFileRef = useRef<HTMLInputElement>(null);

  // Store dropdown options — captured from the unfiltered-by-store result so
  // they stay stable while a store filter is active.
  const [storeOptions, setStoreOptions] = useState<{ id: string; name: string }[]>([]);
  const storeOptionsRef = useRef<{ id: string; name: string }[]>([]);

  // Reset the store filter when the city scope changes (a store may not exist
  // in the newly-scoped city).
  useEffect(() => {
    setStoreId('');
  }, [selectedCity]);

  const band = SCORE_BANDS.find((b) => b.value === scoreBand);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await planogramApi.listCaptures({
        city: selectedCity || undefined,
        store_id: storeId || undefined,
        needs_review: flag === 'review' ? true : undefined,
        min_score: band?.min,
        max_score: band?.max,
        limit: 500,
      });
      const captures = res.data.captures || [];
      setRows(captures);
      setTotal(res.data.total ?? captures.length);
      // Refresh store options only from the store-unfiltered result.
      if (!storeId) {
        const map = new Map<string, string>();
        for (const c of captures) {
          if (c.store_id) map.set(c.store_id, c.store_name || c.store_id);
        }
        const opts = Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
        storeOptionsRef.current = opts;
        setStoreOptions(opts);
      }
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load captures');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCity, storeId, flag, band?.min, band?.max]);

  useEffect(() => {
    load();
  }, [load]);

  // Client-side safety net so every control filters even if the backend ignores
  // the query params (recovered / competitor have no server param at all).
  const filtered = useMemo(() => {
    return rows.filter((c) => {
      if (storeId && c.store_id !== storeId) return false;
      if (band?.min != null && (c.score == null || c.score < band.min)) return false;
      if (band?.max != null && (c.score == null || c.score > band.max)) return false;
      if (flag === 'review' && !c.needs_review) return false;
      if (flag === 'recovered' && !(c.recovered_count && c.recovered_count > 0)) return false;
      if (flag === 'competitor' && !c.competitor_present) return false;
      return true;
    });
  }, [rows, storeId, band?.min, band?.max, flag]);

  const filtersActive = !!storeId || scoreBand !== 'any' || flag !== 'any';

  // Per-row "Re-analyze" — subtle nice-to-have that re-runs the AI on a capture
  // and patches the row in place from the response. Ref-guarded against
  // double-clicks; confirmed via a toast action so it can't fire (an AI credit)
  // on a stray click.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const reprocessInFlight = useRef<Set<string>>(new Set());

  const reprocessRow = useCallback(async (cid: string) => {
    if (reprocessInFlight.current.has(cid)) return;
    reprocessInFlight.current.add(cid);
    setBusyIds((s) => new Set(s).add(cid));
    try {
      const r = await planogramApi.reprocessCapture(cid);
      const d = r?.data;
      if (d) {
        const detected = d.recognition?.detected_skus || [];
        setRows((prev) =>
          prev.map((row) =>
            row.id === cid
              ? {
                  ...row,
                  score: d.compliance?.score ?? row.score,
                  shelf_share_own: d.compliance?.shelf_share_own ?? row.shelf_share_own,
                  needs_review: d.recognition?.needs_review ?? row.needs_review,
                  competitor_present: detected.some((x) => x.is_competitor),
                  recovered_count: detected.filter((x) => x.recovered).length,
                }
              : row,
          ),
        );
      }
      toast.success('Analysis updated');
    } catch (e) {
      toast.error((e as Error)?.message || 'Re-analysis failed');
    } finally {
      reprocessInFlight.current.delete(cid);
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(cid);
        return n;
      });
    }
  }, []);

  const confirmReprocessRow = useCallback(
    (cid: string) => {
      toast('Re-analyze this capture?', {
        description: 'Re-runs the AI on the photo. Uses an AI credit; results may change.',
        action: { label: 'Re-analyze', onClick: () => reprocessRow(cid) },
      });
    },
    [reprocessRow],
  );

  // Upload a shelf photo from the browser and run the AI audit (same pipeline as
  // the mobile camera). On success we jump straight to the capture's report.
  const runShelfAudit = async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Upload a JPG, PNG, or WebP shelf photo.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image is too large (max 10 MB).');
      return;
    }
    setUploading(true);
    const tId = toast.loading('Analyzing the shelf with AI — this can take up to a minute.');
    try {
      const image_base64 = await readBase64(file);
      // The capture endpoint also requires a hosted image URL, so upload the file
      // first (same public bucket the mobile capture stores its photo in).
      const fd = new FormData();
      fd.append('photo', file);
      const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') : null;
      const orgId =
        typeof window !== 'undefined'
          ? JSON.parse(localStorage.getItem('kinematic_user') || '{}').org_id || ''
          : '';
      const up = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/upload/planogram_ref`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { 'X-Org-Id': orgId } : {}),
        },
        body: fd,
      });
      const upJson = await up.json().catch(() => ({}));
      const image_url = upJson?.data?.url || upJson?.url;
      if (!image_url) throw new Error(upJson?.error || upJson?.message || 'Image upload failed.');

      const res = await planogramApi.createCapture({
        image_url,
        image_base64,
        image_media_type: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
      });
      const capture = res?.data?.capture;
      toast.dismiss(tId);
      if (capture?.id) {
        toast.success('Shelf audited — opening the report.');
        router.push(`/dashboard/planograms/captures/${capture.id}`);
      } else {
        toast.success('Shelf audited.');
        load();
      }
    } catch (e) {
      toast.dismiss(tId);
      toast.error((e as Error)?.message || 'Could not audit the shelf. Please try again.');
    } finally {
      setUploading(false);
      if (shelfFileRef.current) shelfFileRef.current.value = '';
    }
  };

  return (
    <SectionCard
      title="Captures"
      caption={
        loading
          ? 'Loading…'
          : `${filtered.length}${filtered.length !== total && !filtersActive ? ` of ${total}` : ''} capture${
              filtered.length === 1 ? '' : 's'
            } · click a row to open the audit`
      }
      right={
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => shelfFileRef.current?.click()}
            disabled={uploading}
            title="Upload a shelf photo and run the AI audit"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: PC.brand,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 13px',
              fontSize: 13,
              fontWeight: 600,
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.65 : 1,
            }}
          >
            {uploading ? '⏳ Analyzing…' : '📷 Upload shelf photo'}
          </button>
          <input
            ref={shelfFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) runShelfAudit(f);
            }}
          />
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={selyStyle} aria-label="Store">
            <option value="">All stores</option>
            {storeOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select value={scoreBand} onChange={(e) => setScoreBand(e.target.value as ScoreBand)} style={selyStyle} aria-label="Score band">
            {SCORE_BANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <select value={flag} onChange={(e) => setFlag(e.target.value as FlagFilter)} style={selyStyle} aria-label="Flags">
            {FLAG_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      }
      bodyPad={false}
    >
      {error ? (
        <div style={{ padding: 16 }}>
          <StateBlock tone="error">{error}</StateBlock>
        </div>
      ) : loading ? (
        <StateBlock>Loading captures…</StateBlock>
      ) : filtered.length === 0 ? (
        <StateBlock>
          {filtersActive ? 'No captures match these filters.' : 'No captures yet. Upload a shelf photo above to run an AI audit, or have field executives capture shelves from the mobile app.'}
        </StateBlock>
      ) : (
        <TableScroll>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr>
                <th style={th}>Store</th>
                <th style={th}>Bay</th>
                <th style={th}>Auditor</th>
                <th style={th}>Date</th>
                <th style={thR}>Score</th>
                <th style={thR}>Own share</th>
                <th style={th}>Flags</th>
                <th style={thR} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  data-clickable="true"
                  onClick={() => router.push(`/dashboard/planograms/captures/${c.id}`)}
                >
                  <td style={td}>
                    <Link
                      href={`/dashboard/planograms/captures/${c.id}`}
                      style={{ color: PC.text, fontWeight: 600, textDecoration: 'none' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.store_name || c.outlet_label || 'Unknown store'}
                    </Link>
                    {/* Storeless (free-trial) captures name the manually-added
                        outlet; tag it so admins can tell it from a registered store. */}
                    {!c.store_name && c.outlet_label && (
                      <div style={{ fontSize: 11, color: PC.muted }}>Outlet</div>
                    )}
                    {c.city && <div style={{ fontSize: 11, color: PC.muted }}>{c.city}</div>}
                  </td>
                  <td style={{ ...td, color: PC.muted }}>{c.category || '—'}</td>
                  <td style={{ ...td, color: PC.muted }}>{c.fe_name || 'FE Executive'}</td>
                  <td style={{ ...td, color: PC.muted, whiteSpace: 'nowrap' }}>{fmtDate(c.captured_at)}</td>
                  <td style={tdR}>
                    <ScorePill score={c.score} />
                  </td>
                  <td style={{ ...tdR, color: PC.muted }}>{fmtPct(c.shelf_share_own)}</td>
                  <td style={td}>
                    <CaptureFlags
                      recovered_count={c.recovered_count}
                      needs_review={c.needs_review}
                      competitor_present={c.competitor_present}
                    />
                  </td>
                  <td style={{ ...tdR, whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmReprocessRow(c.id);
                      }}
                      disabled={busyIds.has(c.id)}
                      title="Re-analyze — re-run the AI on this capture"
                      aria-label="Re-analyze capture"
                      style={{
                        appearance: 'none',
                        border: `1px solid ${PC.border}`,
                        background: 'var(--s1)',
                        color: PC.muted,
                        borderRadius: 8,
                        width: 30,
                        height: 28,
                        cursor: busyIds.has(c.id) ? 'default' : 'pointer',
                        opacity: busyIds.has(c.id) ? 0.5 : 1,
                        fontSize: 14,
                        lineHeight: 0,
                      }}
                    >
                      {busyIds.has(c.id) ? '…' : '↻'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </SectionCard>
  );
}

/** Read a File as raw base64 (no data-URL prefix) — the shape the capture
 *  endpoint's `image_base64` expects. */
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
