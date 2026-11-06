import {
    ADVERTISING_PROVIDERS,
    type AdvertisingProvider,
    type ProviderCampaignConfiguration,
} from "../models/campaign.model.js";

export interface CampaignProviderLaunchInput {
    accountId: string;
    providerObjective: string;
    providerCampaignType: string;
    requestedProviderApiTarget?: string | null;
    configuration: ProviderCampaignConfiguration;
}

export interface CampaignExecutionOptions {
    validateOnly: boolean;
    confirm: boolean;
}
export interface CreateCampaignRequest {
    name: string;
    businessName: string;
    websiteUrl: string | null;
    description: string | null;
    objective: string;
    platforms: AdvertisingProvider[];
    providers: Partial<Record<AdvertisingProvider, CampaignProviderLaunchInput>>;
    execution: CampaignExecutionOptions;

}

export class CampaignRequestValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CampaignRequestValidationError";
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

function requiredString(
    value: unknown,
    fieldName: string,
    maxLength: number,
): string {
    if (typeof value !== "string" || !value.trim()) {
        throw new CampaignRequestValidationError(
            `${fieldName} is required and must be a non-empty string.`,
        );
    }

    const normalized = value.trim();

    if (normalized.length > maxLength) {
        throw new CampaignRequestValidationError(
            `${fieldName} must not exceed ${maxLength} characters.`,
        );
    }

    return normalized;
}

function optionalString(
    value: unknown,
    fieldName: string,
    maxLength: number,
): string | null {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    if (typeof value !== "string") {
        throw new CampaignRequestValidationError(
            `${fieldName} must be a string when provided.`,
        );
    }

    const normalized = value.trim();

    if (!normalized) {
        return null;
    }

    if (normalized.length > maxLength) {
        throw new CampaignRequestValidationError(
            `${fieldName} must not exceed ${maxLength} characters.`,
        );
    }

    return normalized;
}

function validateWebsiteUrl(value: string | null): string | null {
    if (!value) return null;

    try {
        const parsed = new URL(value);

        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            throw new Error("Unsupported URL protocol.");
        }
    } catch {
        throw new CampaignRequestValidationError(
            "websiteUrl must be a valid HTTP or HTTPS URL.",
        );
    }

    return value;
}

/**
 * Validates the shared campaign request envelope.
 * Provider-specific configuration validation belongs in the Google and Meta
 * creation services because their fields and requirements are different.
 */
export function parseCreateCampaignRequest(
    value: unknown,
): CreateCampaignRequest {
    if (!isRecord(value)) {
        throw new CampaignRequestValidationError(
            "The request body must be a JSON object.",
        );
    }

    const name = requiredString(value["name"], "name", 250);
    const businessName = requiredString(value["businessName"], "businessName", 250);
    const objective = requiredString(value["objective"], "objective", 100);
    const websiteUrl = validateWebsiteUrl(
        optionalString(value["websiteUrl"], "websiteUrl", 2048),
    );
    const description = optionalString(value["description"], "description", 5000);

    // ==========================================
    // CAMPAIGN EXECUTION OPTIONS
    // ==========================================

    // Default to validation-only for safety.

    const rawExecution = value["execution"];

    let execution: CampaignExecutionOptions = {
        validateOnly: true,
        confirm: false,
    };

    if (rawExecution !== undefined) {
        if (!isRecord(rawExecution)) {
            throw new CampaignRequestValidationError(
                "execution must be an object.",
            );
        }

        const validateOnly =
            rawExecution["validateOnly"] === undefined
                ? true
                : rawExecution["validateOnly"];

        const confirm =
            rawExecution["confirm"] === undefined
                ? false
                : rawExecution["confirm"];

        if (
            typeof validateOnly !== "boolean" ||
            typeof confirm !== "boolean"
        ) {
            throw new CampaignRequestValidationError(
                "execution.validateOnly and execution.confirm must be boolean values.",
            );
        }

        if (!validateOnly && !confirm) {
            throw new CampaignRequestValidationError(
                "Live campaign creation requires execution.confirm to be true.",
            );
        }

        execution = {
            validateOnly,
            confirm,
        };
    }

    if (!Array.isArray(value["platforms"]) || value["platforms"].length === 0) {
        throw new CampaignRequestValidationError(
            "platforms must contain at least one provider.",
        );
    }

    const platforms: AdvertisingProvider[] = [];

    for (const candidate of value["platforms"]) {
        if (
            typeof candidate !== "string" ||
            !(ADVERTISING_PROVIDERS as readonly string[]).includes(candidate)
        ) {
            throw new CampaignRequestValidationError(
                "platforms may contain only googleAds and metaAds.",
            );
        }

        const provider = candidate as AdvertisingProvider;

        if (platforms.includes(provider)) {
            throw new CampaignRequestValidationError(
                `platforms contains duplicate provider: ${provider}.`,
            );
        }

        platforms.push(provider);
    }

    if (!isRecord(value["providers"])) {
        throw new CampaignRequestValidationError(
            "providers must be an object containing configuration for each selected provider.",
        );
    }

    for (const providerKey of Object.keys(value["providers"])) {
        if (
            !(ADVERTISING_PROVIDERS as readonly string[]).includes(providerKey) ||
            !platforms.includes(providerKey as AdvertisingProvider)
        ) {
            throw new CampaignRequestValidationError(
                `Provider configuration '${providerKey}' was supplied but is not selected in platforms.`,
            );
        }
    }

    const providers: CreateCampaignRequest["providers"] = {};

    for (const provider of platforms) {
        const rawProvider = value["providers"][provider];

        if (!isRecord(rawProvider)) {
            throw new CampaignRequestValidationError(
                `providers.${provider} is required for the selected provider.`,
            );
        }

        const accountId = requiredString(
            rawProvider["accountId"],
            `providers.${provider}.accountId`,
            150,
        );
        const providerObjective = requiredString(
            rawProvider["providerObjective"],
            `providers.${provider}.providerObjective`,
            120,
        );
        const providerCampaignType = requiredString(
            rawProvider["providerCampaignType"],
            `providers.${provider}.providerCampaignType`,
            120,
        );

        if (!isRecord(rawProvider["configuration"])) {
            throw new CampaignRequestValidationError(
                `providers.${provider}.configuration must be an object.`,
            );
        }

        const requestedProviderApiTarget = optionalString(
            rawProvider["requestedProviderApiTarget"],
            `providers.${provider}.requestedProviderApiTarget`,
            250,
        );

        providers[provider] = {
            accountId,
            providerObjective,
            providerCampaignType,
            requestedProviderApiTarget,
            configuration: rawProvider["configuration"],
        };
    }

    return {
        name,
        businessName,
        websiteUrl,
        description,
        objective,
        platforms,
        providers,
        execution,
    };
}
