'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

interface Grievance {
  id: string;
  fe_name: string;
  fe_id: string;
  issue_type: string;
  concern_regarding: string;
  incident_date: string;
  details: string;
  status: 'pending' | 'under_review' | 'resolved' | 'dismissed';
  submitted_at: string;
  admin_remarks?: string;
}

export default function GrievancesPage() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Grievance | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [remarks, setRemarks] = useState('');
  const [updating, setUpdating] = useState(false);
  const [filter, setFilter] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<any>('/api/v1/grievances/admin');
      const d = res as any;
      setGrievances(d.data || d.grievances || d || []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load grievances');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateStatus = async () => {
    if (!selected || !newStatus) return;
    setUpdating(true);
    try {
      await api.post(`/api/v1/grievances/admin/${selected.id}`, { status: newStatus, admin_remarks: remarks });
      setGrievances(g => g.map(gr => gr.id === selected.id ? { ...gr, status: newStatus as any, admin_remarks: remarks } : gr));
      setSelected(null);
      setNewStatus('');
      setRemarks('');
    } catch (e: any) {
      alert(e.message || 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    under_review: 'bg-blue-100 text-blue-800',
    resolved: 'bg-green-100 text-green-800',
    dismissed: 'bg-gray-100 text-gray-600',
  };

  const filtered = filter === 'all' ? grievances : grievances.filter(g => g.status === filter);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Grievance Cell</h1>
          <p className="text-sm text-gray-500 mt-1">Confidential complaints management</p>
        </div>
        <button onClick={fetchData} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Refresh</button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total', value: grievances.length, color: 'text-gray-900' },
          { label: 'Pending', value: grievances.filter(g => g.status === 'pending').length, color: 'text-yellow-600' },
          { label: 'Under Review', value: grievances.filter(g => g.status === 'under_review').length, color: 'text-blue-600' },
          { label: 'Resolved', value: grievances.filter(g => g.status === 'resolved').length, color: 'text-green-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100 flex gap-3 flex-wrap">
          {['all', 'pending', 'under_review', 'resolved', 'dismissed'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f === 'all' ? 'All' : f.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading grievances...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No grievances found</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((g, i) => (
              <div key={i} className="p-4 hover:bg-gray-50 flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-medium text-gray-900">{g.fe_name}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[g.status]}`}>
                      {g.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">{g.issue_type} · Re: {g.concern_regarding}</div>
                  <div className="text-xs text-gray-400 mt-1">{new Date(g.submitted_at).toLocaleDateString()}</div>
                </div>
                <button onClick={() => { setSelected(g); setNewStatus(g.status); setRemarks(g.admin_remarks || ''); }}
                  className="px-3 py-1 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
                  Manage
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-start">
              <h2 className="text-lg font-bold">Manage Grievance</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div><span className="text-gray-500">FE:</span> <span className="font-medium">{selected.fe_name}</span></div>
              <div><span className="text-gray-500">Issue:</span> <span className="font-medium">{selected.issue_type}</span></div>
              <div><span className="text-gray-500">Regarding:</span> <span className="font-medium">{selected.concern_regarding}</span></div>
              <div><span className="text-gray-500">Details:</span> <p className="mt-1 text-gray-700">{selected.details}</p></div>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-2">Update Status</label>
              <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="pending">Pending</option>
                <option value="under_review">Under Review</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-2">Admin Remarks</label>
              <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
                rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Add remarks for HR record..."/>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSelected(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
              <button onClick={updateStatus} disabled={updating}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {updating ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
