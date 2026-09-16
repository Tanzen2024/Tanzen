/**
 * Primitive générique du moteur de workflow de validation : représente les
 * champs qu'une demande de modification propose de changer sur une entité
 * déjà enregistrée (avant/après), indépendamment du domaine métier. Suit le
 * même style que `src/lib/finance/` — fonction pure, entrées en paramètres,
 * testable isolément, aucune dépendance à un service ou un mock.
 */
export type ChangeSetItem = { field: string; before: unknown; after: unknown };

/**
 * Compare `before` (l'entité telle qu'enregistrée) à `patch` (les valeurs
 * proposées) et retourne uniquement les champs qui changent réellement.
 * Comparaison superficielle par égalité stricte — suffisant pour les champs
 * scalaires (chaînes, nombres, énumérations) des entités actuellement
 * concernées par ce moteur ; ne convient pas tel quel à un champ imbriqué
 * (tableau/objet) qui aurait besoin d'une égalité profonde.
 */
export function computeChangeSet<T extends Record<string, unknown>>(before: T, patch: Partial<T>): ChangeSetItem[] {
  const items: ChangeSetItem[] = [];
  for (const field of Object.keys(patch)) {
    const after = patch[field];
    if (after === undefined) continue;
    const beforeValue = before[field];
    if (beforeValue !== after) items.push({ field, before: beforeValue, after });
  }
  return items;
}
