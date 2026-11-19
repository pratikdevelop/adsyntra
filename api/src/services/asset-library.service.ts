
import { Types } from "mongoose";

import AssetModel, {
  ASSET_KINDS,
  type Asset,
  type AssetDocument,
  type AssetKind,
  type AssetOrigin,
  type AssetProvider,
  type GoogleCreativePackRecord,
  type ProviderAssetReference,
  type ProviderCreativeContent,
  type ProviderCreativeCard,
  type ProviderCreativeMediaReference,
  type ProviderExtensionContent,
} from "../models/asset.model.js";

import {
  deleteStoredAssetFile,
  getStoredAssetFileInfo,
  persistAssetFile,
} from "./asset-storage.service.js";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

const MAX_CREATIVE_ITEMS = 100;
const MAX_CREATIVE_TEXT_LENGTH = 5000;

export class AssetLibraryServiceError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AssetLibraryServiceError";
    this.statusCode = statusCode;
  }
}

/* -------------------------------------------------------------------------- */
/* Input types                                                                */
/* -------------------------------------------------------------------------- */

export interface ListAssetsInput {
  page?: number;
  pageSize?: number;
  search?: string;
  kind?: AssetKind;
  origin?: AssetOrigin;
  provider?: AssetProvider;
  providerAccountId?: string;
}

export interface AssetKindStats {
  count: number;
  sizeBytes: number;
}

export interface AssetStatsResult {
  total: number;
  totalSizeBytes: number;
  byKind: Record<AssetKind, AssetKindStats>;
}

export interface CreateUploadedAssetInput {
  ownerUserId: string;
  name: string;
  kind: Exclude<
    AssetKind,
    "TEXT" | "CTA" | "EXTENSION" | "CREATIVE"
  >;
  originalFileName: string;
  mimeType: string;
  buffer: Buffer;
  width?: number | null;
  height?: number | null;
  aspectRatio?: string | null;
  origin?: AssetOrigin;
  prompt?: string | null;
  platformTargets?: AssetProvider[];
}

export interface CreateTextAssetInput {
  ownerUserId: string;
  name: string;
  textContent: string;
  origin?: AssetOrigin;
  prompt?: string | null;
  platformTargets?: AssetProvider[];
  googlePack?: GoogleCreativePackRecord | null;
}

/**
 * Input for synchronizing an existing Google Ads or Meta Ads record.
 *
 * Supports:
 * - IMAGE
 * - VIDEO
 * - LOGO
 * - TEXT
 * - CTA
 * - EXTENSION
 * - CREATIVE
 *
 * The media binary is never downloaded or copied into AdSyntra.
 */
export interface SyncProviderAssetInput {
  ownerUserId: string;

  name: string;
  kind: AssetKind;

  provider: AssetProvider;
  accountId: string;
  accountName?: string | null;

  assetId: string;
  assetType?: string | null;
  resourceName?: string | null;

  creativeId?: string | null;
  adId?: string | null;
  campaignId?: string | null;
  adGroupId?: string | null;
  adSetId?: string | null;

  imageHash?: string | null;
  videoId?: string | null;

  mediaUrl?: string | null;
  thumbnailUrl?: string | null;

  mimeType?: string | null;
  sizeBytes?: number | null;

  width?: number | null;
  height?: number | null;
  aspectRatio?: string | null;

  textContent?: string | null;

  providerCreative?: ProviderCreativeContent | null;
  providerExtension?: ProviderExtensionContent | null;

  platformTargets?: AssetProvider[];
}

export interface UpdateAssetInput {
  name?: string;
  textContent?: string | null;
  aspectRatio?: string | null;
  prompt?: string | null;
  platformTargets?: AssetProvider[];
}

/* -------------------------------------------------------------------------- */
/* Response types                                                             */
/* -------------------------------------------------------------------------- */

export interface AssetResponse {
  id: string;
  name: string;
  kind: AssetKind;

  originalFileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;

  width: number | null;
  height: number | null;
  aspectRatio: string | null;

  textContent: string | null;

  origin: AssetOrigin;
  prompt: string | null;
  platformTargets: AssetProvider[];

  googlePack: GoogleCreativePackRecord | null;

  providerAsset: ProviderAssetReference | null;

  providerCreative: ProviderCreativeContent | null;

  providerExtension: ProviderExtensionContent | null;

  /** Authenticated URL for AdSyntra-owned media only. */
  contentUrl: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface ListAssetsResult {
  assets: AssetResponse[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AssetContentResult {
  asset: AssetResponse;
  absolutePath: string;
  sizeBytes: number;
  mimeType: string;
}

/* -------------------------------------------------------------------------- */
/* General validation                                                         */
/* -------------------------------------------------------------------------- */

function requireOwnerUserId(ownerUserId: string): string {
  const normalized = ownerUserId?.trim();

  if (!normalized) {
    throw new AssetLibraryServiceError(
      "An authenticated user is required to access the Asset Library.",
      401,
    );
  }

  return normalized;
}

function requireValidAssetId(assetId: string): string {
  if (!Types.ObjectId.isValid(assetId)) {
    throw new AssetLibraryServiceError(
      "Invalid asset ID.",
      400,
    );
  }

  return assetId;
}

function normalizePage(
  value: number | undefined,
  fallback: number,
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function normalizePageSize(
  value: number | undefined,
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(value)),
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validatePlatformTargets(
  platformTargets: AssetProvider[] | undefined,
): AssetProvider[] {
  if (platformTargets === undefined) {
    return [];
  }

  if (!Array.isArray(platformTargets)) {
    throw new AssetLibraryServiceError(
      "platformTargets must be an array.",
    );
  }

  const allowed = new Set<AssetProvider>([
    "googleAds",
    "metaAds",
  ]);

  for (const provider of platformTargets) {
    if (!allowed.has(provider)) {
      throw new AssetLibraryServiceError(
        `Unsupported asset platform: ${String(provider)}.`,
      );
    }
  }

  return [...new Set(platformTargets)];
}

function normalizeRequiredString(
  value: string,
  fieldName: string,
  maxLength = 500,
): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new AssetLibraryServiceError(
      `${fieldName} is required.`,
    );
  }

  if (normalized.length > maxLength) {
    throw new AssetLibraryServiceError(
      `${fieldName} must not exceed ${maxLength} characters.`,
    );
  }

  return normalized;
}

function normalizeOptionalString(
  value: string | null | undefined,
  fieldName: string,
  maxLength = 2000,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length > maxLength) {
    throw new AssetLibraryServiceError(
      `${fieldName} must not exceed ${maxLength} characters.`,
    );
  }

  return normalized;
}

function normalizeOptionalNumber(
  value: number | null | undefined,
  fieldName: string,
  allowZero = false,
): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (
    !Number.isFinite(value) ||
    (allowZero ? value < 0 : value <= 0)
  ) {
    throw new AssetLibraryServiceError(
      `${fieldName} must be a valid ${allowZero ? "non-negative" : "positive"
      } number.`,
    );
  }

  return value;
}

/* -------------------------------------------------------------------------- */
/* URL validation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Provider media and thumbnail URLs must use HTTPS.
 */
function normalizeProviderUrl(
  value: string | null | undefined,
  fieldName: string,
): string | null {
  const normalized = normalizeOptionalString(
    value,
    fieldName,
  );

  if (!normalized) {
    return null;
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalized);
  } catch {
    throw new AssetLibraryServiceError(
      `${fieldName} must be a valid HTTPS URL.`,
    );
  }

  if (parsedUrl.protocol !== "https:") {
    throw new AssetLibraryServiceError(
      `${fieldName} must use HTTPS.`,
    );
  }

  return parsedUrl.toString();
}

/**
 * Destination URLs are allowed to use HTTP or HTTPS.
 * They are not media delivery URLs.
 */
function normalizeDestinationUrl(
  value: string | null | undefined,
  fieldName: string,
): string | null {
  const normalized = normalizeOptionalString(
    value,
    fieldName,
  );

  if (!normalized) {
    return null;
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalized);
  } catch {
    throw new AssetLibraryServiceError(
      `${fieldName} must be a valid web URL.`,
    );
  }

  if (
    parsedUrl.protocol !== "https:" &&
    parsedUrl.protocol !== "http:"
  ) {
    throw new AssetLibraryServiceError(
      `${fieldName} must use HTTP or HTTPS.`,
    );
  }

  return parsedUrl.toString();
}

/* -------------------------------------------------------------------------- */
/* Structured content normalization                                           */
/* -------------------------------------------------------------------------- */

function normalizeStringArray(
  values: string[] | null | undefined,
  fieldName: string,
  maxItems = MAX_CREATIVE_ITEMS,
  maxLength = MAX_CREATIVE_TEXT_LENGTH,
): string[] {
  if (values === undefined || values === null) {
    return [];
  }

  if (!Array.isArray(values)) {
    throw new AssetLibraryServiceError(
      `${fieldName} must be an array.`,
    );
  }

  if (values.length > maxItems) {
    throw new AssetLibraryServiceError(
      `${fieldName} cannot contain more than ${maxItems} items.`,
    );
  }

  return values.map((value, index) => {
    if (typeof value !== "string") {
      throw new AssetLibraryServiceError(
        `${fieldName}[${index}] must be a string.`,
      );
    }

    if (value.length > maxLength) {
      throw new AssetLibraryServiceError(
        `${fieldName}[${index}] exceeds ${maxLength} characters.`,
      );
    }

    return value.trim();
  });
}

function normalizeProviderCreativeCard(
  card: ProviderCreativeCard,
  index: number,
): ProviderCreativeCard {
  return {
    cardId: normalizeOptionalString(
      card.cardId,
      `Carousel card ${index + 1} ID`,
      300,
    ),

    headline: normalizeOptionalString(
      card.headline,
      `Carousel card ${index + 1} headline`,
      MAX_CREATIVE_TEXT_LENGTH,
    ),

    description: normalizeOptionalString(
      card.description,
      `Carousel card ${index + 1} description`,
      MAX_CREATIVE_TEXT_LENGTH,
    ),

    linkUrl: normalizeDestinationUrl(
      card.linkUrl,
      `Carousel card ${index + 1} link`,
    ),

    callToAction: normalizeOptionalString(
      card.callToAction,
      `Carousel card ${index + 1} CTA`,
      300,
    ),

    callToActionType: normalizeOptionalString(
      card.callToActionType,
      `Carousel card ${index + 1} CTA type`,
      300,
    ),

    imageUrl: normalizeProviderUrl(
      card.imageUrl,
      `Carousel card ${index + 1} image URL`,
    ),

    videoId: normalizeOptionalString(
      card.videoId,
      `Carousel card ${index + 1} video ID`,
      300,
    ),

    thumbnailUrl: normalizeProviderUrl(
      card.thumbnailUrl,
      `Carousel card ${index + 1} thumbnail URL`,
    ),
  };
}

function normalizeProviderMediaReference(
  media: ProviderCreativeMediaReference,
  index: number,
): ProviderCreativeMediaReference {
  if (
    media.kind !== "IMAGE" &&
    media.kind !== "VIDEO"
  ) {
    throw new AssetLibraryServiceError(
      `Creative media item ${index + 1} must be IMAGE or VIDEO.`,
    );
  }

  return {
    kind: media.kind,

    assetId: normalizeOptionalString(
      media.assetId,
      `Creative media ${index + 1} asset ID`,
      300,
    ),

    imageHash: normalizeOptionalString(
      media.imageHash,
      `Creative media ${index + 1} image hash`,
      300,
    ),

    videoId: normalizeOptionalString(
      media.videoId,
      `Creative media ${index + 1} video ID`,
      300,
    ),

    mediaUrl: normalizeProviderUrl(
      media.mediaUrl,
      `Creative media ${index + 1} URL`,
    ),

    thumbnailUrl: normalizeProviderUrl(
      media.thumbnailUrl,
      `Creative media ${index + 1} thumbnail URL`,
    ),
  };
}

function normalizeProviderCreative(
  input: ProviderCreativeContent | null | undefined,
): ProviderCreativeContent | null {
  if (input === undefined || input === null) {
    return null;
  }

  if (
    input.carouselCards.length > MAX_CREATIVE_ITEMS ||
    input.media.length > MAX_CREATIVE_ITEMS
  ) {
    throw new AssetLibraryServiceError(
      "Creative contains too many cards or media items.",
    );
  }

  return {
    creativeType: normalizeOptionalString(
      input.creativeType,
      "Creative type",
      300,
    ),

    primaryTexts: normalizeStringArray(
      input.primaryTexts,
      "Creative primary texts",
    ),

    headlines: normalizeStringArray(
      input.headlines,
      "Creative headlines",
    ),

    longHeadlines: normalizeStringArray(
      input.longHeadlines,
      "Creative long headlines",
    ),

    descriptions: normalizeStringArray(
      input.descriptions,
      "Creative descriptions",
    ),

    callToAction: normalizeOptionalString(
      input.callToAction,
      "Creative call to action",
      300,
    ),

    callToActionType: normalizeOptionalString(
      input.callToActionType,
      "Creative call to action type",
      300,
    ),

    linkDescription: normalizeOptionalString(
      input.linkDescription,
      "Creative link description",
      MAX_CREATIVE_TEXT_LENGTH,
    ),

    displayUrl: normalizeOptionalString(
      input.displayUrl,
      "Creative display URL",
      2000,
    ),

    finalUrls: input.finalUrls.map((url, index) =>
      normalizeDestinationUrl(
        url,
        `Creative final URL ${index + 1}`,
      ),
    ).filter((url): url is string => Boolean(url)),

    carouselCards: input.carouselCards.map(
      normalizeProviderCreativeCard,
    ),

    media: input.media.map(
      normalizeProviderMediaReference,
    ),

    relatedAssetIds: normalizeStringArray(
      input.relatedAssetIds,
      "Creative related asset IDs",
      MAX_CREATIVE_ITEMS,
      300,
    ),
  };
}

function normalizeProviderExtension(
  input: ProviderExtensionContent | null | undefined,
): ProviderExtensionContent | null {
  if (input === undefined || input === null) {
    return null;
  }

  return {
    extensionType: normalizeOptionalString(
      input.extensionType,
      "Extension type",
      300,
    ),

    text: normalizeOptionalString(
      input.text,
      "Extension text",
      MAX_CREATIVE_TEXT_LENGTH,
    ),

    linkText: normalizeOptionalString(
      input.linkText,
      "Extension link text",
      MAX_CREATIVE_TEXT_LENGTH,
    ),

    description1: normalizeOptionalString(
      input.description1,
      "Extension description 1",
      MAX_CREATIVE_TEXT_LENGTH,
    ),

    description2: normalizeOptionalString(
      input.description2,
      "Extension description 2",
      MAX_CREATIVE_TEXT_LENGTH,
    ),

    header: normalizeOptionalString(
      input.header,
      "Extension header",
      MAX_CREATIVE_TEXT_LENGTH,
    ),

    values: normalizeStringArray(
      input.values,
      "Extension values",
    ),

    phoneNumber: normalizeOptionalString(
      input.phoneNumber,
      "Extension phone number",
      100,
    ),

    promotionTarget: normalizeOptionalString(
      input.promotionTarget,
      "Promotion target",
    ),

    promotionCode: normalizeOptionalString(
      input.promotionCode,
      "Promotion code",
      300,
    ),

    discountType: normalizeOptionalString(
      input.discountType,
      "Discount type",
      100,
    ),

    discountValue: normalizeOptionalString(
      input.discountValue,
      "Discount value",
      300,
    ),

    occasion: normalizeOptionalString(
      input.occasion,
      "Promotion occasion",
      300,
    ),

    currencyCode: normalizeOptionalString(
      input.currencyCode,
      "Currency code",
      20,
    ),

    priceAmount: normalizeOptionalString(
      input.priceAmount,
      "Price amount",
      100,
    ),

    priceQualifier: normalizeOptionalString(
      input.priceQualifier,
      "Price qualifier",
      100,
    ),

    businessName: normalizeOptionalString(
      input.businessName,
      "Lead form business name",
      300,
    ),

    headline: normalizeOptionalString(
      input.headline,
      "Extension headline",
      MAX_CREATIVE_TEXT_LENGTH,
    ),

    description: normalizeOptionalString(
      input.description,
      "Extension description",
      MAX_CREATIVE_TEXT_LENGTH,
    ),

    privacyPolicyUrl: normalizeDestinationUrl(
      input.privacyPolicyUrl,
      "Privacy policy URL",
    ),

    finalUrl: normalizeDestinationUrl(
      input.finalUrl,
      "Extension final URL",
    ),

    fieldNames: normalizeStringArray(
      input.fieldNames,
      "Extension field names",
      MAX_CREATIVE_ITEMS,
      300,
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Mongoose response mapping                                                  */
/* -------------------------------------------------------------------------- */

function toAssetResponse(
  asset: AssetDocument,
): AssetResponse {
  const id = asset._id.toString();

  return {
    id,
    name: asset.name,
    kind: asset.kind,

    originalFileName: asset.originalFileName ?? null,
    mimeType: asset.mimeType ?? null,
    sizeBytes: asset.sizeBytes ?? null,

    width: asset.width ?? null,
    height: asset.height ?? null,
    aspectRatio: asset.aspectRatio ?? null,

    textContent: asset.textContent ?? null,

    origin: asset.origin,
    prompt: asset.prompt ?? null,
    platformTargets: asset.platformTargets ?? [],

    googlePack: asset.googlePack ?? null,

    providerAsset: asset.providerAsset ?? null,
    providerCreative: asset.providerCreative ?? null,
    providerExtension: asset.providerExtension ?? null,

    contentUrl: asset.storageKey
      ? `/api/assets/${id}/content`
      : null,

    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

async function findOwnedAsset(
  ownerUserId: string,
  assetId: string,
  includeStorage = false,
): Promise<AssetDocument> {
  const owner = requireOwnerUserId(ownerUserId);
  const id = requireValidAssetId(assetId);

  let query = AssetModel.findOne({
    _id: id,
    ownerUserId: owner,
  });

  if (includeStorage) {
    query = query.select(
      "+storageProvider +storageKey",
    );
  }

  const asset = await query.exec();

  if (!asset) {
    throw new AssetLibraryServiceError(
      "Asset not found.",
      404,
    );
  }

  return asset;
}

/* -------------------------------------------------------------------------- */
/* List assets                                                                */
/* -------------------------------------------------------------------------- */

export async function listAssets(
  ownerUserId: string,
  input: ListAssetsInput = {},
): Promise<ListAssetsResult> {
  const owner = requireOwnerUserId(ownerUserId);

  const page = normalizePage(
    input.page,
    DEFAULT_PAGE,
  );

  const pageSize = normalizePageSize(
    input.pageSize,
  );

  const filter: any = {
    ownerUserId: owner,
  };

  if (input.kind) {
    filter.kind = input.kind;
  }

  if (input.origin) {
    filter.origin = input.origin;
  }

  if (input.provider) {
    Object.assign(filter, {
      "providerAsset.provider": input.provider,
    });
  }

  if (input.providerAccountId) {
    Object.assign(filter, {
      "providerAsset.accountId":
        input.providerAccountId.trim(),
    });
  }

  const search = input.search?.trim();

  if (search) {
    const expression = new RegExp(
      escapeRegex(search),
      "i",
    );

    filter.$or = [
      { name: expression },
      { originalFileName: expression },
      { textContent: expression },

      { "providerAsset.assetId": expression },
      { "providerAsset.assetType": expression },
      { "providerAsset.resourceName": expression },
      { "providerAsset.accountName": expression },
      { "providerAsset.creativeId": expression },
      { "providerAsset.adId": expression },
      { "providerAsset.campaignId": expression },

      { "providerCreative.creativeType": expression },
      { "providerCreative.primaryTexts": expression },
      { "providerCreative.headlines": expression },
      { "providerCreative.longHeadlines": expression },
      { "providerCreative.descriptions": expression },
      { "providerCreative.callToAction": expression },
      { "providerCreative.callToActionType": expression },

      { "providerExtension.extensionType": expression },
      { "providerExtension.text": expression },
      { "providerExtension.linkText": expression },
      { "providerExtension.header": expression },
      { "providerExtension.headline": expression },
      { "providerExtension.description": expression },
      { "providerExtension.values": expression },
    ];
  }

  const skip = (page - 1) * pageSize;

  const [documents, total] = await Promise.all([
    AssetModel.find(filter)
      .select("+storageProvider +storageKey")
      .sort({
        createdAt: -1,
        _id: -1,
      })
      .skip(skip)
      .limit(pageSize)
      .exec(),

    AssetModel.countDocuments(filter).exec(),
  ]);

  return {
    assets: documents.map(toAssetResponse),

    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Statistics                                                                 */
/* -------------------------------------------------------------------------- */

export async function getAssetStats(
  ownerUserId: string,
): Promise<AssetStatsResult> {
  const owner = requireOwnerUserId(ownerUserId);

  const byKind = Object.fromEntries(
    ASSET_KINDS.map((kind) => [
      kind,
      {
        count: 0,
        sizeBytes: 0,
      },
    ]),
  ) as Record<AssetKind, AssetKindStats>;

  const groupedStats = await AssetModel.aggregate<{
    _id: AssetKind;
    count: number;
    sizeBytes: number;
  }>([
    {
      $match: {
        ownerUserId: owner,
      },
    },
    {
      $group: {
        _id: "$kind",
        count: {
          $sum: 1,
        },
        sizeBytes: {
          $sum: {
            $ifNull: ["$sizeBytes", 0],
          },
        },
      },
    },
  ]).exec();

  let total = 0;
  let totalSizeBytes = 0;

  for (const item of groupedStats) {
    byKind[item._id] = {
      count: item.count,
      sizeBytes: item.sizeBytes,
    };

    total += item.count;
    totalSizeBytes += item.sizeBytes;
  }

  return {
    total,
    totalSizeBytes,
    byKind,
  };
}

/* -------------------------------------------------------------------------- */
/* Provider synchronization                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Synchronize one Google Ads or Meta Ads provider record.
 *
 * A provider record can represent:
 * - Media
 * - Text
 * - CTA
 * - Extension
 * - Complete creative
 *
 * The provider identity is kept separate from the normalized creative
 * and extension content.
 *
 * Repeated synchronization updates the existing record.
 * No provider media is downloaded or copied.
 */
export async function syncProviderAsset(
  input: SyncProviderAssetInput,
): Promise<AssetResponse> {
  const kind = input.kind;
  const ownerUserId = requireOwnerUserId(
    input.ownerUserId,
  );

  const name = normalizeRequiredString(
    input.name,
    "Asset name",
    150,
  );

  const accountId = normalizeRequiredString(
    input.accountId,
    "Provider account ID",
  );

  const assetId = normalizeRequiredString(
    input.assetId,
    "Provider asset ID",
  );

  if (
    input.provider !== "googleAds" &&
    input.provider !== "metaAds"
  ) {
    throw new AssetLibraryServiceError(
      "Unsupported provider. Use googleAds or metaAds.",
    );
  }

  if (!ASSET_KINDS.includes(input.kind)) {
    throw new AssetLibraryServiceError(
      "Unsupported provider asset kind.",
    );
  }

  const origin: AssetOrigin =
    input.provider === "googleAds"
      ? "GOOGLE_ADS"
      : "META_ADS";

  const providerAsset: ProviderAssetReference = {
    provider: input.provider,

    accountId,

    accountName: normalizeOptionalString(
      input.accountName,
      "Provider account name",
    ),

    assetId,

    assetType: normalizeOptionalString(
      input.assetType,
      "Provider asset type",
      300,
    ),

    resourceName: normalizeOptionalString(
      input.resourceName,
      "Provider resource name",
      1000,
    ),

    creativeId: normalizeOptionalString(
      input.creativeId,
      "Provider creative ID",
      300,
    ),

    adId: normalizeOptionalString(
      input.adId,
      "Provider ad ID",
      300,
    ),

    campaignId: normalizeOptionalString(
      input.campaignId,
      "Provider campaign ID",
      300,
    ),

    adGroupId: normalizeOptionalString(
      input.adGroupId,
      "Provider ad group ID",
      300,
    ),

    adSetId: normalizeOptionalString(
      input.adSetId,
      "Provider ad set ID",
      300,
    ),

    imageHash: normalizeOptionalString(
      input.imageHash,
      "Provider image hash",
      300,
    ),

    videoId: normalizeOptionalString(
      input.videoId,
      "Provider video ID",
      300,
    ),

    mediaUrl: normalizeProviderUrl(
      input.mediaUrl,
      "Provider media URL",
    ),

    thumbnailUrl: normalizeProviderUrl(
      input.thumbnailUrl,
      "Provider thumbnail URL",
    ),

    syncedAt: new Date(),
  };

  const mimeType = normalizeOptionalString(
    input.mimeType,
    "MIME type",
    150,
  )?.toLowerCase() ?? null;

  const sizeBytes = normalizeOptionalNumber(
    input.sizeBytes,
    "Asset size",
    true,
  );

  const width = normalizeOptionalNumber(
    input.width,
    "Asset width",
  );

  const height = normalizeOptionalNumber(
    input.height,
    "Asset height",
  );

  const aspectRatio = normalizeOptionalString(
    input.aspectRatio,
    "Aspect ratio",
    50,
  );

  const textContent = normalizeOptionalString(
    input.textContent,
    "Provider text content",
    10000,
  );

  const platformTargets = validatePlatformTargets(
    input.platformTargets ?? [input.provider],
  );

  const providerCreative = normalizeProviderCreative(
    input.providerCreative,
  );

  const providerExtension = normalizeProviderExtension(
    input.providerExtension,
  );

  const identityFilter = {
    ownerUserId,

    "providerAsset.provider": input.provider,
    "providerAsset.accountId": accountId,
    "providerAsset.assetId": assetId,
  };

  const update = {
    $set: {
      name,
      kind,

      // Provider media is never copied into local storage.
      storageProvider: null,
      storageKey: null,

      originalFileName: null,
      mimeType,
      sizeBytes,

      width,
      height,
      aspectRatio,

      textContent,

      origin,
      prompt: null,
      platformTargets,

      googlePack: null,

      providerAsset,
      providerCreative,
      providerExtension,
    },
  };

  try {
    const document = await AssetModel.findOneAndUpdate(
      identityFilter,
      update,
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ).exec();

    if (!document) {
      throw new Error(
        "Provider asset was synchronized but could not be loaded.",
      );
    }

    return toAssetResponse(document);
  } catch (error) {
    // Another concurrent synchronization may have inserted the
    // same provider asset. Retry as an update instead of duplicating it.
    const mongoError = error as {
      code?: number;
    };

    if (mongoError.code === 11000) {
      const existing = await AssetModel.findOneAndUpdate(
        identityFilter,
        update,
        {
          new: true,
          runValidators: true,
        },
      ).exec();

      if (existing) {
        return toAssetResponse(existing);
      }
    }

    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Local uploaded assets                                                      */
/* -------------------------------------------------------------------------- */

export async function createUploadedAsset(
  input: CreateUploadedAssetInput,
): Promise<AssetResponse> {
  const ownerUserId = requireOwnerUserId(
    input.ownerUserId,
  );

  const name = input.name?.trim();

  if (!name) {
    throw new AssetLibraryServiceError(
      "Asset name is required.",
    );
  }

  if (name.length > 150) {
    throw new AssetLibraryServiceError(
      "Asset name must not exceed 150 characters.",
    );
  }

  if (
    !Buffer.isBuffer(input.buffer) ||
    input.buffer.length === 0
  ) {
    throw new AssetLibraryServiceError(
      "Uploaded asset file is empty.",
    );
  }

  if (
    input.kind !== "IMAGE" &&
    input.kind !== "VIDEO" &&
    input.kind !== "LOGO"
  ) {
    throw new AssetLibraryServiceError(
      "Uploaded files must be IMAGE, VIDEO or LOGO assets.",
    );
  }

  const platformTargets = validatePlatformTargets(
    input.platformTargets,
  );

  const storedFile = await persistAssetFile({
    ownerUserId,
    mimeType: input.mimeType,
    originalFileName: input.originalFileName,
    buffer: input.buffer,
  });

  try {
    const assetData: Asset = {
      ownerUserId,
      name,
      kind: input.kind,

      storageProvider: storedFile.storageProvider,
      storageKey: storedFile.storageKey,

      originalFileName: input.originalFileName.trim(),
      mimeType: storedFile.mimeType,
      sizeBytes: input.buffer.length,

      width: input.width ?? null,
      height: input.height ?? null,
      aspectRatio: input.aspectRatio?.trim() || null,

      textContent: null,

      origin: input.origin ?? "MANUAL",
      prompt: input.prompt?.trim() || null,
      platformTargets,

      googlePack: null,
      providerAsset: null,
      providerCreative: null,
      providerExtension: null,

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const created = await AssetModel.create(assetData);

    const hydrated = await AssetModel.findById(created._id)
      .select("+storageProvider +storageKey")
      .exec();

    if (!hydrated) {
      throw new Error(
        "Asset was saved but could not be reloaded.",
      );
    }

    return toAssetResponse(hydrated);
  } catch (error) {
    await deleteStoredAssetFile(
      storedFile.storageKey,
    ).catch((cleanupError) => {
      console.error(
        "Failed to clean up uploaded file after asset record creation failed:",
        cleanupError,
      );
    });

    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Text assets                                                                */
/* -------------------------------------------------------------------------- */

export async function createTextAsset(
  input: CreateTextAssetInput,
): Promise<AssetResponse> {
  const ownerUserId = requireOwnerUserId(
    input.ownerUserId,
  );

  const name = input.name?.trim();
  const textContent = input.textContent?.trim();

  if (!name) {
    throw new AssetLibraryServiceError(
      "Asset name is required.",
    );
  }

  if (name.length > 150) {
    throw new AssetLibraryServiceError(
      "Asset name must not exceed 150 characters.",
    );
  }

  if (!textContent && !input.googlePack) {
    throw new AssetLibraryServiceError(
      "Provide textContent or a Google creative pack.",
    );
  }

  if (textContent && textContent.length > 10000) {
    throw new AssetLibraryServiceError(
      "Text content must not exceed 10,000 characters.",
    );
  }

  const created = await AssetModel.create({
    ownerUserId,
    name,
    kind: "TEXT",

    storageProvider: null,
    storageKey: null,

    originalFileName: null,
    mimeType: "text/plain",

    sizeBytes: textContent
      ? Buffer.byteLength(textContent, "utf8")
      : null,

    width: null,
    height: null,
    aspectRatio: null,

    textContent: textContent || null,

    origin: input.origin ?? "MANUAL",
    prompt: input.prompt?.trim() || null,

    platformTargets: validatePlatformTargets(
      input.platformTargets,
    ),

    googlePack: input.googlePack ?? null,

    providerAsset: null,
    providerCreative: null,
    providerExtension: null,
  });

  return toAssetResponse(created);
}

/* -------------------------------------------------------------------------- */
/* Get asset                                                                  */
/* -------------------------------------------------------------------------- */

export async function getAsset(
  ownerUserId: string,
  assetId: string,
): Promise<AssetResponse> {
  const asset = await findOwnedAsset(
    ownerUserId,
    assetId,
    true,
  );

  return toAssetResponse(asset);
}

/* -------------------------------------------------------------------------- */
/* Private content delivery                                                   */
/* -------------------------------------------------------------------------- */

export async function getAssetContent(
  ownerUserId: string,
  assetId: string,
): Promise<AssetContentResult> {
  const asset = await findOwnedAsset(
    ownerUserId,
    assetId,
    true,
  );

  if (
    !asset.storageKey ||
    !asset.storageProvider
  ) {
    throw new AssetLibraryServiceError(
      "This asset does not have a stored media file.",
      404,
    );
  }

  if (asset.storageProvider !== "LOCAL") {
    throw new AssetLibraryServiceError(
      `The ${asset.storageProvider} storage provider is not configured for content delivery yet.`,
      501,
    );
  }

  const fileInfo = await getStoredAssetFileInfo(
    asset.storageKey,
  );

  if (!fileInfo.isFile) {
    throw new AssetLibraryServiceError(
      "Stored asset file was not found.",
      404,
    );
  }

  return {
    asset: toAssetResponse(asset),
    absolutePath: fileInfo.absolutePath,
    sizeBytes: fileInfo.sizeBytes,
    mimeType: asset.mimeType || "application/octet-stream",
  };
}

/* -------------------------------------------------------------------------- */
/* Update asset                                                               */
/* -------------------------------------------------------------------------- */

export async function updateAsset(
  ownerUserId: string,
  assetId: string,
  input: UpdateAssetInput,
): Promise<AssetResponse> {
  const asset = await findOwnedAsset(
    ownerUserId,
    assetId,
    true,
  );

  if (input.name !== undefined) {
    const name = input.name.trim();

    if (!name) {
      throw new AssetLibraryServiceError(
        "Asset name cannot be empty.",
      );
    }

    if (name.length > 150) {
      throw new AssetLibraryServiceError(
        "Asset name must not exceed 150 characters.",
      );
    }

    asset.name = name;
  }

  if (input.textContent !== undefined) {
    if (asset.kind !== "TEXT") {
      throw new AssetLibraryServiceError(
        "textContent can only be updated for TEXT assets.",
      );
    }

    const textContent = input.textContent?.trim() ?? "";

    if (textContent.length > 10000) {
      throw new AssetLibraryServiceError(
        "Text content must not exceed 10,000 characters.",
      );
    }

    asset.textContent = textContent || null;

    asset.sizeBytes = textContent
      ? Buffer.byteLength(textContent, "utf8")
      : null;
  }

  if (input.aspectRatio !== undefined) {
    asset.aspectRatio =
      input.aspectRatio?.trim() || null;
  }

  if (input.prompt !== undefined) {
    const prompt = input.prompt?.trim() || null;

    if (prompt && prompt.length > 5000) {
      throw new AssetLibraryServiceError(
        "Prompt must not exceed 5,000 characters.",
      );
    }

    asset.prompt = prompt;
  }

  if (input.platformTargets !== undefined) {
    asset.platformTargets = validatePlatformTargets(
      input.platformTargets,
    );
  }

  await asset.save();

  return toAssetResponse(asset);
}

/* -------------------------------------------------------------------------- */
/* Delete asset                                                               */
/* -------------------------------------------------------------------------- */

export async function deleteAsset(
  ownerUserId: string,
  assetId: string,
): Promise<{
  id: string;
  deleted: true;
}> {
  const asset = await findOwnedAsset(
    ownerUserId,
    assetId,
    true,
  );

  const id = asset._id.toString();

  if (
    asset.storageKey &&
    asset.storageProvider === "LOCAL"
  ) {
    await deleteStoredAssetFile(asset.storageKey);
  } else if (
    asset.storageKey &&
    asset.storageProvider !== null
  ) {
    throw new AssetLibraryServiceError(
      `Deletion for ${asset.storageProvider} storage is not configured yet.`,
      501,
    );
  }

  await asset.deleteOne();

  return {
    id,
    deleted: true,
  };
}
