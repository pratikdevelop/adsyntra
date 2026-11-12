
export const initialConnection: ProviderConnection = {
    connected: false,
    accounts: [],
    selectedAccountId: null,
};

export const objectives: {
    value: Objective;
    label: string;
    description: string;
}[] = [
        {
            value: "SALES",
            label: "Sales",
            description: "Generate purchases and revenue.",
        },
        {
            value: "LEADS",
            label: "Leads",
            description: "Collect enquiries and customer information.",
        },
        {
            value: "WEBSITE_TRAFFIC",
            label: "Website Traffic",
            description: "Bring visitors to your website.",
        },
        {
            value: "AWARENESS",
            label: "Brand Awareness",
            description: "Reach more people and build recognition.",
        },
        {
            value: "ENGAGEMENT",
            label: "Engagement",
            description: "Encourage interactions with your content.",
        },
        {
            value: "APP_PROMOTION",
            label: "App Promotion",
            description: "Drive app installs and app activity.",
        },
    ];

export const googleMarketingObjectiveOptions: {
    value: GoogleMarketingObjective;
    label: string;
    description: string;
}[] = [
        {
            value: "AWARENESS",
            label: "Awareness",
            description: "Build reach and brand recognition.",
        },
        {
            value: "CONSIDERATION",
            label: "Consideration",
            description: "Encourage people to explore your offer.",
        },
        {
            value: "LEAD",
            label: "Lead generation",
            description: "Generate enquiries and potential customers.",
        },
        {
            value: "SALES",
            label: "Sales",
            description: "Drive purchases and conversion value.",
        },
        {
            value: "WEBSITE_TRAFFIC",
            label: "Website traffic",
            description: "Bring relevant visitors to your site.",
        },
        {
            value: "APP_PROMOTION",
            label: "App promotion",
            description: "Promote installs and in-app activity.",
        },
        {
            value: "LOCAL_STORES_VISITS",
            label: "Local store visits",
            description: "Promote eligible physical store goals.",
        },
    ];

export const googleObjectiveFromShared: Record<Objective, GoogleMarketingObjective> = {
    AWARENESS: "AWARENESS",
    ENGAGEMENT: "CONSIDERATION",
    LEADS: "LEAD",
    SALES: "SALES",
    WEBSITE_TRAFFIC: "WEBSITE_TRAFFIC",
    APP_PROMOTION: "APP_PROMOTION",
};

export const googleCampaignTypes = [
    { value: "SEARCH", label: "Search", channelType: "SEARCH" },
    { value: "DISPLAY", label: "Display", channelType: "DISPLAY" },
    {
        value: "PERFORMANCE_MAX",
        label: "Performance Max",
        channelType: "PERFORMANCE_MAX",
    },
    { value: "DEMAND_GEN", label: "Demand Gen", channelType: "DEMAND_GEN" },
    { value: "SHOPPING", label: "Shopping", channelType: "SHOPPING" },
    { value: "HOTEL", label: "Hotel", channelType: "HOTEL" },
    { value: "APP", label: "App campaign", channelType: "MULTI_CHANNEL" },
    {
        value: "VIDEO",
        label: "Classic Video campaign (read/report; no API write workflow)",
        channelType: "VIDEO",
        disabled: true,
    },
];

export const googlePerformanceGoalsByType: Record<
    string,
    { value: GooglePerformanceGoal; label: string; biddingStrategy: string }[]
> = {
    SEARCH: [
        {
            value: "CONVERSIONS",
            label: "Conversions",
            biddingStrategy: "MAXIMIZE_CONVERSIONS",
        },
        {
            value: "CONVERSION_VALUE",
            label: "Conversion value",
            biddingStrategy: "MAXIMIZE_CONVERSION_VALUE",
        },
        {
            value: "CLICKS",
            label: "Website clicks",
            biddingStrategy: "TARGET_SPEND",
        },
        {
            value: "IMPRESSION_SHARE",
            label: "Search impression share",
            biddingStrategy: "TARGET_IMPRESSION_SHARE",
        },
    ],
    PERFORMANCE_MAX: [
        {
            value: "CONVERSIONS",
            label: "Conversions",
            biddingStrategy: "MAXIMIZE_CONVERSIONS",
        },
        {
            value: "CONVERSION_VALUE",
            label: "Conversion value",
            biddingStrategy: "MAXIMIZE_CONVERSION_VALUE",
        },
    ],
    DISPLAY: [
        {
            value: "CONVERSIONS",
            label: "Conversions",
            biddingStrategy: "MAXIMIZE_CONVERSIONS",
        },
        {
            value: "CLICKS",
            label: "Website clicks",
            biddingStrategy: "TARGET_SPEND",
        },
        {
            value: "IMPRESSIONS",
            label: "Impressions / reach",
            biddingStrategy: "TARGET_CPM",
        },
    ],
    DEMAND_GEN: [
        {
            value: "CONVERSIONS",
            label: "Conversions",
            biddingStrategy: "MAXIMIZE_CONVERSIONS",
        },
        {
            value: "CONVERSION_VALUE",
            label: "Conversion value",
            biddingStrategy: "MAXIMIZE_CONVERSION_VALUE",
        },
        {
            value: "CLICKS",
            label: "Website clicks",
            biddingStrategy: "TARGET_SPEND",
        },
    ],
    SHOPPING: [
        {
            value: "CONVERSION_VALUE",
            label: "Conversion value / Target ROAS",
            biddingStrategy: "MAXIMIZE_CONVERSION_VALUE",
        },
        {
            value: "CLICKS",
            label: "Website clicks / Maximize clicks",
            biddingStrategy: "TARGET_SPEND",
        },
    ],
    HOTEL: [
        {
            value: "CLICKS",
            label: "Hotel clicks (Percent CPC)",
            biddingStrategy: "PERCENT_CPC",
        },
    ],
};

export const googleAppSubtypeOptions: { value: GoogleAppSubtype; label: string }[] = [
    { value: "APP_CAMPAIGN", label: "App installs / in-app actions" },
    {
        value: "APP_CAMPAIGN_FOR_ENGAGEMENT",
        label: "Re-engage existing app users",
    },
    { value: "APP_CAMPAIGN_FOR_PRE_REGISTRATION", label: "App pre-registration" },
];

export const googleAppGoalOptionsBySubtype: Record<
    GoogleAppSubtype,
    { value: GoogleAppGoalType; label: string; targetKind: GoogleAppTargetKind }[]
> = {
    APP_CAMPAIGN: [
        {
            value: "OPTIMIZE_INSTALLS_TARGET_INSTALL_COST",
            label: "Maximize installs with target cost per install",
            targetKind: "CPA",
        },
        {
            value: "OPTIMIZE_INSTALLS_WITHOUT_TARGET_INSTALL_COST",
            label: "Maximize installs without a target cost",
            targetKind: null,
        },
        {
            value: "OPTIMIZE_IN_APP_CONVERSIONS_TARGET_INSTALL_COST",
            label: "Drive in-app actions using target install cost",
            targetKind: "CPA",
        },
        {
            value: "OPTIMIZE_IN_APP_CONVERSIONS_WITHOUT_TARGET_CPA",
            label: "Maximize in-app actions without target CPA",
            targetKind: null,
        },
        {
            value: "OPTIMIZE_RETURN_ON_ADVERTISING_SPEND",
            label: "Optimize for return on ad spend",
            targetKind: "ROAS",
        },
        {
            value: "OPTIMIZE_TOTAL_VALUE_WITHOUT_TARGET_ROAS",
            label: "Maximize total conversion value",
            targetKind: null,
        },
    ],
    APP_CAMPAIGN_FOR_ENGAGEMENT: [
        {
            value: "OPTIMIZE_IN_APP_CONVERSIONS_TARGET_CONVERSION_COST",
            label: "In-app conversions with target cost",
            targetKind: "CPA",
        },
        {
            value: "OPTIMIZE_IN_APP_CONVERSIONS_WITHOUT_TARGET_CPA",
            label: "Maximize in-app conversions without target CPA",
            targetKind: null,
        },
    ],
    APP_CAMPAIGN_FOR_PRE_REGISTRATION: [
        {
            value: "OPTIMIZE_PRE_REGISTRATION_CONVERSION_VOLUME",
            label: "Maximize pre-registrations",
            targetKind: null,
        },
    ],
};

export const metaBidStrategies: { value: MetaBidStrategy; label: string }[] = [
    { value: "LOWEST_COST_WITHOUT_CAP", label: "Highest volume (no bid cap)" },
    { value: "LOWEST_COST_WITH_BID_CAP", label: "Bid cap" },
    { value: "COST_CAP", label: "Cost per result goal (Cost Cap)" },
    { value: "LOWEST_COST_WITH_MIN_ROAS", label: "Minimum ROAS" },
];

export const metaBuyingTypes = [
    { value: "AUCTION", label: "Auction (standard buying)" },
    { value: "RESERVED", label: "Reservation (Reach & Frequency)" },
] as const;

export const metaObjectiveMap: Record<Objective, string> = {
    SALES: "OUTCOME_SALES",
    LEADS: "OUTCOME_LEADS",
    WEBSITE_TRAFFIC: "OUTCOME_TRAFFIC",
    AWARENESS: "OUTCOME_AWARENESS",
    ENGAGEMENT: "OUTCOME_ENGAGEMENT",
    APP_PROMOTION: "OUTCOME_APP_PROMOTION",
};

export const metaOptimizationOptions: Record<
    Objective,
    { value: string; label: string }[]
> = {
    SALES: [
        { value: "OFFSITE_CONVERSIONS", label: "Offsite Conversions" },
        { value: "VALUE", label: "Conversion Value (for value bidding)" },
    ],
    LEADS: [
        { value: "LEAD_GENERATION", label: "Lead Generation" },
        { value: "OFFSITE_CONVERSIONS", label: "Offsite Conversions" },
    ],
    WEBSITE_TRAFFIC: [
        { value: "LINK_CLICKS", label: "Link Clicks" },
        { value: "LANDING_PAGE_VIEWS", label: "Landing Page Views" },
    ],
    AWARENESS: [
        { value: "REACH", label: "Reach" },
        { value: "IMPRESSIONS", label: "Impressions" },
        { value: "AD_RECALL_LIFT", label: "Ad Recall Lift" },
    ],
    ENGAGEMENT: [
        { value: "POST_ENGAGEMENT", label: "Post Engagement" },
        { value: "PAGE_LIKES", label: "Page Likes" },
        { value: "CONVERSATIONS", label: "Conversations" },
    ],
    APP_PROMOTION: [
        { value: "APP_INSTALLS", label: "App Installs" },
        { value: "OFFSITE_CONVERSIONS", label: "App Events / Conversions" },
    ],
};

export const metaBillingOptionsByGoal: Record<
    string,
    { value: string; label: string }[]
> = {
    LINK_CLICKS: [
        { value: "LINK_CLICKS", label: "Link clicks" },
        { value: "IMPRESSIONS", label: "Impressions" },
    ],
    LANDING_PAGE_VIEWS: [{ value: "IMPRESSIONS", label: "Impressions" }],
    APP_INSTALLS: [
        { value: "APP_INSTALLS", label: "App installs" },
        { value: "IMPRESSIONS", label: "Impressions" },
    ],
    POST_ENGAGEMENT: [
        { value: "POST_ENGAGEMENT", label: "Post engagement" },
        { value: "IMPRESSIONS", label: "Impressions" },
    ],
    PAGE_LIKES: [
        { value: "PAGE_LIKES", label: "Page likes" },
        { value: "IMPRESSIONS", label: "Impressions" },
    ],
    THRUPLAY: [
        { value: "THRUPLAY", label: "ThruPlay" },
        { value: "IMPRESSIONS", label: "Impressions" },
    ],
    DEFAULT: [{ value: "IMPRESSIONS", label: "Impressions" }],
};