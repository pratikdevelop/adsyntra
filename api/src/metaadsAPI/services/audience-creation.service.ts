import { getProviderAccessToken } from "../../utils/provider-token.utils.js";

export type MetaWebsiteAudienceEvent = "PageView" | "ViewContent" | "AddToCart" | "Purchase";

export interface CreateMetaWebsiteCustomAudienceInput {
    name: string;
    description?: string;
    pixelId: string;
    retentionDays: number;
    eventName: MetaWebsiteAudienceEvent;
}

export interface MetaAudienceCreateResult {
    provider: "metaAds";
    id: string;
    name: string;
    subtype: "WEBSITE";
    pixelId: string;
    retentionDays: number;
}

export class MetaAudienceCreationError extends Error {
    constructor(
        message: string,
        public statusCode = 502,
        public details?: unknown,
    ) {
        super(message);
        this.name = "MetaAudienceCreationError";
    }
}

const ALLOWED_EVENTS: MetaWebsiteAudienceEvent[] = ["PageView", "ViewContent", "AddToCart", "Purchase"];

function normalizeAccountId(value: string): string {
    const id = value.trim().replace(/^act_/, "");
    if (!/^\d+$/.test(id)) {
        throw new MetaAudienceCreationError("Invalid Meta ad account ID.", 400);
    }
    return `act_${id}`;
}

function readName(value: unknown): string {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 400) {
        throw new MetaAudienceCreationError("Audience name is required and must be 400 characters or fewer.", 400);
    }
    return value.trim();
}

export async function createMetaWebsiteCustomAudience(
    userId: string,
    selectedAccountId: string,
    input: CreateMetaWebsiteCustomAudienceInput,
): Promise<MetaAudienceCreateResult> {
    if (!userId?.trim()) {
        throw new MetaAudienceCreationError("Authenticated user ID is required.", 401);
    }

    const accountId = normalizeAccountId(selectedAccountId);
    const name = readName(input.name);
    const description = typeof input.description === "string" ? input.description.trim() : "";
    if (description.length > 400) {
        throw new MetaAudienceCreationError("Description must be 400 characters or fewer.", 400);
    }

    const pixelId = typeof input.pixelId === "string" ? input.pixelId.trim() : "";
    if (!/^\d+$/.test(pixelId)) {
        throw new MetaAudienceCreationError("A valid numeric Meta Pixel/Dataset ID is required.", 400);
    }

    const retentionDays = Number(input.retentionDays);
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 180) {
        throw new MetaAudienceCreationError("Retention must be an integer between 1 and 180 days.", 400);
    }

    if (!ALLOWED_EVENTS.includes(input.eventName)) {
        throw new MetaAudienceCreationError("Unsupported website event. Choose PageView, ViewContent, AddToCart, or Purchase.", 400);
    }

    const apiVersion = process.env.META_ADS_API_VERSION?.trim() || "v27.0";
    if (!/^v\d+\.\d+$/.test(apiVersion)) {
        throw new MetaAudienceCreationError("Invalid META_ADS_API_VERSION configuration.", 500);
    }

    const accessToken = await getProviderAccessToken(userId, "metaAds");
    const rule = {
        inclusions: {
            operator: "or",
            rules: [{
                event_sources: [{ id: pixelId, type: "pixel" }],
                retention_seconds: retentionDays * 24 * 60 * 60,
                filter: {
                    operator: "and",
                    filters: [{ field: "event", operator: "eq", value: input.eventName }],
                },
            }],
        },
    };

    const params = new URLSearchParams();
    // Website Custom Audience creation uses the rule's event_sources to
    // identify the Pixel. In the current API version, do not send the legacy
    // top-level `subtype` or `pixel_id` parameters; Meta rejects `subtype`
    // with error 2654 / subcode 1870053 for this request.
    params.set("name", name);
    params.set("retention_days", String(retentionDays));
    params.set("rule", JSON.stringify(rule));
    if (description) params.set("description", description);

    let response: Response;
    let payload: Record<string, unknown> = {};
    try {
        response = await fetch(`https://graph.facebook.com/${apiVersion}/${accountId}/customaudiences`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body: params,
            signal: AbortSignal.timeout(30_000),
        });
        const text = await response.text();
        try {
            payload = text ? JSON.parse(text) as Record<string, unknown> : {};
        } catch {
            throw new MetaAudienceCreationError("Meta returned an invalid JSON response.", 502, text.slice(0, 1000));
        }
    } catch (error) {
        if (error instanceof MetaAudienceCreationError) throw error;
        throw new MetaAudienceCreationError(
            error instanceof Error ? `Unable to connect to Meta: ${error.message}` : "Unable to connect to Meta.",
            502,
        );
    }

    const metaError = payload.error as Record<string, unknown> | undefined;
    if (!response.ok || metaError) {
        const message = typeof metaError?.message === "string"
            ? metaError.message
            : `Meta audience creation failed with HTTP ${response.status}.`;
        const statusCode = response.status >= 400 && response.status <= 599
            ? response.status
            : 502;
        throw new MetaAudienceCreationError(message, statusCode, payload);
    }

    const id = typeof payload.id === "string" ? payload.id : "";
    if (!id) {
        throw new MetaAudienceCreationError("Meta did not return an audience ID.", 502, payload);
    }

    return { provider: "metaAds", id, name, subtype: "WEBSITE", pixelId, retentionDays };
}
