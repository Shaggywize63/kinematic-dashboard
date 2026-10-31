'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import planogramApi from '../../../../lib/planogramApi';
import type { ExpectedSKU, PlanogramCompetitor } from '../../../../types/planogram';
import { PC, SectionCard, useIsCompact, TableScroll, th, thR, td } from '../_components/planogramUi';

const BASE = '/dashboard/planograms';

type Phase = 'idle' | 'parsing' | 'review' | 'saving';

export default function NewPlanogramPage() {
  const router = useRouter();
  const isCompact = useIsCompact();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [confidence, setConfidence] = useState(0);

  // Editable fields (seeded by AI, edited by manager)
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [storeFormat, setStoreFormat] = useState('');
  const [skus, setSkus] = useState<ExpectedSKU[]>([]);
  const [competitors, setCompetitors] = useState<PlanogramCompetitor[]>([]);

  const handleFile = async (file: File) => {
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Upload a JPG, PNG, or WebP image of the planogram.');
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setPhase('parsing');
    try {
      const base64 = await readBase64(file);
      const res = await planogramApi.parseFromImage({
        image_base64: base64,
        image_media_type: file.type,
      });
      const parsed = res.data;
      setName(parsed.name_suggestion);
      setCategory(parsed.category_suggestion || '');
      setStoreFormat(parsed.store_format_suggestion || '');
      setSkus(
        parsed.expected_skus.map((s) => ({
          ...s,
          weight: s.weight ?? 1,
          category: s.category ?? null,
          brand: s.brand ?? null,
          expected_price: s.expected_price ?? null,
        })),
      );
      setConfidence(parsed.overall_confidence);
      setPhase('review');
    } catch (e: any) {
      setError(e.message || 'Failed to parse planogram image.');
      setPhase('idle');
    }
  };

  const updateSku = (i: number, patch: Partial<ExpectedSKU>) => {
    setSkus((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };
  const removeSku = (i: number) => setSkus((prev) => prev.filter((_, idx) => idx !== i));
  const addSku = () =>
    setSkus((prev) => [
      ...prev,
      {
        sku_id: `new-sku-${prev.length + 1}`,
        sku_name: 'New SKU',
        shelf_index: 0,
        facings: 1,
        weight: 1,
        category: null,
        brand: null,
        expected_price: null,
      },
    ]);

  const updateCompetitor = (i: number, patch: Partial<PlanogramCompetitor>) => {
    setCompetitors((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };
  const removeCompetitor = (i: number) =>
    setCompetitors((prev) => prev.filter((_, idx) => idx !== i));
  const addCompetitor = () =>
    setCompetitors((prev) => [
      ...prev,
      {
        sku_id: `comp-${prev.length + 1}`,
        sku_name: 'Competitor SKU',
        brand: null,
        category: null,
        expected_price: null,
      },
    ]);

  const save = async () => {
    setError('');
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (skus.length === 0) {
      setError('Add at least one expected SKU.');
      return;
    }
    setPhase('saving');
    try {
      const shelfIndices = Array.from(new Set(skus.map((s) => s.shelf_index))).sort((a, b) => a - b);
      const layout = {
        shelves: shelfIndices.map((i) => ({ index: i })),
        ...(competitors.length > 0
          ? { competitors: competitors.map((c) => cleanCompetitor(c)) }
          : {}),
      };
      const res = await planogramApi.create({
        name: name.trim(),
        category: category.trim() || undefined,
        store_format: storeFormat || undefined,
        layout,
        expected_skus: skus.map((s) => ({
          sku_id: s.sku_id.trim(),
          sku_name: s.sku_name.trim(),
          shelf_index: Math.max(0, Math.floor(s.shelf_index)),
          facings: Math.max(1, Math.floor(s.facings)),
          position: s.position,
          weight: s.weight,
          category: s.category?.trim() || undefined,
          brand: s.brand?.trim() || undefined,
          expected_price: s.expected_price ?? undefined,
          ref_image_url: s.ref_image_url || undefined,
        })),
      });
      router.push(`${BASE}/${res.data.id}`);
    } catch (e: any) {
      setError(e.message || 'Failed to save planogram.');
      setPhase('review');
    }
  };

  const missingSkuShots = skus.filter((s) => !s.ref_image_url).length;
  const missingCompShots = competitors.filter((c) => !c.ref_image_url).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Contextual header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-manrope)',
              fontSize: 18,
              fontWeight: 800,
              color: PC.text,
            }}
          >
            New planogram
          </div>
          <div style={{ fontSize: 12.5, color: PC.muted, marginTop: 3, lineHeight: 1.5 }}>
            Upload a brand planogram image — AI extracts the shelf layout for you to review.
          </div>
        </div>
        <button onClick={() => router.push(`${BASE}/library`)} style={btnSecondary}>
          Cancel
        </button>
      </div>

      {error && (
        <div
          style={{
            background: PC.badWash,
            border: `1px solid ${PC.bad}55`,
            borderRadius: 12,
            padding: '12px 16px',
            fontSize: 13,
            color: PC.bad,
          }}
        >
          {error}
        </div>
      )}

      {phase === 'idle' && (
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          style={{
            background: PC.surface,
            border: `2px dashed ${PC.border}`,
            borderRadius: 14,
            padding: '56px 24px',
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 42, marginBottom: 12 }} aria-hidden>
            📐
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: PC.text, fontFamily: 'var(--font-manrope)' }}>
            Drop a planogram image here
          </div>
          <div style={{ fontSize: 13, color: PC.muted, marginTop: 6 }}>
            or click to browse — JPG, PNG, WebP up to 10 MB
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>
      )}

      {phase === 'parsing' && (
        <div
          style={{
            background: PC.surface,
            border: `1px solid ${PC.border}`,
            borderRadius: 14,
            padding: '56px 24px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 14, color: PC.muted, marginBottom: 14 }}>Analyzing planogram with AI…</div>
          <div
            style={{
              height: 4,
              background: PC.surface3,
              borderRadius: 2,
              maxWidth: 240,
              margin: '0 auto',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '40%',
                height: '100%',
                background: PC.brand,
                animation: 'kmpg-slide 1.4s ease-in-out infinite',
              }}
            />
          </div>
          <style jsx>{`
            @keyframes kmpg-slide {
              0% {
                transform: translateX(-120%);
              }
              100% {
                transform: translateX(280%);
              }
            }
          `}</style>
        </div>
      )}

      {(phase === 'review' || phase === 'saving') && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isCompact ? '1fr' : '1fr 1.5fr',
            gap: 16,
            alignItems: 'flex-start',
          }}
        >
          {/* Source preview */}
          <div
            style={{
              background: PC.surface,
              border: `1px solid ${PC.border}`,
              borderRadius: 14,
              padding: 14,
              boxShadow: '0 1px 2px rgba(16,20,30,0.04)',
              position: isCompact ? 'static' : 'sticky',
              top: 16,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: PC.muted,
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              Source · AI confidence{' '}
              <span
                style={{
                  fontWeight: 800,
                  color:
                    confidence >= 0.7 ? PC.good : confidence >= 0.5 ? PC.warn : PC.bad,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {Math.round(confidence * 100)}%
              </span>
            </div>
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Planogram source"
                style={{ width: '100%', height: 'auto', borderRadius: 10, display: 'block' }}
              />
            )}
          </div>

          {/* Editable definition */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SectionCard title="Planogram details">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr',
                  gap: 12,
                }}
              >
                <Field label="Name" full>
                  <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Category">
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Beverages"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Store format">
                  <select value={storeFormat} onChange={(e) => setStoreFormat(e.target.value)} style={inputStyle}>
                    <option value="">—</option>
                    <option value="modern_trade">Modern trade</option>
                    <option value="general_trade">General trade</option>
                    <option value="hyper">Hyper</option>
                  </select>
                </Field>
              </div>
            </SectionCard>

            <SectionCard
              title={`Expected SKUs (${skus.length})`}
              caption={
                missingSkuShots > 0
                  ? undefined
                  : 'The shelf products this planogram expects, with pack-shots for recognition.'
              }
              right={
                <button onClick={addSku} style={btnSecondary}>
                  + Add SKU
                </button>
              }
              bodyPad={false}
            >
              {missingSkuShots > 0 && (
                <div style={{ padding: '0 18px' }}>
                  <PackshotHint missing={missingSkuShots} />
                </div>
              )}
              <SkuTable skus={skus} onUpdate={updateSku} onRemove={removeSku} />
            </SectionCard>

            <div
              style={{
                background: PC.surface,
                border: `1px solid ${PC.border}`,
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: '0 1px 2px rgba(16,20,30,0.04)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  padding: '15px 18px 12px',
                  background: PC.brandWash,
                  borderBottom: `1px solid ${PC.border}`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-manrope)',
                      fontSize: 14.5,
                      fontWeight: 800,
                      color: PC.text,
                    }}
                  >
                    Tracked competitors ({competitors.length})
                  </div>
                  <div style={{ fontSize: 12, color: PC.muted, marginTop: 3, maxWidth: 520, lineHeight: 1.5 }}>
                    Add competitor products the shelf recognition should watch for — brand, name,
                    category, price, and a product photo so it&apos;s identified reliably.
                  </div>
                  {missingCompShots > 0 && <PackshotHint missing={missingCompShots} />}
                </div>
                <button onClick={addCompetitor} style={btnAdd}>
                  + Add competitor
                </button>
              </div>
              <CompetitorTable
                competitors={competitors}
                onUpdate={updateCompetitor}
                onRemove={removeCompetitor}
                onAdd={addCompetitor}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button onClick={() => setPhase('idle')} style={btnSecondary}>
                Replace image
              </button>
              <button onClick={save} disabled={phase === 'saving'} style={btnPrimary(phase === 'saving')}>
                {phase === 'saving' ? 'Saving…' : 'Save planogram'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SKU table ────────────────────────────────────────────────────────────────

function PackshotHint({ missing }: { missing: number }) {
  if (missing <= 0) return null;
  return (
    <div
      style={{
        fontSize: 11.5,
        color: PC.warn,
        marginTop: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        lineHeight: 1.4,
        fontWeight: 600,
      }}
    >
      <span aria-hidden>⚠</span>
      {missing} without a pack-shot — add photos to improve recognition.
    </div>
  );
}

function SkuTable({
  skus,
  onUpdate,
  onRemove,
}: {
  skus: ExpectedSKU[];
  onUpdate: (i: number, patch: Partial<ExpectedSKU>) => void;
  onRemove: (i: number) => void;
}) {
  if (skus.length === 0)
    return (
      <div style={{ padding: 32, textAlign: 'center', color: PC.muted, fontSize: 13 }}>
        No SKUs yet — add one or re-upload the image.
      </div>
    );
  return (
    <TableScroll>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 56 }}>Photo</th>
            <th style={th}>SKU name</th>
            <th style={th}>SKU id</th>
            <th style={th}>Category</th>
            <th style={th}>Brand</th>
            <th style={thR}>Shelf</th>
            <th style={thR}>Facings</th>
            <th style={thR}>Weight</th>
            <th style={thR}>Exp. price</th>
            <th style={{ ...th, width: 40 }} aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {skus.map((s, i) => (
            <tr key={i}>
              <td style={cellTd}>
                <RefImageCell value={s.ref_image_url} onChange={(url) => onUpdate(i, { ref_image_url: url })} />
              </td>
              <td style={cellTd}>
                <input value={s.sku_name} onChange={(e) => onUpdate(i, { sku_name: e.target.value })} style={inputStyle} />
              </td>
              <td style={cellTd}>
                <input value={s.sku_id} onChange={(e) => onUpdate(i, { sku_id: e.target.value })} style={inputStyle} />
              </td>
              <td style={cellTd}>
                <input
                  value={s.category ?? ''}
                  placeholder="—"
                  onChange={(e) => onUpdate(i, { category: e.target.value })}
                  style={inputStyle}
                />
              </td>
              <td style={cellTd}>
                <input
                  value={s.brand ?? ''}
                  placeholder="—"
                  onChange={(e) => onUpdate(i, { brand: e.target.value })}
                  style={inputStyle}
                />
              </td>
              <td style={cellTdR}>
                <input
                  type="number"
                  min={0}
                  value={s.shelf_index}
                  onChange={(e) => onUpdate(i, { shelf_index: Number(e.target.value) })}
                  style={numInputStyle}
                />
              </td>
              <td style={cellTdR}>
                <input
                  type="number"
                  min={1}
                  value={s.facings}
                  onChange={(e) => onUpdate(i, { facings: Number(e.target.value) })}
                  style={numInputStyle}
                />
              </td>
              <td style={cellTdR}>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  value={s.weight ?? 1}
                  onChange={(e) => onUpdate(i, { weight: Number(e.target.value) })}
                  style={numInputStyle}
                />
              </td>
              <td style={cellTdR}>
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  value={s.expected_price ?? ''}
                  placeholder="—"
                  onChange={(e) =>
                    onUpdate(i, { expected_price: e.target.value === '' ? null : Number(e.target.value) })
                  }
                  style={numInputStyle}
                />
              </td>
              <td style={cellTd}>
                <RemoveButton onClick={() => onRemove(i)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

// ── Competitor table ─────────────────────────────────────────────────────────

function CompetitorTable({
  competitors,
  onUpdate,
  onRemove,
  onAdd,
}: {
  competitors: PlanogramCompetitor[];
  onUpdate: (i: number, patch: Partial<PlanogramCompetitor>) => void;
  onRemove: (i: number) => void;
  onAdd: () => void;
}) {
  if (competitors.length === 0)
    return (
      <div style={{ padding: '36px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 10 }} aria-hidden>
          🏷️
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: PC.text, fontFamily: 'var(--font-manrope)' }}>
          No competitors tracked yet
        </div>
        <div style={{ fontSize: 12.5, color: PC.muted, maxWidth: 420, margin: '6px auto 16px', lineHeight: 1.5 }}>
          Add the rival SKUs you want flagged on the shelf. Each takes a product name, brand,
          category, expected price, and a product photo so recognition can identify it reliably.
        </div>
        <button onClick={onAdd} style={btnAdd}>
          + Add your first competitor
        </button>
      </div>
    );
  return (
    <TableScroll>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 56 }}>Photo</th>
            <th style={th}>Product name</th>
            <th style={th}>SKU id</th>
            <th style={th}>Brand</th>
            <th style={th}>Category</th>
            <th style={thR}>Exp. price</th>
            <th style={{ ...th, width: 40 }} aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {competitors.map((c, i) => (
            <tr key={i}>
              <td style={cellTd}>
                <RefImageCell value={c.ref_image_url} onChange={(url) => onUpdate(i, { ref_image_url: url })} />
              </td>
              <td style={cellTd}>
                <input value={c.sku_name} onChange={(e) => onUpdate(i, { sku_name: e.target.value })} style={inputStyle} />
              </td>
              <td style={cellTd}>
                <input value={c.sku_id} onChange={(e) => onUpdate(i, { sku_id: e.target.value })} style={inputStyle} />
              </td>
              <td style={cellTd}>
                <input
                  value={c.brand ?? ''}
                  placeholder="—"
                  onChange={(e) => onUpdate(i, { brand: e.target.value })}
                  style={inputStyle}
                />
              </td>
              <td style={cellTd}>
                <input
                  value={c.category ?? ''}
                  placeholder="—"
                  onChange={(e) => onUpdate(i, { category: e.target.value })}
                  style={inputStyle}
                />
              </td>
              <td style={cellTdR}>
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  value={c.expected_price ?? ''}
                  placeholder="—"
                  onChange={(e) =>
                    onUpdate(i, { expected_price: e.target.value === '' ? null : Number(e.target.value) })
                  }
                  style={numInputStyle}
                />
              </td>
              <td style={cellTd}>
                <RemoveButton onClick={() => onRemove(i)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

// Per-SKU reference-pack image: 44px thumbnail + click-to-upload. Uploads to
// /api/v1/upload/planogram_ref (public bucket) and stores the returned URL as
// ref_image_url, which shelf-recognition matches shelf products against.
function RefImageCell({ value, onChange }: { value?: string | null; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState(false);

  const upload = async (f: File) => {
    if (!/^image\//.test(f.type)) return;
    if (f.size > 8 * 1024 * 1024) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('photo', f);
      const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') : null;
      const orgId =
        typeof window !== 'undefined'
          ? JSON.parse(localStorage.getItem('kinematic_user') || '{}').org_id || ''
          : '';
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/upload/planogram_ref`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { 'X-Org-Id': orgId } : {}),
        },
        body: fd,
      });
      const json = await r.json();
      const url = json?.data?.url || json?.url;
      if (!url) throw new Error(json?.error || json?.message || 'Upload failed');
      setBroken(false);
      onChange(url);
    } catch {
      /* swallow — the cell just stays empty; user can retry */
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const empty = !value || broken;
  return (
    <div style={{ position: 'relative', width: 44, height: 44 }}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title={
          value && !broken
            ? 'Replace product image'
            : broken
            ? 'Image set but not reachable yet — re-upload to improve recognition'
            : 'No photo — add one to improve recognition'
        }
        style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          border: `1px dashed ${empty ? PC.warn + '88' : PC.border}`,
          background: empty ? PC.warnWash : PC.surface2,
          color: empty ? PC.warn : PC.muted,
          cursor: 'pointer',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
        }}
      >
        {busy ? (
          <span style={{ fontSize: 10 }}>…</span>
        ) : value && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt="ref"
            onError={() => setBroken(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span aria-hidden>{broken ? '⚠' : '+'}</span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Remove"
      style={{
        background: 'transparent',
        border: `1px solid ${PC.border}`,
        borderRadius: 8,
        color: PC.muted,
        cursor: 'pointer',
        width: 28,
        height: 28,
        lineHeight: 0,
      }}
    >
      ✕
    </button>
  );
}

function cleanCompetitor(c: PlanogramCompetitor): PlanogramCompetitor {
  return {
    sku_id: c.sku_id.trim(),
    sku_name: c.sku_name.trim(),
    brand: c.brand?.trim() || undefined,
    category: c.category?.trim() || undefined,
    expected_price: c.expected_price ?? undefined,
    ref_image_url: c.ref_image_url || undefined,
  };
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 11, color: PC.muted, marginBottom: 5, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 92,
  background: PC.surface2,
  border: `1px solid ${PC.border}`,
  color: PC.text,
  borderRadius: 8,
  padding: '8px 11px',
  fontSize: 13,
  outline: 'none',
};

const numInputStyle: React.CSSProperties = {
  ...inputStyle,
  width: 80,
  minWidth: 64,
  textAlign: 'right',
  padding: '8px 9px',
  fontVariantNumeric: 'tabular-nums',
};

const cellTd: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: `1px solid ${PC.border}`,
  verticalAlign: 'middle',
};
const cellTdR: React.CSSProperties = { ...cellTd, textAlign: 'right' };

const btnSecondary: React.CSSProperties = {
  padding: '8px 14px',
  background: PC.surface2,
  border: `1px solid ${PC.border}`,
  color: PC.text,
  borderRadius: 9,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnAdd: React.CSSProperties = {
  padding: '9px 15px',
  background: PC.brandWash,
  border: `1px solid ${PC.brand}55`,
  color: PC.brand,
  borderRadius: 9,
  fontSize: 12.5,
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

function btnPrimary(disabled = false): React.CSSProperties {
  return {
    padding: '10px 18px',
    background: PC.brand,
    color: '#fff',
    border: 'none',
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}

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
