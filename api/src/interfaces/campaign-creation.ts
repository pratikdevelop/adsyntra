import { type BiddingOptions } from "../utils/bidding.js";
import type { GoogleAdsCampaignType, DemandGenAdField, PerformanceMaxAssetFieldType, GoogleAdsKeywordMatchType, GoogleAdsMutateOperation, GoogleAdsTextAssetType } from "../types/campaign-creation.types.js";

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

export interface CreateDemandGenAdInput {
    adGroupResourceName: string;
    adName?: string;
    finalUrl: string;
    adField: DemandGenAdField;
    adConfiguration: Record<string, unknown>;
    validateOnly: boolean;
}



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
// PERFORMANCE MAX CAMPAIGN FLOW CONTRACTS
// ==========================================

export type GoogleAdsPerformanceMaxBrandGuidelineFont =
    | "Open Sans"
    | "Roboto"
    | "Montserrat"
    | "Poppins"
    | "Lato"
    | "Oswald"
    | "Playfair Display"
    | "Roboto Slab";

/**
 * Brand assets are uploaded to the selected Google Ads customer before the
 * PMax campaign mutation. Depending on brandGuidelinesEnabled, the service
 * links these resources to CampaignAsset or AssetGroupAsset resources.
 */
export interface GoogleAdsPerformanceMaxBrandingInput {
    businessName: string;
    logoAssetResourceNames: string[];
    landscapeLogoAssetResourceNames?: string[];
    mainColor?: string;
    accentColor?: string;
    predefinedFontFamily?: GoogleAdsPerformanceMaxBrandGuidelineFont;
}

export interface GoogleAdsPerformanceMaxAssetAutomationInput {
    /** Controls FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION. */
    finalUrlExpansionEnabled?: boolean;
    /** Controls TEXT_ASSET_AUTOMATION. Must remain enabled when URL expansion is enabled. */
    textAssetCustomizationEnabled?: boolean;
    generateEnhancedYoutubeVideos?: boolean;
    generateImageEnhancement?: boolean;
    /** Automated video crawl requires approved sources and an explicit rights confirmation. */
    automatedVideoCrawlEnabled?: boolean;
    automatedVideoCrawlSources?: Array<{
        url: string;
        sourcePlatform: "LANDING_PAGE" | "SOCIAL" | "YOUTUBE";
    }>;
    automatedVideoCrawlRightsConfirmed?: boolean;
}

export interface GoogleAdsPerformanceMaxAudienceSignalInput {
    /** Must belong to the selected Google Ads customer. */
    audienceResourceName: string;
}

export interface GoogleAdsPerformanceMaxAssetGroupInput {
    name: string;
    finalUrls: string[];
    headlines: string[];
    longHeadlines: string[];
    descriptions: string[];
    /**
     * Already-uploaded Google Ads media assets for this group. Business name
     * and logos are supplied through `branding` and linked at the correct
     * resource level according to the campaign's brand-guideline mode.
     */
    mediaAssets: PerformanceMaxAssetInput[];
    /** Optional explicit CallToActionAsset. Omit to let Google choose automatically. */
    callToAction?:
        | "APPLY_NOW"
        | "BOOK_NOW"
        | "CONTACT_US"
        | "DOWNLOAD"
        | "GET_QUOTE"
        | "LEARN_MORE"
        | "SHOP_NOW"
        | "SIGN_UP"
        | "SUBSCRIBE";
    audienceSignals?: GoogleAdsPerformanceMaxAudienceSignalInput[];
    searchThemes?: string[];
}

export interface CreateGoogleAdsPerformanceMaxCampaignFlowInput {
    budget: {
        name: string;
        amount: number;
        /** DAILY uses amountMicros; CUSTOM_PERIOD uses totalAmountMicros. */
        period?: "DAILY" | "CUSTOM_PERIOD";
    };

    campaign: {
        name: string;
        biddingStrategy: "MAXIMIZE_CONVERSIONS" | "MAXIMIZE_CONVERSION_VALUE";
        biddingOptions?: BiddingOptions;
        /** Calendar date in YYYY-MM-DD format (customer account timezone). */
        startDate?: string;
        /** Calendar date in YYYY-MM-DD format (customer account timezone). */
        endDate?: string;
        containsEuPoliticalAdvertising?: string;
        /** Defaults to true for new standard PMax campaigns. */
        brandGuidelinesEnabled?: boolean;
        branding: GoogleAdsPerformanceMaxBrandingInput;
        assetAutomation?: GoogleAdsPerformanceMaxAssetAutomationInput;
    };

    assetGroups: GoogleAdsPerformanceMaxAssetGroupInput[];
    locations?: GoogleAdsLocationTargetInput[];
    proximities?: GoogleAdsProximityTargetInput[];
    languages?: Array<{
        languageConstantResourceName: string;
    }>;
    negativeKeywords?: GoogleAdsKeywordInput[];
    /** Negative WEBPAGE criteria used to exclude exact URLs or URL substrings. */
    urlExclusions?: Array<{
        value: string;
        matchType: "EXACT" | "CONTAINS";
    }>;

    validateOnly?: boolean;
    confirm?: boolean;
}

export interface GoogleAdsPerformanceMaxAssetGroupCreatedResource {
    name: string;
    assetGroup: string;
    assetGroupAssets: string[];
    assetGroupSignals: string[];
}

export interface GoogleAdsPerformanceMaxCampaignCreatedResources {
    budget: string;
    campaign: string;
    /** Text and CTA Asset resources created inline with this campaign. */
    assets: string[];
    campaignAssets: string[];
    assetGroups: GoogleAdsPerformanceMaxAssetGroupCreatedResource[];
    locationCriteria: string[];
    proximityCriteria: string[];
    languageCriteria: string[];
    negativeKeywords: string[];
    urlExclusions: string[];
}

export interface GoogleAdsPerformanceMaxCampaignFlowResult {
    validateOnly: boolean;
    operationCount: number;
    validationWarnings: string[];
    temporaryResourceNames: {
        budget: string;
        campaign: string;
        assetGroups: string[];
    };
    createdResources: GoogleAdsPerformanceMaxCampaignCreatedResources | null;
    /** Primary response containing the budget/campaign/campaign-asset mutation. */
    googleResponse: GoogleAdsBulkMutateResponse;
    /** Additional responses for asset groups, signals and campaign criteria. */
    relatedGoogleResponses: GoogleAdsBulkMutateResponse[];
}



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

/** Address-based Google Ads radius targeting. Proximity criteria are inclusion-only. */
export interface GoogleAdsProximityTargetInput {
    address: {
        streetAddress?: string;
        streetAddress2?: string;
        cityName: string;
        provinceName?: string;
        provinceCode?: string;
        postalCode?: string;
        countryCode: string;
    };
    radius: number;
    radiusUnits: "KILOMETERS" | "MILES";
}

export interface CreateGoogleAdsCampaignLocationTargetsInput {
    campaignResourceName: string;
    locations: GoogleAdsLocationTargetInput[];
    validateOnly?: boolean;
    confirm?: boolean;
}


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
    proximities?: GoogleAdsProximityTargetInput[];

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
export interface CreateGoogleAdsDisplayCampaignFlowInput {
    budget: {
        name: string;
        amount: number;
    };

    campaign: {
        name: string;
        biddingStrategy: string;
        biddingOptions?: BiddingOptions;
        /** Calendar date in YYYY-MM-DD format (customer account timezone). */
        startDate?: string;
        /** Calendar date in YYYY-MM-DD format (customer account timezone). */
        endDate?: string;
        containsEuPoliticalAdvertising?: string;
    };

    adGroup: {
        name: string;
        defaultCpcBidAmount?: number;
        defaultCpmBidAmount?: number;
        audienceCriteria?: Array<{
            type: "USER_LIST";
            userListResourceName: string;
        }>;
    };

    locations?: GoogleAdsLocationTargetInput[];
    proximities?: GoogleAdsProximityTargetInput[];

    languages?: Array<{
        languageConstantResourceName: string;
    }>;

    adCreativeDraft: {
        format: "RESPONSIVE_DISPLAY_AD";
        finalUrl: string;
        headlines: string[];
        longHeadline: string;
        descriptions: string[];
        businessName: string;

        imageAssets: {
            landscapeImageUrl: string;
            squareImageUrl: string;

            // These fields are populated only after real Google Ads uploads.
            marketingImageAssetResourceNames?: string[];
            squareMarketingImageAssetResourceNames?: string[];
        };
    };

    validateOnly?: boolean;
    confirm?: boolean;
}
export interface GoogleAdsDisplayCampaignFlowResult {
    validateOnly: boolean;
    operationCount: number;

    assetUploadRequired: boolean;

    validationWarnings: string[];

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
        proximityCriteria: string[];
        languageCriteria: string[];
        audienceCriteria: string[];
        responsiveDisplayAd: string | null;
    };

    googleResponse: GoogleAdsBulkMutateResponse;
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
        proximityCriteria: string[];
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


export interface CreateGoogleAdsTextAssetInput {
    text: string;
    fieldType: GoogleAdsTextAssetType;
    name?: string;
    validateOnly?: boolean;
    confirm?: boolean;
}



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


