'use client';
import { PC, SectionCard } from '../_components/planogramUi';

/**
 * Competitors — placeholder for a later phase. The full build registers
 * competitor SKUs (with a product photo) so recognition matches them reliably
 * and their price / shelf-share trends over time. For now, tracked competitors
 * are managed per-planogram from the planogram editor.
 */
export default function CompetitorsPage() {
  return (
    <SectionCard
      title="Tracked competitors"
      caption="Register competitor SKUs with a product photo so recognition matches them reliably and their price / share trends over time."
    >
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
          Coming in a later phase
        </div>
        <div style={{ fontSize: 13, color: PC.muted, marginTop: 6, maxWidth: 520, marginInline: 'auto', lineHeight: 1.55 }}>
          A dedicated competitor library — brand, category, price and reference pack-shots — with share-of-shelf and
          price movement trends across stores. Until then, add or edit the competitor SKUs a planogram tracks from its{' '}
          <span style={{ color: PC.text, fontWeight: 600 }}>Planograms</span> editor.
        </div>
      </div>
    </SectionCard>
  );
}
