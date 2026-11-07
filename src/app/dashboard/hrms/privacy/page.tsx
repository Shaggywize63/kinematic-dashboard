'use client';
// Privacy and DPDP: consent ledger, access log, retention rules, role matrix and data-subject requests.
// Preview on sample data: nothing here is a legal opinion.

import { useEffect, useState } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { HrmsPage, Loading, TabBar, useTabParam } from '../../../../components/hrms/ui';
import Checklist from '../../../../components/hrms/statutory/privacy/Checklist';
import ConsentTab from '../../../../components/hrms/statutory/privacy/ConsentTab';
import AccessTab from '../../../../components/hrms/statutory/privacy/AccessTab';
import RetentionTab from '../../../../components/hrms/statutory/privacy/RetentionTab';
import RolesTab from '../../../../components/hrms/statutory/privacy/RolesTab';
import RequestsTab from '../../../../components/hrms/statutory/privacy/RequestsTab';
import { dsrOpen, seedRequests, type Dsr } from '../../../../components/hrms/statutory/privacy/model';

const TABS = ['consent', 'access', 'retention', 'roles', 'requests'] as const;

export default function PrivacyPage() {
  const db = useHrmsDb();
  const [tab, setTab] = useTabParam(TABS, 'consent');
  // Requests live here, not in a tab, so they survive switching tabs. They are not part of the shared database.
  const [requests, setRequests] = useState<Dsr[] | null>(null);
  useEffect(() => { if (db && requests === null) setRequests(seedRequests(db)); }, [db, requests]);
  if (!db) return <Loading />;
  const list = requests ?? [];

  return (
    <HrmsPage
      eyebrow="HRMS · Privacy"
      title="Privacy and data protection"
      description="Consent, who looked at what, how long data is kept, who can see which data, and requests from employees. A preview on sample data, not legal advice."
    >
      <Checklist db={db} />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'consent', label: 'Consent', count: db.consents.filter((c) => !c.withdrawnAt).length },
          { key: 'access', label: 'Access log', count: db.accessLog.length },
          { key: 'retention', label: 'Retention', count: db.retention.length },
          { key: 'roles', label: 'Roles' },
          { key: 'requests', label: 'Requests', count: list.filter(dsrOpen).length },
        ]}
      />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'consent' && <ConsentTab db={db} />}
        {tab === 'access' && <AccessTab db={db} />}
        {tab === 'retention' && <RetentionTab db={db} />}
        {tab === 'roles' && <RolesTab />}
        {tab === 'requests' && <RequestsTab db={db} requests={list} setRequests={(f) => setRequests((r) => f(r ?? []))} />}
      </div>
    </HrmsPage>
  );
}
