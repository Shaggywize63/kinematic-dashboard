// Deterministic starting data for the control store: two saved scenarios, a few radar decisions, the evidence for the filings that
// are already filed in the core sample data, and the monitoring ledger. No Math.random, no Date.now.

import type { ControlState, MonitoringRow } from './types';

const ledger: MonitoringRow[] = [
  {
    id: 'mon_gps', name: 'GPS trail while punched in',
    collects: 'The location of your phone every few minutes while you are punched in. Nothing is collected when you are punched out.',
    coverage: { kind: 'field_staff', label: 'Field staff only' },
    purpose: 'Check that visits happened where they were logged, and work out travel allowance fairly.',
    legalBasis: 'consent', consentPurpose: 'Location during duty hours',
    visibleTo: ['Your reporting manager', 'People team, only when a travel or attendance question is raised'],
    retentionDays: 90, retentionRuleId: 'rt_3', status: 'on', reviewedOn: '2026-09-15', reviewer: 'Tanvi Kapoor',
  },
  {
    id: 'mon_visit_photo', name: 'Visit photo with location',
    collects: 'A photo you take at an outlet visit, with the place and time it was taken.',
    coverage: { kind: 'field_staff', label: 'Field staff only' },
    purpose: 'Proof that a visit took place, used for incentive and expense checks.',
    legalBasis: 'employment',
    visibleTo: ['Your reporting manager', 'People team, only on a dispute'],
    retentionDays: 180, status: 'on', reviewedOn: '2026-09-15', reviewer: 'Tanvi Kapoor',
  },
  {
    id: 'mon_device_id', name: 'Device id on punches',
    collects: 'A code that identifies the phone you punched in from. It does not read anything else on the phone.',
    coverage: { kind: 'all_staff', label: 'Everyone who punches in on the app' },
    purpose: 'Stop one phone being used to punch in for several people.',
    legalBasis: 'employment',
    visibleTo: ['People team'],
    retentionDays: 90, status: 'on', reviewedOn: '2026-08-20', reviewer: 'Tanvi Kapoor',
  },
  {
    id: 'mon_odometer', name: 'Odometer photo',
    collects: 'A photo of your bike or car odometer at the start and end of a field day.',
    coverage: { kind: 'field_staff', label: 'Field staff only' },
    purpose: 'Check the kilometres claimed for travel allowance.',
    legalBasis: 'employment',
    visibleTo: ['Your reporting manager', 'Finance team, to pay travel allowance'],
    retentionDays: 365, status: 'on', reviewedOn: '2026-09-15', reviewer: 'Neha Bansal',
  },
  {
    id: 'mon_kiosk', name: 'Attendance kiosk photo',
    collects: 'A photo taken at the Delhi HQ entrance kiosk when you punch in, matched with the face template you enrolled.',
    coverage: { kind: 'location', locationId: 'loc_del', label: 'Staff at Delhi HQ' },
    purpose: 'Make sure the person at the kiosk is the person punching in.',
    legalBasis: 'consent', consentPurpose: 'Face match for attendance',
    visibleTo: ['People team'],
    retentionDays: 30, retentionRuleId: 'rt_4', status: 'on', reviewedOn: '2026-08-20', reviewer: 'Tanvi Kapoor',
  },
  {
    id: 'mon_email_scan', name: 'Email and chat content scanning',
    collects: 'The text of your work email and chat messages.',
    coverage: { kind: 'all_staff', label: 'Everyone with a work mailbox' },
    purpose: 'Looked at as a way to prevent data leaks. Not in use.',
    legalBasis: 'employment', visibleTo: [], retentionDays: 0, status: 'off', reviewedOn: '2026-10-01', reviewer: 'Tanvi Kapoor',
  },
  {
    id: 'mon_screen', name: 'Screen capture',
    collects: 'Pictures of your computer screen at set intervals.',
    coverage: { kind: 'all_staff', label: 'Everyone with a company computer' },
    purpose: 'Looked at as a way to check how time is spent. Not in use.',
    legalBasis: 'employment', visibleTo: [], retentionDays: 0, status: 'off', reviewedOn: '2026-10-01', reviewer: 'Tanvi Kapoor',
  },
  {
    id: 'mon_keystroke', name: 'Keystroke logging',
    collects: 'Every key you press on a company computer.',
    coverage: { kind: 'all_staff', label: 'Everyone with a company computer' },
    purpose: 'None that justifies it.',
    legalBasis: 'employment', visibleTo: [], retentionDays: 0, status: 'blocked', reviewedOn: '2026-10-01', reviewer: 'Ritu Malhotra',
    blockedReason: 'Disproportionate for the purpose. It records everything a person types, including private matters, and cannot be limited to what the job needs. Not offered.',
  },
  {
    id: 'mon_vehicle', name: 'Vehicle tracker on company trucks',
    collects: 'The position of a company truck while it is on a trip. It follows the vehicle, not a person outside work.',
    coverage: { kind: 'location', locationId: 'loc_mum', label: 'Staff at Bhiwandi Warehouse (to be narrowed to drivers before it starts)' },
    purpose: 'Plan routes and respond to delays and breakdowns.',
    legalBasis: 'employment', visibleTo: ['Operations manager'], retentionDays: 60, status: 'considering', reviewedOn: '2026-10-12', reviewer: 'Ritu Malhotra',
  },
];

export function seedControl(): ControlState {
  return structuredClone<ControlState>({
    version: 1,
    scenarios: [
      { id: 'scn_seed_1', name: 'Warehouse increment from December', input: { type: 'increment', percent: 12, scope: 'department', scopeValue: 'dep_wh', fromMonth: '2026-12' }, savedAt: '2026-11-04T10:00:00.000Z', savedBy: 'Neha Bansal' },
      { id: 'scn_seed_2', name: 'Field sales basic to 50%', input: { type: 'structure', structureId: 'str_field', basicPct: 50, pfOnActual: false, fromMonth: '2026-12' }, savedAt: '2026-11-05T15:30:00.000Z', savedBy: 'Neha Bansal' },
      { id: 'scn_seed_3', name: 'Three field executives in Delhi', input: { type: 'hiring', count: 3, designationId: 'des_fe', annualCtc: 360000, locationId: 'loc_del', structureId: 'str_field', fromMonth: '2026-12' }, savedAt: '2026-11-06T09:15:00.000Z', savedBy: 'Tanvi Kapoor' },
    ],
    radar: {
      'pf-ceiling-2026-09-17': { status: 'applied', note: 'Ceiling updated in the statutory settings on 18 Sep. The October run used it.', by: 'Neha Bansal', at: '2026-09-18T10:20:00.000Z' },
      'hra-metro-2026-04-01': { status: 'acknowledged', note: 'Bengaluru is already marked as metro on the location. Check the other locations.', by: 'Tanvi Kapoor', at: '2026-04-06T11:00:00.000Z' },
      'lwf-tamil-nadu': { status: 'not_applicable', note: 'No staff in Tamil Nadu.', by: 'Tanvi Kapoor', at: '2026-10-02T09:40:00.000Z' },
    },
    autopilot: {
      manual: {},
      evidence: {
        cmp_tds_sep: { by: 'Neha Bansal', at: '2026-10-06T11:20:00.000Z', attachments: ['Challan or payment receipt', 'Working file or sheet from Autopilot'], note: 'Paid from the main account.' },
        cmp_pf_sep: { by: 'Neha Bansal', at: '2026-10-14T16:05:00.000Z', attachments: ['ECR text file', 'Challan or payment receipt', 'Acknowledgement from the portal'], note: 'Two members were left out of the ECR until their UAN was fixed.' },
        cmp_24q: { by: 'Neha Bansal', at: '2026-10-29T12:45:00.000Z', attachments: ['Return file', 'Acknowledgement from the portal'] },
      },
    },
    monitoring: {
      rows: ledger,
      log: [
        { id: 'ml_3', at: '2026-10-12T14:10:00.000Z', by: 'Ritu Malhotra', rowId: 'mon_vehicle', rowName: 'Vehicle tracker on company trucks', action: 'Added as considering', detail: 'Raised by Operations for the Bhiwandi fleet.' },
        { id: 'ml_2', at: '2026-10-01T09:30:00.000Z', by: 'Tanvi Kapoor', rowId: 'mon_email_scan', rowName: 'Email and chat content scanning', action: 'Reviewed and kept off', detail: 'No incident that would justify it.' },
        { id: 'ml_1', at: '2026-09-15T11:00:00.000Z', by: 'Tanvi Kapoor', rowId: 'mon_gps', rowName: 'GPS trail while punched in', action: 'Reviewed', detail: 'Purpose and retention confirmed.' },
      ],
      consentRequests: [],
    },
  });
}
