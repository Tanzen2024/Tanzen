export type SessionStatus = 'active' | 'expired' | 'revoked';

export type UserSession = {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  device: string;
  browser: string;
  ipAddress: string;
  location: string;
  status: SessionStatus;
  createdAt: string;
  lastActivityAt: string;
};

export const sessions: UserSession[] = [
  { id: 'SS-001', tenantId: 'T-001', userId: 'U-001', userName: 'Amadou Mbaye', device: 'MacBook Pro', browser: 'Chrome 127 · macOS', ipAddress: '41.82.12.4', location: 'Dakar, SN', status: 'active', createdAt: '2026-08-12T07:55:00', lastActivityAt: '2026-08-12T08:05:00' },
  { id: 'SS-002', tenantId: 'T-001', userId: 'U-001', userName: 'Amadou Mbaye', device: 'iPhone 14', browser: 'Safari · iOS 17', ipAddress: '41.82.12.9', location: 'Dakar, SN', status: 'active', createdAt: '2026-08-11T09:10:00', lastActivityAt: '2026-08-11T21:40:00' },
  { id: 'SS-003', tenantId: 'T-001', userId: 'U-002', userName: 'Fatou Ndiaye', device: 'Samsung A34', browser: 'Chrome 126 · Android 14', ipAddress: '41.82.30.2', location: 'Dakar, SN', status: 'active', createdAt: '2026-08-11T17:00:00', lastActivityAt: '2026-08-11T17:20:00' },
  { id: 'SS-004', tenantId: 'T-001', userId: 'U-003', userName: 'Cheikh Diop', device: 'Dell XPS 13', browser: 'Edge 126 · Windows 11', ipAddress: '41.82.44.7', location: 'Dakar, SN', status: 'expired', createdAt: '2026-08-08T08:00:00', lastActivityAt: '2026-08-10T09:12:00' },
  { id: 'SS-005', tenantId: 'T-002', userId: 'U-004', userName: 'Mamadou Sow', device: 'HP Pavilion', browser: 'Chrome 127 · Windows 10', ipAddress: '105.100.4.3', location: 'Thiès, SN', status: 'active', createdAt: '2026-08-09T14:00:00', lastActivityAt: '2026-08-09T14:40:00' },
  { id: 'SS-006', tenantId: 'T-002', userId: 'U-012', userName: 'Bineta Sy', device: 'ThinkPad X1', browser: 'Firefox 128 · Windows 11', ipAddress: '105.100.4.9', location: 'Thiès, SN', status: 'active', createdAt: '2026-08-12T06:35:00', lastActivityAt: '2026-08-12T06:40:00' },
  { id: 'SS-007', tenantId: 'T-002', userId: 'U-012', userName: 'Bineta Sy', device: 'iPad Air', browser: 'Safari · iPadOS 17', ipAddress: '105.100.4.11', location: 'Thiès, SN', status: 'revoked', createdAt: '2026-07-20T10:00:00', lastActivityAt: '2026-07-25T15:00:00' },
  { id: 'SS-008', tenantId: 'T-003', userId: 'U-006', userName: 'Aïssatou Bâ', device: 'MacBook Air', browser: 'Chrome 127 · macOS', ipAddress: '154.65.2.18', location: 'Saint-Louis, SN', status: 'active', createdAt: '2026-08-12T07:45:00', lastActivityAt: '2026-08-12T07:50:00' },
  { id: 'SS-009', tenantId: 'T-003', userId: 'U-007', userName: 'Ibrahima Sarr', device: 'Redmi Note 12', browser: 'Chrome 124 · Android 13', ipAddress: '154.65.9.4', location: 'Saint-Louis, SN', status: 'revoked', createdAt: '2026-06-25T08:00:00', lastActivityAt: '2026-07-01T11:30:00' },
  { id: 'SS-010', tenantId: 'T-005', userId: 'U-009', userName: 'Awa Cissé', device: 'iPhone 13', browser: 'Safari · iOS 17', ipAddress: '196.1.88.5', location: 'Touba, SN', status: 'active', createdAt: '2026-08-11T18:50:00', lastActivityAt: '2026-08-11T19:05:00' },
  { id: 'SS-011', tenantId: 'T-005', userId: 'U-010', userName: 'Astou Diallo', device: 'Lenovo IdeaPad', browser: 'Chrome 127 · Windows 11', ipAddress: '196.1.88.12', location: 'Touba, SN', status: 'active', createdAt: '2026-08-08T09:50:00', lastActivityAt: '2026-08-08T10:00:00' },
  { id: 'SS-012', tenantId: 'T-001', userId: 'U-011', userName: 'Omar Kane', device: 'Dell Latitude', browser: 'Chrome 118 · Windows 10', ipAddress: '41.82.55.2', location: 'Dakar, SN', status: 'expired', createdAt: '2026-04-01T07:30:00', lastActivityAt: '2026-04-02T08:00:00' },
];
