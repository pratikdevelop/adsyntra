import { getProviderAccessToken } from "../../utils/provider-token.utils.js";

export interface MetaInstagramIdentity {
    id: string;
    username?: string;
}

export interface MetaFacebookPage {
    id: string;
    name: string;
    tasks: string[];
    instagram_business_account: MetaInstagramIdentity | null;
}

interface MetaPagesApiResponse {
    data?: Array<{
        id?: string;
        name?: string;
        tasks?: string[];
        instagram_business_account?: {
            id?: string;
            username?: string;
        } | null;
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

export class MetaPageIdentityLookupError extends Error {
    constructor(
        message: string,
        public statusCode = 502,
        public details?: unknown,
    ) {
        super(message);
        this.name = "MetaPageIdentityLookupError";
    }
}

function getMetaApiVersion(): string {
    const version =
        process.env.META_ADS_API_VERSION?.trim() || "v27.0";

    if (!/^v\d+\.\d+$/.test(version)) {
        throw new MetaPageIdentityLookupError(
            "Invalid META_ADS_API_VERSION configuration.",
            500,
        );
    }

    return version;
}

export async function listMetaFacebookPages(
    userId: string,
    after?: string,
) {
    if (!userId?.trim()) {
        throw new MetaPageIdentityLookupError(
            "Authenticated user ID is required.",
            401,
        );
    }

    if (after && after.length > 2048) {
        throw new MetaPageIdentityLookupError(
            "Invalid Facebook Page pagination cursor.",
            400,
        );
    }

    const accessToken = await getProviderAccessToken(
        userId,
        "metaAds",
    );

    const apiVersion = getMetaApiVersion();

    const url = new URL(
        `https://graph.facebook.com/${apiVersion}/me/accounts`,
    );

    url.searchParams.set(
        "fields",
        "id,name,tasks,instagram_business_account{id,username}",
    );

    url.searchParams.set("limit", "100");

    if (after) {
        url.searchParams.set("after", after);
    }

    let response: Response;

    try {
        response = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
            },
            signal: AbortSignal.timeout(30000),
        });
    } catch (error) {
        throw new MetaPageIdentityLookupError(
            error instanceof Error
                ? `Unable to connect to Meta: ${error.message}`
                : "Unable to connect to Meta Graph API.",
            502,
        );
    }

    let payload: MetaPagesApiResponse;

    try {
        payload = await response.json() as MetaPagesApiResponse;
    } catch {
        throw new MetaPageIdentityLookupError(
            "Meta returned an invalid JSON response.",
            502,
        );
    }

    if (!response.ok || payload.error) {
        throw new MetaPageIdentityLookupError(
            payload.error?.message ||
                `Facebook Page lookup failed (${response.status}).`,
            response.status >= 400 && response.status <= 599
                ? response.status
                : 502,
            payload.error,
        );
    }

    const pages: MetaFacebookPage[] = (payload.data ?? [])
        .filter(
            (page): page is NonNullable<typeof page> & {
                id: string;
                name: string;
            } => Boolean(page.id && page.name),
        )
        .map((page) => ({
            id: page.id,
            name: page.name,
            tasks: Array.isArray(page.tasks)
                ? page.tasks
                : [],
            instagram_business_account:
                page.instagram_business_account?.id
                    ? {
                        id: page.instagram_business_account.id,
                        ...(page.instagram_business_account.username
                            ? {
                                username:
                                    page.instagram_business_account.username,
                            }
                            : {}),
                    }
                    : null,
        }));

    return {
        pages,
        pagination: {
            hasNextPage: Boolean(payload.paging?.next),
            nextCursor:
                payload.paging?.cursors?.after ?? null,
        },
    };
}