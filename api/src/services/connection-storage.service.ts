
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const CONNECTION_FILE = path.join(
    process.cwd(),
    "data",
    "user-connections.json"
);

export type ProviderName = "googleAds" | "metaAds";

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

interface EncryptedToken {
    version: 1;
    iv: string;
    authTag: string;
    ciphertext: string;
}

interface StoredProviderTokens {
    accessToken: EncryptedToken;
    refreshToken: EncryptedToken | null;
    expiryDate: number | null;
}

interface StoredProviderConnection {
    connected: boolean;
    tokens: StoredProviderTokens | null;
    accounts: unknown[];
    selectedAccountId: string | null;

}

interface StoredUserConnection {
    clerk: UserConnection["clerk"];
    providers: {
        googleAds: StoredProviderConnection;
        metaAds: StoredProviderConnection;
    };
    updatedAt: string;
}

type ConnectionStore = Record<string, StoredUserConnection>;

// Serialize read-modify-write operations within this Node.js process.
let writeQueue: Promise<void> = Promise.resolve();

function withStoreLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = writeQueue.then(operation, operation);

    writeQueue = result.then(
        () => undefined,
        () => undefined
    );

    return result;
}

// TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.
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

function encryptToken(value: string): EncryptedToken {
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

function decryptToken(value: EncryptedToken): string {
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

async function readStore(): Promise<ConnectionStore> {
    try {
        const content = await fs.readFile(CONNECTION_FILE, "utf8");

        // Support a new or currently empty JSON file.
        if (!content.trim()) {
            return {};
        }

        return JSON.parse(content) as ConnectionStore;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return {};
        }

        throw error;
    }
}

async function writeStore(store: ConnectionStore): Promise<void> {
    await fs.mkdir(path.dirname(CONNECTION_FILE), {
        recursive: true,
    });

    const temporaryFile = `${CONNECTION_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`;

    try {
        await fs.writeFile(
            temporaryFile,
            JSON.stringify(store, null, 2),
            { encoding: "utf8", mode: 0o600 }
        );

        await fs.rename(temporaryFile, CONNECTION_FILE);
    } catch (error) {
        await fs.unlink(temporaryFile).catch(() => undefined);
        throw error;
    }
}

function createEmptyConnection(userId: string): StoredUserConnection {
    const emptyProvider = (): StoredProviderConnection => ({
        connected: false,
        tokens: null,
        accounts: [],
        selectedAccountId: null

    });

    return {
        clerk: { userId },
        providers: {
            googleAds: emptyProvider(),
            metaAds: emptyProvider(),
        },
        updatedAt: new Date().toISOString(),
    };
}

function decryptProvider(
    provider: StoredProviderConnection
): ProviderConnection {
    if (!provider.tokens) {
        return {
            connected: provider.connected,
            tokens: null,
            accounts: provider.accounts,
            selectedAccountId: provider.selectedAccountId ?? null,
        };
    }

    return {
        connected: provider.connected,
        accounts: provider.accounts,
        selectedAccountId: provider.selectedAccountId ?? null,
        tokens: {
            accessToken: decryptToken(provider.tokens.accessToken),
            refreshToken: provider.tokens.refreshToken
                ? decryptToken(provider.tokens.refreshToken)
                : null,
            expiryDate: provider.tokens.expiryDate,
        },
    };
}

function decryptConnection(
    connection: StoredUserConnection
): UserConnection {
    return {
        clerk: connection.clerk,
        updatedAt: connection.updatedAt,
        providers: {
            googleAds: decryptProvider(connection.providers.googleAds),
            metaAds: decryptProvider(connection.providers.metaAds),
        },
    };
}

export async function getUserConnection(
    userId: string
): Promise<UserConnection | null> {
    const store = await readStore();
    const connection = store[userId];

    return connection ? decryptConnection(connection) : null;
}

export async function getOrCreateUserConnection(
    userId: string
): Promise<UserConnection> {
    const connection = await withStoreLock(async () => {
        const store = await readStore();

        if (!store[userId]) {
            store[userId] = createEmptyConnection(userId);
            await writeStore(store);
        }

        return store[userId];
    });

    return decryptConnection(connection);
}

// Save tokens for one provider without changing the other provider.
// An omitted or null refresh token preserves the existing refresh token.
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

    await withStoreLock(async () => {
        const store = await readStore();

        const connection =
            store[userId] ?? createEmptyConnection(userId);

        const providerConnection = connection.providers[provider];
        const existingTokens = providerConnection.tokens;

        const refreshToken =
            tokens.refreshToken || null;

        providerConnection.tokens = {
            accessToken: encryptToken(tokens.accessToken),
            refreshToken: refreshToken
                ? encryptToken(refreshToken)
                : existingTokens?.refreshToken ?? null,
            expiryDate:
                tokens.expiryDate ??
                existingTokens?.expiryDate ??
                null,
        };

        // A persistent connection requires a refresh token.
        providerConnection.connected =
            providerConnection.tokens.refreshToken !== null || (provider === 'metaAds' && providerConnection.tokens.accessToken !== null);

        connection.updatedAt = new Date().toISOString();
        store[userId] = connection;

        await writeStore(store);
    });
}

// Save account information without changing the user's tokens
// or the other provider's information.
export async function saveProviderAccounts(
    userId: string,
    provider: ProviderName,
    accounts: unknown[]
): Promise<void> {
    await withStoreLock(async () => {
        const store = await readStore();

        const connection =
            store[userId] ?? createEmptyConnection(userId);

        connection.providers[provider].accounts = accounts;
        connection.updatedAt = new Date().toISOString();

        store[userId] = connection;

        await writeStore(store);
    });
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

export async function selectProviderAccount(
    userId: string,
    provider: ProviderName,
    accountId: string
): Promise<void> {
    if (!accountId) {
        throw new Error("Account ID is required.");
    }

    await withStoreLock(async () => {
        const store = await readStore();
        const connection = store[userId];

        if (!connection) {
            throw new Error("User connection not found.");
        }

        const providerConnection = connection.providers[provider];

        const accountExists = providerConnection.accounts.some(
            (account) => getAccountId(account) === accountId
        );

        if (!accountExists) {
            throw new Error("Selected account was not found.");
        }

        providerConnection.selectedAccountId = accountId;
        connection.updatedAt = new Date().toISOString();

        await writeStore(store);
    });
}