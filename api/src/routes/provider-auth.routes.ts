import express, { type Request } from "express";
import crypto from "node:crypto";
import { getAuth } from "@clerk/express";

import {
  GOOGLE_ADS_SCOPE,
  createGoogleOAuthClient,
  exchangeGoogleAuthorizationCode,
} from "../config/google.js";

import {
  createMetaAuthorizationUrl,
  getMetaOAuthConfig,
} from "../config/meta.js";

import {
  getUserConnection,
  saveProviderTokens,
  saveProviderAccounts,
} from "../utils/connection-storage.utils.js";

import { getProviderAccessToken } from "../utils/provider-token.utils.js";

const router = express.Router();

const FRONTEND_URL =
  process.env.FRONTEND_URL || "http://localhost:3000";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const MAX_META_AD_ACCOUNTS = 1000;

type OAuthProvider = "googleAds" | "metaAds";
type FrontendProvider = "google" | "meta";

interface OAuthState {
  userId: string;
  provider: OAuthProvider;
  createdAt: number;
}

interface MetaTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

interface MetaAdAccount {
  id?: string;
  account_id?: string;
  name?: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
  timezone_id?: number;
  [key: string]: unknown;
}

interface MetaAdAccountsResponse {
  data?: MetaAdAccount[];
  paging?: {
    next?: string;
    cursors?: {
      after?: string;
    };
  };
}

interface MetaApiErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
}

interface GoogleAccessibleCustomersResponse {
  resourceNames?: string[];
  [key: string]: unknown;
}

// ------------------------------------------------------------------
// OAUTH STATE
// ------------------------------------------------------------------

// The in-memory store makes states single-use within one backend
// process. For multiple backend instances, move this store to Redis
// or another shared store.

const pendingOAuthStates = new Map<string, OAuthState>();

function getOAuthStateSecret(): string {
  // SESSION_SECRET is retained as a transition fallback because
  // the existing Meta OAuth implementation already uses it.
  const secret =
    process.env.OAUTH_STATE_SECRET || process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error(
      "OAUTH_STATE_SECRET or SESSION_SECRET must be configured."
    );
  }

  return secret;
}

function signOAuthNonce(nonce: string): string {
  return crypto
    .createHmac("sha256", getOAuthStateSecret())
    .update(nonce)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function removeExpiredOAuthStates(): void {
  const now = Date.now();

  for (const [nonce, state] of pendingOAuthStates.entries()) {
    if (now - state.createdAt > OAUTH_STATE_TTL_MS) {
      pendingOAuthStates.delete(nonce);
    }
  }
}

function createOAuthState(
  userId: string,
  provider: OAuthProvider
): string {
  removeExpiredOAuthStates();

  const nonce = crypto.randomBytes(32).toString("hex");
  const signature = signOAuthNonce(nonce);

  pendingOAuthStates.set(nonce, {
    userId,
    provider,
    createdAt: Date.now(),
  });

  return `${nonce}.${signature}`;
}

function consumeOAuthState(
  state: string,
  expectedProvider: OAuthProvider
): OAuthState | null {
  const parts = state.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const [nonce, signature] = parts;

  if (!nonce || !signature) {
    return null;
  }

  const expectedSignature = signOAuthNonce(nonce);

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  const savedState = pendingOAuthStates.get(nonce);

  // Consume the state before checking the remaining fields.
  // A valid state cannot be reused after a callback attempt.
  pendingOAuthStates.delete(nonce);

  if (!savedState) {
    return null;
  }

  if (Date.now() - savedState.createdAt > OAUTH_STATE_TTL_MS) {
    return null;
  }

  if (savedState.provider !== expectedProvider) {
    return null;
  }

  return savedState;
}

// ------------------------------------------------------------------
// COMMON HELPERS
// ------------------------------------------------------------------

function getAuthenticatedUserId(req: Request): string | null {
  const auth = getAuth(req);

  if (!auth.isAuthenticated || !auth.userId) {
    return null;
  }

  return auth.userId;
}

function getFrontendProviderUrl(
  provider: FrontendProvider,
  status: "connected" | "error",
  accountSync?: "success" | "error"
): string {
  const url = new URL("/provider", FRONTEND_URL);

  url.searchParams.set(provider, status);

  if (accountSync) {
    url.searchParams.set(`${provider}Accounts`, accountSync);
  }

  return url.toString();
}

async function requestMetaJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const apiError = body as MetaApiErrorResponse | null;

    const message =
      apiError?.error?.message ||
      `Meta Graph API request failed with status ${response.status}.`;

    throw new Error(message);
  }

  if (!body || typeof body !== "object") {
    throw new Error("Meta returned an invalid API response.");
  }

  return body as T;
}

// ------------------------------------------------------------------
// GOOGLE ADS OAUTH
// ------------------------------------------------------------------

// GET /auth/google
router.get("/google", (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const state = createOAuthState(userId, "googleAds");
    const oauthClient = createGoogleOAuthClient();

    const authUrl = oauthClient.generateAuthUrl({
      access_type: "offline",
      scope: [GOOGLE_ADS_SCOPE],
      include_granted_scopes: true,
      prompt: "consent",
      state,
    });

    return res.json({ authUrl });
  } catch (error) {
    console.error("Google OAuth initiation error:", error);

    return res.status(500).json({
      message: "Unable to start Google authorization.",
    });
  }
});

// GET /auth/google/callback
router.get("/google/callback", async (req, res) => {
  try {
    const state = req.query.state;
    const googleError = req.query.error;
    const code = req.query.code;

    if (typeof state !== "string") {
      return res.redirect(getFrontendProviderUrl("google", "error"));
    }

    const stateData = consumeOAuthState(state, "googleAds");

    if (!stateData) {
      return res.redirect(getFrontendProviderUrl("google", "error"));
    }

    if (typeof googleError === "string") {
      return res.redirect(getFrontendProviderUrl("google", "error"));
    }

    if (typeof code !== "string") {
      return res.redirect(getFrontendProviderUrl("google", "error"));
    }

    const userId = stateData.userId;

    const tokens = await exchangeGoogleAuthorizationCode(code);

    if (!tokens.access_token) {
      return res.redirect(getFrontendProviderUrl("google", "error"));
    }

    // Google may omit refresh_token when the user has already
    // authorized this application. Preserve the existing one.
    const existingConnection = await getUserConnection(userId);

    const existingRefreshToken =
      existingConnection?.providers.googleAds.tokens?.refreshToken ??
      null;

    const refreshToken =
      tokens.refresh_token ?? existingRefreshToken;

    // A Google Ads connection needs a refresh token for persistent
    // backend access.
    if (!refreshToken) {
      console.error(
        "Google authorization did not return a refresh token."
      );

      return res.redirect(getFrontendProviderUrl("google", "error"));
    }

    await saveProviderTokens(userId, "googleAds", {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiryDate:
        typeof tokens.expiry_date === "number"
          ? tokens.expiry_date
          : null,
    });

    return res.redirect(
      getFrontendProviderUrl("google", "connected")
    );
  } catch (error) {
    console.error("Google OAuth callback error:", error);

    return res.redirect(getFrontendProviderUrl("google", "error"));
  }
});

// ------------------------------------------------------------------
// GOOGLE ADS ACCOUNT DISCOVERY
// ------------------------------------------------------------------

// GET /accounts
router.get("/google/accounts", async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const developerToken =
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

    if (!developerToken) {
      return res.status(500).json({
        message: "Google Ads developer token is not configured.",
      });
    }

    // This helper handles access-token expiry and refresh for the
    // authenticated user's own Google connection.
    const accessToken = await getProviderAccessToken(
      userId,
      "googleAds"
    );

    const response = await fetch(
      "https://googleads.googleapis.com/v25/customers:listAccessibleCustomers",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "developer-token": developerToken,
        },
        signal: AbortSignal.timeout(30_000),
      }
    );

    const data = (await response.json().catch(() => ({}))) as
      GoogleAccessibleCustomersResponse;

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    const resourceNames = Array.isArray(data.resourceNames)
      ? data.resourceNames
      : [];

    await saveProviderAccounts(
      userId,
      "googleAds",
      resourceNames
    );

    return res.json({
      message: "Google Ads account discovery successful.",
      accessibleCustomers: data,
    });
  } catch (error) {
    console.error("Google Ads account discovery error:", error);

    return res.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : "Google Ads account discovery failed.",
    });
  }
});

// ------------------------------------------------------------------
// META ADS OAUTH
// ------------------------------------------------------------------

// GET /auth/meta
router.get("/meta", (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const state = createOAuthState(userId, "metaAds");
    const authUrl = createMetaAuthorizationUrl(state);

    return res.json({ authUrl });
  } catch (error) {
    console.error("Meta OAuth initiation error:", error);

    return res.status(500).json({
      message: "Unable to start Meta authorization.",
    });
  }
});

// ------------------------------------------------------------------
// META TOKEN EXCHANGE
// ------------------------------------------------------------------

async function exchangeMetaAuthorizationCode(
  code: string
): Promise<MetaTokenResponse> {
  const config = getMetaOAuthConfig();

  const url = new URL(
    `https://graph.facebook.com/${config.graphApiVersion}/oauth/access_token`
  );

  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("code", code);

  const result = await requestMetaJson<MetaTokenResponse>(url);

  if (!result.access_token) {
    throw new Error("Meta did not return an access token.");
  }

  return result;
}

async function exchangeForLongLivedMetaToken(
  shortLivedAccessToken: string
): Promise<MetaTokenResponse> {
  const config = getMetaOAuthConfig();

  const url = new URL(
    `https://graph.facebook.com/${config.graphApiVersion}/oauth/access_token`
  );

  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedAccessToken);

  const result = await requestMetaJson<MetaTokenResponse>(url);

  if (!result.access_token) {
    throw new Error(
      "Meta did not return a long-lived access token."
    );
  }

  return result;
}

// ------------------------------------------------------------------
// META AD ACCOUNT DISCOVERY
// ------------------------------------------------------------------

async function fetchAllMetaAdAccounts(
  accessToken: string
): Promise<Record<string, unknown>[]> {
  const config = getMetaOAuthConfig();

  const accounts: MetaAdAccount[] = [];
  let after: string | undefined;

  while (true) {
    const url = new URL(
      `https://graph.facebook.com/${config.graphApiVersion}/me/adaccounts`
    );

    url.searchParams.set(
      "fields",
      [
        "id",
        "account_id",
        "name",
        "account_status",
        "currency",
        "timezone_name",
        "timezone_id",
      ].join(",")
    );

    url.searchParams.set("limit", "100");
    url.searchParams.set("access_token", accessToken);

    if (after) {
      url.searchParams.set("after", after);
    }

    const page =
      await requestMetaJson<MetaAdAccountsResponse>(url);

    const pageAccounts = Array.isArray(page.data) ? page.data : [];

    accounts.push(...pageAccounts);

    const hasNextPage = Boolean(page.paging?.next);

    if (!hasNextPage) {
      break;
    }

    if (accounts.length >= MAX_META_AD_ACCOUNTS) {
      throw new Error(
        `Meta account discovery exceeded the ${MAX_META_AD_ACCOUNTS} account limit. No account sync was saved.`
      );
    }

    const nextCursor = page.paging?.cursors?.after;

    if (!nextCursor) {
      throw new Error(
        "Meta returned another account page without a pagination cursor."
      );
    }

    after = nextCursor;
  }

  return accounts
    .filter(
      (account): account is MetaAdAccount & { id: string } =>
        typeof account.id === "string" && account.id.length > 0
    )
    .map((account) => ({
      id: account.id,
      accountId: account.id,
      account_id: account.account_id,
      accountNumber: account.account_id ?? null,
      name: account.name ?? account.id,
      status:
        account.account_status !== undefined
          ? String(account.account_status)
          : "unknown",
      account_status: account.account_status,
      currency: account.currency ?? null,
      timezone: account.timezone_name ?? null,
      timezone_name: account.timezone_name ?? null,
      timezone_id: account.timezone_id ?? null,
    }));
}

// GET /auth/meta/callback
router.get("/meta/callback", async (req, res) => {
  try {
    const state = req.query.state;
    const metaError = req.query.error;
    const code = req.query.code;

    if (typeof state !== "string") {
      return res.redirect(getFrontendProviderUrl("meta", "error"));
    }

    const stateData = consumeOAuthState(state, "metaAds");

    if (!stateData) {
      return res.redirect(getFrontendProviderUrl("meta", "error"));
    }

    if (typeof metaError === "string") {
      return res.redirect(getFrontendProviderUrl("meta", "error"));
    }

    if (typeof code !== "string") {
      return res.redirect(getFrontendProviderUrl("meta", "error"));
    }

    const userId = stateData.userId;

    const shortLivedToken =
      await exchangeMetaAuthorizationCode(code);

    let finalToken = shortLivedToken;

    // Long-lived token exchange is attempted, but a temporary
    // exchange failure does not discard a valid short-lived token.
    try {
      finalToken = await exchangeForLongLivedMetaToken(
        shortLivedToken.access_token
      );
    } catch (error) {
      console.warn(
        "Meta long-lived token exchange failed; retaining the token returned by the initial exchange.",
        error
      );
    }

    const expiryDate =
      typeof finalToken.expires_in === "number"
        ? Date.now() + finalToken.expires_in * 1000
        : null;

    // Persist the token before account discovery. A discovery failure
    // should not undo a successful OAuth connection.
    await saveProviderTokens(userId, "metaAds", {
      accessToken: finalToken.access_token,
      refreshToken: null,
      expiryDate,
    });

    try {
      const accounts = await fetchAllMetaAdAccounts(
        finalToken.access_token
      );

      await saveProviderAccounts(
        userId,
        "metaAds",
        accounts
      );

      return res.redirect(
        getFrontendProviderUrl("meta", "connected", "success")
      );
    } catch (accountError) {
      console.error(
        "Meta connected, but ad account discovery failed:",
        accountError
      );

      return res.redirect(
        getFrontendProviderUrl("meta", "connected", "error")
      );
    }
  } catch (error) {
    console.error("Meta OAuth callback error:", error);

    return res.redirect(getFrontendProviderUrl("meta", "error"));
  }
});

// ------------------------------------------------------------------
// META ADS ACCOUNT REFRESH
// ------------------------------------------------------------------

// GET /meta/accounts
router.get("/meta/accounts", async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const accessToken = await getProviderAccessToken(
      userId,
      "metaAds"
    );

    const accounts = await fetchAllMetaAdAccounts(accessToken);

    await saveProviderAccounts(
      userId,
      "metaAds",
      accounts
    );

    return res.json({
      message: "Meta ad account discovery successful.",
      accounts,
    });
  } catch (error) {
    console.error("Meta ad account discovery error:", error);

    return res.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : "Meta ad account discovery failed.",
    });
  }
});

export default router;