/**
 * Abstraction minimale entre les pages et la source de données.
 * Aujourd'hui `mockRequest` résout simplement la valeur en mémoire ; le jour
 * où un vrai backend existe, seule cette fonction (et les fichiers
 * `*.service.ts` qui l'appellent) a besoin de changer pour parler à
 * `API_BASE_URL` — aucune page ne doit importer un mock directement.
 */
export const API_BASE_URL = '/api/v1';

/**
 * Latence artificielle volontairement faible : sert uniquement à rendre les
 * états Loading vérifiables à l'œil (skeletons, spinners), pas à simuler un
 * vrai réseau. Ajustable via VITE_MOCK_API_DELAY si besoin en local.
 */
export const MOCK_API_DELAY = Number(import.meta.env.VITE_MOCK_API_DELAY ?? 300);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `undefined` est la valeur conventionnelle des services pour "introuvable /
 * hors du tenant courant" (voir tenant-scope.ts), mais TanStack Query v5
 * interdit à un queryFn de résoudre `undefined` (il bascule la query en
 * erreur) — ce qui transformait silencieusement tout "NotFound" attendu en
 * écran d'erreur générique. `null` porte la même sémantique "rien à
 * afficher" pour tous les `if (!resource)` existants, sans ce piège.
 */
export async function mockRequest<T>(factory: () => T): Promise<T> {
  if (MOCK_API_DELAY > 0) await delay(MOCK_API_DELAY);
  const result = factory();
  return (result === undefined ? null : result) as T;
}
