import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { sessions } from '@/mocks/access/sessions';
import type { PlatformScope } from '@/mocks/rbac.mocks';

export const sessionService = {
  list: (tenantId: string, scope: PlatformScope) => mockRequest(() => (scope === 'platform' ? sessions : sessions.filter((session) => session.tenantId === tenantId))),
  listByUser: (userId: string) => mockRequest(() => sessions.filter((session) => session.userId === userId)),
  revoke: (tenantId: string, sessionId: string, scope: PlatformScope = 'tenant') =>
    mockRequest(() => {
      const session = getTenantScoped(sessions, (item) => item.id === sessionId, tenantId, scope);
      if (session) session.status = 'revoked';
      return session;
    }),
};
