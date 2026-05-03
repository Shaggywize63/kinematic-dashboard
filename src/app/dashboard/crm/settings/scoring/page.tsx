'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmSettings } from '../../../../../lib/crmApi';

export default function ScoringSettingsPage() {
  const [settings, setSettings] = useState<any>({});
  useEffect(() => { crmSettings.get().then((r) => setSettings(r.data || {})).catch((e) => toast.error(e.message)); }, []);
  const scoring = settings.scoring || {};
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <h3 style={{ color: 'var(--text)', marginTop: 0 }}>AI Scoring Model</h3>
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 14 }}>Current weights driving the lead score (0–100).</p>
      <pre style={{ background: 'var(--s3)', padding: 12, borderRadius: 8, color: 'var(--text)', fontSize: 12, overflowX: 'auto' }}>{JSON.stringify(scoring, null, 2)}</pre>
    </div>
  );
}
