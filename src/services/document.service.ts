import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { documents, type DocumentRecord } from '@/mocks/operations/documents';

export type DocumentInput = Pick<DocumentRecord, 'name' | 'category' | 'mimeType' | 'sizeKb' | 'uploadedBy' | 'entityType' | 'entityId' | 'entityLabel'>;

export const documentService = {
  list: (tenantId: string) => mockRequest(() => documents.filter((document) => document.tenantId === tenantId)),
  get: (tenantId: string, documentId: string) => mockRequest(() => getTenantScoped(documents, (document) => document.id === documentId, tenantId)),
  listByEntity: (tenantId: string, entityType: string, entityId: string) => mockRequest(() => documents.filter((document) => document.tenantId === tenantId && document.entityType === entityType && document.entityId === entityId)),

  create: (tenantId: string, input: DocumentInput) =>
    mockRequest(() => {
      const document: DocumentRecord = { id: `DOC-${String(documents.length + 1).padStart(3, '0')}`, tenantId, uploadedAt: new Date().toISOString().slice(0, 10), shared: false, ...input };
      documents.push(document);
      return document;
    }),
  remove: (tenantId: string, documentId: string) =>
    mockRequest(() => {
      const index = documents.findIndex((document) => document.id === documentId && document.tenantId === tenantId);
      if (index === -1) return undefined;
      const [removed] = documents.splice(index, 1);
      return removed;
    }),
};
