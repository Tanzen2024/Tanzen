/**
 * Unités de référence pour les tontines en nature (GOODS). Liste extensible :
 * ajouter une unité se fait uniquement ici (un seul point de vérité), sans
 * toucher aux composants qui l'utilisent via `formatUnit`.
 */
export type UnitCode =
  | 'PIECE' | 'SAC' | 'CARTON' | 'BOUTEILLE' | 'BIDON' | 'PAQUET' | 'BOITE'
  | 'KILOGRAMME' | 'GRAMME' | 'LITRE' | 'MILLILITRE' | 'METRE' | 'ROULEAU' | 'LOT' | 'DOUZAINE';

export type Unit = { code: UnitCode; singularFr: string; pluralFr: string; singularEn: string; pluralEn: string };

export const units: Unit[] = [
  { code: 'PIECE', singularFr: 'pièce', pluralFr: 'pièces', singularEn: 'piece', pluralEn: 'pieces' },
  { code: 'SAC', singularFr: 'sac', pluralFr: 'sacs', singularEn: 'bag', pluralEn: 'bags' },
  { code: 'CARTON', singularFr: 'carton', pluralFr: 'cartons', singularEn: 'box', pluralEn: 'boxes' },
  { code: 'BOUTEILLE', singularFr: 'bouteille', pluralFr: 'bouteilles', singularEn: 'bottle', pluralEn: 'bottles' },
  { code: 'BIDON', singularFr: 'bidon', pluralFr: 'bidons', singularEn: 'jerrycan', pluralEn: 'jerrycans' },
  { code: 'PAQUET', singularFr: 'paquet', pluralFr: 'paquets', singularEn: 'pack', pluralEn: 'packs' },
  { code: 'BOITE', singularFr: 'boîte', pluralFr: 'boîtes', singularEn: 'tin', pluralEn: 'tins' },
  { code: 'KILOGRAMME', singularFr: 'kilogramme', pluralFr: 'kilogrammes', singularEn: 'kilogram', pluralEn: 'kilograms' },
  { code: 'GRAMME', singularFr: 'gramme', pluralFr: 'grammes', singularEn: 'gram', pluralEn: 'grams' },
  { code: 'LITRE', singularFr: 'litre', pluralFr: 'litres', singularEn: 'liter', pluralEn: 'liters' },
  { code: 'MILLILITRE', singularFr: 'millilitre', pluralFr: 'millilitres', singularEn: 'milliliter', pluralEn: 'milliliters' },
  { code: 'METRE', singularFr: 'mètre', pluralFr: 'mètres', singularEn: 'meter', pluralEn: 'meters' },
  { code: 'ROULEAU', singularFr: 'rouleau', pluralFr: 'rouleaux', singularEn: 'roll', pluralEn: 'rolls' },
  { code: 'LOT', singularFr: 'lot', pluralFr: 'lots', singularEn: 'lot', pluralEn: 'lots' },
  { code: 'DOUZAINE', singularFr: 'douzaine', pluralFr: 'douzaines', singularEn: 'dozen', pluralEn: 'dozens' },
];

/** Pluriel appliqué dès que quantity !== 1 (0 inclus), conforme aux règles FR/EN standards. Retourne '' si le code est inconnu/absent plutôt que d'inventer un libellé. */
export function formatUnit(quantity: number, unitCode: UnitCode | string | undefined, locale: 'fr' | 'en' = 'fr'): string {
  const unit = units.find((item) => item.code === unitCode);
  if (!unit) return '';
  const singular = locale === 'en' ? unit.singularEn : unit.singularFr;
  const plural = locale === 'en' ? unit.pluralEn : unit.pluralFr;
  return quantity === 1 ? singular : plural;
}
