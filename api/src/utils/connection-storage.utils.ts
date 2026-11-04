
import crypto from "node:crypto";

import UserModel from "../models/user.model.js";
import ProviderConnectionModel, {
    type AdvertisingProvider,
    type EncryptedSecret,
    type ProviderConnectionDocument,
} from "../models/provider-connection.model.js";
import AdAccountModel from "../models/ad-account.model.js";

export type ProviderName = AdvertisingProvider;

export interface ProviderTokens {
    accessToken: string;
    refreshToken: string | null;
    expiryDate: number | null;
}

export interface ProviderConnection {
    connected: boolean;
    tokens: ProviderTokens | null;
    accounts: unknown[];
    selectedAccountId: string | null;
}

export interface UserConnection {
    clerk: {
        userId: string;
        email?: string;
    };
    providers: {
        googleAds: ProviderConnection;
        metaAds: ProviderConnection;
    };
    updatedAt: string;
}

function getEncryptionKey(): Buffer {
    const encodedKey = process.env.TOKEN_ENCRYPTION_KEY;

    if (!encodedKey) {
        throw new Error("TOKEN_ENCRYPTION_KEY is missing from .env");
    }

    const key = Buffer.from(encodedKey, "base64");

    if (key.length !== 32) {
        throw new Error(
            "TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key."
        );
    }

    return key;
}

function encryptToken(value: string): EncryptedSecret {
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv(
        "aes-256-gcm",
        getEncryptionKey(),
        iv
    );

    const ciphertext = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
    ]);

    return {
        version: 1,
        iv: iv.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
        ciphertext: ciphertext.toString("base64"),
    };
}

function decryptToken(value: EncryptedSecret): string {
    if (value.version !== 1) {
        throw new Error("Unsupported encrypted token format.");
    }

    const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        getEncryptionKey(),
        Buffer.from(value.iv, "base64")
    );

    decipher.setAuthTag(Buffer.from(value.authTag, "base64"));

    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(value.ciphertext, "base64")),
        decipher.final(),
    ]);

    return plaintext.toString("utf8");
}

async function ensureUserExists(userId: string): Promise<void> {
    if (!userId?.trim()) {
        throw new Error("User ID is required.");
    }

    await UserModel.updateOne(
        { clerkUserId: userId },
        {
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

async function findProviderConnection(
    userId: string,
    provider: ProviderName,
    includeCredentials = false
): Promise<ProviderConnectionDocument | null> {
    let query = ProviderConnectionModel.find({
        userId,
        provider,
    }).sort({ updatedAt: -1 }).limit(2);

    if (includeCredentials) {
        query = query.select("+credentials");
    }

    const connections = await query.exec();

    if (connections.length > 1) {
        throw new Error(
            `Multiple ${provider} connections exist for this user. ` +
            "The current connection API requires a single provider identity."
        );
    }

    return connections[0] ?? null;
}
function createEmptyProvider(): ProviderConnection {
    return {
        connected: false,
        tokens: null,
        accounts: [],
        selectedAccountId: null,
    };
}

function decryptProviderTokens(
    connection: ProviderConnectionDocument | null
): ProviderTokens | null {
    const credentials = connection?.credentials;

    if (!credentials) {
        return null;
    }

    return {
        accessToken: decryptToken(credentials.accessToken),
        refreshToken: credentials.refreshToken
            ? decryptToken(credentials.refreshToken)
            : null,
        expiryDate: credentials.expiresAt?.getTime() ?? null,
    };
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

function getAccountName(account: unknown, accountId: string): string {
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

function getAccountStringField(
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

interface BuiltProviderConnection {
    connection: ProviderConnection;
    latestUpdatedAt: Date;
}

async function buildProviderConnection(
    userId: string,
    provider: ProviderName,
    providerDocument: ProviderConnectionDocument | null
): Promise<BuiltProviderConnection> {
    if (!providerDocument) {
        return {
            connection: createEmptyProvider(),
            latestUpdatedAt: new Date(0),
        };
    }

    const accountDocuments = await AdAccountModel.find({
        userId,
        connectionId: providerDocument._id,
        provider,
    })
        .sort({ createdAt: 1 })
        .exec();

    const selectedAccount = accountDocuments.find(
        (account) => account.isSelected
    );

    const accounts = accountDocuments.map(
        (account) =>
            account.providerData ?? {
                id: account.externalAccountId,
                name: account.name,
            }
    );

    const accountUpdateTimes = accountDocuments.map(
        (account) => account.updatedAt.getTime()
    );

    const latestAccountUpdate = accountUpdateTimes.length
        ? Math.max(...accountUpdateTimes)
        : 0;

    return {
        connection: {
            connected: providerDocument.status === "connected",
            tokens: decryptProviderTokens(providerDocument),
            accounts,
            selectedAccountId:
                selectedAccount?.externalAccountId ?? null,
        },
        latestUpdatedAt: new Date(
            Math.max(
                providerDocument.updatedAt.getTime(),
                latestAccountUpdate
            )
        ),
    };
}

export async function getUserConnection(
    userId: string
): Promise<UserConnection | null> {
    const user = await UserModel.findOne({
        clerkUserId: userId,
    }).exec();

    if (!user) {
        return null;
    }

    const [googleDocument, metaDocument] = await Promise.all([
        findProviderConnection(userId, "googleAds", true),
        findProviderConnection(userId, "metaAds", true),
    ]);

    const [googleResult, metaResult] = await Promise.all([
        buildProviderConnection(userId, "googleAds", googleDocument),
        buildProviderConnection(userId, "metaAds", metaDocument),
    ]);

    const latestUpdatedAt = Math.max(
        user.updatedAt.getTime(),
        googleResult.latestUpdatedAt.getTime(),
        metaResult.latestUpdatedAt.getTime()
    );

    return {
        clerk: {
            userId: user.clerkUserId,
            ...(user.email ? { email: user.email } : {}),
        },
        providers: {
            googleAds: googleResult.connection,
            metaAds: metaResult.connection,
        },
        updatedAt: new Date(latestUpdatedAt).toISOString(),
    };
}

export async function getOrCreateUserConnection(
    userId: string
): Promise<UserConnection> {
    await ensureUserExists(userId);

    const connection = await getUserConnection(userId);

    if (!connection) {
        throw new Error("Unable to create or retrieve user connection.");
    }

    return connection;
}

/**
 * Save tokens for one provider without modifying the other provider.
 *
 * An omitted or null refresh token preserves the existing refresh token.
 * An omitted or null expiry date preserves the existing expiry date.
 */
export async function saveProviderTokens(
    userId: string,
    provider: ProviderName,
    tokens: {
        accessToken: string;
        refreshToken?: string | null;
        expiryDate?: number | null;
    }
): Promise<void> {
    if (!tokens.accessToken) {
        throw new Error("Access token is required.");
    }

    await ensureUserExists(userId);

    const existingConnection = await findProviderConnection(
        userId,
        provider,
        true
    );

    const existingCredentials = existingConnection?.credentials;

    const refreshToken = tokens.refreshToken
        ? encryptToken(tokens.refreshToken)
        : existingCredentials?.refreshToken ?? null;

    const expiryTimestamp =
        tokens.expiryDate ??
        existingCredentials?.expiresAt?.getTime() ??
        null;

    const expiresAt =
        expiryTimestamp === null
            ? null
            : new Date(expiryTimestamp);

    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        throw new Error("Invalid token expiry date.");
    }

    const credentials = {
        accessToken: encryptToken(tokens.accessToken),
        refreshToken,
        expiresAt,
        ...(existingCredentials?.tokenType
            ? { tokenType: existingCredentials.tokenType }
            : {}),
    };

const tokenIsValid =
    expiresAt === null || expiresAt.getTime() > Date.now();

const isConnected =
    provider === "googleAds"
        ? Boolean(credentials.refreshToken) || tokenIsValid
        : tokenIsValid;

    if (existingConnection) {
        existingConnection.credentials = credentials;
        existingConnection.status = isConnected
            ? "connected"
            : "expired";

        await existingConnection.save();
        return;
    }

    await ProviderConnectionModel.create({
        userId,
        provider,
        status: isConnected ? "connected" : "expired",
        credentials,
        scopes: [],
        connectedAt: new Date(),
    });
}

/**
 * Replace the stored account list for one provider.
 * Existing selected-account state is preserved when that account
 * is still present in the refreshed list.
 */
export async function saveProviderAccounts(
    userId: string,
    provider: ProviderName,
    accounts: unknown[]
): Promise<void> {
    await ensureUserExists(userId);

    const connection = await findProviderConnection(userId, provider);

    if (!connection) {
        throw new Error(
            `Cannot save ${provider} accounts before saving provider tokens.`
        );
    }

    const uniqueAccounts = new Map<
        string,
        { account: unknown; accountId: string }
    >();

    for (const account of accounts) {
        const accountId = getAccountId(account);

        if (!accountId) {
            throw new Error(
                "Every provider account must contain a supported account ID."
            );
        }

        uniqueAccounts.set(accountId, {
            account,
            accountId,
        });
    }

    const accountRecords = Array.from(uniqueAccounts.values());

    if (accountRecords.length === 0) {
        await AdAccountModel.deleteMany({
            userId,
            connectionId: connection._id,
            provider,
        }).exec();

        return;
    }

    const syncedAt = new Date();

    const operations = accountRecords.map(
        ({ account, accountId }) => {
            const providerData =
                account && typeof account === "object"
                    ? account as Record<string, unknown>
                    : { id: accountId };

            const fieldsToSet: Record<string, unknown> = {
                name: getAccountName(account, accountId),
                status: "active",
                providerData,
                lastSyncedAt: syncedAt,
            };

            const currency = getAccountStringField(
                account,
                "currency",
                "currencyCode",
                "currency_code"
            );

            const timezone = getAccountStringField(
                account,
                "timezone",
                "timeZone",
                "time_zone"
            );

            if (currency) fieldsToSet.currency = currency;
            if (timezone) fieldsToSet.timezone = timezone;

            return {
                updateOne: {
                    filter: {
                        userId,
                        connectionId: connection._id,
                        provider,
                        externalAccountId: accountId,
                    },
                    update: {
                        $set: fieldsToSet,
                        $setOnInsert: {
                            isSelected: false,
                        },
                    },
                    upsert: true,
                },
            };
        }
    );

    await AdAccountModel.bulkWrite(operations, {
        ordered: true,
    });

    // Remove accounts no longer returned by the provider.
    // Accounts that remain keep their existing selection state.
    await AdAccountModel.deleteMany({
        userId,
        connectionId: connection._id,
        provider,
        externalAccountId: {
            $nin: accountRecords.map(({ accountId }) => accountId),
        },
    }).exec();
}

/**
 * Select one account for this user's provider connection.
 */
export async function selectProviderAccount(
    userId: string,
    provider: ProviderName,
    accountId: string
): Promise<void> {
    if (!accountId?.trim()) {
        throw new Error("Account ID is required.");
    }

    const connection = await findProviderConnection(userId, provider);

    if (!connection) {
        throw new Error("Provider connection not found.");
    }

    const account = await AdAccountModel.findOne({
        userId,
        connectionId: connection._id,
        provider,
        externalAccountId: accountId,
    }).exec();

    if (!account) {
        throw new Error("Selected account was not found.");
    }

    // Clear the previous selection before selecting the new account.
    await AdAccountModel.updateMany(
        {
            userId,
            connectionId: connection._id,
            provider,
            isSelected: true,
        },
        {
            $set: {
                isSelected: false,
            },
        }
    ).exec();

    const result = await AdAccountModel.updateOne(
        {
            _id: account._id,
            userId,
            connectionId: connection._id,
            provider,
        },
        {
            $set: {
                isSelected: true,
            },
        }
    ).exec();

    if (result.matchedCount === 0) {
        throw new Error("Selected account was not found.");
    }
}
