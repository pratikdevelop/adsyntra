/**
 * Unified Ads Platform — Provider API Mapping (Google Ads API v26 / Meta Marketing API v26.0)
 *
 * PURPOSE
 * - Keep the platform's normalized concepts separate from provider-native API fields.
 * - Document provider resource hierarchy, current enums, field paths, and validation rules.
 * - Serve as a capability/reference module for adapters; it is NOT an API client and
 *   does not make network calls.
 *
 * VERSION BASELINE
 * - Google Ads API: v26 (Google Ads API v26 reference)
 * - Meta Marketing API: v26.0 (Meta Business SDK v26.0.x generated object definitions)
 *
 * IMPORTANT
 * - Enum availability does not guarantee that every value works for every objective,
 *   campaign type, account, country, placement, or buying type.
 * - Validate provider-specific compatibility and account eligibility before mutation.
 * - Create campaign/ad set/ad resources paused by default where supported.
 * - Exception: Google Hotel AdGroupAd must be ENABLED; keep the parent Campaign or
 *   AdGroup paused until the rest of the workflow is validated.
 */

export const PROVIDER_API_VERSIONS = Object.freeze({
    googleAds: "v26",
    metaMarketing: "v26.0",
    verifiedAgainst: "2026-11-03",
} as const);

// -----------------------------------------------------------------------------
// Shared platform concepts — these are OUR values, not provider API enums.
// -----------------------------------------------------------------------------

export const PLATFORM_CAMPAIGN_OBJECTIVES = Object.freeze([
    "AWARENESS",
    "CONSIDERATION",
    "TRAFFIC",
    "LEADS",
    "SALES",
    "APP_PROMOTION",
    "LOCAL_ACTIONS",
] as const);

export type PlatformCampaignObjective =
    (typeof PLATFORM_CAMPAIGN_OBJECTIVES)[number];

export const PLATFORM_BUDGET_MODES = Object.freeze({
    DAILY: "DAILY",
    LIFETIME: "LIFETIME",
} as const);

// -----------------------------------------------------------------------------
// GOOGLE ADS API v26
// -----------------------------------------------------------------------------

/** Exact AdvertisingChannelType values relevant to campaign creation. */
export const GOOGLE_ADS_CHANNEL_TYPES = Object.freeze({
    DEMAND_GEN: "DEMAND_GEN",
    DISPLAY: "DISPLAY",
    HOTEL: "HOTEL",
    LOCAL: "LOCAL",
    LOCAL_SERVICES: "LOCAL_SERVICES",
    MULTI_CHANNEL: "MULTI_CHANNEL",
    PERFORMANCE_MAX: "PERFORMANCE_MAX",
    SEARCH: "SEARCH",
    SHOPPING: "SHOPPING",
    SMART: "SMART",
    TRAVEL: "TRAVEL",
    VIDEO: "VIDEO",
} as const);

export type GoogleAdsChannelType =
    (typeof GOOGLE_ADS_CHANNEL_TYPES)[keyof typeof GOOGLE_ADS_CHANNEL_TYPES];

/**
 * Builder alias mapping. APP is a platform/UI term, NOT a Google channel enum.
 * Google App campaigns use MULTI_CHANNEL and a specific channel subtype.
 */
export const GOOGLE_BUILDER_CAMPAIGN_TYPE_MAP = Object.freeze({
    SEARCH: { advertisingChannelType: "SEARCH" },
    DISPLAY: { advertisingChannelType: "DISPLAY" },
    PERFORMANCE_MAX: { advertisingChannelType: "PERFORMANCE_MAX" },
    DEMAND_GEN: { advertisingChannelType: "DEMAND_GEN" },
    SHOPPING: { advertisingChannelType: "SHOPPING" },
    HOTEL: { advertisingChannelType: "HOTEL" },
    VIDEO: { advertisingChannelType: "VIDEO", support: "SUBTYPE_AND_CAMPAIGN_VARIANT_CHECK_REQUIRED" },
    APP: {
        advertisingChannelType: "MULTI_CHANNEL",
        subtypes: [
            "APP_CAMPAIGN",
            "APP_CAMPAIGN_FOR_ENGAGEMENT",
            "APP_CAMPAIGN_FOR_PRE_REGISTRATION",
        ],
    },
    LOCAL: { advertisingChannelType: "LOCAL" },
    LOCAL_SERVICES: { advertisingChannelType: "LOCAL_SERVICES" },
    TRAVEL: { advertisingChannelType: "TRAVEL" },
} as const);

/** Known subtypes used by the workflows covered in this mapping. */
export const GOOGLE_ADS_CAMPAIGN_SUBTYPES = Object.freeze({
    APP: [
        "APP_CAMPAIGN",
        "APP_CAMPAIGN_FOR_ENGAGEMENT",
        "APP_CAMPAIGN_FOR_PRE_REGISTRATION",
    ],
    PERFORMANCE_MAX: ["TRAVEL_GOALS"],
    // Do not add UI labels such as STANDARD as API subtypes without checking the enum.
} as const);

/**
 * Platform objective labels. Google Campaign has no generic objective field that
 * accepts these values. The adapter maps the chosen platform goal to compatible
 * channel type, conversion goals, settings, and bidding scheme.
 */
export const GOOGLE_BUILDER_OBJECTIVE_MAP = Object.freeze({
    AWARENESS: { apiObjectiveField: null, mappingNote: "Use channel-specific settings and awareness/reach bidding where supported." },
    CONSIDERATION: { apiObjectiveField: null, mappingNote: "Use campaign-type settings and relevant engagement/traffic configuration." },
    TRAFFIC: { apiObjectiveField: null, mappingNote: "Common Search mapping: TARGET_SPEND (Maximize clicks); Demand Gen may use TARGET_CPC." },
    LEADS: { apiObjectiveField: null, mappingNote: "Configure conversion goals and MAXIMIZE_CONVERSIONS; optional target CPA." },
    SALES: { apiObjectiveField: null, mappingNote: "Configure purchase/value conversion goals and MAXIMIZE_CONVERSION_VALUE; optional target ROAS." },
    APP_PROMOTION: { apiObjectiveField: null, mappingNote: "Use MULTI_CHANNEL App campaign subtype, app settings, app goal type and compatible bidding." },
    LOCAL_ACTIONS: { apiObjectiveField: null, mappingNote: "Map to the appropriate Local/Local Services/other eligible campaign workflow." },
} as const);

/**
 * UI-level bidding labels mapped to native Campaign.campaign_bidding_strategy
 * oneof fields. These are configuration hints, not a promise that every strategy
 * is valid for every channel type.
 */
export const GOOGLE_ADS_BIDDING_MAP = Object.freeze({
    MAXIMIZE_CONVERSIONS: {
        campaignBiddingStrategyField: "maximize_conversions",
        relevantFields: ["campaign.maximize_conversions.target_cpa_micros"],
        note: "Standard strategy; optional target CPA is set inside MaximizeConversions.",
    },
    TARGET_CPA: {
        campaignBiddingStrategyField: "maximize_conversions",
        relevantFields: ["campaign.maximize_conversions.target_cpa_micros"],
        note: "For standard target-CPA behavior, use MaximizeConversions with target_cpa_micros. Separate TargetCpa/portfolio contexts have their own compatibility rules.",
    },
    MAXIMIZE_CONVERSION_VALUE: {
        campaignBiddingStrategyField: "maximize_conversion_value",
        relevantFields: ["campaign.maximize_conversion_value.target_roas"],
        note: "Standard strategy; optional target ROAS is set inside MaximizeConversionValue.",
    },
    TARGET_ROAS: {
        campaignBiddingStrategyField: "maximize_conversion_value",
        relevantFields: ["campaign.maximize_conversion_value.target_roas"],
        note: "For standard target-ROAS behavior, use MaximizeConversionValue with target_roas.",
    },
    MAXIMIZE_CLICKS: {
        campaignBiddingStrategyField: "target_spend",
        relevantFields: ["campaign.target_spend.cpc_bid_ceiling_micros"],
        note: "Maximize clicks is represented by the TargetSpend bidding scheme; there is no campaign.maximize_clicks field.",
    },
    TARGET_IMPRESSION_SHARE: {
        campaignBiddingStrategyField: "target_impression_share",
        relevantFields: [
            "campaign.target_impression_share.location",
            "campaign.target_impression_share.location_fraction_micros",
            "campaign.target_impression_share.cpc_bid_ceiling_micros",
        ],
        note: "Validate supported channel types and location/share settings.",
    },
    TARGET_CPC: {
        campaignBiddingStrategyField: "target_cpc",
        relevantFields: ["campaign.target_cpc.target_cpc_micros"],
        note: "Used for eligible Demand Gen workflows; not a universal Search bidding option.",
    },
    TARGET_CPM: {
        campaignBiddingStrategyField: "target_cpm",
        relevantFields: ["campaign.target_cpm"],
        note: "Validate supported video/awareness campaign subtype and frequency-goal configuration.",
    },
    TARGET_CPV: {
        campaignBiddingStrategyField: "target_cpv",
        relevantFields: ["campaign.target_cpv"],
        note: "Validate video campaign subtype support.",
    },
    MANUAL_CPC: {
        campaignBiddingStrategyField: "manual_cpc",
        relevantFields: ["campaign.manual_cpc", "ad_group.cpc_bid_micros"],
        note: "Campaign strategy selection and actual ad-group/criterion bid configuration are distinct concerns.",
    },
    MANUAL_CPM: {
        campaignBiddingStrategyField: "manual_cpm",
        relevantFields: ["campaign.manual_cpm"],
        note: "Only supported campaign/network contexts; do not expose universally.",
    },
    MANUAL_CPV: {
        campaignBiddingStrategyField: "manual_cpv",
        relevantFields: ["campaign.manual_cpv", "ad_group_ad.*"],
        note: "Video-specific compatibility applies.",
    },
    PERCENT_CPC: {
        campaignBiddingStrategyField: "percent_cpc",
        relevantFields: ["campaign.percent_cpc.cpc_bid_ceiling_micros"],
        note: "Specialized Shopping/Hotel-related use; Hotel bid amounts may be set at ad-group or listing-group level.",
    },
} as const);

/**
 * Google API strategy type names are not all the same as UI labels above.
 * In particular, Maximize clicks is TARGET_SPEND; standard target CPA/ROAS
 * behavior is commonly configured through MAXIMIZE_CONVERSIONS / MAXIMIZE_CONVERSION_VALUE.
 */
export const GOOGLE_ADS_BIDDING_STRATEGY_TYPE_ENUM = Object.freeze([
    "COMMISSION",
    "ENHANCED_CPC",
    "FIXED_CPM",
    "FIXED_SHARE_OF_VOICE",
    "MANUAL_CPA",
    "MANUAL_CPC",
    "MANUAL_CPM",
    "MANUAL_CPV",
    "MAXIMIZE_CONVERSIONS",
    "MAXIMIZE_CONVERSION_VALUE",
    "PAGE_ONE_PROMOTED",
    "PERCENT_CPC",
    "TARGET_CPA",
    "TARGET_CPC",
    "TARGET_CPM",
    "TARGET_CPV",
    "TARGET_IMPRESSION_SHARE",
    "TARGET_OUTRANK_SHARE",
    "TARGET_ROAS",
    "TARGET_SPEND",
] as const);

export const GOOGLE_ADS_BIDDING_STRATEGY_RESTRICTIONS = Object.freeze({
    COMMISSION: "No longer available for Hotel campaigns; use a supported strategy such as Target ROAS where eligible.",
    TARGET_OUTRANK_SHARE: "No longer available; use Target Impression Share where appropriate.",
    ENHANCED_CPC: "Deprecated for Search and Display; do not offer as a new general-purpose strategy.",
    MANUAL_CPA: "Local Services campaigns only.",
    MANUAL_CPM: "Display Network-only context; not valid for Search.",
    HOTEL: "Hotel Ads has a dedicated workflow. Current documented campaign strategies include Manual CPC, Percent CPC and Target ROAS; bid placement differs by strategy.",
} as const);

/** Exact NetworkSettings field paths (not all are appropriate for every channel). */
export const GOOGLE_ADS_NETWORK_SETTING_FIELDS = Object.freeze({
    GOOGLE_SEARCH: "campaign.network_settings.target_google_search",
    SEARCH_NETWORK_PARTNERS: "campaign.network_settings.target_search_network",
    DISPLAY_NETWORK_EXPANSION: "campaign.network_settings.target_content_network",
    PARTNER_SEARCH_NETWORK: "campaign.network_settings.target_partner_search_network",
    YOUTUBE: "campaign.network_settings.target_youtube",
    GOOGLE_TV: "campaign.network_settings.target_google_tv_network",
} as const);

export const GOOGLE_ADS_CAMPAIGN_CREATE_FIELDS = Object.freeze({
    requiredOrCore: [
        "campaign.name",
        "campaign.advertising_channel_type",
        "campaign.campaign_budget",
        "campaign.contains_eu_political_advertising",
    ],
    recommendedInitialStatus: "PAUSED",
    statusValues: ["ENABLED", "PAUSED", "REMOVED"],
    pausePolicy: "Pause Campaign/AdGroup during construction. Google Hotel AdGroupAd itself must be ENABLED; keep its parent Campaign or AdGroup paused until validation completes.",
    immutableAfterCreate: ["campaign.advertising_channel_type", "campaign.advertising_channel_sub_type"],
    biddingUnion: "campaign.campaign_bidding_strategy",
} as const);

export const GOOGLE_ADS_EU_POLITICAL_ADVERTISING_VALUES = Object.freeze([
    "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    "CONTAINS_EU_POLITICAL_ADVERTISING",
] as const);

export const GOOGLE_ADS_BUDGET_MAPPING = Object.freeze({
    resource: "CampaignBudget",
    service: "CampaignBudgetService",
    mutateMethod: "MutateCampaignBudgets",
    averageDaily: {
        period: "DAILY",
        amountField: "campaign_budget.amount_micros",
        unit: "account_currency_micros",
        microsPerCurrencyUnit: 1_000_000,
    },
    campaignTotal: {
        period: "CUSTOM_PERIOD",
        amountField: "campaign_budget.total_amount_micros",
        unit: "account_currency_micros",
        explicitlyShared: false,
        requiresCampaignStartAndEndDatesForSupportedTypes: true,
        budgetTypeCanBeChangedAfterCampaignCreation: false,
    },
    appCampaigns: {
        sharedBudgetAllowed: false,
        explicitlyShared: false,
    },
} as const);

export const GOOGLE_ADS_PORTFOLIO_BIDDING_MAPPING = Object.freeze({
    resource: "BiddingStrategy",
    service: "BiddingStrategyService",
    mutateMethod: "MutateBiddingStrategies",
    campaignReferenceField: "campaign.bidding_strategy",
    note: "Use this resource for portfolio strategies. Standard strategies are configured in Campaign.campaign_bidding_strategy; do not set both for one campaign.",
} as const);

/**
 * A GAQL audit query for campaigns and their budget/bidding/network configuration.
 * Optional filters are enum-constrained to avoid unsafe query-string injection.
 */
export type GoogleCampaignStatus = "ENABLED" | "PAUSED" | "REMOVED";

export interface GoogleCampaignAuditQueryOptions {
    channelType?: GoogleAdsChannelType;
    statuses?: readonly GoogleCampaignStatus[];
}

export function buildGoogleCampaignAuditQuery(
    options: GoogleCampaignAuditQueryOptions = {},
): string {
    const statuses = options.statuses ?? ["ENABLED", "PAUSED"];
    const statusClause = statuses.map((value) => `'${value}'`).join(", ");
    const channelClause = options.channelType
        ? `\n  AND campaign.advertising_channel_type = '${options.channelType}'`
        : "";

    return `SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  campaign.advertising_channel_sub_type,
  campaign.bidding_strategy_type,
  campaign.campaign_budget,
  campaign.network_settings.target_google_search,
  campaign.network_settings.target_search_network,
  campaign.network_settings.target_content_network,
  campaign.network_settings.target_partner_search_network,
  campaign.maximize_conversions.target_cpa_micros,
  campaign.maximize_conversion_value.target_roas,
  campaign.target_cpa.target_cpa_micros,
  campaign.target_roas.target_roas,
  campaign.target_spend.cpc_bid_ceiling_micros,
  campaign.target_cpc.target_cpc_micros,
  campaign.target_impression_share.location,
  campaign.target_impression_share.location_fraction_micros,
  campaign.target_impression_share.cpc_bid_ceiling_micros,
  campaign_budget.period,
  campaign_budget.amount_micros,
  campaign_budget.total_amount_micros
FROM campaign
WHERE campaign.status IN (${statusClause})${channelClause}`;
}

/** Corrected Google campaign hierarchy is intentionally type-dependent. */
export const GOOGLE_ADS_CAMPAIGN_HIERARCHY = Object.freeze({
    SEARCH: ["Campaign", "AdGroup", "AdGroupCriterion (keywords/targeting)", "AdGroupAd"],
    DISPLAY: ["Campaign", "AdGroup", "AdGroupCriterion / targeting", "AdGroupAd"],
    PERFORMANCE_MAX: ["Campaign", "AssetGroup", "AssetGroupAsset", "AssetGroupSignal"],
    DEMAND_GEN: ["Campaign", "AdGroup", "AdGroupCriterion / audience", "AdGroupAd"],
    SHOPPING: ["Campaign", "AdGroup", "AdGroupCriterion (ListingGroupInfo)", "Ad (ShoppingProductAd)", "AdGroupAd"],
    HOTEL: ["Campaign (HotelSettingInfo)", "AdGroup (type HOTEL_ADS)", "AdGroupCriterion (HotelListingGroupInfo)", "Ad (HotelAdInfo)", "AdGroupAd (must be ENABLED; pause parent while building)"],
    APP: ["Campaign (MULTI_CHANNEL + App subtype)", "AdGroup", "AppAd"],
    VIDEO: ["Campaign", "AdGroup", "VideoAd"],
    note: "Use the campaign-type-specific Google Ads guide; do not impose a single child-resource model on every channel.",
} as const);

// -----------------------------------------------------------------------------
// META MARKETING API v26.0 — backed by Meta Business SDK generated definitions.
// -----------------------------------------------------------------------------

export const META_CAMPAIGN_OBJECTIVES = Object.freeze({
    AWARENESS: "OUTCOME_AWARENESS",
    ENGAGEMENT: "OUTCOME_ENGAGEMENT",
    LEADS: "OUTCOME_LEADS",
    SALES: "OUTCOME_SALES",
    TRAFFIC: "OUTCOME_TRAFFIC",
    APP_PROMOTION: "OUTCOME_APP_PROMOTION",
} as const);

export type MetaCampaignObjective =
    (typeof META_CAMPAIGN_OBJECTIVES)[keyof typeof META_CAMPAIGN_OBJECTIVES];

export const META_BUILDER_OBJECTIVE_MAP = Object.freeze({
    AWARENESS: { objective: "OUTCOME_AWARENESS" },
    TRAFFIC: { objective: "OUTCOME_TRAFFIC" },
    LEADS: { objective: "OUTCOME_LEADS" },
    SALES: { objective: "OUTCOME_SALES" },
    APP_PROMOTION: { objective: "OUTCOME_APP_PROMOTION" },
    CONSIDERATION: { objective: null, requiresSubGoalSelection: ["OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT"] },
    LOCAL_ACTIONS: { objective: null, requiresSubGoalSelection: ["OUTCOME_AWARENESS", "OUTCOME_ENGAGEMENT", "OUTCOME_LEADS"] },
} as const);

export const META_BUYING_TYPES = Object.freeze({
    AUCTION: "AUCTION",
    RESERVED: "RESERVED",
} as const);

/**
 * Meta exposes these bid strategy values in Campaign and AdSet SDK definitions.
 * Availability/placement is context-dependent; do not blindly send on both.
 */
export const META_BID_STRATEGIES = Object.freeze({
    LOWEST_COST_WITHOUT_CAP: "LOWEST_COST_WITHOUT_CAP",
    LOWEST_COST_WITH_BID_CAP: "LOWEST_COST_WITH_BID_CAP",
    COST_CAP: "COST_CAP",
    LOWEST_COST_WITH_MIN_ROAS: "LOWEST_COST_WITH_MIN_ROAS",
} as const);

/** Current SDK SmartPromotionType values; not Advantage+ product labels. */
export const META_SMART_PROMOTION_TYPES = Object.freeze({
    GUIDED_CREATION: "GUIDED_CREATION",
    SMART_APP_PROMOTION: "SMART_APP_PROMOTION",
} as const);

export const META_CONFIGURED_STATUSES = Object.freeze([
    "ACTIVE",
    "PAUSED",
    "DELETED",
    "ARCHIVED",
] as const);

export const META_INITIAL_CREATE_STATUSES = Object.freeze([
    "PAUSED",
    "ACTIVE",
] as const);

export const META_SPECIAL_AD_CATEGORIES = Object.freeze([
    "CREDIT",
    "EMPLOYMENT",
    "FINANCIAL_PRODUCTS_SERVICES",
    "HOUSING",
    "ISSUES_ELECTIONS_POLITICS",
    "ONLINE_GAMBLING_AND_GAMING",
] as const);

/**
 * Meta's objective is a Campaign field. The following values are not exhaustive
 * for every optimization goal; use the current API version and objective-specific
 * validation before allowing a user to submit a combination.
 */
export const META_ADSET_OPTIMIZATION_GOALS = Object.freeze([
    "ADVERTISER_SILOED_VALUE",
    "AD_RECALL_LIFT",
    "APP_INSTALLS",
    "APP_INSTALLS_AND_OFFSITE_CONVERSIONS",
    "AUTOMATIC_OBJECTIVE",
    "CONVERSATIONS",
    "DERIVED_EVENTS",
    "ENGAGED_PAGE_VIEWS",
    "ENGAGED_USERS",
    "EVENT_RESPONSES",
    "IMPRESSIONS",
    "IN_APP_VALUE",
    "LANDING_PAGE_VIEWS",
    "LEAD_GENERATION",
    "LINK_CLICKS",
    "MEANINGFUL_CALL_ATTEMPT",
    "MESSAGING_APPOINTMENT_CONVERSION",
    "MESSAGING_DEEP_CONVERSATION_AND_FOLLOW",
    "MESSAGING_PURCHASE_CONVERSION",
    "NONE",
    "OFFSITE_CONVERSIONS",
    "PAGE_LIKES",
    "POST_ENGAGEMENT",
    "PROFILE_AND_PAGE_ENGAGEMENT",
    "PROFILE_VISIT",
    "QUALITY_CALL",
    "QUALITY_LEAD",
    "REACH",
    "REMINDERS_SET",
    "SUBSCRIBERS",
    "THRUPLAY",
    "VALUE",
    "VISIT_INSTAGRAM_PROFILE",
] as const);

export const META_ADSET_BILLING_EVENTS = Object.freeze([
    "APP_INSTALLS",
    "CLICKS",
    "IMPRESSIONS",
    "LINK_CLICKS",
    "LISTING_INTERACTION",
    "NONE",
    "OFFER_CLAIMS",
    "PAGE_LIKES",
    "POST_ENGAGEMENT",
    "PURCHASE",
    "THRUPLAY",
] as const);

export const META_CAMPAIGN_RESOURCE = Object.freeze({
    endpoint: "POST /act_{ad_account_id}/campaigns",
    fields: [
        "name",
        "objective",
        "status",
        "buying_type",
        "special_ad_categories",
        "special_ad_category_country",
        "smart_promotion_type (only when applicable)",
        "daily_budget (campaign-level budget mode)",
        "lifetime_budget (campaign-level budget mode)",
        "bid_strategy (only when applicable to selected campaign/budget setup)",
        "is_adset_budget_sharing_enabled (optional/feature-specific)",
        "adset_budgets (optional/feature-specific budget-sharing configuration)",
        "spend_cap (optional account/campaign control where supported)",
    ],
    notes: [
        "Use modern OUTCOME_* objective values for new campaign creation.",
        "special_ad_categories is supplied as an array; use [] when no special category applies.",
        "CBO is a platform/UI concept, not a buying_type enum. For a simple campaign-budget setup, place the budget at Campaign level. Advanced ad-set budget sharing uses additional Campaign fields such as is_adset_budget_sharing_enabled/adset_budgets and must follow the specific feature workflow.",
        "RESERVED is a valid buying_type enum, but Reach and Frequency requires eligibility and a separate planning/reservation workflow; setting RESERVED alone is not sufficient.",
        "Advantage+ Shopping/Leads labels are product workflows, not values of smart_promotion_type. Do not substitute ASC_CAMPAIGN or ADVANTAGE_LEADS_CAMPAIGN into this field.",
    ],
} as const);

export const META_ADSET_RESOURCE = Object.freeze({
    endpoint: "POST /{campaign_id}/adsets",
    fields: [
        "name",
        "campaign_id",
        "status",
        "daily_budget (AdSet-level budget mode)",
        "lifetime_budget (AdSet-level budget mode)",
        "start_time",
        "end_time",
        "billing_event",
        "optimization_goal",
        "bid_strategy",
        "bid_amount (where required by the chosen bid strategy)",
        "bid_constraints (where required, including applicable minimum-ROAS configuration)",
        "targeting",
        "promoted_object (objective/destination-dependent)",
    ],
    notes: [
        "For a simple ABO setup, place the budget at AdSet level and omit Campaign daily_budget/lifetime_budget.",
        "Do not hard-code one universal billing_event/optimization_goal pair; compatibility depends on objective, destination, optimization event and account features.",
        "LOWEST_COST_WITH_BID_CAP and COST_CAP commonly require bid_amount; LOWEST_COST_WITH_MIN_ROAS uses bid_constraints rather than the same bid_amount pattern. Validate current endpoint rules before mutation.",
        "AdSet scheduling uses start_time/end_time. A lifetime budget normally needs a schedule/end time.",
    ],
} as const);

export interface MetaTargetingLocationKey {
    key: string;
}

export interface MetaTargetingInterest {
    id: string;
    name?: string;
}

export interface MetaTargeting {
    geo_locations: {
        countries?: string[]; // ISO country codes
        regions?: MetaTargetingLocationKey[];
        cities?: MetaTargetingLocationKey[];
        zips?: MetaTargetingLocationKey[];
    };
    age_min?: number;
    age_max?: number;
    genders?: Array<1 | 2>;
    flexible_spec?: Array<{
        interests?: MetaTargetingInterest[];
        behaviors?: Array<{ id: string; name?: string }>;
        [key: string]: unknown;
    }>;
    custom_audiences?: Array<{ id: string }>;
    excluded_custom_audiences?: Array<{ id: string }>;
    publisher_platforms?: string[];
    facebook_positions?: string[];
    instagram_positions?: string[];
    audience_network_positions?: string[];
    messenger_positions?: string[];
}

export const META_TARGETING_RULES = Object.freeze({
    geoLocations: "targeting.geo_locations",
    interestLookup: "Use Meta targeting search IDs; do not submit free-text interest names as IDs.",
    specialAdCategories: "Housing, employment, credit, financial products/services, politics/issues/elections and other regulated categories can restrict targeting options. Validate category-country rules before creating the AdSet.",
    ageAndGender: "Do not assume age/gender controls are available for every special category or destination.",
    placements: "Manual placement fields are conditional; do not send placement arrays when using Advantage+ placements unless the API workflow requires them.",
} as const);

/** Media upload and creative creation are separate resources from Ad. */
export const META_MEDIA_AND_CREATIVE_WORKFLOW = Object.freeze({
    imageUpload: "POST /act_{ad_account_id}/adimages",
    videoUpload: "POST /act_{ad_account_id}/advideos",
    createCreative: "POST /act_{ad_account_id}/adcreatives",
    createAd: "POST /act_{ad_account_id}/ads",
    adCreativeFields: [
        "name",
        "object_story_spec",
        "asset_feed_spec (for applicable dynamic/flexible creative workflows)",
        "image_hash (where supported by the creative format)",
        "video_id (where supported by the creative format)",
        "title",
        "body",
        "call_to_action / call_to_action_type",
        "link_url",
        "page identity / Instagram identity where required",
    ],
    adFields: [
        "name",
        "adset_id",
        "creative: { creative_id } or the supported AdCreative object structure",
        "status",
    ],
    notes: [
        "AdCreative is its own resource; it is not a nested child object whose fields all belong directly on Ad.",
        "Upload image/video first when the selected creative format requires an uploaded asset; then create AdCreative; then create Ad referencing the creative.",
        "A direct image_url is not a universal replacement for upload/image_hash or object_story_spec requirements.",
    ],
} as const);

export const META_ADS_RESOURCE_HIERARCHY = Object.freeze({
    campaign: {
        endpoint: "POST /act_{ad_account_id}/campaigns",
        childResource: "AdSet",
    },
    adSet: {
        endpoint: "POST /{campaign_id}/adsets",
        childResource: "Ad",
    },
    mediaAssets: {
        endpoints: [
            "POST /act_{ad_account_id}/adimages",
            "POST /act_{ad_account_id}/advideos",
        ],
        relation: "Media assets are uploaded independently and referenced by AdCreative.",
    },
    adCreative: {
        endpoint: "POST /act_{ad_account_id}/adcreatives",
        relation: "Separate resource; created after required assets/identity/story specification are ready.",
    },
    ad: {
        endpoint: "POST /act_{ad_account_id}/ads",
        relation: "References adset_id and a created creative (normally creative_id).",
    },
} as const);

export const META_BUDGET_MAPPING = Object.freeze({
    amountUnit: "ACCOUNT_CURRENCY_SMALLEST_UNIT",
    note: "Meta budget integers use the ad account currency's smallest unit. Do not multiply Meta amounts by Google's 1,000,000 micros factor. Use account currency metadata and its decimal exponent for conversion.",
    campaignLevelFields: ["daily_budget", "lifetime_budget"],
    adSetLevelFields: ["daily_budget", "lifetime_budget"],
    commonUiModes: {
        CBO: "Campaign-level budget fields on Campaign",
        ABO: "AdSet-level budget fields on AdSet",
    },
    validation: "Choose the budget owner deliberately. Do not send campaign and ad-set budgets simultaneously unless implementing a specifically supported budget-sharing/scheduling feature and its required flags.",
} as const);

// -----------------------------------------------------------------------------
// Cross-provider adapter rules and API execution ordering.
// -----------------------------------------------------------------------------

export const PROVIDER_ADAPTER_RULES = Object.freeze([
    "Never send platform-normalized objective values directly to provider APIs.",
    "Never assume Google and Meta use the same currency scale.",
    "Google CampaignBudget is a separate resource; Meta budget fields live on Campaign or AdSet.",
    "Google standard bidding uses the Campaign.campaign_bidding_strategy union; portfolio strategies use a separate BiddingStrategy resource.",
    "Meta objective is on Campaign; optimization_goal and billing_event are on AdSet.",
    "Meta AdCreative is separate from Ad; upload media before creative creation when required.",
    "Create resources paused by default where supported and enable only after validation. Google Hotel AdGroupAd is an exception: it must be ENABLED while the parent Campaign or AdGroup remains paused.",
    "Track every provider mutation independently; persist provider resource IDs and retry only failed/unknown steps after reconciliation.",
] as const);

export const PROVIDER_API_SOURCE_URLS = Object.freeze({
    googleCampaignCreate: "https://developers.google.com/google-ads/api/docs/campaigns/create-campaigns",
    googleCampaignOverview: "https://developers.google.com/google-ads/api/docs/campaigns/overview",
    googleBidding: "https://developers.google.com/google-ads/api/docs/campaigns/bidding/strategy-types",
    googleBudgets: "https://developers.google.com/google-ads/api/docs/campaigns/budgets/overview",
    googleBudgetCreate: "https://developers.google.com/google-ads/api/docs/campaigns/budgets/create-budgets",
    googleAppCampaigns: "https://developers.google.com/google-ads/api/docs/app-campaigns/create-campaign",
    googleHotelCampaigns: "https://developers.google.com/google-ads/api/docs/hotel-ads/overview",
    googleChannelTypes: "https://developers.google.com/google-ads/api/fields/v26/campaign",
    metaBusinessSdk: "https://github.com/facebook/facebook-python-business-sdk",
    metaCampaignObject: "https://github.com/meta/facebook-python-business-sdk/blob/main/facebook_business/adobjects/campaign.py",
    metaAdSetObject: "https://github.com/meta/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adset.py",
    metaAdObject: "https://github.com/meta/facebook-python-business-sdk/blob/main/facebook_business/adobjects/ad.py",
    metaAdCreativeObject: "https://github.com/meta/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adcreative.py",
    metaApiVersionConfig: "https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/apiconfig.py",
} as const);

/**
 * Compatibility export replacing the original oversimplified hierarchy object.
 * Consumers should use the provider-specific maps above rather than infer that
 * every campaign has the same hierarchy or bidding/budget semantics.
 */
const PROVIDER_API_MAPPING = Object.freeze({
    versions: PROVIDER_API_VERSIONS,
    platformObjectives: PLATFORM_CAMPAIGN_OBJECTIVES,
    google: {
        channelTypes: GOOGLE_ADS_CHANNEL_TYPES,
        builderCampaignTypeMap: GOOGLE_BUILDER_CAMPAIGN_TYPE_MAP,
        campaignSubtypes: GOOGLE_ADS_CAMPAIGN_SUBTYPES,
        objectiveMap: GOOGLE_BUILDER_OBJECTIVE_MAP,
        biddingMap: GOOGLE_ADS_BIDDING_MAP,
        biddingStrategyTypeEnum: GOOGLE_ADS_BIDDING_STRATEGY_TYPE_ENUM,
        biddingRestrictions: GOOGLE_ADS_BIDDING_STRATEGY_RESTRICTIONS,
        networkFields: GOOGLE_ADS_NETWORK_SETTING_FIELDS,
        campaignCreateFields: GOOGLE_ADS_CAMPAIGN_CREATE_FIELDS,
        euPoliticalAdvertisingValues: GOOGLE_ADS_EU_POLITICAL_ADVERTISING_VALUES,
        budget: GOOGLE_ADS_BUDGET_MAPPING,
        portfolioBidding: GOOGLE_ADS_PORTFOLIO_BIDDING_MAPPING,
        hierarchy: GOOGLE_ADS_CAMPAIGN_HIERARCHY,
    },
    meta: {
        objectives: META_CAMPAIGN_OBJECTIVES,
        builderObjectiveMap: META_BUILDER_OBJECTIVE_MAP,
        buyingTypes: META_BUYING_TYPES,
        bidStrategies: META_BID_STRATEGIES,
        smartPromotionTypes: META_SMART_PROMOTION_TYPES,
        configuredStatuses: META_CONFIGURED_STATUSES,
        initialCreateStatuses: META_INITIAL_CREATE_STATUSES,
        specialAdCategories: META_SPECIAL_AD_CATEGORIES,
        optimizationGoals: META_ADSET_OPTIMIZATION_GOALS,
        billingEvents: META_ADSET_BILLING_EVENTS,
        campaign: META_CAMPAIGN_RESOURCE,
        adSet: META_ADSET_RESOURCE,
        targetingRules: META_TARGETING_RULES,
        mediaAndCreative: META_MEDIA_AND_CREATIVE_WORKFLOW,
        hierarchy: META_ADS_RESOURCE_HIERARCHY,
        budget: META_BUDGET_MAPPING,
    },
    adapterRules: PROVIDER_ADAPTER_RULES,
    sources: PROVIDER_API_SOURCE_URLS,
});

export default PROVIDER_API_MAPPING;
