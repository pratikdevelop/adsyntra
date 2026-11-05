import { Router, type Request, type Response } from "express";

import AdAccountModel from "../models/ad-account.model.js";
import ProviderConnectionModel from "../models/provider-connection.model.js";
import {
    getCampaigns as getGoogleCampaigns,
    type GoogleCampaignRow,
    type GoogleCampaignListResponse,
} from "../googleadsAPI/services/campaign.js";
import {
    getCampaigns as getMetaCampaigns,
    type MetaCampaignRow,
    type MetaCampaignListResponse,
} from "../metaadsAPI/services/campaign.js";

const router = Router();

type ProviderKey = "googleAds" | "metaAds";
type CampaignStatus = "not_connected" | "not_selected" | "ready" | "error";

interface AccountSummary {
    id: string;
    name: string;
    currency: string | null;
    timezone: string | null;
}

interface NormalizedCampaign {
    id: string;
    provider: ProviderKey;
    accountId: string;
    name: string;
    status: string | null;
    effectiveStatus: string | null;
    objective: string | null;
    campaignType: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    source: GoogleCampaignRow | MetaCampaignRow;
}

interface Pagination {
    hasMore: boolean;
    nextToken: string | null;
}

interface ProviderCampaignState {
    connected: boolean;
    status: CampaignStatus;
    account: AccountSummary | null;
    campaigns: NormalizedCampaign[];
    pagination: Pagination;
    error: { message: string } | null;
}

const EMPTY_PAGINATION: Pagination = {
    hasMore: false,
    nextToken: null,
};

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return "An unexpected provider error occurred.";
}

function getOptionalQueryString(
    req: Request,
    key: string,
): { value?: string; invalid: boolean } {
    const raw = req.query[key];

    if (raw === undefined) return { invalid: false };
    if (typeof raw !== "string" || !raw.trim()) {
        return { invalid: true };
    }

    // Preserve opaque provider cursors; do not trim or decode their value.
    return { value: raw, invalid: false };
}

function normalizeGoogleCampaigns(
    accountId: string,
    rows: GoogleCampaignRow[],
): NormalizedCampaign[] {
    return rows.flatMap((row) => {
        const campaign = row.campaign;
        if (!campaign?.id) return [];

        return [{
            id: String(campaign.id),
            provider: "googleAds" as const,
            accountId,
            name: campaign.name ?? "Untitled campaign",
            status: campaign.status ?? null,
            effectiveStatus: campaign.status ?? null,
            objective: null,
            campaignType: campaign.advertisingChannelType ?? null,
            createdAt: null,
            updatedAt: null,
            source: row,
        }];
    });
}

function normalizeMetaCampaigns(
    accountId: string,
    rows: MetaCampaignRow[],
): NormalizedCampaign[] {
    return rows.flatMap((row) => {
        if (!row.id) return [];

        return [{
            id: String(row.id),
            provider: "metaAds" as const,
            accountId,
            name: row.name ?? "Untitled campaign",
            status: row.status ?? null,
            effectiveStatus: row.effective_status ?? row.status ?? null,
            objective: row.objective ?? null,
            campaignType: row.buying_type ?? null,
            createdAt: row.created_time ?? null,
            updatedAt: row.updated_time ?? null,
            source: row,
        }];
    });
}

function createInitialProviderState(
    provider: ProviderKey,
    connectionStatus: string | null,
    account: AccountSummary | null,
): ProviderCampaignState {
    const connected = connectionStatus === "connected";

    if (!connected) {
        return {
            connected: false,
            status: "not_connected",
            account,
            campaigns: [],
            pagination: EMPTY_PAGINATION,
            error: {
                message: `${provider === "googleAds" ? "Google Ads" : "Meta Ads"} is not connected.`,
            },
        };
    }

    if (!account) {
        return {
            connected: true,
            status: "not_selected",
            account: null,
            campaigns: [],
            pagination: EMPTY_PAGINATION,
            error: null,
        };
    }

    return {
        connected: true,
        status: "ready",
        account,
        campaigns: [],
        pagination: EMPTY_PAGINATION,
        error: null,
    };
}

function applyGoogleResult(
    state: ProviderCampaignState,
    result: PromiseSettledResult<GoogleCampaignListResponse>,
    accountId: string,
): void {
    if (result.status === "rejected") {
        state.status = "error";
        state.error = { message: getErrorMessage(result.reason) };
        return;
    }

    state.campaigns = normalizeGoogleCampaigns(accountId, result.value.campaigns);
    state.pagination = result.value.pagination;
}

function applyMetaResult(
    state: ProviderCampaignState,
    result: PromiseSettledResult<MetaCampaignListResponse>,
    accountId: string,
): void {
    if (result.status === "rejected") {
        state.status = "error";
        state.error = { message: getErrorMessage(result.reason) };
        return;
    }

    state.campaigns = normalizeMetaCampaigns(accountId, result.value.campaigns);
    state.pagination = result.value.pagination;
}

/**
 * GET /api/campaigns
 * Aggregates the first page of campaigns from the user's selected Google and
 * Meta ad accounts. Provider cursors are supplied independently through
 * googlePageToken and metaPageToken query parameters.
 */
router.get("/", async (req: Request, res: Response) => {
    const userId = req.auth()?.userId;

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Authentication required.",
        });
    }

    const googlePageToken = getOptionalQueryString(req, "googlePageToken");
    const metaPageToken = getOptionalQueryString(req, "metaPageToken");

    if (googlePageToken.invalid || metaPageToken.invalid) {
        return res.status(400).json({
            success: false,
            message: "Pagination tokens must be non-empty strings.",
        });
    }

    try {
        // Resolve selected accounts and connection states from MongoDB. No
        // provider API is called when its account is not selected and active.
        const [selectedAccounts, providerConnections] = await Promise.all([
            AdAccountModel.find({
                userId,
                isSelected: true,
                status: "active",
                provider: { $in: ["googleAds", "metaAds"] },
            })
                .select("provider externalAccountId name currency timezone")
                .lean()
                .exec(),
            ProviderConnectionModel.find({
                userId,
                provider: { $in: ["googleAds", "metaAds"] },
            })
                .select("provider status")
                .lean()
                .exec(),
        ]);

        const accountByProvider = new Map<ProviderKey, AccountSummary>();
        for (const account of selectedAccounts) {
            accountByProvider.set(account.provider as ProviderKey, {
                id: account.externalAccountId,
                name: account.name,
                currency: account.currency ?? null,
                timezone: account.timezone ?? null,
            });
        }

        const connectionStatusByProvider = new Map<ProviderKey, string>();
        for (const connection of providerConnections) {
            connectionStatusByProvider.set(
                connection.provider as ProviderKey,
                connection.status,
            );
        }

        const googleAccount = accountByProvider.get("googleAds") ?? null;
        const metaAccount = accountByProvider.get("metaAds") ?? null;

        const googleState = createInitialProviderState(
            "googleAds",
            connectionStatusByProvider.get("googleAds") ?? null,
            googleAccount,
        );
        const metaState = createInitialProviderState(
            "metaAds",
            connectionStatusByProvider.get("metaAds") ?? null,
            metaAccount,
        );

        const googleRequest =
            googleState.status === "ready" && googleAccount
                ? getGoogleCampaigns(userId, googleAccount.id, googlePageToken.value)
                : null;
        const metaRequest =
            metaState.status === "ready" && metaAccount
                ? getMetaCampaigns(userId, metaAccount.id, metaPageToken.value)
                : null;

        // allSettled ensures one provider's outage never discards the other's data.
        const [googleResult, metaResult] = await Promise.all([
            googleRequest ? Promise.allSettled([googleRequest]) : Promise.resolve(null),
            metaRequest ? Promise.allSettled([metaRequest]) : Promise.resolve(null),
        ]);

        let providersSucceeded = 0;
        let providersFailed = 0;

        if (googleResult?.[0]) {
            applyGoogleResult(googleState, googleResult[0], googleAccount!.id);
            if (googleResult[0].status === "fulfilled") providersSucceeded += 1;
            else providersFailed += 1;
        }

        if (metaResult?.[0]) {
            applyMetaResult(metaState, metaResult[0], metaAccount!.id);
            if (metaResult[0].status === "fulfilled") providersSucceeded += 1;
            else providersFailed += 1;
        }

        const campaigns = [...googleState.campaigns, ...metaState.campaigns];

        return res.status(200).json({
            success: true,
            providers: {
                googleAds: googleState,
                metaAds: metaState,
            },
            campaigns,
            meta: {
                total: campaigns.length,
                providersSucceeded,
                providersFailed,
            },
        });
    } catch (error) {
        console.error("Get global campaigns error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve campaigns.",
        });
    }
});

export default router;
