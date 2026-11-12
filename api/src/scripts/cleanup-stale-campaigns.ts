/**
 * Clean stale provider campaign references for ONE test user.
 *
 * Safety:
 * - Dry-run by default. Pass --execute to apply changes.
 * - Only selected Google Ads / Meta Ads accounts are checked.
 * - A provider API failure skips cleanup for that provider.
 * - Google Ads campaigns with status REMOVED are treated as stale, even though
 *   Google Ads still returns their IDs in API query results.
 * - Records without an external campaign ID are preserved.
 * - If only one provider campaign is stale, only that provider subdocument
 *   and its platform entry are removed.
 *
 * Assumed location: src/scripts/cleanup-stale-campaigns.ts
 * If your db.ts is not at src/config/db.ts, update only the db import below.
 */

import "dotenv/config";
import { connectToMongoDB, disconnectFromMongoDB } from "../config/db.js";
import CampaignModel from "../models/campaign.model.js";
import AdAccountModel from "../models/ad-account.model.js";
import { getCampaigns as getGoogleCampaigns } from "../googleadsAPI/services/campaign.js";
import { getCampaigns as getMetaCampaigns } from "../metaadsAPI/services/campaign.js";

type Provider = "googleAds" | "metaAds";

type ProviderFetchResult = {
    provider: Provider;
    accountId: string | null;
    success: boolean;
    campaignIds: Set<string>;
    removedCampaignIds: Set<string>;
    pages: number;
    error: string | null;
};

const MAX_PAGES_PER_PROVIDER = 1000;

function readArguments(): { userId: string; execute: boolean } {
    const args = process.argv.slice(2);
    let userId = process.env.CLEANUP_USER_ID?.trim() ?? "";
    let execute = false;

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === "--execute") {
            execute = true;
        } else if (arg === "--user-id") {
            userId = args[index + 1]?.trim() ?? "";
            index += 1;
        } else if (arg.startsWith("--user-id=")) {
            userId = arg.slice("--user-id=".length).trim();
        } else if (arg === "--help" || arg === "-h") {
            console.log(
                [
                    "Usage:",
                    "  npx tsx src/scripts/cleanup-stale-campaigns.ts --user-id <CLERK_USER_ID>",
                    "  npx tsx src/scripts/cleanup-stale-campaigns.ts --user-id <CLERK_USER_ID> --execute",
                    "",
                    "Dry-run is the default. --execute applies the cleanup.",
                    "You may also set CLEANUP_USER_ID in the environment.",
                ].join("\n"),
            );
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!userId) {
        throw new Error(
            "A test user ID is required. Pass --user-id <CLERK_USER_ID> or set CLEANUP_USER_ID.",
        );
    }

    return { userId, execute };
}

function normalizeGoogleAccountId(value: unknown): string {
    return String(value ?? "")
        .trim()
        .replace(/^customers\//i, "")
        .replace(/\D/g, "");
}

function normalizeGoogleCampaignId(value: unknown): string | null {
    if (typeof value !== "string" && typeof value !== "number") {
        return null;
    }

    const normalized = String(value).trim().split("/").pop() ?? "";
    return /^\d+$/.test(normalized) ? normalized : null;
}

function normalizeMetaAccountId(value: unknown): string {
    return String(value ?? "")
        .trim()
        .replace(/^act_/i, "");
}

function normalizeMetaCampaignId(value: unknown): string | null {
    if (typeof value !== "string" && typeof value !== "number") {
        return null;
    }

    const normalized = String(value).trim();
    return /^\d+$/.test(normalized) ? normalized : null;
}

function normalizeAccountId(provider: Provider, value: unknown): string {
    return provider === "googleAds"
        ? normalizeGoogleAccountId(value)
        : normalizeMetaAccountId(value);
}

function normalizeCampaignId(
    provider: Provider,
    value: unknown,
): string | null {
    return provider === "googleAds"
        ? normalizeGoogleCampaignId(value)
        : normalizeMetaCampaignId(value);
}

async function fetchAllGoogleCampaignIds(
    userId: string,
    accountId: string,
): Promise<{ ids: Set<string>; removedIds: Set<string>; pages: number }> {
    const ids = new Set<string>();
    const removedIds = new Set<string>();
    let pageToken: string | undefined;
    let pages = 0;
    const seenTokens = new Set<string>();

    while (true) {
        if (pages >= MAX_PAGES_PER_PROVIDER) {
            throw new Error(
                `Google Ads pagination exceeded ${MAX_PAGES_PER_PROVIDER} pages; refusing cleanup.`,
            );
        }

        const response = await getGoogleCampaigns(userId, accountId, pageToken);
        pages += 1;

        if (!response || !Array.isArray(response.campaigns)) {
            throw new Error("Google Ads returned an invalid campaigns list.");
        }

        for (const campaign of response.campaigns) {
            const id = normalizeCampaignId("googleAds", campaign.id);
            if (!id) {
                throw new Error(
                    "Google Ads returned a campaign without a valid ID; refusing cleanup.",
                );
            }
            // Google Ads Remove does not make the campaign ID disappear from
            // API query results. It sets campaign.status to REMOVED. Treat that
            // status as stale for our MongoDB application-campaign reference.
            console.log("campaign status: ", campaign.status, String(campaign.status ?? "").toUpperCase())
            if (String(campaign.status ?? "").toUpperCase() === "REMOVED") {
                removedIds.add(id);
                continue;
            }


            // Unknown/missing statuses are preserved conservatively.
            ids.add(id);
        }

        const hasMore = response.pagination?.hasMore === true;
        const nextToken = response.pagination?.nextToken ?? null;

        if (!hasMore) break;

        if (!nextToken || seenTokens.has(nextToken)) {
            throw new Error(
                "Google Ads returned a missing or repeated pagination token; refusing cleanup.",
            );
        }

        seenTokens.add(nextToken);
        pageToken = nextToken;
    }

    return { ids, removedIds, pages };
}

async function fetchAllMetaCampaignIds(
    userId: string,
    accountId: string,
): Promise<{ ids: Set<string>; removedIds: Set<string>; pages: number }> {
    const ids = new Set<string>();
    let pageToken: string | undefined;
    let pages = 0;
    const seenTokens = new Set<string>();

    while (true) {
        if (pages >= MAX_PAGES_PER_PROVIDER) {
            throw new Error(
                `Meta Ads pagination exceeded ${MAX_PAGES_PER_PROVIDER} pages; refusing cleanup.`,
            );
        }

        const response = await getMetaCampaigns(userId, accountId, pageToken);
        pages += 1;

        if (!response || !Array.isArray(response.campaigns)) {
            throw new Error("Meta Ads returned an invalid campaigns list.");
        }

        for (const campaign of response.campaigns) {
            const id = normalizeCampaignId("metaAds", campaign.id);
            if (!id) {
                throw new Error(
                    "Meta Ads returned a campaign without a valid ID; refusing cleanup.",
                );
            }
            ids.add(id);
        }

        const hasMore = response.pagination?.hasMore === true;
        const nextToken = response.pagination?.nextToken ?? null;

        if (!hasMore) break;

        if (!nextToken || seenTokens.has(nextToken)) {
            throw new Error(
                "Meta Ads returned a missing or repeated pagination cursor; refusing cleanup.",
            );
        }

        seenTokens.add(nextToken);
        pageToken = nextToken;
    }

    return { ids, removedIds: new Set<string>(), pages };
}

async function fetchProvider(
    provider: Provider,
    userId: string,
    accountId: string | null,
): Promise<ProviderFetchResult> {
    if (!accountId) {
        return {
            provider,
            accountId: null,
            success: false,
            campaignIds: new Set<string>(),
            removedCampaignIds: new Set<string>(),
            pages: 0,
            error: "No selected account for this provider; skipped.",
        };
    }

    try {
       
        const result =
            provider === "googleAds"
                ? await fetchAllGoogleCampaignIds(userId, accountId)
                : await fetchAllMetaCampaignIds(userId, accountId);
        console.log(
            "result", result
        );
        
        return {
            provider,
            accountId,
            success: true,
            campaignIds: result.ids,
            removedCampaignIds: result.removedIds,
            pages: result.pages,
            error: null,
        };
    } catch (error) {
        return {
            provider,
            accountId,
            success: false,
            campaignIds: new Set<string>(),
            removedCampaignIds: new Set<string>(),
            pages: 0,
            error:
                error instanceof Error
                    ? error.message
                    : "Unknown provider API error.",
        };
    }
}

async function removeStaleProviderReference(
    campaign: any,
    provider: Provider,
    expectedAccountId: string,
    expectedCampaignId: string,
    execute: boolean,
): Promise<"dry-run" | "removed" | "changed"> {
    const providerData = campaign.providers?.[provider];

    if (!providerData) return "changed";

    const currentAccountId = normalizeAccountId(
        provider,
        providerData.accountId,
    );
    const currentCampaignId = normalizeCampaignId(
        provider,
        providerData.providerCampaignId,
    );

    // Re-check the exact account and campaign ID before modifying the document.
    if (
        currentAccountId !== expectedAccountId ||
        currentCampaignId !== expectedCampaignId
    ) {
        return "changed";
    }

    if (!execute) return "dry-run";

    const filter: Record<string, unknown> = {
        _id: campaign._id,
        ownerUserId: campaign.ownerUserId,
        [`providers.${provider}.accountId`]: providerData.accountId,
        [`providers.${provider}.providerCampaignId`]:
            providerData.providerCampaignId,
    };

    const update = await CampaignModel.updateOne(filter, {
        $unset: { [`providers.${provider}`]: "" },
        $pull: { platforms: provider },
    });

    if (update.modifiedCount !== 1) {
        return "changed";
    }

    // Delete the logical campaign only if no provider subdocument remains.
    await CampaignModel.deleteOne({
        _id: campaign._id,
        ownerUserId: campaign.ownerUserId,
        "providers.googleAds": { $exists: false },
        "providers.metaAds": { $exists: false },
    });

    return "removed";
}

async function main(): Promise<void> {
    const { userId, execute } = readArguments();

    console.log("\n=== Stale Campaign Cleanup ===");
    console.log(`User: ${userId}`);
    console.log(`Mode: ${execute ? "EXECUTE" : "DRY RUN"}`);
    console.log("Scope: selected Google Ads and Meta Ads accounts only\n");

    await connectToMongoDB();

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

    const googleAccountId = googleAccount?.externalAccountId ?? null;
    const metaAccountId = metaAccount?.externalAccountId ?? null;

    console.log("Selected accounts:");
    console.log(`  Google Ads: ${googleAccountId ?? "not selected"}`);
    console.log(`  Meta Ads:   ${metaAccountId ?? "not selected"}\n`);

    const [googleResult, metaResult] = await Promise.all([
        fetchProvider("googleAds", userId, googleAccountId),
        fetchProvider("metaAds", userId, metaAccountId),
    ]);

    for (const result of [googleResult, metaResult]) {
        if (result.success) {
            if (result.provider === "googleAds") {
                console.log(
                    `googleAds: ${result.campaignIds.size} campaigns not marked REMOVED; ${result.removedCampaignIds.size} campaigns marked REMOVED across ${result.pages} page(s).`,
                );
            } else {
                console.log(
                    `metaAds: fetched ${result.campaignIds.size} campaigns across ${result.pages} page(s).`,
                );
            }
        } else {
            console.warn(`${result.provider}: SKIPPED — ${result.error}`);
        }
    }

    if (!googleResult.success && !metaResult.success) {
        throw new Error(
            "Neither provider could be verified. No MongoDB records were changed.",
        );
    }

    const savedCampaigns = await CampaignModel.find({ ownerUserId: userId })
        .select(
            "_id ownerUserId name platforms providers.googleAds.accountId providers.googleAds.providerCampaignId providers.metaAds.accountId providers.metaAds.providerCampaignId",
        )
        .lean();

    let staleProviderReferences = 0;
    let documentsDeleted = 0;
    let preservedWithoutId = 0;
    let skippedOtherAccounts = 0;
    let changedDuringRun = 0;

    console.log(`\nMongoDB campaign documents for user: ${savedCampaigns.length}\n`);

    for (const campaign of savedCampaigns as any[]) {
        const staleEntries: Array<{
            provider: Provider;
            accountId: string;
            campaignId: string;
        }> = [];

        for (const result of [googleResult, metaResult]) {
            if (!result.success || !result.accountId) continue;

            const providerData = campaign.providers?.[result.provider];
            if (!providerData) continue;

            const selectedAccountId = normalizeAccountId(
                result.provider,
                result.accountId,
            );
            const savedAccountId = normalizeAccountId(
                result.provider,
                providerData.accountId,
            );

            // Never infer deletion for a non-selected/old account.
            if (savedAccountId !== selectedAccountId) {
                skippedOtherAccounts += 1;
                continue;
            }

            const savedCampaignId = normalizeCampaignId(
                result.provider,
                providerData.providerCampaignId,
            );

            // Draft/partial records without a provider campaign ID cannot be
            // verified against the live provider list, so keep them.
            if (!savedCampaignId) {
                preservedWithoutId += 1;
                continue;
            }

            if (!result.campaignIds.has(savedCampaignId)) {
                staleEntries.push({
                    provider: result.provider,
                    accountId: selectedAccountId,
                    campaignId: savedCampaignId,
                });
            }
        }

        if (staleEntries.length === 0) continue;

        console.log(
            `Campaign "${campaign.name}" (${String(campaign._id)}):`,
        );

        for (const stale of staleEntries) {
            console.log(
                `  STALE ${stale.provider} campaign ID ${stale.campaignId}`,
            );

            staleProviderReferences += 1;

            const outcome = await removeStaleProviderReference(
                campaign,
                stale.provider,
                stale.accountId,
                stale.campaignId,
                execute,
            );

            if (outcome === "changed") {
                changedDuringRun += 1;
                console.warn("  Skipped: record changed before update.");
            } else if (outcome === "removed") {
                console.log("  Removed provider reference.");
            } else {
                console.log("  Dry-run: no database changes made.");
            }
        }

        if (execute) {
            const remaining = await CampaignModel.exists({
                _id: campaign._id,
                ownerUserId: userId,
            });

            if (!remaining) {
                documentsDeleted += 1;
                console.log("  Deleted MongoDB campaign document (no providers remained).");
            }
        }
    }

    console.log("\n=== Cleanup Summary ===");
    console.log(`Mode: ${execute ? "EXECUTE" : "DRY RUN"}`);
    console.log(`Stale provider references found: ${staleProviderReferences}`);
    console.log(`MongoDB documents deleted: ${documentsDeleted}`);
    console.log(`Records preserved without external IDs: ${preservedWithoutId}`);
    console.log(`Provider entries skipped (different account): ${skippedOtherAccounts}`);
    console.log(`Records skipped because they changed during run: ${changedDuringRun}`);

    if (!execute && staleProviderReferences > 0) {
        console.log(
            "\nReview the stale IDs above. If they are correct, rerun with --execute to apply the cleanup.",
        );
    } else if (staleProviderReferences === 0) {
        console.log("\nNo stale campaign references were found in the checked accounts.");
    }
}

main()
    .catch((error) => {
        console.error("\nCampaign cleanup failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await disconnectFromMongoDB().catch((error) => {
            console.error("MongoDB disconnect failed:", error);
        });
    });
