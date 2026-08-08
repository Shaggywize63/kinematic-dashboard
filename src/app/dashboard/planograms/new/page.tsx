'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import planogramApi, { ParsedPlanogram } from '../../../../lib/planogramApi';
import type { ExpectedSKU, PlanogramCompetitor } from '../../../../types/planogram';

const C = {
  red: '#E01E2C',
  green: '#00D97E',
  yellow: '#FFB800',
  blue: '#3E9EFF',
  gray: 'var(--textSec)',
  grayd: 'var(--textTert)',
  s2: 'var(--s2)',
  border: 'var(--border)',
};

type Phase = 'idle' | 'parsing' | 'review' | 'saving';

export default function NewPlanogramPage() {
  const router = useRouter();
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
      router.push(`/dashboard/planograms/${res.data.id}`);
    } catch (e: any) {
      setError(e.message || 'Failed to save planogram.');
      setPhase('review');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800 }}>
            New planogram
          </div>
          <div style={{ fontSize: 13, color: C.gray, marginTop: 3 }}>
            Upload a brand planogram image — AI extracts the shelf layout for you to review.
          </div>
        </div>
        <button onClick={() => router.push('/dashboard/planograms/library')} style={btnSecondary}>Cancel</button>
      </div>

      {error && (
        <div style={{ background: 'rgba(224,30,44,0.08)', border: '1px solid rgba(224,30,44,0.2)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: C.red }}>
          {error}
        </div>
      )}

      {phase === 'idle' && (
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          style={{ background: 'var(--s1)', border: `2px dashed ${C.border}`, borderRadius: 16, padding: 60, textAlign: 'center', cursor: 'pointer' }}
        >
          <div style={{ fontSize: 48, marginBottom: 14 }}>📐</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Drop a planogram image here</div>
          <div style={{ fontSize: 13, color: C.gray }}>or click to browse — JPG, PNG, WebP up to 10 MB</div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}

      {phase === 'parsing' && (
        <div style={{ background: 'var(--s1)', border: `1px solid ${C.border}`, borderRadius: 16, padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: C.gray, marginBottom: 12 }}>Analyzing planogram with AI…</div>
          <div style={{ height: 4, background: C.s2, borderRadius: 2, maxWidth: 240, margin: '0 auto', overflow: 'hidden' }}>
            <div style={{ width: '40%', height: '100%', background: C.red, animation: 'kmpg-slide 1.4s ease-in-out infinite' }} />
          </div>
          <style jsx>{`@keyframes kmpg-slide { 0% { transform: translateX(-120%); } 100% { transform: translateX(280%); } }`}</style>
        </div>
      )}

      {(phase === 'review' || phase === 'saving') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14 }}>
          <div style={{ background: 'var(--s1)', border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, alignSelf: 'flex-start' }}>
            <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>
              Source · AI confidence{' '}
              <span style={{ fontWeight: 700, color: confidence >= 0.7 ? C.green : confidence >= 0.5 ? C.yellow : C.red }}>
                {Math.round(confidence * 100)}%
              </span>
            </div>
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Planogram source" style={{ width: '100%', height: 'auto', borderRadius: 10, display: 'block' }} />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--s1)', border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Name" full>
                <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Category">
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Beverages" style={inputStyle} />
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

            <div style={{ background: 'var(--s1)', border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700 }}>
                    Expected SKUs ({skus.length})
                  </div>
                  <PackshotHint missing={skus.filter((s) => !s.ref_image_url).length} />
                </div>
                <button onClick={addSku} style={btnSecondary}>+ Add SKU</button>
              </div>
              <SkuTable skus={skus} onUpdate={updateSku} onRemove={removeSku} />
            </div>

            <div style={{ background: 'var(--s1)', border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '16px 18px', borderBottom: `1px solid ${C.border}`, background: 'rgba(224,30,44,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ fontSize: 20, lineHeight: 1.1 }}>🎯</div>
                  <div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800 }}>
                      Tracked competitors ({competitors.length})
                    </div>
                    <div style={{ fontSize: 12, color: C.gray, marginTop: 3, maxWidth: 520, lineHeight: 1.5 }}>
                      Add competitor products the shelf recognition should watch for — brand, name, category, price, and a product photo so it&apos;s identified reliably.
                    </div>
                    <PackshotHint missing={competitors.filter((c) => !c.ref_image_url).length} />
                  </div>
                </div>
                <button onClick={addCompetitor} style={btnAdd}>+ Add competitor</button>
              </div>
              <CompetitorTable competitors={competitors} onUpdate={updateCompetitor} onRemove={removeCompetitor} onAdd={addCompetitor} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setPhase('idle')} style={btnSecondary}>Replace image</button>
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

const SKU_GRID = '52px 1.8fr 1.2fr 1.2fr 1.1fr 0.7fr 0.7fr 0.7fr 1fr 36px';

function PackshotHint({ missing }: { missing: number }) {
  if (missing <= 0) return null;
  return (
    <div style={{ fontSize: 11, color: C.yellow, marginTop: 3, display: 'flex', alignItems: 'center', gap: 5, lineHeight: 1.4 }}>
      <span aria-hidden>⚠</span>
      {missing} without a pack-shot — add photos to improve recognition.
    </div>
  );
}

function SkuTable({
  skus, onUpdate, onRemove,
}: { skus: ExpectedSKU[]; onUpdate: (i: number, patch: Partial<ExpectedSKU>) => void; onRemove: (i: number) => void; }) {
  if (skus.length === 0)
    return <div style={{ padding: 36, textAlign: 'center', color: 'var(--textTert)', fontSize: 13 }}>No SKUs yet — add one or re-upload the image.</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 972 }}>
        <div style={{ display: 'grid', gridTemplateColumns: SKU_GRID, gap: 8, padding: '10px 18px', fontSize: 10, color: 'var(--textSec)', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid var(--border)' }}>
          <span>Photo</span><span>SKU name</span><span>SKU id</span><span>Category</span><span>Brand</span><span>Shelf</span><span>Facings</span><span>Weight</span><span>Exp. price</span><span />
        </div>
        {skus.map((s, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: SKU_GRID, gap: 8, padding: '10px 18px', borderBottom: '1px solid rgba(122,139,160,0.15)', alignItems: 'center' }}>
            <RefImageCell value={s.ref_image_url} onChange={(url) => onUpdate(i, { ref_image_url: url })} />
            <input value={s.sku_name} onChange={(e) => onUpdate(i, { sku_name: e.target.value })} style={inputStyle} />
            <input value={s.sku_id} onChange={(e) => onUpdate(i, { sku_id: e.target.value })} style={inputStyle} />
            <input value={s.category ?? ''} placeholder="—" onChange={(e) => onUpdate(i, { category: e.target.value })} style={inputStyle} />
            <input value={s.brand ?? ''} placeholder="—" onChange={(e) => onUpdate(i, { brand: e.target.value })} style={inputStyle} />
            <input type="number" min={0} value={s.shelf_index} onChange={(e) => onUpdate(i, { shelf_index: Number(e.target.value) })} style={inputStyle} />
            <input type="number" min={1} value={s.facings} onChange={(e) => onUpdate(i, { facings: Number(e.target.value) })} style={inputStyle} />
            <input type="number" step={0.1} min={0} value={s.weight ?? 1} onChange={(e) => onUpdate(i, { weight: Number(e.target.value) })} style={inputStyle} />
            <input type="number" step={0.01} min={0} value={s.expected_price ?? ''} placeholder="—" onChange={(e) => onUpdate(i, { expected_price: e.target.value === '' ? null : Number(e.target.value) })} style={inputStyle} />
            <button onClick={() => onRemove(i)} title="Remove" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--textSec)', cursor: 'pointer', width: 28, height: 28 }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

const COMP_GRID = '52px 1.8fr 1.1fr 1.1fr 1.1fr 0.9fr 36px';

function CompetitorTable({
  competitors, onUpdate, onRemove, onAdd,
}: { competitors: PlanogramCompetitor[]; onUpdate: (i: number, patch: Partial<PlanogramCompetitor>) => void; onRemove: (i: number) => void; onAdd: () => void; }) {
  if (competitors.length === 0)
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 30, marginBottom: 10 }}>🏷️</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>No competitors tracked yet</div>
        <div style={{ fontSize: 12.5, color: C.gray, maxWidth: 420, margin: '0 auto 16px', lineHeight: 1.5 }}>
          Add the rival SKUs you want flagged on the shelf. Each takes a product name, brand, category, expected price, and a product photo so recognition can identify it reliably.
        </div>
        <button onClick={onAdd} style={btnAdd}>+ Add your first competitor</button>
      </div>
    );
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 780 }}>
        <div style={{ display: 'grid', gridTemplateColumns: COMP_GRID, gap: 8, padding: '10px 18px', fontSize: 10, color: 'var(--textSec)', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid var(--border)' }}>
          <span>Photo</span><span>Product name</span><span>SKU id</span><span>Brand</span><span>Category</span><span>Exp. price</span><span />
        </div>
        {competitors.map((c, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: COMP_GRID, gap: 8, padding: '10px 18px', borderBottom: '1px solid rgba(122,139,160,0.15)', alignItems: 'center' }}>
            <RefImageCell value={c.ref_image_url} onChange={(url) => onUpdate(i, { ref_image_url: url })} />
            <input value={c.sku_name} onChange={(e) => onUpdate(i, { sku_name: e.target.value })} style={inputStyle} />
            <input value={c.sku_id} onChange={(e) => onUpdate(i, { sku_id: e.target.value })} style={inputStyle} />
            <input value={c.brand ?? ''} placeholder="—" onChange={(e) => onUpdate(i, { brand: e.target.value })} style={inputStyle} />
            <input value={c.category ?? ''} placeholder="—" onChange={(e) => onUpdate(i, { category: e.target.value })} style={inputStyle} />
            <input type="number" step={0.01} min={0} value={c.expected_price ?? ''} placeholder="—" onChange={(e) => onUpdate(i, { expected_price: e.target.value === '' ? null : Number(e.target.value) })} style={inputStyle} />
            <button onClick={() => onRemove(i)} title="Remove" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--textSec)', cursor: 'pointer', width: 28, height: 28 }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Per-SKU reference-pack image: 44px thumbnail + click-to-upload. Uploads to
// /api/v1/upload/planogram_ref (public bucket) and stores the returned URL as
// ref_image_url, which shelf-recognition matches shelf products against.
function RefImageCell({
  value,
  onChange,
}: {
  value?: string | null;
  onChange: (url: string) => void;
}) {
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
          border: `1px dashed ${empty ? 'rgba(255,184,0,0.55)' : 'var(--border)'}`,
          background: empty ? 'rgba(255,184,0,0.08)' : 'var(--s2)',
          color: empty ? '#FFB800' : 'var(--textTert)',
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

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean; }) {
  return (
    <div style={{ gridColumn: full ? 'span 2' : undefined }}>
      <div style={{ fontSize: 11, color: 'var(--textSec)', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--text, #E8EDF8)', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: "'DM Sans',sans-serif" };
const btnSecondary: React.CSSProperties = { padding: '8px 14px', background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--textSec)', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" };
const btnAdd: React.CSSProperties = { padding: '9px 16px', background: 'rgba(224,30,44,0.1)', border: '1px solid rgba(224,30,44,0.35)', color: '#E01E2C', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", whiteSpace: 'nowrap' };
function btnPrimary(disabled = false): React.CSSProperties { return { padding: '10px 18px', background: '#E01E2C', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, fontFamily: "'DM Sans',sans-serif" }; }

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
