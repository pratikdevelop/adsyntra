import { getProviderAccessToken } from "../../utils/provider-token.utils.js";

export type MetaGeoSearchType =
    | "country"
    | "region"
    | "city"
    | "zip"
    | "geo_market"
    | "electoral_district";

const SUPPORTED_GEO_TYPES: MetaGeoSearchType[] = [
    "country",
    "region",
    "city",
    "zip",
    "geo_market",
    "electoral_district",
];

export interface SearchMetaLocationsInput {
    query: string;
    type: string;
    countryCode?: string;
    regionId?: string;
    limit?: number;
    after?: string;
}

export interface MetaTargetingLocation {
    key: string;
    name: string;
    type: string;
    countryCode: string | null;
    countryName: string | null;
    region: string | null;
    regionId: string | number | null;
    latitude?: number;
    longitude?: number;
}

interface MetaLocationApiResponse {
    data?: Array<{
        key?: string;
        name?: string;
        type?: string;
        country_code?: string;
        country_name?: string;
        region?: string;
        region_id?: string | number;
        latitude?: number;
        longitude?: number;
    }>;
    paging?: {
        next?: string;
        cursors?: {
            after?: string;
        };
    };
    error?: {
        message?: string;
        type?: string;
        code?: number;
        error_subcode?: number;
        fbtrace_id?: string;
    };
}

export class MetaTargetingSearchError extends Error {
    constructor(
        message: string,
        public statusCode = 500,
        public details?: unknown,
    ) {
        super(message);
        this.name = "MetaTargetingSearchError";
    }
}

function getMetaTargetingApiVersion(): string {
    const version =
        process.env.META_ADS_API_VERSION?.trim() || "v27.0";

    if (!/^v\d+\.\d+$/.test(version)) {
        throw new MetaTargetingSearchError(
            "Invalid META_ADS_API_VERSION.",
            500,
        );
    }

    return version;
}

function extractNextCursor(
    paging: MetaLocationApiResponse["paging"],
): string | null {
    if (paging?.cursors?.after) {
        return paging.cursors.after;
    }

    // Never return Meta's complete next URL because it may contain
    // authentication-related query parameters.
    if (paging?.next) {
        try {
            return new URL(paging.next).searchParams.get("after");
        } catch {
            return null;
        }
    }

    return null;
}

export async function searchMetaLocations(
    userId: string,
    input: SearchMetaLocationsInput,
) {
    // 1. Validate authenticated user
    if (!userId?.trim()) {
        throw new MetaTargetingSearchError(
            "Authenticated user ID is required.",
            401,
        );
    }

    // 2. Validate search query
    const query = input.query?.trim();

    if (!query || query.length < 2 || query.length > 100) {
        throw new MetaTargetingSearchError(
            "Search query must contain between 2 and 100 characters.",
            400,
        );
    }

    // 3. Validate location type
    const type = input.type?.trim().toLowerCase();

    if (
        !SUPPORTED_GEO_TYPES.includes(type as MetaGeoSearchType)
    ) {
        throw new MetaTargetingSearchError(
            "Unsupported Meta location search type.",
            400,
        );
    }

    // 4. Validate optional filters
    const countryCode = input.countryCode?.trim().toUpperCase();

    if (
        countryCode !== undefined &&
        !/^[A-Z]{2}$/.test(countryCode)
    ) {
        throw new MetaTargetingSearchError(
            "countryCode must be a two-letter ISO country code.",
            400,
        );
    }

    const regionId = input.regionId?.trim();

    if (
        regionId !== undefined &&
        !/^\d+$/.test(regionId)
    ) {
        throw new MetaTargetingSearchError(
            "regionId must contain numeric digits.",
            400,
        );
    }

    const limit = input.limit ?? 25;

    if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100
    ) {
        throw new MetaTargetingSearchError(
            "limit must be between 1 and 100.",
            400,
        );
    }

    const after = input.after?.trim();

    if (after && after.length > 1000) {
        throw new MetaTargetingSearchError(
            "Invalid pagination cursor.",
            400,
        );
    }

    // 5. Retrieve this user's Meta access token
    const accessToken = await getProviderAccessToken(
        userId,
        "metaAds",
    );

    // 6. Build Meta Targeting Search request
    const apiVersion = getMetaTargetingApiVersion();

    const url = new URL(
        `https://graph.facebook.com/${apiVersion}/search`,
    );

    url.searchParams.set("type", "adgeolocation");
    url.searchParams.set("q", query);
    url.searchParams.set(
        "location_types",
        JSON.stringify([type]),
    );
    url.searchParams.set("limit", String(limit));

    if (countryCode) {
        url.searchParams.set("country_code", countryCode);
    }

    if (regionId) {
        url.searchParams.set("region_id", regionId);
    }

    if (after) {
        url.searchParams.set("after", after);
    }

    // 7. Call Meta
    let response: Response;
    let responseBody: MetaLocationApiResponse;

    try {
        response = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
            },
            signal: AbortSignal.timeout(30_000),
        });

        responseBody =
            (await response.json()) as MetaLocationApiResponse;
    } catch (error) {
        throw new MetaTargetingSearchError(
            error instanceof Error
                ? `Meta location search request failed: ${error.message}`
                : "Could not reach Meta Graph API.",
            502,
        );
    }

    // 8. Handle Meta errors
    if (!response.ok || responseBody.error) {
        const metaError = responseBody.error;

        throw new MetaTargetingSearchError(
            metaError?.message ||
            `Meta location search failed with HTTP ${response.status}.`,
            response.status >= 400 ? response.status : 502,
            metaError ?? responseBody,
        );
    }

    // 9. Normalize results
    const locations: MetaTargetingLocation[] = (
        responseBody.data ?? []
    )
        .filter(
            (location) =>
                typeof location.key === "string" &&
                location.key.length > 0 &&
                typeof location.name === "string" &&
                location.name.length > 0,
        )
        .map((location) => ({
            key: location.key!,
            name: location.name!,
            type: location.type ?? type,
            countryCode: location.country_code ?? null,
            countryName: location.country_name ?? null,
            region: location.region ?? null,
            regionId: location.region_id ?? null,
            ...(typeof location.latitude === "number" && {
                latitude: location.latitude,
            }),
            ...(typeof location.longitude === "number" && {
                longitude: location.longitude,
            }),
        }));

    const nextCursor = extractNextCursor(responseBody.paging);

    return {
        query,
        type,
        count: locations.length,
        locations,
        pagination: {
            hasMore: Boolean(responseBody.paging?.next),
            nextCursor,
        },
    };
}

export type MetaDetailedTargetingKind =
    | "interest"
    | "behavior"
    | "demographic"
    | "life_event"
    | "industry"
    | "family_status"
    | "income";

export interface SearchMetaDetailedTargetingInput {
    kind: MetaDetailedTargetingKind;
    query?: string;
    limit?: number;
    after?: string;
}

export interface MetaDetailedTargetingOption {
    id: string;
    name: string;
    targetingField: string;
    category: string | null;
    path: string[];
    description: string | null;
    audienceSizeLowerBound: number | null;
    audienceSizeUpperBound: number | null;
}


interface MetaDetailedTargetingApiItem {
    id?: string | number;
    name?: string;
    type?: string;
    path?: string[];
    description?: string;
    audience_size_lower_bound?: number;
    audience_size_upper_bound?: number;
}

interface MetaDetailedTargetingApiResponse {
    data?:
    | MetaDetailedTargetingApiItem[]
    | Record<string, MetaDetailedTargetingApiItem>;
    paging?: {
        next?: string;
        cursors?: {
            after?: string;
        };
    };
    error?: {
        message?: string;
        type?: string;
        code?: number;
        error_subcode?: number;
        fbtrace_id?: string;
    };
}

const META_DETAILED_TARGETING_CONFIG = {
    interest: {
        apiType: "adinterest",
        targetingField: "interests",
        category: null,
    },
    behavior: {
        apiType: "adTargetingCategory",
        targetingField: "behaviors",
        category: "behaviors",
    },
    demographic: {
        apiType: "adTargetingCategory",
        targetingField: "demographics",
        category: "demographics",
    },
    life_event: {
        apiType: "adTargetingCategory",
        targetingField: "life_events",
        category: "life_events",
    },
    industry: {
        apiType: "adTargetingCategory",
        targetingField: "industries",
        category: "industries",
    },
    family_status: {
        apiType: "adTargetingCategory",
        targetingField: "family_statuses",
        category: "family_statuses",
    },
    income: {
        apiType: "adTargetingCategory",
        targetingField: "income",
        category: "income",
    },
} as const;

function getMetaDetailedTargetingCursor(
    paging: MetaDetailedTargetingApiResponse["paging"],
): string | null {
    if (paging?.cursors?.after) {
        return paging.cursors.after;
    }

    if (paging?.next) {
        try {
            return new URL(paging.next).searchParams.get("after");
        } catch {
            return null;
        }
    }

    return null;
}
export interface MetaCustomAudience {
    id: string;
    name: string;
    description: string | null;
    subtype: string;
    audienceKind: "CUSTOM" | "LOOKALIKE";
    approximateCountLowerBound: number | null;
    approximateCountUpperBound: number | null;
    operationStatus: unknown;
    deliveryStatus: unknown;
    lookalikeSpec: unknown;
}

export interface MetaSavedAudience {
    id: string;
    name: string;
    description: string | null;
    targeting: Record<string, unknown> | null;
    approximateCountLowerBound: number | null;
    approximateCountUpperBound: number | null;
    runStatus: string | null;
}

interface MetaAudienceApiItem {
    id?: string;
    name?: string;
    description?: string;
    subtype?: string;
    targeting?: Record<string, unknown>;
    approximate_count_lower_bound?: number;
    approximate_count_upper_bound?: number;
    operation_status?: unknown;
    delivery_status?: unknown;
    lookalike_spec?: unknown;
    run_status?: string;
}

interface MetaAudienceApiResponse {
    data?: MetaAudienceApiItem[];
    paging?: {
        next?: string;
        cursors?: {
            after?: string;
        };
    };
    error?: {
        message?: string;
        type?: string;
        code?: number;
        error_subcode?: number;
        fbtrace_id?: string;
    };
}

interface MetaAudienceListOptions {
    limit?: number;
    after?: string;
}

function normalizeMetaAudienceAccountId(value: string): string {
    const normalized = value.trim().replace(/^act_/, "");

    if (!/^\d+$/.test(normalized)) {
        throw new MetaTargetingSearchError(
            "Invalid Meta ad account ID.",
            400,
        );
    }

    return `act_${normalized}`;
}

function getMetaAudienceNextCursor(
    paging: MetaAudienceApiResponse["paging"],
): string | null {
    if (paging?.cursors?.after) {
        return paging.cursors.after;
    }

    if (paging?.next) {
        try {
            return new URL(paging.next).searchParams.get("after");
        } catch {
            return null;
        }
    }

    return null;
}

async function fetchMetaAudienceEdge(
    userId: string,
    selectedAccountId: string,
    edge: "customaudiences" | "saved_audiences",
    fields: string[],
    options: MetaAudienceListOptions = {},
) {
    if (!userId?.trim()) {
        throw new MetaTargetingSearchError(
            "Authenticated user ID is required.",
            401,
        );
    }

    const accountId =
        normalizeMetaAudienceAccountId(selectedAccountId);

    const limit = options.limit ?? 50;

    if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100
    ) {
        throw new MetaTargetingSearchError(
            "Audience limit must be between 1 and 100.",
            400,
        );
    }

    const after = options.after?.trim();

    if (after && after.length > 1000) {
        throw new MetaTargetingSearchError(
            "Invalid audience pagination cursor.",
            400,
        );
    }

    const accessToken = await getProviderAccessToken(
        userId,
        "metaAds",
    );

    const url = new URL(
        `https://graph.facebook.com/${getMetaTargetingApiVersion()}/${accountId}/${edge}`,
    );

    url.searchParams.set("fields", fields.join(","));
    url.searchParams.set("limit", String(limit));

    if (after) {
        url.searchParams.set("after", after);
    }

    let response: Response;
    let body: MetaAudienceApiResponse;

    try {
        response = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
            },
            signal: AbortSignal.timeout(30_000),
        });

        body = (await response.json()) as MetaAudienceApiResponse;
    } catch (error) {
        throw new MetaTargetingSearchError(
            error instanceof Error
                ? error.message
                : "Could not reach Meta Graph API.",
            502,
        );
    }

    if (!response.ok || body.error) {
        throw new MetaTargetingSearchError(
            body.error?.message ||
            `Meta audience request failed with HTTP ${response.status}.`,
            response.status || 502,
            body.error ?? body,
        );
    }

    return {
        items: body.data ?? [],
        pagination: {
            hasMore: Boolean(body.paging?.next),
            nextCursor: getMetaAudienceNextCursor(body.paging),
        },
    };
}

/**
 * List the account's Custom Audiences and Lookalike Audiences.
 */
export async function listMetaCustomAudiences(
    userId: string,
    selectedAccountId: string,
    options: MetaAudienceListOptions = {},
) {
    const result = await fetchMetaAudienceEdge(
        userId,
        selectedAccountId,
        "customaudiences",
        [
            "id",
            "name",
            "description",
            "subtype",
            "approximate_count_lower_bound",
            "approximate_count_upper_bound",
            "operation_status",
            "delivery_status",
            "lookalike_spec",
        ],
        options,
    );

    const audiences: MetaCustomAudience[] = result.items
        .filter((item) => item.id && item.name)
        .map((item) => {
            const subtype = (item.subtype ?? "CUSTOM").toUpperCase();

            return {
                id: item.id!,
                name: item.name!,
                description: item.description ?? null,
                subtype,
                audienceKind:
                    subtype === "LOOKALIKE" ? "LOOKALIKE" : "CUSTOM",
                approximateCountLowerBound:
                    item.approximate_count_lower_bound ?? null,
                approximateCountUpperBound:
                    item.approximate_count_upper_bound ?? null,
                operationStatus: item.operation_status ?? null,
                deliveryStatus: item.delivery_status ?? null,
                lookalikeSpec: item.lookalike_spec ?? null,
            };
        });

    return {
        count: audiences.length,
        audiences,
        pagination: result.pagination,
    };
}

/**
 * List reusable Saved Audiences with their targeting specifications.
 */
export async function listMetaSavedAudiences(
    userId: string,
    selectedAccountId: string,
    options: MetaAudienceListOptions = {},
) {
    const result = await fetchMetaAudienceEdge(
        userId,
        selectedAccountId,
        "saved_audiences",
        [
            "id",
            "name",
            "description",
            "targeting",
            "approximate_count_lower_bound",
            "approximate_count_upper_bound",
            "run_status",
        ],
        options,
    );

    const audiences: MetaSavedAudience[] = result.items
        .filter((item) => item.id && item.name)
        .map((item) => ({
            id: item.id!,
            name: item.name!,
            description: item.description ?? null,
            targeting: item.targeting ?? null,
            approximateCountLowerBound:
                item.approximate_count_lower_bound ?? null,
            approximateCountUpperBound:
                item.approximate_count_upper_bound ?? null,
            runStatus: item.run_status ?? null,
        }));

    return {
        count: audiences.length,
        audiences,
        pagination: result.pagination,
    };
}
/*
// export async function searchMetaDetailedTargeting(
//     userId: string,
//     input: SearchMetaDetailedTargetingInput,
// ) {
//     // 1. Validate user
//     if (!userId?.trim()) {
//         throw new MetaTargetingSearchError(
//             "Authenticated user ID is required.",
//             401,
//         );
//     }

//     // 2. Resolve supported search configuration
//     const config =
//         META_DETAILED_TARGETING_CONFIG[input.kind];

//     if (!config) {
//         throw new MetaTargetingSearchError(
//             "Unsupported detailed targeting search type.",
//             400,
//         );
//     }

//     // 3. Validate query
//     const query = input.query?.trim();

//     if (
//         input.kind === "interest" &&
//         (!query || query.length < 2 || query.length > 100)
//     ) {
//         throw new MetaTargetingSearchError(
//             "Interest search requires a query between 2 and 100 characters.",
//             400,
//         );
//     }

//     if (query && (query.length < 2 || query.length > 100)) {
//         throw new MetaTargetingSearchError(
//             "Search query must contain between 2 and 100 characters.",
//             400,
//         );
//     }

//     // 4. Validate pagination
//     const limit = input.limit ?? 25;

//     if (
//         !Number.isInteger(limit) ||
//         limit < 1 ||
//         limit > 100
//     ) {
//         throw new MetaTargetingSearchError(
//             "limit must be between 1 and 100.",
//             400,
//         );
//     }

//     const after = input.after?.trim();

//     if (after && after.length > 1000) {
//         throw new MetaTargetingSearchError(
//             "Invalid pagination cursor.",
//             400,
//         );
//     }

//     // 5. Get authenticated user's Meta token
//     const accessToken = await getProviderAccessToken(
//         userId,
//         "metaAds",
//     );

//     // 6. Build Meta search request
//     const apiVersion = getMetaTargetingApiVersion();

//     const url = new URL(
//         `https://graph.facebook.com/${apiVersion}/search`,
//     );

//     url.searchParams.set("type", config.apiType);
//     url.searchParams.set("limit", String(limit));

//     if (query) {
//         url.searchParams.set("q", query);
//     }

//     if (config.category) {
//         url.searchParams.set("class", config.category);
//     }

//     if (after) {
//         url.searchParams.set("after", after);
//     }

//     // 7. Call Meta API
//     let response: Response;
//     let responseBody: MetaDetailedTargetingApiResponse;

//     try {
//         response = await fetch(url, {
//             method: "GET",
//             headers: {
//                 Authorization: `Bearer ${accessToken}`,
//                 Accept: "application/json",
//             },
//             signal: AbortSignal.timeout(30_000),
//         });

//         responseBody =
//             (await response.json()) as MetaDetailedTargetingApiResponse;
//     } catch (error) {
//         throw new MetaTargetingSearchError(
//             error instanceof Error
//                 ? `Meta detailed targeting search failed: ${error.message}`
//                 : "Could not reach Meta Graph API.",
//             502,
//         );
//     }

//     // 8. Handle Meta API errors
//     if (!response.ok || responseBody.error) {
//         throw new MetaTargetingSearchError(
//             responseBody.error?.message ||
//             `Meta targeting search failed with HTTP ${response.status}.`,
//             response.status,
//             responseBody.error ?? responseBody,
//         );
//     }

//     // 9. Normalize array or object responses
//     const rawItems = responseBody.data;

//     const items: MetaDetailedTargetingApiItem[] =
//         Array.isArray(rawItems)
//             ? rawItems
//             : rawItems && typeof rawItems === "object"
//                 ? Object.values(rawItems)
//                 : [];

//     const results: MetaDetailedTargetingOption[] = items
//         .filter(
//             (item) =>
//                 (typeof item.id === "string" ||
//                     typeof item.id === "number") &&
//                 typeof item.name === "string" &&
//                 item.name.trim().length > 0,
//         )
//         .map((item) => ({
//             id: String(item.id),
//             name: item.name!.trim(),

//             // Use the mapped field to keep the frontend consistent.
//             targetingField: config.targetingField,
//             category: config.category,

//             path: Array.isArray(item.path)
//                 ? item.path.filter(
//                     (part): part is string =>
//                         typeof part === "string",
//                 )
//                 : [],

//             description:
//                 typeof item.description === "string"
//                     ? item.description
//                     : null,

//             audienceSizeLowerBound:
//                 typeof item.audience_size_lower_bound === "number"
//                     ? item.audience_size_lower_bound
//                     : null,

//             audienceSizeUpperBound:
//                 typeof item.audience_size_upper_bound === "number"
//                     ? item.audience_size_upper_bound
//                     : null,
//         }));

//     const nextCursor = getMetaDetailedTargetingCursor(
//         responseBody.paging,
//     );

//     return {
//         kind: input.kind,
//         query: query ?? null,
//         count: results.length,
//         results,
//         pagination: {
//             hasMore: Boolean(responseBody.paging?.next),
//             nextCursor,
//         },
//     };
// }


// export type MetaDetailedTargetingKind =
//     | "interest"
//     | "behavior"
//     | "demographic"
//     | "life_event"
//     | "industry"
//     | "family_status"
//     | "income";
*/
export interface SearchMetaDetailedTargetingInput {
    kind: MetaDetailedTargetingKind;
    query?: string;
    limit?: number;
    after?: string;
}

export interface MetaDetailedTargetingOption {
    id: string;
    name: string;
    targetingField: string;
    category: string | null;
    path: string[];
    description: string | null;
    audienceSizeLowerBound: number | null;
    audienceSizeUpperBound: number | null;
}

interface MetaDetailedTargetingApiItem {
    id?: string | number;
    name?: string;
    type?: string;
    path?: string[];
    description?: string;
    audience_size_lower_bound?: number;
    audience_size_upper_bound?: number;
    [key: string]: unknown;
}

interface MetaDetailedTargetingApiResponse {
    data?:
    | MetaDetailedTargetingApiItem[]
    | Record<string, MetaDetailedTargetingApiItem>;
    paging?: {
        next?: string;
        cursors?: {
            after?: string;
        };
    };
    error?: {
        message?: string;
        type?: string;
        code?: number;
        error_subcode?: number;
        fbtrace_id?: string;
    };
}

// const META_DETAILED_TARGETING_CONFIG = {
//     interest: {
//         apiType: "adinterest",
//         targetingField: "interests",
//         category: null,
//     },
//     behavior: {
//         apiType: "adTargetingCategory",
//         targetingField: "behaviors",
//         category: "behaviors",
//     },
//     demographic: {
//         apiType: "adTargetingCategory",
//         targetingField: "demographics",
//         category: "demographics",
//     },
//     life_event: {
//         apiType: "adTargetingCategory",
//         targetingField: "life_events",
//         category: "life_events",
//     },
//     industry: {
//         apiType: "adTargetingCategory",
//         targetingField: "industries",
//         category: "industries",
//     },
//     family_status: {
//         apiType: "adTargetingCategory",
//         targetingField: "family_statuses",
//         category: "family_statuses",
//     },
//     income: {
//         apiType: "adTargetingCategory",
//         targetingField: "income",
//         category: "income",
//     },
// } as const;

// function getMetaDetailedTargetingCursor(
//     paging: MetaDetailedTargetingApiResponse["paging"],
// ): string | null {
//     if (paging?.cursors?.after) {
//         return paging.cursors.after;
//     }

//     if (paging?.next) {
//         try {
//             return new URL(paging.next).searchParams.get("after");
//         } catch {
//             return null;
//         }
//     }

//     return null;
// }

export async function searchMetaDetailedTargeting(
    userId: string,
    input: SearchMetaDetailedTargetingInput,
) {
    // 1. Validate user
    if (!userId?.trim()) {
        throw new MetaTargetingSearchError(
            "Authenticated user ID is required.",
            401,
        );
    }

    // 2. Resolve supported search configuration
    const config =
        META_DETAILED_TARGETING_CONFIG[input.kind];

    if (!config) {
        throw new MetaTargetingSearchError(
            "Unsupported detailed targeting search type.",
            400,
        );
    }

    // 3. Validate query
    const query = input.query?.trim();

    if (
        input.kind === "interest" &&
        (!query || query.length < 2 || query.length > 100)
    ) {
        throw new MetaTargetingSearchError(
            "Interest search requires a query between 2 and 100 characters.",
            400,
        );
    }

    if (query && (query.length < 2 || query.length > 100)) {
        throw new MetaTargetingSearchError(
            "Search query must contain between 2 and 100 characters.",
            400,
        );
    }

    // 4. Validate pagination
    const limit = input.limit ?? 25;

    if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100
    ) {
        throw new MetaTargetingSearchError(
            "limit must be between 1 and 100.",
            400,
        );
    }

    const after = input.after?.trim();

    if (after && after.length > 1000) {
        throw new MetaTargetingSearchError(
            "Invalid pagination cursor.",
            400,
        );
    }

    // 5. Get authenticated user's Meta token
    const accessToken = await getProviderAccessToken(
        userId,
        "metaAds",
    );

    // 6. Build Meta search request
    const apiVersion = getMetaTargetingApiVersion();

    const url = new URL(
        `https://graph.facebook.com/${apiVersion}/search`,
    );

    url.searchParams.set("type", config.apiType);
    url.searchParams.set("limit", String(limit));

    if (query) {
        url.searchParams.set("q", query);
    }

    if (config.category) {
        url.searchParams.set("class", config.category);
    }

    if (after) {
        url.searchParams.set("after", after);
    }

    // 7. Call Meta API
    let response: Response;
    let responseBody: MetaDetailedTargetingApiResponse;

    try {
        response = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
            },
            signal: AbortSignal.timeout(30_000),
        });

        responseBody =
            (await response.json()) as MetaDetailedTargetingApiResponse;
    } catch (error) {
        throw new MetaTargetingSearchError(
            error instanceof Error
                ? `Meta detailed targeting search failed: ${error.message}`
                : "Could not reach Meta Graph API.",
            502,
        );
    }

    // 8. Handle Meta API errors
    if (!response.ok || responseBody.error) {
        throw new MetaTargetingSearchError(
            responseBody.error?.message ||
            `Meta targeting search failed with HTTP ${response.status}.`,
            response.status,
            responseBody.error ?? responseBody,
        );
    }

    // 9. Normalize array or object responses
    const rawItems = responseBody.data;

    const items: MetaDetailedTargetingApiItem[] =
        Array.isArray(rawItems)
            ? rawItems
            : rawItems && typeof rawItems === "object"
                ? Object.values(rawItems)
                : [];

    const results: MetaDetailedTargetingOption[] = items
        .filter(
            (item) =>
                (typeof item.id === "string" ||
                    typeof item.id === "number") &&
                typeof item.name === "string" &&
                item.name.trim().length > 0,
        )
        .map((item) => ({
            id: String(item.id),
            name: item.name!.trim(),

            // Use the mapped field to keep the frontend consistent.
            targetingField: config.targetingField,
            category: config.category,

            path: Array.isArray(item.path)
                ? item.path.filter(
                    (part): part is string =>
                        typeof part === "string",
                )
                : [],

            description:
                typeof item.description === "string"
                    ? item.description
                    : null,

            audienceSizeLowerBound:
                typeof item.audience_size_lower_bound === "number"
                    ? item.audience_size_lower_bound
                    : null,

            audienceSizeUpperBound:
                typeof item.audience_size_upper_bound === "number"
                    ? item.audience_size_upper_bound
                    : null,
        }));

    const nextCursor = getMetaDetailedTargetingCursor(
        responseBody.paging,
    );

    return {
        kind: input.kind,
        query: query ?? null,
        count: results.length,
        results,
        pagination: {
            hasMore: Boolean(responseBody.paging?.next),
            nextCursor,
        },
    };
}