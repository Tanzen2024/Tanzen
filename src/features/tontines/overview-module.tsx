/**
 * Page d'entrée du module Tontines (mandat « simplification du menu Tontine ») —
 * ne conserve que les 2 onglets qui correspondent à un workflow métier réel :
 * « Tontines » (liste + création, `TontinesTableSection`) et « Opérations »
 * (`TontineOperationsManage`, même composant que la route autonome
 * `/tontines/operations`, aucun doublon). Les anciens onglets « Vue d'ensemble »,
 * « Contributions » et « Membres » (agrégations lecture seule toutes tontines
 * confondues) ont été retirés : leurs KPI/listes n'apportaient aucune action
 * absente d'« Opérations » (cotisations, participation individuelle/globale,
 * statut payé/non payé) ou d'« Adhésions » (liste des adhérents par période,
 * `adhesions-module.tsx`), qui restent le point d'entrée officiel pour ces
 * fonctionnalités.
 * Mandat « suppression de l'écran Contribution » (postérieur) : l'écran
 * indépendant `/tontines/:id/contributions` (liste/création/détail) a depuis
 * été supprimé — les cotisations se gèrent désormais exclusivement depuis
 * « Opérations ». `ContributionTable` (`contributions-module.tsx`) reste
 * utilisé en lecture seule par les fiches Adhésion/Occurrence, et les
 * lectures agrégées (`listAllAdhesions` etc.) restent dans
 * `tontineTurnsService` pour les autres écrans qui les utilisent encore (ex.
 * `PeriodAdhesionDetail`).
 */
import { useState } from 'react';
import { PageHeader } from '@/components';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TontinesTableSection } from './tontines-module';
import { TontineOperationsManage } from './tontine-operations-module';

type T = (section: 'tontines' | 'nav', key: string, values?: Record<string, string>) => string;

export function TontinesOverview({ t }: { t: T }) {
  const [tab, setTab] = useState('tontines');

  return <div className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7">
    <PageHeader eyebrow="TONTINES" title={t('tontines', 'tontinesTitle')} description={t('tontines', 'tontinesOverviewSubtitle')} />
    <Tabs value={tab} onValueChange={setTab} className="min-w-0">
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1">
        <TabsTrigger value="tontines">{t('tontines', 'tontines')}</TabsTrigger>
        <TabsTrigger value="operations">{t('tontines', 'operationsTab')}</TabsTrigger>
      </TabsList>
      <TabsContent value="tontines"><TontinesTableSection t={t} /></TabsContent>
      <TabsContent value="operations"><TontineOperationsManage t={t} embedded /></TabsContent>
    </Tabs>
  </div>;
}
