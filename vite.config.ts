import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    /**
     * CAUSE RACINE des échecs intermittents `transaction-create` /
     * `transaction-meeting` / `transaction-repayment` (et, sous forte charge,
     * de quelques tests tontine) : la SUR-SOUSCRIPTION du pool de forks Vitest.
     *
     * Par défaut Vitest lance ~1 fork par cœur (≈ 11 sur cette machine 12
     * cœurs). Ces suites sont des tests d'INTÉGRATION lourds (arbre de
     * providers complet + routeur + React Query + userEvent + navigation →
     * refetch). À 45+ fichiers concurrents, chaque fork est privé
     * d'ordonnancement par rafales ; or React Query planifie chaque
     * notification d'abonné (« requête résolue → re-render ») via
     * `setTimeout(cb, 0)` — une macro-tâche. Diagnostic (logs sur la queryFn) :
     * la queryFn de la fiche détail était appelée ET résolvait avec la bonne
     * donnée, mais le composant restait bloqué sur `fetchStatus: 'fetching'`
     * car le `setTimeout(0)` de notification ne repassait pas avant le délai
     * de `findBy*`. Ce N'EST PAS une mutation d'état partagée entre tests
     * (isolation des modules vérifiée ; la queryFn renvoie la bonne donnée).
     *
     * Borner le pool laisse un vrai parallélisme (plusieurs fichiers de test
     * s'exécutent bien en même temps — le pool n'est pas désactivé) tout en
     * garantissant que chaque fork obtient réellement du CPU. Seuil observé sur
     * cette machine 12 cœurs : vert et stable à 4 forks sur des dizaines
     * d'exécutions consécutives et quel que soit l'ordre ; intermittent à 6,
     * rouge au défaut (~11). `VITE_MOCK_API_DELAY=0` (ci-dessous) réduit en plus
     * la fenêtre de vulnérabilité en supprimant la latence mock artificielle,
     * inutile en test (aucun test n'affirme un état de chargement).
     *
     * NB CI : si la machine cible a beaucoup moins ou beaucoup plus de cœurs,
     * ajuster cette valeur (un pool 2–3× plus large que le nombre de cœurs
     * réels ré-introduit la famine d'ordonnancement).
     */
    maxWorkers: 4,
    env: { VITE_MOCK_API_DELAY: '0' },
    /**
     * Filet de sécurité pour la GIGUE D'ORDONNANCEMENT résiduelle — pas pour
     * masquer un bug. Les diagnostics l'ont établi : sur les cas
     * `soumettre → naviguer → fiche détail`, la `queryFn` est appelée et
     * résout avec la bonne donnée ; l'assertion est correcte ; seule la
     * notification `setTimeout(0)` de React Query peut arriver hors délai
     * quand l'OS prive le fork de CPU (machine partagée, pics de charge
     * externes). Ces échecs ne sont jamais reproductibles à l'identique et ne
     * révèlent aucune régression produit (le même test passe systématiquement
     * isolé). `retry` relance alors le cas ; un vrai bug, lui, échoue les 3
     * tentatives. Ne dispense pas d'analyser tout test qui devient
     * durablement rouge.
     */
    retry: 2,
  },
});
