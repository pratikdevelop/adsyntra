
import {
  getMetaAdsCreationContext,
} from "./campaign-creation.js";

import type {
  MetaAdsCreationContext,
} from "./campaign-creation.js";

import type {
  AssetKind,
  ProviderCreativeContent,
  ProviderCreativeMediaReference,
  ProviderCreativeCard,
} from "../../models/asset.model.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type MetaAdsAssetFilter =
  | "ALL"
  | "IMAGE"
  | "VIDEO"
  | "TEXT"
  | "CTA"
  | "CREATIVE";

/**
 * TEXT and CTA are filters over creative content.
 *
 * Meta stores these as parts of an AdCreative, not as separate
 * reusable standalone assets like some Google Ads asset types.
 *
 * Therefore these filters return the original CREATIVE record,
 * preserving its original creative ID and structured content.
 */
export interface ListMetaAdsAssetsInput {
  kind?: MetaAdsAssetFilter;
  limit?: number;
  pageToken?: string;
}

export interface MetaAdsProviderAsset {
  provider: "metaAds";
  accountId: string;

  assetId: string;
  resourceName: null;

  assetType: string;
  name: string;
  kind: AssetKind;

  mimeType: string | null;

  mediaUrl: string | null;
  thumbnailUrl: string | null;

  imageHash: string | null;
  videoId: string | null;

  width: number | null;
  height: number | null;
  aspectRatio: string | null;

  sizeBytes: null;

  /** Standalone TEXT assets or a combined text preview. */
  textContent: string | null;

  /** Complete Meta ad creative content. */
  providerCreative: ProviderCreativeContent | null;

  /** Meta creatives do not have Google-style asset extensions. */
  providerExtension: null;

  creativeId: string | null;
  adId: string | null;
  campaignId: string | null;
  adGroupId: null;
  adSetId: string | null;

  source: string | null;

  createdTime: string | null;
  updatedTime: string | null;
}

export interface ListMetaAdsAssetsResult {
  provider: "metaAds";
  accountId: string;
  assets: MetaAdsProviderAsset[];
  nextPageToken: string | null;
}

/* -------------------------------------------------------------------------- */
/* Graph API response types                                                   */
/* -------------------------------------------------------------------------- */

type MetaRecord = Record<string, unknown>;

interface MetaAdImage {
  id?: string;
  hash?: string;
  name?: string;
  url?: string;
  url_128?: string;
  width?: number;
  height?: number;
  original_width?: number;
  original_height?: number;
  created_time?: string;
  updated_time?: string;
}

interface MetaAdVideo {
  id?: string;
  title?: string;
  name?: string;
  description?: string;
  picture?: string;
  source?: string;
  width?: number;
  height?: number;
  length?: number;
  created_time?: string;
  updated_time?: string;
  permalink_url?: string;
}

interface MetaAdCreative {
  id?: string;
  name?: string;
  account_id?: string;

  object_type?: string;

  body?: string;
  title?: string;
  description?: string;

  image_url?: string;
  image_hash?: string;
  video_id?: string;
  thumbnail_url?: string;

  link_url?: string;
  link_destination_display_url?: string;

  call_to_action_type?: string;
  call_to_action?: unknown;

  object_story_spec?: unknown;
  asset_feed_spec?: unknown;

  effective_object_story_id?: string;
  instagram_permalink_url?: string;
}

interface MetaPaging {
  cursors?: {
    before?: string;
    after?: string;
  };
  next?: string;
}

interface MetaGraphPage<T> {
  data?: T[];
  paging?: MetaPaging;
}

interface MetaGraphErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/* -------------------------------------------------------------------------- */
/* Pagination                                                                 */
/* -------------------------------------------------------------------------- */

interface MetaAssetPageTokenV2 {
  version: 2;
  kind: MetaAdsAssetFilter;

  imagesAfter?: string;
  videosAfter?: string;
  creativesAfter?: string;

  imagesDone: boolean;
  videosDone: boolean;
  creativesDone: boolean;
}

interface MetaAssetPageTokenV1 {
  version: 1;
  kind: string;
  imagesAfter?: string;
  videosAfter?: string;
}

type MetaAssetPageState = MetaAssetPageTokenV2;

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const IMAGE_FIELDS = [
  "id",
  "hash",
  "name",
  "url",
  "url_128",
  "width",
  "height",
  "original_width",
  "original_height",
  "created_time",
  "updated_time",
].join(",");

const VIDEO_FIELDS = [
  "id",
  "title",
  "name",
  "description",
  "picture",
  "source",
  "width",
  "height",
  "length",
  "created_time",
  "updated_time",
  "permalink_url",
].join(",");

/**
 * Fields used to retrieve the complete AdCreative resource.
 *
 * object_story_spec contains conventional creative content.
 * asset_feed_spec contains Dynamic Creative variations.
 */
const CREATIVE_FIELDS = [
  "id",
  "account_id",
  "name",
  "object_type",

  "body",
  "title",
  "description",

  "image_url",
  "image_hash",
  "video_id",
  "thumbnail_url",

  "link_url",
  "link_destination_display_url",

  "call_to_action_type",
  "call_to_action",

  "object_story_spec",
  "asset_feed_spec",

  "effective_object_story_id",
  "instagram_permalink_url",
].join(",");

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class MetaAdsAssetServiceError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    details?: unknown,
  ) {
    super(message);
    this.name = "MetaAdsAssetServiceError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

/* -------------------------------------------------------------------------- */
/* General helpers                                                            */
/* -------------------------------------------------------------------------- */

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return value.trim() || null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

function normalizeProviderUrl(
  value: unknown,
): string | null {
  const normalized = normalizeString(value);

  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);

    if (url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function getRecord(value: unknown): MetaRecord | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as MetaRecord;
}

function getNestedRecord(
  parent: MetaRecord | null,
  key: string,
): MetaRecord | null {
  return getRecord(parent?.[key]);
}

function getNestedRecords(
  parent: MetaRecord | null,
  key: string,
): MetaRecord[] {
  const value = parent?.[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(getRecord)
    .filter(
      (record): record is MetaRecord =>
        record !== null,
    );
}

function getTextValue(
  record: MetaRecord | null,
  key: string,
): string | null {
  return normalizeString(record?.[key]);
}

function uniqueStrings(
  values: Array<string | null | undefined>,
): string[] {
  return [
    ...new Set(
      values
        .map((value) => normalizeString(value))
        .filter(
          (value): value is string =>
            Boolean(value),
        ),
    ),
  ];
}

/**
 * Meta feed assets commonly represent text as objects containing
 * a "text" property. Some Graph responses may also provide strings.
 */
function extractTextValues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const values: string[] = [];

  for (const item of value) {
    if (typeof item === "string") {
      const normalized = normalizeString(item);

      if (normalized) {
        values.push(normalized);
      }

      continue;
    }

    const record = getRecord(item);
    const text = normalizeString(record?.text);

    if (text) {
      values.push(text);
    }
  }

  return [...new Set(values)];
}

function getFirstText(
  ...values: unknown[]
): string | null {
  for (const value of values) {
    const text = normalizeString(value);

    if (text) {
      return text;
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* MIME and aspect ratio                                                      */
/* -------------------------------------------------------------------------- */

function getImageMimeType(
  mediaUrl: string | null,
): string | null {
  if (!mediaUrl) {
    return null;
  }

  try {
    const pathname = new URL(mediaUrl).pathname.toLowerCase();

    if (
      pathname.endsWith(".jpg") ||
      pathname.endsWith(".jpeg")
    ) {
      return "image/jpeg";
    }

    if (pathname.endsWith(".png")) {
      return "image/png";
    }

    if (pathname.endsWith(".webp")) {
      return "image/webp";
    }

    if (pathname.endsWith(".gif")) {
      return "image/gif";
    }

    return null;
  } catch {
    return null;
  }
}

function calculateAspectRatio(
  width: number | null,
  height: number | null,
): string | null {
  if (!width || !height) {
    return null;
  }

  const ratio = width / height;

  const knownRatios = [
    { ratio: 1, label: "1:1" },
    { ratio: 4 / 5, label: "4:5" },
    { ratio: 9 / 16, label: "9:16" },
    { ratio: 16 / 9, label: "16:9" },
    { ratio: 1.91, label: "1.91:1" },
  ];

  const matched = knownRatios.find(
    (item) => Math.abs(item.ratio - ratio) <= 0.015,
  );

  return (
    matched?.label ??
    (ratio >= 1
      ? `${ratio.toFixed(2)}:1`
      : `1:${(1 / ratio).toFixed(2)}`)
  );
}

/* -------------------------------------------------------------------------- */
/* Pagination state                                                           */
/* -------------------------------------------------------------------------- */

function includesImages(kind: MetaAdsAssetFilter): boolean {
  return kind === "ALL" || kind === "IMAGE";
}

function includesVideos(kind: MetaAdsAssetFilter): boolean {
  return kind === "ALL" || kind === "VIDEO";
}

function includesCreatives(kind: MetaAdsAssetFilter): boolean {
  return (
    kind === "ALL" ||
    kind === "CREATIVE" ||
    kind === "TEXT" ||
    kind === "CTA"
  );
}

function createInitialPageState(
  kind: MetaAdsAssetFilter,
): MetaAssetPageState {
  return {
    version: 2,
    kind,

    imagesDone: !includesImages(kind),
    videosDone: !includesVideos(kind),
    creativesDone: !includesCreatives(kind),
  };
}

/**
 * Encode independent image, video and creative cursors into one
 * opaque pagination token.
 */
function encodePageToken(
  state: MetaAssetPageState,
): string | null {
  const hasMore =
    !state.imagesDone ||
    !state.videosDone ||
    !state.creativesDone;

  if (!hasMore) {
    return null;
  }

  return Buffer.from(
    JSON.stringify(state),
    "utf8",
  ).toString("base64url");
}

/**
 * Decode pagination tokens.
 *
 * Supports:
 * - Current version 2 tokens.
 * - Existing version 1 tokens containing image/video cursors.
 *
 * Version 1 compatibility prevents older UI pagination tokens from
 * immediately breaking when this service is deployed.
 */
function decodePageToken(
  value: string | undefined,
  expectedKind: MetaAdsAssetFilter,
): MetaAssetPageState {
  if (!value) {
    return createInitialPageState(expectedKind);
  }

  if (value.length > 10000) {
    throw new MetaAdsAssetServiceError(
      "Meta Ads pagination token is too long.",
      400,
    );
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<
      MetaAssetPageTokenV1 & MetaAssetPageTokenV2
    >;

    if (!parsed || parsed.kind !== expectedKind) {
      throw new Error("Invalid cursor kind.");
    }

    if (parsed.version === 2) {
      if (
        typeof parsed.imagesDone !== "boolean" ||
        typeof parsed.videosDone !== "boolean" ||
        typeof parsed.creativesDone !== "boolean" ||
        (
          parsed.imagesAfter !== undefined &&
          typeof parsed.imagesAfter !== "string"
        ) ||
        (
          parsed.videosAfter !== undefined &&
          typeof parsed.videosAfter !== "string"
        ) ||
        (
          parsed.creativesAfter !== undefined &&
          typeof parsed.creativesAfter !== "string"
        )
      ) {
        throw new Error("Invalid version 2 cursor.");
      }

      return {
        version: 2,
        kind: expectedKind,

        imagesAfter: parsed.imagesAfter,
        videosAfter: parsed.videosAfter,
        creativesAfter: parsed.creativesAfter,

        imagesDone:
          parsed.imagesDone ||
          !includesImages(expectedKind),

        videosDone:
          parsed.videosDone ||
          !includesVideos(expectedKind),

        creativesDone:
          parsed.creativesDone ||
          !includesCreatives(expectedKind),
      };
    }

    if (parsed.version === 1) {
      return {
        version: 2,
        kind: expectedKind,

        imagesAfter: parsed.imagesAfter,
        videosAfter: parsed.videosAfter,

        imagesDone:
          !includesImages(expectedKind) ||
          !parsed.imagesAfter,

        videosDone:
          !includesVideos(expectedKind) ||
          !parsed.videosAfter,

        creativesDone:
          !includesCreatives(expectedKind),
      };
    }

    throw new Error("Unsupported cursor version.");
  } catch {
    throw new MetaAdsAssetServiceError(
      "Invalid Meta Ads pagination token. Restart asset pagination.",
      400,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Graph API requests                                                         */
/* -------------------------------------------------------------------------- */

type MetaAssetEdge =
  | "adimages"
  | "advideos"
  | "adcreatives";

/**
 * Build a Graph API request for one Ad Account edge.
 *
 * Uses the existing Meta context and bearer-token authentication.
 */
async function fetchMetaAssetPage<T>(
  context: MetaAdsCreationContext,
  edge: MetaAssetEdge,
  fields: string,
  limit: number,
  after?: string,
): Promise<MetaGraphPage<T>> {
  const url = new URL(
    `https://graph.facebook.com/${context.apiVersion}/${context.adAccountId}/${edge}`,
  );

  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", String(limit));

  if (after) {
    url.searchParams.set("after", after);
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new MetaAdsAssetServiceError(
      error instanceof Error
        ? `Unable to connect to Meta Graph API: ${error.message}`
        : "Unable to connect to Meta Graph API.",
      502,
    );
  }

  const responseText = await response.text();

  let responseData:
    | MetaGraphPage<T>
    | MetaGraphErrorResponse;

  try {
    responseData = responseText
      ? JSON.parse(responseText)
      : {};
  } catch {
    throw new MetaAdsAssetServiceError(
      "Meta Graph API returned an invalid JSON response.",
      502,
    );
  }

  if (!response.ok) {
    const metaError =
      (responseData as MetaGraphErrorResponse).error;

    throw new MetaAdsAssetServiceError(
      metaError?.message ??
        `Meta Ads request failed with HTTP ${response.status}.`,
      response.status >= 400 && response.status < 600
        ? response.status
        : 502,
      {
        metaError: metaError ?? responseData,
        requestId:
          response.headers.get("x-fb-trace-id"),
      },
    );
  }

  const result = responseData as MetaGraphPage<T>;

  if (!Array.isArray(result.data)) {
    throw new MetaAdsAssetServiceError(
      `Meta Ads returned an invalid ${edge} response.`,
      502,
      result,
    );
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Image mapping                                                              */
/* -------------------------------------------------------------------------- */

function mapMetaImage(
  image: MetaAdImage,
  accountId: string,
): MetaAdsProviderAsset | null {
  const imageHash = normalizeString(image.hash);

  const assetId =
    normalizeString(image.id) ??
    imageHash;

  if (!assetId) {
    return null;
  }

  const mediaUrl = normalizeProviderUrl(image.url);

  const thumbnailUrl =
    normalizeProviderUrl(image.url_128) ??
    mediaUrl;

  const width =
    parseNumber(image.original_width) ??
    parseNumber(image.width);

  const height =
    parseNumber(image.original_height) ??
    parseNumber(image.height);

  return {
    provider: "metaAds",
    accountId,

    assetId,
    resourceName: null,

    assetType: "IMAGE",

    name:
      normalizeString(image.name) ??
      `Meta Ads Image ${assetId}`,

    kind: "IMAGE",

    mimeType: getImageMimeType(mediaUrl),

    mediaUrl,
    thumbnailUrl,

    imageHash,
    videoId: null,

    width,
    height,
    aspectRatio: calculateAspectRatio(width, height),

    sizeBytes: null,

    textContent: null,

    providerCreative: null,
    providerExtension: null,

    creativeId: null,
    adId: null,
    campaignId: null,
    adGroupId: null,
    adSetId: null,

    source: null,

    createdTime: normalizeString(image.created_time),
    updatedTime: normalizeString(image.updated_time),
  };
}

/* -------------------------------------------------------------------------- */
/* Video mapping                                                              */
/* -------------------------------------------------------------------------- */

function mapMetaVideo(
  video: MetaAdVideo,
  accountId: string,
): MetaAdsProviderAsset | null {
  const assetId = normalizeString(video.id);

  if (!assetId) {
    return null;
  }

  const width = parseNumber(video.width);
  const height = parseNumber(video.height);

  const mediaUrl = normalizeProviderUrl(video.source);
  const thumbnailUrl = normalizeProviderUrl(video.picture);

  return {
    provider: "metaAds",
    accountId,

    assetId,
    resourceName: null,

    assetType: "VIDEO",

    name:
      normalizeString(video.title) ??
      normalizeString(video.name) ??
      normalizeString(video.description)?.slice(0, 150) ??
      `Meta Ads Video ${assetId}`,

    kind: "VIDEO",

    // Do not assume a codec or file format that Meta has not supplied.
    mimeType: null,

    mediaUrl,
    thumbnailUrl,

    imageHash: null,
    videoId: assetId,

    width,
    height,
    aspectRatio: calculateAspectRatio(width, height),

    sizeBytes: null,

    textContent: null,

    providerCreative: null,
    providerExtension: null,

    creativeId: null,
    adId: null,
    campaignId: null,
    adGroupId: null,
    adSetId: null,

    source: null,

    createdTime: normalizeString(video.created_time),
    updatedTime: normalizeString(video.updated_time),
  };
}

/* -------------------------------------------------------------------------- */
/* Creative mapping helpers                                                   */
/* -------------------------------------------------------------------------- */

function getMetaCallToAction(
  creative: MetaAdCreative,
  storyRecords: Array<MetaRecord | null>,
  feedSpec: MetaRecord | null,
): {
  type: string | null;
  link: string | null;
} {
  const feedActions = getNestedRecords(
    feedSpec,
    "call_to_actions",
  );

  const storyAction =
    storyRecords
      .map((record) =>
        getNestedRecord(record, "call_to_action"),
      )
      .find(Boolean) ?? null;

  const topAction = getRecord(creative.call_to_action);

  const feedAction = feedActions[0] ?? null;

  const selectedAction =
    topAction ??
    storyAction ??
    feedAction;

  const value = getNestedRecord(
    selectedAction,
    "value",
  );

  return {
    type: getFirstText(
      creative.call_to_action_type,
      selectedAction?.type,
      getNestedRecords(feedSpec, "call_to_actions")[0]?.type,
      Array.isArray(feedSpec?.call_to_action_types)
        ? (feedSpec.call_to_action_types as unknown[])[0]
        : null,
    ),

    link: getFirstText(
      value?.link,
      value?.website_url,
    ),
  };
}

function mapMetaCarouselCard(
  card: MetaRecord,
  index: number,
  videoMap: Map<string, MetaAdsProviderAsset>,
  imageMap: Map<string, MetaAdsProviderAsset>,
): ProviderCreativeCard {
  const imageHash = getTextValue(card, "image_hash");
  const videoId = getTextValue(card, "video_id");

  const imageAsset = imageHash
    ? imageMap.get(imageHash)
    : undefined;

  const videoAsset = videoId
    ? videoMap.get(videoId)
    : undefined;

  const callToAction = getRecord(
    card.call_to_action,
  );

  const ctaValue = getNestedRecord(
    callToAction,
    "value",
  );

  return {
    cardId:
      getTextValue(card, "id") ??
      `card-${index + 1}`,

    headline: getFirstText(
      card.name,
      card.title,
    ),

    description:
      getTextValue(card, "description"),

    linkUrl: getFirstText(
      card.link,
      ctaValue?.link,
    ),

    callToAction:
      getTextValue(callToAction, "type"),

    callToActionType:
      getTextValue(callToAction, "type"),

    imageUrl:
      normalizeProviderUrl(card.picture) ??
      normalizeProviderUrl(card.url) ??
      imageAsset?.mediaUrl ??
      null,

    videoId,

    thumbnailUrl:
      normalizeProviderUrl(card.thumbnail_url) ??
      videoAsset?.thumbnailUrl ??
      imageAsset?.thumbnailUrl ??
      null,
  };
}

function getCreativeCarouselCards(
  storyRecords: Array<MetaRecord | null>,
  feedSpec: MetaRecord | null,
  videoMap: Map<string, MetaAdsProviderAsset>,
  imageMap: Map<string, MetaAdsProviderAsset>,
): ProviderCreativeCard[] {
  const cards: ProviderCreativeCard[] = [];

  // Conventional carousel creatives.
  for (const storyRecord of storyRecords) {
    const attachments = getNestedRecords(
      storyRecord,
      "child_attachments",
    );

    for (const attachment of attachments) {
      cards.push(
        mapMetaCarouselCard(
          attachment,
          cards.length,
          videoMap,
          imageMap,
        ),
      );
    }
  }

  // Dynamic creative carousel groups.
  const carousels = getNestedRecords(
    feedSpec,
    "carousels",
  );

  for (const carousel of carousels) {
    const carouselCards =
      getNestedRecords(carousel, "cards");

    const childAttachments =
      getNestedRecords(carousel, "child_attachments");

    for (const card of [
      ...carouselCards,
      ...childAttachments,
    ]) {
      cards.push(
        mapMetaCarouselCard(
          card,
          cards.length,
          videoMap,
          imageMap,
        ),
      );
    }
  }

  return cards;
}

/* -------------------------------------------------------------------------- */
/* Creative media mapping                                                     */
/* -------------------------------------------------------------------------- */

function getCreativeMedia(
  creative: MetaAdCreative,
  storyRecords: Array<MetaRecord | null>,
  feedSpec: MetaRecord | null,
  videoMap: Map<string, MetaAdsProviderAsset>,
  imageMap: Map<string, MetaAdsProviderAsset>,
): ProviderCreativeMediaReference[] {
  const media: ProviderCreativeMediaReference[] = [];

  const addMedia = (
    item: ProviderCreativeMediaReference,
  ) => {
    const key = [
      item.kind,
      item.assetId ?? "",
      item.imageHash ?? "",
      item.videoId ?? "",
      item.mediaUrl ?? "",
    ].join(":");

    const existing = media.some(
      (entry) =>
        [
          entry.kind,
          entry.assetId ?? "",
          entry.imageHash ?? "",
          entry.videoId ?? "",
          entry.mediaUrl ?? "",
        ].join(":") === key,
    );

    if (!existing) {
      media.push(item);
    }
  };

  // Direct creative image.
  const directImageHash = normalizeString(
    creative.image_hash,
  );

  const directImage = directImageHash
    ? imageMap.get(directImageHash)
    : undefined;

  const directImageUrl =
    normalizeProviderUrl(creative.image_url) ??
    directImage?.mediaUrl ??
    null;

  if (directImageUrl || directImageHash) {
    addMedia({
      kind: "IMAGE",
      assetId: directImage?.assetId ?? null,
      imageHash: directImageHash,
      videoId: null,
      mediaUrl: directImageUrl,
      thumbnailUrl:
        directImage?.thumbnailUrl ??
        directImageUrl,
    });
  }

  // Direct creative video.
  const directVideoId = normalizeString(
    creative.video_id,
  );

  if (directVideoId) {
    const directVideo = videoMap.get(directVideoId);

    addMedia({
      kind: "VIDEO",
      assetId: directVideoId,
      imageHash: null,
      videoId: directVideoId,
      mediaUrl: directVideo?.mediaUrl ?? null,
      thumbnailUrl:
        normalizeProviderUrl(creative.thumbnail_url) ??
        directVideo?.thumbnailUrl ??
        null,
    });
  }

  // Conventional story media.
  for (const story of storyRecords) {
    if (!story) {
      continue;
    }

    const storyImageHash = normalizeString(
      story.image_hash,
    );

    const imageAsset = storyImageHash
      ? imageMap.get(storyImageHash)
      : undefined;

    const storyImageUrl =
      normalizeProviderUrl(story.picture) ??
      normalizeProviderUrl(story.url) ??
      imageAsset?.mediaUrl ??
      null;

    if (storyImageUrl || storyImageHash) {
      addMedia({
        kind: "IMAGE",
        assetId: imageAsset?.assetId ?? null,
        imageHash: storyImageHash,
        videoId: null,
        mediaUrl: storyImageUrl,
        thumbnailUrl:
          imageAsset?.thumbnailUrl ??
          storyImageUrl,
      });
    }

    const storyVideoId = normalizeString(
      story.video_id,
    );

    if (storyVideoId) {
      const videoAsset = videoMap.get(storyVideoId);

      addMedia({
        kind: "VIDEO",
        assetId: storyVideoId,
        imageHash: null,
        videoId: storyVideoId,
        mediaUrl: videoAsset?.mediaUrl ?? null,
        thumbnailUrl:
          videoAsset?.thumbnailUrl ??
          normalizeProviderUrl(story.image_url),
      });
    }

    // Media attached to carousel children.
    const childAttachments = getNestedRecords(
      story,
      "child_attachments",
    );

    for (const child of childAttachments) {
      const childHash = normalizeString(child.image_hash);
      const childVideoId = normalizeString(child.video_id);

      if (childHash) {
        const image = imageMap.get(childHash);

        addMedia({
          kind: "IMAGE",
          assetId: image?.assetId ?? null,
          imageHash: childHash,
          videoId: null,
          mediaUrl:
            normalizeProviderUrl(child.picture) ??
            image?.mediaUrl ??
            null,
          thumbnailUrl:
            image?.thumbnailUrl ??
            normalizeProviderUrl(child.picture),
        });
      }

      if (childVideoId) {
        const video = videoMap.get(childVideoId);

        addMedia({
          kind: "VIDEO",
          assetId: childVideoId,
          imageHash: null,
          videoId: childVideoId,
          mediaUrl: video?.mediaUrl ?? null,
          thumbnailUrl: video?.thumbnailUrl ?? null,
        });
      }
    }
  }

  // Dynamic creative image feed.
  const feedImages = getNestedRecords(
    feedSpec,
    "images",
  );

  for (const image of feedImages) {
    const hash = normalizeString(image.hash);
    const mapped = hash ? imageMap.get(hash) : undefined;

    const mediaUrl =
      normalizeProviderUrl(image.url) ??
      mapped?.mediaUrl ??
      null;

    const thumbnailUrl =
      normalizeProviderUrl(image.url_128) ??
      mapped?.thumbnailUrl ??
      mediaUrl;

    if (mediaUrl || hash) {
      addMedia({
        kind: "IMAGE",
        assetId: mapped?.assetId ?? null,
        imageHash: hash,
        videoId: null,
        mediaUrl,
        thumbnailUrl,
      });
    }
  }

  // Dynamic creative video feed.
  const feedVideos = getNestedRecords(
    feedSpec,
    "videos",
  );

  for (const video of feedVideos) {
    const videoId = normalizeString(video.video_id);

    if (!videoId) {
      continue;
    }

    const mapped = videoMap.get(videoId);

    addMedia({
      kind: "VIDEO",
      assetId: videoId,
      imageHash: null,
      videoId,
      mediaUrl:
        mapped?.mediaUrl ??
        normalizeProviderUrl(video.url),
      thumbnailUrl:
        normalizeProviderUrl(video.thumbnail_url) ??
        mapped?.thumbnailUrl ??
        null,
    });
  }

  return media;
}

/* -------------------------------------------------------------------------- */
/* Creative content mapping                                                   */
/* -------------------------------------------------------------------------- */

function mapMetaCreativeContent(
  creative: MetaAdCreative,
  videoMap: Map<string, MetaAdsProviderAsset>,
  imageMap: Map<string, MetaAdsProviderAsset>,
): ProviderCreativeContent {
  const storySpec = getRecord(
    creative.object_story_spec,
  );

  const linkData = getNestedRecord(
    storySpec,
    "link_data",
  );

  const photoData = getNestedRecord(
    storySpec,
    "photo_data",
  );

  const videoData = getNestedRecord(
    storySpec,
    "video_data",
  );

  const textData = getNestedRecord(
    storySpec,
    "text_data",
  );

  const templateData = getNestedRecord(
    storySpec,
    "template_data",
  );

  const storyRecords = [
    linkData,
    photoData,
    videoData,
    textData,
    templateData,
  ];

  const feedSpec = getRecord(
    creative.asset_feed_spec,
  );

  /* ------------------------------- Text --------------------------------- */

  const primaryTexts = uniqueStrings([
    normalizeString(creative.body),
    getTextValue(linkData, "message"),
    getTextValue(videoData, "message"),
    getTextValue(textData, "message"),
    getTextValue(photoData, "caption"),
    getTextValue(templateData, "message"),
    ...extractTextValues(feedSpec?.bodies),
  ]);

  const headlines = uniqueStrings([
    normalizeString(creative.title),
    getTextValue(linkData, "name"),
    getTextValue(videoData, "title"),
    getTextValue(templateData, "name"),
    ...extractTextValues(feedSpec?.titles),
  ]);

  const descriptions = uniqueStrings([
    normalizeString(creative.description),
    getTextValue(linkData, "description"),
    getTextValue(videoData, "link_description"),
    getTextValue(templateData, "description"),
    ...extractTextValues(feedSpec?.descriptions),
  ]);

  /* ------------------------------- CTA ---------------------------------- */

  const cta = getMetaCallToAction(
    creative,
    storyRecords,
    feedSpec,
  );

  /* ----------------------------- Link URLs ------------------------------ */

  const feedLinkUrls = getNestedRecords(
    feedSpec,
    "link_urls",
  );

  const feedCallToActions = getNestedRecords(
    feedSpec,
    "call_to_actions",
  );

  const feedActionLinks = feedCallToActions
    .map((action) => {
      const value = getNestedRecord(action, "value");

      return getFirstText(
        value?.link,
        value?.website_url,
      );
    });

  const finalUrls = uniqueStrings([
    normalizeString(creative.link_url),
    getTextValue(linkData, "link"),
    getTextValue(videoData, "link"),
    getTextValue(templateData, "link"),
    cta.link,

    ...feedLinkUrls.map(
      (item) =>
        normalizeString(item.website_url),
    ),

    ...feedActionLinks,
  ]);

  const displayUrl =
    normalizeString(creative.link_destination_display_url) ??
    getFirstText(
      ...feedLinkUrls.map((item) => item.display_url),
    );

  /* ----------------------------- Media ---------------------------------- */

  const media = getCreativeMedia(
    creative,
    storyRecords,
    feedSpec,
    videoMap,
    imageMap,
  );

  const carouselCards = getCreativeCarouselCards(
    storyRecords,
    feedSpec,
    videoMap,
    imageMap,
  );

  const relatedAssetIds = uniqueStrings(
    media.map((item) => item.assetId),
  );

  return {
    creativeType:
      normalizeString(creative.object_type) ??
      (feedSpec ? "DYNAMIC_CREATIVE" : "UNKNOWN"),

    primaryTexts,
    headlines,
    longHeadlines: [],
    descriptions,

    callToAction: cta.type,
    callToActionType: cta.type,

    linkDescription:
      descriptions[0] ?? null,

    displayUrl,

    finalUrls,

    carouselCards,
    media,
    relatedAssetIds,
  };
}

/* -------------------------------------------------------------------------- */
/* Complete Meta AdCreative mapping                                           */
/* -------------------------------------------------------------------------- */

function mapMetaCreative(
  creative: MetaAdCreative,
  accountId: string,
  videoMap: Map<string, MetaAdsProviderAsset>,
  imageMap: Map<string, MetaAdsProviderAsset>,
): MetaAdsProviderAsset | null {
  const assetId = normalizeString(creative.id);

  if (!assetId) {
    return null;
  }

  const providerCreative = mapMetaCreativeContent(
    creative,
    videoMap,
    imageMap,
  );

  const primaryMedia = providerCreative.media[0] ?? null;

  const primaryVideo = providerCreative.media.find(
    (item) => item.kind === "VIDEO",
  );

  const primaryImage = providerCreative.media.find(
    (item) => item.kind === "IMAGE",
  );

  const textContent = uniqueStrings([
    ...providerCreative.primaryTexts,
    ...providerCreative.headlines,
    ...providerCreative.longHeadlines,
    ...providerCreative.descriptions,
  ]).join("\n");

  const firstStoryId = normalizeString(
    creative.effective_object_story_id,
  );

  return {
    provider: "metaAds",
    accountId,

    assetId,
    resourceName: null,

    assetType: "AD_CREATIVE",

    name:
      normalizeString(creative.name) ??
      providerCreative.headlines[0] ??
      `Meta Ads Creative ${assetId}`,

    kind: "CREATIVE",

    mimeType: null,

    mediaUrl:
      primaryMedia?.mediaUrl ?? null,

    thumbnailUrl:
      primaryVideo?.thumbnailUrl ??
      primaryImage?.thumbnailUrl ??
      normalizeProviderUrl(creative.thumbnail_url),

    imageHash:
      primaryImage?.imageHash ?? null,

    videoId:
      primaryVideo?.videoId ??
      normalizeString(creative.video_id),

    width: null,
    height: null,
    aspectRatio: null,

    sizeBytes: null,

    textContent: textContent || null,

    providerCreative,
    providerExtension: null,

    creativeId: assetId,

    // The AdCreative endpoint returns creative-level records.
    // A single creative may be reused by more than one ad.
    // Ad, campaign and ad-set relationships require a separate
    // account /ads relationship query.
    adId: null,
    campaignId: null,
    adGroupId: null,
    adSetId: null,

    source: firstStoryId ??
      normalizeString(creative.instagram_permalink_url),

    createdTime: null,
    updatedTime: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Filter matching                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Meta stores text and CTA content inside AdCreative.
 *
 * These filters inspect structured content but preserve the underlying
 * record type as CREATIVE. That prevents one provider creative ID from
 * creating duplicate database records under different asset kinds.
 */
function matchesCreativeFilter(
  creative: MetaAdsProviderAsset,
  kind: MetaAdsAssetFilter,
): boolean {
  if (kind === "TEXT") {
    const content = creative.providerCreative;

    return Boolean(
      content &&
      (
        content.primaryTexts.length > 0 ||
        content.headlines.length > 0 ||
        content.descriptions.length > 0
      ),
    );
  }

  if (kind === "CTA") {
    return Boolean(
      creative.providerCreative?.callToAction ||
      creative.providerCreative?.callToActionType,
    );
  }

  return true;
}

/* -------------------------------------------------------------------------- */
/* Main service                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Retrieve provider-owned media and creative records from a Meta Ad Account.
 *
 * API edges:
 *
 * /adimages
 *   Original account image library.
 *
 * /advideos
 *   Original account video library.
 *
 * /adcreatives
 *   Complete creative content, including:
 *   - Primary text and body variations.
 *   - Headlines and title variations.
 *   - Descriptions.
 *   - Call-to-action type and destination.
 *   - Object story specifications.
 *   - Carousel cards.
 *   - Dynamic creative asset feeds.
 *   - Feed images, videos and destination URLs.
 *
 * Media binaries are not downloaded or copied.
 *
 * All account authentication and token refresh behavior is delegated to
 * getMetaAdsCreationContext().
 *
 * The authenticated API route must verify account ownership and selected
 * account status before calling this service.
 */
export async function listMetaAdsAssets(
  userId: string,
  selectedAccountId: string,
  input: ListMetaAdsAssetsInput = {},
): Promise<ListMetaAdsAssetsResult> {
  if (!userId?.trim()) {
    throw new MetaAdsAssetServiceError(
      "Authenticated user ID is required.",
      401,
    );
  }

  if (!selectedAccountId?.trim()) {
    throw new MetaAdsAssetServiceError(
      "Meta Ads account ID is required.",
      400,
    );
  }

  const kind = input.kind ?? "ALL";

  const supportedKinds: MetaAdsAssetFilter[] = [
    "ALL",
    "IMAGE",
    "VIDEO",
    "TEXT",
    "CTA",
    "CREATIVE",
  ];

  if (!supportedKinds.includes(kind)) {
    throw new MetaAdsAssetServiceError(
      "Invalid Meta Ads asset filter. Use ALL, IMAGE, VIDEO, TEXT, CTA or CREATIVE.",
      400,
    );
  }

  const limit =
    input.limit === undefined
      ? DEFAULT_PAGE_SIZE
      : input.limit;

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_SIZE
  ) {
    throw new MetaAdsAssetServiceError(
      `limit must be between 1 and ${MAX_PAGE_SIZE}.`,
      400,
    );
  }

  const pageToken = decodePageToken(
    input.pageToken,
    kind,
  );

  // Reuse existing Meta OAuth and token-refresh logic.
  const context = await getMetaAdsCreationContext(
    userId,
    selectedAccountId,
  );

  const imageRequest =
    !pageToken.imagesDone
      ? fetchMetaAssetPage<MetaAdImage>(
          context,
          "adimages",
          IMAGE_FIELDS,
          limit,
          pageToken.imagesAfter,
        )
      : Promise.resolve<MetaGraphPage<MetaAdImage>>({
          data: [],
        });

  const videoRequest =
    !pageToken.videosDone
      ? fetchMetaAssetPage<MetaAdVideo>(
          context,
          "advideos",
          VIDEO_FIELDS,
          limit,
          pageToken.videosAfter,
        )
      : Promise.resolve<MetaGraphPage<MetaAdVideo>>({
          data: [],
        });

  const creativeRequest =
    !pageToken.creativesDone
      ? fetchMetaAssetPage<MetaAdCreative>(
          context,
          "adcreatives",
          CREATIVE_FIELDS,
          limit,
          pageToken.creativesAfter,
        )
      : Promise.resolve<MetaGraphPage<MetaAdCreative>>({
          data: [],
        });

  // Independent provider edges and cursors.
  const [
    imagePage,
    videoPage,
    creativePage,
  ] = await Promise.all([
    imageRequest,
    videoRequest,
    creativeRequest,
  ]);

  const images = (imagePage.data ?? [])
    .map((image) =>
      mapMetaImage(image, context.adAccountId),
    )
    .filter(
      (asset): asset is MetaAdsProviderAsset =>
        asset !== null,
    );

  const videos = (videoPage.data ?? [])
    .map((video) =>
      mapMetaVideo(video, context.adAccountId),
    )
    .filter(
      (asset): asset is MetaAdsProviderAsset =>
        asset !== null,
    );

  // Lookup maps allow creative records to reference original media
  // without downloading or creating duplicate binary files.
  const imageMap = new Map<string, MetaAdsProviderAsset>();

  for (const image of images) {
    if (image.imageHash) {
      imageMap.set(image.imageHash, image);
    }
  }

  const videoMap = new Map<string, MetaAdsProviderAsset>();

  for (const video of videos) {
    if (video.videoId) {
      videoMap.set(video.videoId, video);
    }

    videoMap.set(video.assetId, video);
  }

  const creatives = (creativePage.data ?? [])
    .map((creative) =>
      mapMetaCreative(
        creative,
        context.adAccountId,
        videoMap,
        imageMap,
      ),
    )
    .filter(
      (asset): asset is MetaAdsProviderAsset =>
        asset !== null,
    )
    .filter((asset) =>
      matchesCreativeFilter(asset, kind),
    );

  let assets: MetaAdsProviderAsset[];

  switch (kind) {
    case "IMAGE":
      assets = images;
      break;

    case "VIDEO":
      assets = videos;
      break;

    case "TEXT":
    case "CTA":
    case "CREATIVE":
      assets = creatives;
      break;

    case "ALL":
    default:
      assets = [
        ...images,
        ...videos,
        ...creatives,
      ];
      break;
  }

  const nextState: MetaAssetPageState = {
    version: 2,
    kind,

    imagesAfter:
      imagePage.paging?.cursors?.after,

    videosAfter:
      videoPage.paging?.cursors?.after,

    creativesAfter:
      creativePage.paging?.cursors?.after,

    imagesDone:
      pageToken.imagesDone ||
      !imagePage.paging?.next ||
      !imagePage.paging?.cursors?.after,

    videosDone:
      pageToken.videosDone ||
      !videoPage.paging?.next ||
      !videoPage.paging?.cursors?.after,

    creativesDone:
      pageToken.creativesDone ||
      !creativePage.paging?.next ||
      !creativePage.paging?.cursors?.after,
  };

  return {
    provider: "metaAds",
    accountId: context.adAccountId,
    assets,
    nextPageToken: encodePageToken(nextState),
  };
}
