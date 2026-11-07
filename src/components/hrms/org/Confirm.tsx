'use client';
// Confirmation and "you cannot do that" dialogs, shared by the Organisation and Time & leave screens.

import type { ReactNode } from 'react';
import { Button, Modal } from '../ui';

/** Destructive actions ask first. The confirm button is a real button with the action's own name on it. */
export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel }: {
  title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel} width={460}
      footer={<>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="danger" style={{ minHeight: 44 }} onClick={onConfirm}>{confirmLabel}</Button>
      </>}>
      <div style={{ fontSize: 14, lineHeight: 1.55 }}>{children}</div>
    </Modal>
  );
}

/** Shown instead of the confirm when something is still using the thing being removed. */
export function BlockedDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose} width={460}
      footer={<Button variant="primary" style={{ minHeight: 44 }} onClick={onClose}>Got it</Button>}>
      <div style={{ fontSize: 14, lineHeight: 1.55 }}>{children}</div>
    </Modal>
  );
}
