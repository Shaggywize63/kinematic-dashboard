'use client';
// Privacy and DPDP: consent ledger, access log, retention rules, role matrix and data-subject requests.
// In live mode the consent ledger, retention rules and the compliance readiness come from the server (the privacy bootstrap)
// and the Access log is read from the server access log; the Requests and Roles tabs stay local. If the privacy tables are
// missing the server-backed parts degrade on their own (503 / error) while Requests and Roles keep working.

import { useEffect, useState } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { hydrate, setSource, useLiveStatus, type LiveStatus } from '../../../../lib/hrms/live/store';
import { Button, Card, EmptyState, HrmsPage, Loading, TabBar, useTabParam } from '../../../../components/hrms/ui';
import Checklist from '../../../../components/hrms/statutory/privacy/Checklist';
import ConsentTab from '../../../../components/hrms/statutory/privacy/ConsentTab';
import AccessTab from '../../../../components/hrms/statutory/privacy/AccessTab';
import RetentionTab from '../../../../components/hrms/statutory/privacy/RetentionTab';
import RolesTab from '../../../../components/hrms/statutory/privacy/RolesTab';
import RequestsTab from '../../../../components/hrms/statutory/privacy/RequestsTab';
import { dsrOpen, seedRequests, type Dsr } from '../../../../components/hrms/statutory/privacy/model';

const TABS = ['consent', 'access', 'retention', 'roles', 'requests'] as const;

/** Shown in place of the server-backed privacy parts (consent, retention, readiness) when the privacy tables are missing or
 * the bootstrap failed. The Access log, Requests and Roles tabs stay usable. */
function PrivacyUnavailable({ live }: { live: LiveStatus }) {
  const notReady = live.privacyPhase === 'not_ready';
  return (
    <div data-testid={notReady ? 'hrms-privacy-not-ready' : 'hrms-privacy-error'}>
      <Card>
        <EmptyState title={notReady ? 'Privacy storage is not set up yet on the server' : 'Could not load privacy data'}
          description={notReady
            ? 'The tables that hold live compliance, consents and retention have not been created on the server, so there is nothing to load or save yet. The rest of HRMS still works, and so does the sample data. The Requests and Roles tabs on this page keep working.'
            : <span data-testid="hrms-privacy-error-message">{live.privacyMessage || 'Could not reach the server.'} Nothing was changed. Try again, or use the sample data meanwhile. The Requests and Roles tabs keep working.</span>}
          action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button variant="primary" onClick={() => void hydrate()} style={{ minHeight: 40 }}>Try again</Button>
            <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
          </div>} />
      </Card>
    </div>
  );
}

export default function PrivacyPage() {
  const db = useHrmsDb();
  const live = useLiveStatus();
  const [tab, setTab] = useTabParam(TABS, 'consent');
  // Requests live here, not in a tab, so they survive switching tabs. They are not part of the shared database.
  const [requests, setRequests] = useState<Dsr[] | null>(null);
  useEffect(() => { if (db && requests === null) setRequests(seedRequests(db)); }, [db, requests]);
  if (!db) return <Loading />;
  const list = requests ?? [];

  const liveMode = live.source === 'live';
  // Compliance, consents and retention come from the privacy bootstrap. When it is missing/failed these parts degrade; the
  // Access log reads its own server endpoint, and Requests / Roles are local, so all three keep working regardless.
  const privacyDown = liveMode && (live.privacyPhase === 'not_ready' || live.privacyPhase === 'error');

  return (
    <HrmsPage
      eyebrow="HRMS · Privacy"
      title="Privacy and data protection"
      description="Consent, who looked at what, how long data is kept, who can see which data, and requests from employees. A preview on sample data, not legal advice."
    >
      {/* The DPDP readiness reads the bootstrapped consents and retention: hide it while the privacy bootstrap is unavailable. */}
      {!privacyDown && <Checklist db={db} />}
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'consent', label: 'Consent', count: db.consents.filter((c) => !c.withdrawnAt).length },
          { key: 'access', label: 'Access log', count: liveMode ? undefined : db.accessLog.length },
          { key: 'retention', label: 'Retention', count: db.retention.length },
          { key: 'roles', label: 'Roles' },
          { key: 'requests', label: 'Requests', count: list.filter(dsrOpen).length },
        ]}
      />
      <div role="tabpanel" aria-label={tab}>
        {/* Consent and Retention come from the privacy bootstrap: they degrade when it is unavailable. The Access log reads its
            own server endpoint, and Requests / Roles are local, so all three keep working regardless. */}
        {tab === 'consent' && (privacyDown ? <PrivacyUnavailable live={live} /> : <ConsentTab db={db} />)}
        {tab === 'access' && <AccessTab db={db} />}
        {tab === 'retention' && (privacyDown ? <PrivacyUnavailable live={live} /> : <RetentionTab db={db} />)}
        {tab === 'roles' && <RolesTab />}
        {tab === 'requests' && <RequestsTab db={db} requests={list} setRequests={(f) => setRequests((r) => f(r ?? []))} />}
      </div>
    </HrmsPage>
  );
}
