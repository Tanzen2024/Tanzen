export type DocumentEntityType = 'member' | 'loan' | 'tontine' | 'cycle' | 'assembly';
export type DocumentCategory = 'idDocument' | 'contract' | 'statement' | 'minutes' | 'report' | 'other';

export type DocumentRecord = {
  id: string;
  tenantId: string;
  name: string;
  category: DocumentCategory;
  mimeType: string;
  sizeKb: number;
  uploadedBy: string;
  uploadedAt: string;
  entityType: DocumentEntityType;
  entityId: string;
  entityLabel: string;
  shared: boolean;
};

export const documents: DocumentRecord[] = [
  { id: 'DOC-001', tenantId: 'T-001', name: 'Carte d’identité - Fatou Ndiaye.pdf', category: 'idDocument', mimeType: 'application/pdf', sizeKb: 412, uploadedBy: 'Fatou Ndiaye', uploadedAt: '2021-03-20', entityType: 'member', entityId: 'M-001', entityLabel: 'Fatou Ndiaye', shared: false },
  { id: 'DOC-002', tenantId: 'T-001', name: 'Contrat de prêt L-001.pdf', category: 'contract', mimeType: 'application/pdf', sizeKb: 890, uploadedBy: 'Amadou Mbaye', uploadedAt: '2026-07-22', entityType: 'loan', entityId: 'L-001', entityLabel: 'Prêt L-001 · Fatou Ndiaye', shared: false },
  { id: 'DOC-003', tenantId: 'T-001', name: 'Statuts Coopérative Sutura.pdf', category: 'contract', mimeType: 'application/pdf', sizeKb: 1_240, uploadedBy: 'Amadou Mbaye', uploadedAt: '2024-06-01', entityType: 'tontine', entityId: 'TON-004', entityLabel: 'Coopérative Sutura', shared: true },
  { id: 'DOC-004', tenantId: 'T-001', name: 'Rapport cycle 3 - Coopérative Sutura.pdf', category: 'report', mimeType: 'application/pdf', sizeKb: 560, uploadedBy: 'Cheikh Diop', uploadedAt: '2026-08-10', entityType: 'cycle', entityId: 'CYC-005', entityLabel: 'Coopérative Sutura · Cycle 3', shared: false },
  // entityId : AS-001 (ancienne entité autonome Assembly) fusionnée dans MT-005 par la correction post-implémentation Phase 4C-4 — cf. src/mocks/organization/governance.ts.
  { id: 'DOC-005', tenantId: 'T-001', name: 'PV Assemblée Générale 2026.pdf', category: 'minutes', mimeType: 'application/pdf', sizeKb: 780, uploadedBy: 'Aïssatou Bâ', uploadedAt: '2026-06-16', entityType: 'assembly', entityId: 'MT-005', entityLabel: 'Assemblée Générale Ordinaire 2026', shared: true },
  { id: 'DOC-006', tenantId: 'T-001', name: 'Relevé 2025 - Cheikh Diop.pdf', category: 'statement', mimeType: 'application/pdf', sizeKb: 320, uploadedBy: 'Cheikh Diop', uploadedAt: '2025-12-31', entityType: 'member', entityId: 'M-006', entityLabel: 'Cheikh Diop', shared: false },
  { id: 'DOC-007', tenantId: 'T-002', name: 'Contrat de prêt L-002.pdf', category: 'contract', mimeType: 'application/pdf', sizeKb: 905, uploadedBy: 'Amadou Mbaye', uploadedAt: '2026-07-10', entityType: 'loan', entityId: 'L-002', entityLabel: 'Prêt L-002 · Mamadou Sow', shared: false },
  { id: 'DOC-008', tenantId: 'T-002', name: 'Règlement intérieur Tontine Horizon.pdf', category: 'other', mimeType: 'application/pdf', sizeKb: 445, uploadedBy: 'Mamadou Sow', uploadedAt: '2022-01-20', entityType: 'tontine', entityId: 'TON-001', entityLabel: 'Tontine Horizon', shared: true },
  { id: 'DOC-009', tenantId: 'T-002', name: 'Carte d’identité - Khadija Mbaye.jpg', category: 'idDocument', mimeType: 'image/jpeg', sizeKb: 210, uploadedBy: 'Khadija Mbaye', uploadedAt: '2022-02-10', entityType: 'member', entityId: 'M-007', entityLabel: 'Khadija Mbaye', shared: false },
  { id: 'DOC-010', tenantId: 'T-003', name: 'Contrat d’adhésion - Aïssatou Bâ.pdf', category: 'contract', mimeType: 'application/pdf', sizeKb: 300, uploadedBy: 'Aïssatou Bâ', uploadedAt: '2021-11-12', entityType: 'member', entityId: 'M-003', entityLabel: 'Aïssatou Bâ', shared: false },
  { id: 'DOC-011', tenantId: 'T-003', name: 'Rapport cycle 1 - Mutuelle Teranga.pdf', category: 'report', mimeType: 'application/pdf', sizeKb: 610, uploadedBy: 'Aïssatou Bâ', uploadedAt: '2026-08-01', entityType: 'cycle', entityId: 'CYC-004', entityLabel: 'Mutuelle Teranga · Cycle 1', shared: false },
  { id: 'DOC-012', tenantId: 'T-005', name: 'Contrat de prêt L-003.pdf', category: 'contract', mimeType: 'application/pdf', sizeKb: 875, uploadedBy: 'Amadou Mbaye', uploadedAt: '2026-05-15', entityType: 'loan', entityId: 'L-003', entityLabel: 'Prêt L-003 · Awa Cissé', shared: false },
  { id: 'DOC-013', tenantId: 'T-005', name: 'Photo cotisation cycle 1 - Tontine Avenir.jpg', category: 'other', mimeType: 'image/jpeg', sizeKb: 640, uploadedBy: 'Awa Cissé', uploadedAt: '2026-07-12', entityType: 'cycle', entityId: 'CYC-003', entityLabel: 'Tontine Avenir · Cycle 1', shared: true },
];
