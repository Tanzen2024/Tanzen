/**
 * Domaine Commercial/Platform (Plans SaaS) — entièrement nouveau, absent des
 * 59 tables du dictionnaire de données (domaine Billing/Subscription jamais
 * spécifié, cf. docs/FINAL_ARCHITECTURE_DECISIONS_A_VALIDER.md §5). Les 5
 * paliers (Free/Starter/Standard/Premium/Enterprise) et leurs champs
 * proviennent directement du mandat qui a autorisé la construction de cette
 * couche — ce n'est pas une invention de règle tarifaire, c'est la source
 * pour ce domaine, faute d'autre source disponible.
 */
export type PlanCode = 'free' | 'starter' | 'standard' | 'premium' | 'enterprise';
export type PlanStatus = 'active' | 'archived';

export type Plan = {
  id: string;
  code: PlanCode;
  name: string;
  description: { fr: string; en: string };
  priceMonthly: number;
  priceAnnual: number;
  maxUsers: number | null;
  status: PlanStatus;
};

/**
 * `name` (Free/Starter/Standard/Premium/Enterprise) est un libellé de palier
 * international volontairement invariant par langue — il vient verbatim du
 * mandat qui a autorisé ce domaine et sert aussi de valeur figée dans les
 * instantanés `Subscription.planName` (voir mocks/platform/subscriptions.ts) ;
 * le traduire casserait cette cohérence pour un gain marketing marginal.
 * `description` est en revanche une vraie phrase utilisateur (Pricing page)
 * et doit donc être bilingue (exigence multilingue §13).
 */
export const plans: Plan[] = [
  { id: 'PL-001', code: 'free', name: 'Free', description: { fr: 'Pour démarrer et découvrir TANZEN sans engagement.', en: 'To get started and discover TANZEN with no commitment.' }, priceMonthly: 0, priceAnnual: 0, maxUsers: 10, status: 'active' },
  { id: 'PL-002', code: 'starter', name: 'Starter', description: { fr: 'Pour les petites organisations en croissance.', en: 'For small, growing organizations.' }, priceMonthly: 15000, priceAnnual: 153000, maxUsers: 50, status: 'active' },
  { id: 'PL-003', code: 'standard', name: 'Standard', description: { fr: 'Pour les organisations avec plusieurs cycles actifs.', en: 'For organizations with several active cycles.' }, priceMonthly: 35000, priceAnnual: 357000, maxUsers: 200, status: 'active' },
  { id: 'PL-004', code: 'premium', name: 'Premium', description: { fr: 'Pour les organisations à forte activité financière.', en: 'For organizations with high financial activity.' }, priceMonthly: 65000, priceAnnual: 663000, maxUsers: 500, status: 'active' },
  { id: 'PL-005', code: 'enterprise', name: 'Enterprise', description: { fr: 'Pour les fédérations et grands groupes multi-tenants.', en: 'For federations and large multi-tenant groups.' }, priceMonthly: 120000, priceAnnual: 1224000, maxUsers: null, status: 'active' },
];
