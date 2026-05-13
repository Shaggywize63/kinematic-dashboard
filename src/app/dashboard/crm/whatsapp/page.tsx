'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmContacts, crmLeads, crmActivities } from '../../../../lib/crmApi';
import { waLink, isValidWaPhone } from '../../../../lib/whatsapp';
import type { Contact, Lead } from '../../../../types/crm';
import WhatsAppLogo from '../../../../components/icons/WhatsAppLogo';

const TEMPLATES: Array<{ label: string; text: string }> = [
  { label: 'Greeting', text: 'Hi {name}, hope you are doing well! I wanted to follow up regarding your inquiry.' },
  { label: 'Follow-up', text: 'Hi {name}, just following up on our previous conversation. Do you have any questions I can help with?' },
  { label: 'Proposal', text: 'Hi {name}, I have put together a proposal for you. When would be a good time to walk through it?' },
  { label: 'Check-in', text: 'Hi {name}, just checking in to see how everything is going. Anything I can assist you with?' },
  { label: 'Meeting', text: 'Hi {name}, would you be available for a quick call this week to discuss next steps?' },
];

type SearchResult = { id: string; name: string; phone: string; type: 'lead' | 'contact' };

export default function WhatsAppPage() {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [opened, setOpened] = useState(false);
  const [logging, setLogging] = useState(false);
  const [entityRef, setEntityRef] = useState<{ type: 'lead' | 'contact'; id: string } | null>(null);

  useEffect(() => {
    if (!search.trim() || search.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const [lr, cr] = await Promise.allSettled([
          crmLeads.list({ search: search.trim() }),
          crmContacts.list({ search: search.trim() }),
        ]);
        const leadList = lr.status === 'fulfilled' ? (lr.value.data || []) : [];
        const contactList = cr.status === 'fulfilled' ? (cr.value.data || []) : [];
        const mapped: SearchResult[] = [
          ...leadList
            .filter((x: Lead) => !!x.phone)
            .slice(0, 6)
            .map((x: Lead): SearchResult => ({
              id: x.id,
              name: x.full_name || `${x.first_name || ''} ${x.last_name || ''}`.trim() || x.email || 'Lead',
              phone: x.phone as string,
              type: 'lead',
            })),
          ...contactList
            .filter((x: Contact) => !!x.phone)
            .slice(0, 6)
            .map((x: Contact): SearchResult => ({
              id: x.id,
              name: x.full_name || `${x.first_name || ''} ${x.last_name || ''}`.trim() || x.email || 'Contact',
              phone: x.phone as string,
              type: 'contact',
            })),
        ];
        setResults(mapped);
      } catch {
        setResults([]);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [search]);

  const selectResult = (r: SearchResult) => {
    setPhone(r.phone);
    setName(r.name);
    setEntityRef({ type: r.type, id: r.id });
    setSearch('');
    setResults([]);
    if (!message.trim()) {
      const first = r.name.split(' ')[0];
      setMessage(`Hi ${first}, `);
    }
  };

  const applyTemplate = (tpl: typeof TEMPLATES[number]) => {
    const first = name ? name.split(' ')[0] : 'there';
    setMessage(tpl.text.replace(/\{name\}/g, first));
  };

  // Attached media is tracked separately so the textarea shows the message
  // body cleanly. We keep the underlying File around so we can actually share
  // it (Web Share API on mobile) instead of just pasting a URL.
  const [attachment, setAttachment] = useState<{ url: string; kind: 'image' | 'document' | 'video'; file?: File; mime?: string; name?: string } | null>(null);

  /** Compose the final outbound message: just the body. When using Web Share
   *  we also pass the file separately; when falling back to wa.me we append
   *  the URL so WhatsApp renders an inline preview. */
  const composedMessage = message;
  const composedWithUrl = attachment ? `${message ? `${message}\n` : ''}${attachment.url}` : message;

  /** Fire the "WhatsApp message" activity on a linked lead/contact. We do
   *  this on Open click (not just on the explicit Log button) because the
   *  user explicitly asked us to record the moment the chat is opened. */
  const autoLogActivity = async (note: string) => {
    if (!entityRef) return;
    try {
      const body: Record<string, unknown> = {
        type: 'whatsapp',
        subject: `WhatsApp to ${name || phone}`,
        description: note,
        status: 'completed',
        completed_at: new Date().toISOString(),
      };
      body[`${entityRef.type}_id`] = entityRef.id;
      if (attachment?.url) body.image_url = attachment.kind === 'image' ? attachment.url : undefined;
      await crmActivities.create(body as never);
    } catch { /* non-fatal — open the chat regardless */ }
  };

  const openWhatsApp = async () => {
    if (!isValidWaPhone(phone)) { toast.error('Enter a valid phone number with country code'); return; }
    // 1. If we have a file AND the browser supports Web Share with files,
    //    pop the system share sheet so the user can pick WhatsApp and the
    //    file goes as a real attachment (not a URL paste).
    if (attachment?.file && typeof navigator !== 'undefined' && 'canShare' in navigator) {
      try {
        const data: ShareData = { files: [attachment.file], text: composedMessage } as ShareData;
        const ok = (navigator as Navigator & { canShare?: (d: ShareData) => boolean }).canShare?.(data);
        if (ok) {
          await (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share?.(data);
          setOpened(true);
          toast.success('Pick WhatsApp from the share sheet to attach the file');
          autoLogActivity(composedMessage);
          return;
        }
      } catch (e: unknown) {
        // User cancelled, or share failed — fall through to wa.me.
        const msg = e instanceof Error ? e.message : '';
        if (msg.includes('AbortError') || msg.toLowerCase().includes('abort')) return;
      }
    }
    // 2. Fallback: classic click-to-chat. Message body + media URL appended.
    const url = waLink(phone, composedWithUrl);
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpened(true);
    toast.success('WhatsApp opened — send your message there');
    autoLogActivity(composedMessage || '(no message body)');
  };

  const copyMessage = () => {
    if (!composedMessage.trim()) { toast.error('No message to copy'); return; }
    navigator.clipboard.writeText(composedMessage)
      .then(() => toast.success('Message copied'))
      .catch(() => toast.error('Copy failed'));
  };

  const logActivity = async () => {
    if (!entityRef) { toast.error('Pick a lead/contact above to log this against'); return; }
    setLogging(true);
    try {
      const body: Record<string, unknown> = {
        type: 'whatsapp',
        subject: `WhatsApp message to ${name || phone}`,
        description: message || undefined,
        completed_at: new Date().toISOString(),
      };
      body[`${entityRef.type}_id`] = entityRef.id;
      await crmActivities.create(body as never);
      toast.success('Activity logged');
      setOpened(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Log failed';
      toast.error(msg);
    } finally { setLogging(false); }
  };

  const previewLink = phone.trim() && isValidWaPhone(phone) ? waLink(phone, composedMessage) : null;

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <WhatsAppLogo size={28} />
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>WhatsApp</div>
          <span style={{ fontSize: 11, background: '#25D36622', color: '#25D366', borderRadius: 6, padding: '2px 8px', fontWeight: 700 }}>Click-to-Chat</span>
          <Link
            href="/dashboard/crm/templates?tab=whatsapp"
            style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--primary)', textDecoration: 'none', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            Manage Templates →
          </Link>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 18px', lineHeight: 1.5 }}>
          Compose your message below. Clicking <strong>Open in WhatsApp</strong> launches WhatsApp Web (desktop) or the native app with the message pre-filled — review and send it from there. Replies stay in WhatsApp; you can copy-paste them back here and log the conversation as a CRM activity.
        </p>

        <div style={{ marginBottom: 14, position: 'relative' }}>
          <Label>Search Lead or Contact</Label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type a name or email to auto-fill phone..."
            style={inputStyle}
          />
          {results.length > 0 && (
            <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: 280, overflowY: 'auto' }}>
              {results.map((r) => (
                <button
                  key={`${r.type}-${r.id}`}
                  type="button"
                  onClick={() => selectResult(r)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text)', fontSize: 13, textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 10, background: r.type === 'lead' ? 'var(--primary)' : '#8b5cf6', color: '#fff', borderRadius: 4, padding: '1px 6px', fontWeight: 700, textTransform: 'uppercase' }}>{r.type}</span>
                  <span style={{ fontWeight: 600 }}>{r.name}</span>
                  <span style={{ color: 'var(--text-dim)', marginLeft: 'auto' }}>{r.phone}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <Label>Phone Number <span style={{ color: '#ef4444' }}>*</span></Label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" style={inputStyle} />
            <Hint>Include country code (e.g. +91 for India)</Hint>
          </div>
          <div>
            <Label>Recipient Name</Label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="For personalising templates" style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <Label>Quick Templates</Label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => applyTemplate(t)}
                style={{ padding: '5px 10px', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Label>Message</Label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="Type your message here, or pick a quick template above..."
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
          {attachment && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10 }}>
              {attachment.kind === 'image' ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={attachment.url} alt="Attached" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} />
              ) : attachment.kind === 'video' ? (
                <div style={{ width: 56, height: 56, borderRadius: 6, background: 'var(--s2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🎬</div>
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 6, background: 'var(--s2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📄</div>
              )}
              <div style={{ flex: 1, fontSize: 12, color: 'var(--text-dim)' }}>
                {attachment.kind === 'image' ? 'Image' : attachment.kind === 'video' ? 'Video' : 'Document'} attached{attachment.name ? ` — ${attachment.name}` : ''}
                <div style={{ fontSize: 11, color: 'var(--text-dim)', opacity: 0.7, marginTop: 2 }}>
                  {attachment.file
                    ? 'On mobile, Open in WhatsApp will share the file directly via the share sheet. On desktop, WhatsApp will preview the link.'
                    : 'WhatsApp will preview the link when you send.'}
                </div>
              </div>
              <button type="button" onClick={() => setAttachment(null)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '6px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Remove</button>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8, flexWrap: 'wrap' }}>
            <MediaAttachButton onAttach={(a) => setAttachment(a)} hasAttachment={!!attachment} />
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{message.length} characters</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={openWhatsApp}
            disabled={!isValidWaPhone(phone)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '11px 20px', background: '#25D366', color: '#fff',
              border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14,
              cursor: isValidWaPhone(phone) ? 'pointer' : 'not-allowed',
              opacity: isValidWaPhone(phone) ? 1 : 0.5,
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
            Open in WhatsApp
          </button>
          <button
            type="button"
            onClick={copyMessage}
            disabled={!message.trim()}
            style={{ padding: '11px 16px', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: message.trim() ? 'pointer' : 'not-allowed', opacity: message.trim() ? 1 : 0.5 }}
          >
            Copy Message
          </button>
          {previewLink && (
            <a href={previewLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--primary)', textDecoration: 'underline' }}>
              Preview link ↗
            </a>
          )}
        </div>
      </div>

      {opened && (
        <div style={{ background: 'var(--s2)', border: '1px solid #25D36655', borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            ✓ WhatsApp opened in a new tab
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 12px' }}>
            {entityRef
              ? 'We already logged this on the contact / lead timeline. If you also exchanged follow-ups in WhatsApp, you can add another activity below.'
              : 'Send your message in WhatsApp. Pick a lead/contact above to keep a CRM record next time.'}
          </p>
          {entityRef ? (
            <button
              type="button"
              onClick={logActivity}
              disabled={logging}
              style={{ padding: '9px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: logging ? 'wait' : 'pointer', opacity: logging ? 0.6 : 1 }}
            >
              {logging ? 'Logging…' : 'Log Follow-up Activity'}
            </button>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              Search and select a lead or contact above to log this conversation.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--s3)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 12px',
  color: 'var(--text)',
  fontSize: 13,
  outline: 'none',
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>{children}</div>;
}

// On supported browsers (Chrome Android, Safari iOS) we hand the File to
// the system share sheet via navigator.share so WhatsApp receives a real
// attachment. On desktop browsers without canShare(files), we fall back to
// uploading the file and appending the URL — WhatsApp still renders an
// inline preview, but the recipient gets a link rather than a file.
function MediaAttachButton({ onAttach, hasAttachment }: { onAttach: (a: { url: string; kind: 'image' | 'document' | 'video'; file?: File; mime?: string; name?: string }) => void; hasAttachment: boolean }) {
  const photoRef = useRef<HTMLInputElement>(null);
  const docRef   = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (f: File, kind: 'image' | 'document' | 'video') => {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { toast.error('File must be under 25 MB'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      // /upload/photo uses field `photo`, /upload/material uses field `file`.
      const uploadType = kind === 'image' ? 'photo' : 'material';
      fd.append(kind === 'image' ? 'photo' : 'file', f);
      const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') : null;
      const orgId = typeof window !== 'undefined' ? (JSON.parse(localStorage.getItem('kinematic_user') || '{}').org_id || '') : '';
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/upload/${uploadType}`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(orgId ? { 'X-Org-Id': orgId } : {}) },
        body: fd,
      });
      const json = await r.json();
      const url = json?.data?.url || json?.url;
      if (!url) throw new Error(json?.error || json?.message || 'Upload failed');
      // Pass the File along so Open-in-WhatsApp can use the Share Sheet on mobile.
      onAttach({ url, kind, file: f, mime: f.type, name: f.name });
      toast.success('Attached');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      toast.error(msg);
    } finally {
      setBusy(false);
      if (photoRef.current) photoRef.current.value = '';
      if (docRef.current)   docRef.current.value   = '';
      if (videoRef.current) videoRef.current.value = '';
    }
  };

  const btn: React.CSSProperties = {
    background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text-dim)',
    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
    opacity: hasAttachment ? 0.5 : 1,
  };
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, 'image'); }} disabled={busy || hasAttachment} style={{ display: 'none' }} />
      <input ref={videoRef} type="file" accept="video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, 'video'); }} disabled={busy || hasAttachment} style={{ display: 'none' }} />
      <input ref={docRef}   type="file" accept=".pdf,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, 'document'); }} disabled={busy || hasAttachment} style={{ display: 'none' }} />
      <button type="button" onClick={() => photoRef.current?.click()} disabled={busy || hasAttachment} style={btn} title={hasAttachment ? 'Remove the current attachment first' : 'Attach an image'}>📷 Image</button>
      <button type="button" onClick={() => videoRef.current?.click()} disabled={busy || hasAttachment} style={btn} title={hasAttachment ? 'Remove the current attachment first' : 'Attach a video'}>🎬 Video</button>
      <button type="button" onClick={() => docRef.current?.click()}   disabled={busy || hasAttachment} style={btn} title={hasAttachment ? 'Remove the current attachment first' : 'Attach a PDF / DOC / XLS'}>📎 File</button>
      {busy && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Uploading…</span>}
    </div>
  );
}
