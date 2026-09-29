export type TenantStatus = 'active' | 'inactive' | 'pending';
export type TenantType = 'cooperative' | 'tontine' | 'association' | 'mutuelle' | 'individual';

export type Tenant = {
  id: string;
  name: string;
  legalName: string;
  code: string;
  type: TenantType;
  status: TenantStatus;
  country: string;
  city: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  description: string;
  memberCount: number;
  createdAt: string;
};

export const tenants: Tenant[] = [
  { id: 'T-001', name: 'Coopérative Sutura', legalName: 'Coopérative Sutura SARL', code: 'CS-001', type: 'cooperative', status: 'active', country: 'Cameroun', city: 'Douala', email: 'contact@sutura.cm', phone: '+237 233 82 40 01', address: '12 Rue Joss, Bonanjo, Douala', website: 'www.sutura.cm', description: 'Coopérative d\'épargne et de crédit communautaire.', memberCount: 486, createdAt: '2021-03-15' },
  { id: 'T-002', name: 'Tontine Horizon', legalName: 'Tontine Horizon Association', code: 'TH-002', type: 'tontine', status: 'active', country: 'Cameroun', city: 'Yaoundé', email: 'info@horizon.cm', phone: '+237 222 95 12 23', address: '45 Avenue Kennedy, Yaoundé', website: 'www.horizon.cm', description: 'Tontine rotative multi-cycles.', memberCount: 152, createdAt: '2022-01-20' },
  { id: 'T-003', name: 'Mutuelle Teranga', legalName: 'Mutuelle Teranga Mut', code: 'MT-003', type: 'mutuelle', status: 'active', country: 'Cameroun', city: 'Bafoussam', email: 'teranga@mutuelle.cm', phone: '+237 233 86 14 45', address: '78 Route de Foumban, Bafoussam', website: 'www.teranga.cm', description: 'Mutuelle de solidarité et de prévoyance.', memberCount: 324, createdAt: '2021-11-08' },
  { id: 'T-004', name: 'Association Jappo', legalName: 'Association Jappo', code: 'AJ-004', type: 'association', status: 'pending', country: 'Cameroun', city: 'Garoua', email: 'jappo@gmail.com', phone: '+237 677 12 34 56', address: '23 Grand Marché, Garoua', website: '', description: 'Association de développement local.', memberCount: 78, createdAt: '2024-02-14' },
  { id: 'T-005', name: 'Tontine Avenir', legalName: 'Tontine Avenir Group', code: 'TA-005', type: 'tontine', status: 'inactive', country: 'Cameroun', city: 'Bamenda', email: 'avenir@tontine.cm', phone: '+237 669 87 65 43', address: '5 Commercial Avenue, Bamenda', website: '', description: 'Tontine d\'investissement collectif.', memberCount: 45, createdAt: '2023-06-10' },
];
