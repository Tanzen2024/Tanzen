import { mockRequest } from './api-client';

const SESSION_KEY = 'tanzen-session';

/**
 * BACKEND PENDING — aucun service d'authentification n'existait avant
 * cette mission (`AuthGuard` était un passthrough documenté, cf. son
 * propre fichier). Session locale uniquement (drapeau `localStorage`), pas
 * de token/JWT réel puisqu'aucun backend n'existe pour en émettre un.
 * `login`/`logout` passent par `mockRequest` (même latence artificielle
 * que tous les autres services mockés du projet) pour rester compatibles
 * en forme avec un vrai appel réseau le jour où l'authentification réelle
 * existera — seul le contenu de ces deux fonctions changera alors.
 *
 * `isAuthenticated()` relit `localStorage` à chaque appel (jamais mis en
 * cache en mémoire) : un rechargement de page ne peut donc jamais
 * "ressusciter" une session déjà invalidée par `logout()`, et une session
 * active survit correctement à un rechargement.
 */
export const authService = {
  isAuthenticated: () => localStorage.getItem(SESSION_KEY) === 'active',
  login: () => mockRequest(() => { localStorage.setItem(SESSION_KEY, 'active'); return true; }),
  logout: () => mockRequest(() => { localStorage.removeItem(SESSION_KEY); return true; }),
};
