import { describe, it, expect } from 'vitest';
import { attendanceService } from './attendance.service';
import { organizationService } from './organization.service';

describe('attendanceService — CREATE', () => {
  it('ALLOW: createAttendance succeeds for a PLANNED meeting and a member of the same tenant', async () => {
    const meeting = (await organizationService.createMeeting('T-001', { title: 'Réunion attendance A', date: '2026-12-01', location: 'Test', participants: 5, agenda: 'Test' }))!;
    const attendance = await attendanceService.createAttendance('T-001', { meetingId: meeting.id, memberId: 'M-001', status: 'PRESENT', operationId: 'OP-CREATE-1' });
    expect(attendance).not.toBeNull();
    expect(attendance?.meetingId).toBe(meeting.id);
    expect(attendance?.memberId).toBe('M-001');
    expect(attendance?.status).toBe('PRESENT');
  });

  it('DENY: createAttendance refuses a meetingId belonging to another tenant', async () => {
    const result = await attendanceService.createAttendance('T-002', { meetingId: 'MT-001', memberId: 'M-002', status: 'PRESENT', operationId: 'OP-CREATE-2' });
    expect(result).toBeNull();
  });

  it('DENY: createAttendance refuses a memberId belonging to another tenant (§10/§13 du mandat)', async () => {
    const meeting = (await organizationService.createMeeting('T-001', { title: 'Réunion attendance B', date: '2026-12-02', location: 'Test', participants: 5, agenda: 'Test' }))!;
    const result = await attendanceService.createAttendance('T-001', { meetingId: meeting.id, memberId: 'M-002', status: 'PRESENT', operationId: 'OP-CREATE-3' });
    expect(result).toBeNull();
  });

  it('DENY: createAttendance refuses once the meeting is COMPLETED (MT-004 seeded as COMPLETED)', async () => {
    const result = await attendanceService.createAttendance('T-001', { meetingId: 'MT-004', memberId: 'M-006', status: 'LATE', operationId: 'OP-CREATE-4' });
    expect(result).toBeNull();
  });
});

describe('attendanceService — idempotence / UNIQUE(meeting_id, member_id) — D-4C3-WEB-04', () => {
  it('IDEMPOTENT: the same operationId on the same couple returns the existing record unchanged (retransmission)', async () => {
    const meeting = (await organizationService.createMeeting('T-001', { title: 'Réunion idempotence A', date: '2026-12-03', location: 'Test', participants: 5, agenda: 'Test' }))!;
    const first = await attendanceService.createAttendance('T-001', { meetingId: meeting.id, memberId: 'M-001', status: 'PRESENT', operationId: 'OP-IDEMPOTENT' });
    const retry = await attendanceService.createAttendance('T-001', { meetingId: meeting.id, memberId: 'M-001', status: 'ABSENT', operationId: 'OP-IDEMPOTENT' });
    expect(retry?.id).toBe(first?.id);
    expect(retry?.status).toBe('PRESENT');
  });

  it('UPSERT: a different operationId on the same couple updates the status instead of creating a duplicate', async () => {
    const meeting = (await organizationService.createMeeting('T-001', { title: 'Réunion idempotence B', date: '2026-12-04', location: 'Test', participants: 5, agenda: 'Test' }))!;
    const first = await attendanceService.createAttendance('T-001', { meetingId: meeting.id, memberId: 'M-001', status: 'PRESENT', operationId: 'OP-A' });
    const second = await attendanceService.createAttendance('T-001', { meetingId: meeting.id, memberId: 'M-001', status: 'LATE', operationId: 'OP-B' });
    expect(second?.id).toBe(first?.id);
    expect(second?.status).toBe('LATE');
    const all = await attendanceService.listAttendancesByMeeting('T-001', meeting.id);
    expect(all.filter((item) => item.memberId === 'M-001').length).toBe(1);
  });
});

describe('attendanceService — UPDATE', () => {
  it('ALLOW: updateAttendance changes status while the meeting is open', async () => {
    const meeting = (await organizationService.createMeeting('T-001', { title: 'Réunion update A', date: '2026-12-10', location: 'Test', participants: 5, agenda: 'Test' }))!;
    const created = await attendanceService.createAttendance('T-001', { meetingId: meeting.id, memberId: 'M-001', status: 'PRESENT', operationId: 'OP-U1' });
    const updated = await attendanceService.updateAttendance('T-001', created!.id, { status: 'EXCUSED', operationId: 'OP-U2' });
    expect(updated?.status).toBe('EXCUSED');
  });

  it('DENY: updateAttendance refuses a record belonging to another tenant', async () => {
    const result = await attendanceService.updateAttendance('T-002', 'ATT-003', { status: 'ABSENT', operationId: 'OP-U3' });
    expect(result).toBeNull();
  });
});

describe('attendanceService — DELETE', () => {
  it('ALLOW: deleteAttendance removes a record while the meeting is open', async () => {
    const meeting = (await organizationService.createMeeting('T-001', { title: 'Réunion delete A', date: '2026-12-11', location: 'Test', participants: 5, agenda: 'Test' }))!;
    const created = await attendanceService.createAttendance('T-001', { meetingId: meeting.id, memberId: 'M-001', status: 'PRESENT', operationId: 'OP-D1' });
    const deleted = await attendanceService.deleteAttendance('T-001', created!.id);
    expect(deleted?.id).toBe(created!.id);
    const remaining = await attendanceService.listAttendancesByMeeting('T-001', meeting.id);
    expect(remaining.find((item) => item.id === created!.id)).toBeUndefined();
  });

  it('DENY: deleteAttendance refuses a record belonging to another tenant', async () => {
    const result = await attendanceService.deleteAttendance('T-002', 'ATT-003');
    expect(result).toBeNull();
  });
});

describe('attendanceService — immutability after Meeting closure (D-4C3-WEB-03)', () => {
  it('DENY: createAttendance refuses once the meeting has just transitioned to COMPLETED', async () => {
    const meeting = (await organizationService.createMeeting('T-001', { title: 'Réunion clôture A', date: '2026-12-12', location: 'Test', participants: 5, agenda: 'Test' }))!;
    await organizationService.startMeeting('T-001', meeting.id);
    await organizationService.completeMeeting('T-001', meeting.id);
    const result = await attendanceService.createAttendance('T-001', { meetingId: meeting.id, memberId: 'M-001', status: 'PRESENT', operationId: 'OP-CLOSED-1' });
    expect(result).toBeNull();
  });

  it('DENY: updateAttendance/deleteAttendance refuse on a COMPLETED meeting (seeded ATT-001 on MT-004)', async () => {
    const updateResult = await attendanceService.updateAttendance('T-001', 'ATT-001', { status: 'LATE', operationId: 'OP-CLOSED-2' });
    expect(updateResult).toBeNull();
    const deleteResult = await attendanceService.deleteAttendance('T-001', 'ATT-001');
    expect(deleteResult).toBeNull();
  });

  it('DENY: updateAttendance refuses once the meeting is CANCELLED', async () => {
    const meeting = (await organizationService.createMeeting('T-001', { title: 'Réunion annulée A', date: '2026-12-13', location: 'Test', participants: 5, agenda: 'Test' }))!;
    const created = await attendanceService.createAttendance('T-001', { meetingId: meeting.id, memberId: 'M-001', status: 'PRESENT', operationId: 'OP-CANCEL-1' });
    await organizationService.cancelMeeting('T-001', meeting.id);
    const updateResult = await attendanceService.updateAttendance('T-001', created!.id, { status: 'ABSENT', operationId: 'OP-CANCEL-2' });
    expect(updateResult).toBeNull();
  });
});

describe('attendanceService — LIST — tenant isolation', () => {
  it('ALLOW: listAttendancesByMeeting returns attendances of a meeting belonging to the requesting tenant', async () => {
    const result = await attendanceService.listAttendancesByMeeting('T-001', 'MT-004');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.meetingId === 'MT-004')).toBe(true);
  });

  it('DENY: listAttendancesByMeeting returns an empty list for a meeting of another tenant', async () => {
    const result = await attendanceService.listAttendancesByMeeting('T-002', 'MT-004');
    expect(result).toEqual([]);
  });
});
