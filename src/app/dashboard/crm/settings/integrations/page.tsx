'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmIntegrations } from '../../../../../lib/crmApi';
import type { Integration, IntegrationProvider, IntegrationStatus } from '../../../../../types/integrations';

// ── Provider catalogue ─────────────────────────────────────────────────────────
const PROVIDERS: Array<{
  id: IntegrationProvider;
  label: string;
  desc: string;
  available: boolean;
  icon: string;
}> = [
  {
    id: 'web_form',
    label: 'Web Form',
    desc: 'Drop a JS snippet on your site. Submissions land as leads instantly.',
    available: true,
    icon: '📝',
  },
  {
    id: 'generic_webhook',
    label: 'Generic Webhook',
    desc: 'Sign + POST any JSON. Works with Zapier, Make, custom backends.',
    available: true,
    icon: '🔗',
  },
  {
    id: 'meta_lead_ads',
    label: 'Meta Lead Ads',
    desc: 'Facebook + Instagram lead forms. Real-time push via Meta App.',
    available: true,
    icon: '📘',
  },
  {
    id: 'google_ads',
    label: 'Google Ads',
    desc: 'Lead Form Extensions. Webhook-based, no OAuth needed.',
    available: true,
    icon: '🌐',
  },
  {
    id: 'zoho',
    label: 'Zoho CRM',
    desc: 'Push from Zoho via Workflow → Webhook. Mirrors new / updated Leads into Kinematic.',
    available: true,
    icon: '🟠',
  },
  {
    id: 'salesforce',
    label: 'Salesforce',
    desc: 'Push from Salesforce via Flow → HTTP Callout (or Outbound Message). One Flow per object.',
    available: true,
    icon: '☁️',
  },
];

const STATUS_STYLES: Record<IntegrationStatus, { bg: string; color: string; label: string }> = {
  active:   { bg: 'rgba(34, 197, 94, 0.12)',  color: 'rgb(34, 197, 94)',  label: 'Active'   },
  pending:  { bg: 'rgba(251, 146, 60, 0.12)', color: 'rgb(251, 146, 60)', label: 'Pending'  },
  error:    { bg: 'rgba(239, 68, 68, 0.12)',  color: 'rgb(239, 68, 68)',  label: 'Error'    },
  disabled: { bg: 'rgba(156, 163, 175, 0.12)', color: 'rgb(156, 163, 175)', label: 'Disabled' },
};

function providerLabel(id: string): string {
  return PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

function providerIcon(id: string): string {
  return PROVIDERS.find((p) => p.id === id)?.icon ?? '🔌';
}

function formatLastEvent(when: string | null, count: number): string {
  if (!when || count === 0) return 'No events yet';
  const ms = Date.now() - new Date(when).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1)  return `${count} lead${count === 1 ? '' : 's'} · just now`;
  if (min < 60) return `${count} lead${count === 1 ? '' : 's'} · ${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${count} lead${count === 1 ? '' : 's'} · ${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${count} lead${count === 1 ? '' : 's'} · ${d}d ago`;
}

// Generate a 32-char hex verify token for Meta — admin pastes this into
// the Meta App webhook subscription so we can echo the challenge back.
// Browser-safe (uses window.crypto.getRandomValues when available).
function genVerifyToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Page ────────────────────────────────────────────────────────────────────────
export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loaded, setLoaded]     = useState(false);
  const [pickingProvider, setPickingProvider] = useState(false);
  const [connectFor, setConnectFor] = useState<IntegrationProvider | null>(null);
  const [success, setSuccess] = useState<Integration | null>(null);

  const load = async () => {
    try {
      const r = await crmIntegrations.list();
      setIntegrations(r.data ?? []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load integrations');
    } finally { setLoaded(true); }
  };

  useEffect(() => { load(); }, []);

  const handleDisconnect = async (i: Integration) => {
    if (!confirm(`Disconnect “${i.label}”? Inbound leads will stop arriving immediately. Existing leads attributed to this source remain in your CRM.`)) return;
    try {
      await crmIntegrations.remove(i.id);
      toast.success(`${i.label} disconnected`);
      setIntegrations((list) => list.filter((x) => x.id !== i.id));
    } catch (e: any) {
      toast.error(e.message || 'Disconnect failed');
    }
  };

  return (
    <div>
      <Link
        href="/dashboard/crm/settings"
        style={{ fontSize: 12, color: 'var(--text-dim)', textDecoration: 'none', marginBottom: 14, display: 'inline-block' }}
      >
        ← Back to Settings
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: 'var(--text)', fontWeight: 800 }}>Lead-Source Integrations</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-dim)', maxWidth: 640 }}>
            Connect your website forms, ad platforms, and other CRMs so leads land in Kinematic automatically. Cross-channel duplicates merge by phone or email.
          </p>
        </div>
        <button
          onClick={() => setPickingProvider(true)}
          style={primaryBtn}
        >
          + Add integration
        </button>
      </div>

      {/* ── Active integrations ── */}
      {!loaded ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
      ) : integrations.length === 0 ? (
        <div style={{
          background: 'var(--s2)', border: '1px dashed var(--border)', borderRadius: 14,
          padding: 48, textAlign: 'center', marginBottom: 20,
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔌</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>No integrations yet</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 380, margin: '0 auto 18px' }}>
            Pick a source below to start pulling leads in. The web form is the fastest — paste one line of JavaScript on your site.
          </div>
          <button onClick={() => setPickingProvider(true)} style={primaryBtn}>Connect your first source</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12, marginBottom: 24 }}>
          {integrations.map((i) => {
            const style = STATUS_STYLES[i.status] ?? STATUS_STYLES.disabled;
            return (
              <div key={i.id} style={{
                background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14,
                padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ fontSize: 26, lineHeight: 1 }}>{providerIcon(i.provider)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {i.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{providerLabel(i.provider)}</div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 20,
                    background: style.bg, color: style.color,
                  }}>{style.label}</span>
                </div>

                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {formatLastEvent(i.last_synced_at, i.last_event_count)}
                </div>

                {i.last_error && (
                  <div style={{
                    fontSize: 11, color: 'rgb(239, 68, 68)', background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 6, padding: '6px 8px',
                  }}>
                    {i.last_error.slice(0, 140)}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                  <button onClick={() => handleDisconnect(i)} style={ghostBtnDanger}>Disconnect</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add-integration: provider picker ── */}
      {pickingProvider && (
        <Modal onClose={() => setPickingProvider(false)} title="Connect a lead source" subtitle="Pick where your leads come from. New providers are added every release.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                disabled={!p.available}
                onClick={() => { setPickingProvider(false); setConnectFor(p.id); }}
                style={{
                  textAlign: 'left',
                  background: p.available ? 'var(--s3)' : 'var(--s2)',
                  border: '1px solid var(--border)',
                  borderRadius: 10, padding: 14, cursor: p.available ? 'pointer' : 'not-allowed',
                  color: 'var(--text)', opacity: p.available ? 1 : 0.55,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 22 }}>{p.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{p.label}</span>
                  {!p.available && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', padding: '2px 6px',
                      background: 'var(--s4)', borderRadius: 4,
                    }}>SOON</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>{p.desc}</div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* ── Connect modal ── */}
      {connectFor && (
        <ConnectModal
          provider={connectFor}
          onClose={() => setConnectFor(null)}
          onCreated={(integration) => {
            setConnectFor(null);
            setSuccess(integration);
            // Refresh the list so the new card shows up under "Active".
            load();
          }}
        />
      )}

      {/* ── Success modal: show webhook URL once ── */}
      {success && (
        <SuccessModal integration={success} onClose={() => setSuccess(null)} />
      )}
    </div>
  );
}

// ── Connect modal ──────────────────────────────────────────────────────────────────────
function ConnectModal({
  provider, onClose, onCreated,
}: {
  provider: IntegrationProvider;
  onClose: () => void;
  onCreated: (i: Integration) => void;
}) {
  const meta = PROVIDERS.find((p) => p.id === provider)!;
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Meta-specific credential inputs (kept null/empty for other providers
  // so the same component covers everything).
  const [appSecret, setAppSecret] = useState('');
  const [pageAccessToken, setPageAccessToken] = useState('');
  const [pageId, setPageId] = useState('');
  // Auto-generate a fresh verify token per session; admin pastes this
  // into Meta's webhook subscription. Memoised so re-renders don't
  // reroll the token while the modal is open.
  const verifyToken = useMemo(() => provider === 'meta_lead_ads' ? genVerifyToken() : '', [provider]);

  const submit = async () => {
    if (!label.trim()) {
      toast.error('Give this connection a name so you can identify it later');
      return;
    }
    if (provider === 'meta_lead_ads') {
      if (!appSecret.trim() || !pageAccessToken.trim()) {
        toast.error('Meta needs both App Secret and Page Access Token');
        return;
      }
    }
    setSubmitting(true);
    try {
      const body: Parameters<typeof crmIntegrations.create>[0] = {
        provider,
        label: label.trim(),
      };
      if (provider === 'meta_lead_ads') {
        body.config = {
          verify_token: verifyToken,
          ...(pageId.trim() ? { page_id: pageId.trim() } : {}),
        };
        body.credentials = {
          app_secret: appSecret.trim(),
          page_access_token: pageAccessToken.trim(),
        };
      }
      const r = await crmIntegrations.create(body);
      const integration = (r as any)?.data ?? r;
      if (!integration || !integration.id) {
        // Unexpected response shape — surface explicitly so the user
        // isn't left wondering whether the click did anything.
        console.error('[integrations.create] unexpected response', r);
        toast.error('Connection failed — the server returned an unexpected response. Check the browser network tab.');
        setSubmitting(false);
        return;
      }
      // Carry the verify_token forward so the success modal can show it
      // back to the admin (we generated it client-side; backend stored
      // it inside config, but echoing here avoids a second fetch).
      onCreated({
        ...integration,
        config: { ...(integration.config ?? {}), ...(provider === 'meta_lead_ads' ? { verify_token: verifyToken } : {}) },
      });
    } catch (e: any) {
      // Long-lived toast + console log so the actual error message is
      // visible. The integrations flow used to fail silently when the
      // backend returned a 4xx; users saw the modal hang and assumed
      // "nothing happens".
      const msg = e?.message || 'Connection failed';
      console.error('[integrations.create] failed', e);
      toast.error(msg, { duration: 8000 });
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} title={`Connect ${meta.label}`} subtitle={meta.desc}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={fieldLabel}>Connection name</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={
              provider === 'web_form'        ? 'e.g. Acme.com Contact Form'           :
              provider === 'generic_webhook' ? 'e.g. Zapier — Newsletter Signups'    :
              provider === 'meta_lead_ads'   ? 'e.g. Acme Facebook Page'              :
              provider === 'google_ads'      ? 'e.g. Festive Search Campaign'         : ''
            }
            autoFocus
            style={input}
          />
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            We&rsquo;ll auto-create a matching lead source so reports and assignment rules
            can target it. You can rename it later from Lead Sources.
          </div>
        </div>

        {/* Meta-specific credential inputs */}
        {provider === 'meta_lead_ads' && (
          <>
            <div>
              <label style={fieldLabel}>App Secret</label>
              <input
                type="password"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder="From Meta App → Settings → Basic"
                style={{ ...input, fontFamily: 'monospace' }}
              />
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                Used to verify webhook signatures (HMAC-SHA256). Stored encrypted.
              </div>
            </div>
            <div>
              <label style={fieldLabel}>Page Access Token</label>
              <input
                type="password"
                value={pageAccessToken}
                onChange={(e) => setPageAccessToken(e.target.value)}
                placeholder="From Graph API Explorer → Page token"
                style={{ ...input, fontFamily: 'monospace' }}
              />
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                Used to fetch each lead&rsquo;s field data via Graph API. Long-lived
                Page tokens are recommended (60-day expiry → refresh).
              </div>
            </div>
            <div>
              <label style={fieldLabel}>Page ID (optional)</label>
              <input
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                placeholder="Multi-Page apps only — filter incoming events"
                style={input}
              />
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                Leave blank to accept lead events from any Page your app is subscribed to.
              </div>
            </div>
            <div>
              <label style={fieldLabel}>Verify Token (we generated this)</label>
              <input value={verifyToken} readOnly style={{ ...input, fontFamily: 'monospace', fontSize: 11 }} />
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                You&rsquo;ll paste this into Meta&rsquo;s webhook subscription on the next screen.
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={ghostBtn} disabled={submitting}>Cancel</button>
          <button onClick={submit} style={primaryBtn} disabled={submitting}>
            {submitting ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Success modal: show webhook URL + JS snippet ─────────────────────────────────────────────
function SuccessModal({ integration, onClose }: { integration: Integration; onClose: () => void }) {
  const url = integration.webhook_url ?? '';
  const provider = integration.provider;
  const verifyToken = (integration.config as Record<string, unknown> | undefined)?.verify_token as string | undefined;

  // Test-lead state for the inline preview / live-check step. We POST
  // a known-good payload to the webhook URL the user just got — same
  // URL they're about to paste into their site — so they confirm the
  // round-trip works before embedding anywhere.
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string; leadId?: string } | null>(null);
  const sendTestLead = async () => {
    if (!url) return;
    setTesting(true);
    setTestResult(null);
    try {
      const payload = {
        name: 'Test Lead',
        email: `test+${Date.now()}@kinematic.test`,
        phone: '9999999999',
        city: 'Online',
        notes: 'Test submission from the Kinematic integration wizard',
        referrer_url: typeof window !== 'undefined' ? window.location.href : '',
      };
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j: any = await r.json().catch(() => ({}));
      if (r.ok && j?.ok !== false) {
        const leadId = j?.lead_id || j?.data?.lead_id;
        setTestResult({ ok: true, msg: 'Lead created — check the Leads page in a moment.', leadId });
        toast.success('Test lead landed in your CRM');
      } else {
        setTestResult({ ok: false, msg: j?.error || j?.message || `HTTP ${r.status}` });
        toast.error('Test failed — see details below');
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e?.message || 'Network error' });
      toast.error('Test failed — see details below');
    } finally {
      setTesting(false);
    }
  };

  const jsSnippet =
    provider === 'web_form'
      ? `<form id="kinematic-lead-form">
  <input name="name"    placeholder="Name"   required />
  <input name="email"   placeholder="Email"  type="email" />
  <input name="phone"   placeholder="Mobile" type="tel" required />
  <input name="city"    placeholder="City"   required />
  <input name="company" placeholder="Company" />
  <button type="submit">Get a callback</button>
</form>
<script>
  document.getElementById('kinematic-lead-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.referrer_url = location.href;
    await fetch(${JSON.stringify(url)}, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    e.target.reset();
    alert('Thanks! We\\'ll be in touch.');
  });
</script>`
      : null;

  // One-line embed — the recommended path. Loads Kinematic's hosted
  // embed.js which renders a branded, validated, CORS-safe form right
  // where the host <div> is placed. Customisable via data-attributes.
  const embedUrl = (() => {
    try {
      // Derive the embed.js host from the webhook URL we just got so
      // multi-tenant deploys (eu.kinematic.com, etc) pick up the right
      // CDN automatically without any extra config.
      const u = new URL(url);
      return `${u.protocol}//${u.host}/embed.js`;
    } catch { return ''; }
  })();
  const embedSnippet =
    provider === 'web_form' && embedUrl
      ? `<div data-kinematic-form="${url}"
     data-title="Get a callback"
     data-primary-color="#E01E2C"
     data-fields="name,email,phone,city,message"></div>
<script src="${embedUrl}" async></script>`
      : null;

  // Zero-code option: a hosted form on Kinematic's own domain. Derived
  // from the webhook URL — same id + key, just under /f/<id>. Share by
  // link, QR code, WhatsApp, email — no website needed. Behind the
  // scenes the page just embeds the same embed.js loader.
  const hostedFormUrl = (() => {
    if (provider !== 'web_form') return '';
    try {
      const u = new URL(url);
      const m = u.pathname.match(/\/webhook\/[^/]+\/([0-9a-f-]+)/i);
      const integrationId = m ? m[1] : '';
      const key = u.searchParams.get('key') || '';
      if (!integrationId || !key) return '';
      return `${u.protocol}//${u.host}/f/${integrationId}?key=${encodeURIComponent(key)}`;
    } catch { return ''; }
  })();
  const qrUrl = hostedFormUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(hostedFormUrl)}`
    : '';

  // Includes `city` because city-scoped reps (the default for non-admin
  // users) won't see leads with a null city — backend filters them out
  // before the row reaches the leads list.
  const curlSnippet =
    `curl -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Test Lead","email":"test@example.com","phone":"+919876543210","city":"Mumbai"}'`;

  const copy = (text: string, what: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${what} copied to clipboard`),
      () => toast.error('Copy failed — select and copy manually'),
    );
  };

  // Provider-specific setup steps shown above the URL.
  const setupSteps =
    provider === 'meta_lead_ads' ? (
      <div style={{
        background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.25)',
        borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text)',
      }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Wire it up in Meta:</div>
        <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Open your Meta App → <strong>Products → Webhooks → Page</strong>.</li>
          <li>Click <strong>Subscribe to this object → Edit subscription</strong>.</li>
          <li>Paste the <em>Webhook URL</em> below as Callback URL.</li>
          <li>Paste the <em>Verify Token</em> below.</li>
          <li>Subscribe to the <code style={{ background: 'var(--s3)', padding: '1px 4px', borderRadius: 3 }}>leadgen</code> field.</li>
          <li>For each Page you want leads from, click <strong>Subscribe</strong>.</li>
        </ol>
      </div>
    ) : provider === 'google_ads' ? (
      <div style={{
        background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.25)',
        borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text)',
      }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Wire it up in Google Ads:</div>
        <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Open your campaign → <strong>Assets → Lead Form Asset</strong>.</li>
          <li>Edit the asset → <strong>Lead Delivery Options → Webhook integration</strong>.</li>
          <li>Paste the <em>Webhook URL</em> below.</li>
          <li>The <em>Key</em> is already embedded in the URL — Google Ads will read it
            from the <code style={{ background: 'var(--s3)', padding: '1px 4px', borderRadius: 3 }}>?key=…</code> parameter.</li>
          <li>Click <strong>Send test data</strong> in Google Ads to verify the connection.</li>
        </ol>
      </div>
    ) : provider === 'zoho' ? (
      <div style={{
        background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.25)',
        borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text)',
      }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Wire it up in Zoho CRM:</div>
        <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>In Zoho CRM, open <strong>Setup → Automation → Workflow Rules</strong>.</li>
          <li>Create a new rule on the <strong>Leads</strong> module, triggering on <em>Create</em> (and optionally <em>Edit</em>).</li>
          <li>In the rule&rsquo;s actions, choose <strong>Webhook</strong> → New.</li>
          <li>Set Method = <code style={{ background: 'var(--s3)', padding: '1px 4px', borderRadius: 3 }}>POST</code>, paste the <em>Webhook URL</em> below as the URL to Notify.</li>
          <li>Pick the parameters to send — at minimum <code>First_Name</code>, <code>Last_Name</code>, <code>Email</code>, <code>Phone</code>, <code>Company</code>, <code>City</code>. We map Zoho&rsquo;s standard field names automatically.</li>
          <li>Save → trigger a test by creating a Lead in Zoho.</li>
        </ol>
      </div>
    ) : provider === 'salesforce' ? (
      <div style={{
        background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.25)',
        borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text)',
      }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Wire it up in Salesforce:</div>
        <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Open <strong>Setup → Process Automation → Flows</strong>, create a Record-Triggered Flow on the <strong>Lead</strong> object (Triggered when: A record is created).</li>
          <li>Add an <strong>HTTP Callout</strong> action (or use the legacy <em>Outbound Message</em> if your edition lacks Callouts).</li>
          <li>Method = <code style={{ background: 'var(--s3)', padding: '1px 4px', borderRadius: 3 }}>POST</code>, Endpoint = the <em>Webhook URL</em> below, Body = JSON.</li>
          <li>Include the standard fields: <code>FirstName</code>, <code>LastName</code>, <code>Email</code>, <code>Phone</code>, <code>Company</code>, <code>City</code>, <code>State</code>, <code>LeadSource</code>. Salesforce&rsquo;s native column names map automatically.</li>
          <li>Save + Activate the flow → trigger by creating a Lead in Salesforce.</li>
        </ol>
      </div>
    ) : null;

  return (
    <Modal
      onClose={onClose}
      title="✅ Connected"
      subtitle="Copy your webhook URL now — the secret is only shown once. We auto-created a matching lead source you'll see in reports."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {setupSteps}

        <div>
          <label style={fieldLabel}>Webhook URL</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={url} readOnly style={{ ...input, fontFamily: 'monospace', fontSize: 11 }} />
            <button onClick={() => copy(url, 'Webhook URL')} style={ghostBtn}>Copy</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            Paste this URL into the provider&rsquo;s webhook field, or POST JSON to it from your site.
          </div>
        </div>

        {/* Meta-specific verify token display */}
        {provider === 'meta_lead_ads' && verifyToken && (
          <div>
            <label style={fieldLabel}>Verify Token</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={verifyToken} readOnly style={{ ...input, fontFamily: 'monospace', fontSize: 11 }} />
              <button onClick={() => copy(verifyToken, 'Verify Token')} style={ghostBtn}>Copy</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
              Meta echoes this back during the subscription handshake — we verify the match
              before accepting any incoming leadgen events.
            </div>
          </div>
        )}

        {hostedFormUrl && (
          <div style={{
            background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.35)',
            borderRadius: 10, padding: 14,
          }}>
            <label style={{ ...fieldLabel, color: 'rgb(59, 130, 246)' }}>
              ✨ Easiest — share a link, no website needed
            </label>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.5 }}>
              Kinematic hosts the form for you. Share the link in WhatsApp, email, or your bio. Or print the QR for a poster / business card.
              Every submission lands in your CRM with the right tenant scope.
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>Share link</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={hostedFormUrl} readOnly style={{ ...input, fontFamily: 'monospace', fontSize: 11 }} />
                  <button onClick={() => copy(hostedFormUrl, 'Form link')} style={ghostBtn}>Copy</button>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <a
                    href={hostedFormUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ ...ghostBtn, textDecoration: 'none', textAlign: 'center', flex: 1 }}
                  >
                    Open form ↗
                  </a>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(hostedFormUrl)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ ...ghostBtn, textDecoration: 'none', textAlign: 'center', flex: 1 }}
                  >
                    Share on WhatsApp
                  </a>
                </div>
              </div>
              {qrUrl && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>QR code</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrUrl} alt="Form QR code" width={140} height={140}
                       style={{ borderRadius: 8, background: '#fff', padding: 6, border: '1px solid var(--border)' }} />
                  <div style={{ marginTop: 4 }}>
                    <a href={qrUrl} download="kinematic-form-qr.png" style={{ fontSize: 11, color: 'var(--text-dim)' }}>Download PNG</a>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {embedSnippet && (
          <div style={{
            background: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.30)',
            borderRadius: 10, padding: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ ...fieldLabel, marginBottom: 0, color: 'rgb(34, 197, 94)' }}>
                ✓ Have a website — one-line embed
              </label>
              <button onClick={() => copy(embedSnippet, 'Embed snippet')} style={ghostBtn}>Copy</button>
            </div>
            <textarea
              value={embedSnippet}
              readOnly
              rows={5}
              style={{ ...input, fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.5 }}>
              Drops a branded, validated form on any site. Theme it with{' '}
              <code style={{ background: 'var(--s3)', padding: '1px 4px', borderRadius: 3 }}>data-primary-color</code>,{' '}
              <code style={{ background: 'var(--s3)', padding: '1px 4px', borderRadius: 3 }}>data-radius</code>,{' '}
              <code style={{ background: 'var(--s3)', padding: '1px 4px', borderRadius: 3 }}>data-theme="dark"</code>,{' '}
              <code style={{ background: 'var(--s3)', padding: '1px 4px', borderRadius: 3 }}>data-fields="name,phone,city"</code>.
              Phone is auto-validated (10 digits) and email format-checked. Success replaces the form
              with your custom message; failures show inline.
            </div>
          </div>
        )}

        {jsSnippet && (
          <details>
            <summary style={{ ...fieldLabel, cursor: 'pointer', listStyle: 'revert' }}>
              Advanced — raw HTML snippet
            </summary>
            <div style={{ marginTop: 8 }}>
              <textarea
                value={jsSnippet}
                readOnly
                rows={14}
                style={{ ...input, fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Use this if you can&rsquo;t load a remote script (CSP, air-gapped, etc.). You lose the auto-validation, branded styling, and dynamic success state.
                </div>
                <button onClick={() => copy(jsSnippet, 'HTML snippet')} style={ghostBtn}>Copy</button>
              </div>
            </div>
          </details>
        )}

        {provider !== 'meta_lead_ads' && provider !== 'google_ads' && (
          <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ ...fieldLabel, marginBottom: 0 }}>Send a test lead</label>
              <button
                type="button"
                onClick={sendTestLead}
                disabled={testing || !url}
                style={{ ...primaryBtn, padding: '6px 12px', fontSize: 12, opacity: testing ? 0.6 : 1, cursor: testing ? 'wait' : 'pointer' }}
              >
                {testing ? 'Sending…' : '▶ Run test'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: testResult ? 10 : 0 }}>
              Posts a sample lead to the URL above so you can verify the round-trip before pasting the snippet on your site.
            </div>
            {testResult && (
              <div style={{
                background: testResult.ok ? 'rgba(34, 197, 94, 0.10)' : 'rgba(239, 68, 68, 0.10)',
                border: `1px solid ${testResult.ok ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                color: testResult.ok ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
                borderRadius: 6, padding: '8px 10px', fontSize: 12, fontWeight: 600,
              }}>
                {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
                {testResult.ok && (
                  <Link href="/dashboard/crm/leads" onClick={onClose} style={{ marginLeft: 8, color: 'inherit', textDecoration: 'underline' }}>
                    Open Leads →
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {jsSnippet && (
          <div>
            <label style={fieldLabel}>Live preview</label>
            <div style={{
              background: '#ffffff', color: '#111827', border: '1px solid var(--border)',
              borderRadius: 8, padding: 14, marginBottom: 8,
            }}>
              {/* Render the same snippet inline so admins see exactly what
                  embedding will look like on their site. The form's submit
                  posts to the same webhook URL as the production embed —
                  identical behaviour, no extra wiring. */}
              <div dangerouslySetInnerHTML={{ __html: jsSnippet }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              This is the same form your visitors will see. Filling it submits to your CRM exactly like the live embed.
            </div>
          </div>
        )}

        {provider !== 'meta_lead_ads' && provider !== 'google_ads' && (
          <div>
            <label style={fieldLabel}>Quick test (curl)</label>
            <textarea
              value={curlSnippet}
              readOnly
              rows={4}
              style={{ ...input, fontFamily: 'monospace', fontSize: 11 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => copy(curlSnippet, 'curl command')} style={ghostBtn}>Copy curl</button>
            </div>
          </div>
        )}

        <div style={{
          background: 'rgba(251, 146, 60, 0.08)', border: '1px solid rgba(251, 146, 60, 0.25)',
          borderRadius: 8, padding: 10, fontSize: 11, color: 'var(--text)',
        }}>
          ⚠️ The webhook URL contains a secret. Anyone with the URL can post leads to your CRM
          (rate-limited to 200/min). Don&rsquo;t commit it to a public repo — use a server-side
          form proxy or environment variable when embedding.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={primaryBtn}>I&rsquo;ve copied it</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal primitive ─────────────────────────────────────────────────────────────────
function Modal({
  children, onClose, title, subtitle,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 14,
          maxWidth: 640, width: '100%', maxHeight: '90vh', overflow: 'auto',
          padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{title}</h2>
          {subtitle && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>{subtitle}</p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Inline style tokens (matches the rest of the settings pages) ────────────────────────
const fieldLabel: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)',
  textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6,
};
const input: React.CSSProperties = {
  width: '100%', background: 'var(--s3)', border: '1px solid var(--border)',
  color: 'var(--text)', padding: '9px 12px', borderRadius: 8, fontSize: 13, outline: 'none',
  fontFamily: 'inherit',
};
const primaryBtn: React.CSSProperties = {
  background: 'var(--primary)', border: 'none', color: '#fff',
  padding: '9px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '9px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600,
};
const ghostBtnDanger: React.CSSProperties = {
  ...ghostBtn,
  color: 'rgb(239, 68, 68)',
  borderColor: 'rgba(239, 68, 68, 0.4)',
};
