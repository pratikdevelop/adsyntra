import express, { type Request, type Response } from "express";
import crypto from "node:crypto";
import { getAuth } from "@clerk/express";

import {
  GOOGLE_ADS_SCOPE,
  createGoogleOAuthClient,
  exchangeGoogleAuthorizationCode,
} from "../config/google.js";

import {
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

interface GoogleAdsApiErrorBody {
  error?: {
    message?: string;
    status?: string;
    code?: number;
    details?: unknown[];
  };
}

interface GoogleAdsSearchResponse {
  results?: Array<{
    customer?: {
      id?: string | number;
      descriptiveName?: string;
      currencyCode?: string;
      timeZone?: string;
      manager?: boolean;
      status?: string;
    };
    customerClient?: {
      id?: string | number;
      clientCustomer?: string;
      level?: number;
      manager?: boolean;
      descriptiveName?: string;
      currencyCode?: string;
      timeZone?: string;
      status?: string;
    };
  }>;
  nextPageToken?: string;
}

interface GoogleDiscoveredAccount {
  id: string;
  resourceName: string;
  customerId: string;
  name: string;
  currency?: string | null;
  currencyCode?: string | null;
  timezone?: string | null;
  timeZone?: string | null;
  isManager: boolean | null;
  accountStatus?: string | null;
  source: "DIRECT_ACCESS" | "MANAGER_HIERARCHY";
}

const GOOGLE_ADS_API_VERSION = "v26";
const MAX_GOOGLE_ROOT_CUSTOMERS = 500;
const MAX_GOOGLE_DISCOVERED_ACCOUNTS = 2000;

function normalizeGoogleCustomerId(value: string | number | undefined): string | null {
  if (value === undefined || value === null) return null;

  const raw = String(value).trim();
  const match = raw.match(/^(?:customers\/)?(\d{6,20})$/);

  return match?.[1] ?? null;
}

function googleResourceName(customerId: string): string {
  return `customers/${customerId}`;
}

function getGoogleApiErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as GoogleAdsApiErrorBody).error;

    if (typeof error?.message === "string" && error.message.trim()) {
      return error.message.trim();
    }
  }

  return fallback;
}

async function searchGoogleAds<T>(
  accessToken: string,
  developerToken: string,
  customerId: string,
  query: string,
): Promise<T[]> {
  const normalizedCustomerId = normalizeGoogleCustomerId(customerId);

  if (!normalizedCustomerId) {
    throw new Error("Google Ads customer ID is invalid.");
  }

  const results: T[] = [];
  let pageToken: string | undefined;

  while (true) {
    const response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${normalizedCustomerId}/googleAds:search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query,
          ...(pageToken ? { pageToken } : {}),
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        `Google Ads account lookup failed for ${normalizedCustomerId}: ${getGoogleApiErrorMessage(
          body,
          `HTTP ${response.status}`,
        )}`,
      );
    }

    const page = (body ?? {}) as {
      results?: T[];
      nextPageToken?: string;
    };

    if (Array.isArray(page.results)) {
      results.push(...page.results);
    }

    if (!page.nextPageToken) break;

    if (results.length >= MAX_GOOGLE_DISCOVERED_ACCOUNTS) {
      throw new Error(
        `Google Ads account discovery exceeded the ${MAX_GOOGLE_DISCOVERED_ACCOUNTS} account safety limit.`,
      );
    }

    pageToken = page.nextPageToken;
  }

  return results;
}

function mapGoogleAccount(
  customerId: string,
  fields: {
    descriptiveName?: string;
    currencyCode?: string;
    timeZone?: string;
    manager?: boolean;
    status?: string;
  },
  source: "DIRECT_ACCESS" | "MANAGER_HIERARCHY",
): GoogleDiscoveredAccount {
  const resourceName = googleResourceName(customerId);

  return {
    id: resourceName,
    resourceName,
    customerId,
    name: fields.descriptiveName?.trim() || `Google Ads ${customerId}`,
    currency: fields.currencyCode ?? null,
    currencyCode: fields.currencyCode ?? null,
    timezone: fields.timeZone ?? null,
    timeZone: fields.timeZone ?? null,
    isManager: typeof fields.manager === "boolean" ? fields.manager : null,
    accountStatus: fields.status ?? null,
    source,
  };
}

/**
 * List customers directly accessible to the OAuth identity, then expand
 * manager-account hierarchies to include advertiser/client accounts.
 *
 * ListAccessibleCustomers intentionally returns only direct access roots.
 * It does not enumerate indirect clients under a manager account.
 */
async function discoverGoogleAdsAccounts(
  accessToken: string,
  developerToken: string,
): Promise<{
  accessibleCustomerResourceNames: string[];
  accounts: GoogleDiscoveredAccount[];
  managerAccountsExpanded: number;
  warnings: string[];
}> {
  const accessibleResponse = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );

  const accessibleBody: unknown = await accessibleResponse.json().catch(() => null);

  if (!accessibleResponse.ok) {
    throw new Error(
      `Google Ads could not list accessible customers: ${getGoogleApiErrorMessage(
        accessibleBody,
        `HTTP ${accessibleResponse.status}`,
      )}`,
    );
  }

  const accessibleData = (accessibleBody ?? {}) as GoogleAccessibleCustomersResponse;
  const accessibleCustomerResourceNames = Array.isArray(accessibleData.resourceNames)
    ? accessibleData.resourceNames.filter(
        (value): value is string =>
          typeof value === "string" && Boolean(normalizeGoogleCustomerId(value)),
      )
    : [];

  if (accessibleCustomerResourceNames.length > MAX_GOOGLE_ROOT_CUSTOMERS) {
    throw new Error(
      `Google returned more than ${MAX_GOOGLE_ROOT_CUSTOMERS} directly accessible customers. Narrow account access before syncing.`,
    );
  }

  const accountMap = new Map<string, GoogleDiscoveredAccount>();
  const warnings: string[] = [];
  let managerAccountsExpanded = 0;

  for (const resourceName of accessibleCustomerResourceNames) {
    const customerId = normalizeGoogleCustomerId(resourceName);
    if (!customerId) continue;

    let customerDetails: Array<{
      customer?: NonNullable<GoogleAdsSearchResponse["results"]>[number]["customer"];
    }> = [];

    try {
      customerDetails = await searchGoogleAds<
        NonNullable<GoogleAdsSearchResponse["results"]>[number]
      >(
        accessToken,
        developerToken,
        customerId,
        [
          "SELECT customer.id, customer.descriptive_name,",
          "customer.currency_code, customer.time_zone,",
          "customer.manager, customer.status",
          "FROM customer",
        ].join(" "),
      );
    } catch (error) {
      warnings.push(
        `Could not load details for Google Ads account ${customerId}: ${
          error instanceof Error ? error.message : "Unknown lookup error."
        }`,
      );
    }

    const customer = customerDetails?.[0]?.customer;

    accountMap.set(
      customerId,
      mapGoogleAccount(customerId, customer ?? {}, "DIRECT_ACCESS"),
    );

    if (customer?.manager !== true) {
      continue;
    }

    managerAccountsExpanded += 1;

    try {
      const hierarchyRows = await searchGoogleAds<
        NonNullable<GoogleAdsSearchResponse["results"]>[number]
      >(
        accessToken,
        developerToken,
        customerId,
        [
          "SELECT customer_client.id, customer_client.client_customer,",
          "customer_client.level, customer_client.manager,",
          "customer_client.descriptive_name, customer_client.currency_code,",
          "customer_client.time_zone, customer_client.status",
          "FROM customer_client",
        ].join(" "),
      );

      for (const row of hierarchyRows) {
        const client = row.customerClient;
        const clientId =
          normalizeGoogleCustomerId(client?.id) ??
          normalizeGoogleCustomerId(client?.clientCustomer);

        if (!clientId) continue;

        accountMap.set(
          clientId,
          mapGoogleAccount(
            clientId,
            {
              descriptiveName: client?.descriptiveName,
              currencyCode: client?.currencyCode,
              timeZone: client?.timeZone,
              manager: client?.manager,
              status: client?.status,
            },
            "MANAGER_HIERARCHY",
          ),
        );

        if (accountMap.size > MAX_GOOGLE_DISCOVERED_ACCOUNTS) {
          throw new Error(
            `Google Ads account discovery exceeded the ${MAX_GOOGLE_DISCOVERED_ACCOUNTS} account safety limit.`,
          );
        }
      }
    } catch (error) {
      warnings.push(
        `Manager account ${customerId} was found, but its client-account hierarchy could not be fully loaded: ${
          error instanceof Error ? error.message : "Unknown hierarchy error."
        }`,
      );
    }
  }

  return {
    accessibleCustomerResourceNames,
    accounts: Array.from(accountMap.values()),
    managerAccountsExpanded,
    warnings,
  };
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

function createMetaAuthorizationUrl(state: string): string {
  const config = getMetaOAuthConfig();

  const url = new URL(
    `https://www.facebook.com/${config.graphApiVersion}/dialog/oauth`
  );

  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("config_id", config.loginConfigId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  return url.toString();
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
  const url = new URL("/dashboard/provider", FRONTEND_URL);

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
      scope: [GOOGLE_ADS_SCOPE, "https://www.googleapis.com/auth/content"],
      include_granted_scopes: true,
      // Force an account chooser for users with multiple Google identities.
      prompt: "select_account consent",
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
router.get("/google/callback", async (req: Request, res: Response) => {
  try {
    const state = req.query[`state`];
    const googleError = req.query[`error`];
    const code = req.query[`code`];

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
      refreshToken,
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
        success: false,
        message: "Unauthorized",
      });
    }

    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

    if (!developerToken) {
      return res.status(500).json({
        success: false,
        message: "Google Ads developer token is not configured.",
      });
    }

    const accessToken = await getProviderAccessToken(userId, "googleAds");
    const discovery = await discoverGoogleAdsAccounts(accessToken, developerToken);

    // The newly authorized Google identity is authoritative. Persist exactly
    // the accounts it can access so accounts from a previous Google identity
    // are not incorrectly displayed under the new connection.
    await saveProviderAccounts(userId, "googleAds", discovery.accounts);

    if (discovery.accounts.length === 0) {
      return res.status(200).json({
        success: true,
        connected: true,
        status: "no_accounts",
        hasAccounts: false,
        accountCount: 0,
        message:
          "Google authorization succeeded, but this Google user has no directly accessible Google Ads accounts. Create a Google Ads account or ask an administrator to grant this email access to an existing Ads account, then refresh account discovery.",
        nextSteps: [
          "Open https://ads.google.com/ while signed in with the same Google email.",
          "Create a Google Ads account and complete its initial setup if this is a new Google login.",
          "If an Ads account already exists, ask its administrator to add this exact Google email under Access and security.",
          "If access is only through a manager account, make sure the manager account itself is directly accessible to this Google login.",
        ],
        accessibleCustomers: {
          resourceNames: discovery.accessibleCustomerResourceNames,
        },
        accounts: [],
        warnings: discovery.warnings,
      });
    }

    return res.status(200).json({
      success: true,
      connected: true,
      status: discovery.warnings.length > 0 ? "partial" : "success",
      hasAccounts: true,
      accountCount: discovery.accounts.length,
      message:
        discovery.warnings.length > 0
          ? "Google Ads accounts were discovered, but some account details or manager clients could not be loaded."
          : "Google Ads account discovery successful.",
      accessibleCustomers: {
        resourceNames: discovery.accessibleCustomerResourceNames,
      },
      managerAccountsExpanded: discovery.managerAccountsExpanded,
      accounts: discovery.accounts,
      warnings: discovery.warnings,
    });
  } catch (error) {
    console.error("Google Ads account discovery error:", error);

    return res.status(500).json({
      success: false,
      connected: true,
      status: "discovery_error",
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
router.get("/meta/callback", async (req: any, res: any) => {
  try {
    const state = req.query[`state`];
    const metaError = req.query[`error`];
    const code = req.query[`code`];

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