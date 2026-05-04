'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { crmLeads } from '../../lib/crmApi';

interface Props {
  leadId: string;
  defaultDealName?: string;
  open: boolean;
  onClose: () => void;
  onConverted?: () => void;
}

export default function LeadConvertModal({ leadId, defaultDealName, open, onClose, onConverted }: Props) {
  const [createAccount, setCreateAccount] = useState(true);
  const [createDeal, setCreateDeal] = useState(true);
  const [dealName, setDealName] = useState(defaultDealName || '');
  const [dealAmount, setDealAmount] = useState<string>('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await crmLeads.convert(leadId, {
        create_account: createAccount,
        create_deal: createDeal,
        deal_name: dealName || undefined,
        deal_amount: dealAmount ? Number(dealAmount) : undefined,
      });
      toast.success('Lead converted successfully');
      onConverted?.();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Conversion failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: 460, maxWidth: '95vw' }}>
        <h3 style={{ margin: '0 0 14px', color: 'var(--text)' }}>Convert Lead</h3>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, color: 'var(--text)', fontSize: 13 }}>
          <input type="checkbox" checked={createAccount} onChange={(e) => setCreateAccount(e.target.checked)} /> Create Account
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, color: 'var(--text)', fontSize: 13 }}>
          <input type="checkbox" checked={createDeal} onChange={(e) => setCreateDeal(e.target.checked)} /> Create Deal
        </label>
        {createDeal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <input value={dealName} onChange={(e) => setDealName(e.target.value)} placeholder="Deal name" style={inputCss} />
            <input value={dealAmount} onChange={(e) => setDealAmount(e.target.value)} placeholder="Deal amount" type="number" style={inputCss} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={submit} disabled={busy} style={btnPrimary}>{busy ? 'Converting...' : 'Convert'}</button>
        </div>
      </div>
    </div>
  );
}

const inputCss: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 };
