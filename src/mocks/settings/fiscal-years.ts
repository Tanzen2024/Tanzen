/**
 * Configuration transverse : un seul calendrier d'exercices fiscaux par
 * tenant, consommé par tous les modules (Finance, Tontines, Audit...) —
 * pas un exercice fiscal par module.
 */
import type { SessionScheduleConfig } from './session-schedule';

export type FiscalYearStatus = 'open' | 'closed' | 'upcoming';

export type FiscalYear = {
  id: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  status: FiscalYearStatus;
  isCurrent: boolean;
  /**
   * Ajouté par IMPLEMENTATION GO (D-FY-01/D-FY-06) : seule information de
   * cycle de vie portée directement par l'entité — le reste (qui a
   * créé/ouvert/clôturé/rouvert, quand, pourquoi) vit dans `audit_logs`
   * (`src/mocks/audit/audit-events.ts`), jamais dupliqué ici, conformément à
   * D-FY-06 (traçabilité via le mécanisme d'audit global, pas des champs
   * `createdBy`/`closedBy` sur l'entité elle-même). Consommateur : affichage
   * uniquement (aucune règle métier n'en dépend). Pour les 12 enregistrements
   * de seed préexistants (aucune date de création réelle n'a jamais été
   * tracée avant cette implémentation), la valeur retenue est `startDate` —
   * un choix d'affichage rétroactif pour les données de démonstration, pas
   * une donnée réelle ni une règle métier.
   */
  createdAt: string;
  /**
   * Ajoutés par le mandat « Évolution du cycle de vie des exercices fiscaux »
   * (2026-09-16) — CACHE DE LECTURE UNIQUEMENT, jamais la source de vérité :
   * qui/quand a clôturé reste tracé intégralement dans `audit_logs`
   * (`fiscalYears.close`/`fiscalYears.reopened`), conformément à D-FY-06.
   * Ces deux champs ne sont écrits QUE par `settingsService.closeCurrentFiscalYear`
   * (pose) et `applyFiscalYearReopenDecision` (remise à `null` — la réouverture
   * n'efface rien dans l'audit, seulement ce cache d'affichage qui représente
   * l'état courant, cf. mandat §25/§26). Jamais éditables indépendamment,
   * jamais lus par une règle métier — display-only, comme `createdAt`.
   * `null` tant que l'exercice n'a jamais été clôturé (ou a été rouvert).
   */
  closedAt: string | null;
  closedBy: string | null;
  /**
   * Configuration de récurrence des SÉANCES de l'exercice — sert UNIQUEMENT à
   * pré-remplir la suggestion de prochaine séance (`suggestNextSessionDate`),
   * jamais à générer un calendrier en masse (cf. `session-schedule.ts`).
   * `undefined` = aucune fréquence configurée : le formulaire « Ajouter une
   * séance » n'a alors aucune suggestion (l'utilisateur saisit la date
   * librement, dans la période de l'exercice). Modifiable tant que l'exercice
   * n'est pas `closed`.
   */
  sessionSchedule?: SessionScheduleConfig;
};

export const fiscalYears: FiscalYear[] = [
  { id: 'FY-T001-2024', tenantId: 'T-001', startDate: '2024-01-01', endDate: '2024-12-31', status: 'closed', isCurrent: false, createdAt: '2024-01-01', closedAt: null, closedBy: null },
  { id: 'FY-T001-2025', tenantId: 'T-001', startDate: '2025-01-01', endDate: '2025-12-31', status: 'closed', isCurrent: false, createdAt: '2025-01-01', closedAt: null, closedBy: null },
  // Fréquence de séances seedée = « deuxième mardi de chaque mois » (l'exemple historique du mandat Meeting).
  { id: 'FY-T001-2026', tenantId: 'T-001', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true, createdAt: '2026-01-01', closedAt: null, closedBy: null, sessionSchedule: { frequency: 'MONTHLY', rule: 'NTH_WEEKDAY', ordinal: 'SECOND', nthWeekday: 'TUESDAY' } },
  { id: 'FY-T001-2027', tenantId: 'T-001', startDate: '2027-01-01', endDate: '2027-12-31', status: 'upcoming', isCurrent: false, createdAt: '2027-01-01', closedAt: null, closedBy: null },

  { id: 'FY-T002-2025', tenantId: 'T-002', startDate: '2025-01-01', endDate: '2025-12-31', status: 'closed', isCurrent: false, createdAt: '2025-01-01', closedAt: null, closedBy: null },
  { id: 'FY-T002-2026', tenantId: 'T-002', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true, createdAt: '2026-01-01', closedAt: null, closedBy: null, sessionSchedule: { frequency: 'MONTHLY', rule: 'DAY_OF_MONTH', dayOfMonth: 5 } },
  { id: 'FY-T002-2027', tenantId: 'T-002', startDate: '2027-01-01', endDate: '2027-12-31', status: 'upcoming', isCurrent: false, createdAt: '2027-01-01', closedAt: null, closedBy: null },

  { id: 'FY-T003-2025', tenantId: 'T-003', startDate: '2025-01-01', endDate: '2025-12-31', status: 'closed', isCurrent: false, createdAt: '2025-01-01', closedAt: null, closedBy: null },
  { id: 'FY-T003-2026', tenantId: 'T-003', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true, createdAt: '2026-01-01', closedAt: null, closedBy: null },

  { id: 'FY-T004-2026', tenantId: 'T-004', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true, createdAt: '2026-01-01', closedAt: null, closedBy: null },

  { id: 'FY-T005-2025', tenantId: 'T-005', startDate: '2025-01-01', endDate: '2025-12-31', status: 'closed', isCurrent: false, createdAt: '2025-01-01', closedAt: null, closedBy: null },
  { id: 'FY-T005-2026', tenantId: 'T-005', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open', isCurrent: true, createdAt: '2026-01-01', closedAt: null, closedBy: null },
];

/**
 * Libellé de l'exercice — TOUJOURS calculé depuis les dates, jamais stocké
 * (mandat « reconstruction Exercices fiscaux / Séances »). Même année →
 * « Exercice YYYY » ; années différentes → « Exercice YYYY-YYYY ». Fonction
 * centralisée, seule source de vérité — aucun composant ne doit recalculer
 * cette règle lui-même.
 */
export function fiscalYearLabel(year: Pick<FiscalYear, 'startDate' | 'endDate'>): string {
  const startYear = year.startDate.slice(0, 4);
  const endYear = year.endDate.slice(0, 4);
  return startYear === endYear ? `Exercice ${startYear}` : `Exercice ${startYear}-${endYear}`;
}

/** `YYYY-MM-DD` + N jours, sans dérive de fuseau (calcul en UTC). */
function addDaysISO(dateISO: string, days: number): string {
  const date = new Date(`${dateISO}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` + N années (même mois/jour), sans dérive de fuseau. */
function addYearsISO(dateISO: string, years: number): string {
  const date = new Date(`${dateISO}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

/**
 * Propose le prochain exercice fiscal à partir des exercices déjà existants
 * d'un tenant (déjà filtrés par l'appelant, comme `listFiscalYears`/le
 * sélecteur de la barre supérieure le font). Aucune configuration de
 * fréquence/durée d'exercice n'existe aujourd'hui dans le modèle `FiscalYear`
 * (seul `sessionSchedule` a une fréquence, mais elle concerne les dates de
 * SÉANCE, pas la durée de l'exercice) — cette fonction dérive donc le
 * prochain exercice du dernier exercice réel du tenant plutôt que de coder en
 * dur une convention (ex. 1er janvier) :
 * - date de début = lendemain de la date de fin du dernier exercice (aucun
 *   trou, respecte une éventuelle prorogation déjà enregistrée dans
 *   `endDate`, puisque c'est cette valeur réelle qui est utilisée) ;
 * - date de fin = même mois/jour que le dernier exercice, décalée du même
 *   nombre d'années que la nouvelle date de début (reconduit la durée
 *   observée, gère aussi bien un exercice calendaire que juillet→juin).
 *
 * Ne propose rien (`startDate`/`endDate` vides, comme un formulaire vierge) si
 * le tenant n'a encore aucun exercice — aucune convention n'est inventée pour
 * ce cas, l'utilisateur saisit son premier exercice à la main comme
 * aujourd'hui.
 */
export function suggestNextFiscalYear(tenantYears: FiscalYear[]): { startDate: string; endDate: string } {
  const last = [...tenantYears].sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  if (!last) return { startDate: '', endDate: '' };
  const startDate = addDaysISO(last.endDate, 1);
  const yearShift = Number(startDate.slice(0, 4)) - Number(last.startDate.slice(0, 4));
  const endDate = addYearsISO(last.endDate, yearShift);
  return { startDate, endDate };
}

/**
 * Chevauchement de période entre deux exercices d'un même tenant (§23 du
 * mandat « reconstruction Exercices fiscaux / Séances ») — deux périodes
 * [a.startDate, a.endDate] et [b.startDate, b.endDate] se chevauchent ssi
 * `a.startDate <= b.endDate && a.endDate >= b.startDate` (bornes incluses,
 * cohérent avec la validation de séance qui accepte `date === startDate`/
 * `date === endDate`). `excludeYearId` exclut l'exercice en cours de
 * modification (prorogation `extendFiscalYearEndDate`).
 */
export function hasFiscalYearOverlap(existing: FiscalYear[], tenantId: string, startDate: string, endDate: string, excludeYearId?: string): boolean {
  return existing.some(
    (year) => year.tenantId === tenantId && year.id !== excludeYearId && startDate <= year.endDate && endDate >= year.startDate,
  );
}
