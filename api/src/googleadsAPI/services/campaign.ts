import { getProviderAccessToken } from "../../utils/provider-token.utils.js";

export interface GoogleCampaignRow {
    campaign?: {
        id?: string;
        name?: string;
        status?: string;
        advertisingChannelType?: string;
        campaignBudget?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface CampaignPagination {
    hasMore: boolean;
    /** Opaque provider cursor. Pass it back unchanged on the next request. */
    nextToken: string | null;
}

export interface GoogleCampaignListResponse {
    campaigns: GoogleCampaignRow[];
    length: number;
    pagination: CampaignPagination;
}

interface GoogleAdsSearchResponse {
    results?: GoogleCampaignRow[];
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

function normalizeCustomerResourceName(customerId: string): string {
    const value = customerId.trim();

    // Account selection stores Google's resource name (customers/123...).
    // Also accept a numeric customer ID for callers using the older contract.
    if (/^customers\/\d+$/.test(value)) {
        return value;
    }

    if (/^\d+$/.test(value)) {
        return `customers/${value}`;
    }

    throw new Error(
        "Invalid Google Ads customer ID. Expected a numeric ID or customers/{customerId} resource name."
    );
}

function getGoogleApiErrorMessage(
    body: unknown,
    status: number
): string {
    if (
        body &&
        typeof body === "object" &&
        "error" in body
    ) {
        const apiError = (body as GoogleAdsErrorResponse).error;

        if (apiError?.message) {
            return apiError.message;
        }
    }

    return `Google Ads API request failed with HTTP ${status}.`;
}

/**
 * Retrieve one page of campaigns for the authenticated user's selected
 * Google Ads customer. The caller can pass pagination.nextToken into the
 * next request as pageToken. Google Search uses a fixed page size of 10,000
 * rows for current API versions; REST callers must request subsequent pages.
 */
export const getCampaigns = async (
    userId: string,
    customerId: string,
    pageToken?: string
): Promise<GoogleCampaignListResponse> => {
    if (!userId?.trim()) {
        throw new Error("Authenticated user ID is required.");
    }

    if (!customerId?.trim()) {
        throw new Error("A Google Ads customer account must be selected.");
    }

    const customerResourceName = normalizeCustomerResourceName(customerId);

    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();

    if (!developerToken) {
        throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN is not configured.");
    }

    const apiVersion = process.env.GOOGLE_ADS_API_VERSION?.trim() || "v25";

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
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign.campaign_budget
      FROM campaign
      ORDER BY campaign.id
    `;

        const requestBody: Record<string, string> = { query };

        if (pageToken) {
            requestBody.pageToken = pageToken;
        }

        const response = await fetch(
            `https://googleads.googleapis.com/${apiVersion}/${customerResourceName}/googleAds:search`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    "developer-token": developerToken,
                },
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(30_000),
            }
        );

        const responseBody: unknown = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(
                getGoogleApiErrorMessage(responseBody, response.status)
            );
        }

        if (!responseBody || typeof responseBody !== "object") {
            throw new Error("Google Ads returned an invalid campaign response.");
        }

        const data = responseBody as GoogleAdsSearchResponse;
        const campaigns = Array.isArray(data.results) ? data.results : [];
        const nextToken = data.nextPageToken ?? null;

        return {
            campaigns,
            length: campaigns.length,
            pagination: {
                hasMore: Boolean(nextToken),
                nextToken,
            },
        };
    } catch (error) {
        console.error(
            "Google Ads campaign retrieval failed:",
            error instanceof Error ? error.message : "Unknown error"
        );

        throw error instanceof Error
            ? error
            : new Error("Failed to retrieve Google Ads campaigns.");
    }
};
