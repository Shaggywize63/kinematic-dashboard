'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

const C = {
  red: '#E01E2C',
  green: '#00D97E',
  blue: '#3E9EFF',
  purple: '#9B6EFF',
  gray: '#7A8BA0',
  grayd: '#2E445E',
  graydd: '#1A2738',
  s1: '#070D18',
  s2: '#0E1420',
  s3: '#131B2A',
  s4: '#1A2438',
  border: '#1E2D45',
  white: '#E8EDF8',
};

interface User {
  id: string;
  name: string;
  role: string;
  city?: string;
  zones?: { city?: string };
}

interface Notification {
  id: string;
  title: string;
  body: string;
  priority: string;
  audience_summary: string;
  created_at: string;
  recipients_count: number;
  read_count: number;
}

export default function NotificationsPage() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('info');
  const [audienceMode, setAudienceMode] = useState<'hierarchy' | 'groups'>('hierarchy');

  // Filters
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedSups, setSelectedSups] = useState<string[]>([]);
  const [selectedFes, setSelectedFes] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  // Data
  const [allFes, setAllFes] = useState<User[]>([]);
  const [allSups, setAllSups] = useState<User[]>([]);
  const [allCms, setAllCms] = useState<User[]>([]);
  const [groups, setGroups] = useState<{id: string, name: string}[]>([]);
  const [history, setHistory] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [uR, sR, cR, hR] = await Promise.all([
        api.get('/api/v1/users?role=executive&limit=500'),
        api.get('/api/v1/users?role=supervisor&limit=200'),
        api.get('/api/v1/users?role=city_manager&limit=100'),
        api.get('/api/v1/notifications/history'),
      ]);
      setAllFes(uR.data || []);
      setAllSups(sR.data || []);
      setAllCms(cR.data || []);
      setHistory(hR.data || []);
      // Mock groups for now
      setGroups([
        { id: 'g1', name: 'Promo Team' },
        { id: 'g2', name: 'New Joiners' },
        { id: 'g3', name: 'Top Performers' }
      ]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const allCities = Array.from(new Set([
    ...allFes.map(u => u.zones?.city || u.city || ''),
    ...allSups.map(u => u.zones?.city || u.city || ''),
    ...allCms.map(u => u.zones?.city || u.city || '')
  ].filter(Boolean))).sort();

  const handleSend = async () => {
    if (!title || !message) return alert('Title and message are required');
    setSending(true);
    try {
      await api.post('/api/v1/notifications/send', {
        title,
        body: message,
        priority,
        targeting: {
          mode: audienceMode,
          cities: selectedCities,
          supervisors: selectedSups,
          executives: selectedFes,
          groups: selectedGroups
        }
      });
      alert('Notification sent successfully');
      setTitle('');
      setMessage('');
      fetchData();
    } catch (e: any) {
      alert(e.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
      <div style={{ display: 'flex', gap: 24 }}>
        {/* Left: Composer */}
        <div style={{ flex: 1, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Create Notification</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: C.gray, fontWeight: 600, display: 'block', marginBottom: 6 }}>TITLE</label>
              <input 
                value={title} 
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Urgent Update"
                style={{ width: '100%', background: C.s3, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', color: '#fff', outline: 'none' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, color: C.gray, fontWeight: 600, display: 'block', marginBottom: 6 }}>MESSAGE</label>
              <textarea 
                value={message} 
                onChange={e => setMessage(e.target.value)}
                placeholder="Type your message here..."
                rows={4}
                style={{ width: '100%', background: C.s3, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', color: '#fff', outline: 'none', resize: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: C.gray, fontWeight: 600, display: 'block', marginBottom: 6 }}>PRIORITY</label>
                <select 
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  style={{ width: '100%', background: C.s3, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px', color: '#fff', outline: 'none' }}
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12, color: C.gray, fontWeight: 600, display: 'block', marginBottom: 12 }}>TARGET AUDIENCE</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {['hierarchy', 'groups'].map(m => (
                  <button
                    key={m}
                    onClick={() => setAudienceMode(m as any)}
                    style={{ 
                      padding: '8px 16px', 
                      borderRadius: 10, 
                      fontSize: 12, 
                      fontWeight: 600, 
                      border: `1px solid ${audienceMode === m ? C.red : C.border}`,
                      background: audienceMode === m ? C.red : C.s3,
                      color: audienceMode === m ? '#fff' : C.gray,
                      cursor: 'pointer'
                    }}
                  >
                    {m === 'hierarchy' ? 'Hierarchy (City/Role)' : 'Groups / Tags'}
                  </button>
                ))}
              </div>

              {audienceMode === 'hierarchy' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <MultiSelect label="Cities" options={allCities} selected={selectedCities} onChange={setSelectedCities} />
                  <MultiSelect label="Supervisors" options={allSups.map(s => s.name)} selected={selectedSups} onChange={setSelectedSups} />
                  <MultiSelect label="Field Executives" options={allFes.map(f => f.name)} selected={selectedFes} onChange={setSelectedFes} />
                </div>
              ) : (
                <MultiSelect label="Select Groups" options={groups.map(g => g.name)} selected={selectedGroups} onChange={setSelectedGroups} />
              )}
            </div>

            <button
              onClick={handleSend}
              disabled={sending}
              style={{ marginTop: 12, width: '100%', padding: '14px', background: C.red, border: 'none', borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: sending ? 0.7 : 1 }}
            >
              {sending ? 'Sending...' : 'Send Notification Now'}
            </button>
          </div>
        </div>

        {/* Right: Summary/Stats */}
        <div style={{ width: 320, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Reach Summary</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
             <StatRow label="FEs Targeted" value={selectedFes.length || 'All'} color={C.blue} />
             <StatRow label="SUPs Targeted" value={selectedSups.length || 'All'} color={C.green} />
             <StatRow label="Cities" value={selectedCities.length || 'All'} color={C.purple} />
             <div style={{ marginTop: 20, padding: 16, background: C.s3, borderRadius: 12, border: `1px solid ${C.border}` }}>
               <div style={{ fontSize: 11, color: C.gray, fontWeight: 600, marginBottom: 4 }}>ESTIMATED REACH</div>
               <div style={{ fontSize: 24, fontWeight: 800 }}>~420 Users</div>
             </div>
          </div>
        </div>
      </div>

      {/* Sent History */}
      <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Sent History</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}`, textAlign: 'left', color: C.gray }}>
              <th style={{ padding: '12px 8px' }}>NOTIFICATION</th>
              <th style={{ padding: '12px 8px' }}>AUDIENCE</th>
              <th style={{ padding: '12px 8px' }}>PRIORITY</th>
              <th style={{ padding: '12px 8px' }}>READ RATE</th>
              <th style={{ padding: '12px 8px' }}>SENT AT</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: C.gray }}>No sent history found</td></tr>
            ) : history.map(h => (
              <tr key={h.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '16px 8px' }}>
                  <div style={{ fontWeight: 600 }}>{h.title}</div>
                  <div style={{ fontSize: 11, color: C.gray }}>{h.body.slice(0, 40)}...</div>
                </td>
                <td style={{ padding: '16px 8px' }}>{h.audience_summary}</td>
                <td style={{ padding: '16px 8px' }}>
                  <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: h.priority === 'critical' ? 'rgba(224,30,44,0.1)' : 'rgba(122,139,160,0.1)', color: h.priority === 'critical' ? C.red : C.gray }}>
                    {h.priority.toUpperCase()}
                  </span>
                </td>
                <td style={{ padding: '16px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 4, background: C.s3, borderRadius: 2 }}>
                       <div style={{ width: `${(h.read_count/h.recipients_count)*100}%`, height: '100%', background: C.green, borderRadius: 2 }} />
                    </div>
                    <span>{h.read_count}/{h.recipients_count}</span>
                  </div>
                </td>
                <td style={{ padding: '16px 8px', color: C.gray }}>{new Date(h.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MultiSelect({ label, options, selected, onChange }: { label: string, options: string[], selected: string[], onChange: (v: string[]) => void }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, fontWeight: 600, marginBottom: 4 }}>{label.toUpperCase()}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 10, padding: 8, minHeight: 40 }}>
        {selected.length === 0 && <span style={{ color: C.grayd, fontSize: 12, padding: '4px 6px' }}>None selected (targets all)</span>}
        {selected.map(s => (
          <span key={s} style={{ background: C.s4, color: C.white, padding: '4px 10px', borderRadius: 6, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            {s}
            <span onClick={() => onChange(selected.filter(x => x !== s))} style={{ cursor: 'pointer', color: C.red }}>×</span>
          </span>
        ))}
        <select 
          value="" 
          onChange={e => { if (e.target.value && !selected.includes(e.target.value)) onChange([...selected, e.target.value]); }}
          style={{ background: 'none', border: 'none', color: C.blue, fontSize: 12, cursor: 'pointer', outline: 'none' }}
        >
          <option value="">+ Add {label}</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    </div>
  );
}

function StatRow({ label, value, color }: { label: string, value: any, color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: C.gray }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}
