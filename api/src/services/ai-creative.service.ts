
import axios from "axios";
import { randomUUID } from "node:crypto";

import {
    CREATIVE_ASPECT_RATIOS,
    CREATIVE_KINDS,
    CREATIVE_PLATFORMS,
    GOOGLE_CAMPAIGN_TYPES,
    GOOGLE_DEMAND_GEN_FORMATS,
    ALLOWED_CALL_TO_ACTIONS,
    GROQ_BASE_URL,
    GROQ_REQUEST_TIMEOUT,
    GROQ_TEXT_MODEL,
    IMAGE_PROVIDER,
    IMAGE_REQUEST_DELAY,
    IMAGE_REQUEST_TIMEOUT,
    MAX_IMAGE_BYTES,
    POLLINATIONS_API_KEY,
    POLLINATIONS_BASE_URL,
    POLLINATIONS_MODEL,
    POLLINATIONS_NOLOGO,
} from "../types/ai-creative.types.js";


import type {
    CreativeAspectRatio,
    CreativeGenerationError,
    CreativeKind,
    GenerateCreativeBody,
    GeneratedMedia,
    GeneratedVariation,
    GoogleCampaignType,
    GoogleCreativePack,
    GoogleDemandGenFormat,
    MetaCreativePack,
    AllowedCallToAction,
    CreativeGenerationResult,
    GeneratedCopy,
    ImageDimensions,

    // Campaign-aware generation
    CreativeAssetGenerationRequest,
    CreativeAssetGenerationError,
    CreativeGenerationTarget,
    GeneratedCreativeAsset,
    CreativeAssetRole,
    CreativePlatform,
    GeneratedCapabilityCopy,
    GeneratedCapabilityCopyText,
    CreativeInstructionSummary,
} from "../types/ai-creative.types.js";
import {
    resolveAiCreativeInstructionBundle,
    type ResolvedAiCreativeInstructionBundle,
} from "./ai-creative-instruction.service.js";
/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Configuration validation                                                   */
/* -------------------------------------------------------------------------- */

function requireGroqKey(): string {
    const key = process.env.GROQ_API_KEY?.trim();

    if (!key) {
        throw new Error(
            "GROQ_API_KEY is not configured. Add it to your backend .env file.",
        );
    }

    return key;
}

function requirePollinationsKey(): string {
    const key = POLLINATIONS_API_KEY?.trim();

    if (!key) {
        throw new Error(
            "POLLINATIONS_API_KEY is missing from environment variables.",
        );
    }

    return key;
}

function isAllowedValue<T extends readonly string[]>(
    allowed: T,
    value: unknown,
): value is T[number] {
    return (
        typeof value === "string" &&
        allowed.includes(value as T[number])
    );
}

/* -------------------------------------------------------------------------- */
/* Backend campaign asset-generation allowlist                               */
/* -------------------------------------------------------------------------- */

interface BackendAssetRequirement {
    role: CreativeAssetRole;
    allowedAspectRatios: readonly CreativeAspectRatio[];
    minCount: number;
    maxCount: number;
}

interface BackendCampaignCapability {
    platform: CreativePlatform;
    campaignType: string;
    adFormat: string;
    requirements: Record<string, BackendAssetRequirement>;
}

/**
 * This is an AI-generation allowlist, not permission to publish campaigns.
 * Campaign creation still has its own provider validation and execution rules.
 */
const BACKEND_CAMPAIGN_CREATIVE_CAPABILITIES: Record<
    string,
    BackendCampaignCapability
> = {
    "google-search-responsive-search": {
        platform: "googleAds",
        campaignType: "SEARCH",
        adFormat: "RESPONSIVE_SEARCH",
        requirements: {},
    },

    "google-display-responsive-display": {
        platform: "googleAds",
        campaignType: "DISPLAY",
        adFormat: "RESPONSIVE_DISPLAY",
        requirements: {
            "google-display-landscape-images": {
                role: "LANDSCAPE_IMAGE",
                allowedAspectRatios: ["1.91:1"],
                minCount: 1,
                maxCount: 15,
            },
            "google-display-square-images": {
                role: "SQUARE_IMAGE",
                allowedAspectRatios: ["1:1"],
                minCount: 1,
                maxCount: 15,
            },
        },
    },

    "google-performance-max-asset-group": {
        platform: "googleAds",
        campaignType: "PERFORMANCE_MAX",
        adFormat: "ASSET_GROUP",
        requirements: {
            "google-pmax-landscape-images": {
                role: "LANDSCAPE_IMAGE",
                allowedAspectRatios: ["1.91:1"],
                minCount: 1,
                maxCount: 20,
            },
            "google-pmax-square-images": {
                role: "SQUARE_IMAGE",
                allowedAspectRatios: ["1:1"],
                minCount: 1,
                maxCount: 20,
            },
            "google-pmax-portrait-images": {
                role: "PORTRAIT_IMAGE",
                allowedAspectRatios: ["4:5"],
                minCount: 0,
                maxCount: 20,
            },
            "google-pmax-square-logo": {
                role: "SQUARE_LOGO",
                allowedAspectRatios: ["1:1"],
                minCount: 0,
                maxCount: 1,
            },
            "google-pmax-landscape-logo": {
                role: "LANDSCAPE_LOGO",
                allowedAspectRatios: ["4:1"],
                minCount: 0,
                maxCount: 1,
            },
        },
    },

    "google-demand-gen-single-image": {
        platform: "googleAds",
        campaignType: "DEMAND_GEN",
        adFormat: "SINGLE_IMAGE",
        requirements: {
            "google-demand-gen-landscape-images": {
                role: "LANDSCAPE_IMAGE",
                allowedAspectRatios: ["1.91:1"],
                minCount: 1,
                maxCount: 20,
            },
            "google-demand-gen-square-images": {
                role: "SQUARE_IMAGE",
                allowedAspectRatios: ["1:1"],
                minCount: 1,
                maxCount: 20,
            },
            "google-demand-gen-portrait-images": {
                role: "PORTRAIT_IMAGE",
                allowedAspectRatios: ["4:5"],
                minCount: 1,
                maxCount: 20,
            },
        },
    },

    "google-demand-gen-carousel": {
        platform: "googleAds",
        campaignType: "DEMAND_GEN",
        adFormat: "CAROUSEL",
        requirements: {
            "google-demand-gen-carousel-card-images": {
                role: "CAROUSEL_CARD_IMAGE",
                allowedAspectRatios: ["1.91:1", "1:1", "4:5"],
                minCount: 2,
                maxCount: 10,
            },
        },
    },

    "meta-single-image": {
        platform: "metaAds",
        campaignType: "OBJECTIVE_BASED",
        adFormat: "SINGLE_IMAGE",
        requirements: {
            "meta-single-primary-image": {
                role: "PRIMARY_IMAGE",
                allowedAspectRatios: ["1:1", "4:5", "1.91:1", "9:16"],
                minCount: 1,
                maxCount: 1,
            },
        },
    },

    "meta-carousel": {
        platform: "metaAds",
        campaignType: "OBJECTIVE_BASED",
        adFormat: "CAROUSEL",
        requirements: {
            "meta-carousel-card-images": {
                role: "CAROUSEL_CARD_IMAGE",
                allowedAspectRatios: ["1:1", "4:5"],
                minCount: 2,
                maxCount: 10,
            },
        },
    },
};

/** Prevents an unexpectedly large and expensive generation request. */
const MAX_GENERATED_ASSETS_PER_REQUEST = 30;
/* -------------------------------------------------------------------------- */
/* Validation helpers                                                         */
/* -------------------------------------------------------------------------- */

function isObjectRecord(
    value: unknown,
): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

function validateCampaignAssetRequests(
    body: GenerateCreativeBody,
    selectedPlatforms: CreativePlatform[],
): {
    creativeTargets: CreativeGenerationTarget[];
    assetRequests: CreativeAssetGenerationRequest[];
} {
    const rawTargets: unknown = body.creativeTargets ?? [];
    const rawRequests: unknown = body.assetRequests ?? [];

    if (!Array.isArray(rawTargets)) {
        throw new Error("creativeTargets must be an array.");
    }

    if (!Array.isArray(rawRequests)) {
        throw new Error("assetRequests must be an array.");
    }

    const creativeTargets: CreativeGenerationTarget[] = [];
    const targetIds = new Set<string>();

    for (const candidate of rawTargets) {
        if (
            !isObjectRecord(candidate) ||
            typeof candidate.capabilityId !== "string" ||
            typeof candidate.platform !== "string" ||
            typeof candidate.campaignType !== "string" ||
            typeof candidate.adFormat !== "string"
        ) {
            throw new Error("One or more creative targets are invalid.");
        }

        const capabilityId = candidate.capabilityId;
        const capability =
            BACKEND_CAMPAIGN_CREATIVE_CAPABILITIES[capabilityId];

        if (!capability) {
            throw new Error(
                `Unsupported AI creative capability: ${capabilityId}.`,
            );
        }

        if (
            candidate.platform !== capability.platform ||
            candidate.campaignType !== capability.campaignType ||
            candidate.adFormat !== capability.adFormat
        ) {
            throw new Error(
                `Creative target ${capabilityId} does not match its registered platform, campaign type and ad format.`,
            );
        }

        if (!selectedPlatforms.includes(capability.platform)) {
            throw new Error(
                `Select ${capability.platform} in platforms before requesting its creative assets.`,
            );
        }

        if (targetIds.has(capabilityId)) {
            throw new Error(
                `Duplicate creative target: ${capabilityId}.`,
            );
        }

        if (
            candidate.providerObjective !== undefined &&
            (
                typeof candidate.providerObjective !== "string" ||
                candidate.providerObjective.length > 100
            )
        ) {
            throw new Error(
                `Invalid provider objective for ${capabilityId}.`,
            );
        }

        if (typeof candidate.providerObjective === "string") {
            const allowedObjectives = capability.platform === "googleAds"
                ? [
                    "AWARENESS",
                    "CONSIDERATION",
                    "LEAD",
                    "SALES",
                    "WEBSITE_TRAFFIC",
                    "APP_PROMOTION",
                    "LOCAL_STORES_VISITS",
                ]
                : [
                    "OUTCOME_SALES",
                    "OUTCOME_LEADS",
                    "OUTCOME_TRAFFIC",
                    "OUTCOME_AWARENESS",
                    "OUTCOME_ENGAGEMENT",
                    "OUTCOME_APP_PROMOTION",
                ];

            if (!allowedObjectives.includes(candidate.providerObjective)) {
                throw new Error(
                    `Invalid provider objective ${candidate.providerObjective} for ${capability.platform}.`,
                );
            }
        }

        targetIds.add(capabilityId);

        creativeTargets.push({
            capabilityId,
            platform: capability.platform,
            campaignType: capability.campaignType,
            adFormat: capability.adFormat,
            ...(typeof candidate.providerObjective === "string"
                ? { providerObjective: candidate.providerObjective }
                : {}),
        });
    }

    if (rawRequests.length > 20) {
        throw new Error(
            "A generation request can contain at most 20 asset requirement groups.",
        );
    }

    if (rawRequests.length > 0 && creativeTargets.length === 0) {
        throw new Error(
            "creativeTargets are required when assetRequests are supplied.",
        );
    }

    if (rawRequests.length > 0 && body.textOnly) {
        throw new Error(
            "Image asset requests cannot be used with text-only generation.",
        );
    }

    const assetRequests: CreativeAssetGenerationRequest[] = [];
    const requestKeys = new Set<string>();

    let totalRequestedAssets = 0;

    for (const candidate of rawRequests) {
        if (
            !isObjectRecord(candidate) ||
            typeof candidate.capabilityId !== "string" ||
            typeof candidate.requirementId !== "string" ||
            typeof candidate.requestedCount !== "number" ||
            typeof candidate.mediaType !== "string" ||
            typeof candidate.aspectRatio !== "string"
        ) {
            throw new Error("One or more asset generation requests are invalid.");
        }

        const capabilityId = candidate.capabilityId;
        const requirementId = candidate.requirementId;

        if (!targetIds.has(capabilityId)) {
            throw new Error(
                `Asset request ${requirementId} references a capability that was not selected.`,
            );
        }

        const capability =
            BACKEND_CAMPAIGN_CREATIVE_CAPABILITIES[capabilityId];

        const requirement = capability.requirements[requirementId];

        if (!requirement) {
            throw new Error(
                `Unsupported asset requirement ${requirementId} for ${capabilityId}.`,
            );
        }

        if (candidate.mediaType !== "IMAGE") {
            throw new Error(
                "Only IMAGE asset generation is currently supported. Video generation is not available yet.",
            );
        }

        if (
            !isAllowedValue(
                CREATIVE_ASPECT_RATIOS,
                candidate.aspectRatio,
            )
        ) {
            throw new Error(
                `Unsupported asset aspect ratio for ${requirementId}.`,
            );
        }

        if (
            !requirement.allowedAspectRatios.includes(
                candidate.aspectRatio,
            )
        ) {
            throw new Error(
                `${requirementId} does not support aspect ratio ${candidate.aspectRatio}.`,
            );
        }

        const requestedCount = candidate.requestedCount;

        if (
            !Number.isInteger(requestedCount) ||
            requestedCount < Math.max(1, requirement.minCount) ||
            requestedCount > requirement.maxCount
        ) {
            throw new Error(
                `${requirementId} requires between ${Math.max(1, requirement.minCount)} and ${requirement.maxCount} generated image(s).`,
            );
        }

        const requestKey = `${capabilityId}:${requirementId}`;

        if (requestKeys.has(requestKey)) {
            throw new Error(
                `Duplicate asset request for ${requirementId}. Combine its requested count into one request.`,
            );
        }

        requestKeys.add(requestKey);
        totalRequestedAssets += requestedCount;

        assetRequests.push({
            capabilityId,
            requirementId,
            requestedCount,
            mediaType: "IMAGE",
            aspectRatio: candidate.aspectRatio,
        });
    }

    if (totalRequestedAssets > MAX_GENERATED_ASSETS_PER_REQUEST) {
        throw new Error(
            `A single generation request can generate at most ${MAX_GENERATED_ASSETS_PER_REQUEST} images. Split larger asset requests into batches.`,
        );
    }

    /*
     * Once a target requests images, all mandatory image groups for that
     * target must be included. Optional groups, such as PMax portrait images,
     * can be omitted.
     */
    if (assetRequests.length > 0) {
        for (const target of creativeTargets) {
            const capability =
                BACKEND_CAMPAIGN_CREATIVE_CAPABILITIES[
                target.capabilityId
                ];

            for (const [requirementId, requirement] of Object.entries(
                capability.requirements,
            )) {
                if (requirement.minCount === 0) {
                    continue;
                }

                const matchingRequest = assetRequests.find(
                    (request) =>
                        request.capabilityId === target.capabilityId &&
                        request.requirementId === requirementId,
                );

                if (!matchingRequest) {
                    throw new Error(
                        `${target.capabilityId} requires an asset request for ${requirementId}.`,
                    );
                }
            }
        }
    }

    return {
        creativeTargets,
        assetRequests,
    };
}

function validateCreativeRequest(
    body: GenerateCreativeBody,
): {
    prompt: string;
    creativeKind: CreativeKind;
    aspectRatio: CreativeAspectRatio;
    googleAspectRatio: CreativeAspectRatio;
    campaignType: GoogleCampaignType;
    demandGenFormat: GoogleDemandGenFormat;
    count: 1 | 2 | 3;
    platforms: Array<"googleAds" | "metaAds">;
    style: string;
    textOnly: boolean;
    creativeTargets: CreativeGenerationTarget[];
    assetRequests: CreativeAssetGenerationRequest[];
} {
    if (!body || typeof body !== "object") {
        throw new Error("A valid creative request body is required.");
    }

    const prompt =
        typeof body.prompt === "string" ? body.prompt.trim() : "";

    if (prompt.length < 8) {
        throw new Error(
            "Creative prompt must be at least 8 characters long.",
        );
    }

    if (prompt.length > 2000) {
        throw new Error(
            "Creative prompt must not exceed 2000 characters.",
        );
    }

    const creativeKind = body.creativeKind ?? "IMAGE";

    if (!isAllowedValue(CREATIVE_KINDS, creativeKind)) {
        throw new Error("Unsupported creative kind.");
    }

    // Video must never be represented by an image placeholder.
    // Enable this workflow after an actual video provider is integrated.
    if (creativeKind === "VIDEO") {
        throw new Error(
            "Video creative generation is not available yet. Please select Image Creative.",
        );
    }

    const aspectRatio = body.aspectRatio ?? "1:1";
    const googleAspectRatio = body.googleAspectRatio ?? "1.91:1";
    const campaignType = body.campaignType ?? "SEARCH";
    const demandGenFormat = body.demandGenFormat ?? "MULTI_ASSET";
    const count = body.numberOfVariations ?? 3;

    if (
        body.textOnly !== undefined &&
        typeof body.textOnly !== "boolean"
    ) {
        throw new Error("textOnly must be a boolean value.");
    }

    const textOnly = body.textOnly === true;

    const style = body.creativeStyle?.trim() || "Premium lifestyle";

    if (!isAllowedValue(CREATIVE_ASPECT_RATIOS, aspectRatio)) {
        throw new Error("Unsupported creative aspect ratio.");
    }

    if (!isAllowedValue(CREATIVE_ASPECT_RATIOS, googleAspectRatio)) {
        throw new Error("Unsupported Google Ads aspect ratio.");
    }

    if (!isAllowedValue(GOOGLE_CAMPAIGN_TYPES, campaignType)) {
        throw new Error("Unsupported Google Ads campaign type.");
    }

    if (!isAllowedValue(GOOGLE_DEMAND_GEN_FORMATS, demandGenFormat)) {
        throw new Error("Unsupported Google Demand Gen format.");
    }

    if (![1, 2, 3].includes(count)) {
        throw new Error("numberOfVariations must be 1, 2, or 3.");
    }

    if (style.length > 80) {
        throw new Error(
            "Creative style must not exceed 80 characters.",
        );
    }

    const platforms = body.platforms ?? ["googleAds"];

    if (!Array.isArray(platforms)) {
        throw new Error("Platforms must be an array.");
    }

    if (
        platforms.some(
            (platform) => !isAllowedValue(CREATIVE_PLATFORMS, platform),
        )
    ) {
        throw new Error("One or more selected platforms are unsupported.");
    }

    const uniquePlatforms = [...new Set(platforms)];
    const {
        creativeTargets,
        assetRequests,
    } = validateCampaignAssetRequests(
        body,
        uniquePlatforms,
    );

    const websiteUrl = body.brandContext?.websiteUrl?.trim();

    if (websiteUrl) {
        validateWebsiteUrl(websiteUrl);
    }

    return {
        prompt,
        creativeKind,
        aspectRatio,
        googleAspectRatio,
        campaignType,
        demandGenFormat,
        count: count as 1 | 2 | 3,
        platforms: uniquePlatforms,
        style,
        textOnly,
        creativeTargets,
        assetRequests,
    };
}

function validateWebsiteUrl(value: string): void {
    try {
        const parsed = new URL(value);

        if (!["http:", "https:"].includes(parsed.protocol)) {
            throw new Error("Only HTTP and HTTPS URLs are supported.");
        }
    } catch {
        throw new Error(
            "Brand website URL must be a valid HTTP or HTTPS URL.",
        );
    }
}

/* -------------------------------------------------------------------------- */
/* Image dimensions                                                           */
/* -------------------------------------------------------------------------- */

function toImageDimensions(
    ratio: CreativeAspectRatio,
): ImageDimensions {
    switch (ratio) {
        case "1.91:1":
            // Google Ads recommended landscape size.
            return { width: 1200, height: 628 };

        case "16:9":
            return { width: 1280, height: 720 };

        case "4:5":
            return { width: 1024, height: 1280 };

        case "9:16":
            return { width: 720, height: 1280 };

        case "4:1":
            return { width: 1200, height: 300 };
        case "1:1":
        default:
            return { width: 1024, height: 1024 };
    }
}

/* -------------------------------------------------------------------------- */
/* General helpers                                                            */
/* -------------------------------------------------------------------------- */

function googleFormatLabel(
    campaignType: GoogleCampaignType,
    demandGenFormat: GoogleDemandGenFormat,
): string {
    switch (campaignType) {
        case "SEARCH":
            return "Responsive Search Ad (RSA)";

        case "PERFORMANCE_MAX":
            return "Performance Max Asset Group";

        case "DISPLAY":
            return "Responsive Display Ad";

        case "DEMAND_GEN":
            return `Demand Gen ${demandGenFormat.replaceAll("_", " ")}`;

        case "APP":
            return "App Campaign Asset Set";

        case "SHOPPING":
            return "Merchant Center Product Feed";

        case "HOTEL":
            return "Hotel Center Listing Workflow";

        default:
            return `${campaignType} creative assets`;
    }
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

function uniqueStrings(values: string[]): string[] {
    const seen = new Set<string>();

    return values.filter((value) => {
        const normalized = value.toLowerCase();

        if (seen.has(normalized)) {
            return false;
        }

        seen.add(normalized);
        return true;
    });
}

function normalizeStringArray(
    value: unknown,
    maxLength: number,
    maxItems: number,
): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const values = value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .map((item) => item.slice(0, maxLength));

    return uniqueStrings(values).slice(0, maxItems);
}

function ensureMinimumItems(
    values: string[],
    minimum: number,
    fallbacks: string[],
    maxLength: number,
): string[] {
    const result = [...values];

    for (const fallback of fallbacks) {
        if (result.length >= minimum) {
            break;
        }

        const normalized = fallback.trim().slice(0, maxLength);

        if (
            normalized &&
            !result.some(
                (item) => item.toLowerCase() === normalized.toLowerCase(),
            )
        ) {
            result.push(normalized);
        }
    }

    return result;
}

function safeWebsiteUrl(
    brief: GenerateCreativeBody,
): {
    url: string;
    warning?: string;
} {
    const websiteUrl = brief.brandContext?.websiteUrl?.trim();

    if (!websiteUrl) {
        return {
            url: "https://example.com",
            warning:
                "Replace the demo destination URL with the actual business website before using this creative.",
        };
    }

    validateWebsiteUrl(websiteUrl);

    return { url: websiteUrl };
}


function buildCreativeImagePrompt(input: {
    creativeBrief: string;
    productHint?: string;
    businessName: string;
    style: string;
    campaignType: string;
    aspectRatio: CreativeAspectRatio;
    platform?: CreativePlatform;
    providerObjective?: string;
    adFormat?: string;
    dynamicInstructions?: string;
}): string {
    const productDescription =
        input.productHint?.trim() || input.creativeBrief.trim();

    const promptParts = [
        "Create a polished commercial advertising image using the supplied campaign brief as the source of truth.",
        `BUSINESS: ${input.businessName}.`,
        `PRODUCT OR SERVICE: ${productDescription}.`,
        `CAMPAIGN BRIEF: ${input.creativeBrief}.`,
        `VISUAL STYLE: ${input.style}.`,
        `PLATFORM: ${input.platform ?? "general advertising"}.`,
        `CAMPAIGN TYPE: ${input.campaignType}.`,
        `OBJECTIVE: ${input.providerObjective || "not specified"}.`,
        `AD FORMAT: ${input.adFormat || "general image creative"}.`,
        `REQUIRED ASPECT RATIO: ${input.aspectRatio}.`,
        "Use only product, service, brand and offer details present in the user brief. Do not replace the advertised subject with an unrelated product or stock-photo concept.",
        "Do not fabricate product features, prices, discounts, testimonials, certifications, guarantees or performance claims.",
    ];

    if (input.dynamicInstructions?.trim()) {
        promptParts.push(
            "ACTIVE CAMPAIGN-SPECIFIC INSTRUCTIONS (resolved from AdSyntra's instruction library):",
            input.dynamicInstructions.trim(),
        );
    }

    return promptParts.join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Campaign-aware multiple asset generation                                  */
/* -------------------------------------------------------------------------- */

interface CampaignAssetGenerationResult {
    generatedAssets: GeneratedCreativeAsset[];
    requestedAssetCount: number;
    generatedAssetCount: number;
    failedAssetCount: number;
    assetErrors: CreativeAssetGenerationError[];
}

async function generateCampaignAssets(input: {
    generationId: string;
    prompt: string;
    productHint?: string;
    businessName: string;
    style: string;
    creativeTargets: CreativeGenerationTarget[];
    assetRequests: CreativeAssetGenerationRequest[];
    instructionBundlesByRequirement: Map<string, ResolvedAiCreativeInstructionBundle>;
}): Promise<CampaignAssetGenerationResult> {
    const requestedAssetCount = input.assetRequests.reduce(
        (total, request) => total + request.requestedCount,
        0,
    );

    if (requestedAssetCount === 0) {
        return {
            generatedAssets: [],
            requestedAssetCount: 0,
            generatedAssetCount: 0,
            failedAssetCount: 0,
            assetErrors: [],
        };
    }

    const tasks: Array<{
        request: CreativeAssetGenerationRequest;
        assetIndex: number;
        run: () => Promise<GeneratedCreativeAsset>;
    }> = [];

    for (const request of input.assetRequests) {
        const target = input.creativeTargets.find(
            (item) => item.capabilityId === request.capabilityId,
        );

        const capability =
            BACKEND_CAMPAIGN_CREATIVE_CAPABILITIES[
            request.capabilityId
            ];

        const requirement = capability?.requirements[
            request.requirementId
        ];

        // These should already be guaranteed by request validation.
        // Keep this check here to protect the generation service too.
        if (!target || !requirement) {
            throw new Error(
                `Unable to resolve the campaign asset requirement ${request.requirementId}.`,
            );
        }

        for (
            let assetIndex = 1;
            assetIndex <= request.requestedCount;
            assetIndex += 1
        ) {
            tasks.push({
                request,
                assetIndex,

                run: async () => {
                    const instructionBundle = input.instructionBundlesByRequirement.get(
                        `${request.capabilityId}:${request.requirementId}`,
                    );
                    if (!instructionBundle) {
                        throw new Error(
                            `No dynamic image instructions were resolved for ${request.requirementId}.`,
                        );
                    }

                    const dynamicImageInstructions = [
                        instructionBundle.imageInstructions,
                        instructionBundle.complianceInstructions,
                    ].filter(Boolean).join("\n\n");

                    const basePrompt = buildCreativeImagePrompt({
                        creativeBrief: input.prompt,
                        productHint: input.productHint,
                        businessName: input.businessName,
                        style: input.style,
                        platform: target.platform,
                        campaignType: target.campaignType,
                        providerObjective: target.providerObjective,
                        adFormat: target.adFormat,
                        aspectRatio: request.aspectRatio,
                        dynamicInstructions: dynamicImageInstructions,
                    });

                    const roleDescription =
                        requirement.role.replaceAll("_", " ").toLowerCase();
                    const composedPrompt = [
                        basePrompt,
                        `ASSET REQUIREMENT: ${request.requirementId}.`,
                        `ASSET ROLE: ${roleDescription}.`,
                        `This is item ${assetIndex} of ${request.requestedCount} for this exact requirement.`,
                        "Retain the same advertiser identity and product facts across items in this generation request.",
                    ].join("\n\n");

                    const seed =
                        (Date.now() +
                            assetIndex * 1_000_003 +
                            tasks.length * 97) %
                        2_147_483_647;

                    console.log(
                        `[${input.generationId}] Generating ${request.requirementId}, asset ${assetIndex}/${request.requestedCount}.`,
                    );

                    const media = await generateImageQueued(
                        composedPrompt,
                        request.aspectRatio,
                        seed,
                    );

                    return {
                        id: `${input.generationId}-${randomUUID()}`,
                        generationId: input.generationId,
                        capabilityId: request.capabilityId,
                        requirementId: request.requirementId,
                        role: requirement.role,
                        assetIndex,
                        name:
                            `${target.campaignType} ` +
                            `${roleDescription} ${assetIndex}`,
                        media,
                        prompt: composedPrompt,
                        generatedAt: new Date().toISOString(),
                    } satisfies GeneratedCreativeAsset;
                },
            });
        }
    }

    const results = await Promise.allSettled(
        tasks.map((task) => task.run()),
    );

    const generatedAssets: GeneratedCreativeAsset[] = [];
    const assetErrors: CreativeAssetGenerationError[] = [];

    results.forEach((result, index) => {
        const task = tasks[index];

        if (result.status === "fulfilled") {
            generatedAssets.push(result.value);
            return;
        }

        const message = getErrorMessage(result.reason);

        assetErrors.push({
            capabilityId: task.request.capabilityId,
            requirementId: task.request.requirementId,
            assetIndex: task.assetIndex,
            message,
            provider: IMAGE_PROVIDER,
            code: "CAMPAIGN_ASSET_GENERATION_FAILED",
        });

        console.error(
            `[${input.generationId}] Campaign asset generation failed:`,
            {
                requirementId: task.request.requirementId,
                assetIndex: task.assetIndex,
                message,
            },
        );
    });

    return {
        generatedAssets,
        requestedAssetCount,
        generatedAssetCount: generatedAssets.length,
        failedAssetCount: assetErrors.length,
        assetErrors,
    };
}

/* -------------------------------------------------------------------------- */
/* Groq copy response parsing                                                  */
/* -------------------------------------------------------------------------- */

function parseGroqJson(raw: string): Record<string, unknown> {
    let content = raw.trim();

    // Defensive handling in case the model wraps JSON in Markdown fences.
    content = content
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();

    let parsed: unknown;

    try {
        parsed = JSON.parse(content);
    } catch {
        console.error("GROQ RETURNED INVALID JSON.");
        throw new Error("Groq copy response was not valid JSON.");
    }

    if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
    ) {
        throw new Error(
            "Groq returned an unexpected copy response format.",
        );
    }

    return parsed as Record<string, unknown>;
}

function normalizeGeneratedCopy(
    parsed: Record<string, unknown>,
    strictCampaignCopy = false,
): GeneratedCopy {
    const headlineFallback = String(
        parsed.headline ?? (strictCampaignCopy ? "" : "Discover More Today"),
    )
        .trim()
        .slice(0, 30);

    const primaryTextFallback = String(
        parsed.primaryText ?? (strictCampaignCopy ? "" : "Explore the collection and discover more today."),
    )
        .trim()
        .slice(0, 500);

    const longHeadlineFallback = String(
        parsed.longHeadline ??
        (strictCampaignCopy ? "" : "Discover products and services designed around your needs."),
    )
        .trim()
        .slice(0, 90);

    const headlines = normalizeStringArray(
        parsed.headlines,
        30,
        15,
    );

    if (headlineFallback && !headlines.includes(headlineFallback)) {
        headlines.unshift(headlineFallback);
    }

    const validHeadlines = ensureMinimumItems(
        headlines,
        strictCampaignCopy ? 0 : 3,
        strictCampaignCopy
            ? []
            : [
                headlineFallback,
                "Discover More Today",
                "Explore What's New",
                "Find Your Favourite",
            ],
        30,
    ).slice(0, 15);

    const longHeadlines = normalizeStringArray(
        parsed.longHeadlines,
        90,
        5,
    );

    const singleLongHeadline = String(
        parsed.longHeadline ?? longHeadlineFallback,
    )
        .trim()
        .slice(0, 90);

    if (
        singleLongHeadline &&
        !longHeadlines.some(
            (item) => item.toLowerCase() === singleLongHeadline.toLowerCase(),
        )
    ) {
        longHeadlines.unshift(singleLongHeadline);
    }

    const validLongHeadlines = ensureMinimumItems(
        longHeadlines,
        strictCampaignCopy ? 0 : 1,
        strictCampaignCopy
            ? []
            : [
                longHeadlineFallback,
                "Discover products and services designed around your needs.",
            ],
        90,
    ).slice(0, 5);

    const descriptions = normalizeStringArray(
        parsed.descriptions,
        90,
        5,
    );

    const singleDescription = String(
        parsed.description ?? (strictCampaignCopy ? "" : parsed.primaryText ?? primaryTextFallback),
    )
        .trim()
        .slice(0, 90);

    if (
        singleDescription &&
        !descriptions.some(
            (item) => item.toLowerCase() === singleDescription.toLowerCase(),
        )
    ) {
        descriptions.unshift(singleDescription);
    }

    const validDescriptions = ensureMinimumItems(
        descriptions,
        strictCampaignCopy ? 0 : 2,
        strictCampaignCopy
            ? []
            : [
                "Explore the collection and discover more today.",
                "Find the right solution for your needs. Learn more today.",
            ],
        90,
    ).slice(0, 5);

    const primaryTexts = normalizeStringArray(
        parsed.primaryTexts,
        500,
        5,
    );

    if (
        primaryTextFallback &&
        !primaryTexts.some(
            (item) => item.toLowerCase() === primaryTextFallback.toLowerCase(),
        )
    ) {
        primaryTexts.unshift(primaryTextFallback);
    }

    const validPrimaryTexts = ensureMinimumItems(
        primaryTexts,
        strictCampaignCopy ? 0 : 1,
        strictCampaignCopy ? [] : [primaryTextFallback],
        500,
    ).slice(0, 5);

    const requestedCta = String(
        parsed.callToAction ?? (strictCampaignCopy ? "LEARN_MORE" : "SHOP_NOW"),
    ).trim().toUpperCase();

    const callToAction = ALLOWED_CALL_TO_ACTIONS.includes(
        requestedCta as AllowedCallToAction,
    )
        ? (requestedCta as AllowedCallToAction)
        : "SHOP_NOW";

    return {
        headline: validHeadlines[0] ?? "Discover More Today",
        primaryText:
            validPrimaryTexts[0] ??
            "Explore the collection and discover more today.",
        longHeadline:
            validLongHeadlines[0] ??
            "Discover products and services designed around your needs.",
        headlines: validHeadlines,
        longHeadlines: validLongHeadlines,
        descriptions: validDescriptions,
        primaryTexts: validPrimaryTexts,
        callToAction,
    };
}

/* -------------------------------------------------------------------------- */
/* Groq — generate structured advertising copy                                */
/* -------------------------------------------------------------------------- */

async function generateCopyVariation(
    apiKey: string,
    brief: GenerateCreativeBody,
    campaignType: GoogleCampaignType,
    demandGenFormat: GoogleDemandGenFormat,
    index: number,
    target?: CreativeGenerationTarget,
    dynamicInstructions?: string,
): Promise<GeneratedCopy> {
    const commonSystemRules = [
        "You are a senior performance advertising copywriter.",
        "Generate original, truthful and platform-appropriate advertising copy.",
        "Return a single valid JSON object only. Do not include Markdown or explanations.",
        "Never invent prices, discounts, guarantees, certifications, testimonials, product capabilities or measurable outcomes.",
        "Avoid duplicate wording and unsupported comparative or superlative claims.",
    ];

    let systemPrompt: string;
    let userPrompt: string;

    if (target) {
        const platformName = target.platform === "googleAds" ? "Google Ads" : "Meta Ads";
        const objective = target.providerObjective || "Not supplied";
        const searchAd = target.platform === "googleAds" && target.adFormat === "RESPONSIVE_SEARCH";
        const googleVisualAd = target.platform === "googleAds" && !searchAd;

        systemPrompt = [
            ...commonSystemRules,
            `You are generating copy exclusively for ${platformName}. Do not produce copy for another platform.`,
            `Selected campaign type: ${target.campaignType}. Selected objective: ${objective}. Selected ad format: ${target.adFormat}.`,
            target.platform === "googleAds"
                ? "Use Google Ads asset conventions. Headline text must fit 30 characters and description text must fit 90 characters. Keep each asset independently useful."
                : "Use Facebook and Instagram ad conventions. Primary text should be natural and mobile-scannable; headlines and descriptions must be concise and specific to the supplied offer.",
            "The following active instruction-library content is authoritative campaign guidance. Apply only guidance relevant to the selected platform, campaign, objective and format:",
            dynamicInstructions?.trim() || "No additional instruction text was returned.",
        ].join("\n\n");

        const fieldInstructions = target.platform === "googleAds"
            ? [
                "Return headline as one strong example, headlines as 8 distinct options (each max 30 characters), and descriptions as 4 distinct options (each max 90 characters).",
                googleVisualAd
                    ? "Also return longHeadline and longHeadlines with 2 distinct options (each max 90 characters)."
                    : "This is a responsive search ad: do not create long headlines or Meta primary text assets.",
                "Set primaryText to an empty string, primaryTexts to an empty array, and callToAction to LEARN_MORE unless the schema requires a supported CTA value.",
            ].join("\n")
            : [
                "Return primaryText as one example and primaryTexts as 3 distinct options (each max 500 characters).",
                "Return headline as one example and headlines as 5 distinct options (each max 30 characters).",
                "Return descriptions as 3 distinct short options (each max 90 characters).",
                "Return callToAction as exactly one of SHOP_NOW, LEARN_MORE, SIGN_UP, CONTACT_US, DOWNLOAD.",
                "Do not create Google long-headline assets; set longHeadline to an empty string and longHeadlines to an empty array.",
            ].join("\n");

        userPrompt = `
BUSINESS CONTEXT
Business name: ${brief.brandContext?.businessName ?? "the advertiser"}
Product or service: ${brief.brandContext?.productHint ?? "not provided"}
Website / destination: ${brief.brandContext?.websiteUrl ?? "not provided"}

SELECTED CAMPAIGN TARGET
Platform: ${platformName}
Campaign type: ${target.campaignType}
Provider objective: ${objective}
Ad format: ${target.adFormat}
Capability ID: ${target.capabilityId}
Creative style: ${brief.creativeStyle ?? "Premium lifestyle"}
Variation: ${index + 1}

USER CREATIVE BRIEF
${brief.prompt}

FIELD REQUIREMENTS
${fieldInstructions}

Return exactly this JSON shape:
{
  "headline": "",
  "primaryText": "",
  "longHeadline": "",
  "headlines": [],
  "longHeadlines": [],
  "descriptions": [],
  "primaryTexts": [],
  "callToAction": "LEARN_MORE"
}
`.trim();
    } else {
        // Backward-compatible prompt for the general AI Creation workspace.
        // Campaign Creation always supplies targets and uses instruction-library guidance above.
        systemPrompt = commonSystemRules.join(" ");
        userPrompt = `
BUSINESS CONTEXT
Business name: ${brief.brandContext?.businessName ?? "the advertiser"}
Product or service: ${brief.brandContext?.productHint ?? "not provided"}
Website: ${brief.brandContext?.websiteUrl ?? "not provided"}

CAMPAIGN CONTEXT
Google campaign type: ${campaignType}
Demand Gen format: ${demandGenFormat}
Creative style: ${brief.creativeStyle ?? "Premium lifestyle"}
Variation number: ${index + 1}

CREATIVE BRIEF
${brief.prompt}

Generate Google headlines, long headlines, descriptions, Meta primary texts and one supported call to action. Respect Google headline limits of 30 characters, Google description limits of 90 characters and Meta primary text limit of 500 characters. Return exactly this JSON structure:
{
  "headline": "Main headline",
  "primaryText": "Main Meta primary text",
  "longHeadline": "Main long headline",
  "headlines": ["Headline 1", "Headline 2", "Headline 3", "Headline 4", "Headline 5", "Headline 6", "Headline 7", "Headline 8"],
  "longHeadlines": ["Long headline 1", "Long headline 2"],
  "descriptions": ["Description 1", "Description 2", "Description 3", "Description 4"],
  "primaryTexts": ["Primary text 1", "Primary text 2", "Primary text 3"],
  "callToAction": "LEARN_MORE"
}
`.trim();
    }

    try {
        const response = await axios.post(
            `${GROQ_BASE_URL}/chat/completions`,
            {
                model: GROQ_TEXT_MODEL,
                messages: [
                    {
                        role: "system",
                        content: systemPrompt,
                    },
                    {
                        role: "user",
                        content: userPrompt,
                    },
                ],
                max_completion_tokens: target ? 2400 : 2200,
                reasoning_effort: "low",
                include_reasoning: false,
                response_format: {
                    type: "json_object",
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                timeout: GROQ_REQUEST_TIMEOUT,
            },
        );

        const raw = response.data?.choices?.[0]?.message?.content;

        if (typeof raw !== "string" || !raw.trim()) {
            throw new Error(
                `Groq returned empty content. Finish reason: ${response.data?.choices?.[0]?.finish_reason ?? "unknown"
                }.`,
            );
        }

        const parsed = parseGroqJson(raw);

        if (target?.platform === "metaAds") {
            const requestedCta = String(parsed.callToAction ?? "")
                .trim()
                .toUpperCase();
            if (!ALLOWED_CALL_TO_ACTIONS.includes(requestedCta as AllowedCallToAction)) {
                throw new Error(
                    "Groq did not return a supported Meta call-to-action for the selected format.",
                );
            }
        }

        const normalized = normalizeGeneratedCopy(parsed, Boolean(target));
        if (target?.platform === "googleAds") {
            if (normalized.headlines.length < 3 || normalized.descriptions.length < 2) {
                throw new Error(
                    "Groq did not return the minimum Google Ads headline and description assets required for this format.",
                );
            }
            if (target.adFormat !== "RESPONSIVE_SEARCH" && normalized.longHeadlines.length < 1) {
                throw new Error(
                    "Groq did not return a long headline for the selected Google Ads format.",
                );
            }
        }
        if (target?.platform === "metaAds") {
            if (
                normalized.primaryTexts.length < 1 ||
                normalized.headlines.length < 1 ||
                normalized.descriptions.length < 1
            ) {
                throw new Error(
                    "Groq did not return the required Meta primary text, headline and description fields.",
                );
            }
        }

        return normalized;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const providerMessage =
                error.response?.data?.error?.message ??
                error.response?.data?.message ??
                error.message;

            console.error("GROQ API FAILED:", {
                status: error.response?.status,
                message: providerMessage,
            });

            throw new Error(
                `Groq copy generation failed${error.response?.status
                    ? ` (${error.response.status})`
                    : ""
                }: ${providerMessage}`,
            );
        }

        throw error;
    }
}

interface CapabilityCopyGenerationResult {
    generatedCapabilityCopies: GeneratedCapabilityCopy[];
    errors: CreativeGenerationError[];
    successfulCopyVariations: number;
    requestedCopyVariations: number;
}

async function generateCapabilitySpecificCopies(input: {
    apiKey: string | null;
    apiKeyError?: string;
    brief: GenerateCreativeBody;
    targets: CreativeGenerationTarget[];
    variationCount: 1 | 2 | 3;
    campaignType: GoogleCampaignType;
    demandGenFormat: GoogleDemandGenFormat;
    instructionsByCapability: Map<string, ResolvedAiCreativeInstructionBundle>;
}): Promise<CapabilityCopyGenerationResult> {
    const generatedCapabilityCopies: GeneratedCapabilityCopy[] = [];
    const errors: CreativeGenerationError[] = [];
    let successfulCopyVariations = 0;
    const requestedCopyVariations = input.targets.length * input.variationCount;

    for (const target of input.targets) {
        const instructionBundle = input.instructionsByCapability.get(target.capabilityId);
        if (!instructionBundle) {
            throw new Error(
                `Dynamic instructions were not resolved for ${target.capabilityId}.`,
            );
        }

        const tasks = Array.from({ length: input.variationCount }, (_, index) => ({
            index,
            run: async () => {
                if (!input.apiKey) {
                    throw new Error(input.apiKeyError || "Groq API key is unavailable.");
                }

                return generateCopyVariation(
                    input.apiKey,
                    input.brief,
                    input.campaignType,
                    input.demandGenFormat,
                    index,
                    target,
                    [
                        instructionBundle.copyInstructions,
                        instructionBundle.complianceInstructions,
                    ].filter(Boolean).join("\n\n"),
                );
            },
        }));

        const results = await Promise.allSettled(tasks.map((task) => task.run()));
        const fieldIndexes = new Map<string, number>();
        const texts: GeneratedCapabilityCopyText[] = [];

        const appendTexts = (field: string, values: string[]) => {
            const requirementId = `${target.capabilityId}:${field.toLowerCase()}`;
            for (const value of values) {
                const text = value.trim();
                if (!text) continue;
                const nextIndex = (fieldIndexes.get(requirementId) ?? 0) + 1;
                fieldIndexes.set(requirementId, nextIndex);
                texts.push({ requirementId, field, textIndex: nextIndex, text });
            }
        };

        results.forEach((result, index) => {
            if (result.status === "rejected") {
                const message = getErrorMessage(result.reason);
                errors.push({
                    variationIndex: index + 1,
                    capabilityId: target.capabilityId,
                    platform: target.platform,
                    message,
                    provider: "groq",
                    code: "CAPABILITY_COPY_GENERATION_FAILED",
                });
                return;
            }

            successfulCopyVariations += 1;
            const copy = result.value;

            if (target.platform === "googleAds") {
                appendTexts("HEADLINE", copy.headlines);
                if (target.adFormat !== "RESPONSIVE_SEARCH") {
                    appendTexts("LONG_HEADLINE", copy.longHeadlines);
                }
                appendTexts("DESCRIPTION", copy.descriptions);
            } else {
                appendTexts("PRIMARY_TEXT", copy.primaryTexts);
                appendTexts("HEADLINE", copy.headlines);
                appendTexts("DESCRIPTION", copy.descriptions);
                appendTexts("CALL_TO_ACTION", [copy.callToAction]);
            }
        });

        if (texts.length > 0) {
            generatedCapabilityCopies.push({
                capabilityId: target.capabilityId,
                platform: target.platform,
                campaignType: target.campaignType,
                ...(target.providerObjective
                    ? { providerObjective: target.providerObjective }
                    : {}),
                adFormat: target.adFormat,
                texts,
            });
        }
    }

    return {
        generatedCapabilityCopies,
        errors,
        successfulCopyVariations,
        requestedCopyVariations,
    };
}

function buildInstructionSummary(input: {
    targets: CreativeGenerationTarget[];
    targetBundles: Map<string, ResolvedAiCreativeInstructionBundle>;
    requirementBundles: Map<string, ResolvedAiCreativeInstructionBundle>;
}): CreativeInstructionSummary[] {
    return input.targets.map((target) => {
        const documents = new Map<string, ResolvedAiCreativeInstructionBundle["documents"][number]>();
        const capabilityBundle = input.targetBundles.get(target.capabilityId);
        capabilityBundle?.documents.forEach((document) => documents.set(document.key, document));

        for (const [key, bundle] of input.requirementBundles.entries()) {
            if (!key.startsWith(`${target.capabilityId}:`)) continue;
            bundle.documents.forEach((document) => documents.set(document.key, document));
        }

        const matchedDocuments = [...documents.values()].map((document) => ({
            key: document.key,
            title: document.title,
            version: document.version,
            scope: document.requirementId !== "*"
                ? "REQUIREMENT" as const
                : document.capabilityId !== "*"
                    ? "CAPABILITY" as const
                    : document.providerObjective !== "*"
                        ? "OBJECTIVE" as const
                        : "PROVIDER" as const,
        }));

        return {
            capabilityId: target.capabilityId,
            platform: target.platform,
            campaignType: target.campaignType,
            ...(target.providerObjective
                ? { providerObjective: target.providerObjective }
                : {}),
            adFormat: target.adFormat,
            instructionCount: matchedDocuments.length,
            instructions: matchedDocuments,
        };
    });
}

/* -------------------------------------------------------------------------- */
/* Pollinations request queue                                                 */
/* -------------------------------------------------------------------------- */

// Keep generation requests sequential inside this backend process.
let pollinationsQueue: Promise<void> = Promise.resolve();

function generateImageQueued(
    prompt: string,
    aspectRatio: CreativeAspectRatio,
    seed: number,
): Promise<GeneratedMedia> {
    const task = pollinationsQueue.then(async () => {
        try {
            return await generateImage(prompt, aspectRatio, seed);
        } finally {
            await new Promise<void>((resolve) => {
                setTimeout(resolve, IMAGE_REQUEST_DELAY);
            });
        }
    });

    // A failed request must not permanently break the queue.
    pollinationsQueue = task.then(
        () => undefined,
        () => undefined,
    );

    return task;
}

/* -------------------------------------------------------------------------- */
/* Pollinations — generate actual image media                                 */
/* -------------------------------------------------------------------------- */

async function generateImage(
    prompt: string,
    aspectRatio: CreativeAspectRatio,
    seed: number,
): Promise<GeneratedMedia> {
    const { width, height } = toImageDimensions(aspectRatio);

    // Explicit development mode.
    // This image is marked as a placeholder and must not be treated as
    // a real generated creative or approved production media.
    if (IMAGE_PROVIDER === "none") {
        return {
            type: "IMAGE",
            url: `https://placehold.co/${width}x${height}/png?text=Development+Preview`,
            mimeType: "image/png",
            width,
            height,
            aspectRatio,
            provider: "none",
            isPlaceholder: true,
        };
    }

    if (IMAGE_PROVIDER !== "pollinations") {
        throw new Error(
            `Unsupported IMAGE_PROVIDER "${IMAGE_PROVIDER}". Use "pollinations" or "none".`,
        );
    }

    const apiKey = requirePollinationsKey();

    const params = new URLSearchParams({
        model: POLLINATIONS_MODEL,
        width: String(width),
        height: String(height),
        seed: String(seed),
        nologo: String(POLLINATIONS_NOLOGO),
    });

    const url =
        `${POLLINATIONS_BASE_URL}/image/` +
        `${encodeURIComponent(prompt)}?${params.toString()}`;

    console.log("POLLINATIONS IMAGE REQUEST:", {
        model: POLLINATIONS_MODEL,
        width,
        height,
        aspectRatio,
        seed,
    });

    try {
        const response: any = await axios.get<ArrayBuffer>(url, {
            responseType: "arraybuffer",
            timeout: IMAGE_REQUEST_TIMEOUT,
            maxContentLength: MAX_IMAGE_BYTES,
            maxBodyLength: MAX_IMAGE_BYTES,
            headers: {
                Accept: "image/png, image/jpeg",
                Authorization: `Bearer ${apiKey}`,
            },
        });

        const contentType = String(
            response?.headers?.["content-type"],
        )
            .split(";")[0]
            ?.trim()
            .toLowerCase() ?? "";

        // Google and Meta production image assets should be JPEG or PNG.
        if (!["image/jpeg", "image/png"].includes(contentType)) {
            throw new Error(
                `Pollinations returned an unsupported image content type: ${contentType || "missing content type"
                }. Expected image/jpeg or image/png.`,
            );
        }

        const imageBuffer = Buffer.from(response.data);

        if (imageBuffer.length === 0) {
            throw new Error("Pollinations returned an empty image.");
        }

        if (imageBuffer.length > MAX_IMAGE_BYTES) {
            throw new Error(
                "Generated image exceeds the maximum allowed size of 8 MB.",
            );
        }

        const imageUrl =
            `data:${contentType};base64,${imageBuffer.toString("base64")}`;

        console.log("POLLINATIONS IMAGE GENERATED:", {
            status: response.status,
            contentType,
            bytes: imageBuffer.length,
            width,
            height,
            aspectRatio,
        });

        return {
            type: "IMAGE",
            url: imageUrl,
            mimeType: contentType,
            width,
            height,
            aspectRatio,
            provider: "pollinations",
            fileSizeBytes: imageBuffer.length,
            isPlaceholder: false,
        };
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const responseData = error.response?.data;

            const responseText = Buffer.isBuffer(responseData)
                ? responseData.toString("utf8").slice(0, 1000)
                : typeof responseData === "string"
                    ? responseData.slice(0, 1000)
                    : JSON.stringify(responseData ?? "");

            console.error("POLLINATIONS API FAILED:", {
                status: error.response?.status,
                message: error.message,
                response: responseText,
            });

            throw new Error(
                `Pollinations image generation failed${error.response?.status
                    ? ` (${error.response.status})`
                    : ""
                }: ${error.message}`,
            );
        }

        console.error("POLLINATIONS IMAGE GENERATION FAILED:", error);

        throw error;
    }
}

/* -------------------------------------------------------------------------- */
/* Google Ads creative pack                                                    */
/* -------------------------------------------------------------------------- */

function buildGoogleCreativePack(
    copy: GeneratedCopy,
    campaignType: GoogleCampaignType,
    demandGenFormat: GoogleDemandGenFormat,
    finalUrl: string,
    imageMedia?: GeneratedMedia | null,
    finalUrlWarning?: string,
): GoogleCreativePack {
    const validationWarnings: string[] = [];

    if (finalUrlWarning) {
        validationWarnings.push(finalUrlWarning);
    }

    if (!imageMedia) {
        validationWarnings.push(
            "No generated image is attached. Generate or upload the required media before using visual campaign formats.",
        );
    }

    if (imageMedia?.isPlaceholder) {
        validationWarnings.push(
            "This is a development placeholder, not a production image asset.",
        );
    }

    return {
        campaignType,
        subFormat:
            campaignType === "DEMAND_GEN"
                ? demandGenFormat
                : undefined,

        formatLabel: googleFormatLabel(
            campaignType,
            demandGenFormat,
        ),

        headlines: copy.headlines,
        longHeadlines: copy.longHeadlines,
        descriptions: copy.descriptions,

        finalUrl,

        imageUrl: imageMedia?.url,
        imageAspectRatio: imageMedia?.aspectRatio,

        imageUrls: imageMedia ? [imageMedia.url] : [],

        validationWarnings,
    };
}

/* -------------------------------------------------------------------------- */
/* Meta Ads creative pack                                                      */
/* -------------------------------------------------------------------------- */

function buildMetaCreativePack(
    copy: GeneratedCopy,
    imageMedia?: GeneratedMedia | null,
    finalUrl?: string,
): MetaCreativePack {
    const validationWarnings: string[] = [];

    if (!imageMedia) {
        validationWarnings.push(
            "No media is attached. Generate or upload an image before using this creative.",
        );
    }

    if (imageMedia?.isPlaceholder) {
        validationWarnings.push(
            "This is a development placeholder, not a production image asset.",
        );
    }

    return {
        format: "SINGLE_IMAGE",

        primaryTexts: copy.primaryTexts,
        headlines: copy.headlines,
        descriptions: copy.descriptions,

        callToAction: copy.callToAction,
        callToActionType: copy.callToAction,

        destinationUrl: finalUrl,

        mediaUrl: imageMedia?.url,
        thumbnailUrl: imageMedia?.url,

        carouselCards: [],

        validationWarnings,
    };
}

/* -------------------------------------------------------------------------- */
/* Main entry point                                                            */
/* -------------------------------------------------------------------------- */

export async function generateCreativeVariations(
    userId: string,
    body: GenerateCreativeBody,
): Promise<CreativeGenerationResult> {
    const startedAt = Date.now();

    // Validate the request before making any provider calls.
    const request = validateCreativeRequest(body);

    // Groq is required for copy variations, but campaign image
    // generation must be able to continue if Groq is unavailable.
    let apiKey: string | null = null;
    let groqKeyError: string | undefined;

    try {
        apiKey = requireGroqKey();
    } catch (error) {
        groqKeyError = getErrorMessage(error);
    }

    const {
        prompt,
        creativeKind,
        aspectRatio,
        googleAspectRatio,
        campaignType,
        demandGenFormat,
        count,
        platforms,
        style,
        textOnly,
        creativeTargets,
        assetRequests,
    } = request;

    const campaignTargetMode = creativeTargets.length > 0;
    const generateVariationMedia =
        !campaignTargetMode &&
        !textOnly &&
        creativeKind === "IMAGE" &&
        assetRequests.length === 0;

    const generationId = makeGenerationId();

    const shouldCreateGooglePack =
        platforms.includes("googleAds");

    const shouldCreateMetaPack =
        platforms.includes("metaAds");

    const website = safeWebsiteUrl(body);

    const businessName =
        body.brandContext?.businessName?.trim().slice(0, 120) ||
        "the advertiser";

    // Resolve only the provider/campaign/objective/format instruction documents
    // selected by the campaign builder. Requirement bundles include the exact
    // slot-specific instruction document where one is registered.
    const targetInstructionEntries = await Promise.all(
        creativeTargets.map(async (target) => [
            target.capabilityId,
            await resolveAiCreativeInstructionBundle(target),
        ] as const),
    );
    const instructionsByCapability = new Map(targetInstructionEntries);

    const requirementInstructionEntries = await Promise.all(
        assetRequests.map(async (assetRequest) => {
            const target = creativeTargets.find(
                (item) => item.capabilityId === assetRequest.capabilityId,
            );
            if (!target) {
                throw new Error(
                    `Unable to resolve instruction target for ${assetRequest.requirementId}.`,
                );
            }
            return [
                `${assetRequest.capabilityId}:${assetRequest.requirementId}`,
                await resolveAiCreativeInstructionBundle(target, assetRequest.requirementId),
            ] as const;
        }),
    );
    const instructionsByRequirement = new Map(requirementInstructionEntries);
    const instructionSummary = buildInstructionSummary({
        targets: creativeTargets,
        targetBundles: instructionsByCapability,
        requirementBundles: instructionsByRequirement,
    });

    const styleLabels = [
        style,
        `${style} - Minimal`,
        `${style} - Bold`,
    ];

    const previewLabels = [
        "Hero product story",
        "Lifestyle edit",
        "Offer-led concept",
    ];

    console.log("AI CREATIVE GENERATION STARTED:", {
        generationId,
        userId,
        requestedCount: count,
        creativeKind,
        campaignType,
        demandGenFormat,
        aspectRatio,
        googleAspectRatio,
        platforms,
        textOnly,
        imageProvider: IMAGE_PROVIDER,
        textModel: GROQ_TEXT_MODEL,
    });

    const results = await Promise.allSettled(
        Array.from({ length: campaignTargetMode ? 0 : count }, async (_, index) => {
            console.log(
                `[${generationId}] Variation ${index + 1} started.`,
            );

            // Step 1: Generate structured copy.
            if (!apiKey) {
                throw new Error(
                    groqKeyError ?? "Groq API key is unavailable.",
                );
            }

            const copy = await generateCopyVariation(
                apiKey,
                body,
                campaignType,
                demandGenFormat,
                index,
            );

            console.log(
                `[${generationId}] Variation ${index + 1}: copy generated.`,
            );

            // Step 2: Generate the primary image when requested.
            let primaryMedia: GeneratedMedia | null = null;

            if (generateVariationMedia) {

                const composedPrompt = buildCreativeImagePrompt({
                    creativeBrief: prompt,
                    productHint: body.brandContext?.productHint,
                    businessName,
                    style: styleLabels[index],
                    campaignType,
                    aspectRatio,
                });
                const seed =
                    (Date.now() + index) % 2_147_483_647;

                primaryMedia = await generateImageQueued(
                    composedPrompt,
                    aspectRatio,
                    seed,
                );

                console.log(
                    `[${generationId}] Variation ${index + 1}: primary image generated.`,
                );
            }

            // Step 3: Generate a separate Google-specific rendition
            // when the selected Google ratio differs from the primary ratio.
            let googleMedia: GeneratedMedia | null = primaryMedia;
            let googleMediaWarning: string | undefined;

            if (
                generateVariationMedia &&
                shouldCreateGooglePack &&
                googleAspectRatio !== aspectRatio
            ) {

                const googlePrompt = buildCreativeImagePrompt({
                    creativeBrief: prompt,
                    productHint: body.brandContext?.productHint,
                    businessName,
                    style: styleLabels[index],
                    campaignType,
                    aspectRatio: googleAspectRatio,
                });
                try {
                    googleMedia = await generateImageQueued(
                        googlePrompt,
                        googleAspectRatio,
                        (Date.now() + index + 10_000) % 2_147_483_647,
                    );

                    console.log(
                        `[${generationId}] Variation ${index + 1}: Google-specific image generated.`,
                    );
                } catch (error) {
                    googleMedia = null;

                    googleMediaWarning =
                        `Google-specific image generation failed: ${getErrorMessage(error)}`;

                    console.warn(
                        `[${generationId}] Variation ${index + 1}: ${googleMediaWarning}`,
                    );
                }
            }

            // Step 4: Build the Google Ads creative pack.
            const googlePack: GoogleCreativePack | undefined =
                shouldCreateGooglePack
                    ? buildGoogleCreativePack(
                        copy,
                        campaignType,
                        demandGenFormat,
                        website.url,
                        googleMedia,
                        [
                            website.warning,
                            googleMediaWarning,
                        ]
                            .filter(Boolean)
                            .join(" ") || undefined,
                    )
                    : undefined;

            // Step 5: Build the Meta Ads creative pack.
            const metaPack: MetaCreativePack | undefined =
                shouldCreateMetaPack
                    ? buildMetaCreativePack(
                        copy,
                        primaryMedia,
                        website.url,
                    )
                    : undefined;

            // Step 6: Build the variation.
            // No generated image means an empty URL, not a fake image.
            const variation: any = {
                id: `${generationId}-${index + 1}`,
                generationId,

                name: `${creativeKind === "IMAGE" ? "Image" : "Video"} concept ${index + 1}`,

                kind: creativeKind,

                prompt,

                headline: copy.headline,
                primaryText: copy.primaryText,
                callToAction: copy.callToAction,

                aspectRatio,
                googleAspectRatio,

                url: primaryMedia?.url ?? "",

                googleMediaUrl: googleMedia?.url ?? "",

                styleLabel: styleLabels[index] ?? style,
                previewLabel: previewLabels[index] ?? "Creative concept",

                generatedAt: new Date().toISOString(),

                media: primaryMedia,

                googlePack,
                metaPack,

                provider: "groq" as const,
                imageProvider: IMAGE_PROVIDER,

                status: "GENERATED" as const,
            } satisfies GeneratedVariation;

            console.log(
                `[${generationId}] Variation ${index + 1} completed.`,
                {
                    id: variation.id,
                    hasPrimaryMedia: Boolean(variation.media),
                    hasGoogleMedia: Boolean(googleMedia),
                    hasGooglePack: Boolean(variation.googlePack),
                    hasMetaPack: Boolean(variation.metaPack),
                    isPlaceholder: Boolean(
                        variation.media?.isPlaceholder,
                    ),
                },
            );

            return variation;
        }),
    );

    // Step 7: Collect successful variations and individual failures.
    const variations: GeneratedVariation[] = [];

    const errors: CreativeGenerationError[] = [];

    results.forEach((result, index) => {
        if (result.status === "fulfilled") {
            variations.push(result.value);
            return;
        }

        const message = getErrorMessage(result.reason);

        errors.push({
            variationIndex: index + 1,
            message,
            provider: "groq",
        });

        console.error(
            `[${generationId}] Variation ${index + 1} failed:`,
            message,
        );
    });

    /*if (variations.length === 0) {
        throw new Error(
            `AI creative generation failed. ${errors[0]?.message ?? "Unknown error."
            }`,
        );
    }*/

    /* -------------------------------------------------------------------------- */
    /* Generate requested campaign assets                                         */
    /* -------------------------------------------------------------------------- */
    /* -------------------------------------------------------------------------- */
    /* Generate campaign-targeted copy using only matching instruction records   */
    /* -------------------------------------------------------------------------- */

    const capabilityCopyResult = campaignTargetMode
        ? await generateCapabilitySpecificCopies({
            apiKey,
            apiKeyError: groqKeyError,
            brief: body,
            targets: creativeTargets,
            variationCount: count,
            campaignType,
            demandGenFormat,
            instructionsByCapability,
        })
        : {
            generatedCapabilityCopies: [] as GeneratedCapabilityCopy[],
            errors: [] as CreativeGenerationError[],
            successfulCopyVariations: 0,
            requestedCopyVariations: 0,
        };

    errors.push(...capabilityCopyResult.errors);

    /* -------------------------------------------------------------------------- */
    /* Generate requested campaign assets independently                          */
    /* -------------------------------------------------------------------------- */

    const campaignAssetResult = await generateCampaignAssets({
        generationId,
        prompt,
        productHint: body.brandContext?.productHint,
        businessName,
        style,
        creativeTargets,
        assetRequests,
        instructionBundlesByRequirement: instructionsByRequirement,
    });

    const requestedCount = campaignTargetMode
        ? capabilityCopyResult.requestedCopyVariations
        : count;
    const generatedCount = campaignTargetMode
        ? capabilityCopyResult.successfulCopyVariations
        : variations.length;
    const failedCount = campaignTargetMode
        ? capabilityCopyResult.errors.length
        : count - variations.length;

    const totalGeneratedCount =
        variations.length +
        capabilityCopyResult.successfulCopyVariations +
        campaignAssetResult.generatedAssetCount;

    const totalFailedCount =
        failedCount +
        campaignAssetResult.failedAssetCount;

    // Fail the request only when neither workflow produced any output.
    if (totalGeneratedCount === 0) {
        const firstError =
            errors[0]?.message ??
            campaignAssetResult.assetErrors[0]?.message ??
            "Unknown error.";

        throw new Error(
            `AI creative generation failed. ${firstError}`,
        );
    }

    // This now represents the overall generation result.
    const partialSuccess = totalFailedCount > 0;
    const generatedAt = new Date().toISOString();

    console.log("AI CREATIVE GENERATION COMPLETED:", {
        generationId,
        requested: requestedCount,
        generated: generatedCount,
        failed: failedCount,
        selectedTargets: creativeTargets.map((target) => target.capabilityId),
        matchedInstructionCount: instructionSummary.reduce(
            (total, item) => total + item.instructionCount,
            0,
        ),
        durationMs: Date.now() - startedAt,
    });

    return {
        generationId,

        // Existing creative concept response.
        variations,

        provider: "groq",
        model: GROQ_TEXT_MODEL,
        imageProvider: IMAGE_PROVIDER,

        generatedAt,
        expiresAt: null,

        requestedCount,
        generatedCount,
        failedCount,

        partialSuccess,
        errors,

        // Campaign-aware media and provider-specific copy.
        generatedAssets: campaignAssetResult.generatedAssets,
        generatedCapabilityCopies: capabilityCopyResult.generatedCapabilityCopies,
        brandIdentity: campaignTargetMode
            ? {
                businessName,
                // Keep the generated response aligned with CreativeBrandIdentity.
                // This value records that the identity came from the user; it is
                // not a claim that the business or website was independently verified.
                source: "USER_INPUT",
                ...(body.brandContext?.websiteUrl?.trim()
                    ? { websiteUrl: body.brandContext.websiteUrl.trim() }
                    : {}),
            }
            : null,
        instructionSummary,
        requestedAssetCount: campaignAssetResult.requestedAssetCount,
        generatedAssetCount: campaignAssetResult.generatedAssetCount,
        failedAssetCount: campaignAssetResult.failedAssetCount,
        assetErrors: campaignAssetResult.assetErrors,
    };
}

/* -------------------------------------------------------------------------- */
/* Generation ID                                                              */
/* -------------------------------------------------------------------------- */

export function makeGenerationId(): string {
    return `AIGEN-${randomUUID()}`;
}
