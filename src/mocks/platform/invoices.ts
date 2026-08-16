export type InvoiceStatus = 'paid' | 'pending' | 'overdue' | 'cancelled';

export type Invoice = {
  id: string;
  number: string;
  tenantId: string;
  tenantName: string;
  subscriptionId: string;
  amount: number;
  currency: 'XOF';
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  paidDate: string | null;
};

export const invoices: Invoice[] = [
  { id: 'INV-001', number: 'FAC-2026-0071', tenantId: 'T-001', tenantName: 'Coopérative Sutura', subscriptionId: 'SUB-001', amount: 35000, currency: 'XOF', status: 'paid', issueDate: '2026-07-15', dueDate: '2026-07-29', paidDate: '2026-07-15' },
  { id: 'INV-002', number: 'FAC-2026-0072', tenantId: 'T-002', tenantName: 'Tontine Horizon', subscriptionId: 'SUB-002', amount: 15000, currency: 'XOF', status: 'paid', issueDate: '2026-07-01', dueDate: '2026-07-15', paidDate: '2026-07-01' },
  { id: 'INV-003', number: 'FAC-2026-0073', tenantId: 'T-003', tenantName: 'Mutuelle Teranga', subscriptionId: 'SUB-003', amount: 65000, currency: 'XOF', status: 'paid', issueDate: '2026-07-10', dueDate: '2026-07-24', paidDate: '2026-07-10' },
  { id: 'INV-004', number: 'FAC-2026-0074', tenantId: 'T-005', tenantName: 'Tontine Avenir', subscriptionId: 'SUB-005', amount: 15000, currency: 'XOF', status: 'overdue', issueDate: '2026-07-10', dueDate: '2026-07-24', paidDate: null },
  { id: 'INV-005', number: 'FAC-2026-0075', tenantId: 'T-004', tenantName: 'Association Jappo', subscriptionId: 'SUB-004', amount: 0, currency: 'XOF', status: 'pending', issueDate: '2026-08-01', dueDate: '2026-08-15', paidDate: null },
];
