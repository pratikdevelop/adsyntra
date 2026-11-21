import { getGoogleAdsCreationContext } from "../googleadsAPI/services/campaign-creation.js";
import { getProviderAccessToken } from "../utils/provider-token.utils.js";

export type OverviewRange = "7d" | "30d" | "90d";
export type OverviewProvider = "googleAds" | "metaAds";

export interface OverviewDateRange {
    since: string;
    until: string;
}

export interface OverviewAccount {
    id: string;
    name: string;
    currency: string | null;
}

export interface OverviewMetrics {
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    conversionValue: number;
    reach: number;
    linkClicks: number;
    ctr: number;
    cpc: number;
    cpa: number;
    roas: number;
}

export interface OverviewTrendPoint {
    date: string;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    conversionValue: number;
    reach: number;
    linkClicks: number;
}

export interface OverviewCampaign {
    id: string;
    name: string;
    provider: OverviewProvider;
    status: string | null;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    conversionValue: number;
    ctr: number;
    roas: number;
    currency: string | null;
}

export interface OverviewSearchTerm {
    term: string;
    campaignName: string;
    adGroupName: string;
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
    conversionValue: number;
    ctr: number;
}

export interface OverviewConversionAction {
    name: string;
    category: string;
    conversions: number;
    conversionValue: number;
    // Google Ads does not expose campaign spend segmented by conversion action.
    spend: number | null;
    costPerConversion: number | null;
    roas: number | null;
}

export interface OverviewAdGroup {
    id: string;
    name: string;
    campaignName: string;
    status: string | null;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    currency: string | null;
}

export interface OverviewBreakdownRow {
    dimension: string;
    label: string;
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    conversions: number;
    ctr: number;
}

export interface OverviewActionType {
    actionType: string;
    value: number;
}

export interface OverviewProviderDetails {
    previousPeriod: OverviewMetrics;
    searchTerms: OverviewSearchTerm[];
    negativeCandidates: OverviewSearchTerm[];
    conversionActions: OverviewConversionAction[];
    adGroups: OverviewAdGroup[];
    adSets: OverviewCampaign[];
    ads: OverviewCampaign[];
    actionTypes: OverviewActionType[];
    demographics: OverviewBreakdownRow[];
    placements: OverviewBreakdownRow[];
    countries: OverviewBreakdownRow[];
}

export interface ProviderOverviewData {
    currency: string | null;
    metrics: OverviewMetrics;
    trend: OverviewTrendPoint[];
    campaigns: OverviewCampaign[];
    details: OverviewProviderDetails;
    partial: boolean;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as UnknownRecord
        : {};
}

function nestedRecord(root: UnknownRecord, key: string): UnknownRecord {
    return asRecord(root[key]);
}

function numberValue(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown): string | null {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const normalized = String(value).trim();
    return normalized || null;
}

function round(value: number, digits = 2): number {
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

function emptyMetrics(): OverviewMetrics {
    return {
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        conversionValue: 0,
        reach: 0,
        linkClicks: 0,
        ctr: 0,
        cpc: 0,
        cpa: 0,
        roas: 0,
    };
}

function calculateRates(metrics: OverviewMetrics): OverviewMetrics {
    return {
        ...metrics,
        ctr: metrics.impressions > 0
            ? round((metrics.clicks / metrics.impressions) * 100)
            : 0,
        cpc: metrics.clicks > 0 ? round(metrics.spend / metrics.clicks) : 0,
        cpa: metrics.conversions > 0
            ? round(metrics.spend / metrics.conversions)
            : 0,
        roas: metrics.spend > 0
            ? round(metrics.conversionValue / metrics.spend)
            : 0,
    };
}

function metricsFromGoogleRow(row: UnknownRecord): OverviewMetrics {
    const source = nestedRecord(row, "metrics");
    const spend = numberValue(source.costMicros) / 1_000_000;
    const metrics = {
        ...emptyMetrics(),
        spend,
        impressions: numberValue(source.impressions),
        clicks: numberValue(source.clicks),
        conversions: numberValue(source.conversions),
        conversionValue: numberValue(source.conversionsValue),
    };
    return calculateRates(metrics);
}

function metricsFromMetaRow(row: UnknownRecord): OverviewMetrics {
    const spend = numberValue(row.spend);
    const actions = Array.isArray(row.actions) ? row.actions : [];
    const actionValues = Array.isArray(row.action_values) ? row.action_values : [];
    const conversions = metaConversions(actions);
    const conversionValue = metaConversionValue(actionValues);
    const metrics = {
        ...emptyMetrics(),
        spend,
        impressions: numberValue(row.impressions),
        clicks: numberValue(row.clicks),
        conversions,
        conversionValue,
        reach: numberValue(row.reach),
        linkClicks: numberValue(row.inline_link_clicks),
    };
    return calculateRates(metrics);
}

function sumMetrics(rows: OverviewMetrics[]): OverviewMetrics {
    const totals = rows.reduce((sum, item) => ({
        ...sum,
        spend: sum.spend + item.spend,
        impressions: sum.impressions + item.impressions,
        clicks: sum.clicks + item.clicks,
        conversions: sum.conversions + item.conversions,
        conversionValue: sum.conversionValue + item.conversionValue,
        reach: sum.reach + item.reach,
        linkClicks: sum.linkClicks + item.linkClicks,
    }), emptyMetrics());
    return calculateRates(totals);
}

function dateWhere(dates: OverviewDateRange): string {
    return `segments.date BETWEEN '${dates.since}' AND '${dates.until}'`;
}

async function searchGoogleAdsAllPages(
    context: Awaited<ReturnType<typeof getGoogleAdsCreationContext>>,
    query: string,
    maxPages = 2,
): Promise<{ rows: UnknownRecord[]; partial: boolean }> {
    const rows: UnknownRecord[] = [];
    let pageToken: string | undefined;
    let pageCount = 0;

    do {
        const url =
            `https://googleads.googleapis.com/${context.apiVersion}/customers/` +
            `${context.customerId}/googleAds:search`;
        const body: { query: string; pageToken?: string } = { query };
        if (pageToken) body.pageToken = pageToken;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${context.accessToken}`,
                "Content-Type": "application/json",
                "developer-token": context.developerToken,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        });

        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
            const error = nestedRecord(asRecord(payload), "error");
            const message = stringValue(error.message)
                ?? `Google Ads reporting failed with HTTP ${response.status}.`;
            // Google Ads puts the useful GAQL validation details in `error.details`.
            // Keep the query and response so optional report failures are diagnosable.
            const diagnostic = JSON.stringify(payload);
            throw new Error(
                `${message} | GAQL: ${query} | Google Ads details: ${diagnostic.slice(0, 6000)}`,
            );
        }

        const result = asRecord(payload);
        const pageRows = Array.isArray(result.results) ? result.results : [];
        rows.push(...pageRows.map(asRecord));
        pageToken = stringValue(result.nextPageToken) ?? undefined;
        pageCount += 1;
    } while (pageToken && pageCount < maxPages);

    return { rows, partial: Boolean(pageToken) };
}

function googleTrendPoint(row: UnknownRecord): OverviewTrendPoint {
    const metrics = metricsFromGoogleRow(row);
    return {
        date: stringValue(nestedRecord(row, "segments").date) ?? "",
        spend: metrics.spend,
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        conversions: metrics.conversions,
        conversionValue: metrics.conversionValue,
        reach: 0,
        linkClicks: 0,
    };
}

function googleCampaign(
    row: UnknownRecord,
    currency: string | null,
): OverviewCampaign | null {
    const campaign = nestedRecord(row, "campaign");
    const metrics = metricsFromGoogleRow(row);
    const id = stringValue(campaign.id);
    if (!id) return null;

    return {
        id,
        name: stringValue(campaign.name) ?? `Campaign ${id}`,
        provider: "googleAds",
        status: stringValue(campaign.status),
        ...metrics,
        currency,
    };
}

function googleAdGroup(
    row: UnknownRecord,
    currency: string | null,
): OverviewAdGroup | null {
    const adGroup = nestedRecord(row, "adGroup");
    const campaign = nestedRecord(row, "campaign");
    const metrics = metricsFromGoogleRow(row);
    const id = stringValue(adGroup.id);
    if (!id) return null;

    return {
        id,
        name: stringValue(adGroup.name) ?? `Ad group ${id}`,
        campaignName: stringValue(campaign.name) ?? "Campaign",
        status: stringValue(adGroup.status),
        spend: metrics.spend,
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        conversions: metrics.conversions,
        ctr: metrics.ctr,
        currency,
    };
}

function googleSearchTerm(
    row: UnknownRecord,
): OverviewSearchTerm | null {
    const term = nestedRecord(row, "searchTermView");
    const campaign = nestedRecord(row, "campaign");
    const adGroup = nestedRecord(row, "adGroup");
    const metrics = metricsFromGoogleRow(row);
    const value = stringValue(term.searchTerm);
    if (!value) return null;

    return {
        term: value,
        campaignName: stringValue(campaign.name) ?? "",
        adGroupName: stringValue(adGroup.name) ?? "",
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        spend: metrics.spend,
        conversions: metrics.conversions,
        conversionValue: metrics.conversionValue,
        ctr: metrics.ctr,
    };
}

function googleConversionAction(
    row: UnknownRecord,
): OverviewConversionAction | null {
    const segments = nestedRecord(row, "segments");
    const metrics = metricsFromGoogleRow(row);
    const name = stringValue(segments.conversionActionName)
        ?? stringValue(segments.conversionAction)
        ?? "Unspecified action";
    if (!name) return null;

    return {
        name,
        category: stringValue(segments.conversionActionCategory) ?? "UNKNOWN",
        conversions: metrics.conversions,
        conversionValue: metrics.conversionValue,
        // Cost is not attributable to an individual action in this report.
        // Do not invent per-action CPA/ROAS by reusing campaign-level spend.
        spend: null,
        costPerConversion: null,
        roas: null,
    };
}

function previousPeriod(dates: OverviewDateRange): OverviewDateRange {
    const start = new Date(`${dates.since}T00:00:00.000Z`);
    const end = new Date(`${dates.until}T00:00:00.000Z`);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const previousEnd = new Date(start);
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setUTCDate(previousStart.getUTCDate() - (days - 1));
    return {
        since: previousStart.toISOString().slice(0, 10),
        until: previousEnd.toISOString().slice(0, 10),
    };
}

async function optionalRows(
    reportName: string,
    request: Promise<{ rows: UnknownRecord[]; partial: boolean }>,
): Promise<{ rows: UnknownRecord[]; partial: boolean }> {
    try {
        return await request;
    } catch (error) {
        console.warn(
            `Optional Google Ads report \"${reportName}\" failed:`,
            error instanceof Error ? error.message : error,
        );
        return { rows: [], partial: true };
    }
}

export async function getGoogleOverview(
    userId: string,
    account: OverviewAccount,
    dates: OverviewDateRange,
): Promise<ProviderOverviewData> {
    const context = await getGoogleAdsCreationContext(userId, account.id);
    const currencyQuery = `SELECT customer.currency_code FROM customer LIMIT 1`;
    const dailyQuery = [
        "SELECT segments.date, customer.currency_code,",
        "metrics.impressions, metrics.clicks, metrics.cost_micros,",
        "metrics.conversions, metrics.conversions_value",
        "FROM customer",
        `WHERE ${dateWhere(dates)}`,
        "ORDER BY segments.date ASC",
    ].join(" ");

    const campaignQuery = [
        "SELECT campaign.id, campaign.name, campaign.status,",
        "metrics.impressions, metrics.clicks, metrics.cost_micros,",
        "metrics.conversions, metrics.conversions_value",
        "FROM campaign",
        `WHERE ${dateWhere(dates)} AND campaign.status != 'REMOVED'`,
        "ORDER BY metrics.cost_micros DESC LIMIT 10",
    ].join(" ");

    const adGroupQuery = [
        "SELECT campaign.name, ad_group.id, ad_group.name, ad_group.status,",
        "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions",
        "FROM ad_group",
        `WHERE ${dateWhere(dates)} AND ad_group.status != 'REMOVED'`,
        "ORDER BY metrics.cost_micros DESC LIMIT 10",
    ].join(" ");

    const searchTermQuery = [
        "SELECT search_term_view.search_term, campaign.name, ad_group.name,",
        "metrics.impressions, metrics.clicks, metrics.cost_micros,",
        "metrics.conversions, metrics.conversions_value",
        "FROM search_term_view",
        `WHERE ${dateWhere(dates)}`,
        "ORDER BY metrics.clicks DESC LIMIT 15",
    ].join(" ");

    const negativeCandidateQuery = [
        "SELECT search_term_view.search_term, campaign.name, ad_group.name,",
        "metrics.impressions, metrics.clicks, metrics.cost_micros,",
        "metrics.conversions, metrics.conversions_value",
        "FROM search_term_view",
        `WHERE ${dateWhere(dates)} AND metrics.clicks >= 10 AND metrics.conversions = 0`,
        "ORDER BY metrics.clicks DESC LIMIT 10",
    ].join(" ");

    const conversionActionQuery = [
        "SELECT segments.conversion_action_name, segments.conversion_action_category,",
        // metrics.cost_micros cannot be selected with conversion-action segments.
        "metrics.conversions, metrics.conversions_value",
        "FROM campaign",
        `WHERE ${dateWhere(dates)}`,
        "ORDER BY metrics.conversions DESC LIMIT 20",
    ].join(" ");

    const previousRange = previousPeriod(dates);
    const previousQuery = [
        "SELECT metrics.impressions, metrics.clicks, metrics.cost_micros,",
        "metrics.conversions, metrics.conversions_value",
        "FROM customer",
        `WHERE ${dateWhere(previousRange)}`,
    ].join(" ");

    const [
        dailyResult,
        campaignResult,
        currencyResult,
        adGroupResult,
        searchResult,
        negativeCandidateResult,
        actionResult,
        previousResult,
    ] = await Promise.all([
        searchGoogleAdsAllPages(context, dailyQuery, 2),
        searchGoogleAdsAllPages(context, campaignQuery, 1),
        searchGoogleAdsAllPages(context, currencyQuery, 1),
        optionalRows("top ad groups", searchGoogleAdsAllPages(context, adGroupQuery, 1)),
        optionalRows("top search terms", searchGoogleAdsAllPages(context, searchTermQuery, 1)),
        optionalRows("zero-conversion search terms", searchGoogleAdsAllPages(context, negativeCandidateQuery, 1)),
        optionalRows("conversion actions", searchGoogleAdsAllPages(context, conversionActionQuery, 1)),
        optionalRows("previous-period summary", searchGoogleAdsAllPages(context, previousQuery, 1)),
    ]);

    const currencyFromRows = dailyResult.rows
        .map((row) => stringValue(nestedRecord(row, "customer").currencyCode))
        .find((value): value is string => Boolean(value));
    const currencyFromAccount = stringValue(
        nestedRecord(asRecord(currencyResult.rows[0]), "customer").currencyCode,
    );
    const currency = currencyFromRows ?? currencyFromAccount ?? account.currency;

    const trend = dailyResult.rows
        .map(googleTrendPoint)
        .filter((point) => Boolean(point.date))
        .sort((a, b) => a.date.localeCompare(b.date));

    const campaigns = campaignResult.rows
        .map((row) => googleCampaign(row, currency))
        .filter((row): row is OverviewCampaign => row !== null);

    const totals = sumMetrics(trend.map((point) => ({
        ...emptyMetrics(),
        spend: point.spend,
        impressions: point.impressions,
        clicks: point.clicks,
        conversions: point.conversions,
        conversionValue: point.conversionValue,
        reach: point.reach,
        linkClicks: point.linkClicks,
    })));

    const previousMetrics = previousResult.rows.length
        ? metricsFromGoogleRow(previousResult.rows[0]!)
        : emptyMetrics();

    const details: OverviewProviderDetails = {
        previousPeriod: previousMetrics,
        searchTerms: searchResult.rows
            .map(googleSearchTerm)
            .filter((row): row is OverviewSearchTerm => row !== null),
        negativeCandidates: negativeCandidateResult.rows
            .map(googleSearchTerm)
            .filter((row): row is OverviewSearchTerm => row !== null),
        conversionActions: actionResult.rows
            .map(googleConversionAction)
            .filter((row): row is OverviewConversionAction => row !== null),
        adGroups: adGroupResult.rows
            .map((row) => googleAdGroup(row, currency))
            .filter((row): row is OverviewAdGroup => row !== null),
        adSets: [],
        ads: [],
        actionTypes: [],
        demographics: [],
        placements: [],
        countries: [],
    };

    return {
        currency,
        metrics: totals,
        trend,
        campaigns: campaigns.slice(0, 10),
        details,
        partial:
            dailyResult.partial ||
            campaignResult.partial ||
            adGroupResult.partial ||
            searchResult.partial ||
            negativeCandidateResult.partial ||
            actionResult.partial ||
            previousResult.partial,
    };
}

const CONVERSION_ACTION_PATTERN =
    /(^|[._])(purchase|lead(?:_grouped)?|complete_registration|contact|submit_application|subscribe|schedule|start_trial)([._]|$)/i;

function metaConversions(value: unknown): number {
    if (!Array.isArray(value)) return 0;
    return value.reduce((total, item) => {
        const action = asRecord(item);
        const type = stringValue(action.action_type) ?? "";
        if (!CONVERSION_ACTION_PATTERN.test(type)) return total;
        return total + numberValue(action.value);
    }, 0);
}

function metaConversionValue(value: unknown): number {
    if (!Array.isArray(value)) return 0;
    return value.reduce((total, item) => {
        const action = asRecord(item);
        const type = stringValue(action.action_type) ?? "";
        if (!CONVERSION_ACTION_PATTERN.test(type)) return total;
        return total + numberValue(action.value);
    }, 0);
}

function metaActionTypes(rows: UnknownRecord[]): OverviewActionType[] {
    const values = new Map<string, number>();
    for (const row of rows) {
        const actions = Array.isArray(row.actions) ? row.actions : [];
        for (const item of actions) {
            const action = asRecord(item);
            const type = stringValue(action.action_type);
            if (!type) continue;
            values.set(type, (values.get(type) ?? 0) + numberValue(action.value));
        }
    }
    return [...values.entries()]
        .map(([actionType, value]) => ({ actionType, value: round(value) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 12);
}

async function fetchMetaInsights(
    accessToken: string,
    accountId: string,
    params: Record<string, string>,
    maxPages = 3,
): Promise<{ rows: UnknownRecord[]; partial: boolean }> {
    const apiVersion =
        process.env.META_GRAPH_API_VERSION?.trim() ||
        process.env.META_ADS_API_VERSION?.trim() ||
        "v26.0";

    if (!/^v\d+\.\d+$/.test(apiVersion)) {
        throw new Error("Invalid Meta Graph API version.");
    }

    const rows: UnknownRecord[] = [];
    let after: string | undefined;
    let pageCount = 0;

    do {
        const url = new URL(
            `https://graph.facebook.com/${apiVersion}/${accountId}/insights`,
        );
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }
        url.searchParams.set("limit", "100");
        if (after) url.searchParams.set("after", after);

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
            },
            signal: AbortSignal.timeout(30_000),
        });

        const payload: unknown = await response.json().catch(() => null);
        const body = asRecord(payload);
        if (!response.ok || body.error) {
            const apiError = nestedRecord(body, "error");
            throw new Error(
                stringValue(apiError.message) ??
                `Meta Ads reporting failed with HTTP ${response.status}.`,
            );
        }

        const pageRows = Array.isArray(body.data) ? body.data : [];
        rows.push(...pageRows.map(asRecord));

        const paging = nestedRecord(body, "paging");
        const cursors = nestedRecord(paging, "cursors");
        const hasNext = Boolean(stringValue(paging.next));
        after = hasNext ? stringValue(cursors.after) ?? undefined : undefined;
        pageCount += 1;

        if (hasNext && !after) {
            return { rows, partial: true };
        }
    } while (after && pageCount < maxPages);

    return { rows, partial: Boolean(after) };
}

function normalizeMetaAccountId(value: string): string {
    const trimmed = value.trim();
    if (/^act_\d+$/i.test(trimmed)) return `act_${trimmed.slice(4)}`;
    if (/^\d+$/.test(trimmed)) return `act_${trimmed}`;
    throw new Error("Invalid Meta Ads account ID.");
}

function metaTrendPoint(row: UnknownRecord): OverviewTrendPoint {
    const metrics = metricsFromMetaRow(row);
    return {
        date: stringValue(row.date_start) ?? "",
        spend: metrics.spend,
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        conversions: metrics.conversions,
        conversionValue: metrics.conversionValue,
        // Reach is a unique-period metric; do not sum daily reach values.
        reach: 0,
        linkClicks: metrics.linkClicks,
    };
}

function metaCampaign(
    row: UnknownRecord,
    currency: string | null,
    kind: "campaign" | "adset" | "ad",
): OverviewCampaign | null {
    const idField = kind === "campaign"
        ? "campaign_id"
        : kind === "adset" ? "adset_id" : "ad_id";
    const nameField = kind === "campaign"
        ? "campaign_name"
        : kind === "adset" ? "adset_name" : "ad_name";
    const id = stringValue(row[idField]);
    if (!id) return null;
    const metrics = metricsFromMetaRow(row);
    return {
        id,
        name: stringValue(row[nameField]) ?? `${kind} ${id}`,
        provider: "metaAds",
        status: null,
        ...metrics,
        currency,
    };
}

function metaBreakdownRow(
    row: UnknownRecord,
    dimensionKeys: string[],
    dimension: string,
): OverviewBreakdownRow {
    const metrics = metricsFromMetaRow(row);
    const label = dimensionKeys
        .map((key) => stringValue(row[key]))
        .filter((value): value is string => Boolean(value))
        .join(" · ") || "Unknown";
    return {
        dimension,
        label,
        spend: metrics.spend,
        impressions: metrics.impressions,
        reach: metrics.reach,
        clicks: metrics.clicks,
        conversions: metrics.conversions,
        ctr: metrics.ctr,
    };
}

async function optionalMetaRows(
    accessToken: string,
    accountId: string,
    params: Record<string, string>,
): Promise<{ rows: UnknownRecord[]; partial: boolean }> {
    try {
        return await fetchMetaInsights(accessToken, accountId, params, 1);
    } catch (error) {
        console.warn(
            "Optional Meta Insights report failed:",
            error instanceof Error ? error.message : error,
        );
        return { rows: [], partial: true };
    }
}

export async function getMetaOverview(
    userId: string,
    account: OverviewAccount,
    dates: OverviewDateRange,
): Promise<ProviderOverviewData> {
    const accessToken = await getProviderAccessToken(userId, "metaAds");
    const accountId = normalizeMetaAccountId(account.id);
    const timeRange = JSON.stringify({ since: dates.since, until: dates.until });
    const previousRange = previousPeriod(dates);
    const previousTimeRange = JSON.stringify({
        since: previousRange.since,
        until: previousRange.until,
    });

    const baseFields = "spend,impressions,reach,clicks,inline_link_clicks,ctr,actions,action_values";

    const [dailyResult, campaignResult] = await Promise.all([
        fetchMetaInsights(accessToken, accountId, {
            fields: `${baseFields},date_start,date_stop`,
            level: "account",
            time_range: timeRange,
            time_increment: "1",
        }, 2),
        fetchMetaInsights(accessToken, accountId, {
            fields: `campaign_id,campaign_name,${baseFields}`,
            level: "campaign",
            time_range: timeRange,
        }, 1),
    ]);

    const [currentAggregateResult, adSetResult, adResult, demographicResult, placementResult, countryResult, previousResult] =
        await Promise.all([
            optionalMetaRows(accessToken, accountId, {
                fields: baseFields,
                level: "account",
                time_range: timeRange,
            }),
            optionalMetaRows(accessToken, accountId, {
                fields: `adset_id,adset_name,campaign_id,campaign_name,${baseFields}`,
                level: "adset",
                time_range: timeRange,
            }),
            optionalMetaRows(accessToken, accountId, {
                fields: `ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,${baseFields}`,
                level: "ad",
                time_range: timeRange,
            }),
            optionalMetaRows(accessToken, accountId, {
                fields: baseFields,
                level: "account",
                breakdowns: "age,gender",
                time_range: timeRange,
            }),
            optionalMetaRows(accessToken, accountId, {
                fields: baseFields,
                level: "account",
                breakdowns: "publisher_platform,platform_position",
                time_range: timeRange,
            }),
            optionalMetaRows(accessToken, accountId, {
                fields: baseFields,
                level: "account",
                breakdowns: "country",
                time_range: timeRange,
            }),
            optionalMetaRows(accessToken, accountId, {
                fields: baseFields,
                level: "account",
                time_range: previousTimeRange,
            }),
        ]);

    const trend = dailyResult.rows
        .map(metaTrendPoint)
        .filter((point) => Boolean(point.date))
        .sort((a, b) => a.date.localeCompare(b.date));

    const campaigns = campaignResult.rows
        .map((row) => metaCampaign(row, account.currency, "campaign"))
        .filter((row): row is OverviewCampaign => row !== null)
        .sort((a, b) => b.spend - a.spend);

    const trendMetrics = sumMetrics(trend.map((point) => ({
        ...emptyMetrics(),
        spend: point.spend,
        impressions: point.impressions,
        clicks: point.clicks,
        conversions: point.conversions,
        conversionValue: point.conversionValue,
        linkClicks: point.linkClicks,
    })));
    // Use period-level Insights for unique reach (daily reach must not be summed).
    const metrics = currentAggregateResult.rows[0]
        ? metricsFromMetaRow(currentAggregateResult.rows[0])
        : trendMetrics;

    const previousMetrics = previousResult.rows.length
        ? metricsFromMetaRow(previousResult.rows[0]!)
        : emptyMetrics();

    const allOptionalReports = [
        currentAggregateResult,
        adSetResult,
        adResult,
        demographicResult,
        placementResult,
        countryResult,
        previousResult,
    ];

    const details: OverviewProviderDetails = {
        previousPeriod: previousMetrics,
        searchTerms: [],
        negativeCandidates: [],
        conversionActions: [],
        adGroups: [],
        adSets: adSetResult.rows
            .map((row) => metaCampaign(row, account.currency, "adset"))
            .filter((row): row is OverviewCampaign => row !== null)
            .sort((a, b) => b.spend - a.spend)
            .slice(0, 10),
        ads: adResult.rows
            .map((row) => metaCampaign(row, account.currency, "ad"))
            .filter((row): row is OverviewCampaign => row !== null)
            .sort((a, b) => b.spend - a.spend)
            .slice(0, 10),
        actionTypes: metaActionTypes(
            currentAggregateResult.rows.length ? currentAggregateResult.rows : dailyResult.rows,
        ),
        demographics: demographicResult.rows
            .map((row) => metaBreakdownRow(row, ["age", "gender"], "age_gender"))
            .sort((a, b) => b.spend - a.spend),
        placements: placementResult.rows
            .map((row) => metaBreakdownRow(row, ["publisher_platform", "platform_position"], "placement"))
            .sort((a, b) => b.spend - a.spend),
        countries: countryResult.rows
            .map((row) => metaBreakdownRow(row, ["country"], "country"))
            .sort((a, b) => b.spend - a.spend),
    };

    return {
        currency: account.currency,
        metrics,
        trend,
        campaigns: campaigns.slice(0, 10),
        details,
        partial:
            dailyResult.partial ||
            campaignResult.partial ||
            allOptionalReports.some((result) => result.partial),
    };
}
