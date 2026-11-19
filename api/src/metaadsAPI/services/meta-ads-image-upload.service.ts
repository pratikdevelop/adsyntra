import type { MetaAdsCreationContext } from "./campaign-creation.js";
import { MetaAdsCampaignCreationError } from "./campaign-creation.js";

const MAX_META_IMAGE_BYTES = 20 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
]);

interface MetaUploadedImageEntry {
    hash?: unknown;
    url?: unknown;
    url_128?: unknown;
    id?: unknown;
}

interface MetaImageUploadResponse {
    images?: Record<string, MetaUploadedImageEntry>;
    error?: {
        message?: string;
        type?: string;
        code?: number;
        error_subcode?: number;
        fbtrace_id?: string;
    };
}

export interface UploadMetaAdsImageInput {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
}

export interface MetaAdsImageUploadResult {
    adAccountId: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    imageHash: string;
    imageUrl: string | null;
    thumbnailUrl: string | null;
    metaResponse: MetaImageUploadResponse;
}

/**
 * Uploads an AdSyntra-owned image to the selected Meta Ad Account.
 * The returned imageHash is the value used by Meta AdCreative link_data.image_hash.
 * This function never accepts a browser-supplied URL or Meta access token.
 */
export async function uploadMetaAdsImageAsset(
    context: MetaAdsCreationContext,
    input: UploadMetaAdsImageInput,
): Promise<MetaAdsImageUploadResult> {
    if (!context?.adAccountId || !context.accessToken || !context.apiVersion) {
        throw new MetaAdsCampaignCreationError(
            "A valid Meta Ads creation context is required for image upload.",
            400,
        );
    }

    if (!Buffer.isBuffer(input.buffer) || input.buffer.length === 0) {
        throw new MetaAdsCampaignCreationError(
            "A non-empty image buffer is required for Meta Ads upload.",
            400,
        );
    }

    if (input.buffer.length > MAX_META_IMAGE_BYTES) {
        throw new MetaAdsCampaignCreationError(
            "Meta Ads image uploads must not exceed 20 MB in this integration.",
            400,
        );
    }

    const mimeType = input.mimeType.trim().toLowerCase();
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
        throw new MetaAdsCampaignCreationError(
            "Meta Ads image upload currently supports JPEG and PNG files only.",
            400,
        );
    }

    const fileName = input.fileName.trim().replace(/[\\/\r\n]/g, "_");
    if (!fileName || fileName.length > 180) {
        throw new MetaAdsCampaignCreationError(
            "A valid image file name is required for Meta Ads upload.",
            400,
        );
    }

    const endpoint =
        `https://graph.facebook.com/${context.apiVersion}/` +
        `${context.adAccountId}/adimages`;

    const form = new FormData();
    const imageBytes = Uint8Array.from(input.buffer);
    const imageBlob = new Blob([imageBytes], { type: mimeType });
    form.append("filename", imageBlob, fileName);

    let response: Response;
    let responseBody: MetaImageUploadResponse;

    try {
        response = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${context.accessToken}`,
                Accept: "application/json",
            },
            body: form,
            signal: AbortSignal.timeout(60_000),
        });

        responseBody = (await response.json().catch(() => ({}))) as MetaImageUploadResponse;
    } catch (error) {
        throw new MetaAdsCampaignCreationError(
            error instanceof Error
                ? `Could not reach Meta Graph API during image upload: ${error.message}`
                : "Could not reach Meta Graph API during image upload.",
            502,
        );
    }

    if (!response.ok || responseBody.error) {
        const apiError = responseBody.error;
        const message = apiError?.message
            ? `Meta Ads image upload failed: ${apiError.message}`
            : `Meta Ads image upload failed with HTTP ${response.status}.`;

        throw new MetaAdsCampaignCreationError(
            message,
            response.status >= 400 && response.status < 500 ? response.status : 502,
            responseBody,
        );
    }

    const uploadedEntries = Object.values(responseBody.images ?? {});
    const uploadedImage = uploadedEntries.find(
        (entry) => typeof entry.hash === "string" && entry.hash.trim().length > 0,
    );

    if (!uploadedImage || typeof uploadedImage.hash !== "string") {
        throw new MetaAdsCampaignCreationError(
            "Meta returned a successful upload response without an image hash.",
            502,
            responseBody,
        );
    }

    return {
        adAccountId: context.adAccountId,
        fileName,
        mimeType,
        fileSizeBytes: input.buffer.length,
        imageHash: uploadedImage.hash,
        imageUrl: typeof uploadedImage.url === "string" ? uploadedImage.url : null,
        thumbnailUrl:
            typeof uploadedImage.url_128 === "string" ? uploadedImage.url_128 : null,
        metaResponse: responseBody,
    };
}
