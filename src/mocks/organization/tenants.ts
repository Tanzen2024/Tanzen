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
  { id: 'T-001', name: 'Coopérative Sutura', legalName: 'Coopérative Sutura SARL', code: 'CS-001', type: 'cooperative', status: 'active', country: 'Sénégal', city: 'Dakar', email: 'contact@sutura.sn', phone: '+221 33 824 00 11', address: '12 Rue Sandiniéry, Dakar', website: 'www.sutura.sn', description: 'Coopérative d\'épargne et de crédit communautaire.', memberCount: 486, createdAt: '2021-03-15' },
  { id: 'T-002', name: 'Tontine Horizon', legalName: 'Tontine Horizon Association', code: 'TH-002', type: 'tontine', status: 'active', country: 'Sénégal', city: 'Thiès', email: 'info@horizon.sn', phone: '+221 33 951 22 33', address: '45 Av. Général de Gaulle, Thiès', website: 'www.horizon.sn', description: 'Tontine rotative multi-cycles.', memberCount: 152, createdAt: '2022-01-20' },
  { id: 'T-003', name: 'Mutuelle Teranga', legalName: 'Mutuelle Teranga Mut', code: 'MT-003', type: 'mutuelle', status: 'active', country: 'Sénégal', city: 'Saint-Louis', email: 'teranga@mutuelle.sn', phone: '+221 33 861 44 55', address: '78 Quai Louis Faidherbe, Saint-Louis', website: 'www.teranga.sn', description: 'Mutuelle de solidarité et de prévoyance.', memberCount: 324, createdAt: '2021-11-08' },
  { id: 'T-004', name: 'Association Jappo', legalName: 'Association Jappo', code: 'AJ-004', type: 'association', status: 'pending', country: 'Sénégal', city: 'Kaolack', email: 'jappo@gmail.com', phone: '+221 77 123 45 67', address: '23 Marché Sandaga, Kaolack', website: '', description: 'Association de développement local.', memberCount: 78, createdAt: '2024-02-14' },
  { id: 'T-005', name: 'Tontine Avenir', legalName: 'Tontine Avenir Group', code: 'TA-005', type: 'tontine', status: 'inactive', country: 'Sénégal', city: 'Touba', email: 'avenir@tontine.sn', phone: '+221 76 987 65 43', address: '5 Rue Touba Mosquée, Touba', website: '', description: 'Tontine d\'investissement collectif.', memberCount: 45, createdAt: '2023-06-10' },
];
