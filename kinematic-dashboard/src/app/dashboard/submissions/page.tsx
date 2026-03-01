'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

interface Submission {
  id: string;
  fe_name: string;
  fe_id: string;
  outlet_name: string;
  outlet_type: string;
  consumer_age: string;
  gender: string;
  product_shown: string;
  consumer_reaction: string;
  is_ecc: boolean;
  submitted_at: string;
  remarks?: string;
  zone?: string;
}

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<Submission | null>(null);
  const limit = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(limit) };
      if (filter === 'ecc') params.is_ecc = 'true';
      if (filter === 'non_ecc') params.is_ecc = 'false';
      const res = await api.get<any>('/api/v1/forms/admin/submissions?' + new URLSearchParams(params));
      const d = res as any;
      setSubmissions(d.data || d.submissions || d || []);
      setTotal(d.total || d.count || 0);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const stats = {
    total,
    ecc: submissions.filter(s => s.is_ecc).length,
    non_ecc: submissions.filter(s => !s.is_ecc).length,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CC Submissions</h1>
          <p className="text-sm text-gray-500 mt-1">Consumer contact form submissions</p>
        </div>
        <button onClick={fetchData} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Refresh</button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Submissions', value: total, color: 'text-gray-900' },
          { label: 'Effective (ECC)', value: stats.ecc, color: 'text-green-600' },
          { label: 'Non-ECC', value: stats.non_ecc, color: 'text-red-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100 flex gap-3">
          {['all', 'ecc', 'non_ecc'].map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(1); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f === 'all' ? 'All' : f === 'ecc' ? 'ECC Only' : 'Non-ECC'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading submissions...</div>
        ) : submissions.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No submissions found</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">FE Name</th>
                <th className="px-4 py-3 text-left">Outlet</th>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">Reaction</th>
                <th className="px-4 py-3 text-left">ECC</th>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {submissions.map((s, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.fe_name}</td>
                  <td className="px-4 py-3 text-gray-600">{s.outlet_name}</td>
                  <td className="px-4 py-3 text-gray-600">{s.product_shown}</td>
                  <td className="px-4 py-3 text-gray-600">{s.consumer_reaction}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${s.is_ecc ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {s.is_ecc ? 'ECC' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-sm">{new Date(s.submitted_at).toLocaleTimeString()}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelected(s)} className="text-blue-600 text-sm hover:underline">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {total > limit && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-500">Page {page} · {total} total</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 border rounded text-sm disabled:opacity-40">Previous</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * limit >= total}
                className="px-3 py-1 border rounded text-sm disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-start">
              <h2 className="text-lg font-bold">Submission Details</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            {Object.entries(selected).map(([k, v]) => v && (
              <div key={k} className="flex justify-between text-sm">
                <span className="text-gray-500 capitalize">{k.replace(/_/g, ' ')}</span>
                <span className="font-medium text-right">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
