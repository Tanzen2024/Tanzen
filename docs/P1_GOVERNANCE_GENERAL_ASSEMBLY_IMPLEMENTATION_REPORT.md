# P1 GOVERNANCE — GeneralAssembly implementation report

## 1. Mandate

Implement the `GeneralAssembly` autonomous entity for Create and Read in
`tanzen-frontend`. A tenant-scoped list is included because it follows the
existing service, query, table, and navigation patterns and is necessary to
reach a detail record.

## 2. Sources consulted

- `docs/audit/excel_dictionary_dump.txt`, canonical table #39
  `general_assemblies`.
- Existing tenant-scope, RBAC, query-key, mock-service, routing, i18n, and
  organization-module patterns.
- The existing GeneralAssembly implementation files and service tests.

The requested historical `MOBILE_PHASE_04C4_*` documents are not present in
this repository. The canonical dictionary was used as the authority.

## 3. Decisions applied

- Status values are exclusively `PLANNED`, `ONGOING`, `COMPLETED`, and
  `CANCELLED`.
- `GeneralAssembly` is autonomous and is not a `Meeting` subtype.
- Creation defaults to the canonical `PLANNED` status; the form does not
  expose a status selector because no status transition is in scope.

## 4. Canonical model used

The frontend business representation persists `id`, `tenantId`, `title`,
`assemblyDate`, `description`, and `status`. Technical fields (`uuid`, audit
columns) follow the established local-mock convention and are backend pending.
There is no Meeting foreign key and no quorum, decision, or vote field.

## 5. Create

The creation screen validates title and assembly date, derives the tenant
from `TenantContext`, creates through `generalAssemblyService`, reports a
success or rejection notification, and navigates to the detail screen. The
tenant is never a form field.

## 6. Read

The detail screen displays only the persisted title, assembly date,
description, and status. A missing or cross-tenant record is shown as not
found. There are no Quorum, Decision, or Vote sections.

## 7. List

The tenant-scoped list links to detail records. It intentionally has no
search, filter, sort, or pagination, as none was justified for this scope.

## 8. Service

`generalAssemblyService` provides only `createGeneralAssembly`,
`getGeneralAssembly`, and `listGeneralAssemblies`. It enforces required title
and date and the canonical `(tenant_id, title, assembly_date)` uniqueness
constraint in local mocks.

## 9. Tenant isolation

All service calls use the current tenant ID. `getTenantScoped` rejects a
cross-tenant detail read, and list filtering returns records only from the
requesting tenant.

## 10. RBAC

Existing `governance.read` guards list and detail routes. Existing
`governance.create` guards the creation route and action. No permission was
added.

## 11. Routes

- `/organization/governance/general-assemblies`
- `/organization/governance/general-assemblies/create`
- `/organization/governance/general-assemblies/:id`

No edit, delete, close, cancel, quorum, decision, or vote route exists.

## 12. Navigation

The Governance navigation includes General Assemblies, following the existing
organization governance hierarchy.

## 13. i18n

English and French labels, statuses, validation feedback, and notifications
are available under the existing `organization` locale namespace.

## 14. Tests

`src/services/general-assembly.service.test.ts` covers successful creation,
validation failures, duplicate handling, read, invalid ID, tenant list
isolation, and explicit cross-tenant detail denial. Existing route guards use
the shared `PermissionRoute` mechanism with `governance.read` and
`governance.create`.

## 15–17. Typecheck, lint, build

Completed successfully: `npm run typecheck`, the targeted
`npm test -- general-assembly.service.test.ts` (13 tests), and
`npm run i18n:check`. `npm run lint` completed with 14 pre-existing Fast
Refresh warnings and no errors. `npm run build` and a direct `vite build`
both exceeded the execution environment's two-minute limit while Vite was
transforming modules; neither emitted a compilation error.

## 18. Backend pending

This uses the project’s local mock service. Real persistence, server-side
validation, server RBAC, and server tenant isolation remain `BACKEND_PENDING`.

## 19. Out of scope

`QuorumSnapshot`, `AssemblyDecision`, `Vote`, `VoteOption`, `MemberVote`,
Update, Delete, Close, and Cancel are not implemented for GeneralAssembly.

## 20–21. Files

Created: this report, `general-assemblies` mock data, and the dedicated
GeneralAssembly service and service tests. Modified integration files cover
the organization module, query keys, navigation, locale dictionaries, and
organization mock exports.

## 22. Mobile and Commercial verification

No file outside `tanzen-frontend` was modified.

## 23. Git

No commit and no push were made. The worktree contained unrelated pre-existing
changes; they were preserved.

## 24. Final result

P1 GOVERNANCE — GENERALASSEMBLY implementation is complete in the frontend
mock layer, with backend integration pending.
