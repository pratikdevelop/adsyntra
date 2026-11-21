import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";

import {
    getCampaigns as getGoogleCampaigns,
} from "../googleadsAPI/services/campaign.js";
import {
    getCampaigns as getMetaCampaigns,
} from "../metaadsAPI/services/campaign.js";

import CampaignModel, {
    type CampaignProviders,
    type AdvertisingProvider,
} from "../models/campaign.model.js";
import AdAccountModel from "../models/ad-account.model.js";
import ProviderConnectionModel from "../models/provider-connection.model.js";
import {
    CampaignRequestValidationError,
    parseCreateCampaignRequest,
} from "../services/campaign-validation.service.js";

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
    fetchCampaigns: (accountId: string) => Promise<unknown>,
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

/**
 * POST /api/campaigns
 * Creates the unified application campaign record and validates that every
 * selected provider account belongs to the authenticated user and has an
 * active provider connection. Provider mutations are added in later phases.
 */
router.post("/", async (req: Request, res: Response) => {
    try {
        const { userId } = getAuth(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
        }

        const request = parseCreateCampaignRequest(req.body);

        const accountChecks = await Promise.all(
            request.platforms.map(async (provider: any) => {
                const providerRequest = request.providers[provider];

                if (!providerRequest) {
                    return {
                        provider,
                        valid: false,
                        accountId: null,
                        message: "Provider configuration is missing.",
                    };
                }

                const account = await AdAccountModel.findOne({
                    userId,
                    provider,
                    externalAccountId: providerRequest.accountId,
                    status: "active",
                })
                    .select("_id connectionId externalAccountId")
                    .lean();

                if (!account) {
                    return {
                        provider,
                        valid: false,
                        accountId: providerRequest.accountId,
                        message:
                            "The selected advertising account was not found, is inactive, or does not belong to this user.",
                    };
                }

                const connection = await ProviderConnectionModel.findOne({
                    _id: account.connectionId,
                    userId,
                    provider,
                    status: "connected",
                })
                    .select("_id")
                    .lean();

                if (!connection) {
                    return {
                        provider,
                        valid: false,
                        accountId: providerRequest.accountId,
                        message:
                            "The provider connection is not active. Reconnect this provider before creating campaigns.",
                    };
                }

                return {
                    provider,
                    valid: true,
                    accountId: account.externalAccountId,
                    message: null,
                };
            }),
        );

        const accountErrors = accountChecks.filter((check) => !check.valid);

        if (accountErrors.length > 0) {
            return res.status(422).json({
                success: false,
                message: "One or more selected advertising accounts are not ready.",
                providers: accountErrors.map((check) => ({
                    provider: check.provider,
                    accountId: check.accountId,
                    error: check.message,
                })),
            });
        }

        const providerDocuments: CampaignProviders = {};

        for (const provider of request.platforms) {
            const providerRequest = request.providers[provider];

            if (!providerRequest) continue;

            providerDocuments[provider as AdvertisingProvider] = {
                accountId: providerRequest.accountId,
                providerObjective: providerRequest.providerObjective,
                providerCampaignType: providerRequest.providerCampaignType,
                requestedProviderApiTarget:
                    providerRequest.requestedProviderApiTarget ?? null,
                configuration: providerRequest.configuration,
                creationStatus: "pending",
                deliveryStatus: "PAUSED",
                resources: [],
                lastError: null,
                lastSyncedAt: null,
            };
        }

        const campaign: any = await CampaignModel.create({
            ownerUserId: userId,
            contractVersion: "1.0",
            name: request.name,
            businessName: request.businessName,
            websiteUrl: request.websiteUrl,
            description: request.description,
            objective: request.objective,
            platforms: request.platforms,
            providers: providerDocuments,
        });

        return res.status(201).json({
            success: true,
            message:
                "Campaign request validated and saved. Provider campaign creation will be enabled in the next implementation phase.",
            campaign: {
                id: campaign._id.toString(),
                name: campaign.name,
                businessName: campaign.businessName,
                objective: campaign.objective,
                platforms: campaign.platforms,
                providers: Object.fromEntries(
                    request.platforms.map((provider: any) => {
                        const providerData = campaign.providers[provider];

                        return [
                            provider,
                            {
                                accountId: providerData?.accountId ?? null,
                                creationStatus: providerData?.creationStatus ?? "pending",
                                deliveryStatus: providerData?.deliveryStatus ?? "PAUSED",
                            },
                        ];
                    }),
                ),
                createdAt: campaign.createdAt,
            },
        });
    } catch (error) {
        if (error instanceof CampaignRequestValidationError) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }

        console.error("Create campaign request error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to save the campaign request.",
        });
    }
});

router.get("/", async (req: Request, res: Response) => {
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
            AdAccountModel.findOne({
                userId,
                provider: "googleAds",
                isSelected: true,
            })
                .select("externalAccountId")
                .lean(),

            AdAccountModel.findOne({
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
                (accountId) => getGoogleCampaigns(userId, accountId),
            ),
            fetchProviderCampaigns(
                metaAccount?.externalAccountId,
                (accountId) => getMetaCampaigns(userId, accountId),
            ),
        ]);

        const providers = {
            googleAds: googleResult,
            metaAds: metaResult,
        };

        const hasSuccess = googleResult.success || metaResult.success;

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
});

export default router;
