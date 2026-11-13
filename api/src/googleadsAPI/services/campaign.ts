import { getProviderAccessToken } from "../../utils/provider-token.utils.js";
import type {
    GoogleAdsErrorResponse,
    GoogleAdsSearchRow,
    GoogleCampaignRow,
    GoogleCampaignListResponse,
    GoogleAdsSearchResponse,
} from "../iterface/campaign.js";

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
        "Invalid Google Ads customer ID. Expected a numeric ID or customers/{customerId} resource name.",
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
    currencyCode: string | null,
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
        budgetType === "lifetime" ? budget.totalAmountMicros : budget.amountMicros;

    const spend = microsToCurrency(metrics.costMicros);
    const conversions = numberOrNull(metrics.conversions);
    const conversionValue = numberOrNull(metrics.conversionsValue);
    const ctrRatio = numberOrNull(metrics.ctr);
    const conversionRateRatio = numberOrNull(
        metrics.conversionsFromInteractionsRate,
    );

    const id = String(campaign.id ?? "");

    const campaignFields = { ...row };
    delete campaignFields.customer;
    return {
        raw: row,
        id,
        platform: "googleAds",
        name: String(campaign.name ?? "Unnamed campaign"),
        status: campaign.status ?? null,
        primaryStatus: campaign[`primaryStatus`] ?? null,

        primaryStatusReasons: campaign[`primaryStatusReasons`] ?? [],

        servingStatus: campaign[`servingStatus`] ?? null,

        startDateTime: campaign[`startDateTime`] ?? null,

        endDateTime: campaign[`endDateTime`] ?? null,

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
                conversionRateRatio === null ? null : conversionRateRatio * 100,
            costPerConversion:
                microsToCurrency(metrics.costPerConversion) ??
                (spend !== null && conversions !== null && conversions > 0
                    ? spend / conversions
                    : null),
            conversionValue,
            roas:
                spend !== null && spend > 0 && conversionValue !== null
                    ? conversionValue / spend
                    : null,

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
    pageToken: any = undefined,
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

    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();

    if (!developerToken) {
        throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN is not configured.");
    }

    const apiVersion = process.env.GOOGLE_ADS_API_VERSION?.trim() || "v25";

    if (!/^v\d+$/.test(apiVersion)) {
        throw new Error(
            "Invalid GOOGLE_ADS_API_VERSION. Expected a version such as v25.",
        );
    }

    try {
        const accessToken = await getProviderAccessToken(userId, "googleAds");

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
            metrics.conversions_value,
            customer.descriptive_name,
            customer.time_zone,
            campaign.primary_status,
            campaign.primary_status_reasons,
            campaign.serving_status,
            campaign.start_date_time,
            campaign.end_date_time
            FROM campaign
            WHERE campaign.status != 'REMOVED'
            ORDER BY campaign.id
        `;

        const requestBody: Record<string, unknown> = { query };

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
        const loginCustomerId = process.env[`GOOGLE_ADS_LOGIN_CUSTOMER_ID`]?.trim();

        if (loginCustomerId) {
            headers["login-customer-id"] = loginCustomerId.replace(/-/g, "");
        }

        const response = await fetch(
            `https://googleads.googleapis.com/${apiVersion}/${customerResourceName}/googleAds:search`,
            {
                method: "POST",
                headers,
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(30000),
            },
        );

        const responseBody: unknown = await response.json().catch(() => null);

        if (!response.ok) {
            console.error(
                "Google Ads API response:",
                JSON.stringify(responseBody, null, 2),
            );

            throw new Error(getGoogleApiErrorMessage(responseBody, response.status));
        }

        if (!responseBody || typeof responseBody !== "object") {
            throw new Error("Google Ads returned an invalid campaign response.");
        }

        const data = responseBody as GoogleAdsSearchResponse;

        const rows = Array.isArray(data.results) ? data.results : [];

        const accountCustomer = rows.find((row) => row.customer)?.customer;

        const currencyCode = accountCustomer?.currencyCode ?? null;

        const account = accountCustomer
            ? {
                id: customerResourceName,
                name: accountCustomer.descriptiveName ?? null,
                currencyCode,
                timeZone: accountCustomer.timeZone ?? null,
            }
            : null;

        const campaigns = rows.map((row) =>
            mapGoogleCampaign(row, row.customer?.currencyCode ?? currencyCode),
        );

        const nextToken = data.nextPageToken ?? null;

        const totalResults = numberOrNull(data.totalResultsCount);

        // console.log(
        //   `Retrieved ${campaigns.length} campaigns for customer ${customerResourceName}.`,
        // );

        return {
            account,
            campaigns,
            length: campaigns.length,
            pagination: {
                hasMore: Boolean(nextToken),
                nextToken,
                totalResults,
            },
            currencyCode: currencyCode,
        };
    } catch (error) {
        console.error(
            "Google Ads campaign retrieval failed:",
            error instanceof Error ? error.message : "Unknown error",
        );

        throw error instanceof Error
            ? error
            : new Error("Failed to retrieve Google Ads campaigns.");
    }
};
export const renameCampaign = async (
    userId: string,
    campaignId: any,
    name: any,
    customerId: string,
    validateOnly: boolean,
) => {
    try {
        if (!campaignId) {
            throw new Error("Missing campaignId");
        }

        if (typeof name !== "string" || name.trim().length === 0) {
            throw new Error("A valid campaign name is required");
        }

        if (!customerId) {
            throw new Error("Missing GOOGLE_ADS_CUSTOMER_ID");
        }

        const accessToken = await getProviderAccessToken(userId, "googleAds");

        const resourceName = `${customerId}/campaigns/${campaignId}`;
        console.log("resourcd Name", resourceName);

        const response = await fetch(
            `https://googleads.googleapis.com/v25/${customerId}/campaigns:mutate`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
                },
                body: JSON.stringify({
                    operations: [
                        {
                            updateMask: "name",
                            update: {
                                resourceName,
                                name: name.trim(),
                            },
                        },
                    ],
                    validateOnly,
                }),
            },
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("Rename campaign error:", JSON.stringify(data, null, 2));

            throw new Error(getGoogleApiErrorMessage(data, response.status));
        }
        // return res.status(response.status).json(data);

        return {
            message: validateOnly
                ? "Rename is valid. Campaign was NOT changed."
                : "Campaign renamed successfully.",
            validateOnly,
            campaignId,
            newName: name.trim(),
            googleResponse: data,
        };
    } catch (error: any) {
        console.error(error);

        throw new Error(error.message);
    }
};

// Pause or resume a campaign.
export const updateGoogleAdsStatus = async (
    campaignId: any,
    status: any,
    userId: any,
    customerId: string,
    validateOnly: boolean = false,
) => {
    try {
        const accessToken = await getProviderAccessToken(userId, "googleAds");
        const newStatus = status.toUpperCase();
        const campaignResourceName = `${customerId}/campaigns/${campaignId}`;
        const response = await fetch(
            `https://googleads.googleapis.com/v25/${customerId}/campaigns:mutate`,
            {
                method: "POST",

                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    // "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
                },

                body: JSON.stringify({
                    operations: [
                        {
                            updateMask: "status",
                            update: {
                                resourceName: campaignResourceName,
                                status: newStatus,
                            },
                        },
                    ],

                    validateOnly,
                }),
            },
        );

        const data: any = await response.json();

        if (!response.ok) {
            console.error("Google Ads pause error:", JSON.stringify(data, null, 2));

            throw new Error(data.message);
        }

        return {
            message: validateOnly
                ? `${newStatus} request is valid. Campaign was NOT changed.`
                : `Campaign status changed to ${newStatus} successfully`,

            validateOnly,
            customerId,
            campaignId,
            campaignResourceName,
            googleResponse: data,
        };
    } catch (error) {
        console.error("Pause campaign error:", error);

        throw new Error(
            error instanceof Error ? error.message : "Failed to pause campaign",
        );
    }
};


// Remove a campaign from Google Ads.
export const removeGoogleAdsCampaign = async (
    userId: string,
    campaignId: string,
    customerId: string,
    validateOnly: boolean = false,
) => {
    const normalizedCustomerId = customerId
        .trim()
        .replace(/^customers\//i, "")
        .replace(/-/g, "");

    const normalizedCampaignId = campaignId.trim();

    if (!/^\d+$/.test(normalizedCustomerId)) {
        throw new Error("Invalid Google Ads customer ID.");
    }

    if (!/^\d+$/.test(normalizedCampaignId)) {
        throw new Error("Invalid Google Ads campaign ID.");
    }

    const accessToken = await getProviderAccessToken(userId, "googleAds");

    if (!accessToken) {
        throw new Error("Connect your Google Ads account first.");
    }

    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

    if (!developerToken) {
        throw new Error("Google Ads developer token is not configured.");
    }

    const campaignResourceName =
        `customers/${normalizedCustomerId}/campaigns/${normalizedCampaignId}`;

    try {
        const response = await fetch(
            `https://googleads.googleapis.com/v25/customers/${normalizedCustomerId}/campaigns:mutate`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    "developer-token": developerToken,
                },
                body: JSON.stringify({
                    operations: [
                        {
                            remove: campaignResourceName,
                        },
                    ],
                    validateOnly,
                }),
            },
        );

        const data: any = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error(
                "Google Ads campaign removal error:",
                JSON.stringify(data, null, 2),
            );

            throw new Error(
                data?.error?.message ||
                data?.message ||
                "Google Ads campaign removal failed.",
            );
        }

        return {
            message: validateOnly
                ? "Campaign removal validation successful. Campaign was not removed."
                : "Google Ads campaign removed successfully.",
            validateOnly,
            customerId: normalizedCustomerId,
            campaignId: normalizedCampaignId,
            campaignResourceName,
            googleResponse: data,
        };
    } catch (error) {
        console.error("Google Ads campaign removal failed:", error);

        throw new Error(
            error instanceof Error
                ? error.message
                : "Failed to remove Google Ads campaign.",
        );
    }
};