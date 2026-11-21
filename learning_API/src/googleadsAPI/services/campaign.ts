import { getProviderAccessToken } from "../../utils/provider-token.utils.js";

export type GoogleCampaignDatePreset =
    | "TODAY"
    | "YESTERDAY"
    | "LAST_7_DAYS"
    | "LAST_14_DAYS"
    | "LAST_30_DAYS"
    | "LAST_BUSINESS_WEEK"
    | "THIS_MONTH"
    | "LAST_MONTH"
    | "THIS_WEEK_SUN_TODAY"
    | "THIS_WEEK_MON_TODAY"
    | "LAST_WEEK_SUN_SAT"
    | "LAST_WEEK_MON_SUN";

export interface GoogleCampaignListOptions {
    /** Opaque Google Ads Search page token. Pass it back unchanged. */
    pageToken?: string;
    /** Google Ads date preset. Defaults to LAST_30_DAYS. */
    datePreset?: string;
}

export interface GoogleCampaignBudgetSummary {
    amount: number | null;
    amountMicros: string | null;
    type: "daily" | "lifetime" | null;
    period: string | null;
    currencyCode: string | null;
    deliveryMethod: string | null;
    name: string | null;
}

export interface GoogleCampaignMetricsSummary {
    spend: number | null;
    impressions: number | null;
    clicks: number | null;
    ctr: number | null;
    cpc: number | null;
    cpm: number | null;
    conversions: number | null;
    conversionRate: number | null;
    costPerConversion: number | null;
    conversionValue: number | null;
    roas: number | null;
    /** Google Ads campaign-level reach is not included in this standard report. */
    reach: null;
}

export interface GoogleCampaignRow {
    id: string;
    platform: "googleAds";
    name: string;
    status: string | null;
    objective: string | null;
    channelType: string | null;
    channelSubType: string | null;
    bidding: {
        strategy: string | null;
        systemStatus: string | null;
    };
    budget: GoogleCampaignBudgetSummary;
    metrics: GoogleCampaignMetricsSummary;
    /** Complete unmodified Google Ads Search row for detail views/debugging. */
    raw: GoogleAdsSearchRow;
    campaign?: Record<string, unknown>;
    campaignBudget?: Record<string, unknown>;
    customer?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface CampaignPagination {
    hasMore: boolean;
    /** Opaque provider cursor. Pass it back unchanged on the next request. */
    nextToken: string | null;
    totalResults: number | null;
}

export interface GoogleCampaignListResponse {
    campaigns: GoogleCampaignRow[];
    length: number;
    // datePreset: GoogleCampaignDatePreset;
    currencyCode: string | null;
    pagination: CampaignPagination;
}

interface GoogleAdsSearchRow {
    campaign?: Record<string, unknown> & {
        id?: string;
        name?: string;
        status?: string;
        advertisingChannelType?: string;
        advertisingChannelSubType?: string;
        biddingStrategyType?: string;
        biddingStrategySystemStatus?: string;
    };
    campaignBudget?: Record<string, unknown> & {
        name?: string;
        amountMicros?: string;
        totalAmountMicros?: string;
        period?: string;
        deliveryMethod?: string;
    };
    customer?: {
        currencyCode?: string;
    };
    metrics?: {
        impressions?: string | number;
        clicks?: string | number;
        ctr?: string | number;
        costMicros?: string | number;
        averageCpc?: string | number;
        averageCpm?: string | number;
        conversions?: string | number;
        conversionsFromInteractionsRate?: string | number;
        costPerConversion?: string | number;
        conversionsValue?: string | number;
        conversionsValuePerCost?: string | number;
    };
}

interface GoogleAdsSearchResponse {
    results?: GoogleAdsSearchRow[];
    nextPageToken?: string;
    totalResultsCount?: string;
}

interface GoogleAdsErrorResponse {
    error?: {
        code?: number;
        message?: string;
        status?: string;
    };
}

const GOOGLE_DATE_PRESETS: Record<string, GoogleCampaignDatePreset> = {
    TODAY: "TODAY",
    YESTERDAY: "YESTERDAY",
    LAST_7_DAYS: "LAST_7_DAYS",
    LAST_7D: "LAST_7_DAYS",
    LAST_BUSINESS_WEEK: "LAST_BUSINESS_WEEK",
    LAST_14_DAYS: "LAST_14_DAYS",
    LAST_14D: "LAST_14_DAYS",
    LAST_30_DAYS: "LAST_30_DAYS",
    LAST_30D: "LAST_30_DAYS",
    THIS_MONTH: "THIS_MONTH",
    LAST_MONTH: "LAST_MONTH",
    THIS_WEEK_SUN_TODAY: "THIS_WEEK_SUN_TODAY",
    THIS_WEEK_MON_TODAY: "THIS_WEEK_MON_TODAY",
    LAST_WEEK_SUN_SAT: "LAST_WEEK_SUN_SAT",
    LAST_WEEK_MON_SUN: "LAST_WEEK_MON_SUN",
};

function normalizeDatePreset(value?: string): GoogleCampaignDatePreset {
    if (!value?.trim()) {
        return "LAST_30_DAYS";
    }

    const normalized = GOOGLE_DATE_PRESETS[value.trim().toUpperCase()];

    if (!normalized) {
        throw new Error(
            `Invalid Google Ads date preset '${value}'. Supported presets: ${Object.keys(GOOGLE_DATE_PRESETS).join(", ")}.`
        );
    }

    return normalized;
}

function normalizeCustomerResourceName(customerId: string): string {
    const value = customerId.trim();

    if (/^customers\/\d+$/.test(value)) {
        return value;
    }

    // Google Ads account IDs are often stored with UI separators (xxx-xxx-xxxx).
    const digitsOnly = value.replace(/-/g, "");
    if (/^\d+$/.test(digitsOnly)) {
        return `customers/${digitsOnly}`;
    }

    throw new Error(
        "Invalid Google Ads customer ID. Expected a numeric ID or customers/{customerId} resource name."
    );
}

function getGoogleApiErrorMessage(body: unknown, status: number): string {
    if (body && typeof body === "object" && "error" in body) {
        const apiError = (body as GoogleAdsErrorResponse).error;
        if (apiError?.message) {
            return apiError.message;
        }
    }

    return `Google Ads API request failed with HTTP ${status}.`;
}

function numberOrNull(value: unknown): number | null {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function microsToCurrency(value: unknown): number | null {
    const parsed = numberOrNull(value);
    return parsed === null ? null : parsed / 1_000_000;
}

function mapGoogleCampaign(
    row: GoogleAdsSearchRow,
    currencyCode: string | null
): GoogleCampaignRow {
    const campaign = row.campaign ?? {};
    const budget = row.campaignBudget ?? {};
    const metrics = row.metrics ?? {};

    const budgetPeriod = budget.period ?? "DAILY";
    const budgetType =
        budgetPeriod === "CUSTOM_PERIOD"
            ? "lifetime"
            : budgetPeriod === "DAILY"
                ? "daily"
                : null;
    const budgetMicros =
        budgetType === "lifetime"
            ? budget.totalAmountMicros
            : budget.amountMicros;

    const spend = microsToCurrency(metrics.costMicros);
    const conversions = numberOrNull(metrics.conversions);
    const conversionValue = numberOrNull(metrics.conversionsValue);
    const ctrRatio = numberOrNull(metrics.ctr);
    const conversionRateRatio = numberOrNull(
        metrics.conversionsFromInteractionsRate
    );

    const id = String(campaign.id ?? "");

    return {
        ...row,
        raw: row,
        id,
        platform: "googleAds",
        name: String(campaign.name ?? "Unnamed campaign"),
        status: campaign.status ?? null,
        // Google Ads exposes campaign channel/type, not a universal objective field.
        objective: null,
        channelType: campaign.advertisingChannelType ?? null,
        channelSubType: campaign.advertisingChannelSubType ?? null,
        bidding: {
            strategy: campaign.biddingStrategyType ?? null,
            systemStatus: campaign.biddingStrategySystemStatus ?? null,
        },
        budget: {
            amount: microsToCurrency(budgetMicros),
            amountMicros: budgetMicros ?? null,
            type: budgetType,
            period: budgetPeriod,
            currencyCode,
            deliveryMethod: budget.deliveryMethod ?? null,
            name: budget.name ?? null,
        },
        metrics: {
            spend,
            impressions: numberOrNull(metrics.impressions),
            clicks: numberOrNull(metrics.clicks),
            // Google returns CTR and conversion rate as ratios; expose percentages.
            ctr: ctrRatio === null ? null : ctrRatio * 100,
            cpc: microsToCurrency(metrics.averageCpc),
            cpm: microsToCurrency(metrics.averageCpm),
            conversions,
            conversionRate:
                conversionRateRatio === null
                    ? null
                    : conversionRateRatio * 100,
            costPerConversion:
                microsToCurrency(metrics.costPerConversion) ??
                (spend !== null && conversions !== null && conversions > 0
                    ? spend / conversions
                    : null),
            conversionValue,
            roas:
                numberOrNull(metrics.conversionsValuePerCost) ??
                (spend !== null && spend > 0 && conversionValue !== null
                    ? conversionValue / spend
                    : null),
            reach: null,
        },
    };
}

/**
 * Retrieve one page of campaigns and performance summaries for a user's
 * selected Google Ads customer. Performance metrics use the selected date
 * preset (LAST_30_DAYS by default). Monetary amounts are returned in the
 * customer's currency, not micros; CTR and conversionRate are percentages.
 */

export const getCampaigns = async (
    userId: string,
    customerId: string,
    pageToken: any,
): Promise<GoogleCampaignListResponse> => {
    if (!userId?.trim()) {
        throw new Error("Authenticated user ID is required.");
    }

    if (!customerId?.trim()) {
        throw new Error("A Google Ads customer account must be selected.");
    }

    if (pageToken !== undefined && !pageToken.trim()) {
        throw new Error("Google Ads page token cannot be empty.");
    }

    const customerResourceName = normalizeCustomerResourceName(customerId);
    // const datePreset = normalizeDatePreset(options.datePreset);

    const developerToken =
        process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();

    if (!developerToken) {
        throw new Error(
            "GOOGLE_ADS_DEVELOPER_TOKEN is not configured."
        );
    }

    const apiVersion =
        process.env.GOOGLE_ADS_API_VERSION?.trim() || "v25";

    if (!/^v\d+$/.test(apiVersion)) {
        throw new Error(
            "Invalid GOOGLE_ADS_API_VERSION. Expected a version such as v25."
        );
    }

    try {
        const accessToken = await getProviderAccessToken(
            userId,
            "googleAds"
        );

        const query = `
            SELECT
                customer.currency_code,
                campaign.id,
                campaign.name,
                campaign.status,
                campaign.advertising_channel_type,
                campaign.advertising_channel_sub_type,
                campaign.bidding_strategy_type,
                campaign.bidding_strategy_system_status,
                campaign.campaign_budget,
                campaign_budget.name,
                campaign_budget.amount_micros,
                campaign_budget.total_amount_micros,
                campaign_budget.period,
                campaign_budget.delivery_method,
                metrics.impressions,
                metrics.clicks,
                metrics.ctr,
                metrics.cost_micros,
                metrics.average_cpc,
                metrics.average_cpm,
                metrics.conversions,
                metrics.conversions_from_interactions_rate,
                metrics.cost_per_conversion,
                metrics.conversions_value
            FROM campaign
            ORDER BY campaign.id
        `;

        const requestBody: Record<string, unknown> = {
            query
        };

        // Forward the provider cursor when requesting another page.
        if (pageToken !== undefined) {
            requestBody[`pageToken`] = pageToken;
        }

        const headers: Record<string, string> = {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "developer-token": developerToken,
        };

        // Required when accessing a client account through an MCC.
        const loginCustomerId =
            process.env[`GOOGLE_ADS_LOGIN_CUSTOMER_ID`]?.trim();

        if (loginCustomerId) {
            headers["login-customer-id"] =
                loginCustomerId.replace(/-/g, "");
        }

        const response = await fetch(
            `https://googleads.googleapis.com/${apiVersion}/${customerResourceName}/googleAds:search`,
            {
                method: "POST",
                headers,
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(30000),
            }
        );

        const responseBody: unknown = await response
            .json()
            .catch(() => null);

        if (!response.ok) {
            console.error(
                "Google Ads API response:",
                JSON.stringify(responseBody, null, 2)
            );

            throw new Error(
                getGoogleApiErrorMessage(
                    responseBody,
                    response.status
                )
            );
        }

        if (
            !responseBody ||
            typeof responseBody !== "object"
        ) {
            throw new Error(
                "Google Ads returned an invalid campaign response."
            );
        }

        const data = responseBody as GoogleAdsSearchResponse;

        const rows = Array.isArray(data.results)
            ? data.results
            : [];

        const currencyCode =
            rows.find((row) => row.customer?.currencyCode)
                ?.customer?.currencyCode ?? null;

        const campaigns = rows.map((row) =>
            mapGoogleCampaign(
                row,
                row.customer?.currencyCode ?? currencyCode
            )
        );

        const nextToken = data.nextPageToken ?? null;

        const totalResults = numberOrNull(
            data.totalResultsCount
        );

        return {
            campaigns,
            length: campaigns.length,
            currencyCode,
            pagination: {
                hasMore: Boolean(nextToken),
                nextToken,
                totalResults,
            },
        };
    } catch (error) {
        console.error(
            "Google Ads campaign retrieval failed:",
            error instanceof Error
                ? error.message
                : "Unknown error"
        );

        throw error instanceof Error
            ? error
            : new Error(
                "Failed to retrieve Google Ads campaigns."
            );
    }
};
