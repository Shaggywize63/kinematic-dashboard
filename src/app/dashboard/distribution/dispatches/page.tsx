'use client';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, inr, fmtDate, statusColor } from '../../../../components/distribution/Atoms';

export default function DispatchesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try { const r: any = await api.getDispatches(); setItems(r?.data || r || []); } catch {} setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const generate = async (id: string) => { await api.attachEwayBill(id, { generate: true }); await load(); };
  const markOut = async (id: string) => { try { await api.markDispatchOut(id); await load(); } catch (e: any) { alert(e.message); } };

  return (
    <div>
      <PageHeader title="Dispatches" subtitle="Vehicle-level grouping with e-way bill control" />

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th>Dispatch #</Th><Th>Distributor</Th><Th>Vehicle</Th><Th>Driver</Th><Th>EWB</Th><Th>Status</Th><Th style={{ textAlign: 'right' }}>Total</Th><Th />
          </tr></thead>
          <tbody>
            {loading ? <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr> :
              items.map((d) => (
                <tr key={d.id}>
                  <Td style={{ fontWeight: 700 }}>{d.dispatch_no}</Td>
                  <Td>{d.distributor_id?.slice(0, 8)}…</Td>
                  <Td style={{ fontFamily: 'JetBrains Mono, monospace' }}>{d.vehicle_no || '—'}</Td>
                  <Td>{d.driver_name || '—'}</Td>
                  <Td>{d.eway_bill_no ? <Pill color="green">{d.eway_bill_no}</Pill> : (Number(d.total_value) > 50000 ? <Pill color="red">required</Pill> : <Pill color="gray">—</Pill>)}</Td>
                  <Td><Pill color={statusColor(d.status)}>{d.status}</Pill></Td>
                  <Td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(d.total_value)}</Td>
                  <Td>
                    {d.status === 'prepared' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {!d.eway_bill_no && Number(d.total_value) > 50000 && <Btn variant="ghost" onClick={() => generate(d.id)}>+ EWB</Btn>}
                        <Btn onClick={() => markOut(d.id)}>Mark out</Btn>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            {!loading && !items.length && <tr><Td colSpan={8 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No dispatches yet.</Td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
