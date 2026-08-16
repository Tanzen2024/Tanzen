export type NotificationType = 'workflow' | 'loan' | 'membership' | 'contribution' | 'tontine' | 'announcement' | 'system';
export type NotificationPriority = 'high' | 'medium' | 'low';
export type NotificationSource = 'credit' | 'tontines' | 'governance' | 'finance' | 'system';

export type Notification = {
  id: string;
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  read: boolean;
  createdAt: string;
  source: NotificationSource;
  link?: string;
};

export const notifications: Notification[] = [
  { id: 'N-001', tenantId: 'T-005', userId: 'U-001', type: 'workflow', title: 'Approbation en attente', message: 'La demande AP-004 · Awa Cissé (540 000 FCFA) attend votre décision finale.', priority: 'high', read: false, createdAt: '2026-08-12T08:15:00', source: 'credit', link: '/finance/credit/applications/AP-004' },
  { id: 'N-002', tenantId: 'T-003', userId: 'U-001', type: 'loan', title: 'Remboursement en retard', message: 'Ibrahima Sarr · prêt L-005 · retard de 16 jours, 51 750 FCFA restants.', priority: 'high', read: false, createdAt: '2026-08-11T10:30:00', source: 'credit', link: '/finance/credit/loans/L-005' },
  { id: 'N-003', tenantId: 'T-001', userId: 'U-001', type: 'workflow', title: 'Validation du bureau requise', message: 'AGE Budget Q3 attend la validation du bureau avant convocation.', priority: 'medium', read: false, createdAt: '2026-08-12T09:00:00', source: 'governance', link: '/operations/workflows/WR-006' },
  { id: 'N-004', tenantId: 'T-004', userId: 'U-001', type: 'membership', title: 'Nouveau membre en attente', message: 'Ousmane Fall a soumis une demande d’adhésion à Association Jappo.', priority: 'medium', read: true, createdAt: '2024-02-15T14:00:00', source: 'governance', link: '/organization/members/M-004' },
  { id: 'N-005', tenantId: 'T-005', userId: 'U-001', type: 'tontine', title: 'Cycle bientôt clôturé', message: 'Tontine Avenir · Cycle 1 approche de sa date de fin.', priority: 'low', read: true, createdAt: '2026-08-05T11:00:00', source: 'tontines', link: '/tontines/TON-002/cycles/CYC-003' },
  { id: 'N-006', tenantId: 'T-001', userId: 'U-001', type: 'contribution', title: 'Cotisation reçue', message: 'Fatou Ndiaye a réglé sa cotisation du cycle 4 · Tontine Horizon (50 000 FCFA).', priority: 'low', read: true, createdAt: '2026-08-08T16:45:00', source: 'finance', link: '/finance/contributions' },
  { id: 'N-007', tenantId: 'T-001', userId: 'U-001', type: 'workflow', title: 'Distribution renvoyée', message: 'La distribution DI-004 · Mamadou Sow a été renvoyée : justificatif manquant.', priority: 'medium', read: false, createdAt: '2026-08-15T13:20:00', source: 'finance', link: '/operations/workflows/WR-008' },
  { id: 'N-008', tenantId: 'T-001', userId: 'U-001', type: 'announcement', title: 'Maintenance planifiée', message: 'Une maintenance de la plateforme est prévue le 20 août de 22h à 23h.', priority: 'low', read: false, createdAt: '2026-08-10T09:00:00', source: 'system' },
  { id: 'N-009', tenantId: 'T-001', userId: 'U-001', type: 'announcement', title: 'Nouvelle politique de sécurité', message: 'La politique de mots de passe sera renforcée à partir du 1er septembre.', priority: 'medium', read: false, createdAt: '2026-08-01T08:00:00', source: 'system' },
  { id: 'N-010', tenantId: 'T-002', userId: 'U-001', type: 'loan', title: 'Prêt décaissé', message: 'Le prêt L-002 · Mamadou Sow (1 200 000 FCFA) a été décaissé.', priority: 'low', read: true, createdAt: '2026-07-10T10:00:00', source: 'credit', link: '/finance/credit/loans/L-002' },
  { id: 'N-011', tenantId: 'T-003', userId: 'U-001', type: 'workflow', title: 'Demande rejetée', message: 'Le prêt L-005 · Ibrahima Sarr a été rejeté en décision finale.', priority: 'medium', read: true, createdAt: '2026-07-25T15:10:00', source: 'credit', link: '/operations/workflows/WR-003' },
  { id: 'N-012', tenantId: 'T-001', userId: 'U-006', type: 'membership', title: 'Bienvenue sur TANZEN', message: 'Votre compte a été activé.', priority: 'low', read: false, createdAt: '2026-08-01T08:00:00', source: 'system' },
];
