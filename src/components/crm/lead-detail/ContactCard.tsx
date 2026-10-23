'use client';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Check, Copy } from 'lucide-react';
import CallButton from '../shared/CallButton';
import RecordedCallButton from '../shared/RecordedCallButton';
import WhatsAppButton from '../shared/WhatsAppButton';
import CopyButton from '../shared/CopyButton';
import InlineEditText from '../InlineEditText';
import type { FieldHelpers } from '../../../lib/crmFieldOverrides';
import { T, eyebrowStyle } from '../../ui';
import SectionCard from './SectionCard';
import type { LifecycleLead } from './types';

/** Small copy-to-clipboard button. Shows a transient check on success and surfaces a toast. */
function FieldCopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label.toLowerCase()}`}
      title={`Copy ${label.toLowerCase()}`}
      className="km-iconbtn"
      style={{ background: 'transparent', border: 'none', padding: 3, borderRadius: 5, cursor: 'pointer', color: copied ? 'var(--ok)' : T.mute, lineHeight: 0, flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}
    >
      {copied ? <Check size={14} strokeWidth={2.2} /> : <Copy size={14} strokeWidth={2} />}
    </button>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ ...eyebrowStyle, fontSize: 10 }}>{label}</div>
      {children}
    </div>
  );
}

/**
 * The two ways to reach the lead — email and phone — with edit-in-place, copy and the call / WhatsApp
 * actions beside the number. Every built-in field is gated through the admin's field overrides.
 */
export default function ContactCard({
  lead, fields, hideEmail, onPatch, waPrefill, displayName, campaigns,
}: {
  lead: LifecycleLead;
  fields: FieldHelpers;
  /** Tata Tiscon tenants don't capture email. */
  hideEmail: boolean;
  onPatch: (patch: Record<string, unknown>, toastText: string) => Promise<void>;
  waPrefill: string;
  displayName: string;
  campaigns: string[];
}) {
  const showEmail = !hideEmail && !fields.isHidden('email');
  const showPhone = !fields.isHidden('phone');
  if (!showEmail && !showPhone && campaigns.length === 0) return null;

  return (
    <SectionCard title="Contact">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '18px 24px' }}>
        {showEmail && (
          <Fact label={fields.labelFor('email', 'Email')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flexWrap: 'wrap' }}>
              <InlineEditText
                value={lead.email || ''}
                type="email"
                ariaLabel={`Edit ${fields.labelFor('email', 'Email')}`}
                placeholder="Add email"
                onSave={(next) => onPatch({ email: next || null }, 'Email updated')}
                displayStyle={{ color: T.text, fontSize: 14, overflowWrap: 'anywhere' }}
              />
              {lead.email && <FieldCopyButton text={lead.email} label="Email" />}
            </div>
          </Fact>
        )}
        {showPhone && (
          <Fact label={fields.labelFor('phone', 'Phone')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <InlineEditText
                value={lead.phone || ''}
                type="tel"
                ariaLabel="Edit phone"
                placeholder="Add phone"
                onSave={(next) => onPatch({ phone: next || null }, 'Phone updated')}
                displayStyle={{ color: T.text, fontSize: 14, fontFamily: T.mono, overflowWrap: 'anywhere' }}
              />
              <CopyButton value={lead.phone} title="Copy mobile number" size="sm" />
              <CallButton phone={lead.phone} prefillSubject={`Call with ${displayName}`} leadId={lead.id} size="sm" />
              <RecordedCallButton leadId={lead.id} phone={lead.phone} clientId={(lead as { client_id?: string | null }).client_id ?? null} size="sm" />
              <WhatsAppButton phone={lead.phone} prefillText={waPrefill} size="sm" />
            </div>
          </Fact>
        )}
      </div>
      {campaigns.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 18, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
          <span style={{ ...eyebrowStyle, fontSize: 10 }}>Engaged campaigns</span>
          {campaigns.map((c) => (
            <span key={c} style={{ fontSize: 12, fontWeight: 650, background: 'var(--s3)', border: `1px solid ${T.border}`, borderRadius: 999, padding: '3px 10px', color: T.text }}>{c}</span>
          ))}
          {campaigns.length > 1 && (
            <span style={{ fontSize: 11.5, fontWeight: 700, background: T.warnWash, color: T.warn, borderRadius: 999, padding: '3px 10px' }}>Multiple campaigns</span>
          )}
        </div>
      )}
    </SectionCard>
  );
}
