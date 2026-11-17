/**
 * Spark & Ray lead/account STRUCTURE — one definition of "what a complete record looks like",
 * shared by the identity strip (lead detail + lead form) and the "what's missing" panels.
 *
 * The identity of a lead is the chain the proposal mail set out:
 *
 *   ACCOUNT › PLANT › DEPARTMENT › CONTACT › REQUIREMENT › SERIAL › OWNER
 *
 * Every link is a real persisted field (see the lead-structure contract), so a lead that fills
 * them all is unambiguous on sight — no two leads look alike. A lead that does not is not
 * "wrong", it is *incomplete*, and the gap list says exactly which link is open and why it
 * matters. Keep this module pure: it is the single source both the display and the nag read,
 * and it is unit-tested directly.
 */

export type SlotKey = 'account' | 'plant' | 'department' | 'contact' | 'requirement' | 'serial' | 'owner';

/** One link in the identity chain. `value` is empty exactly when the link is missing. */
export interface IdentitySlot {
  key: SlotKey;
  /** Short uppercase caption shown above the value in the strip. */
  label: string;
  /** The filled-in value, or '' when nothing is recorded. */
  value: string;
  /** What to do about it, shown when the slot is empty. */
  fix: string;
  /** Why the chain needs it — the cost of leaving it blank. */
  why: string;
  /** Slots that are filled by the system rather than the rep. */
  system?: boolean;
}

/** Left-to-right order of the identity chain. */
export const SLOT_ORDER: readonly SlotKey[] = ['account', 'plant', 'department', 'contact', 'requirement', 'serial', 'owner'] as const;

/** What the strip needs to know about a lead. Every field is optional — that is the point. */
export interface LeadIdentitySource {
  account?: string | null;
  plant?: string | null;
  department?: string | null;
  contact?: string | null;
  requirement?: string | null;
  serial?: string | null;
  owner?: string | null;
}

const clean = (s?: string | null): string => (typeof s === 'string' ? s.trim() : '');

/**
 * The identity chain for one lead, always all seven slots in order, so the strip renders a
 * stable skeleton and an empty slot reads as a gap to fill rather than as nothing at all.
 */
export function leadIdentitySlots(src: LeadIdentitySource): IdentitySlot[] {
  return [
    {
      key: 'account', label: 'Account', value: clean(src.account),
      fix: 'Link the company this requirement belongs to',
      why: 'Without the company the lead cannot roll up to an account or its parent group.',
    },
    {
      key: 'plant', label: 'Plant', value: clean(src.plant),
      fix: 'Pick which of the company’s plants this is for',
      why: 'A company has many plants — without one, two leads at different sites look identical.',
    },
    {
      key: 'department', label: 'Department', value: clean(src.department),
      fix: 'Add the department (Procurement, Maintenance, Utility…)',
      why: 'The same plant runs several departments buying different things.',
    },
    {
      key: 'contact', label: 'Contact', value: clean(src.contact),
      fix: 'Link the nodal person at this plant',
      why: 'No contact means no one to follow up with, and the lead cannot be handed over.',
    },
    {
      key: 'requirement', label: 'Requirement', value: clean(src.requirement),
      fix: 'State what they actually need',
      why: 'The requirement is what makes the lead’s name readable and the pipeline reportable.',
    },
    {
      key: 'serial', label: 'Serial', value: clean(src.serial), system: true,
      fix: 'Allocated automatically when the lead is saved',
      why: 'The serial is the stable reference quoted on calls and documents.',
    },
    {
      key: 'owner', label: 'Owner', value: clean(src.owner), system: true,
      fix: 'Assign the lead to a rep',
      why: 'An unowned lead is nobody’s to chase.',
    },
  ];
}

/** The slots with nothing in them, in chain order. */
export function missingSlots(slots: readonly IdentitySlot[]): IdentitySlot[] {
  return slots.filter((s) => !s.value);
}

/** Filled / total and a rounded percentage, for the progress read-out. */
export function structureCompleteness(slots: readonly IdentitySlot[]): { filled: number; total: number; pct: number } {
  const total = slots.length;
  const filled = slots.filter((s) => !!s.value).length;
  return { filled, total, pct: total === 0 ? 0 : Math.round((filled / total) * 100) };
}

/**
 * One-line summary for a lead row / card: "Complete" or "Missing plant, department".
 * Lower-cased labels read better mid-sentence than the strip's captions.
 */
export function structureSummary(slots: readonly IdentitySlot[]): string {
  const gaps = missingSlots(slots);
  if (gaps.length === 0) return 'Complete';
  return `Missing ${gaps.map((g) => g.label.toLowerCase()).join(', ')}`;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/** A structural problem on an account, worst first. */
export interface AccountGap {
  key: string;
  /** Short headline, e.g. "No plants recorded". */
  label: string;
  /** The specific, counted detail — never a generic nag. */
  detail: string;
  /** 'break' = the tree is actually broken here; 'gap' = incomplete but working. */
  severity: 'break' | 'gap';
}

export interface AccountStructureSource {
  /** Is this account a parent/group row rather than an operating company? */
  isGroup: boolean;
  /** Does it hang off a parent group? */
  hasParent: boolean;
  /** Child accounts (plants/companies) under this one. */
  childCount: number;
  /** Leads on the child accounts. */
  childLeadCount: number;
  /** Leads directly on this account. */
  leadCount: number;
  /** Sites/plants recorded against this account. */
  plantCount: number;
  /** Contacts linked to this account. */
  contactCount: number;
  /** Of this account's own leads, how many are missing each link. */
  leadsMissingPlant: number;
  leadsMissingDepartment: number;
  leadsMissingRequirement: number;
  leadsMissingContact: number;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/**
 * What stops this account's slice of the tree from being complete, worst first.
 *
 * The 'break' cases are the ones that make the tree visibly wrong — a group whose children
 * carry no leads renders as an empty branch, and an operating company with leads but no
 * recorded plants cannot show a plant layer at all.
 */
export function accountStructureGaps(src: AccountStructureSource): AccountGap[] {
  const gaps: AccountGap[] = [];

  if (src.isGroup) {
    if (src.childCount === 0) {
      gaps.push({
        key: 'group-no-children', severity: 'break',
        label: 'Group has no companies under it',
        detail: 'Nothing points at this group yet, so it renders as an empty branch. Set it as the parent on the operating companies that belong to it.',
      });
    } else if (src.childLeadCount === 0 && src.leadCount === 0) {
      gaps.push({
        key: 'group-no-leads', severity: 'break',
        label: 'No leads anywhere under this group',
        detail: `${plural(src.childCount, 'company', 'companies')} sit under this group but not one carries a lead — the group reports as blank. A lead for this group is probably on an account that was never linked to it.`,
      });
    }
  } else if (!src.hasParent) {
    gaps.push({
      key: 'no-parent', severity: 'gap',
      label: 'Not linked to a parent company',
      detail: 'This account stands on its own. If it is one plant of a larger group, set the group as its parent so the leads roll up.',
    });
  }

  if (!src.isGroup && src.plantCount === 0 && src.leadCount > 0) {
    gaps.push({
      key: 'no-plants', severity: 'break',
      label: 'No plants recorded',
      detail: `${plural(src.leadCount, 'lead')} sit directly on the company with no plant layer beneath it, so the tree cannot separate one site from another.`,
    });
  }

  if (src.contactCount === 0 && (src.leadCount > 0 || src.childLeadCount > 0)) {
    gaps.push({
      key: 'no-contacts', severity: 'gap',
      label: 'No people recorded',
      detail: 'There is no one on file at this account, so its leads have nobody to follow up with.',
    });
  }

  const perLead: Array<[number, string, string]> = [
    [src.leadsMissingPlant, 'without a plant', 'they cannot be told apart by site'],
    [src.leadsMissingDepartment, 'without a department', 'the buying team is unknown'],
    [src.leadsMissingRequirement, 'without a requirement', 'their names read as bare company names'],
    [src.leadsMissingContact, 'without a contact', 'nobody is named to chase'],
  ];
  for (const [n, phrase, consequence] of perLead) {
    if (n > 0) {
      gaps.push({
        key: `leads-${phrase.replace(/\s+/g, '-')}`, severity: 'gap',
        label: `${plural(n, 'lead')} ${phrase}`,
        detail: `Open each and fill it in — ${consequence}.`,
      });
    }
  }

  return gaps;
}
