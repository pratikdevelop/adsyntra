import { getGoogleAdsCreationContext } from "./campaign-creation.js";

import type { GoogleAdsCreationContext } from "../../interfaces/campaign-creation.js";

/* -------------------------------------------------------------------------- */
/* Public types                                                               */
/* -------------------------------------------------------------------------- */

export type GoogleAdsAdStatus = "ENABLED" | "PAUSED" | "REMOVED";

export type GoogleAdsAdStrength =
    | "PENDING"
    | "NO_ADS"
    | "POOR"
    | "AVERAGE"
    | "GOOD"
    | "EXCELLENT";

export type GoogleAdsApprovalStatus =
    | "APPROVED"
    | "APPROVED_LIMITED"
    | "DISAPPROVED"
    | "AREA_OF_INTEREST_ONLY"
    | "UNKNOWN";

export type GoogleAdsMetricsDateRange =
    | "TODAY"
    | "YESTERDAY"
    | "LAST_7_DAYS"
    | "LAST_14_DAYS"
    | "LAST_30_DAYS"
    | "THIS_MONTH"
    | "LAST_MONTH"
    | "ALL_TIME";

export interface GoogleAdsCustomDateRange {
    startDate: string;
    endDate: string;
}

export interface ListGoogleAdsInput {
    campaignId?: string;
    adGroupId?: string;
    adId?: string;
    status?: GoogleAdsAdStatus;
    /** Google Ads API AdType enum values. No local allow-list is used. */
    types?: string[];
    adStrength?: GoogleAdsAdStrength;
    approvalStatus?: GoogleAdsApprovalStatus;
    includeRemoved?: boolean;
    metricsDateRange?: GoogleAdsMetricsDateRange | GoogleAdsCustomDateRange;
    pageToken?: string;
}

export interface GoogleAdsAdMetrics {
    impressions: number;
    clicks: number;
    ctr: number;
    costMicros: string;
    averageCpcMicros: string;
    averageCpmMicros: string;
    conversions: number;
    conversionsValue: number;
    conversionsFromInteractionsRate: number;
    costPerConversionMicros: string;
    allConversions: number;
    allConversionsValue: number;
    interactions: number;
    interactionRate: number;
    engagements: number;
    engagementRate: number;
    videoViews: number;
    videoViewRate: number;
    videoQuartile25Rate: number;
    videoQuartile50Rate: number;
    videoQuartile75Rate: number;
    videoQuartile100Rate: number;
    viewThroughConversions: number;
}

export interface GoogleAdsLinkedAsset {
    id: string | null;
    resourceName: string;
    name: string | null;
    type: string;
    mediaUrl: string | null;
    thumbnailUrl: string | null;
    videoId: string | null;
    textContent: string | null;
    callToAction: string | null;
    mimeType: string | null;
    width: number | null;
    height: number | null;
    finalUrls: string[];
    sourcePath: string;
    resolutionError?: string | null;
    /** Original Google Ads Asset record, retained for provider-specific fields. */
    details: Record<string, unknown>;
}

export interface GoogleAdsAd {
    provider: "googleAds";
    accountId: string;

    id: string;
    resourceName: string | null;
    adResourceName: string | null;
    name: string | null;
    type: string | null;

    campaignId: string | null;
    campaignName: string | null;
    adGroupId: string | null;
    adGroupName: string | null;

    status: string | null;
    primaryStatus: string | null;
    primaryStatusReasons: string[];
    startDateTime: string | null;
    endDateTime: string | null;

    adStrength: string | null;
    actionItems: string[];
    approvalStatus: string | null;
    reviewStatus: string | null;
    policyTopics: Array<{ topic: string | null; type: string | null }>;
    addedByGoogle: boolean;

    finalUrls: string[];
    finalMobileUrls: string[];
    displayUrl: string | null;
    trackingUrlTemplate: string | null;

    /** Flattened creative fields for common UI/AI use. */
    headlines: string[];
    longHeadlines: string[];
    descriptions: string[];
    callToActions: string[];
    businessNames: string[];
    path1: string | null;
    path2: string | null;
    assetResourceNames: string[];
    /** Resolved IMAGE, YOUTUBE_VIDEO, TEXT, CTA and other linked Asset resources. */
    linkedAssets: GoogleAdsLinkedAsset[];

    /**
     * Complete selected ad-format payload from Google. This preserves format-
     * specific fields without losing information for less-common ad types.
     */
    creativeDetails: Record<string, unknown>;

    /** Aggregate metrics for metricsDateRange; not daily segmented rows. */
    metrics: GoogleAdsAdMetrics;
}

export interface ListGoogleAdsResult {
    provider: "googleAds";
    accountId: string;
    metricsDateRange: string;
    ads: GoogleAdsAd[];
    nextPageToken: string | null;
}


export interface GoogleAdsAdGroupRecord {
    id: string;
    resourceName: string | null;
    name: string | null;
    status: string | null;
    type: string | null;
    campaignId: string;
    campaignName: string | null;
    metrics: {
        impressions: number;
        clicks: number;
        ctr: number;
        costMicros: string;
    };
}

export interface ListGoogleAdsAdGroupsResult {
    provider: "googleAds";
    accountId: string;
    campaignId: string;
    adGroups: GoogleAdsAdGroupRecord[];
    nextPageToken: string | null;
}

/* -------------------------------------------------------------------------- */
/* Google Ads response types                                                  */
/* -------------------------------------------------------------------------- */

type UnknownRecord = Record<string, unknown>;

interface GoogleAdsAdSearchRow {
    adGroupAd?: UnknownRecord & { ad?: UnknownRecord };
    adGroup?: UnknownRecord;
    campaign?: UnknownRecord;
    metrics?: UnknownRecord;
}

interface GoogleAdsSearchResponse {
    results?: GoogleAdsAdSearchRow[];
    nextPageToken?: string;
    fieldMask?: string;
}

interface GoogleAdsErrorResponse {
    error?: {
        code?: number;
        message?: string;
        status?: string;
        details?: unknown[];
    };
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class GoogleAdsAdServiceError extends Error {
    readonly statusCode: number;
    readonly details?: unknown;

    constructor(message: string, statusCode = 500, details?: unknown) {
        super(message);
        this.name = "GoogleAdsAdServiceError";
        this.statusCode = statusCode;
        this.details = details;
    }
}

/* -------------------------------------------------------------------------- */
/* GAQL fields                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Keep the ad query separate from the asset-library service. This query reads
 * ad_group_ad records and their creative payloads. Reusable assets and their
 * relationships/performance remain the responsibility of the asset services.
 *
 * Fields are based on the current Google Ads API ad_group_ad reporting schema.
 * Different ad formats populate different nested ad fields; the API returns
 * the populated branch for each row.
 */
const AD_FIELDS = [
    "campaign.id",
    "campaign.name",
    "ad_group.id",
    "ad_group.name",

    "ad_group_ad.resource_name",
    "ad_group_ad.status",
    "ad_group_ad.primary_status",
    "ad_group_ad.primary_status_reasons",
    "ad_group_ad.start_date_time",
    "ad_group_ad.end_date_time",
    "ad_group_ad.ad_strength",
    "ad_group_ad.action_items",
    "ad_group_ad.policy_summary.approval_status",
    "ad_group_ad.policy_summary.review_status",
    "ad_group_ad.policy_summary.policy_topic_entries",

    "ad_group_ad.ad.id",
    "ad_group_ad.ad.resource_name",
    "ad_group_ad.ad.name",
    "ad_group_ad.ad.type",
    "ad_group_ad.ad.added_by_google_ads",
    "ad_group_ad.ad.final_urls",
    "ad_group_ad.ad.final_mobile_urls",
    "ad_group_ad.ad.final_app_urls",
    "ad_group_ad.ad.display_url",
    "ad_group_ad.ad.tracking_url_template",
    "ad_group_ad.ad.device_preference",
    "ad_group_ad.ad.url_collections",
    "ad_group_ad.ad.url_custom_parameters",
    "ad_group_ad.ad.synthetic_content_info.advertiser_attestation.source",
    "ad_group_ad.ad.synthetic_content_info.advertiser_attestation.status",
    "ad_group_ad.ad.synthetic_content_info.system_attestation.source",
    "ad_group_ad.ad.synthetic_content_info.system_attestation.status",
    "ad_group_ad.ad.system_managed_resource_source",

    // Responsive Search, text and expanded text/dynamic search ads.
    "ad_group_ad.ad.responsive_search_ad.headlines",
    "ad_group_ad.ad.responsive_search_ad.descriptions",
    "ad_group_ad.ad.responsive_search_ad.path1",
    "ad_group_ad.ad.responsive_search_ad.path2",
    "ad_group_ad.ad.text_ad.headline",
    "ad_group_ad.ad.text_ad.description1",
    "ad_group_ad.ad.text_ad.description2",
    "ad_group_ad.ad.expanded_text_ad.headline_part1",
    "ad_group_ad.ad.expanded_text_ad.headline_part2",
    "ad_group_ad.ad.expanded_text_ad.headline_part3",
    "ad_group_ad.ad.expanded_text_ad.description",
    "ad_group_ad.ad.expanded_text_ad.description2",
    "ad_group_ad.ad.expanded_text_ad.path1",
    "ad_group_ad.ad.expanded_text_ad.path2",
    "ad_group_ad.ad.expanded_dynamic_search_ad.description",
    "ad_group_ad.ad.expanded_dynamic_search_ad.description2",

    // Display and image ads.
    "ad_group_ad.ad.responsive_display_ad.headlines",
    "ad_group_ad.ad.responsive_display_ad.long_headline",
    "ad_group_ad.ad.responsive_display_ad.descriptions",
    "ad_group_ad.ad.responsive_display_ad.business_name",
    "ad_group_ad.ad.responsive_display_ad.call_to_action_text",
    "ad_group_ad.ad.responsive_display_ad.marketing_images",
    "ad_group_ad.ad.responsive_display_ad.square_marketing_images",
    "ad_group_ad.ad.responsive_display_ad.logo_images",
    "ad_group_ad.ad.responsive_display_ad.square_logo_images",
    "ad_group_ad.ad.responsive_display_ad.youtube_videos",
    "ad_group_ad.ad.image_ad.image_asset.asset",
    "ad_group_ad.ad.image_ad.image_url",
    "ad_group_ad.ad.image_ad.mime_type",
    "ad_group_ad.ad.image_ad.name",
    "ad_group_ad.ad.image_ad.pixel_width",
    "ad_group_ad.ad.image_ad.pixel_height",
    "ad_group_ad.ad.image_ad.preview_image_url",

    // App campaign formats.
    "ad_group_ad.ad.app_ad.app_deep_link",
    "ad_group_ad.ad.app_ad.mandatory_ad_text",
    "ad_group_ad.ad.app_ad.headlines",
    "ad_group_ad.ad.app_ad.descriptions",
    "ad_group_ad.ad.app_ad.images",
    "ad_group_ad.ad.app_ad.youtube_videos",
    "ad_group_ad.ad.app_ad.html5_media_bundles",
    "ad_group_ad.ad.app_engagement_ad.headlines",
    "ad_group_ad.ad.app_engagement_ad.descriptions",
    "ad_group_ad.ad.app_engagement_ad.images",
    "ad_group_ad.ad.app_engagement_ad.videos",
    "ad_group_ad.ad.app_pre_registration_ad.headlines",
    "ad_group_ad.ad.app_pre_registration_ad.descriptions",
    "ad_group_ad.ad.app_pre_registration_ad.images",
    "ad_group_ad.ad.app_pre_registration_ad.youtube_videos",

    // Demand Gen formats.
    "ad_group_ad.ad.demand_gen_carousel_ad.business_name",
    "ad_group_ad.ad.demand_gen_carousel_ad.call_to_action_text",
    "ad_group_ad.ad.demand_gen_carousel_ad.carousel_cards",
    "ad_group_ad.ad.demand_gen_carousel_ad.description",
    "ad_group_ad.ad.demand_gen_carousel_ad.headline",
    "ad_group_ad.ad.demand_gen_carousel_ad.logo_image",
    "ad_group_ad.ad.demand_gen_product_ad.breadcrumb1",
    "ad_group_ad.ad.demand_gen_product_ad.breadcrumb2",
    "ad_group_ad.ad.demand_gen_product_ad.call_to_action",
    "ad_group_ad.ad.demand_gen_multi_asset_ad.business_name",
    "ad_group_ad.ad.demand_gen_multi_asset_ad.call_to_action_text",
    "ad_group_ad.ad.demand_gen_multi_asset_ad.descriptions",
    "ad_group_ad.ad.demand_gen_multi_asset_ad.headlines",
    "ad_group_ad.ad.demand_gen_multi_asset_ad.classic_display_images",
    "ad_group_ad.ad.demand_gen_multi_asset_ad.marketing_images",
    "ad_group_ad.ad.demand_gen_multi_asset_ad.portrait_marketing_images",
    "ad_group_ad.ad.demand_gen_multi_asset_ad.square_marketing_images",
    "ad_group_ad.ad.demand_gen_multi_asset_ad.tall_portrait_marketing_images",
    "ad_group_ad.ad.demand_gen_multi_asset_ad.logo_images",
    "ad_group_ad.ad.demand_gen_product_ad.business_name",
    "ad_group_ad.ad.demand_gen_product_ad.description",
    "ad_group_ad.ad.demand_gen_product_ad.headline",
    "ad_group_ad.ad.demand_gen_product_ad.logo_image",
    "ad_group_ad.ad.demand_gen_video_responsive_ad.breadcrumb1",
    "ad_group_ad.ad.demand_gen_video_responsive_ad.breadcrumb2",
    "ad_group_ad.ad.demand_gen_video_responsive_ad.business_name",
    "ad_group_ad.ad.demand_gen_video_responsive_ad.call_to_actions",
    "ad_group_ad.ad.demand_gen_video_responsive_ad.descriptions",
    "ad_group_ad.ad.demand_gen_video_responsive_ad.headlines",
    "ad_group_ad.ad.demand_gen_video_responsive_ad.long_headlines",
    "ad_group_ad.ad.demand_gen_video_responsive_ad.videos",
    "ad_group_ad.ad.demand_gen_video_responsive_ad.logo_images",
    "ad_group_ad.ad.demand_gen_video_responsive_ad.companion_banners",

    // Video formats.
    "ad_group_ad.ad.video_ad.audio",
    "ad_group_ad.ad.video_ad.video.asset",
    "ad_group_ad.ad.video_ad.bumper.companion_banner.asset",
    "ad_group_ad.ad.video_ad.in_stream.companion_banner.asset",
    "ad_group_ad.ad.video_ad.non_skippable.companion_banner.asset",
    "ad_group_ad.ad.video_ad.out_stream.description",
    "ad_group_ad.ad.video_ad.out_stream.headline",
    "ad_group_ad.ad.video_ad.in_feed.headline",
    "ad_group_ad.ad.video_ad.in_feed.description1",
    "ad_group_ad.ad.video_ad.in_feed.description2",
    "ad_group_ad.ad.video_ad.in_stream.action_headline",
    "ad_group_ad.ad.video_ad.in_stream.action_button_label",
    "ad_group_ad.ad.video_ad.bumper.action_headline",
    "ad_group_ad.ad.video_ad.bumper.action_button_label",
    "ad_group_ad.ad.video_ad.non_skippable.action_headline",
    "ad_group_ad.ad.video_ad.non_skippable.action_button_label",
    "ad_group_ad.ad.video_responsive_ad.breadcrumb1",
    "ad_group_ad.ad.video_responsive_ad.breadcrumb2",
    "ad_group_ad.ad.video_responsive_ad.business_name",
    "ad_group_ad.ad.video_responsive_ad.call_to_actions",
    "ad_group_ad.ad.video_responsive_ad.descriptions",
    "ad_group_ad.ad.video_responsive_ad.headlines",
    "ad_group_ad.ad.video_responsive_ad.long_headlines",
    "ad_group_ad.ad.video_responsive_ad.videos",
    "ad_group_ad.ad.video_responsive_ad.logo_images",
    "ad_group_ad.ad.video_responsive_ad.companion_banners",

    // Other legacy/vertical formats.
    "ad_group_ad.ad.legacy_responsive_display_ad.business_name",
    "ad_group_ad.ad.legacy_responsive_display_ad.call_to_action_text",
    "ad_group_ad.ad.legacy_responsive_display_ad.description",
    "ad_group_ad.ad.legacy_responsive_display_ad.long_headline",
    "ad_group_ad.ad.legacy_responsive_display_ad.short_headline",
    "ad_group_ad.ad.legacy_responsive_display_ad.marketing_image",
    "ad_group_ad.ad.legacy_responsive_display_ad.square_marketing_image",
    "ad_group_ad.ad.legacy_responsive_display_ad.logo_image",
    "ad_group_ad.ad.local_ad.headlines",
    "ad_group_ad.ad.local_ad.descriptions",
    "ad_group_ad.ad.local_ad.marketing_images",
    "ad_group_ad.ad.local_ad.logo_images",
    "ad_group_ad.ad.local_ad.videos",
    "ad_group_ad.ad.shopping_comparison_listing_ad.headline",
    "ad_group_ad.ad.shopping_product_ad",
    "ad_group_ad.ad.shopping_smart_ad",
    "ad_group_ad.ad.hotel_ad",
    "ad_group_ad.ad.travel_ad",
    "ad_group_ad.ad.legacy_app_install_ad",
    "ad_group_ad.ad.smart_campaign_ad.headlines",
    "ad_group_ad.ad.smart_campaign_ad.descriptions",
    "ad_group_ad.ad.display_upload_ad.media_bundle",
    "ad_group_ad.ad.display_upload_ad.display_upload_product_type",

    // Aggregate performance for the requested date range.
    "metrics.impressions",
    "metrics.clicks",
    "metrics.ctr",
    "metrics.cost_micros",
    "metrics.average_cpc",
    "metrics.average_cpm",
    "metrics.conversions",
    "metrics.conversions_value",
    "metrics.conversions_from_interactions_rate",
    "metrics.cost_per_conversion",
    "metrics.all_conversions",
    "metrics.all_conversions_value",
    "metrics.interactions",
    "metrics.interaction_rate",
    "metrics.engagements",
    "metrics.engagement_rate",
    "metrics.video_trueview_views",
    "metrics.video_trueview_view_rate",
    "metrics.video_quartile_p25_rate",
    "metrics.video_quartile_p50_rate",
    "metrics.video_quartile_p75_rate",
    "metrics.video_quartile_p100_rate",
    "metrics.view_through_conversions",
] as const;

/* -------------------------------------------------------------------------- */
/* General helpers                                                            */
/* -------------------------------------------------------------------------- */

function asRecord(value: unknown): UnknownRecord {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as UnknownRecord)
        : {};
}

function getRecord(value: UnknownRecord, key: string): UnknownRecord {
    return asRecord(value[key]);
}

function normalizeString(value: unknown): string | null {
    if (typeof value !== "string" && typeof value !== "number") {
        return null;
    }

    const normalized = String(value).trim();
    return normalized || null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
    return [...new Set(values.map((value) => value?.trim()).filter(
        (value): value is string => Boolean(value),
    ))];
}

function normalizeNumber(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMicros(value: unknown): string {
    const normalized = normalizeString(value);
    return normalized && /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : "0";
}

function extractTextValues(value: unknown): string[] {
    if (typeof value === "string") {
        return value.trim() ? [value.trim()] : [];
    }

    if (Array.isArray(value)) {
        return value.flatMap(extractTextValues);
    }

    const record = asRecord(value);
    if (Object.keys(record).length === 0) {
        return [];
    }

    const text = normalizeString(record.text);
    if (text) {
        return [text];
    }

    return [];
}

function collectAssetResourceNames(value: unknown): string[] {
    const found: string[] = [];
    const visited = new Set<object>();

    const visit = (current: unknown): void => {
        if (!current || typeof current !== "object") return;
        if (visited.has(current)) return;
        visited.add(current);

        if (Array.isArray(current)) {
            current.forEach(visit);
            return;
        }

        for (const [key, child] of Object.entries(current as UnknownRecord)) {
            if (
                key.toLowerCase().includes("asset") &&
                typeof child === "string" &&
                child.includes("/assets/")
            ) {
                found.push(child);
            } else {
                visit(child);
            }
        }
    };

    visit(value);
    return uniqueStrings(found);
}

function validateNumericId(value: string | undefined, fieldName: string): string | undefined {
    if (value === undefined || value.trim() === "") return undefined;
    const normalized = value.trim();

    if (!/^\d+$/.test(normalized)) {
        throw new GoogleAdsAdServiceError(`${fieldName} must contain digits only.`, 400);
    }

    return normalized;
}

function validateDate(value: string, fieldName: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new GoogleAdsAdServiceError(`${fieldName} must use YYYY-MM-DD format.`, 400);
    }

    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw new GoogleAdsAdServiceError(`${fieldName} is not a valid calendar date.`, 400);
    }

    return value;
}

/* -------------------------------------------------------------------------- */
/* GAQL query builder                                                         */
/* -------------------------------------------------------------------------- */

function buildMetricsDateFilter(
    dateRange: ListGoogleAdsInput["metricsDateRange"],
): { value: string; where: string | null } {
    const selected = dateRange ?? "LAST_30_DAYS";

    if (typeof selected === "string") {
        const allowed: GoogleAdsMetricsDateRange[] = [
            "TODAY",
            "YESTERDAY",
            "LAST_7_DAYS",
            "LAST_14_DAYS",
            "LAST_30_DAYS",
            "THIS_MONTH",
            "LAST_MONTH",
            "ALL_TIME",
        ];

        if (!allowed.includes(selected)) {
            throw new GoogleAdsAdServiceError("Unsupported metrics date range.", 400);
        }

        return {
            value: selected,
            where: selected === "ALL_TIME" ? null : `segments.date DURING ${selected}`,
        };
    }

    const startDate = validateDate(selected.startDate, "startDate");
    const endDate = validateDate(selected.endDate, "endDate");

    if (startDate > endDate) {
        throw new GoogleAdsAdServiceError("startDate must be before or equal to endDate.", 400);
    }

    return {
        value: `${startDate}..${endDate}`,
        where: `segments.date BETWEEN '${startDate}' AND '${endDate}'`,
    };
}

function buildAdsQuery(input: ListGoogleAdsInput): {
    query: string;
    metricsDateRange: string;
} {
    const where: string[] = [];
    const campaignId = validateNumericId(input.campaignId, "campaignId");
    const adGroupId = validateNumericId(input.adGroupId, "adGroupId");
    const adId = validateNumericId(input.adId, "adId");

    if (!input.includeRemoved && input.status !== "REMOVED") {
        where.push("ad_group_ad.status != 'REMOVED'");
    }

    if (campaignId) where.push(`campaign.id = ${campaignId}`);
    if (adGroupId) where.push(`ad_group.id = ${adGroupId}`);
    if (adId) where.push(`ad_group_ad.ad.id = ${adId}`);

    if (input.status) {
        const allowed: GoogleAdsAdStatus[] = ["ENABLED", "PAUSED", "REMOVED"];
        if (!allowed.includes(input.status)) {
            throw new GoogleAdsAdServiceError("Invalid ad status filter.", 400);
        }
        where.push(`ad_group_ad.status = '${input.status}'`);
    }

    if (input.types?.length) {
        const types = [...new Set(input.types.map((type) => type.trim().toUpperCase()))];
        if (types.some((type) => !/^[A-Z][A-Z0-9_]*$/.test(type))) {
            throw new GoogleAdsAdServiceError("Ad types must be valid Google Ads enum names.", 400);
        }
        where.push(`ad_group_ad.ad.type IN (${types.map((type) => `'${type}'`).join(", ")})`);
    }

    if (input.adStrength) {
        const allowed: GoogleAdsAdStrength[] = [
            "PENDING", "NO_ADS", "POOR", "AVERAGE", "GOOD", "EXCELLENT",
        ];
        if (!allowed.includes(input.adStrength)) {
            throw new GoogleAdsAdServiceError("Invalid ad strength filter.", 400);
        }
        where.push(`ad_group_ad.ad_strength = '${input.adStrength}'`);
    }

    if (input.approvalStatus) {
        const allowed: GoogleAdsApprovalStatus[] = [
            "APPROVED", "APPROVED_LIMITED", "DISAPPROVED", "AREA_OF_INTEREST_ONLY", "UNKNOWN",
        ];
        if (!allowed.includes(input.approvalStatus)) {
            throw new GoogleAdsAdServiceError("Invalid approval status filter.", 400);
        }
        where.push(`ad_group_ad.policy_summary.approval_status = '${input.approvalStatus}'`);
    }

    const dateFilter = buildMetricsDateFilter(input.metricsDateRange);
    if (dateFilter.where) where.push(dateFilter.where);

    const query = [
        `SELECT ${AD_FIELDS.join(", ")}`,
        "FROM ad_group_ad",
        where.length ? `WHERE ${where.join(" AND ")}` : "",
        "ORDER BY ad_group_ad.ad.id",
    ].filter(Boolean).join(" ");

    return { query, metricsDateRange: dateFilter.value };
}

/* -------------------------------------------------------------------------- */
/* Google Ads API request                                                     */
/* -------------------------------------------------------------------------- */

async function searchGoogleAds<T>(
    context: GoogleAdsCreationContext,
    query: string,
    pageToken?: string,
): Promise<T> {
    const url =
        `https://googleads.googleapis.com/${context.apiVersion}/customers/` +
        `${context.customerId}/googleAds:search`;

    const body: { query: string; pageToken?: string } = { query };
    if (pageToken) body.pageToken = pageToken;

    let response: Response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${context.accessToken}`,
                "Content-Type": "application/json",
                "developer-token": context.developerToken,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        });
    } catch (error) {
        throw new GoogleAdsAdServiceError(
            error instanceof Error
                ? `Unable to connect to Google Ads: ${error.message}`
                : "Unable to connect to Google Ads.",
            502,
        );
    }

    const responseText = await response.text();
    let responseData: T | GoogleAdsErrorResponse;

    try {
        responseData = responseText ? JSON.parse(responseText) : ({} as T);
    } catch {
        throw new GoogleAdsAdServiceError(
            "Google Ads returned an invalid JSON response.",
            502,
            {
                responseText: responseText.slice(0, 1000),
                requestId: response.headers.get("request-id"),
            },
        );
    }

    if (!response.ok) {
        const googleError = (responseData as GoogleAdsErrorResponse).error;
        const details = {
            googleError: googleError ?? responseData,
            requestId: response.headers.get("request-id"),
            query,
        };

        console.error("Google Ads ad search failed:", JSON.stringify(details, null, 2));

        throw new GoogleAdsAdServiceError(
            googleError?.message ?? `Google Ads request failed with status ${response.status}.`,
            response.status >= 400 && response.status < 600 ? response.status : 502,
            details,
        );
    }

    return responseData as T;
}

/* -------------------------------------------------------------------------- */
/* Normalization                                                              */
/* -------------------------------------------------------------------------- */

function getNestedValue(root: UnknownRecord, path: string): unknown {
    return path.split(".").reduce<unknown>(
        (current, key) => asRecord(current)[key],
        root,
    );
}

function collectFields(root: UnknownRecord, paths: string[]): string[] {
    return uniqueStrings(paths.flatMap((path) => extractTextValues(
        getNestedValue(root, path),
    )));
}

function normalizeMetrics(value: unknown): GoogleAdsAdMetrics {
    const metrics = asRecord(value);

    return {
        impressions: normalizeNumber(metrics.impressions),
        clicks: normalizeNumber(metrics.clicks),
        ctr: normalizeNumber(metrics.ctr),
        costMicros: normalizeMicros(metrics.costMicros),
        averageCpcMicros: normalizeMicros(metrics.averageCpc),
        averageCpmMicros: normalizeMicros(metrics.averageCpm),
        conversions: normalizeNumber(metrics.conversions),
        conversionsValue: normalizeNumber(metrics.conversionsValue),
        conversionsFromInteractionsRate: normalizeNumber(metrics.conversionsFromInteractionsRate),
        costPerConversionMicros: normalizeMicros(metrics.costPerConversion),
        allConversions: normalizeNumber(metrics.allConversions),
        allConversionsValue: normalizeNumber(metrics.allConversionsValue),
        interactions: normalizeNumber(metrics.interactions),
        interactionRate: normalizeNumber(metrics.interactionRate),
        engagements: normalizeNumber(metrics.engagements),
        engagementRate: normalizeNumber(metrics.engagementRate),
        videoViews: normalizeNumber(metrics.videoTrueviewViews),
        videoViewRate: normalizeNumber(metrics.videoTrueviewViewRate),
        videoQuartile25Rate: normalizeNumber(metrics.videoQuartileP25Rate),
        videoQuartile50Rate: normalizeNumber(metrics.videoQuartileP50Rate),
        videoQuartile75Rate: normalizeNumber(metrics.videoQuartileP75Rate),
        videoQuartile100Rate: normalizeNumber(metrics.videoQuartileP100Rate),
        viewThroughConversions: normalizeNumber(metrics.viewThroughConversions),
    };
}

function normalizeAd(
    row: GoogleAdsAdSearchRow,
    accountId: string,
): GoogleAdsAd | null {
    const adGroupAd = asRecord(row.adGroupAd);
    const ad = asRecord(adGroupAd.ad);
    const campaign = asRecord(row.campaign);
    const adGroup = asRecord(row.adGroup);
    const policy = asRecord(adGroupAd.policySummary);

    const id = normalizeString(ad.id);
    if (!id) return null;

    const headlines = collectFields(ad, [
        "responsiveSearchAd.headlines",
        "responsiveDisplayAd.headlines",
        "appAd.headlines",
        "appEngagementAd.headlines",
        "appPreRegistrationAd.headlines",
        "demandGenCarouselAd.headline",
        "demandGenMultiAssetAd.headlines",
        "demandGenProductAd.headline",
        "demandGenVideoResponsiveAd.headlines",
        "videoResponsiveAd.headlines",
        "localAd.headlines",
        "smartCampaignAd.headlines",
        "textAd.headline",
        "expandedTextAd.headlinePart1",
        "expandedTextAd.headlinePart2",
        "expandedTextAd.headlinePart3",
        "videoAd.inFeed.headline",
        "videoAd.outStream.headline",
        "shoppingComparisonListingAd.headline",
        "legacyResponsiveDisplayAd.shortHeadline",
    ]);

    const longHeadlines = collectFields(ad, [
        "responsiveDisplayAd.longHeadline",
        "legacyResponsiveDisplayAd.longHeadline",
        "demandGenVideoResponsiveAd.longHeadlines",
        "videoResponsiveAd.longHeadlines",
    ]);

    const descriptions = collectFields(ad, [
        "responsiveSearchAd.descriptions",
        "responsiveDisplayAd.descriptions",
        "appAd.descriptions",
        "appEngagementAd.descriptions",
        "appPreRegistrationAd.descriptions",
        "demandGenCarouselAd.description",
        "demandGenMultiAssetAd.descriptions",
        "demandGenProductAd.description",
        "demandGenVideoResponsiveAd.descriptions",
        "videoResponsiveAd.descriptions",
        "localAd.descriptions",
        "smartCampaignAd.descriptions",
        "textAd.description1",
        "textAd.description2",
        "expandedTextAd.description",
        "expandedTextAd.description2",
        "expandedDynamicSearchAd.description",
        "expandedDynamicSearchAd.description2",
        "videoAd.inFeed.description1",
        "videoAd.inFeed.description2",
        "videoAd.outStream.description",
        "legacyResponsiveDisplayAd.description",
    ]);

    const callToActions = collectFields(ad, [
        "responsiveDisplayAd.callToActionText",
        "demandGenCarouselAd.callToActionText",
        "demandGenMultiAssetAd.callToActionText",
        "demandGenProductAd.callToAction",
        "demandGenVideoResponsiveAd.callToActions",
        "videoResponsiveAd.callToActions",
        "legacyResponsiveDisplayAd.callToActionText",
        "videoAd.inStream.actionButtonLabel",
        "videoAd.bumper.actionButtonLabel",
        "videoAd.nonSkippable.actionButtonLabel",
    ]);

    const businessNames = collectFields(ad, [
        "responsiveDisplayAd.businessName",
        "demandGenCarouselAd.businessName",
        "demandGenMultiAssetAd.businessName",
        "demandGenProductAd.businessName",
        "demandGenVideoResponsiveAd.businessName",
        "videoResponsiveAd.businessName",
        "legacyResponsiveDisplayAd.businessName",
    ]);

    const responsiveSearch = getRecord(ad, "responsiveSearchAd");
    const expandedText = getRecord(ad, "expandedTextAd");
    const assetResourceNames = collectAssetResourceNames(ad);

    const policyTopics = Array.isArray(policy.policyTopicEntries)
        ? policy.policyTopicEntries.map((entry) => {
            const topic = asRecord(entry);
            return {
                topic: normalizeString(topic.topic),
                type: normalizeString(topic.type),
            };
        })
        : [];

    return {
        provider: "googleAds",
        accountId,

        id,
        resourceName: normalizeString(adGroupAd.resourceName),
        adResourceName: normalizeString(ad.resourceName),
        name: normalizeString(ad.name),
        type: normalizeString(ad.type),

        campaignId: normalizeString(campaign.id),
        campaignName: normalizeString(campaign.name),
        adGroupId: normalizeString(adGroup.id),
        adGroupName: normalizeString(adGroup.name),

        status: normalizeString(adGroupAd.status),
        primaryStatus: normalizeString(adGroupAd.primaryStatus),
        primaryStatusReasons: Array.isArray(adGroupAd.primaryStatusReasons)
            ? adGroupAd.primaryStatusReasons
                .map(normalizeString)
                .filter((value): value is string => Boolean(value))
            : [],
        startDateTime: normalizeString(adGroupAd.startDateTime),
        endDateTime: normalizeString(adGroupAd.endDateTime),

        adStrength: normalizeString(adGroupAd.adStrength),
        actionItems: Array.isArray(adGroupAd.actionItems)
            ? adGroupAd.actionItems
                .map(normalizeString)
                .filter((value): value is string => Boolean(value))
            : [],
        approvalStatus: normalizeString(policy.approvalStatus),
        reviewStatus: normalizeString(policy.reviewStatus),
        policyTopics,
        addedByGoogle: ad.addedByGoogleAds === true,

        finalUrls: Array.isArray(ad.finalUrls)
            ? ad.finalUrls.map(normalizeString).filter((value): value is string => Boolean(value))
            : [],
        finalMobileUrls: Array.isArray(ad.finalMobileUrls)
            ? ad.finalMobileUrls.map(normalizeString).filter((value): value is string => Boolean(value))
            : [],
        displayUrl: normalizeString(ad.displayUrl),
        trackingUrlTemplate: normalizeString(ad.trackingUrlTemplate),

        headlines,
        longHeadlines,
        descriptions,
        callToActions,
        businessNames,
        path1: normalizeString(responsiveSearch.path1 ?? expandedText.path1),
        path2: normalizeString(responsiveSearch.path2 ?? expandedText.path2),
        assetResourceNames,
        linkedAssets: [],

        creativeDetails: ad,
        metrics: normalizeMetrics(row.metrics),
    };
}

/* -------------------------------------------------------------------------- */
/* Resolve linked Google Ads Asset resources                                  */
/* -------------------------------------------------------------------------- */

interface GoogleAdsAssetLookupResponse {
    results?: Array<{ asset?: UnknownRecord }>;
}

/**
 * `assetResourceNames` are resource identifiers, not image URLs. Resolve the
 * referenced Asset records on the server using the same authenticated
 * customer context, then return a normalized representation for the UI.
 *
 * Google exposes different fields for IMAGE, YOUTUBE_VIDEO, TEXT, CTA and
 * extension assets. These are selected together from the Asset resource; the
 * selected union branch is populated for the asset's actual type.
 */
async function attachGoogleAdsLinkedAssets(
    context: GoogleAdsCreationContext,
    ads: GoogleAdsAd[],
): Promise<GoogleAdsAd[]> {
    const expectedPrefix = `customers/${context.customerId}/assets/`;
    const resourceNames = uniqueStrings(
        ads.flatMap((ad) => ad.assetResourceNames),
    ).filter((name) => name.startsWith(expectedPrefix));

    const ids = uniqueStrings(resourceNames.map((resourceName) => {
        const id = resourceName.slice(expectedPrefix.length);
        return /^\d+$/.test(id) ? id : null;
    }));

    const unresolved = (resourceName: string): GoogleAdsLinkedAsset => ({
        id: resourceName.split("/").at(-1) ?? null,
        resourceName,
        name: null,
        type: "UNRESOLVED",
        mediaUrl: null,
        thumbnailUrl: null,
        videoId: null,
        textContent: null,
        callToAction: null,
        mimeType: null,
        width: null,
        height: null,
        finalUrls: [],
        sourcePath: "ads[].assetResourceNames[] → Asset resource lookup",
        resolutionError: null,
        details: {},
    });

    if (!ids.length) {
        return ads.map((ad) => ({ ...ad, linkedAssets: [] }));
    }

    // IDs are validated numeric values extracted from resource names belonging
    // to the selected customer. Never accept arbitrary GAQL fragments.
    const query = [
        "SELECT",
        [
            "asset.id",
            "asset.resource_name",
            "asset.name",
            "asset.type",
            "asset.final_urls",
            "asset.image_asset.mime_type",
            "asset.image_asset.file_size",
            "asset.image_asset.full_size.url",
            "asset.image_asset.full_size.width_pixels",
            "asset.image_asset.full_size.height_pixels",
            "asset.youtube_video_asset.youtube_video_id",
            "asset.youtube_video_asset.youtube_video_title",
            "asset.text_asset.text",
            "asset.call_to_action_asset.call_to_action",
            "asset.callout_asset.callout_text",
            "asset.sitelink_asset.link_text",
            "asset.sitelink_asset.description1",
            "asset.sitelink_asset.description2",
            "asset.structured_snippet_asset.header",
            "asset.structured_snippet_asset.values",
            "asset.promotion_asset.promotion_target",
            "asset.promotion_asset.promotion_code",
            "asset.promotion_asset.percent_off",
            "asset.promotion_asset.money_amount_off.amount_micros",
            "asset.promotion_asset.money_amount_off.currency_code",
            "asset.promotion_asset.occasion",
            "asset.promotion_asset.redemption_start_date",
            "asset.promotion_asset.redemption_end_date",
            "asset.promotion_asset.terms_and_conditions_text",
            "asset.price_asset.type",
            "asset.price_asset.price_qualifier",
            "asset.price_asset.price_offerings",
            "asset.call_asset.phone_number",
            "asset.call_asset.country_code",
            "asset.lead_form_asset.business_name",
            "asset.lead_form_asset.call_to_action_description",
            "asset.lead_form_asset.call_to_action_type",
            "asset.lead_form_asset.description",
            "asset.lead_form_asset.headline",
            "asset.lead_form_asset.privacy_policy_url",
            "asset.hotel_callout_asset.text",
            "asset.hotel_callout_asset.language_code",
            "asset.hotel_property_asset.hotel_name",
            "asset.hotel_property_asset.hotel_address",
            "asset.hotel_property_asset.place_id",
            "asset.demand_gen_carousel_card_asset.headline",
            "asset.demand_gen_carousel_card_asset.call_to_action_text",
            "asset.demand_gen_carousel_card_asset.marketing_image_asset",
            "asset.demand_gen_carousel_card_asset.portrait_marketing_image_asset",
            "asset.demand_gen_carousel_card_asset.square_marketing_image_asset",
        ].join(", "),
        "FROM asset",
        `WHERE asset.id IN (${ids.join(", ")})`,
    ].join(" ");

    let assetsByResourceName = new Map<string, GoogleAdsLinkedAsset>();
    let assetLookupError: string | null = null;
    try {
        const result = await searchGoogleAds<GoogleAdsAssetLookupResponse>(context, query);
        assetsByResourceName = new Map(
            (result.results ?? []).flatMap((row) => {
                const asset = asRecord(row.asset);
                const resourceName = normalizeString(asset.resourceName);
                const id = normalizeString(asset.id);
                const type = normalizeString(asset.type);
                if (!resourceName || !type) return [];

                const image = getRecord(asset, "imageAsset");
                const fullSize = getRecord(image, "fullSize");
                const video = getRecord(asset, "youtubeVideoAsset");
                const text = getRecord(asset, "textAsset");
                const cta = getRecord(asset, "callToActionAsset");
                const callout = getRecord(asset, "calloutAsset");
                const sitelink = getRecord(asset, "sitelinkAsset");
                const snippet = getRecord(asset, "structuredSnippetAsset");
                const promotion = getRecord(asset, "promotionAsset");
                const price = getRecord(asset, "priceAsset");
                const callAsset = getRecord(asset, "callAsset");
                const leadForm = getRecord(asset, "leadFormAsset");
                const hotelCallout = getRecord(asset, "hotelCalloutAsset");
                const hotelProperty = getRecord(asset, "hotelPropertyAsset");
                const carousel = getRecord(asset, "demandGenCarouselCardAsset");
                const priceOfferings = Array.isArray(price.priceOfferings) ? price.priceOfferings : [];
                const priceSummary = priceOfferings.map((item) => {
                    const offering = asRecord(item);
                    const amount = asRecord(offering.price);
                    const micros = Number(amount.amountMicros);
                    const amountText = Number.isFinite(micros)
                        ? `${(micros / 1_000_000).toFixed(2)} ${normalizeString(amount.currencyCode) ?? ""}`.trim()
                        : null;
                    return [normalizeString(offering.header), normalizeString(offering.description), amountText]
                        .filter((part): part is string => Boolean(part))
                        .join(" · ");
                }).filter(Boolean).join(" | ");
                const rawFinalUrls = Array.isArray(asset.finalUrls) ? asset.finalUrls : [];
                const finalUrls = rawFinalUrls
                    .map(normalizeString)
                    .filter((value): value is string => Boolean(value));
                const mediaUrl = normalizeString(fullSize.url);

                const mapped: GoogleAdsLinkedAsset = {
                    id,
                    resourceName,
                    name: normalizeString(asset.name)
                        ?? normalizeString(text.text)
                        ?? normalizeString(callout.calloutText)
                        ?? normalizeString(sitelink.linkText)
                        ?? normalizeString(promotion.promotionTarget)
                        ?? normalizeString(leadForm.headline)
                        ?? normalizeString(hotelCallout.text)
                        ?? normalizeString(hotelProperty.hotelName)
                        ?? normalizeString(carousel.headline),
                    type,
                    mediaUrl: mediaUrl && /^https:\/\//i.test(mediaUrl) ? mediaUrl : null,
                    thumbnailUrl: mediaUrl && /^https:\/\//i.test(mediaUrl) ? mediaUrl : null,
                    videoId: normalizeString(video.youtubeVideoId),
                    textContent: normalizeString(text.text)
                        ?? normalizeString(callout.calloutText)
                        ?? normalizeString(sitelink.linkText)
                        ?? normalizeString(snippet.header)
                        ?? normalizeString(promotion.promotionTarget)
                        ?? normalizeString(leadForm.headline)
                        ?? normalizeString(hotelCallout.text)
                        ?? (priceSummary || null),
                    callToAction: normalizeString(cta.callToAction)
                        ?? normalizeString(carousel.callToActionText)
                        ?? normalizeString(leadForm.callToActionDescription),
                    mimeType: normalizeString(image.mimeType),
                    width: normalizeNumber(fullSize.widthPixels) || null,
                    height: normalizeNumber(fullSize.heightPixels) || null,
                    finalUrls,
                    sourcePath: ({
                        IMAGE: "asset.image_asset.full_size.url",
                        YOUTUBE_VIDEO: "asset.youtube_video_asset.youtube_video_id",
                        TEXT: "asset.text_asset.text",
                        CALL_TO_ACTION: "asset.call_to_action_asset.call_to_action",
                        CALLOUT: "asset.callout_asset.callout_text",
                        SITELINK: "asset.sitelink_asset.link_text",
                        STRUCTURED_SNIPPET: "asset.structured_snippet_asset.header",
                        PROMOTION: "asset.promotion_asset.promotion_target",
                        PRICE: "asset.price_asset.price_offerings",
                        CALL: "asset.call_asset.phone_number",
                        LEAD_FORM: "asset.lead_form_asset.headline",
                        HOTEL_CALLOUT: "asset.hotel_callout_asset.text",
                        HOTEL_PROPERTY: "asset.hotel_property_asset.hotel_name",
                        DEMAND_GEN_CAROUSEL_CARD: "asset.demand_gen_carousel_card_asset.headline",
                    } as Record<string, string>)[type] ?? "asset.*_asset.*",
                    resolutionError: null,
                    details: asset,
                };
                return [[resourceName, mapped] as const];
            }),
        );
    } catch (error) {
        // Asset enrichment is intentionally non-fatal: ads and provider payloads
        // should still be visible when Google denies an optional Asset lookup.
        assetLookupError = error instanceof Error ? error.message : "Google Ads asset lookup failed.";
        console.warn(
            "Google Ads linked asset resolution failed:",
            assetLookupError,
        );
    }

    return ads.map((ad) => ({
        ...ad,
        linkedAssets: ad.assetResourceNames.map((resourceName) => {
            const resolved = assetsByResourceName.get(resourceName);
            return resolved ?? {
                ...unresolved(resourceName),
                resolutionError: assetLookupError,
            };
        }),
    }));
}

/* -------------------------------------------------------------------------- */
/* Main service                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Lists ads owned by the connected Google Ads customer account.
 *
 * - Uses the same OAuth/account context pattern as the existing asset service.
 * - Returns one Google Ads Search page and its nextPageToken.
 * - Does not impose an arbitrary maximum page count.
 * - Includes common creative content for available ad formats and preserves
 *   the complete selected format payload in creativeDetails.
 * - Includes aggregate metrics for the requested date range (LAST_30_DAYS by
 *   default). For day-by-day trend rows, use a separate report query with
 *   segments.date.
 * - Performance Max asset groups are not ad_group_ad records; keep collecting
 *   those through the existing asset-group/asset service.
 *
 * Account ownership and selected-account authorization should be validated
 * by the caller before invoking this service, just as in the asset service.
 */
export async function listGoogleAds(
    userId: string,
    accountId: string,
    input: ListGoogleAdsInput = {},
): Promise<ListGoogleAdsResult> {
    if (!userId?.trim()) {
        throw new GoogleAdsAdServiceError("Authenticated user ID is required.", 401);
    }

    if (!accountId?.trim()) {
        throw new GoogleAdsAdServiceError("Google Ads customer ID is required.", 400);
    }

    const pageToken = input.pageToken?.trim();
    if (pageToken && pageToken.length > 10000) {
        throw new GoogleAdsAdServiceError("Google Ads page token is invalid or too long.", 400);
    }

    const context = await getGoogleAdsCreationContext(userId, accountId);
    const { query, metricsDateRange } = buildAdsQuery(input);
    const page = await searchGoogleAds<GoogleAdsSearchResponse>(context, query, pageToken);

    const normalizedAds = (page.results ?? [])
        .map((row) => normalizeAd(row, context.customerId))
        .filter((ad): ad is GoogleAdsAd => ad !== null);
    const ads = await attachGoogleAdsLinkedAssets(context, normalizedAds);

    return {
        provider: "googleAds",
        accountId: context.customerId,
        metricsDateRange,
        ads,
        nextPageToken: page.nextPageToken ?? null,
    };
}

/**
 * Lists the ad groups belonging to one campaign in the user's selected Google
 * Ads customer. This uses GAQL's ad_group resource; Performance Max campaigns
 * use asset groups instead and should be loaded through the asset-group flow.
 */
export async function listGoogleAdsAdGroups(
    userId: string,
    accountId: string,
    campaignId: string,
    pageToken?: string,
): Promise<ListGoogleAdsAdGroupsResult> {
    if (!userId?.trim()) {
        throw new GoogleAdsAdServiceError("Authenticated user ID is required.", 401);
    }
    if (!accountId?.trim()) {
        throw new GoogleAdsAdServiceError("Google Ads customer ID is required.", 400);
    }

    const normalizedCampaignId = validateNumericId(campaignId, "campaignId");
    if (!normalizedCampaignId) {
        throw new GoogleAdsAdServiceError("A valid numeric campaignId is required.", 400);
    }
    if (pageToken && pageToken.length > 10000) {
        throw new GoogleAdsAdServiceError("Google Ads page token is invalid or too long.", 400);
    }

    const context = await getGoogleAdsCreationContext(userId, accountId);
    const query = [
        "SELECT campaign.id, campaign.name, ad_group.id, ad_group.resource_name,",
        "ad_group.name, ad_group.status, ad_group.type,",
        "metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros",
        "FROM ad_group",
        `WHERE campaign.id = ${normalizedCampaignId}`,
        "AND ad_group.status != 'REMOVED'",
        "AND segments.date DURING LAST_30_DAYS",
        "ORDER BY ad_group.name",
    ].join(" ");

    const page = await searchGoogleAds<{
        results?: Array<{
            campaign?: UnknownRecord;
            adGroup?: UnknownRecord;
            metrics?: UnknownRecord;
        }>;
        nextPageToken?: string;
    }>(context, query, pageToken);

    const adGroups = (page.results ?? []).flatMap((row) => {
        const group = asRecord(row.adGroup);
        const campaign = asRecord(row.campaign);
        const metrics = asRecord(row.metrics);
        const id = normalizeString(group.id);
        if (!id) return [];
        return [{
            id,
            resourceName: normalizeString(group.resourceName),
            name: normalizeString(group.name),
            status: normalizeString(group.status),
            type: normalizeString(group.type),
            campaignId: normalizeString(campaign.id) ?? normalizedCampaignId,
            campaignName: normalizeString(campaign.name),
            metrics: {
                impressions: normalizeNumber(metrics.impressions),
                clicks: normalizeNumber(metrics.clicks),
                ctr: normalizeNumber(metrics.ctr),
                costMicros: normalizeMicros(metrics.costMicros),
            },
        }];
    });

    return {
        provider: "googleAds",
        accountId: context.customerId,
        campaignId: normalizedCampaignId,
        adGroups,
        nextPageToken: page.nextPageToken ?? null,
    };
}

