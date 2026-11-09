'use client';
// A completion certificate as a printable card. MOCK: the number is generated here and nothing outside the company issues it.
// The card keeps black-on-white colours on purpose, because that is how it prints.

import { Button, Modal, Note } from '../../ui';
import { fmtDate, fullName } from '../../../../lib/hrms/format';
import type { Employee } from '../../../../lib/hrms/types';
import type { Certificate, Course } from '../../../../lib/hrms/people/types';
import { Stack } from '../shared';

const PRINT_CSS = `
@page { size: A4 landscape; margin: 12mm; }
@media print {
  body * { visibility: hidden !important; }
  .px-cert, .px-cert * { visibility: visible !important; }
  .px-cert { position: fixed !important; left: 0; top: 0; width: 100% !important; box-shadow: none !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

const ink = '#16181d';
const faint = '#5b616e';

export function CertificateCard({ cert, course, person, company }: { cert: Certificate; course: Course; person: Employee; company: string }) {
  return (
    <div className="px-cert" data-testid="certificate-card" style={{
      background: '#ffffff', color: ink, border: '3px double #9aa1b0', borderRadius: 6, padding: '28px 24px', textAlign: 'center',
      fontFamily: 'Georgia, "Times New Roman", serif', boxShadow: '0 1px 3px rgba(10,14,26,.14)',
    }}>
      <div style={{ fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: faint }}>{company}</div>
      <div style={{ fontSize: 26, fontWeight: 700, margin: '10px 0 14px' }}>Certificate of completion</div>
      <div style={{ fontSize: 14, color: faint }}>This certifies that</div>
      <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0', overflowWrap: 'anywhere' }}>{fullName(person)}</div>
      <div style={{ fontSize: 14, color: faint }}>has completed</div>
      <div style={{ fontSize: 19, fontWeight: 700, margin: '6px 0 14px', overflowWrap: 'anywhere' }}>{course.title}</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 22, flexWrap: 'wrap', fontSize: 13, color: ink }}>
        <span>Issued {fmtDate(cert.issuedOn)}</span>
        <span>Score {cert.score}%</span>
        <span>{cert.expiresOn ? `Valid until ${fmtDate(cert.expiresOn)}` : 'No expiry'}</span>
      </div>
      <div data-testid="certificate-id" style={{ marginTop: 16, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, letterSpacing: '0.05em' }}>{cert.id}</div>
      <div style={{ marginTop: 10, fontSize: 11, color: faint }}>Mock certificate for the HRMS preview. Not issued by any outside body.</div>
    </div>
  );
}

export default function CertificateModal({ cert, course, person, company, onClose }: { cert: Certificate; course: Course; person: Employee; company: string; onClose: () => void }) {
  return (
    <Modal title="Certificate" onClose={onClose} width={640}
      footer={(
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={() => window.print()}>Print</Button>
        </>
      )}>
      <style>{PRINT_CSS}</style>
      <Stack gap={12}>
        <Note>This is a mock certificate with a generated number. Print it to check how it looks on paper.</Note>
        <CertificateCard cert={cert} course={course} person={person} company={company} />
      </Stack>
    </Modal>
  );
}
