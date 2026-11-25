# AdSyntra — Pending Features & Implementation Gaps

**Audit date:** 24 November 2026  
**Audit basis:** `AdSyntra-project(1).zip` supplied in this conversation  
**Scope:** Existing frontend, backend routes/services, campaign creation wizard, project notes and included research documents.  
**Purpose:** Keep a reliable list of what is complete, what exists only partially, what is not implemented, and what should receive priority later. This is a source-code audit, not a live API certification.

---

## 1. Executive summary

The current project is more advanced than the October and November 20 research notes describe. The current ZIP contains a combined Next.js + Express application, per-user provider connections, encrypted provider credentials, MongoDB persistence, provider lookup routes, campaign creation, asset management, conversion management, billing, audience screens and reporting foundations.

The main risk is no longer simply “missing modules”. Several screens expose more functionality than the live provider execution path can safely deliver. The most important examples are:

1. **Meta Ad Creative has a hard-coded existing-post fallback.** In `api/src/metaadsAPI/services/campaign-creation.ts`, the creative service assigns an existing Page post ID when the request does not provide one. This makes the normal new-creative path unreachable by default. Fix this before relying on live Meta creative creation.
2. **Google's global campaign creation route only dispatches Search, Display and Performance Max.** Other visible or partially prepared campaign types are rejected by the global execution route. Some lower-level Demand Gen helpers exist, but that is not a complete campaign workflow.
3. **Google Proximity Radius Targeting is not present in the current source.** Pass 4.1A and 4.1B are present; Pass 4.1C remains pending.
4. **Meta Catalog and Product Set lookup routes exist in the backend, but the Campaign Creation page does not yet call them.** The selector workflow is therefore incomplete.
5. **Meta video and carousel controls are visible in the form, but the current Meta Ad Creative service only models an image/link creative or an existing post.** Video, carousel and catalog creative execution need complete provider-native workflows or must be disabled for live submission until implemented.
6. **Automated tests are absent from the supplied source snapshot.** No `*.test.*` / `*.spec.*` files were found, and neither package has a test script.
7. **Google Ads API versions are inconsistent across code paths.** The shared utility hard-codes v25 while the newer campaign-creation service defaults to v26.

The immediate agreed next feature can still be **Pass 4.1C — Google Proximity Radius Targeting**. The Meta creative blocker is a separate high-priority item and does not prevent continuing the Google targeting work.

> **Document status: DRAFT FOR SENIOR REVIEW**  
> The implementation findings below are based on a static review of the supplied project ZIP. The proposed priorities and implementation order are recommendations for discussion, not approved commitments. Please validate them against the product's MVP goals, business impact, engineering risk, provider constraints and release plans before work is scheduled.

## Senior review brief

### What this review is for

Please review the current implementation audit and advise whether the identified gaps, priorities and next steps are correct. The aim is to make sure the team works on the highest-value and highest-risk items first, without spending time rebuilding features that already work or exposing incomplete provider workflows as production-ready.

### Requested review

1. **Validate the findings:** Confirm whether each item is genuinely missing, partially implemented, already complete, or blocked by an external dependency. Flag any conclusion that needs a runtime test or more evidence.
2. **Reassess priority:** Keep, raise or lower the proposed P0/P1/P2 priority. Identify anything that must be completed before an internal demo, MVP, beta or production release.
3. **Review sequencing and dependencies:** Confirm whether Pass 4.1C should remain the next implementation pass, or whether a higher-risk blocker should come first. Identify work that can proceed in parallel.
4. **Review product scope:** Recommend what should be included in the MVP, what can remain preview-only, and what should be deferred or removed from the current scope.
5. **Review acceptance criteria and QA:** Add missing edge cases, provider restrictions, security checks, test coverage or acceptance criteria before an item is marked complete.
6. **Add missing gaps:** Note any important feature, architecture, UX, operational or security issue not captured in this audit.

### Priority definitions for review

These definitions are proposed to make the priority labels consistent. Please amend them if the team uses a different scale.

| Priority | Proposed meaning | Typical treatment |
|---|---|---|
| **P0 — Critical** | Security exposure, incorrect/unsafe live behaviour, data integrity risk, or a blocker that makes a promised core workflow unreliable. | Fix before the affected workflow is used externally; security issues before production exposure. |
| **P1 — High** | Important MVP/core workflow gap, provider integration gap, or significant reliability issue. | Schedule in the near-term implementation plan; may block release of the relevant feature. |
| **P2 — Medium** | Valuable enhancement or broader lifecycle capability that is not required for the immediate core workflow. | Schedule after core flows are reliable, unless product goals justify raising it. |
| **P3 — Later / Deferred** | Future scope, advanced capability or item intentionally outside the current MVP. | Keep documented; do not pull into the current pass without an explicit scope decision. |

**Important:** P0/P1 should be judged against the intended release stage. An item may be a P0 production-security requirement but not block a local prototype demo. Please specify the release gate when changing a priority.

### Senior review decision matrix

Please fill the last three columns. Suggested decisions: **Keep**, **Raise**, **Lower**, **Split**, **Merge**, **Defer**, **Out of scope**, or **Needs more evidence**.

| ID / area | Current proposed priority | Senior decision / revised priority | Release gate (Demo / MVP / Beta / Production) | Comments, dependencies or evidence needed |
|---|---:|---|---|---|
| Pass 4.1C — Google Proximity Radius Targeting | P1 — next agreed pass |  |  |  |
| META-01 — Remove hard-coded existing Page post fallback | P0 |  |  |  |
| META-02 — Align Meta creative UI with supported backend formats | P0/P1 |  |  |  |
| GOOGLE-01 — Complete or gate unsupported Google campaign types | P1 |  |  |  |
| GOOGLE-02 — Complete Google targeting coverage | P1 |  |  |  |
| META-03 — Connect Catalog / Product Set selectors | P1 |  |  |  |
| META-04 — Versioned Meta placements and Advantage+ controls | P1 |  |  |  |
| META-05 — Advanced audience workflows | P2 |  |  |  |
| CONV-01 — Conversion event delivery and diagnostics | P1/P2 |  |  |  |
| ASSET-01 — Provider-specific media pipelines | P1 |  |  |  |
| AI-01 — Video creative generation | P2 |  |  |  |
| ADS-01 — Ad-level management actions | P1/P2 |  |  |  |
| DATA-01 — Cross-provider reporting accuracy | P1 |  |  |  |
| BILL-01 — Billing account-matrix QA | P2 |  |  |  |
| QA-01 — Automated tests and provider contract checks | P0/P1 |  |  |  |
| QA-02 — Idempotency and provider-state reconciliation | P1 |  |  |  |
| API-01 — Central provider API version policy | P1 |  |  |  |
| SEC-01 — Production safety and ZIP hygiene | P0 before external exposure |  |  |  |

### Overall recommendation from reviewer

**Recommended next implementation pass:**  

**Top 3 priorities and why:**  
1.  
2.  
3.  

**Items to defer or remove from the MVP:**  

**New gaps / risks to add:**  

**Release blockers (specify Demo / MVP / Beta / Production):**  

**Reviewer:**  

**Review date:**  

**Overall decision:** Approve current order / Approve with changes / Rework the roadmap

---

## How to use the senior review

- Share this review copy with your senior along with the project context and, where appropriate, access to the repository. The Markdown audit alone is not a substitute for their own code review or runtime validation.
- Ask them to annotate the decision matrix and the overall recommendation section. They can also comment directly in the relevant feature sections.
- Treat all current priorities as **proposed** until the senior review is complete.
- When the review comes back, consolidate the feedback into the main backlog. Record the final decision, reason, owner and target milestone for each changed priority.
- Do not mark an item complete based only on a review comment; retain the existing evidence and testing rule in Section 9.

---

## 2. Status definitions

- **DONE / USER CONFIRMED** — the user previously tested or explicitly confirmed the feature.
- **IMPLEMENTED IN SOURCE** — relevant frontend/backend code is present; this does not prove every account, permission or live API response works.
- **PARTIAL** — some layers exist, but the whole user-to-provider workflow is not connected or complete.
- **NOT IMPLEMENTED** — no complete implementation was found in the current source snapshot.
- **BLOCKED / EXTERNAL PREREQUISITE** — code may exist, but a provider account, website verification, allowlisting or permission is still required.
- **NEEDS RUNTIME VERIFICATION** — source exists, but the ZIP audit did not run the application, typecheck, build or live provider calls.

A lookup route returning an empty list is not proof that the provider resource does not exist; it may also mean permissions, account context, pagination or provider-side access is missing.

---

## 3. Completed or already present — do not rebuild without a reason

### 3.1 Campaign creation and provider connections

| Area | Current status | Notes |
|---|---|---|
| Google Ads OAuth and account discovery | IMPLEMENTED IN SOURCE | OAuth routes, account discovery and account selection are present. |
| Meta OAuth and Ad Account discovery | IMPLEMENTED IN SOURCE | OAuth routes, account discovery and permission-related code are present. |
| User-level provider connection storage | IMPLEMENTED IN SOURCE | Provider connections are associated with the application user; the provider-connection model stores encrypted token envelopes. This is not organization/workspace tenancy. |
| Common campaign brief + provider-specific configuration | IMPLEMENTED IN SOURCE | Campaign request keeps separate Google and Meta configuration objects. |
| Campaign persistence | IMPLEMENTED IN SOURCE | Campaign model and create/list/details/update-related routes are present. |
| Campaign-level rename/status/delete/retry paths | IMPLEMENTED IN SOURCE | Campaign endpoints include rename, status, delete and retry/resume-related handlers. Each action still needs end-to-end regression tests. |
| Google Search, Display and Performance Max execution | IMPLEMENTED IN SOURCE | These are the only three campaign types currently dispatched by the global Google campaign creation route. |
| Meta Campaign → Ad Set → Creative → Ad orchestration | PARTIAL | The orchestration exists, but the current creative implementation has the blocker described in Section 4.1. |

### 3.2 Pass 2 — Meta account-owned resources

The current Campaign Creation page and backend route family contain dynamic discovery for these resources:

- Facebook Pages and linked Instagram identity.
- Pixel / Dataset and event lookup.
- Meta Custom Conversions.
- Page-owned Instant Forms.
- Messaging destinations.
- Advertisable application lookup.
- Custom Audience and Saved Audience lists.

These were also tested in earlier work discussions. Keep them as existing functionality and focus future work on regression testing, account-change invalidation, pagination and eligibility checks—not rebuilding the selectors from scratch.

### 3.3 Pass 3 — commerce and app identity

| Feature | Current status | Notes |
|---|---|---|
| Google Merchant Center link discovery | DONE / IMPLEMENTED IN SOURCE | The current wizard calls linked Merchant Center, data-source, feed-label and product lookup endpoints. |
| Merchant Center feed/product discovery | BLOCKED / EXTERNAL PREREQUISITE | The previous live attempt encountered `HOMEPAGE_NOT_VERIFIED` during Merchant API developer registration. Complete website verification and registration, then retest data-source/feed/product discovery. |
| Hotel Center link discovery | IMPLEMENTED IN SOURCE, ACCOUNT NOT LINKED | Link lookup is present. The selected user's Google account did not have a Hotel Center account linked in earlier testing. Do not allow a live Hotel campaign until a valid link and required access are confirmed. |
| Google App Store identity validation | DONE / USER CONFIRMED | Android package / Play URL and iOS App Store ID / URL normalization and store-specific validation were completed. This is identity validation only; it does not mean App Campaign execution is implemented. |
| Meta Catalog / Product Set discovery | PARTIAL | Backend catalog and Product Set routes exist in `campaign.routes.ts`. The Campaign Creation page has no matching catalog/Product Set lookup call or connected selector in this ZIP. |

### 3.4 Pass 4.1 — geographic targeting

| Pass | Status | Notes |
|---|---|---|
| 4.1A — Meta location exclusions | DONE / USER CONFIRMED | Include/exclude location handling and excluded geography are present in the current wizard. |
| 4.1B — Google location exclusions | DONE / USER CONFIRMED | Google location targets carry `negative` flags; Search, Display and Performance Max payload paths include structured location targets. |
| 4.1C — Google Proximity Radius Targeting | NOT IMPLEMENTED | No Google proximity/radius fields, input types, UI state, route mapping or `ProximityInfo` mutation construction were found in the supplied project source. |

### 3.5 Other existing modules

| Module | Current status | What is present |
|---|---|---|
| Asset Library | IMPLEMENTED IN SOURCE | Local image/video/text assets, listing, preview/content retrieval, review, update and delete routes; provider asset listing routes also exist. |
| AI Creative | PARTIAL | Copy and image-generation foundations exist. Video generation is explicitly rejected by the AI creative service as not available yet. |
| Audiences | PARTIAL | Audience overview plus Google User List/reusable audience creation and Meta website Custom Audience creation are present. Broader lifecycle/Lookalike workflows are not complete. |
| Conversions | IMPLEMENTED IN SOURCE, NEEDS END-TO-END QA | Google Conversion Action create/status paths; Meta Pixel website verification and Custom Conversion create/update/delete paths; campaign wizard selectors for Google and Meta measurement resources. |
| Billing | IMPLEMENTED IN SOURCE, NEEDS ACCOUNT-MATRIX QA | Billing overview, Google/Meta invoice download routes, Meta billing activity route and a substantial Billing UI are present. Payment-method changes and direct payment processing are intentionally not part of the provider API workflow. |
| Dashboard / reporting | IMPLEMENTED IN SOURCE, NEEDS DATA-ACCURACY QA | Overview and provider reporting foundations exist. Cross-provider metric parity, currency/time-zone handling and freshness need comparison against both native ad platforms. |
| Ads view | PARTIAL | The Ads route family currently exposes read/list operations for Google and Meta ads, ad groups/ad sets and related resources. Dedicated ad-level write actions are not exposed in `ads.routes.ts`. |

---

## 4. Confirmed gaps and incomplete implementation areas

## 4.1 Critical — fix before trusting live Meta creative creation

### META-01 — Remove the hard-coded existing Page post fallback

**Status:** CONFIRMED DEFECT IN SOURCE  
**Priority:** P0 — live-creation blocker  
**Evidence:** `api/src/metaadsAPI/services/campaign-creation.ts`, inside `createMetaAdsAdCreative` (around the existing-post selection logic).

The service sets an existing-post ID when `input.existingPostId` is empty. Because that value is always non-empty after the fallback, the service takes the `object_story_id` existing-post branch instead of building a new `object_story_spec` image/link creative.

**Required work:**

- Make existing-post mode explicitly opt-in; never inject a demo post ID.
- When no existing post is selected, validate the selected Page, image hash or supported image URL, destination URL, text, headline and CTA, then create a new creative.
- Ensure any selected existing post belongs to the selected Page and is user-authorized.
- Add a test proving that an ordinary new-image request creates a new `object_story_spec` rather than referencing an existing post.
- Remove any test/demo resource IDs from live defaults and reject them server-side.

**Acceptance criteria:** A new image ad can complete validate-only and confirmed live creation using the selected account/Page and newly uploaded image; an existing-post ad works only when the user deliberately selects a valid post.

### META-02 — Make the creative UI match the real backend capability

**Status:** PARTIAL  
**Priority:** P0/P1  
**Evidence:** The frontend exposes Single Image, Single Video and Carousel choices; `CreateMetaAdsAdCreativeInput` currently models image hash/URL, text, Page identity and destination URL, while `createMetaAdsAdCreative` builds a link-based image creative or an existing-post creative.

The current Meta creative service does not accept a video ID, carousel card collection or catalog Product Set structure. The UI therefore offers formats which do not have a matching complete provider-native execution contract.

**Required work:**

- Complete single-image creation and uploaded image-hash attachment first.
- Implement Meta video upload, processing-status polling and `video_data` creative creation.
- Implement ordered carousel child attachments with card-level media, headline, destination and CTA validation.
- Implement catalog/dynamic product creative using a selected Catalog and Product Set, with the correct promoted object / creative structure.
- Keep existing Page-post creation as a separate explicit mode.
- Until each format is implemented and tested, mark it preview-only or block it from live submission with a clear message.

**Acceptance criteria:** Each enabled format has its own typed request contract, server validation, media upload/processing path, provider creative payload, returned IDs and successful end-to-end test.

## 4.2 Google campaign-type execution coverage

### GOOGLE-01 — Add complete campaign-type execution workflows or disable unsupported live choices

**Status:** PARTIAL  
**Priority:** P1  
**Evidence:** `api/src/routes/campaign.routes.ts` global `POST /api/campaigns` dispatches Search and Display directly and handles Performance Max separately. Other campaign types are rejected with a “not yet connected to the global execution route” error. Lower-level Demand Gen ad helper functions do not constitute a full campaign workflow.

**Campaign types needing an explicit decision and complete workflow:**

- Demand Gen — campaign/budget/ad group/format-specific creation and asset attachment; multi-asset, video-responsive, carousel and product ads must not be treated as interchangeable.
- Shopping — linked Merchant Center account, Shopping settings, listing groups/product filters, ad group and product-ad resources.
- App — subtype-specific AppCampaignSetting, app identity, assets and supported audience/goal controls.
- Hotel — linked Hotel Center prerequisite, eligible property inventory, hotel ad group/ad resources and account allowlisting.
- Any other type visible in the UI or capability registry but not dispatched by the global route.

**Required work:** Maintain one authoritative provider capability registry shared by UI and backend. Show a campaign type as live-creatable only when its full resource hierarchy, validation and route dispatch are connected. Preview-only types must be labelled clearly.

### GOOGLE-02 — Complete Google targeting coverage beyond location include/exclude

**Status:** PARTIAL  
**Priority:** P1  
**Required audit/implementation areas:**

- Device targeting and bid modifiers, where supported.
- Demographic criteria (age, gender, parental status, household income) and campaign-type restrictions.
- Topics, content/placement targeting and exclusions for eligible campaign types.
- Ad schedule criteria and account-time-zone handling.
- Audience targeting versus audience signals; do not treat PMax signals as strict targeting.
- Campaign-level versus Ad Group-level criteria, including validation by hierarchy.
- Negative keyword list/shared-list workflows and keyword planning if these remain product requirements.

Do not expose all targeting controls for every Google campaign type. Add them through the capability/compatibility matrix and verify provider constraints before enabling live execution.

## 4.3 Pass 4.1C — Google Proximity Radius Targeting

**Status:** NOT IMPLEMENTED  
**Priority:** P1 — next agreed implementation pass  
**Evidence:** No proximity/radius terms or proximity request types were found in the current campaign page, route, interfaces or Google campaign-creation service.

**Scope to implement:**

- Address-based location entry (street address, city, state/region, postal code and country).
- Radius value and unit (kilometres or miles).
- Add/remove multiple radius targets.
- Display each saved address and radius in the review summary.
- Pass structured proximity input through the frontend request, backend route, typed Google campaign inputs and service mutation.
- Create Google `CampaignCriterion` proximity resources using the provider-native address/radius structure.
- Keep proximity targeting inclusion-only. Do not provide an exclusion toggle for radius targets; continue to use the existing negative geo-target criteria for exclusions.
- Validate radius and address completeness on both client and server.
- Add validate-only and unit tests; live-test only on an authorized test account.

**Acceptance criteria:** Search, Display and Performance Max support proximity only where the relevant campaign type accepts it; multiple radius entries are created and persisted correctly; negative country/city criteria continue to work alongside proximity targets.

## 4.4 Meta targeting and catalog gaps

### META-03 — Connect Catalog and Product Set selectors to the frontend

**Status:** PARTIAL  
**Priority:** P1  
**Evidence:** `campaign.routes.ts` has `GET /lookups/meta/catalogs` and `GET /lookups/meta/catalogs/:catalogId/product-sets`; no corresponding calls/state/UI were found in the Campaign Creation page.

**Required work:**

- Load catalogs for the selected Ad Account and its Business relationships.
- Display owned versus client/shared catalog information and relevant availability.
- Load Product Sets only after a catalog is selected.
- Preserve native IDs and revalidate catalog/account ownership server-side.
- Attach the chosen catalog/Product Set to the correct eligible Sales/catalog creative flow.
- Show clear empty, permission and unsupported-account states.

### META-04 — Replace free-text placement values with versioned compatibility controls

**Status:** PARTIAL  
**Priority:** P1  
**Evidence:** The current page accepts comma-separated placement positions and initializes Instagram positions with `explore`. The configured Meta Graph API version defaults to v26.0; the included field-research notes identify Explore Feed as incompatible with that v26.0 manual-placement catalogue.

**Required work:**

- Remove invalid/stale default placement values and use a versioned allowlist.
- Use provider-specific selectors instead of comma-separated free text.
- Filter publisher platforms and positions by objective, format, destination and API version.
- Validate on the backend as well as in the UI.
- Keep **Advantage+ Placements** separate from **Advantage+ Audience**. Selecting automatic placements must not silently enable or claim to enable Advantage+ Audience.
- Add a dedicated Advantage+ Audience control only for eligible objectives and categories, with backend validation.
- Test Special Ad Category restrictions against age, gender, ZIP/location and detailed-targeting fields.

### META-05 — Complete advanced audience workflows

**Status:** PARTIAL  
**Priority:** P2  
**Present:** Custom Audience and Saved Audience listing/selection; detailed-targeting and location search.  
**Not complete:** Lookalike Audience create/manage flow; broader Custom Audience lifecycle and source/consent diagnostics; richer audience sync/refresh and eligibility states.

**Required work:** Implement only the audience types and source workflows that fit the agreed product scope and Meta permissions. For any customer-list audience, include lawful-source/consent and policy checks; do not treat it as a normal ID selector.

## 4.5 Conversion tracking and measurement

### CONV-01 — Separate conversion configuration, event delivery and reporting

**Status:** PARTIAL  
**Priority:** P1/P2  
**Present:** Google Conversion Action and Meta Pixel/Custom Conversion discovery/configuration surfaces; conversion reporting foundations and Meta website verification.  
**Not found as a complete end-to-end module:**

- Meta Conversions API event delivery, test events, event ID deduplication and browser/server event matching.
- Google offline/first-party event upload and the appropriate current Data Manager / conversion ingestion path.
- Consent/source metadata and policy enforcement for uploaded conversion/audience data.
- Event-health diagnostics that distinguish “resource exists” from “events are being received and attributed”.
- Retry/reconciliation and event-level error reporting.

Keep provider-attributed conversions separate from a future first-party website/CRM/order truth source.

## 4.6 Asset Library, AI creative and media

### ASSET-01 — Complete provider-specific media pipelines

**Status:** PARTIAL  
**Priority:** P1  
**Present:** Local image/video Asset Library records, provider asset listing, Google image/YouTube asset helpers and a Meta image upload foundation.  
**Needs completion and verification:**

- Meta video upload, processing state, returned video ID and creative attachment.
- End-to-end carousel media upload and child-card association for Meta and Google formats that support it.
- Provider upload job status, retry/reconciliation and orphan cleanup.
- Policy/review state and effective delivery status after upload/creative/ad creation.
- Correct provider-account ownership and asset compatibility checks.
- Ensure generated local media is not mistaken for an already-uploaded provider asset.

### AI-01 — Video creative generation

**Status:** NOT IMPLEMENTED  
**Priority:** P2  
**Evidence:** `api/src/services/ai-creative.service.ts` explicitly returns “Video creative generation is not available yet”. The UI may represent video creative targets, but actual video generation is not available.

Treat video generation as a separate feature from uploading an existing video and attaching it to an ad. Scope it later with duration, aspect ratio, templates, rendering, moderation, storage, costs and provider-specific output variants.

## 4.7 Ad Management actions

### ADS-01 — Add controlled ad-level mutations

**Status:** PARTIAL  
**Priority:** P1/P2  
**Evidence:** `api/src/routes/ads.routes.ts` currently exposes read/list handlers for Google and Meta ads, ad groups/ad sets and related resources. Campaign-level rename/status/delete routes exist separately.

**Required work, subject to product decisions:**

- Ad-level pause/resume/status changes.
- Supported edit/update operations for each provider's ad object and creative reference.
- Safe delete/archive behaviour where provider APIs allow it.
- Preview/confirm, account ownership checks, idempotency, provider-specific result/error and read-back verification.
- Keep one centralized action UX, but dispatch to provider-native operations and show partial success per provider.

Do not assume a Meta Ad and Google Ad have the same editable fields or lifecycle.

## 4.8 Reporting, billing and account operations

### DATA-01 — Verify cross-provider reporting accuracy and normalization

**Status:** IMPLEMENTED FOUNDATION / NEEDS RUNTIME VERIFICATION  
**Priority:** P1  
**Required work:** Compare account, campaign and ad-level impressions, clicks, spend, conversions and ROAS-related metrics with each provider's native UI. Confirm pagination, date windows, attribution settings, timezone, currency, metric nulls, stale data and permission errors. Keep cross-currency totals separated unless an explicit FX design is approved.

### BILL-01 — Billing account-matrix QA, not a rebuild

**Status:** IMPLEMENTED FOUNDATION / NEEDS RUNTIME VERIFICATION  
**Priority:** P2  
**Present:** Billing page, spend summaries, invoice handling/download routes and Meta billing activity endpoint. The included billing research correctly treats payment-method changes and direct payment processing as provider-owned operations.

**Required verification:**

- Google postpay, prepay and eligible monthly-invoicing account states.
- Google invoice permission/eligibility and manager/consolidated billing behaviour.
- Meta account balance/spend semantics, Business invoice permission and billing activity types.
- Empty, unsupported, permission-required, reconnect and temporary-error states.
- Currency/timezone handling, invoice uniqueness, PDF download errors and stale-data labels.

Do not add a generic Pay Now/payment-method editor without a separate provider capability and product review.

## 4.9 Platform reliability, test coverage and release safety

### QA-01 — Add an automated test suite and provider contract checks

**Status:** NOT IMPLEMENTED IN THE SUPPLIED ZIP  
**Priority:** P0/P1  
**Evidence:** No test/spec files were found; no `test` script exists in the frontend or API package manifests.

**Required work:**

- Unit tests for request normalizers, validators and provider payload builders.
- Route tests using mocked provider responses.
- Tests for account ownership, resource mismatch and unauthorized access.
- Tests for partial Google/Meta success, retries and no-duplicate creation.
- Campaign-type capability/compatibility tests.
- A documented live-test checklist using authorized test accounts.
- Build/typecheck/lint commands in CI and a repeatable pre-release check.

No feature should be labelled production-ready based only on the presence of a route or a successful local preview.

### QA-02 — Add idempotency and provider-state reconciliation for all create flows

**Status:** PARTIAL / NEEDS VERIFICATION  
**Priority:** P1  
**Required work:** Verify that every create/retry path stores provider IDs after each successful step, reconciles uncertain timeouts before retrying and cannot duplicate Campaign/Ad Set/Ad/Creative resources on double-click or network retry. Preserve independent provider results for Google + Meta batches.

### API-01 — Centralize provider API version policy

**Status:** PARTIAL  
**Priority:** P1  
**Evidence:** `api/src/googleadsAPI/utils/shared.ts` hard-codes Google Ads v25; `api/src/googleadsAPI/services/campaign-creation.ts` defaults to v26; `api/src/config/meta.ts` defaults Meta Graph to v26.0.

**Required work:**

- Define one backend-controlled version source for each provider.
- Remove duplicated hard-coded version strings from request helpers.
- Confirm which existing Google routes are still on v25 and which are on v26 before changing anything.
- Add version-specific compatibility tests and an upgrade checklist.
- Do not perform a blind global version upgrade.

### SEC-01 — Production safety and ZIP hygiene

**Status:** NEEDS REVIEW  
**Priority:** P0 before external exposure  
**Evidence:** `api/src/server.ts` enables Clerk debug mode, exposes `/api/auth/debug`, and uses unrestricted `cors()` configuration. The supplied ZIP also includes `frontend/.env.local`.

**Required work:**

- Disable debug middleware/logging in production and remove or protect the auth-debug endpoint.
- Restrict CORS to approved application origins.
- Verify that `frontend/.env.local` contains no real credential; never include local environment files in shared ZIPs. Rotate any real credential that was exposed.
- Check logs and bundled files for access tokens, OAuth secrets and private provider URLs.
- Keep encrypted user-level token storage, but review key management, rotation, backup and access controls before production.
- Add an explicit production environment validation and secure deployment checklist.

---

## 5. Deferred product scope — do not accidentally pull into the current pass

These are valid future product features, but they should not interrupt the current campaign-targeting work unless the roadmap is intentionally changed.

| Deferred feature | Reason / boundary |
|---|---|
| Multi-workspace / multi-tenant / agency client management | Explicitly excluded from the current MVP scope. Existing connections are user-scoped; organization membership and agency roles can be designed later. |
| LinkedIn Ads and TikTok Ads | Add after Google and Meta capability contracts are stable. Preserve the common brief + provider-specific configuration model. |
| AdSyntra SaaS subscription billing | Separate from advertisers' Google/Meta ad-account billing. Decide only when monetization scope is approved. |
| Automated optimization / rules / recommendations | Requires guardrails, approvals, audit history, rollback and reliable reporting first. |
| Public API / AI command-to-campaign actions | Later; should use typed action plans, preview and explicit confirmation rather than arbitrary provider calls. |
| Full video-generation studio | Separate scope from existing media upload and provider video-ad support. |

---

## 6. Recommended implementation order

This is the suggested order based on dependencies and risk. It is a proposal for senior review, not a final approved roadmap. It does not mean every item must be completed before the next independent pass.

| Order | Work item | Priority | Reason |
|---:|---|---|---|
| 1 | Continue **Pass 4.1C — Google Proximity Radius Targeting** | P1 / next agreed pass | It is the next geographic-targeting task and does not depend on Meta creative work. |
| 2 | Fix **META-01** hard-coded existing-post fallback | P0 | Prevents the normal new Meta creative path from operating as intended. |
| 3 | Add server/UI campaign capability gates for Google and Meta formats | P0/P1 | Prevents unsupported campaign types and creative formats from appearing live-ready. |
| 4 | Complete Meta single-image live path, then video and carousel pipelines | P1 | Align the actual backend with the visible creative form. |
| 5 | Connect Meta Catalog and Product Set selectors | P1 | Backend routes already exist; complete the missing frontend and campaign attachment path. |
| 6 | Correct Meta placement catalogue and add distinct Advantage+ Audience controls | P1 | Remove stale/free-text values and apply objective/format/version constraints. |
| 7 | Unblock Google Merchant Center and verify feed/product lookups; verify Hotel Center separately | P1 / external | Requires website verification, Merchant API registration, linked provider accounts and eligibility. |
| 8 | Complete Google Demand Gen, Shopping, App and Hotel execution workflows one by one | P1/P2 | Separate campaign hierarchies and prerequisites; do not treat one generic flow as sufficient. |
| 9 | Add ad-level management actions | P1/P2 | The current Ads API route family is read-oriented. |
| 10 | Complete conversion event delivery and advanced audience workflows | P2 | Build on the existing conversion and audience foundations. |
| 11 | Add automated tests, route smoke tests and release checks continuously | P0/P1 | Required while each item is implemented, not only at the end. |
| 12 | Complete production security, reporting accuracy and billing account-matrix checks | P0/P1/P2 by area | Needed before any wider external release. |

**Important:** The P0 Meta creative issue must be fixed before relying on a live Meta ad creation test. It does not need to block the independent Google Pass 4.1C work.

---

## 7. Documentation that should be kept in sync

The following documents predate some of the current code and should not be used as the only status source:

- `docs/ADSyntra_Campaign_Creation_Google_Meta_Unified_Field_Research.md` (20 November 2026) still describes several Meta selectors as disconnected, while the current 24 November campaign page now calls Page, Pixel, event, Custom Conversion, Instant Form, messaging, application, Custom/Saved Audience, location and detailed-targeting lookups.
- `docs/unified_ads_platform_project_notes.md` contains the earlier prototype-first decision and V4 status. The current ZIP now has substantial API-backed product modules; update the project direction/status sections when the user confirms the current product milestone.
- `docs/provider-api-mapping.v26-review.md` should remain a reference, but code version configuration must agree with the actual version policy.
- `AdSyntra_Billing_Section_Final_Research.docx` should remain the billing requirements baseline; use this backlog for implementation and test status.

Update this backlog when a feature is genuinely completed and tested. Record the test account context (without secrets), date, provider API version, test result and known limitations.

---

## 8. Audit limitations

- The ZIP was inspected statically; no source files in the user's local project were modified.
- No `npm install`, frontend build, API typecheck, lint run or automated test run was performed during this audit.
- No OAuth flow, live lookup, validate-only call or campaign mutation was executed.
- Provider permissions, account eligibility, Google Merchant API registration, Hotel Center allowlisting and the accuracy of live reporting still require authorized runtime verification.
- File presence and TypeScript structure were used to classify implementation status; they are not treated as proof of production readiness.

---

## 9. Working rule for future passes

For every new pass, update this document with:

1. Feature scope and provider-specific behaviour.
2. Exact frontend, route, interface and service files changed.
3. Validation performed (typecheck/tests/validate-only/live test).
4. What was confirmed working and what remains blocked.
5. Any new follow-up added to this backlog.

Do not mark a provider feature **DONE** just because the UI or route exists. Mark it DONE only after the intended workflow is tested against an authorized provider account and the result is checked in the provider's own interface.
