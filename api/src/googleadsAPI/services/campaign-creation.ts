import { getProviderAccessToken } from "../../utils/provider-token.utils.js";
import {
    buildBiddingConfig,
    type BiddingOptions,
} from "../utils/bidding.js";
import { imageSize } from "image-size";
import { randomUUID } from "node:crypto";
// ==========================================
// 1. GOOGLE ADS CONFIGURATION
// ==========================================

const DEFAULT_API_VERSION = "v25";

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
// 3. GET GOOGLE ADS CREATION CONTEXT
// ==========================================

export async function getGoogleAdsCreationContext(
    userId: string,
    selectedAccountId: string
): Promise<GoogleAdsCreationContext> {

    if (!userId?.trim()) {
        throw new Error("Authenticated user ID is required.");
    }

    const customerId = normalizeCustomerId(selectedAccountId);

    const developerToken =
        process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();

    if (!developerToken) {
        throw new Error("Google Ads developer token is missing.");
    }

    const apiVersion =
        process.env[`GOOGLE_ADS_API_VERSION`]?.trim() ||
        DEFAULT_API_VERSION;

    if (!/^v\d+$/.test(apiVersion)) {
        throw new Error("Invalid Google Ads API version.");
    }

    const accessToken = await getProviderAccessToken(
        userId,
        "googleAds"
    );

    return {
        customerId,
        accessToken,
        developerToken,
        apiVersion
    };
}

// ==========================================
// GOOGLE ADS API MUTATION HELPER
// ==========================================

export interface GoogleAdsMutateResponse {
    results?: Array<{
        resourceName?: string;
    }>;

    [key: string]: unknown;
}

export class GoogleAdsCreationError extends Error {
    constructor(
        message: string,
        public statusCode = 500,
        public details?: unknown
    ) {
        super(message);
        this.name = "GoogleAdsCreationError";
    }
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



// ==========================================
// GOOGLE ADS CAMPAIGN CONFIGURATION
// ==========================================

export type GoogleAdsCampaignType =
    | "SEARCH"
    | "DISPLAY"
    | "SHOPPING"
    | "DEMAND_GEN"
    | "PERFORMANCE_MAX";

interface GoogleAdsCampaignConfig {
    apiChannelType: string;
    biddingStrategies: readonly string[];
}

const GOOGLE_ADS_CAMPAIGN_CONFIG: Record<
    GoogleAdsCampaignType,
    GoogleAdsCampaignConfig
> = {
    SEARCH: {
        apiChannelType: "SEARCH",
        biddingStrategies: [
            "MANUAL_CPC",
            "MAXIMIZE_CLICKS",
            "MAXIMIZE_CONVERSIONS",
            "MAXIMIZE_CONVERSION_VALUE",
            "TARGET_CPA",
            "TARGET_ROAS",
        ],
    },

    DISPLAY: {
        apiChannelType: "DISPLAY",
        biddingStrategies: [
            "MANUAL_CPC",
            "MANUAL_CPM",
            "MAXIMIZE_CLICKS",
            "MAXIMIZE_CONVERSIONS",
            "MAXIMIZE_CONVERSION_VALUE",
            "TARGET_CPA",
            "TARGET_ROAS",
        ],
    },

    SHOPPING: {
        apiChannelType: "SHOPPING",
        biddingStrategies: [
            "MANUAL_CPC",
            "MAXIMIZE_CLICKS",
            "MAXIMIZE_CONVERSIONS",
            "MAXIMIZE_CONVERSION_VALUE",
            "TARGET_CPA",
            "TARGET_ROAS",
        ],
    },

    DEMAND_GEN: {
        apiChannelType: "DEMAND_GEN",
        biddingStrategies: [
            "MAXIMIZE_CLICKS",
            "TARGET_CPA",
            "MAXIMIZE_CONVERSIONS",
            "TARGET_ROAS",
        ],
    },

    PERFORMANCE_MAX: {
        apiChannelType: "PERFORMANCE_MAX",
        biddingStrategies: [
            "MAXIMIZE_CONVERSIONS",
            "MAXIMIZE_CONVERSION_VALUE",
        ],
    },
};


// ==========================================
// GOOGLE ADS AD GROUP CONFIGURATION
// ==========================================

const GOOGLE_AD_GROUP_TYPES: Partial<
    Record<GoogleAdsCampaignType, string>
> = {
    SEARCH: "SEARCH_STANDARD",
    DISPLAY: "DISPLAY_STANDARD",
    SHOPPING: "SHOPPING_PRODUCT_ADS",

    // Demand Gen does not require an explicit AdGroup type.
};


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
// 2. NORMALIZE GOOGLE CUSTOMER ID
// ==========================================

function normalizeCustomerId(accountId: string): string {
    const customerId = accountId
        .trim()
        .replace(/^customers\//i, "")
        .replace(/-/g, "");

    if (!/^\d+$/.test(customerId)) {
        throw new Error("Invalid Google Ads customer ID.");
    }

    return customerId;
}


function isRecord(
    value: unknown
): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}
// ==========================================
// DEMAND GEN VALIDATION HELPERS
// ==========================================

function validateGoogleAdsAssetReference(
    context: GoogleAdsCreationContext,
    resourceName: string,
    fieldName: string,
): string {
    const prefix =
        `customers/${context.customerId}/assets/`;

    const assetId = resourceName?.startsWith(prefix)
        ? resourceName.slice(prefix.length)
        : "";

    if (!/^\d+$/.test(assetId)) {
        throw new GoogleAdsCreationError(
            `Invalid ${fieldName} asset resource name or account mismatch.`,
            400,
        );
    }

    return resourceName;
}

function validateGoogleAdsAssetList(
    context: GoogleAdsCreationContext,
    resources: string[],
    fieldName: string,
    min: number,
    max: number,
): string[] {
    if (
        !Array.isArray(resources) ||
        resources.length < min ||
        resources.length > max
    ) {
        throw new GoogleAdsCreationError(
            `${fieldName} requires ${min}–${max} assets.`,
            400,
        );
    }

    return resources.map((resourceName) =>
        validateGoogleAdsAssetReference(
            context,
            resourceName,
            fieldName,
        )
    );
}

function validateDemandGenTextList(
    values: string[],
    fieldName: string,
    min: number,
    max: number,
    maxLength: number,
): string[] {
    if (
        !Array.isArray(values) ||
        values.length < min ||
        values.length > max ||
        !values.every(
            (value) =>
                typeof value === "string" &&
                value.trim().length > 0 &&
                value.trim().length <= maxLength,
        )
    ) {
        throw new GoogleAdsCreationError(
            `${fieldName} requires ${min}–${max} entries, each up to ${maxLength} characters.`,
            400,
        );
    }

    return values.map((value) => value.trim());
}

function validateDemandGenFinalUrl(value: string): string {
    if (
        typeof value !== "string" ||
        value.trim().length === 0 ||
        value.trim().length > 2048
    ) {
        throw new GoogleAdsCreationError(
            "A valid final URL is required.",
            400,
        );
    }

    try {
        const url = new URL(value.trim());

        if (!["http:", "https:"].includes(url.protocol)) {
            throw new Error("Invalid protocol");
        }

        return url.toString();
    } catch {
        throw new GoogleAdsCreationError(
            "Final URL must be a valid HTTP or HTTPS URL.",
            400,
        );
    }
}

function validateGoogleAdsAdGroupReference(
    context: GoogleAdsCreationContext,
    resourceName: string,
): string {
    const prefix =
        `customers/${context.customerId}/adGroups/`;

    const adGroupId = resourceName?.startsWith(prefix)
        ? resourceName.slice(prefix.length)
        : "";

    if (!/^\d+$/.test(adGroupId)) {
        throw new GoogleAdsCreationError(
            "Invalid Ad Group resource name or account mismatch.",
            400,
        );
    }

    return resourceName;
}

// ==========================================
// DEMAND GEN AD MUTATION HELPER
// ==========================================

type DemandGenAdField =
    | "demandGenMultiAssetAd"
    | "demandGenVideoResponsiveAd"
    | "demandGenCarouselAd";

interface CreateDemandGenAdInput {
    adGroupResourceName: string;
    adName?: string;
    finalUrl: string;
    adField: DemandGenAdField;
    adConfiguration: Record<string, unknown>;
    validateOnly: boolean;
}

async function createDemandGenAd(
    context: GoogleAdsCreationContext,
    input: CreateDemandGenAdInput,
): Promise<GoogleAdsCreatedResource> {

    const adGroupResourceName =
        validateGoogleAdsAdGroupReference(
            context,
            input.adGroupResourceName,
        );

    const finalUrl =
        validateDemandGenFinalUrl(input.finalUrl);

    const ad: Record<string, unknown> = {
        finalUrls: [finalUrl],
        [input.adField]: input.adConfiguration,
    };

    if (input.adName) {
        ad.name = input.adName.trim();
    }

    const googleResponse = await googleAdsMutate(
        context,
        "adGroupAds:mutate",
        {
            operations: [
                {
                    create: {
                        adGroup: adGroupResourceName,
                        status: "PAUSED",
                        ad,
                    },
                },
            ],
            validateOnly: input.validateOnly,
        },
    );

    const resourceName =
        googleResponse.results?.[0]?.resourceName ?? null;

    if (!input.validateOnly && !resourceName) {
        throw new GoogleAdsCreationError(
            "Google Ads did not return the Demand Gen Ad resource name.",
            502,
            googleResponse,
        );
    }

    return {
        resourceName,
        resourceId: resourceName?.split("/").at(-1) ?? null,
        validateOnly: input.validateOnly,
        googleResponse,
    };
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

export async function createGoogleAdsDemandGenMultiAssetAd(
    context: GoogleAdsCreationContext,
    input: CreateGoogleAdsDemandGenMultiAssetAdInput,
): Promise<GoogleAdsCreatedResource> {

    // 1. Validate business name

    const businessName = input.businessName?.trim();

    if (!businessName || businessName.length > 25) {
        throw new GoogleAdsCreationError(
            "Business name is required and must not exceed 25 characters.",
            400,
        );
    }

    // 2. Validate text assets

    const headlines = validateDemandGenTextList(
        input.headlines,
        "Demand Gen headlines",
        1,
        5,
        30,
    );

    const descriptions = validateDemandGenTextList(
        input.descriptions,
        "Demand Gen descriptions",
        1,
        5,
        90,
    );

    // 3. Validate marketing images

    const marketingImages = validateGoogleAdsAssetList(
        context,
        input.marketingImageAssetResourceNames ?? [],
        "Marketing images",
        0,
        20,
    );

    const squareImages = validateGoogleAdsAssetList(
        context,
        input.squareMarketingImageAssetResourceNames ?? [],
        "Square marketing images",
        0,
        20,
    );

    const portraitImages = validateGoogleAdsAssetList(
        context,
        input.portraitMarketingImageAssetResourceNames ?? [],
        "Portrait marketing images",
        0,
        20,
    );

    const tallPortraitImages = validateGoogleAdsAssetList(
        context,
        input.tallPortraitMarketingImageAssetResourceNames ?? [],
        "Tall portrait marketing images",
        0,
        20,
    );

    const totalMarketingImages =
        marketingImages.length +
        squareImages.length +
        portraitImages.length +
        tallPortraitImages.length;

    if (
        marketingImages.length === 0 &&
        squareImages.length === 0
    ) {
        throw new GoogleAdsCreationError(
            "At least one landscape or square marketing image is required.",
            400,
        );
    }

    if (totalMarketingImages > 20) {
        throw new GoogleAdsCreationError(
            "A maximum of 20 combined marketing images is supported.",
            400,
        );
    }

    // 4. Validate logo assets

    const logoImages = validateGoogleAdsAssetList(
        context,
        input.logoAssetResourceNames,
        "Logo images",
        1,
        5,
    );

    // 5. Validate optional classic display images

    const classicDisplayImages = validateGoogleAdsAssetList(
        context,
        input.classicDisplayImageAssetResourceNames ?? [],
        "Classic display images",
        0,
        20,
    );

    // 6. Validate optional CTA

    const callToActionText = input.callToActionText?.trim();

    if (callToActionText && callToActionText.length > 30) {
        throw new GoogleAdsCreationError(
            "Call to action text must not exceed 30 characters.",
            400,
        );
    }

    // 7. Prepare API configuration

    const adConfiguration: Record<string, unknown> = {
        businessName,

        headlines: headlines.map((text) => ({ text })),

        descriptions: descriptions.map((text) => ({ text })),

        marketingImages: marketingImages.map((asset) => ({
            asset,
        })),

        squareMarketingImages: squareImages.map((asset) => ({
            asset,
        })),

        portraitMarketingImages: portraitImages.map((asset) => ({
            asset,
        })),

        tallPortraitMarketingImages: tallPortraitImages.map((asset) => ({
            asset,
        })),

        logoImages: logoImages.map((asset) => ({
            asset,
        })),
    };

    if (classicDisplayImages.length > 0) {
        adConfiguration.classicDisplayImages =
            classicDisplayImages.map((asset) => ({ asset }));
    }

    if (callToActionText) {
        adConfiguration.callToActionText = callToActionText;
    }

    // 8. Validate mutation mode

    const validateOnly = resolveAssetValidateOnly(input);

    // 9. Create Demand Gen Multi Asset Ad

    return createDemandGenAd(context, {
        adGroupResourceName: input.adGroupResourceName,
        finalUrl: input.finalUrl,
        adName: input.adName,
        adField: "demandGenMultiAssetAd",
        adConfiguration,
        validateOnly,
    });
}
// ============
// ==============================
// ASSET MUTATION VALIDATION
// ==========================================

function resolveAssetValidateOnly(input: {
    validateOnly?: boolean;
    confirm?: boolean;
}): boolean {
    const validateOnly = input.validateOnly !== false;

    if (!validateOnly && input.confirm !== true) {
        throw new GoogleAdsCreationError(
            "Live asset creation requires validateOnly:false and confirm:true.",
            400,
        );
    }

    return validateOnly;
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

export async function createGoogleAdsDemandGenCarouselAd(
    context: GoogleAdsCreationContext,
    input: CreateGoogleAdsDemandGenCarouselAdInput,
): Promise<GoogleAdsCreatedResource> {

    // 1. Validate business name

    const businessName = input.businessName?.trim();

    if (!businessName || businessName.length > 25) {
        throw new GoogleAdsCreationError(
            "Business name is required and must not exceed 25 characters.",
            400,
        );
    }

    // 2. Validate ad headline

    const headline = input.headline?.trim();

    if (!headline || headline.length > 40) {
        throw new GoogleAdsCreationError(
            "Carousel headline is required and must not exceed 40 characters.",
            400,
        );
    }

    // 3. Validate description

    const description = input.description?.trim();

    if (!description || description.length > 40) {
        throw new GoogleAdsCreationError(
            "Carousel description is required and must not exceed 40 characters.",
            400,
        );
    }

    // 4. Validate logo asset

    const logoImage = validateGoogleAdsAssetReference(
        context,
        input.logoAssetResourceName,
        "Carousel logo",
    );

    // 5. Validate carousel card assets

    const carouselCards = validateGoogleAdsAssetList(
        context,
        input.carouselCardAssetResourceNames,
        "Carousel cards",
        2,
        10,
    );

    // 6. Validate mutation mode

    const validateOnly = resolveAssetValidateOnly(input);

    // 7. Prepare carousel configuration

    const adConfiguration: Record<string, unknown> = {
        businessName,

        logoImage: {
            asset: logoImage,
        },

        headline: {
            text: headline,
        },

        description: {
            text: description,
        },

        carouselCards: carouselCards.map((asset) => ({
            asset,
        })),
    };

    if (input.callToActionText?.trim()) {
        adConfiguration.callToActionText =
            input.callToActionText.trim();
    }

    // 8. Create Demand Gen Carousel Ad

    return createDemandGenAd(context, {
        adGroupResourceName: input.adGroupResourceName,
        finalUrl: input.finalUrl,
        adName: input.adName,
        adField: "demandGenCarouselAd",
        adConfiguration,
        validateOnly,
    });
}
export async function createGoogleAdsDemandGenCarouselCardAsset(
    context: GoogleAdsCreationContext,
    input: CreateGoogleAdsDemandGenCarouselCardInput,
): Promise<GoogleAdsCreatedResource> {

    // 1. Validate headline

    const headline = input.headline?.trim();

    if (!headline || headline.length > 40) {
        throw new GoogleAdsCreationError(
            "Carousel card headline is required and must not exceed 40 characters.",
            400,
        );
    }

    // 2. Validate images

    const marketingImage = input.marketingImageAssetResourceName
        ? validateGoogleAdsAssetReference(
            context,
            input.marketingImageAssetResourceName,
            "Carousel marketing image",
        )
        : undefined;

    const squareImage = input.squareMarketingImageAssetResourceName
        ? validateGoogleAdsAssetReference(
            context,
            input.squareMarketingImageAssetResourceName,
            "Carousel square image",
        )
        : undefined;

    const portraitImage = input.portraitMarketingImageAssetResourceName
        ? validateGoogleAdsAssetReference(
            context,
            input.portraitMarketingImageAssetResourceName,
            "Carousel portrait image",
        )
        : undefined;

    if (!marketingImage && !squareImage) {
        throw new GoogleAdsCreationError(
            "Each carousel card requires a landscape or square marketing image.",
            400,
        );
    }

    // 3. Validate optional CTA

    const callToActionText = input.callToActionText?.trim();

    // 4. Validate mutation mode

    const validateOnly = resolveAssetValidateOnly(input);

    // 5. Prepare specialized card asset

    const cardConfiguration: Record<string, string> = {
        headline,
    };

    if (marketingImage) {
        cardConfiguration.marketingImageAsset = marketingImage;
    }

    if (squareImage) {
        cardConfiguration.squareMarketingImageAsset = squareImage;
    }

    if (portraitImage) {
        cardConfiguration.portraitMarketingImageAsset = portraitImage;
    }

    if (callToActionText) {
        cardConfiguration.callToActionText = callToActionText;
    }

    // 6. Create Demand Gen Carousel Card Asset

    const googleResponse = await googleAdsMutate(
        context,
        "assets:mutate",
        {
            operations: [
                {
                    create: {
                        name: createUniqueAssetName(headline),

                        demandGenCarouselCardAsset:
                            cardConfiguration,
                    },
                },
            ],
            validateOnly,
        },
    );

    const resourceName =
        googleResponse.results?.[0]?.resourceName ?? null;

    if (!validateOnly && !resourceName) {
        throw new GoogleAdsCreationError(
            "Google Ads did not return the Carousel Card Asset resource name.",
            502,
            googleResponse,
        );
    }

    return {
        resourceName,
        resourceId: resourceName?.split("/").at(-1) ?? null,
        validateOnly,
        googleResponse,
    };
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

export async function createGoogleAdsTextAsset(
    context: GoogleAdsCreationContext,
    input: CreateGoogleAdsTextAssetInput,
): Promise<GoogleAdsCreatedResource> {

    const text = input.text?.trim();
    const maxLength = GOOGLE_ADS_TEXT_LIMITS[input.fieldType];

    if (!maxLength || !text || text.length > maxLength) {
        throw new GoogleAdsCreationError(
            `Invalid ${input.fieldType} text. Maximum length is ${maxLength ?? "unsupported"}.`,
            400,
        );
    }

    const validateOnly = resolveAssetValidateOnly(input);

    const googleResponse = await googleAdsMutate(
        context,
        "assets:mutate",
        {
            operations: [
                {
                    create: {
                        name: createUniqueAssetName(
                            input.name || text,
                        ),
                        textAsset: { text },
                    },
                },
            ],
            validateOnly,
        },
    );

    const resourceName =
        googleResponse.results?.[0]?.resourceName ?? null;

    if (!validateOnly && !resourceName) {
        throw new GoogleAdsCreationError(
            "Google Ads did not return the Text Asset resource name.",
            502,
            googleResponse,
        );
    }

    return {
        resourceName,
        resourceId: resourceName?.split("/").at(-1) ?? null,
        validateOnly,
        googleResponse,
    };
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
// PERFORMANCE MAX ASSET GROUP CREATION
// ==========================================

export async function createGoogleAdsPerformanceMaxAssetGroup(
    context: GoogleAdsCreationContext,
    input: CreateGoogleAdsAssetGroupInput,
): Promise<GoogleAdsCreatedResource> {

    // 1. Validate Asset Group name

    const name = input.name?.trim();

    if (!name || name.length > 128) {
        throw new GoogleAdsCreationError(
            "Asset Group name must contain 1–128 characters.",
            400,
        );
    }

    // 2. Validate parent Campaign

    const campaignPrefix =
        `customers/${context.customerId}/campaigns/`;

    const campaignId =
        input.campaignResourceName?.startsWith(campaignPrefix)
            ? input.campaignResourceName.slice(campaignPrefix.length)
            : "";

    if (!/^\d+$/.test(campaignId)) {
        throw new GoogleAdsCreationError(
            "Invalid Performance Max Campaign resource name.",
            400,
        );
    }

    // 3. Validate final URLs

    if (
        !Array.isArray(input.finalUrls) ||
        input.finalUrls.length === 0
    ) {
        throw new GoogleAdsCreationError(
            "At least one final URL is required.",
            400,
        );
    }

    const finalUrls = input.finalUrls.map((value) => {
        let url: URL;

        try {
            url = new URL(value);
        } catch {
            throw new GoogleAdsCreationError(
                `Invalid final URL: ${value}`,
                400,
            );
        }

        if (!["http:", "https:"].includes(url.protocol)) {
            throw new GoogleAdsCreationError(
                "Final URLs must use HTTP or HTTPS.",
                400,
            );
        }

        return url.toString();
    });

    // 4. Validate asset list

    if (!Array.isArray(input.assets)) {
        throw new GoogleAdsCreationError(
            "Asset list is required.",
            400,
        );
    }

    const allowedTypes: PerformanceMaxAssetFieldType[] = [
        "HEADLINE",
        "LONG_HEADLINE",
        "DESCRIPTION",
        "MARKETING_IMAGE",
        "SQUARE_MARKETING_IMAGE",
        "BUSINESS_NAME",
        "LOGO",
        "YOUTUBE_VIDEO",
    ];

    const assetCounts: Record<string, number> = {};

    for (const asset of input.assets) {

        if (!allowedTypes.includes(asset.fieldType)) {
            throw new GoogleAdsCreationError(
                `Unsupported PMax asset field type: ${asset.fieldType}`,
                400,
            );
        }

        // Every Asset must belong to the selected account.

        const assetPrefix =
            `customers/${context.customerId}/assets/`;

        const assetId = asset.assetResourceName?.startsWith(assetPrefix)
            ? asset.assetResourceName.slice(assetPrefix.length)
            : "";

        if (!/^\d+$/.test(assetId)) {
            throw new GoogleAdsCreationError(
                "Invalid Asset resource name or account mismatch.",
                400,
            );
        }

        assetCounts[asset.fieldType] =
            (assetCounts[asset.fieldType] ?? 0) + 1;
    }

    // 5. Check mandatory PMax assets

    const requirements: Record<
        PerformanceMaxAssetFieldType,
        { min: number; max: number }
    > = {
        HEADLINE: { min: 3, max: 15 },
        LONG_HEADLINE: { min: 1, max: 5 },
        DESCRIPTION: { min: 2, max: 5 },
        MARKETING_IMAGE: { min: 1, max: 20 },
        SQUARE_MARKETING_IMAGE: { min: 1, max: 20 },
        BUSINESS_NAME: { min: 1, max: 1 },
        LOGO: { min: 1, max: 5 },
        YOUTUBE_VIDEO: { min: 0, max: 15 },
    };

    for (const [fieldType, requirement] of Object.entries(
        requirements,
    )) {
        const count = assetCounts[fieldType] ?? 0;

        if (
            count < requirement.min ||
            count > requirement.max
        ) {
            throw new GoogleAdsCreationError(
                `${fieldType} requires ${requirement.min}–${requirement.max} assets. Received ${count}.`,
                400,
            );
        }
    }

    // 6. Validate mutation mode

    const validateOnly = resolveAssetValidateOnly(input);

    // 7. Create a temporary Asset Group resource name

    const assetGroupResourceName =
        `customers/${context.customerId}/assetGroups/-1`;

    // 8. First operation: create the Asset Group

    const mutateOperations: Record<string, unknown>[] = [
        {
            assetGroupOperation: {
                create: {
                    resourceName: assetGroupResourceName,
                    name,
                    campaign: input.campaignResourceName,
                    finalUrls,
                    status: "PAUSED",
                },
            },
        },
    ];

    // 9. Add Asset Group Asset operations

    for (const asset of input.assets) {
        mutateOperations.push({
            assetGroupAssetOperation: {
                create: {
                    assetGroup: assetGroupResourceName,
                    asset: asset.assetResourceName,
                    fieldType: asset.fieldType,
                },
            },
        });
    }

    // 10. Submit everything in ONE atomic mutation request

    const googleResponse = await googleAdsMutate(
        context,
        "googleAds:mutate",
        {
            mutateOperations,
            partialFailure: false,
            validateOnly,
        },
    );

    // 11. Extract Asset Group resource name

    const responses =
        googleResponse["mutateOperationResponses"];

    const firstResponse =
        Array.isArray(responses) ? responses[0] : undefined;

    const assetGroupResult = isRecord(firstResponse)
        ? firstResponse["assetGroupResult"]
        : undefined;

    const resourceName =
        isRecord(assetGroupResult) &&
            typeof assetGroupResult["resourceName"] === "string"
            ? assetGroupResult["resourceName"]
            : null;

    if (!validateOnly && !resourceName) {
        throw new GoogleAdsCreationError(
            "Google Ads did not return the Asset Group resource name.",
            502,
            googleResponse,
        );
    }

    return {
        resourceName,
        resourceId: resourceName?.split("/").at(-1) ?? null,
        validateOnly,
        googleResponse,
    };
}
function createUniqueAssetName(
    inputName?: string,
): string {
    const cleanName = (inputName || "Google Ads Asset")
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9 _-]/g, "")
        .trim()
        .slice(0, 150);

    return `${cleanName || "Google Ads Asset"} ${randomUUID()}`;
}

export async function createGoogleAdsImageAsset(
    context: GoogleAdsCreationContext,
    input: CreateGoogleAdsImageAssetInput,
): Promise<GoogleAdsCreatedResource> {

    // 1. Validate image buffer

    if (!Buffer.isBuffer(input.buffer) || input.buffer.length === 0) {
        throw new GoogleAdsCreationError(
            "A valid image file is required.",
            400,
        );
    }

    // Keep the same 5 MB limit as the existing upload route.

    if (input.buffer.length > 5 * 1024 * 1024) {
        throw new GoogleAdsCreationError(
            "Image size must not exceed 5 MB.",
            400,
        );
    }

    // 2. Read actual image dimensions and format

    let dimensions: ReturnType<typeof imageSize>;

    try {
        dimensions = imageSize(input.buffer);
    } catch {
        throw new GoogleAdsCreationError(
            "The uploaded file is not a valid image.",
            400,
        );
    }

    const { width, height, type } = dimensions;

    if (
        !width ||
        !height ||
        !["jpg", "png"].includes(type ?? "")
    ) {
        throw new GoogleAdsCreationError(
            "Only valid JPG and PNG images are supported.",
            400,
        );
    }

    // 3. Determine Google Ads MIME type

    const mimeType =
        type === "jpg" ? "IMAGE_JPEG" : "IMAGE_PNG";

    // 4. Prepare asset name

    const assetName = createUniqueAssetName(
        input.name || input.originalName,
    );

    // 5. Validate mutation mode

    const validateOnly = resolveAssetValidateOnly(input);

    // 6. Create Google Ads Image Asset

    const googleResponse = await googleAdsMutate(
        context,
        "assets:mutate",
        {
            operations: [
                {
                    create: {
                        name: assetName,
                        imageAsset: {
                            data: input.buffer.toString("base64"),
                            fileSize: String(input.buffer.length),
                            mimeType,
                            fullSize: {
                                widthPixels: String(width),
                                heightPixels: String(height),
                            },
                        },
                    },
                },
            ],
            validateOnly,
        },
    );

    // 7. Extract resource name

    const resourceName =
        googleResponse.results?.[0]?.resourceName ?? null;

    if (!validateOnly && !resourceName) {
        throw new GoogleAdsCreationError(
            "Google Ads did not return the Image Asset resource name.",
            502,
            googleResponse,
        );
    }

    return {
        resourceName,
        resourceId: resourceName?.split("/").at(-1) ?? null,
        validateOnly,
        googleResponse,
    };
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

export async function createGoogleAdsYouTubeVideoAsset(
    context: GoogleAdsCreationContext,
    input: CreateGoogleAdsYouTubeVideoAssetInput,
): Promise<GoogleAdsCreatedResource> {

    // 1. Validate YouTube video ID

    if (!/^[A-Za-z0-9_-]{11}$/.test(input.videoId)) {
        throw new GoogleAdsCreationError(
            "Invalid YouTube video ID.",
            400,
        );
    }

    // 2. Validate video title

    const videoTitle = input.videoTitle.trim();

    if (!videoTitle || videoTitle.length > 100) {
        throw new GoogleAdsCreationError(
            "Video title must contain 1–100 characters.",
            400,
        );
    }

    // 3. Validate mutation mode

    const validateOnly = resolveAssetValidateOnly(input);

    // 4. Create YouTube Video Asset

    const googleResponse = await googleAdsMutate(
        context,
        "assets:mutate",
        {
            operations: [
                {
                    create: {
                        name: createUniqueAssetName(
                            input.name || videoTitle,
                        ),
                        youtubeVideoAsset: {
                            youtubeVideoId: input.videoId,
                            youtubeVideoTitle: videoTitle,
                        },
                    },
                },
            ],
            validateOnly,
        },
    );

    // 5. Extract resource name

    const resourceName =
        googleResponse.results?.[0]?.resourceName ?? null;

    if (!validateOnly && !resourceName) {
        throw new GoogleAdsCreationError(
            "Google Ads did not return the YouTube Video Asset resource name.",
            502,
            googleResponse,
        );
    }

    return {
        resourceName,
        resourceId: resourceName?.split("/").at(-1) ?? null,
        validateOnly,
        googleResponse,
    };
}

async function googleAdsMutate(
    context: GoogleAdsCreationContext,
    resource: string,
    body: Record<string, unknown>
): Promise<GoogleAdsMutateResponse> {

    const response = await fetch(
        `https://googleads.googleapis.com/${context.apiVersion}/customers/${context.customerId}/${resource}`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${context.accessToken}`,
                "Content-Type": "application/json",
                "developer-token": context.developerToken,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        }
    );

    const responseText = await response.text();

    let responseData: unknown = {};

    if (responseText) {
        try {
            responseData = JSON.parse(responseText);
        } catch {
            responseData = { rawResponse: responseText };
        }
    }

    if (!response.ok) {
        const errorObject = isRecord(responseData)
            ? responseData.error
            : undefined;

        const message =
            isRecord(errorObject) &&
                typeof errorObject.message === "string"
                ? errorObject.message
                : `Google Ads API failed: ${response.status}`;

        throw new GoogleAdsCreationError(
            message,
            response.status,
            responseData
        );
    }

    if (!isRecord(responseData)) {
        throw new GoogleAdsCreationError(
            "Unexpected response from Google Ads API.",
            502,
            responseData
        );
    }

    return responseData as GoogleAdsMutateResponse;
}

// ==========================================
// ASSET MUTATION VALIDATION
// ==========================================


export async function createGoogleAdsBudget(
    context: GoogleAdsCreationContext,
    input: CreateGoogleAdsBudgetInput
): Promise<GoogleAdsCreatedResource> {

    const name = input.name.trim();

    if (!name || name.length > 255) {
        throw new GoogleAdsCreationError(
            "A valid budget name is required.",
            400
        );
    }

    if (!Number.isFinite(input.amount) || input.amount <= 0) {
        throw new GoogleAdsCreationError(
            "Budget amount must be greater than zero.",
            400
        );
    }

    // Live creation requires explicit confirmation.
    const validateOnly = input.validateOnly !== false;

    if (!validateOnly && input.confirm !== true) {
        throw new GoogleAdsCreationError(
            'Live creation requires validateOnly:false and confirm:true.',
            400
        );
    }

    // Google Ads uses micros for monetary values.
    const amountMicrosNumber = Math.round(
        input.amount * 1_000_000
    );

    if (!Number.isSafeInteger(amountMicrosNumber)) {
        throw new GoogleAdsCreationError(
            "Budget amount is outside the supported range.",
            400
        );
    }

    const amountMicros = String(amountMicrosNumber);

    const googleResponse = await googleAdsMutate(
        context,
        "campaignBudgets:mutate",
        {
            operations: [
                {
                    create: {
                        name,
                        amountMicros,
                        deliveryMethod: "STANDARD",
                    },
                },
            ],
            validateOnly,
        }
    );

    const resourceName =
        googleResponse.results?.[0]?.resourceName ?? null;

    if (!validateOnly && !resourceName) {
        throw new GoogleAdsCreationError(
            "Budget creation succeeded without returning a resource name.",
            502,
            googleResponse
        );
    }

    return {
        resourceName,
        resourceId: resourceName?.split("/").at(-1) ?? null,
        validateOnly,
        googleResponse,
    };
}

// ==========================================
// GOOGLE ADS CAMPAIGN CREATION
// ==========================================

export async function createGoogleAdsCampaign(
    context: GoogleAdsCreationContext,
    input: CreateGoogleAdsCampaignInput,
): Promise<GoogleAdsCreatedResource> {

    // 1. Validate campaign name

    if (
        typeof input.campaignName !== "string" ||
        !input.campaignName.trim() ||
        input.campaignName.trim().length > 255
    ) {
        throw new GoogleAdsCreationError(
            "A valid campaign name is required.",
            400,
        );
    }

    const campaignName = input.campaignName.trim();

    // 2. Validate campaign type

    const campaignType = input.campaignType
        ?.trim()
        .toUpperCase() as GoogleAdsCampaignType;

    const setup = GOOGLE_ADS_CAMPAIGN_CONFIG[campaignType];

    if (!setup) {
        throw new GoogleAdsCreationError(
            `Unsupported Google Ads campaign type: ${input.campaignType}`,
            400,
        );
    }

    // 3. Validate budget resource name

    const budgetPrefix =
        `customers/${context.customerId}/campaignBudgets/`;

    const budgetResourceName = input.budgetResourceName;

    if (
        typeof budgetResourceName !== "string" ||
        !budgetResourceName.startsWith(budgetPrefix) ||
        !/^\d+$/.test(budgetResourceName.slice(budgetPrefix.length))
    ) {
        throw new GoogleAdsCreationError(
            "Invalid budget resource name for the selected Google Ads account.",
            400,
        );
    }

    // 4. Validate bidding strategy

    if (
        typeof input.biddingStrategy !== "string" ||
        !input.biddingStrategy.trim()
    ) {
        throw new GoogleAdsCreationError(
            "A bidding strategy is required.",
            400,
        );
    }

    const biddingStrategy = input.biddingStrategy
        .trim()
        .toUpperCase();

    if (!setup.biddingStrategies.includes(biddingStrategy)) {
        throw new GoogleAdsCreationError(
            `${biddingStrategy} is not supported for ${campaignType} campaigns.`,
            400,
        );
    }

    // 5. Generate provider-specific bidding configuration

    const biddingConfig = buildBiddingConfig(
        biddingStrategy,
        input.biddingOptions ?? {},
        campaignType,
    );

    // 6. Validate mutation mode

    const validateOnly = input.validateOnly !== false;

    if (!validateOnly && input.confirm !== true) {
        throw new GoogleAdsCreationError(
            'Live campaign creation requires validateOnly:false and confirm:true.',
            400,
        );
    }

    // 7. Build Google Ads campaign request

    const campaignPayload = {
        name: campaignName,

        advertisingChannelType:
            setup.apiChannelType,

        status: "PAUSED",

        campaignBudget: budgetResourceName,

        containsEuPoliticalAdvertising:
            "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
        brandGuidelinesEnabled:
            campaignType === "PERFORMANCE_MAX" ? false : undefined,
        ...biddingConfig,

    };

    // 8. Create campaign through shared API helper

    const googleResponse = await googleAdsMutate(
        context,
        "campaigns:mutate",
        {
            operations: [
                {
                    create: campaignPayload,
                },
            ],
            validateOnly,
        },
    );

    const resourceName =
        googleResponse.results?.[0]?.resourceName ?? null;

    if (!validateOnly && !resourceName) {
        throw new GoogleAdsCreationError(
            "Google Ads did not return the created campaign resource name.",
            502,
            googleResponse,
        );
    }

    // 9. Return campaign resource details

    return {
        resourceName,
        resourceId: resourceName?.split("/").at(-1) ?? null,
        validateOnly,
        googleResponse,
    };
}

// ==========================================
// KEYWORD INPUT VALIDATION
// ==========================================

function validateGoogleAdsKeywords(
    keywords: GoogleAdsKeywordInput[],
): GoogleAdsKeywordInput[] {

    if (
        !Array.isArray(keywords) ||
        keywords.length === 0 ||
        keywords.length > 1000
    ) {
        throw new GoogleAdsCreationError(
            "Provide between 1 and 1000 keywords per request.",
            400,
        );
    }

    const seen = new Set<string>();

    return keywords.map((keyword) => {

        const text = keyword?.text?.trim();

        if (
            !text ||
            text.length > 80 ||
            text.split(/\s+/).length > 10 ||
            /[\0\r\n]/.test(text)
        ) {
            throw new GoogleAdsCreationError(
                "Keyword text must contain at most 80 characters and 10 words.",
                400,
            );
        }

        if (
            !["BROAD", "PHRASE", "EXACT"].includes(
                keyword.matchType,
            )
        ) {
            throw new GoogleAdsCreationError(
                `Unsupported keyword match type for "${text}".`,
                400,
            );
        }

        const status = keyword.status ?? "ENABLED";

        if (!["ENABLED", "PAUSED"].includes(status)) {
            throw new GoogleAdsCreationError(
                `Invalid keyword status for "${text}".`,
                400,
            );
        }

        const identity =
            `${text.toLowerCase()}:${keyword.matchType}`;

        if (seen.has(identity)) {
            throw new GoogleAdsCreationError(
                `Duplicate keyword "${text}" with match type ${keyword.matchType}.`,
                400,
            );
        }

        seen.add(identity);

        return {
            text,
            matchType: keyword.matchType,
            status,
        };
    });
}
// ==========================================
// SHARED AD GROUP KEYWORD MUTATION
// ==========================================

async function mutateGoogleAdsAdGroupKeywords(
    context: GoogleAdsCreationContext,
    input: CreateGoogleAdsKeywordCriteriaInput,
    negative: boolean,
): Promise<GoogleAdsKeywordCreationResult> {

    // 1. Validate Ad Group resource name

    const prefix =
        `customers/${context.customerId}/adGroups/`;

    const adGroupId =
        input.adGroupResourceName?.startsWith(prefix)
            ? input.adGroupResourceName.slice(prefix.length)
            : "";

    if (!/^\d+$/.test(adGroupId)) {
        throw new GoogleAdsCreationError(
            "Invalid Ad Group resource name or account mismatch.",
            400,
        );
    }

    // 2. Validate keywords

    const keywords = validateGoogleAdsKeywords(
        input.keywords,
    );

    // 3. Validate mutation mode

    const validateOnly = resolveAssetValidateOnly(input);

    // 4. Build keyword operations

    const operations = keywords.map((keyword) => ({
        create: {
            adGroup: input.adGroupResourceName,
            status: keyword.status,
            negative,

            keyword: {
                text: keyword.text,
                matchType: keyword.matchType,
            },
        },
    }));

    // 5. Send request to Google Ads

    const googleResponse = await googleAdsMutate(
        context,
        "adGroupCriteria:mutate",
        {
            operations,
            partialFailure: false,
            validateOnly,
        },
    );

    // 6. Extract all created resources

    const resourceNames = (
        googleResponse.results ?? []
    ).map((result) => result.resourceName)
        .filter((value): value is string => Boolean(value));

    if (!validateOnly && resourceNames.length !== keywords.length) {
        throw new GoogleAdsCreationError(
            "Google Ads did not return all expected keyword resources.",
            502,
            googleResponse,
        );
    }

    return {
        resourceNames,
        resourceIds: resourceNames.map(
            (resourceName) => resourceName.split("/").at(-1) ?? "",
        ),
        validateOnly,
        googleResponse,
    };
}

// ==========================================
// CREATE POSITIVE KEYWORDS
// ==========================================

export async function createGoogleAdsPositiveKeywords(
    context: GoogleAdsCreationContext,
    input: CreateGoogleAdsKeywordCriteriaInput,
): Promise<GoogleAdsKeywordCreationResult> {

    return mutateGoogleAdsAdGroupKeywords(
        context,
        input,
        false,
    );
}

// ==========================================
// CREATE AD GROUP NEGATIVE KEYWORDS
// ==========================================

export async function createGoogleAdsNegativeKeywords(
    context: GoogleAdsCreationContext,
    input: CreateGoogleAdsKeywordCriteriaInput,
): Promise<GoogleAdsKeywordCreationResult> {

    return mutateGoogleAdsAdGroupKeywords(
        context,
        input,
        true,
    );
}

// ==========================================
// CREATE CAMPAIGN-LEVEL NEGATIVE KEYWORDS
// ==========================================

export async function createGoogleAdsCampaignNegativeKeywords(
    context: GoogleAdsCreationContext,
    input: CreateGoogleAdsCampaignNegativeKeywordsInput,
): Promise<GoogleAdsKeywordCreationResult> {

    // 1. Validate Campaign resource name

    const prefix =
        `customers/${context.customerId}/campaigns/`;

    const campaignId =
        input.campaignResourceName?.startsWith(prefix)
            ? input.campaignResourceName.slice(prefix.length)
            : "";

    if (!/^\d+$/.test(campaignId)) {
        throw new GoogleAdsCreationError(
            "Invalid Campaign resource name or account mismatch.",
            400,
        );
    }

    // 2. Validate keywords

    const keywords = validateGoogleAdsKeywords(
        input.keywords,
    );

    // 3. Validate mutation mode

    const validateOnly = resolveAssetValidateOnly(input);

    // 4. Build campaign exclusion operations

    const operations = keywords.map((keyword) => ({
        create: {
            campaign: input.campaignResourceName,
            negative: true,

            keyword: {
                text: keyword.text,
                matchType: keyword.matchType,
            },
        },
    }));

    // 5. Send request

    const googleResponse = await googleAdsMutate(
        context,
        "campaignCriteria:mutate",
        {
            operations,
            partialFailure: false,
            validateOnly,
        },
    );

    // 6. Extract resources

    const resourceNames = (
        googleResponse.results ?? []
    ).map((result) => result.resourceName)
        .filter((value): value is string => Boolean(value));

    if (!validateOnly && resourceNames.length !== keywords.length) {
        throw new GoogleAdsCreationError(
            "Google Ads did not return all expected campaign negative keyword resources.",
            502,
            googleResponse,
        );
    }

    return {
        resourceNames,
        resourceIds: resourceNames.map(
            (resourceName) => resourceName.split("/").at(-1) ?? "",
        ),
        validateOnly,
        googleResponse,
    };
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

// ==========================================
// CREATE GOOGLE ADS CAMPAIGN LOCATION TARGETS
// ==========================================

export async function createGoogleAdsCampaignLocationTargets(
    context: GoogleAdsCreationContext,
    input: CreateGoogleAdsCampaignLocationTargetsInput,
) {

    // 1. Validate Campaign resource name

    const campaignPrefix =
        `customers/${context.customerId}/campaigns/`;

    const campaignId =
        input.campaignResourceName?.startsWith(campaignPrefix)
            ? input.campaignResourceName.slice(campaignPrefix.length)
            : "";

    if (!/^\d+$/.test(campaignId)) {
        throw new GoogleAdsCreationError(
            "Invalid Campaign resource name.",
            400,
        );
    }

    // 2. Validate location list

    if (
        !Array.isArray(input.locations) ||
        input.locations.length === 0 ||
        input.locations.length > 1000
    ) {
        throw new GoogleAdsCreationError(
            "Provide between 1 and 1000 location targets.",
            400,
        );
    }

    // 3. Normalize and validate location resources

    const seen = new Set<string>();

    const operations = input.locations.map((location) => {

        const resourceName =
            location.geoTargetConstantResourceName?.trim();

        if (
            !/^geoTargetConstants\/\d+$/.test(resourceName)
        ) {
            throw new GoogleAdsCreationError(
                `Invalid Geo Target Constant resource name: ${resourceName}`,
                400,
            );
        }

        const negative = location.negative === true;

        const identity = `${resourceName}:${negative}`;

        if (seen.has(identity)) {
            throw new GoogleAdsCreationError(
                `Duplicate location target: ${resourceName}`,
                400,
            );
        }

        seen.add(identity);

        return {
            create: {
                campaign: input.campaignResourceName,
                negative,
                location: {
                    geoTargetConstant: resourceName,
                },
            },
        };
    });

    // 4. Validate mutation mode

    const validateOnly = resolveAssetValidateOnly(input);

    // 5. Create Campaign Criteria

    const googleResponse = await googleAdsMutate(
        context,
        "campaignCriteria:mutate",
        {
            operations,
            partialFailure: false,
            validateOnly,
        },
    );

    return {
        resourceNames: (
            googleResponse.results ?? []
        ).map((result) => result.resourceName)
            .filter((value): value is string => Boolean(value)),

        validateOnly,
        googleResponse,
    };
}
// ==========================================
// GOOGLE ADS BULK MUTATION TYPES
// ==========================================

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
// GOOGLE ADS BULK MUTATION
// ==========================================

export async function googleAdsBulkMutate(
    context: GoogleAdsCreationContext,
    input: {
        operations: GoogleAdsMutateOperation[];
        validateOnly?: boolean;
        confirm?: boolean;
    },
): Promise<GoogleAdsBulkMutateResponse> {

    // 1. Validate operations

    if (
        !Array.isArray(input.operations) ||
        input.operations.length === 0
    ) {
        throw new GoogleAdsCreationError(
            "At least one Google Ads mutation operation is required.",
            400,
        );
    }

    // Google Ads bulk mutation limit.
    if (input.operations.length > 10_000) {
        throw new GoogleAdsCreationError(
            "Google Ads bulk mutation cannot exceed 10,000 operations.",
            400,
        );
    }

    // 2. Validation-only by default

    const validateOnly = input.validateOnly !== false;

    if (!validateOnly && input.confirm !== true) {
        throw new GoogleAdsCreationError(
            "Live bulk mutation requires validateOnly:false and confirm:true.",
            400,
        );
    }

    // 3. Submit all supported resource operations

    const googleResponse = await googleAdsMutate(
        context,
        "googleAds:mutate",
        {
            mutateOperations: input.operations,

            // Keep false for operations that depend on
            // temporary resource names.
            partialFailure: false,

            validateOnly,
        },
    );

    // 4. Verify the live mutation response

    const operationResponses =
        googleResponse["mutateOperationResponses"];

    if (
        !validateOnly &&
        (
            !Array.isArray(operationResponses) ||
            operationResponses.length !== input.operations.length
        )
    ) {
        throw new GoogleAdsCreationError(
            "Google Ads returned an incomplete bulk mutation response.",
            502,
            googleResponse,
        );
    }

    return googleResponse as GoogleAdsBulkMutateResponse;
}

// ==========================================
// TEMPORARY RESOURCE NAME GENERATOR
// ==========================================

export function createGoogleAdsTemporaryResourceName(
    context: GoogleAdsCreationContext,
    resourceCollection: string,
    temporaryId: number,
): string {

    if (
        !Number.isInteger(temporaryId) ||
        temporaryId >= 0
    ) {
        throw new GoogleAdsCreationError(
            "Temporary resource ID must be a negative integer.",
            400,
        );
    }

    if (!/^[a-zA-Z]+$/.test(resourceCollection)) {
        throw new GoogleAdsCreationError(
            "Invalid Google Ads resource collection.",
            400,
        );
    }

    return (
        `customers/${context.customerId}/` +
        `${resourceCollection}/${temporaryId}`
    );
}
// ==========================================
// BULK MUTATION RESOURCE NAME EXTRACTION
// ==========================================

export function getGoogleAdsBulkMutationResourceName(
    response: GoogleAdsBulkMutateResponse,
    operationIndex: number,
): string | null {

    const operationResponse =
        response.mutateOperationResponses?.[operationIndex];

    if (!operationResponse) {
        return null;
    }

    for (const [key, value] of Object.entries(operationResponse)) {

        if (
            key.endsWith("Result") &&
            isRecord(value) &&
            typeof value["resourceName"] === "string"
        ) {
            return value["resourceName"];
        }
    }

    return null;
}
// ==========================================
// BUILD GOOGLE ADS BUDGET OPERATION
// ==========================================

export function buildGoogleAdsBudgetOperation(
    context: GoogleAdsCreationContext,
    input: {
        name: string;
        amount: number;
    },
    temporaryId: number,
): GoogleAdsBuiltOperation {

    // 1. Validate budget name

    const name = input.name?.trim();

    if (!name || name.length > 255) {
        throw new GoogleAdsCreationError(
            "A valid budget name is required.",
            400,
        );
    }

    // 2. Validate budget amount

    if (
        !Number.isFinite(input.amount) ||
        input.amount <= 0
    ) {
        throw new GoogleAdsCreationError(
            "Budget amount must be greater than zero.",
            400,
        );
    }

    const amountMicrosNumber = Math.round(
        input.amount * 1_000_000,
    );

    if (
        !Number.isSafeInteger(amountMicrosNumber) ||
        amountMicrosNumber <= 0
    ) {
        throw new GoogleAdsCreationError(
            "Budget amount is outside the supported range.",
            400,
        );
    }

    // 3. Generate temporary budget resource name

    const resourceName =
        createGoogleAdsTemporaryResourceName(
            context,
            "campaignBudgets",
            temporaryId,
        );

    // 4. Build the Google Ads operation

    const operation: GoogleAdsMutateOperation = {
        campaignBudgetOperation: {
            create: {
                resourceName,
                name,
                amountMicros: String(amountMicrosNumber),
                deliveryMethod: "STANDARD",
            },
        },
    };

    return {
        operation,
        resourceName,
    };
}
// ==========================================
// GOOGLE ADS AD GROUP CREATION
// ==========================================

export async function createGoogleAdsAdGroup(
    context: GoogleAdsCreationContext,
    input: CreateGoogleAdsAdGroupInput,
): Promise<GoogleAdsCreatedResource> {

    // 1. Validate Ad Group name

    const name = input.name?.trim();

    if (
        !name ||
        [...name].length >= 255 ||
        /[\0\r\n]/.test(name)
    ) {
        throw new GoogleAdsCreationError(
            "Provide a valid Ad Group name.",
            400,
        );
    }

    // 2. Validate campaign type

    const campaignType = input.campaignType;

    if (
        ![
            "SEARCH",
            "DISPLAY",
            "SHOPPING",
            "DEMAND_GEN",
        ].includes(campaignType)
    ) {
        throw new GoogleAdsCreationError(
            `${campaignType} does not use this Ad Group creation flow.`,
            400,
        );
    }

    // 3. Validate parent Campaign resource name

    const campaignPrefix =
        `customers/${context.customerId}/campaigns/`;

    const campaignId =
        input.campaignResourceName?.startsWith(campaignPrefix)
            ? input.campaignResourceName.slice(campaignPrefix.length)
            : "";

    if (!/^\d+$/.test(campaignId)) {
        throw new GoogleAdsCreationError(
            "Invalid Campaign resource name or account mismatch.",
            400,
        );
    }

    // 4. Prepare Ad Group configuration

    const adGroupPayload: Record<string, unknown> = {
        name,
        campaign: input.campaignResourceName,
        status: "PAUSED",
    };

    const adGroupType =
        GOOGLE_AD_GROUP_TYPES[campaignType];

    // Demand Gen requires no explicit Ad Group type.
    if (adGroupType) {
        adGroupPayload.type = adGroupType;
    }

    // 5. Validate mutation mode

    const validateOnly = input.validateOnly !== false;

    if (!validateOnly && input.confirm !== true) {
        throw new GoogleAdsCreationError(
            "Live Ad Group creation requires explicit confirmation.",
            400,
        );
    }

    // 6. Call Google Ads API

    const googleResponse = await googleAdsMutate(
        context,
        "adGroups:mutate",
        {
            operations: [
                {
                    create: adGroupPayload,
                },
            ],
            validateOnly,
        },
    );

    // 7. Extract created resource

    const resourceName =
        googleResponse.results?.[0]?.resourceName ?? null;

    if (!validateOnly && !resourceName) {
        throw new GoogleAdsCreationError(
            "Google Ads did not return the Ad Group resource name.",
            502,
            googleResponse,
        );
    }

    return {
        resourceName,
        resourceId: resourceName?.split("/").at(-1) ?? null,
        validateOnly,
        googleResponse,
    };
}

// ==========================================
// GOOGLE ADS RESPONSIVE SEARCH AD CREATION
// ==========================================

export async function createGoogleAdsResponsiveSearchAd(
    context: GoogleAdsCreationContext,
    input: CreateGoogleAdsResponsiveSearchAdInput,
): Promise<GoogleAdsCreatedResource> {

    // 1. Validate Ad Group resource name

    const adGroupPrefix =
        `customers/${context.customerId}/adGroups/`;

    const adGroupId =
        input.adGroupResourceName?.startsWith(adGroupPrefix)
            ? input.adGroupResourceName.slice(adGroupPrefix.length)
            : "";

    if (!/^\d+$/.test(adGroupId)) {
        throw new GoogleAdsCreationError(
            "Invalid Ad Group resource name or account mismatch.",
            400,
        );
    }

    // 2. Validate headlines

    if (
        !Array.isArray(input.headlines) ||
        input.headlines.length < 3 ||
        input.headlines.length > 15 ||
        !input.headlines.every(
            (item) =>
                typeof item === "string" &&
                item.trim().length > 0 &&
                item.trim().length <= 30
        )
    ) {
        throw new GoogleAdsCreationError(
            "Provide 3–15 headlines, each containing 1–30 characters.",
            400,
        );
    }

    const headlines = input.headlines.map(
        (item) => item.trim()
    );

    if (
        new Set(headlines.map((item) => item.toLowerCase())).size !==
        headlines.length
    ) {
        throw new GoogleAdsCreationError(
            "Headlines must be unique.",
            400,
        );
    }

    // 3. Validate descriptions

    if (
        !Array.isArray(input.descriptions) ||
        input.descriptions.length < 2 ||
        input.descriptions.length > 4 ||
        !input.descriptions.every(
            (item) =>
                typeof item === "string" &&
                item.trim().length > 0 &&
                item.trim().length <= 90
        )
    ) {
        throw new GoogleAdsCreationError(
            "Provide 2–4 descriptions, each containing 1–90 characters.",
            400,
        );
    }

    const descriptions = input.descriptions.map(
        (item) => item.trim()
    );

    if (
        new Set(
            descriptions.map((item) => item.toLowerCase())
        ).size !== descriptions.length
    ) {
        throw new GoogleAdsCreationError(
            "Descriptions must be unique.",
            400,
        );
    }

    // 4. Validate final URL

    let parsedUrl: URL;

    try {
        parsedUrl = new URL(input.finalUrl.trim());
    } catch {
        throw new GoogleAdsCreationError(
            "Provide a valid final URL.",
            400,
        );
    }

    if (
        !["http:", "https:"].includes(parsedUrl.protocol) ||
        !parsedUrl.hostname
    ) {
        throw new GoogleAdsCreationError(
            "Final URL must use HTTP or HTTPS.",
            400,
        );
    }

    // 5. Validate optional display paths

    for (const [field, value] of [
        ["path1", input.path1],
        ["path2", input.path2],
    ] as const) {
        if (
            value !== undefined &&
            (
                typeof value !== "string" ||
                !value.trim() ||
                value.trim().length > 15
            )
        ) {
            throw new GoogleAdsCreationError(
                `${field} must contain 1–15 characters.`,
                400,
            );
        }
    }

    if (input.path2 && !input.path1) {
        throw new GoogleAdsCreationError(
            "path1 is required when path2 is provided.",
            400,
        );
    }

    // 6. Validate mutation mode

    const validateOnly = input.validateOnly !== false;

    if (!validateOnly && input.confirm !== true) {
        throw new GoogleAdsCreationError(
            "Live Ad creation requires validateOnly:false and confirm:true.",
            400,
        );
    }

    // 7. Prepare Responsive Search Ad

    const responsiveSearchAd: Record<string, unknown> = {
        headlines: headlines.map((text) => ({ text })),
        descriptions: descriptions.map((text) => ({ text })),
    };

    if (input.path1) {
        responsiveSearchAd.path1 = input.path1.trim();
    }

    if (input.path2) {
        responsiveSearchAd.path2 = input.path2.trim();
    }

    // 8. Create Ad Group Ad

    const googleResponse = await googleAdsMutate(
        context,
        "adGroupAds:mutate",
        {
            operations: [
                {
                    create: {
                        adGroup: input.adGroupResourceName,
                        status: "PAUSED",
                        ad: {
                            finalUrls: [parsedUrl.toString()],
                            responsiveSearchAd,
                        },
                    },
                },
            ],
            validateOnly,
        },
    );

    // 9. Extract created resource

    const resourceName =
        googleResponse.results?.[0]?.resourceName ?? null;

    if (!validateOnly && !resourceName) {
        throw new GoogleAdsCreationError(
            "Google Ads did not return the Ad Group Ad resource name.",
            502,
            googleResponse,
        );
    }

    const resourceKey =
        resourceName?.split("/").at(-1) ?? null;

    // Google AdGroupAd resource format:
    // customers/{customerId}/adGroupAds/{adGroupId}~{adId}

    const resourceId =
        resourceKey?.split("~").at(-1) ?? null;

    // 10. Return created resource

    return {
        resourceName,
        resourceId,
        validateOnly,
        googleResponse,
    };
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
// GOOGLE ADS RESPONSIVE DISPLAY AD CREATION
// ==========================================

export async function createGoogleAdsResponsiveDisplayAd(
    context: GoogleAdsCreationContext,
    input: CreateGoogleAdsResponsiveDisplayAdInput,
): Promise<GoogleAdsCreatedResource> {

    // 1. Validate Ad Group resource name

    const adGroupPrefix =
        `customers/${context.customerId}/adGroups/`;

    const adGroupId =
        input.adGroupResourceName?.startsWith(adGroupPrefix)
            ? input.adGroupResourceName.slice(adGroupPrefix.length)
            : "";

    if (!/^\d+$/.test(adGroupId)) {
        throw new GoogleAdsCreationError(
            "Invalid Display Ad Group resource name.",
            400,
        );
    }

    // 2. Validate final URLs

    if (
        !Array.isArray(input.finalUrls) ||
        input.finalUrls.length === 0
    ) {
        throw new GoogleAdsCreationError(
            "At least one final URL is required.",
            400,
        );
    }

    const finalUrls = input.finalUrls.map((value) => {
        try {
            const url = new URL(value);

            if (!["http:", "https:"].includes(url.protocol)) {
                throw new Error();
            }

            return url.toString();
        } catch {
            throw new GoogleAdsCreationError(
                `Invalid final URL: ${value}`,
                400,
            );
        }
    });

    // 3. Validate image assets

    const validateImageAssets = (
        resources: string[],
        fieldName: string,
    ): string[] => {

        if (
            !Array.isArray(resources) ||
            resources.length === 0
        ) {
            throw new GoogleAdsCreationError(
                `${fieldName} requires at least one image asset.`,
                400,
            );
        }

        return resources.map((resourceName) => {
            const prefix =
                `customers/${context.customerId}/assets/`;

            const assetId = resourceName?.startsWith(prefix)
                ? resourceName.slice(prefix.length)
                : "";

            if (!/^\d+$/.test(assetId)) {
                throw new GoogleAdsCreationError(
                    `Invalid ${fieldName} resource name or account mismatch.`,
                    400,
                );
            }

            return resourceName;
        });
    };

    const marketingImages = validateImageAssets(
        input.marketingImageAssetResourceNames,
        "Marketing images",
    );

    const squareMarketingImages = validateImageAssets(
        input.squareMarketingImageAssetResourceNames,
        "Square marketing images",
    );

    if (
        marketingImages.length +
        squareMarketingImages.length > 15
    ) {
        throw new GoogleAdsCreationError(
            "A Responsive Display Ad supports at most 15 combined marketing images.",
            400,
        );
    }

    // 4. Validate headlines

    if (
        !Array.isArray(input.headlines) ||
        input.headlines.length < 1 ||
        input.headlines.length > 5 ||
        !input.headlines.every(
            (value) =>
                typeof value === "string" &&
                value.trim().length > 0 &&
                value.trim().length <= 30
        )
    ) {
        throw new GoogleAdsCreationError(
            "Provide 1–5 headlines, each containing 1–30 characters.",
            400,
        );
    }

    // 5. Validate long headline

    const longHeadline = input.longHeadline?.trim();

    if (
        !longHeadline ||
        longHeadline.length > 90
    ) {
        throw new GoogleAdsCreationError(
            "Long headline is required and must not exceed 90 characters.",
            400,
        );
    }

    // 6. Validate descriptions

    if (
        !Array.isArray(input.descriptions) ||
        input.descriptions.length < 1 ||
        input.descriptions.length > 5 ||
        !input.descriptions.every(
            (value) =>
                typeof value === "string" &&
                value.trim().length > 0 &&
                value.trim().length <= 90
        )
    ) {
        throw new GoogleAdsCreationError(
            "Provide 1–5 descriptions, each containing 1–90 characters.",
            400,
        );
    }

    // 7. Validate business name

    const businessName = input.businessName?.trim();

    if (!businessName || businessName.length > 25) {
        throw new GoogleAdsCreationError(
            "Business name is required and must not exceed 25 characters.",
            400,
        );
    }

    // 8. Validate optional logo assets

    const logoImages =
        input.logoAssetResourceNames ?? [];

    const squareLogoImages =
        input.squareLogoAssetResourceNames ?? [];

    for (const resourceName of [
        ...logoImages,
        ...squareLogoImages,
    ]) {
        const prefix =
            `customers/${context.customerId}/assets/`;

        const assetId = resourceName?.startsWith(prefix)
            ? resourceName.slice(prefix.length)
            : "";

        if (!/^\d+$/.test(assetId)) {
            throw new GoogleAdsCreationError(
                "Invalid logo asset resource name or account mismatch.",
                400,
            );
        }
    }

    if (
        logoImages.length > 5 ||
        squareLogoImages.length > 5
    ) {
        throw new GoogleAdsCreationError(
            "At most 5 logo assets of each type can be provided.",
            400,
        );
    }

    // 9. Validate mutation mode

    const validateOnly = resolveAssetValidateOnly(input);

    // 10. Prepare Responsive Display Ad

    const responsiveDisplayAd: Record<string, unknown> = {
        marketingImages: marketingImages.map((asset) => ({
            asset,
        })),

        squareMarketingImages: squareMarketingImages.map((asset) => ({
            asset,
        })),

        headlines: input.headlines.map((text) => ({
            text: text.trim(),
        })),

        longHeadline: {
            text: longHeadline,
        },

        descriptions: input.descriptions.map((text) => ({
            text: text.trim(),
        })),

        businessName,
    };

    if (logoImages.length > 0) {
        responsiveDisplayAd.logoImages =
            logoImages.map((asset) => ({ asset }));
    }

    if (squareLogoImages.length > 0) {
        responsiveDisplayAd.squareLogoImages =
            squareLogoImages.map((asset) => ({ asset }));
    }

    // 11. Create Ad Group Ad

    const googleResponse = await googleAdsMutate(
        context,
        "adGroupAds:mutate",
        {
            operations: [
                {
                    create: {
                        adGroup: input.adGroupResourceName,
                        status: "PAUSED",
                        ad: {
                            finalUrls,
                            responsiveDisplayAd,
                        },
                    },
                },
            ],
            validateOnly,
        },
    );

    // 12. Extract created resource

    const resourceName =
        googleResponse.results?.[0]?.resourceName ?? null;

    if (!validateOnly && !resourceName) {
        throw new GoogleAdsCreationError(
            "Google Ads did not return the Responsive Display Ad resource name.",
            502,
            googleResponse,
        );
    }

    return {
        resourceName,
        resourceId: resourceName?.split("/").at(-1) ?? null,
        validateOnly,
        googleResponse,
    };
}


