'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import planogramApi from '../../../../lib/planogramApi';
import { useCityScope } from '../../../../context/CityScopeContext';
import type { CaptureListItem } from '../../../../types/planogram';
import {
  PC,
  fmtDate,
  ScorePill,
  SectionCard,
  StateBlock,
  TableScroll,
  th,
  thR,
  td,
  tdR,
} from '../_components/planogramUi';

/** Human-readable reason a capture landed in the review queue, synthesized from
 *  whatever signals the list row carries. */
function reasonFor(c: CaptureListItem): string {
  const parts: string[] = [];
  if (c.competitor_present) parts.push('competitor on shelf');
  if (c.recovered_count && c.recovered_count > 0)
    parts.push(`${c.recovered_count} recovered detection${c.recovered_count === 1 ? '' : 's'}`);
  if (c.score != null && c.score < 65) parts.push('low compliance score');
  return parts.length ? parts.join(' · ') : 'Low-confidence detections — confirm or correct to train the model';
}

export default function ReviewQueuePage() {
  const { selectedCity } = useCityScope();
  const router = useRouter();
  const [rows, setRows] = useState<CaptureListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await planogramApi.listCaptures({
        city: selectedCity || undefined,
        needs_review: true,
        limit: 500,
      });
      // Safety net: show only rows actually flagged. If the backend does not
      // yet return `needs_review`, this yields an empty queue (correct: we must
      // not present every capture as "pending review").
      const flagged = (res.data.captures || []).filter((c) => c.needs_review === true);
      setRows(flagged);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load review queue');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCity]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SectionCard
      title="Review queue"
      caption={
        loading
          ? 'Loading…'
          : `Captures the AI flagged as low-confidence — confirm or correct to train the model. ${rows.length} pending.`
      }
      bodyPad={false}
    >
      {error ? (
        <div style={{ padding: 16 }}>
          <StateBlock tone="error">{error}</StateBlock>
        </div>
      ) : loading ? (
        <StateBlock>Loading review queue…</StateBlock>
      ) : rows.length === 0 ? (
        <StateBlock>Nothing to review — every recent capture cleared the confidence gate.</StateBlock>
      ) : (
        <TableScroll>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>
                <th style={th}>Store</th>
                <th style={th}>Reason</th>
                <th style={th}>Date</th>
                <th style={thR}>Compliance</th>
                <th style={thR} aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
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
                      {c.store_name || 'Unknown store'}
                    </Link>
                    {c.city && <div style={{ fontSize: 11, color: PC.muted }}>{c.city}</div>}
                  </td>
                  <td style={{ ...td, color: PC.muted }}>{reasonFor(c)}</td>
                  <td style={{ ...td, color: PC.muted, whiteSpace: 'nowrap' }}>{fmtDate(c.captured_at)}</td>
                  <td style={tdR}>
                    <ScorePill score={c.score} />
                  </td>
                  <td style={tdR}>
                    <Link
                      href={`/dashboard/planograms/captures/${c.id}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        border: `1px solid ${PC.warn}55`,
                        background: PC.warnWash,
                        color: PC.warn,
                        borderRadius: 8,
                        padding: '5px 11px',
                        fontSize: 12,
                        fontWeight: 700,
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Review →
                    </Link>
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
