'use client';
// Odometer history: every odometer reading that went into an expense claim, newest first, with the photo of
// each reading. Reps see their own; approvers see everyone's and can narrow to a person or a date range.
// Only clients that pay mileage by vehicle have these readings (the tab is hidden for everyone else).

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gauge } from 'lucide-react';
import { Card, EmptyState, Input, Select, T } from '../../../../components/ui';
import { Col, DataTable, Toolbar } from '../../../../components/finance/ui';
import {
  ClaimStatusBadge, ExpensesShell, PhotoLink, errText, fmtDate, money, useExpenseRoles, vehicleName,
} from '../../../../components/expenses/kit';
import { OdometerHistoryRow, expensesApi } from '../../../../lib/expensesApi';

const LIMIT = 50;
const km = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-IN'));

export default function OdometerHistoryPage() {
  const router = useRouter();
  const { canApprove, ready } = useExpenseRoles();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [person, setPerson] = useState('');
  const [rows, setRows] = useState<OdometerHistoryRow[]>([]);
  // People seen so far, so the picker keeps everyone after a person is chosen (the list then narrows to them).
  const [people, setPeople] = useState<Record<string, string>>({});
  const [currency, setCurrency] = useState('INR');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { expensesApi.myPolicy().then((r) => setCurrency(r.data?.currency || 'INR')).catch(() => undefined); }, []);

  // The role is read from the session after mount; wait for it so the first request is already the right one.
  useEffect(() => {
    if (!ready) return;
    let off = false;
    setLoading(true);
    setError(null);
    expensesApi.odometerHistory({ limit: LIMIT, from, to, ...(canApprove ? { all: true, user_id: person || undefined } : {}) })
      .then((r) => {
        if (off) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setRows(list);
        setPeople((prev) => {
          const next = { ...prev };
          for (const x of list) if (x.user_id) next[x.user_id] = x.user_name || next[x.user_id] || 'Team member';
          return next;
        });
      })
      .catch((e) => { if (!off) setError(errText(e, 'Could not load the odometer history')); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [ready, canApprove, from, to, person]);

  const peopleList = useMemo(() => Object.entries(people).sort((a, b) => a[1].localeCompare(b[1])), [people]);
  const filtered = !!(from || to || person);

  const cols: Col<OdometerHistoryRow>[] = [
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.item_date || r.created_at) },
    ...(canApprove ? [{ key: 'person', label: 'Person', render: (r: OdometerHistoryRow) => <span style={{ fontWeight: 600 }}>{r.user_name || '—'}</span> }] : []),
    { key: 'vehicle', label: 'Vehicle', render: (r) => r.vehicle_label || vehicleName(r.vehicle_type) || '—' },
    { key: 'before', label: 'Before', align: 'right', render: (r) => km(r.odometer_start) },
    { key: 'after', label: 'After', align: 'right', render: (r) => km(r.odometer_end) },
    { key: 'distance', label: 'Distance', align: 'right', render: (r) => (r.distance_km == null ? '—' : `${km(r.distance_km)} km`) },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => (r.amount == null ? '—' : money(r.amount, currency)) },
    { key: 'photos', label: 'Photos', render: (r) => (
      // The history rows carry ready-to-open (signed) links, so the same link is the stored and the viewable one.
      <span style={{ display: 'inline-flex', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <PhotoLink stored={r.start_photo_url} signed={r.start_photo_url} label="Before photo" title="Odometer before the trip" />
        <PhotoLink stored={r.end_photo_url} signed={r.end_photo_url} label="After photo" title="Odometer after the trip" />
        {!r.start_photo_url && !r.end_photo_url && <span style={{ color: T.mute }}>—</span>}
      </span>
    ) },
    { key: 'claim', label: 'Claim', render: (r) => (
      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontFamily: T.mono, fontSize: 12.5 }}>{r.claim_no || 'Claim'}</span>
        {r.claim_status && <ClaimStatusBadge status={r.claim_status} />}
      </span>
    ) },
  ];

  return (
    <ExpensesShell tab="odometer" title="Odometer"
      description={canApprove ? 'Every odometer reading claimed by your team, newest first, with the photo of each.' : 'The odometer readings on your expense claims, newest first, with the photo of each.'}>
      <Toolbar>
        {canApprove && (
          <Select aria-label="Person" value={person} onChange={(e) => setPerson(e.target.value)} style={{ width: 200 }}>
            <option value="">Everyone</option>
            {peopleList.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        )}
        <Input aria-label="From date" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
        <span style={{ fontSize: 13, color: T.mute }}>to</span>
        <Input aria-label="To date" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
      </Toolbar>

      {error ? (
        <Card><EmptyState icon={<Gauge size={20} strokeWidth={1.5} />} title="Couldn’t load the odometer history" description={error} /></Card>
      ) : (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <DataTable<OdometerHistoryRow> columns={cols} rows={rows} loading={loading}
            empty={filtered ? 'No readings match these filters.' : 'No odometer readings yet — they appear here once a travel claim with readings is saved.'}
            onRowClick={(r) => router.push(`/dashboard/expenses/${r.claim_id}`)} />
          {rows.length >= LIMIT && (
            <div style={{ padding: '10px 14px', fontSize: 12.5, color: T.mute, borderTop: `1px solid ${T.border}` }}>
              Showing the latest {LIMIT} readings. Use the filters to look further back.
            </div>
          )}
        </Card>
      )}
    </ExpensesShell>
  );
}
