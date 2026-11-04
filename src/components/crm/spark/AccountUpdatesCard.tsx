'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmAccounts, type AccountUpdate } from '../../../lib/crmApi';
import type { Contact } from '../../../types/crm';
import { getStoredUser } from '../../../lib/auth';
import { apiErrorText, personName, rows } from '../../../lib/sparkAccounts';
import { Button, Select, T, Textarea } from '../../ui';
import OwnerAvatar from '../shared/OwnerAvatar';
import { fmtIST, relTime } from '../lead-detail/format';

// Roles that may edit / delete a teammate's update (mirrors the backend allow-list).
const ADMIN_ROLES = new Set(['super_admin', 'admin', 'org_admin']);
const MAX = 4000;

/**
 * Spark & Ray "Recent updates" on an account: a composer (contact person + text) over a newest-first list.
 * The UX mirrors the lead updates composer; the data goes through /crm/accounts/:id/updates. Only mounted
 * for the connected-B2B client, so other tenants never reach these endpoints.
 */
export default function AccountUpdatesCard({ accountId, contacts, onChanged }: {
  accountId: string;
  contacts: Contact[];
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<AccountUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [contactId, setContactId] = useState('');
  const [saving, setSaving] = useState(false);

  const me = getStoredUser();
  const myId = me?.id ?? null;
  const isAdmin = !!me?.role && ADMIN_ROLES.has(me.role);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const r = await crmAccounts.updates(accountId);
      setItems(rows<AccountUpdate>(r?.data));
    } catch (e) {
      toast.error(apiErrorText(e, 'Failed to load updates'));
    } finally {
      setLoading(false);
    }
  }, [accountId]);
  useEffect(() => { void load(); }, [load]);

  const contactOptions = rows<Contact>(contacts).map((c) => ({ id: c.id, name: c.full_name || personName(c, c.email || 'Unnamed') }));

  const submit = async () => {
    const text = draft.trim();
    if (!text || saving) return;
    if (text.length > MAX) { toast.error(`Update is too long (max ${MAX} characters)`); return; }
    setSaving(true);
    try {
      const r = await crmAccounts.addUpdate(accountId, { body: text, ...(contactId ? { contact_id: contactId } : {}) });
      // Prepend rather than reload: newest first, and instant.
      if (r?.data) setItems((prev) => [r.data, ...prev]);
      else await load();
      setDraft('');
      toast.success('Update added');
      onChanged?.();
    } catch (e) {
      toast.error(apiErrorText(e, 'Failed to save update'));
    } finally {
      setSaving(false);
    }
  };

  const edit = async (u: AccountUpdate, body: string, cid: string): Promise<boolean> => {
    const text = body.trim();
    if (!text) return false;
    try {
      const r = await crmAccounts.editUpdate(accountId, u.id, { body: text, contact_id: cid || null });
      setItems((prev) => prev.map((it) => (it.id === u.id ? { ...it, ...(r?.data || {}) } : it)));
      toast.success('Update edited');
      onChanged?.();
      return true;
    } catch (e) {
      toast.error(apiErrorText(e, 'Failed to edit update'));
      return false;
    }
  };

  const remove = async (u: AccountUpdate) => {
    try {
      await crmAccounts.deleteUpdate(accountId, u.id);
      setItems((prev) => prev.filter((it) => it.id !== u.id));
      toast.success('Update deleted');
      onChanged?.();
    } catch (e) {
      toast.error(apiErrorText(e, 'Failed to delete update'));
    }
  };

  return (
    <div data-testid="account-updates" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: T.dim, textTransform: 'uppercase', fontWeight: 700 }}>Contact person</span>
          <Select aria-label="Contact person" value={contactId} onChange={(e) => setContactId(e.target.value)} disabled={saving}>
            <option value="">No specific contact</option>
            {contactOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        <Textarea
          aria-label="Update"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void submit(); } }}
          placeholder="What was discussed, what is next? (Ctrl/Cmd+Enter to post)"
          rows={3}
          maxLength={MAX}
          disabled={saving}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: T.mute }}>{draft.length}/{MAX} · stamps your name and time</span>
          <Button variant="primary" size="sm" onClick={submit} disabled={saving || !draft.trim()}>{saving ? 'Posting…' : 'Post'}</Button>
        </div>
      </div>

      {loading && <div style={{ fontSize: 12, color: T.dim, padding: 6 }}>Loading updates…</div>}
      {!loading && items.length === 0 && (
        <div style={{ fontSize: 12, color: T.dim, padding: 6 }}>No updates yet. Post the first one above.</div>
      )}
      {!loading && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((u) => (
            <UpdateRow
              key={u.id}
              u={u}
              contacts={contactOptions}
              canEdit={!!myId && u.created_by === myId}
              canDelete={(!!myId && u.created_by === myId) || isAdmin}
              onEdit={(body, cid) => edit(u, body, cid)}
              onDelete={() => remove(u)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UpdateRow({ u, contacts, canEdit, canDelete, onEdit, onDelete }: {
  u: AccountUpdate;
  contacts: Array<{ id: string; name: string }>;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (body: string, contactId: string) => Promise<boolean>;
  onDelete: () => void | Promise<void>;
}) {
  const who = u.author_name || 'Unknown';
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [text, setText] = useState(u.body);
  const [cid, setCid] = useState(u.contact_id || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const ok = await onEdit(text, cid);
    setBusy(false);
    if (ok) setEditing(false);
  };
  const link: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: T.dim, fontFamily: 'inherit' };

  return (
    <div data-testid="account-update-row" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', background: 'var(--s3)', border: `1px solid ${T.border}`, borderRadius: 8 }}>
      <OwnerAvatar name={who} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{who}</span>
          {u.contact_name && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 999, background: T.infoWash, color: T.info }}>with {u.contact_name}</span>
          )}
          <span style={{ fontSize: 10, color: T.dim }} title={fmtIST(u.created_at)}>{relTime(u.created_at)}</span>
          {!editing && (canEdit || canDelete) && (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              {canEdit && <button style={link} onClick={() => { setText(u.body); setCid(u.contact_id || ''); setEditing(true); }}>Edit</button>}
              {canDelete && !confirmDel && <button style={{ ...link, color: T.red }} onClick={() => setConfirmDel(true)}>Delete</button>}
              {canDelete && confirmDel && (
                <>
                  <span style={{ fontSize: 11, color: T.dim }}>Delete?</span>
                  <button style={{ ...link, color: T.red }} onClick={() => { setConfirmDel(false); void onDelete(); }}>Yes</button>
                  <button style={link} onClick={() => setConfirmDel(false)}>No</button>
                </>
              )}
            </span>
          )}
        </div>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Select aria-label="Contact person" value={cid} onChange={(e) => setCid(e.target.value)} disabled={busy}>
              <option value="">No specific contact</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={MAX} disabled={busy} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={save} disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: T.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>{u.body}</div>
        )}
      </div>
    </div>
  );
}
