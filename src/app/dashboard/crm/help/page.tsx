'use client';

/**
 * Help & Lifecycle — the end-to-end map of how a record moves through the
 * CRM. Mirrors the same screen on iOS (CRMHelpView) and Android
 * (CrmHelpScreen). Reps land here from the CRM sub-nav to answer "how
 * does this all fit together?" without a training session.
 */

const RED = '#E01E2C';

const STAGES = [
  { n: 1, title: 'Lead arrives',  detail: 'From a form, a referral, an import, or KINI AI auto-capture. Status starts as NEW.' },
  { n: 2, title: 'Qualify',       detail: 'Call, WhatsApp, or meet the lead. Set status → CONTACTED → QUALIFIED. AI score helps prioritise — focus on 70+.' },
  { n: 3, title: 'Convert',       detail: 'When the lead is real revenue, tap Convert. Kinematic spins up a Contact (the person), an Account (their company), and optionally a Deal in the pipeline.' },
  { n: 4, title: 'Move the deal', detail: 'Drag stages on the pipeline. Win Probability and Next-Best-Action refresh from KINI AI as the deal progresses.' },
  { n: 5, title: 'Close',         detail: 'Mark Won (with amount + close date) or Lost (with reason). Won deals add to revenue charts; lost reasons feed the win-rate report.' },
];

const ACTIONS: Array<{ icon: string; color: string; title: string; detail: string }> = [
  { icon: '📞', color: '#1E88E5', title: 'Call',       detail: 'Dials the lead/contact and immediately logs a call activity. Cancel to keep the bare entry, save to add notes + duration.' },
  { icon: '💬', color: '#25D366', title: 'WhatsApp',   detail: 'Opens a pre-filled WhatsApp thread. The conversation is captured by KINI Auto-Response if enabled.' },
  { icon: '✨', color: '#8E24AA', title: 'AI Score',   detail: 'Re-runs the KINI AI scoring model on the lead. The badge changes — green means high intent.' },
  { icon: '🔀', color: RED,       title: 'Convert',    detail: 'Promotes the lead to Contact + Account + Deal. You will be asked for a deal name, amount, and product so the new Deal lands on the pipeline ready to move.' },
  { icon: '👤', color: '#FB8C00', title: 'Assign',     detail: 'Hands the lead to another rep on the same team. Only same-client teammates are shown.' },
  { icon: '⏸️', color: '#757575', title: 'Deactivate', detail: 'Marks the lead as Unqualified. Hidden from active views; keeps the record for history.' },
];

const TIPS = [
  'Tap the phone number on any lead → both a call AND an activity land in one gesture.',
  'The KINI AI floating button is your AI helper. Ask things like "show me deals stuck more than 14 days" or "draft a follow-up for X".',
  'Tasks on the inbox are coloured by urgency. Red = overdue. Blue = today. Pull-to-refresh on mobile, refresh to re-sync.',
  'Win Probability is the KINI AI guess based on stage + age + recent activity. It updates when you log meaningful interactions.',
];

export default function CrmHelpPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Hero />
      <Section label="The lifecycle">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {STAGES.map((s) => (
            <div key={s.n} style={{
              background: 'var(--s2)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              gap: 14,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: RED,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 14, flexShrink: 0,
              }}>{s.n}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>{s.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section label="What the buttons do">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
          {ACTIONS.map((a) => (
            <div key={a.title} style={{
              background: 'var(--s2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 12,
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: a.color + '26',
                color: a.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, flexShrink: 0,
              }}>{a.icon}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 3 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{a.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Tips">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {TIPS.map((t, i) => (
            <div key={i} style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              padding: '4px 4px',
            }}>
              <span style={{ fontSize: 14 }}>💡</span>
              <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{t}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Need more help?">
        <div style={{
          background: 'var(--s2)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 14,
          fontSize: 13,
          color: 'var(--text-dim)',
          lineHeight: 1.5,
        }}>
          Anything outside this guide — settings, custom fields, automations — lives on the web console. Your team admin can also walk you through it.
        </div>
      </Section>
    </div>
  );
}

function Hero() {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${RED}0D, ${RED}05)`,
      border: `1px solid ${RED}33`,
      borderRadius: 18,
      padding: 20,
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: RED + '1F',
          color: RED,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
        }}>📚</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>How Kinematic CRM works</div>
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.6 }}>
        A Lead becomes a Contact + Account when qualified. A Deal tracks the conversation about money.
        Every Call, WhatsApp, or note logged along the way becomes an Activity that anyone on the team can read.
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        color: RED,
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 12,
      }}>{label}</div>
      {children}
    </div>
  );
}
