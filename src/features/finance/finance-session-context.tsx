import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTenant } from '@/contexts/tenant-context';
import { useFiscalYear } from '@/contexts/fiscal-year-context';
import { fiscalSessionService, latestSession } from '@/services/fiscal-session.service';
import { queryKeys } from '@/services/query-keys';
import type { FiscalSession } from '@/mocks/settings/fiscal-sessions';

/**
 * CONTEXTE FINANCE — séance courante (mandat « Évolution globale du module
 * Finance » §4-§8). Hiérarchie : Tenant → Exercice fiscal (contexte global
 * `useFiscalYear`, source de vérité inchangée) → Séance → Caisses / Transactions.
 *
 * La séance n'appartient à AUCUNE caisse : c'est un contexte unique, partagé par
 * l'onglet Transactions, la fiche caisse et les formulaires de création. Elle
 * joue deux rôles : filtre des données ET séance de rattachement de toute
 * nouvelle transaction (`sessionId`).
 *
 * `ALL_SESSIONS` (« Toutes les séances ») est un filtre de CONSULTATION
 * uniquement — jamais une séance valide pour une écriture (`currentSession`
 * vaut alors `undefined`, et les formulaires bloquent la création).
 *
 * Séances = `FiscalSession` de l'exercice courant, via `fiscalSessionService`
 * (aucun second système de séances).
 *
 * Sélection par défaut, à l'ouverture de Finance : la séance la plus RÉCENTE
 * (vraie date de séance, cf. `latestSession`) de l'exercice courant du tenant
 * courant — jamais la date du jour, jamais un choix mémorisé d'une visite
 * précédente (sinon une séance nouvellement créée dans Paramètres → Exercices
 * fiscaux ne serait pas proposée). Aucune séance → « Toutes les séances ».
 * Tant que les séances chargent, rien n'est figé : la sélection est dérivée et
 * bascule sur la plus récente dès leur arrivée.
 *
 * Un choix explicite de l'utilisateur est conservé en mémoire, par tenant +
 * exercice, tant que le module Finance reste monté (navigation entre onglets,
 * caisses, saisie rapide) — jamais écrasé par la règle par défaut. Un
 * changement d'exercice change la clé : la séance d'un autre exercice n'est
 * donc jamais réutilisée.
 *
 * Séance IMPOSÉE par l'URL (`?sessionId=`, ex. clic sur une séance dans
 * Paramètres → Exercices fiscaux, cf. `sessionTransactionsPath`) : elle PRIME
 * sur la règle « séance la plus récente », exactement comme un choix explicite.
 * Elle est résolue via `fiscalSessionService.getSession` (tenant-scopé : un id
 * d'un autre tenant ne résout rien et le paramètre est retiré) ; si elle
 * appartient à un autre exercice que l'exercice courant, l'exercice global
 * bascule sur le sien. Tant qu'elle n'est pas résolue, la sélection reste sur
 * l'id demandé — jamais de bascule transitoire vers la dernière séance. Un
 * changement manuel du filtre met ensuite le paramètre à jour (refresh/partage).
 */
export const ALL_SESSIONS = 'all';
export const SESSION_PARAM = 'sessionId';

/** Onglet Trésorerie → Transactions avec le filtre « Date de séance » positionné sur `sessionId` (aucune route dédiée aux séances). */
export const sessionTransactionsPath = (sessionId: string) => `/finance/treasury/transactions?${SESSION_PARAM}=${encodeURIComponent(sessionId)}`;

type FinanceSessionContextValue = {
  /** Séances de l'exercice courant, dans l'ordre chronologique (numéro croissant). */
  sessions: FiscalSession[];
  /** `ALL_SESSIONS` ou l'id d'une séance de l'exercice courant. */
  selection: string;
  /** Séance précise sélectionnée — `undefined` pour « Toutes les séances » (aucune écriture possible). */
  currentSession: FiscalSession | undefined;
  selectSession: (selection: string) => void;
  hasSessions: boolean;
  isLoading: boolean;
  /** Séance imposée par l'URL en cours de résolution (ou exercice en cours de bascule) — les listes attendent au lieu d'afficher un périmètre transitoire. */
  isApplyingRequestedSession: boolean;
};

const FinanceSessionContext = createContext<FinanceSessionContextValue | null>(null);

const selectionKey = (tenantId: string, fiscalYearId: string) => `${tenantId}.${fiscalYearId}`;

export function FinanceSessionProvider({ children }: { children: ReactNode }) {
  const { currentTenant } = useTenant();
  const { currentFiscalYear, fiscalYears, selectFiscalYear } = useFiscalYear();
  const fiscalYearId = currentFiscalYear?.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedId = searchParams.get(SESSION_PARAM) ?? '';
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: queryKeys.finance.sessions.list(currentTenant.id, fiscalYearId),
    queryFn: () => fiscalSessionService.listSessions(currentTenant.id, fiscalYearId as string),
    enabled: Boolean(fiscalYearId),
  });
  /** Résolution tenant-scopée de la séance imposée par l'URL (jamais de confiance dans l'id brut). */
  const requested = useQuery({
    queryKey: queryKeys.finance.sessions.detail(currentTenant.id, requestedId),
    queryFn: () => fiscalSessionService.getSession(currentTenant.id, requestedId),
    enabled: Boolean(requestedId) && requestedId !== ALL_SESSIONS,
  });
  const requestedSession = requested.data ?? undefined;
  const key = fiscalYearId ? selectionKey(currentTenant.id, fiscalYearId) : '';
  /** Choix explicites faits pendant l'utilisation du module, par tenant + exercice. */
  const [chosen, setChosen] = useState<Record<string, string>>({});

  // Id inconnu pour CE tenant (autre tenant, supprimé, falsifié) : paramètre retiré, comportement par défaut.
  useEffect(() => {
    if (!requestedId || requestedId === ALL_SESSIONS || !requested.isSuccess || requestedSession) return;
    setSearchParams((current) => { const params = new URLSearchParams(current); params.delete(SESSION_PARAM); return params; }, { replace: true });
  }, [requestedId, requested.isSuccess, requestedSession, setSearchParams]);
  // Séance d'un autre exercice du tenant : l'exercice global bascule sur le sien (changement de VUE uniquement).
  useEffect(() => {
    if (requestedSession && fiscalYearId && requestedSession.fiscalYearId !== fiscalYearId && fiscalYears.some((year) => year.id === requestedSession.fiscalYearId)) selectFiscalYear(requestedSession.fiscalYearId);
  }, [requestedSession, fiscalYearId, fiscalYears, selectFiscalYear]);
  // Séance imposée = choix explicite : il survit à la sortie de l'URL (changement d'onglet, caisse…).
  useEffect(() => {
    if (!key) return;
    const next = requestedId === ALL_SESSIONS ? ALL_SESSIONS : requestedSession && requestedSession.fiscalYearId === fiscalYearId ? requestedSession.id : undefined;
    if (next) setChosen((current) => (current[key] === next ? current : { ...current, [key]: next }));
  }, [key, requestedId, requestedSession, fiscalYearId]);

  /** Séance imposée par l'URL, en attente de résolution ou valide — prioritaire sur toute règle par défaut. */
  const pendingRequest = Boolean(requestedId) && requestedId !== ALL_SESSIONS && (requested.isLoading || (requestedSession !== undefined && requestedSession.fiscalYearId !== fiscalYearId));
  const raw = requestedId === ALL_SESSIONS || (requestedSession && requestedSession.fiscalYearId === fiscalYearId) ? requestedId : key ? chosen[key] : undefined;
  const latest = latestSession(sessions);
  // Séance imposée, puis choix explicite encore valide pour CET exercice, sinon séance la plus récente, sinon toutes.
  const selection = pendingRequest ? requestedId
    : raw === ALL_SESSIONS || (raw && sessions.some((session) => session.id === raw)) ? raw : (latest?.id ?? ALL_SESSIONS);
  const currentSession = selection === ALL_SESSIONS ? undefined : sessions.find((session) => session.id === selection);

  const selectSession = useCallback((next: string) => {
    if (!key) return;
    setChosen((current) => ({ ...current, [key]: next }));
    // Arrivé avec une séance dans l'URL : le paramètre suit le choix manuel (refresh / partage conservent la séance).
    if (requestedId) setSearchParams((current) => { const params = new URLSearchParams(current); params.set(SESSION_PARAM, next); return params; }, { replace: true });
  }, [key, requestedId, setSearchParams]);

  const value = useMemo<FinanceSessionContextValue>(() => ({
    sessions, selection, currentSession, selectSession, hasSessions: sessions.length > 0, isLoading: !fiscalYearId || isLoading, isApplyingRequestedSession: pendingRequest,
  }), [sessions, selection, currentSession, selectSession, fiscalYearId, isLoading, pendingRequest]);

  return <FinanceSessionContext.Provider value={value}>{children}</FinanceSessionContext.Provider>;
}

export function useFinanceSession() {
  const context = useContext(FinanceSessionContext);
  if (!context) throw new Error('useFinanceSession must be used inside FinanceSessionProvider');
  return context;
}
