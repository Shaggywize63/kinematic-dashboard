'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmAccounts, crmContacts } from '../../../lib/crmApi';
import type { Account, Contact } from '../../../types/crm';
import { apiErrorText, arr } from '../../../lib/sparkAccounts';
import Modal from '../shared/Modal';
import { AccountPicker } from './DealItemsEditor';
import { Button } from '../../ui';

/** Spark & Ray: pick (or change) the account of an existing contact — PATCH /crm/contacts/:id { account_id }. */
export default function ContactAccountModal({ contact, open, onClose, onSaved }: {
  contact: Pick<Contact, 'id' | 'account_id' | 'account_name' | 'first_name' | 'last_name' | 'full_name'>;
  open: boolean;
  onClose: () => void;
  onSaved: (accountId: string | null) => void;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState(contact.account_id || '');
  const [busy, setBusy] = useState(false);
  const name = contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'this contact';

  useEffect(() => { if (open) setAccountId(contact.account_id || ''); }, [open, contact.account_id]);
  useEffect(() => {
    if (!open) return;
    let off = false;
    crmAccounts.list({ limit: 500 } as never)
      .then((r) => { if (!off) setAccounts(arr<Account>(r.data)); })
      .catch(() => { if (!off) setAccounts([]); });
    return () => { off = true; };
  }, [open]);

  const changing = !!contact.account_id;
  const save = async () => {
    if (!accountId) { toast.error('Pick a company'); return; }
    setBusy(true);
    try {
      await crmContacts.update(contact.id, { account_id: accountId } as never);
      toast.success(changing ? 'Company changed' : 'Added to the company');
      onSaved(accountId);
      onClose();
    } catch (e) {
      toast.error(apiErrorText(e, 'Could not update the company'));
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={460}
      title={changing ? 'Change company' : 'Add to a company'}
      subtitle={changing ? `${name} currently belongs to ${contact.account_name || 'a company'}.` : `Link ${name} to a company.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={busy || !accountId || accountId === (contact.account_id || '')}>{busy ? 'Saving…' : 'Save'}</Button></>}
    >
      <div style={{ minHeight: 120 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Company</div>
        <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} ariaLabel="Company" placeholder="Search companies…" />
      </div>
    </Modal>
  );
}
