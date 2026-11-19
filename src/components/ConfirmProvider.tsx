'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import ConfirmModal from './ConfirmModal';

export interface ConfirmOptions {
  title: string;
  message: string;
  itemName?: string;
  confirmLabel?: string;
  confirmingLabel?: string;
  tone?: 'danger' | 'default';
  irreversible?: boolean;
  icon?: ReactNode;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);

/**
 * App-wide confirmation dialog. Mounted once in the dashboard layout so any
 * page can `const confirm = useConfirm()` and `if (!(await confirm({...})))
 * return;` instead of wiring its own show/hide state — meant for actions that
 * previously used (or should have used) `window.confirm`. The dialog
 * resolves and closes as soon as the user picks an option; it does not stay
 * open with a spinner during the action itself — a call site that needs that
 * (an in-dialog "Deleting…" state) should use `<ConfirmModal>` directly with
 * its own `loading` state instead.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => (
    new Promise<boolean>((resolve) => setPending({ ...opts, resolve }))
  ), []);

  const settle = (result: boolean) => {
    pending?.resolve(result);
    setPending(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <ConfirmModal
        show={!!pending}
        onClose={() => settle(false)}
        onConfirm={() => settle(true)}
        title={pending?.title ?? ''}
        message={pending?.message ?? ''}
        itemName={pending?.itemName}
        confirmLabel={pending?.confirmLabel}
        confirmingLabel={pending?.confirmingLabel}
        tone={pending?.tone}
        irreversible={pending?.irreversible}
        icon={pending?.icon}
      />
    </ConfirmCtx.Provider>
  );
}

/** Returns a `confirm(options) => Promise<boolean>` bound to the one dialog
 *  mounted by `ConfirmProvider` in the dashboard layout. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
