'use client';
/**
 * Lead Nurturing module — frontend-only demo of the strategy laid out
 * in TATA_TISCON_NURTURING_STRATEGY.md. No backend, no Meta/Google
 * integration, no real WA sends. Pure flow walkthrough so the client
 * (and the team) can see how the three engines feel before we commit
 * to the full build.
 *
 * Tabs:
 *  - Overview     — top-level KPIs + the three engines as cards
 *  - Segments     — list of audience segments with rule preview + ad sync status
 *  - Sequences    — WA/SMS/IVR drip campaigns with step-by-step previews
 *  - Audiences    — per-segment Meta CA + Google CM sync status
 *  - Attribution  — funnel, cost breakdown, top converted leads
 *  - Consent      — opt-in capture summary + STOP-honored health
 *
 * Built to be clickable end-to-end with realistic Tata-Tiscon-scale
 * numbers from src/lib/demo/nurturingSeed.ts. All "Create" / "Edit" /
 * "Sync now" actions show a toast so reviewers can see the affordances
 * exist; persistence is deferred until the real backend lands.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  DEMO_SEGMENTS, DEMO_SEQUENCES, DEMO_FUNNEL, DEMO_COSTS_LAST_30D,
  DEMO_TOP_CONVERSIONS, DEMO_CONSENT_FUNNEL,
  type DemoSegment, type DemoSequence,
} from '../../../../lib/demo/nurturingSeed';
import { getStoredUser } from '../../../../lib/auth';

type Tab = 'overview' | 'segments' | 'sequences' | 'audiences' | 'attribution' | 'consent';

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'overview',    label: 'Overview',    icon: '◎' },
  { id: 'segments',    label: 'Segments',    icon: '⟁' },
  { id: 'sequences',   label: 'WA Sequences', icon: '↪' },
  { id: 'audiences',   label: 'Ad Audiences', icon: '⚯' },
  { id: 'attribution', label: 'Attribution', icon: '⌬' },
  { id: 'consent',     label: 'Consent',     icon: '✓' },
];

export default function NurturingPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [activeSegment, setActiveSegment] = useState<DemoSegment | null>(null);
  const [activeSequence, setActiveSequence] = useState<DemoSequence | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  // Demo-only gate. Even if a non-demo user types the URL directly,
  // they get redirected to the CRM dashboard. Mirrors the sidebar
  // `demoOnly: true` filter so the preview never leaks to real
  // customers.
  useEffect(() => {
    const u = getStoredUser();
    const isDemo = u?.email === 'demo@kinematic.com';
    if (!isDemo) {
      router.replace('/dashboard/crm/dashboard');
    } else {
      setAllowed(true);
    }
  }, [router]);

  if (allowed !== true) {
    return <div style={{ padding: 24, color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>;
  }

  return (
    <div>
      {/* Module intro */}
      <div style={{
        marginBottom: 14, padding: '14px 18px',
        background: 'linear-gradient(135deg, rgba(0,102,255,0.12), rgba(224,30,44,0.08))',
        border: '1px solid var(--border)', borderRadius: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: 'var(--primary)', padding: '2px 7px', borderRadius: 4, letterSpacing: 0.4 }}>PREVIEW</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Lead Nurturing — Tata Tiscon</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Engage every lead on <strong style={{ color: 'var(--text)' }}>WhatsApp</strong> within 30 seconds, and start serving them <strong style={{ color: 'var(--text)' }}>Tata Tiscon ads on Instagram, Facebook and YouTube</strong> within an hour — using only their mobile number. This page is a click-through of the three engines (Segments → Audience Sync → WhatsApp Sequences) that the CRM will run end-to-end. All numbers below are demo data.
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 14, padding: 4,
        background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10,
        overflowX: 'auto',
      }}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setActiveSegment(null); setActiveSequence(null); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: active ? 'var(--primary)' : 'transparent',
                color: active ? '#fff' : 'var(--text-dim)',
                border: 'none', padding: '8px 14px', borderRadius: 7,
                fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
              <span style={{ fontSize: 15 }}>{t.icon}</span> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview'    && <OverviewTab onJump={setTab} />}
      {tab === 'segments'    && <SegmentsTab onOpen={setActiveSegment} active={activeSegment} onClose={() => setActiveSegment(null)} />}
      {tab === 'sequences'   && <SequencesTab onOpen={setActiveSequence} active={activeSequence} onClose={() => setActiveSequence(null)} />}
      {tab === 'audiences'   && <AudiencesTab />}
      {tab === 'attribution' && <AttributionTab />}
      {tab === 'consent'     && <ConsentTab />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Overview Tab — KPIs + the three engines as clickable cards
// ─────────────────────────────────────────────────────────────
function OverviewTab({ onJump }: { onJump: (t: Tab) => void }) {
  const totalSpend = DEMO_COSTS_LAST_30D.reduce((s, r) => s + r.spend_inr, 0);
  const reached = DEMO_FUNNEL[0].count;
  const converted = DEMO_FUNNEL[DEMO_FUNNEL.length - 1].count;
  const cpa = converted > 0 ? Math.round(totalSpend / converted) : 0;
  const totalEnrolled = DEMO_SEQUENCES.reduce((s, q) => s + q.enrolled, 0);
  const totalMembers = DEMO_SEGMENTS.reduce((s, q) => s + q.member_count, 0);
  const totalSynced = DEMO_SEGMENTS.reduce((s, q) => s + q.meta_audience.matched + q.google_audience.matched, 0);

  return (
    <>
      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 14 }}>
        <KpiTile label="Leads reached (30d)" value={reached.toLocaleString()} sub={`across ${DEMO_SEGMENTS.length} segments`} accent="#6366f1" />
        <KpiTile label="In active sequence" value={totalEnrolled.toLocaleString()} sub={`${DEMO_SEQUENCES.filter(s => s.is_active).length} sequences running`} accent="#10b981" />
        <KpiTile label="Ad-platform reach" value={totalSynced.toLocaleString()} sub="hashed phones matched on Meta + Google" accent="#f59e0b" />
        <KpiTile label="Conversions (30d)" value={converted.toString()} sub={`CPA ₹${cpa.toLocaleString()} per deal`} accent="#E01E2C" />
      </div>

      {/* Three engines */}
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: 0.5, marginBottom: 10 }}>
        The three engines
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, marginBottom: 18 }}>
        <EngineCard
          number={1} title="WhatsApp Engagement"
          desc="Drip + behavior-triggered conversation engine. Every lead enters a sequence on creation; branches on reply / click / silence; auto-routes hot replies to the FE."
          kpis={[
            { label: 'Sequences', value: DEMO_SEQUENCES.length.toString() },
            { label: 'Enrolled now', value: totalEnrolled.toLocaleString() },
            { label: 'Avg reply rate', value: '22.8%' },
          ]}
          cta="View sequences →"
          onClick={() => onJump('sequences')}
          accent="#10b981"
        />
        <EngineCard
          number={2} title="Meta + Google Audience Sync"
          desc="Hashes every lead's mobile and pushes to Meta Custom Audiences (FB / IG / Reels) and Google Customer Match (YouTube / Search) so Tata Tiscon ads serve to them within an hour."
          kpis={[
            { label: 'Segments', value: DEMO_SEGMENTS.length.toString() },
            { label: 'Members', value: totalMembers.toLocaleString() },
            { label: 'Avg match rate', value: '62%' },
          ]}
          cta="View segments →"
          onClick={() => onJump('segments')}
          accent="#6366f1"
        />
        <EngineCard
          number={3} title="Conversion-Loop Attribution"
          desc="Every won deal fires server-side events back to Meta CAPI + Google Offline Conversions. Their bid models learn — CPL drops 30–50% in 60–90 days."
          kpis={[
            { label: 'Events fired (30d)', value: DEMO_TOP_CONVERSIONS.length * 8 + '' },
            { label: 'Attributed revenue', value: '₹47.2L' },
            { label: 'Avg touches/win', value: '6.2' },
          ]}
          cta="View attribution →"
          onClick={() => onJump('attribution')}
          accent="#f59e0b"
        />
      </div>

      {/* What you'll be able to do */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>
          What this lets the marketing team do (once built)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
          {[
            ['Create segments without engineering', 'Marketer defines "Fresh Jharkhand leads, B grade, last 14 days" in the UI. Worker materialises members; ads start serving in under an hour.'],
            ['Run multi-touch WA campaigns', 'Drag-drop a sequence of 5–10 steps with delays + branch rules. Templates are submitted to Meta once; sequences re-use them.'],
            ['Reach prospects across IG / FB / YouTube', 'Same lead that just got a WA "welcome" sees Tata Tiscon ads on every Meta + Google surface within an hour. Closed brand loop.'],
            ['Watch CPA fall over 60 days', 'Won deals send CAPI events back to Meta/Google. Their algorithms optimise; cost-per-qualified-lead drops 30–50% by month 3.'],
            ['Honour STOP within 60 seconds', 'A WA "STOP" reply removes the lead from every sequence + every Meta CA + Google CM list within one minute. DPDP-safe.'],
            ['Per-deal attribution', 'For each won deal: which segment, which sequence, which ad placement drove it. Marketer sees what works, kills what doesn\'t.'],
          ].map(([title, body]) => (
            <div key={title} style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{body}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Segments Tab
// ─────────────────────────────────────────────────────────────
function SegmentsTab({ onOpen, active, onClose }: {
  onOpen: (s: DemoSegment) => void;
  active: DemoSegment | null;
  onClose: () => void;
}) {
  if (active) return <SegmentDetail seg={active} onClose={onClose} />;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {DEMO_SEGMENTS.length} segments — define an audience once, sync to Meta + Google + WA sequences from one place.
        </div>
        <button
          onClick={() => toast.info('Segment builder ships in Sprint 2 — this is a preview of the flow.')}
          style={primaryBtn}>+ New segment</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
        {DEMO_SEGMENTS.map((s) => (
          <button
            key={s.id}
            onClick={() => onOpen(s)}
            style={{
              textAlign: 'left', background: 'var(--s2)',
              border: '1px solid var(--border)', borderRadius: 12, padding: 16,
              cursor: 'pointer', color: 'var(--text)',
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{s.name}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{s.member_count.toLocaleString()}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.5 }}>{s.description}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Pill on={s.meta_audience.enabled} label={`Meta CA ${s.meta_audience.enabled ? `· ${Math.round(s.meta_audience.match_rate * 100)}%` : ''}`} />
              <Pill on={s.google_audience.enabled} label={`Google CM ${s.google_audience.enabled ? `· ${Math.round(s.google_audience.match_rate * 100)}%` : ''}`} />
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function SegmentDetail({ seg, onClose }: { seg: DemoSegment; onClose: () => void }) {
  return (
    <>
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer', marginBottom: 10 }}>← Back to segments</button>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{seg.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{seg.description}</div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>{seg.member_count.toLocaleString()}</div>
        </div>
        <div style={{ background: 'var(--s3)', border: '1px dashed var(--border)', borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text-dim)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text)', marginBottom: 4 }}>Rule</div>
          {seg.rule_summary}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <AudienceMini label="Meta Custom Audience" enabled={seg.meta_audience.enabled} name={seg.meta_audience.name} matched={seg.meta_audience.matched} matchRate={seg.meta_audience.match_rate} total={seg.member_count} />
          <AudienceMini label="Google Customer Match" enabled={seg.google_audience.enabled} name={seg.google_audience.name} matched={seg.google_audience.matched} matchRate={seg.google_audience.match_rate} total={seg.member_count} />
        </div>
      </div>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-dim)', marginBottom: 8 }}>Use case</div>
        <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 10 }}>{seg.primary_use_case}</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>Ad creative themes for this segment:</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {seg.ad_creative_themes.map((t) => (
            <span key={t} style={{ background: 'var(--s3)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 999, fontSize: 12 }}>{t}</span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => toast.info('Sync triggered (demo — no real API call).')} style={primaryBtn}>Sync now</button>
        <button onClick={() => toast.info('Edit rule ships with Segment Builder UI in Sprint 2.')} style={secondaryBtn}>Edit rule</button>
        <button onClick={() => toast.info('Preview members — full lead list view ships in Sprint 2.')} style={secondaryBtn}>Preview members</button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Sequences Tab
// ─────────────────────────────────────────────────────────────
function SequencesTab({ onOpen, active, onClose }: {
  onOpen: (q: DemoSequence) => void;
  active: DemoSequence | null;
  onClose: () => void;
}) {
  if (active) return <SequenceDetail seq={active} onClose={onClose} />;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {DEMO_SEQUENCES.length} WhatsApp sequences. Each lead enrolls automatically when they join the source segment.
        </div>
        <button onClick={() => toast.info('Sequence builder ships in Sprint 3 — this is a preview of the flow.')} style={primaryBtn}>+ New sequence</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {DEMO_SEQUENCES.map((q) => {
          const seg = DEMO_SEGMENTS.find(s => s.id === q.segment_id);
          return (
            <button
              key={q.id}
              onClick={() => onOpen(q)}
              style={{
                textAlign: 'left', background: 'var(--s2)',
                border: '1px solid var(--border)', borderRadius: 12, padding: 14,
                cursor: 'pointer', color: 'var(--text)',
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{q.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                    Trigger: {q.trigger_label} {seg && `· Source segment: ${seg.name}`}
                  </div>
                </div>
                <span style={{ background: q.is_active ? '#10b98115' : 'var(--s3)', color: q.is_active ? '#10b981' : 'var(--text-dim)', padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                  {q.is_active ? '● Active' : '○ Paused'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-dim)', flexWrap: 'wrap' }}>
                <span>{q.enrolled.toLocaleString()} enrolled</span>
                <span>{q.steps.length} steps</span>
                <span style={{ color: '#10b981', fontWeight: 700 }}>{Math.round(q.reply_rate * 100)}% reply</span>
                <span style={{ color: '#f59e0b', fontWeight: 700 }}>{Math.round(q.conversion_rate * 100)}% convert</span>
                <span>{q.exited_opted_out} opted out</span>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function SequenceDetail({ seq, onClose }: { seq: DemoSequence; onClose: () => void }) {
  const seg = DEMO_SEGMENTS.find(s => s.id === seq.segment_id);
  return (
    <>
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer', marginBottom: 10 }}>← Back to sequences</button>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{seq.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
              {seq.trigger_label}{seg && ` → segment "${seg.name}"`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => toast.info('Pause / resume from the demo UI.')} style={secondaryBtn}>{seq.is_active ? 'Pause' : 'Resume'}</button>
            <button onClick={() => toast.info('Step editor ships in Sprint 3.')} style={primaryBtn}>Edit steps</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          <StatBox label="Enrolled" value={seq.enrolled.toLocaleString()} />
          <StatBox label="Completed" value={seq.completed.toLocaleString()} />
          <StatBox label="Replied (exited)" value={seq.exited_replied.toLocaleString()} accent="#10b981" />
          <StatBox label="Converted (exited)" value={seq.exited_converted.toLocaleString()} accent="#f59e0b" />
          <StatBox label="Opted out" value={seq.exited_opted_out.toLocaleString()} accent="#ef4444" />
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-dim)', marginBottom: 8 }}>Steps</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {seq.steps.map((step) => (
          <div key={step.position} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{step.position}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ background: channelColor(step.channel) + '20', color: channelColor(step.channel), padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4 }}>{step.channel}</span>
                  {step.category && <span style={{ background: 'var(--s3)', color: 'var(--text-dim)', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{step.category}</span>}
                  <span style={{ fontSize: 12, color: 'var(--text)' }}><strong>{step.template_name}</strong></span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>· {step.delay_label} · {step.send_window}</span>
                </div>
                <pre style={{
                  margin: 0, padding: 10, background: 'var(--s3)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit', lineHeight: 1.5,
                }}>{step.template_preview}</pre>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Audiences Tab — Meta CA + Google CM at a glance
// ─────────────────────────────────────────────────────────────
function AudiencesTab() {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <ConnectorTile platform="Meta Business" status="connected" account="Tata Tiscon — Brand (Ad Acc 1234***5678)" lastSync="3 min ago" />
        <ConnectorTile platform="Google Ads" status="connected" account="Tata Tiscon — TMT (Customer 987-654-3210)" lastSync="5 min ago" />
      </div>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Active audiences ({DEMO_SEGMENTS.filter(s => s.meta_audience.enabled || s.google_audience.enabled).length})</div>
          <button onClick={() => toast.info('Sync all now — runs the diff worker (Sprint 2).')} style={secondaryBtn}>Sync all now</button>
        </div>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase' }}>
              <th style={{ ...th }}>Segment</th>
              <th style={{ ...th, textAlign: 'right' }}>Members</th>
              <th style={{ ...th, textAlign: 'right' }}>Meta matched</th>
              <th style={{ ...th, textAlign: 'right' }}>Google matched</th>
              <th style={{ ...th, textAlign: 'right' }}>Last sync</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_SEGMENTS.map((s) => (
              <tr key={s.id}>
                <td style={td}><strong>{s.name}</strong></td>
                <td style={{ ...td, textAlign: 'right' }}>{s.member_count.toLocaleString()}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {s.meta_audience.enabled ? (
                    <span>{s.meta_audience.matched.toLocaleString()} <span style={{ color: 'var(--text-dim)' }}>· {Math.round(s.meta_audience.match_rate * 100)}%</span></span>
                  ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {s.google_audience.enabled ? (
                    <span>{s.google_audience.matched.toLocaleString()} <span style={{ color: 'var(--text-dim)' }}>· {Math.round(s.google_audience.match_rate * 100)}%</span></span>
                  ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                </td>
                <td style={{ ...td, textAlign: 'right', color: 'var(--text-dim)', fontSize: 12 }}>{relTime(s.meta_audience.last_sync_at || s.google_audience.last_sync_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12, padding: 12, background: 'rgba(245, 158, 11, 0.08)', border: '1px solid #f59e0b', borderRadius: 8, fontSize: 12, color: 'var(--text)' }}>
        <strong>How match rate works:</strong> the worker hashes each lead's phone (SHA-256 of normalized +91 format) and pushes to Meta + Google. Match rate is the % they recognise from their user base. 50–70% is industry-typical for India. Unmatched leads still get WA messaging — just not retargeting ads.
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Attribution Tab — funnel + cost breakdown + top conversions
// ─────────────────────────────────────────────────────────────
function AttributionTab() {
  const totalSpend = DEMO_COSTS_LAST_30D.reduce((s, r) => s + r.spend_inr, 0);
  const revenue = DEMO_TOP_CONVERSIONS.reduce((s, r) => s + r.deal_amount_inr, 0) * 4;  // scale up to match funnel
  const roi = totalSpend > 0 ? (revenue / totalSpend) : 0;
  const conv = DEMO_FUNNEL[DEMO_FUNNEL.length - 1].count;
  const cpa = conv > 0 ? Math.round(totalSpend / conv) : 0;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
        <KpiTile label="Attributed revenue (30d)" value={`₹${(revenue / 100000).toFixed(1)}L`} sub={`${conv} deals won`} accent="#10b981" />
        <KpiTile label="Total media + messaging" value={`₹${(totalSpend / 1000).toFixed(1)}k`} sub="last 30 days" accent="#6366f1" />
        <KpiTile label="ROI" value={`${roi.toFixed(1)}×`} sub="₹ revenue per ₹ spent" accent="#f59e0b" />
        <KpiTile label="Cost per deal" value={`₹${cpa.toLocaleString()}`} sub="all channels blended" accent="#E01E2C" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        {/* Funnel */}
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Nurturing funnel (last 30d)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {DEMO_FUNNEL.map((stage, i) => {
              const max = DEMO_FUNNEL[0].count;
              const widthPct = (stage.count / max) * 100;
              return (
                <div key={stage.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text)' }}>{stage.label}</span>
                    <span style={{ color: 'var(--text-dim)' }}>
                      {stage.count.toLocaleString()}
                      {stage.pct_of_previous !== undefined && (
                        <span style={{ color: '#10b981', marginLeft: 6, fontWeight: 700 }}>
                          {Math.round(stage.pct_of_previous * 100)}%
                        </span>
                      )}
                    </span>
                  </div>
                  <div style={{ height: 14, background: 'var(--s3)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      width: `${widthPct}%`, height: '100%',
                      background: `hsl(${220 - i * 30}, 70%, 55%)`,
                      transition: 'width .3s',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cost breakdown */}
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Spend by channel (last 30d)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {DEMO_COSTS_LAST_30D.map((row) => {
              const pct = (row.spend_inr / totalSpend) * 100;
              return (
                <div key={row.channel}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: 'var(--text)' }}>{row.channel}</span>
                    <span style={{ color: 'var(--text-dim)' }}>
                      ₹{row.spend_inr.toLocaleString()} · {row.units.toLocaleString()} {row.unit_label}
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'var(--s3)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--primary)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top attributed conversions */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Top converted leads — full attribution chain</div>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase' }}>
              <th style={th}>Lead</th>
              <th style={th}>Segment</th>
              <th style={th}>Sequence</th>
              <th style={th}>Touches</th>
              <th style={th}>Channels</th>
              <th style={{ ...th, textAlign: 'right' }}>Deal</th>
              <th style={{ ...th, textAlign: 'right' }}>Days to close</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_TOP_CONVERSIONS.map((c, i) => (
              <tr key={i}>
                <td style={td}><strong>{c.lead_name}</strong></td>
                <td style={{ ...td, color: 'var(--text-dim)' }}>{c.segment_name}</td>
                <td style={{ ...td, color: 'var(--text-dim)' }}>{c.sequence_name}</td>
                <td style={td}>{c.touches}</td>
                <td style={td}>
                  {c.channels.map((ch) => (
                    <span key={ch} style={{ background: 'var(--s3)', padding: '2px 6px', borderRadius: 4, fontSize: 11, marginRight: 4 }}>{ch}</span>
                  ))}
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>₹{c.deal_amount_inr.toLocaleString()}</td>
                <td style={{ ...td, textAlign: 'right', color: 'var(--text-dim)' }}>{c.time_to_close_days}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Consent Tab
// ─────────────────────────────────────────────────────────────
function ConsentTab() {
  const c = DEMO_CONSENT_FUNNEL;
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
        <KpiTile label="Total leads tracked" value={c.total_leads.toLocaleString()} sub="all sources, last 90d" accent="#6366f1" />
        <KpiTile label="WhatsApp opt-in" value={`${Math.round((c.consent_granted_whatsapp / c.total_leads) * 100)}%`} sub={`${c.consent_granted_whatsapp.toLocaleString()} granted`} accent="#10b981" />
        <KpiTile label="Ads opt-in" value={`${Math.round((c.consent_granted_ads / c.total_leads) * 100)}%`} sub={`${c.consent_granted_ads.toLocaleString()} granted`} accent="#f59e0b" />
        <KpiTile label="STOP requests (30d)" value={c.withdrawn_last_30d.toString()} sub="auto-honored < 60s" accent="#E01E2C" />
      </div>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Opt-in rate by capture source</div>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase' }}>
              <th style={th}>Source</th>
              <th style={{ ...th, textAlign: 'right' }}>Leads</th>
              <th style={{ ...th, textAlign: 'right' }}>Granted</th>
              <th style={th}>Opt-in rate</th>
            </tr>
          </thead>
          <tbody>
            {c.capture_sources.map((s) => (
              <tr key={s.source}>
                <td style={td}><strong>{s.source}</strong></td>
                <td style={{ ...td, textAlign: 'right' }}>{s.leads.toLocaleString()}</td>
                <td style={{ ...td, textAlign: 'right' }}>{Math.round(s.leads * s.granted_pct).toLocaleString()}</td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 8, background: 'var(--s3)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${s.granted_pct * 100}%`, height: '100%', background: s.granted_pct > 0.85 ? '#10b981' : s.granted_pct > 0.7 ? '#f59e0b' : '#ef4444' }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: s.granted_pct > 0.85 ? '#10b981' : s.granted_pct > 0.7 ? '#f59e0b' : '#ef4444' }}>{Math.round(s.granted_pct * 100)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ padding: 14, background: 'rgba(16, 185, 129, 0.08)', border: '1px solid #10b981', borderRadius: 10, fontSize: 12, color: 'var(--text)' }}>
        <strong>DPDP-safe consent capture is the gate for everything else.</strong> Without an explicit, audit-trail-backed opt-in per channel, you cannot legally send WhatsApp Marketing, promotional SMS, or push phone hashes to Meta CA / Google CM. The CSV-import path here (65%) is the weak link — we should require an opt-in tickbox on the import UI too.
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Small UI bits
// ─────────────────────────────────────────────────────────────
function KpiTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, borderLeft: `3px solid ${accent}` }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function EngineCard({ number, title, desc, kpis, cta, onClick, accent }: {
  number: number; title: string; desc: string;
  kpis: Array<{ label: string; value: string }>;
  cta: string; onClick: () => void; accent: string;
}) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${accent}25`, color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>{number}</div>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 12 }}>{desc}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ flex: 1, background: 'var(--s3)', borderRadius: 6, padding: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.4 }}>{k.label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{k.value}</div>
          </div>
        ))}
      </div>
      <button onClick={onClick} style={{ background: 'transparent', border: 'none', color: accent, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>{cta}</button>
    </div>
  );
}

function Pill({ on, label }: { on: boolean; label: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: on ? '#10b98115' : 'var(--s3)', color: on ? '#10b981' : 'var(--text-dim)', border: `1px solid ${on ? '#10b98140' : 'var(--border)'}` }}>{on ? '✓' : '○'} {label}</span>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: 'var(--s3)', borderRadius: 6, padding: 10 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent ?? 'var(--text)' }}>{value}</div>
    </div>
  );
}

function AudienceMini({ label, enabled, name, matched, matchRate, total }: {
  label: string; enabled: boolean; name: string; matched: number; matchRate: number; total: number;
}) {
  return (
    <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: enabled ? '#10b981' : 'var(--text-dim)' }}>{enabled ? '● Syncing' : '○ Off'}</span>
      </div>
      {enabled ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            <strong style={{ color: 'var(--text)' }}>{matched.toLocaleString()}</strong> of {total.toLocaleString()} matched
            <span style={{ marginLeft: 6, color: matchRate > 0.6 ? '#10b981' : '#f59e0b' }}>({Math.round(matchRate * 100)}%)</span>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Not enabled for this segment.</div>
      )}
    </div>
  );
}

function ConnectorTile({ platform, status, account, lastSync }: { platform: string; status: 'connected' | 'disconnected'; account: string; lastSync: string }) {
  const connected = status === 'connected';
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>{platform}</span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: connected ? '#10b98115' : '#ef444415', color: connected ? '#10b981' : '#ef4444' }}>
          {connected ? '● Connected' : '○ Disconnected'}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>{account}</div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Last sync: {lastSync}</div>
    </div>
  );
}

function channelColor(ch: string): string {
  if (ch === 'whatsapp') return '#25d366';
  if (ch === 'sms') return '#6366f1';
  if (ch === 'ivr') return '#f59e0b';
  return '#94a3b8';
}

function relTime(iso: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
const primaryBtn: React.CSSProperties = { background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const secondaryBtn: React.CSSProperties = { background: 'var(--s3)', color: 'var(--text)', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 8px', borderBottom: '1px solid var(--border)', fontWeight: 700 };
const td: React.CSSProperties = { padding: '10px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text)' };
