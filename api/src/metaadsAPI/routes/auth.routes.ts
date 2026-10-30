import { Router, type Request } from "express";
import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  saveProviderAccounts,
  saveProviderTokens,
} from "../../services/connection-storage.service.js";

const router = Router();

const {
  META_APP_ID = "",
  META_APP_SECRET = "",
  META_LOGIN_CONFIG_ID = "",
  META_REDIRECT_URI = "",
  META_GRAPH_API_VERSION = "v26.0",
  SESSION_SECRET = "",
  FRONTEND_URL = "http://localhost:3000",
} = process.env;

const STATE_TTL_MS = 10 * 60 * 1000;
const MAX_AD_ACCOUNTS = 1000;

// Single-process replay guard. Use Redis/shared storage for multi-instance production.
const consumedNonces = new Map<string, number>();

type OAuthStatePayload = {
  userId: string;
  nonce: string;
  issuedAt: number;
};

type MetaAccount = {
  id: string;
  account_id?: string;
  name?: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
  timezone_id?: number;
};

type MetaTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string; type?: string; code?: number };
};

type MetaAccountsResponse = {
  data?: MetaAccount[];
  paging?: { cursors?: { after?: string } };
  error?: { message?: string; code?: number };
};

type ClerkRequest = Request & { auth?: { userId?: string } };

function getAuthenticatedUserId(req: Request): string | null {
  return req.auth()?.userId ?? null;
}

function assertOAuthConfig(): void {
  const missing: string[] = [];
  if (!META_APP_ID) missing.push("META_APP_ID");
  if (!META_APP_SECRET) missing.push("META_APP_SECRET");
  if (!META_LOGIN_CONFIG_ID) missing.push("META_LOGIN_CONFIG_ID");
  if (!META_REDIRECT_URI) missing.push("META_REDIRECT_URI");
  if (!SESSION_SECRET) missing.push("SESSION_SECRET");

  if (missing.length) {
    throw new Error(`Missing Meta OAuth configuration: ${missing.join(", ")}`);
  }
}

function signState(payload: OAuthStatePayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SESSION_SECRET)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyAndConsumeState(state: string): OAuthStatePayload | null {
  const [encoded, suppliedSignature, extra] = state.split(".");
  if (!encoded || !suppliedSignature || extra !== undefined) return null;

  const expectedSignature = createHmac("sha256", SESSION_SECRET)
    .update(encoded)
    .digest();

  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(suppliedSignature, "base64url");
  } catch {
    return null;
  }

  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return null;
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as OAuthStatePayload;
  } catch {
    return null;
  }

  const age = Date.now() - payload.issuedAt;
  if (
    !payload.userId ||
    !payload.nonce ||
    !Number.isFinite(payload.issuedAt) ||
    age < 0 ||
    age > STATE_TTL_MS
  ) {
    return null;
  }

  for (const [nonce, expiry] of consumedNonces) {
    if (expiry <= Date.now()) consumedNonces.delete(nonce);
  }

  if (consumedNonces.has(payload.nonce)) return null;
  consumedNonces.set(payload.nonce, Date.now() + STATE_TTL_MS);
  return payload;
}

function providerPageUrl(params: Record<string, string>): string {
  const url = new URL("/provider", FRONTEND_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  console.log(
    url.href.toString()
  );

  return url.href.toString();
}

async function requestMetaJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json()) as T & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(body.error?.message || "Meta Graph API request failed.");
  }

  return body;
}

async function exchangeCodeForToken(code: string): Promise<MetaTokenResponse> {
  const url = new URL(
    `https://graph.facebook.com/${META_GRAPH_API_VERSION}/oauth/access_token`,
  );
  url.searchParams.set("client_id", META_APP_ID);
  url.searchParams.set("client_secret", META_APP_SECRET);
  url.searchParams.set("redirect_uri", META_REDIRECT_URI);
  url.searchParams.set("code", code);

  return requestMetaJson<MetaTokenResponse>(url);
}

// For user-token configurations, exchange the short-lived token for a
// long-lived token. System-user configurations may not support this exchange;
// in that case retain the token returned by the configured login flow.
async function tryExtendToken(
  initial: MetaTokenResponse,
): Promise<MetaTokenResponse> {
  if (!initial.access_token || typeof initial.expires_in !== "number") {
    return initial;
  }

  const url = new URL(
    `https://graph.facebook.com/${META_GRAPH_API_VERSION}/oauth/access_token`,
  );
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", META_APP_ID);
  url.searchParams.set("client_secret", META_APP_SECRET);
  url.searchParams.set("fb_exchange_token", initial.access_token);

  try {
    const extended = await requestMetaJson<MetaTokenResponse>(url);
    return extended.access_token ? extended : initial;
  } catch (error) {
    console.warn(
      "Meta long-lived token exchange was not available; retaining the token from Login for Business:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return initial;
  }
}

async function fetchAllAdAccounts(accessToken: string): Promise<MetaAccount[]> {
  const accounts: MetaAccount[] = [];
  let after: string | undefined;

  while (accounts.length < MAX_AD_ACCOUNTS) {
    const url = new URL(
      `https://graph.facebook.com/${META_GRAPH_API_VERSION}/me/adaccounts`,
    );
    url.searchParams.set(
      "fields",
      "id,account_id,name,account_status,currency,timezone_name,timezone_id",
    );
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await response.json()) as MetaAccountsResponse;

    if (!response.ok) {
      throw new Error(body.error?.message || "Could not retrieve Meta ad accounts.");
    }

    const page = Array.isArray(body.data) ? body.data : [];
    accounts.push(...page);

    const nextCursor = body.paging?.cursors?.after;
    if (!nextCursor || page.length === 0) break;
    after = nextCursor;
  }

  // Store Meta's `id` (act_...) as the canonical selectable ID. Keeping the
  // numeric account number under a different property avoids selecting an ID
  // that later needs to be re-normalized for Marketing API endpoints.
  return accounts.slice(0, MAX_AD_ACCOUNTS).map((account) => ({
    id: account.id,
    accountNumber: account.account_id ?? account.id.replace(/^act_/, ""),
    name: account.name ?? account.id,
    account_status: account.account_status,
    currency: account.currency,
    timezone_name: account.timezone_name,
    timezone_id: account.timezone_id,
  }));
}

// GET /api/meta-ads/auth/meta
// Frontend calls this with the verified Clerk bearer token and then navigates
// the browser to the returned Meta authorization URL.
router.get("/auth/meta", (req, res) => {
  try {
    assertOAuthConfig();

    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const state = signState({
      userId,
      nonce: randomBytes(32).toString("hex"),
      issuedAt: Date.now(),
    });

    const authUrl = new URL(
      `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth`,
    );
    authUrl.searchParams.set("client_id", META_APP_ID);
    authUrl.searchParams.set("redirect_uri", META_REDIRECT_URI);
    authUrl.searchParams.set("config_id", META_LOGIN_CONFIG_ID);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);

    return res.json({ authUrl: authUrl.toString() });
  } catch (error) {
    console.error(
      "Could not start Meta OAuth:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return res.status(500).json({
      message: "Unable to start Meta authorization. Check server configuration.",
    });
  }
});

// GET /api/meta-ads/auth/meta/callback
// Meta redirects here without a Clerk token. Signed state binds the callback
// to the user who initiated the connection.
router.get("/auth/meta/callback", async (req, res) => {
  try {
    assertOAuthConfig();

    if (typeof req.query.error === "string") {
      return res.redirect(
        providerPageUrl({ meta: "error", reason: "authorization_denied" }),
      );
    }

    const code = typeof req.query.code === "string" ? req.query.code : null;
    const returnedState =
      typeof req.query.state === "string" ? req.query.state : null;

    if (!code || !returnedState) {
      return res.redirect(
        providerPageUrl({ meta: "error", reason: "invalid_callback" }),
      );
    }

    const state = verifyAndConsumeState(returnedState);
    if (!state) {
      return res.redirect(
        providerPageUrl({ meta: "error", reason: "invalid_or_expired_state" }),
      );
    }

    const initialToken = await exchangeCodeForToken(code);
    if (!initialToken.access_token) {
      console.error(
        "Meta token exchange returned no access token:",
        initialToken.error?.message ?? "Unknown Meta error",
      );
      return res.redirect(
        providerPageUrl({ meta: "error", reason: "token_exchange_failed" }),
      );
    }

    const tokenData = await tryExtendToken(initialToken);
    const accessToken = tokenData.access_token ?? initialToken.access_token;
    const expiryDate =
      typeof tokenData.expires_in === "number"
        ? Date.now() + tokenData.expires_in * 1000
        : null;

    // Persist only in the authenticated user's encrypted connection record.
    // Meta does not use Google's standard OAuth refresh-token field.
    await saveProviderTokens(state.userId, "metaAds", {
      accessToken,
      refreshToken: null,
      expiryDate,
    });

    let accountsLoaded = "yes";
    try {
      const accounts = await fetchAllAdAccounts(accessToken);
      await saveProviderAccounts(state.userId, "metaAds", accounts);
    } catch (error) {
      accountsLoaded = "no";
      console.error(
        "Meta token saved, but ad account discovery failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
    }

    return res.redirect(
      providerPageUrl({ meta: "connected" }),
    );
  } catch (error) {
    console.error(
      "Meta OAuth callback failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return res.redirect(
      providerPageUrl({ meta: "error", reason: "callback_failed" }),
    );
  }
});

export default router;
