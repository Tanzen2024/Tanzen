# TANZEN — P0 RBAC (sujets restants) : Décisions à valider par le Product Owner

**Statut : accompagne l'audit read-only `docs/P0_RBAC_REMAINING_AUDIT.md`.** D1/D2/D3 (RBAC, verrouillées par la mission précédente) ne sont pas rouvertes. Cette mission n'a identifié qu'**une seule** décision réellement nouvelle et non résolue par les sources existantes.

---

## D-RBAC-01 — `permissions.action` : étendre l'enum canonique ou décomposer `manage`/`revoke`/`download` ? *(non bloquant pour l'existant livré)*

**Problème** : la fiche canonique `permissions` (`docs/audit/excel_dictionary_dump.txt`, fiche #50) porte une contrainte explicite `ck_permissions_action = CHECK(action IN ('CREATE','READ','UPDATE','DELETE','APPROVE','EXPORT','IMPORT'))` — 7 valeurs. Le catalogue réellement construit dans `tanzen-frontend` (`mocks/rbac.mocks.ts`, `permissionCatalog`, 78 entrées, dupliqué à l'identique dans `tanzen-commercial`) utilise en réalité 9 suffixes d'action distincts : les 6 valeurs canoniques `read`/`create`/`update`/`delete`/`approve`/`export` (sous leur forme minuscule, différence de casse non significative), **plus 3 valeurs absentes de la contrainte canonique** — `manage` (12 permissions : `cycles.manage`, `draws.manage`, `workflows.manage`, `notifications.manage`, `mfa.manage`, `localization.manage`, `fiscalYears.manage`, `branding.manage`, `notificationSettings.manage`, `securityPolicies.manage`, `modules.manage`, `integrations.manage`), `revoke` (1 : `sessions.revoke`), `download` (1 : `documents.download`) — 13 permissions sur 78, soit 17 % du catalogue. La 7ᵉ valeur canonique, `IMPORT`, n'est utilisée par aucune permission du catalogue actuel.

**Sources** : `docs/audit/excel_dictionary_dump.txt` lignes 1267-1281 (fiche canonique, vérifiée par extraction directe, pas une citation de résumé de phase) ; `src/mocks/rbac.mocks.ts` (catalogue réel, vérifié par grep exhaustif). Ce point n'avait jamais été détecté par les audits RBAC précédents (`docs/P0_RBAC_AUDIT.md`, `docs/P0_RBAC_DECISION_ANALYSIS.md`), qui s'appuyaient sur des résumés de `PHASE_02_*` sans extraction directe de la fiche `permissions` elle-même.

**Analyse** : les 13 permissions concernées correspondent toutes à des actions déjà construites et fonctionnelles (gates réelles sur des boutons/écrans déjà livrés — `cycles.manage`, `sessions.revoke`, `documents.download`, etc., cf. `docs/P0_RBAC_AUDIT.md` §2.2). Ce n'est pas une fonctionnalité à retirer ni un défaut de code — le frontend n'impose de toute façon aucune contrainte `CHECK` lui-même (`Permission = string`, aucune validation de forme). Le risque est différé : le jour où un backend réel implémenterait littéralement la contrainte `ck_permissions_action` telle que documentée aujourd'hui, ces 13 permissions seraient rejetées à l'insertion — un vrai risque de rupture, mais uniquement au moment de la construction du backend, pas aujourd'hui.

**Deux lectures possibles, non tranchables par les sources actuelles** :
1. Le dictionnaire est **incomplet** — `manage`/`revoke`/`download` sont des actions métier légitimes et distinctes (gérer une politique globale, révoquer un accès, télécharger un document ne se ramènent pas proprement à `UPDATE`/`DELETE`/`READ`) qui auraient dû figurer dans la contrainte canonique dès l'origine, au même titre que les 7 déjà présentes.
2. Le code **a divergé** — ces 3 actions devraient, pour respecter strictement le dictionnaire, être redécomposées : `manage` → probablement `UPDATE` (ou une paire `CREATE`+`UPDATE` selon le cas) ; `revoke` → probablement `DELETE` ou `UPDATE` (révoquer une session ne supprime pas la session, il la marque `revoked` — plus proche d'`UPDATE`) ; `download` → probablement `READ` (téléchargement = consultation) ou `EXPORT` (déjà présent dans l'enum canonique, sémantiquement très proche).

Aucune des deux lectures n'est évidente sans arbitrage — inventer l'une ou l'autre reviendrait à trancher une question de modélisation RBAC sans preuve documentaire suffisante, ce que le mandat de cette mission interdit explicitement.

**Question à trancher** : `permissions.action` doit-il (a) voir son `CHECK` canonique étendu pour inclure `MANAGE`/`REVOKE`/`DOWNLOAD` (3 nouvelles valeurs, alignement du dictionnaire sur le code déjà construit) ; ou (b) le code doit-il, lors d'une future migration RBAC, redécomposer ces 13 permissions vers les 7 valeurs déjà canoniques (avec un risque de perte de granularité sémantique pour `manage`, qui couvre aujourd'hui des actions assez larges) ; ou (c) une troisième liste canonique, incluant certaines mais pas toutes les 3 valeurs actuelles (ex. `MANAGE` ajoutée mais `REVOKE`/`DOWNLOAD` redécomposées) ?

**Impact si non tranché** : aucun sur l'existant livré — les 13 permissions continuent de fonctionner exactement comme aujourd'hui, dans `tanzen-frontend` comme dans `tanzen-commercial`. L'impact se matérialiserait uniquement lors de la conception d'un vrai backend RBAC, où la contrainte `CHECK` devra être implémentée d'une manière ou d'une autre — reporter cette décision jusque-là est raisonnable, mais elle **devrait être tranchée avant, pas pendant**, la construction du backend, pour éviter une découverte tardive et coûteuse (rejet en insertion de 13 permissions déjà utilisées par des centaines d'appels `PermissionGate`/`can()` dans le code livré).

**Statut** : **DECISION REQUIRED, non bloquant** pour tout ce qui est déjà livré dans `tanzen-frontend`/`tanzen-commercial` — à trancher avant toute conception de backend RBAC réel.

---

## Points explicitement NON soumis à décision (sources suffisantes pour conclure)

Conformément à la consigne « ne pas demander une décision si les sources permettent déjà de conclure », les points suivants, bien qu'identifiés par l'audit, n'ont **pas** été transformés en décision :

- **CRUD Permissions dans `tanzen-frontend`** : tranché par les sources elles-mêmes (UC20-19-22, strictement Platform/Super Administrateur) — aucune ambiguïté, `docs/P0_RBAC_REMAINING_AUDIT.md` §3.3.
- **Matérialisation de `role_permissions`/`users_roles` comme entités propres** : les sources (aucun UC ne les demande comme sujet autonome) et l'analyse coûts/bénéfices (`docs/P0_RBAC_REMAINING_AUDIT.md` §4.3/§5.4) suffisent à conclure « conserver tel quel » sans arbitrage produit supplémentaire.
- **`roles.code`/`roles.is_system` absents du type frontend** (C-RBAC-10) : signalé comme contexte, mais `roles` est explicitement hors périmètre de re-décision dans cette mission (« roles pris en compte comme contexte » — le mandat ne demande pas de le rouvrir) ; si le Product Owner souhaite le traiter, cela relèverait d'une mission dédiée à `roles`, pas de celle-ci.
- **Garde anti-élévation service-side manquante** (C-RBAC-12, `role.scope` non vérifié par `rolesBelongToTenant`) : ce n'est pas une question à choix multiples nécessitant un arbitrage produit — la réponse est évidente en soi (le service devrait répliquer la garde déjà appliquée par l'UI, exactement comme il le fait déjà pour le tenant) ; c'est un **travail d'implémentation non fait**, pas une décision en suspens. Documenté comme risque de sécurité (`docs/P0_RBAC_REMAINING_AUDIT.md` §20), pas comme décision.

---

## Synthèse

**1 décision nouvelle** (D-RBAC-01 — `permissions.action`, non bloquante pour l'existant, à trancher avant tout backend RBAC réel). Aucune autre décision n'a été jugée nécessaire : les questions restantes identifiées par l'audit (`role_permissions`/`users_roles` matérialisation, CRUD Permissions) sont déjà tranchées par les sources disponibles, et le seul autre constat notable (garde anti-élévation) est un gap d'implémentation, pas un choix à arbitrer.

Si aucune décision n'était nécessaire, ce document l'aurait déclaré explicitement — ce n'est pas le cas ici : **une décision réelle (D-RBAC-01) a été identifiée et documentée ci-dessus.**

---

*Fin du document. Aucun fichier sous `src/`, `app/`, `tests/`, `mocks/`, `locales/` n'a été modifié.*
