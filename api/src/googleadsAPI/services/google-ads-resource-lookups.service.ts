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

/**
 * Retrieve Merchant Center accounts actively linked to the selected
 * Google Ads customer through the Google Ads ProductLink resource.
 *
 * This is a read-only lookup. It does not create or modify any account link.
 */
export async function getGoogleAdsMerchantCenterLinks(
    context: GoogleAdsCreationContext,
) {
    const rows = await searchGoogleAdsRows(
        context,
        `SELECT
            product_link.product_link_id,
            product_link.resource_name,
            product_link.type,
            product_link.merchant_center.merchant_center_id
         FROM product_link
         WHERE product_link.type = 'MERCHANT_CENTER'
         ORDER BY product_link.product_link_id`,
    );

    const linksByMerchantCenterId = new Map<
        string,
        {
            id: string;
            name: string;
            merchantCenterId: string;
            productLinkId: string;
            resourceName: string;
            type: string;
        }
    >();

    for (const row of rows) {
        // Google Ads REST responses use lower-camel-case field names.
        // Keep snake_case fallbacks to tolerate alternate response shapes.
        const productLink =
            row.productLink ?? row.product_link;

        const merchantCenter =
            productLink?.merchantCenter ??
            productLink?.merchant_center;

        const rawMerchantCenterId =
            merchantCenter?.merchantCenterId ??
            merchantCenter?.merchant_center_id;

        const rawProductLinkId =
            productLink?.productLinkId ??
            productLink?.product_link_id;

        const resourceName =
            productLink?.resourceName ??
            productLink?.resource_name;

        const merchantCenterId = String(
            rawMerchantCenterId ?? "",
        ).trim();

        if (
            !/^\d+$/.test(merchantCenterId) ||
            !resourceName
        ) {
            continue;
        }

        // A Merchant Center account should appear once in the selector,
        // even if the API response contains duplicate link rows.
        if (linksByMerchantCenterId.has(merchantCenterId)) {
            continue;
        }

        linksByMerchantCenterId.set(merchantCenterId, {
            id: merchantCenterId,
            name: `Merchant Center ${merchantCenterId}`,
            merchantCenterId,
            productLinkId: String(rawProductLinkId ?? ""),
            resourceName: String(resourceName),
            type: "MERCHANT_CENTER",
        });
    }

    return {
        count: linksByMerchantCenterId.size,
        merchantCenterLinks: [...linksByMerchantCenterId.values()],
    };
}

const GOOGLE_MERCHANT_API_BASE =
    "https://merchantapi.googleapis.com";

const GOOGLE_MERCHANT_CONTENT_SCOPE =
    "https://www.googleapis.com/auth/content";

const MERCHANT_LOOKUP_MAX_PAGES = 10;

export class GoogleMerchantCenterLookupError extends Error {
    constructor(
        message: string,
        public statusCode = 502,
        public details?: unknown,
    ) {
        super(message);
        this.name = "GoogleMerchantCenterLookupError";
    }
}

type MerchantApiPayload = {
    dataSources?: Array<Record<string, any>>;
    results?: Array<Record<string, any>>;
    nextPageToken?: string;
    error?: {
        code?: number;
        message?: string;
        status?: string;
        details?: unknown[];
    };
};

function normalizeMerchantCenterId(value: unknown): string {
    return String(value ?? "").trim();
}

/**
 * A Merchant Center ID is accepted only if it is linked to the
 * Google Ads customer selected for this authenticated user.
 */
async function assertMerchantCenterLinked(
    context: GoogleAdsCreationContext,
    merchantCenterIdValue: unknown,
): Promise<string> {
    const merchantCenterId =
        normalizeMerchantCenterId(merchantCenterIdValue);

    if (!/^\d+$/.test(merchantCenterId)) {
        throw new GoogleMerchantCenterLookupError(
            "A valid numeric Merchant Center account ID is required.",
            400,
        );
    }

    const linkedResult: any =
        await getGoogleAdsMerchantCenterLinks(context);

    const links = Array.isArray(linkedResult?.merchantCenterLinks)
        ? linkedResult.merchantCenterLinks
        : [];

    const isLinked = links.some((link: any) => {
        const linkedId = normalizeMerchantCenterId(
            link.merchantCenterId ?? link.id,
        );

        return linkedId === merchantCenterId;
    });

    if (!isLinked) {
        throw new GoogleMerchantCenterLookupError(
            "This Merchant Center account is not linked to the currently selected Google Ads customer.",
            422,
            {
                merchantCenterId,
                googleAdsCustomerId: context.customerId,
            },
        );
    }

    return merchantCenterId;
}

/**
 * Shared read-only Merchant API request helper.
 *
 * It deliberately uses the selected Google Ads connection's access token.
 * Merchant API scope and Merchant Center account permissions are checked
 * by Google and mapped to actionable errors below.
 */
async function requestMerchantApi<T = MerchantApiPayload>(
    path: string,
    context: GoogleAdsCreationContext,
    options: {
        method?: "GET" | "POST";
        body?: Record<string, unknown>;
        purpose: "dataSources.list" | "reports.search";
    },
): Promise<T> {
    const endpoint =
        `${GOOGLE_MERCHANT_API_BASE}/${path.replace(/^\/+/, "")}`;

    let response: Response;

    try {
        response = await fetch(endpoint, {
            method: options.method ?? "GET",
            headers: {
                Authorization: `Bearer ${context.accessToken}`,
                Accept: "application/json",
                ...(options.body && {
                    "Content-Type": "application/json",
                }),
            },
            ...(options.body && {
                body: JSON.stringify(options.body),
            }),
            signal: AbortSignal.timeout(30_000),
        });
    } catch (error) {
        throw new GoogleMerchantCenterLookupError(
            error instanceof Error
                ? error.message
                : "Unable to reach the Google Merchant API.",
            502,
        );
    }

    const payload = (await response.json().catch(() => null)) as
        | MerchantApiPayload
        | null;

    if (!response.ok || payload?.error) {
        const apiError = payload?.error;
        const providerMessage =
            apiError?.message ||
            `Google Merchant API request failed (${response.status}).`;

        const errorEvidence = [
            providerMessage,
            apiError?.status ?? "",
            JSON.stringify(apiError?.details ?? []),
        ]
            .join(" ")
            .toLowerCase();

        const missingScope =
            errorEvidence.includes("access_token_scope_insufficient") ||
            errorEvidence.includes("insufficient authentication scopes") ||
            errorEvidence.includes("insufficient scope");

        if (response.status === 401) {
            throw new GoogleMerchantCenterLookupError(
                "Google authorization is no longer valid. Reconnect Google Ads and try again.",
                401,
                { merchantApiStatus: apiError?.status ?? null },
            );
        }

        if (response.status === 403 && missingScope) {
            throw new GoogleMerchantCenterLookupError(
                `The Google connection has not granted Merchant API access. Request the additional OAuth scope ${GOOGLE_MERCHANT_CONTENT_SCOPE}, then reconnect Google.`,
                403,
                {
                    reason: "MERCHANT_API_OAUTH_SCOPE_MISSING",
                    requiredScope: GOOGLE_MERCHANT_CONTENT_SCOPE,
                },
            );
        }

        if (
            response.status === 403 &&
            options.purpose === "reports.search"
        ) {
            throw new GoogleMerchantCenterLookupError(
                "Merchant Center product reporting requires PERFORMANCE_REPORTING or ADMIN access for the connected Google user. Grant one of these access rights in Merchant Center and try again.",
                403,
                {
                    reason: "MERCHANT_CENTER_REPORT_ACCESS_REQUIRED",
                    requiredAccessRights: [
                        "PERFORMANCE_REPORTING",
                        "ADMIN",
                    ],
                    providerMessage,
                },
            );
        }

        if (response.status === 403) {
            throw new GoogleMerchantCenterLookupError(
                "The connected Google identity does not have sufficient access to this Merchant Center account. Check its Merchant Center user permissions.",
                403,
                {
                    reason: "MERCHANT_CENTER_ACCESS_DENIED",
                    providerMessage,
                },
            );
        }

        throw new GoogleMerchantCenterLookupError(
            providerMessage,
            response.status >= 400 && response.status < 500
                ? response.status
                : 502,
            {
                merchantApiStatus: apiError?.status ?? null,
                merchantApiCode: apiError?.code ?? response.status,
            },
        );
    }

    return payload as T;
}

function addMerchantFeedLabel(
    target: Map<string, {
        feedLabel: string;
        contentLanguage: string;
        productCount: number;
        dataSources: string[];
    }>,
    feedLabelValue: unknown,
    languageValue: unknown,
    options: {
        productCount?: number;
        dataSourceName?: string;
    } = {},
): void {
    const feedLabel = String(feedLabelValue ?? "").trim();
    const contentLanguage = String(languageValue ?? "").trim();

    if (!feedLabel || !contentLanguage) {
        return;
    }

    const key = `${feedLabel.toUpperCase()}|${contentLanguage.toLowerCase()}`;
    const existing = target.get(key) ?? {
        feedLabel,
        contentLanguage,
        productCount: 0,
        dataSources: [],
    };

    existing.productCount += options.productCount ?? 0;

    if (
        options.dataSourceName &&
        !existing.dataSources.includes(options.dataSourceName)
    ) {
        existing.dataSources.push(options.dataSourceName);
    }

    target.set(key, existing);
}

/**
 * Reads every available Merchant Center data-source page, with a bounded
 * page count so one lookup cannot run indefinitely.
 */
async function listMerchantDataSources(
    context: GoogleAdsCreationContext,
    merchantCenterId: string,
): Promise<{
    dataSources: Array<Record<string, any>>;
    nextPageToken: string | null;
}> {
    const dataSources: Array<Record<string, any>> = [];
    let pageToken: string | undefined;

    for (
        let page = 0;
        page < MERCHANT_LOOKUP_MAX_PAGES;
        page += 1
    ) {
        const url = new URL(
            `${GOOGLE_MERCHANT_API_BASE}/datasources/v1/accounts/${merchantCenterId}/dataSources`,
        );

        url.searchParams.set("pageSize", "1000");

        if (pageToken) {
            url.searchParams.set("pageToken", pageToken);
        }

        // requestMerchantApi expects a relative API path.
        const path =
            `datasources/v1/accounts/${merchantCenterId}/dataSources` +
            `?${url.searchParams.toString()}`;

        const payload = await requestMerchantApi<MerchantApiPayload>(
            path,
            context,
            { purpose: "dataSources.list" },
        );

        dataSources.push(...(payload.dataSources ?? []));
        pageToken = payload.nextPageToken;

        if (!pageToken) {
            break;
        }
    }

    return {
        dataSources,
        nextPageToken: pageToken ?? null,
    };
}

/**
 * GET /lookups/google/merchant-center-data-sources
 */
export async function getGoogleMerchantCenterDataSources(
    context: GoogleAdsCreationContext,
    merchantCenterIdValue: unknown,
) {
    const merchantCenterId = await assertMerchantCenterLinked(
        context,
        merchantCenterIdValue,
    );

    const result = await listMerchantDataSources(
        context,
        merchantCenterId,
    );

const dataSources = result.dataSources.map((source) => {
    const primary = source.primaryProductDataSource;
    const supplemental = source.supplementalProductDataSource;

    return {
        id: String(
            source.dataSourceId ??
                String(source.name ?? "").split("/").pop() ??
                "",
        ),
        resourceName: source.name ?? null,
        displayName: source.displayName ?? "Unnamed data source",
        input: source.input ?? null,
        type: primary
            ? "PRIMARY_PRODUCT"
            : supplemental
              ? "SUPPLEMENTAL_PRODUCT"
              : "OTHER",
        feedLabel: primary?.feedLabel ?? null,
        contentLanguage: primary?.contentLanguage ?? null,
        countries: Array.isArray(primary?.countries)
            ? primary.countries
            : [],
        destinations: Array.isArray(primary?.destinations)
            ? primary.destinations.map(
                (item: any) => item.destination ?? item,
            )
            : [],
        legacyLocal: primary?.legacyLocal === true,
    };
});

    const feedLabelMap = new Map<
        string,
        {
            feedLabel: string;
            contentLanguage: string;
            productCount: number;
            dataSources: string[];
        }
    >();

    for (const source of dataSources) {
        if (source.type !== "PRIMARY_PRODUCT") continue;

        addMerchantFeedLabel(
            feedLabelMap,
            source.feedLabel,
            source.contentLanguage,
            {
                dataSourceName: source.displayName,
            },
        );
    }

    return {
        merchantCenterId,
        count: dataSources.length,
        primaryProductDataSourceCount: dataSources.filter(
            (source) => source.type === "PRIMARY_PRODUCT",
        ).length,
        dataSources,
        feedLabels: [...feedLabelMap.values()],
        truncated: Boolean(result.nextPageToken),
        nextPageToken: result.nextPageToken,
    };
}

/**
 * Discovers feed-label/language pairs from the actual product inventory.
 * Primary data sources are also included because a source can define a
 * feed label before the reporting view has any processed product rows.
 *
 * GET /lookups/google/merchant-center-feed-labels
 */
export async function getGoogleMerchantCenterFeedLabels(
    context: GoogleAdsCreationContext,
    merchantCenterIdValue: unknown,
     pageTokenValue?: string,
) {
    const merchantCenterId = await assertMerchantCenterLinked(
        context,
        merchantCenterIdValue,
    );

    const sourceResult = await listMerchantDataSources(
        context,
        merchantCenterId,
    );

    const feedLabelMap = new Map<
        string,
        {
            feedLabel: string;
            contentLanguage: string;
            productCount: number;
            dataSources: string[];
        }
    >();

    for (const source of sourceResult.dataSources) {
        const primary = source.primaryProductDataSource;

        if (!primary) continue;

        addMerchantFeedLabel(
            feedLabelMap,
            primary.feedLabel,
            primary.contentLanguage,
            {
                dataSourceName:
                    source.displayName ?? source.name ?? undefined,
            },
        );
    }

if (pageTokenValue && pageTokenValue.length > 4096) {
    throw new GoogleMerchantCenterLookupError(
        "The feed-label pagination token is invalid. Refresh the lookup.",
        400,
    );
}

let pageToken: string | undefined = pageTokenValue || undefined;
    let productsScanned = 0;
    let reportingAvailable = true;

    try {
        for (
            let page = 0;
            page < MERCHANT_LOOKUP_MAX_PAGES;
            page += 1
        ) {
            const payload = await requestMerchantApi<MerchantApiPayload>(
                `reports/v1/accounts/${merchantCenterId}/reports:search`,
                context,
                {
                    method: "POST",
                    purpose: "reports.search",
                    body: {
                        query:
                            "SELECT id, feed_label, language_code FROM product_view",
                        pageSize: 1000,
                        ...(pageToken && { pageToken }),
                    },
                },
            );

            const rows = payload.results ?? [];
            productsScanned += rows.length;

            for (const row of rows) {
                const product = row.productView ?? {};

                addMerchantFeedLabel(
                    feedLabelMap,
                    product.feedLabel,
                    product.languageCode,
                    { productCount: 1 },
                );
            }

            pageToken = payload.nextPageToken;

            if (!pageToken) break;
        }
    } catch (error) {
        if (
            error instanceof GoogleMerchantCenterLookupError &&
            error.statusCode === 403 &&
            (error.details as any)?.reason ===
                "MERCHANT_CENTER_REPORT_ACCESS_REQUIRED"
        ) {
            reportingAvailable = false;
        } else {
            throw error;
        }
    }

    const feedLabels = [...feedLabelMap.values()].sort((a, b) =>
        `${a.feedLabel}-${a.contentLanguage}`.localeCompare(
            `${b.feedLabel}-${b.contentLanguage}`,
        ),
    );

    return {
        merchantCenterId,
        count: feedLabels.length,
        feedLabels,
        productsScanned,
        reportingAvailable,
        warning: reportingAvailable
            ? null
            : "Product-based feed discovery is unavailable. The connected Google user needs PERFORMANCE_REPORTING or ADMIN access to this Merchant Center account. Feed labels from fixed primary data sources are still included.",
        truncated: Boolean(pageToken),
        nextPageToken: pageToken ?? null,
    };
}

export type GoogleMerchantCenterProductLookupInput = {
    merchantCenterId: string;
    feedLabel: string;
    contentLanguage: string;
    pageToken?: string;
    pageSize?: number;
};

/**
 * Searches processed products for one actual feed-label/language pair.
 *
 * Uses Merchant Reports product_view so Google filters the catalog server-side
 * rather than AdSyntra downloading and filtering the whole Merchant Center.
 *
 * GET /lookups/google/merchant-center-products
 */
export async function getGoogleMerchantCenterProducts(
    context: GoogleAdsCreationContext,
    input: GoogleMerchantCenterProductLookupInput,
) {
    const merchantCenterId = await assertMerchantCenterLinked(
        context,
        input.merchantCenterId,
    );

    const feedLabel = String(input.feedLabel ?? "").trim();
    const contentLanguage = String(
        input.contentLanguage ?? "",
    ).trim();

    if (!/^[A-Z0-9-]{1,20}$/.test(feedLabel)) {
        throw new GoogleMerchantCenterLookupError(
            "Select a valid Merchant Center feed label returned by the lookup.",
            400,
        );
    }

    if (
        !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(
            contentLanguage,
        )
    ) {
        throw new GoogleMerchantCenterLookupError(
            "Select a valid product content language returned by the lookup.",
            400,
        );
    }

    if (
        input.pageToken &&
        input.pageToken.length > 4096
    ) {
        throw new GoogleMerchantCenterLookupError(
            "The product pagination token is invalid or too long. Refresh the product lookup.",
            400,
        );
    }

    const requestedPageSize = Number(input.pageSize ?? 100);
    const pageSize = Number.isFinite(requestedPageSize)
        ? Math.min(1000, Math.max(1, Math.trunc(requestedPageSize)))
        : 100;

    const query =
        "SELECT id, offer_id, feed_label, language_code, " +
        "title, brand, availability, thumbnail_link " +
        "FROM product_view " +
        `WHERE feed_label = '${feedLabel}' ` +
        `AND language_code = '${contentLanguage}'`;

    const payload = await requestMerchantApi<MerchantApiPayload>(
        `reports/v1/accounts/${merchantCenterId}/reports:search`,
        context,
        {
            method: "POST",
            purpose: "reports.search",
            body: {
                query,
                pageSize,
                ...(input.pageToken && {
                    pageToken: input.pageToken,
                }),
            },
        },
    );

    const products = (payload.results ?? [])
        .map((row) => row.productView ?? {})
        .filter((product) => product.id && product.offerId)
        .map((product) => ({
            id: product.id,
            offerId: product.offerId,
            feedLabel: product.feedLabel,
            contentLanguage: product.languageCode,
            title: product.title ?? "",
            brand: product.brand ?? "",
            availability: product.availability ?? null,
            thumbnailUrl: product.thumbnailLink ?? null,
        }));

    return {
        merchantCenterId,
        feedLabel,
        contentLanguage,
        count: products.length,
        products,
        nextPageToken: payload.nextPageToken ?? null,
    };
}