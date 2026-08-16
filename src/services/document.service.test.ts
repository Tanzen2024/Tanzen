import { describe, it, expect } from 'vitest';
import { documentService } from './document.service';

describe('documentService', () => {
  it('ALLOW/DENY: list is scoped to the requesting tenant', async () => {
    const [t001, t002] = await Promise.all([documentService.list('T-001'), documentService.list('T-002')]);
    expect(t001.every((document) => document.tenantId === 'T-001')).toBe(true);
    expect(t002.every((document) => document.tenantId === 'T-002')).toBe(true);
    const t002Ids = new Set(t002.map((document) => document.id));
    expect(t001.some((document) => t002Ids.has(document.id))).toBe(false);
  });

  it('DENY: get returns null for a document of another tenant', async () => {
    const result = await documentService.get('T-001', 'DOC-007');
    expect(result).toBeNull();
  });

  it('ALLOW: get returns the document when it belongs to the requesting tenant', async () => {
    const result = await documentService.get('T-002', 'DOC-007');
    expect(result?.id).toBe('DOC-007');
  });

  it('DENY: listByEntity never returns a document of another tenant even for a matching entityType/entityId', async () => {
    // DOC-007 is attached to loan L-002 under T-002 — a T-001 caller querying the same entity must see nothing.
    const result = await documentService.listByEntity('T-001', 'loan', 'L-002');
    expect(result).toEqual([]);
  });

  it('ALLOW: listByEntity returns the document for the owning tenant', async () => {
    const result = await documentService.listByEntity('T-002', 'loan', 'L-002');
    expect(result.some((document) => document.id === 'DOC-007')).toBe(true);
  });

  it('DENY: remove cannot delete a document of another tenant', async () => {
    const before = await documentService.list('T-002');
    const result = await documentService.remove('T-001', 'DOC-007');
    expect(result).toBeNull();
    const after = await documentService.list('T-002');
    expect(after.length).toBe(before.length);
    expect(after.some((document) => document.id === 'DOC-007')).toBe(true);
  });

  it('ALLOW: create attaches the correct tenantId and remove deletes it for the owning tenant', async () => {
    const created = await documentService.create('T-002', { name: 'Test.pdf', category: 'other', mimeType: 'application/pdf', sizeKb: 10, uploadedBy: 'Test', entityType: 'loan', entityId: 'L-002', entityLabel: 'Test' });
    expect(created.tenantId).toBe('T-002');
    const removed = await documentService.remove('T-002', created.id);
    expect(removed?.id).toBe(created.id);
    const after = await documentService.get('T-002', created.id);
    expect(after).toBeNull();
  });
});
