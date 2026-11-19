import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import {
    GoogleAdsLookupError,
    searchGoogleAdsLocations,
    getGoogleAdsLanguages,
    getGoogleAdsUserLists,
    getGoogleAdsCustomConversionGoals,
} from "../googleadsAPI/services/google-ads-lookups.service.js";
import CampaignModel, {
    type CampaignProviders,
    type AdvertisingProvider,
} from "../models/campaign.model.js";
import AdAccountModel from "../models/ad-account.model.js";
import {
    listMetaCustomAudiences,
    listMetaSavedAudiences,
} from "../metaadsAPI/services/targeting.js";
// import ProviderConnectionModel from "../models/provider-connection.model.js";
import {
    CampaignRequestValidationError,
    parseCreateCampaignRequest,
} from "../services/campaign-validation.service.js";
import {
    getGoogleAdsCreationContext,
    createGoogleAdsCampaignFlow,
    createGoogleAdsDisplayCampaignFlow
} from "../googleadsAPI/services/campaign-creation.js";
import {
    createMetaAdsCampaignForUser,
    createMetaAdsAdSet,
    createMetaAdsAdCreative,
    getMetaAdsCreationContext,
    MetaAdsCampaignCreationError,
    type CreateMetaAdsCampaignBundleInput,
    type CreateMetaAdsAdCreativeInput,
    type CreateMetaAdsAdSetInput,
    type MetaAdsCampaignObjective,
} from "../metaadsAPI/services/campaign-creation.js";
import type { CreateGoogleAdsDisplayCampaignFlowInput, CreateGoogleAdsSearchCampaignFlowInput } from "../../interfaces/campaign-creation.js";
import {
    searchMetaLocations,
    searchMetaDetailedTargeting,
    MetaTargetingSearchError,
} from "../metaadsAPI/services/targeting.js";
import {
    getCampaigns as getGoogleCampaigns,
    renameCampaign as renameGoogleCampaign,
    updateGoogleAdsStatus,
    removeGoogleAdsCampaign
} from "../googleadsAPI/services/campaign.js";

import {
    getCampaigns as getMetaCampaigns,
    renameCampaign as renameMetaCampaign,
    updateMetaAdsStatus,
    deleteMetaAdsCampaign
} from "../metaadsAPI/services/campaign.js";
import {
    createGoogleAdsImageAsset,
    GoogleAdsCreationError,
} from "../googleadsAPI/services/campaign-creation.js";
import multer from "multer";
import AssetModel from "../models/asset.model.js";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { resolveStoredAssetPath } from "../services/asset-storage.service.js";
import { uploadMetaAdsImageAsset } from "../metaadsAPI/services/meta-ads-image-upload.service.js";

const router = Router();

const googleDisplayImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
    },
    fileFilter: (_req, file, callback) => {
        const allowedTypes = ["image/jpeg", "image/png"];

        if (!allowedTypes.includes(file.mimetype)) {
            return callback(
                new Error("Only JPG and PNG images are supported."),
            );
        }

        callback(null, true);
    },
});

interface ProviderCampaignResult {
    success: boolean;
    accountId: string | null;
    data: unknown | null;
    error: string | null;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === "string") {
        return error;
    }

    return "An unexpected provider error occurred.";
}

function isRecord(
    value: unknown,
): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

async function readOwnedCampaignImageAsset(
    userId: string,
    assetId: string,
    options: { allowConvertibleImageFormats?: boolean } = {},
): Promise<{
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    width: number | null;
    height: number | null;
}> {
    const asset = await AssetModel.findOne({
        _id: assetId,
        ownerUserId: userId,
    })
        .select("+storageKey +storageProvider")
        .lean()
        .exec();

    if (!asset || !asset.storageKey) {
        throw new CampaignRequestValidationError(
            "The selected image is not available in your private Asset Library storage.",
        );
    }

    if (asset.storageProvider !== "LOCAL") {
        throw new CampaignRequestValidationError(
            "The selected image uses a storage provider that this campaign upload flow does not support yet.",
        );
    }

    const mimeType = String(asset.mimeType ?? "").trim().toLowerCase();
    const allowedMimeTypes = options.allowConvertibleImageFormats
        ? new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])
        : new Set(["image/jpeg", "image/png"]);

    if (!allowedMimeTypes.has(mimeType)) {
        throw new CampaignRequestValidationError(
            options.allowConvertibleImageFormats
                ? "Google Display accepts JPEG, PNG, WebP or GIF source images for conversion."
                : "Google Ads and Meta campaign image uploads currently support JPEG and PNG assets only.",
        );
    }

    let buffer: Buffer;

    try {
        buffer = await readFile(resolveStoredAssetPath(asset.storageKey));
    } catch {
        throw new CampaignRequestValidationError(
            "The selected image file could not be read from Asset Library storage.",
        );
    }

    if (!buffer.length) {
        throw new CampaignRequestValidationError(
            "The selected Asset Library image is empty.",
        );
    }

    let metadata: sharp.Metadata;

    try {
        metadata = await sharp(buffer, { animated: false, failOn: "error" }).metadata();
    } catch {
        throw new CampaignRequestValidationError(
            "The selected Asset Library file is not a valid readable image.",
        );
    }

    const expectedFormatByMime: Record<string, string> = {
        "image/jpeg": "jpeg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    };

    if (
        !metadata.width ||
        !metadata.height ||
        metadata.format !== expectedFormatByMime[mimeType]
    ) {
        throw new CampaignRequestValidationError(
            "The selected image content does not match its Asset Library file type.",
        );
    }

    const swapsDimensions = [5, 6, 7, 8].includes(metadata.orientation ?? 1);

    return {
        buffer,
        fileName: asset.originalFileName || asset.name || `asset-${assetId}`,
        mimeType,
        width: swapsDimensions ? metadata.height! : metadata.width,
        height: swapsDimensions ? metadata.width! : metadata.height,
    };
}

interface GoogleDisplayImageNormalizationResult {
    buffer: Buffer;
    fileName: string;
    mimeType: "image/jpeg";
    width: number;
    height: number;
    sourceWidth: number;
    sourceHeight: number;
}

/**
 * Google Responsive Display Ads require provider-specific image dimensions.
 * Crop/resize the user's selected private image into a derivative; never
 * change the original Asset Library file.
 */
async function normalizeGoogleDisplayImage(
    file: {
        buffer: Buffer;
        fileName: string;
    },
    role: "LANDSCAPE" | "SQUARE",
): Promise<GoogleDisplayImageNormalizationResult> {
    const target = role === "LANDSCAPE"
        ? { width: 1200, height: 628, minWidth: 600, minHeight: 314 }
        : { width: 1200, height: 1200, minWidth: 300, minHeight: 300 };

    let metadata: sharp.Metadata;

    try {
        metadata = await sharp(file.buffer, {
            animated: false,
            failOn: "error",
            limitInputPixels: 80_000_000,
        }).metadata();
    } catch {
        throw new CampaignRequestValidationError(
            `The selected ${role.toLowerCase()} image is not a valid supported image.`,
        );
    }

    if (
        !metadata.width ||
        !metadata.height ||
        !["jpeg", "png", "webp", "gif"].includes(metadata.format ?? "")
    ) {
        throw new CampaignRequestValidationError(
            "Google Display image sources must be valid JPEG, PNG, WebP or GIF files.",
        );
    }

    const swapsDimensions = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
    const sourceWidth = swapsDimensions ? metadata.height! : metadata.width;
    const sourceHeight = swapsDimensions ? metadata.width! : metadata.height;
    const targetRatio = target.width / target.height;

    // Calculate the crop area before processing so we never upscale an image
    // whose retained pixels would fall below Google's minimum dimensions.
    const cropWidth = Math.min(sourceWidth, sourceHeight * targetRatio);
    const cropHeight = Math.min(sourceHeight, sourceWidth / targetRatio);

    if (cropWidth < target.minWidth || cropHeight < target.minHeight) {
        throw new CampaignRequestValidationError(
            `The selected ${role.toLowerCase()} image is too small after cropping. Google requires at least ${target.minWidth}x${target.minHeight} pixels in this slot; the selected file is ${sourceWidth}x${sourceHeight}.`,
        );
    }

    const baseName = file.fileName.replace(/\.[^/.]+$/, "") || "display-image";
    const outputFileName = `${baseName}-${role.toLowerCase()}-google.jpg`;

    // Sharp's attention strategy keeps the most visually salient region near
    // the crop center. The original file remains untouched in Asset Library.
    const output = await sharp(file.buffer, {
        animated: false,
        failOn: "error",
        limitInputPixels: 80_000_000,
    })
        .rotate()
        .resize(target.width, target.height, {
            fit: "cover",
            position: sharp.strategy.attention,
        })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();

    if (!output.length || output.length > 5 * 1024 * 1024) {
        throw new CampaignRequestValidationError(
            `The normalized ${role.toLowerCase()} image exceeds Google's 5 MB image asset upload limit.`,
        );
    }

    const normalizedMetadata = await sharp(output).metadata();
    const width = normalizedMetadata.width ?? 0;
    const height = normalizedMetadata.height ?? 0;
    const normalizedRatio = width / Math.max(height, 1);
    const ratioTolerance = Math.abs(normalizedRatio / targetRatio - 1);

    if (
        width < target.minWidth ||
        height < target.minHeight ||
        ratioTolerance > 0.01
    ) {
        throw new CampaignRequestValidationError(
            `The normalized ${role.toLowerCase()} image does not meet Google's ${target.width}x${target.height} Responsive Display specification.`,
        );
    }

    return {
        buffer: output,
        fileName: outputFileName,
        mimeType: "image/jpeg",
        width,
        height,
        sourceWidth,
        sourceHeight,
    };
}

interface CampaignCreativeTargetReference {
    generationId: string;
    capabilityId: string;
    requirementId: string;
    role: string;
    assetIndex: number;
    platform: AdvertisingProvider;
}

function parseCampaignCreativeTarget(
    value: unknown,
    intendedPlatforms: AdvertisingProvider[],
    assetId: string,
): CampaignCreativeTargetReference | undefined {
    if (value === undefined || value === null) return undefined;

    if (!isRecord(value)) {
        throw new CampaignRequestValidationError(
            `Asset ${assetId} has an invalid campaignCreativeTarget object.`,
        );
    }

    const readRequiredString = (field: string, maxLength = 150): string => {
        const fieldValue = value[field];
        if (
            typeof fieldValue !== "string" ||
            !fieldValue.trim() ||
            fieldValue.trim().length > maxLength
        ) {
            throw new CampaignRequestValidationError(
                `Asset ${assetId} has an invalid campaignCreativeTarget.${field}.`,
            );
        }
        return fieldValue.trim();
    };

    const generationId = readRequiredString("generationId", 200);
    const capabilityId = readRequiredString("capabilityId");
    const requirementId = readRequiredString("requirementId");
    const role = readRequiredString("role", 64);
    const assetIndex = value.assetIndex;
    const platform = value.platform;

    if (
        typeof assetIndex !== "number" ||
        !Number.isSafeInteger(assetIndex) ||
        assetIndex < 0
    ) {
        throw new CampaignRequestValidationError(
            `Asset ${assetId} has an invalid campaignCreativeTarget.assetIndex.`,
        );
    }

    if (platform !== "googleAds" && platform !== "metaAds") {
        throw new CampaignRequestValidationError(
            `Asset ${assetId} has an unsupported campaignCreativeTarget.platform.`,
        );
    }

    if (!intendedPlatforms.includes(platform)) {
        throw new CampaignRequestValidationError(
            `Asset ${assetId} campaignCreativeTarget.platform must match one of its intended platforms.`,
        );
    }

    return {
        generationId,
        capabilityId,
        requirementId,
        role,
        assetIndex,
        platform,
    };
}

interface ResolvedCampaignAssetReference {
    assetId: string;
    name: string;
    kind: string;
    source: string;
    sourceUrl: string | null;
    contentUrl: string | null;
    storageReference: "ADSYNTRA_PRIVATE_STORAGE" | "ASSET_LIBRARY_RECORD";
    prompt: string | null;
    textContent: string | null;
    aspectRatio: string | null;
    intendedPlatforms: AdvertisingProvider[];
    providerUploadRequired: boolean;
    campaignCreativeTarget?: CampaignCreativeTargetReference;
    googlePack: unknown | null;
    providerAsset: Record<string, unknown> | null;
}

async function resolveCampaignAssetReferences(
    userId: string,
    rawReferences: unknown,
    selectedPlatforms: AdvertisingProvider[],
): Promise<ResolvedCampaignAssetReference[]> {
    if (rawReferences === undefined || rawReferences === null) return [];

    if (!Array.isArray(rawReferences) || rawReferences.length > 50) {
        throw new CampaignRequestValidationError(
            "creativeAssetReferences must be an array containing no more than 50 assets.",
        );
    }

    if (rawReferences.length === 0) return [];

    const requestedIds: string[] = [];
    const requestedPlatformsById = new Map<string, AdvertisingProvider[]>();
    const campaignCreativeTargetsById = new Map<
        string,
        CampaignCreativeTargetReference
    >();

    for (const [index, item] of rawReferences.entries()) {
        if (!isRecord(item)) {
            throw new CampaignRequestValidationError(
                `creativeAssetReferences[${index}] must be an object.`,
            );
        }

        const assetId = item.assetId;
        if (typeof assetId !== "string" || !/^[a-fA-F0-9]{24}$/.test(assetId)) {
            throw new CampaignRequestValidationError(
                `creativeAssetReferences[${index}].assetId must be a valid Asset Library ID.`,
            );
        }

        const normalizedId = assetId.toLowerCase();
        if (requestedPlatformsById.has(normalizedId)) {
            throw new CampaignRequestValidationError(
                `Asset ${assetId} was selected more than once.`,
            );
        }

        const rawTargets = item.intendedPlatforms;
        const targets = rawTargets === undefined
            ? selectedPlatforms
            : rawTargets;

        if (!Array.isArray(targets)) {
            throw new CampaignRequestValidationError(
                `creativeAssetReferences[${index}].intendedPlatforms must be an array.`,
            );
        }

        const intendedPlatforms: AdvertisingProvider[] = [];
        for (const target of targets) {
            if (
                target !== "googleAds" &&
                target !== "metaAds"
            ) {
                throw new CampaignRequestValidationError(
                    `creativeAssetReferences[${index}] contains an unsupported platform.`,
                );
            }

            if (!selectedPlatforms.includes(target)) {
                throw new CampaignRequestValidationError(
                    `Asset ${assetId} targets ${target}, but that platform is not selected for this campaign.`,
                );
            }

            if (!intendedPlatforms.includes(target)) intendedPlatforms.push(target);
        }

        const campaignCreativeTarget = parseCampaignCreativeTarget(
            item.campaignCreativeTarget,
            intendedPlatforms,
            assetId,
        );

        if (campaignCreativeTarget) {
            campaignCreativeTargetsById.set(normalizedId, campaignCreativeTarget);
        }

        requestedIds.push(assetId);
        requestedPlatformsById.set(normalizedId, intendedPlatforms);
    }

    const ownedAssets = await AssetModel.find({
        ownerUserId: userId,
        _id: { $in: requestedIds },
    })
        .select("+storageKey")
        .lean()
        .exec();

    const assetsById = new Map(
        ownedAssets.map((asset) => [String(asset._id).toLowerCase(), asset]),
    );

    if (assetsById.size !== requestedIds.length) {
        // Do not disclose whether a missing ID belongs to another user.
        throw new CampaignRequestValidationError(
            "One or more selected assets are unavailable in your Asset Library. Refresh the library and select them again.",
        );
    }

    return requestedIds.map((requestedId) => {
        const asset = assetsById.get(requestedId.toLowerCase())!;
        const assetRecord = asset as unknown as Record<string, unknown>;
        const storageKey = typeof assetRecord.storageKey === "string"
            ? assetRecord.storageKey
            : null;
        const id = String(asset._id);
        const kind = String(assetRecord.kind ?? "");
        const isBinaryMedia = ["IMAGE", "VIDEO", "LOGO"].includes(kind);

        const providerAsset = isRecord(assetRecord.providerAsset)
            ? assetRecord.providerAsset
            : null;

        const providerMediaUrl = providerAsset &&
            typeof providerAsset.mediaUrl === "string"
            ? providerAsset.mediaUrl
            : null;

        return {
            assetId: id,
            name: String(assetRecord.name ?? "Campaign asset"),
            kind,
            source: String(assetRecord.origin ?? "MANUAL"),
            // Never accept a source URL or storage URL supplied by the browser.
            sourceUrl: providerMediaUrl,
            contentUrl: storageKey ? `/api/assets/${id}/content` : null,
            storageReference: storageKey
                ? "ADSYNTRA_PRIVATE_STORAGE"
                : "ASSET_LIBRARY_RECORD",
            prompt: typeof assetRecord.prompt === "string" ? assetRecord.prompt : null,
            textContent: typeof assetRecord.textContent === "string"
                ? assetRecord.textContent
                : null,
            aspectRatio: typeof assetRecord.aspectRatio === "string"
                ? assetRecord.aspectRatio
                : null,
            intendedPlatforms: requestedPlatformsById.get(id.toLowerCase()) ?? selectedPlatforms,
            providerUploadRequired: Boolean(storageKey && isBinaryMedia),
            ...(campaignCreativeTargetsById.has(id.toLowerCase())
                ? {
                    campaignCreativeTarget: campaignCreativeTargetsById.get(
                        id.toLowerCase(),
                    )!,
                }
                : {}),
            googlePack: assetRecord.googlePack ?? null,
            providerAsset,
        };
    });
}

const GOOGLE_DISPLAY_CAMPAIGN_CREATIVE_CAPABILITY =
    "google-display-responsive-display";

const GOOGLE_DISPLAY_IMAGE_REQUIREMENT_ROLES = {
    "google-display-landscape-images": "LANDSCAPE",
    "google-display-square-images": "SQUARE",
} as const;

type GoogleDisplayImageRole = "LANDSCAPE" | "SQUARE";

type GoogleDisplayCampaignImageReference = ResolvedCampaignAssetReference & {
    campaignCreativeTarget: CampaignCreativeTargetReference;
};

function getGoogleDisplayCampaignImageReferences(
    references: ResolvedCampaignAssetReference[],
): {
    landscape: GoogleDisplayCampaignImageReference[];
    square: GoogleDisplayCampaignImageReference[];
} {
    const landscape: GoogleDisplayCampaignImageReference[] = [];
    const square: GoogleDisplayCampaignImageReference[] = [];
    const seenIndexes = new Set<string>();

    const displayReferences = references.filter((reference) => {
        const target = reference.campaignCreativeTarget;
        return (
            target?.platform === "googleAds" &&
            target.capabilityId === GOOGLE_DISPLAY_CAMPAIGN_CREATIVE_CAPABILITY
        );
    });

    for (const reference of displayReferences) {
        const target = reference.campaignCreativeTarget!;
        const expectedRole =
            GOOGLE_DISPLAY_IMAGE_REQUIREMENT_ROLES[
                target.requirementId as keyof typeof GOOGLE_DISPLAY_IMAGE_REQUIREMENT_ROLES
            ];

        if (!expectedRole) {
            throw new CampaignRequestValidationError(
                `Google Display campaign asset ${reference.assetId} has an unsupported image requirement: ${target.requirementId}.`,
            );
        }


        // The requirement ID is the authoritative mapping from the Creative
        // Studio request to the Google Ads landscape/square image field.

        if (reference.kind !== "IMAGE") {
            throw new CampaignRequestValidationError(
                `Google Display requirement ${target.requirementId} only accepts IMAGE assets.`,
            );
        }

        if (
            !reference.providerUploadRequired ||
            reference.storageReference !== "ADSYNTRA_PRIVATE_STORAGE" ||
            !reference.contentUrl
        ) {
            throw new CampaignRequestValidationError(
                `Google Display campaign asset ${reference.assetId} must be stored in the private AdSyntra Asset Library before provider upload.`,
            );
        }

        // Validate pixel dimensions from the actual binary after reading it.
        // Do not trust a stored aspectRatio label here: it is display metadata.

        const indexKey = `${expectedRole}:${target.assetIndex}`;
        if (seenIndexes.has(indexKey)) {
            throw new CampaignRequestValidationError(
                `Google Display ${expectedRole.toLowerCase()} asset index ${target.assetIndex} is duplicated.`,
            );
        }
        seenIndexes.add(indexKey);

        if (expectedRole === "LANDSCAPE") {
            landscape.push(reference);
        } else {
            square.push(reference);
        }
    }

    const byAssetIndex = (
        left: GoogleDisplayCampaignImageReference,
        right: GoogleDisplayCampaignImageReference,
    ) =>
        left.campaignCreativeTarget.assetIndex -
        right.campaignCreativeTarget.assetIndex;

    landscape.sort(byAssetIndex);
    square.sort(byAssetIndex);

    return { landscape, square };
}

function readGoogleAdsImageAssetResourceNames(
    value: unknown,
    fieldName: string,
): string[] {
    if (value === undefined || value === null) return [];

    if (
        !Array.isArray(value) ||
        !value.every(
            (resourceName) =>
                typeof resourceName === "string" && resourceName.trim().length > 0,
        )
    ) {
        throw new CampaignRequestValidationError(
            `${fieldName} must be an array of Google Ads Asset resource names.`,
        );
    }

    return value.map((resourceName: string) => resourceName.trim());
}

function validateGoogleAdsImageAssetResourceNames(
    customerId: string,
    resourceNames: string[],
    fieldName: string,
): void {
    const prefix = `customers/${customerId}/assets/`;

    for (const resourceName of resourceNames) {
        const assetId = resourceName.startsWith(prefix)
            ? resourceName.slice(prefix.length)
            : "";

        if (!/^\d+$/.test(assetId)) {
            throw new CampaignRequestValidationError(
                `${fieldName} contains an invalid Google Ads Asset resource name or an asset from another account.`,
            );
        }
    }
}

function requireConfigObject(
    value: unknown,
    fieldName: string,
): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new CampaignRequestValidationError(
            `${fieldName} must be an object.`,
        );
    }

    return value;
}

function getConfigValue(
    source: Record<string, unknown>,
    ...keys: string[]
): unknown {
    for (const key of keys) {
        if (
            source[key] !== undefined &&
            source[key] !== null
        ) {
            return source[key];
        }
    }

    return undefined;
}

function requireConfigString(
    source: Record<string, unknown>,
    keys: string[],
    fieldName: string,
): string {
    const value = getConfigValue(source, ...keys);

    if (typeof value !== "string" || !value.trim()) {
        throw new CampaignRequestValidationError(
            `${fieldName} is required.`,
        );
    }

    return value.trim();
}

function optionalConfigString(
    source: Record<string, unknown>,
    keys: string[],
    fieldName: string,
): string | undefined {
    const value = getConfigValue(source, ...keys);

    if (value === undefined || value === null || value === "") {
        return undefined;
    }

    if (typeof value !== "string") {
        throw new CampaignRequestValidationError(
            `${fieldName} must be a string.`,
        );
    }

    return value.trim() || undefined;
}

function optionalConfigNumber(
    source: Record<string, unknown>,
    keys: string[],
    fieldName: string,
): number | undefined {
    const value = getConfigValue(source, ...keys);

    if (value === undefined || value === null || value === "") {
        return undefined;
    }

    const numberValue =
        typeof value === "number" ? value : Number(value);

    if (!Number.isFinite(numberValue)) {
        throw new CampaignRequestValidationError(
            `${fieldName} must be a valid number.`,
        );
    }

    return numberValue;
}
function buildMetaCampaignBundleInput(
    campaignName: string,
    websiteUrl: string | null,
    providerObjective: string,
    configuration: any,
    execution: {
        validateOnly: boolean;
        confirm: boolean;
    },
    uploadedMetaImageHash?: string,
): any {
    const campaignConfig = requireConfigObject(
        configuration.campaign,
        "Meta Campaign configuration",
    );

    const adSetConfig: any = requireConfigObject(
        configuration.adSet,
        "Meta Ad Set configuration",
    );

    const adConfig: any = requireConfigObject(
        configuration.ad,
        "Meta Ad configuration",
    );

    // Support both a separate creative object and the existing
    // ad.creativeDraft builder structure.
    const rawCreative = getConfigValue(
        configuration,
        "creative",
    ) ?? adConfig.creativeDraft;

    const creativeConfig = requireConfigObject(
        rawCreative,
        "Meta Creative configuration",
    );

    // Campaign objective
    const objective = (
        getConfigValue(campaignConfig, "objective") ??
        providerObjective
    );

    if (
        typeof objective !== "string" ||
        !objective.trim()
    ) {
        throw new CampaignRequestValidationError(
            "Meta campaign objective is required.",
        );
    }

    // Budget level
    const rawBudgetLevel =
        getConfigValue(campaignConfig, "budgetLevel") ??
        "CAMPAIGN";

    if (
        rawBudgetLevel !== "CAMPAIGN" &&
        rawBudgetLevel !== "AD_SET"
    ) {
        throw new CampaignRequestValidationError(
            "Meta budgetLevel must be CAMPAIGN or AD_SET.",
        );
    }

    const budgetLevel = rawBudgetLevel;
    const requestedAdSetBudgetLevel =
        getConfigValue(adSetConfig, "budgetLevel");

    if (
        requestedAdSetBudgetLevel !== undefined &&
        requestedAdSetBudgetLevel !== budgetLevel
    ) {
        throw new CampaignRequestValidationError(
            "Meta Campaign and Ad Set budget levels must match.",
        );
    }

    // Buying type
    const buyingType = (
        getConfigValue(
            campaignConfig,
            "buyingType",
            "buying_type",
        ) ?? "AUCTION"
    );

    // Special Ad Categories
    const rawCategories = getConfigValue(
        campaignConfig,
        "specialAdCategories",
        "special_ad_categories",
    ) ?? [];

    if (!Array.isArray(rawCategories)) {
        throw new CampaignRequestValidationError(
            "Meta specialAdCategories must be an array.",
        );
    }

    const specialAdCategories = rawCategories as string[];

    // Currency is shared by campaign and Ad Set budget settings.
    const budgetCurrency =
        optionalConfigString(
            adSetConfig,
            ["budgetCurrency", "budget_currency"],
            "Meta Ad Set budget currency",
        ) ??
        optionalConfigString(
            campaignConfig,
            ["budgetCurrency", "budget_currency"],
            "Meta Campaign budget currency",
        );

    // Ad name
    const adName =
        optionalConfigString(
            adConfig,
            ["name"],
            "Meta Ad name",
        ) ?? `${campaignName} - Ad`;

    const creativeName =
        optionalConfigString(
            creativeConfig,
            ["name"],
            "Meta Creative name",
        ) ?? `${adName} Creative`;

    const destinationUrl =
        optionalConfigString(
            creativeConfig,
            ["destinationUrl", "destination_url"],
            "Meta Creative destination URL",
        ) ?? websiteUrl;

    if (!destinationUrl) {
        throw new CampaignRequestValidationError(
            "A Meta Creative destination URL is required.",
        );
    }

    const sharingSetting = getConfigValue(
        campaignConfig,
        "isAdsetBudgetSharingEnabled",
        "is_adset_budget_sharing_enabled",
    );

    if (
        sharingSetting !== undefined &&
        typeof sharingSetting !== "boolean"
    ) {
        throw new CampaignRequestValidationError(
            "Meta Ad Set budget-sharing setting must be a boolean.",
        );
    }

    const targeting = requireConfigObject(
        adSetConfig.targeting,
        "Meta Ad Set targeting",
    );

    const configuredImageUrl = optionalConfigString(
        creativeConfig,
        ["imageUrl", "image_url"],
        "Meta Creative image URL",
    );

    const configuredImageHash = optionalConfigString(
        creativeConfig,
        ["imageHash", "image_hash"],
        "Meta Creative image hash",
    );

    const creativeImageHash = uploadedMetaImageHash ?? configuredImageHash;

    if (
        !creativeImageHash &&
        !configuredImageUrl &&
        !execution.validateOnly
    ) {
        throw new CampaignRequestValidationError(
            "A Meta Creative image is required. Select an Asset Library image or provide an HTTPS image URL.",
        );
    }
    return {
        campaign: {
            name: campaignName,

            objective: objective as
                CreateMetaAdsCampaignBundleInput["campaign"]["objective"],

            buyingType: buyingType as
                CreateMetaAdsCampaignBundleInput["campaign"]["buyingType"],

            specialAdCategories,

            budgetLevel,

            dailyBudgetAmount: optionalConfigNumber(
                campaignConfig,
                ["dailyBudgetAmount", "daily_budget"],
                "Meta Campaign daily budget",
            ),

            lifetimeBudgetAmount: optionalConfigNumber(
                campaignConfig,
                ["lifetimeBudgetAmount", "lifetime_budget"],
                "Meta Campaign lifetime budget",
            ),

            budgetCurrency,

            bidStrategy: optionalConfigString(
                campaignConfig,
                ["bidStrategy", "bid_strategy"],
                "Meta Campaign bid strategy",
            ) as CreateMetaAdsCampaignBundleInput["campaign"]["bidStrategy"],

            isAdsetBudgetSharingEnabled:
                sharingSetting as boolean | undefined,

            startTime: optionalConfigString(
                campaignConfig,
                ["startTime", "start_time"],
                "Meta Campaign start time",
            ),

            stopTime: optionalConfigString(
                campaignConfig,
                ["stopTime", "stop_time"],
                "Meta Campaign stop time",
            ),

            validateOnly: execution.validateOnly,
            confirm: execution.confirm,
        },

        adSet: {
            name: requireConfigString(
                adSetConfig,
                ["name"],
                "Meta Ad Set name",
            ),

            campaignObjective: objective as
                CreateMetaAdsCampaignBundleInput["campaign"]["objective"],

            optimization_goal: requireConfigString(
                adSetConfig,
                ["optimization_goal", "optimizationGoal"],
                "Meta optimization goal",
            ),

            billing_event: requireConfigString(
                adSetConfig,
                ["billing_event", "billingEvent"],
                "Meta billing event",
            ),

            targeting: targeting as
                CreateMetaAdsCampaignBundleInput["adSet"]["targeting"],

            budgetLevel,

            budgetCurrency,

            specialAdCategories,

            dailyBudgetAmount: optionalConfigNumber(
                adSetConfig,
                ["dailyBudgetAmount", "daily_budget"],
                "Meta Ad Set daily budget",
            ),

            lifetimeBudgetAmount: optionalConfigNumber(
                adSetConfig,
                ["lifetimeBudgetAmount", "lifetime_budget"],
                "Meta Ad Set lifetime budget",
            ),

            bid_strategy: optionalConfigString(
                adSetConfig,
                ["bid_strategy", "bidStrategy"],
                "Meta Ad Set bid strategy",
            ) as CreateMetaAdsCampaignBundleInput["adSet"]["bid_strategy"],

            bidAmountInput: optionalConfigNumber(
                adSetConfig,
                ["bidAmountInput", "bid_amount"],
                "Meta bid amount",
            ),

            bid_constraints: getConfigValue(
                adSetConfig,
                "bid_constraints",
                "bidConstraints",
            ) as CreateMetaAdsCampaignBundleInput["adSet"]["bid_constraints"],

            destinationType: getConfigValue(
                adSetConfig,
                "destinationType",
                "destination_type",
            ) as CreateMetaAdsCampaignBundleInput["adSet"]["destinationType"],

            promoted_object: getConfigValue(
                adSetConfig,
                "promoted_object",
                "promotedObject",
            ) as CreateMetaAdsCampaignBundleInput["adSet"]["promoted_object"],

            placements: getConfigValue(
                adSetConfig,
                "placements",
            ) as CreateMetaAdsCampaignBundleInput["adSet"]["placements"],

            advantageAudience: getConfigValue(
                adSetConfig,
                "advantageAudience",
            ) as CreateMetaAdsCampaignBundleInput["adSet"]["advantageAudience"],

            attributionSpec: getConfigValue(
                adSetConfig,
                "attributionSpec",
                "attribution_spec",
            ) as CreateMetaAdsCampaignBundleInput["adSet"]["attributionSpec"],

            startTime: optionalConfigString(
                adSetConfig,
                ["startTime", "start_time"],
                "Meta Ad Set start time",
            ),

            endTime: optionalConfigString(
                adSetConfig,
                ["endTime", "end_time"],
                "Meta Ad Set end time",
            ),

            validateOnly: execution.validateOnly,
            confirm: execution.confirm,
        },

        creative: {
            name: creativeName,

            pageId: requireConfigString(
                creativeConfig,
                ["pageId", "page_id"],
                "Meta Facebook Page ID",
            ),

            instagramActorId: optionalConfigString(
                creativeConfig,
                ["instagramActorId", "instagram_actor_id"],
                "Meta Instagram Actor ID",
            ),

            primaryText: requireConfigString(
                creativeConfig,
                ["primaryText", "message"],
                "Meta Creative primary text",
            ),

            headline: requireConfigString(
                creativeConfig,
                ["headline", "name"],
                "Meta Creative headline",
            ),

            description: optionalConfigString(
                creativeConfig,
                ["description"],
                "Meta Creative description",
            ),

            imageUrl: configuredImageUrl,
            imageHash: creativeImageHash,
            destinationUrl,

            callToAction: requireConfigString(
                creativeConfig,
                ["callToAction", "call_to_action"],
                "Meta Creative call to action",
            ) as CreateMetaAdsCampaignBundleInput["creative"]["callToAction"],

            validateOnly: execution.validateOnly,
            confirm: execution.confirm,
        },

        ad: {
            name: adName,
        },
    };
}
const normalizeGoogleId = (value: unknown): string | null => {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }

    return value.trim().split("/").pop() || null;
};

const normalizeGoogleAccountId = (value: unknown): string => {
    return String(value ?? "")
        .replace(/^customers\//, "")
        .replace(/\D/g, "");
};

function normalizeMetaAccountId(value: unknown): string {
    return String(value ?? "")
        .trim()
        .replace(/^act_/i, "");
}

async function fetchProviderCampaigns(
    accountId: string | null | undefined,
    fetchCampaigns: (accountId: string) => Promise<unknown>,
): Promise<ProviderCampaignResult> {
    if (!accountId) {
        return {
            success: false,
            accountId: null,
            data: null,
            error: "No account selected for this provider.",
        };
    }

    try {
        const data = await fetchCampaigns(accountId);

        return {
            success: true,
            accountId,
            data,
            error: null,
        };
    } catch (error) {
        return {
            success: false,
            accountId,
            data: null,
            error: getErrorMessage(error),
        };
    }
}
async function getSelectedMetaAccountId(
    userId: string,
): Promise<string | null> {
    const account = await AdAccountModel.findOne({
        userId,
        provider: "metaAds",
        status: "active",
        isSelected: true,
    })
        .select("externalAccountId")
        .lean();

    return account?.externalAccountId ?? null;
}

const mergeGoogleCampaigns = (
    apiCampaigns: any[],
    savedCampaigns: any[],
    accountId: string
) => {
    const normalizedAccountId =
        normalizeGoogleAccountId(accountId);

    const savedCampaignMap = new Map<string, any>();

    for (const saved of savedCampaigns) {
        const googleProvider = saved.providers?.googleAds;

        if (!googleProvider) continue;

        const savedAccountId = normalizeGoogleAccountId(
            googleProvider.accountId
        );

        if (savedAccountId !== normalizedAccountId) continue;

        const campaignId = normalizeGoogleId(
            googleProvider?.providerCampaignId
        );

        if (campaignId) {
            savedCampaignMap.set(campaignId, saved);
        }
    }

    return apiCampaigns.map((apiCampaign) => {
        const saved = savedCampaignMap.get(
            normalizeGoogleId(apiCampaign.id) ?? ""
        );

        const googleProvider = saved?.providers?.googleAds;

        if (!saved) {
            return {
                ...apiCampaign,
                source: "external",
            };
        }

        return {
            ...apiCampaign,

            // MongoDB metadata
            objective:
                saved.objective ??
                googleProvider?.providerObjective ??
                apiCampaign.objective,

            businessName: saved.businessName ?? null,
            websiteUrl: saved.websiteUrl ?? null,
            description: saved.description ?? null,

            providerCampaignType:
                googleProvider?.providerCampaignType ?? null,

            source: "platform",
        };
    });
};

router.get(
    "/meta/targeting/locations",
    async (req: any, res: Response) => {
        // 1. Get authenticated Clerk user
        const { userId } = getAuth(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
        }

        try {
            // 2. Read query parameters safely
            const query =
                typeof req.query.query === "string"
                    ? req.query.query
                    : "";

            const type =
                typeof req.query.type === "string"
                    ? req.query.type
                    : "";

            const countryCode =
                typeof req.query.countryCode === "string"
                    ? req.query.countryCode
                    : undefined;

            const regionId =
                typeof req.query.regionId === "string"
                    ? req.query.regionId
                    : undefined;

            const after =
                typeof req.query.after === "string"
                    ? req.query.after
                    : undefined;

            const limit =
                typeof req.query.limit === "string"
                    ? Number(req.query.limit)
                    : 25;

            // 3. Execute Meta location search
            const result = await searchMetaLocations(
                userId,
                {
                    query,
                    type,
                    countryCode,
                    regionId,
                    limit,
                    after,
                },
            );

            return res.status(200).json({
                success: true,
                data: result,
            });
        } catch (error) {
            const statusCode =
                error instanceof MetaTargetingSearchError
                    ? error.statusCode
                    : 502;

            console.error(
                "Meta targeting location route error:",
                getErrorMessage(error),
            );

            return res.status(statusCode).json({
                success: false,
                message: getErrorMessage(error),
            });
        }
    },
);

// ==========================================
// GOOGLE DISPLAY IMAGE ASSET UPLOAD
// ==========================================

router.post(
    "/google/display/assets/upload",

    // Multipart image upload.
    (req, res, next) => {
        googleDisplayImageUpload.single("image")(
            req,
            res,
            (error) => {
                if (error) {
                    return res.status(400).json({
                        success: false,
                        message: getErrorMessage(error),
                    });
                }

                next();
            },
        );
    },

    async (req: Request, res: Response) => {
        try {
            // 1. Clerk authentication.
            const { userId } = getAuth(req);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required.",
                });
            }

            // 2. Validate uploaded image.
            const file = req.file;

            if (!file) {
                return res.status(400).json({
                    success: false,
                    message: 'Upload an image using the "image" field.',
                });
            }

            // 3. Validate account and image role.
            const accountId =
                typeof req.body.accountId === "string"
                    ? req.body.accountId.trim()
                    : "";

            const role =
                typeof req.body.role === "string"
                    ? req.body.role.trim().toUpperCase()
                    : "";

            if (!accountId) {
                return res.status(400).json({
                    success: false,
                    message: "Google Ads account ID is required.",
                });
            }

            if (!["LANDSCAPE", "SQUARE"].includes(role)) {
                return res.status(400).json({
                    success: false,
                    message: "Image role must be LANDSCAPE or SQUARE.",
                });
            }

            // 4. Verify the account belongs to the authenticated user
            // and is the currently selected Google Ads account.
            const selectedAccount = await AdAccountModel.findOne({
                userId,
                provider: "googleAds",
                isSelected: true,
            })
                .select("externalAccountId")
                .lean();

            if (!selectedAccount?.externalAccountId) {
                return res.status(409).json({
                    success: false,
                    message: "No Google Ads account is currently selected.",
                });
            }

            if (
                normalizeGoogleAccountId(
                    selectedAccount.externalAccountId,
                ) !== normalizeGoogleAccountId(accountId)
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        "The selected Google Ads account has changed. Refresh the campaign builder and try again.",
                });
            }

            // 5. Get the Google Ads context for this exact account.
            const context = await getGoogleAdsCreationContext(
                userId,
                selectedAccount.externalAccountId,
            );

            // 6. Prepare a descriptive asset name.
            const suppliedName =
                typeof req.body.name === "string"
                    ? req.body.name.trim()
                    : "";

            const originalName = file.originalname.replace(
                /\.[^/.]+$/,
                "",
            );

            const assetName =
                suppliedName ||
                originalName ||
                `Display ${role} Image`;

            // 7. Upload the real image to Google Ads.
            // This is a live external mutation, so require explicit
            // confirmation from the upload action.
            if (
                req.body.confirm !== true &&
                req.body.confirm !== "true"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Confirm the Google Ads image upload before continuing.",
                });
            }

            const normalizedImage = await normalizeGoogleDisplayImage(
                {
                    buffer: file.buffer,
                    fileName: file.originalname,
                },
                role as GoogleDisplayImageRole,
            );

            const result = await createGoogleAdsImageAsset(
                context,
                {
                    buffer: normalizedImage.buffer,
                    name: `${assetName} - ${role}`,
                    originalName: normalizedImage.fileName,
                    validateOnly: false,
                    confirm: true,
                },
            );

            if (!result.resourceName) {
                throw new Error(
                    "Google Ads did not return an image asset resource name.",
                );
            }

            // 8. Return the exact resource name for campaign creation.
            return res.status(201).json({
                success: true,
                message: `${role} image uploaded to Google Ads successfully.`,
                accountId: selectedAccount.externalAccountId,
                asset: {
                    role,
                    name: assetName,
                    resourceName: result.resourceName,
                    resourceId: result.resourceId,
                    mimeType: normalizedImage.mimeType,
                    fileSize: normalizedImage.buffer.length,
                    width: normalizedImage.width,
                    height: normalizedImage.height,
                },
            });
        } catch (error) {
            console.error(
                "Google Display image upload failed:",
                getErrorMessage(error),
            );

            const statusCode =
                error instanceof GoogleAdsCreationError
                    ? error.statusCode
                    : 502;

            return res.status(statusCode).json({
                success: false,
                message: getErrorMessage(error),
            });
        }
    },
);

/**
 * Create a Campaign
 */
router.post("/", async (req: Request, res: Response) => {
    try {
        const auth = getAuth(req);
        const { userId } = auth;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
        }

        const request: any = parseCreateCampaignRequest(req.body);
        const rawBody: any = isRecord(req.body) ? req.body : {};
        const selectedAssetReferences = await resolveCampaignAssetReferences(
            userId,
            rawBody.creativeAssetReferences,
            request.platforms,
        );

        // Persist provider-specific references inside each provider's existing
        // Mixed configuration object. This keeps the current Campaign schema intact.
        for (const provider of request.platforms as AdvertisingProvider[]) {
            const providerRequest = request.providers[provider];
            if (!providerRequest) continue;

            providerRequest.configuration = {
                ...providerRequest.configuration,
                creativeAssetReferences: selectedAssetReferences.filter((reference) =>
                    reference.intendedPlatforms.includes(provider),
                ),
            };
        }

        const executionConfig: any =
            rawBody.execution === undefined
                ? {}
                : requireConfigObject(
                    rawBody.execution,
                    "execution",
                );

        const validateOnly =
            executionConfig.validateOnly ?? true;

        const confirm =
            executionConfig.confirm ?? false;

        if (
            typeof validateOnly !== "boolean" ||
            typeof confirm !== "boolean"
        ) {
            throw new CampaignRequestValidationError(
                "execution.validateOnly and execution.confirm must be booleans.",
            );
        }

        const execution = {
            validateOnly,
            confirm,
        };
        const providerDocuments: CampaignProviders = {};

        for (const provider of request.platforms) {
            const providerRequest = request.providers[provider];

            if (!providerRequest) continue;

            providerDocuments[provider as AdvertisingProvider] = {
                accountId: providerRequest.accountId,
                providerObjective: providerRequest.providerObjective,
                providerCampaignType: providerRequest.providerCampaignType,
                requestedProviderApiTarget:
                    providerRequest.requestedProviderApiTarget ?? null,
                configuration: providerRequest.configuration,
                creationStatus: "pending",
                deliveryStatus: "PAUSED",
                resources: [],
                lastError: null,
                lastSyncedAt: null,
            };
        }

        const campaign: any = await CampaignModel.create({
            ownerUserId: userId,
            contractVersion: "1.0",
            name: request.name,
            businessName: request.businessName,
            websiteUrl: request.websiteUrl,
            description: request.description,
            objective: request.objective,
            platforms: request.platforms,
            providers: providerDocuments,
        });

        // ==========================================
        // GLOBAL PROVIDER CAMPAIGN EXECUTION
        // ==========================================

        const providerResults: Record<string, unknown> = {};

        // ==========================================
        // GOOGLE ADS SEARCH CAMPAIGN EXECUTION
        // ==========================================

        if (request.platforms.includes("googleAds")) {
            const googleRequest = request.providers.googleAds;
            const uploadedGoogleDisplayAssets: Array<{
                assetId: string;
                role: GoogleDisplayImageRole;
                resourceName: string;
                resourceId: string | null;
            }> = [];

            try {
                if (!googleRequest) {
                    throw new Error("Google Ads provider configuration is missing.");
                }

                // Current Google campaign flow supports Search and Display campaigns.
                const campaignType =
                    googleRequest.providerCampaignType.trim().toUpperCase();

                // // 1. Get authenticated Google Ads context.
                const context = await getGoogleAdsCreationContext(
                    userId,
                    googleRequest.accountId,
                );

                // 2. Apply global execution controls.
                const flowInput: Record<string, unknown> = {
                    ...(googleRequest.configuration as Record<string, unknown>),
                    validateOnly: execution.validateOnly,
                    confirm: execution.confirm,
                };

                // Campaign-generated Display images are stored privately in the
                // AdSyntra Asset Library. Upload them to this selected Google Ads
                // account before the Display campaign flow uses their resource names.
                // VALIDATE_ONLY deliberately does not upload assets or mutate Google Ads.
                if (campaignType === "DISPLAY") {
                    const displayDraft = isRecord(flowInput.adCreativeDraft)
                        ? flowInput.adCreativeDraft
                        : null;

                    if (!displayDraft) {
                        throw new CampaignRequestValidationError(
                            "Google Display requires an adCreativeDraft object.",
                        );
                    }

                    const existingImageAssets = isRecord(displayDraft.imageAssets)
                        ? displayDraft.imageAssets
                        : {};

                    const displayCampaignImages =
                        getGoogleDisplayCampaignImageReferences(selectedAssetReferences);

                    const existingLandscapeResourceNames =
                        readGoogleAdsImageAssetResourceNames(
                            existingImageAssets.marketingImageAssetResourceNames,
                            "Display landscape image assets",
                        );
                    const existingSquareResourceNames =
                        readGoogleAdsImageAssetResourceNames(
                            existingImageAssets.squareMarketingImageAssetResourceNames,
                            "Display square image assets",
                        );

                    // Validate pre-uploaded IDs before creating any new Google Ads
                    // assets, so an account mismatch cannot leave avoidable orphan assets.
                    validateGoogleAdsImageAssetResourceNames(
                        context.customerId,
                        existingLandscapeResourceNames,
                        "Display landscape image assets",
                    );
                    validateGoogleAdsImageAssetResourceNames(
                        context.customerId,
                        existingSquareResourceNames,
                        "Display square image assets",
                    );

                    const plannedLandscapeCount =
                        existingLandscapeResourceNames.length +
                        displayCampaignImages.landscape.length;
                    const plannedSquareCount =
                        existingSquareResourceNames.length +
                        displayCampaignImages.square.length;

                    if (
                        plannedLandscapeCount + plannedSquareCount > 15
                    ) {
                        throw new CampaignRequestValidationError(
                            "Responsive Display Ads support a maximum of 15 combined landscape and square marketing images.",
                        );
                    }

                    if (
                        displayCampaignImages.landscape.length > 0 ||
                        displayCampaignImages.square.length > 0
                    ) {
                        if (
                            !execution.validateOnly &&
                            (plannedLandscapeCount === 0 || plannedSquareCount === 0)
                        ) {
                            throw new CampaignRequestValidationError(
                                "Live Google Display creation requires at least one landscape and one square Google Ads Asset. Attach both campaign-generated image requirements or provide an existing uploaded Google Ads asset for the missing role.",
                            );
                        }

                        let uploadedLandscapeResourceNames: string[] = [];
                        let uploadedSquareResourceNames: string[] = [];

                        if (execution.validateOnly) {
                            // The Display flow only checks that both draft references
                            // are present in VALIDATE_ONLY mode; it omits the Responsive
                            // Display Ad mutation until actual Google Asset IDs exist.
                            const landscapeReference = displayCampaignImages.landscape[0];
                            const squareReference = displayCampaignImages.square[0];

                            flowInput.adCreativeDraft = {
                                ...displayDraft,
                                imageAssets: {
                                    ...existingImageAssets,
                                    landscapeImageUrl:
                                        typeof existingImageAssets.landscapeImageUrl === "string" &&
                                        existingImageAssets.landscapeImageUrl.trim()
                                            ? existingImageAssets.landscapeImageUrl.trim()
                                            : landscapeReference?.contentUrl ??
                                                existingLandscapeResourceNames[0] ??
                                                "",
                                    squareImageUrl:
                                        typeof existingImageAssets.squareImageUrl === "string" &&
                                        existingImageAssets.squareImageUrl.trim()
                                            ? existingImageAssets.squareImageUrl.trim()
                                            : squareReference?.contentUrl ??
                                                existingSquareResourceNames[0] ??
                                                "",
                                    // The selected private campaign images have not been
                                    // uploaded in VALIDATE_ONLY mode. Leave both provider
                                    // asset lists empty so the flow accurately reports that
                                    // Responsive Display Ad validation is still pending.
                                    marketingImageAssetResourceNames: [],
                                    squareMarketingImageAssetResourceNames: [],
                                },
                            };
                        } else {
                            if (execution.confirm !== true) {
                                throw new CampaignRequestValidationError(
                                    "Live Google Display image uploads require execution.confirm:true.",
                                );
                            }

                            // Validate the campaign, budget, Ad Group and targeting with
                            // Google before uploading any private media. The Responsive
                            // Display Ad itself remains pending because these private
                            // images do not have Google Asset resource names yet.
                            const preflightLandscapeReference =
                                displayCampaignImages.landscape[0];
                            const preflightSquareReference =
                                displayCampaignImages.square[0];

                            const preflightInput = {
                                ...flowInput,
                                validateOnly: true,
                                confirm: false,
                                adCreativeDraft: {
                                    ...displayDraft,
                                    imageAssets: {
                                        ...existingImageAssets,
                                        landscapeImageUrl:
                                            typeof existingImageAssets.landscapeImageUrl === "string" &&
                                            existingImageAssets.landscapeImageUrl.trim()
                                                ? existingImageAssets.landscapeImageUrl.trim()
                                                : preflightLandscapeReference?.contentUrl ??
                                                    existingLandscapeResourceNames[0] ??
                                                    "",
                                        squareImageUrl:
                                            typeof existingImageAssets.squareImageUrl === "string" &&
                                            existingImageAssets.squareImageUrl.trim()
                                                ? existingImageAssets.squareImageUrl.trim()
                                                : preflightSquareReference?.contentUrl ??
                                                    existingSquareResourceNames[0] ??
                                                    "",
                                        marketingImageAssetResourceNames: [],
                                        squareMarketingImageAssetResourceNames: [],
                                    },
                                },
                            };

                            await createGoogleAdsDisplayCampaignFlow(
                                context,
                                preflightInput as unknown as CreateGoogleAdsDisplayCampaignFlowInput,
                            );

                            // Read and validate all private files before performing the
                            // first Google Ads asset mutation, reducing avoidable partial uploads.
                            const pendingUploads: Array<{
                                reference: GoogleDisplayCampaignImageReference;
                                role: GoogleDisplayImageRole;
                                file: Awaited<ReturnType<typeof readOwnedCampaignImageAsset>>;
                            }> = [];

                            for (const [role, referencesForRole] of [
                                ["LANDSCAPE", displayCampaignImages.landscape],
                                ["SQUARE", displayCampaignImages.square],
                            ] as const) {
                                for (const reference of referencesForRole) {
                                    const sourceFile = await readOwnedCampaignImageAsset(
                                        userId,
                                        reference.assetId,
                                        { allowConvertibleImageFormats: true },
                                    );

                                    const normalizedImage = await normalizeGoogleDisplayImage(
                                        {
                                            buffer: sourceFile.buffer,
                                            fileName: sourceFile.fileName,
                                        },
                                        role,
                                    );

                                    pendingUploads.push({
                                        reference,
                                        role,
                                        file: {
                                            ...sourceFile,
                                            buffer: normalizedImage.buffer,
                                            fileName: normalizedImage.fileName,
                                            mimeType: normalizedImage.mimeType,
                                            width: normalizedImage.width,
                                            height: normalizedImage.height,
                                        },
                                    });
                                }
                            }

                            for (const pendingUpload of pendingUploads) {
                                const uploadResult = await createGoogleAdsImageAsset(
                                    context,
                                    {
                                        buffer: pendingUpload.file.buffer,
                                        name: `${request.name} - ${pendingUpload.role} - ${pendingUpload.reference.campaignCreativeTarget.assetIndex + 1}`,
                                        originalName: pendingUpload.file.fileName,
                                        validateOnly: false,
                                        confirm: true,
                                    },
                                );

                                if (!uploadResult.resourceName) {
                                    throw new GoogleAdsCreationError(
                                        `Google Ads did not return the ${pendingUpload.role.toLowerCase()} image asset resource name.`,
                                        502,
                                        uploadResult.googleResponse,
                                    );
                                }

                                const uploadedAsset = {
                                    assetId: pendingUpload.reference.assetId,
                                    role: pendingUpload.role,
                                    resourceName: uploadResult.resourceName,
                                    resourceId: uploadResult.resourceId,
                                };

                                uploadedGoogleDisplayAssets.push(uploadedAsset);

                                if (pendingUpload.role === "LANDSCAPE") {
                                    uploadedLandscapeResourceNames.push(
                                        uploadResult.resourceName,
                                    );
                                } else {
                                    uploadedSquareResourceNames.push(
                                        uploadResult.resourceName,
                                    );
                                }
                            }

                            flowInput.adCreativeDraft = {
                                ...displayDraft,
                                imageAssets: {
                                    ...existingImageAssets,
                                    marketingImageAssetResourceNames: [
                                        ...existingLandscapeResourceNames,
                                        ...uploadedLandscapeResourceNames,
                                    ],
                                    squareMarketingImageAssetResourceNames: [
                                        ...existingSquareResourceNames,
                                        ...uploadedSquareResourceNames,
                                    ],
                                },
                            };
                        }
                    }
                }

                // 3. Dispatch to the correct campaign workflow.
                let result: any;

                if (campaignType === "SEARCH") {
                    result = await createGoogleAdsCampaignFlow(
                        context,
                        flowInput as CreateGoogleAdsSearchCampaignFlowInput,
                    );
                } else if (campaignType === "DISPLAY") {
                    result = await createGoogleAdsDisplayCampaignFlow(
                        context,
                        flowInput as CreateGoogleAdsDisplayCampaignFlowInput,
                    );
                } else {
                    throw new Error(
                        `Google Ads ${campaignType} campaign creation is not yet connected to the global execution route.`,
                    );
                }



                // 3. Execute the complete Google Search campaign flow.

                // const result = await createGoogleAdsCampaignFlow(context, flowInput);

                const googleProvider = campaign.providers.googleAds;

                if (!googleProvider) {
                    throw new Error("Google Ads campaign data was not initialized.");
                }

                // 4. Update provider creation status.

                googleProvider.creationStatus = result.validateOnly
                    ? "validated"
                    : "created";

                googleProvider.lastError = null;

                // 5. Save real resources only after live creation.

                /*if (!result.validateOnly && result.createdResources) {
                    const resources = result.createdResources;

                    googleProvider.providerCampaignResourceName = resources.campaign;

                    googleProvider.providerCampaignId =
                        resources.campaign.split("/").at(-1) ?? null;

                    googleProvider.providerStatus = "PAUSED";
                    googleProvider.deliveryStatus = "PAUSED";
                    googleProvider.lastSyncedAt = new Date();

                    googleProvider.resources = [
                        {
                            resourceType: "campaignBudget",
                            resourceName: resources.budget,
                        },
                        {
                            resourceType: "campaign",
                            resourceName: resources.campaign,
                        },
                        {
                            resourceType: "adGroup",
                            resourceName: resources.adGroup,
                        },
                        ...resources.locationCriteria.map((resourceName: any) => ({
                            resourceType: "locationCriterion",
                            resourceName,
                        })),
                        ...resources.positiveKeywords.map((resourceName: any) => ({
                            resourceType: "positiveKeyword",
                            resourceName,
                        })),
                        ...resources.negativeKeywords.map((resourceName: any) => ({
                            resourceType: "negativeKeyword",
                            resourceName,
                        })),
                        {
                            resourceType: "responsiveSearchAd",
                            resourceName: resources.responsiveSearchAd,
                        },
                    ];
                }*/

                if (!result.validateOnly && result.createdResources) {
                    const resources = result.createdResources;

                    googleProvider.providerCampaignResourceName =
                        resources.campaign;

                    googleProvider.providerCampaignId =
                        resources.campaign.split("/").at(-1) ?? null;

                    googleProvider.providerStatus = "PAUSED";
                    googleProvider.deliveryStatus = "PAUSED";
                    googleProvider.lastSyncedAt = new Date();

                    const savedResources: Array<{
                        resourceType: string;
                        resourceName: string;
                    }> = [
                            {
                                resourceType: "campaignBudget",
                                resourceName: resources.budget,
                            },
                            {
                                resourceType: "campaign",
                                resourceName: resources.campaign,
                            },
                        ];

                    if (campaignType === "SEARCH") {
                        savedResources.push(
                            {
                                resourceType: "adGroup",
                                resourceName: resources.adGroup,
                            },
                            ...resources.locationCriteria.map(
                                (resourceName: string) => ({
                                    resourceType: "locationCriterion",
                                    resourceName,
                                }),
                            ),
                            ...resources.positiveKeywords.map(
                                (resourceName: string) => ({
                                    resourceType: "positiveKeyword",
                                    resourceName,
                                }),
                            ),
                            ...resources.negativeKeywords.map(
                                (resourceName: string) => ({
                                    resourceType: "negativeKeyword",
                                    resourceName,
                                }),
                            ),
                            {
                                resourceType: "responsiveSearchAd",
                                resourceName: resources.responsiveSearchAd,
                            },
                        );
                    }

                    if (campaignType === "DISPLAY") {
                        savedResources.push(
                            {
                                resourceType: "adGroup",
                                resourceName: resources.adGroup,
                            },
                            ...resources.locationCriteria.map(
                                (resourceName: string) => ({
                                    resourceType: "locationCriterion",
                                    resourceName,
                                }),
                            ),
                            ...resources.languageCriteria.map(
                                (resourceName: string) => ({
                                    resourceType: "languageCriterion",
                                    resourceName,
                                }),
                            ),
                            ...resources.audienceCriteria.map(
                                (resourceName: string) => ({
                                    resourceType: "audienceCriterion",
                                    resourceName,
                                }),
                            ),
                        );

                        if (resources.responsiveDisplayAd) {
                            savedResources.push({
                                resourceType: "responsiveDisplayAd",
                                resourceName: resources.responsiveDisplayAd,
                            });
                        }
                    }

                    if (campaignType === "DISPLAY") {
                        savedResources.push(
                            ...uploadedGoogleDisplayAssets.map((asset) => ({
                                resourceType: "imageAsset",
                                resourceName: asset.resourceName,
                            })),
                        );
                    }

                    googleProvider.resources = savedResources;
                }

                if (campaignType === "DISPLAY") {
                    const existingConfiguration = isRecord(googleProvider.configuration)
                        ? googleProvider.configuration
                        : {};
                    googleProvider.configuration = {
                        ...existingConfiguration,
                        googleDisplayUploadedAssets: uploadedGoogleDisplayAssets,
                    };
                    campaign.markModified("providers.googleAds.configuration");
                }

                campaign.markModified("providers.googleAds");

                await campaign.save();

                // 6. Return Google provider result.

                providerResults[`googleAds`] = {
                    success: true,
                    accountId: googleRequest.accountId,
                    creationStatus: googleProvider.creationStatus,
                    validateOnly: result.validateOnly,
                    operationCount: result.operationCount,
                    temporaryResourceNames: result.temporaryResourceNames,
                    createdResources: result.createdResources,
                    googleResponse: result.googleResponse,
                    assetUploadRequired: result.assetUploadRequired ?? false,
                    uploadedImageAssets: uploadedGoogleDisplayAssets,
                    validationWarnings: result.validationWarnings ?? [],
                };
            } catch (error) {
                const message = getErrorMessage(error);

                const googleError = error as {
                    statusCode?: unknown;
                    details?: unknown;
                };

                const providerStatusCode =
                    typeof googleError.statusCode === "number"
                        ? googleError.statusCode
                        : null;

                const providerErrorDetails =
                    googleError.details ?? null;

                const googleProvider = campaign.providers.googleAds;

                if (googleProvider) {
                    if (uploadedGoogleDisplayAssets.length > 0) {
                        const existingConfiguration = isRecord(googleProvider.configuration)
                            ? googleProvider.configuration
                            : {};
                        googleProvider.configuration = {
                            ...existingConfiguration,
                            googleDisplayUploadedAssets: uploadedGoogleDisplayAssets,
                        };
                        campaign.markModified("providers.googleAds.configuration");

                        const existingResources = Array.isArray(googleProvider.resources)
                            ? googleProvider.resources
                            : [];
                        const existingResourceNames = new Set(
                            existingResources.map((resource: any) => resource.resourceName),
                        );

                        googleProvider.resources = [
                            ...existingResources,
                            ...uploadedGoogleDisplayAssets
                                .filter((asset) => !existingResourceNames.has(asset.resourceName))
                                .map((asset) => ({
                                    resourceType: "imageAsset",
                                    resourceName: asset.resourceName,
                                })),
                        ];
                    }

                    googleProvider.creationStatus = "failed";
                    googleProvider.lastError = message;

                    campaign.markModified("providers.googleAds");

                    await campaign.save();
                }

                providerResults[`googleAds`] = {
                    success: false,
                    accountId: googleRequest?.accountId ?? null,
                    creationStatus: "failed",
                    error: message,
                    providerStatusCode,
                    providerErrorDetails,
                    uploadedImageAssets: uploadedGoogleDisplayAssets,
                };
            }
        }

        // ==========================================
        // META ADS — CAMPAIGN CREATION EXECUTION
        // ==========================================

        if (request.platforms.includes("metaAds")) {
            const metaRequest = request.providers.metaAds;
            const metaProvider = campaign.providers.metaAds;

            try {
                if (!metaRequest || !metaProvider) {
                    throw new Error(
                        "Meta Ads provider configuration is missing.",
                    );
                }

                // 1. Verify that the submitted account belongs to this user.
                const ownedMetaAccount = await AdAccountModel.findOne({
                    userId,
                    provider: "metaAds",
                    externalAccountId: metaRequest.accountId,
                    status: "active",
                })
                    .select("_id externalAccountId")
                    .lean();

                if (!ownedMetaAccount) {
                    throw new Error(
                        "The selected Meta Ads account does not belong to this user or is not active.",
                    );
                }

                let uploadedMetaImageHash: string | undefined;
                let uploadedMetaImageRecord: Record<string, unknown> | null = null;

                const selectedMetaMedia = selectedAssetReferences.filter(
                    (reference) =>
                        reference.intendedPlatforms.includes("metaAds") &&
                        reference.providerUploadRequired &&
                        ["IMAGE", "LOGO", "VIDEO"].includes(reference.kind),
                );

                const selectedMetaVideos = selectedMetaMedia.filter(
                    (reference) => reference.kind === "VIDEO",
                );

                if (selectedMetaVideos.length > 0) {
                    throw new CampaignRequestValidationError(
                        "Video assets are not supported by the current Meta single-image creative upload flow. Select a JPEG or PNG image instead.",
                    );
                }

                const selectedMetaImages = selectedMetaMedia.filter(
                    (reference) =>
                        reference.kind === "IMAGE" || reference.kind === "LOGO",
                );

                if (selectedMetaImages.length > 1) {
                    throw new CampaignRequestValidationError(
                        "The current Meta creative flow supports one selected Asset Library image per ad. Select one image and try again.",
                    );
                }

                if (!execution.validateOnly && selectedMetaImages.length === 1) {
                    const selectedImage: any = selectedMetaImages[0];
                    const imageFile = await readOwnedCampaignImageAsset(
                        userId,
                        selectedImage.assetId,
                    );

                    const metaContext = await getMetaAdsCreationContext(
                        userId,
                        metaRequest.accountId,
                    );

                    const uploadResult = await uploadMetaAdsImageAsset(
                        metaContext,
                        {
                            buffer: imageFile.buffer,
                            fileName: imageFile.fileName,
                            mimeType: imageFile.mimeType,
                        },
                    );

                    uploadedMetaImageHash = uploadResult.imageHash;
                    uploadedMetaImageRecord = {
                        assetId: selectedImage.assetId,
                        imageHash: uploadResult.imageHash,
                        adAccountId: uploadResult.adAccountId,
                        fileName: uploadResult.fileName,
                        mimeType: uploadResult.mimeType,
                        uploadedAt: new Date(),
                    };

                    // Persist the provider upload result before creating the
                    // Campaign -> Ad Set -> Creative -> Ad resources. If a
                    // later step fails, the upload reference remains available
                    // for reconciliation instead of being lost.
                    const currentConfiguration = isRecord(metaProvider.configuration)
                        ? metaProvider.configuration
                        : {};

                    const existingUploads = Array.isArray(
                        currentConfiguration.creativeAssetUploads,
                    )
                        ? currentConfiguration.creativeAssetUploads.filter(
                            (item: unknown) =>
                                !isRecord(item) ||
                                !(
                                    item.provider === "metaAds" &&
                                    item.assetId === selectedImage.assetId &&
                                    item.adAccountId === uploadResult.adAccountId
                                ),
                        )
                        : [];

                    metaProvider.configuration = {
                        ...currentConfiguration,
                        creativeAssetUploads: [
                            ...existingUploads,
                            {
                                provider: "metaAds",
                                ...uploadedMetaImageRecord,
                            },
                        ],
                    };

                    campaign.markModified("providers.metaAds");
                    await campaign.save();
                }

                // 2. Convert the provider configuration into the
                // Campaign -> Ad Set -> Creative -> Ad service input.

                const metaBundleInput = buildMetaCampaignBundleInput(
                    request.name,
                    request.websiteUrl,
                    metaRequest.providerObjective,
                    metaRequest.configuration,
                    execution,
                    uploadedMetaImageHash,

                );

                // 3. Execute all four Meta creation stages.
                const result = await createMetaAdsCampaignForUser(
                    userId,
                    metaRequest.accountId,
                    metaBundleInput,
                );

                // 4. Update the MongoDB provider record.
                metaProvider.creationStatus = result.validateOnly
                    ? "validated"
                    : "created";

                metaProvider.lastError = null;

                metaProvider.providerCampaignId =
                    result.campaign.campaignId;

                metaProvider.providerStatus =
                    result.campaign.campaignId ? "PAUSED" : null;

                metaProvider.deliveryStatus = "PAUSED";

                if (result.validateOnly) {
                    // Validation-only mode must not save fake external IDs.
                    metaProvider.resources = [];
                    metaProvider.lastSyncedAt = null;
                } else {
                    metaProvider.resources = [
                        {
                            resourceType: "campaign",
                            resourceId: result.campaign.campaignId,
                        },
                        {
                            resourceType: "adSet",
                            resourceId: result.adSet.adSetId,
                        },
                        {
                            resourceType: "creative",
                            resourceId: result.creative.creativeId,
                        },
                        {
                            resourceType: "ad",
                            resourceId: result.ad.adId,
                        },
                    ].filter(
                        (resource) => Boolean(resource.resourceId),
                    );

                    metaProvider.lastSyncedAt = new Date();
                }

                campaign.markModified("providers.metaAds");

                await campaign.save();

                // 5. Return the complete Meta execution result.
                providerResults[`metaAds`] = {
                    success: true,
                    accountId: metaRequest.accountId,
                    creationStatus: metaProvider.creationStatus,
                    validateOnly: result.validateOnly,

                    campaign: result.campaign,
                    adSet: result.adSet,
                    creative: result.creative,
                    ad: result.ad,
                };
            } catch (error) {
                const message = getErrorMessage(error);

                const errorDetails: any =
                    error instanceof MetaAdsCampaignCreationError &&
                        isRecord(error.details)
                        ? error.details
                        : {};

                const providerErrorDetails =
                    errorDetails.originalErrorDetails ?? null;

                const providerStatusCode =
                    error instanceof MetaAdsCampaignCreationError
                        ? error.statusCode
                        : null;

                const partialResult = isRecord(errorDetails.partialResult)
                    ? errorDetails.partialResult
                    : {};

                const partialCampaign = isRecord(partialResult.campaign)
                    ? partialResult.campaign
                    : {};

                const partialAdSet = isRecord(partialResult.adSet)
                    ? partialResult.adSet
                    : {};

                const partialCreative = isRecord(partialResult.creative)
                    ? partialResult.creative
                    : {};

                const partialAd = isRecord(partialResult.ad)
                    ? partialResult.ad
                    : {};

                const campaignId =
                    typeof partialCampaign.campaignId === "string"
                        ? partialCampaign.campaignId
                        : null;

                const partialResources = [
                    {
                        resourceType: "campaign",
                        resourceId: campaignId,
                    },
                    {
                        resourceType: "adSet",
                        resourceId:
                            typeof partialAdSet.adSetId === "string"
                                ? partialAdSet.adSetId
                                : null,
                    },
                    {
                        resourceType: "creative",
                        resourceId:
                            typeof partialCreative.creativeId === "string"
                                ? partialCreative.creativeId
                                : null,
                    },
                    {
                        resourceType: "ad",
                        resourceId:
                            typeof partialAd.adId === "string"
                                ? partialAd.adId
                                : null,
                    },
                ].filter((resource) => Boolean(resource.resourceId));

                if (metaProvider) {
                    metaProvider.creationStatus =
                        partialResources.length > 0 ? "partial" : "failed";

                    metaProvider.providerCampaignId = campaignId;
                    metaProvider.providerStatus = campaignId ? "PAUSED" : null;
                    metaProvider.deliveryStatus = "PAUSED";
                    metaProvider.resources = partialResources;
                    metaProvider.lastError = message;

                    metaProvider.lastSyncedAt =
                        partialResources.length > 0 ? new Date() : null;

                    campaign.markModified("providers.metaAds");
                    await campaign.save();
                }

                providerResults.metaAds = {
                    success: false,
                    accountId: metaRequest?.accountId ?? null,
                    creationStatus:
                        partialResources.length > 0 ? "partial" : "failed",
                    failedStep:
                        typeof errorDetails.failedStep === "string"
                            ? errorDetails.failedStep
                            : null,
                    error: message,
                    partialResources,
                    providerStatusCode,
                    providerErrorDetails,
                };
            }
        }

        // ==========================================
        // GLOBAL CAMPAIGN RESPONSE
        // ==========================================
        const selectedProviderResults = request.platforms.map(
            (provider: AdvertisingProvider) => {
                const result: any = providerResults[provider];

                return {
                    provider,
                    success:
                        isRecord(result) &&
                        result[`success`] === true,
                };
            },
        );

        const failedProviders = selectedProviderResults
            .filter((item: any) => !item.success)
            .map((item: any) => item.provider);

        const successfulProviders = selectedProviderResults
            .filter((item: any) => item.success)
            .map((item: any) => item.provider);

        const hasFailures = failedProviders.length > 0;

        const allFailed =
            failedProviders.length === request.platforms.length;

        const message = allFailed
            ? "Campaign request was saved, but all selected provider executions failed."
            : hasFailures
                ? "Campaign request was saved with partial provider success."
                : execution.validateOnly
                    ? "Campaign validation completed successfully. No external campaign resources were created."
                    : "Campaign creation completed successfully on all selected providers.";

        const responseStatus = allFailed
            ? 502
            : hasFailures
                ? 207
                : execution.validateOnly
                    ? 200
                    : 201;

        return res.status(responseStatus).json({
            success: !hasFailures,

            partialSuccess:
                hasFailures && successfulProviders.length > 0,

            message,

            failedProviders,
            successfulProviders,

            campaign: {
                id: campaign._id.toString(),
                name: campaign.name,
                businessName: campaign.businessName,
                objective: campaign.objective,
                platforms: campaign.platforms,

                providers: Object.fromEntries(
                    request.platforms.map(
                        (provider: AdvertisingProvider) => {
                            const providerData = campaign.providers[provider];

                            return [
                                provider,
                                {
                                    accountId: providerData?.accountId ?? null,
                                    creationStatus:
                                        providerData?.creationStatus ?? "pending",
                                    deliveryStatus:
                                        providerData?.deliveryStatus ?? "PAUSED",
                                    providerCampaignId:
                                        providerData?.providerCampaignId ?? null,
                                },
                            ];
                        },
                    ),
                ),

                createdAt: campaign.createdAt,
            },

            execution,
            providers: providerResults,
        });

        /* const googleFailed = googleResult?.success === false;
    
        const googleSelected = request.platforms.includes("googleAds");
    
        const message = googleFailed
            ? "Campaign request was saved, but Google Ads campaign execution failed."
            : googleSelected
                ? request.execution.validateOnly
                    ? "Google Ads Search campaign validation completed successfully. No external campaign resources were created."
                    : "Google Ads Search campaign created successfully."
                : "Campaign request saved. Provider execution is pending implementation.";
    
        return res
            .status(
                googleFailed
                    ? 502
                    : googleSelected
                        ? request.execution.validateOnly
                            ? 200
                            : 201
                        : 202,
            )
            .json({
                success: !googleFailed,
                message,
    
                campaign: {
                    id: campaign._id.toString(),
                    name: campaign.name,
                    businessName: campaign.businessName,
                    objective: campaign.objective,
                    platforms: campaign.platforms,
    
                    providers: Object.fromEntries(
                        request.platforms.map((provider: AdvertisingProvider) => {
                            const providerData = campaign.providers[provider];
    
                            return [
                                provider,
                                {
                                    accountId: providerData?.accountId ?? null,
                                    creationStatus: providerData?.creationStatus ?? "pending",
                                    deliveryStatus: providerData?.deliveryStatus ?? "PAUSED",
                                    providerCampaignId: providerData?.providerCampaignId ?? null,
                                },
                            ];
                        }),
                    ),
    
                    createdAt: campaign.createdAt,
                },
    
                execution,
                providers: providerResults,
            });*/
    } catch (error) {
        if (error instanceof CampaignRequestValidationError) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }

        console.error("Create campaign request error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to save the campaign request.",
        });
    }
});

router.post(
    "/:campaignId/meta/ad-set/retry",
    async (req: Request, res: Response) => {
        try {
            const { userId } = getAuth(req);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required.",
                });
            }

            const campaignId: any = req.params[`campaignId`];
            const body: any = isRecord(req.body) ? req.body : {};

            if (!/^[a-fA-F0-9]{24}$/.test(campaignId)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid application campaign ID.",
                });
            }

            if (body.confirm !== true) {
                return res.status(400).json({
                    success: false,
                    message: "Ad Set retry requires confirm: true.",
                });
            }

            // This retry currently permits only the billing-event correction
            // needed by the LINK_CLICKS Traffic test.
            const billingEventOverride =
                body.billing_event === undefined
                    ? undefined
                    : typeof body.billing_event === "string"
                        ? body.billing_event.trim().toUpperCase()
                        : null;

            if (
                billingEventOverride === null ||
                (billingEventOverride !== undefined &&
                    billingEventOverride !== "IMPRESSIONS")
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "billing_event override must be IMPRESSIONS.",
                });
            }

            // Always scope the application campaign to its owner.
            const campaign = await CampaignModel.findOne({
                _id: campaignId,
                ownerUserId: userId,
            });

            if (!campaign) {
                return res.status(404).json({
                    success: false,
                    message: "Campaign was not found.",
                });
            }

            if (!campaign.platforms.includes("metaAds")) {
                return res.status(409).json({
                    success: false,
                    message: "This campaign does not include Meta Ads.",
                });
            }

            const metaProvider = campaign.providers.metaAds;

            if (!metaProvider) {
                return res.status(409).json({
                    success: false,
                    message: "Meta provider configuration is missing.",
                });
            }

            // The original Campaign must already exist remotely.
            const existingCampaignId =
                metaProvider.providerCampaignId?.trim();

            if (
                !existingCampaignId ||
                !/^\d+$/.test(existingCampaignId)
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        "No valid existing Meta Campaign ID is stored. Ad Set retry is not possible.",
                });
            }

            // Only retry a failure that occurred during Ad Set creation.
            if (
                metaProvider.creationStatus !== "partial" ||
                !metaProvider.lastError
                    ?.toLowerCase()
                    .includes("during ad set")
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Ad Set retry is allowed only when the previous Meta execution failed during Ad Set creation.",
                    creationStatus: metaProvider.creationStatus,
                    lastError: metaProvider.lastError ?? null,
                });
            }

            // Protect against creating a duplicate Ad Set.
            const resources = Array.isArray(metaProvider.resources)
                ? metaProvider.resources
                : [];

            const existingAdSet = resources.some((item: any) => {
                if (!isRecord(item)) return false;

                const resourceType = String(
                    item[`resourceType`] ?? "",
                ).toLowerCase();

                const resourceId =
                    item[`resourceId`] ?? item[`id`];

                return (
                    resourceType === "adset" ||
                    resourceType === "ad_set"
                ) && typeof resourceId === "string" &&
                    resourceId.trim().length > 0;
            });

            if (existingAdSet) {
                return res.status(409).json({
                    success: false,
                    message:
                        "An Ad Set ID is already stored. Refusing to create another Ad Set.",
                });
            }

            // Verify the ad account still belongs to this user and is active.
            const account = await AdAccountModel.findOne({
                userId,
                provider: "metaAds",
                externalAccountId: metaProvider.accountId,
                status: "active",
            })
                .select("_id externalAccountId")
                .lean();

            if (!account) {
                return res.status(403).json({
                    success: false,
                    message:
                        "The Meta Ad Account is inactive, unavailable, or does not belong to this user.",
                });
            }

            // Read the original provider configuration saved during
            // the initial campaign request.
            const configuration: any = isRecord(
                metaProvider.configuration,
            )
                ? metaProvider.configuration
                : null;

            const campaignConfig = isRecord(
                configuration?.campaign,
            )
                ? configuration.campaign
                : null;

            const adSetConfig = isRecord(
                configuration?.adSet,
            )
                ? configuration.adSet
                : null;

            if (!campaignConfig || !adSetConfig) {
                return res.status(422).json({
                    success: false,
                    message:
                        "Saved Meta Campaign or Ad Set configuration is missing.",
                });
            }

            const campaignObjective =
                campaignConfig.objective;

            if (
                typeof campaignObjective !== "string" ||
                !campaignObjective.trim()
            ) {
                return res.status(422).json({
                    success: false,
                    message:
                        "Saved Meta campaign objective is missing.",
                });
            }

            const budgetLevel =
                campaignConfig.budgetLevel ??
                adSetConfig.budgetLevel ??
                "CAMPAIGN";

            if (
                budgetLevel !== "CAMPAIGN" &&
                budgetLevel !== "AD_SET"
            ) {
                return res.status(422).json({
                    success: false,
                    message: "Invalid saved Meta budget level.",
                });
            }

            const rawSpecialCategories =
                campaignConfig.specialAdCategories ??
                campaignConfig.special_ad_categories ??
                [];

            if (
                !Array.isArray(rawSpecialCategories) ||
                !rawSpecialCategories.every(
                    (item) => typeof item === "string",
                )
            ) {
                return res.status(422).json({
                    success: false,
                    message:
                        "Saved Meta special ad categories are invalid.",
                });
            }

            const optimizationGoal =
                typeof adSetConfig.optimization_goal === "string"
                    ? adSetConfig.optimization_goal.trim().toUpperCase()
                    : "";

            const storedBillingEvent =
                typeof adSetConfig.billing_event === "string"
                    ? adSetConfig.billing_event.trim().toUpperCase()
                    : "";

            const effectiveBillingEvent =
                billingEventOverride ?? storedBillingEvent;

            if (!optimizationGoal || !effectiveBillingEvent) {
                return res.status(422).json({
                    success: false,
                    message:
                        "Saved Ad Set optimization goal or billing event is missing.",
                });
            }

            // For this LINK_CLICKS Traffic test, use Meta's
            // documented IMPRESSIONS billing event.
            if (
                optimizationGoal === "LINK_CLICKS" &&
                effectiveBillingEvent !== "IMPRESSIONS"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "For this LINK_CLICKS Traffic retry, send billing_event: IMPRESSIONS.",
                });
            }

            const adSetInput = {
                ...adSetConfig,

                campaignId: existingCampaignId,

                campaignObjective:
                    campaignObjective as MetaAdsCampaignObjective,

                specialAdCategories:
                    rawSpecialCategories as string[],

                budgetLevel,

                optimization_goal: optimizationGoal,

                billing_event: effectiveBillingEvent,

                validateOnly: false,
                confirm: true,
            } as unknown as CreateMetaAdsAdSetInput;

            // Claim the retry before contacting Meta.
            // This prevents a second simultaneous request from creating
            // another Ad Set for the same saved Campaign.
            metaProvider.creationStatus =
                "adset_retry_in_progress";

            // Persist the corrected billing event for subsequent steps.
            metaProvider.configuration = {
                ...configuration,
                adSet: {
                    ...adSetConfig,
                    billing_event: effectiveBillingEvent,
                },
            };

            campaign.markModified("providers.metaAds");
            await campaign.save();

            let createdAdSetId: string | null = null;

            try {
                const context = await getMetaAdsCreationContext(
                    userId,
                    metaProvider.accountId,
                );

                const result = await createMetaAdsAdSet(
                    context,
                    adSetInput,
                );

                if (!result.adSetId) {
                    throw new MetaAdsCampaignCreationError(
                        "Meta did not return an Ad Set ID.",
                        502,
                        result.metaResponse,
                    );
                }

                createdAdSetId = result.adSetId;

                // Save only the new Ad Set resource.
                metaProvider.resources.push({
                    resourceType: "adSet",
                    resourceId: result.adSetId,
                    status: "created",
                    deliveryStatus: "PAUSED",
                });

                // The complete workflow is still partial because
                // Creative and Ad creation have not happened yet.
                metaProvider.creationStatus = "partial";
                metaProvider.providerStatus = "PAUSED";
                metaProvider.deliveryStatus = "PAUSED";
                metaProvider.lastError = null;
                metaProvider.lastSyncedAt = new Date();

                campaign.markModified("providers.metaAds");
                await campaign.save();

                return res.status(200).json({
                    success: true,
                    message:
                        "Meta Ad Set created successfully under the existing Campaign. Creative and Ad creation are still pending.",

                    campaign: {
                        id: campaign._id.toString(),
                        name: campaign.name,
                    },

                    provider: {
                        provider: "metaAds",
                        accountId: metaProvider.accountId,
                        creationStatus: metaProvider.creationStatus,
                        campaignId: existingCampaignId,
                        adSetId: result.adSetId,
                    },

                    adSet: result,
                });
            } catch (error) {
                const message = getErrorMessage(error);

                const providerErrorDetails =
                    error instanceof MetaAdsCampaignCreationError
                        ? error.details ?? null
                        : null;

                // HTTP 5xx/network failures may have an ambiguous result:
                // Meta may have processed the request before the connection
                // failed. Do not allow an automatic duplicate retry.
                const needsAttention =
                    createdAdSetId !== null ||
                    !(error instanceof MetaAdsCampaignCreationError) ||
                    error.statusCode >= 500;

                metaProvider.creationStatus = needsAttention
                    ? "needs_attention"
                    : "partial";

                metaProvider.lastError = message;
                metaProvider.lastSyncedAt = new Date();

                campaign.markModified("providers.metaAds");

                try {
                    await campaign.save();
                } catch (saveError) {
                    console.error(
                        "Failed to persist Meta Ad Set retry status:",
                        getErrorMessage(saveError),
                    );
                }

                console.error("[META AD SET RETRY FAILED]", {
                    campaignId,
                    providerCampaignId: existingCampaignId,
                    message,
                    providerErrorDetails,
                    createdAdSetId,
                });

                return res
                    .status(
                        error instanceof MetaAdsCampaignCreationError
                            ? error.statusCode
                            : 502,
                    )
                    .json({
                        success: false,
                        message,
                        failedStep: "Ad Set",
                        creationStatus: metaProvider.creationStatus,
                        campaignId: existingCampaignId,
                        createdAdSetId,
                        providerErrorDetails,
                    });
            }
        } catch (error) {
            console.error(
                "Meta Ad Set retry route error:",
                getErrorMessage(error),
            );

            return res.status(500).json({
                success: false,
                message: getErrorMessage(error),
            });
        }
    },
);

router.post(
    "/:campaignId/meta/creative/retry",
    async (req: any, res: Response) => {
        try {
            const { userId } = getAuth(req);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required.",
                });
            }

            const campaignId = req.params.campaignId;
            const body = isRecord(req.body) ? req.body : {};

            if (!/^[a-fA-F0-9]{24}$/.test(campaignId)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid application campaign ID.",
                });
            }

            if (body.confirm !== true) {
                return res.status(400).json({
                    success: false,
                    message: "Creative retry requires confirm: true.",
                });
            }

            // Validate optional Creative overrides.
            if (
                body.creative !== undefined &&
                !isRecord(body.creative)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Creative overrides must be an object.",
                });
            }

            const creativeOverrides: Record<string, unknown> =
                isRecord(body.creative) ? body.creative : {};

            const allowedOverrideFields = new Set([
                "name",
                "pageId",
                "instagramActorId",
                "primaryText",
                "headline",
                "description",
                "imageUrl",
                "destinationUrl",
                "callToAction",
            ]);

            const unsupportedField = Object.keys(
                creativeOverrides,
            ).find((field) => !allowedOverrideFields.has(field));

            if (unsupportedField) {
                return res.status(400).json({
                    success: false,
                    message: `Unsupported Creative override: ${unsupportedField}.`,
                });
            }

            const invalidOverride = Object.entries(
                creativeOverrides,
            ).find(([, value]) => typeof value !== "string");

            if (invalidOverride) {
                return res.status(400).json({
                    success: false,
                    message:
                        `Creative override "${invalidOverride[0]}" must be a string.`,
                });
            }

            // Find the application Campaign owned by this user.
            const campaign = await CampaignModel.findOne({
                _id: campaignId,
                ownerUserId: userId,
            });

            if (!campaign) {
                return res.status(404).json({
                    success: false,
                    message: "Campaign was not found.",
                });
            }

            if (!campaign.platforms.includes("metaAds")) {
                return res.status(409).json({
                    success: false,
                    message: "This campaign does not include Meta Ads.",
                });
            }

            const metaProvider = campaign.providers.metaAds;

            if (!metaProvider) {
                return res.status(409).json({
                    success: false,
                    message: "Meta provider configuration is missing.",
                });
            }

            // Only allow retry after an actual Creative failure.
            if (
                metaProvider.creationStatus !== "partial" ||
                !metaProvider.lastError
                    ?.toLowerCase()
                    .includes("during creative")
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Creative retry is allowed only after a partial Meta execution failed during Creative creation.",
                    creationStatus: metaProvider.creationStatus,
                    lastError: metaProvider.lastError ?? null,
                });
            }

            const resources = Array.isArray(metaProvider.resources)
                ? metaProvider.resources
                : [];

            // Read previously created Meta resource IDs.
            const getResourceId = (
                acceptedTypes: string[],
            ): string | null => {
                const resource = resources.find((item: any) => {
                    if (!isRecord(item)) return false;

                    const type = String(
                        item.resourceType ?? "",
                    ).toLowerCase();

                    return acceptedTypes.includes(type);
                });

                if (!isRecord(resource)) return null;

                const resourceId =
                    resource.resourceId ?? resource.id;

                return typeof resourceId === "string" &&
                    /^\d+$/.test(resourceId)
                    ? resourceId
                    : null;
            };

            const existingCampaignId =
                metaProvider.providerCampaignId?.trim();

            const existingAdSetId = getResourceId([
                "adset",
                "ad_set",
            ]);

            if (
                !existingCampaignId ||
                !/^\d+$/.test(existingCampaignId) ||
                !existingAdSetId
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Existing Meta Campaign or Ad Set ID is missing. Creative retry cannot proceed.",
                });
            }

            // Prevent duplicate Creative or Ad creation.
            if (
                resources.some((item: any) => {
                    if (!isRecord(item)) return false;

                    const type = String(
                        item.resourceType ?? "",
                    ).toLowerCase();

                    return type === "creative";
                })
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        "A Creative resource is already stored. Refusing to create a duplicate.",
                });
            }

            if (
                resources.some((item: any) => {
                    if (!isRecord(item)) return false;

                    return (
                        String(item.resourceType ?? "").toLowerCase() ===
                        "ad"
                    );
                })
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        "An Ad resource already exists. Creative retry is not allowed.",
                });
            }

            // Verify account ownership and active status.
            const account = await AdAccountModel.findOne({
                userId,
                provider: "metaAds",
                externalAccountId: metaProvider.accountId,
                status: "active",
            })
                .select("_id externalAccountId")
                .lean();

            if (!account) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Meta Ad Account is inactive or does not belong to this user.",
                });
            }

            // Read saved provider configuration.
            const configuration: any = isRecord(
                metaProvider.configuration,
            )
                ? metaProvider.configuration
                : null;

            if (!configuration) {
                return res.status(422).json({
                    success: false,
                    message:
                        "Saved Meta provider configuration is missing.",
                });
            }

            const adConfig = isRecord(configuration.ad)
                ? configuration.ad
                : {};

            const savedCreativeConfig = isRecord(
                configuration.creative,
            )
                ? configuration.creative
                : isRecord(adConfig.creativeDraft)
                    ? adConfig.creativeDraft
                    : null;

            if (!savedCreativeConfig) {
                return res.status(422).json({
                    success: false,
                    message:
                        "Saved Meta Creative configuration is missing.",
                });
            }

            // Apply optional corrected Creative values.
            const effectiveCreativeConfig: Record<string, unknown> = {
                ...savedCreativeConfig,
                ...creativeOverrides,
            };

            const adName =
                optionalConfigString(
                    adConfig,
                    ["name"],
                    "Meta Ad name",
                ) ?? `${campaign.name} - Ad`;

            const creativeName =
                optionalConfigString(
                    effectiveCreativeConfig,
                    ["name"],
                    "Meta Creative name",
                ) ?? `${adName} Creative`;

            const destinationUrl =
                optionalConfigString(
                    effectiveCreativeConfig,
                    ["destinationUrl", "destination_url"],
                    "Meta Creative destination URL",
                ) ??
                (
                    typeof campaign.websiteUrl === "string"
                        ? campaign.websiteUrl
                        : undefined
                );

            if (!destinationUrl) {
                return res.status(422).json({
                    success: false,
                    message:
                        "Meta Creative destination URL is missing.",
                });
            }
            // The selected Asset Library references were resolved and saved
            // by the initial campaign route. Never accept a Meta image hash
            // from retry request JSON; only reuse a hash persisted by our API.
            const rawCreativeAssetReferences = Array.isArray(
                configuration.creativeAssetReferences,
            )
                ? configuration.creativeAssetReferences
                : [];

            const selectedPrivateMetaImages = rawCreativeAssetReferences.filter(
                (item: unknown) =>
                    isRecord(item) &&
                    item.providerUploadRequired === true &&
                    Array.isArray(item.intendedPlatforms) &&
                    item.intendedPlatforms.includes("metaAds") &&
                    (item.kind === "IMAGE" || item.kind === "LOGO"),
            ) as Array<Record<string, unknown>>;

            const selectedMetaVideos = rawCreativeAssetReferences.some(
                (item: unknown) =>
                    isRecord(item) &&
                    item.providerUploadRequired === true &&
                    item.intendedPlatforms instanceof Array &&
                    item.intendedPlatforms.includes("metaAds") &&
                    item.kind === "VIDEO",
            );

            if (selectedMetaVideos) {
                return res.status(422).json({
                    success: false,
                    message:
                        "Video assets are not supported by the current Meta single-image creative retry flow. Select a JPEG or PNG image instead.",
                });
            }

            if (selectedPrivateMetaImages.length > 1) {
                return res.status(422).json({
                    success: false,
                    message:
                        "The current Meta creative retry supports one selected Asset Library image per ad.",
                });
            }

            const selectedMetaImage = selectedPrivateMetaImages[0];
            const selectedMetaAssetId =
                typeof selectedMetaImage?.assetId === "string"
                    ? selectedMetaImage.assetId
                    : null;

            const currentConfiguration = isRecord(metaProvider.configuration)
                ? metaProvider.configuration
                : {};

            const previousUploads = Array.isArray(
                currentConfiguration.creativeAssetUploads,
            )
                ? currentConfiguration.creativeAssetUploads
                : [];

            const matchingSavedUpload = selectedMetaAssetId
                ? previousUploads.find(
                    (item: unknown) =>
                        isRecord(item) &&
                        item.provider === "metaAds" &&
                        item.assetId === selectedMetaAssetId &&
                        typeof item.imageHash === "string" &&
                        item.imageHash.trim() &&
                        normalizeMetaAccountId(item.adAccountId) ===
                        normalizeMetaAccountId(metaProvider.accountId),
                ) as Record<string, unknown> | undefined
                : undefined;

            let retryImageHash =
                typeof matchingSavedUpload?.imageHash === "string"
                    ? matchingSavedUpload.imageHash.trim()
                    : undefined;

            const configuredImageUrl = optionalConfigString(
                effectiveCreativeConfig,
                ["imageUrl", "image_url"],
                "Meta Creative image URL",
            );

            // Get the current account context for account-scoped hash reuse
            // and, when needed, upload the server-owned binary file.
            const metaContext = await getMetaAdsCreationContext(
                userId,
                metaProvider.accountId,
            );

            if (selectedMetaAssetId && !retryImageHash) {
                const imageFile = await readOwnedCampaignImageAsset(
                    userId,
                    selectedMetaAssetId,
                );

                const uploadResult = await uploadMetaAdsImageAsset(
                    metaContext,
                    {
                        buffer: imageFile.buffer,
                        fileName: imageFile.fileName,
                        mimeType: imageFile.mimeType,
                    },
                );

                retryImageHash = uploadResult.imageHash;

                const uploadRecord = {
                    provider: "metaAds",
                    assetId: selectedMetaAssetId,
                    imageHash: uploadResult.imageHash,
                    adAccountId: uploadResult.adAccountId,
                    fileName: uploadResult.fileName,
                    mimeType: uploadResult.mimeType,
                    uploadedAt: new Date(),
                };

                const retainedUploads = previousUploads.filter(
                    (item: unknown) =>
                        !(
                            isRecord(item) &&
                            item.provider === "metaAds" &&
                            item.assetId === selectedMetaAssetId &&
                            normalizeMetaAccountId(item.adAccountId) ===
                            normalizeMetaAccountId(metaContext.adAccountId)
                        ),
                );

                metaProvider.configuration = {
                    ...currentConfiguration,
                    creativeAssetUploads: [
                        ...retainedUploads,
                        uploadRecord,
                    ],
                };

                campaign.markModified("providers.metaAds");
                await campaign.save();
            }

            if (!retryImageHash && !configuredImageUrl) {
                return res.status(422).json({
                    success: false,
                    message:
                        "Meta Creative image is missing. Select an Asset Library image or configure an HTTPS image URL before retrying.",
                });
            }

            // Build only the Creative input.
            const creativeInput: CreateMetaAdsAdCreativeInput = {
                name: creativeName,

                pageId: requireConfigString(
                    effectiveCreativeConfig,
                    ["pageId", "page_id"],
                    "Meta Facebook Page ID",
                ),

                instagramActorId: optionalConfigString(
                    effectiveCreativeConfig,
                    ["instagramActorId", "instagram_actor_id"],
                    "Meta Instagram Actor ID",
                ),

                primaryText: requireConfigString(
                    effectiveCreativeConfig,
                    ["primaryText", "message"],
                    "Meta Creative primary text",
                ),

                headline: requireConfigString(
                    effectiveCreativeConfig,
                    ["headline", "name"],
                    "Meta Creative headline",
                ),

                description: optionalConfigString(
                    effectiveCreativeConfig,
                    ["description"],
                    "Meta Creative description",
                ),

                ...(retryImageHash
                    ? { imageHash: retryImageHash }
                    : { imageUrl: configuredImageUrl }),

                destinationUrl,

                callToAction: requireConfigString(
                    effectiveCreativeConfig,
                    ["callToAction", "call_to_action"],
                    "Meta Creative call to action",
                ) as CreateMetaAdsAdCreativeInput["callToAction"],

                validateOnly: false,
                confirm: true,
            };

            // Persist the corrected configuration and claim the retry.
            const updatedConfiguration: Record<string, unknown> = {
                ...configuration,
            };

            if (isRecord(configuration.creative)) {
                updatedConfiguration[`creative`] =
                    effectiveCreativeConfig;
            } else {
                updatedConfiguration[`ad`] = {
                    ...adConfig,
                    creativeDraft: effectiveCreativeConfig,
                };
            }

            metaProvider.configuration = updatedConfiguration;
            metaProvider.creationStatus =
                "creative_retry_in_progress";

            campaign.markModified("providers.metaAds");
            await campaign.save();

            let createdCreativeId: string | null = null;

            try {
                // Obtain Meta API context.
                const context = metaContext;

                // Create ONLY the Ad Creative.
                const result = await createMetaAdsAdCreative(
                    context,
                    creativeInput,
                );

                if (!result.creativeId) {
                    throw new MetaAdsCampaignCreationError(
                        "Meta did not return a Creative ID.",
                        502,
                        result.metaResponse,
                    );
                }

                createdCreativeId = result.creativeId;

                // Store the newly created Creative.
                metaProvider.resources.push({
                    resourceType: "creative",
                    resourceId: result.creativeId,
                    status: "created",
                });

                // Ad creation is still pending.
                metaProvider.creationStatus = "partial";
                metaProvider.providerStatus = "PAUSED";
                metaProvider.deliveryStatus = "PAUSED";
                metaProvider.lastError = null;
                metaProvider.lastSyncedAt = new Date();

                campaign.markModified("providers.metaAds");
                await campaign.save();

                return res.status(200).json({
                    success: true,
                    message:
                        "Meta Creative created successfully using the existing Campaign and Ad Set. Ad creation is still pending.",

                    campaign: {
                        id: campaign._id.toString(),
                        name: campaign.name,
                        campaignId: existingCampaignId,
                    },

                    provider: {
                        provider: "metaAds",
                        accountId: metaProvider.accountId,
                        creationStatus: metaProvider.creationStatus,
                        campaignId: existingCampaignId,
                        adSetId: existingAdSetId,
                        creativeId: result.creativeId,
                    },

                    creative: result,
                });
            } catch (error) {
                const originalMessage = getErrorMessage(error);

                const message =
                    `Meta Ads setup partially completed. Creation failed during Creative retry: ${originalMessage}`;

                const providerErrorDetails =
                    error instanceof MetaAdsCampaignCreationError
                        ? error.details ?? null
                        : null;

                // Avoid blind retries when the remote result is ambiguous.
                const needsAttention =
                    createdCreativeId !== null ||
                    !(error instanceof MetaAdsCampaignCreationError) ||
                    error.statusCode >= 500;

                metaProvider.creationStatus = needsAttention
                    ? "needs_attention"
                    : "partial";

                metaProvider.lastError = message;
                metaProvider.lastSyncedAt = new Date();

                campaign.markModified("providers.metaAds");

                try {
                    await campaign.save();
                } catch (saveError) {
                    console.error(
                        "Failed to persist Meta Creative retry status:",
                        getErrorMessage(saveError),
                    );
                }

                console.error("[META CREATIVE RETRY FAILED]", {
                    campaignId,
                    providerCampaignId: existingCampaignId,
                    adSetId: existingAdSetId,
                    message,
                    providerErrorDetails,
                    createdCreativeId,
                });

                return res
                    .status(
                        error instanceof MetaAdsCampaignCreationError
                            ? error.statusCode
                            : 502,
                    )
                    .json({
                        success: false,
                        message,
                        failedStep: "Creative",
                        creationStatus: metaProvider.creationStatus,
                        campaignId: existingCampaignId,
                        adSetId: existingAdSetId,
                        createdCreativeId,
                        providerErrorDetails,
                    });
            }
        } catch (error) {
            console.error(
                "Meta Creative retry route error:",
                getErrorMessage(error),
            );

            return res.status(
                error instanceof CampaignRequestValidationError
                    ? 400
                    : 500,
            ).json({
                success: false,
                message: getErrorMessage(error),
            });
        }
    },
);

router.get("/", async (req: Request, res: Response) => {
    try {
        const { userId } = getAuth(req);
        console.log("userId, ", userId);


        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
        }

        // Get the user's selected account for each provider.
        const [googleAccount, metaAccount] = await Promise.all([
            AdAccountModel.findOne({
                userId,
                provider: "googleAds",
                isSelected: true,
            })
                .select("externalAccountId")
                .lean(),

            AdAccountModel.findOne({
                userId,
                provider: "metaAds",
                isSelected: true,
            })
                .select("externalAccountId")
                .lean(),
        ]);
        const savedCampaigns = await CampaignModel.find({
            ownerUserId: userId,
        }).lean();

        const totalDocuments = await CampaignModel.countDocuments({
            ownerUserId: userId,
        });

        const sample = await CampaignModel.findOne({
            ownerUserId: userId,
        }).lean() as any;

        // console.log("CampaignModel diagnostic:", {
        //     authenticatedUserId: userId,
        //     collection: CampaignModel.collection.name,
        //     totalDocuments,
        //     schemaPaths: Object.keys(CampaignModel.schema.paths),

        //     sample: sample
        //         ? {
        //             documentKeys: Object.keys(sample),

        //             ownership: {
        //                 userId: sample.userId ?? null,
        //                 clerkUserId: sample.clerkUserId ?? null,
        //                 createdBy: sample.createdBy ?? null,
        //                 ownerId: sample.ownerId ?? null,
        //             },

        //             providerKeys: Object.keys(sample.providers ?? {}),

        //             googleAds: sample.providers?.googleAds
        //                 ? {
        //                     keys: Object.keys(sample.providers.googleAds),
        //                     accountId: sample.providers.googleAds.accountId ?? null,
        //                     campaignId: sample.providers.googleAds.campaignId ?? null,
        //                 }
        //                 : null,
        //         }
        //         : null,
        // });

        // Fetch both providers independently.
        const [googleResult, metaResult]: any = await Promise.all([
            fetchProviderCampaigns(googleAccount?.externalAccountId, (accountId) =>
                getGoogleCampaigns(userId, accountId),
            ),
            fetchProviderCampaigns(metaAccount?.externalAccountId, (accountId) =>
                getMetaCampaigns(userId, accountId),
            ),
        ]);
        if (googleResult.success && googleResult.data) {
            googleResult.data = {
                ...googleResult.data,
                campaigns: mergeGoogleCampaigns(
                    googleResult.data[`campaigns`],
                    savedCampaigns,
                    googleResult.accountId!
                ),
            };
        }
        console.log(
            "googleResult", googleResult
        );


        const providers = {
            googleAds: googleResult,
            metaAds: metaResult,
        };

        const hasSuccess = googleResult.success || metaResult.success;

        if (!hasSuccess) {
            return res.status(502).json({
                success: false,
                message: "Failed to retrieve campaigns from both providers.",
                providers,
            });
        }



        return res.status(200).json({
            success: true,
            providers,
            savedCampaigns
        });
    } catch (error) {
        console.error("Get campaigns error:", error);

        return res.status(500).json({
            success: false,
            message: getErrorMessage(error),
        });
    }
});

router.get(
    "/meta/targeting/detailed",
    async (req: any, res: Response) => {
        const { userId } = getAuth(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
        }

        try {
            const kind =
                typeof req.query.kind === "string"
                    ? req.query.kind
                    : "";

            const query =
                typeof req.query.query === "string"
                    ? req.query.query
                    : undefined;

            const after =
                typeof req.query.after === "string"
                    ? req.query.after
                    : undefined;

            const limit =
                typeof req.query.limit === "string"
                    ? Number(req.query.limit)
                    : 25;

            const result = await searchMetaDetailedTargeting(
                userId,
                {
                    kind: kind as
                        | "interest"
                        | "behavior"
                        | "demographic"
                        | "life_event"
                        | "industry"
                        | "family_status"
                        | "income",
                    query,
                    limit,
                    after,
                },
            );

            return res.status(200).json({
                success: true,
                data: result,
            });
        } catch (error) {
            const statusCode =
                error instanceof MetaTargetingSearchError
                    ? error.statusCode
                    : 502;

            return res.status(statusCode).json({
                success: false,
                message: getErrorMessage(error),
            });
        }
    },
);

router.get(
    "/meta/audiences/custom",
    async (req: any, res: any) => {
        try {
            const { userId } = getAuth(req);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required.",
                });
            }

            const accountId =
                await getSelectedMetaAccountId(userId);

            if (!accountId) {
                return res.status(409).json({
                    success: false,
                    message: "No active Meta Ads account is selected.",
                });
            }

            const limit = Number(req.query.limit ?? 50);
            const after =
                typeof req.query.after === "string"
                    ? req.query.after
                    : undefined;

            const data = await listMetaCustomAudiences(
                userId,
                accountId,
                { limit, after },
            );

            return res.json({
                success: true,
                data,
            });
        } catch (error) {
            const status =
                error instanceof MetaTargetingSearchError
                    ? error.statusCode
                    : 502;

            return res.status(status).json({
                success: false,
                message: getErrorMessage(error),
            });
        }
    },
);
router.get(
    "/meta/audiences/saved",
    async (req: any, res: any) => {
        try {
            const { userId } = getAuth(req);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required.",
                });
            }

            const accountId =
                await getSelectedMetaAccountId(userId);

            if (!accountId) {
                return res.status(409).json({
                    success: false,
                    message: "No active Meta Ads account is selected.",
                });
            }

            const limit = Number(req.query.limit ?? 50);
            const after =
                typeof req.query.after === "string"
                    ? req.query.after
                    : undefined;

            const data = await listMetaSavedAudiences(
                userId,
                accountId,
                { limit, after },
            );

            return res.json({
                success: true,
                data,
            });
        } catch (error) {
            const status =
                error instanceof MetaTargetingSearchError
                    ? error.statusCode
                    : 502;

            return res.status(status).json({
                success: false,
                message: getErrorMessage(error),
            });
        }
    },
);

router.post("/rename", async (req: Request, res: Response) => {
    try {
        // 1. Authenticate the user.
        const { userId } = getAuth(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
        }

        // 2. Validate request body.
        const { provider, campaignId, name }: any = req.body ?? {};

        if (provider !== "googleAds" && provider !== "metaAds") {
            return res.status(400).json({
                success: false,
                message: "Invalid provider. Use googleAds or metaAds.",
            });
        }

        if (
            typeof campaignId !== "string" ||
            !/^\d+$/.test(campaignId.trim())
        ) {
            return res.status(400).json({
                success: false,
                message: "A valid provider campaign ID is required.",
            });
        }

        if (
            typeof name !== "string" ||
            !name.trim() ||
            name.trim().length > 255
        ) {
            return res.status(400).json({
                success: false,
                message: "Campaign name must contain 1–255 characters.",
            });
        }

        const normalizedCampaignId = campaignId.trim();
        const newName = name.trim();

        // 3. Resolve the authenticated user's selected provider account.
        const selectedAccount = await AdAccountModel.findOne({
            userId,
            provider,
            isSelected: true,
        })
            .select("externalAccountId")
            .lean();

        if (!selectedAccount?.externalAccountId) {
            return res.status(409).json({
                success: false,
                message: `No selected ${provider} account found. Please select an account first.`,
            });
        }

        const accountId = selectedAccount.externalAccountId;


        // 4. Rename the campaign on the actual advertising platform.
        let providerResponse: unknown;

        try {
            if (provider === "googleAds") {
                providerResponse = await renameGoogleCampaign(
                    userId,
                    normalizedCampaignId,
                    newName,
                    accountId,
                    false,
                );
            } else {
                providerResponse = await renameMetaCampaign(
                    normalizedCampaignId,
                    newName,
                    userId,
                );
            }
        } catch (providerError) {
            console.error(
                `${provider} campaign rename failed:`,
                providerError,
            );

            return res.status(502).json({
                success: false,
                message: getErrorMessage(providerError),
                provider,
                campaignId: normalizedCampaignId,
                providerUpdated: false,
                databaseUpdated: false,
            });
        }

        // 5. Find the matching MongoDB campaign document.
        let databaseUpdated = false;

        try {
            const campaignDocuments = await CampaignModel.find({
                ownerUserId: userId,
                [`providers.${provider}.providerCampaignId`]:
                    normalizedCampaignId,
            });

            const normalizeAccountId = (value: unknown) =>
                provider === "googleAds"
                    ? normalizeGoogleAccountId(value)
                    : normalizeMetaAccountId(value);

            const campaignDocument: any = campaignDocuments.find((document: any) => {
                const providerData: any = document.providers?.[provider] as any;

                return (
                    providerData &&
                    normalizeAccountId(providerData.accountId) ===
                    normalizeAccountId(accountId)
                );
            });

            // 6. Update local provider configuration only after API success.
            if (campaignDocument) {
                const providerData =
                    campaignDocument.providers[provider];

                if (providerData) {
                    const configuration =
                        providerData.configuration ?? {};

                    const existingCampaignConfiguration = isRecord(
                        configuration.campaign,
                    )
                        ? configuration.campaign
                        : {};

                    providerData.configuration = {
                        ...configuration,
                        campaign: {
                            ...existingCampaignConfiguration,
                            name: newName,
                        },
                    };

                    providerData.lastSyncedAt = new Date();

                    // Only update the shared name when there is no
                    // other provider configuration in this document.
                    const otherProvider =
                        provider === "googleAds"
                            ? "metaAds"
                            : "googleAds";

                    if (!campaignDocument.providers[otherProvider]) {
                        campaignDocument.name = newName;
                    }

                    campaignDocument.markModified(
                        `providers.${provider}.configuration`,
                    );

                    await campaignDocument.save();

                    databaseUpdated = true;
                }
            }
        } catch (databaseError) {
            console.error(
                "Campaign renamed on provider, but MongoDB update failed:",
                databaseError,
            );

            return res.status(500).json({
                success: false,
                message:
                    "Campaign was renamed on the provider, but the local database update failed.",
                provider,
                campaignId: normalizedCampaignId,
                newName,
                providerUpdated: true,
                databaseUpdated: false,
                error: getErrorMessage(databaseError),
            });
        }

        // 7. Return final response.
        return res.status(200).json({
            success: true,
            message: `${provider === "googleAds" ? "Google Ads" : "Meta Ads"} campaign renamed successfully.`,
            provider,
            campaignId: normalizedCampaignId,
            newName,
            providerUpdated: true,
            databaseUpdated,
            providerResponse,
        });
    } catch (error) {
        console.error("Global campaign rename error:", error);

        return res.status(500).json({
            success: false,
            message: getErrorMessage(error),
        });
    }
});

router.post("/status", async (req: Request, res: Response) => {
    try {
        // 1. Authenticate the user.
        const { userId } = getAuth(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
        }

        // 2. Validate the request centrally.
        const {
            provider,
            campaignId,
            status,
            validateOnly: rawValidateOnly,
        } = req.body ?? {};

        if (provider !== "googleAds" && provider !== "metaAds") {
            return res.status(400).json({
                success: false,
                message: "Invalid provider. Use googleAds or metaAds.",
            });
        }

        if (
            typeof campaignId !== "string" ||
            !/^\d+$/.test(campaignId.trim())
        ) {
            return res.status(400).json({
                success: false,
                message: "A valid provider campaign ID is required.",
            });
        }

        if (typeof status !== "string" || !status.trim()) {
            return res.status(400).json({
                success: false,
                message: "Campaign status is required.",
            });
        }

        const normalizedCampaignId = campaignId.trim();
        const newStatus = status.trim().toUpperCase();

        const allowedStatuses =
            provider === "googleAds"
                ? ["ENABLED", "PAUSED"]
                : ["ACTIVE", "PAUSED"];

        if (!allowedStatuses.includes(newStatus)) {
            return res.status(400).json({
                success: false,
                message: `Invalid ${provider} campaign status. Allowed statuses: ${allowedStatuses.join(", ")}.`,
            });
        }

        const validateOnly =
            rawValidateOnly === undefined ? false : rawValidateOnly;

        if (typeof validateOnly !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "validateOnly must be a boolean.",
            });
        }

        // Meta's status mutation does not support Google's validateOnly option.
        if (provider === "metaAds" && validateOnly) {
            return res.status(400).json({
                success: false,
                message: "validateOnly is currently supported only for Google Ads.",
            });
        }

        const providerKey = provider as "googleAds" | "metaAds";

        // 3. Resolve the user's selected provider account.
        const selectedAccount = await AdAccountModel.findOne({
            userId,
            provider: providerKey,
            isSelected: true,
        })
            .select("externalAccountId")
            .lean();

        if (!selectedAccount?.externalAccountId) {
            return res.status(409).json({
                success: false,
                message: `No selected ${providerKey} account found. Please select an account first.`,
            });
        }

        const accountId = selectedAccount.externalAccountId;

        // 4. Update campaign status on the advertising platform.
        let providerResponse: unknown;

        try {
            if (providerKey === "googleAds") {
                // Google API expects the customer resource name.
                const customerId = String(accountId)
                    .trim()
                    .replace(/^customers\//i, "")
                    .replace(/-/g, "");

                if (!/^\d+$/.test(customerId)) {
                    return res.status(409).json({
                        success: false,
                        message: "The selected Google Ads customer ID is invalid.",
                    });
                }

                providerResponse = await updateGoogleAdsStatus(
                    normalizedCampaignId,
                    newStatus,
                    userId,
                    `customers/${customerId}`,
                    validateOnly,
                );
            } else {
                providerResponse = await updateMetaAdsStatus(
                    normalizedCampaignId,
                    newStatus,
                    userId,
                );
            }
        } catch (providerError) {
            console.error(
                `${providerKey} campaign status update failed:`,
                providerError,
            );

            return res.status(502).json({
                success: false,
                message: getErrorMessage(providerError),
                provider: providerKey,
                campaignId: normalizedCampaignId,
                requestedStatus: newStatus,
                providerUpdated: false,
                databaseUpdated: false,
            });
        }

        // 5. validateOnly checks the Google request without changing anything.
        if (validateOnly) {
            return res.status(200).json({
                success: true,
                message: "Status validation completed. Campaign was not changed.",
                provider: providerKey,
                campaignId: normalizedCampaignId,
                newStatus,
                validateOnly: true,
                providerUpdated: false,
                databaseUpdated: false,
                providerResponse,
            });
        }

        // 6. Synchronize the provider-specific campaign configuration in MongoDB.
        let databaseUpdated = false;

        try {
            const campaignDocuments = await CampaignModel.find({
                ownerUserId: userId,
                [`providers.${providerKey}.providerCampaignId`]:
                    normalizedCampaignId,
            });

            const normalizeAccountId = (value: unknown) =>
                providerKey === "googleAds"
                    ? normalizeGoogleAccountId(value)
                    : normalizeMetaAccountId(value);

            const campaignDocument = campaignDocuments.find((document) => {
                const providerData = document.providers?.[providerKey];

                return (
                    providerData &&
                    normalizeAccountId(providerData.accountId) ===
                    normalizeAccountId(accountId)
                );
            });

            if (campaignDocument) {
                const providerData =
                    campaignDocument.providers[providerKey];

                if (providerData) {
                    const configuration =
                        providerData.configuration ?? {};

                    const existingCampaignConfiguration = isRecord(
                        configuration.campaign,
                    )
                        ? configuration.campaign
                        : {};

                    providerData.configuration = {
                        ...configuration,
                        campaign: {
                            ...existingCampaignConfiguration,
                            status: newStatus,
                        },
                    };

                    providerData.lastSyncedAt = new Date();

                    campaignDocument.markModified(
                        `providers.${providerKey}.configuration`,
                    );

                    await campaignDocument.save();

                    databaseUpdated = true;
                }
            }
        } catch (databaseError) {
            console.error(
                "Campaign status updated on provider, but MongoDB update failed:",
                databaseError,
            );

            return res.status(500).json({
                success: false,
                message:
                    "Campaign status was updated on the provider, but the local database update failed.",
                provider: providerKey,
                campaignId: normalizedCampaignId,
                newStatus,
                providerUpdated: true,
                databaseUpdated: false,
                error: getErrorMessage(databaseError),
            });
        }

        // 7. Return the final result.
        return res.status(200).json({
            success: true,
            message: `${providerKey === "googleAds" ? "Google Ads" : "Meta Ads"} campaign status updated to ${newStatus}.`,
            provider: providerKey,
            campaignId: normalizedCampaignId,
            newStatus,
            validateOnly: false,
            providerUpdated: true,
            databaseUpdated,
            providerResponse,
        });
    } catch (error) {
        console.error("Global campaign status update error:", error);

        return res.status(500).json({
            success: false,
            message: getErrorMessage(error),
        });
    }
});

router.delete(
    "/delete/:provider/:campaignId",
    async (req: Request, res: Response) => {
        try {
            // 1. Authenticate the user.
            const { userId } = getAuth(req);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required.",
                });
            }

            // 2. Validate provider and campaign ID.
            const { provider, campaignId }: any = req.params;

            if (provider !== "googleAds" && provider !== "metaAds") {
                return res.status(400).json({
                    success: false,
                    message: "Invalid provider.",
                });
            }

            if (!/^\d+$/.test(campaignId.trim())) {
                return res.status(400).json({
                    success: false,
                    message: "A valid provider campaign ID is required.",
                });
            }

            const providerKey = provider as "googleAds" | "metaAds";
            const normalizedCampaignId = campaignId?.trim();

            // 3. Find the user's selected provider account.
            const selectedAccount = await AdAccountModel.findOne({
                userId,
                provider: providerKey,
                isSelected: true,
            })
                .select("externalAccountId")
                .lean();

            if (!selectedAccount?.externalAccountId) {
                return res.status(409).json({
                    success: false,
                    message: `No selected ${providerKey} account found.`,
                });
            }

            const accountId = selectedAccount.externalAccountId;

            // 4. Delete/remove the campaign on the advertising platform.
            let providerResponse: unknown;

            try {
                if (providerKey === "googleAds") {
                    const customerId = String(accountId)
                        .trim()
                        .replace(/^customers\//i, "")
                        .replace(/-/g, "");

                    if (!/^\d+$/.test(customerId)) {
                        return res.status(409).json({
                            success: false,
                            message: "Invalid selected Google Ads customer ID.",
                        });
                    }

                    providerResponse = await removeGoogleAdsCampaign(
                        userId,
                        normalizedCampaignId,
                        customerId,
                        false,
                    );
                } else {
                    providerResponse = await deleteMetaAdsCampaign(
                        normalizedCampaignId,
                        userId,
                    );
                }
            } catch (providerError) {
                console.error(
                    `${providerKey} campaign deletion failed:`,
                    providerError,
                );

                return res.status(502).json({
                    success: false,
                    message: getErrorMessage(providerError),
                    provider: providerKey,
                    campaignId: normalizedCampaignId,
                    providerUpdated: false,
                    databaseUpdated: false,
                });
            }

            // 5. Find the matching local campaign document.
            let databaseUpdated = false;

            try {
                const campaignDocuments = await CampaignModel.find({
                    ownerUserId: userId,
                    [`providers.${providerKey}.providerCampaignId`]:
                        normalizedCampaignId,
                });

                const normalizeAccountId = (value: unknown) =>
                    providerKey === "googleAds"
                        ? normalizeGoogleAccountId(value)
                        : normalizeMetaAccountId(value);

                const campaignDocument = campaignDocuments.find(
                    (document) => {
                        const providerData =
                            document.providers?.[providerKey];

                        return (
                            providerData &&
                            normalizeAccountId(providerData.accountId) ===
                            normalizeAccountId(accountId)
                        );
                    },
                );

                // 6. Preserve the MongoDB record and update provider state.
                if (campaignDocument) {
                    const providerData =
                        campaignDocument.providers[providerKey];

                    if (providerData) {
                        const configuration =
                            providerData.configuration ?? {};

                        const existingCampaignConfiguration = isRecord(
                            configuration.campaign,
                        )
                            ? configuration.campaign
                            : {};

                        providerData.configuration = {
                            ...configuration,
                            campaign: {
                                ...existingCampaignConfiguration,
                                status:
                                    providerKey === "googleAds"
                                        ? "REMOVED"
                                        : "DELETED",
                            },
                        };

                        providerData.lastSyncedAt = new Date();

                        campaignDocument.markModified(
                            `providers.${providerKey}.configuration`,
                        );

                        await campaignDocument.save();

                        databaseUpdated = true;
                    }
                }
            } catch (databaseError) {
                console.error(
                    "Provider campaign deleted, but MongoDB update failed:",
                    databaseError,
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Campaign was deleted on the provider, but local database synchronization failed.",
                    provider: providerKey,
                    campaignId: normalizedCampaignId,
                    providerUpdated: true,
                    databaseUpdated: false,
                    error: getErrorMessage(databaseError),
                });
            }

            // 7. Send final response.
            return res.status(200).json({
                success: true,
                message:
                    providerKey === "googleAds"
                        ? "Google Ads campaign removed successfully."
                        : "Meta Ads campaign deleted successfully.",
                provider: providerKey,
                campaignId: normalizedCampaignId,
                providerUpdated: true,
                databaseUpdated,
                providerResponse,
            });
        } catch (error) {
            console.error("Global campaign deletion error:", error);

            return res.status(500).json({
                success: false,
                message: getErrorMessage(error),
            });
        }
    },
);
// ==========================================
// SELECTED GOOGLE ADS ACCOUNT LOOKUP
// ==========================================

async function withGoogleAdsLookup(
    req: Request,
    res: Response,
    lookup: (
        context: Awaited<
            ReturnType<typeof getGoogleAdsCreationContext>
        >,
    ) => Promise<unknown>,
) {
    try {
        // 1. Authenticate user.
        const { userId } = getAuth(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
        }

        // 2. Resolve the selected Google Ads account.
        const selectedAccount = await AdAccountModel.findOne({
            userId,
            provider: "googleAds",
            isSelected: true,
        })
            .select("externalAccountId")
            .lean();

        if (!selectedAccount?.externalAccountId) {
            return res.status(409).json({
                success: false,
                message:
                    "No selected Google Ads account found. Please select an account first.",
            });
        }

        // 3. Build the authenticated Google Ads context.
        const context = await getGoogleAdsCreationContext(
            userId,
            selectedAccount.externalAccountId,
        );

        // 4. Execute lookup.
        const data = await lookup(context);

        return res.status(200).json({
            success: true,
            provider: "googleAds",
            accountId: `customers/${context.customerId}`,
            data,
        });
    } catch (error) {
        console.error("Google Ads lookup route failed:", error);

        const statusCode =
            error instanceof GoogleAdsLookupError
                ? error.statusCode
                : 500;

        return res.status(statusCode).json({
            success: false,
            message: getErrorMessage(error),
            ...(error instanceof GoogleAdsLookupError &&
                error.details !== undefined && {
                details: error.details,
            }),
        });
    }
}

// ==========================================
// 1. SEARCH GOOGLE ADS LOCATIONS
// ==========================================

router.get("/lookups/google/locations", async (req, res) => {
    const query =
        typeof req.query.q === "string"
            ? req.query.q.trim()
            : "";

    const countryCode =
        typeof req.query.countryCode === "string"
            ? req.query.countryCode
            : undefined;

    const locale =
        typeof req.query.locale === "string"
            ? req.query.locale
            : "en";

    return withGoogleAdsLookup(req, res, (context) =>
        searchGoogleAdsLocations(context, {
            query,
            countryCode,
            locale,
        }),
    );
});

// ==========================================
// 2. GET GOOGLE ADS LANGUAGES
// ==========================================

router.get("/lookups/google/languages", async (req, res) => {
    return withGoogleAdsLookup(req, res, (context) =>
        getGoogleAdsLanguages(context),
    );
});

// ==========================================
// 3. GET GOOGLE ADS USER LISTS
// ==========================================

router.get("/lookups/google/user-lists", async (req, res) => {
    const pageToken =
        typeof req.query.pageToken === "string"
            ? req.query.pageToken
            : undefined;

    return withGoogleAdsLookup(req, res, (context) =>
        getGoogleAdsUserLists(context, pageToken),
    );
});

// ==========================================
// 4. GET GOOGLE ADS CUSTOM CONVERSION GOALS
// ==========================================

router.get(
    "/lookups/google/conversion-goals",
    async (req, res) => {
        const pageToken =
            typeof req.query.pageToken === "string"
                ? req.query.pageToken
                : undefined;

        return withGoogleAdsLookup(req, res, (context) =>
            getGoogleAdsCustomConversionGoals(
                context,
                pageToken,
            ),
        );
    },
);
export default router;
