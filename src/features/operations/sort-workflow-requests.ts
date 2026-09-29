import type { WorkflowRequest } from '@/mocks/operations/workflow-requests';

const requestedTime = (request: WorkflowRequest) => { const time = Date.parse(request.requestedAt); return Number.isNaN(time) ? 0 : time; };

/**
 * Ordre d'affichage de l'onglet « Demandes » (Workflows) : « Demandé le » décroissant (la plus
 * récente en premier), sur la vraie date `requestedAt` — jamais sur le libellé formaté. À date
 * identique, identifiant décroissant (ordre déterministe). Copie : la liste source n'est pas mutée.
 */
export function sortRequestsNewestFirst(requests: readonly WorkflowRequest[]): WorkflowRequest[] {
  return [...requests].sort((a, b) => requestedTime(b) - requestedTime(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}
