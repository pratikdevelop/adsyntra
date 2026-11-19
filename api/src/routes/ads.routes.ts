import { Router } from "express";
import type { Request, Response } from "express";
import { getAuth } from "@clerk/express";

import { getProviderAccessToken } from "../utils/provider-token.utils.js";
import AdAccountModel from "../models/ad-account.model.js";
import { getMetaAdsCreationContext } from "../metaadsAPI/services/campaign-creation.js";

// Update these two import paths to match where you saved the service files.
import {
    listGoogleAds,
    listGoogleAdsAdGroups,
    type ListGoogleAdsInput,
} from "../googleadsAPI/services/ads.js";
import {
    listMetaAccountAds,
    listMetaCampaignAdSets,
    listMetaAdSetAds,
    type MetaAdsServiceContext,
    type ListMetaAdsInput,
} from "../metaadsAPI/services/ads.js";

/* -------------------------------------------------------------------------- */
/* Authentication                                                            */
/* -------------------------------------------------------------------------- */

export function getAuthenticatedUserId(req: Request): string | null {
    const auth = getAuth(req);

    if (!auth.isAuthenticated || !auth.userId) {
        return null;
    }

    return auth.userId;
}

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

const router = Router();

class RouteError extends Error {
    statusCode: number;

    constructor(message: string, statusCode = 400) {
        super(message);
        this.name = "RouteError";
        this.statusCode = statusCode;
    }
}

function queryString(req: Request, key: string): string | undefined {
    const value = req.query[key];
    return typeof value === "string" && value.trim()
        ? value.trim()
        : undefined;
}

function queryNumber(
    req: Request,
    key: string,
    defaultValue: number,
): number {
    const value = queryString(req, key);
    if (value === undefined) return defaultValue;

    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
        throw new RouteError(`${key} must be an integer.`);
    }

    return parsed;
}

function sendError(res: Response, error: unknown) {
    const candidate = error as {
        message?: unknown;
        statusCode?: unknown;
    };

    const statusCode =
        typeof candidate?.statusCode === "number" &&
            Number.isInteger(candidate.statusCode) &&
            candidate.statusCode >= 400 &&
            candidate.statusCode <= 599
            ? candidate.statusCode
            : 500;

    const message =
        typeof candidate?.message === "string"
            ? candidate.message
            : "Unable to retrieve ads.";

    if (statusCode >= 500) {
        console.error("Ads route error:", error);
    }

    return res.status(statusCode).json({ message });
}

function requireAuthenticatedUser(req: Request, res: Response): string | null {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
        res.status(401).json({ message: "Authentication required." });
        return null;
    }

    return userId;
}


async function getSelectedAccount(userId: string, provider: "googleAds" | "metaAds") {
    const account = await AdAccountModel.findOne({
        userId,
        provider,
        isSelected: true,
    })
        .select("externalAccountId")
        .lean()
        .exec();

    if (!account?.externalAccountId) {
        throw new RouteError(`No selected ${provider === "googleAds" ? "Google Ads" : "Meta Ads"} account is available.`, 404);
    }

    return account;
}


/* -------------------------------------------------------------------------- */
/* Campaign hierarchy: Google Ads ad groups                                  */
/* GET /google/campaigns/:campaignId/ad-groups?pageToken=...                 */
/* -------------------------------------------------------------------------- */

router.get("/google/campaigns/:campaignId/ad-groups", async (req: Request, res: Response) => {
    try {
        const userId = requireAuthenticatedUser(req, res);
        if (!userId) return;
        const account = await getSelectedAccount(userId, "googleAds");
        const campaignId = String(req.params.campaignId ?? "").trim();
        const result = await listGoogleAdsAdGroups(
            userId,
            account.externalAccountId,
            campaignId,
            queryString(req, "pageToken"),
        );
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        return sendError(res, error);
    }
});

/* -------------------------------------------------------------------------- */
/* Campaign hierarchy: Google Ads by ad group                                */
/* GET /google/ad-groups/:adGroupId/ads?pageToken=...                         */
/* -------------------------------------------------------------------------- */

router.get("/google/ad-groups/:adGroupId/ads", async (req: Request, res: Response) => {
    try {
        const userId = requireAuthenticatedUser(req, res);
        if (!userId) return;
        const account = await getSelectedAccount(userId, "googleAds");
        const adGroupId = String(req.params.adGroupId ?? "").trim();
        const input: ListGoogleAdsInput = {
            adGroupId,
            campaignId: queryString(req, "campaignId"),
            pageToken: queryString(req, "pageToken"),
            metricsDateRange: "LAST_30_DAYS",
        };
        const result = await listGoogleAds(userId, account.externalAccountId, input);
        return res.status(200).json({ success: true, ...result, count: result.ads.length });
    } catch (error) {
        return sendError(res, error);
    }
});

/* -------------------------------------------------------------------------- */
/* Campaign hierarchy: Meta Ads ad sets                                      */
/* GET /meta/campaigns/:campaignId/ad-sets?after=...                          */
/* -------------------------------------------------------------------------- */

router.get("/meta/campaigns/:campaignId/ad-sets", async (req: Request, res: Response) => {
    try {
        const userId = requireAuthenticatedUser(req, res);
        if (!userId) return;
        const account = await getSelectedAccount(userId, "metaAds");
        const context = await getMetaAdsCreationContext(userId, account.externalAccountId);
        const result = await listMetaCampaignAdSets(context, {
            adAccountId: account.externalAccountId,
            campaignId: String(req.params.campaignId ?? "").trim(),
            limit: queryNumber(req, "limit", 25),
            after: queryString(req, "after"),
        });
        return res.status(200).json({ success: true, provider: "metaAds", ...result });
    } catch (error) {
        return sendError(res, error);
    }
});

/* -------------------------------------------------------------------------- */
/* Google Ads                                                                 */
/* GET /google/ads?accountId=1234567890                                      */
/* -------------------------------------------------------------------------- */

router.get("/google/ads", async (req: Request, res: Response) => {
    try {
        const userId = requireAuthenticatedUser(req, res);
        if (!userId) return;

        const accountId = queryString(req, "accountId");
        if (!accountId) {
            throw new RouteError("Google Ads accountId is required.");
        }

        const typesText = queryString(req, "types");

        const input: ListGoogleAdsInput = {
            campaignId: queryString(req, "campaignId"),
            adGroupId: queryString(req, "adGroupId"),
            adId: queryString(req, "adId"),
            status: queryString(req, "status") as ListGoogleAdsInput["status"],
            types: typesText
                ? typesText.split(",").map((item) => item.trim()).filter(Boolean)
                : undefined,
            adStrength: queryString(req, "adStrength") as ListGoogleAdsInput["adStrength"],
            approvalStatus: queryString(req, "approvalStatus") as ListGoogleAdsInput["approvalStatus"],
            includeRemoved: queryString(req, "includeRemoved") === "true",
            metricsDateRange: (
                queryString(req, "metricsDateRange") ?? "LAST_30_DAYS"
            ) as ListGoogleAdsInput["metricsDateRange"],
            pageToken: queryString(req, "pageToken"),
        };

        // Google service obtains the user's Google OAuth context internally.
        const result = await listGoogleAds(userId, accountId, input);

        return res.status(200).json({
            success: true,
            provider: "googleAds",
            ...result,
            count: result.ads.length,
        });
    } catch (error) {
        return sendError(res, error);
    }
});

/* -------------------------------------------------------------------------- */
/* Meta Ads                                                                   */
/* GET /meta/ads?accountId=act_123456789                                     */
/* -------------------------------------------------------------------------- */

router.get("/meta/ads", async (req: Request, res: Response) => {
    try {
        const userId = requireAuthenticatedUser(req, res);
        if (!userId) return;

        const adAccountId = queryString(req, "accountId");
        if (!adAccountId) {
            throw new RouteError("Meta Ads accountId is required.");
        }

        // Use the provider key configured by your provider-token utility.
        // Change "metaAds" to "meta" or another key if that is your stored key.
        const accessToken = await getProviderAccessToken(userId, "metaAds");
        const context: MetaAdsServiceContext = { accessToken };

        const input: ListMetaAdsInput = {
            adAccountId,
            limit: queryNumber(req, "limit", 25),
            after: queryString(req, "after"),
        };

        const result = await listMetaAccountAds(context, input);

        return res.status(200).json({
            success: true,
            provider: "metaAds",
            adAccountId,
            ...result,
        });
    } catch (error) {
        return sendError(res, error);
    }
});

/* -------------------------------------------------------------------------- */
/* Meta Ads by Ad Set                                                         */
/* GET /meta/ad-sets/:adSetId/ads?limit=25&after=...                          */
/* -------------------------------------------------------------------------- */

router.get("/meta/ad-sets/:adSetId/ads", async (req: Request, res: Response) => {
    try {
        const userId = requireAuthenticatedUser(req, res);
        if (!userId) return;

        const adSetId = String(req.params.adSetId ?? "").trim();
        if (!/^\d+$/.test(adSetId)) {
            throw new RouteError("A valid numeric Meta adSetId is required.");
        }

        const account = await getSelectedAccount(userId, "metaAds");
        const context: MetaAdsServiceContext = await getMetaAdsCreationContext(
            userId,
            account.externalAccountId,
        );

        const result = await listMetaAdSetAds(context, {
            adSetId,
            adAccountId: account.externalAccountId,
            campaignId: queryString(req, "campaignId"),
            limit: queryNumber(req, "limit", 25),
            after: queryString(req, "after"),
        });

        return res.status(200).json({
            success: true,
            provider: "metaAds",
            adSetId,
            ...result,
        });
    } catch (error) {
        return sendError(res, error);
    }
});

export default router;
