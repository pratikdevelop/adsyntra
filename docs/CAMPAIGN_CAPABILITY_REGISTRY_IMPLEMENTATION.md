# AdSyntra Campaign Capability Registry — Phase 1

**Source snapshot reviewed:** 25 November 2026  
**Registry version:** 1.0.0  
**Providers in scope:** Google Ads and Meta Ads

## Purpose

The registry is the central, read-only description of what the current AdSyntra source implements for each provider campaign type. It is deliberately separate from `frontend/src/app/dashboard/campaigns/new/campaign-capability-registry.ts`, which remains the creative asset/text requirement registry.

The registry does not create provider campaigns, perform account discovery, or replace Google Ads / Meta Marketing APIs. It also does not claim that a route that exists has been live-tested against a provider account.

## Implemented in Phase 1

- Backend capability types and provider definitions under `api/src/campaign-capabilities/`.
- Version-aware API response: Google Ads API defaults to `v26`; Meta Graph API defaults to `v26.0`. Valid environment overrides are reflected in the response.
- Authenticated Express read endpoints:
  - `GET /api/campaign-capabilities`
  - `GET /api/campaign-capabilities?provider=googleAds`
  - `GET /api/campaign-capabilities?provider=metaAds`
  - `GET /api/campaign-capabilities/:provider/:campaignType`
- Express router mounted in `api/src/server.ts`.
- Authenticated Next.js proxy endpoint at `frontend/src/app/api/campaign-capabilities/route.ts`.
- Frontend API helper and registry status summaries shown beside the selected Google campaign type and in the Meta provider section.
- API-level unit tests for the current provider/type status model.

## Source-audited status snapshot

| Provider type | Current source status for create | Reason |
|---|---|---|
| Google Search | Implemented in source | Global route dispatches the Search flow. |
| Google Display | Implemented in source | Global route dispatches the Display flow. |
| Google Performance Max | Implemented in source | Separate PMax workflow is connected in the global route. |
| Google Demand Gen | Not implemented | Ad helpers and form configuration exist, but complete campaign execution is not connected to the global route. |
| Google Shopping | Not implemented | Builder and Merchant Center lookup foundations exist; complete Shopping execution is not connected. |
| Google Hotel | Blocked by external prerequisite | Complete Hotel workflow is not connected; Hotel Center link/access is separate and must be verified. |
| Google App | Not implemented | Store identity validation is present; App Campaign execution is not connected. |
| Google Classic Video | Read/report only | Current builder explicitly labels the type read/report only; no campaign write workflow is connected. |
| Meta Campaign | Partial | Campaign → Ad Set → Creative → Ad orchestration exists, but the project backlog records the META-01 hard-coded existing-post fallback and incomplete video/carousel/catalog pipelines. |

General campaign list/read/rename/status/delete actions are represented separately from full provider-native configuration editing. A rename action is not equivalent to an editable campaign configuration flow.

## Important distinctions

1. `IMPLEMENTED_IN_SOURCE` means the relevant implementation path was found in this ZIP. It is not a claim of successful live provider execution.
2. `PARTIAL` means part of the feature exists but the end-to-end path has gaps or a known blocker.
3. `NOT_IMPLEMENTED` means a complete AdSyntra workflow was not found in the supplied source snapshot.
4. `BLOCKED_EXTERNAL` means an account, permission, provider link, website or other external prerequisite is needed in addition to the implementation gap.
5. `READ_ONLY` means the current product path is for reading/reporting, not creating.
6. Account eligibility, region, selected account, permissions, live API validation and provider policy remain runtime checks.

## Existing registry preserved

The existing frontend file:

`frontend/src/app/dashboard/campaigns/new/campaign-capability-registry.ts`

continues to define creative formats, media requirements and text limits. The new backend registry defines campaign-level operations, provider types, hierarchy, feature status, prerequisites and provider-specific option sets. These are intentionally separate registries with separate purposes.

## Current non-goals

- No campaign creation route is changed to reject or allow operations based on the registry yet.
- No existing campaign form option is removed or disabled in this phase.
- No provider API calls are made by registry endpoints.
- No database model or campaign persistence schema is changed.
- No account-specific capability or entitlement checks are performed yet.
- No migration execution is included.

## Validation

Run from `api/`:

```bash
npm run test:capabilities
npm run typecheck
```

The test covers provider names, the source-connected Google create types, known incomplete Google types, Hotel/Video status, Meta objectives and lookup behavior. Run the backend typecheck and frontend build in the actual development environment before merging into the active working tree.

## Next phase

Use the registry to drive the campaign wizard's live/preview gating and provider-specific options. The API must re-check operation eligibility before creating a campaign; frontend-only hiding is not sufficient. Add account-specific prerequisites (selected account, linked Merchant/Hotel Center, Page/Pixel, currency, region, permissions) separately from static campaign-type capabilities.
