import { Router, type Request } from "express";

import { getProviderAccessToken } from "../../services/provider-token.service.js";
import { saveProviderAccounts } from "../../services/connection-storage.service.js";

const router = Router();
const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v26.0";

type ClerkRequest = Request & { auth?: { userId?: string } };

type MetaAdAccount = {
    id: string;
    account_id?: string;
    name?: string;
    account_status?: number;
    currency?: string;
    timezone_name?: string;
    timezone_id?: number;
};

type MetaApiResponse<T> = {
    data?: T[];
    paging?: { cursors?: { after?: string } };
    error?: { message?: string; code?: number; type?: string; fbtrace_id?: string };
};

function getUserId(req: Request): string | null {
    return (req as ClerkRequest).auth?.userId ?? null;
}

async function fetchAllAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
    const accounts: MetaAdAccount[] = [];
    let after: string | undefined;

    while (accounts.length < 1000) {
        const url = new URL(
            `https://graph.facebook.com/${META_GRAPH_API_VERSION}/me/adaccounts`,
        );
        url.searchParams.set(
            "fields",
            "id,account_id,name,account_status,currency,timezone_name,timezone_id",
        );
        url.searchParams.set("limit", "100");
        if (after) url.searchParams.set("after", after);

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(30_000),
        });
        const body = (await response.json()) as MetaApiResponse<MetaAdAccount>;

        if (!response.ok) {
            throw new Error(body.error?.message || "Meta ad account request failed.");
        }

        const page = Array.isArray(body.data) ? body.data : [];
        accounts.push(...page);

        const nextCursor = body.paging?.cursors?.after;
        if (!nextCursor || page.length === 0) break;
        after = nextCursor;
    }

    return accounts.slice(0, 1000).map((account) => ({
        id: account.id,
        accountNumber: account.account_id ?? account.id.replace(/^act_/, ""),
        name: account.name ?? account.id,
        account_status: account.account_status,
        currency: account.currency,
        timezone_name: account.timezone_name,
        timezone_id: account.timezone_id,
    }));
}

// GET /api/meta-ads/ad-accounts
router.get("/ad-accounts", async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const accessToken = await getProviderAccessToken(userId, "metaAds");
        const accounts = await fetchAllAdAccounts(accessToken);

        await saveProviderAccounts(userId, "metaAds", accounts);
        return res.json({ data: accounts, count: accounts.length });
    } catch (error) {
        console.error(
            "Meta ad account request failed:",
            error instanceof Error ? error.message : "Unknown error",
        );
        return res.status(502).json({
            message: error instanceof Error
                ? error.message
                : "Could not retrieve Meta ad accounts.",
        });
    }
});

// GET /api/meta-ads/permissions
router.get("/permissions", async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const accessToken = await getProviderAccessToken(userId, "metaAds");
        const url = new URL(
            `https://graph.facebook.com/${META_GRAPH_API_VERSION}/me/permissions`,
        );

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(30_000),
        });
        const data = await response.json();

        if (!response.ok) {
            console.error("Meta permissions request failed:", response.status);
            return res.status(response.status).json({
                message: "Could not retrieve Meta permissions.",
            });
        }

        return res.json(data);
    } catch (error) {
        console.error(
            "Meta permissions request failed:",
            error instanceof Error ? error.message : "Unknown error",
        );
        return res.status(502).json({
            message: error instanceof Error
                ? error.message
                : "Could not retrieve Meta permissions.",
        });
    }
});

export default router;
