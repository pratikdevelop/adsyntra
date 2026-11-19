import { getGoogleAdsCreationContext } from "./campaign-creation.js";
import type { GoogleAdsCreationContext } from "../../interfaces/campaign-creation.js";

export type GoogleAgeRange = "18_24" | "25_34" | "35_44" | "45_54" | "55_64" | "65_PLUS";
export type GoogleGender = "MALE" | "FEMALE" | "UNDETERMINED";

export interface CreateGoogleWebsiteUserListInput {
    name: string;
    description?: string;
    urlContains: string;
    lookbackWindowDays: number;
}

export interface CreateGoogleReusableAudienceInput {
    name: string;
    description?: string;
    ageRanges: GoogleAgeRange[];
    genders: GoogleGender[];
    includeUndetermined?: boolean;
}

export interface GoogleAudienceCreateResult {
    provider: "googleAds";
    resourceName: string;
    resourceId: string | null;
    name: string;
    audienceType: "WEBSITE_USER_LIST" | "REUSABLE_AUDIENCE";
    googleResponse: Record<string, unknown>;
}

export class GoogleAudienceCreationError extends Error {
    constructor(
        message: string,
        public statusCode = 502,
        public details?: unknown,
    ) {
        super(message);
        this.name = "GoogleAudienceCreationError";
    }
}

function cleanName(value: unknown): string {
    if (typeof value !== "string") {
        throw new GoogleAudienceCreationError("Audience name is required.", 400);
    }
    const result = value.trim();
    if (!result || result.length > 255) {
        throw new GoogleAudienceCreationError("Audience name must be between 1 and 255 characters.", 400);
    }
    return result;
}

function cleanDescription(value: unknown): string | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string" || value.trim().length > 2048) {
        throw new GoogleAudienceCreationError("Description must be 2,048 characters or fewer.", 400);
    }
    return value.trim();
}

function validateLookback(value: unknown): number {
    const days = Number(value);
    if (!Number.isInteger(days) || days < 1 || days > 540) {
        throw new GoogleAudienceCreationError("Lookback window must be an integer between 1 and 540 days.", 400);
    }
    return days;
}

async function mutateGoogle(
    context: GoogleAdsCreationContext,
    resource: "userLists:mutate" | "audiences:mutate",
    body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    let response: Response;
    try {
        response = await fetch(
            `https://googleads.googleapis.com/${context.apiVersion}/customers/${context.customerId}/${resource}`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${context.accessToken}`,
                    "developer-token": context.developerToken,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(30_000),
            },
        );
    } catch (error) {
        throw new GoogleAudienceCreationError(
            error instanceof Error ? `Unable to connect to Google Ads: ${error.message}` : "Unable to connect to Google Ads.",
            502,
        );
    }

    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
        data = text ? JSON.parse(text) as Record<string, unknown> : {};
    } catch {
        throw new GoogleAudienceCreationError("Google Ads returned an invalid JSON response.", 502, text.slice(0, 1000));
    }

    if (!response.ok) {
        const error = data.error as Record<string, unknown> | undefined;
        const message = typeof error?.message === "string"
            ? error.message
            : `Google Ads audience creation failed with HTTP ${response.status}.`;
        throw new GoogleAudienceCreationError(message, response.status, data);
    }

    return data;
}

function getResourceName(data: Record<string, unknown>): string {
    const results = Array.isArray(data.results) ? data.results : [];
    const first = results[0] as Record<string, unknown> | undefined;
    const resourceName = typeof first?.resourceName === "string" ? first.resourceName : "";
    if (!resourceName) {
        throw new GoogleAudienceCreationError(
            "Google Ads returned no resource name for the created audience.",
            502,
            data,
        );
    }
    return resourceName;
}

/** Creates a URL-rule website remarketing user list via UserListService. */
export async function createGoogleWebsiteUserList(
    userId: string,
    accountId: string,
    input: CreateGoogleWebsiteUserListInput,
): Promise<GoogleAudienceCreateResult> {
    const name = cleanName(input.name);
    const description = cleanDescription(input.description);
    const urlContains = typeof input.urlContains === "string" ? input.urlContains.trim() : "";
    if (!urlContains || urlContains.length > 250 || /[\r\n\t"()]/.test(urlContains)) {
        throw new GoogleAudienceCreationError("URL contains must be a valid URL fragment without quotes, brackets, or whitespace control characters.", 400);
    }
    const lookbackWindowDays = validateLookback(input.lookbackWindowDays);
    const context = await getGoogleAdsCreationContext(userId, accountId);

    const data = await mutateGoogle(context, "userLists:mutate", {
        operations: [{
            create: {
                name,
                ...(description ? { description } : {}),
                membershipStatus: "OPEN",
                ruleBasedUserList: {
                    flexibleRuleUserList: {
                        inclusiveRuleOperator: "AND",
                        inclusiveOperands: [{
                            lookbackWindowDays,
                            rule: {
                                ruleItemGroups: [{
                                    ruleItems: [{
                                        name: "url__",
                                        stringRuleItem: {
                                            operator: "CONTAINS",
                                            value: urlContains,
                                        },
                                    }],
                                }],
                            },
                        }],
                        exclusiveOperands: [],
                    },
                },
            },
        }],
    });

    const resourceName = getResourceName(data);
    return {
        provider: "googleAds",
        resourceName,
        resourceId: resourceName.split("/").at(-1) ?? null,
        name,
        audienceType: "WEBSITE_USER_LIST",
        googleResponse: data,
    };
}

const AGE_RANGE_MAP: Record<GoogleAgeRange, { minAge: number; maxAge?: number }> = {
    "18_24": { minAge: 18, maxAge: 24 },
    "25_34": { minAge: 25, maxAge: 34 },
    "35_44": { minAge: 35, maxAge: 44 },
    "45_54": { minAge: 45, maxAge: 54 },
    "55_64": { minAge: 55, maxAge: 64 },
    "65_PLUS": { minAge: 65 },
};

const ALLOWED_GENDERS: GoogleGender[] = ["MALE", "FEMALE", "UNDETERMINED"];

/** Creates a customer-scoped reusable audience for Demand Gen/App/PMax audience workflows. */
export async function createGoogleReusableAudience(
    userId: string,
    accountId: string,
    input: CreateGoogleReusableAudienceInput,
): Promise<GoogleAudienceCreateResult> {
    const name = cleanName(input.name);
    const description = cleanDescription(input.description);
    const ageRanges = Array.isArray(input.ageRanges) ? [...new Set(input.ageRanges)] : [];
    const genders = Array.isArray(input.genders) ? [...new Set(input.genders)] : [];

    if (!ageRanges.length && !genders.length) {
        throw new GoogleAudienceCreationError("Select at least one age range or gender.", 400);
    }
    if (ageRanges.some((range) => !Object.prototype.hasOwnProperty.call(AGE_RANGE_MAP, range))) {
        throw new GoogleAudienceCreationError("One or more age ranges are invalid.", 400);
    }
    if (genders.some((gender) => !ALLOWED_GENDERS.includes(gender))) {
        throw new GoogleAudienceCreationError("One or more gender values are invalid.", 400);
    }

    const dimensions: Array<Record<string, unknown>> = [];
    if (ageRanges.length) {
        dimensions.push({
            age: {
                ageRanges: ageRanges.map((range) => AGE_RANGE_MAP[range]),
                includeUndetermined: input.includeUndetermined === true,
            },
        });
    }
    if (genders.length) {
        dimensions.push({
            gender: {
                genders,
                includeUndetermined: genders.includes("UNDETERMINED"),
            },
        });
    }

    const context = await getGoogleAdsCreationContext(userId, accountId);
    const data = await mutateGoogle(context, "audiences:mutate", {
        operations: [{
            create: {
                name,
                ...(description ? { description } : {}),
                scope: "CUSTOMER",
                dimensions,
            },
        }],
        responseContentType: "MUTABLE_RESOURCE",
    });

    const resourceName = getResourceName(data);
    return {
        provider: "googleAds",
        resourceName,
        resourceId: resourceName.split("/").at(-1) ?? null,
        name,
        audienceType: "REUSABLE_AUDIENCE",
        googleResponse: data,
    };
}
