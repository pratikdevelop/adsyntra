
// ==========================================
// GOOGLE ADS CAMPAIGN CONFIGURATION
// ==========================================

export type GoogleAdsCampaignType =
    | "SEARCH"
    | "DISPLAY"
    | "SHOPPING"
    | "DEMAND_GEN"
    | "PERFORMANCE_MAX";
export type DemandGenAdField =
    | "demandGenMultiAssetAd"
    | "demandGenVideoResponsiveAd"
    | "demandGenCarouselAd";


// ==========================================
// PERFORMANCE MAX ASSET GROUP CONFIGURATION
// ==========================================

export type PerformanceMaxAssetFieldType =
  | "HEADLINE"
  | "LONG_HEADLINE"
  | "DESCRIPTION"
  | "MARKETING_IMAGE"
  | "SQUARE_MARKETING_IMAGE"
  | "PORTRAIT_MARKETING_IMAGE"
  | "BUSINESS_NAME"
  | "LOGO"
  | "LANDSCAPE_LOGO"
  | "YOUTUBE_VIDEO"
  | "CALL_TO_ACTION_SELECTION";
// ==========================================
// GOOGLE ADS KEYWORD CONFIGURATION
// ==========================================

export type GoogleAdsKeywordMatchType =
    | "BROAD"
    | "PHRASE"
    | "EXACT";
// ==========================================
// SEARCH RSA OPERATION INPUT
// ==========================================


export type GoogleAdsMutateOperation =
    Record<string, unknown>;

// ==========================================
// GOOGLE ADS TEXT ASSET CREATION
// ==========================================

export type GoogleAdsTextAssetType =
    | "HEADLINE"
    | "LONG_HEADLINE"
    | "DESCRIPTION"
    | "BUSINESS_NAME";