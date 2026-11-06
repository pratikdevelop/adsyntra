import {
    buildBiddingConfig,
    type BiddingOptions,
} from "../utils/bidding.js";
export interface GoogleAdsCreationContext {
    customerId: string;
    accessToken: string;
    developerToken: string;
    apiVersion: string;
}
// Standard Shopping campaign configuration
export interface GoogleAdsShoppingSettings {
    merchantId: string;
    campaignPriority: 0 | 1 | 2;
    feedLabel?: string;
    enableLocal?: boolean;
}


// ==========================================
// SEARCH CAMPAIGN OPERATION INPUT
// ==========================================

export interface BuildGoogleAdsSearchCampaignOperationInput {
    campaignName: string;
    budgetResourceName: string;

    biddingStrategy: string;
    biddingOptions?: BiddingOptions;
}

export interface GoogleAdsMutateResponse {
    results?: Array<{
        resourceName?: string;
    }>;

    [key: string]: unknown;
}
// ==========================================
// GOOGLE ADS BUDGET CREATION
// ==========================================

export interface CreateGoogleAdsBudgetInput {
    name: string;
    amount: number;
    validateOnly?: boolean;
    confirm?: boolean;
}

export interface GoogleAdsCreatedResource {
    resourceName: string | null;
    resourceId: string | null;
    validateOnly: boolean;
    googleResponse: GoogleAdsMutateResponse;
}

export interface GoogleAdsCampaignConfig {
    apiChannelType: string;
    biddingStrategies: readonly string[];
}




// ==========================================
// SEARCH RSA OPERATION INPUT
// ==========================================

export interface BuildGoogleAdsSearchRSAOperationInput {
    adGroupResourceName: string;

    headlines: string[];
    descriptions: string[];

    finalUrl: string;

    path1?: string;
    path2?: string;
}

// ==========================================
// AD GROUP CREATION INPUT
// ==========================================

export interface CreateGoogleAdsAdGroupInput {
    name: string;
    campaignResourceName: string;
    campaignType: GoogleAdsCampaignType;

    validateOnly?: boolean;
    confirm?: boolean;
}


// ==========================================
// GOOGLE ADS CAMPAIGN CONFIGURATION
// ==========================================

export type GoogleAdsCampaignType =
    | "SEARCH"
    | "DISPLAY"
    | "SHOPPING"
    | "DEMAND_GEN"
    | "PERFORMANCE_MAX";

// ==========================================
// SEARCH AD GROUP OPERATION INPUT
// ==========================================

export interface BuildGoogleAdsSearchAdGroupOperationInput {
    name: string;
    campaignResourceName: string;
}
// ==========================================
// CAMPAIGN CREATION INPUT
// ==========================================

export interface CreateGoogleAdsCampaignInput {
    campaignName: string;
    campaignType: string;
    budgetResourceName: string;

    biddingStrategy: string;
    biddingOptions?: BiddingOptions;

    validateOnly?: boolean;
    confirm?: boolean;
    shoppingSettings?: GoogleAdsShoppingSettings;
}

// ==========================================
// SEARCH KEYWORD OPERATION INPUT
// ==========================================

export interface BuildGoogleAdsSearchKeywordOperationsInput {
    adGroupResourceName: string;
    keywords: GoogleAdsKeywordInput[];
}
type DemandGenAdField =
    | "demandGenMultiAssetAd"
    | "demandGenVideoResponsiveAd"
    | "demandGenCarouselAd";

export interface CreateDemandGenAdInput {
    adGroupResourceName: string;
    adName?: string;
    finalUrl: string;
    adField: DemandGenAdField;
    adConfiguration: Record<string, unknown>;
    validateOnly: boolean;
}


// ==========================================
// PERFORMANCE MAX ASSET GROUP CONFIGURATION
// ==========================================

export type PerformanceMaxAssetFieldType =
    | "HEADLINE"
    | "LONG_HEADLINE"
    | "DESCRIPTION"
    | "MARKETING_IMAGE"
    | "SQUARE_MARKETING_IMAGE"
    | "BUSINESS_NAME"
    | "LOGO"
    | "YOUTUBE_VIDEO";

export interface PerformanceMaxAssetInput {
    assetResourceName: string;
    fieldType: PerformanceMaxAssetFieldType;
}

export interface CreateGoogleAdsAssetGroupInput {
    name: string;
    campaignResourceName: string;
    finalUrls: string[];

    assets: PerformanceMaxAssetInput[];

    validateOnly?: boolean;
    confirm?: boolean;
}

// ==========================================
// GOOGLE ADS KEYWORD CONFIGURATION
// ==========================================

export type GoogleAdsKeywordMatchType =
    | "BROAD"
    | "PHRASE"
    | "EXACT";

export interface GoogleAdsKeywordInput {
    text: string;
    matchType: GoogleAdsKeywordMatchType;
    status?: "ENABLED" | "PAUSED";
}

export interface CreateGoogleAdsKeywordCriteriaInput {
    adGroupResourceName: string;
    keywords: GoogleAdsKeywordInput[];
    validateOnly?: boolean;
    confirm?: boolean;
}

export interface CreateGoogleAdsCampaignNegativeKeywordsInput {
    campaignResourceName: string;
    keywords: GoogleAdsKeywordInput[];
    validateOnly?: boolean;
    confirm?: boolean;
}

export interface GoogleAdsKeywordCreationResult {
    resourceNames: string[];
    resourceIds: string[];
    validateOnly: boolean;
    googleResponse: GoogleAdsMutateResponse;
}



// ==========================================
// RESPONSIVE SEARCH AD INPUT
// ==========================================

export interface CreateGoogleAdsResponsiveSearchAdInput {
    adGroupResourceName: string;

    headlines: unknown[];
    descriptions: unknown[];

    finalUrl: string;

    path1?: string;
    path2?: string;

    validateOnly?: boolean;
    confirm?: boolean;
}
// ==========================================
// GOOGLE ADS YOUTUBE VIDEO ASSET
// ==========================================

export interface CreateGoogleAdsYouTubeVideoAssetInput {
    videoId: string;
    videoTitle: string;
    name?: string;
    validateOnly?: boolean;
    confirm?: boolean;
}


// ==========================================
// CAMPAIGN LOCATION TARGETING INPUT
// ==========================================

export interface GoogleAdsLocationTargetInput {
    geoTargetConstantResourceName: string;
    negative?: boolean;
}

export interface CreateGoogleAdsCampaignLocationTargetsInput {
    campaignResourceName: string;
    locations: GoogleAdsLocationTargetInput[];
    validateOnly?: boolean;
    confirm?: boolean;
}


export type GoogleAdsMutateOperation =
    Record<string, unknown>;

export interface GoogleAdsBulkMutateResponse
    extends GoogleAdsMutateResponse {
    mutateOperationResponses?: Array<
        Record<string, unknown>
    >;

    partialFailureError?: unknown;
}

export interface GoogleAdsBuiltOperation {
    operation: GoogleAdsMutateOperation;
    resourceName: string;
}


// ==========================================
// RESPONSIVE DISPLAY AD INPUT
// ==========================================

export interface CreateGoogleAdsResponsiveDisplayAdInput {
    adGroupResourceName: string;

    finalUrls: string[];

    marketingImageAssetResourceNames: string[];
    squareMarketingImageAssetResourceNames: string[];

    headlines: string[];
    longHeadline: string;
    descriptions: string[];

    businessName: string;

    logoAssetResourceNames?: string[];
    squareLogoAssetResourceNames?: string[];

    validateOnly?: boolean;
    confirm?: boolean;
}

// ==========================================
// SEARCH CAMPAIGN FLOW INPUT
// ==========================================

export interface CreateGoogleAdsSearchCampaignFlowInput {
    budget: {
        name: string;
        amount: number;
    };

    campaign: {
        name: string;
        biddingStrategy: string;
        biddingOptions?: BiddingOptions;
    };

    adGroup: {
        name: string;
    };

    keywords: {
        positive: GoogleAdsKeywordInput[];
        negative?: GoogleAdsKeywordInput[];
    };

    locations?: GoogleAdsLocationTargetInput[];

    ad: {
        finalUrl: string;
        headlines: string[];
        descriptions: string[];
        path1?: string;
        path2?: string;
    };

    validateOnly?: boolean;
    confirm?: boolean;
}

// ==========================================
// SEARCH CAMPAIGN FLOW RESULT
// ==========================================

export interface GoogleAdsSearchCampaignFlowResult {
    validateOnly: boolean;
    operationCount: number;

    temporaryResourceNames: {
        budget: string;
        campaign: string;
        adGroup: string;
    };

    createdResources: null | {
        budget: string;
        campaign: string;
        adGroup: string;
        locationCriteria: string[];
        positiveKeywords: string[];
        negativeKeywords: string[];
        responsiveSearchAd: string;
    };

    googleResponse: GoogleAdsBulkMutateResponse;
}



// ==========================================
// DEMAND GEN MULTI ASSET AD
// ==========================================

export interface CreateGoogleAdsDemandGenMultiAssetAdInput {
    adGroupResourceName: string;
    finalUrl: string;
    businessName: string;

    headlines: string[];
    descriptions: string[];

    marketingImageAssetResourceNames?: string[];
    squareMarketingImageAssetResourceNames?: string[];
    portraitMarketingImageAssetResourceNames?: string[];
    tallPortraitMarketingImageAssetResourceNames?: string[];

    logoAssetResourceNames: string[];
    classicDisplayImageAssetResourceNames?: string[];

    callToActionText?: string;
    adName?: string;

    validateOnly?: boolean;
    confirm?: boolean;
}


// ==========================================
// DEMAND GEN CAROUSEL CARD ASSET
// ==========================================

export interface CreateGoogleAdsDemandGenCarouselCardInput {
    headline: string;

    marketingImageAssetResourceName?: string;
    squareMarketingImageAssetResourceName?: string;
    portraitMarketingImageAssetResourceName?: string;

    callToActionText?: string;

    validateOnly?: boolean;
    confirm?: boolean;
}


// ==========================================
// DEMAND GEN CAROUSEL AD
// ==========================================

export interface CreateGoogleAdsDemandGenCarouselAdInput {
    adGroupResourceName: string;
    finalUrl: string;

    businessName: string;
    logoAssetResourceName: string;

    headline: string;
    description: string;

    carouselCardAssetResourceNames: string[];

    callToActionText?: string;
    adName?: string;

    validateOnly?: boolean;
    confirm?: boolean;
}


// ==========================================
// GOOGLE ADS IMAGE ASSET CREATION
// ==========================================

export interface CreateGoogleAdsImageAssetInput {
    buffer: Buffer;
    originalName?: string;
    name?: string;
    validateOnly?: boolean;
    confirm?: boolean;
}

// ==========================================
// GOOGLE ADS TEXT ASSET CREATION
// ==========================================

export type GoogleAdsTextAssetType =
    | "HEADLINE"
    | "LONG_HEADLINE"
    | "DESCRIPTION"
    | "BUSINESS_NAME";

const GOOGLE_ADS_TEXT_LIMITS: Record<
    GoogleAdsTextAssetType,
    number
> = {
    HEADLINE: 30,
    LONG_HEADLINE: 90,
    DESCRIPTION: 90,
    BUSINESS_NAME: 25,
};

export interface CreateGoogleAdsTextAssetInput {
    text: string;
    fieldType: GoogleAdsTextAssetType;
    name?: string;
    validateOnly?: boolean;
    confirm?: boolean;
}

