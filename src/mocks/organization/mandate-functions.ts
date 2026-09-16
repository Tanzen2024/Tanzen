/**
 * Référentiel des fonctions/postes qu'un membre peut occuper au conseil
 * (mandat « Fonctions / mandats »). Distinct du MANDAT lui-même
 * (`BoardMember`, `mocks/organization/governance.ts`) : une `MandateFunction`
 * est le POSTE POSSIBLE (ex. « Président »), un `BoardMember` est
 * l'AFFECTATION d'un membre à ce poste sur une période donnée — ne jamais
 * fusionner les deux concepts.
 *
 * `BoardMember.position` (chaîne libre, déjà en place avant ce mandat) reste
 * le libellé CAPTURÉ à la création du mandat, jamais réécrit rétroactivement
 * si la fonction est renommée ensuite — `BoardMember.positionFunctionId`
 * (nouveau, optionnel) est la seule référence vivante vers ce référentiel,
 * utilisée pour résoudre l'usage réel d'une fonction (ex. la bloquer en
 * édition tant qu'elle sert de source au dropdown), jamais pour réafficher
 * un mandat déjà attribué.
 */
export type MandateFunction = {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  /** `false` = ne doit plus être proposée pour un NOUVEAU mandat, mais reste lisible sur les mandats déjà attribués (aucune donnée supprimée). */
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Seed T-001 (seul tenant portant des `BoardMember` dans les données de
 * démonstration) : MF-001..004 migrent exactement les 4 valeurs de
 * `PositionRole` réellement utilisées par `boardMembers` avant ce mandat
 * (`president`/`treasurer`/`secretary`/`boardMember`) — aucune fonction
 * existante perdue. MF-005/006 illustrent la richesse attendue du
 * référentiel (exemples cités par le mandat lui-même, pas inventés) et le
 * filtre Actif/Inactif du dropdown.
 */
export const mandateFunctions: MandateFunction[] = [
  { id: 'MF-001', tenantId: 'T-001', name: 'Président', description: '', active: true, createdAt: '2021-03-20T00:00:00.000Z', updatedAt: '2021-03-20T00:00:00.000Z' },
  { id: 'MF-002', tenantId: 'T-001', name: 'Trésorier', description: '', active: true, createdAt: '2021-03-20T00:00:00.000Z', updatedAt: '2021-03-20T00:00:00.000Z' },
  { id: 'MF-003', tenantId: 'T-001', name: 'Secrétaire', description: '', active: true, createdAt: '2021-03-20T00:00:00.000Z', updatedAt: '2021-03-20T00:00:00.000Z' },
  { id: 'MF-004', tenantId: 'T-001', name: 'Membre du bureau', description: '', active: true, createdAt: '2021-03-20T00:00:00.000Z', updatedAt: '2021-03-20T00:00:00.000Z' },
  { id: 'MF-005', tenantId: 'T-001', name: 'Vice-président', description: '', active: true, createdAt: '2021-03-20T00:00:00.000Z', updatedAt: '2021-03-20T00:00:00.000Z' },
  { id: 'MF-006', tenantId: 'T-001', name: 'Conseiller', description: 'Fonction consultative, sans droit de vote au bureau.', active: false, createdAt: '2021-03-20T00:00:00.000Z', updatedAt: '2021-03-20T00:00:00.000Z' },
];
