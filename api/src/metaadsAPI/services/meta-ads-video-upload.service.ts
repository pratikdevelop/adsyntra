import type { MetaAdsCreationContext } from "./campaign-creation.js";
import { MetaAdsCampaignCreationError } from "./campaign-creation.js";

const MAX_META_VIDEO_BYTES = 100 * 1024 * 1024;
const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);
const VIDEO_READY_POLL_ATTEMPTS = 20;
const VIDEO_READY_POLL_INTERVAL_MS = 3_000;

interface MetaVideoUploadResponse {
  id?: string;
  video_id?: string;
  success?: boolean;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
  [key: string]: unknown;
}

interface MetaVideoDetailsResponse {
  id?: string;
  status?: {
    video_status?: string;
    processing_progress?: number;
    [key: string]: unknown;
  };
  video_status?: string;
  thumbnails?: {
    data?: Array<{
      uri?: string;
      is_preferred?: boolean;
      [key: string]: unknown;
    }>;
  };
  error?: MetaVideoUploadResponse["error"];
  [key: string]: unknown;
}

export interface UploadMetaAdsVideoInput {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  title?: string;
}

export interface MetaAdsVideoUploadResult {
  adAccountId: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  videoId: string;
  thumbnailUrl: string;
  processingStatus: "READY";
  metaResponse: MetaVideoUploadResponse;
  videoDetails: MetaVideoDetailsResponse;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readVideoStatus(body: MetaVideoDetailsResponse): string {
  const nestedStatus = body.status;
  const value = nestedStatus && typeof nestedStatus.video_status === "string"
    ? nestedStatus.video_status
    : body.video_status;
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function readPreferredThumbnail(body: MetaVideoDetailsResponse): string | null {
  const thumbnails = body.thumbnails?.data ?? [];
  const preferred = thumbnails.find(
    (item) => item.is_preferred === true && typeof item.uri === "string" && item.uri.trim(),
  );
  const selected = preferred ?? thumbnails.find(
    (item) => typeof item.uri === "string" && item.uri.trim(),
  );
  if (!selected || typeof selected.uri !== "string") return null;
  try {
    const url = new URL(selected.uri);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function readMetaVideoDetails(
  context: MetaAdsCreationContext,
  videoId: string,
): Promise<MetaVideoDetailsResponse> {
  const url = new URL(
    `https://graph.facebook.com/${context.apiVersion}/${encodeURIComponent(videoId)}`,
  );
  url.searchParams.set("fields", "status,thumbnails{uri,is_preferred}");

  let response: Response;
  let body: MetaVideoDetailsResponse;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    });
    body = (await response.json().catch(() => ({}))) as MetaVideoDetailsResponse;
  } catch (error) {
    throw new MetaAdsCampaignCreationError(
      error instanceof Error
        ? `Could not retrieve Meta video processing status: ${error.message}`
        : "Could not retrieve Meta video processing status.",
      502,
    );
  }

  if (!response.ok || body.error) {
    throw new MetaAdsCampaignCreationError(
      body.error?.message
        ? `Meta video status lookup failed: ${body.error.message}`
        : `Meta video status lookup failed with HTTP ${response.status}.`,
      response.status >= 400 && response.status < 500 ? response.status : 502,
      body,
    );
  }
  return body;
}

/**
 * Uploads an AdSyntra-owned video file to the selected Meta Ad Account.
 * The binary is sent directly as multipart/form-data; private storage URLs
 * and browser-supplied provider IDs are never forwarded to Meta.
 */
export async function uploadMetaAdsVideoAsset(
  context: MetaAdsCreationContext,
  input: UploadMetaAdsVideoInput,
): Promise<{ adAccountId: string; fileName: string; mimeType: string; fileSizeBytes: number; videoId: string; metaResponse: MetaVideoUploadResponse }> {
  if (!context?.adAccountId || !context.accessToken || !context.apiVersion) {
    throw new MetaAdsCampaignCreationError(
      "A valid Meta Ads creation context is required for video upload.",
      400,
    );
  }
  if (!Buffer.isBuffer(input.buffer) || input.buffer.length === 0) {
    throw new MetaAdsCampaignCreationError("A non-empty video buffer is required.", 400);
  }
  if (input.buffer.length > MAX_META_VIDEO_BYTES) {
    throw new MetaAdsCampaignCreationError("Meta video uploads through this integration are limited to 100 MB.", 413);
  }

  const mimeType = input.mimeType.trim().toLowerCase();
  if (!ALLOWED_VIDEO_MIME_TYPES.has(mimeType)) {
    throw new MetaAdsCampaignCreationError("Meta video upload supports MP4, MOV and WebM Asset Library files.", 400);
  }

  const fileName = input.fileName.trim().replace(/[\\/\r\n]/g, "_");
  if (!fileName || fileName.length > 180) {
    throw new MetaAdsCampaignCreationError("A valid video filename is required.", 400);
  }

  const title = (input.title?.trim() || fileName).slice(0, 240);
  const endpoint = `https://graph-video.facebook.com/${context.apiVersion}/${context.adAccountId}/advideos`;
  const form = new FormData();
  const bytes = Uint8Array.from(input.buffer);
  form.append("source", new Blob([bytes], { type: mimeType }), fileName);
  form.append("title", title);
  form.append("unpublished_content_type", "ADS_POST");

  let response: Response;
  let body: MetaVideoUploadResponse;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        Accept: "application/json",
      },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    body = (await response.json().catch(() => ({}))) as MetaVideoUploadResponse;
  } catch (error) {
    throw new MetaAdsCampaignCreationError(
      error instanceof Error
        ? `Could not reach Meta Graph API during video upload: ${error.message}`
        : "Could not reach Meta Graph API during video upload.",
      502,
    );
  }

  if (!response.ok || body.error) {
    throw new MetaAdsCampaignCreationError(
      body.error?.message
        ? `Meta Ads video upload failed: ${body.error.message}`
        : `Meta Ads video upload failed with HTTP ${response.status}.`,
      response.status >= 400 && response.status < 500 ? response.status : 502,
      body,
    );
  }

  const videoId = typeof body.id === "string" ? body.id.trim()
    : typeof body.video_id === "string" ? body.video_id.trim() : "";
  if (!/^\d+$/.test(videoId)) {
    throw new MetaAdsCampaignCreationError(
      "Meta returned a successful video upload response without a valid video ID.",
      502,
      body,
    );
  }

  return {
    adAccountId: context.adAccountId,
    fileName,
    mimeType,
    fileSizeBytes: input.buffer.length,
    videoId,
    metaResponse: body,
  };
}

/**
 * Waits for Meta's asynchronous video processing and resolves the preferred
 * HTTPS thumbnail needed by AdCreative.video_data. A pending upload is not
 * treated as creative-ready.
 */
export async function waitForMetaAdsVideoReady(
  context: MetaAdsCreationContext,
  videoId: string,
): Promise<{ videoId: string; thumbnailUrl: string; videoDetails: MetaVideoDetailsResponse }> {
  if (!/^\d+$/.test(videoId.trim())) {
    throw new MetaAdsCampaignCreationError("A valid numeric Meta video ID is required.", 400);
  }

  let lastDetails: MetaVideoDetailsResponse = {};
  for (let attempt = 0; attempt < VIDEO_READY_POLL_ATTEMPTS; attempt += 1) {
    lastDetails = await readMetaVideoDetails(context, videoId);
    const status = readVideoStatus(lastDetails);
    if (status === "READY") {
      const thumbnailUrl = readPreferredThumbnail(lastDetails);
      if (!thumbnailUrl) {
        throw new MetaAdsCampaignCreationError(
          "Meta reports that the video is ready but has not returned a preferred HTTPS thumbnail. Retry the creative step after thumbnails are available.",
          409,
          { videoId, status, videoDetails: lastDetails },
        );
      }
      return { videoId, thumbnailUrl, videoDetails: lastDetails };
    }
    if (status === "ERROR") {
      throw new MetaAdsCampaignCreationError(
        "Meta video processing failed. Replace the video asset and upload it again.",
        422,
        { videoId, status, videoDetails: lastDetails },
      );
    }
    if (attempt < VIDEO_READY_POLL_ATTEMPTS - 1) {
      await delay(VIDEO_READY_POLL_INTERVAL_MS);
    }
  }

  throw new MetaAdsCampaignCreationError(
    "Meta accepted the video upload, but processing is still pending. Keep the uploaded video ID and retry the creative step after Meta finishes processing.",
    409,
    { videoId, status: readVideoStatus(lastDetails) || "PROCESSING", videoDetails: lastDetails },
  );
}

export async function uploadAndWaitForMetaAdsVideo(
  context: MetaAdsCreationContext,
  input: UploadMetaAdsVideoInput,
): Promise<MetaAdsVideoUploadResult> {
  const uploaded = await uploadMetaAdsVideoAsset(context, input);
  const ready = await waitForMetaAdsVideoReady(context, uploaded.videoId);
  return {
    ...uploaded,
    thumbnailUrl: ready.thumbnailUrl,
    processingStatus: "READY",
    videoDetails: ready.videoDetails,
  };
}
