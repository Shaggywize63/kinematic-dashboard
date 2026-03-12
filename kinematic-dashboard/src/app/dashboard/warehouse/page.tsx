'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';

const C = {
  red:'#E01E2C',
  green:'#00D97E',
  yellow:'#FFB800',
  blue:'#3E9EFF',
  gray:'#7A8BA0',
  grayd:'#2E445E',
  s2:'#131B2A',
  border:'#1E2D45'
};

type Category = 'all' | 'product' | 'tool' | 'asset';

interface WarehouseSummary {
  total_skus: number;
  low_stock: number;
  fully_allocated: number;
}

interface WarehouseItem {
  id: string;
  name: string;
  sku: string;
  total: number;
  allocated: number;
  consumed: number;
  category: 'product' | 'tool' | 'asset';
}

export default function WarehousePage() {
  const [filter, setFilter] = useState<Category>('all');
  const [summary, setSummary] = useState<WarehouseSummary | null>(null);
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchWarehouse = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, itemsRes] = await Promise.all([
        api.get<any>('/api/v1/warehouse/summary'),
        api.get<any>('/api/v1/warehouse/inventory'),
      ]);

      const s = summaryRes as any;
      const l = itemsRes as any;

      setSummary(s.data || s);
      setItems(l.data || l.items || []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load warehouse data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWarehouse();
  }, [fetchWarehouse]);

  const shown = useMemo(
    () => items.filter(i => filter === 'all' || i.category === filter),
    [items, filter]
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'flex', gap:8 }}>
        {(['all','product','tool','asset'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding:'9px 16px',
              borderRadius:10,
              border:'1px solid',
              fontSize:12,
              fontWeight:600,
              cursor:'pointer',
              fontFamily:"'DM Sans',sans-serif",
              background: filter===f ? C.blue : '#0E1420',
              borderColor: filter===f ? C.blue : C.border,
              color: filter===f ? '#fff' : C.gray,
              transition:'all 0.15s',
              textTransform:'capitalize'
            }}
          >
            {f}
          </button>
        ))}
        <button
          onClick={fetchWarehouse}
          style={{
            marginLeft:'auto',
            padding:'9px 16px',
            borderRadius:10,
            border:`1px solid ${C.border}`,
            fontSize:12,
            fontWeight:600,
            cursor:'pointer',
            fontFamily:"'DM Sans',sans-serif",
            background:'#0E1420',
            color:C.gray
          }}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div style={{
          background:'rgba(224,30,44,0.08)',
          border:'1px solid rgba(224,30,44,0.2)',
          borderRadius:12,
          padding:'12px 16px',
          fontSize:13,
          color:C.red
        }}>
          {error}
        </div>
      )}

      <div style={{ display:'flex', gap:12 }}>
        {[
          { l:'Total SKUs', v: loading ? '—' : String(summary?.total_skus ?? 0), c:C.blue },
          { l:'Low Stock', v: loading ? '—' : String(summary?.low_stock ?? 0), c:C.red },
          { l:'Fully Allocated', v: loading ? '—' : String(summary?.fully_allocated ?? 0), c:C.green }
        ].map(s => (
          <div key={s.l} style={{ flex:1, background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:14, padding:18 }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:28, fontWeight:800, color:s.c }}>{s.v}</div>
            <div style={{ fontSize:12, color:C.gray, marginTop:4 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:24, textAlign:'center', color:C.grayd, fontSize:13 }}>
          Loading warehouse data...
        </div>
      ) : shown.length === 0 ? (
        <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:24, textAlign:'center', color:C.grayd, fontSize:13 }}>
          No warehouse data available
        </div>
      ) : (
        shown.map((item) => {
          const allocPct = item.total ? Math.round((item.allocated / item.total) * 100) : 0;
          const consPct = item.total ? Math.round((item.consumed / item.total) * 100) : 0;
          const remaining = item.allocated - item.consumed;
          const remainingPct = item.total ? Math.max(0, Math.round((remaining / item.total) * 100)) : 0;
          const isLow = remaining < 50 && item.category === 'product';

          return (
            <div
              key={item.id}
              style={{
                background:'#0E1420',
                border:`1px solid ${isLow ? C.red+'30' : C.border}`,
                borderRadius:16,
                padding:20
              }}
            >
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700 }}>{item.name}</div>
                  <div style={{ fontSize:11, color:C.grayd, marginTop:2 }}>
                    {item.sku} · <span style={{ textTransform:'capitalize' }}>{item.category}</span>
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  {isLow && (
                    <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, background:'rgba(224,30,44,0.12)', color:C.red }}>
                      LOW STOCK
                    </span>
                  )}
                  <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, background:'rgba(62,158,255,0.1)', color:C.blue }}>
                    Total: {item.total}
                  </span>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                {[
                  { l:'Allocated', v:item.allocated, p:allocPct, c:C.blue },
                  { l:'Consumed', v:item.consumed, p:consPct, c:C.green },
                  { l:'Remaining', v:remaining, p:remainingPct, c:isLow ? C.red : C.yellow }
                ].map(s => (
                  <div key={s.l}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:12 }}>
                      <span style={{ color:C.gray }}>{s.l}</span>
                      <span style={{ fontWeight:700, color:s.c }}>{s.v}</span>
                    </div>
                    <div style={{ height:5, background:C.s2, borderRadius:2.5, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${Math.min(100, Math.max(0, s.p))}%`, background:s.c, borderRadius:2.5 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
