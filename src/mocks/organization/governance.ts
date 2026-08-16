export type AssemblyType = 'generalAssembly' | 'extraordinaryAssembly' | 'boardAssembly';
export type AssemblyStatus = 'ongoing' | 'expired' | 'upcoming';
export type VoteResult = 'adopted' | 'rejected' | 'pending';
export type MandateStatus = 'ongoing' | 'expired' | 'upcoming';

export type Assembly = { id: string; tenantId: string; name: string; type: AssemblyType; date: string; location: string; participants: number; status: AssemblyStatus; agenda: string };
export type Meeting = { id: string; tenantId: string; title: string; date: string; location: string; participants: number; agenda: string; minutes: string | null };
export type Vote = { id: string; tenantId: string; subject: string; date: string; yes: number; no: number; abstain: number; result: VoteResult };
export type BoardMember = { id: string; tenantId: string; memberId: string; memberName: string; position: string; mandateStart: string; mandateEnd: string; status: MandateStatus };

export const assemblies: Assembly[] = [
  { id: 'AS-001', tenantId: 'T-001', name: 'AG 2026', type: 'generalAssembly', date: '2026-06-15', location: 'Siège - Dakar', participants: 124, status: 'expired', agenda: 'Bilan annuel, élection du bureau, vote du budget 2026' },
  { id: 'AS-002', tenantId: 'T-001', name: 'AGE Budget Q3', type: 'extraordinaryAssembly', date: '2026-09-20', location: 'Siège - Dakar', participants: 86, status: 'upcoming', agenda: 'Révision du budget Q3, validation des nouveaux prêts' },
  { id: 'AS-003', tenantId: 'T-001', name: 'Conseil Q3', type: 'boardAssembly', date: '2026-08-25', location: 'En ligne', participants: 9, status: 'upcoming', agenda: 'Suivi des tontines, point sur les remboursements' },
  { id: 'AS-004', tenantId: 'T-001', name: 'AG 2025', type: 'generalAssembly', date: '2025-06-20', location: 'Siège - Dakar', participants: 110, status: 'expired', agenda: 'Bilan 2025, renouvellement du bureau' },
];

export const meetings: Meeting[] = [
  { id: 'MT-001', tenantId: 'T-001', title: 'Réunion bureau - Août', date: '2026-08-25', location: 'Salle de conférence - Dakar', participants: 9, agenda: 'Préparation AG Q3, validation tirages', minutes: 'PV-2026-08' },
  { id: 'MT-002', tenantId: 'T-001', title: 'Réunion trésorerie', date: '2026-08-18', location: 'En ligne', participants: 4, agenda: 'Suivi trésorerie, étude des demandes de prêt', minutes: 'PV-2026-08-02' },
  { id: 'MT-003', tenantId: 'T-001', title: 'Réunion bureau - Septembre', date: '2026-09-15', location: 'Salle de conférence - Dakar', participants: 9, agenda: 'Préparation budget Q4', minutes: null },
  { id: 'MT-004', tenantId: 'T-001', title: 'Réunion audit', date: '2026-07-30', location: 'Siège - Dakar', participants: 6, agenda: 'Revue des procédures, plan d\'audit 2026', minutes: 'PV-2026-07' },
];

export const votes: Vote[] = [
  { id: 'V-001', tenantId: 'T-001', subject: 'Adoption du budget 2026', date: '2026-06-15', yes: 118, no: 4, abstain: 2, result: 'adopted' },
  { id: 'V-002', tenantId: 'T-001', subject: 'Élection du président', date: '2026-06-15', yes: 112, no: 8, abstain: 4, result: 'adopted' },
  { id: 'V-003', tenantId: 'T-001', subject: 'Augmentation des cotisations', date: '2026-06-15', yes: 45, no: 72, abstain: 7, result: 'rejected' },
  { id: 'V-004', tenantId: 'T-001', subject: 'Validation des tirages Q3', date: '2026-08-25', yes: 0, no: 0, abstain: 0, result: 'pending' },
  { id: 'V-005', tenantId: 'T-001', subject: 'Renouvellement du bureau', date: '2025-06-20', yes: 105, no: 3, abstain: 2, result: 'adopted' },
];

export const boardMembers: BoardMember[] = [
  { id: 'BM-001', tenantId: 'T-001', memberId: 'M-001', memberName: 'Fatou Ndiaye', position: 'president', mandateStart: '2023-01-15', mandateEnd: '2027-01-15', status: 'ongoing' },
  { id: 'BM-002', tenantId: 'T-001', memberId: 'M-002', memberName: 'Mamadou Sow', position: 'treasurer', mandateStart: '2023-03-01', mandateEnd: '2027-03-01', status: 'ongoing' },
  { id: 'BM-003', tenantId: 'T-001', memberId: 'M-003', memberName: 'Aïssatou Bâ', position: 'secretary', mandateStart: '2024-01-10', mandateEnd: '2026-01-10', status: 'expired' },
  { id: 'BM-004', tenantId: 'T-001', memberId: 'M-006', memberName: 'Cheikh Diop', position: 'boardMember', mandateStart: '2023-01-15', mandateEnd: '2027-01-15', status: 'ongoing' },
  { id: 'BM-005', tenantId: 'T-001', memberId: 'M-007', memberName: 'Khadija Mbaye', position: 'boardMember', mandateStart: '2026-09-01', mandateEnd: '2028-09-01', status: 'upcoming' },
];
