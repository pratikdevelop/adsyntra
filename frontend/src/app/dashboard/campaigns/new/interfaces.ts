import type {
    ProviderName,
    Objective,
    CampaignLifecycleStatus,
    DemoOverallStatus,
    CreativeAspectRatio,
    AssetKind,
    DemoResourceStatus,
    DemoProviderStatus,
    DemoScenario,

    // Campaign capability types
    AdPlatform,
    CampaignCapabilityStatus,
    CreativeAssetCollectionMode,
    CreativeAssetRole,
    CreativeMediaType,
    CreativeTextField,
    CreativeAssetSelectionSource
} from "./type";

/* -------------------------------------------------------------------------- */
/* Campaign capability and creative requirement contracts                    */
/* -------------------------------------------------------------------------- */

/**
 * Defines the media requirements for one asset group.
 *
 * Multiple requirement objects can exist for one campaign format.
 * Example: Google Display can have separate landscape and square groups.
 */
export interface CreativeAssetRequirement {
    /** Unique key within the campaign capability. */
    id: string;

    role: CreativeAssetRole;
    mediaType: CreativeMediaType;

    /** Minimum number of assets required for validation. */
    minCount: number;

    /** Maximum number of assets accepted for this requirement. */
    maxCount: number;

    /** Recommended number shown as guidance in the UI. */
    recommendedCount?: number;

    /** Accepted aspect ratios for this asset group. */
    allowedAspectRatios?: CreativeAspectRatio[];

    /** Optional file format restrictions. */
    allowedMimeTypes?: string[];

    /** Optional dimension restrictions, in pixels. */
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;

    /** Optional maximum file size, in bytes. */
    maxFileSizeBytes?: number;

    /** Optional video duration restrictions, in seconds. */
    minDurationSeconds?: number;
    maxDurationSeconds?: number;

    /** True when selected assets must preserve their order. */
    ordered?: boolean;
}

/**
 * Defines text requirements for an ad format.
 *
 * Counts refer to the number of text variations.
 * Character limits apply individually to each variation.
 */
export interface CreativeTextRequirement {
    id: string;
    field: CreativeTextField;

    minCount: number;
    maxCount: number;
    recommendedCount?: number;

    minLength?: number;
    maxLength?: number;

    /** Optional supported values, useful for CTA validation. */
    allowedValues?: string[];
}

/**
 * Complete creative capability for one provider campaign type and ad format.
 */
export interface CampaignCreativeCapability {
    id: string;

    platform: AdPlatform;

    /** Provider-specific campaign type, e.g. SEARCH or PERFORMANCE_MAX. */
    campaignType: string;

    /** Provider-specific objective, where applicable. */
    providerObjective?: string;

    /** Creative format, e.g. RESPONSIVE_DISPLAY or CAROUSEL. */
    adFormat: string;

    status: CampaignCapabilityStatus;

    collectionMode: CreativeAssetCollectionMode;

    assetRequirements: CreativeAssetRequirement[];
    textRequirements: CreativeTextRequirement[];
    maxTotalAssets?: Partial<Record<CreativeMediaType, number>>;
    /**
     * Total number of selected media assets across all media types.
     * Useful for formats such as mixed image/video carousels.
     */
    minTotalAssetCount?: number;
    maxTotalAssetCount?: number;
    description?: string;
    notes?: string[];
}

/**
 * Connects an Asset Library item to a specific creative requirement.
 *
 * This allows several assets to be selected, classified and ordered.
 */
export interface CreativeAssetSelection {
    assetId: string;
    requirementId: string;
    role: CreativeAssetRole;

    source?: CreativeAssetSelectionSource;

    /** Required for ordered formats such as carousel cards. */
    position?: number;
}
export interface ManagedCampaignRecord {
    id: string;
    groupId?: string;
    name: string;
    provider: ProviderName;
    campaignType: string;
    googleCampaignType?: string;
    objective: Objective;
    budgetLabel: string;
    status: CampaignLifecycleStatus;
    creationStatus: DemoOverallStatus | "DRAFT";
    accountLabel: string;
    createdAt: string;
    updatedAt: string;
    source: "SAMPLE" | "LOCAL";
    jobId?: string;
}

/* -------------------------------------------------------------------------- */
/* AI Creative Studio contracts                                               */
/* -------------------------------------------------------------------------- */

export interface GeneratedMedia {
    type: "IMAGE" | "VIDEO";
    /** Temporary preview URL returned by the AI service. */
    url: string;
    mimeType: string;
    width: number;
    height: number;
    aspectRatio: CreativeAspectRatio;
    provider: string;
    fileSizeBytes?: number;
    durationSeconds?: number;
    thumbnailUrl?: string;
    /** True for development placeholders; never treat these as approved media. */
    isPlaceholder?: boolean;
}

export interface GoogleCreativePack {
    campaignType: string;
    subFormat?: string;
    formatLabel: string;
    headlines: string[];
    longHeadlines: string[];
    descriptions: string[];
    finalUrl: string;
    displayPath1?: string;
    displayPath2?: string;
    imageUrl?: string;
    imageAspectRatio?: CreativeAspectRatio;
    imageUrls?: string[];
    logoUrls?: string[];
    validationWarnings?: string[];
}

export interface MetaCreativeCard {
    id?: string;
    headline: string;
    description?: string;
    imageUrl?: string;
    videoUrl?: string;
    destinationUrl?: string;
}

export interface MetaCreativePack {
    format: "SINGLE_IMAGE" | "SINGLE_VIDEO" | "CAROUSEL";
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

export interface CreativeVariation {
    id: string;
    generationId?: string;
    name: string;
    kind: "IMAGE" | "VIDEO";
    prompt: string;
    headline: string;
    primaryText: string;
    callToAction: string;
    aspectRatio: CreativeAspectRatio;
    googleAspectRatio: CreativeAspectRatio;
    /** Primary media preview. Empty when generation is text-only. */
    url: string;
    /** Google-specific rendition when the requested ratio differs. */
    googleMediaUrl: string;
    styleLabel: string;
    previewLabel: string;
    generatedAt: string;
    media?: GeneratedMedia | null;
    googlePack?: GoogleCreativePack;
    metaPack?: MetaCreativePack;
    provider?: "groq" | "openai";
    imageProvider?: string;
    /** Set only after a permanent Asset Library upload succeeds. */
    savedAssetId?: string;
    status?: "GENERATED" | "APPROVED" | "SAVED" | "FAILED";
}

export interface CreativeGenerationError {
    variationIndex?: number;
    message: string;
    provider?: string;
    code?: string;
}

/** A campaign-specific image returned by the AI Creative API. */
export interface GeneratedCreativeAsset {
    id: string;
    generationId: string;
    capabilityId: string;
    requirementId: string;
    role: CreativeAssetRole;
    assetIndex: number;
    name: string;
    media: GeneratedMedia;
    prompt: string;
    generatedAt: string;
}

/** Failure details for an individual requested campaign asset. */
export interface CreativeAssetGenerationError {
    capabilityId: string;
    requirementId: string;
    assetIndex: number;
    message: string;
    provider?: string;
    code?: string;
}

export interface GenerateCreativeResponse {
    success: boolean;
    generationId: string;
    variations: CreativeVariation[];
    provider: "groq" | "openai";
    model: string;
    imageProvider: string;
    generatedAt: string;
    expiresAt: string | null;
    requestedCount: number;
    generatedCount: number;
    failedCount: number;
    partialSuccess: boolean;
    errors: CreativeGenerationError[];
    generatedAssets: GeneratedCreativeAsset[];
    requestedAssetCount: number;
    generatedAssetCount: number;
    failedAssetCount: number;
    assetErrors: CreativeAssetGenerationError[];
    message: string;
}

/* -------------------------------------------------------------------------- */
/* Asset Library contracts used by Campaign Builder                           */
/* -------------------------------------------------------------------------- */

export interface LibraryAsset {
    id: string;
    name: string;
    kind: AssetKind;
    /**
     * URL usable by the relevant consumer. For private AdSyntra uploads this
     * should not be treated as a public provider URL; use contentUrl for an
     * authenticated preview and assetId for backend/provider upload workflows.
     */
    url: string;
    addedAt: string;
    origin?: "MANUAL" | "AI_STUDIO" | "GOOGLE_ADS" | "META_ADS";
    prompt?: string;
    aspectRatio?: string;
    platformTargets?: ProviderName[];
    googlePack?: GoogleCreativePack;
    textContent?: string | null;
    contentUrl?: string | null;
    originalFileName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    width?: number | null;
    height?: number | null;
    createdAt?: string;
    updatedAt?: string;
    provider?: ProviderName | null;
    providerAccountId?: string | null;
    providerAssetId?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Campaign execution / connection contracts                                 */
/* -------------------------------------------------------------------------- */

export interface DemoResourceResult {
    key: string;
    label: string;
    status: DemoResourceStatus;
    resourceId: string | null;
    errorCode?: string;
    errorMessage?: string;
    endpoint?: string;
    attemptCount?: number;
    requestId?: string;
    responseSummary?: string;
}

export interface DemoProviderResult {
    provider: ProviderName;
    status: DemoProviderStatus;
    resources: DemoResourceResult[];
}

export interface DemoCreationJob {
    jobId: string;
    createdAt: string;
    scenario: DemoScenario;
    overallStatus: DemoOverallStatus;
    providers: DemoProviderResult[];
}

export interface ProviderConnection {
    connected: boolean;
    accounts: unknown[];
    selectedAccountId: string | null;
}

export interface ConnectionResponse {
    providers?: {
        googleAds?: Partial<ProviderConnection>;
        metaAds?: Partial<ProviderConnection>;
    };
    message?: string;
}


/* -------------------------------------------------------------------------- */
/* AI Creative Studio — Campaign context                                      */
/* -------------------------------------------------------------------------- */

/**
 * Identifies one campaign format for which creatives are required.
 */
export interface CreativeStudioTarget {
    capabilityId: string;
    platform: AdPlatform;
    campaignType: string;
    providerObjective?: string;
    adFormat: string;
}

/**
 * Campaign context passed from Campaign Builder to AI Creative Studio.
 *
 * Multiple targets allow the Studio to prepare creatives for Google Ads
 * and Meta Ads independently within the same campaign brief.
 */
export interface CreativeStudioCampaignContext {
    campaignName?: string;
    businessName?: string;
    websiteUrl?: string;
    objective?: Objective;

    targets: CreativeStudioTarget[];
}

/**
 * Requested generation count for a particular capability requirement.
 */
export interface CreativeStudioAssetRequest {
    capabilityId: string;
    requirementId: string;
    requestedCount: number;
    aspectRatio?: CreativeAspectRatio;
}

/**
 * Complete context used when requesting campaign-aware creative generation.
 */
export interface CampaignAwareCreativeRequest {
    context: CreativeStudioCampaignContext;
    assetRequests: CreativeStudioAssetRequest[];
}

/** Flat request body accepted by POST /api/ai-creative/generate. */
export interface GenerateCreativeRequest {
    prompt: string;
    creativeKind?: "IMAGE" | "VIDEO";
    creativeStyle?: string;
    aspectRatio?: CreativeAspectRatio;
    googleAspectRatio?: CreativeAspectRatio;
    campaignType?: string;
    demandGenFormat?: string;
    platforms?: AdPlatform[];
    numberOfVariations?: 1 | 2 | 3;
    textOnly?: boolean;
    brandContext?: {
        businessName?: string;
        websiteUrl?: string;
        productHint?: string;
    };
    creativeTargets: CreativeStudioTarget[];
    assetRequests: Array<{
        capabilityId: string;
        requirementId: string;
        requestedCount: number;
        mediaType: "IMAGE";
        aspectRatio: CreativeAspectRatio;
    }>;
}
