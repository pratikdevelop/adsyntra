
import type {
    CampaignCreativeCapability,
} from "@/interfaces/campaign-creation.interface";
import { AdPlatform } from '@/types/campaign-creation.type'

/* -------------------------------------------------------------------------- */
/* Campaign Creative Capability Registry                                      */
/* -------------------------------------------------------------------------- */

/**
 * Central source of truth for provider-specific creative requirements.
 *
 * SUPPORTED:
 * Existing campaign creation flow has been tested.
 *
 * IN_DEVELOPMENT:
 * Requirements are defined, but the complete integration is not verified.
 *
 * COMING_SOON:
 * Campaign format is planned but not implemented.
 */

export const CAMPAIGN_CREATIVE_CAPABILITIES: CampaignCreativeCapability[] = [

    /* ====================================================================== */
    /* GOOGLE ADS — SEARCH                                                    */
    /* ====================================================================== */

    {
        id: "google-search-responsive-search",

        platform: "googleAds",
        campaignType: "SEARCH",
        adFormat: "RESPONSIVE_SEARCH",

        status: "SUPPORTED",
        collectionMode: "SINGLE",

        assetRequirements: [],

        textRequirements: [
            {
                id: "google-search-headlines",
                field: "HEADLINE",
                minCount: 3,
                maxCount: 15,
                recommendedCount: 10,
                maxLength: 30,
            },
            {
                id: "google-search-descriptions",
                field: "DESCRIPTION",
                minCount: 2,
                maxCount: 4,
                recommendedCount: 4,
                maxLength: 90,
            },
        ],

        description:
            "Responsive Search Ads use multiple text assets rather than mandatory image creatives.",

        notes: [
            "Search campaign creation is already implemented.",
            "Image assets are not mandatory for the responsive search ad.",
            "Optional image extensions should be handled separately.",
        ],
    },

    /* ====================================================================== */
    /* GOOGLE ADS — DISPLAY                                                   */
    /* ====================================================================== */

    {
        id: "google-display-responsive-display",

        platform: "googleAds",
        campaignType: "DISPLAY",
        adFormat: "RESPONSIVE_DISPLAY",

        status: "SUPPORTED",
        collectionMode: "RESPONSIVE_SET",

        assetRequirements: [
            {
                id: "google-display-landscape-images",
                role: "LANDSCAPE_IMAGE",
                mediaType: "IMAGE",
                minCount: 1,
                maxCount: 15,
                recommendedCount: 5,
                allowedAspectRatios: ["1.91:1"],
                allowedMimeTypes: [
                    "image/jpeg",
                    "image/png",
                    "image/gif",
                ],
                minWidth: 600,
                minHeight: 314,
                maxFileSizeBytes: 5 * 1024 * 1024,
            },
            {
                id: "google-display-square-images",
                role: "SQUARE_IMAGE",
                mediaType: "IMAGE",
                minCount: 1,
                maxCount: 15,
                recommendedCount: 5,
                allowedAspectRatios: ["1:1"],
                allowedMimeTypes: [
                    "image/jpeg",
                    "image/png",
                    "image/gif",
                ],
                minWidth: 300,
                minHeight: 300,
                maxFileSizeBytes: 5 * 1024 * 1024,
            },
            {
                id: "google-display-square-logos",
                role: "LOGO",
                mediaType: "IMAGE",
                minCount: 0,
                maxCount: 5,
                recommendedCount: 1,
                allowedAspectRatios: ["1:1"],
                minWidth: 128,
                minHeight: 128,
                maxFileSizeBytes: 5 * 1024 * 1024,
            },
            {
                id: "google-display-landscape-logos",
                role: "LOGO",
                mediaType: "IMAGE",
                minCount: 0,
                maxCount: 5,
                recommendedCount: 1,
                allowedAspectRatios: ["4:1"],
                minWidth: 512,
                minHeight: 128,
                maxFileSizeBytes: 5 * 1024 * 1024,
            },
        ],

        textRequirements: [
            {
                id: "google-display-headlines",
                field: "HEADLINE",
                minCount: 1,
                maxCount: 5,
                recommendedCount: 5,
                maxLength: 30,
            },
            {
                id: "google-display-long-headline",
                field: "LONG_HEADLINE",
                minCount: 1,
                maxCount: 1,
                maxLength: 90,
            },
            {
                id: "google-display-descriptions",
                field: "DESCRIPTION",
                minCount: 1,
                maxCount: 5,
                recommendedCount: 3,
                maxLength: 90,
            },
            {
                id: "google-display-business-name",
                field: "BUSINESS_NAME",
                minCount: 1,
                maxCount: 1,
                maxLength: 25,
            },
        ],

        description:
            "Responsive Display supports multiple landscape and square images, plus optional logo variations.",

        notes: [
            "Landscape and square image limits are independent: up to 15 in each group.",
            "The total image count is not restricted to 15.",
            "Logo groups are optional.",
            "Direct form image upload has been tested.",
            "Asset Library and AI-generated image integration still need testing.",
        ],
    },

    /* ====================================================================== */
    /* GOOGLE ADS — PERFORMANCE MAX                                           */
    /* ====================================================================== */

    {
        id: "google-performance-max-asset-group",

        platform: "googleAds",
        campaignType: "PERFORMANCE_MAX",
        adFormat: "ASSET_GROUP",

        status: "COMING_SOON",
        collectionMode: "RESPONSIVE_SET",

        assetRequirements: [
            {
                id: "google-pmax-landscape-images",
                role: "LANDSCAPE_IMAGE",
                mediaType: "IMAGE",
                minCount: 1,
                maxCount: 20,
                recommendedCount: 4,
                allowedAspectRatios: ["1.91:1"],
                allowedMimeTypes: [
                    "image/jpeg",
                    "image/png",
                    "image/gif",
                ],
                minWidth: 600,
                minHeight: 314,
                maxFileSizeBytes: 5 * 1024 * 1024,
            },
            {
                id: "google-pmax-square-images",
                role: "SQUARE_IMAGE",
                mediaType: "IMAGE",
                minCount: 1,
                maxCount: 20,
                recommendedCount: 4,
                allowedAspectRatios: ["1:1"],
                allowedMimeTypes: [
                    "image/jpeg",
                    "image/png",
                    "image/gif",
                ],
                minWidth: 300,
                minHeight: 300,
                maxFileSizeBytes: 5 * 1024 * 1024,
            },
            {
                id: "google-pmax-portrait-images",
                role: "PORTRAIT_IMAGE",
                mediaType: "IMAGE",
                minCount: 0,
                maxCount: 20,
                recommendedCount: 2,
                allowedAspectRatios: ["4:5"],
                minWidth: 480,
                minHeight: 600,
                maxFileSizeBytes: 5 * 1024 * 1024,
            },
            {
                id: "google-pmax-square-logos",
                role: "LOGO",
                mediaType: "IMAGE",
                minCount: 0,
                maxCount: 5,
                recommendedCount: 1,
                allowedAspectRatios: ["1:1"],
                minWidth: 128,
                minHeight: 128,
                maxFileSizeBytes: 5 * 1024 * 1024,
            },
            {
                id: "google-pmax-landscape-logos",
                role: "LOGO",
                mediaType: "IMAGE",
                minCount: 0,
                maxCount: 20,
                allowedAspectRatios: ["4:1"],
                minWidth: 512,
                minHeight: 128,
                maxFileSizeBytes: 5 * 1024 * 1024,
            },
            {
                id: "google-pmax-videos",
                role: "VIDEO",
                mediaType: "VIDEO",
                minCount: 0,
                maxCount: 15,
                allowedAspectRatios: ["16:9", "1:1", "9:16"],
                minDurationSeconds: 10,
            },
        ],

        textRequirements: [
            {
                id: "google-pmax-headlines",
                field: "HEADLINE",
                minCount: 3,
                maxCount: 15,
                recommendedCount: 5,
                maxLength: 30,
            },
            {
                id: "google-pmax-long-headlines",
                field: "LONG_HEADLINE",
                minCount: 1,
                maxCount: 5,
                recommendedCount: 5,
                maxLength: 90,
            },
            {
                id: "google-pmax-descriptions",
                field: "DESCRIPTION",
                minCount: 2,
                maxCount: 5,
                recommendedCount: 4,
                maxLength: 90,
            },
            {
                id: "google-pmax-business-name",
                field: "BUSINESS_NAME",
                minCount: 0,
                maxCount: 1,
                maxLength: 25,
            },
        ],

        description:
            "Performance Max asset groups combine image, video and text assets for Google's channels.",

        notes: [
            "Image limits apply separately to each Google asset field type.",
            "Do not impose a combined 20-image limit across all image roles.",
            "Business name and logo requirements depend on brand-guideline settings.",
            "With brand guidelines enabled, some brand assets must be linked at campaign level.",
            "Retail campaigns linked to Merchant Center have different asset requirements.",
            "Asset groups and their required assets must be created using the appropriate Google Ads API workflow.",
        ],
    },

    /* ====================================================================== */
    /* GOOGLE ADS — DEMAND GEN SINGLE IMAGE                                   */
    /* ====================================================================== */

    {
        id: "google-demand-gen-single-image",

        platform: "googleAds",
        campaignType: "DEMAND_GEN",
        adFormat: "SINGLE_IMAGE",

        status: "COMING_SOON",
        collectionMode: "RESPONSIVE_SET",

        assetRequirements: [
            {
                id: "google-demand-gen-landscape-images",
                role: "LANDSCAPE_IMAGE",
                mediaType: "IMAGE",
                minCount: 1,
                maxCount: 20,
                recommendedCount: 3,
                allowedAspectRatios: ["1.91:1"],
                minWidth: 600,
                minHeight: 314,
            },
            {
                id: "google-demand-gen-square-images",
                role: "SQUARE_IMAGE",
                mediaType: "IMAGE",
                minCount: 1,
                maxCount: 20,
                recommendedCount: 3,
                allowedAspectRatios: ["1:1"],
                minWidth: 300,
                minHeight: 300,
            },
            {
                id: "google-demand-gen-portrait-images",
                role: "PORTRAIT_IMAGE",
                mediaType: "IMAGE",
                minCount: 0,
                maxCount: 20,
                recommendedCount: 3,
                allowedAspectRatios: ["4:5"],
                minWidth: 480,
                minHeight: 600,
            },
            {
                id: "google-demand-gen-square-logos",
                role: "LOGO",
                mediaType: "IMAGE",
                minCount: 1,
                maxCount: 5,
                recommendedCount: 1,
                allowedAspectRatios: ["1:1"],
                minWidth: 144,
                minHeight: 144,
            },
        ],

        textRequirements: [
            {
                id: "google-demand-gen-headlines",
                field: "HEADLINE",
                minCount: 3,
                maxCount: 5,
                recommendedCount: 3,
                maxLength: 40,
            },
            {
                id: "google-demand-gen-descriptions",
                field: "DESCRIPTION",
                minCount: 3,
                maxCount: 5,
                recommendedCount: 3,
                maxLength: 90,
            },
            {
                id: "google-demand-gen-business-name",
                field: "BUSINESS_NAME",
                minCount: 1,
                maxCount: 1,
                maxLength: 25,
            },
        ],

        description:
            "Demand Gen single-image ads support multiple image assets and placement orientations.",

        notes: [
            "Google documents up to 20 image assets per ad.",
            "Validate the aggregate image count across image orientations.",
            "Vertical 4:5 images are optional.",
            "Video creative should be modeled as a separate format and capability.",
        ],
    },

    /* ====================================================================== */
    /* GOOGLE ADS — DEMAND GEN CAROUSEL                                       */
    /* ====================================================================== */

    {
        id: "google-demand-gen-carousel",

        platform: "googleAds",
        campaignType: "DEMAND_GEN",
        adFormat: "CAROUSEL",

        status: "COMING_SOON",
        collectionMode: "ORDERED_CARDS",

        minTotalAssetCount: 2,
        maxTotalAssetCount: 10,

        maxTotalAssets: {
            IMAGE: 10,
        },

        assetRequirements: [
            {
                id: "google-demand-gen-carousel-card-images",
                role: "CAROUSEL_CARD_IMAGE",
                mediaType: "IMAGE",
                minCount: 2,
                maxCount: 10,
                allowedAspectRatios: ["1.91:1", "1:1", "4:5"],
                ordered: true,
            },
        ],

        textRequirements: [
            {
                id: "google-demand-gen-carousel-headlines",
                field: "HEADLINE",
                minCount: 2,
                maxCount: 10,
                maxLength: 40,
            },
            {
                id: "google-demand-gen-carousel-descriptions",
                field: "DESCRIPTION",
                minCount: 0,
                maxCount: 10,
                maxLength: 40,
            },
            {
                id: "google-demand-gen-carousel-business-name",
                field: "BUSINESS_NAME",
                minCount: 1,
                maxCount: 1,
                maxLength: 25,
            },
        ],

        description:
            "Demand Gen Carousel uses multiple ordered cards, each with its own image and optional destination URL.",

        notes: [
            "Carousel requires 2–10 cards.",
            "All cards in one carousel must use a consistent aspect ratio.",
            "Individual cards can have their own destination URLs.",
            "Card ordering must be retained during upload and creative creation.",
            "Carousel format has Merchant Center feed restrictions.",
        ],
    },

    /* ====================================================================== */
    /* META ADS — SINGLE IMAGE                                                */
    /* ====================================================================== */

    {
        id: "meta-single-image",

        platform: "metaAds",
        campaignType: "OBJECTIVE_BASED",
        adFormat: "SINGLE_IMAGE",

        status: "SUPPORTED",
        collectionMode: "SINGLE",

        maxTotalAssets: {
            IMAGE: 1,
        },

        assetRequirements: [
            {
                id: "meta-single-primary-image",
                role: "PRIMARY_IMAGE",
                mediaType: "IMAGE",
                minCount: 1,
                maxCount: 1,
                allowedAspectRatios: [
                    "1:1",
                    "4:5",
                    "1.91:1",
                    "9:16",
                ],
                allowedMimeTypes: [
                    "image/jpeg",
                    "image/png",
                ],
            },
        ],

        textRequirements: [
            {
                id: "meta-single-primary-text",
                field: "PRIMARY_TEXT",
                minCount: 1,
                maxCount: 5,
            },
            {
                id: "meta-single-headlines",
                field: "HEADLINE",
                minCount: 1,
                maxCount: 5,
            },
            {
                id: "meta-single-descriptions",
                field: "DESCRIPTION",
                minCount: 0,
                maxCount: 5,
            },
            {
                id: "meta-single-cta",
                field: "CALL_TO_ACTION",
                minCount: 1,
                maxCount: 1,
            },
        ],

        description:
            "Meta single-image ad with one primary image and campaign copy variations.",

        notes: [
            "Meta image upload and AdCreative creation have been tested.",
            "Asset Library private image upload is supported by the current integration.",
            "Placement-specific cropping and asset customization should be handled separately.",
            "Final eligibility depends on the selected Meta objective and placements.",
        ],
    },

    /* ====================================================================== */
    /* META ADS — SINGLE VIDEO                                                */
    /* ====================================================================== */

    {
        id: "meta-single-video",

        platform: "metaAds",
        campaignType: "OBJECTIVE_BASED",
        adFormat: "SINGLE_VIDEO",

        status: "IN_DEVELOPMENT",
        collectionMode: "SINGLE",

        maxTotalAssets: {
            VIDEO: 1,
        },

        assetRequirements: [
            {
                id: "meta-single-primary-video",
                role: "VIDEO",
                mediaType: "VIDEO",
                minCount: 1,
                maxCount: 1,
                allowedAspectRatios: [
                    "1:1",
                    "4:5",
                    "16:9",
                    "9:16",
                ],
            },
            {
                id: "meta-single-video-thumbnail",
                role: "VIDEO_THUMBNAIL",
                mediaType: "IMAGE",
                minCount: 0,
                maxCount: 1,
            },
        ],

        textRequirements: [
            {
                id: "meta-video-primary-text",
                field: "PRIMARY_TEXT",
                minCount: 1,
                maxCount: 5,
            },
            {
                id: "meta-video-headlines",
                field: "HEADLINE",
                minCount: 1,
                maxCount: 5,
            },
            {
                id: "meta-video-cta",
                field: "CALL_TO_ACTION",
                minCount: 1,
                maxCount: 1,
            },
        ],

        description:
            "Meta single-video creative with an optional video thumbnail.",

        notes: [
            "Video upload and provider video ID resolution are not yet verified in AdSyntra.",
            "Video specifications must be validated against selected placements.",
            "Do not enable LIVE creation until video upload and AdCreative creation are tested.",
        ],
    },

    /* ====================================================================== */
    /* META ADS — CAROUSEL                                                    */
    /* ====================================================================== */

    {
        id: "meta-carousel",

        platform: "metaAds",
        campaignType: "OBJECTIVE_BASED",
        adFormat: "CAROUSEL",

        status: "IN_DEVELOPMENT",
        collectionMode: "ORDERED_CARDS",

        minTotalAssetCount: 2,
        maxTotalAssetCount: 10,

        maxTotalAssets: {
            IMAGE: 10,
            VIDEO: 10,
        },

        assetRequirements: [
            {
                id: "meta-carousel-card-images",
                role: "CAROUSEL_CARD_IMAGE",
                mediaType: "IMAGE",
                minCount: 0,
                maxCount: 10,
                allowedAspectRatios: [
                    "1:1",
                    "4:5",
                ],
                ordered: true,
            },
            {
                id: "meta-carousel-card-videos",
                role: "VIDEO",
                mediaType: "VIDEO",
                minCount: 0,
                maxCount: 10,
                allowedAspectRatios: [
                    "1:1",
                    "4:5",
                ],
                ordered: true,
            },
        ],

        textRequirements: [
            {
                id: "meta-carousel-primary-text",
                field: "PRIMARY_TEXT",
                minCount: 1,
                maxCount: 5,
            },
            {
                id: "meta-carousel-card-headlines",
                field: "HEADLINE",
                minCount: 0,
                maxCount: 10,
            },
            {
                id: "meta-carousel-card-descriptions",
                field: "DESCRIPTION",
                minCount: 0,
                maxCount: 10,
            },
            {
                id: "meta-carousel-cta",
                field: "CALL_TO_ACTION",
                minCount: 1,
                maxCount: 1,
            },
        ],

        description:
            "Meta Carousel supports multiple ordered cards with images, videos or a mixture of both.",

        notes: [
            "The combined card count must remain between 2 and 10.",
            "Image and video cards can be mixed, subject to current API and placement support.",
            "Each card may have its own headline, description and destination URL.",
            "Card positions must be preserved when creating the AdCreative.",
            "Meta's API has additional carousel attachment and optimization rules; validate against the selected API version.",
            "Campaign objective and placement compatibility must be checked separately.",
        ],
    },
];

/* -------------------------------------------------------------------------- */
/* Registry lookup helpers                                                    */
/* -------------------------------------------------------------------------- */

export function getCampaignCreativeCapability(
    platform: AdPlatform,
    campaignType: string,
    adFormat: string,
): CampaignCreativeCapability | undefined {
    return CAMPAIGN_CREATIVE_CAPABILITIES.find(
        (capability) =>
            capability.platform === platform &&
            capability.campaignType === campaignType &&
            capability.adFormat === adFormat,
    );
}

export function getCampaignCreativeCapabilities(
    platform: AdPlatform,
): CampaignCreativeCapability[] {
    return CAMPAIGN_CREATIVE_CAPABILITIES.filter(
        (capability) => capability.platform === platform,
    );
}

export function getAvailableCampaignCreativeCapabilities(
    platform: AdPlatform,
): CampaignCreativeCapability[] {
    return getCampaignCreativeCapabilities(platform).filter(
        (capability) => capability.status === "SUPPORTED",
    );
}
