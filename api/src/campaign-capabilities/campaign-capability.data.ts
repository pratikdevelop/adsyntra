import type {
  CampaignCapabilityDefinition,
  CampaignOperation,
  CampaignProvider,
  CapabilityStatusDetail,
} from "./campaign-capability.types.js";

const implemented = (summary: string, limitations: string[] = []): CapabilityStatusDetail => ({
  status: "IMPLEMENTED_IN_SOURCE",
  summary,
  ...(limitations.length ? { limitations } : {}),
});

const partial = (summary: string, limitations: string[] = []): CapabilityStatusDetail => ({
  status: "PARTIAL",
  summary,
  ...(limitations.length ? { limitations } : {}),
});

const notImplemented = (summary: string, limitations: string[] = []): CapabilityStatusDetail => ({
  status: "NOT_IMPLEMENTED",
  summary,
  ...(limitations.length ? { limitations } : {}),
});

const blockedExternal = (summary: string, limitations: string[] = []): CapabilityStatusDetail => ({
  status: "BLOCKED_EXTERNAL",
  summary,
  ...(limitations.length ? { limitations } : {}),
});

const readOnly = (summary: string, limitations: string[] = []): CapabilityStatusDetail => ({
  status: "READ_ONLY",
  summary,
  ...(limitations.length ? { limitations } : {}),
});

const noConfigurationEdit = notImplemented(
  "Full provider-native campaign settings editing is not connected as a complete workflow.",
  ["Campaign rename and lifecycle actions are tracked separately."],
);

function googleOperations(create: CapabilityStatusDetail): Record<CampaignOperation, CapabilityStatusDetail> {
  return {
    create,
    list: implemented("Campaign listing is present in the Google Ads campaign service."),
    read: implemented("Campaign reporting/details are available through the campaign and reporting services."),
    rename: implemented("Campaign rename action is present in the campaign route."),
    pause: implemented("Campaign status management is present in the campaign route."),
    resume: implemented("Campaign status management is present in the campaign route."),
    delete: implemented("Campaign removal action is present in the campaign route."),
    editConfiguration: noConfigurationEdit,
  };
}

const commonGoogleFeatures = {
  budget: implemented("Campaign budget creation is part of the connected Google campaign workflows."),
  bidding: implemented("Campaign-type-specific bidding configuration is implemented in the Google creation service."),
  schedule: implemented("Start/end date inputs are handled for the applicable connected campaign flows."),
  locationTargeting: implemented("Location include/exclude and proximity structures are present for Search, Display and Performance Max."),
  languageTargeting: partial("Language lookup and criteria support exist, but availability must be campaign-type aware.", ["Do not show manual language targeting for Search under the project's September 2026 Google change note."]),
  audienceTargeting: partial("Audience resources and PMax audience signals have backend foundations.", ["Google Audience lookup is not fully connected in the campaign builder; PMax signals must not be presented as strict targeting restrictions."]),
  conversionMeasurement: implemented("Conversion Action and conversion-goal lookup/configuration foundations exist in the campaign flow."),
  creativeAssets: implemented("Provider asset upload/association paths exist for the campaign's supported formats."),
  reporting: implemented("Google campaign listing and reporting foundations exist."),
} as const;

const googleCampaigns: CampaignCapabilityDefinition[] = [
  {
    id: "googleAds.search",
    provider: "googleAds",
    label: "Search",
    builderCampaignType: "SEARCH",
    providerCampaignType: "SEARCH",
    providerCampaignTypeKind: "NATIVE",
    hierarchy: ["Google Ads Customer", "Campaign", "Ad Group", "Ad", "Campaign / Ad Group Criteria"],
    apiVersion: "v26",
    operations: googleOperations(implemented("The global campaign route dispatches Search to the complete Search campaign creation flow.")),
    features: {
      ...commonGoogleFeatures,
      demographicTargeting: partial("Demographic controls are available only where supported and are not represented as a complete universal matrix."),
      placements: partial("Search network settings are present; Display-style placement controls do not apply to Search."),
    },
    options: {
      businessObjectives: [
        { value: "SALES", label: "Sales" },
        { value: "LEADS", label: "Leads" },
        { value: "WEBSITE_TRAFFIC", label: "Website Traffic" },
        { value: "AWARENESS", label: "Brand Awareness" },
      ],
      performanceGoals: [
        { value: "CONVERSIONS", label: "Conversions" },
        { value: "CONVERSION_VALUE", label: "Conversion Value" },
        { value: "CLICKS", label: "Website Clicks" },
        { value: "IMPRESSION_SHARE", label: "Search Impression Share" },
      ],
      biddingStrategies: [
        { value: "MANUAL_CPC", label: "Manual CPC" },
        { value: "MAXIMIZE_CLICKS", label: "Maximize Clicks" },
        { value: "MAXIMIZE_CONVERSIONS", label: "Maximize Conversions" },
        { value: "MAXIMIZE_CONVERSION_VALUE", label: "Maximize Conversion Value" },
        { value: "TARGET_CPA", label: "Target CPA" },
        { value: "TARGET_ROAS", label: "Target ROAS" },
      ],
    },
    notes: ["The business objective is an AdSyntra-level preset; Google Ads does not expose one universal Campaign objective field."],
  },
  {
    id: "googleAds.display",
    provider: "googleAds",
    label: "Display",
    builderCampaignType: "DISPLAY",
    providerCampaignType: "DISPLAY",
    providerCampaignTypeKind: "NATIVE",
    hierarchy: ["Google Ads Customer", "Campaign", "Ad Group", "Responsive Display Ad", "Campaign / Ad Group Criteria"],
    apiVersion: "v26",
    operations: googleOperations(implemented("The global campaign route dispatches Display to the complete Display campaign creation flow.")),
    features: {
      ...commonGoogleFeatures,
      demographicTargeting: partial("Demographic controls require campaign-type and account eligibility checks."),
      placements: partial("Display placement/network controls exist only in the supported subset; a complete compatibility matrix is still required."),
    },
    options: {
      businessObjectives: [
        { value: "SALES", label: "Sales" },
        { value: "LEADS", label: "Leads" },
        { value: "WEBSITE_TRAFFIC", label: "Website Traffic" },
        { value: "AWARENESS", label: "Brand Awareness" },
      ],
      performanceGoals: [
        { value: "CONVERSIONS", label: "Conversions" },
        { value: "CLICKS", label: "Website Clicks" },
        { value: "IMPRESSIONS", label: "Impressions / Reach" },
      ],
      biddingStrategies: [
        { value: "MANUAL_CPC", label: "Manual CPC" },
        { value: "MANUAL_CPM", label: "Manual CPM" },
        { value: "MAXIMIZE_CLICKS", label: "Maximize Clicks" },
        { value: "MAXIMIZE_CONVERSIONS", label: "Maximize Conversions" },
        { value: "MAXIMIZE_CONVERSION_VALUE", label: "Maximize Conversion Value" },
        { value: "TARGET_CPA", label: "Target CPA" },
        { value: "TARGET_ROAS", label: "Target ROAS" },
      ],
    },
    notes: [
      "Existing Display campaigns remain manageable while Google transitions Display toward Demand Gen.",
      "New Display campaign availability may change by account and Google rollout; the registry describes AdSyntra source coverage, not account eligibility.",
    ],
    migration: {
      replacementProfile: "DEMAND_GEN",
      message: "Google is moving Display toward Demand Gen. Preserve existing Display campaigns; use the Google native migration workflow where offered. AdSyntra does not claim to invoke Google's native migration tool.",
    },
  },
  {
    id: "googleAds.performanceMax",
    provider: "googleAds",
    label: "Performance Max",
    builderCampaignType: "PERFORMANCE_MAX",
    providerCampaignType: "PERFORMANCE_MAX",
    providerCampaignTypeKind: "NATIVE",
    hierarchy: ["Google Ads Customer", "Campaign", "Asset Group", "Asset Group Assets / Signals", "Campaign Criteria"],
    apiVersion: "v26",
    operations: googleOperations(implemented("The global campaign route has a separate Performance Max workflow, including asset uploads, asset-group creation and campaign criteria.")),
    features: {
      ...commonGoogleFeatures,
      demographicTargeting: partial("PMax audience and demographic controls must be represented as signals or eligible controls, not as universal hard restrictions."),
      placements: partial("Google controls much of PMax inventory automatically; do not expose Search/Display placement settings as if they were standard PMax controls."),
      identityAndDestination: implemented("Business name, final URL and brand assets are collected in the current PMax flow."),
    },
    options: {
      businessObjectives: [
        { value: "SALES", label: "Sales" },
        { value: "LEADS", label: "Leads" },
        { value: "WEBSITE_TRAFFIC", label: "Website Traffic" },
        { value: "LOCAL_STORES_VISITS", label: "Local Store Goals" },
      ],
      performanceGoals: [
        { value: "CONVERSIONS", label: "Conversions" },
        { value: "CONVERSION_VALUE", label: "Conversion Value" },
      ],
      biddingStrategies: [
        { value: "MAXIMIZE_CONVERSIONS", label: "Maximize Conversions" },
        { value: "MAXIMIZE_CONVERSION_VALUE", label: "Maximize Conversion Value" },
      ],
    },
    prerequisites: ["At least one eligible asset group and its required text/media assets."],
    notes: [
      "PMax audience signals are not equivalent to strict audience restrictions.",
      "Store Goals and Local Services PMax are separate specializations and are not included in the currently connected standard PMax workflow.",
    ],
  },
  {
    id: "googleAds.demandGen",
    provider: "googleAds",
    label: "Demand Gen",
    builderCampaignType: "DEMAND_GEN",
    providerCampaignType: "DEMAND_GEN",
    providerCampaignTypeKind: "NATIVE",
    hierarchy: ["Google Ads Customer", "Campaign", "Ad Group", "Demand Gen Ad"],
    apiVersion: "v26",
    operations: googleOperations(notImplemented("The project contains Demand Gen ad helper functions and form configuration, but the global campaign route does not connect a complete campaign/budget/ad group/ad workflow.")),
    features: {
      budget: partial("Budget options are represented in the form; end-to-end Demand Gen campaign creation is not connected."),
      bidding: partial("Some Demand Gen bidding options are represented, but there is no complete global execution path."),
      locationTargeting: partial("Targeting inputs are present in portions of the builder; end-to-end workflow validation is pending."),
      creativeAssets: partial("Multi-asset and carousel helper functions exist, but they do not establish a complete end-to-end campaign workflow."),
      conversionMeasurement: partial("Measurement options are represented, but live execution is not connected."),
    },
    options: {
      performanceGoals: [
        { value: "CONVERSIONS", label: "Conversions" },
        { value: "CONVERSION_VALUE", label: "Conversion Value" },
        { value: "CLICKS", label: "Website Clicks" },
      ],
      biddingStrategies: [
        { value: "MAXIMIZE_CLICKS", label: "Maximize Clicks" },
        { value: "TARGET_CPA", label: "Target CPA" },
        { value: "MAXIMIZE_CONVERSIONS", label: "Maximize Conversions" },
        { value: "TARGET_ROAS", label: "Target ROAS" },
      ],
    },
    notes: ["Keep Demand Gen distinct from Display and do not treat multi-asset, video-responsive, carousel and product ads as interchangeable."],
  },
  {
    id: "googleAds.shopping",
    provider: "googleAds",
    label: "Shopping",
    builderCampaignType: "SHOPPING",
    providerCampaignType: "SHOPPING",
    providerCampaignTypeKind: "NATIVE",
    hierarchy: ["Google Ads Customer", "Campaign", "Ad Group", "Product Listing Groups", "Product Ads"],
    apiVersion: "v26",
    operations: googleOperations(notImplemented("Shopping settings and Merchant Center lookups are present in the project, but the global Google campaign route does not connect a complete Shopping creation workflow.")),
    features: {
      budget: partial("Budget configuration exists in the builder; complete Shopping execution is not connected."),
      bidding: partial("Shopping bidding choices are represented in the builder; end-to-end creation is not connected."),
      commerceResources: blockedExternal("Merchant Center account discovery exists, but product/feed use remains dependent on Merchant API registration and account access.", ["The previous Merchant API registration attempt was blocked by HOMEPAGE_NOT_VERIFIED."]),
      creativeAssets: notImplemented("Product listing groups and product ad creation are not connected as a complete workflow."),
    },
    prerequisites: ["A linked and eligible Merchant Center account.", "Merchant Center data source/feed and product availability for the selected account."],
  },
  {
    id: "googleAds.hotel",
    provider: "googleAds",
    label: "Hotel",
    builderCampaignType: "HOTEL",
    providerCampaignType: "HOTEL",
    providerCampaignTypeKind: "NATIVE",
    hierarchy: ["Google Ads Customer", "Campaign", "Hotel Ad Group", "Hotel Ad"],
    apiVersion: "v26",
    operations: googleOperations(blockedExternal("Hotel campaign creation is not connected as a complete AdSyntra workflow and requires a valid linked Hotel Center account and access.")),
    features: {
      budget: partial("Hotel budget and bidding fields exist in the form, but campaign creation is not connected."),
      bidding: partial("Hotel-specific bidding options are represented in the builder; full execution is not connected."),
      commerceResources: blockedExternal("Hotel Center is a separate provider dependency. Merchant Center must not be used as a substitute.", ["The previously selected Google Ads account had no Hotel Center account linked."]),
      creativeAssets: notImplemented("Hotel Ad Group and Hotel Ad resource creation is not connected."),
    },
    prerequisites: ["A linked Hotel Center account.", "Eligible hotel/property inventory and required account allowlisting."],
    notes: ["Merchant Center and Hotel Center are separate services and their IDs must never be interchanged."],
    migration: {
      replacementProfile: "SEARCH_FOR_TRAVEL",
      message: "Google is transitioning Hotel campaigns toward Search campaigns for Travel. Keep Hotel Center inventory, prices and landing pages as external prerequisites; do not treat the new target as a generic Search campaign.",
    },
  },
  {
    id: "googleAds.app",
    provider: "googleAds",
    label: "App campaign",
    builderCampaignType: "APP",
    providerCampaignType: "MULTI_CHANNEL",
    providerCampaignTypeKind: "NATIVE",
    hierarchy: ["Google Ads Customer", "Campaign (MULTI_CHANNEL)", "App Campaign Assets / Settings"],
    apiVersion: "v26",
    operations: googleOperations(notImplemented("The project validates Android package names and iOS App Store IDs, but App Campaign creation and its subtype-specific resource workflow are not connected.")),
    features: {
      identityAndDestination: partial("Store-aware app identity normalization/validation is present; it is not proof of App Campaign execution."),
      budget: partial("App budget fields are represented in the builder; execution is not connected."),
      bidding: partial("App subtype and goal choices are represented in the builder; execution is not connected."),
      creativeAssets: notImplemented("Subtype-specific App Campaign asset attachment is not connected."),
    },
    prerequisites: ["Valid Android package / Play listing or numeric iOS App Store identity.", "Campaign subtype and optimization goal supported for the selected app and account."],
  },
  {
    id: "googleAds.video",
    provider: "googleAds",
    label: "Classic Video campaign",
    builderCampaignType: "VIDEO",
    providerCampaignType: "VIDEO",
    providerCampaignTypeKind: "NATIVE",
    hierarchy: ["Google Ads Customer", "Campaign", "Ad Group", "Video Ad"],
    apiVersion: "v26",
    operations: {
      ...googleOperations(readOnly("The current builder explicitly labels Classic Video as read/report only; no campaign write workflow is connected.")),
      create: readOnly("Classic Video campaign creation is not available in the current AdSyntra integration."),
    },
    features: {
      reporting: implemented("Existing Google campaign reporting can read provider campaign records."),
      creativeAssets: notImplemented("Classic Video campaign and ad creation are not connected."),
    },
    notes: ["YouTube video asset helper availability does not mean a complete Classic Video campaign workflow exists."],
  },
];

const metaCampaignObjectives = [
  { value: "OUTCOME_AWARENESS", label: "Awareness" },
  { value: "OUTCOME_TRAFFIC", label: "Traffic" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engagement" },
  { value: "OUTCOME_LEADS", label: "Leads" },
  { value: "OUTCOME_SALES", label: "Sales" },
  { value: "OUTCOME_APP_PROMOTION", label: "App Promotion" },
];

const metaCampaign: CampaignCapabilityDefinition = {
  id: "metaAds.campaign",
  provider: "metaAds",
  label: "Meta Ads campaign",
  builderCampaignType: "CAMPAIGN",
  providerCampaignType: "CAMPAIGN",
  providerCampaignTypeKind: "BUILDER_PROFILE",
  hierarchy: ["Meta Ad Account", "Campaign", "Ad Set", "Ad"],
  apiVersion: "v26.0",
  operations: {
    create: partial("Campaign → Ad Set → Creative → Ad orchestration exists, but the project backlog records a critical hard-coded existing-Page-post fallback in the creative service. Do not mark Meta live creative creation production-ready until that issue is fixed and retested.", ["Single-image fresh-creative path requires the META-01 fix and live retest.", "Video, carousel and catalog/Product Set creative execution are not complete end-to-end."]),
    list: implemented("Meta campaign listing is present in the campaign service."),
    read: implemented("Campaign/ad set/ad read and reporting foundations are present."),
    rename: implemented("Campaign rename action is present in the campaign route."),
    pause: implemented("Campaign status management is present in the campaign route."),
    resume: implemented("Campaign status management is present in the campaign route."),
    delete: implemented("Campaign delete action is present in the campaign route."),
    editConfiguration: noConfigurationEdit,
  },
  features: {
    budget: implemented("Campaign-level and Ad Set-level budget configuration exists; currency minor units are used for Meta."),
    bidding: partial("Bid strategy, optimization goal and billing event fields are modeled with compatibility validation; test combinations against objective and account."),
    schedule: implemented("Ad Set start and stop scheduling is present in the creation service."),
    locationTargeting: implemented("Meta included/excluded geographic targeting and city-radius structures are present in the project."),
    languageTargeting: partial("Locale targeting is provider-specific and should only be shown for eligible objectives and placements."),
    audienceTargeting: partial("Custom/Saved Audience and detailed-targeting foundations exist; additional lifecycle and eligibility work remains."),
    demographicTargeting: partial("Age, gender and Special Ad Category restrictions need objective/category-specific policy validation."),
    placements: partial("Manual placement controls exist, but the current v26 catalogue requires cleanup; Instagram Explore must not be offered as a manual placement."),
    conversionMeasurement: partial("Pixel/Dataset, event and Custom Conversion lookup/configuration exists; resource existence does not prove event delivery or health."),
    identityAndDestination: implemented("Page/Instagram identity and destination lookup workflows are present in the current project snapshot."),
    commerceResources: partial("Catalog and Product Set backend lookup routes exist, but the campaign builder does not yet connect their complete selector/attachment workflow."),
    creativeAssets: partial("Single-image, video and carousel formats are represented, but backend video and carousel pipelines are not complete end-to-end."),
    reporting: implemented("Meta campaign reporting/listing foundations are present."),
  },
  options: {
    providerObjectives: metaCampaignObjectives,
    buyingTypes: [
      { value: "AUCTION", label: "Auction" },
      { value: "RESERVED", label: "Reservation" },
    ],
    biddingStrategies: [
      { value: "LOWEST_COST_WITHOUT_CAP", label: "Highest volume (no bid cap)" },
      { value: "LOWEST_COST_WITH_BID_CAP", label: "Bid cap" },
      { value: "COST_CAP", label: "Cost cap" },
      { value: "LOWEST_COST_WITH_MIN_ROAS", label: "Minimum ROAS" },
    ],
    optimizationGoalsByObjective: {
      OUTCOME_AWARENESS: [
        { value: "REACH", label: "Reach" },
        { value: "IMPRESSIONS", label: "Impressions" },
        { value: "AD_RECALL_LIFT", label: "Ad Recall Lift" },
      ],
      OUTCOME_TRAFFIC: [
        { value: "LINK_CLICKS", label: "Link Clicks" },
        { value: "LANDING_PAGE_VIEWS", label: "Landing Page Views" },
      ],
      OUTCOME_ENGAGEMENT: [
        { value: "POST_ENGAGEMENT", label: "Post Engagement" },
        { value: "PAGE_LIKES", label: "Page Likes" },
        { value: "CONVERSATIONS", label: "Conversations" },
      ],
      OUTCOME_LEADS: [
        { value: "LEAD_GENERATION", label: "Lead Generation" },
        { value: "OFFSITE_CONVERSIONS", label: "Offsite Conversions" },
      ],
      OUTCOME_SALES: [
        { value: "OFFSITE_CONVERSIONS", label: "Offsite Conversions" },
        { value: "VALUE", label: "Conversion Value" },
      ],
      OUTCOME_APP_PROMOTION: [
        { value: "APP_INSTALLS", label: "App Installs" },
        { value: "OFFSITE_CONVERSIONS", label: "Offsite Conversions" },
      ],
    },
  },
  prerequisites: ["A connected Meta Ad Account.", "For Page-based formats, a Page and eligible linked Instagram identity where required.", "For website conversion campaigns, an eligible Pixel/Dataset and event configuration.", "Special Ad Category declarations and targeting restrictions where applicable."],
  notes: [
    "Meta's hierarchy is Campaign → Ad Set → Ad. AdCreative and media assets are separate provider resources referenced by an Ad.",
    "Meta v26.0 is the current project default; do not mix v27.0 assumptions into this registry without an intentional version upgrade.",
    "An existing Pixel or Conversion resource does not prove browser/server event delivery is healthy.",
  ],
};

export const CAMPAIGN_CAPABILITY_DATA: Record<CampaignProvider, CampaignCapabilityDefinition[]> = {
  googleAds: googleCampaigns,
  metaAds: [metaCampaign],
};
