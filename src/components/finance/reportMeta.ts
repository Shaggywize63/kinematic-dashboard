// Catalogue of the tabular finance reports (names mirror the backend REPORTS map).
import type { ReportName } from '../../lib/financeApi';

export interface ReportMeta { name: ReportName; title: string; description: string; group: 'Sales' | 'Receivables' | 'Payments' | 'Taxes'; asOfToday?: boolean }

export const REPORT_META: ReportMeta[] = [
  { name: 'sales-by-customer', title: 'Sales by Customer', group: 'Sales', description: 'Invoiced sales, tax and amount collected for each customer.' },
  { name: 'sales-by-item', title: 'Sales by Item', group: 'Sales', description: 'Quantity sold and sales value for every item or service.' },
  { name: 'invoice-details', title: 'Invoice Details', group: 'Sales', description: 'Every invoice in the period with taxable value, tax, paid and balance.' },
  { name: 'receivables-ageing', title: 'Receivables Ageing', group: 'Receivables', asOfToday: true, description: 'Unpaid invoice balances by customer, bucketed by days overdue, as of today.' },
  { name: 'payments-received', title: 'Payments Received', group: 'Payments', description: 'All payments recorded in the period, with mode and unused amount.' },
  { name: 'gst-summary', title: 'GST Summary', group: 'Taxes', description: 'Taxable value with CGST, SGST and IGST collected, grouped by GST rate.' },
];

export const REPORT_GROUPS: Array<ReportMeta['group']> = ['Sales', 'Receivables', 'Payments', 'Taxes'];

export const reportMeta = (name: string): ReportMeta | undefined => REPORT_META.find((r) => r.name === name);
