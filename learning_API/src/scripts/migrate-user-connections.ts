
import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

import {
    connectToMongoDB,
    disconnectFromMongoDB,
} from "../config/db.js";

import UserModel from "../models/user.model.js";

import ProviderConnectionModel, {
    type AdvertisingProvider,
    type EncryptedSecret,
} from "../models/provider-connection.model.js";

import AdAccountModel from "../models/ad-account.model.js";

interface LegacyEncryptedToken {
    version: 1;
    iv: string;
    authTag: string;
    ciphertext: string;
}

interface LegacyStoredTokens {
    accessToken: LegacyEncryptedToken;
    refreshToken: LegacyEncryptedToken | null;
    expiryDate: number | null;
}

interface LegacyProviderConnection {
    connected: boolean;
    tokens: LegacyStoredTokens | null;
    accounts: unknown[];
    selectedAccountId: string | null;
}

interface LegacyUserConnection {
    clerk: {
        userId: string;
        email?: string;
    };
    providers: {
        googleAds: LegacyProviderConnection;
        metaAds: LegacyProviderConnection;
    };
    updatedAt: string;
}

type LegacyConnectionStore = Record<string, LegacyUserConnection>;

const PROVIDERS: AdvertisingProvider[] = [
    "googleAds",
    "metaAds",
];

const DRY_RUN = !process.argv.includes("--apply");

const OVERWRITE_TOKENS =
    process.argv.includes("--overwrite-tokens");

const CONNECTION_FILE = path.resolve(
    process.cwd(),
    "data",
    "user-connections.json"
);

const report = {
    usersProcessed: 0,
    providerConnectionsCreated: 0,
    providerConnectionsPreserved: 0,
    accountsMigrated: 0,
    accountsSkipped: 0,
    warnings: 0,
};

function isEncryptedToken(
    value: unknown
): value is LegacyEncryptedToken {
    if (!value || typeof value !== "object") {
        return false;
    }

    const token = value as Record<string, unknown>;

    return (
        token.version === 1 &&
        typeof token.iv === "string" &&
        typeof token.authTag === "string" &&
        typeof token.ciphertext === "string"
    );
}

function validateStoredTokens(
    tokens: unknown
): tokens is LegacyStoredTokens {
    if (!tokens || typeof tokens !== "object") {
        return false;
    }

    const value = tokens as Record<string, unknown>;

    return (
        isEncryptedToken(value.accessToken) &&
        (
            value.refreshToken === null ||
            isEncryptedToken(value.refreshToken)
        ) &&
        (
            value.expiryDate === null ||
            typeof value.expiryDate === "number"
        )
    );
}

function getAccountId(account: unknown): string | null {
    if (typeof account === "string") {
        return account;
    }

    if (!account || typeof account !== "object") {
        return null;
    }

    const item = account as Record<string, unknown>;

    const id =
        item.resourceName ??
        item.resource_name ??
        item.customerId ??
        item.customer_id ??
        item.account_id ??
        item.id;

    return typeof id === "string" || typeof id === "number"
        ? String(id)
        : null;
}

function getAccountName(
    account: unknown,
    accountId: string
): string {
    if (!account || typeof account !== "object") {
        return accountId;
    }

    const item = account as Record<string, unknown>;

    const name =
        item.name ??
        item.accountName ??
        item.account_name ??
        item.displayName ??
        item.customerName ??
        item.customer_name;

    return typeof name === "string" && name.trim()
        ? name.trim()
        : accountId;
}

function getOptionalString(
    account: unknown,
    ...keys: string[]
): string | undefined {
    if (!account || typeof account !== "object") {
        return undefined;
    }

    const item = account as Record<string, unknown>;

    for (const key of keys) {
        const value = item[key];

        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }

    return undefined;
}

function toDateOrNow(value: unknown): Date {
    if (typeof value === "string" || typeof value === "number") {
        const date = new Date(value);

        if (!Number.isNaN(date.getTime())) {
            return date;
        }
    }

    return new Date();
}

function toCredentials(tokens: LegacyStoredTokens) {
    const accessToken: EncryptedSecret = {
        version: tokens.accessToken.version,
        iv: tokens.accessToken.iv,
        authTag: tokens.accessToken.authTag,
        ciphertext: tokens.accessToken.ciphertext,
    };

    const refreshToken: EncryptedSecret | null =
        tokens.refreshToken
            ? {
                version: tokens.refreshToken.version,
                iv: tokens.refreshToken.iv,
                authTag: tokens.refreshToken.authTag,
                ciphertext: tokens.refreshToken.ciphertext,
            }
            : null;

    return {
        accessToken,
        refreshToken,
        expiresAt:
            tokens.expiryDate === null
                ? null
                : new Date(tokens.expiryDate),
    };
}

async function migrateUser(
    legacyUserId: string,
    legacyUser: LegacyUserConnection
): Promise<void> {
    const userId = legacyUser.clerk?.userId || legacyUserId;

    if (!userId) {
        report.warnings++;
        console.warn("Skipping a record without a Clerk user ID.");
        return;
    }

    report.usersProcessed++;

    console.log(`\nMigrating user: ${userId}`);

    if (!DRY_RUN) {
        const userFields: Record<string, unknown> = {};

        if (legacyUser.clerk.email) {
            userFields.email = legacyUser.clerk.email;
        }

        await UserModel.updateOne(
            { clerkUserId: userId },
            {
                $set: userFields,
                $setOnInsert: {
                    clerkUserId: userId,
                },
            },
            {
                upsert: true,
                setDefaultsOnInsert: true,
            }
        ).exec();
    }

    for (const provider of PROVIDERS) {
        await migrateProvider(userId, provider, legacyUser);
    }
}

async function migrateProvider(
    userId: string,
    provider: AdvertisingProvider,
    legacyUser: LegacyUserConnection
): Promise<void> {
    const legacyProvider = legacyUser.providers?.[provider];

    if (!legacyProvider) {
        return;
    }

    console.log(`  Provider: ${provider}`);

    let connection = await ProviderConnectionModel.findOne({
        userId,
        provider,
    })
        .sort({ updatedAt: -1 })
        .exec();

    const hasStoredTokens = validateStoredTokens(
        legacyProvider.tokens
    );

    if (!hasStoredTokens && !connection) {
        if (legacyProvider.accounts?.length) {
            report.warnings++;
            console.warn(
                `  Skipping ${provider} accounts: no encrypted tokens or existing provider connection.`
            );
        }

        return;
    }

    if (!hasStoredTokens && !connection) {
        return;
    }

    if (connection) {
        report.providerConnectionsPreserved++;

        console.log(
            "  Existing MongoDB provider connection found."
        );

        if (OVERWRITE_TOKENS && hasStoredTokens) {
            console.log("  Existing credentials will be overwritten.");
        } else {
            console.log("  Existing credentials will be preserved.");
        }
    } else {
        console.log("  No MongoDB provider connection found.");
    }

    if (DRY_RUN) {
        if (!connection && hasStoredTokens) {
            report.providerConnectionsCreated++;
        }

        await countAccountsForDryRun(legacyProvider.accounts ?? []);
        return;
    }

    if (!connection && hasStoredTokens) {
        connection = await ProviderConnectionModel.create({
            userId,
            provider,
            status: legacyProvider.connected
                ? "connected"
                : "expired",
            credentials: toCredentials(legacyProvider.tokens!),
            scopes: [],
            connectedAt: toDateOrNow(legacyUser.updatedAt),
        });

        report.providerConnectionsCreated++;

        console.log("  Provider connection created.");
    } else if (
        connection &&
        OVERWRITE_TOKENS &&
        hasStoredTokens
    ) {
        connection.credentials = toCredentials(
            legacyProvider.tokens!
        );

        connection.status = legacyProvider.connected
            ? "connected"
            : "expired";

        await connection.save();

        console.log("  Provider credentials updated.");
    }

    if (!connection) {
        return;
    }

    await migrateAccounts(
        userId,
        provider,
        connection._id,
        legacyProvider
    );
}

async function countAccountsForDryRun(
    accounts: unknown[]
): Promise<void> {
    for (const account of accounts) {
        if (getAccountId(account)) {
            report.accountsMigrated++;
        } else {
            report.accountsSkipped++;
            report.warnings++;
        }
    }
}

async function migrateAccounts(
    userId: string,
    provider: AdvertisingProvider,
    connectionId: InstanceType<typeof ProviderConnectionModel>["_id"],
    legacyProvider: LegacyProviderConnection
): Promise<void> {
    const uniqueAccounts = new Map<
        string,
        unknown
    >();

    for (const account of legacyProvider.accounts ?? []) {
        const accountId = getAccountId(account);

        if (!accountId) {
            report.accountsSkipped++;
            report.warnings++;

            console.warn(
                `  Skipping an account without a supported ID for ${provider}.`
            );

            continue;
        }

        uniqueAccounts.set(accountId, account);
    }

    for (const [accountId, account] of uniqueAccounts) {
        const providerData =
            account && typeof account === "object"
                ? account as Record<string, unknown>
                : { id: accountId };

        const fieldsToSet: Record<string, unknown> = {
            name: getAccountName(account, accountId),
            status: "active",
            providerData,
            lastSyncedAt: new Date(),
        };

        const currency = getOptionalString(
            account,
            "currency",
            "currencyCode",
            "currency_code"
        );

        const timezone = getOptionalString(
            account,
            "timezone",
            "timeZone",
            "time_zone"
        );

        if (currency) fieldsToSet.currency = currency;
        if (timezone) fieldsToSet.timezone = timezone;

        await AdAccountModel.updateOne(
            {
                userId,
                connectionId,
                provider,
                externalAccountId: accountId,
            },
            {
                $set: fieldsToSet,
                $setOnInsert: {
                    isSelected: false,
                },
            },
            {
                upsert: true,
            }
        ).exec();

        report.accountsMigrated++;
    }

    const selectedAccountId =
        legacyProvider.selectedAccountId;

    if (
        selectedAccountId &&
        uniqueAccounts.has(selectedAccountId)
    ) {
        await AdAccountModel.updateMany(
            {
                userId,
                connectionId,
                provider,
                isSelected: true,
            },
            {
                $set: {
                    isSelected: false,
                },
            }
        ).exec();

        await AdAccountModel.updateOne(
            {
                userId,
                connectionId,
                provider,
                externalAccountId: selectedAccountId,
            },
            {
                $set: {
                    isSelected: true,
                },
            }
        ).exec();

        console.log(
            `  Selected account migrated: ${selectedAccountId}`
        );
    } else if (selectedAccountId) {
        report.warnings++;

        console.warn(
            `  Selected account ${selectedAccountId} was not found in the legacy account list.`
        );
    }
}

async function main(): Promise<void> {
    console.log("====================================");
    console.log(" User Connections Migration");
    console.log("====================================");

    console.log(
        `Mode: ${DRY_RUN ? "DRY RUN - no database writes" : "APPLY - database writes enabled"}`
    );

    if (OVERWRITE_TOKENS) {
        console.log("Existing provider tokens: OVERWRITE ENABLED");
    }

    const content = await fs.readFile(
        CONNECTION_FILE,
        "utf8"
    );

    if (!content.trim()) {
        throw new Error("The legacy connection JSON file is empty.");
    }

    const legacyStore = JSON.parse(
        content
    ) as LegacyConnectionStore;

    await connectToMongoDB();

    try {
        for (const [userId, legacyUser] of Object.entries(legacyStore)) {
            await migrateUser(userId, legacyUser);
        }

        console.log("\n====================================");
        console.log(" Migration Summary");
        console.log("====================================");

        console.log(`Users processed: ${report.usersProcessed}`);
        console.log(
            `Provider connections created: ${report.providerConnectionsCreated}`
        );
        console.log(
            `Existing provider connections preserved: ${report.providerConnectionsPreserved}`
        );
        console.log(`Accounts migrated/planned: ${report.accountsMigrated}`);
        console.log(`Accounts skipped: ${report.accountsSkipped}`);
        console.log(`Warnings: ${report.warnings}`);

        if (DRY_RUN) {
            console.log(
                "\nDry run completed. No database records were changed."
            );

            console.log(
                "Run with --apply to perform the migration."
            );
        } else {
            console.log(
                "\nMigration completed. The original JSON file has not been deleted."
            );
        }
    } finally {
        await disconnectFromMongoDB();
    }
}

main().catch((error) => {
    console.error("\nMigration failed:", error);
    process.exitCode = 1;
});
