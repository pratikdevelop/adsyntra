
import {
    Schema,
    model,
    type HydratedDocument,
} from "mongoose";

/* -------------------------------------------------------------------------- */
/* Constants and types                                                        */
/* -------------------------------------------------------------------------- */
 
export const ASSET_REVIEW_STATUSES = ["DRAFT", "APPROVED", "REJECTED"] as const;
export const ASSET_KINDS = [
    "IMAGE",
    "VIDEO",
    "LOGO",
    "TEXT",
    "CTA",
    "EXTENSION",
    "CREATIVE",
] as const;


export type AssetReviewStatus =
  | "DRAFT"
  | "APPROVED"
  | "REJECTED";

export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_ORIGINS = [
    "MANUAL",
    "AI_STUDIO",
    "GOOGLE_ADS",
    "META_ADS",
] as const;

export type AssetOrigin = (typeof ASSET_ORIGINS)[number];

export const ASSET_PROVIDERS = [
    "googleAds",
    "metaAds",
] as const;

export type AssetProvider = (typeof ASSET_PROVIDERS)[number];

export const ASSET_STORAGE_PROVIDERS = [
    "LOCAL",
    "S3",
    "CLOUDINARY",
] as const;

export type AssetStorageProvider =
    (typeof ASSET_STORAGE_PROVIDERS)[number];

export const PROVIDER_MEDIA_KINDS = [
    "IMAGE",
    "VIDEO",
] as const;

export type ProviderMediaKind =
    (typeof PROVIDER_MEDIA_KINDS)[number];

/* -------------------------------------------------------------------------- */
/* Existing Google creative pack                                              */
/* -------------------------------------------------------------------------- */

/**
 * Structured Google ad copy saved by AI Creation.
 *
 * Kept independently from providerCreative because this represents
 * AdSyntra's existing Google creative-pack functionality.
 */
export interface GoogleCreativePackRecord {
    campaignType: string;
    subFormat?: string;
    formatLabel: string;
    headlines: string[];
    longHeadlines: string[];
    descriptions: string[];
    finalUrl: string;
    imageUrl?: string;
}

/* -------------------------------------------------------------------------- */
/* Provider media reference                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Media referenced by a provider creative.
 *
 * These are references only. The original media remains hosted by
 * the advertising provider.
 */
export interface ProviderCreativeMediaReference {
    kind: ProviderMediaKind;

    assetId: string | null;
    imageHash: string | null;
    videoId: string | null;

    mediaUrl: string | null;
    thumbnailUrl: string | null;
}

/**
 * Individual card in a carousel or multi-card creative.
 */
export interface ProviderCreativeCard {
    cardId: string | null;

    headline: string | null;
    description: string | null;

    linkUrl: string | null;

    callToAction: string | null;
    callToActionType: string | null;

    imageUrl: string | null;
    videoId: string | null;
    thumbnailUrl: string | null;
}

/* -------------------------------------------------------------------------- */
/* Structured provider creative content                                       */
/* -------------------------------------------------------------------------- */

/**
 * Normalized creative content from Google Ads and Meta Ads.
 *
 * Examples:
 *
 * Google:
 * - Responsive search ad headlines
 * - Long headlines
 * - Descriptions
 * - Call-to-action assets
 *
 * Meta:
 * - Primary text
 * - Headline
 * - Description
 * - CTA type
 * - Link description
 * - Carousel cards
 * - Dynamic creative variations
 */
export interface ProviderCreativeContent {
    creativeType: string | null;

    primaryTexts: string[];
    headlines: string[];
    longHeadlines: string[];
    descriptions: string[];

    callToAction: string | null;
    callToActionType: string | null;

    linkDescription: string | null;
    displayUrl: string | null;

    finalUrls: string[];

    carouselCards: ProviderCreativeCard[];

    media: ProviderCreativeMediaReference[];

    /** Other related provider asset IDs, when available. */
    relatedAssetIds: string[];
}

/* -------------------------------------------------------------------------- */
/* Provider extension content                                                */
/* -------------------------------------------------------------------------- */

/**
 * Normalized content for Google Ads extensions/assets.
 *
 * Supports:
 * - Sitelinks
 * - Callouts
 * - Structured snippets
 * - Promotion assets
 * - Price assets
 * - Call assets
 * - Lead form assets
 *
 * Provider-specific asset types remain available in
 * ProviderAssetReference.assetType.
 */
export interface ProviderExtensionContent {
    extensionType: string | null;

    // Sitelink and general text fields.
    text: string | null;
    linkText: string | null;
    description1: string | null;
    description2: string | null;

    // Structured snippets.
    header: string | null;
    values: string[];

    // Call extension.
    phoneNumber: string | null;

    // Promotion extension.
    promotionTarget: string | null;
    promotionCode: string | null;
    discountType: string | null;
    discountValue: string | null;
    occasion: string | null;

    // Price extension.
    currencyCode: string | null;
    priceAmount: string | null;
    priceQualifier: string | null;

    // Lead form extension.
    businessName: string | null;
    headline: string | null;
    description: string | null;
    privacyPolicyUrl: string | null;

    // Common destination.
    finalUrl: string | null;

    // Other structured fields supported by a provider.
    fieldNames: string[];
}

/* -------------------------------------------------------------------------- */
/* Provider asset reference                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Reference to an asset or creative owned by an external provider.
 *
 * The provider's original media is not downloaded or duplicated by AdSyntra.
 *
 * assetId is the stable provider-side identifier used for synchronization.
 * Media URLs are refreshable preview information, not permanent identifiers.
 */
export interface ProviderAssetReference {
    provider: AssetProvider;

    /** Google customer ID or Meta act_ID. */
    accountId: string;

    accountName: string | null;

    /** Stable provider asset or creative ID. */
    assetId: string;

    /** Native provider asset type, e.g. CALLOUT, SITELINK, IMAGE, AD_CREATIVE. */
    assetType: string | null;

    /** Google Ads resource name, when available. */
    resourceName: string | null;

    /** Associated ad creative ID. */
    creativeId: string | null;

    /** Associated ad ID. */
    adId: string | null;

    /** Associated campaign ID. */
    campaignId: string | null;

    /** Google ad group ID. */
    adGroupId: string | null;

    /** Meta ad set ID. */
    adSetId: string | null;

    /** Meta image hash. */
    imageHash: string | null;

    /** Google YouTube video ID or Meta video ID. */
    videoId: string | null;

    /** Original provider-hosted media URL. */
    mediaUrl: string | null;

    /** Original provider-hosted thumbnail URL. */
    thumbnailUrl: string | null;

    /** Last successful synchronization time. */
    syncedAt: Date;
}

/* -------------------------------------------------------------------------- */
/* Asset interface                                                            */
/* -------------------------------------------------------------------------- */

/**
 * AdSyntra Asset Library metadata.
 *
 * AdSyntra-owned binary files live in the configured storage provider.
 * Provider-owned assets and creatives are represented by provider references
 * and structured provider content.
 */
export interface Asset {
    /** Clerk user ID. All asset queries must be scoped to this owner. */
    ownerUserId: string;

    name: string;
    kind: AssetKind;

    /** AdSyntra-owned file storage. */
    storageProvider: AssetStorageProvider | null;
    storageKey: string | null;

    originalFileName: string | null;
    mimeType: string | null;
    sizeBytes: number | null;

    width: number | null;
    height: number | null;
    aspectRatio: string | null;

    /**
     * Main text value for standalone TEXT/CTA records.
     *
     * Complete provider creatives should also use providerCreative
     * to preserve their structured content.
     */
    textContent: string | null;

    origin: AssetOrigin;
   
 /** AI-generated logo concepts require an explicit human decision before use. */
 reviewStatus?: AssetReviewStatus;
 reviewedAt?: Date | null;
 reviewedByUserId?: string | null;


    prompt: string | null;

    platformTargets: AssetProvider[];

    /** Existing AdSyntra Google creative pack. */
    googlePack: GoogleCreativePackRecord | null;

    /** External provider asset reference. */
    providerAsset: ProviderAssetReference | null;

    /** Structured headlines, primary text, descriptions and creative media. */
    providerCreative: ProviderCreativeContent | null;

    /** Structured extension data for provider extension assets. */
    providerExtension: ProviderExtensionContent | null;

    createdAt: Date;
    updatedAt: Date;
}

export type AssetDocument = HydratedDocument<Asset>;

/* -------------------------------------------------------------------------- */
/* Provider creative card schema                                              */
/* -------------------------------------------------------------------------- */

const providerCreativeCardSchema =
    new Schema<ProviderCreativeCard>(
        {
            cardId: {
                type: String,
                default: null,
                trim: true,
            },

            headline: {
                type: String,
                default: null,
                trim: true,
            },

            description: {
                type: String,
                default: null,
                trim: true,
            },

            linkUrl: {
                type: String,
                default: null,
                trim: true,
            },

            callToAction: {
                type: String,
                default: null,
                trim: true,
            },

            callToActionType: {
                type: String,
                default: null,
                trim: true,
            },

            imageUrl: {
                type: String,
                default: null,
                trim: true,
            },

            videoId: {
                type: String,
                default: null,
                trim: true,
            },

            thumbnailUrl: {
                type: String,
                default: null,
                trim: true,
            },
        },
        {
            _id: false,
            id: false,
            strict: "throw",
        },
    );

/* -------------------------------------------------------------------------- */
/* Provider creative media schema                                             */
/* -------------------------------------------------------------------------- */

const providerCreativeMediaSchema =
    new Schema<ProviderCreativeMediaReference>(
        {
            kind: {
                type: String,
                enum: PROVIDER_MEDIA_KINDS,
                required: true,
            },

            assetId: {
                type: String,
                default: null,
                trim: true,
            },

            imageHash: {
                type: String,
                default: null,
                trim: true,
            },

            videoId: {
                type: String,
                default: null,
                trim: true,
            },

            mediaUrl: {
                type: String,
                default: null,
                trim: true,
            },

            thumbnailUrl: {
                type: String,
                default: null,
                trim: true,
            },
            reviewStatus: {
  type: String,
  enum: ["DRAFT", "APPROVED", "REJECTED"],
  default: "DRAFT",
},
reviewedAt: {
  type: Date,
  default: null,
},
        },
        {
            _id: false,
            id: false,
            strict: "throw",
        },
    );

/* -------------------------------------------------------------------------- */
/* Provider creative content schema                                           */
/* -------------------------------------------------------------------------- */

const providerCreativeSchema =
    new Schema<ProviderCreativeContent>(
        {
            creativeType: {
                type: String,
                default: null,
                trim: true,
            },

            primaryTexts: {
                type: [String],
                default: [],
            },

            headlines: {
                type: [String],
                default: [],
            },

            longHeadlines: {
                type: [String],
                default: [],
            },

            descriptions: {
                type: [String],
                default: [],
            },

            callToAction: {
                type: String,
                default: null,
                trim: true,
            },

            callToActionType: {
                type: String,
                default: null,
                trim: true,
            },

            linkDescription: {
                type: String,
                default: null,
                trim: true,
            },

            displayUrl: {
                type: String,
                default: null,
                trim: true,
            },

            finalUrls: {
                type: [String],
                default: [],
            },

            carouselCards: {
                type: [providerCreativeCardSchema],
                default: [],
            },

            media: {
                type: [providerCreativeMediaSchema],
                default: [],
            },

            relatedAssetIds: {
                type: [String],
                default: [],
            },
        },
        {
            _id: false,
            id: false,
            strict: "throw",
        },
    );

/* -------------------------------------------------------------------------- */
/* Provider extension schema                                                  */
/* -------------------------------------------------------------------------- */

const providerExtensionSchema =
    new Schema<ProviderExtensionContent>(
        {
            extensionType: {
                type: String,
                default: null,
                trim: true,
            },

            text: {
                type: String,
                default: null,
                trim: true,
            },

            linkText: {
                type: String,
                default: null,
                trim: true,
            },

            description1: {
                type: String,
                default: null,
                trim: true,
            },

            description2: {
                type: String,
                default: null,
                trim: true,
            },

            header: {
                type: String,
                default: null,
                trim: true,
            },

            values: {
                type: [String],
                default: [],
            },

            phoneNumber: {
                type: String,
                default: null,
                trim: true,
            },

            promotionTarget: {
                type: String,
                default: null,
                trim: true,
            },

            promotionCode: {
                type: String,
                default: null,
                trim: true,
            },

            discountType: {
                type: String,
                default: null,
                trim: true,
            },

            discountValue: {
                type: String,
                default: null,
                trim: true,
            },

            occasion: {
                type: String,
                default: null,
                trim: true,
            },

            currencyCode: {
                type: String,
                default: null,
                trim: true,
            },

            priceAmount: {
                type: String,
                default: null,
                trim: true,
            },

            priceQualifier: {
                type: String,
                default: null,
                trim: true,
            },

            businessName: {
                type: String,
                default: null,
                trim: true,
            },

            headline: {
                type: String,
                default: null,
                trim: true,
            },

            description: {
                type: String,
                default: null,
                trim: true,
            },

            privacyPolicyUrl: {
                type: String,
                default: null,
                trim: true,
            },

            finalUrl: {
                type: String,
                default: null,
                trim: true,
            },

            fieldNames: {
                type: [String],
                default: [],
            },
        },
        {
            _id: false,
            id: false,
            strict: "throw",
        },
    );

/* -------------------------------------------------------------------------- */
/* Provider asset reference schema                                            */
/* -------------------------------------------------------------------------- */

const providerAssetSchema =
    new Schema<ProviderAssetReference>(
        {
            provider: {
                type: String,
                enum: ASSET_PROVIDERS,
                required: true,
            },

            accountId: {
                type: String,
                required: true,
                trim: true,
            },

            accountName: {
                type: String,
                default: null,
                trim: true,
            },

            assetId: {
                type: String,
                required: true,
                trim: true,
            },

            assetType: {
                type: String,
                default: null,
                trim: true,
            },

            resourceName: {
                type: String,
                default: null,
                trim: true,
            },

            creativeId: {
                type: String,
                default: null,
                trim: true,
            },

            adId: {
                type: String,
                default: null,
                trim: true,
            },

            campaignId: {
                type: String,
                default: null,
                trim: true,
            },

            adGroupId: {
                type: String,
                default: null,
                trim: true,
            },

            adSetId: {
                type: String,
                default: null,
                trim: true,
            },

            imageHash: {
                type: String,
                default: null,
                trim: true,
            },

            videoId: {
                type: String,
                default: null,
                trim: true,
            },

            mediaUrl: {
                type: String,
                default: null,
                trim: true,
            },

            thumbnailUrl: {
                type: String,
                default: null,
                trim: true,
            },

            syncedAt: {
                type: Date,
                default: Date.now,
                required: true,
            },
        },
        {
            _id: false,
            id: false,
            strict: "throw",
        },
    );

/* -------------------------------------------------------------------------- */
/* Existing Google creative pack schema                                       */
/* -------------------------------------------------------------------------- */

const googleCreativePackSchema =
    new Schema<GoogleCreativePackRecord>(
        {
            campaignType: {
                type: String,
                required: true,
                trim: true,
            },

            subFormat: {
                type: String,
                trim: true,
            },

            formatLabel: {
                type: String,
                required: true,
                trim: true,
            },

            headlines: {
                type: [String],
                default: [],
            },

            longHeadlines: {
                type: [String],
                default: [],
            },

            descriptions: {
                type: [String],
                default: [],
            },

            finalUrl: {
                type: String,
                required: true,
                trim: true,
            },

            imageUrl: {
                type: String,
                trim: true,
            },
        },
        {
            _id: false,
            id: false,
            strict: "throw",
        },
    );

/* -------------------------------------------------------------------------- */
/* Main asset schema                                                          */
/* -------------------------------------------------------------------------- */

const assetSchema = new Schema<Asset>(
    {
        ownerUserId: {
            type: String,
            required: true,
            immutable: true,
            trim: true,
            index: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150,
        },

        kind: {
            type: String,
            enum: ASSET_KINDS,
            required: true,
        },

        // AdSyntra-owned file storage.
        // Hidden from normal Mongoose serialization.
        storageProvider: {
            type: String,
            enum: ASSET_STORAGE_PROVIDERS,
            default: null,
            select: false,
        },

        storageKey: {
            type: String,
            default: null,
            select: false,
        },

        originalFileName: {
            type: String,
            default: null,
            trim: true,
        },

        mimeType: {
            type: String,
            default: null,
            trim: true,
        },

        sizeBytes: {
            type: Number,
            default: null,
            min: 0,
        },

        width: {
            type: Number,
            default: null,
            min: 1,
        },

        height: {
            type: Number,
            default: null,
            min: 1,
        },

        aspectRatio: {
            type: String,
            default: null,
            trim: true,
        },

        textContent: {
            type: String,
            default: null,
            maxlength: 10000,
        },

        origin: {
            type: String,
            enum: ASSET_ORIGINS,
            default: "MANUAL",
            required: true,
        },

   reviewStatus: {
     type: String,
     enum: ASSET_REVIEW_STATUSES,
   },
   reviewedAt: {
     type: Date,
     default: null,
   },
   reviewedByUserId: {
     type: String,
     default: null,
     trim: true,
   },

        prompt: {
            type: String,
            default: null,
            maxlength: 5000,
        },

        platformTargets: {
            type: [
                {
                    type: String,
                    enum: ASSET_PROVIDERS,
                },
            ],
            default: [],
        },

        googlePack: {
            type: googleCreativePackSchema,
            default: null,
        },

        providerAsset: {
            type: providerAssetSchema,
            default: null,
        },

        providerCreative: {
            type: providerCreativeSchema,
            default: null,
        },

        providerExtension: {
            type: providerExtensionSchema,
            default: null,
        },
    },
    {
        collection: "assets",
        timestamps: true,
        versionKey: false,
        strict: "throw",
    },
);

/* -------------------------------------------------------------------------- */
/* Indexes                                                                    */
/* -------------------------------------------------------------------------- */

// Main library listing: newest assets for an authenticated user.
assetSchema.index(
    {
        ownerUserId: 1,
        createdAt: -1,
    },
    {
        name: "assets_owner_created",
    },
);

// Efficient filtering by asset kind.
assetSchema.index(
    {
        ownerUserId: 1,
        kind: 1,
        createdAt: -1,
    },
    {
        name: "assets_owner_kind_created",
    },
);

// Efficient provider and account filtering.
assetSchema.index(
    {
        ownerUserId: 1,
        origin: 1,
        "providerAsset.provider": 1,
        "providerAsset.accountId": 1,
        createdAt: -1,
    },
    {
        name: "assets_owner_provider_account_created",
    },
);

// Efficient lookup for provider creative relationships.
assetSchema.index(
    {
        ownerUserId: 1,
        "providerAsset.provider": 1,
        "providerAsset.accountId": 1,
        "providerAsset.creativeId": 1,
    },
    {
        name: "assets_owner_provider_creative",
        partialFilterExpression: {
            "providerAsset.creativeId": {
                $type: "string",
            },
        },
    },
);

// Prevent importing the same provider asset twice into one user's library
// from the same provider account.
assetSchema.index(
    {
        ownerUserId: 1,
        "providerAsset.provider": 1,
        "providerAsset.accountId": 1,
        "providerAsset.assetId": 1,
    },
    {
        unique: true,
        name: "assets_owner_provider_asset_unique",
        partialFilterExpression: {
            "providerAsset.assetId": {
                $type: "string",
            },
        },
    },
);

/* -------------------------------------------------------------------------- */
/* Model registration                                                         */
/* -------------------------------------------------------------------------- */

// Keep model registration safe during development reloads.
const AssetModel = model<Asset>("Asset", assetSchema);

export default AssetModel;
