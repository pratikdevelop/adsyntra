import { Router } from "express";

import {
    getCampaigns as getGoogleCampaigns,
} from "../googleadsAPI/services/campaign.js";
import AdAccount from "../models/ad-account.model.js";

import {
    getCampaigns as getMetaCampaigns,
} from "../metaadsAPI/services/campaign.js";

const router = Router();

router.get("/", async (req: any, res: any) => {
    try {
        const userId = req.auth().userId;
        const [googleAccount, metaAccount] = await Promise.all([
            AdAccount.findOne({
                userId,
                provider: "googleAds",
                isSelected: true,
            }).select("externalAccountId"),

            AdAccount.findOne({
                userId,
                provider: "metaAds",
                isSelected: true,
            }).select("externalAccountId"),
        ]);
        const googleCustomerId: any = googleAccount?.externalAccountId;
        const metaAdAccountId: any = metaAccount?.externalAccountId;

        const [googleResult, metaResult] = await Promise.allSettled([
            getGoogleCampaigns(userId, googleCustomerId),
            getMetaCampaigns(userId, metaAdAccountId),
        ]);

        const providers = {
            googleAds: {
                success: googleResult.status === "fulfilled",
                data:
                    googleResult.status === "fulfilled"
                        ? googleResult.value
                        : null,
                error:
                    googleResult.status === "rejected"
                        ? googleResult.reason.message
                        : null,
            },

            metaAds: {
                success: metaResult.status === "fulfilled",
                data:
                    metaResult.status === "fulfilled"
                        ? metaResult.value
                        : null,
                error:
                    metaResult.status === "rejected"
                        ? metaResult.reason.message
                        : null,
            },
        };

        const hasSuccess =
            providers.googleAds.success || providers.metaAds.success;

        if (!hasSuccess) {
            return res.status(502).json({
                success: false,
                message: "Failed to retrieve campaigns from both providers.",
                providers,
            });
        }

        return res.status(200).json({
            success: true,
            providers,
        });

    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to retrieve campaigns.",
        });
    }
});

export default router;