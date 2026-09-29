/**
 * Pays par défaut d'une organisation (mandat du 2026-09-27) : appliqué quand `Tenant.country` est
 * absent — jamais en écrasement d'un pays déjà enregistré. `Tenant.country` est un libellé (pas de
 * référentiel de pays dans le projet), d'où la valeur « Cameroun » et non un code ISO.
 * Devise par défaut associée : `DEFAULT_CURRENCY_CODE` (XAF, `constants/currencies.ts`).
 */
export const DEFAULT_COUNTRY = 'Cameroun';

/** Fuseau horaire par défaut d'une organisation (Cameroun) : complète un fuseau vide, sans écrasement. */
export const DEFAULT_TIMEZONE = 'Africa/Douala';
