import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";

import { getCampaigns as getGoogleCampaigns } from "../googleadsAPI/services/campaign.js";
import { getCampaigns as getMetaCampaigns } from "../metaadsAPI/services/campaign.js";

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
import {
    getGoogleAdsCreationContext,
    createGoogleAdsCampaignFlow,
} from "../googleadsAPI/services/campaign-creation.js";

import type { CreateGoogleAdsSearchCampaignFlowInput } from "../googleadsAPI/iterface/campaign-creation.js";
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

const normalizeGoogleId = (value: unknown): string | null => {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }

    return value.trim().split("/").pop() || null;
};

const normalizeGoogleAccountId = (value: unknown): string => {
    return String(value ?? "")
        .replace(/^customers\//, "")
        .replace(/\D/g, "");
};

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

const mergeGoogleCampaigns = (
    apiCampaigns: any[],
    savedCampaigns: any[],
    accountId: string
) => {
    const normalizedAccountId =
        normalizeGoogleAccountId(accountId);

    const savedCampaignMap = new Map<string, any>();

    for (const saved of savedCampaigns) {
        const googleProvider = saved.providers?.googleAds;

        if (!googleProvider) continue;

        const savedAccountId = normalizeGoogleAccountId(
            googleProvider.accountId
        );

        if (savedAccountId !== normalizedAccountId) continue;

        const campaignId = normalizeGoogleId(
            googleProvider.campaignId
        );

        if (campaignId) {
            savedCampaignMap.set(campaignId, saved);
        }
    }

    return apiCampaigns.map((apiCampaign) => {
        const saved = savedCampaignMap.get(
            normalizeGoogleId(apiCampaign.id) ?? ""
        );

        const googleProvider = saved?.providers?.googleAds;

        if (!saved) {
            return {
                ...apiCampaign,
                source: "external",
            };
        }

        return {
            ...apiCampaign,

            // MongoDB metadata
            objective:
                saved.objective ??
                googleProvider?.providerObjective ??
                apiCampaign.objective,

            businessName: saved.businessName ?? null,
            websiteUrl: saved.websiteUrl ?? null,
            description: saved.description ?? null,

            providerCampaignType:
                googleProvider?.providerCampaignType ?? null,

            source: "platform",
        };
    });
};


/**
 * POST /api/campaigns
 * Creates the unified application campaign record and validates that every
 * selected provider account belongs to the authenticated user and has an
 * active provider connection. Provider mutations are added in later phases.
 */
router.post("/", async (req: Request, res: Response) => {
    try {
        const auth = getAuth(req);

        console.log("[CAMPAIGN CREATE AUTH DEBUG]", {
            isAuthenticated: auth.isAuthenticated,
            userId: auth.userId,
            sessionId: auth.sessionId,
            path: req.originalUrl,
            method: req.method,
            hasCookie: Boolean(req.headers.cookie),
            hasAuthorization: Boolean(req.headers.authorization),
        });

        const { userId } = auth;


        console.log("[CLERK AUTH DEBUG]", {
            isAuthenticated: auth.isAuthenticated,
            userId: auth.userId ?? null,
            debug: auth.debug,

            authorizationScheme:
                req.headers.authorization?.split(/\s+/)[0] ?? null,

            authorizationParts:
                req.headers.authorization?.trim().split(/\s+/).length ?? 0,

            origin: req.headers.origin,
            referer: req.headers.referer,
            accept: req.headers.accept,
        });
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
        }

        const request: any = parseCreateCampaignRequest(req.body);

        // const accountChecks = await Promise.all(
        //     request.platforms.map(async (provider: any) => {
        //         const providerRequest = request.providers[provider];

        //         if (!providerRequest) {
        //             return {
        //                 provider,
        //                 valid: false,
        //                 accountId: null,
        //                 message: "Provider configuration is missing.",
        //             };
        //         }
        //         console.log(
        //             `[CAMPAIGN CREATE] Validating provider account for ${provider}:`,
        //             providerRequest.accountId,
        //         );

        //         const validProviders = ["googleAds", "metaAds"];

        //         if (!validProviders.includes(provider)) {
        //             return {
        //                 provider,
        //                 valid: false,
        //                 accountId: providerRequest.accountId,
        //                 message: `Unsupported provider: ${provider}.`,
        //             };
        //         }

        //         // Check that the selected account exists, is active, and belongs to the user.

        //         const account = await AdAccountModel.findOne({
        //             userId,
        //             provider,
        //             externalAccountId: providerRequest.accountId,
        //             status: "active",
        //         })
        //             .select("_id connectionId externalAccountId")
        //             .lean();

        //         if (!account) {
        //             return {
        //                 provider,
        //                 valid: false,
        //                 accountId: providerRequest.accountId,
        //                 message:
        //                     "The selected advertising account was not found, is inactive, or does not belong to this user.",
        //             };
        //         }

        //         const connection = await ProviderConnectionModel.findOne({
        //             _id: account.connectionId,
        //             userId,
        //             provider,
        //             status: "connected",
        //         })
        //             .select("_id")
        //             .lean();

        //         if (!connection) {
        //             return {
        //                 provider,
        //                 valid: false,
        //                 accountId: providerRequest.accountId,
        //                 message:
        //                     "The provider connection is not active. Reconnect this provider before creating campaigns.",
        //             };
        //         }

        //         return {
        //             provider,
        //             valid: true,
        //             accountId: account.externalAccountId,
        //             message: null,
        //         };
        //     }),
        // );

        // const accountErrors = accountChecks.filter((check) => !check.valid);

        // if (accountErrors.length > 0) {
        //     return res.status(422).json({
        //         success: false,
        //         message: "One or more selected advertising accounts are not ready.",
        //         providers: accountErrors.map((check) => ({
        //             provider: check.provider,
        //             accountId: check.accountId,
        //             error: check.message,
        //         })),
        //     });
        // }

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

        // ==========================================
        // GLOBAL PROVIDER CAMPAIGN EXECUTION
        // ==========================================

        const providerResults: Record<string, unknown> = {};

        // ==========================================
        // GOOGLE ADS SEARCH CAMPAIGN EXECUTION
        // ==========================================

        if (request.platforms.includes("googleAds")) {
            const googleRequest = request.providers.googleAds;

            try {
                if (!googleRequest) {
                    throw new Error("Google Ads provider configuration is missing.");
                }

                // Current Google campaign flow supports Search campaigns.
                if (googleRequest.providerCampaignType.toUpperCase() !== "SEARCH") {
                    throw new Error(
                        "The current Google Ads creation flow supports SEARCH campaigns only.",
                    );
                }

                // 1. Get authenticated Google Ads context.

                const context = await getGoogleAdsCreationContext(
                    userId,
                    googleRequest.accountId,
                );

                // 2. Map global provider configuration to Google flow input.

                const flowInput = {
                    ...(googleRequest.configuration as unknown as CreateGoogleAdsSearchCampaignFlowInput),

                    // Global execution controls override provider configuration.
                    validateOnly: request.execution.validateOnly,
                    confirm: request.execution.confirm,
                };

                // 3. Execute the complete Google Search campaign flow.

                const result = await createGoogleAdsCampaignFlow(context, flowInput);

                const googleProvider = campaign.providers.googleAds;

                if (!googleProvider) {
                    throw new Error("Google Ads campaign data was not initialized.");
                }

                // 4. Update provider creation status.

                googleProvider.creationStatus = result.validateOnly
                    ? "validated"
                    : "created";

                googleProvider.lastError = null;

                // 5. Save real resources only after live creation.

                if (!result.validateOnly && result.createdResources) {
                    const resources = result.createdResources;

                    googleProvider.providerCampaignResourceName = resources.campaign;

                    googleProvider.providerCampaignId =
                        resources.campaign.split("/").at(-1) ?? null;

                    googleProvider.providerStatus = "PAUSED";
                    googleProvider.deliveryStatus = "PAUSED";
                    googleProvider.lastSyncedAt = new Date();

                    googleProvider.resources = [
                        {
                            resourceType: "campaignBudget",
                            resourceName: resources.budget,
                        },
                        {
                            resourceType: "campaign",
                            resourceName: resources.campaign,
                        },
                        {
                            resourceType: "adGroup",
                            resourceName: resources.adGroup,
                        },
                        ...resources.locationCriteria.map((resourceName) => ({
                            resourceType: "locationCriterion",
                            resourceName,
                        })),
                        ...resources.positiveKeywords.map((resourceName) => ({
                            resourceType: "positiveKeyword",
                            resourceName,
                        })),
                        ...resources.negativeKeywords.map((resourceName) => ({
                            resourceType: "negativeKeyword",
                            resourceName,
                        })),
                        {
                            resourceType: "responsiveSearchAd",
                            resourceName: resources.responsiveSearchAd,
                        },
                    ];
                }

                campaign.markModified("providers.googleAds");

                await campaign.save();

                // 6. Return Google provider result.

                providerResults.googleAds = {
                    success: true,
                    accountId: googleRequest.accountId,
                    creationStatus: googleProvider.creationStatus,
                    validateOnly: result.validateOnly,
                    operationCount: result.operationCount,
                    temporaryResourceNames: result.temporaryResourceNames,
                    createdResources: result.createdResources,
                    googleResponse: result.googleResponse,
                };
            } catch (error) {
                const message = getErrorMessage(error);

                const googleProvider = campaign.providers.googleAds;

                if (googleProvider) {
                    googleProvider.creationStatus = "failed";
                    googleProvider.lastError = message;

                    campaign.markModified("providers.googleAds");

                    await campaign.save();
                }

                providerResults.googleAds = {
                    success: false,
                    accountId: googleRequest.accountId,
                    creationStatus: "failed",
                    error: message,
                };
            }
        }

        // ==========================================
        // META ADS — PENDING IMPLEMENTATION
        // ==========================================

        if (request.platforms.includes("metaAds")) {
            providerResults.metaAds = {
                status: "pending",
                message:
                    "Meta Ads campaign execution will be connected after its campaign creation service is implemented.",
            };
        }

        // ==========================================
        // GLOBAL CAMPAIGN RESPONSE
        // ==========================================

        const googleResult = providerResults.googleAds as
            | { success: boolean }
            | undefined;

        const googleFailed = googleResult?.success === false;

        const googleSelected = request.platforms.includes("googleAds");

        const message = googleFailed
            ? "Campaign request was saved, but Google Ads campaign execution failed."
            : googleSelected
                ? request.execution.validateOnly
                    ? "Google Ads Search campaign validation completed successfully. No external campaign resources were created."
                    : "Google Ads Search campaign created successfully."
                : "Campaign request saved. Provider execution is pending implementation.";

        return res
            .status(
                googleFailed
                    ? 502
                    : googleSelected
                        ? request.execution.validateOnly
                            ? 200
                            : 201
                        : 202,
            )
            .json({
                success: !googleFailed,
                message,

                campaign: {
                    id: campaign._id.toString(),
                    name: campaign.name,
                    businessName: campaign.businessName,
                    objective: campaign.objective,
                    platforms: campaign.platforms,

                    providers: Object.fromEntries(
                        request.platforms.map((provider: AdvertisingProvider) => {
                            const providerData = campaign.providers[provider];

                            return [
                                provider,
                                {
                                    accountId: providerData?.accountId ?? null,
                                    creationStatus: providerData?.creationStatus ?? "pending",
                                    deliveryStatus: providerData?.deliveryStatus ?? "PAUSED",
                                    providerCampaignId: providerData?.providerCampaignId ?? null,
                                },
                            ];
                        }),
                    ),

                    createdAt: campaign.createdAt,
                },

                execution: request.execution,
                providers: providerResults,
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
        console.log("userId, ", userId);


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
            const savedCampaigns = await CampaignModel.find({
    userId,
}).lean();

// console.log("MongoDB campaign merge diagnostic:", {
//     savedCount: savedCampaigns.length,

//     campaigns: savedCampaigns.map((campaign: any) => {
//         const googleAds = campaign.providers?.googleAds;

//         return {
//             name: campaign.name,
//             documentKeys: Object.keys(campaign),
//             providerKeys: Object.keys(campaign.providers ?? {}),
//             googleAdsKeys: Object.keys(googleAds ?? {}),
//             googleAdsAccountId: googleAds?.accountId,
//             googleAdsCampaignId: googleAds?.campaignId,
//         };
//     }),
// });

const totalDocuments = await CampaignModel.countDocuments();

const sample = await CampaignModel.findOne().lean() as any;

console.log("CampaignModel diagnostic:", {
    authenticatedUserId: userId,
    collection: CampaignModel.collection.name,
    totalDocuments,
    schemaPaths: Object.keys(CampaignModel.schema.paths),

    sample: sample
        ? {
            documentKeys: Object.keys(sample),

            ownership: {
                userId: sample.userId ?? null,
                clerkUserId: sample.clerkUserId ?? null,
                createdBy: sample.createdBy ?? null,
                ownerId: sample.ownerId ?? null,
            },

            providerKeys: Object.keys(sample.providers ?? {}),

            googleAds: sample.providers?.googleAds
                ? {
                    keys: Object.keys(sample.providers.googleAds),
                    accountId: sample.providers.googleAds.accountId ?? null,
                    campaignId: sample.providers.googleAds.campaignId ?? null,
                }
                : null,
        }
        : null,
});

        // Fetch both providers independently.
        const [googleResult, metaResult] = await Promise.all([
            fetchProviderCampaigns(googleAccount?.externalAccountId, (accountId) =>
                getGoogleCampaigns(userId, accountId),
            ),
            fetchProviderCampaigns(metaAccount?.externalAccountId, (accountId) =>
                getMetaCampaigns(userId, accountId),
            ),
        ]);
        if (googleResult.success && googleResult.data) {
    googleResult.data = {
        ...googleResult.data,
        campaigns: mergeGoogleCampaigns(
            googleResult.data.campaigns,
            savedCampaigns,
            googleResult.accountId!
        ),
    };
}
        console.log(
            "googleResult", googleResult
        );
        

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
            savedCampaigns
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
