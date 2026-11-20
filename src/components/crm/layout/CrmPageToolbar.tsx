'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Lets a CRM page (Leads, Deals, Contacts, Accounts, Activities, …) render
 * its own record-count badge and action buttons into the SAME line as
 * CrmLayout's scope badge / city scope / date-range row, instead of a
 * second row underneath. CrmLayout owns two slot `<div>`s (one on each side
 * of its row) and provides their DOM nodes here; a page portals its content
 * straight into them with <CrmToolbarLeft>/<CrmToolbarRight>.
 *
 * Both slots render with `display:contents` so the portaled children lay
 * out as if they were direct children of CrmLayout's flex row — the whole
 * point is one shared line, not a nested box.
 */
interface SlotRefs { left: HTMLDivElement | null; right: HTMLDivElement | null }
const CrmToolbarSlots = createContext<SlotRefs>({ left: null, right: null });
export const CrmToolbarSlotsProvider = CrmToolbarSlots.Provider;

/** Portals a page's status/count badge(s) next to CrmScopeBadge, left of the city/date controls. */
export function CrmToolbarLeft({ children }: { children: ReactNode }) {
  const { left } = useContext(CrmToolbarSlots);
  return left ? createPortal(children, left) : null;
}

/** Portals a page's action buttons after the date-range picker, right-aligned. */
export function CrmToolbarRight({ children }: { children: ReactNode }) {
  const { right } = useContext(CrmToolbarSlots);
  return right ? createPortal(children, right) : null;
}
