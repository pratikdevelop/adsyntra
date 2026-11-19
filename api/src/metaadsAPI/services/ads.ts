/* -------------------------------------------------------------------------- */
/* Meta Ads Service                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Service-only implementation for Meta ad operations.
 *
 * This module intentionally contains no Express imports, Router instances,
 * Request/Response objects, or route registration. Your existing route layer
 * should obtain the user's Meta access token and pass it to these functions.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface MetaAdsServiceContext {
    accessToken: string;
    apiVersion?: string;
}

export interface CreateMetaAdInput {
    adAccountId: string;
    name: string;
    adSetId: string;
    creativeId: string;
}

export interface ListMetaAdsInput {
    adAccountId: string;
    limit?: number;
    after?: string;
    fields?: string[];
}

export interface ListMetaAdSetAdsInput {
    adSetId: string;
    adAccountId: string;
    campaignId?: string;
    limit?: number;
    after?: string;
    fields?: string[];
}

export interface ListMetaCampaignAdSetsInput {
    adAccountId: string;
    campaignId: string;
    limit?: number;
    after?: string;
}

export type MetaAdPreviewFormat =
    | "MOBILE_FEED_STANDARD"
    | "DESKTOP_FEED_STANDARD"
    | "INSTAGRAM_STANDARD"
    | "INSTAGRAM_STORY"
    | "INSTAGRAM_REELS";

export interface GetMetaAdPreviewInput {
    adId: string;
    adFormat?: MetaAdPreviewFormat;
}

export interface MetaResolvedCreativeAsset {
    id: string;
    type: "IMAGE";
    name: string | null;
    mediaUrl: string | null;
    thumbnailUrl: string | null;
    width: number | null;
    height: number | null;
    sourcePath: string;
    resolutionError?: string | null;
}

export interface MetaAd {
    id: string;
    name?: string;
    status?: string;
    effective_status?: string;
    adset_id?: string;
    campaign_id?: string;
    creative?: {
        id?: string;
        [key: string]: unknown;
    };
    /** Image hashes in dynamic creatives resolved through the selected Ad Account's adimages edge. */
    resolvedAssets?: MetaResolvedCreativeAsset[];
    [key: string]: unknown;
}

export interface MetaPagination {
    hasNextPage: boolean;
    nextCursor: string | null;
    previousCursor: string | null;
}

export interface CreateMetaAdResult {
    adId: string;
    status: "PAUSED";
}

export interface ListMetaAdsResult {
    ads: MetaAd[];
    count: number;
    pagination: MetaPagination;
}

export interface MetaAdPreview {
    body?: string;
    html?: string;
    [key: string]: unknown;
}

export interface GetMetaAdPreviewResult {
    adId: string;
    adFormat: MetaAdPreviewFormat;
    previews: MetaAdPreview[];
}

interface MetaApiErrorPayload {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
    [key: string]: unknown;
}

interface MetaApiResponse<T> {
    data?: T;
    id?: string;
    paging?: {
        next?: string;
        previous?: string;
        cursors?: {
            before?: string;
            after?: string;
        };
    };
    error?: MetaApiErrorPayload;
    success?: boolean;
    [key: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class MetaAdsServiceError extends Error {
    readonly statusCode: number;
    readonly metaErrorType?: string;
    readonly metaErrorCode?: number;
    readonly metaErrorSubcode?: number;
    readonly fbtraceId?: string;
    readonly details?: unknown;

    constructor(
        message: string,
        statusCode = 500,
        metaError?: MetaApiErrorPayload,
        details?: unknown,
    ) {
        super(message);
        this.name = "MetaAdsServiceError";
        this.statusCode = statusCode;
        this.metaErrorType = metaError?.type;
        this.metaErrorCode = metaError?.code;
        this.metaErrorSubcode = metaError?.error_subcode;
        this.fbtraceId = metaError?.fbtrace_id;
        this.details = details;
    }
}

/* -------------------------------------------------------------------------- */
/* Constants and helpers                                                      */
/* -------------------------------------------------------------------------- */

const DEFAULT_API_VERSION = process.env.META_GRAPH_API_VERSION || "v25.0";
const DEFAULT_AD_FIELDS = [
    "id",
    "name",
    "status",
    "effective_status",
    "adset_id",
    "campaign_id",
    // Include the creative fields used by the campaign hierarchy UI so Meta
    // ads display their real text, media URLs, CTA and carousel/feed payload.
    "creative{id,account_id,name,object_type,body,title,description,image_url,image_hash,video_id,thumbnail_url,link_url,link_destination_display_url,call_to_action_type,call_to_action,object_story_spec,asset_feed_spec,effective_object_story_id,instagram_permalink_url}",
];

const ALLOWED_PREVIEW_FORMATS: readonly MetaAdPreviewFormat[] = [
    "MOBILE_FEED_STANDARD",
    "DESKTOP_FEED_STANDARD",
    "INSTAGRAM_STANDARD",
    "INSTAGRAM_STORY",
    "INSTAGRAM_REELS",
];

function requireContext(context: MetaAdsServiceContext): void {
    if (!context || typeof context.accessToken !== "string" || !context.accessToken.trim()) {
        throw new MetaAdsServiceError("A valid Meta access token is required.", 401);
    }
}

function normalizeApiVersion(version?: string): string {
    const value = (version || DEFAULT_API_VERSION).trim();
    if (!/^v\d+\.\d+$/.test(value)) {
        throw new MetaAdsServiceError("Invalid Meta Graph API version.", 400);
    }
    return value;
}

function normalizeAdAccountId(value: string): string {
    const accountId = value.startsWith("act_") ? value : `act_${value}`;
    if (!/^act_\d+$/.test(accountId)) {
        throw new MetaAdsServiceError("Invalid ad account ID.", 400);
    }
    return accountId;
}

function requireNumericId(value: string, label: string): string {
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        throw new MetaAdsServiceError(`Valid numeric ${label} is required.`, 400);
    }
    return value;
}

function normalizeLimit(value?: number): number {
    const limit = value ?? 25;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new MetaAdsServiceError("limit must be an integer between 1 and 100.", 400);
    }
    return limit;
}

function normalizeFields(fields?: string[]): string[] {
    if (!fields?.length) return DEFAULT_AD_FIELDS;

    const cleaned = fields
        .map((field) => field.trim())
        .filter(Boolean);

    if (!cleaned.length) {
        throw new MetaAdsServiceError("At least one valid field is required.", 400);
    }

    // Field names are supplied by the application, not accepted from arbitrary
    // Graph API URLs. Keep the list comma-separated for the Graph API.
    return [...new Set(cleaned)];
}

function buildGraphUrl(
    context: MetaAdsServiceContext,
    path: string,
): string {
    const version = normalizeApiVersion(context.apiVersion);
    return `https://graph.facebook.com/${version}/${path.replace(/^\/+/, "")}`;
}

async function parseMetaResponse<T>(response: Response): Promise<MetaApiResponse<T>> {
    const responseText = await response.text();
    let payload: MetaApiResponse<T>;

    try {
        payload = responseText
            ? (JSON.parse(responseText) as MetaApiResponse<T>)
            : ({} as MetaApiResponse<T>);
    } catch {
        throw new MetaAdsServiceError(
            "Meta returned an invalid JSON response.",
            502,
            undefined,
            { responseText: responseText.slice(0, 1000) },
        );
    }

    if (!response.ok || payload.error) {
        throw new MetaAdsServiceError(
            payload.error?.message || `Meta API request failed with status ${response.status}.`,
            response.status >= 400 && response.status < 600 ? response.status : 502,
            payload.error,
            payload,
        );
    }

    return payload;
}

async function metaGet<T>(
    context: MetaAdsServiceContext,
    path: string,
    params: URLSearchParams,
): Promise<MetaApiResponse<T>> {
    requireContext(context);
    const url = buildGraphUrl(context, path);

    let response: Response;
    try {
        response = await fetch(`${url}?${params.toString()}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${context.accessToken}`,
            },
            signal: AbortSignal.timeout(30_000),
        });
    } catch (error) {
        throw new MetaAdsServiceError(
            error instanceof Error
                ? `Unable to connect to Meta: ${error.message}`
                : "Unable to connect to Meta.",
            502,
        );
    }

    return parseMetaResponse<T>(response);
}

async function metaPost<T>(
    context: MetaAdsServiceContext,
    path: string,
    params: URLSearchParams,
): Promise<MetaApiResponse<T>> {
    requireContext(context);
    const url = buildGraphUrl(context, path);

    let response: Response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${context.accessToken}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params,
            signal: AbortSignal.timeout(30_000),
        });
    } catch (error) {
        throw new MetaAdsServiceError(
            error instanceof Error
                ? `Unable to connect to Meta: ${error.message}`
                : "Unable to connect to Meta.",
            502,
        );
    }

    return parseMetaResponse<T>(response);
}

function mapPagination<T>(
    response: MetaApiResponse<T>,
): MetaPagination {
    return {
        hasNextPage: Boolean(response.paging?.next),
        nextCursor: response.paging?.next
            ? response.paging.cursors?.after ?? null
            : null,
        previousCursor: response.paging?.previous
            ? response.paging.cursors?.before ?? null
            : null,
    };
}

/* -------------------------------------------------------------------------- */
/* Create ad                                                                  */
/* -------------------------------------------------------------------------- */

/** Creates an ad in PAUSED status so it cannot begin delivery unexpectedly. */
export async function createMetaAd(
    context: MetaAdsServiceContext,
    input: CreateMetaAdInput,
): Promise<CreateMetaAdResult> {
    requireContext(context);

    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) {
        throw new MetaAdsServiceError("name is required.", 400);
    }

    const accountId = normalizeAdAccountId(input.adAccountId);
    const adSetId = requireNumericId(input.adSetId, "Ad Set ID");
    const creativeId = requireNumericId(input.creativeId, "creative ID");

    const params = new URLSearchParams();
    params.set("name", name);
    params.set("adset_id", adSetId);
    params.set("creative", JSON.stringify({ creative_id: creativeId }));
    params.set("status", "PAUSED");

    const result = await metaPost<{ id?: string }>(
        context,
        `${accountId}/ads`,
        params,
    );

    if (!result.id) {
        throw new MetaAdsServiceError(
            "Meta did not return an ad ID after creation.",
            502,
            undefined,
            result,
        );
    }

    return {
        adId: result.id,
        status: "PAUSED",
    };
}

/* -------------------------------------------------------------------------- */
/* Resolve Meta creative image hashes                                         */
/* -------------------------------------------------------------------------- */

interface MetaAdImageRecord {
    hash?: string;
    url?: string;
    url_128?: string;
    name?: string;
    width?: number;
    height?: number;
}

function collectMetaImageHashes(value: unknown): Array<{ hash: string; sourcePath: string }> {
    const found: Array<{ hash: string; sourcePath: string }> = [];
    const visited = new Set<object>();

    const visit = (current: unknown, path: string): void => {
        if (!current || typeof current !== "object") return;
        if (visited.has(current)) return;
        visited.add(current);

        if (Array.isArray(current)) {
            current.forEach((item, index) => visit(item, `${path}[${index}]`));
            return;
        }

        for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
            const nextPath = path ? `${path}.${key}` : key;
            const lowerKey = key.toLowerCase();
            const isImageHash = lowerKey === "image_hash" || lowerKey === "imagehash";
            const isHashInsideImages = lowerKey === "hash" && /(^|\.)images(\.|\[)/i.test(path);
            if ((isImageHash || isHashInsideImages) && typeof child === "string" && child.trim()) {
                found.push({ hash: child.trim(), sourcePath: `ad.creative.${nextPath}` });
            } else {
                visit(child, nextPath);
            }
        }
    };

    visit(value, "");
    return [...new Map(found.map((item) => [item.hash, item])).values()];
}

/**
 * Dynamic Meta creatives often provide image hashes in asset_feed_spec rather
 * than a directly renderable URL. Resolve those hashes through the selected
 * ad account's /adimages edge. Failure is non-fatal: raw creative payloads and
 * direct image_url/thumbnail_url fields remain available to the client.
 */
async function attachMetaCreativeImageAssets(
    context: MetaAdsServiceContext,
    accountId: string,
    ads: MetaAd[],
): Promise<MetaAd[]> {
    const hashesByAd = new Map<string, Array<{ hash: string; sourcePath: string }>>();
    const allHashes = new Set<string>();

    for (const ad of ads) {
        const hashes = collectMetaImageHashes(ad.creative ?? {});
        hashesByAd.set(ad.id, hashes);
        hashes.forEach(({ hash }) => allHashes.add(hash));
    }

    if (!allHashes.size) {
        return ads.map((ad) => ({ ...ad, resolvedAssets: [] }));
    }

    const normalizedAccountId = normalizeAdAccountId(accountId);
    const params = new URLSearchParams();
    params.set("hashes", JSON.stringify([...allHashes]));
    params.set("fields", "hash,url,url_128,name,width,height");

    try {
        const response = await metaGet<MetaAdImageRecord[]>(
            context,
            `${normalizedAccountId}/adimages`,
            params,
        );
        const rows = Array.isArray(response.data) ? response.data : [];
        const byHash = new Map(rows
            .filter((item) => typeof item.hash === "string")
            .map((item) => [item.hash as string, item]));

        return ads.map((ad) => ({
            ...ad,
            resolvedAssets: (hashesByAd.get(ad.id) ?? []).map(({ hash, sourcePath }) => {
                const image = byHash.get(hash);
                return {
                    id: hash,
                    type: "IMAGE" as const,
                    name: typeof image?.name === "string" ? image.name : null,
                    mediaUrl: typeof image?.url === "string" && /^https:\/\//i.test(image.url) ? image.url : null,
                    thumbnailUrl: typeof image?.url_128 === "string" && /^https:\/\//i.test(image.url_128)
                        ? image.url_128
                        : typeof image?.url === "string" && /^https:\/\//i.test(image.url)
                            ? image.url
                            : null,
                    width: typeof image?.width === "number" ? image.width : null,
                    height: typeof image?.height === "number" ? image.height : null,
                    sourcePath,
                    resolutionError: image?.url || image?.url_128 ? null : "Meta returned the image hash but no preview URL for this asset.",
                };
            }),
        }));
    } catch (error) {
        // Keep listing ads even if optional image-hash resolution is denied.
        console.warn(
            "Meta creative image resolution failed:",
            error instanceof Error ? error.message : error,
        );
        return ads.map((ad) => ({
            ...ad,
            resolvedAssets: (hashesByAd.get(ad.id) ?? []).map(({ hash, sourcePath }) => ({
                id: hash,
                type: "IMAGE" as const,
                name: null,
                mediaUrl: null,
                thumbnailUrl: null,
                width: null,
                height: null,
                sourcePath,
                resolutionError: error instanceof Error ? error.message : "Meta image lookup failed.",
            })),
        }));
    }
}

/* -------------------------------------------------------------------------- */
/* List account ads                                                           */
/* -------------------------------------------------------------------------- */

export async function listMetaAccountAds(
    context: MetaAdsServiceContext,
    input: ListMetaAdsInput,
): Promise<ListMetaAdsResult> {
    const accountId = normalizeAdAccountId(input.adAccountId);
    const limit = normalizeLimit(input.limit);
    const fields = normalizeFields(input.fields);

    const params = new URLSearchParams();
    params.set("fields", fields.join(","));
    params.set("limit", String(limit));
    if (input.after) params.set("after", input.after);

    const result = await metaGet<MetaAd[]>(context, `${accountId}/ads`, params);
    const ads = await attachMetaCreativeImageAssets(context, accountId, result.data ?? []);

    return {
        ads,
        count: ads.length,
        pagination: mapPagination(result),
    };
}



async function assertMetaCampaignBelongsToAccount(
    context: MetaAdsServiceContext,
    campaignId: string,
    selectedAccountId: string,
): Promise<void> {
    const params = new URLSearchParams();
    params.set("fields", "id,account_id");
    const campaign = await metaGet<Record<string, unknown>>(context, campaignId, params);
    const returnedAccount = typeof campaign.account_id === "string"
        ? normalizeAdAccountId(campaign.account_id)
        : null;
    const expectedAccount = normalizeAdAccountId(selectedAccountId);
    if (!returnedAccount || returnedAccount !== expectedAccount) {
        throw new MetaAdsServiceError(
            "The requested campaign does not belong to the selected Meta ad account.",
            403,
        );
    }
}

/** Lists ad sets under a campaign, after checking that campaign belongs to the user's selected ad account. */
export async function listMetaCampaignAdSets(
    context: MetaAdsServiceContext,
    input: ListMetaCampaignAdSetsInput,
): Promise<{
    adSets: Array<Record<string, unknown>>;
    count: number;
    pagination: MetaPagination;
}> {
    const accountId = normalizeAdAccountId(input.adAccountId);
    const campaignId = requireNumericId(input.campaignId, "Campaign ID");
    const limit = normalizeLimit(input.limit);
    await assertMetaCampaignBelongsToAccount(context, campaignId, accountId);

    const params = new URLSearchParams();
    params.set(
        "fields",
        [
            "id", "name", "status", "effective_status", "campaign_id",
            "daily_budget", "lifetime_budget", "billing_event",
            "optimization_goal", "bid_amount", "bid_strategy",
            "start_time", "end_time", "created_time", "updated_time",
            "targeting",
        ].join(","),
    );
    params.set("limit", String(limit));
    if (input.after) params.set("after", input.after);

    const result = await metaGet<Array<Record<string, unknown>>>(
        context,
        `${campaignId}/adsets`,
        params,
    );
    const adSets = result.data ?? [];
    return {
        adSets,
        count: adSets.length,
        pagination: mapPagination(result),
    };
}

/* -------------------------------------------------------------------------- */
/* List ads by ad set                                                         */
/* -------------------------------------------------------------------------- */

export async function listMetaAdSetAds(
    context: MetaAdsServiceContext,
    input: ListMetaAdSetAdsInput,
): Promise<ListMetaAdsResult> {
    const adSetId = requireNumericId(input.adSetId, "Ad Set ID");
    const accountId = normalizeAdAccountId(input.adAccountId);
    const limit = normalizeLimit(input.limit);

    // Verify the parent campaign before reading ads. This prevents a user's
    // token from being used to read an arbitrary ad set outside the selected
    // AdSyntra account, even if the token can access multiple ad accounts.
    const parentParams = new URLSearchParams();
    parentParams.set("fields", "id,campaign_id");
    const adSet = await metaGet<Record<string, unknown>>(context, adSetId, parentParams);
    const parentCampaignId = typeof adSet.campaign_id === "string"
        ? adSet.campaign_id
        : "";
    if (!parentCampaignId) {
        throw new MetaAdsServiceError("Meta did not return the ad set's parent campaign.", 502);
    }
    if (input.campaignId && parentCampaignId !== input.campaignId) {
        throw new MetaAdsServiceError("The requested ad set does not belong to the supplied campaign.", 403);
    }
    await assertMetaCampaignBelongsToAccount(context, parentCampaignId, accountId);

    const fields = normalizeFields(input.fields);
    const params = new URLSearchParams();
    params.set("fields", fields.join(","));
    params.set("limit", String(limit));
    if (input.after) params.set("after", input.after);

    const result = await metaGet<MetaAd[]>(context, `${adSetId}/ads`, params);
    const ads = await attachMetaCreativeImageAssets(context, accountId, result.data ?? []);

    return {
        ads,
        count: ads.length,
        pagination: mapPagination(result),
    };
}

/* -------------------------------------------------------------------------- */
/* Ad preview                                                                 */
/* -------------------------------------------------------------------------- */

export async function getMetaAdPreview(
    context: MetaAdsServiceContext,
    input: GetMetaAdPreviewInput,
): Promise<GetMetaAdPreviewResult> {
    const adId = requireNumericId(input.adId, "Ad ID");
    const adFormat = input.adFormat ?? "MOBILE_FEED_STANDARD";

    if (!ALLOWED_PREVIEW_FORMATS.includes(adFormat)) {
        throw new MetaAdsServiceError(
            `Unsupported ad preview format. Allowed formats: ${ALLOWED_PREVIEW_FORMATS.join(", ")}.`,
            400,
        );
    }

    const params = new URLSearchParams();
    params.set("ad_format", adFormat);

    const result = await metaGet<MetaAdPreview[]>(
        context,
        `${adId}/previews`,
        params,
    );

    return {
        adId,
        adFormat,
        previews: result.data ?? [],
    };
}
