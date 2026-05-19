'use client';

/**
 * Help & Lifecycle — the end-to-end map of how a record moves through the
 * CRM. Mirrors the same screen on iOS (CRMHelpView) and Android
 * (CrmHelpScreen). Reps land here from the CRM sub-nav to answer "how
 * does this all fit together?" without a training session.
 */

const RED = '#E01E2C';
const BLUE = '#3E9EFF';
const SUPPORT_PHONE = '+91 88022 74880';
const SUPPORT_PHONE_DIAL = '+918802274880';
const SUPPORT_EMAIL = 's@kinematicapp.com';

const STAGES = [
  { n: 1, title: 'Lead arrives',  detail: 'From a web form, lead-source integration (Meta/Google/Zoho), CSV import, KINI AI auto-capture, or a rep typing it in. Status starts as NEW; dedup runs immediately on phone+email so the same person never lands twice.' },
  { n: 2, title: 'Qualify',       detail: 'Call, WhatsApp or meet the lead. Move status NEW → WORKING → NURTURING → QUALIFIED. The AI score (0-100) and Lead Score Distribution chart help prioritise — focus on 70+.' },
  { n: 3, title: 'Convert',       detail: 'Tap Convert. The deal name is pre-filled from the lead so you can edit it in one tap. Kinematic spins up a Contact, Account (B2B only), and a Deal placed on your default pipeline. You land straight on the new Deal page.' },
  { n: 4, title: 'Move the deal', detail: 'On the Deal detail, a Salesforce-style chevron path shows your stage progress — blue is current, green ticks are past, grey is upcoming. Click any chevron to jump, or hit ✓ Mark Complete to advance one step. Win Probability + Next-Best-Action refresh from KINI AI as you go. Prefer a board view? Switch the Deals page to ▦ Kanban and drag deals between columns.' },
  { n: 5, title: 'Close',         detail: 'Mark Won (with amount + close date) or Lost (with reason + competitor). Won deals add to revenue charts and Forecast; lost reasons feed Win/Loss + Lost Reasons analytics.' },
];

// The 13 CRM modules — what each one is for, in one line plus a short
// "use it when…" trigger. Mirrors the CrmSubNav order so the help reads
// top-down the same way the rep navigates.
const MODULES: Array<{ icon: string; title: string; what: string; when: string }> = [
  { icon: '📊', title: 'Dashboard (Overview)', what: 'Stat cards (open pipeline, win rate, avg deal), the geo-map of leads, and your pinned analytics widgets.', when: 'Use it when you start your day to see what changed overnight.' },
  { icon: '🎯', title: 'Leads',                what: 'Full list with filters (status, source, owner, score, state/city/district), AI score badges, bulk-assign, CSV import. Lead detail layout is fully responsive — read it on a phone in the car between meetings.', when: 'Use it when you need to slice prospects — "show me hot leads in Mumbai assigned to Ramesh".' },
  { icon: '📈', title: 'Lead Analytics',       what: 'Customisable widget grid: lead velocity, time-to-first-touch, stuck leads, cohort conversion, score-band conversion, territory map. Pin any widget to your Overview.', when: 'Use it weekly to see where the funnel is leaking.' },
  { icon: '👥', title: 'Contacts',             what: 'Your people directory. B2C contacts carry consent + loyalty tier; B2B contacts link to an Account.', when: 'Use it to manage individuals across multiple deals or repeat customers.' },
  { icon: '🏢', title: 'Accounts',             what: 'Company records that group contacts + deals together. Industry, revenue, domain, owner.', when: 'B2B sellers: this is the canonical "who is the buying organisation" view.' },
  { icon: '💼', title: 'Deals',                what: 'Open opportunities with stage, amount, probability, expected close date, line items. Toggle ☰ List ⇄ ▦ Kanban from the header — kanban filters by pipeline so you can drag deals between stages.', when: 'Use it to see your active pipeline. Switch to Kanban on Monday morning to triage; stay on List for bulk edits and filters.' },
  { icon: '📋', title: 'Pipeline',             what: 'Directory of pipelines (Enterprise, SMB, Channel etc.). Each row shows stages, open-deal count + total value. + New Pipeline lets you create the pipeline AND its stages (Open / Won / Lost, colour-coded) in one modal — no separate Settings trip.', when: 'Use it when you set up a new sales motion or want a high-level "what pipelines exist?" view. Kanban view of any pipeline → its row → Kanban →.' },
  { icon: '📦', title: 'Products',             what: 'SKU catalogue with price, weight, GST rate, category. Deals reference products via line items.', when: 'Set up once when you onboard; touch when prices change.' },
  { icon: '✅', title: 'Activities',           what: 'Call logs, meetings, emails, WhatsApp, tasks — every touchpoint a rep records.', when: 'Use it as your daily to-do. Calendar view shows what is due this week.' },
  { icon: '💬', title: 'WhatsApp',             what: 'Send templates, see conversations, track delivery. Built on Meta Business API.', when: 'Use it for templated outreach (broadcast) or one-off replies on the same record.' },
  { icon: '📑', title: 'Reports',              what: '10 built-in reports: Rep Leaderboard, Stage Funnel, Stuck Deals, Lead Aging, Win/Loss, Forecast, Sales Cycle, Activity Heatmap, Lead Source ROI, plus a Custom Report Builder.', when: 'Use it monthly for review; export any report to CSV.' },
  { icon: '⚙️', title: 'Settings',             what: '14 sub-pages: Team Members, Pipelines, Stages, Sources, Activity Types, Integrations, Automations, Assignment Rules, Territories, Scoring Model, Custom Fields, States & Cities, Business Type, Appearance.', when: 'Initial set-up + occasional tweaks.' },
  { icon: '❓', title: 'Help',                 what: "You're here.", when: 'When a teammate asks "how does X work?" — point them here.' },
];

const ACTIONS: Array<{ icon: string; color: string; title: string; detail: string }> = [
  { icon: '📞', color: '#1E88E5', title: 'Call',        detail: 'Dials the lead/contact and immediately logs a call activity. Cancel to keep the bare entry, save to add notes + duration.' },
  // WhatsApp action keeps the chat-bubble emoji but uses the same neutral
  // grey colour as Mark Unqualified so it doesn't stand out as the only
  // brand-coloured row in the action list.
  { icon: '💬', color: '#757575', title: 'WhatsApp',    detail: 'Opens a pre-filled WhatsApp thread. The conversation is captured by KINI Auto-Response if enabled.' },
  { icon: '✨', color: '#8E24AA', title: 'AI Score',    detail: 'Re-runs the KINI AI scoring model on the lead. The badge changes — green means high intent (70-100).' },
  { icon: '🔀', color: RED,       title: 'Convert',     detail: 'Promotes the lead to Contact + Account + Deal. The deal name pre-fills from the lead (editable); you land straight on the new Deal page so you can keep working.' },
  { icon: '🧭', color: BLUE,      title: 'Add to pipeline',  detail: 'On the Deal detail. Picks a pipeline for the deal, lands it on the first open stage, and repaints the chevron breadcrumb. Reads "Move pipeline" when the deal is already on one.' },
  { icon: '👤', color: '#FB8C00', title: 'Assign',      detail: 'Hands the lead/deal to another rep on the same team. Only same-client teammates are shown.' },
  { icon: '⏸️', color: '#757575', title: 'Mark Unqualified', detail: 'Closes the lead as not a fit (with a reason). Hidden from active views; can be reopened from the lead detail later.' },
  { icon: '❌', color: '#EF4444', title: 'Mark Lost',   detail: 'Closes the lead/deal as lost to a competitor / no decision. Captures reason for the Lost Reasons analytics widget.' },
  { icon: '↩️', color: '#10B981', title: 'Reopen',      detail: 'Flips an Unqualified / Lost / Converted lead back to Working. Used when a closed deal comes back to life.' },
];

// KINI AI capabilities — what the AI assistant can actually do in CRM.
// Reps land on the help page wondering "what should I ask KINI?", so this
// section doubles as inspiration + a cheat-sheet.
const KINI_CAPABILITIES: Array<{ icon: string; title: string; detail: string; examples: string[] }> = [
  { icon: '🔍', title: 'Fetch your CRM data',
    detail: 'Ask in plain language; KINI runs the right query and renders cards (lead lists, deal lists, summaries).',
    examples: [
      '"Show my top 5 hottest leads"',
      '"Which deals are stuck more than 14 days?"',
      '"List Mumbai contacts who have not been called in 30 days"',
      '"How many leads did Ramesh add this week?"',
    ]},
  { icon: '✍️', title: 'Create + edit records',
    detail: 'KINI can add leads, log activities, move deal stages, and assign owners — no form-filling. Mobile numbers are validated to 10 digits, no alphabets, so dial-tos always work.',
    examples: [
      '"Add lead Rakesh from Acme Steel, mobile 98765 43210"',
      '"Log a meeting with Vikram about pricing tomorrow 11am"',
      '"Move the Reliance deal to Negotiation"',
      '"Assign all unassigned Bangalore leads to Priya"',
    ]},
  { icon: '🎯', title: 'Score & prioritise leads',
    detail: 'AI lead scoring uses the ICP weights you configured + behavioural signals (page visits, response time, deal history).',
    examples: [
      '"Re-score this lead"',
      '"Which leads improved their score this week?"',
      '"Why is this lead a 92?"',
    ]},
  { icon: '🧭', title: 'Next-Best-Action for deals',
    detail: 'Given a deal\'s stage, last activity, and competitor profile, KINI suggests the single highest-impact next move.',
    examples: [
      '"What should I do next on the Tata deal?"',
      '"Refresh next best action for all my open deals"',
    ]},
  { icon: '📊', title: 'Win-probability prediction',
    detail: 'A model-backed probability separate from the rep\'s manual guess. Drives the Forecast chart.',
    examples: [
      '"Predict win prob for this deal"',
      '"Which Negotiation-stage deals are likely to slip?"',
    ]},
  { icon: '✉️', title: 'Draft email replies',
    detail: 'Generates context-aware follow-ups in your tone. Uses the lead/deal history as grounding so KINI doesn\'t fabricate.',
    examples: [
      '"Draft a follow-up to Acme proposal"',
      '"Write a check-in email for any lead silent > 7 days"',
    ]},
  { icon: '📝', title: 'Summarise accounts + deals',
    detail: 'One-paragraph summary of an Account or Deal — every activity, every note, every linked lead.',
    examples: [
      '"Summarise the HDFC account"',
      '"What is the history of the Hero Motocorp deal?"',
    ]},
  { icon: '🌐', title: 'Multi-language',
    detail: 'KINI replies in the language you write to it: English, हिन्दी (Devanagari), বাংলা, ଓଡ଼ିଆ, অসমীয়া. Tool calls (arguments, IDs) stay in English so data integrity is preserved.',
    examples: [
      '"मुझे आज के सबसे गर्म लीड दिखाओ"',
      '"মুম্বাইয়ের সব নতুন লিড দেখান"',
    ]},
  { icon: '🎤', title: 'Voice in + voice out',
    detail: 'Hold the mic button on the chat widget. KINI transcribes via the browser\'s speech API and answers back if you enable Hands-Free in the header.',
    examples: [
      '"Hey KINI, log a call with Ramesh — discussed pricing, follow-up next Tuesday."',
    ]},
];

// Analytics — surfaced as a dedicated section since reps often ask
// "where do I see X?". Linked cards take them straight to each report.
const ANALYTICS: Array<{ icon: string; title: string; href: string; detail: string }> = [
  { icon: '📈', title: 'Lead Analytics',       href: '/dashboard/crm/leads/analytics',      detail: 'Lead velocity, time-to-first-touch, stuck leads, score-band conversion, territory heatmap.' },
  { icon: '🏆', title: 'Rep Leaderboard',      href: '/dashboard/crm/reports/rep-leaderboard', detail: 'Calls / meetings / wins per rep — week, month, or custom range.' },
  { icon: '🪜', title: 'Stage Funnel',         href: '/dashboard/crm/reports/stage-funnel', detail: 'How many deals pass through each stage. Spot the leaky step.' },
  { icon: '⏳', title: 'Stuck Deals',          href: '/dashboard/crm/reports/stuck-deals',  detail: 'Deals that haven\'t moved in 14+ days. Sortable by days-in-stage and amount.' },
  { icon: '⌛', title: 'Lead Aging',           href: '/dashboard/crm/reports/lead-aging',   detail: 'Days since last contact, per lead. Use it to triage which old leads to call back.' },
  { icon: '🎲', title: 'Win/Loss',             href: '/dashboard/crm/reports/win-loss',     detail: 'Win rate by stage, source, owner, and lost-reason. Drill into any segment.' },
  { icon: '🔮', title: 'Forecast',             href: '/dashboard/crm/reports/forecast',     detail: 'Weighted pipeline rolled up by month, scaled by KINI AI win probability.' },
  { icon: '⏱',  title: 'Sales Cycle',          href: '/dashboard/crm/reports/sales-cycle',  detail: 'Average days lead-to-won / lead-to-lost, segmented by source and product.' },
  { icon: '🔥', title: 'Activity Heatmap',     href: '/dashboard/crm/reports/activity-heatmap', detail: 'Calls + meetings + WhatsApp by hour-of-day and day-of-week. Plan outreach blocks.' },
  { icon: '💰', title: 'Lead Source ROI',      href: '/dashboard/crm/reports/lead-source-roi', detail: 'Cost-per-lead vs revenue closed, per source. Tells you where to spend next month.' },
  { icon: '🛠', title: 'Custom Report Builder', href: '/dashboard/crm/reports/builder',      detail: 'Drag-drop fields to build any report. Save and pin it to your dashboard.' },
];

const TIPS = [
  'Tap the phone number on any lead → both a call AND an activity land in one gesture.',
  'The KINI AI floating button (bottom-right) is your AI helper. Hold the mic for voice; toggle Hands-Free for back-and-forth conversations.',
  'Tasks on the inbox are coloured by urgency. Red = overdue. Blue = today. Pull-to-refresh on mobile.',
  'Win Probability is the KINI AI guess based on stage + age + recent activity. It updates when you log meaningful interactions.',
  'Pin any chart from Lead Analytics to your Overview so it loads alongside the stat cards every morning.',
  'Settings → Custom Fields lets you add per-entity fields AND override built-in field labels (e.g. rename "Title" to "Designation") without code.',
  'Settings → Business Type controls which fields show on lead/contact forms. B2B = company + industry first; B2C = DOB + address + consent first.',
  'Use the global Client filter (top-right) to switch context — every list, chart, and report re-scopes to the selected client.',
  'KINI AI is quota-capped per user per month; the badge on the chat header shows usage. Org-level cap is also enforced.',
  'Mobile number fields are 10-digit numeric only — no alphabets, no country code. The keypad pops up automatically on mobile.',
];

export default function CrmHelpPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <Hero />

      <Section label="The lead-to-deal lifecycle" sub="From first touch to closed-won (or closed-lost).">
        <div style={{
          background: 'var(--s2)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 18,
          fontSize: 13,
          color: 'var(--text)',
          lineHeight: 1.65,
          marginBottom: 16,
        }}>
          Every lead in Kinematic moves through a small set of statuses. Reps don&rsquo;t do paperwork — they just keep the record honest by flipping the status as the relationship progresses, and the rest of the CRM (analytics, win-rate, forecasts, automations) reacts on its own.
          <div style={{ marginTop: 10 }}>
            New leads land in <strong style={{ color: 'var(--text)' }}>New</strong>. The moment a rep makes contact, it becomes <strong style={{ color: 'var(--text)' }}>Working</strong>. If the lead is interested but not yet committed, it sits in <strong style={{ color: 'var(--text)' }}>Nurturing</strong> until they&rsquo;re ready. Once they confirm a real intent to buy, hit <strong style={{ color: RED }}>Convert</strong> — the deal name pre-fills from the lead, a Contact + Account + Deal are spun up, and you land on the new Deal page ready to work the chevron breadcrumb.
          </div>
          <div style={{ marginTop: 10 }}>
            Leads that don&rsquo;t fit are marked <strong style={{ color: 'var(--text)' }}>Unqualified</strong>; deals that fall apart are marked <strong style={{ color: 'var(--text)' }}>Lost</strong> with a reason. Either can be re-opened later if circumstances change. The five-step breakdown below walks through every transition in detail.
          </div>
        </div>
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

      <Section label="Every section of the CRM" sub="What lives where, and when to reach for it.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10 }}>
          {MODULES.map((m) => (
            <div key={m.title} style={{
              background: 'var(--s2)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 14, display: 'flex', gap: 12,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'var(--s3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0,
              }}>{m.icon}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 3 }}>{m.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 6 }}>{m.what}</div>
                <div style={{ fontSize: 11, color: RED, fontWeight: 600 }}>{m.when}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Lead / Deal detail actions" sub="The buttons on a lead/contact/deal record.">
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

      <Section label="Reports & analytics" sub="Every report is one click away — these are the live links.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
          {ANALYTICS.map((a) => (
            <a key={a.title} href={a.href} style={{
              background: 'var(--s2)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 14, display: 'flex', gap: 12,
              textDecoration: 'none',
              transition: 'border-color 0.15s, transform 0.15s',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: BLUE + '1F',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0,
              }}>{a.icon}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 3 }}>{a.title} <span style={{ color: BLUE, fontSize: 11, fontWeight: 800 }}>→</span></div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{a.detail}</div>
              </div>
            </a>
          ))}
        </div>
      </Section>

      <Section label="✦ KINI AI capabilities" sub="What the AI copilot can do for you inside the CRM.">
        <div style={{
          background: `linear-gradient(135deg, ${RED}0D, #6366f10D)`,
          border: `1px solid ${RED}33`,
          borderRadius: 14,
          padding: 14,
          fontSize: 13,
          color: 'var(--text)',
          lineHeight: 1.55,
          marginBottom: 14,
        }}>
          KINI is the AI copilot built into every CRM screen. Open it from the floating <strong style={{ color: RED }}>✦</strong> button (bottom-right) or by hitting the mic anywhere. It speaks plain English (and 4 Indian languages), and it can <em>act</em> — not just answer questions.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
          {KINI_CAPABILITIES.map((k) => (
            <div key={k.title} style={{
              background: 'var(--s2)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 14,
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: RED + '1F',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0,
                }}>{k.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{k.title}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 10 }}>{k.detail}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {k.examples.map((ex, i) => (
                  <div key={i} style={{
                    fontSize: 11, color: 'var(--text)',
                    background: 'var(--s3)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '5px 9px', fontFamily: 'ui-monospace, monospace',
                  }}>{ex}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Tips & tricks" sub="Small habits that save hours a week.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {TIPS.map((t, i) => (
            <div key={i} style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              padding: '8px 12px',
              background: 'var(--s2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}>
              <span style={{ fontSize: 14 }}>💡</span>
              <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{t}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Need more help?">
        <div style={{
          background: `linear-gradient(135deg, ${RED}14, ${RED}05)`,
          border: `1px solid ${RED}40`,
          borderRadius: 14,
          padding: 20,
        }}>
          <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, marginBottom: 16 }}>
            For anything outside this guide — onboarding, integrations setup, custom workflows, training — reach out directly. We aim to reply within one business day.
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href={`tel:${SUPPORT_PHONE_DIAL}`} style={contactBtn}>
              <span style={{ fontSize: 18 }}>📞</span>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.6 }}>Call</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{SUPPORT_PHONE}</div>
              </div>
            </a>
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Kinematic%20CRM%20support`} style={contactBtn}>
              <span style={{ fontSize: 18 }}>✉️</span>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.6 }}>Email</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{SUPPORT_EMAIL}</div>
              </div>
            </a>
            <a href={`https://wa.me/${SUPPORT_PHONE_DIAL.replace('+', '')}`} target="_blank" rel="noopener noreferrer" style={contactBtn}>
              <span style={{ fontSize: 18 }}>💬</span>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.6 }}>WhatsApp</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{SUPPORT_PHONE}</div>
              </div>
            </a>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Hero() {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${RED}14, ${RED}05)`,
      border: `1px solid ${RED}33`,
      borderRadius: 18,
      padding: 24,
    }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: RED + '1F',
          color: RED,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26,
        }}>📚</div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>How Kinematic CRM works</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Everything you need to ship deals — at a glance.</div>
        </div>
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.65 }}>
        A <strong style={{ color: 'var(--text)' }}>Lead</strong> becomes a <strong style={{ color: 'var(--text)' }}>Contact</strong> + <strong style={{ color: 'var(--text)' }}>Account</strong> when qualified. A <strong style={{ color: 'var(--text)' }}>Deal</strong> tracks the conversation about money, and a <strong style={{ color: BLUE }}>chevron path</strong> on the deal detail page shows your stage progress.
        Every call, WhatsApp, meeting or note logged along the way becomes an <strong style={{ color: 'var(--text)' }}>Activity</strong> visible to the entire team.
        The whole motion is observable in <strong style={{ color: 'var(--text)' }}>Reports</strong> and assistable by <strong style={{ color: RED }}>KINI AI</strong>.
      </div>
    </div>
  );
}

function Section({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        color: RED,
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: sub ? 4 : 12,
      }}>{label}</div>
      {sub && <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>{sub}</div>}
      {children}
    </div>
  );
}

const contactBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 10,
  padding: '12px 16px',
  background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12,
  textDecoration: 'none', minWidth: 220,
  transition: 'transform 0.15s, border-color 0.15s',
};
