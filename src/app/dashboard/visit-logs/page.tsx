'use client';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { getStoredUser } from '@/lib/auth';

const C = {
  bg: '#060910',
  card: 'rgba(14, 20, 32, 0.72)',
  border: 'rgba(30, 45, 69, 0.5)',
  white: '#E8EDF8',
  gray: '#7A8BA0',
  red: '#E01E2C',
  green: '#00D97E',
  blue: '#3E9EFF',
  orange: '#FFB800',
};

interface Visit {
  id: string;
  visitor_id: string;
  executive_id: string;
  outlet_id: string;
  rating: string;
  remarks: string;
  fe_feedback: string | null;
  fe_feedback_at: string | null;
  visited_at: string;
  date: string;
  users?: { name: string; role: string }; // Actual visitor (mapped via visitor_id)
  executive?: { name: string; role: string }; // The FE being visited
  stores?: { name: string };
}

export default function VisitLogsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchVisits = async () => {
    setLoading(true);
    try {
      // Endpoint /api/v1/visits/team returns all visits for the org
      const res = await api.get<any>(`/api/v1/visits/team?date=${date}`);
      setVisits(res.data || []);
    } catch (err) {
      console.error('Failed to fetch visits', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVisits();
  }, [date]);

  const getRatingColor = (r: string) => {
    switch (r.toLowerCase()) {
      case 'excellent': return C.green;
      case 'good': return C.blue;
      case 'average': return C.orange;
      case 'poor': return C.red;
      default: return C.gray;
    }
  };

  return (
    <div style={{ color: C.white }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, margin: 0 }}>Visit Logs</h1>
          <p style={{ color: C.gray, fontSize: 14, marginTop: 4 }}>Monitor field visits and FE feedback loop</p>
        </div>
        <input 
          type="date" 
          value={date} 
          onChange={(e) => setDate(e.target.value)}
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            padding: '8px 12px',
            borderRadius: 8,
            color: C.white,
            outline: 'none',
            fontSize: 14,
            fontFamily: 'inherit'
          }}
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
          <div style={{ width: 30, height: 30, border: `3px solid ${C.border}`, borderTopColor: C.red, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : visits.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>👁️</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>No visits recorded for this day</h3>
          <p style={{ color: C.gray, fontSize: 14, marginTop: 8 }}>Field visits logged by supervisors will appear here.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {visits.map((v) => (
            <div key={v.id} style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              transition: 'transform 0.2s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: C.red + '15', border: `1px solid ${C.red}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    👤
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{v.users?.name || 'Unknown Visitor'}</div>
                    <div style={{ fontSize: 12, color: C.gray }}>Logged a visit about <span style={{ color: C.white, fontWeight: 600 }}>{v.executive?.name || 'FE'}</span></div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ 
                    display: 'inline-block', 
                    padding: '4px 10px', 
                    borderRadius: 20, 
                    fontSize: 11, 
                    fontWeight: 700, 
                    textTransform: 'uppercase', 
                    background: getRatingColor(v.rating) + '15',
                    color: getRatingColor(v.rating),
                    border: `1px solid ${getRatingColor(v.rating)}40`
                  }}>
                    {v.rating}
                  </div>
                  <div style={{ fontSize: 11, color: C.gray, marginTop: 6 }}>
                    {new Date(v.visited_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: C.gray, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>Manager Remarks</div>
                  <div style={{ fontSize: 13, color: C.white, lineHeight: 1.5, fontStyle: 'italic' }}>
                    "{v.remarks || 'No remarks provided'}"
                  </div>
                </div>
                <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: C.gray, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>FE Response / Feedback</div>
                  {v.fe_feedback ? (
                    <div style={{ color: C.green }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>"{v.fe_feedback}"</div>
                        <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>Responded at {new Date(v.fe_feedback_at!).toLocaleString('en-IN')}</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: C.gray, fontStyle: 'italic' }}>
                      Pending FE response...
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: C.gray }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>📍</span> {v.stores?.name || 'Market Visit'}
                 </div>
                 <div style={{ width: 4, height: 4, borderRadius: '2px', background: C.border }} />
                 <div>ID: {v.id.slice(0, 8)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
