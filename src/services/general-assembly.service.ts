import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { meetings, type Meeting, type MeetingStatus } from '@/mocks/organization/governance';

/**
 * D-4C4-WEB-01 (Option B, cf. docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md
 * §2) : `GeneralAssembly` n'est plus une entité physique autonome — ce
 * service lit/écrit désormais exclusivement le sous-ensemble de `meetings`
 * où `type === 'GENERAL_ASSEMBLY'`. `GeneralAssemblyView` est une simple vue
 * de lecture (pas un modèle stocké séparément), conservée pour limiter le
 * changement de surface côté UI existante (mêmes noms de champs qu'avant la
 * migration : `assemblyDate` plutôt que `date`).
 *
 * Conséquence directe de l'unification : une AG bénéficie désormais
 * gratuitement du cycle de vie complet de `Meeting` (`startMeeting`/
 * `completeMeeting`/`cancelMeeting`, `organization.service.ts`) — capacité
 * qui n'existait pas sur l'ancienne entité autonome (Create+Read seulement).
 */
export type GeneralAssemblyView = { id: string; tenantId: string; title: string; assemblyDate: string; description: string | null; status: MeetingStatus };

function isGeneralAssembly(meeting: Meeting): boolean {
  return meeting.type === 'GENERAL_ASSEMBLY';
}

function toView(meeting: Meeting): GeneralAssemblyView {
  return { id: meeting.id, tenantId: meeting.tenantId, title: meeting.title, assemblyDate: meeting.date, description: meeting.description, status: meeting.status };
}

export type GeneralAssemblyInput = { title: string; assemblyDate: string; description: string | null };

export const generalAssemblyService = {
  listGeneralAssemblies: (tenantId: string) =>
    mockRequest(() => meetings.filter((meeting) => meeting.tenantId === tenantId && isGeneralAssembly(meeting)).map(toView)),

  getGeneralAssembly: (tenantId: string, meetingId: string) =>
    mockRequest(() => {
      const meeting = getTenantScoped(meetings, (item) => item.id === meetingId && isGeneralAssembly(item), tenantId);
      return meeting ? toView(meeting) : undefined;
    }),

  /**
   * `status` n'est jamais accepté en entrée : une nouvelle AG démarre
   * toujours à `PLANNED` (D-4C3-TECH-01, cohérent avec l'ancienne fiche
   * canonique #39). `uq_general_assemblies_title_date` vérifiée uniquement
   * contre les `Meeting(type=GENERAL_ASSEMBLY)` du tenant — refuse
   * (undefined) toute écriture qui la violerait.
   */
  createGeneralAssembly: (tenantId: string, input: GeneralAssemblyInput) =>
    mockRequest(() => {
      if (!input.title.trim()) return undefined;
      if (!input.assemblyDate) return undefined; // ck_general_assemblies_date
      const duplicate = meetings.some((meeting) => meeting.tenantId === tenantId && isGeneralAssembly(meeting) && meeting.title === input.title && meeting.date === input.assemblyDate);
      if (duplicate) return undefined;
      const meeting: Meeting = { id: `MT-${String(meetings.length + 1).padStart(3, '0')}`, tenantId, title: input.title, date: input.assemblyDate, location: '', participants: 0, agenda: '', minutes: null, status: 'PLANNED', type: 'GENERAL_ASSEMBLY', description: input.description };
      meetings.push(meeting);
      return toView(meeting);
    }),
};
