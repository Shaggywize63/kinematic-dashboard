'use client';
// A letter on paper: letterhead, date and body. Merge fields that have no data (or do not exist) are
// highlighted so the author sees them before issuing. The paper keeps fixed black-on-white colours on
// purpose, because that is how the letter prints.

import { Button, downloadText } from '../ui';
import { fmtDate } from '../../../lib/hrms/format';
import { letterText, printLetter, type LetterDoc, type Segment } from './letters';
import type { Address, ISODate } from '../../../lib/hrms/types';

export const formatAddress = (a?: Address): string => [a?.line1, a?.line2, a?.city, a?.state, a?.pincode].filter(Boolean).join(', ');

const MARK: Record<Exclude<Segment['kind'], 'text' | 'value'>, { background: string; color: string; title: string }> = {
  missing: { background: '#fde68a', color: '#78350f', title: 'No data for this field' },
  unknown: { background: '#fecaca', color: '#7f1d1d', title: 'This merge field does not exist' },
  placeholder: { background: '#bfdbfe', color: '#1e3a8a', title: 'Replace this text before issuing' },
};

export function LetterPaper({ company, address, date, segments }: { company: string; address?: string; date: ISODate; segments: Segment[] }) {
  return (
    <div data-testid="letter-paper" style={{
      background: '#ffffff', color: '#1a1a1a', border: '1px solid #d8dce3', borderRadius: 6, padding: '26px 30px', boxShadow: '0 1px 3px rgba(10,14,26,.14)',
      fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 14, lineHeight: 1.6, overflowWrap: 'anywhere',
    }}>
      <div style={{ borderBottom: '2px solid #1a1a1a', paddingBottom: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{company || 'Company name'}</div>
        {address && <div style={{ fontSize: 12, color: '#555555' }}>{address}</div>}
      </div>
      <div style={{ textAlign: 'right', fontSize: 13, marginBottom: 14 }}>Date: {fmtDate(date)}</div>
      <div style={{ whiteSpace: 'pre-wrap' }}>
        {segments.map((s, i) => (s.kind === 'text' || s.kind === 'value'
          ? <span key={i}>{s.text}</span>
          : <mark key={i} title={MARK[s.kind].title} style={{ background: MARK[s.kind].background, color: MARK[s.kind].color, padding: '0 3px', borderRadius: 3 }}>{s.text}</mark>))}
      </div>
    </div>
  );
}

/** Print and download for an issued letter. */
export function LetterActions({ doc, fileName }: { doc: LetterDoc; fileName: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button variant="primary" style={{ height: 44 }} onClick={() => printLetter(doc)}>Print</Button>
      <Button style={{ height: 44 }} onClick={() => downloadText(fileName, letterText(doc))}>Download as text</Button>
    </div>
  );
}
