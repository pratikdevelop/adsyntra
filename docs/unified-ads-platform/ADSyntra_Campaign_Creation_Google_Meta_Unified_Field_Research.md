# AdSyntra Campaign Creation — Unified Google Ads + Meta Ads Field Research

**Prepared:** 20 November 2026  
**Scope:** Current Campaign Creation wizard, its discovered backend lookup routes, and provider API requirements  
**Purpose:** Establish one complete, implementation-ready picture of which form fields are shared, account-dependent, searchable, fixed API choices, user-entered values, conditional fields, or not yet supported.

> This is a research and code-audit document. It does not modify the Campaign Creation page or backend. A route appearing in source code is not proof that it is mounted, permitted for every account, or live-tested.

---

## 1. Executive conclusion

AdSyntra should present one coherent Campaign Creation experience, but it must **not force Google Ads and Meta Ads into one identical provider form**.

The correct design is:

1. A common campaign brief for the information that really is shared.
2. Separate Google Ads and Meta Ads configuration sections.
3. Dynamic resource selectors for items that belong to a connected advertising account.
4. Fixed, versioned provider options for API enums and settings.
5. Conditional fields driven by campaign type, objective, destination, format, optimization goal and account capabilities.
6. A final review that shows both the human-readable resource name and the native provider ID.

The main distinction is:

- **Dynamic does not mean every field must call an API.** A country/resource ID, Page, Pixel, audience, conversion action or linked Merchant Center account should be loaded from the appropriate provider. A bid strategy enum, gender value, distance unit, placement mode or CTA is usually a versioned option that should be filtered by capability—not queried like an account-owned resource.
- **A field visible in the UI is not proof that its campaign type is fully integrated.** The current Google live campaign route covers Search, Display and Performance Max in the inspected version; other campaign types still need complete, connected execution paths.
- **The current frontend contains several sample values and account-resource IDs.** Those must become empty/unselected states or visibly labelled examples. They must never silently become real API selections.

## 2. Audit basis and API version policy

### Source reviewed

- Current Campaign Creation page available in the project files: `campaign-creation-page.asset-library.preview-ui.updated.tsx` (20 November 2026).
- Current PMax-integrated campaign route snapshot: `campaign.routes.pmax-integrated.ts`.
- Google campaign lookup route declarations and service imports.
- Meta campaign targeting/audience route declarations.
- Meta campaign asset discovery module `meta-campaign-assets.routes.ts`.
- Existing project notes and campaign-type resource hierarchy.

### Version policy

| Provider | Version in the inspected project | Documentation observation | Implementation rule |
|---|---|---|---|
| Google Ads | API v26 is the project target in the current architecture notes | Google's v26 resource/field reference is available | Keep all GAQL fields, enums and mutation schemas pinned to v26. |
| Meta Ads | Existing asset-discovery module defaults to Graph API `v26.0` | Meta's public Marketing API reference now shows v27.0 | Do not mix v27-only assumptions into v26 requests. Keep the existing v26.0 contract until an intentional, tested version upgrade is approved. |

Meta v26.0 includes placement changes that matter to the current form: Instagram Explore Feed is no longer a valid manual placement; Messenger Stories is silently removed from `messenger_positions`; WhatsApp Status receives additional capabilities. The current Campaign Creation source still includes `explore` in the default Instagram manual positions. This needs to be removed from the v26 manual-placement catalogue.

Relevant references:
- [Google Ads API v26 field reference](https://developers.google.com/google-ads/api/fields/v26/overview)
- [Meta Marketing API current reference](https://developers.facebook.com/docs/marketing-api/reference/v27.0/)
- [Meta Business SDK v26 release notes](https://github.com/facebook/facebook-nodejs-business-sdk/releases)

---

## 3. Field classification — one rule for the whole wizard

Use the following classification for every field before implementing it.

| Classification | Meaning | Example |
|---|---|---|
| **Account-fetched resource** | Exists in a connected provider account; load from that account and retain its native ID/resource name | Meta Page, Pixel, Custom Audience; Google User List, Conversion Action, Audience |
| **Searchable provider resource** | Search provider-owned/global catalog and select a returned native key/ID | Google GeoTargetConstant; Meta city/region/ZIP; Meta interest |
| **Capability-driven option** | A known provider enum, but allowed choices depend on campaign type/objective/destination/format/API version | Bid strategy, billing event, placement, CTA, campaign subtype |
| **User-entered value** | Business-specific information not owned by the ad provider | Campaign name, budget, bid amount, website URL, copy |
| **Derived / automatic** | Determined from other selected settings or provider defaults | Effective optimization options, supported creative slots, automatic placements |
| **External prerequisite** | Belongs to a connected external product or website; Ads API may only show the link or partial metadata | Merchant Center product feed, Hotel Center inventory, app-store listing, website Pixel installation |
| **Not supported yet** | Field or campaign type is visible or mentioned but no confirmed complete execution path exists | Some Shopping, Demand Gen, App and Hotel campaign branches |

### Selector data contract

For every account-owned or searchable resource, the UI should preserve structured data, not only an ID string:

```ts
type ProviderResourceOption = {
  provider: "googleAds" | "metaAds";
  resourceType: string;
  accountId: string;
  id: string;
  resourceName?: string;
  name: string;
  subtitle?: string;
  status?: string;
  source: "ACCOUNT" | "PROVIDER_SEARCH" | "EXTERNAL";
  selectable: boolean;
  unavailableReason?: string;
};
```

The displayed name is for users. The native `id` / `resourceName` is what is submitted to the backend. When an account changes, all resources selected from the previous account must be cleared or revalidated.

---

## 4. Unified cross-platform form map

This is the main decision matrix for the entire Campaign Creation wizard.

| Form area | Common UX | Google Ads data model | Meta Ads data model | What should be dynamic? |
|---|---|---|---|---|
| Connected account | Choose provider and account | Customer ID; manager-account context where relevant | Ad Account ID (`act_...`) | Account list, currency, time zone, permissions, selected account |
| Campaign identity | Common campaign brief | Campaign | Campaign | Campaign name is user input; selected account is fetched |
| Objective / type | Keep provider-specific options | Channel type and subtype | Objective | Fixed capability registry filtered by provider support |
| Budget | Common amount/schedule concepts | CampaignBudget; daily or supported total budget | Campaign or Ad Set budget; daily/lifetime | Currency and eligible minimums are account-aware; amount is user input |
| Bidding | Common label and help text | Bidding strategy/scheme, target fields, optional portfolio strategy | Bid strategy, bid amount, minimum ROAS | Options depend on type, objective, optimization and budget level |
| Schedule | Common date/time picker | Campaign dates and Ad Schedule criteria | Ad Set `start_time` / `end_time` | User-entered; account time zone shown |
| Location | Search and multi-select | GeoTargetConstant resource names, proximity criteria | Geo-location keys/country codes/city radius | Search provider location catalog; preserve provider-specific IDs |
| Language | Search and multi-select | LanguageConstant; campaign-type restrictions | Meta locale targeting, where exposed/appropriate | Provider-specific resource/enum choices; not a shared ID list |
| Audience | Include/exclude or signals, clearly labelled | User Lists, Audience, Combined Audience, user interests; role depends on campaign type | Custom Audiences, Saved Audiences, detailed targeting | Account-owned audiences and provider search results |
| Demographics | Grouped controls | Age range, gender, parental status, income range; supported hierarchy varies | Age min/max, gender and supported demographic targeting | Provider enums/criteria and category restrictions |
| Placements | Automatic / manual UX | Search network settings, Demand Gen channel controls, criterion placements; PMax automated | Advantage+ placements or manual publisher/position arrays | Capability/version-driven; do not share a single placement enum |
| Conversion tracking | Common status language, provider-specific controls | Conversion Actions, conversion goals, Google tag / GA4 setup | Pixel/Dataset, standard or custom events, Custom Conversions, CAPI | Account resources are dynamic; installation/event health is a separate diagnostic |
| Business identity | Common brand identity panel | Business name, logos, YouTube assets | Facebook Page, Instagram professional identity | Brand name/assets from approved library; platform identity fetched |
| Destination | Website / app / lead / messaging concepts | Final URL, app-store app identity, Merchant Center feed, Hotel Center | Website, Instant Form, Messenger, Instagram Direct, WhatsApp, App, Shops | Destination types filtered by objective, connected assets and permissions |
| Creative format | Shared Asset Library, provider-specific requirements | RSA, Responsive Display, PMax asset group, Demand Gen ads, Shopping product ads, App ads | Single image, video, carousel, catalog and other supported creative specs | Fixed format options filtered by campaign capability; account media/identity dynamic |
| Media | One reusable local asset library | Upload media to Google Ads; create native Asset and link to campaign/ad/ad group/asset group | Upload to Ad Account; use image hash/video ID in AdCreative | Local asset selection is shared; provider upload and native IDs remain separate |
| Review | One combined preview | Native Google resources and provider result | Native Meta resources and provider result | Names, IDs, status, validation warnings and partial failures |

**Important:** the unified experience should normalize the *user experience*, not erase the providers' different resource hierarchies. Google is Customer → Campaign → Ad Group or Asset Group → Ad/criteria. Meta is Ad Account → Campaign → Ad Set → Ad, with Ad Creative as a referenced object.

---

## 5. Campaign brief and shared fields

These fields belong in the common part of the form because they describe the user's business or campaign intent.

| Field | Classification | Recommended behaviour |
|---|---|---|
| Business / brand name | User-entered or approved brand data | Prefill from approved brand identity only when verified; allow editing |
| Campaign name | User-entered | Required; do not reuse as an Asset Library item |
| Campaign description / brief | User-entered | Store once in the shared campaign brief |
| Website URL | User-entered | Validate HTTPS/URL syntax; use as a suggested provider destination, not an automatic override |
| Business objective | Common semantic concept | Map to provider-specific objective/type choices; do not submit one shared enum to both APIs |
| Provider selection | User selection | Google, Meta or both; show each provider's result independently |
| Creative language | User selection | Feed the creative generation request; provider targeting-language controls remain separate |

### Shared does not mean identical

For example, “Sales” can map to a Google campaign goal plus an eligible Google campaign type and bidding configuration. For Meta, it maps to an objective such as `OUTCOME_SALES`, a conversion location, optimization goal and eligible creative/destination combination. They are related business intent, not the same API value.

---

## 6. Budget, schedule and bidding

### Shared UX

Show a common budget card where possible, but the submitted model must be provider-specific. Do not pretend that the same budget setting has the same scope or semantics.

| Field | Google Ads | Meta Ads | Source of value |
|---|---|---|---|
| Budget owner / level | Campaign budget; some campaign types require dedicated, non-shared budgets | Campaign budget (CBO) or Ad Set budget | Capability-driven |
| Budget period | Average daily or supported campaign-total/custom-period flows | Daily or lifetime | Capability-driven |
| Amount | Customer currency; Google micros conversion happens in backend | Account currency and Meta's minor-unit representation where required | User input + account currency |
| Currency | `customer.currency_code` | Ad Account currency | Account-fetched |
| Start / end | Campaign dates; campaign-total budget can require dates | Ad Set start/end, including when budget is at Campaign level | User input; display account time zone |
| Minimum budget | Depends on campaign type and Google requirements | Meta minimum budgets can be queried for an Ad Account by currency | Account/API lookup where supported |
| Bidding strategy | Google campaign/channel-specific strategy or scheme | Meta campaign/ad-set bid strategy according to budget level and objective | Capability-driven |
| Target CPA / ROAS / bid amount | Google strategy-specific fields and units | Meta bid fields and constraints | User input; conditional |
| Portfolio strategy | Account-owned Google `BiddingStrategy` resource | No direct equivalent in the same Google sense | Google account lookup only |

### Google-specific findings

- Standard bidding options should remain a versioned list filtered by campaign type.
- A portfolio strategy field must become a searchable list of real strategies for the selected customer. The current page seeds a demo resource name.
- Do not offer portfolio strategy for a campaign type that cannot attach to that portfolio strategy.
- Budget total/custom-period support must be gated to campaign types and workflows that are genuinely implemented.
- Google rejects a bidding scheme or target field used in an unsupported campaign context.

### Meta-specific findings

- Buying type (`AUCTION` / `RESERVED`), budget level, budget period, optimization goal, billing event and bid strategy are not interchangeable resource lookups.
- The valid optimization-goal / billing-event / bid-strategy combinations depend on objective, destination, account eligibility and budget model.
- Do not assume a single static allowlist is a complete source of truth for all combinations.
- For a Campaign-level budget, Meta schedule fields remain on the Ad Set. The current frontend already documents this distinction in its request preview.

---

## 7. Location, language and geographic targeting

| Field | Google Ads | Meta Ads | Classification / implementation |
|---|---|---|---|
| Country | GeoTargetConstant search result | Country key/code in `geo_locations` | Search/select provider-specific value |
| Region / state | GeoTargetConstant search result | Region key from location search | Searchable |
| City | GeoTargetConstant search result | City key from location search | Searchable |
| Postal / ZIP | Available targetable geo constants where supported | ZIP key, typically country-qualified | Searchable and validate coverage |
| Radius | Proximity criteria around a geographic point | City radius / distance unit in supported geo entries | Numeric user input plus supported unit |
| Exclusions | Negative Google location criteria | Excluded geographic targeting structures | Search/select, then submit provider-specific negative structure |
| Presence / location mode | Google location option settings | Meta location targeting options | Capability-driven |
| Language | Google `LanguageConstant` only where campaign type supports it | Meta locale targeting where applicable | Provider-specific; never reuse Google IDs in Meta or vice versa |

### Google targeting constraints

- Google location search uses `GeoTargetConstantService.SuggestGeoTargetConstants`.
- Locations can be selected by returned criterion ID / resource name.
- Radius targeting uses a `ProximityInfo` structure and is not merely a city-name string.
- Criteria availability differs by campaign type and hierarchy level.
- Manual language targeting is not supported for Search campaigns under Google's September 2026 changes. It remains available for eligible campaign types / surfaces. For PMax, manual language is no longer used for Search inventory, though it continues to guide eligible non-Search channels.

### Meta targeting constraints

- Meta location search returns its own keys for countries, regions, cities and ZIP areas.
- A numeric-looking key must not be invented or accepted as a valid selected location without validation against Meta's lookup result.
- Radius and distance unit are inputs attached to the supported city/geolocation form, not separate account resources.
- Special Ad Category restrictions may remove or constrain some demographics and location fields.

---

## 8. Audience and detailed targeting

This is one of the most important places to replace free-text ID fields with real pickers.

| Concept | Google Ads | Meta Ads |
|---|---|---|
| First-party remarketing list | `UserList` | Custom Audience |
| Broader audience segment | `Audience`, `CombinedAudience`, `UserInterest` and related resources | Detailed targeting search: interests, behaviors and eligible demographic options |
| Saved targeting preset | Google Audience / combined resources depending on setup | Saved Audience |
| Include | Targeting criterion or Asset Group audience signal, depending on campaign type | `custom_audiences` or detailed targeting |
| Exclude | Supported negative criteria where available | `excluded_custom_audiences` / supported exclusion structures |
| Audience signal vs hard targeting | PMax audience signals are signals to Google's system, not a strict audience restriction | Meta audience controls / Advantage+ audience behaviour follow Meta's own semantics |
| Resource ownership | Google customer resource name | Meta Ad Account owned/shared audience ID |

### Google

Existing current-page dynamic lookup coverage:
- Locations
- Languages
- User Lists
- Custom Conversion Goals

Gaps:
- A dynamic Google `Audience` lookup for PMax and Demand Gen audience selection.
- A dynamic list of eligible audiences for App Engagement / App-related selective workflows.
- A dynamic `ConversionAction` list for selective optimization.
- A capability-aware UI to distinguish User Lists from Google Audience resources.

Do not use one plain text box for all these resources. A User List resource name (`customers/{customer_id}/userLists/{id}`) is not the same thing as an Audience (`customers/{customer_id}/audiences/{id}`).

### Meta

Backend source already includes route/service support for:
- Custom Audiences
- Saved Audiences
- Location search
- Detailed targeting search

But the current Campaign Creation page still initializes the fields for region, city, ZIP, interest, included Custom Audience and excluded Custom Audience with example values. I found no matching Meta lookup calls in the current page snapshot. The backend lookup work and the front-end selectors have therefore not been joined into a complete dynamic UI.

Meta detailed targeting search should be searchable and category-aware. Current source supports search kinds such as interest, behavior, demographic, life event, industry, family status and income in one route family. The separate Meta campaign asset discovery module currently narrows its `/search` wrapper to interests and behaviors; do not assume the two routes expose exactly the same search catalog.

**Policy restriction:** do not present or select a sensitive or disallowed audience simply because the API search returns a result. Validate audience eligibility and review Meta's restrictions for sensitive personal attributes and Special Ad Categories.

---

## 9. Demographics, placements and campaign delivery controls

### Google Ads

| Field | Classification | Notes |
|---|---|---|
| Age range | Criterion option | Supported at campaign/ad-group levels depending on campaign and context |
| Gender | Criterion option | Positive/negative support varies by level and campaign type |
| Parental status | Criterion option | Available in eligible contexts |
| Household income | Criterion option | Available in eligible contexts/markets |
| Device | Criterion option / bid modifier | Campaign-type and current API rules apply |
| Ad schedule | User-entered structured schedule | Campaign criterion; day, time range and bid modifier |
| Topics | Provider taxonomy/resource | Search/browse provider constants where supported |
| Placements | Provider placement resource/criteria | YouTube, websites, apps or other supported placement criteria; type-specific |
| Search partners / Display expansion | Search network setting | Only show on eligible Search campaigns |
| Demand Gen channels | Capability-driven channel controls | YouTube, Discover, Gmail, Maps, Display and other supported inventory controls |
| PMax networks | Automatic | Do not add Search/Display manual network checkboxes to PMax |

Google's Criteria guide defines which criterion types are allowed at Campaign versus Ad Group level. Audience criteria are Ad Group-level in relevant flows and require `use_audience_grouped` to be enabled when the Ad Group is created.

### Meta Ads

| Field | Classification | Notes |
|---|---|---|
| Minimum age / maximum age | Numeric input with platform constraints | Must obey Special Ad Category and location rules |
| Gender | Fixed provider enum | All / men / women; do not use as a normal free-text field |
| Demographics | Searchable targeting values | Only supported and eligible options |
| Placement mode | Fixed provider mode | Automatic (Advantage+ placements) or manual |
| Publisher platforms | Capability-driven enum set | Facebook, Instagram, Messenger, Audience Network, WhatsApp and other supported values as versioned |
| Platform positions | Capability-driven enum set | Each platform has its own positions; filter by API version, format and objective |
| Device platform | Capability-driven enum set | Mobile/desktop/connected TV where exposed |
| Special Ad Categories | Required campaign declaration | Explicitly choose no special category or applicable category/categories; restrictions must alter available fields |

**Version-specific placement warning:** Meta Graph API v26.0 removes Instagram Explore Feed from valid manual placement input and silently removes Messenger Stories from `messenger_positions`. The present page's default `instagram_positions` includes `explore`; that default is incompatible with the project's v26.0 version and should not be submitted. The v26 changelog also documents new WhatsApp Status capabilities. Manual placements must be stored in a v26-specific compatibility catalogue.

**Special Ad Category warning:** Meta requires new and edited campaigns to declare `special_ad_categories`. Housing, Employment and Credit campaigns have significant targeting restrictions; this is not only a label. The UI and backend must suppress or reject restricted age, gender, ZIP and detailed targeting options as applicable. Issues, Elections and Politics are separate categories and should not automatically inherit the same housing/employment/credit restrictions.

---

## 10. Conversion tracking and measurement resources

Do not collapse conversion configuration into one “Pixel / Conversion” field. The two platforms have different measurement models.

| Area | Google Ads | Meta Ads | Recommended UI |
|---|---|---|---|
| Tracking resource | Conversion Action | Pixel / Dataset | Account-scoped resource selector |
| Standard event/action | Conversion Action category / source / event mapping | Standard Pixel / Dataset event | Show supported event names after selecting tracking resource |
| Custom event/action | Conversion Action configured in Google Ads | Custom Conversion / custom event | Separate custom resource section |
| Primary / secondary | `primary_for_goal`, inclusion in conversions | Meta event/custom conversion optimization configuration | Show actual provider properties; do not infer from the name |
| Goal grouping | Conversion goals / campaign goal configuration | Optimization goal at Ad Set and campaign objective context | Dependent settings |
| Event health | Tag / GA4 / imported conversion diagnostics and event receipt | Pixel/Dataset activity, Events Manager and CAPI diagnostics | Separate status/health card |
| Website installation | Google tag / GTM / GA4 website integration | Meta Pixel and optionally Conversions API | Setup and verification workflow; never claim an event is active just because the resource exists |

### Google

- Custom Conversion Goals are already loaded in the current page.
- Individual Conversion Actions still need a dedicated dynamic lookup route and selector.
- The Conversion Action list should show name, category, source/origin, status, primary-for-goal and whether it is included in the conversions metric.
- A selected Conversion Action ID/resource name must be verified as belonging to the selected customer.

### Meta

- The current Campaign Creation page initializes a Pixel ID and a conversion event with demo values.
- The separate backend asset module includes an Ad Account-scoped Pixel/Dataset lookup.
- The Ad Account resource exposes Custom Conversions; a dynamic Custom Conversion selector should be connected where custom conversion optimization is supported.
- Standard Pixel event labels are not necessarily a complete list of available real events. Event receipt and event configuration should be read from the selected Pixel/Dataset and relevant diagnostics.
- Selecting a Pixel is not proof that the user's website is firing events. Show “resource connected” separately from “events received / active.”

---

## 11. Business identity, destinations and provider assets

### Meta Page and Instagram identity

The current frontend seeds a Page ID and Instagram Actor ID as numbers. Replace both with selectors:

1. Load Pages available to the authenticated Meta identity.
2. Show Page name, Page ID and available tasks/permissions.
3. Show the Instagram professional account linked to each Page, if returned.
4. Let the user choose the eligible Page and, where relevant, its linked Instagram actor.
5. Revalidate identity if the Ad Account or Page selection changes.

The discovered `meta-campaign-assets.routes.ts` source has a Page lookup that returns Page ID, Page name, tasks and linked `instagram_business_account`; it also has an Ad Account-scoped Pixel lookup. The module's active server mount must be verified before the frontend depends on those paths.

### Destinations

| Destination | Google Ads | Meta Ads |
|---|---|---|
| Website | Final URL; URL expansion where supported | Website destination URL |
| App | App Store / package or store ID; campaign subtype rules | App ID and store URL / promoted object, objective dependent |
| Instant Form | Not a native Google equivalent in the same campaign flow | Page-owned Instant Form; load forms for selected Page |
| Messaging | Not a native Google equivalent in the same campaign flow | Messenger, Instagram Direct, WhatsApp and eligible destination identity |
| Product / Shop | Merchant Center / product listing data; Shopping or Demand Gen product ads | Catalog, product set, shop destination, depending on eligible campaign/creative |
| Hotel inventory | Hotel Center link and inventory/feed prerequisites | Not a Google Hotel Center equivalent |

Do not treat a Meta `Instant Form ID`, messaging destination ID, app ID or product catalog ID as arbitrary text. Load account/Page-owned resources, verify permissions and filter by the selected objective and ad format.

### Google commerce and Hotel resources

- **Shopping:** first query the selected Google Ads customer for a linked Merchant Center account using the `product_link` resource. A linked Merchant Center account is required before creating a Shopping campaign. Product/feed details should come from Merchant Center / Merchant API rather than a hard-coded feed label.
- **Demand Gen Product Ads:** product feed and listing group behaviour is a separate format. It must not be treated as a generic image/copy ad.
- **Hotel Ads:** check the Hotel Center product link and actual allowlist eligibility. Hotel feeds/prices remain managed in Hotel Center. A text input for Hotel Center ID is not a safe substitute for link discovery.
- **App campaigns:** the App ID belongs to the app store identity, not a generic Google Ads account resource. Validate the identifier and store pairing. Google documents supported subtypes and their different audience/criterion behaviour; the legacy App Campaign for installs workflow is not API-supported.

---

## 12. Creative formats, Asset Library and media

Keep one shared local Asset Library, but use a provider-specific upload-and-attach pipeline.

| Format / media | Google Ads | Meta Ads | Required behaviour |
|---|---|---|---|
| Text-only | Search RSA copy; PMax / Display / Demand Gen text slots | Primary text, headline, description, CTA | Copy can be reused, but validate provider limits and field roles |
| Single image | Upload Google Asset and link at correct campaign/ad/asset-group level | Upload to Ad Account and use returned image hash | Never send private local storage URL directly to provider |
| Video | Google Ads / YouTube video resource; format restrictions apply | Upload video to Ad Account and use returned video ID | Separate upload, processing and creative creation |
| Carousel | Demand Gen carousel card objects where supported | Ordered child attachments/cards | Keep card-level media, text and URL structure; do not use a plain textarea as final persisted model |
| Product feed | Merchant Center feed/product assets | Catalog / product set | Source product identity, price and image from commerce catalog; never fabricate |
| Logo / brand kit | Google brand assets at required resource level | Page/Instagram identity and creative logo where allowed | Reuse approved library assets; provider upload IDs remain separate |

### Asset Library rules to preserve

- Do not overwrite original Asset Library files when creating resized/cropped derivatives.
- Save every crop/normalized variant as a distinct child asset.
- A private file must be uploaded to the selected Google/Meta account before provider creation.
- Do not put private storage URLs into Google or Meta creative payloads.
- Track the returned provider asset ID/hash/video ID on the campaign execution record.
- Preserve `capabilityId`, `requirementId`, role, platform and ordering from AI Creative Studio assignments.
- Text assets and copy packs can be reused by the Campaign Creation Asset Library; campaign name remains campaign-specific.
- Keep Google Search/RSA and Google Responsive Display behaviour that has already been tested unchanged while implementing new lookups.

---

## 13. Current code coverage — what is already present versus missing

This section is a source audit, not a runtime test.

### Google Ads

| Capability | What the current code shows | Assessment |
|---|---|---|
| Location lookup | Google lookup endpoint and current-page fetch | **Implemented in source** |
| Language lookup | Google lookup endpoint and current-page fetch | **Implemented in source; hide for Search** |
| User List lookup | Google lookup endpoint and current-page fetch | **Implemented in source** |
| Custom Conversion Goal lookup | Google lookup endpoint and current-page fetch | **Implemented in source** |
| Google Audience lookup | Audience resource names exist in some campaign input fields, but the current page does not load them dynamically | **Missing frontend lookup** |
| Conversion Action lookup | Demo resource names remain in App selective optimization fields | **Missing frontend lookup** |
| Portfolio bidding strategies | Demo resource name remains in the page | **Missing frontend lookup** |
| Merchant Center | Text ID, sample feed label and sample product-group value | **Not dynamic** |
| Hotel Center / property IDs | Text ID and sample property ID | **Not dynamic; account eligibility must be verified** |
| App ID | Demo package name | **Not dynamic; needs store-aware validation/search** |
| Location exclusions / broader targeting | Some campaign flows build location operations, but full targeting form coverage is incomplete | **Partial** |
| Campaign-type dispatch | Latest inspected PMax-integrated route explicitly connects Search, Display and Performance Max; other visible campaign types are not yet complete global-route workflows | **Partial** |
| Google account Assets | Asset upload/association services exist | **Backend foundation present; selectors and full workflow remain format-specific** |

### Meta Ads

| Capability | What the current code shows | Assessment |
|---|---|---|
| Country / region / city / ZIP selection | Current page uses demo country and numeric region/city/ZIP examples; backend location search routes exist | **Backend search present; frontend not connected** |
| Interest targeting | Demo interest ID in page; backend detailed-targeting / campaign asset search exists | **Backend search present; frontend not connected** |
| Behavior targeting | Backend search wrapper exists | **Backend search present; frontend not connected** |
| Custom Audiences | Campaign route imports and exposes custom audience listing | **Backend list route present; frontend not connected** |
| Saved Audiences | Campaign route imports and exposes saved audience listing | **Backend list route present; frontend not connected** |
| Facebook Page | Demo Page ID in page; separate asset module has Page discovery | **Backend module present; frontend not connected; active mount to verify** |
| Instagram actor | Demo Instagram actor ID in page; Page lookup can return linked Instagram identity | **Page module supports discovery; frontend not connected** |
| Pixel / Dataset | Demo Pixel ID in page; separate asset module has account-scoped Pixel lookup; pixel/conversion route modules also appear in the Meta server snapshot | **Backend foundation present; current page not connected** |
| Conversion event | Hard-coded event options in the page | **Needs Pixel/Dataset-aware event selector and capability checks** |
| Custom Conversions | Meta API exposes the Ad Account customconversions edge | **Needs account lookup and UI integration** |
| Instant Forms | Form ID is currently typed/demo-filled | **Needs Page-owned form discovery** |
| Messaging destination | Destination ID currently typed/demo-filled | **Needs connected destination discovery and permission validation** |
| App identity / catalog | Text/demo fields | **Needs external/account resource discovery and eligibility checks** |
| Special Ad Categories | Values are fixed/declared in form; UI restrictions need stronger gating | **Partially represented; policy validation needed** |
| Manual placements | Fixed positions include Explore | **Must use corrected v26 catalogue and validate per format/objective** |
| Video / carousel | Current form has demo video IDs and textarea carousel structure; current global execution supports only a restricted starter creative path | **Not complete end-to-end** |

### Key interpretation

Some Meta lookup source exists in more than one module. Before implementation, confirm which route is mounted in the active backend server. In particular, do not wire the frontend to `meta-campaign-assets.routes.ts` until its router mount and middleware are confirmed in the latest `server.ts` / `app.ts`.

A route existing in an older module, or a function imported by a campaign route, is not sufficient proof of a working integration.

---

## 14. Static sample values to remove or replace

### Google examples found in current page

| Field | Example currently seeded | Required change |
|---|---|---|
| Portfolio strategy | `customers/1234567890/biddingStrategies/123456789` | Empty until selected from account lookup |
| Start date | `2026-11-12` | Dynamic valid default or blank; past dates must not be seeded |
| Merchant Center ID | `123456789` | Load linked Merchant Center accounts |
| Feed label | `DEMO_FEED` | Load feed labels from connected Merchant Center |
| Product group | `DEMO_CATEGORY` | Load actual listing/product data |
| Hotel Center ID | `123456789` | Load linked Hotel Center resource and verify allowlist |
| Hotel property | `DEMO_HOTEL_001` | Load actual property inventory |
| App ID | `com.example.demostore` | Blank or app-store-validated selection |
| App video | `DEMO_VIDEO_ID_123` | Select/upload actual YouTube video |
| App audience | Demo Audience resource | Load eligible Google Audience / User List resources according to subtype |
| Conversion Action | Demo Conversion Action | Load actual customer Conversion Actions |
| Demand Gen video / audience | Demo video and Audience resource | Load actual video and eligible Audience resources |

### Meta examples found in current page

| Field | Example currently seeded | Required change |
|---|---|---|
| Campaign schedule | Old fixed date values | Date/time picker with account timezone and future validation |
| Region key | `123456789` | Select returned Meta region |
| City key | `987654321` | Select returned Meta city |
| ZIP key | `IN:452001` | Search/select supported ZIP |
| Interest ID | `600000000000001` | Search/select interest |
| Included Custom Audience | `600000000000002` | Load audience list for selected Ad Account |
| Excluded Custom Audience | `600000000000003` | Load audience list for selected Ad Account |
| Page ID | `1383140784881581` | Select accessible Page |
| Instagram actor ID | `123456789012345` | Select linked Instagram professional identity |
| Pixel ID | `1589401625816003` | Load Pixels/Datasets for selected Ad Account |
| Instant Form ID | `123456789012345` | Load Page-owned Instant Forms |
| Messaging destination ID | `123456789012345` | Load eligible messaging destination identity |
| App ID / URL | Demo app and URL | Select/validate app identity and store |
| Video ID | `DEMO_META_VIDEO_ID` | Upload/select real Meta video and wait for processing |
| Carousel cards | Example image URLs and destinations | Use ordered structured card state and uploaded asset references |
| Instagram Explore position | `explore` | Remove from v26 manual placement options |

Use empty values and explicit selection prompts. If sample content is useful for onboarding, make it a non-submittable demo preview rather than form state that is included in a live payload.

---

## 15. Recommended resource discovery map

Do not build one oversized universal `/lookups/all` endpoint. Keep provider-native lookup paths and expose a consistent frontend response shape.

### Google Ads lookup map

| Resource | Lookup approach | Account scope |
|---|---|---|
| Geo locations | `GeoTargetConstantService.SuggestGeoTargetConstants` | Google Customer |
| Languages | `language_constant` / targetable constants | Global provider catalog; filtered by campaign capability |
| User Lists | GAQL query on `user_list` | Google Customer |
| Audiences | GAQL query on `audience` | Google Customer |
| Conversion Actions | GAQL query on `conversion_action` | Google Customer |
| Custom Conversion Goals | Existing Google custom conversion-goal lookup | Google Customer |
| Portfolio strategies | GAQL query on `bidding_strategy` | Google Customer / manager access rules |
| Merchant Center links | GAQL query on `product_link` filtered to `MERCHANT_CENTER` | Google Customer |
| Hotel Center links | GAQL query on `product_link` filtered to `HOTEL_CENTER` | Google Customer; allowlist prerequisite |
| Google Assets | GAQL query on `asset` and supported asset views | Google Customer |
| YouTube videos | YouTube Data API / authorized channel and provider upload workflow | YouTube identity / video resource |

### Meta Ads lookup map

| Resource | Lookup approach | Account / Page scope |
|---|---|---|
| Locations | Graph API targeting search with `type=adgeolocation` and location types | Global Meta targeting catalog |
| Interests / behaviors | Graph API targeting search; category/type-specific | Global Meta targeting catalog |
| Detailed demographics | Targeting search/browse/suggestions where returned and eligible | Global catalog; validate against objective and special category |
| Custom Audiences | Ad Account `customaudiences` edge | Selected Meta Ad Account |
| Saved Audiences | Ad Account `saved_audiences` edge | Selected Meta Ad Account |
| Pages | Accessible Pages / Page connection | Authenticated Meta identity and Page permission |
| Instagram identity | Linked Instagram professional account returned for Page or Ad Account edge | Page / Ad Account |
| Pixels / Datasets | Ad Account `adspixels` edge | Selected Meta Ad Account |
| Custom Conversions | Ad Account `customconversions` edge | Selected Meta Ad Account |
| Page Lead Forms | Page `leadgen_forms` edge | Selected Page and Page permissions |
| Apps | Eligible promoted apps / app identity sources | App and Ad Account permissions |
| Catalogs / Product Sets | Ad Account or Business catalog edges | Selected Ad Account / Business |
| Media | Upload image/video and consume returned provider IDs | Selected Meta Ad Account |

---

## 16. Recommended implementation order for the unified form

This order minimizes risk to the existing tested flows.

### Pass 1 — Account-safe resource selectors

**Google**
- Keep existing location, language, User List and Custom Conversion Goal selectors.
- Add Google Audience lookup.
- Add Conversion Action lookup.
- Add portfolio bidding strategy lookup.

**Meta**
- Connect the existing location-search backend to country/region/city/ZIP selectors.
- Connect detailed targeting search to interests and eligible behavior/demographic selectors.
- Connect Custom Audience and Saved Audience lists.
- Remove all hard-coded IDs.

### Pass 2 — Account identity and measurement

**Google**
- Conversion action metadata and goal eligibility.
- Google account asset selection.

**Meta**
- Facebook Page / linked Instagram selector.
- Pixel/Dataset selector and event options.
- Custom Conversion selector.
- Page-owned Instant Form selector.
- Messaging destination and App identity selector.

### Pass 3 — Commerce and special campaign prerequisites

**Google**
- Merchant Center link discovery.
- Feed/product lookup.
- Hotel Center link and eligibility.
- App-store identity validation.

**Meta**
- Catalog / Product Set lookup for supported commerce ads.
- App / destination checks.

### Pass 4 — Full targeting and delivery controls

- Location exclusions and radius.
- Demographics and categories.
- Placement compatibility per objective and format.
- Device controls.
- Schedule.
- Google Topics, placements and audience modes.
- Meta Special Ad Category field restrictions and Advantage+ semantics.

### Pass 5 — Creative resource integration

- Preserve one local Asset Library.
- Provider-specific image/video upload.
- Structured carousel cards.
- Format-specific creative requirements.
- Provider asset ID persistence.
- Creative preview and validation.

### Pass 6 — Complete campaign execution and release gates

- Do not enable a campaign type for live submission until its entire resource hierarchy is connected.
- Use validation-only requests before live creation.
- Verify account ownership and resource compatibility server-side.
- Preserve paused-by-default creation where appropriate.
- Show provider-specific partial success/failure and created resource IDs.
- Test with an authorized test account, not an unintended live advertiser.

---

## 17. Final product decisions recommended

1. **One wizard, two provider-native configuration models.** Shared brief and consistent UX; never flatten native fields into a false common schema.
2. **No free-text provider resource IDs for normal users.** Use searchable selectors and keep an advanced resource-name input only for an explicitly marked expert mode, with server-side validation.
3. **Account selection is the parent of every dynamic lookup.** Changing accounts clears dependent selections.
4. **Versioned capability registry.** Keep campaign types, objectives, bidding, optimization, billing, placements and creative formats under a versioned provider capability map.
5. **Respect campaign-type hierarchy.** Google Ad Group, Asset Group and Meta Ad Set are not interchangeable.
6. **Keep special-category and policy restrictions in the validation layer.** Hiding controls in the UI is not enough.
7. **Show actual selected names in Review.** The API payload still uses native IDs/resource names.
8. **Mark unsupported campaign types honestly.** A visible prototype branch must not imply it is ready for live creation.
9. **Do not infer event health from object existence.** A connected Pixel or Conversion Action does not prove that a website is sending events.
10. **Keep the tested Search, Display and current Asset Library behaviour stable while the dynamic selector work is added.**

---

## 18. Official research references

### Google Ads

- [Campaigns overview](https://developers.google.com/google-ads/api/docs/campaigns/overview)
- [Create campaigns](https://developers.google.com/google-ads/api/docs/campaigns/create-campaigns)
- [Targeting overview](https://developers.google.com/google-ads/api/docs/targeting/overview)
- [Targeting criteria and supported hierarchy](https://developers.google.com/google-ads/api/docs/targeting/criteria)
- [Location targeting](https://developers.google.com/google-ads/api/docs/targeting/location-targeting)
- [Google Ads v26 Audience resource](https://developers.google.com/google-ads/api/fields/v26/audience)
- [Google Ads v26 UserList resource](https://developers.google.com/google-ads/api/fields/v26/user_list)
- [Google Ads v26 ConversionAction resource](https://developers.google.com/google-ads/api/fields/v26/conversion_action)
- [Google Ads v26 BiddingStrategy resource](https://developers.google.com/google-ads/api/fields/v26/bidding_strategy)
- [Bid strategy types](https://developers.google.com/google-ads/api/docs/campaigns/bidding/strategy-types)
- [Google language targeting changes, effective September 2026](https://developers.google.com/ads/blog/posts/2026/08/google-ads-language-targeting-changes)
- [Merchant Center account linking](https://developers.google.com/google-ads/api/docs/shopping-ads/merchant-center)
- [Google Ads v26 ProductLink resource](https://developers.google.com/google-ads/api/fields/v26/product_link)
- [Demand Gen overview](https://developers.google.com/google-ads/api/docs/demand-gen/overview)
- [Demand Gen product ads](https://developers.google.com/google-ads/api/docs/demand-gen/product-ads)
- [App campaign overview](https://developers.google.com/google-ads/api/docs/app-campaigns/overview)
- [Hotel Ads overview](https://developers.google.com/google-ads/api/docs/hotel-ads/overview)

### Meta Ads

- [Marketing API reference](https://developers.facebook.com/docs/marketing-api/reference/v27.0/)
- [Ad Account reference and resource edges](https://developers.facebook.com/docs/graph-api/reference/ad-account/)
- [Ad Set reference](https://developers.facebook.com/docs/graph-api/reference/ad-campaign/)
- [Targeting reference](https://developers.facebook.com/docs/graph-api/reference/targeting/)
- [Special Ad Categories / Campaign reference](https://developers.facebook.com/docs/marketing-api/reference/adcampaigngroup/)
- [Ad Account Custom Conversions](https://developers.facebook.com/docs/marketing-api/reference/custom-conversion/)
- [Page Leadgen Forms](https://developers.facebook.com/docs/graph-api/reference/page/leadgen_forms/)
- [Meta Graph API v26 changelog details in official Business SDK release](https://github.com/facebook/facebook-nodejs-business-sdk/releases)

---

**Research conclusion:** AdSyntra needs a resource-discovery and capability-aware configuration layer—not simply more dropdowns. The best next implementation step is Pass 1 for both providers together, using the already existing Google and Meta lookup services, then progressing through account identity, measurement, commerce and creative resources without disturbing the working campaign flows.
