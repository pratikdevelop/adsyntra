
/**
 * AdSyntra Asset Library API client — direct axios usage.
 *
 * Express router mounted at /api/assets:
 *
 * GET    /api/assets
 * GET    /api/assets/stats
 * GET    /api/assets/providers/google
 * GET    /api/assets/providers/meta
 * POST   /api/assets/upload
 * POST   /api/assets/text
 * GET    /api/assets/:assetId
 * GET    /api/assets/:assetId/content
 * PATCH  /api/assets/:assetId
 * DELETE /api/assets/:assetId
 */

import axios, {
  type AxiosError,
  type AxiosInstance,
} from "axios";

/* -------------------------------------------------------------------------- */
/* Asset types                                                                */
/* -------------------------------------------------------------------------- */

export type AssetKind =
  | "IMAGE"
  | "VIDEO"
  | "LOGO"
  | "TEXT"
  | "CTA"
  | "EXTENSION"
  | "CREATIVE";

export type AssetKindFilter = AssetKind | "ALL";

export type AssetOrigin =
  | "MANUAL"
  | "AI_STUDIO"
  | "GOOGLE_ADS"
  | "META_ADS";

export type AssetProvider = "googleAds" | "metaAds";

export type GoogleAdsAssetFilter =
  | "ALL"
  | "IMAGE"
  | "VIDEO"
  | "TEXT"
  | "CTA"
  | "EXTENSION"
  | "CREATIVE";

export type MetaAdsAssetFilter =
  | "ALL"
  | "IMAGE"
  | "VIDEO"
  | "TEXT"
  | "CTA"
  | "CREATIVE";

/* -------------------------------------------------------------------------- */
/* Google creative pack                                                       */
/* -------------------------------------------------------------------------- */

export interface GoogleCreativePack {
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
/* Provider creative media                                                    */
/* -------------------------------------------------------------------------- */

export type ProviderMediaKind = "IMAGE" | "VIDEO";

export interface ProviderCreativeMediaReference {
  kind: ProviderMediaKind;
  assetId: string | null;
  imageHash: string | null;
  videoId: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
}

/* -------------------------------------------------------------------------- */
/* Provider carousel cards                                                    */
/* -------------------------------------------------------------------------- */

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
/* Structured provider creative                                               */
/* -------------------------------------------------------------------------- */

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

  relatedAssetIds: string[];
}

/* -------------------------------------------------------------------------- */
/* Provider extension content                                                */
/* -------------------------------------------------------------------------- */

export interface ProviderExtensionContent {
  extensionType: string | null;

  text: string | null;
  linkText: string | null;
  description1: string | null;
  description2: string | null;

  header: string | null;
  values: string[];

  phoneNumber: string | null;

  promotionTarget: string | null;
  promotionCode: string | null;
  discountType: string | null;
  discountValue: string | null;
  occasion: string | null;

  currencyCode: string | null;
  priceAmount: string | null;
  priceQualifier: string | null;

  businessName: string | null;
  headline: string | null;
  description: string | null;
  privacyPolicyUrl: string | null;

  finalUrl: string | null;

  fieldNames: string[];
}

/* -------------------------------------------------------------------------- */
/* Provider asset reference                                                   */
/* -------------------------------------------------------------------------- */

export interface ProviderAssetReference {
  provider: AssetProvider;

  accountId: string;
  accountName: string | null;

  assetId: string;
  assetType: string | null;
  resourceName: string | null;

  creativeId: string | null;
  adId: string | null;
  campaignId: string | null;
  adGroupId: string | null;
  adSetId: string | null;

  imageHash: string | null;
  videoId: string | null;

  mediaUrl: string | null;
  thumbnailUrl: string | null;

  syncedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Library asset                                                              */
/* -------------------------------------------------------------------------- */

export interface LibraryAsset {
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

  googlePack: GoogleCreativePack | null;

  providerAsset: ProviderAssetReference | null;

  providerCreative: ProviderCreativeContent | null;

  providerExtension: ProviderExtensionContent | null;

  /**
   * Authenticated endpoint for AdSyntra-owned media only.
   * Provider-owned media must use providerAsset.mediaUrl or thumbnailUrl.
   */
  contentUrl: string | null;

  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* API responses                                                              */
/* -------------------------------------------------------------------------- */

export interface AssetPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AssetListResponse {
  success: boolean;
  assets: LibraryAsset[];
  pagination: AssetPagination;
}

export interface AssetMutationResponse {
  success: boolean;
  asset: LibraryAsset;
  message: string;
}

export interface ProviderAssetSyncResponse {
  success: boolean;
  provider: AssetProvider;
  accountId: string;

  requestedKind?: string;

  count: number;
  assets: LibraryAsset[];

  nextPageToken: string | null;
}

export interface AssetKindStats {
  count: number;
  sizeBytes: number;
}

export interface AssetStatsResponse {
  success: boolean;

  stats: {
    total: number;
    totalSizeBytes: number;

    byKind: Record<AssetKind, AssetKindStats>;
  };
}

export interface AssetDeleteResponse {
  success: boolean;
  message: string;
  id: string;
  deleted: true;
}

/* -------------------------------------------------------------------------- */
/* Error payload                                                              */
/* -------------------------------------------------------------------------- */

interface ApiErrorPayload {
  message?: string;
  error?: string;
}

/* -------------------------------------------------------------------------- */
/* Axios instance                                                             */
/* -------------------------------------------------------------------------- */

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/+$/, "");

/**
 * Create a per-request axios instance bound to a Clerk bearer token.
 */
function createClient(token: string): AxiosInstance {
  if (!token) {
    throw new Error(
      "Authentication token is required to access the Asset Library.",
    );
  }

  return axios.create({
    baseURL: API_BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Normalize an axios failure into a readable Error.
 */
function toApiError(error: unknown): Error {
  if (axios.isAxiosError<ApiErrorPayload>(error)) {
    const axiosError = error as AxiosError<ApiErrorPayload>;
    const payload = axiosError.response?.data;

    return new Error(
      payload?.message ||
      payload?.error ||
      `Asset API request failed (${axiosError.response?.status ?? "network error"
      }).`,
    );
  }

  return error instanceof Error
    ? error
    : new Error(String(error));
}

/* -------------------------------------------------------------------------- */
/* List assets                                                                */
/* -------------------------------------------------------------------------- */

/**
 * List the signed-in user's assets.
 *
 * kind="ALL" omits the kind query parameter.
 * provider can narrow results to Google or Meta.
 */
export async function listAssets(
  token: string,
  options: {
    page?: number;
    pageSize?: number;
    kind?: AssetKindFilter;
    search?: string;
    origin?: AssetOrigin;
    provider?: AssetProvider;
    providerAccountId?: string;
  } = {},
): Promise<AssetListResponse> {
  const client = createClient(token);

  const params: Record<string, string | number> = {
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 24,
  };

  if (options.kind && options.kind !== "ALL") {
    params.kind = options.kind;
  }

  if (options.search?.trim()) {
    params.search = options.search.trim();
  }

  if (options.origin) {
    params.origin = options.origin;
  }

  if (options.provider) {
    params.provider = options.provider;
  }

  if (options.providerAccountId?.trim()) {
    params.providerAccountId = options.providerAccountId.trim();
  }

  try {
    const { data } = await client.get<AssetListResponse>(
      "/api/assets",
      {
        params,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );

    return data;
  } catch (error) {
    throw toApiError(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Google Ads provider assets                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Fetch Google Ads assets and creative records.
 *
 * The backend retrieves:
 * - Images and YouTube videos.
 * - Reusable text assets.
 * - CTA assets.
 * - Extension assets.
 * - Responsive Search and Display Ad creatives.
 *
 * Provider media is not downloaded into AdSyntra.
 */
export async function fetchGoogleAdsAssets(
  token: string,
  options: {
    kind?: GoogleAdsAssetFilter;
    limit?: number;
    pageToken?: string;
  } = {},
): Promise<ProviderAssetSyncResponse> {
  const client = createClient(token);

  const params: Record<string, string | number> = {
    kind: options.kind ?? "ALL",
    limit: options.limit ?? 50,
  };

  if (options.pageToken) {
    params.pageToken = options.pageToken;
  }

  try {
    const { data } = await client.get<ProviderAssetSyncResponse>(
      "/api/assets/providers/google",
      {
        params,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );

    return data;
  } catch (error) {
    throw toApiError(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Meta Ads provider assets                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Fetch Meta Ads media and ad creative records.
 *
 * The backend retrieves:
 * - Account images and videos.
 * - Primary text and headlines.
 * - Descriptions and CTA details.
 * - Carousel cards.
 * - Dynamic creative variations.
 *
 * TEXT and CTA are filters over creative content.
 * The stored provider record remains a CREATIVE record.
 */
export async function fetchMetaAdsAssets(
  token: string,
  options: {
    kind?: MetaAdsAssetFilter;
    limit?: number;
    pageToken?: string;
  } = {},
): Promise<ProviderAssetSyncResponse> {
  const client = createClient(token);

  const params: Record<string, string | number> = {
    kind: options.kind ?? "ALL",
    limit: options.limit ?? 50,
  };

  if (options.pageToken) {
    params.pageToken = options.pageToken;
  }

  try {
    const { data } = await client.get<ProviderAssetSyncResponse>(
      "/api/assets/providers/meta",
      {
        params,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );

    return data;
  } catch (error) {
    throw toApiError(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Upload AdSyntra-owned media                                                */
/* -------------------------------------------------------------------------- */

/**
 * Upload an image, logo or video file into AdSyntra-owned storage.
 */
export async function uploadAsset(
  token: string,
  input: {
    name: string;
    kind: "IMAGE" | "VIDEO" | "LOGO";
    file: File;
    origin?: AssetOrigin;
    prompt?: string;
    platformTargets?: AssetProvider[];
  },
): Promise<AssetMutationResponse> {
  if (!input.file) {
    throw new Error("Choose a file to upload.");
  }

  const client = createClient(token);

  const form = new FormData();

  form.append("file", input.file);
  form.append("name", input.name);
  form.append("kind", input.kind);
  form.append("origin", input.origin ?? "MANUAL");

  if (input.prompt) {
    form.append("prompt", input.prompt);
  }

  if (input.platformTargets) {
    form.append(
      "platformTargets",
      JSON.stringify(input.platformTargets),
    );
  }

  try {
    // Let axios set the multipart boundary automatically.
    const { data } = await client.post<AssetMutationResponse>(
      "/api/assets/upload",
      form,
    );

    return data;
  } catch (error) {
    throw toApiError(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Create text asset                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Create a reusable AdSyntra text asset or Google creative pack.
 */
export async function createTextAsset(
  token: string,
  input: {
    name: string;
    textContent?: string;
    origin?: AssetOrigin;
    prompt?: string;
    platformTargets?: AssetProvider[];
    googlePack?: GoogleCreativePack | null;
  },
): Promise<AssetMutationResponse> {
  const client = createClient(token);

  const body = {
    name: input.name,
    textContent: input.textContent ?? "",
    origin: input.origin ?? "MANUAL",
    prompt: input.prompt,
    platformTargets: input.platformTargets ?? [],
    googlePack: input.googlePack ?? null,
  };

  try {
    const { data } = await client.post<AssetMutationResponse>(
      "/api/assets/text",
      body,
    );

    return data;
  } catch (error) {
    throw toApiError(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Get one asset                                                              */
/* -------------------------------------------------------------------------- */

export async function getAsset(
  token: string,
  assetId: string,
): Promise<{
  success: boolean;
  asset: LibraryAsset;
}> {
  const client = createClient(token);

  try {
    const { data } = await client.get<{
      success: boolean;
      asset: LibraryAsset;
    }>(
      `/api/assets/${encodeURIComponent(assetId)}`,
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );

    return data;
  } catch (error) {
    throw toApiError(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Update asset                                                               */
/* -------------------------------------------------------------------------- */

export async function updateAsset(
  token: string,
  assetId: string,
  updates: Partial<
    Pick<
      LibraryAsset,
      | "name"
      | "textContent"
      | "prompt"
      | "aspectRatio"
      | "platformTargets"
    >
  >,
): Promise<AssetMutationResponse> {
  const client = createClient(token);

  try {
    const { data } = await client.patch<AssetMutationResponse>(
      `/api/assets/${encodeURIComponent(assetId)}`,
      updates,
    );

    return data;
  } catch (error) {
    throw toApiError(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Delete asset                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Delete the AdSyntra library record.
 *
 * Provider assets are removed from AdSyntra only.
 * Their original Google or Meta provider records remain untouched.
 */
export async function deleteAsset(
  token: string,
  assetId: string,
): Promise<AssetDeleteResponse> {
  const client = createClient(token);

  try {
    const { data } = await client.delete<AssetDeleteResponse>(
      `/api/assets/${encodeURIComponent(assetId)}`,
    );

    return data;
  } catch (error) {
    throw toApiError(error);
  }
}

/* -------------------------------------------------------------------------- */
/* AdSyntra-owned media preview                                                */
/* -------------------------------------------------------------------------- */

/**
 * Fetch an AdSyntra-owned private media file through its authenticated
 * content endpoint.
 *
 * This method is for local uploads only.
 *
 * Provider assets should use:
 * - asset.providerAsset.mediaUrl
 * - asset.providerAsset.thumbnailUrl
 *
 * The caller must revoke the returned object URL when it is no longer needed.
 */
export async function createAssetObjectUrl(
  token: string,
  asset: Pick<LibraryAsset, "contentUrl">,
): Promise<string> {
  if (!asset.contentUrl) {
    throw new Error(
      "This asset does not contain an AdSyntra-stored media file.",
    );
  }

  const client = createClient(token);

  try {
    const { data } = await client.get<Blob>(
      asset.contentUrl,
      {
        responseType: "blob",
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );

    return URL.createObjectURL(data);
  } catch (error) {
    throw toApiError(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Statistics                                                                 */
/* -------------------------------------------------------------------------- */

export async function getAssetStats(
  token: string,
): Promise<AssetStatsResponse> {
  const client = createClient(token);

  try {
    const { data } = await client.get<AssetStatsResponse>(
      "/api/assets/stats",
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );

    return data;
  } catch (error) {
    throw toApiError(error);
  }
}
