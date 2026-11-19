import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import AdAccountModel from "../models/ad-account.model.js";
import {
    createGoogleReusableAudience,
    createGoogleWebsiteUserList,
    GoogleAudienceCreationError,
} from "../googleadsAPI/services/audience-creation.service.js";
import {
    createMetaWebsiteCustomAudience,
    MetaAudienceCreationError,
} from "../metaadsAPI/services/audience-creation.service.js";
import {
    getGoogleAdsCreationContext,
} from "../googleadsAPI/services/campaign-creation.js";
import {
    getGoogleAdsUserLists,
    getGoogleAdsAudiences,
} from "../googleadsAPI/services/google-ads-lookups.service.js";
import {
    listMetaCustomAudiences,
    listMetaSavedAudiences,
    MetaTargetingSearchError,
} from "../metaadsAPI/services/targeting.js";

const router = Router();

type SettledValue<T> = { success: true; data: T; error: null } | { success: false; data: null; error: string };

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : "An unexpected provider error occurred.";
}

async function settle<T>(task: Promise<T>): Promise<SettledValue<T>> {
    try {
        return { success: true, data: await task, error: null };
    } catch (error) {
        return { success: false, data: null, error: messageOf(error) };
    }
}

router.get("/", async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required." });
    }

    try {
        const [googleAccount, metaAccount] = await Promise.all([
            AdAccountModel.findOne({ userId, provider: "googleAds", isSelected: true })
                .select("externalAccountId name")
                .lean()
                .exec(),
            AdAccountModel.findOne({ userId, provider: "metaAds", isSelected: true })
                .select("externalAccountId name")
                .lean()
                .exec(),
        ]);

        let google: Record<string, unknown> = {
            connected: Boolean(googleAccount?.externalAccountId),
            accountId: googleAccount?.externalAccountId ?? null,
            userLists: { success: false, data: null, error: googleAccount ? null : "No Google Ads account selected." },
            audiences: { success: false, data: null, error: googleAccount ? null : "No Google Ads account selected." },
        };

        if (googleAccount?.externalAccountId) {
            try {
                const context = await getGoogleAdsCreationContext(userId, googleAccount.externalAccountId);
                const [userLists, audiences] = await Promise.all([
                    settle(getGoogleAdsUserLists(context)),
                    settle(getGoogleAdsAudiences(context)),
                ]);
                google = {
                    connected: true,
                    accountId: `customers/${context.customerId}`,
                    userLists,
                    audiences,
                };
            } catch (error) {
                const message = messageOf(error);
                google = {
                    connected: true,
                    accountId: googleAccount.externalAccountId,
                    userLists: { success: false, data: null, error: message },
                    audiences: { success: false, data: null, error: message },
                };
            }
        }

        let meta: Record<string, unknown> = {
            connected: Boolean(metaAccount?.externalAccountId),
            accountId: metaAccount?.externalAccountId ?? null,
            customAudiences: { success: false, data: null, error: metaAccount ? null : "No Meta Ads account selected." },
            savedAudiences: { success: false, data: null, error: metaAccount ? null : "No Meta Ads account selected." },
        };

        if (metaAccount?.externalAccountId) {
            const [customAudiences, savedAudiences] = await Promise.all([
                settle(listMetaCustomAudiences(userId, metaAccount.externalAccountId, { limit: 50 })),
                settle(listMetaSavedAudiences(userId, metaAccount.externalAccountId, { limit: 50 })),
            ]);
            meta = {
                connected: true,
                accountId: metaAccount.externalAccountId,
                customAudiences,
                savedAudiences,
            };
        }

        const allResults = [
            (google.userLists as SettledValue<unknown>).success,
            (google.audiences as SettledValue<unknown>).success,
            (meta.customAudiences as SettledValue<unknown>).success,
            (meta.savedAudiences as SettledValue<unknown>).success,
        ];

        return res.status(200).json({
            success: true,
            providers: { googleAds: google, metaAds: meta },
            summary: {
                successfulReports: allResults.filter(Boolean).length,
                failedReports: allResults.filter((value) => !value).length,
            },
        });
    } catch (error) {
        const status = error instanceof MetaTargetingSearchError ? error.statusCode : 500;
        return res.status(status).json({ success: false, message: messageOf(error) });
    }
});


/* -------------------------------------------------------------------------- */
/* Audience creation                                                         */
/* -------------------------------------------------------------------------- */

async function getSelectedAccountId(
    userId: string,
    provider: "googleAds" | "metaAds",
): Promise<string> {
    const account = await AdAccountModel.findOne({
        userId,
        provider,
        isSelected: true,
    })
        .select("externalAccountId")
        .lean()
        .exec();

    const accountId = typeof account?.externalAccountId === "string"
        ? account.externalAccountId.trim()
        : "";

    if (!accountId) {
        throw new AudienceRouteError(
            `No ${provider === "googleAds" ? "Google Ads" : "Meta Ads"} account is selected. Select an account before creating an audience.`,
            409,
        );
    }

    return accountId;
}

class AudienceRouteError extends Error {
    constructor(message: string, public statusCode = 400) {
        super(message);
        this.name = "AudienceRouteError";
    }
}

function sendCreationError(res: Response, error: unknown) {
    const statusCode = error instanceof GoogleAudienceCreationError || error instanceof MetaAudienceCreationError
        ? error.statusCode
        : error instanceof AudienceRouteError
            ? error.statusCode
            : 500;

    const message = messageOf(error);
    if (statusCode >= 500) {
        console.error("Audience creation failed:", error);
    }

    return res.status(statusCode).json({ success: false, message });
}

router.post("/google/user-lists", async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required." });
    }

    try {
        const accountId = await getSelectedAccountId(userId, "googleAds");
        const result = await createGoogleWebsiteUserList(userId, accountId, {
            name: req.body?.name,
            description: req.body?.description,
            urlContains: req.body?.urlContains,
            lookbackWindowDays: req.body?.lookbackWindowDays,
        });
        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        return sendCreationError(res, error);
    }
});

router.post("/google/reusable", async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required." });
    }

    try {
        const accountId = await getSelectedAccountId(userId, "googleAds");
        const result = await createGoogleReusableAudience(userId, accountId, {
            name: req.body?.name,
            description: req.body?.description,
            ageRanges: req.body?.ageRanges,
            genders: req.body?.genders,
            includeUndetermined: req.body?.includeUndetermined === true,
        });
        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        return sendCreationError(res, error);
    }
});

router.post("/meta/website-custom", async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required." });
    }

    try {
        const accountId = await getSelectedAccountId(userId, "metaAds");
        const result = await createMetaWebsiteCustomAudience(userId, accountId, {
            name: req.body?.name,
            description: req.body?.description,
            pixelId: req.body?.pixelId,
            retentionDays: req.body?.retentionDays,
            eventName: req.body?.eventName,
        });
        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        console.error(error)
        return sendCreationError(res, error);
    }
});


export default router;
