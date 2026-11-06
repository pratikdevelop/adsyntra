
import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";

import {
    getCampaigns as getGoogleCampaigns,
} from "../googleadsAPI/services/campaign.js";

import {
    getCampaigns as getMetaCampaigns,
} from "../metaadsAPI/services/campaign.js";

import AdAccount from "../models/ad-account.model.js";

const router = Router();

interface ProviderCampaignResult {
    success: boolean;
    accountId: string | null;
    data: unknown | null;
    error: string | null;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === "string") {
        return error;
    }

    return "An unexpected provider error occurred.";
}

async function fetchProviderCampaigns(
    accountId: string | null | undefined,
    fetchCampaigns: (accountId: string) => Promise<unknown>
): Promise<ProviderCampaignResult> {
    if (!accountId) {
        return {
            success: false,
            accountId: null,
            data: null,
            error: "No account selected for this provider.",
        };
    }

    try {
        const data = await fetchCampaigns(accountId);

        return {
            success: true,
            accountId,
            data,
            error: null,
        };
    } catch (error) {
        return {
            success: false,
            accountId,
            data: null,
            error: getErrorMessage(error),
        };
    }
}

router.get(
    "/",
    async (req: Request, res: Response) => {
        try {
            const { userId } = getAuth(req);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required.",
                });
            }

            // Get the user's selected account for each provider.
            const [googleAccount, metaAccount] = await Promise.all([
                AdAccount.findOne({
                    userId,
                    provider: "googleAds",
                    isSelected: true,
                })
                    .select("externalAccountId")
                    .lean(),

                AdAccount.findOne({
                    userId,
                    provider: "metaAds",
                    isSelected: true,
                })
                    .select("externalAccountId")
                    .lean(),
            ]);

            // Fetch both providers independently.
            const [googleResult, metaResult] = await Promise.all([
                fetchProviderCampaigns(
                    googleAccount?.externalAccountId,
                    (accountId) => getGoogleCampaigns(userId, accountId)
                ),

                fetchProviderCampaigns(
                    metaAccount?.externalAccountId,
                    (accountId) => getMetaCampaigns(userId, accountId)
                ),
            ]);

            const providers = {
                googleAds: googleResult,
                metaAds: metaResult,
            };

            const hasSuccess =
                googleResult.success || metaResult.success;

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

        } catch (error) {
            console.error("Get campaigns error:", error);

            return res.status(500).json({
                success: false,
                message: getErrorMessage(error),
            });
        }
    }
);

export default router;
