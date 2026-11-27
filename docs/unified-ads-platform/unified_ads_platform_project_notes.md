# Unified Ads Management Platform --- Project Notes & Roadmap

**Document purpose:** Keep the agreed product direction, prototype
scope, decisions, and future implementation plan in one place so they
can be carried into future conversations.

**Last updated:** 3 November 2026
**Current focus:** Complete and validate **Prototype V4 --- Create
Campaign** before moving on.

---

## 1. Product vision

Build a unified ads management platform where a customer can connect
advertising accounts and manage campaigns across multiple advertising
providers from one interface.

### Initial providers

- Google Ads
- Meta Ads

Other providers (for example LinkedIn Ads and TikTok Ads) may be
considered later. The product should be designed so additional providers
can be added without forcing every provider into an identical workflow.

### Intended product areas

- Provider account connections
- Dashboard and combined reporting
- Campaign creation and management
- Ad groups / ad sets and ads
- Conversion tracking (Google Ads conversions and Meta Pixel)
- Budgets, bidding, and billing
- Audiences and targeting
- Creative and asset library
- Campaign, ad, and asset performance

For the first prototype, focus on demonstrating the experience and
workflows with mock/sample data. Do not build production integrations
simply to make the prototype look real.

---

## 2. Current direction: prototype first

The agreed direction is:

1. Build and showcase an interactive prototype first.
2. Validate the screens, navigation, workflows, and overall product
   concept.
3. Only after the prototype is reviewed and validated, plan and
   implement the production application.

### Prototype scope

- Screens and navigation
- Interactive forms and wizard steps
- Mock/demo accounts and sample data
- Simulated campaign submission and execution
- Review screens, status/results, and campaign details
- Demonstrable asset and creative workflows

### Explicitly deferred until production planning

- Real Google Ads and Meta Marketing API integrations
- Production OAuth/account connection flows
- Production backend and database design
- Infrastructure, deployment, and production security
- Real campaign mutations and live billing operations

**Working rule:** Do not make codebase changes unless explicitly
requested.

---

## 3. Campaign creation: agreed product experience

### Common brief + provider-specific configuration (Option B)

The selected approach is **Option B**:

- Start with one shared campaign brief.
- Let the user choose Google Ads, Meta Ads, or both.
- Show provider-specific configuration sections/cards where the
  platforms differ.
- Treat a multi-provider submission as one launch batch with
  independent provider operations and results.

A common brief can include details such as: - Business / brand name -
Campaign name - Campaign description or brief - Website / destination
URL - Business goal or desired outcome - Selected advertising providers

Do not assume that Google and Meta have identical campaign types,
objectives, optimization settings, bidding models, or required fields.
The shared form should collect only genuinely common information;
provider-specific requirements belong in their respective configuration
sections.

### Multi-provider execution model

When the user selects both Google Ads and Meta Ads: - Create one logical
launch batch. - Validate each provider configuration independently. -
Keep provider-specific account, currency, budget, settings, and
identifiers separate. - Show each provider's result independently. -
Support partial success: one provider may succeed while another fails. -
Retry only the failed provider operation rather than duplicating a
successful one. - Do not imply that cross-platform creation is one
atomic transaction.

For a future real integration, campaigns should initially be created
**paused/draft-like where the provider supports it**, followed by review
and explicit activation. Never imply that campaigns are live merely
because a simulated creation flow completed.

---

## 4. Prototype V4 --- Create Campaign

The current milestone is to finish **Prototype V4 Create Campaign**
before moving to other major areas.

### Existing/core workflow described in the project discussion

- Common Google Ads / Meta Ads / both-provider workflow
- Multi-step campaign creation wizard
- Campaign types and objectives
- Budget and bidding configuration
- Google ad groups / Meta ad sets
- Creative/ad configuration
- Review screen and configuration/JSON preview
- Simulated execution monitor
- Campaign details
- Ad management
- Asset library

### Remaining V4 work identified

1. Add demo accounts so the user can select realistic Google and Meta
   accounts.
2. Persist complete campaign drafts, selected assets, and simulated
   execution records within the prototype.
3. Improve the asset library:
   - File selection/upload interaction for the prototype
   - Asset previews
   - Basic validation states
   - Reuse existing assets in campaign creation
4. Complete and verify the full path:
   - Review
   - Confirm
   - Simulate
   - Results
   - Campaign details
5. Perform final end-to-end QA and UI polish.

The prototype may simulate persistence and execution. These are not a
commitment to a production database or real provider API calls.

---

## 5. Where ad creation and creative assets belong

This was discussed explicitly and the agreed staged experience is:

### During campaign creation

Include the **ad creation step inside the campaign wizard**. The user
should be able to configure the ads/creative needed for the campaign
rather than finishing a campaign with no clear ad setup path.

### Separate asset library

Keep the **Asset Library as a separate area** in the product. It should
allow users to browse, preview, validate, and reuse assets. The campaign
wizard can select assets from this library.

### After campaign creation

Keep **Ad Management as a separate post-creation area** for viewing and
managing the ads that belong to created campaigns.

In short:

- Campaign wizard: configure campaign, groups/sets, and ads/creative.
- Asset Library: centrally store, browse, preview, and reuse creative
  assets.
- Ad Management: manage ads after the campaign has been created.

This gives the user a connected workflow without turning the campaign
form into a giant asset-management screen.

---

## 6. Image and video creative generation: prototype vs production

The question was whether to implement image/video creative generation
for both Google and Meta now or later.

### For the current prototype

Demonstrate the workflow without building a real AI/media-generation or
provider-upload pipeline. The prototype can use: - Sample image and
video assets - Mock creative previews - Provider-specific creative
fields and format guidance - Simulated asset selection and validation -
Simulated attachment of creatives to ads

The prototype should make it clear how a user would create/select a
creative and use it in a Google or Meta ad, but it does not need to
generate or publish real assets.

### For production

Plan this as a substantial, provider-aware feature rather than a small
CRUD addition. It involves areas such as: - Image and video creation or
importing - Media processing, resizing, cropping, and format variants -
Provider-specific placement and creative requirements - Validation and
previews for each destination/placement - Uploading assets to the
relevant provider - Creative/ad object creation and linking - Asset
status, ownership, reuse, and lifecycle management - Error handling,
processing states, and provider-specific restrictions

Google Ads and Meta have different creative formats, object models, and
requirements. Avoid assuming that one generic creative payload can be
sent unchanged to both platforms.

**Decision for now:** Keep the creative-generation and real
media-processing/integration work out of the V4 implementation.
Represent the intended workflow with mock assets and simulated
interactions. Revisit the production scope after prototype validation.

---

## 7. Important platform differences to preserve

The unified experience should simplify the user journey without hiding
important provider differences.

### Google Ads

A real implementation will need to account for Google's campaign
hierarchy and services, including campaign budgets, campaign
settings/bidding, ad groups, ads, assets, and conversion setup.
Requirements and bidding options depend on campaign type and objective.

### Meta Ads

A real implementation will need to account for Meta's campaign → ad set
→ ad structure, including campaign objectives, budget strategy (for
example campaign-level vs ad-set-level budgeting), optimization/billing
settings, audiences, creatives, and Pixel/conversion configuration.

These are production design considerations. The prototype should show
understandable provider-specific configuration without pretending the
APIs are identical.

---

## 8. Longer-term production roadmap

After the prototype has been demonstrated and validated, plan the
production application in phases.

### Phase A --- Product and UX validation

- Complete Prototype V4.
- Demonstrate the full campaign creation journey.
- Validate the common brief and provider-specific sections.
- Validate the asset-library and ad-management separation.
- Collect feedback and revise the workflow.

### Phase B --- Production architecture

- Define frontend and backend responsibilities.
- Define provider adapters/capability schemas.
- Design persistent data models and campaign launch-batch records.
- Define authentication, authorization, secure token storage, audit
  logs, and error handling.
- Define background jobs, retries, idempotency, and partial-failure
  handling.

### Phase C --- Account connections and read operations

- Implement real Google Ads and Meta account connections.
- Securely store and refresh OAuth credentials.
- Read accounts, campaigns, ad groups/ad sets, ads, assets, and
  insights.
- Build combined reporting with provider-specific data mapped into a
  common presentation model.

### Phase D --- Controlled campaign operations

- Implement provider-specific validation and campaign creation.
- Start with safe paused/draft workflows where supported.
- Add review and explicit activation.
- Implement status monitoring, retries, idempotency, and
  partial-success reporting.
- Add verified pause/resume and other controlled campaign-management
  operations.

### Phase E --- Conversion tracking, audiences, billing, and assets

- Google Ads conversion tracking
- Meta Pixel / conversion configuration
- Custom, saved, and lookalike audience workflows where supported
- Billing and account-level financial views
- Production asset library and provider uploads
- Image/video processing and creative lifecycle
- Provider-specific ad creation and management

The exact order should be finalized during production architecture
planning; do not treat this list as a commitment that every feature must
ship in the first release.

---

## 9. Product and implementation principles

1. **Prototype before production:** validate the user experience before
   investing in full integrations.
2. **Common where genuinely common:** use a shared brief, not a forced
   one-size-fits-all provider form.
3. **Provider-specific where necessary:** preserve each platform's
   campaign, budget, bidding, audience, and creative requirements.
4. **Partial success is normal:** multi-provider operations must report
   each provider's result independently.
5. **Safe campaign activation:** creation and activation should be
   distinct steps in production.
6. **Separate workflow responsibilities:** campaign wizard, asset
   library, and post-creation ad management should work together but
   remain distinct areas.
7. **Do not overbuild the prototype:** mock data and simulated
   operations are acceptable for demonstrating the concept.
8. **No unrequested code changes:** discuss or plan first; modify the
   codebase only when explicitly asked.

---

## 10. Immediate next actions

The next work should stay focused on Prototype V4:

- [x] Finish demo account selection.
- [x] Ensure full campaign drafts and selected assets are retained
      during the prototype session.
- [ ] Complete asset selection, preview, validation, and reuse
      interactions.
- [ ] Verify Review → Confirm → Simulate → Results → Details end to
      end.
- [ ] Verify Google-only, Meta-only, and Google + Meta flows.
- [ ] Verify that simulated partial success/failure is understandable.
- [ ] Complete final UI and workflow QA.
- [ ] Record prototype feedback before starting production
      architecture.

**Do not start real image/video generation, media processing, OAuth/API
integration, or production backend work as part of V4 unless the scope
is explicitly changed.**

---

## 11. Decision log

---

Topic Agreed direction

---

Overall approach Interactive prototype first;
production application later

Current milestone Complete Prototype V4 Create
Campaign

Campaign form Option B: common brief plus
provider-specific configuration

Multi-provider submission One launch batch with independent
provider operations/results

Campaign wizard Include ad creation and creative
configuration

Asset library Separate central area; select/reuse
assets from the wizard

Ad management Separate area after campaign
creation

Creative generation in prototype Mock/sample assets and simulated
workflow

Real image/video generation and Defer to production planning
processing

Real Google/Meta integrations Defer until after prototype
validation

## Codebase changes Only when explicitly requested

---

_Use this document as the project continuity note. If a decision
changes, update the relevant section and the decision log rather than
silently replacing the previous direction._
