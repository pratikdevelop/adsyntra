
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { getAuth } from "@clerk/express";
import multer from "multer";
import { imageSize } from "image-size";
import { createReadStream } from "node:fs";

import AdAccountModel from "../models/ad-account.model.js";

import {
  ASSET_KINDS,
  ASSET_ORIGINS,
  ASSET_PROVIDERS,
  type AssetOrigin,
  type AssetProvider,
  type GoogleCreativePackRecord,
} from "../models/asset.model.js";

import {
  AssetLibraryServiceError,
  createTextAsset,
  createUploadedAsset,
  deleteAsset,
  getAsset,
  getAssetContent,
  getAssetStats,
  listAssets,
  syncProviderAsset,
  updateAsset,
} from "../services/asset-library.service.js";

import {
  GoogleAdsAssetServiceError,
  listGoogleAdsAssets,
  type GoogleAdsProviderAsset,
} from "../googleadsAPI/services/asset-library.js";

import {
  MetaAdsAssetServiceError,
  listMetaAdsAssets,
  type MetaAdsProviderAsset,
} from "../metaadsAPI/services/asset-library.js";

const router = Router();

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const MAX_UPLOAD_SIZE = Math.max(
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
);

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

const GOOGLE_PROVIDER_KINDS = [
  "ALL",
  "IMAGE",
  "VIDEO",
  "TEXT",
  "CTA",
  "EXTENSION",
  "CREATIVE",
] as const;

const META_PROVIDER_KINDS = [
  "ALL",
  "IMAGE",
  "VIDEO",
  "TEXT",
  "CTA",
  "CREATIVE",
] as const;

type GoogleProviderKind =
  (typeof GOOGLE_PROVIDER_KINDS)[number];

type MetaProviderKind =
  (typeof META_PROVIDER_KINDS)[number];

type SyncedProviderAsset =
  | GoogleAdsProviderAsset
  | MetaAdsProviderAsset;

/* -------------------------------------------------------------------------- */
/* Multer                                                                     */
/* -------------------------------------------------------------------------- */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
    files: 1,
    fields: 8,
    fieldNameSize: 100,
    fieldSize: 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    const mimeType = file.mimetype.toLowerCase();

    if (
      !IMAGE_MIME_TYPES.has(mimeType) &&
      !VIDEO_MIME_TYPES.has(mimeType)
    ) {
      callback(
        new Error(
          "Supported files: JPG, PNG, WebP, GIF, MP4, MOV and WebM.",
        ),
      );
      return;
    }

    callback(null, true);
  },
});

/* -------------------------------------------------------------------------- */
/* Authentication                                                             */
/* -------------------------------------------------------------------------- */

function getAuthenticatedUserId(
  req: Request,
): string | undefined {
  return getAuth(req).userId ?? undefined;
}

function requireAuthenticatedUser(
  req: Request,
  res: Response,
): string | null {
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Unauthorized. Please sign in again.",
    });

    return null;
  }

  return userId;
}

/* -------------------------------------------------------------------------- */
/* Error handling                                                             */
/* -------------------------------------------------------------------------- */

function sendServiceError(
  res: Response,
  error: unknown,
): void {
  if (error instanceof AssetLibraryServiceError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });

    return;
  }

  console.error("Asset Library API error:", error);

  res.status(500).json({
    success: false,
    message: "An unexpected Asset Library error occurred.",
  });
}

function sendProviderError(
  res: Response,
  provider: AssetProvider,
  error: unknown,
): void {
  if (
    error instanceof AssetLibraryServiceError ||
    error instanceof GoogleAdsAssetServiceError ||
    error instanceof MetaAdsAssetServiceError
  ) {
    console.error(
      `${provider} Asset Library provider error:`,
      error,
    );

    res.status(error.statusCode).json({
      success: false,
      provider,
      message: error.message,
    });

    return;
  }

  console.error(
    `${provider} Asset Library unexpected error:`,
    error,
  );

  res.status(502).json({
    success: false,
    provider,
    message:
      `Unable to retrieve assets from ${
        provider === "googleAds"
          ? "Google Ads"
          : "Meta Ads"
      }. Please try again.`,
  });
}

/* -------------------------------------------------------------------------- */
/* Validation helpers                                                         */
/* -------------------------------------------------------------------------- */

function parseOptionalEnum<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  fieldName: string,
): T | undefined {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
  }

  if (
    typeof value !== "string" ||
    !allowedValues.includes(value as T)
  ) {
    throw new AssetLibraryServiceError(
      `Invalid ${fieldName}. Allowed values: ${allowedValues.join(", ")}.`,
    );
  }

  return value as T;
}

function parseProviderAssetKind<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
): T {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "ALL" as T;
  }

  if (
    typeof value !== "string" ||
    !allowedValues.includes(value as T)
  ) {
    throw new AssetLibraryServiceError(
      `Invalid provider asset kind. Allowed values: ${allowedValues.join(", ")}.`,
    );
  }

  return value as T;
}

function parseProviderLimit(value: unknown): number {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return 50;
  }

  const limit = Number(value);

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new AssetLibraryServiceError(
      "limit must be an integer between 1 and 100.",
    );
  }

  return limit;
}

function parsePageToken(
  value: unknown,
): string | undefined {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
  }

  if (
    typeof value !== "string" ||
    value.length > 10000
  ) {
    throw new AssetLibraryServiceError(
      "Invalid pageToken.",
    );
  }

  return value;
}

/* -------------------------------------------------------------------------- */
/* Platform target parsing                                                    */
/* -------------------------------------------------------------------------- */

function parsePlatformTargets(
  value: unknown,
): AssetProvider[] | undefined {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
  }

  let parsed: unknown = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new AssetLibraryServiceError(
        "platformTargets must be a JSON array of provider names.",
      );
    }
  }

  if (!Array.isArray(parsed)) {
    throw new AssetLibraryServiceError(
      "platformTargets must be an array.",
    );
  }

  const targets: AssetProvider[] = [];

  for (const item of parsed) {
    if (
      typeof item !== "string" ||
      !ASSET_PROVIDERS.includes(item as AssetProvider)
    ) {
      throw new AssetLibraryServiceError(
        "platformTargets may contain only googleAds and metaAds.",
      );
    }

    targets.push(item as AssetProvider);
  }

  return [...new Set(targets)];
}

/* -------------------------------------------------------------------------- */
/* Google creative pack parser                                                */
/* -------------------------------------------------------------------------- */

function parseGooglePack(
  value: unknown,
): GoogleCreativePackRecord | undefined {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
  }

  let parsed: unknown = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new AssetLibraryServiceError(
        "googlePack must be valid JSON.",
      );
    }
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new AssetLibraryServiceError(
      "googlePack must be an object.",
    );
  }

  const pack = parsed as Record<string, unknown>;

  const isString = (
    entry: unknown,
  ): entry is string =>
    typeof entry === "string";

  const isStringArray = (
    entry: unknown,
  ): entry is string[] =>
    Array.isArray(entry) &&
    entry.every(isString);

  if (
    !isString(pack.campaignType) ||
    !isString(pack.formatLabel) ||
    !isString(pack.finalUrl) ||
    !isStringArray(pack.headlines) ||
    !isStringArray(pack.longHeadlines) ||
    !isStringArray(pack.descriptions) ||
    (
      pack.subFormat !== undefined &&
      !isString(pack.subFormat)
    ) ||
    (
      pack.imageUrl !== undefined &&
      !isString(pack.imageUrl)
    )
  ) {
    throw new AssetLibraryServiceError(
      "googlePack must include campaignType, formatLabel, finalUrl and string arrays for headlines, longHeadlines and descriptions.",
    );
  }

  return {
    campaignType: pack.campaignType,

    ...(pack.subFormat !== undefined
      ? { subFormat: pack.subFormat as string }
      : {}),

    formatLabel: pack.formatLabel,
    headlines: pack.headlines,
    longHeadlines: pack.longHeadlines,
    descriptions: pack.descriptions,
    finalUrl: pack.finalUrl,

    ...(pack.imageUrl !== undefined
      ? { imageUrl: pack.imageUrl as string }
      : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Image validation                                                           */
/* -------------------------------------------------------------------------- */

function calculateAspectRatio(
  width: number,
  height: number,
): string {
  const ratio = width / height;

  const knownRatios: Array<{
    ratio: number;
    label: string;
  }> = [
    { ratio: 1, label: "1:1" },
    { ratio: 4 / 5, label: "4:5" },
    { ratio: 9 / 16, label: "9:16" },
    { ratio: 16 / 9, label: "16:9" },
    { ratio: 1.91, label: "1.91:1" },
  ];

  const match = knownRatios.find(
    (item) =>
      Math.abs(item.ratio - ratio) <= 0.015,
  );

  return (
    match?.label ??
    (ratio >= 1
      ? `${ratio.toFixed(2)}:1`
      : `1:${(1 / ratio).toFixed(2)}`)
  );
}

function getImageDimensions(
  buffer: Buffer,
  mimeType: string,
): {
  width: number;
  height: number;
  aspectRatio: string;
} {
  let dimensions: ReturnType<typeof imageSize>;

  try {
    dimensions = imageSize(buffer);
  } catch {
    throw new AssetLibraryServiceError(
      "The uploaded file is not a valid image.",
    );
  }

  const { width, height, type } = dimensions;

  const expectedTypeByMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };

  if (
    !width ||
    !height ||
    type !== expectedTypeByMime[mimeType]
  ) {
    throw new AssetLibraryServiceError(
      "The uploaded image content does not match its declared file type.",
    );
  }

  return {
    width,
    height,
    aspectRatio: calculateAspectRatio(width, height),
  };
}

/* -------------------------------------------------------------------------- */
/* Upload middleware                                                          */
/* -------------------------------------------------------------------------- */

function uploadSingleFile(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  upload.single("file")(
    req,
    res,
    (error: unknown) => {
      if (!error) {
        next();
        return;
      }

      if (error instanceof multer.MulterError) {
        res.status(
          error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
        ).json({
          success: false,
          message:
            error.code === "LIMIT_FILE_SIZE"
              ? "The uploaded file exceeds the 100 MB upload limit."
              : error.message,
          code: error.code,
        });

        return;
      }

      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Invalid upload request.",
      });
    },
  );
}

/* -------------------------------------------------------------------------- */
/* Byte range parsing                                                         */
/* -------------------------------------------------------------------------- */

function parseByteRange(
  rangeHeader: string,
  fileSize: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(
    rangeHeader.trim(),
  );

  if (!match) return null;

  const startText = match[1] ?? "";
  const endText = match[2] ?? "";

  if (!startText && !endText) return null;

  let start: number;
  let end: number;

  if (!startText) {
    const suffixLength = Number(endText);

    if (
      !Number.isSafeInteger(suffixLength) ||
      suffixLength <= 0
    ) {
      return null;
    }

    start = Math.max(
      fileSize - suffixLength,
      0,
    );

    end = fileSize - 1;
  } else {
    start = Number(startText);
    end = endText
      ? Number(endText)
      : fileSize - 1;
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(end, fileSize - 1),
  };
}

/* -------------------------------------------------------------------------- */
/* Selected provider account                                                  */
/* -------------------------------------------------------------------------- */

async function getSelectedProviderAccount(
  userId: string,
  provider: AssetProvider,
): Promise<{ externalAccountId: string }> {
  const account = await AdAccountModel.findOne({
    userId,
    provider,
    status: "active",
    isSelected: true,
  })
    .select("externalAccountId")
    .lean();

  if (!account?.externalAccountId) {
    throw new AssetLibraryServiceError(
      `No active selected ${
        provider === "googleAds"
          ? "Google Ads"
          : "Meta Ads"
      } account was found. Connect and select an account first.`,
      404,
    );
  }

  return {
    externalAccountId: account.externalAccountId,
  };
}

/* -------------------------------------------------------------------------- */
/* Provider asset synchronization                                             */
/* -------------------------------------------------------------------------- */

/**
 * Convert and persist the provider results from either service.
 *
 * Both services return normalized creative and extension information.
 * This mapper passes those fields into the shared MongoDB service.
 *
 * Writes are intentionally sequential to avoid creating a large
 * burst of MongoDB upserts from one provider request.
 */
async function saveProviderAssets(
  ownerUserId: string,
  assets: SyncedProviderAsset[],
) {
  const savedAssets = [];

  for (const asset of assets) {
    const saved = await syncProviderAsset({
      ownerUserId,

      provider: asset.provider,
      accountId: asset.accountId,
      accountName: null,
      assetId: asset.assetId,
      assetType: asset.assetType,
      resourceName: asset.resourceName,

      name: asset.name,
      kind: asset.kind,

      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,

      mediaUrl: asset.mediaUrl,
      thumbnailUrl: asset.thumbnailUrl,

      imageHash: asset.imageHash,
      videoId: asset.videoId,

      width: asset.width,
      height: asset.height,
      aspectRatio: asset.aspectRatio,

      textContent: asset.textContent,

      providerCreative: asset.providerCreative,
      providerExtension: asset.providerExtension,

      creativeId: asset.creativeId,
      adId: asset.adId,
      campaignId: asset.campaignId,
      adGroupId: asset.adGroupId,
      adSetId: asset.adSetId,

      platformTargets: [asset.provider],
    });

    savedAssets.push(saved);
  }

  return savedAssets;
}

/* -------------------------------------------------------------------------- */
/* GET /api/assets — list assets                                               */
/* -------------------------------------------------------------------------- */

router.get("/", async (req: Request, res: Response) => {
  const userId = requireAuthenticatedUser(req, res);

  if (!userId) return;

  try {
    const page =
      req.query.page === undefined
        ? undefined
        : Number(req.query.page);

    const pageSize =
      req.query.pageSize === undefined
        ? undefined
        : Number(req.query.pageSize);

    if (
      (page !== undefined &&
        (!Number.isInteger(page) || page < 1)) ||
      (pageSize !== undefined &&
        (!Number.isInteger(pageSize) || pageSize < 1))
    ) {
      return res.status(400).json({
        success: false,
        message:
          "page and pageSize must be positive integers.",
      });
    }

    const kind = parseOptionalEnum(
      req.query.kind,
      ASSET_KINDS,
      "asset kind",
    );

    const origin = parseOptionalEnum(
      req.query.origin,
      ASSET_ORIGINS,
      "asset origin",
    );

    const provider = parseOptionalEnum(
      req.query.provider,
      ASSET_PROVIDERS,
      "asset provider",
    );

    const providerAccountId =
      typeof req.query.providerAccountId === "string"
        ? req.query.providerAccountId.trim()
        : undefined;

    if (
      providerAccountId &&
      providerAccountId.length > 150
    ) {
      return res.status(400).json({
        success: false,
        message:
          "providerAccountId must not exceed 150 characters.",
      });
    }

    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    if (search.length > 100) {
      return res.status(400).json({
        success: false,
        message: "search must not exceed 100 characters.",
      });
    }

    const result = await listAssets(userId, {
      page,
      pageSize,
      search,
      kind,
      origin,
      provider,
      providerAccountId,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return sendServiceError(res, error);
  }
});

/* -------------------------------------------------------------------------- */
/* GET /api/assets/providers/google                                           */
/* -------------------------------------------------------------------------- */

/**
 * Fetch and synchronize Google Ads assets and complete ad creatives.
 *
 * Supported kinds:
 * ALL, IMAGE, VIDEO, TEXT, CTA, EXTENSION, CREATIVE
 */
router.get(
  "/providers/google",
  async (req: Request, res: Response) => {
    const userId = requireAuthenticatedUser(req, res);

    if (!userId) return;

    try {
      const account = await getSelectedProviderAccount(
        userId,
        "googleAds",
      );

      const kind = parseProviderAssetKind(
        req.query.kind,
        GOOGLE_PROVIDER_KINDS,
      ) as GoogleProviderKind;

      const limit = parseProviderLimit(
        req.query.limit,
      );

      const pageToken = parsePageToken(
        req.query.pageToken,
      );

      const result = await listGoogleAdsAssets(
        userId,
        account.externalAccountId,
        {
          kind,
          limit,
          pageToken,
        },
      );

      const savedAssets = await saveProviderAssets(
        userId,
        result.assets,
      );

      return res.status(200).json({
        success: true,
        provider: "googleAds",
        accountId: result.accountId,
        requestedKind: kind,
        count: savedAssets.length,
        assets: savedAssets,
        nextPageToken: result.nextPageToken,
      });
    } catch (error) {
      return sendProviderError(
        res,
        "googleAds",
        error,
      );
    }
  },
);

/* -------------------------------------------------------------------------- */
/* GET /api/assets/providers/meta                                              */
/* -------------------------------------------------------------------------- */

/**
 * Fetch and synchronize Meta images, videos and ad creatives.
 *
 * Supported kinds:
 * ALL, IMAGE, VIDEO, TEXT, CTA, CREATIVE
 *
 * TEXT and CTA are filters over creative content.
 * The saved record remains a CREATIVE record.
 */
router.get(
  "/providers/meta",
  async (req: Request, res: Response) => {
    const userId = requireAuthenticatedUser(req, res);

    if (!userId) return;

    try {
      const account = await getSelectedProviderAccount(
        userId,
        "metaAds",
      );

      const kind = parseProviderAssetKind(
        req.query.kind,
        META_PROVIDER_KINDS,
      ) as MetaProviderKind;

      const limit = parseProviderLimit(
        req.query.limit,
      );

      const pageToken = parsePageToken(
        req.query.pageToken,
      );

      const result = await listMetaAdsAssets(
        userId,
        account.externalAccountId,
        {
          kind,
          limit,
          pageToken,
        },
      );

      const savedAssets = await saveProviderAssets(
        userId,
        result.assets,
      );

      return res.status(200).json({
        success: true,
        provider: "metaAds",
        accountId: result.accountId,
        requestedKind: kind,
        count: savedAssets.length,
        assets: savedAssets,
        nextPageToken: result.nextPageToken,
      });
    } catch (error) {
      return sendProviderError(
        res,
        "metaAds",
        error,
      );
    }
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/assets/upload                                                    */
/* -------------------------------------------------------------------------- */

router.post(
  "/upload",
  uploadSingleFile,
  async (req: Request, res: Response) => {
    const userId = requireAuthenticatedUser(req, res);

    if (!userId) return;

    try {
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          message:
            'Upload a file using the multipart field name "file".',
        });
      }

      const mimeType = file.mimetype.toLowerCase();

      const isImage = IMAGE_MIME_TYPES.has(mimeType);
      const isVideo = VIDEO_MIME_TYPES.has(mimeType);

      const kind = parseOptionalEnum(
        req.body?.kind,
        ASSET_KINDS,
        "asset kind",
      );

      if (
        kind !== "IMAGE" &&
        kind !== "VIDEO" &&
        kind !== "LOGO"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "kind must be IMAGE, VIDEO or LOGO for file uploads.",
        });
      }

      if (
        (kind === "IMAGE" || kind === "LOGO") &&
        !isImage
      ) {
        return res.status(400).json({
          success: false,
          message:
            "IMAGE and LOGO assets require a supported image file.",
        });
      }

      if (kind === "VIDEO" && !isVideo) {
        return res.status(400).json({
          success: false,
          message:
            "VIDEO assets require an MP4, MOV or WebM file.",
        });
      }

      const name =
        typeof req.body?.name === "string"
          ? req.body.name.trim()
          : "";

      if (!name) {
        return res.status(400).json({
          success: false,
          message: "Asset name is required.",
        });
      }

      const perTypeLimit = isImage
        ? MAX_IMAGE_SIZE
        : MAX_VIDEO_SIZE;

      if (file.size > perTypeLimit) {
        return res.status(413).json({
          success: false,
          message: isImage
            ? "Images must be 20 MB or smaller."
            : "Videos must be 100 MB or smaller.",
        });
      }

      const dimensions = isImage
        ? getImageDimensions(
            file.buffer,
            mimeType,
          )
        : null;

      const origin = parseOptionalEnum(
        req.body?.origin,
        ASSET_ORIGINS,
        "asset origin",
      );

      const platformTargets = parsePlatformTargets(
        req.body?.platformTargets,
      );

      const prompt =
        typeof req.body?.prompt === "string"
          ? req.body.prompt
          : undefined;

      const asset = await createUploadedAsset({
        ownerUserId: userId,
        name,
        kind,
        originalFileName: file.originalname,
        mimeType,
        buffer: file.buffer,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        aspectRatio: dimensions?.aspectRatio ?? null,
        origin: origin as AssetOrigin | undefined,
        prompt,
        platformTargets,
      });

      return res.status(201).json({
        success: true,
        message: "Asset uploaded successfully.",
        asset,
      });
    } catch (error) {
      return sendServiceError(res, error);
    }
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/assets/text                                                      */
/* -------------------------------------------------------------------------- */

router.post(
  "/text",
  async (req: Request, res: Response) => {
    const userId = requireAuthenticatedUser(req, res);

    if (!userId) return;

    try {
      const body = req.body ?? {};

      const name =
        typeof body.name === "string"
          ? body.name
          : "";

      const textContent =
        typeof body.textContent === "string"
          ? body.textContent
          : "";

      const origin = parseOptionalEnum(
        body.origin,
        ASSET_ORIGINS,
        "asset origin",
      );

      const platformTargets = parsePlatformTargets(
        body.platformTargets,
      );

      const googlePack = parseGooglePack(
        body.googlePack,
      );

      const prompt =
        typeof body.prompt === "string"
          ? body.prompt
          : undefined;

      const asset = await createTextAsset({
        ownerUserId: userId,
        name,
        textContent,
        origin: origin as AssetOrigin | undefined,
        platformTargets,
        googlePack,
        prompt,
      });

      return res.status(201).json({
        success: true,
        message: "Text asset saved successfully.",
        asset,
      });
    } catch (error) {
      return sendServiceError(res, error);
    }
  },
);

/* -------------------------------------------------------------------------- */
/* GET /api/assets/stats                                                      */
/* -------------------------------------------------------------------------- */

router.get(
  "/stats",
  async (req: Request, res: Response) => {
    const userId = requireAuthenticatedUser(req, res);

    if (!userId) return;

    try {
      const stats = await getAssetStats(userId);

      return res.status(200).json({
        success: true,
        stats,
      });
    } catch (error) {
      return sendServiceError(res, error);
    }
  },
);

/* -------------------------------------------------------------------------- */
/* GET /api/assets/:assetId/content                                           */
/* -------------------------------------------------------------------------- */

router.get(
  "/:assetId/content",
  async (req: Request, res: Response) => {
    const userId = requireAuthenticatedUser(req, res);

    if (!userId) return;

    try {
      const content = await getAssetContent(
        userId,
        req.params.assetId,
      );

      const fileSize = content.sizeBytes;
      const rangeHeader = req.headers.range;

      res.setHeader(
        "Content-Type",
        content.mimeType,
      );

      res.setHeader(
        "X-Content-Type-Options",
        "nosniff",
      );

      res.setHeader(
        "Cache-Control",
        "private, no-store",
      );

      res.setHeader(
        "Accept-Ranges",
        "bytes",
      );

      res.setHeader(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(
          content.asset.originalFileName ||
            content.asset.name,
        )}`,
      );

      if (rangeHeader) {
        const range = parseByteRange(
          rangeHeader,
          fileSize,
        );

        if (!range) {
          res.setHeader(
            "Content-Range",
            `bytes */${fileSize}`,
          );

          return res.status(416).end();
        }

        const chunkLength =
          range.end - range.start + 1;

        res.status(206);

        res.setHeader(
          "Content-Range",
          `bytes ${range.start}-${range.end}/${fileSize}`,
        );

        res.setHeader(
          "Content-Length",
          String(chunkLength),
        );

        const stream = createReadStream(
          content.absolutePath,
          {
            start: range.start,
            end: range.end,
          },
        );

        stream.on("error", (error) => {
          console.error(
            "Asset content stream failed:",
            error,
          );

          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              message:
                "Unable to read the stored asset file.",
            });
          } else {
            res.destroy(error);
          }
        });

        stream.pipe(res);
        return;
      }

      res.setHeader(
        "Content-Length",
        String(fileSize),
      );

      const fileStream = createReadStream(
        content.absolutePath,
      );

      fileStream.on("error", (error) => {
        console.error(
          "Asset content stream failed:",
          error,
        );

        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message:
              "Unable to read the stored asset file.",
          });
        } else {
          res.destroy(error);
        }
      });

      fileStream.pipe(res);
    } catch (error) {
      return sendServiceError(res, error);
    }
  },
);

/* -------------------------------------------------------------------------- */
/* GET /api/assets/:assetId                                                   */
/* -------------------------------------------------------------------------- */

router.get(
  "/:assetId",
  async (req: Request, res: Response) => {
    const userId = requireAuthenticatedUser(req, res);

    if (!userId) return;

    try {
      const asset = await getAsset(
        userId,
        req.params.assetId,
      );

      return res.status(200).json({
        success: true,
        asset,
      });
    } catch (error) {
      return sendServiceError(res, error);
    }
  },
);

/* -------------------------------------------------------------------------- */
/* PATCH /api/assets/:assetId                                                 */
/* -------------------------------------------------------------------------- */

router.patch(
  "/:assetId",
  async (req: Request, res: Response) => {
    const userId = requireAuthenticatedUser(req, res);

    if (!userId) return;

    try {
      const body = req.body ?? {};

      const input: {
        name?: string;
        textContent?: string | null;
        aspectRatio?: string | null;
        prompt?: string | null;
        platformTargets?: AssetProvider[];
      } = {};

      if (body.name !== undefined) {
        if (typeof body.name !== "string") {
          throw new AssetLibraryServiceError(
            "name must be a string.",
          );
        }

        input.name = body.name;
      }

      if (body.textContent !== undefined) {
        if (
          body.textContent !== null &&
          typeof body.textContent !== "string"
        ) {
          throw new AssetLibraryServiceError(
            "textContent must be a string or null.",
          );
        }

        input.textContent = body.textContent;
      }

      if (body.aspectRatio !== undefined) {
        if (
          body.aspectRatio !== null &&
          typeof body.aspectRatio !== "string"
        ) {
          throw new AssetLibraryServiceError(
            "aspectRatio must be a string or null.",
          );
        }

        input.aspectRatio = body.aspectRatio;
      }

      if (body.prompt !== undefined) {
        if (
          body.prompt !== null &&
          typeof body.prompt !== "string"
        ) {
          throw new AssetLibraryServiceError(
            "prompt must be a string or null.",
          );
        }

        input.prompt = body.prompt;
      }

      if (body.platformTargets !== undefined) {
        input.platformTargets =
          parsePlatformTargets(
            body.platformTargets,
          ) ?? [];
      }

      if (Object.keys(input).length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Provide at least one supported asset field to update.",
        });
      }

      const asset = await updateAsset(
        userId,
        req.params.assetId,
        input,
      );

      return res.status(200).json({
        success: true,
        message: "Asset updated successfully.",
        asset,
      });
    } catch (error) {
      return sendServiceError(res, error);
    }
  },
);

/* -------------------------------------------------------------------------- */
/* DELETE /api/assets/:assetId                                                */
/* -------------------------------------------------------------------------- */

router.delete(
  "/:assetId",
  async (req: Request, res: Response) => {
    const userId = requireAuthenticatedUser(req, res);

    if (!userId) return;

    try {
      const result = await deleteAsset(
        userId,
        req.params.assetId,
      );

      return res.status(200).json({
        success: true,
        message: "Asset deleted successfully.",
        ...result,
      });
    } catch (error) {
      return sendServiceError(res, error);
    }
  },
);

export default router;
