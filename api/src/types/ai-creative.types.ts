export const CREATIVE_KINDS = ["IMAGE", "VIDEO"] as const;

export const CREATIVE_ASPECT_RATIOS = [
    "1:1",
    "4:5",
    "9:16",
    "16:9",
    "1.91:1",
    "4:1",
] as const;

export type GoogleDisplayImageRole =
    | "LANDSCAPE"
    | "SQUARE";

export interface GoogleDisplayImageVariant {
    role: GoogleDisplayImageRole;
    media: GeneratedMedia;
}
export const CREATIVE_PLATFORMS = ["googleAds", "metaAds"] as const;
export const GROQ_BASE_URL = (
    process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1"
).replace(/\/+$/, "");

export const GROQ_TEXT_MODEL =
    process.env.GROQ_TEXT_MODEL || "openai/gpt-oss-120b";

export const IMAGE_PROVIDER = (
    process.env.IMAGE_PROVIDER || "pollinations"
).toLowerCase();

export const POLLINATIONS_BASE_URL = (
    process.env.POLLINATIONS_BASE_URL || "https://gen.pollinations.ai"
).replace(/\/+$/, "");

export const POLLINATIONS_MODEL =
    process.env.POLLINATIONS_MODEL ||
    "black-forest-labs/flux.1-schnell";

export const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY;

export const POLLINATIONS_NOLOGO =
    (process.env.POLLINATIONS_NOLOGO ?? "true").toLowerCase() === "true";

export const IMAGE_REQUEST_TIMEOUT = 120_000;
export const GROQ_REQUEST_TIMEOUT = 45_000;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const IMAGE_REQUEST_DELAY = 1500;

export const ALLOWED_CALL_TO_ACTIONS = [
    "SHOP_NOW",
    "LEARN_MORE",
    "SIGN_UP",
    "CONTACT_US",
    "DOWNLOAD",
] as const;

export const GOOGLE_CAMPAIGN_TYPES = [
    "SEARCH",
    "PERFORMANCE_MAX",
    "DISPLAY",
    "DEMAND_GEN",
    "APP",
    "SHOPPING",
    "HOTEL",
] as const;

export const GOOGLE_DEMAND_GEN_FORMATS = [
    "MULTI_ASSET",
    "VIDEO_RESPONSIVE",
    "CAROUSEL",
    "PRODUCT_FEED",
] as const;

export const CREATIVE_CALL_TO_ACTIONS = [
    "SHOP_NOW",
    "LEARN_MORE",
    "SIGN_UP",
    "CONTACT_US",
    "DOWNLOAD",
] as const;

/* -------------------------------------------------------------------------- */
/* Base types                                                                 */
/* -------------------------------------------------------------------------- */

export type CreativeKind = (typeof CREATIVE_KINDS)[number];

export type CreativeAspectRatio = (typeof CREATIVE_ASPECT_RATIOS)[number];

export type CreativePlatform = (typeof CREATIVE_PLATFORMS)[number];

/**
 * Backward-compatible alias.
 * These values identify advertising platforms, not AI providers.
 */
export type AiProvider = CreativePlatform;

export type AiTextProvider = "groq" | "openai";

export type ImageProvider = "pollinations" | "none" | "other";

export type GoogleCampaignType = (typeof GOOGLE_CAMPAIGN_TYPES)[number];

export type GoogleDemandGenFormat = (typeof GOOGLE_DEMAND_GEN_FORMATS)[number];

export type CreativeCallToAction = (typeof CREATIVE_CALL_TO_ACTIONS)[number];

export type AllowedCallToAction =
    (typeof ALLOWED_CALL_TO_ACTIONS)[number];

/* -------------------------------------------------------------------------- */
/* Brand context                                                              */
/* -------------------------------------------------------------------------- */

export interface CreativeBrandContext {
    businessName?: string;
    websiteUrl?: string;
    productHint?: string;
}

/* -------------------------------------------------------------------------- */
/* Generated media                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Temporary generated-media reference.
 *
 * This is for previews and generation results.
 * It is not a replacement for a permanently saved Asset Library record.
 */
export interface GeneratedMedia {
    type: "IMAGE" | "VIDEO";

    url: string;

    mimeType: string;

    width: number;

    height: number;

    aspectRatio: CreativeAspectRatio;

    provider: string;

    fileSizeBytes?: number;

    durationSeconds?: number;

    thumbnailUrl?: string;

    /**
     * True only when the URL represents a mock/demo placeholder.
     * Real generated media must use false.
     */
    isPlaceholder?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Google Ads creative pack                                                   */
/* -------------------------------------------------------------------------- */

export interface GoogleCreativePack {
    campaignType: GoogleCampaignType;

    subFormat?: GoogleDemandGenFormat;

    formatLabel: string;

    /**
     * Responsive Search Ads:
     * 3–15 headlines, maximum 30 characters each.
     */
    headlines: string[];

    /**
     * Long headlines for supported visual campaign formats.
     */
    longHeadlines: string[];

    /**
     * Responsive Search Ads:
     * 2–4 descriptions, maximum 90 characters each.
     */
    descriptions: string[];

    finalUrl: string;

    displayPath1?: string;

    displayPath2?: string;

    imageUrl?: string;

    imageAspectRatio?: CreativeAspectRatio;

    /**
     * Future support for multiple media assets and logos.
     */
    imageUrls?: string[];

    logoUrls?: string[];

    validationWarnings?: string[];
}

/* -------------------------------------------------------------------------- */
/* Meta Ads creative pack                                                     */
/* -------------------------------------------------------------------------- */

export type MetaCreativeFormat = "SINGLE_IMAGE" | "SINGLE_VIDEO" | "CAROUSEL";

export interface MetaCreativeCard {
    id?: string;

    headline: string;

    description?: string;

    imageUrl?: string;

    videoUrl?: string;

    destinationUrl?: string;
}

export interface MetaCreativePack {
    format: MetaCreativeFormat;

    primaryTexts: string[];

    headlines: string[];

    descriptions: string[];

    callToAction: string;

    callToActionType?: string;

    destinationUrl?: string;

    mediaUrl?: string;

    thumbnailUrl?: string;

    carouselCards: MetaCreativeCard[];

    validationWarnings?: string[];
}

/* -------------------------------------------------------------------------- */
/* Generated variation                                                       */
/* -------------------------------------------------------------------------- */

export interface GeneratedVariation {
    id: string;

    generationId?: string;

    name: string;

    kind: CreativeKind;

    prompt: string;

    headline: string;

    primaryText: string;

    callToAction: string;

    aspectRatio: CreativeAspectRatio;

    googleAspectRatio: CreativeAspectRatio;

    /**
     * Temporary preview URL.
     *
     * Empty string is permitted for text-only generation.
     * Permanent storage must use the Asset Library upload API.
     */
    url: string;

    /**
     * Backward-compatible Google media reference.
     */
    googleMediaUrl: string;

    styleLabel: string;

    previewLabel: string;

    generatedAt: string;

    /**
     * Structured media information.
     */
    media?: GeneratedMedia | null;

    /**
     * Platform-specific creative packs.
     */
    googlePack?: GoogleCreativePack;

    metaPack?: MetaCreativePack;

    /**
     * AI text-generation provider.
     */
    provider: AiTextProvider;

    imageProvider?: string;

    /**
     * Set after a generated creative is permanently saved.
     */
    savedAssetId?: string;

    status?: "GENERATED" | "APPROVED" | "SAVED" | "FAILED";
}

/* -------------------------------------------------------------------------- */
/* Creative generation request                                                */
/* -------------------------------------------------------------------------- */

export interface GenerateCreativeBody {
    prompt: string;

    creativeKind?: CreativeKind;

    creativeStyle?: string;

    aspectRatio?: CreativeAspectRatio;

    googleAspectRatio?: CreativeAspectRatio;

    campaignType?: GoogleCampaignType;

    demandGenFormat?: GoogleDemandGenFormat;

    platforms?: CreativePlatform[];

    numberOfVariations?: 1 | 2 | 3;

    brandContext?: CreativeBrandContext;

    textOnly?: boolean;

    /** Campaign formats for which AI creatives are requested. */
    creativeTargets?: CreativeGenerationTarget[];

    /** Individual image-generation requirements. */
    assetRequests?: CreativeAssetGenerationRequest[];
}

/* -------------------------------------------------------------------------- */
/* Generation failure                                                         */
/* -------------------------------------------------------------------------- */

export interface CreativeGenerationError {
    variationIndex?: number;

    message: string;

    provider?: string;

    code?: string;
}


/* -------------------------------------------------------------------------- */
/* Campaign-aware creative generation                                        */
/* -------------------------------------------------------------------------- */

/**
 * Identifies the campaign format for which creatives are generated.
 * The backend will verify capabilityId against its own supported registry.
 */
export interface CreativeGenerationTarget {
    capabilityId: string;

    platform: CreativePlatform;

    campaignType: string;

    providerObjective?: string;

    adFormat: string;
}

/**
 * Identifies the type of creative asset being generated.
 */
export type CreativeAssetRole =
    | "PRIMARY_IMAGE"
    | "LANDSCAPE_IMAGE"
    | "SQUARE_IMAGE"
    | "PORTRAIT_IMAGE"
    | "CAROUSEL_CARD_IMAGE"
    | "LOGO"
    | "VIDEO"
    | "VIDEO_THUMBNAIL"
    | "PRODUCT_IMAGE";

/**
 * An individual asset-generation instruction.
 *
 * requestedCount means the number of images to generate for this
 * particular campaign requirement, not the number of creative variations.
 */
export interface CreativeAssetGenerationRequest {
    capabilityId: string;

    requirementId: string;

    requestedCount: number;

    /** Current AI image-generation workflow supports IMAGE only. */
    mediaType: "IMAGE";

    aspectRatio: CreativeAspectRatio;
}

/**
 * One successfully generated asset.
 */
export interface GeneratedCreativeAsset {
    id: string;

    generationId: string;

    capabilityId: string;

    requirementId: string;

    role: CreativeAssetRole;

    /** Starts at 1 within its requirement group. */
    assetIndex: number;

    name: string;

    media: GeneratedMedia;

    prompt: string;

    generatedAt: string;
}

/**
 * Failure for an individual asset-generation request.
 */
export interface CreativeAssetGenerationError {
    capabilityId: string;

    requirementId: string;

    assetIndex: number;

    message: string;

    provider?: string;

    code?: string;
}

/* -------------------------------------------------------------------------- */
/* AI Creative service contracts                                              */
/* -------------------------------------------------------------------------- */

export interface GeneratedCopy {
    headline: string;
    primaryText: string;
    longHeadline: string;

    headlines: string[];
    longHeadlines: string[];
    descriptions: string[];
    primaryTexts: string[];

    callToAction: AllowedCallToAction;
}

export interface ImageDimensions {
    width: number;
    height: number;
}

/**
 * Complete result returned by the AI Creative generation service.
 *
 * Existing variation fields remain unchanged.
 * Generated assets are an additional collection.
 */
export interface CreativeGenerationResult {
    generationId: string;

    variations: GeneratedVariation[];

    provider: AiTextProvider;
    model: string;
    imageProvider: string;

    generatedAt: string;
    expiresAt: string | null;

    requestedCount: number;
    generatedCount: number;
    failedCount: number;

    partialSuccess: boolean;
    errors: CreativeGenerationError[];

    /** New campaign-aware asset generation results. */
    generatedAssets: GeneratedCreativeAsset[];

    requestedAssetCount: number;
    generatedAssetCount: number;
    failedAssetCount: number;

    assetErrors: CreativeAssetGenerationError[];
}



export interface GenerateCreativeResponse {
    // API status
    success: boolean;

    // Existing creative generation response
    generationId: string;
    variations: GeneratedVariation[];

    provider: AiTextProvider;
    model: string;
    imageProvider: string;

    generatedAt: string;
    expiresAt: string | null;

    requestedCount: number;
    generatedCount: number;
    failedCount: number;

    partialSuccess: boolean;
    errors: CreativeGenerationError[];

    // Campaign-aware generated assets
    generatedAssets: GeneratedCreativeAsset[];

    requestedAssetCount: number;
    generatedAssetCount: number;
    failedAssetCount: number;

    assetErrors: CreativeAssetGenerationError[];

    // Human-readable response message
    message: string;
}