'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import planogramApi from '../../../../lib/planogramApi';
import type { Planogram, PlanogramCompetitor } from '../../../../types/planogram';
import { PC, SectionCard, StateBlock, useIsCompact } from '../_components/planogramUi';

/**
 * Competitors — the org-wide competitor catalogue.
 *
 * Competitor SKUs are stored per-planogram on `layout.competitors[]`. This page
 * aggregates them across every planogram in the org and de-duplicates by
 * `sku_id` (falling back to brand + normalized name), so a competitor tracked in
 * three bays shows once — with the planograms that track it. Competitors are
 * *added / edited* per-planogram in the editor, so the "+ Add competitor" and
 * per-row "Manage" affordances route into a planogram's competitor manager.
 *
 * Data source: the planogram list endpoint only returns summary columns (no
 * `layout`), so we fetch each planogram's detail to read its competitors. The
 * api client de-dupes + caches GETs, so this stays cheap on repeat visits.
 */

const BASE = '/dashboard/planograms';

/** A planogram that tracks a given competitor. */
interface TrackingRef {
  id: string;
  name: string;
}

/** One de-duplicated competitor in the catalogue. */
interface CatalogueEntry {
  key: string;
  sku_id: string | null;
  sku_name: string;
  brand: string | null;
  category: string | null;
  expected_price: number | null;
  ref_image_url: string | null;
  extra_ref_count: number;
  planograms: TrackingRef[];
}

/** A brand group of catalogue entries. */
interface BrandGroup {
  brand: string;
  entries: CatalogueEntry[];
}

const UNBRANDED = 'Other / unbranded';

/** Normalize a name for the fallback dedupe key. */
function normName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Dedupe key: stable sku_id when present, else brand + normalized name. */
function dedupeKey(c: PlanogramCompetitor): string {
  if (c.sku_id && c.sku_id.trim()) return `id:${c.sku_id.trim()}`;
  return `bn:${(c.brand || '').trim().toLowerCase()}|${normName(c.sku_name || '')}`;
}

/** Aggregate competitors across planograms into a de-duplicated catalogue,
 *  grouped by brand. First non-empty value wins for each display field; the
 *  first available pack-shot becomes the entry's thumbnail. */
function buildCatalogue(planograms: Planogram[]): {
  groups: BrandGroup[];
  totalEntries: number;
  missingPhotos: number;
} {
  const map = new Map<string, CatalogueEntry>();

  for (const p of planograms) {
    const comps = p.layout?.competitors;
    if (!Array.isArray(comps)) continue;
    for (const c of comps) {
      if (!c || !(c.sku_name || c.sku_id)) continue;
      const key = dedupeKey(c);
      const existing = map.get(key);
      const track: TrackingRef = { id: p.id, name: p.name };
      if (existing) {
        // Fill any gaps from this occurrence; keep the first-seen values.
        existing.sku_name = existing.sku_name || c.sku_name || 'Competitor SKU';
        existing.brand = existing.brand ?? (c.brand ?? null);
        existing.category = existing.category ?? (c.category ?? null);
        existing.expected_price = existing.expected_price ?? (c.expected_price ?? null);
        if (!existing.ref_image_url && c.ref_image_url) existing.ref_image_url = c.ref_image_url;
        existing.extra_ref_count += Array.isArray(c.additional_ref_urls) ? c.additional_ref_urls.length : 0;
        if (!existing.planograms.some((t) => t.id === p.id)) existing.planograms.push(track);
      } else {
        map.set(key, {
          key,
          sku_id: c.sku_id?.trim() || null,
          sku_name: c.sku_name || 'Competitor SKU',
          brand: c.brand ?? null,
          category: c.category ?? null,
          expected_price: c.expected_price ?? null,
          ref_image_url: c.ref_image_url ?? null,
          extra_ref_count: Array.isArray(c.additional_ref_urls) ? c.additional_ref_urls.length : 0,
          planograms: [track],
        });
      }
    }
  }

  const entries = Array.from(map.values());
  const missingPhotos = entries.filter((e) => !e.ref_image_url).length;

  // Group by brand; unbranded floats to the bottom, everything else A→Z.
  const byBrand = new Map<string, CatalogueEntry[]>();
  for (const e of entries) {
    const b = e.brand?.trim() || UNBRANDED;
    if (!byBrand.has(b)) byBrand.set(b, []);
    byBrand.get(b)!.push(e);
  }
  const groups: BrandGroup[] = Array.from(byBrand.entries())
    .map(([brand, list]) => ({
      brand,
      entries: list.sort((a, b) => a.sku_name.localeCompare(b.sku_name)),
    }))
    .sort((a, b) => {
      if (a.brand === UNBRANDED) return 1;
      if (b.brand === UNBRANDED) return -1;
      return a.brand.localeCompare(b.brand);
    });

  return { groups, totalEntries: entries.length, missingPhotos };
}

export default function CompetitorsPage() {
  const isCompact = useIsCompact();

  const [planograms, setPlanograms] = useState<Planogram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 1) The summary list (no layout). 2) Each planogram's detail carries
      // `layout.competitors`. allSettled so one bad planogram doesn't blank the
      // whole catalogue.
      const list = await planogramApi.list();
      const summaries = list.data || [];
      const details = await Promise.allSettled(summaries.map((p) => planogramApi.get(p.id)));
      const full: Planogram[] = [];
      details.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value?.data) full.push(r.value.data);
        else if (summaries[i]) full.push(summaries[i]); // keep name/id even if detail failed
      });
      setPlanograms(full);
      setError('');
    } catch (e) {
      setError((e as Error)?.message || 'Failed to load competitors');
      setPlanograms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { groups, totalEntries, missingPhotos } = useMemo(
    () => buildCatalogue(planograms),
    [planograms],
  );

  // Planograms sorted for the "add" picker — active first, then by name.
  const picker = useMemo(
    () =>
      [...planograms].sort((a, b) => {
        if (!!a.is_active !== !!b.is_active) return a.is_active ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [planograms],
  );

  const brandCount = groups.length;
  const trackingPlanograms = planograms.filter(
    (p) => Array.isArray(p.layout?.competitors) && p.layout!.competitors!.length > 0,
  ).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionCard
        title="Tracked competitors"
        caption="Competitor SKUs registered with a product photo so shelf recognition matches them reliably and their price / share can trend over time. Aggregated across every planogram; added per-planogram in the editor."
        right={
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setAddOpen((o) => !o)}
              aria-expanded={addOpen}
              style={{
                background: PC.brand,
                color: '#fff',
                border: 0,
                borderRadius: 9,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                gap: 6,
                alignItems: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              <span aria-hidden style={{ fontSize: 15, lineHeight: 0 }}>
                +
              </span>{' '}
              Add competitor
            </button>
            {addOpen && (
              <AddCompetitorMenu planograms={picker} onClose={() => setAddOpen(false)} isCompact={isCompact} />
            )}
          </div>
        }
        bodyPad={false}
      >
        {error ? (
          <div style={{ padding: 16 }}>
            <StateBlock tone="error">{error}</StateBlock>
          </div>
        ) : loading ? (
          <StateBlock>Loading competitors…</StateBlock>
        ) : planograms.length === 0 ? (
          <StateBlock>
            No planograms yet. Competitors are tracked per planogram —{' '}
            <Link href={`${BASE}/new`} style={{ color: PC.brand, fontWeight: 700, textDecoration: 'none' }}>
              create a planogram
            </Link>{' '}
            to start registering the competitor SKUs its shelf should watch for.
          </StateBlock>
        ) : totalEntries === 0 ? (
          <div style={{ padding: 16 }}>
            <div
              style={{
                border: `1px dashed ${PC.border}`,
                borderRadius: 12,
                padding: '28px 20px',
                textAlign: 'center',
                background: PC.surface2,
              }}
            >
              <div style={{ fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: 15, color: PC.text }}>
                No competitors tracked yet
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: PC.muted,
                  marginTop: 6,
                  maxWidth: 520,
                  marginInline: 'auto',
                  lineHeight: 1.55,
                }}
              >
                Open a planogram and add the competitor products its shelf should watch for — brand, name,
                category, price and a reference pack-shot. They&apos;ll appear here, de-duplicated across every
                bay that tracks them.
              </div>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                style={{
                  marginTop: 14,
                  background: PC.brand,
                  color: '#fff',
                  border: 0,
                  borderRadius: 9,
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                + Add competitor
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Catalogue summary */}
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <Stat label="Competitor SKUs" value={totalEntries} />
              <Stat label="Brands" value={brandCount} />
              <Stat label="Planograms tracking" value={trackingPlanograms} />
              {missingPhotos > 0 && <Stat label="Missing pack-shot" value={missingPhotos} tone="warn" />}
            </div>

            {/* Brand groups */}
            {groups.map((g) => (
              <div key={g.brand}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-manrope)',
                      fontSize: 13.5,
                      fontWeight: 800,
                      color: g.brand === UNBRANDED ? PC.muted : PC.text,
                    }}
                  >
                    {g.brand}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: PC.muted,
                      background: PC.surface3,
                      borderRadius: 100,
                      padding: '1px 8px',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {g.entries.length}
                  </span>
                  <span style={{ flex: 1, height: 1, background: PC.border }} />
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isCompact ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: 12,
                  }}
                >
                  {g.entries.map((e) => (
                    <CompetitorCard key={e.key} entry={e} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Add-competitor picker ──────────────────────────────────────────────────────

/** A small popover explaining competitors are added per-planogram, and routing
 *  into a chosen planogram's editor competitor manager. */
function AddCompetitorMenu({
  planograms,
  onClose,
  isCompact,
}: {
  planograms: Planogram[];
  onClose: () => void;
  isCompact: boolean;
}) {
  return (
    <>
      {/* Click-away backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'transparent' }}
        aria-hidden
      />
      <div
        role="menu"
        style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          zIndex: 41,
          width: isCompact ? 'min(88vw, 320px)' : 340,
          maxWidth: '92vw',
          background: PC.surface,
          border: `1px solid ${PC.border}`,
          borderRadius: 12,
          boxShadow: '0 12px 32px rgba(16,20,30,0.16)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${PC.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: PC.text }}>Add a competitor</div>
          <div style={{ fontSize: 11.5, color: PC.muted, marginTop: 3, lineHeight: 1.5 }}>
            Competitors are tracked per planogram. Pick the planogram whose competitor list you want to edit.
          </div>
        </div>
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {planograms.length === 0 ? (
            <div style={{ padding: 14 }}>
              <Link
                href={`${BASE}/new`}
                onClick={onClose}
                style={{ color: PC.brand, fontWeight: 700, textDecoration: 'none', fontSize: 13 }}
              >
                + Create a planogram
              </Link>
            </div>
          ) : (
            planograms.map((p) => (
              <Link
                key={p.id}
                href={`${BASE}/${p.id}#competitors`}
                onClick={onClose}
                role="menuitem"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '10px 14px',
                  textDecoration: 'none',
                  color: PC.text,
                  borderBottom: `1px solid ${PC.border}55`,
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.name}
                  </span>
                  <span style={{ fontSize: 11, color: PC.muted }}>
                    {p.category || 'Uncategorized'}
                    {Array.isArray(p.layout?.competitors) && p.layout!.competitors!.length > 0
                      ? ` · ${p.layout!.competitors!.length} tracked`
                      : ''}
                  </span>
                </span>
                <span aria-hidden style={{ color: PC.brand, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                  →
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ── Cards + pieces ─────────────────────────────────────────────────────────────

function CompetitorCard({ entry }: { entry: CatalogueEntry }) {
  const manageHref = entry.planograms[0]
    ? `${BASE}/${entry.planograms[0].id}#competitors`
    : `${BASE}`;
  const priceLabel = entry.expected_price != null ? `₹${entry.expected_price}` : null;
  const meta = [entry.brand || null, entry.category || 'Uncategorized', priceLabel]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      style={{
        background: PC.surface,
        border: `1px solid ${PC.border}`,
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 14 }}>
        <Packshot url={entry.ref_image_url} name={entry.sku_name} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 13.5,
              color: PC.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={entry.sku_name}
          >
            {entry.sku_name}
          </div>
          <div style={{ fontSize: 12, color: PC.muted, marginTop: 3 }}>{meta || '—'}</div>
          {!entry.ref_image_url && (
            <div style={{ fontSize: 11, color: PC.warn, marginTop: 4, fontWeight: 600 }}>
              No reference pack-shot yet
            </div>
          )}
        </div>
      </div>

      {/* Footer: which planograms track it + manage link */}
      <div
        style={{
          borderTop: `1px solid ${PC.border}`,
          padding: '9px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          background: PC.surface2,
        }}
      >
        <span style={{ fontSize: 10.5, color: PC.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          In
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {entry.planograms.slice(0, 3).map((t) => (
            <Link
              key={t.id}
              href={`${BASE}/${t.id}#competitors`}
              title={`Manage competitors in ${t.name}`}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: PC.text,
                background: PC.surface3,
                border: `1px solid ${PC.border}`,
                borderRadius: 100,
                padding: '2px 9px',
                textDecoration: 'none',
                maxWidth: 160,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {t.name}
            </Link>
          ))}
          {entry.planograms.length > 3 && (
            <span style={{ fontSize: 11, color: PC.muted, fontWeight: 600, alignSelf: 'center' }}>
              +{entry.planograms.length - 3} more
            </span>
          )}
        </div>
        <Link
          href={manageHref}
          style={{ fontSize: 11.5, fontWeight: 700, color: PC.brand, textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          Manage →
        </Link>
      </div>
    </div>
  );
}

/** A competitor pack-shot thumbnail with a graceful "no photo" placeholder
 *  (used both when there's no URL and when the image fails to load). */
function Packshot({ url, name }: { url: string | null; name: string }) {
  const [errored, setErrored] = useState(false);
  const box: React.CSSProperties = {
    width: 52,
    height: 52,
    borderRadius: 10,
    flex: 'none',
    display: 'grid',
    placeItems: 'center',
    overflow: 'hidden',
    border: `1px solid ${PC.border}`,
    background: PC.surface3,
  };
  if (!url || errored) {
    return (
      <div style={{ ...box, borderStyle: 'dashed', color: PC.muted, fontSize: 10, textAlign: 'center', lineHeight: 1.2 }}>
        no
        <br />
        photo
      </div>
    );
  }
  return (
    <div style={box}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={name}
        onError={() => setErrored(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
}

/** A small summary stat for the catalogue header. */
function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  const color = tone === 'warn' ? PC.warn : PC.text;
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: PC.muted, marginTop: 3 }}>{label}</div>
    </div>
  );
}
