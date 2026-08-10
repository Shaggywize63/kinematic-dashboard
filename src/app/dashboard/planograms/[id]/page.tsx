'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import planogramApi, { PlanogramAssignment } from '../../../../lib/planogramApi';
import type { ExpectedSKU, Planogram, PlanogramCompetitor } from '../../../../types/planogram';
import StoreSelect from '../../../../components/StoreSelect';
import { PC, SectionCard, StateBlock, useIsCompact, TableScroll, th, thR } from '../_components/planogramUi';

const BASE = '/dashboard/planograms';

export default function PlanogramDetailPage() {
  const router = useRouter();
  const isCompact = useIsCompact();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [planogram, setPlanogram] = useState<Planogram | null>(null);
  const [assignments, setAssignments] = useState<PlanogramAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  // Editable copies
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [storeFormat, setStoreFormat] = useState('');
  const [skus, setSkus] = useState<ExpectedSKU[]>([]);
  const [competitors, setCompetitors] = useState<PlanogramCompetitor[]>([]);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [p, a] = await Promise.all([
        planogramApi.get(id),
        planogramApi.listAssignments(id).catch(() => ({ data: [] as PlanogramAssignment[] })),
      ]);
      setPlanogram(p.data);
      setName(p.data.name);
      setCategory(p.data.category || '');
      setStoreFormat(p.data.store_format || '');
      setSkus(p.data.expected_skus || []);
      setCompetitors(p.data.layout?.competitors || []);
      setAssignments((a as { data: PlanogramAssignment[] }).data || []);
      setDirty(false);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load planogram.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const updateSku = (i: number, patch: Partial<ExpectedSKU>) => {
    setSkus((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    setDirty(true);
  };
  const removeSku = (i: number) => {
    setSkus((prev) => prev.filter((_, idx) => idx !== i));
    setDirty(true);
  };
  const addSku = () => {
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
    setDirty(true);
  };

  const updateCompetitor = (i: number, patch: Partial<PlanogramCompetitor>) => {
    setCompetitors((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
    setDirty(true);
  };
  const removeCompetitor = (i: number) => {
    setCompetitors((prev) => prev.filter((_, idx) => idx !== i));
    setDirty(true);
  };
  const addCompetitor = () => {
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
    setDirty(true);
  };

  const save = async () => {
    if (!id) return;
    setSaving(true);
    setError('');
    try {
      const shelfIndices = Array.from(new Set(skus.map((s) => s.shelf_index))).sort((a, b) => a - b);
      const layout = {
        shelves: shelfIndices.map((i) => ({ index: i })),
        ...(competitors.length > 0
          ? { competitors: competitors.map((c) => cleanCompetitor(c)) }
          : {}),
      };
      const res = await planogramApi.update(id, {
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
          // Preserve confirm-crop reference pack-shots grown by the self-
          // improving library — the PATCH does a full-column replace, so
          // omitting this would silently wipe them on an admin edit.
          ...(s.additional_ref_urls && s.additional_ref_urls.length > 0
            ? { additional_ref_urls: s.additional_ref_urls }
            : {}),
        })),
      });
      setPlanogram(res.data);
      setDirty(false);
    } catch (e: any) {
      setError(e.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await planogramApi.remove(id);
      router.push(`${BASE}/library`);
    } catch (e: any) {
      setError(e.message || 'Failed to delete.');
      setSaving(false);
      setShowDelete(false);
    }
  };

  if (loading)
    return <StateBlock>Loading…</StateBlock>;

  if (error && !planogram) return <StateBlock tone="error">{error}</StateBlock>;

  const missingSkuShots = skus.filter((s) => !s.ref_image_url).length;
  const missingCompShots = competitors.filter((c) => !c.ref_image_url).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
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
          <Link
            href={`${BASE}/library`}
            style={{
              fontSize: 11,
              color: PC.muted,
              textDecoration: 'none',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            ← Planograms
          </Link>
          <div
            style={{
              fontFamily: 'var(--font-manrope)',
              fontSize: 20,
              fontWeight: 800,
              color: PC.text,
              marginTop: 4,
            }}
          >
            {planogram?.name || 'Planogram'}
          </div>
          <div style={{ fontSize: 12, color: PC.muted, marginTop: 3 }}>
            v{planogram?.version || 1} · {skus.length} SKU{skus.length === 1 ? '' : 's'} ·{' '}
            {assignments.length} active assignment{assignments.length === 1 ? '' : 's'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setShowAssign(true)} style={btnSecondary}>
            Assign to store
          </button>
          <button onClick={() => setShowDelete(true)} style={btnDanger}>
            Delete
          </button>
          <button onClick={save} disabled={!dirty || saving} style={btnPrimary(!dirty || saving)}>
            {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </div>

      {error && <StateBlock tone="error">{error}</StateBlock>}

      {/* Meta */}
      <SectionCard title="Planogram details">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr 1fr',
            gap: 12,
          }}
        >
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              style={inputStyle}
            />
          </Field>
          <Field label="Category">
            <input
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setDirty(true);
              }}
              style={inputStyle}
              placeholder="Beverages, Snacks…"
            />
          </Field>
          <Field label="Store format">
            <select
              value={storeFormat}
              onChange={(e) => {
                setStoreFormat(e.target.value);
                setDirty(true);
              }}
              style={inputStyle}
            >
              <option value="">—</option>
              <option value="modern_trade">Modern trade</option>
              <option value="general_trade">General trade</option>
              <option value="hyper">Hyper</option>
            </select>
          </Field>
        </div>
      </SectionCard>

      {/* SKU editor */}
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

      {/* Tracked competitors */}
      <div
        id="competitors"
        style={{
          background: PC.surface,
          border: `1px solid ${PC.border}`,
          borderRadius: 14,
          overflow: 'hidden',
          scrollMarginTop: 16,
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
              Add competitor products the shelf recognition should watch for — brand, name, category,
              price, and a product photo so it&apos;s identified reliably.
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

      {/* Assignments */}
      <SectionCard title="Store assignments" caption="Stores currently scored against this planogram" bodyPad={false}>
        {assignments.length === 0 ? (
          <StateBlock>Not assigned to any store yet.</StateBlock>
        ) : (
          <div>
            {assignments.map((a, i) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '12px 18px',
                  borderTop: i === 0 ? 'none' : `1px solid ${PC.border}`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: PC.text }}>
                    {a.store_id
                      ? `Store ${a.store_id.slice(0, 8)}…`
                      : a.zone_id
                      ? `Zone ${a.zone_id.slice(0, 8)}…`
                      : `City ${a.city_id?.slice(0, 8) || ''}…`}
                  </div>
                  <div style={{ fontSize: 11, color: PC.muted, marginTop: 2 }}>
                    {a.valid_from} → {a.valid_to || 'open-ended'}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (!id) return;
                    if (!confirm('Remove this assignment?')) return;
                    try {
                      await planogramApi.unassign(id, a.id);
                      setAssignments((prev) => prev.filter((x) => x.id !== a.id));
                    } catch (e: any) {
                      setError(e.message || 'Failed to remove assignment.');
                    }
                  }}
                  style={btnGhostDanger}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Modals */}
      {showAssign && id && (
        <AssignModal
          planogramId={id}
          onClose={() => setShowAssign(false)}
          onAssigned={(a) => {
            setAssignments((prev) => [a, ...prev]);
            setShowAssign(false);
          }}
        />
      )}
      {showDelete && (
        <ConfirmModal
          title="Delete planogram?"
          body="This permanently removes the planogram, its assignments, and any compliance history."
          confirmLabel="Delete"
          danger
          onConfirm={remove}
          onCancel={() => setShowDelete(false)}
          busy={saving}
        />
      )}
    </div>
  );
}

// ── Assign-store modal ─────────────────────────────────────────────────

function AssignModal({
  planogramId,
  onClose,
  onAssigned,
}: {
  planogramId: string;
  onClose: () => void;
  onAssigned: (a: PlanogramAssignment) => void;
}) {
  const [storeId, setStoreId] = useState('');
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [validTo, setValidTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!storeId) {
      setErr('Pick a store to assign this planogram to.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const res = await planogramApi.assign(planogramId, {
        store_id: storeId,
        valid_from: validFrom || undefined,
        valid_to: validTo || null,
      });
      onAssigned(res.data);
    } catch (e: any) {
      setErr(e.message || 'Assignment failed.');
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Assign to a store" onClose={onClose}>
      {err && (
        <div
          style={{
            background: PC.badWash,
            border: `1px solid ${PC.bad}55`,
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 12,
            color: PC.bad,
            marginBottom: 12,
          }}
        >
          {err}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
        <Field label="Store">
          <StoreSelect value={storeId} onChange={(id) => setStoreId(id)} placeholder="Search registered outlets…" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Valid from">
            <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Valid to (optional)">
            <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} style={inputStyle} />
          </Field>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button onClick={onClose} style={btnSecondary}>
          Cancel
        </button>
        <button onClick={submit} disabled={busy || !storeId} style={btnPrimary(busy || !storeId)}>
          {busy ? 'Assigning…' : 'Assign'}
        </button>
      </div>
    </ModalShell>
  );
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <ModalShell title={title} onClose={onCancel}>
      <div style={{ fontSize: 13, color: PC.muted, lineHeight: 1.55 }}>{body}</div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
        <button onClick={onCancel} style={btnSecondary}>
          Cancel
        </button>
        <button onClick={onConfirm} disabled={busy} style={danger ? btnDangerSolid(busy) : btnPrimary(busy)}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          background: PC.surface,
          border: `1px solid ${PC.border}`,
          borderRadius: 16,
          width: '100%',
          maxWidth: 520,
          padding: 22,
          position: 'relative',
          boxShadow: '0 20px 48px rgba(16,20,30,0.28)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: PC.surface2,
            border: `1px solid ${PC.border}`,
            color: PC.muted,
            borderRadius: 8,
            width: 28,
            height: 28,
            cursor: 'pointer',
            lineHeight: 0,
          }}
        >
          ✕
        </button>
        <div
          style={{
            fontFamily: 'var(--font-manrope)',
            fontSize: 16,
            fontWeight: 800,
            color: PC.text,
            marginBottom: 16,
          }}
        >
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

// ── SKU + competitor tables (inlined to avoid cross-file churn) ─────────────

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
        No SKUs yet — add one.
      </div>
    );
  return (
    <TableScroll>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 56 }}>Ref</th>
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

function cleanCompetitor(c: PlanogramCompetitor): PlanogramCompetitor {
  return {
    sku_id: c.sku_id.trim(),
    sku_name: c.sku_name.trim(),
    brand: c.brand?.trim() || undefined,
    category: c.category?.trim() || undefined,
    expected_price: c.expected_price ?? undefined,
    ref_image_url: c.ref_image_url || undefined,
    // Preserve confirm-crop reference pack-shots grown by the self-improving
    // library — the PATCH does a full-column replace, so omitting this would
    // silently wipe them on an admin edit.
    ...(c.additional_ref_urls && c.additional_ref_urls.length > 0
      ? { additional_ref_urls: c.additional_ref_urls }
      : {}),
  };
}

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
      // Same shape as the lead-photo upload: Authorization + X-Org-Id. The
      // backend resolves the Supabase project from the token's issuer, so the
      // reference lands in the caller's own project's public bucket.
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
            ? 'Replace reference image'
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: PC.muted, marginBottom: 5, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}

/** Subtle nudge counting rows with no pack-shot — recognition relies on them. */
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

const btnDanger: React.CSSProperties = {
  padding: '8px 14px',
  background: PC.badWash,
  border: `1px solid ${PC.bad}55`,
  color: PC.bad,
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

const btnGhostDanger: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: PC.bad,
  fontSize: 11.5,
  fontWeight: 700,
  cursor: 'pointer',
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

function btnDangerSolid(disabled = false): React.CSSProperties {
  return {
    padding: '10px 18px',
    background: PC.bad,
    color: '#fff',
    border: 'none',
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}
