import type { GoogleAdsCreationContext } from "../iterface/campaign-creation.js";

/**
 * Account-scoped, read-only Google Ads resource discovery used by the
 * Campaign Creation wizard. These lookups never mutate the customer account.
 */
export class GoogleAdsResourceLookupError extends Error {
    constructor(
        message: string,
        public statusCode = 502,
        public details?: unknown,
    ) {
        super(message);
        this.name = "GoogleAdsResourceLookupError";
    }
}

type GoogleAdsSearchResponse = {
    results?: Array<Record<string, any>>;
    nextPageToken?: string;
    error?: { message?: string; status?: string; details?: unknown[] };
};

async function searchGoogleAdsRows(
    context: GoogleAdsCreationContext,
    query: string,
): Promise<Array<Record<string, any>>> {
    const endpoint =
        `https://googleads.googleapis.com/${context.apiVersion}` +
        `/customers/${context.customerId}/googleAds:search`;

    const rows: Array<Record<string, any>> = [];
    let pageToken: string | undefined;
    let pageCount = 0;

    do {
        const body: Record<string, unknown> = {
            query,
        };
        if (pageToken) body.pageToken = pageToken;

        let response: Response;
        try {
            response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${context.accessToken}`,
                    "developer-token": context.developerToken,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(30_000),
            });
        } catch (error) {
            throw new GoogleAdsResourceLookupError(
                error instanceof Error
                    ? error.message
                    : "Unable to reach the Google Ads API.",
                502,
            );
        }

        const payload = (await response.json().catch(() => null)) as
            | GoogleAdsSearchResponse
            | null;

        if (!response.ok || payload?.error) {
            const message =
                payload?.error?.message ||
                `Google Ads resource lookup failed (${response.status}).`;
            throw new GoogleAdsResourceLookupError(
                message,
                response.status >= 400 && response.status < 500
                    ? response.status
                    : 502,
                payload,
            );
        }

        rows.push(...(payload?.results ?? []));
        pageToken = payload?.nextPageToken;
        pageCount += 1;

        // Bound a lookup response even if the provider returns many pages.
        // The frontend can refresh/search again when account resource counts
        // exceed this safety cap.
    } while (pageToken && pageCount < 10);

    return rows;
}

export async function getGoogleAdsAudiences(
    context: GoogleAdsCreationContext,
) {
    const rows = await searchGoogleAdsRows(
        context,
        `SELECT
            audience.id,
            audience.name,
            audience.resource_name,
            audience.status,
            audience.scope,
            audience.description
         FROM audience
         WHERE audience.status = 'ENABLED'
           AND audience.scope = 'CUSTOMER'
         ORDER BY audience.name`,
    );

    return rows
        .map((row) => row.audience)
        .filter((item) => item?.resourceName)
        .map((item) => ({
            id: item.id,
            name: item.name,
            resourceName: item.resourceName,
            status: item.status,
            scope: item.scope,
            description: item.description,
        }));
}

export async function getGoogleAdsConversionActions(
    context: GoogleAdsCreationContext,
) {
    const rows = await searchGoogleAdsRows(
        context,
        `SELECT
            conversion_action.id,
            conversion_action.name,
            conversion_action.resource_name,
            conversion_action.type,
            conversion_action.category,
            conversion_action.status,
            conversion_action.primary_for_goal,
            conversion_action.origin
         FROM conversion_action
         WHERE conversion_action.status != 'REMOVED'
         ORDER BY conversion_action.name`,
    );

    return rows
        .map((row) => row.conversionAction)
        .filter((item) => item?.resourceName)
        .map((item) => ({
            id: item.id,
            name: item.name,
            resourceName: item.resourceName,
            type: item.type,
            category: item.category,
            status: item.status,
            primaryForGoal: item.primaryForGoal,
            origin: item.origin,
        }));
}

export async function getGoogleAdsPortfolioStrategies(
    context: GoogleAdsCreationContext,
) {
    const rows = await searchGoogleAdsRows(
        context,
        `SELECT
            bidding_strategy.id,
            bidding_strategy.name,
            bidding_strategy.resource_name,
            bidding_strategy.status,
            bidding_strategy.type,
            bidding_strategy.effective_currency_code,
            bidding_strategy.non_removed_campaign_count
         FROM bidding_strategy
         WHERE bidding_strategy.status = 'ENABLED'
         ORDER BY bidding_strategy.name`,
    );

    return rows
        .map((row) => row.biddingStrategy)
        .filter((item) => item?.resourceName)
        .map((item) => ({
            id: item.id,
            name: item.name,
            resourceName: item.resourceName,
            status: item.status,
            type: item.type,
            currencyCode: item.effectiveCurrencyCode,
            attachedCampaignCount: item.nonRemovedCampaignCount,
        }));
}
