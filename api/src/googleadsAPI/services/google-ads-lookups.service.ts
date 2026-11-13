import type {
    GoogleAdsCreationContext,
} from "../iterface/campaign-creation.js";

// ==========================================
// TYPES
// ==========================================

type GoogleAdsRow = Record<string, any>;

interface GoogleAdsSearchResult {
    rows: GoogleAdsRow[];
    nextPageToken: string | null;
}

export class GoogleAdsLookupError extends Error {
    constructor(
        message: string,
        public statusCode = 502,
        public details?: unknown,
    ) {
        super(message);
        this.name = "GoogleAdsLookupError";
    }
}

// ==========================================
// COMMON HELPERS
// ==========================================

function isRecord(value: unknown): value is Record<string, any> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

function normalizeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

async function readGoogleResponse(
    response: Response,
): Promise<Record<string, any>> {
    const text = await response.text();

    if (!text) return {};

    try {
        const parsed: unknown = JSON.parse(text);
        return isRecord(parsed) ? parsed : {};
    } catch {
        return { rawResponse: text };
    }
}

function getGoogleErrorMessage(
    data: Record<string, any>,
    fallback: string,
): string {
    return (
        data.error?.message ||
        data.message ||
        fallback
    );
}

// ==========================================
// COMMON GOOGLE ADS GAQL SEARCH
// ==========================================

async function searchGoogleAds(
    context: GoogleAdsCreationContext,
    query: string,
    pageToken?: string,
): Promise<GoogleAdsSearchResult> {
    const url =
        `https://googleads.googleapis.com/` +
        `${context.apiVersion}/customers/` +
        `${context.customerId}/googleAds:search`;

    const body: Record<string, unknown> = { query };

    if (pageToken) {
        if (pageToken.length > 10000) {
            throw new GoogleAdsLookupError(
                "Invalid Google Ads pagination token.",
                400,
            );
        }

        body.pageToken = pageToken;
    }

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${context.accessToken}`,
            "developer-token": context.developerToken,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
    });

    const data = await readGoogleResponse(response);

    if (!response.ok) {
        console.error(
            "Google Ads lookup search failed:",
            JSON.stringify(data, null, 2),
        );

        throw new GoogleAdsLookupError(
            getGoogleErrorMessage(
                data,
                `Google Ads lookup failed with HTTP ${response.status}.`,
            ),
            502,
            data,
        );
    }

    return {
        rows: Array.isArray(data.results) ? data.results : [],
        nextPageToken: data.nextPageToken ?? null,
    };
}

// ==========================================
// 1. GOOGLE ADS LOCATION LOOKUP
// ==========================================

export async function searchGoogleAdsLocations(
    context: GoogleAdsCreationContext,
    input: {
        query: string;
        countryCode?: string;
        locale?: string;
    },
) {
    const query = normalizeString(input.query);

    if (query.length < 2 || query.length > 100) {
        throw new GoogleAdsLookupError(
            "Location search must contain between 2 and 100 characters.",
            400,
        );
    }

    const countryCode = normalizeString(input.countryCode).toUpperCase();
    const locale = normalizeString(input.locale) || "en";

    if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
        throw new GoogleAdsLookupError(
            "Country code must be a valid two-letter ISO code.",
            400,
        );
    }

    if (!/^[a-z]{2}$/i.test(locale)) {
        throw new GoogleAdsLookupError(
            "Locale must be a two-letter language code, such as en.",
            400,
        );
    }

    const url =
        `https://googleads.googleapis.com/` +
        `${context.apiVersion}/geoTargetConstants:suggest`;

    const requestBody: Record<string, unknown> = {
        locale,
        locationNames: {
            names: [query],
        },
    };

    if (countryCode) {
        requestBody.countryCode = countryCode;
    }

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${context.accessToken}`,
            "developer-token": context.developerToken,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30000),
    });

    const data = await readGoogleResponse(response);

    if (!response.ok) {
        console.error("Google Ads location lookup failed:", data);

        throw new GoogleAdsLookupError(
            getGoogleErrorMessage(
                data,
                `Google location lookup failed with HTTP ${response.status}.`,
            ),
            502,
            data,
        );
    }

    const suggestions = Array.isArray(
        data.geoTargetConstantSuggestions,
    )
        ? data.geoTargetConstantSuggestions
        : [];

    const locations = suggestions
        .filter((item: unknown) => isRecord(item))
        .map((item: Record<string, any>) => {
            const geo = isRecord(item.geoTargetConstant)
                ? item.geoTargetConstant
                : {};

            const parents = Array.isArray(
                item.geoTargetConstantParents,
            )
                ? item.geoTargetConstantParents
                : [];

            return {
                id: geo.id ?? null,
                name: geo.name ?? null,
                canonicalName: geo.canonicalName ?? null,
                countryCode: geo.countryCode ?? null,
                targetType: geo.targetType ?? null,
                status: geo.status ?? null,
                resourceName: geo.resourceName ?? null,
                reach: item.reach ?? null,
                searchTerm: item.searchTerm ?? query,
                locale: item.locale ?? locale,
                parents: parents
                    .filter((parent: unknown) => isRecord(parent))
                    .map((parent: Record<string, any>) => ({
                        name: parent.name ?? null,
                        resourceName: parent.resourceName ?? null,
                    })),
            };
        })
        // Exclude geo targets Google marks as unavailable.
        .filter(
            (location: Record<string, any>) =>
                !location.status ||
                location.status === "ENABLED",
        );

    return {
        query,
        countryCode: countryCode || null,
        count: locations.length,
        locations,
    };
}

// ==========================================
// 2. GOOGLE ADS LANGUAGE LOOKUP
// ==========================================

export async function getGoogleAdsLanguages(
    context: GoogleAdsCreationContext,
) {
    const query = `
        SELECT
            language_constant.id,
            language_constant.name,
            language_constant.code,
            language_constant.resource_name,
            language_constant.targetable
        FROM language_constant
        WHERE language_constant.targetable = TRUE
        ORDER BY language_constant.name
    `.trim();

    const result = await searchGoogleAds(context, query);

    const languages = result.rows
        .map((row) => row.languageConstant)
        .filter((language: unknown) => isRecord(language))
        .map((language: Record<string, any>) => ({
            id: language.id,
            name: language.name,
            code: language.code,
            resourceName: language.resourceName,
            targetable: language.targetable,
        }));

    return {
        count: languages.length,
        languages,
    };
}

// ==========================================
// 3. GOOGLE ADS USER LIST LOOKUP
// ==========================================

export async function getGoogleAdsUserLists(
    context: GoogleAdsCreationContext,
    pageToken?: string,
) {
    const query = `
        SELECT
            user_list.id,
            user_list.name,
            user_list.resource_name,
            user_list.type,
            user_list.membership_status,
            user_list.access_reason,
            user_list.account_user_list_status,
            user_list.size_for_display,
            user_list.size_for_search
        FROM user_list
        WHERE user_list.membership_status = 'OPEN'
        ORDER BY user_list.name
    `.trim();

    const result = await searchGoogleAds(
        context,
        query,
        pageToken,
    );

    const userLists = result.rows
        .map((row) => row.userList)
        .filter((list: unknown) => isRecord(list))
        .filter(
            (list: Record<string, any>) =>
                list.membershipStatus === "OPEN" &&
                list.accountUserListStatus !== "DISABLED",
        )
        .map((list: Record<string, any>) => ({
            id: list.id,
            name: list.name,
            resourceName: list.resourceName,
            type: list.type,
            membershipStatus: list.membershipStatus,
            accessReason: list.accessReason,
            accountUserListStatus:
                list.accountUserListStatus ?? null,
            sizeForDisplay: list.sizeForDisplay ?? null,
            sizeForSearch: list.sizeForSearch ?? null,
        }));

    return {
        count: userLists.length,
        userLists,
        nextPageToken: result.nextPageToken,
    };
}

// ==========================================
// 4. GOOGLE ADS CUSTOM CONVERSION GOAL LOOKUP
// ==========================================

export async function getGoogleAdsCustomConversionGoals(
    context: GoogleAdsCreationContext,
    pageToken?: string,
) {
    // 1. Find the effective conversion customer.

    const customerQuery = `
        SELECT
            customer.id,
            customer.conversion_tracking_setting.google_ads_conversion_customer
        FROM customer
    `.trim();

    const customerResult = await searchGoogleAds(
        context,
        customerQuery,
    );

    const customerRow = customerResult.rows[0]?.customer;

    if (!isRecord(customerRow)) {
        throw new GoogleAdsLookupError(
            "Could not retrieve Google Ads customer conversion settings.",
            502,
        );
    }

    const conversionSetting = isRecord(
        customerRow.conversionTrackingSetting,
    )
        ? customerRow.conversionTrackingSetting
        : {};

    const conversionCustomerResourceName = normalizeString(
        conversionSetting.googleAdsConversionCustomer,
    );

    const conversionCustomerMatch =
        conversionCustomerResourceName.match(
            /^customers\/(\d+)$/,
        );

    // If Google does not return the effective conversion customer,
    // fall back to the selected Ads account.
    const effectiveConversionCustomerId =
        conversionCustomerMatch?.[1] ?? context.customerId;

    // 2. Query goals against the effective conversion customer.

    const conversionContext: GoogleAdsCreationContext = {
        ...context,
        customerId: effectiveConversionCustomerId,
    };

    const goalsQuery = `
        SELECT
            custom_conversion_goal.id,
            custom_conversion_goal.name,
            custom_conversion_goal.resource_name,
            custom_conversion_goal.status
        FROM custom_conversion_goal
        WHERE custom_conversion_goal.status = 'ENABLED'
        ORDER BY custom_conversion_goal.name
    `.trim();

    const goalsResult = await searchGoogleAds(
        conversionContext,
        goalsQuery,
        pageToken,
    );

    const goals = goalsResult.rows
        .map((row) => row.customConversionGoal)
        .filter((goal: unknown) => isRecord(goal))
        .map((goal: Record<string, any>) => ({
            id: goal.id,
            name: goal.name,
            resourceName: goal.resourceName,
            status: goal.status,
        }));

    return {
        selectedCustomerId: context.customerId,
        effectiveConversionCustomerId,
        conversionCustomerResourceName:
            conversionCustomerResourceName ||
            `customers/${context.customerId}`,
        count: goals.length,
        goals,
        nextPageToken: goalsResult.nextPageToken,
    };
}