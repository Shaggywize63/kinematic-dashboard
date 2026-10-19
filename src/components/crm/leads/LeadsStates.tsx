'use client';
import { Search, Upload, UserPlus, Zap } from 'lucide-react';
import { Button, T } from '../../ui';
import LeadFilterChips, { type AppliedChip } from './LeadFilterChips';

/** Placeholder rows shown while a page of leads loads — keeps the layout from jumping. */
export function LeadsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading leads" style={{ display: 'flex', flexDirection: 'column' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: i === rows - 1 ? 0 : `1px solid ${T.border}` }}>
          <i className="km-skel" style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0 }} />
          <i className="km-skel" style={{ width: 34, height: 34, borderRadius: 999, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <i className="km-skel" style={{ height: 11, width: `${38 + ((i * 17) % 22)}%` }} />
            <i className="km-skel" style={{ height: 9, width: `${52 + ((i * 11) % 24)}%` }} />
          </div>
          <i className="km-skel" style={{ width: 78, height: 22, borderRadius: 999, flexShrink: 0 }} />
          <i className="km-skel km-hide-sm" style={{ width: 64, height: 22, borderRadius: 6, flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );
}

function IconTile({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ width: 44, height: 44, borderRadius: 12, background: T.infoWash, color: T.info, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </span>
  );
}

/** Filters / search matched nothing. Shows what is applied and the quickest ways back to results. */
export function LeadsNoResults({ chips, search, onClearAll, onWidenDates }: {
  chips: AppliedChip[];
  search?: string;
  onClearAll?: () => void;
  /** Present when the global date range is narrower than "any time". */
  onWidenDates?: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '44px 24px', textAlign: 'center' }}>
      <IconTile><Search size={20} strokeWidth={1.8} /></IconTile>
      <div style={{ fontFamily: T.heading, fontSize: 16, fontWeight: 700, color: T.text }}>No leads match{search ? ` “${search}”` : ' these filters'}</div>
      <div style={{ fontSize: 13, color: T.dim, maxWidth: 420 }}>
        Try removing a filter{onWidenDates ? ', widening the date range' : ''}, or ask KINI above to describe the leads you want.
      </div>
      {chips.length > 0 && <div style={{ marginTop: 4, display: 'flex', justifyContent: 'center' }}><LeadFilterChips chips={chips} onClearAll={onClearAll ?? (() => {})} /></div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
        {onClearAll && <Button variant="primary" onClick={onClearAll}>Clear all filters</Button>}
        {onWidenDates && <Button onClick={onWidenDates}>Any date</Button>}
      </div>
    </div>
  );
}

function Option({ icon, title, hint, href, primary }: { icon: React.ReactNode; title: string; hint: string; href: string; primary?: boolean }) {
  return (
    <Button
      href={href}
      variant={primary ? 'primary' : 'secondary'}
      style={{ height: 'auto', justifyContent: 'flex-start', padding: '12px 14px', gap: 12, textAlign: 'left', whiteSpace: 'normal', width: '100%', maxWidth: 420, borderColor: primary ? 'transparent' : T.border }}
    >
      <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.25 }}>
        <span style={{ fontSize: 14 }}>{title}</span>
        <span style={{ fontSize: 12.5, fontWeight: 400, opacity: 0.8 }}>{hint}</span>
      </span>
    </Button>
  );
}

/** A brand-new workspace — no leads at all, nothing filtered. Points at the three ways to get some. */
export function LeadsFirstRun() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '44px 24px' }}>
      <div style={{ fontFamily: T.heading, fontSize: 18, fontWeight: 700, color: T.text }}>Your pipeline starts here</div>
      <div style={{ fontSize: 13, color: T.dim, textAlign: 'center', maxWidth: 420, marginBottom: 6 }}>Add your first lead, or bring them in automatically.</div>
      <Option primary icon={<UserPlus size={18} strokeWidth={1.8} />} title="Add a lead" hint="Capture one in under a minute" href="/dashboard/crm/leads/new" />
      <Option icon={<Upload size={18} strokeWidth={1.8} />} title="Import a CSV" hint="Bring existing leads from a spreadsheet" href="/dashboard/crm/leads/import" />
      <Option icon={<Zap size={18} strokeWidth={1.8} />} title="Capture automatically" hint="Web forms, ads and other integrations" href="/dashboard/crm/settings/integrations" />
    </div>
  );
}
