/**
 * Shared contracts for AdSyntra AI Creative Studio.
 *
 * Compatibility note:
 * Existing request/response fields are retained. New capability-aware text
 * and brand fields are additive and optional until the service is migrated.
 */

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const CREATIVE_KINDS = ["IMAGE", "VIDEO"] as const;

export const CREATIVE_ASPECT_RATIOS = [
    "1:1",
    "4:5",
    "9:16",
    "16:9",
    "1.91:1",
    "4:1",
] as const;

export type GoogleDisplayImageRole = "LANDSCAPE" | "SQUARE";

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

/** Backward-compatible alias; keep one canonical CTA list. */
export const CREATIVE_CALL_TO_ACTIONS = ALLOWED_CALL_TO_ACTIONS;

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

export type AllowedCallToAction = (typeof ALLOWED_CALL_TO_ACTIONS)[number];

/* -------------------------------------------------------------------------- */
/* Brand context                                                              */
/* -------------------------------------------------------------------------- */

/** Brand information supplied as context for generation. */
export interface CreativeBrandContext {
    businessName?: string;
    websiteUrl?: string;
    productHint?: string;
}

/**
 * Explicit brand identity carried through a generation result.
 *
 * This records user-supplied information; it does not claim that the name or
 * website has been independently verified by the backend.
 */
export interface CreativeBrandIdentity {
    businessName: string;
    source: "USER_INPUT";
    websiteUrl?: string;
}

/* -------------------------------------------------------------------------- */
/* Generated media                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Temporary generated-media reference for previews and generation results.
 * This is not a replacement for a permanently saved Asset Library record.
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

    /** True only when the URL represents a mock/demo placeholder. */
    isPlaceholder?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Google Ads creative pack                                                   */
/* -------------------------------------------------------------------------- */

export interface GoogleCreativePack {
    campaignType: GoogleCampaignType;
    subFormat?: GoogleDemandGenFormat;
    formatLabel: string;

    /** Responsive Search Ads: 3–15 headlines, maximum 30 characters each. */
    headlines: string[];

    /** Long headlines for supported visual campaign formats. */
    longHeadlines: string[];

    /** Responsive Search Ads: 2–4 descriptions, maximum 90 characters each. */
    descriptions: string[];

    finalUrl: string;
    displayPath1?: string;
    displayPath2?: string;

    /** Backward-compatible primary image fields. */
    imageUrl?: string;
    imageAspectRatio?: CreativeAspectRatio;

    /** Existing generic collections retained for compatibility. */
    imageUrls?: string[];
    logoUrls?: string[];

    /** More explicit logo collections for formats with distinct logo slots. */
    squareLogoUrls?: string[];
    landscapeLogoUrls?: string[];

    /** Supplied brand name, not AI-invented business identity. */
    businessName?: string;

    validationWarnings?: string[];
}

/* -------------------------------------------------------------------------- */
/* Meta Ads creative pack                                                     */
/* -------------------------------------------------------------------------- */

export type MetaCreativeFormat =
    | "SINGLE_IMAGE"
    | "SINGLE_VIDEO"
    | "CAROUSEL";

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

    /** Temporary preview URL; empty string is permitted for text-only output. */
    url: string;

    /** Backward-compatible Google media reference. */
    googleMediaUrl: string;

    styleLabel: string;
    previewLabel: string;
    generatedAt: string;
    media?: GeneratedMedia | null;
    googlePack?: GoogleCreativePack;
    metaPack?: MetaCreativePack;
    provider: AiTextProvider;
    imageProvider?: string;
    savedAssetId?: string;
    status?: "GENERATED" | "APPROVED" | "SAVED" | "FAILED";

    /** Explicit brand identity carried with this variation when available. */
    brandIdentity?: CreativeBrandIdentity;
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
/* Generation failures                                                        */
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
 * The backend must validate capabilityId against its own supported registry.
 * campaignType and adFormat remain strings for forward compatibility; the
 * registry, not the incoming request, is authoritative for provider rules.
 */
export interface CreativeGenerationTarget {
    capabilityId: string;
    platform: CreativePlatform;
    campaignType: string;
    providerObjective?: string;
    adFormat: string;
}

/**
 * Asset roles used by capability requirements and generated asset results.
 * LOGO remains as a legacy/general role; new requirements should use the
 * explicit square/landscape roles when the destination format distinguishes them.
 */
export type CreativeAssetRole =
    | "PRIMARY_IMAGE"
    | "LANDSCAPE_IMAGE"
    | "SQUARE_IMAGE"
    | "PORTRAIT_IMAGE"
    | "CAROUSEL_CARD_IMAGE"
    | "LOGO"
    | "SQUARE_LOGO"
    | "LANDSCAPE_LOGO"
    | "VIDEO"
    | "VIDEO_THUMBNAIL"
    | "PRODUCT_IMAGE";

/**
 * An individual asset-generation instruction.
 * requestedCount is the number of assets for this requirement, not the number
 * of creative variations. The backend resolves role/platform from its registry.
 */
export interface CreativeAssetGenerationRequest {
    capabilityId: string;
    requirementId: string;
    requestedCount: number;
    /** Current AI image-generation workflow supports IMAGE only. */
    mediaType: "IMAGE";
    aspectRatio: CreativeAspectRatio;
}

/** One successfully generated asset. */
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

/** Failure for an individual asset-generation request. */
export interface CreativeAssetGenerationError {
    capabilityId: string;
    requirementId: string;
    assetIndex: number;
    message: string;
    provider?: string;
    code?: string;
}

/* -------------------------------------------------------------------------- */
/* Capability-specific text contracts                                        */
/* -------------------------------------------------------------------------- */

/**
 * Semantic text slots understood by the capability registry.
 * Provider-specific character/count constraints belong in registry data,
 * rather than being guessed by a generic text-generation prompt.
 */
export type CreativeTextField =
    | "HEADLINE"
    | "LONG_HEADLINE"
    | "DESCRIPTION"
    | "PRIMARY_TEXT"
    | "CALL_TO_ACTION"
    | "DISPLAY_PATH";

/**
 * Backend capability-registry definition for one text requirement.
 * This is an internal contract; do not accept client values as authoritative
 * campaign validation limits.
 */
export interface CreativeTextRequirement {
    requirementId: string;
    field: CreativeTextField;
    required: boolean;
    minCount?: number;
    maxCount?: number;
    maxLength?: number;
}

/** One generated text value associated with its capability requirement. */
export interface GeneratedCapabilityText {
    capabilityId: string;
    requirementId: string;
    field: CreativeTextField;
    /** Starts at 1 within its requirement group. */
    textIndex: number;
    text: string;
}

/**
 * Text generated for one selected campaign capability.
 * The existing GeneratedCopy contract remains available during migration.
 */
export interface GeneratedCapabilityCopy {
    capabilityId: string;
    platform: CreativePlatform;
    campaignType: string;
    adFormat: string;
    texts: GeneratedCapabilityText[];
}

/* -------------------------------------------------------------------------- */
/* AI Creative service contracts                                              */
/* -------------------------------------------------------------------------- */

/** Legacy generic copy contract retained for existing service callers. */
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

/** Complete result returned by the AI Creative generation service. */
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

    /** Campaign-aware generated media assets. */
    generatedAssets: GeneratedCreativeAsset[];
    requestedAssetCount: number;
    generatedAssetCount: number;
    failedAssetCount: number;
    assetErrors: CreativeAssetGenerationError[];

    /** Additive capability-specific text output; optional during migration. */
    generatedCapabilityCopies?: GeneratedCapabilityCopy[];

    /** User-supplied brand identity, when provided. */
    brandIdentity?: CreativeBrandIdentity;
}

export interface GenerateCreativeResponse {
    success: boolean;
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

    /** Campaign-aware generated media assets. */
    generatedAssets: GeneratedCreativeAsset[];
    requestedAssetCount: number;
    generatedAssetCount: number;
    failedAssetCount: number;
    assetErrors: CreativeAssetGenerationError[];

    /** Additive capability-specific text output; optional during migration. */
    generatedCapabilityCopies?: GeneratedCapabilityCopy[];

    /** User-supplied brand identity, when provided. */
    brandIdentity?: CreativeBrandIdentity;

    message: string;
}
