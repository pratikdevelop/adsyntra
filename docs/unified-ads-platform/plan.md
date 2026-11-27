# AdSyntra — Product & Implementation Roadmap

**Updated:** 27 November 2026 (Meta App Install Ad Set + creative execution source prepared; local integration and provider verification remain pending)  
**Document owner:** AdSyntra project  
**Purpose:** Single working roadmap for the next implementation passes, Google Ads product transitions, campaign-type support, migration workflows, and existing implementation gaps.

> **Working rule:** Keep development moving through the feature backlog. Per the user's direction on 26 November 2026, defer the consolidated testing phase (automated tests, full builds, provider validate-only/live tests and end-to-end QA) until the product feature set is built and ready for final product-readiness checks. Do not describe prepared or integrated code as provider-verified or production-ready. Keep this file and the detailed pending-features backlog in sync.

---

## 1. Current project direction

AdSyntra is a unified Google Ads + Meta Ads management platform. The product should:

1. Keep a common campaign brief and separate provider-specific configuration.
2. Support provider-native campaign hierarchies, validation, assets, targeting and execution.
3. Manage existing campaigns even when a provider is transitioning away from their campaign type.
4. Add new campaign types using the provider's current direction, rather than building new functionality around legacy types.
5. Make provider capability and eligibility visible in the UI.
6. Provide migration assistance without claiming that an API can invoke a provider-native migration tool unless the provider documents such an API.

**MVP scope remains unchanged:** multi-workspace, agency tenancy, LinkedIn Ads and TikTok Ads are deferred. Continue improving Google Ads and Meta Ads first.

---

## 2. Current status snapshot

Status labels:

- **USER CONFIRMED** — user has explicitly tested or confirmed the behaviour.
- **LOCAL CHECK REPORTED** — user reports local integration/build/lint or UI checks passed; exact command output may not be retained here.
- **IMPLEMENTED / PREPARED** — code is present or a patch was prepared, but provider runtime verification remains.
- **PARTIAL** — some layers exist, but the complete workflow is not connected.
- **PENDING** — not yet implemented.
- **BLOCKED / DEPENDENCY** — requires account access, provider approval, feed, permission or other external setup.

| Area | Current status | Next action |
|---|---|---|
| Meta location exclusions — Pass 4.1A | USER CONFIRMED | Regression-test later; do not rebuild. |
| Google location exclusions — Pass 4.1B | USER CONFIRMED | Regression-test later; do not rebuild. |
| Google proximity radius — Pass 4.1C | USER CONFIRMED — working as expected | Complete. Do not repeat implementation. Record detailed provider test evidence later only if needed for release/audit traceability. |
| Google Search creation | Implemented in current project | Keep; regression-test. |
| Google Display creation | Existing implementation present | Preserve existing campaign management; gate new legacy creation based on current Google eligibility and transition status. |
| Google Performance Max | Standard PMax execution present | Keep; later extend through separate Store Goals and Local Services PMax modes. |
| Google Demand Gen | PARTIAL / no complete global creation workflow | Build complete campaign, ad group, asset and format-specific execution. |
| Google Hotel | Legacy lookup/flow foundations; no Hotel Center account linked in previously tested account | Preserve existing campaign management; avoid making legacy Hotel the long-term new-creation path. |
| Search campaigns for Travel | PENDING | Research/implement the Search + AI Max + Hotel Center travel-feed workflow. |
| Meta creative creation | META-01 source correction and follow-up frontend fixes PREPARED; Instant Form validation success reported by user; Messaging PREPARED SOURCE | Single Image/Video now has prepared Website, Instant Form and Engagement → Conversations Messaging paths. No external Meta resources were created by the user-reported validate-only response. Keep Meta Live blocked until final QA/provider checks. |
| Meta Single Video + Website | PREPARED incremental overlay and latest frontend source | Private video selection from Asset Library, account-scoped video upload/processing, and video creative payload are prepared. Only the selected video should be sent for this format. |
| Meta Carousel + Website | PREPARED incremental overlay, dependent on the Single Video source chain | Structured 2–5 card flow with private image upload and ordered `child_attachments`; local integration not confirmed. |
| Meta Catalog / Product Set creatives | PREPARED INCREMENTAL FRONTEND + BACKEND SOURCE — pending local integration | Adds account-scoped Catalog/Product Set revalidation and native Dynamic Product Ad Campaign, Ad Set and `template_data` creative mapping. Live Meta creation remains gated. |
| Meta Special Ad Category constants module | STANDALONE SOURCE FILE SUPPLIED; local integration not confirmed | Add `api/src/metaadsAPI/services/meta-special-ad-category.constants.ts`; keep the existing relative `.js` import under NodeNext. |
| Meta Catalog / Product Set selector | ACCOUNT-SCOPED DISCOVERY PRESENT; NATIVE DPA SOURCE PREPARED | Reuse existing Catalog/Product Set lookup routes; integrate the new native Dynamic Product Ad execution overlay. |
| Automated tests and provider contract checks | DEFERRED TO FINAL PRODUCT-READINESS GATE | Capture the full test matrix now; execute automated, integration and provider checks together after the planned product features are built. |
| Provider API version policy | PARTIAL | Centralise version configuration; do not perform blind global upgrades. |
| Campaign Capability Registry Phase 1 | USER CONFIRMED — integrated (25 November 2026) | Continue with Phase 2 enforcement and dynamic gating. |
| Campaign Capability Registry Phase 2A | PREPARED IN OVERLAY — integration status not reconfirmed | Integrate the overlay as part of the feature build; defer full test/build/provider verification to the final product-readiness stage. |
| Campaign Capability Registry Phase 2B1 | PREPARED IN CODE OVERLAY — pending integration | Adds server-side Meta resource prerequisites and repairs the missing Google Hotel Center lookup route. |
| Campaign Capability Registry Phase 2B2 | PREPARED INCREMENTAL FRONTEND OVERLAY — pending integration | Connects the existing account-scoped Meta Catalog and Product Set lookup endpoints to the campaign wizard; confirms existing Google Merchant Center ownership guards. |
| Campaign Capability Registry Phase 2C1 | PREPARED INCREMENTAL API + FRONTEND OVERLAY — pending integration | Adds Meta Special Ad Category audience gating, fixed manual-placement selectors, v26 placement exclusions and server-side placement/category validation. |
| Campaign Capability Registry Phase 2C2A | PREPARED INCREMENTAL API + FRONTEND OVERLAY — pending integration | Maps Meta special_ad_category_country from included campaign countries, validates Meta country enum values and passes the field through to the Graph API Campaign create request. |
| Campaign Capability Registry Phase 2C2B1 | PREPARED INCREMENTAL API + FRONTEND OVERLAY — pending integration | Adds conservative objective/destination-aware manual placement filtering for Awareness, Instant Form Lead Generation, App Install and Traffic-to-Messaging, with backend bypass validation. |
| Campaign Capability Registry Phase 2C2B2 / META-01 | PREPARED INCREMENTAL API + FRONTEND OVERLAY — pending integration | Removes the hard-coded existing Page-post fallback, fixes supplied-image URL validation, removes sample media defaults and enforces explicit creative-format/destination handling. Final provider verification remains pending. |
| Campaign Capability Registry Phase 2C2B3A | PREPARED INCREMENTAL API + FRONTEND OVERLAY — pending integration | Adds the Meta Single Video + Website pipeline, private Asset Library video selection, account-scoped upload/processing and creative retry. |
| Campaign Capability Registry Phase 2C2B3B | PREPARED INCREMENTAL API + FRONTEND OVERLAY — pending integration; depends on 2C2B3A | Adds Meta Carousel + Website with 2–5 Asset Library image cards, account-scoped image uploads, ordered child attachments and retry support. |
| Campaign Capability Registry Phase 2C2B3C1 | PREPARED INCREMENTAL API + FRONTEND SOURCE — pending local integration | Adds Page-owned Meta Instant Form with Single Image/Single Video creatives, Leads + `LEAD_GENERATION` + `ON_AD` mapping, `promoted_object.page_id`, `lead_gen_form_id` CTA values and creative-retry prerequisite checks. |
| Campaign Capability Registry Phase 2C2B3C2 | PREPARED SOURCE — pending local integration | Adds Single Image/Single Video messaging destinations for Messenger, Instagram Direct and WhatsApp under Engagement → Conversations; maps selected messaging identity IDs into the actual request payload and revalidates identity ownership. |
| Campaign Capability Registry Phase 2C2B3C3A | PREPARED STANDALONE SOURCE — pending local integration | Connects Meta advertisable-application lookup to the explicitly selected Ad Account, with account-change reset, pagination, retry and server-side selected-account authorization. |
| Campaign Capability Registry Phase 2C2B3C3B | PREPARED STANDALONE SOURCE — pending local integration | Adds explicit Android/Google Play vs iOS/Apple App Store selection, strict store URL parsing, normalized listing URL serialization, and server-side revalidation that the selected Meta Application is advertisable from the selected Ad Account. |
| Campaign Capability Registry Phase 2C2B3C3C | PREPARED STANDALONE SOURCE — pending local integration; final provider verification deferred | Connects App Promotion → `APP_INSTALLS` → `IMPRESSIONS` to `APP_STORE`, account-scoped application identity, OS-specific mobile targeting, `INSTALL_MOBILE_APP` single image/video creatives, matching store URL and install tracking. All resources stay PAUSED. |
| Campaign wizard follow-up fixes (26 November) | PREPARED standalone frontend replacement — local integration not confirmed | Fixes private-image validation, prevents incompatible creative asset references from entering a request, adds explicit Meta video selection, scopes validation by wizard step, and adds the Instant Form destination flow. |

**Latest Meta response note (26 November 2026):** The user supplied a successful Meta response with `execution.validateOnly: true`, `creationStatus: "validated"`, `providerCampaignId: null`, and null Campaign / Ad Set / Creative / Ad IDs. This confirms that AdSyntra’s local validation path returned success; it does **not** mean any external Meta resource was created. Preserve this distinction in the UI and do not label it as a live create.

**Pass 4.1C completion note (25 November 2026):** The user confirmed that Pass 4.1C is working fine. It is therefore treated as complete for the current development sequence. The exact Google Ads validate-only/live test matrix was not captured in this document, so do not claim specific Search, Display or PMax provider test results unless those results are recorded separately. Any additional provider evidence can be added during release QA; it does not block moving to the next planned feature.

---

## 3. Google Ads product-transition policy

Google's product transitions affect how AdSyntra should create and manage campaigns. They do not mean we should delete the old campaign management code immediately.

### 3.1 Display → Demand Gen

Google's current Help documentation says:
- Eligible advertisers can use Google's in-account migration tool from the phased rollout that began in June 2026.
- Existing Display campaigns can continue to be accessed and edited until migrated.
- New Display campaign creation will move into Demand Gen at a later date; Google currently describes that date as "coming later".
- Demand Gen can use GDN inventory on its own or alongside other supported visual channels.
- Google's native migration tool can transfer settings, budget and up to 42 days of performance history for eligible campaigns; this is materially different from creating a fresh replacement campaign through an API.

**AdSyntra decision:**
- Keep read, reporting and supported edit/pause management for existing legacy Display campaigns.
- Build Demand Gen as the future-facing visual campaign workflow.
- Support GDN-only Demand Gen as well as eligible multi-channel Demand Gen configurations.
- Do not permanently promise a new standalone Display creation option. Show it only when current Google policy/account capability allows it.
- Prefer Google's native migration tool when available and when preserving eligible campaign history/learning matters.
- If AdSyntra offers an API-assisted rebuild, label it as a **rebuild**, not Google's native migration. Show configuration differences and explain that history/learning may not transfer.

### 3.2 Hotel campaigns → Search campaigns for Travel

Google's current Help documentation says Hotel campaigns will begin migrating to Search campaigns for Travel in Q4 2026. Advertisers may manually transition earlier; Google says replacement Search campaigns will mirror the closest equivalent settings.

**AdSyntra decision:**
- Preserve management and reporting for existing legacy Hotel campaigns while Google supports them.
- Build Search for Travel as the future-facing new workflow.
- Keep Hotel Center as a required external dependency for travel feeds, hotel inventory, rates and availability.
- Show legacy Hotel creation only when Google still permits it for the connected account and the required Hotel Center link/access exists.
- Do not assume the old Hotel campaign hierarchy, bidding and settings map one-to-one to Search for Travel.
- Build an eligibility and settings-mapping preview before any migration/rebuild.
- Do not automatically pause/delete the old campaign or activate a replacement without explicit customer approval.

### 3.3 Campaign chooser policy during transitions

The UI must not present legacy and modern options as permanently equal alternatives.

| User intent / campaign | AdSyntra presentation |
|---|---|
| New visual/display advertising | Demand Gen — recommended; channel controls include GDN-only where supported. |
| Existing Display campaign | Legacy Display — manage/report; offer migration guidance when eligible. |
| New hotel/travel advertising | Search for Travel — recommended when account/feed prerequisites are met. |
| Existing Hotel campaign | Legacy Hotel — manage/report; offer migration guidance when eligible. |
| New legacy Display or Hotel campaign | Show only if current Google API/account eligibility says creation is allowed; otherwise explain why unavailable. |

The capability response must distinguish `canCreate` from `canManageExisting` and `canMigrate`.

---

## 4. Local business and Local Services strategy

Do not treat all local-business advertising as one Google campaign type. AdSyntra should separate these use cases:

### 4.1 Standard Search for local businesses
- Standard Search campaign with location targeting, relevant keywords, location assets and call/website conversion setup.
- Continue using the existing Search campaign workflow and geographic targeting.
- Radius targeting is included only where the specific campaign flow and provider API support it.

### 4.2 Standard Performance Max for stores/local goals
- Standard Performance Max remains a supported campaign family.
- Add a distinct Store Goals configuration where the account, linked Business Profile/location assets, conversion goals and Google product eligibility support it.
- Do not assume every standard PMax campaign is a Store Goals campaign.

### 4.3 Local Services Ads (standalone LSA)
- Treat standalone Local Services campaigns as a separate Google product.
- The Google Ads API documentation lists create/remove of standalone `LOCAL_SERVICES` campaigns as unsupported.
- AdSyntra may support eligible existing-campaign discovery, supported management/reporting operations and lead workflows where the API allows them.
- Do not expose a normal API-based "Create standalone LSA campaign" action.

### 4.4 Local Services Performance Max (GLS PMax)
- This is a specialised Performance Max configuration, not ordinary PMax with a different label.
- Google Ads API v26 documents creation/update support using `PERFORMANCE_MAX` with `pmax_campaign_settings.local_services_enabled = true`.
- Creation requires `country_code` and `listing_id` in `local_services_pmax_campaign_settings`.
- The listing must be linked to the Google Ads account as an enabled `LOCATION` asset.
- Category, country, account and listing eligibility must be checked against Google's current rules/allowlisting. Do not hard-code availability for India or any other country based on assumptions.
- Keep this as a separate PMax mode with dedicated validation, assets, lead goals and reporting.

**Proposed AdSyntra internal mode names (not Google API enum values):**
- `STANDARD`
- `STORE_GOALS`
- `LOCAL_SERVICES`

The backend must map these internal modes to the correct Google API fields and validate all prerequisites.

---

## 5. Capability registry — shared foundation

**Priority: P0/P1 — implement before adding more campaign types.**

Build one authoritative, version-aware capability registry consumed by both frontend and backend. Do not duplicate campaign-type availability rules in UI components and route handlers.

Minimum capability information:

```ts
interface CampaignTypeCapability {
  provider: "GOOGLE" | "META";
  campaignType: string;
  subtype?: string;

  canCreate: boolean;
  canManageExisting: boolean;
  canEdit: boolean;
  canPauseResume: boolean;
  canDelete: boolean;
  canMigrate: boolean;

  lifecycle: "CURRENT" | "LEGACY" | "TRANSITIONING" | "RESTRICTED";
  recommendedForNewCampaigns: boolean;

  supportedObjectives: string[];
  supportedCreatives: string[];
  supportedTargeting: string[];
  requiredAssets: string[];
  requiredConnections: string[];

  apiVersion: string;
  eligibilityChecks: string[];
  migrationTarget?: string;
  restrictions: string[];
}
```

This is an AdSyntra application contract, not a provider schema.

**Current implementation:** Campaign Capability Registry Phase 1 was integrated by the user and confirmed complete on 25 November 2026. The current source structure is under `api/src/campaign-capabilities/`, mounted at `/api/campaign-capabilities`, proxied through the Next.js frontend route, and displayed in the Campaign Creation wizard. The existing frontend `campaign-capability-registry.ts` remains the creative media/text requirements registry and must not be replaced.

**Phase 2A prepared on 26 November 2026 (not yet integrated into the user's local project):** provider-native campaign type resolution, backend create-operation enforcement, registry-driven validation for enumerated bidding/objective options, frontend campaign-type and selected Meta option gating, and tests. See `docs/CAMPAIGN_CAPABILITY_REGISTRY_PHASE2_ENFORCEMENT.md`.

The registry must:
1. Gate new campaign creation based on API version, account eligibility and complete backend execution support.
2. Keep `canManageExisting` independent from `canCreate`.
3. Distinguish legacy, current, transitioning and restricted types.
4. Define campaign hierarchy and targeting ownership (campaign-level vs ad-group/ad-set-level).
5. Declare creative formats and required assets.
6. Describe migration support without implying a native migration endpoint exists.
7. Be tested against provider API versions and account capability responses.

---

## 6. Campaign Migration Center

**Priority: P1 — build after the capability registry and core replacement campaign workflows.**

Migration Center is a separate product module, not a normal campaign creation form.

### 6.1 Supported migration experiences

**A. Native migration guidance**
- Detect an eligible source campaign.
- Explain that migration must be completed in Google's native UI if no public API migration operation is documented.
- Deep-link or provide exact navigation guidance where possible.
- Re-fetch the source and destination campaigns after the user completes migration.
- Verify status, settings and provider IDs.

**B. AdSyntra-assisted rebuild**
- Fetch and snapshot the source campaign configuration.
- Run eligibility and compatibility checks.
- Map old fields to the destination campaign type.
- List unsupported settings, missing assets, missing feeds and user decisions.
- Preview the proposed new campaign and any differences.
- Validate with the provider before creation.
- Create the destination in PAUSED state.
- Let the customer review and explicitly approve activation/cutover.
- Keep the source campaign untouched until approval.
- Record source/destination IDs, settings mapping, warnings, errors and audit history.

**Important:** An API-assisted rebuild must not claim to preserve historical performance or learning unless the provider explicitly supports that transfer. The Google Display native migration tool and an AdSyntra rebuild are not equivalent.

### 6.2 Initial migration types

| Source | Destination | First approach |
|---|---|---|
| Display | Demand Gen | Prefer Google's native migration tool for eligible campaigns; offer AdSyntra rebuild only with clear history/learning limitations. |
| Hotel | Search for Travel | Build a mapping/eligibility workflow; confirm the currently supported native migration route and API coverage before promising automation. |

### 6.3 Safety rules
- No automatic source pause/delete.
- No automatic destination activation.
- Explicit customer confirmation before cutover.
- Idempotency and provider-state reconciliation.
- Preserve the source configuration snapshot and migration audit record.
- Handle partial success and retry without duplicate destination campaigns.

---

## 7. Prioritised implementation roadmap

### Where development continues after Pass 4.1C

Passes 4.1A (Meta location exclusions), 4.1B (Google location exclusions) and 4.1C (Google proximity radius) are complete for the current development sequence. Do not restart or re-implement these passes. Continue the capability-registry and campaign-creation build in this order:

| Order | Roadmap phase | Work | Why this comes next |
|---:|---|---|---|
| **DONE IN SOURCE OVERLAY** | **Phase 2B2** | Google commerce prerequisite audit and Meta Catalog / Product Set account-scoped selectors | Existing Google Merchant Center lookups already verify the selected Ads-customer link; the Meta wizard now connects to existing account-scoped catalog and Product Set endpoints. |
| **PREPARED** | **Phase 2C1** | Meta Special Ad Category and manual placement gating | Applies restricted-audience rules to Housing, Employment, Credit and Financial Products & Services; removes v26-incompatible placement values and validates direct API submissions. |
| **PREPARED** | **Phase 2C2A** | Meta Special Ad Category country mapping | Maps included country codes to `special_ad_category_country` through frontend, route validation and actual campaign-create request. |
| **PREPARED** | **Phase 2C2B1** | Meta objective/destination-aware manual placement policies | Gates documented Awareness, Instant Form Lead Generation, App Install and Traffic-to-Messaging placement combinations in both UI and backend. |
| **PREPARED** | **Phase 2C2B2 / META-01** | New Meta Single Image + Website creative path repair | Removes the hard-coded existing post fallback, fixes URL validation and blocks unsupported formats/destinations at the backend boundary. Meta Live remains gated pending final verification. |
| **PREPARED** | **Phase 2C2B3A** | Meta Single Video + Website | Private Asset Library video selection, account-scoped upload/processing, `video_data` creative and retry path prepared; pending integration. |
| **PREPARED** | **Phase 2C2B3B** | Meta Carousel + Website | Structured 2–5 card Asset Library image flow, account-scoped uploads and ordered `link_data.child_attachments` prepared; integrate after 2C2B3A. |
| **PREPARED** | **Phase 2C2B3C1** | Meta Instant Form + Single Image/Single Video | Connects the existing Page-owned form lookup to native Lead AdCreative requests; enforces Leads / `LEAD_GENERATION` / `ON_AD`, Page `promoted_object`, the `https://fb.me/` form link and supported CTA types. |
| **PREPARED SOURCE — PENDING LOCAL INTEGRATION** | **Phase 2C2B3C2** | Meta Messaging creatives | Adds Messenger, Instagram Direct and WhatsApp identity revalidation and Single Image/Single Video creative payloads for Engagement → Conversations; Automatic placements only. |
| **PREPARED — PENDING LOCAL INTEGRATION** | **Phase 2C2B3C3** | Meta App Install destination and creative execution | Implements the App Promotion / App Install Ad Set and Single Image/Single Video creative path; provider verification remains deferred. |
| 3 | META-01 | Remove the hard-coded existing Page-post fallback and complete fresh single-image creative creation | Required before Meta Live creation can be enabled; does not block continuing other development. |
| 4 | Phase 3 | Google Demand Gen | Builds the current replacement direction for new visual/display campaigns. |
| 5 | Phase 4 | Search campaigns for Travel | Builds the future-facing hotel/travel workflow once external prerequisites are available. |
| 6 | Phase 5 | Local business campaign modes | Extends standard Search/PMax and adds eligible Store Goals / Local Services PMax modes. |
| 7 | Phase 6 | Campaign Migration Center | Adds guided native migrations and safe AdSyntra-assisted rebuilds after destination workflows exist. |
| 8 | Phase 7 | Complete Meta campaign workflow | Finishes Catalog/Product Sets, video, carousel and related creative capabilities. |
| 9 | Phase 8 | Remaining Google campaign types and management | Adds Shopping, App subtypes, ad-level actions and broader conversion coverage. |
| Final gate | Phase 9 | Integrated testing and release readiness | Run the consolidated automated, build, provider and end-to-end test plan only after the planned feature build is complete. |

**Current continuation point: reconcile and integrate the prepared Phase 2C2B3C3D Native Meta Catalog / Product Set Dynamic Product Ad source overlay with the current local page and campaign route. After that, continue with Phase 3 — Google Demand Gen.** Phase 2C2B3C3C now prepares the App Install campaign/Ad Set/creative path on top of the account-scoped Meta App selector and Android/iOS store identity validation. The prepared mapping uses `OUTCOME_APP_PROMOTION`, `APP_INSTALLS`, `IMPRESSIONS`, Ad Set `destination_type: APP_STORE`, matching `promoted_object.application_id` + `object_store_url`, mobile-only targeting with the selected `user_os`, and a single-image/single-video `INSTALL_MOBILE_APP` CTA whose link matches the selected store URL. It also adds the `mobile_app_install` tracking specification for that same Meta Application. Website Pixel / Purchase configuration is excluded from basic App Install. Google App campaigns, App Events optimization, Carousel App creatives and manual App placements remain out of scope. The Campaign Capability Registry still keeps Meta Live gated until consolidated final product-readiness checks. These files are prepared overlays only; local integration is not confirmed.

### Phase 0 — Pass 4.1C Google proximity radius
**Priority: P0 — COMPLETE (user confirmed, 25 November 2026)**

- The user confirmed that the Pass 4.1C implementation is working fine.
- The radius input and the integrated frontend/backend work are treated as complete for the current roadmap.
- The detailed provider validation matrix (Search, Display and PMax validate-only/live results) was not captured in this document. Add those details later if they are available or required for release evidence; do not hold up the next feature because of missing historical notes.
- Preserve the completed functionality and include it in regression testing when shared targeting or campaign execution code changes.

### Phase 1 — Fix critical Meta creative path
**Priority: P0 — before trusting live Meta ad creation**

1. **Source correction prepared in Phase 2C2B2:** remove the hard-coded existing Page-post fallback; existing-post mode is used only when an ID is explicitly supplied.
2. **Source correction prepared:** fix image URL validation to validate the supplied URL, not an uninitialized local variable.
3. Use the existing account-scoped image upload route and uploaded Meta image hash when an Asset Library image is selected; preserve HTTPS URL support.
4. Add frontend and server-side format/destination guards. Phase 2C2B2 establishes Single Image + Website; Phase 2C2B3A extends the prepared create/retry path to Single Video + Website. Other formats and destinations remain blocked until their dedicated pipelines are implemented.
5. Keep META Live blocked until final validate-only, authorised live and regression checks confirm the new-creative path; do not mark this P0 blocker fully released yet.

### Phase 2 — Campaign Capability Registry, account prerequisites and API version policy
**Priority: P0/P1 — Phase 1 user-confirmed; Phase 2A and 2B1 prepared; continue development without per-pass QA gates**

1. Phase 1 foundation: shared Google/Meta capability definitions, authenticated read API, frontend proxy and wizard status display — user-confirmed integrated on 25 November 2026.
2. Phase 2A: provider-native campaign type resolution, backend create-operation enforcement, registry-driven option validation and frontend option gating — prepared in an overlay.
3. Phase 2B1: server-side Meta checks for Page access, Instagram identity, Page-owned Instant Forms, messaging destinations, advertisable apps, account Pixels/Datasets, Custom Conversion-to-Pixel relationship, and supported standard-event enum; also adds the missing Google Hotel Center link lookup route.
4. Phase 2B2: audit and confirm the existing account-scoped Google Merchant Center/feed/product safeguards; connect Meta Catalog/Product Set selectors to the existing account-aware lookup routes; retain Hotel Center as a separate external prerequisite.
5. Phase 2C: finish special-ad-category restrictions, conditional field requirements, provider objective/format/placement compatibility and backend enforcement for all conditional values.
6. Keep `canCreate` independent from `canManageExisting`; the present registry distinguishes operations but still needs explicit lifecycle/manage-existing metadata in a later schema increment.
7. Centralise Google Ads and Meta Graph API version configuration. Existing Meta lookup modules do not all share one fallback version; Phase 2B1 intentionally uses the versions configured by those existing services and does not silently upgrade/downgrade them.
8. Capture the test plan during development, but execute the full automated suite, full builds, validate-only/live provider checks and end-to-end regression matrix at the final product-readiness stage.

**Safety decision in Phase 2A:** `IMPLEMENTED_IN_SOURCE` create workflows can validate and run live; `PARTIAL` workflows can run validation-only but cannot perform live mutations; `NOT_IMPLEMENTED`, `BLOCKED_EXTERNAL`, `READ_ONLY` and unregistered types are rejected. This means Google Search, Display and standard Performance Max remain enabled, while unsupported Google types are blocked. Meta remains `PARTIAL`: Phase 2C2B2 prepares the source correction for the hard-coded fallback and image URL validation, but Meta validation-only is the only enabled mode until the consolidated final checks verify the corrected creative flow. In a multi-provider request, the gate runs inside each provider branch so a blocked provider is reported independently and does not prevent another supported provider from executing. The wizard allows Live mode for mixed-provider requests when at least one selected provider is live-enabled, with a warning that blocked branches will be rejected; if no selected provider is ready or the registry cannot be loaded, Live mode remains disabled.

**Phase 2B1 scope prepared on 26 November 2026:** the Meta campaign-create route now resolves Page, Pixel/Dataset, Custom Conversion, Instant Form, messaging destination and advertisable application references against the authenticated identity and selected Ad Account before provider creation. It checks the selected Page's `ADVERTISE` task when Meta returns task data, verifies that Instagram placement/identity is linked to the selected Page, checks forms belong to the selected Page, checks messaging identity availability, verifies app availability for the selected Ad Account, verifies Pixels are account-accessible, and verifies Custom Conversions belong to the selected Pixel. The frontend also sends an AdSyntra-only `conversionMeasurement` object so the backend can verify the source Pixel when a Custom Conversion is selected; the Meta bundle builder deliberately maps only provider-native fields into the Graph API request. A supported standard-event enum is checked, but **Pixel event delivery/health is not inferred or certified**. A missing `GET /lookups/google/hotel-center-links` route has been added to match the existing frontend lookup call.

**Phase 2B1 limits:** Page access is confirmed against the connected Meta identity and Page permissions; this is not represented as proof of every possible Page-to-Ad-Account business assignment. The selected Pixel and app are independently checked against the Ad Account. Meta lookup services retain their existing environment/version defaults; central API version governance remains open. Hotel Center is still an external linked-account requirement; the route only exposes link discovery and does not create a Hotel Center account.

**Testing policy from 26 November 2026:** do not run per-phase tests, lint, full builds or live provider calls during feature development. Use source review to shape code; consolidate automated tests, full builds, authorized provider validate-only/live checks and end-to-end QA after the planned product feature set is complete.

### Phase 3 — Google Demand Gen
**Priority: P1**

1. Confirm current Google Ads API v26 campaign and ad-group requirements.
2. Implement complete campaign and budget creation.
3. Implement Demand Gen ad-group hierarchy and supported targeting at the correct level.
4. Implement channel controls, including GDN-only where supported.
5. Implement format-specific creative workflows separately:
   - Multi-asset
   - Carousel
   - Video-responsive
   - Product-feed / catalog where supported
6. Connect Asset Library and provider upload processing.
7. Add preview, validate-only, paused creation, read-back and retry/reconciliation.
8. Add regression tests for channel and format compatibility.
9. Keep legacy Display management available; gate new legacy Display creation according to Google's current account/API policy.

### Phase 4 — Search for Travel
**Priority: P1**

1. Research and freeze the current Search for Travel API contract.
2. Verify Hotel Center account linking and feed prerequisites.
3. Implement Search campaign + AI Max configuration.
4. Implement travel-feed association and supported travel ad formats.
5. Implement required hotel/property feed and item-level selection/targeting.
6. Add account/feed eligibility checks and clear blocked states.
7. Build migration mapping from legacy Hotel settings.
8. Validate in an authorised eligible account; our previously tested account had no Hotel Center account linked, so this is an external dependency.

### Phase 5 — Local business campaign modes
**Priority: P1/P2**

1. Improve standard Search local-business configuration: locations, location assets, calls and conversion goals.
2. Add standard PMax Store Goals only after verifying linked Business Profile/location asset and conversion prerequisites.
3. Add dedicated Local Services PMax mode using API v26 requirements, including `local_services_enabled`, `country_code`, `listing_id`, enabled linked LOCATION asset and category/account eligibility.
4. Do not add API creation for standalone Local Services campaigns while Google documents create/remove as unsupported.
5. Add supported existing LSA campaign/lead management only where the API allows.
6. Test country/account eligibility rather than hard-coding assumptions.

### Phase 6 — Campaign Migration Center
**Priority: P1**

1. Implement source campaign discovery and snapshots.
2. Add eligibility and compatibility checker.
3. Add native-migration guidance for Google UI-based migrations.
4. Add AdSyntra-assisted rebuild for Display → Demand Gen.
5. Add Hotel → Search for Travel mapping when the replacement workflow is verified.
6. Add preview, approval, paused destination creation, cutover and audit history.
7. Never claim history/learning transfer for rebuilds unless the provider supports it.

### Phase 7 — Complete Meta campaign workflow
**Priority: P1**

1. Connect Catalog and Product Set selectors to the campaign UI.
2. Implement Meta video upload, processing and creative attachment.
3. Implement carousel child media and ordered attachments.
4. Implement catalog/dynamic product creative.
5. Replace free-text placements with API-versioned compatibility controls.
6. Keep Advantage+ Placements separate from Advantage+ Audience.
7. Add Lookalike Audience lifecycle and audience source/consent checks as approved.

### Phase 8 — Remaining Google campaign types and management
**Priority: P1/P2**

1. Shopping with Merchant Center feed, product filters/listing groups and product ads.
2. App campaigns by subtype and store identity.
3. Ad-level pause/resume/edit/delete where provider supports it.
4. Broader targeting coverage with campaign-type-specific rules.
5. Complete conversion event delivery (Meta CAPI and Google offline/first-party ingestion) and event-health diagnostics.

### Phase 9 — Reliability and release readiness
**Priority: Continuous P0/P1**

- Unit tests, route tests, provider contract tests and end-to-end smoke tests.
- Idempotency and retry/reconciliation across all create flows.
- Cross-provider reporting parity, currency, timezone, attribution and freshness checks.
- Billing account-matrix QA.
- Production security: CORS allowlist, debug route protection/removal, secret hygiene, environment validation, token/key management.
- No provider feature is production-ready solely because its UI or route exists.

---

## 8. Immediate next action — Campaign Capability Registry Phase 2C2B3C

**Active development task: implement Meta Instant Form, Messaging and App destination-specific creative pipelines, then complete the remaining creative-format × placement compatibility matrix.** Phase 1 is user-confirmed integrated. Phase 2A, 2B1, 2B2, 2C1, 2C2A and 2C2B1 are prepared as incremental overlays against the available project snapshot; the user's current local working tree was not supplied, so compare the large campaign page and shared prerequisite service before replacement.

### Phase 2A — provider capability enforcement and dynamic option gating

- Resolve provider-native campaign types against the registry.
- Gate create operations before provider calls.
- Validate registry-backed objectives, bidding strategies, performance goals and supported provider options.
- Filter unsupported options and types in the wizard.
- Keep Google Search, legacy Display and standard Performance Max intact; continue blocking unsupported campaign types.

### Phase 2B1 — account-specific Meta prerequisites and Hotel Center route repair

Prepared source files:

- `api/src/metaadsAPI/services/meta-campaign-prerequisites.service.ts` (new)
- `api/src/routes/campaign.routes.ts` (adds Hotel Center lookup route, Meta prerequisite call and provider-scoped prerequisite error reporting)
- `frontend/src/app/dashboard/campaigns/new/page.tsx` (adds AdSyntra-only conversion source metadata)

The Meta validation checks Page identity/access, Instagram identity where required, Page-owned Instant Forms, Page messaging destinations, account-advertisable applications, account Pixels/Datasets and Custom Conversion-to-Pixel relationship. It validates standard event names as supported configuration options only; it does not inspect or certify event firing health. Existing Meta lookup services' API-version settings are reused without changing versions in this pass.

### Phase 2B2 — Google commerce prerequisite audit + Meta Catalog / Product Set selector wiring

**Status:** PREPARED INCREMENTAL FRONTEND OVERLAY — pending integration; no testing run by user direction.

**Existing Google Merchant Center safeguards confirmed by source review:**

1. The Campaign Creation page already loads Merchant Center links for the selected Google Ads customer and exposes its existing data-source, feed-label and product selectors for Shopping / Demand Gen product-feed configurations.
2. The backend `assertMerchantCenterLinked` checks that the requested Merchant Center ID is linked to the currently selected Google Ads customer before data-source, feed-label or product lookups proceed.
3. Merchant Center developer registration / homepage verification remains an external prerequisite. Do not treat a linked account as proof of feed readiness or enable Shopping / Demand Gen creation while the capability registry marks those create workflows unsupported.
4. Hotel Center remains a separate resource and is not inferred from Merchant Center.

**Meta Catalog / Product Set frontend connection prepared:**

- The source already includes authenticated `GET /lookups/meta/catalogs` and `GET /lookups/meta/catalogs/:catalogId/product-sets` routes. They resolve the selected Ad Account's owning and agency Business relationships, discover owned/client catalogs and re-check that a requested Product Set's Catalog is accessible through the selected account before reading Product Sets.
- The campaign page now calls those routes using the selected Meta account, presents a real Catalog selector followed by a dependent Product Set selector, displays product counts and access warnings, handles empty/error/truncated states, and clears descendant selection on account or Catalog changes.
- IDs are populated from provider resources; no free-text catalog/product-set ID is introduced.
- **Scope boundary:** these selectors are discovery-only in this pass. Catalog and Product Set selections are not sent in the campaign create payload. Native Meta Catalog/Dynamic Product Ad campaign and creative assembly remains part of the later Meta creative integration phase. Do not claim Catalog campaign creation is implemented.

**Prepared changed file:**

- `frontend/src/app/dashboard/campaigns/new/page.tsx` — Meta Catalog and Product Set types, lookup helper, account-scoped loading effects and dependent selectors.

**Testing policy:** no tests, lint, build or provider API calls were run for this pass. Consolidated verification remains deferred to final product readiness.

### Phase 2C1 — Meta Special Ad Category and placement gating

**Status:** PREPARED INCREMENTAL API + FRONTEND OVERLAY — pending integration. No test/build/lint/provider calls were run, following the user's 26 November development instruction.

**Frontend file:** `frontend/src/app/dashboard/campaigns/new/page.tsx`

- Adds a separate restricted-audience flag for Housing, Employment, Credit and Financial Products & Services. It does not treat Issues/Elections/Politics as if it had the same demographic restrictions.
- Omits `age_min`, `age_max`, `genders` and detailed-interest `flexible_spec` for the restricted categories in both the submitted campaign configuration and review/preview configuration.
- Hides age, gender and interest controls while a restricted category is selected, while keeping the policy category list and account custom-audience selectors distinct.
- Replaces free-text comma-separated manual placement values with fixed checkbox choices for Facebook, Instagram, Messenger and Audience Network.
- Removes the legacy Instagram Explore Feed value and Messenger Stories value from v26 placement choices. Facebook Reels uses the provider-specific `facebook_reels` value, not the generic `reels` value.
- Leaves WhatsApp Status unavailable until the WhatsApp identity and creative requirements are implemented.

**Backend file:** `api/src/metaadsAPI/services/meta-campaign-prerequisites.service.ts`

- Validates selected Special Ad Category values, duplicate entries and `NONE` exclusivity.
- Rejects direct API configurations that attempt to bypass restricted-category age, gender or detailed-interest gating.
- Validates publisher platform and per-platform placement values against the AdSyntra Meta v26 allowlist, including platform/position consistency.
- Rejects legacy Instagram Explore and Messenger Stories values even when the request bypasses the frontend.
- Enforces the documented website-traffic + messaging-destination placement conflicts for Facebook Stories, Instagram Search and Instagram Explore Home.

**Policy boundary:** Meta describes Housing, Employment and Credit ads as restricted, and its newer Financial Products & Services category inherits the corresponding housing/employment targeting restrictions in the applicable markets. Issues/Elections/Politics targeting is not automatically subject to those same H/E/C restrictions. Other category and country eligibility remains subject to Meta policy and provider validation; AdSyntra does not infer legal classification from the ad copy or product. Custom Audience eligibility is not certified by this pass.

**Not included yet:** the full objective × destination × creative-format × placement matrix, country-specific location restrictions, WhatsApp Status identity, and provider live validation. Special-category country mapping is covered in Phase 2C2A. Continue the remaining compatibility and market-policy work under Phase 2C2B/creative integration rather than claiming the complete Meta policy engine is finished.

**Meta references used for this pass:**
- Ad Campaign / Special Ad Categories and category targeting note: https://developers.facebook.com/docs/graph-api/reference/adcampaigngroup/
- Ad Campaign objective and placement compatibility matrix: https://developers.facebook.com/docs/graph-api/reference/adcampaigngroup/
- v26.0 placement migration notes: Instagram Explore Feed removal and Messenger Stories removal from `messenger_positions` (Meta Graph API v26.0 changelog).
- Financial Products & Services category restrictions: Meta Special Ad Category documentation; current country-specific policy may differ by product and market.

### Phase 2C2A — Meta Special Ad Category country mapping

**Status:** PREPARED INCREMENTAL API + FRONTEND OVERLAY — pending local integration. No tests, lint, builds or provider calls were run, following the 26 November development instruction.

**Frontend:** `frontend/src/app/dashboard/campaigns/new/page.tsx`

- Uses the existing included country code field as the selected market scope for the Special Ad Category country field. Country values are normalized to uppercase and deduplicated.
- When one or more Special Ad Categories are selected, requires at least one included country code. This also applies when the audience is otherwise specified using region, city or ZIP targeting: add the corresponding country code in the Included Countries field.
- Sends the same included countries as `special_ad_category_country` in the raw campaign intent and `specialAdCategoryCountries` in the normalized provider configuration.
- Explains that Meta API country codes must be used (for example `IN`, `US`, `GB`, not `UK`) and displays the country list in the review summary.

**Backend:**

- New shared allowlist: `api/src/metaadsAPI/services/meta-special-ad-category.constants.ts`.
- `api/src/metaadsAPI/services/meta-campaign-prerequisites.service.ts` validates the field as an array, checks the Meta-supported country enum, rejects duplicates, requires country values when a Special Ad Category is selected, and ensures selected category countries are also present in `geo_locations.countries` when country-level targeting is supplied.
- `api/src/routes/campaign.routes.ts` reads camelCase or Graph API snake_case input and maps it into the provider Campaign create input.
- `api/src/metaadsAPI/services/campaign-creation.ts` validates the normalized values and serializes `special_ad_category_country` into the actual Graph API Campaign creation form body. The value is not merely preview metadata.

**Scope boundary:** AdSyntra uses the included countries already selected for delivery as the campaign's Special Ad Category country declaration. If the user targets only regions/cities/ZIPs, they must also add the parent country code in Included Countries. This pass does not infer the country from a region or city resource, nor does it determine whether the ad legally belongs to a category. Country-specific restrictions and legal classification remain subject to Meta policy and advertiser confirmation.

**Reference:** Meta Marketing API Ad Campaign reference lists `special_ad_category_country` as an array of country-code enum values alongside `special_ad_categories`. Public reference: https://developers.facebook.com/docs/marketing-api/reference/adcampaigngroup/


### Phase 2C2B2 — META-01 new Single Image + Website creative path repair

**Status:** PREPARED INCREMENTAL FRONTEND + BACKEND OVERLAY — pending local integration. Source corrections are prepared, but the Meta Live gate remains in place until final provider and regression verification. No tests, lint, typechecks, builds or provider calls were run under the 26 November development instruction.

**Frontend:** `frontend/src/app/dashboard/campaigns/new/page.tsx`

- Removes the preselected third-party sample image URL, demo Meta Video ID and sample carousel card URLs. The user must choose real media or enter a valid asset URL.
- The initial META-01 notice limited the workflow to Single Image + Website. Phase 2C2B3A prepares Single Video + Website; Phase 2C2B3B prepares Carousel + Website; Phase 2C2B3C1 now prepares Single Image/Single Video + Page-owned Instant Form. Messaging and App remain out of scope until their dedicated destination-specific workflows are implemented. Catalog/Product Set discovery remains separate from native Catalog Ad execution.

**Backend:**

- `api/src/metaadsAPI/services/campaign-creation.ts`: removes the hard-coded existing Page-post ID fallback. Existing-post mode is now explicit opt-in only. Fixes the image URL validation condition to check the actual supplied URL; a missing image hash and URL is rejected instead of validating an uninitialized local variable. The base META-01 path supports `SINGLE_IMAGE` + `WEBSITE`; Phase 2C2B3A prepares the additional `SINGLE_VIDEO` + `WEBSITE` creative path.
- `api/src/routes/campaign.routes.ts`: validates creative format and destination before image upload in the standard global execution path; adds the same check to creative retry before upload; maps format and destination type into the shared creative service input; retains a second guard in the campaign bundle builder.
- The existing private Asset Library-to-Meta image upload path remains in place and passes the uploaded account-scoped image hash into the new `object_story_spec` creation path.

**Scope boundary:** This corrects the source path and prevents silent conversion of unsupported formats into an image creative. It does not establish that the provider API accepts the new creative or that the selected Page/account is eligible. The Phase 2A registry must continue to mark Meta create as `PARTIAL` until the consolidated final readiness phase has completed validate-only, authorised live creation with a paused campaign, resource persistence, retry and regression checks. Do not remove the Meta Live gate on source inspection alone.

**Prepared files:**
- `frontend/src/app/dashboard/campaigns/new/page.tsx`
- `api/src/metaadsAPI/services/campaign-creation.ts`
- `api/src/routes/campaign.routes.ts`
- `adsyntra_campaign_capability_registry_phase2c2b2_meta01.patch`
- `AdSyntra_Campaign_Capability_Registry_Phase2C2B2_META01_Overlay.zip`

### Phase 2C2B3 — Meta Video, Carousel and destination-specific creative pipelines

#### Phase 2C2B3A — Single Video + Website creative pipeline

**Status:** PREPARED incremental API + frontend overlay — pending local integration. No tests, lint, typechecks, builds or live provider calls were run, following the user's decision to consolidate those checks at final product readiness.

- Adds owner-scoped reading of private Asset Library VIDEO files. Current accepted formats are MP4, MOV and WebM, up to 100 MB, matching the existing Asset Library upload limit.
- Uploads the binary directly as multipart media to the selected account's Meta `/act_{account_id}/advideos` endpoint. Private AdSyntra storage URLs and browser-supplied Meta video IDs are not sent to the provider.
- Waits for Meta video processing to reach `READY`, then resolves the preferred HTTPS thumbnail required by the video creative payload.
- Persists the returned video ID, selected account, Asset Library asset ID, file metadata, processing state and thumbnail in the provider's existing `creativeAssetUploads` configuration. Reuses a previously uploaded video only when both asset and Meta account match.
- Builds provider-native `object_story_spec.video_data` with `video_id`, `image_url`, message, title, optional link description and Website CTA; Phase 2C2B3C1 reuses the video pipeline with a Page-owned Instant Form CTA value.
- Updates the frontend so the user selects exactly one private video from Asset Library instead of typing a raw Meta video ID.
- Validation-only checks the selected private asset but does not upload it to Meta. Live upload only occurs in the existing provider execution path; Meta remains blocked by the campaign capability registry's `PARTIAL` status until final release verification.
- Extends the creative retry path to reuse or upload the same account-scoped video and wait for processing before creating the AdCreative.

**Boundaries for this base slice:** This pass supports Single Video + Website only. Phase 2C2B3C1 separately reuses the same private-video upload path for Single Video + Instant Form. Video file codec/duration policy beyond the existing MP4/MOV/WebM and 100 MB constraints, placement eligibility and provider live behaviour remain part of consolidated final QA. Carousel Instant Form, Messaging and App remain outside this slice. The video upload service uses Meta Graph API v26.0; no version upgrade is included.

#### Phase 2C2B3B — Carousel + Website creative pipeline

**Status:** PREPARED incremental overlay; depends on Phase 2C2B3A and is not confirmed locally integrated.

- Replaces the text-only carousel draft with structured cards tied to private Asset Library image IDs.
- Supports 2–5 cards in the prepared UI. Each card has its own image asset and destination URL, with optional headline/description fields.
- Uploads each private card image to the selected Meta Ad Account and maps the account-scoped returned image hash into ordered `link_data.child_attachments`.
- Preserves user-selected card order and disables Meta's automatic attachment reordering.
- Includes the same private-media resolution/reuse behaviour in the creative-retry path.
- Does not accept manually supplied Meta image hashes or private storage URLs as provider image URLs.
- Catalog/Product Set, Messaging and App destinations remain outside this pass. Instant Form is implemented separately in Phase 2C2B3C1 for Single Image and Single Video; it is not part of this carousel slice.

#### Phase 2C2B3C1 — Meta Instant Form + Single Image/Single Video

**Status:** PREPARED incremental frontend + API source files — local integration not confirmed. No test/build/provider-validation commands were run; all verification remains deferred to final product readiness.

- Reuses the existing Page-owned Instant Form selector and backend prerequisite check. The selected form must be active/available and owned by the selected Facebook Page and Meta identity/account.
- Limits this slice to `SINGLE_IMAGE` and `SINGLE_VIDEO`. Carousel Instant Form is not included because every card requires its own native lead-form CTA mapping.
- Requires shared objective `LEADS` → Meta `OUTCOME_LEADS`, Ad Set `optimization_goal: LEAD_GENERATION`, and native destination `ON_AD`.
- Supplies `promoted_object.page_id` from the selected Page. Website Pixel and Custom Conversion promoted-object data are omitted for Instant Form.
- Uses Meta’s `https://fb.me/` link with `call_to_action.value.lead_gen_form_id`; Website URL validation is skipped. CTA choices are restricted to `APPLY_NOW`, `DOWNLOAD`, `GET_QUOTE`, `LEARN_MORE`, `SIGN_UP` and `SUBSCRIBE`.
- Reuses the private Asset Library image/video upload path. Validation-only validates owned asset references but does not upload media or create Meta resources.
- Creative retry re-checks the effective Page/Form relationship after request overrides and verifies the saved Leads / `LEAD_GENERATION` configuration before creating the replacement Ad Creative.

**Prepared standalone files:** `page.meta-instant-form-single-image-video.updated.tsx`, `campaign.routes.meta-instant-form.updated.ts`, `campaign-creation.meta-instant-form.updated.ts`. The service import also depends on `meta-special-ad-category.constants.ts`, supplied separately at `api/src/metaadsAPI/services/meta-special-ad-category.constants.ts`; retain the `.js` import extension under NodeNext.

**Not included:** Messaging (Messenger, Instagram Direct, WhatsApp), App destination, Carousel Instant Form and the full objective × creative × placement matrix.

#### Phase 2C2B3C2 — Meta Messaging creatives

**Status:** PREPARED STANDALONE SOURCE — PENDING LOCAL INTEGRATION; provider verification deferred to final readiness.

**Prepared scope:**
- Supports Meta **Single Image** and **Single Video** only with one selected destination: Messenger, Instagram Direct or WhatsApp.
- Restricts this first slice to the shared **Engagement** objective mapped to Meta `OUTCOME_ENGAGEMENT`, Ad Set `CONVERSATIONS`, and `IMPRESSIONS` billing.
- Reuses the existing Page-scoped messaging identity lookup. The backend re-queries the selected identity before campaign creation and creative retry; client-supplied identity IDs alone are not trusted.
- Requires the selected Facebook Page; Instagram Direct additionally requires the linked Instagram professional account to match `instagramActorId`; WhatsApp requires a connected Page WhatsApp Business number.
- Sends the provider-native Ad Set `destination_type` (`MESSENGER`, `INSTAGRAM_DIRECT` or `WHATSAPP`) and `promoted_object.page_id`.
- Maps CTAs automatically: `MESSAGE_PAGE`, `INSTAGRAM_MESSAGE` or `WHATSAPP_MESSAGE`; includes `app_destination`, `app_destination_page_id`, and the selected WhatsApp number where applicable.
- Omits Website destination URL for messaging creatives. Keeps private Asset Library image/video upload flows for the selected format.
- Enforces Automatic placements only until a version-specific, destination-specific manual placement matrix is implemented.
- Extends creative retry to revalidate the messaging identity and reuse the saved messaging destination contract.

**Explicit exclusions:** Leads → Messaging, multi-destination ads, Carousel, App, manual messaging placements, custom WhatsApp greeting/pre-filled message (`page_welcome_message`) and any automatic campaign Live release. These require their own capability and provider-validation work.

**Files prepared:**
- `frontend/src/app/dashboard/campaigns/new/page.tsx`
- `api/src/routes/campaign.routes.ts`
- `api/src/metaadsAPI/services/campaign-creation.ts`

**Validation policy:** no tests, lint, typecheck, build or Meta provider call was run for this pass, per the agreed feature-first approach. The user must integrate these standalone replacements. Meta Live remains gated for final product readiness.

**API-version note:** the saved source chain has `META_ADS_API_VERSION` fallbacks of `v27.0` in the messaging lookup and campaign-creation modules, while the roadmap's intended Meta v26.0 policy remains in earlier planning. This pass does not change the version. Confirm the deployed environment's configured `META_ADS_API_VERSION` (without sharing secrets) and reconcile all Meta modules to one intentional version before final QA. Public references consulted for CTA and ODAX fields currently show v27.0; they are not being treated as proof of v26 compatibility.

**References:** Meta Graph API Ad Campaign objective/optimization matrix (`https://developers.facebook.com/docs/graph-api/reference/ad-campaign/`); Ad Creative Link Data (`https://developers.facebook.com/docs/marketing-api/reference/ad-creative-link-data/`); Generate Previews CTA value fields (`https://developers.facebook.com/docs/marketing-api/reference/generatepreviews/`).

#### Phase 2C2B3C3 — Meta App destination creatives

**2C2B3C3A — Account-scoped advertisable application selector (prepared):**
- Reuses the existing `/api/campaigns/lookups/meta/applications` lookup helper.
- Sends the selected Ad Account ID with each list and pagination request.
- Clears selected app and store identity when the selected Ad Account changes.
- Backend requires the requested account to belong to the authenticated user and be their active selected Meta account.

**2C2B3C3B — Android/iOS store identity validation (prepared):**
- Requires an explicit Android (Google Play) or iOS (Apple App Store) choice.
- Android accepts only `https://play.google.com/store/apps/details?id=<valid.package.name>`.
- iOS accepts Apple App Store listing URLs containing a numeric `/id<digits>` segment.
- Rejects HTTP, embedded credentials, mismatched host/platform, invalid store path and missing/invalid store identifier.
- Keeps Meta Application ID separate from the Android package name and Apple numeric store listing ID.
- Includes the same normalized store URL in `promoted_object.object_store_url` and the creative destination intent; backend rejects mismatches and rechecks account advertisability using the Meta edge's `app_id` filter.
- App selector and store identity validation remain prerequisites to the App Install execution source described below.

**2C2B3C3C — App Install Ad Set and creative execution (prepared 27 November 2026):**
- Restricts this first App Promotion execution slice to Meta Ads only; Google App campaigns are a separate provider workflow.
- Enforces `OUTCOME_APP_PROMOTION` + `APP_INSTALLS` + `IMPRESSIONS` and Automatic placements.
- Maps the Ad Set to `destination_type: APP_STORE` with a server-resolved `promoted_object` containing the selected advertisable Meta `application_id` and normalized `object_store_url`.
- Forces targeting to `device_platforms: ["mobile"]` and `user_os: ["ANDROID"]` or `["IOS"]` based on the explicit store choice.
- Supports Single Image and Single Video. Carousel remains disabled for this destination.
- Uses `INSTALL_MOBILE_APP` in the native CTA, and sends the exact same normalized store listing URL in the creative link and Ad Set promoted object.
- Adds `tracking_specs` for `mobile_app_install` associated with the same Meta Application ID. This is the basic install signal only; App Events / offsite conversion optimization is a separate future workflow.
- Does not attach Website Pixel / Purchase promoted-object data to App Install requests.
- Revalidates the selected Meta Application against the active selected Ad Account during execution and creative retry. All provider resources remain `PAUSED`.
- Validation-only checks the normalized configuration locally; it does not call Meta's validation API or create provider resources.

**Prepared standalone source replacements:**
- `frontend/src/app/dashboard/campaigns/new/page.tsx` — `page.meta-app-install.updated.tsx` (based on the latest 27 November Google language-resource page source and retaining the previously prepared account-scoped App selector/store identity flow).
- `api/src/routes/campaign.routes.ts` — `campaign.routes.meta-app-install.updated.ts`.
- `api/src/metaadsAPI/services/campaign-creation.ts` — `campaign-creation.meta-app-install.updated.ts`.
- `api/src/metaadsAPI/services/meta-advertisable-application-lookups.service.ts` — `meta-advertisable-application-lookups.service.updated.ts` (account-scoped application filter dependency used by the route).

**API version:** the prepared campaign service and advertisable-application lookup default to Meta Graph API `v26.0`; `META_ADS_API_VERSION` or `META_GRAPH_API_VERSION` environment overrides are still honored by the respective module. This does not certify every Meta module is globally aligned to v26.0. Review all Meta modules and deployed configuration at final QA.

**Status / scope boundary:** PREPARED STANDALONE SOURCE — PENDING LOCAL INTEGRATION. No tests, lint, typecheck, build or provider API request was run for this pass. Public Meta examples currently surfaced for App Install detail are v27.0 references; they explain the mapping but do not prove v26.0 compatibility. Keep Meta Live gated pending final v26 contract verification and consolidated tests.

After these destination pipelines, continue with complete creative-format × placement and device compatibility for Meta Graph API v26.0. Only after each corresponding pipeline exists should its capability be marked implemented in source; provider validation remains deferred to final release QA.

### Phase 2C2B1 — Meta objective/destination-aware manual placement policies

**Status:** PREPARED INCREMENTAL FRONTEND + BACKEND OVERLAY — pending local integration. No tests, lint, typechecks, builds or provider calls were run, following the user's 26 November instruction to defer consolidated verification until final product readiness.

**Frontend source:** `frontend/src/app/dashboard/campaigns/new/page.tsx`

- Adds a conservative policy resolver using the actual provider objective, selected optimization goal and creative destination.
- Awareness (`OUTCOME_AWARENESS`): manual platform options are limited to Facebook, Instagram and Audience Network. Position options are narrowed to the documented Facebook Feed/Video Feeds/In-stream Video/Stories, Instagram Feed and Audience Network Classic/In-stream Video inventory.
- Instant Form lead generation (`OUTCOME_LEADS` + `LEAD_GENERATION` + `INSTANT_FORM`): manual platforms are limited to Facebook and Instagram; position choices are narrowed to Facebook Feed/Stories and Instagram Feed.
- App Install (`OUTCOME_APP_PROMOTION` + `APP_INSTALLS` + `APP`): manual platforms are limited to Facebook, Instagram and Audience Network.
- Traffic with Messaging destination: Facebook Stories are removed for Messenger; Instagram Search and Explore Home are removed for Messenger/WhatsApp. Existing Graph API v26 placement allowlist rules remain in place.
- Incompatible selected placements are removed when the user changes to a configuration that does not support them; the user can select from the broader set again after changing configuration back.

**Backend source:** `api/src/metaadsAPI/services/meta-campaign-prerequisites.service.ts`

- Extends the existing manual-placement validator to receive the campaign objective, ad-set optimization goal and creative destination information.
- Enforces the corresponding supported platform and position combinations server-side, preventing callers from bypassing frontend filters.
- Validates only manual placement selections. Automatic placements remain on the provider-optimized path and are not rewritten by this pass.
- Adds `instream_video` to the configured Audience Network v26 allowlist, while preserving existing exclusions for legacy Instagram Explore and Messenger Stories.

**Scope boundary:** This is a conservative, documented subset—not the complete Meta compatibility engine. Creative-format × placement validation, device-specific combinations, all Engagement/Messaging destinations, catalog placements and the complete objective-specific optimization/billing/bid matrix remain for Phase 2C2B3C and subsequent creative integration. The selected policy uses the project’s configured Meta Graph API v26.0; no API version upgrade is included. Meta’s public Ad Campaign reference currently documents the relevant Objective and Placements limitations; reconcile any version-specific differences during final release verification: https://developers.facebook.com/docs/marketing-api/reference/adcampaigngroup/.

**Prepared files:**
- `frontend/src/app/dashboard/campaigns/new/page.tsx`
- `api/src/metaadsAPI/services/meta-campaign-prerequisites.service.ts`
- `adsyntra_campaign_capability_registry_phase2c2b1.patch`
- `AdSyntra_Campaign_Capability_Registry_Phase2C2B1_Overlay.zip`

### Phase 2C2B2 — creative-format and remaining objective compatibility

- Add creative-format × placement constraints for Single Image, Single Video and Carousel, using explicit provider-supported combinations.
- Complete further objective/destination combinations, including Engagement and messaging objectives where the AdSyntra request model has the required destination and identity data.
- Continue objective-specific optimization goal, billing event and bid strategy dependencies without exposing unsupported or unimplemented options.
- Add device constraints where the UI and provider request model actually collect `device_platforms`; do not infer them when the field is absent.
- Add Google conditional prerequisites and options for Demand Gen, Search for Travel, Shopping, App and Local Services PMax modes as those workflows are implemented.
- Represent fields as resource lookup, fixed versioned option, user input, derived value, conditional requirement or external prerequisite; retain provider-native payload models.

### Testing and release gate

No test/build/lint/provider-validation cycle is required after each development pass. Keep a written release checklist while implementing. After the agreed feature backlog is built, perform the full API/frontend tests and builds, automated tests, authorized Google/Meta validate-only and controlled live tests, account permission matrix, failure/retry/idempotency checks, regression coverage for Passes 4.1A/B/C and final security review.

**Important release blocker remains:** Phase 2C2B2 prepares the META-01 source correction; Phase 2C2B3A/B prepare Single Video + Website and Carousel + Website; Phase 2C2B3C1 prepares Single Image/Video + Page-owned Instant Form. These source changes are not provider-verified and do not clear the Meta Live gate. Keep Meta Live gated until consolidated final validate-only, authorised paused live-create, persistence, retry and regression checks pass. Continue with Messaging (2C2B3C2) and App (2C2B3C3).

## 8.1 Latest campaign wizard and Asset Library corrections — 27 November 2026

These changes were prepared in response to the latest user-reported errors. They are source deliverables, not confirmed local integration or provider verification. The latest standalone frontend replacement delivered in this conversation is `page.meta-step-scoped-validation.updated.tsx` for `frontend/src/app/dashboard/campaigns/new/page.tsx`.

### A. Missing Special Ad Category constants module

- Runtime reported `ERR_MODULE_NOT_FOUND` for `api/src/metaadsAPI/services/meta-special-ad-category.constants.js`, imported from `campaign-creation.ts`.
- The missing TypeScript source file was supplied separately as `meta-special-ad-category.constants.ts` for `api/src/metaadsAPI/services/meta-special-ad-category.constants.ts`.
- Keep the existing relative `.js` import extension in TypeScript source when using the project's NodeNext-style module resolution; the source file itself is `.ts`.
- **Status:** standalone source file supplied; local file placement and runtime resolution are not confirmed. Include it when integrating Phase 2C2A.

### B. Meta Single Image — private Asset Library image validation

- A selected private Asset Library image is a valid image source even though it has no public HTTPS `imageUrl`.
- Frontend validation should require a valid HTTPS image URL only when no valid private Asset Library image is selected:

```ts
if (
  metaCreativeFormat === "SINGLE_IMAGE" &&
  !selectedMetaPrivateImageAsset &&
  !isHttpsUrl(metaImageUrl)
) {
  // show the image-required validation message
}
```

- The private asset reference must be included in the campaign request and uploaded by the backend to the selected Meta Ad Account before creative creation. Do not turn a private storage URL into a provider-facing public image URL.
- **Status:** focused frontend patch prepared; included behaviour is present in the latest standalone frontend replacement. Local integration/provider verification pending.

### C. Meta Single Video — Asset Library selection

- Removed the obsolete warning that private videos could only be viewed and could not be attached in Campaign Creation.
- Added a **Select for Meta Video** action on eligible video cards when Meta is selected, the format is `SINGLE_VIDEO` and destination is `WEBSITE` or `INSTANT_FORM`.
- Prepared UI limits: MP4, MOV and WebM; maximum file size 100 MB; assets without a private content file or with incompatible MIME/size/platform constraints cannot be selected.
- The form shows the selected video's name and sends the explicitly selected video asset reference. It must not treat every attached VIDEO in the Library as the selected Meta creative.
- Backend video pipeline from Phase 2C2B3A resolves private file ownership, uploads to the selected Meta Ad Account, waits for processing and creates the `video_data` creative. Validation-only does not upload media.
- **Status:** frontend selection and backend pipeline prepared; local integration/provider validation pending.

### D. Format-aware `creativeAssetReferences` filtering

A user-provided validate-only request exposed this error:

`Asset 6b07f97171054c509809273e campaignCreativeTarget.platform must match one of its intended platforms.`

The supplied request had:
- An AI-generated IMAGE assigned to the `meta-single-image` requirement, with `campaignCreativeTarget.platform: "metaAds"`.
- `intendedPlatforms: []` for that image in a `SINGLE_VIDEO` campaign.
- A separate manually selected VIDEO intended for `metaAds`.

The format-aware frontend payload builder now:
- derives the intended platforms for the current campaign and creative assignment;
- includes a `campaignCreativeTarget` only when its platform is actually present in `intendedPlatforms`;
- filters out asset references whose `intendedPlatforms` array is empty;
- keeps the unused image untouched in the Asset Library; it is omitted from this campaign request, not deleted;
- preserves the selected Meta video reference for `SINGLE_VIDEO`.

Do not weaken the backend contract that a non-empty `campaignCreativeTarget.platform` must match an intended platform. Fix the payload source rather than bypassing this validation. The latest frontend file applies the same filtering to both the prepared preview payload and the final request payload.

**Status:** frontend filtering prepared in the latest standalone page replacement; user has not yet confirmed local integration or a successful repeat of the request.

### E. Wizard step-scoped validation

The current campaign wizard uses a **one-based `step` state from 1 through 5**. The human-visible step-to-validator mapping in the latest source is:

| `step` value | Wizard section | Validator |
|---:|---|---|
| `1` | Campaign Basics | `validateBasics()` |
| `2` | Platform Settings | `validatePlatformSettings()` |
| `3` | Ad Structure / Ad Set setup | `validateAdStructure()`; Pixel and conversion selection belong here |
| `4` | Ad Creation | `validateAdCreation()`; Page/Instagram identity, copy, creative format, private image/video and destination fields belong here |
| `5` | Review | No new early-step field validation; final campaign preparation still re-validates the complete configuration |

**Important numbering clarification:** in the current source, Ad Creation is `step === 4`, not `step === 3`. `step === 3` is Ad Structure / Ad Set setup. Keep guards aligned with the actual one-based state and the visible wizard labels; do not copy a sample step number without confirming the current wizard mapping.

- `goNext()` validates only the step the user is leaving.
- `handleStepClick()` validates each required step being crossed when navigating forward.
- `prepareCampaign()` performs the complete validation sequence (`validateBasics`, `validatePlatformSettings`, `validateAdStructure`, `validateAdCreation`) before generating the final request, including when preparation is initiated from Review (Step 5).
- Do not wrap all creative checks in an incorrectly numbered condition that would skip them during final submission. Step-scoped navigation and full final-submit validation are separate responsibilities.

**Status:** updated standalone frontend page prepared; local integration and UI confirmation pending.

### F. Meta Instant Form destination and creative wiring — Phase 2C2B3C1 (26 November 2026)

The prepared source slice supports a Page-owned Instant Form destination with either Single Image or Single Video. It reuses the existing Instant Form lookup UI and API prerequisite resolver; no new free-text form ID field or lookup family is introduced.

- The user selects the shared **Leads** objective. Provider mapping is Meta `OUTCOME_LEADS` with Ad Set `LEAD_GENERATION` and `billing_event: IMPRESSIONS`.
- The Ad Set destination is `ON_AD`; `promoted_object` contains the selected Facebook `page_id`. Website Pixel and Custom Conversion promoted-object data are omitted for this destination.
- The Creative destination object carries `type: INSTANT_FORM` and the selected numeric `instantFormId`. The backend uses `https://fb.me/` and maps the selected form to `call_to_action.value.lead_gen_form_id` for both image and video creatives.
- Instant Form CTA choices are limited to `APPLY_NOW`, `DOWNLOAD`, `GET_QUOTE`, `LEARN_MORE`, `SIGN_UP` and `SUBSCRIBE`.
- Website URL validation is not applied to Instant Form ads. Page/form ownership and availability checks run before provider execution and again on creative retry after overrides.
- Scope excludes Carousel Instant Form, Messaging and App. Meta Live creation remains blocked pending consolidated final QA.

**Status:** three standalone source files prepared; local integration and provider validation are not confirmed.

### G. Current implementation/output handoff rule

- Do not provide generic or repetitive README files, redundant integration guides or documentation-only bundles unless explicitly requested or essential to an integration that cannot be expressed in the source itself.
- By default, provide only the changed/new standalone source files. Include a patch only when it materially helps the user apply a focused change to a large existing file.
- Do not send multiple competing full-page replacements without identifying which one is the latest consolidated version. For the latest wizard fixes above, use the newest standalone page replacement and reconcile it with the user's local changes before replacing the page.
- Keep `plan.md` and the pending-features backlog current, but do not duplicate the whole roadmap in each feature delivery.

## 9. Rules for keeping this roadmap current

At the end of every implementation pass, update both this file and the detailed pending-features backlog with:

1. Pass ID, scope and date.
2. Exact source files changed and integration dependencies.
3. Provider API version/configuration used (do not silently change it).
4. Implementation details, limitations and external prerequisites.
5. Checks deliberately deferred under the agreed final-QA policy; do not invent results.
6. The next build task and any senior review feedback.
Never replace a status with DONE based on assumptions. Use the following progression:

`PENDING → PREPARED → INTEGRATED / IMPLEMENTED → FINAL QA → PROVIDER VALIDATED → USER CONFIRMED / DONE`

During feature development, do not require a separate QA stage between every pass. Preserve the known status accurately and hold `FINAL QA` as the consolidated release gate.

---

## 10. Official references used for the Google transition plan

- Google Display campaigns moving to Demand Gen: https://support.google.com/google-ads/answer/17051545
- Google Demand Gen overview: https://support.google.com/google-ads/answer/13695777
- Google Hotel campaigns and Q4 2026 transition: https://support.google.com/google-ads/answer/9238461
- Google Search campaigns for Travel / Hotel Center feed setup: https://support.google.com/google-ads/answer/9238463
- Google Ads API Local Services campaigns and Local Services Performance Max: https://developers.google.com/google-ads/api/docs/campaigns/local-service-campaigns
- Google Ads API v26 release notes: https://developers.google.com/google-ads/api/docs/release-notes

Provider documentation and account eligibility can change. Re-check these references before implementing a new campaign workflow or changing capability gates.


### Phase 2C2B3C3D — Native Meta Catalog / Product Set Dynamic Product Ads
**Status: PREPARED INCREMENTAL FRONTEND + BACKEND SOURCE — PENDING LOCAL INTEGRATION; LIVE CREATION STILL GATED**

- Added a dedicated Dynamic Product Ad mode to the Meta campaign wizard. It uses the existing account-scoped Catalog and Product Set selectors; Catalog segments and empty products/Product Sets are excluded or rejected.
- Initial supported mapping is deliberately narrow: Meta-only, `OUTCOME_SALES`, Website destination, `LINK_CLICKS` optimization and billing, Automatic placements, and the fixed `SHOP_NOW` CTA.
- The Campaign receives `promoted_object.product_catalog_id`; the Ad Set receives `promoted_object.product_set_id` plus `custom_event_type: PURCHASE`; the Ad Creative receives `product_set_id` and `object_story_spec.template_data`.
- The backend re-resolves the selected Catalog and Product Set through the selected Meta account's accessible Business relationships and confirms that all submitted IDs match. Catalog-sourced product media is not treated as an AdSyntra private image/video upload.
- The route's existing `evaluateCampaignCreateGate` remains unchanged. Meta Live creation remains blocked while the capability registry reports the Meta create path as partial. The Catalog path can be locally validated only; no provider-side Meta dry-run is implied.
- The currently surfaced official Meta Marketing API reference pages are labelled v27.0. The project continues to target v26.0 by default and has not been upgraded; v26.0 compatibility still requires final provider-contract verification.
- **Files prepared:** `frontend/src/app/dashboard/campaigns/new/page.tsx`, `api/src/routes/campaign.routes.ts`, and `api/src/metaadsAPI/services/campaign-creation.ts`.
- **Verification:** no tests, lint, typecheck, build or provider API calls were run, per the agreed feature-first development approach. Local integration is not confirmed.

### App Install status update — 27 November 2026
- Meta App Install remains **PREVIEW ONLY** because there is currently no published Android/iOS application available to advertise and no advertiser-accessible Meta application has been returned by the selected Ad Account lookup.
- Keep the account-scoped `advertisable_applications` lookup and backend ownership check. Do not accept manual/fabricated Meta Application IDs for provider execution.
- Live App Install creation remains an external dependency until an eligible authorised application and store listing are available. Do not mark this capability production-ready based on preview payloads.
