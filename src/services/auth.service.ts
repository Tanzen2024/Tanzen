import { mockRequest } from './api-client';

const SESSION_KEY = 'tanzen-session';

export type LoginResult = { ok: false; error: 'BACKEND_PENDING' };

/**
 * BACKEND PENDING — aucun service d'authentification réel n'existe encore
 * (`AuthGuard` reste une garde de session locale, cf. son propre fichier).
 * Pas de token/JWT réel puisqu'aucun backend n'existe pour en émettre un.
 * `login`/`logout` passent par `mockRequest` (même latence artificielle
 * que tous les autres services mockés du projet) pour rester compatibles
 * en forme avec un vrai appel réseau le jour où l'authentification réelle
 * existera — seul le contenu de ces deux fonctions changera alors.
 *
 * `login()` (D2, cf. docs/P0_USERS_DECISIONS_A_VALIDER.md) ne vérifie et ne
 * peut vérifier aucun identifiant réel — aucune API d'authentification
 * TANZEN n'existe. Il retourne donc explicitement `{ ok: false, error:
 * 'BACKEND_PENDING' }`, jamais un faux succès (même contrat honnête que
 * `tanzen-mobile/src/auth/auth-service.ts`), au lieu de l'ancien
 * comportement qui posait le drapeau de session et prétendait avoir
 * authentifié l'utilisateur. Il continue néanmoins à établir la session
 * locale de démonstration (le drapeau `localStorage` que lit
 * `isAuthenticated()`) : sans elle, aucun écran de l'application ne serait
 * jamais atteignable tant qu'aucun vrai backend n'existe, ce que le mandat
 * interdit explicitement de casser. Cette session locale n'est PAS une
 * preuve d'authentification — `LoginPage` doit refléter cette distinction
 * à l'écran (message explicite), jamais la présenter comme réelle.
 *
 * `isAuthenticated()` relit `localStorage` à chaque appel (jamais mis en
 * cache en mémoire) : un rechargement de page ne peut donc jamais
 * "ressusciter" une session déjà invalidée par `logout()`, et une session
 * active survit correctement à un rechargement.
 */
export const authService = {
  isAuthenticated: () => localStorage.getItem(SESSION_KEY) === 'active',
  login: () => mockRequest((): LoginResult => { localStorage.setItem(SESSION_KEY, 'active'); return { ok: false, error: 'BACKEND_PENDING' }; }),
  logout: () => mockRequest(() => { localStorage.removeItem(SESSION_KEY); return true; }),
};
