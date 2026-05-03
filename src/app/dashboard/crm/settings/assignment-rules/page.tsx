'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmAssignmentRules } from '../../../../../lib/crmApi';
import type { AssignmentRule } from '../../../../../types/crm';

export default function AssignmentRulesPage() {
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { crmAssignmentRules.list().then((r) => setRules(r.data || [])).catch((e) => toast.error(e.message)).finally(() => setLoading(false)); }, []);
  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading...</div>;
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      {rules.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No assignment rules. Use the API to add round-robin / territory-based routing.</div>}
      {rules.map((r) => (
        <div key={r.id} style={{ padding: 10, background: 'var(--s3)', borderRadius: 8, marginBottom: 8, fontSize: 13, color: 'var(--text)' }}>
          <div style={{ fontWeight: 700 }}>{r.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>If {r.match_field} {r.match_op} {r.match_value} → assign to {r.assignee_user_id || r.assignee_team_id || r.territory_id}</div>
        </div>
      ))}
    </div>
  );
}
