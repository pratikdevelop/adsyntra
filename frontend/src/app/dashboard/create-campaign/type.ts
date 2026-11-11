
export type ProviderName = "googleAds" | "metaAds" | "both";
export type CampaignExecutionMode = "VALIDATE_ONLY" | "LIVE";

export type CampaignExecutionPayload = {
    name: string;
    businessName: string;
    websiteUrl: string | null;
    description: string | null;
    objective: Objective;
    platforms: ProviderName[];
    providers: Partial<
        Record<
            ProviderName,
            {
                accountId: string;
                providerObjective: string;
                providerCampaignType: string;
                configuration: Record<string, unknown>;
            }
        >
    >;
    execution: {
        validateOnly: boolean;
        confirm: boolean;
    };
};
export type PlatformMode = "googleAds" | "metaAds" | "both";
export type Objective =
    | "SALES"
    | "LEADS"
    | "WEBSITE_TRAFFIC"
    | "AWARENESS"
    | "ENGAGEMENT"
    | "APP_PROMOTION";
export type MetaBudgetLevel = "CAMPAIGN" | "AD_SET";
export type GoogleBudgetMode = "DAILY" | "CAMPAIGN_TOTAL";
export type GoogleBiddingScope = "STANDARD" | "PORTFOLIO";
export type MetaBuyingType = "AUCTION" | "RESERVED";
export type MetaBidStrategy =
    | "LOWEST_COST_WITHOUT_CAP"
    | "LOWEST_COST_WITH_BID_CAP"
    | "COST_CAP"
    | "LOWEST_COST_WITH_MIN_ROAS";
export type GoogleMarketingObjective =
    | "AWARENESS"
    | "CONSIDERATION"
    | "LEAD"
    | "SALES"
    | "WEBSITE_TRAFFIC"
    | "APP_PROMOTION"
    | "LOCAL_STORES_VISITS";
export type GoogleBiddingMode = "AUTOMATED" | "MANUAL_CPC" | "MANUAL_CPM";
export type GoogleEuPoliticalStatus =
    | "CONTAINS_EU_POLITICAL_ADVERTISING"
    | "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING"
    | "";
export type GooglePerformanceGoal =
    | "CONVERSIONS"
    | "CONVERSION_VALUE"
    | "CLICKS"
    | "IMPRESSION_SHARE"
    | "IMPRESSIONS";
export type GoogleAppSubtype =
    | "APP_CAMPAIGN"
    | "APP_CAMPAIGN_FOR_ENGAGEMENT"
    | "APP_CAMPAIGN_FOR_PRE_REGISTRATION";
export type GoogleAppGoalType =
    | "OPTIMIZE_INSTALLS_TARGET_INSTALL_COST"
    | "OPTIMIZE_INSTALLS_WITHOUT_TARGET_INSTALL_COST"
    | "OPTIMIZE_IN_APP_CONVERSIONS_TARGET_CONVERSION_COST"
    | "OPTIMIZE_IN_APP_CONVERSIONS_TARGET_INSTALL_COST"
    | "OPTIMIZE_IN_APP_CONVERSIONS_WITHOUT_TARGET_CPA"
    | "OPTIMIZE_PRE_REGISTRATION_CONVERSION_VOLUME"
    | "OPTIMIZE_RETURN_ON_ADVERTISING_SPEND"
    | "OPTIMIZE_TOTAL_VALUE_WITHOUT_TARGET_ROAS";
export type GoogleAppTargetKind = "CPA" | "ROAS" | null;
export type GoogleHotelBidStrategy = "MANUAL_CPC" | "PERCENT_CPC";



export type DemoScenario =
    | "ALL_SUCCESS"
    | "PROVIDER_FAILURE"
    | "ALL_FAILURE"
    | "RESOURCE_FAILURE"
    | "TIMEOUT";
export type DemoResourceStatus =
    | "SUCCESS"
    | "FAILED"
    | "TIMED_OUT"
    | "BLOCKED"
    | "NOT_STARTED";
export type DemoProviderStatus = "SUCCESS" | "FAILED" | "PARTIAL_SUCCESS";
export type DemoOverallStatus = "SUCCESS" | "FAILED" | "PARTIAL_SUCCESS";
export type WorkspaceView =
    | "builder"
    | "campaigns"
    | "assets"
    | "campaign"
    | "ads"
    | "creative";
export type CampaignLifecycleStatus =
    | "ACTIVE"
    | "PAUSED"
    | "DRAFT"
    | "FAILED"
    | "ARCHIVED";
export type CampaignPlatformFilter = "ALL" | "GOOGLE" | "META" | "BOTH";


export type AssetKind = "IMAGE" | "VIDEO" | "LOGO" | "TEXT";
export type ManagedStatus = "PAUSED" | "ACTIVE";

export type CreativeAspectRatio = "1:1" | "4:5" | "9:16" | "16:9" | "1.91:1";
