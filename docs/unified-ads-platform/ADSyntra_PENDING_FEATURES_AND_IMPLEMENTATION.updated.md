# AdSyntra — Pending Features & Implementation Gaps

**Audit date:** 26 November 2026  
**Audit basis:** `AdSyntra.zip` supplied in this conversation, plus the Campaign Capability Registry Phase 1 integration prepared from that source snapshot  
**Scope:** Existing frontend, backend routes/services, campaign creation wizard, project notes and included research documents.  
**Purpose:** Keep a reliable list of what is complete, what exists only partially, what is not implemented, and what should receive priority later. This is a source-code audit, not a live API certification.

---

## 1. Executive summary

The current project is more advanced than the October and November 20 research notes describe. The current ZIP contains a combined Next.js + Express application, per-user provider connections, encrypted provider credentials, MongoDB persistence, provider lookup routes, campaign creation, asset management, conversion management, billing, audience screens and reporting foundations.

The main risk is no longer simply “missing modules”. Several screens expose more functionality than the live provider execution path can safely deliver. The Campaign Capability Registry is being extended in incremental phases. The user has directed that feature development continue without per-phase testing cycles; consolidated test/build/provider verification will occur when the product feature set is complete. The most important examples are:

1. **META-01 was a source blocker in the original supplied ZIP; a correction is now prepared.** Phase 2C2B2 removes the implicit existing-Page-post fallback, fixes supplied image URL validation, and keeps existing-post mode explicit. The latest standalone creative service reflects the prepared correction; local integration and final provider verification remain unconfirmed.
2. **Google's global campaign creation route only dispatches Search, Display and Performance Max.** Other visible or partially prepared campaign types are rejected by the global execution route. Some lower-level Demand Gen helpers exist, but that is not a complete campaign workflow.
3. **Google Proximity Radius Targeting is now present in the supplied source.** The API route, Search / Display / Performance Max target mapping and campaign-wizard radius controls are present. The user confirmed the integrated radius input works. A Google Ads validate-only or live provider call is not evidenced by this source audit.
4. **Meta Catalog and Product Set discovery exists, but native Catalog/Dynamic Product Ad execution is still incomplete.** Account-scoped lookup routes and wizard selectors are prepared; selected Catalog/Product Set values are not yet sent into a provider-native catalog creative workflow.
5. **Meta creative coverage is being added in staged source slices.** Single Video + Website, Carousel + Website, and Instant Form + Single Image/Single Video have prepared implementations. Messaging, App and Catalog/Product Set creative execution remain open. None of these prepared source changes is provider-certified; Meta Live remains gated until consolidated product-readiness checks.
6. **Automated test coverage remains limited.** Campaign Capability Registry Phase 1 adds a focused API registry test file and `test:capabilities` script. The broader campaign, provider mutation, retry and frontend flows still lack a comprehensive automated test suite.
7. **Google Ads API versions are inconsistent across code paths.** The shared utility hard-codes v25 while the newer campaign-creation service defaults to v26.

Pass 4.1C is treated as **DONE / USER CONFIRMED**. Campaign Capability Registry Phase 1 is user-confirmed integrated. Phase 2A, 2B1, 2B2, 2C1, 2C2A, 2C2B1, 2C2B2, 2C2B3A, 2C2B3B and 2C2B3C1 are prepared in separate incremental source deliveries; integration into the user's current local working tree is not confirmed unless separately reported. The Meta creative implementation remains gated from Live execution until final release verification.

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
| 4.1C — Google Proximity Radius Targeting | DONE / USER CONFIRMED | The supplied source contains the proximity target input, radius UI state, validation, Search / Display / Performance Max mutation mapping and route handling. The user confirmed the radius input works. Google provider validate-only/live execution remains a separate verification step. |

### 3.5 Other existing modules

| Module | Current status | What is present |
|---|---|---|
| Campaign Capability Registry | PHASE 1 USER-CONFIRMED INTEGRATED; PHASE 2A PREPARED | Phase 1 registry/API/proxy/wizard status display was confirmed integrated by the user on 25 November 2026. Phase 2A enforcement and dynamic option gating are prepared but pending local integration. The existing creative-specific registry is preserved. |
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

The source previously set an existing-post ID when `input.existingPostId` was empty. That forced the `object_story_id` branch instead of building a new `object_story_spec` image/link creative. Phase 2C2B2 removes the fallback and makes existing-post mode explicit opt-in. It also fixes an image URL validation condition that checked the uninitialized local `imageUrl` instead of the supplied URL.

**Required work:**

- Make existing-post mode explicitly opt-in; never inject a demo post ID.
- When no existing post is selected, validate the selected Page, image hash or supported image URL, destination URL, text, headline and CTA, then create a new creative.
- Ensure any selected existing post belongs to the selected Page and is user-authorized.
- The source now routes ordinary new-image requests into `object_story_spec`; the consolidated final test plan must prove that it no longer references a fallback Page post.
- The source removes the default sample image, demo video ID and example carousel URLs from the campaign builder.
- Keep the Meta create capability `PARTIAL` and Meta Live blocked until final validate-only, authorised live and regression checks are complete.

**Acceptance criteria:** Prepared source removes implicit existing-post substitution and checks supplied image URLs correctly. The Single Image + Website path supports an account-uploaded image hash or valid HTTPS image URL. Existing-post mode is explicit opt-in. Follow-on phases extend destination/format coverage; integration and release acceptance remain pending consolidated final QA and authorised provider checks.

### META-02 — Make the creative UI match the real backend capability

**Status:** PARTIAL  
**Priority:** P0/P1  
**Evidence:** The original supplied source exposed Single Image, Single Video and Carousel controls without a complete matching provider-native execution contract. Subsequent prepared source slices add the explicit new-image path, private-video upload and `video_data` construction, Carousel `child_attachments`, and Page-owned Instant Form CTAs for Single Image/Single Video. The current working delivery is still a set of standalone source replacements, not a user-confirmed local integration.

**Required work:**

- Preserve the corrected Single Image + Website path, including private Asset Library image upload and explicit existing-Page-post mode.
- Keep the prepared Single Video + Website upload/processing/`video_data` path and its creative retry support.
- Keep the prepared Carousel + Website path with ordered private card images and native `child_attachments`.
- Keep the prepared Instant Form path for Single Image and Single Video, including Page-owned form resolution, `OUTCOME_LEADS`, `LEAD_GENERATION`, `ON_AD`, Page `promoted_object` and `lead_gen_form_id` CTA mapping.
- Implement separate Messenger, Instagram Direct and WhatsApp creative flows; do not flatten them into the Website or Instant Form payload.
- Implement App destination creative and native Catalog/Product Set execution as separate workflows.
- Continue to reject unsupported combinations in both the frontend and backend. Keep Meta Live gated until final consolidated release checks.

**Acceptance criteria:** Each exposed workflow has its own typed request contract, account/Page prerequisite validation, provider-native creative payload, safe private-media upload/reuse, correct resource persistence and retry behaviour. Final provider acceptance, returned-ID verification and end-to-end tests are reserved for the consolidated product-readiness gate.

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

**Capability Registry Phase 1:** User-confirmed integrated on 25 November 2026. The foundation is under `api/src/campaign-capabilities/`, mounted through `GET /api/campaign-capabilities`, proxied by `frontend/src/app/api/campaign-capabilities`, and displayed in the Campaign Creation wizard. The existing frontend `campaign-capability-registry.ts` remains the creative media/text requirements registry and was not overwritten.

**Phase 2A — backend enforcement and dynamic option gating:** Prepared in a separate patch/overlay on 26 November 2026; it is not yet integrated into the user's local project. It adds provider-native type resolution, backend create-operation gates, backend validation for registry-listed provider options, and frontend campaign-type/option gating. See `docs/CAMPAIGN_CAPABILITY_REGISTRY_PHASE2_ENFORCEMENT.md`.

**Phase 2A enforcement policy:** `IMPLEMENTED_IN_SOURCE` may validate and run live; `PARTIAL` may validate only; `NOT_IMPLEMENTED`, `BLOCKED_EXTERNAL`, `READ_ONLY` and unregistered campaign types are rejected. This preserves Google Search, Display and standard Performance Max; Google Demand Gen, Shopping, Hotel, App and Classic Video creation remain blocked. Meta remains validate-only while its create capability is `PARTIAL` due to META-01. Per-provider enforcement keeps a supported provider's execution independent from a blocked provider in the same request.

**Remaining Phase 2 work:** Continue implementing account-specific resource validation, conditional Meta and Google provider options, campaign-type prerequisites and creative/delivery compatibility. The prepared passes are incremental overlays and still need to be reconciled with the latest local tree during integration. Do not insert a per-phase test/build gate; final verification is reserved for product readiness.

### CAP-02B — Account-specific resource prerequisites and commerce selector wiring

**Phase 2B1 status:** PREPARED CODE OVERLAY — pending integration.

- Adds server-side, account-scoped checks for Facebook Page access, linked Instagram identity, Page-owned Instant Forms, Page messaging destinations, advertisable Apps, account-accessible Pixels/Datasets and Custom Conversion-to-Pixel ownership.
- Standard event values are checked as supported configuration values only. Resource existence does not prove event delivery or event health.
- Adds the Google Hotel Center link lookup route. Hotel Center remains separate from Merchant Center.
- Keeps prerequisite failures scoped to the Meta provider branch so another provider branch can report independently.

**Phase 2B2 status:** PREPARED INCREMENTAL FRONTEND OVERLAY — pending integration.

- Connects the Campaign Creation wizard to existing authenticated account-scoped Meta Catalog and Product Set lookup routes.
- Resets selected Catalog and Product Set when their parent account/Catalog changes; provides loading, empty, permission and warning states.
- Discovery only: Catalog/Product Set values are not included in live campaign create requests because the native catalog creative path is not complete.
- Existing Google Merchant Center selected-customer link validation is preserved; feed/product readiness remains dependent on Merchant API developer registration and website verification.

### CAP-02C1 — Meta Special Ad Category and manual placement gating

**Status:** PREPARED INCREMENTAL API + FRONTEND OVERLAY — pending integration  
**Date:** 26 November 2026  
**Testing policy:** No automated tests, lint, full build or provider API calls are run during feature development. Execute the consolidated checks at final product readiness.

**Frontend source:** `frontend/src/app/dashboard/campaigns/new/page.tsx`

- Separates restricted audience category logic from all Special Ad Category labels. Housing, Employment, Credit and Financial Products & Services omit age, gender and detailed-interest targeting; Issues/Elections/Politics is not incorrectly treated as having those same restrictions.
- Removes `age_min`, `age_max`, `genders` and `flexible_spec` from both preview and submission payloads for the restricted categories.
- Replaces comma-separated free-text manual placement fields with checked options for Facebook, Instagram, Messenger and Audience Network.
- Removes `explore` from Instagram positions and `story` from Messenger positions for Meta Graph API v26.0; uses `facebook_reels` for Facebook Reels.
- Does not expose WhatsApp Status until the v26 WhatsApp identity and creative requirements are implemented.

**Backend source:** `api/src/metaadsAPI/services/meta-campaign-prerequisites.service.ts`

- Validates Special Ad Category values, duplicates and `NONE` exclusivity.
- Rejects direct requests containing prohibited age/gender/detailed-interest fields for restricted category selections.
- Validates publisher platforms and per-platform position values against the AdSyntra v26 allowlist and rejects placements supplied for an unselected platform.
- Rejects the legacy Instagram Explore and Messenger Stories values even if the UI is bypassed.
- Adds server-side website-traffic + messaging-destination placement checks for Facebook Stories, Instagram Search and Instagram Explore Home.

**Known boundaries / next work:** market-specific location restrictions, creative-format × placement combinations, remaining Engagement/Messaging destination combinations, full Meta objective/optimization/billing/bid strategy combinations, device constraints and WhatsApp Status remain in Phase 2C2B3 / later creative integration. Custom Audience policy eligibility is not certified by this pass. Do not infer correct legal classification from ad content automatically.

### CAP-02C2A — Meta Special Ad Category country mapping

**Status:** PREPARED INCREMENTAL API + FRONTEND OVERLAY — pending local integration
**Date:** 26 November 2026
**Testing policy:** No tests, lint, full builds or provider API calls were run during feature development.

**Frontend source:** `frontend/src/app/dashboard/campaigns/new/page.tsx`

- Reuses the included country selection as the Special Ad Category country list and normalizes/deduplicates the two-letter codes.
- Requires one or more included country codes when any Special Ad Category is selected, including when the rest of the geo targeting uses regions, cities or ZIP codes.
- Sends `special_ad_category_country` in the raw Meta campaign object and `specialAdCategoryCountries` in the normalized provider configuration.
- Adds an explanatory field hint and includes the category country list in the review summary.

**Backend sources:**
- `api/src/metaadsAPI/services/meta-special-ad-category.constants.ts` (new shared country-code allowlist).
- `api/src/metaadsAPI/services/meta-campaign-prerequisites.service.ts` (country array, allowlist, duplicates and consistency with included country targeting).
- `api/src/routes/campaign.routes.ts` (accepts camelCase or snake_case and maps values to provider input).
- `api/src/metaadsAPI/services/campaign-creation.ts` (validates values and sends `special_ad_category_country` to the actual Meta Campaign create endpoint).

**Important boundary:** The selected country codes are the same countries included in campaign delivery targeting. When targeting only cities/regions/ZIPs, the user must also add the applicable country codes in Included Countries. The code does not infer the country from geo-resource IDs or determine whether the ad legally qualifies for a category. Meta policy and advertiser classification remain authoritative.

**Meta reference:** https://developers.facebook.com/docs/marketing-api/reference/adcampaigngroup/ — Ad Campaign field `special_ad_category_country` is documented as an array of country enum values.



### CAP-02C2B2 — META-01 new Single Image + Website creative source repair

**Status:** PREPARED INCREMENTAL FRONTEND + BACKEND OVERLAY — pending local integration; final provider verification is pending  
**Priority:** P0  
**Prepared:** 26 November 2026  
**Testing policy:** No tests, lint, typechecks, builds or provider calls were run. Keep all final verification consolidated at product readiness.

**Prepared source files:**
- `frontend/src/app/dashboard/campaigns/new/page.tsx`
- `api/src/metaadsAPI/services/campaign-creation.ts`
- `api/src/routes/campaign.routes.ts`

**Source corrections prepared:**
- Removed the hard-coded fallback Page Post ID in `createMetaAdsAdCreative`; an existing post is used only when an ID is explicitly supplied.
- Fixed image URL validation to check the supplied URL rather than the not-yet-assigned local variable.
- Removed the sample image URL, `DEMO_META_VIDEO_ID` and sample carousel card URLs from the frontend defaults.
- Added frontend notice for the currently supported global execution scope (Single Image + Website).
- Added backend format and destination guards in the standard campaign route, creative retry route and shared creative service. A Video/Carousel/App/Instant Form/Messaging draft cannot be silently treated as a Single Image Website creative.
- Passed format and destination metadata into the shared service contract; retained account-scoped image upload and image-hash use.

**Important release boundary:** This is a prepared source correction, not provider validation. Keep Meta Campaign creation `PARTIAL` and Meta Live disabled until final validate-only, authorised live creation (paused state), resource persistence, failure/retry and regression checks have been completed. Do not mark META-01 fully closed based on the patch alone.

**Artifacts:**
- `AdSyntra_Campaign_Capability_Registry_Phase2C2B2_META01_Overlay.zip`
- `adsyntra_campaign_capability_registry_phase2c2b2_meta01.patch`
- `CAMPAIGN_CAPABILITY_REGISTRY_PHASE2C2B2_META01_INTEGRATION_GUIDE.md`

**Follow-on slices:** CAP-02C2B3A adds Single Video + Website; CAP-02C2B3B prepares Carousel + Website; CAP-02C2B3C1 adds Page-owned Instant Form with Single Image/Single Video. Messaging is the next destination-specific workflow. All remain subject to final consolidated verification.

### CAP-02C2B3A — Meta Single Video + Website creative pipeline

**Status:** PREPARED INCREMENTAL API + FRONTEND OVERLAY — pending local integration; final verification deferred to product readiness  
**Priority:** P1, with META Live still gated by P0 final-readiness checks  
**Prepared:** 26 November 2026  
**Testing policy:** No tests, lint, typechecks, builds or live provider calls were run.

**Prepared source files:**
- `api/src/metaadsAPI/services/meta-ads-video-upload.service.ts` (new)
- `api/src/routes/campaign.routes.ts`
- `api/src/metaadsAPI/services/campaign-creation.ts`
- `frontend/src/app/dashboard/campaigns/new/page.tsx`

**Implementation prepared:**
- Reads one selected private VIDEO Asset Library item scoped to the authenticated owner and validates the local storage provider, MP4/MOV/WebM MIME and container signature, non-empty file, and 100 MB maximum.
- Uploads the binary directly to the selected Meta Ad Account's `advideos` edge using multipart `source`; no private storage URL or browser-entered Meta video ID is accepted.
- Polls the uploaded Meta Video status until `READY` and resolves its preferred HTTPS thumbnail for `video_data.image_url`.
- Persists and reuses `videoId` / thumbnail only when both the Asset Library asset and the Meta Ad Account match. Processing state is saved before waiting so an upload is not silently lost if Meta processing is delayed.
- Creates a provider-native `object_story_spec.video_data` structure with `video_id`, `image_url`, primary text, headline/title, description/link description and Website CTA.
- Connects the same media upload/readiness sequence to the campaign's Creative retry route.
- Removes the manual Meta Video ID text field; the user selects one private video from Asset Library instead.
- Validation-only verifies the selected private file but does not upload media or create provider objects. The existing Campaign Capability Registry still marks Meta Create `PARTIAL`, so Meta Live stays blocked until the consolidated final checks pass.

**Limits for this base slice:** Single Video + Website only; MP4/MOV/WebM; 100 MB maximum; current private storage implementation is LOCAL. The later Phase 2C2B3C1 slice reuses this video upload path for Page-owned Instant Form ads. Messaging, App and Catalog/Product Set remain outside these slices. This source work is not proof of Meta API acceptance or processing success. The project remains on Meta Graph API v26.0.

**Official Meta references:**
- `https://developers.facebook.com/docs/marketing-api/reference/ad-account/advideos/v26.0` — account video upload edge and accepted upload parameters.
- `https://developers.facebook.com/docs/marketing-api/reference/ad-creative-object-story-spec/` — the `video_data` creative container.
- `https://developers.facebook.com/docs/marketing-api/guides/event-ads/` — example `video_data` creative fields (`video_id`, `image_url`, `link_description`, CTA).

**Artifacts:**
- `AdSyntra_Campaign_Capability_Registry_Phase2C2B3A_Meta_Single_Video_Overlay.zip`
- `adsyntra_campaign_capability_registry_phase2c2b3a_single_video.patch`
- `CAMPAIGN_CAPABILITY_REGISTRY_PHASE2C2B3A_SINGLE_VIDEO_INTEGRATION_GUIDE.md`

### CAP-02C2B3C1 — Meta Instant Form + Single Image/Single Video

**Status:** PREPARED STANDALONE FRONTEND + API SOURCE FILES — local integration not confirmed; provider verification deferred to final product readiness  
**Priority:** P1, with Meta Live still blocked by the consolidated release gate  
**Prepared:** 26 November 2026  
**API version:** Meta Graph API v26.0  
**Testing policy:** No tests, lint, typechecks, builds or live provider calls were run for this feature pass.

**Prepared standalone files:**
- `frontend/src/app/dashboard/campaigns/new/page.tsx`
- `api/src/routes/campaign.routes.ts`
- `api/src/metaadsAPI/services/campaign-creation.ts`
- Dependency: `api/src/metaadsAPI/services/meta-special-ad-category.constants.ts` (created separately to resolve a missing-module import; keep the `.js` import suffix in NodeNext TypeScript source)

**Implementation prepared:**
- Reuses the existing authenticated Page-owned Instant Form lookup. The selected form must be available, active and associated with the selected Facebook Page; no free-text form ID input is added.
- Supports Instant Form destination with `SINGLE_IMAGE` and `SINGLE_VIDEO` only. Carousel + Instant Form remains a separate unimplemented mapping because each card needs its own form-aware CTA structure.
- Enforces the Meta `OUTCOME_LEADS` Campaign objective and `LEAD_GENERATION` Ad Set optimization goal. The destination is mapped to `ON_AD`, and the Ad Set `promoted_object` uses the selected Facebook `page_id`.
- Builds the Ad Creative CTA with `value.link = "https://fb.me/"` and the selected `lead_gen_form_id`. The supported CTA set is restricted to `APPLY_NOW`, `DOWNLOAD`, `GET_QUOTE`, `LEARN_MORE`, `SIGN_UP` and `SUBSCRIBE`.
- Website URL validation is bypassed only for Instant Form. Website conversion Pixel/Custom Conversion checks remain applicable only to Website conversion destinations.
- Single Image continues to use the private Asset Library image upload/hash path or a validated HTTPS image URL. Single Video reuses the private Asset Library video upload, processing-ready polling, thumbnail resolution and account-scoped upload reuse prepared in Phase 2C2B3A.
- Creative retry rebuilds the effective creative config, then repeats Page/Form ownership and availability validation after overrides. Retry also checks the saved Leads objective and `LEAD_GENERATION` optimization before creating the creative.
- The wizard keeps step-scoped validation: Campaign Basics (1), Platform Settings (2), Ad Set / structure (3), Ad Creation (4), and Review (5). Creative media and destination checks run in Step 4; final submission still validates the complete configuration.
- Validation-only does not upload media or create external Meta Campaign, Ad Set, Ad Creative or Ad resources. A `validateOnly: true` success is local preflight success, not provider-created status.

**Not included:** Messenger, Instagram Direct and WhatsApp messaging creatives; App destination; Carousel Instant Form; native Catalog/Product Set ads; broad objective × creative × placement matrix. These remain separate implementation tasks. Meta Live remains gated.

**Official Meta references:**
- `https://developers.facebook.com/docs/marketing-api/guides/lead-ads/` — Lead Ad creation and lead form CTA value structure.
- `https://developers.facebook.com/docs/marketing-api/reference/ad-creative-object-story-spec/` — `link_data` / `video_data` creative structure.
- `https://developers.facebook.com/docs/marketing-api/reference/adcampaigngroup/` — campaign objective and campaign resource fields.

### CAP-02C2B3C2 — Meta Messaging creatives (NEXT)

**Status:** PENDING DEVELOPMENT  
**Scope:** Implement distinct Messenger, Instagram Direct and WhatsApp identity/destination paths. Use each destination's provider-native creative schema and validate the selected Page/identity, destination eligibility, objective, optimization goal, billing event and placements. Preserve separate request contracts and retry rules; never reuse Website or Instant Form CTA payloads.  
**Next:** After Messaging, implement App destination, then Catalog/Product Set native creative execution and remaining compatibility coverage.

### CAP-02C2B1 — Meta objective/destination-aware manual placement compatibility

**Status:** PREPARED INCREMENTAL FRONTEND + BACKEND OVERLAY — pending local integration  
**Priority:** P1 (policy safety for manual placements)  
**Prepared:** 26 November 2026  
**Testing policy:** No tests, lint, typechecks, builds or live provider calls were run during feature development; defer consolidated verification to final product readiness.

**Prepared source files:**
- `frontend/src/app/dashboard/campaigns/new/page.tsx`
- `api/src/metaadsAPI/services/meta-campaign-prerequisites.service.ts`

**Implemented scope:**
- Filters manual platforms and placements for Awareness, Instant Form Lead Generation and App Install configurations.
- Filters Facebook Stories for Traffic → Messenger and Instagram Search/Explore Home for Traffic → Messenger/WhatsApp.
- Adds the same constraints to the backend manual-placement validator so direct API callers cannot submit a combination hidden by the frontend.
- Adds Audience Network `instream_video` to the configured manual placement enum.
- Keeps automatic placements untouched; no manual platform array means the provider-automatic path remains in effect.

**Known limitations:**
- This is intentionally a conservative partial compatibility matrix. Creative-format × placement rules, additional Engagement/Messaging combinations, device-specific limitations, catalog ads, and full optimization/billing/bid dependencies are still open.
- Device-platform constraints are not implemented because the current wizard/request model does not expose a complete `device_platforms` input.
- Preserve Meta Graph API v26.0; the current public Meta reference may be newer than the project's configured version and must be reconciled during the final release gate.
- Keep the META-01 live-creation blocker. Do not enable Meta Live based only on placement gating.

**Reference:** Meta Marketing API Ad Campaign Objective and Placements documentation: https://developers.facebook.com/docs/marketing-api/reference/adcampaigngroup/.

**Artifacts:**
- `AdSyntra_Campaign_Capability_Registry_Phase2C2B1_Overlay.zip`
- `adsyntra_campaign_capability_registry_phase2c2b1.patch`
- `CAMPAIGN_CAPABILITY_REGISTRY_PHASE2C2B1_INTEGRATION_GUIDE.md`

**Next slice:** CAP-02C2B3 — Meta Video, Carousel and destination-specific creative pipelines. META-01 source correction is prepared in CAP-02C2B2 but remains a final-verification gate.

### CAP-02A — Enforce Campaign Capability Registry Phase 2A

**Status:** PREPARED IN OVERLAY — PENDING LOCAL INTEGRATION
**Priority:** P0/P1
**Prepared:** 26 November 2026

**Backend changes prepared:**

- Resolve incoming provider-native campaign types against the capability registry, including the Google App campaign mapping (`MULTI_CHANNEL`).
- Apply operation gates inside each provider execution branch before calling provider creation services.
- Allow `IMPLEMENTED_IN_SOURCE` workflows for validate-only/live; allow `PARTIAL` workflows for validate-only only; fail closed for `NOT_IMPLEMENTED`, `BLOCKED_EXTERNAL`, `READ_ONLY` and unknown types.
- Validate Google performance-goal and bidding-strategy values, plus Meta objective, buying type, objective-specific optimization goal and bid strategy, against registry options. Remove Google Search Impression Share because the current Search payload builder rejects it.
- Mark Meta Reservation buying as `PARTIAL`, since the current UI/service does not implement reservation predictions and assignment; reject it from direct submissions.
- Apply checks per provider, so a blocked Meta branch is recorded independently and does not stop a supported Google branch in the same unified request.

**Frontend changes prepared:**

- Disable Google campaign types whose create operation is not `IMPLEMENTED_IN_SOURCE`; show their unavailable state in the type list.
- Build Google performance-goal, Meta buying-type and Meta bid-strategy selectors from registry option lists.
- Hide options marked `PARTIAL` from current selectable Meta buying types.
- Block Live mode when the registry is unavailable or no selected provider is live-enabled. For mixed-provider requests, permit enabled providers to proceed and warn that blocked branches will be rejected independently.

**Test evidence:** 15 isolated capability tests passed. Changed TypeScript/TSX files passed syntax transpilation. Full API typecheck/build, frontend build/lint and provider live tests remain pending because project dependencies were not installed in the inspection environment.

**Known scope boundary:** Account-specific prerequisite validation is not included in this 2A slice. It remains Phase 2B. META-01 source correction is prepared in Phase 2C2B2; it remains a P0 final-release gate until validate-only, authorised paused live-create, persistence, retry and regression checks pass. Keep Meta live creation disabled until the consolidated final verification stage.

**Integration caveat:** This patch was prepared by applying the 25 November Phase 1 overlay to the available 24 November project ZIP. The user's post-integration local working tree was not supplied for this pass. Review the changes against the current local files before replacing the large campaign route and campaign page files.

---

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

This sequence reflects the current project source and the agreed product direction as of 26 November 2026. Per the user's instruction, test/build/provider verification is consolidated at the final product-readiness stage rather than run after every feature pass. It is a practical dependency order, not a requirement to stop all parallel work.

| Order | Work item | Priority | Reason / status |
|---:|---|---|---|
| 1 | **Campaign Capability Registry — Phase 1** | USER CONFIRMED INTEGRATED | Static provider/type capability definitions, authenticated read API, frontend proxy and wizard status display. User confirmed integration on 25 November 2026; exact build/runtime results were not retained. |
| 2 | **Campaign Capability Registry — Phase 2A: enforcement and dynamic option gating** | PREPARED — PENDING LOCAL INTEGRATION | Provider-native type gates, option validation and frontend gating are prepared. Integration status is not reconfirmed. Defer full verification to final product readiness. |
| 3 | **Campaign Capability Registry — Phase 2B1 / 2B2** | PREPARED — PENDING LOCAL INTEGRATION | Add account-specific Meta prerequisites, Hotel Center lookup and Meta Catalog/Product Set selector wiring. |
| 4 | **Campaign Capability Registry — Phase 2C1: Meta category and placement gating** | PREPARED — PENDING LOCAL INTEGRATION | Enforce restricted-category audience fields and fixed provider placement enums. |
| 5 | **Campaign Capability Registry — Phase 2C2A: Special Ad Category country mapping** | PREPARED — PENDING LOCAL INTEGRATION | Maps included campaign countries to `special_ad_category_country` on the Meta Campaign create request. |
| 6 | **Campaign Capability Registry — Phase 2C2B1: objective/destination placement gating** | PREPARED — PENDING LOCAL INTEGRATION | Adds conservative frontend and backend manual-placement compatibility for documented Meta objective/destination combinations. |
| 7 | **Campaign Capability Registry — Phase 2C2B2: META-01 Single Image + Website creative repair** | PREPARED — PENDING LOCAL INTEGRATION; FINAL QA PENDING | Removes the implicit existing-post fallback, corrects image URL validation and gates unsupported formats/destinations. Meta Live remains disabled. |
| 8 | **Campaign Capability Registry — Phase 2C2B3A: Meta Single Video + Website** | PREPARED — PENDING LOCAL INTEGRATION; FINAL QA DEFERRED | Adds private Asset Library video upload, readiness polling, thumbnail resolution, account-scoped upload reuse and `video_data` creative create/retry. |
| 9 | **Campaign Capability Registry — Phase 2C2B3B: Meta Carousel + Website** | PREPARED INCREMENTAL SOURCE — PENDING LOCAL INTEGRATION | Adds ordered private card media and native `link_data.child_attachments` create/retry; do not assume it is present in the current local branch until integrated. |
| 10 | **Campaign Capability Registry — Phase 2C2B3C1: Meta Instant Form + Single Image/Video** | PREPARED STANDALONE FILES — PENDING LOCAL INTEGRATION | Reuses Page-owned forms; enforces Leads / `LEAD_GENERATION` / `ON_AD` and Page `promoted_object`; maps `lead_gen_form_id` in the CTA. |
| 11 | **Campaign Capability Registry — Phase 2C2B3C2: Meta Messaging creatives** | NEXT | Implement separate Messenger, Instagram Direct and WhatsApp identity/destination payloads and objective/placement validation. |
| 12 | **Campaign Capability Registry — Phase 2C2B3C3: Meta App destination** | PENDING | Implement provider-native app identity, store destination and promoted-object rules for eligible App Promotion workflows. |
| 13 | **Native Meta Catalog / Product Set ads** | PENDING | Build provider-native Catalog/Product Set creative and promoted-object flow; current selectors remain discovery-only. |
| 14 | **Migration Center foundation** | P1 | Build migration assessment, eligibility, prerequisite and guidance screens. Do not claim Google native migration tools are API-callable, and do not claim performance-history transfer for an AdSyntra rebuild. |
| 15 | **Destination campaign support: Demand Gen and Search for Travel** | P1 | Complete target campaign hierarchies and creation/editing/targeting/assets/reporting as appropriate before offering API-assisted migrations. Keep Hotel Center requirements separate. |
| 16 | **Unified Campaign Creation Field Research phases** | P1 | Complete account-safe selectors, identity/measurement, commerce, targeting/delivery, creative resource integration and execution release gates. Skip work already completed, including Pass 4.1A/B/C. |
| 17 | **FINAL RELEASE GATE — META-01 and all Meta creative flows** | P0 | Keep Meta Live disabled until consolidated validate-only, authorised paused live-create, resource persistence, retry, permissions, and regression checks pass for every enabled destination/format. |
| 18 | Correct Meta placement catalogue and add distinct Advantage+ Audience controls | P1 | Use the v26.0 catalogue, remove incompatible Explore manual placement and apply objective/format compatibility checks. |
| 19 | Unblock Google Merchant Center and verify feed/product lookups; verify Hotel Center separately | P1 / external | Requires website verification, Merchant API registration, linked provider accounts and eligibility. |
| 20 | Add ad-level management actions | P1/P2 | The current Ads API route family is read-oriented. |
| 21 | Complete conversion event delivery and advanced audience workflows | P2 | Build on the existing conversion and audience foundations. |
| 22 | Add automated tests, route smoke tests and release checks | P0/P1 — FINAL GATE | Capture acceptance criteria while developing; execute the consolidated suite, provider checks and regression matrix only after the planned feature set is complete. |
| 23 | Complete production security, reporting accuracy and billing account-matrix checks | P0/P1/P2 by area | Needed before any wider external release. |

**Important:** Registry status `IMPLEMENTED_IN_SOURCE` means the source path exists; it does not certify live provider behaviour, account eligibility or production readiness. The Meta creative blocker remains a release gate for the affected live creative path. For migration, assessment/guidance may be built before destination campaign workflows, but automated rebuild execution must wait until each destination type is complete and tested.

---

## 7. Documentation that should be kept in sync

The following documents predate some of the current code and should not be used as the only status source. The new Campaign Capability Registry is also a source-code status snapshot, not runtime certification:

- `docs/ADSyntra_Campaign_Creation_Google_Meta_Unified_Field_Research.md` (20 November 2026) still describes several Meta selectors as disconnected, while the current 24 November campaign page now calls Page, Pixel, event, Custom Conversion, Instant Form, messaging, application, Custom/Saved Audience, location and detailed-targeting lookups.
- `docs/unified_ads_platform_project_notes.md` contains the earlier prototype-first decision and V4 status. The current ZIP now has substantial API-backed product modules; update the project direction/status sections when the user confirms the current product milestone.
- `docs/provider-api-mapping.v26-review.md` should remain a reference, but code version configuration must agree with the actual version policy.
- `AdSyntra_Billing_Section_Final_Research.docx` should remain the billing requirements baseline; use this backlog for implementation and test status.

Update this backlog when a feature is genuinely completed and tested. Record the test account context (without secrets), date, provider API version, test result and known limitations.

---

## 8. Audit limitations

- The original user ZIP and local working project were not modified in place; the Phase 1 integration files are supplied as a separate overlay bundle.
- Phase 1 was user-confirmed integrated, but exact local build/runtime output was not retained. The Phase 2A patch was prepared against the available 24 November project ZIP plus the 25 November Phase 1 overlay; the user's current local working tree was not supplied.
- Campaign Capability Registry Phase 2A previously had an isolated test run recorded in its separate delivery (15 passed); this does not replace final project validation. For all subsequent creative slices described here, tests, lint, typechecks, builds and provider calls are deliberately deferred under the user's feature-first development instruction.
- The user's 26 November Meta backend response had `validateOnly: true`, `confirm: false`, no provider Campaign/Ad Set/Creative/Ad IDs, and `creationStatus: validated`. It confirms local validation-only completion, not provider creation.
- No additional OAuth flow, live lookup, provider validate-only call or campaign mutation was executed for Phase 2C2B3C1.
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
