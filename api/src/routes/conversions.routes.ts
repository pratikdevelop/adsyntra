import { Router, type Request, type Response } from "express";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { getAuth } from "@clerk/express";
import AdAccountModel from "../models/ad-account.model.js";
import { getGoogleAdsCreationContext } from "../googleadsAPI/services/campaign-creation.js";
import { getMetaAdsCreationContext } from "../metaadsAPI/services/campaign-creation.js";
import type { GoogleAdsCreationContext } from "../../interfaces/campaign-creation.js";
import type { MetaAdsCreationContext } from "../metaadsAPI/services/campaign-creation.js";

const router = Router();

type ProviderKey = "googleAds" | "metaAds";
type JsonRecord = Record<string, any>;

class ConversionRouteError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = "ConversionRouteError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

const RANGE_FILTERS: Record<string, string> = {
  "7d": "LAST_7_DAYS",
  "30d": "LAST_30_DAYS",
  "90d": "LAST_90_DAYS",
};

const META_CUSTOM_EVENT_TYPES = new Set([
  "ADD_PAYMENT_INFO", "ADD_TO_CART", "ADD_TO_WISHLIST", "COMPLETE_REGISTRATION",
  "CONTENT_VIEW", "INITIATED_CHECKOUT", "LEAD", "PURCHASE", "SEARCH", "CONTACT",
  "CUSTOMIZE_PRODUCT", "DONATE", "FIND_LOCATION", "SCHEDULE", "START_TRIAL",
  "SUBMIT_APPLICATION", "SUBSCRIBE", "LISTING_INTERACTION", "FACEBOOK_SELECTED", "OTHER",
]);

// The website conversion flow only exposes supported ConversionActionCategory
// values suitable for WEBPAGE actions (not offline/app-only categories).
const GOOGLE_CONVERSION_CATEGORIES = new Set([
  "ADD_TO_CART", "BEGIN_CHECKOUT", "BOOK_APPOINTMENT", "CONTACT", "DEFAULT",
  "ENGAGEMENT", "GET_DIRECTIONS", "MESSAGE_LEAD", "OUTBOUND_CLICK", "PAGE_VIEW",
  "PURCHASE", "REQUEST_QUOTE", "SIGNUP", "SUBMIT_LEAD_FORM", "SUBSCRIBE_PAID",
]);

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function getUserId(req: Request): string | null {
  const auth = getAuth(req);
  return auth.isAuthenticated && auth.userId ? auth.userId : null;
}

function requireUser(req: Request, res: Response): string | null {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "Authentication required." });
    return null;
  }
  return userId;
}

function queryString(req: Request, key: string): string | undefined {
  const raw = req.query[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function getRange(req: Request): { key: string; filter: string } {
  const key = queryString(req, "range") ?? "30d";
  const filter = RANGE_FILTERS[key];
  if (!filter) throw new ConversionRouteError("range must be one of 7d, 30d or 90d.");
  return { key, filter };
}

async function getSelectedAccount(userId: string, provider: ProviderKey) {
  const account = await AdAccountModel.findOne({
    userId,
    provider,
    isSelected: true,
    status: "active",
  })
    .select("externalAccountId name currency timezone")
    .lean()
    .exec();

  if (!account?.externalAccountId) return null;
  return account;
}

function googleAdsFailureMessages(payload: JsonRecord): string[] {
  const error = asRecord(payload.error);
  const details = Array.isArray(error.details) ? error.details : [];
  const messages: string[] = [];

  for (const detailValue of details) {
    const detail = asRecord(detailValue);
    if (typeof detail["@type"] === "string" && !String(detail["@type"]).includes("GoogleAdsFailure")) {
      continue;
    }
    const errors = Array.isArray(detail.errors) ? detail.errors : [];
    for (const errorValue of errors) {
      const item = asRecord(errorValue);
      const codeRecord = asRecord(item.errorCode);
      const code = Object.entries(codeRecord)
        .find(([, value]) => value !== null && value !== undefined)?.[0];
      const location = asRecord(item.location);
      const pathParts = Array.isArray(location.fieldPathElements)
        ? location.fieldPathElements.map((partValue: unknown) => {
            const part = asRecord(partValue);
            const fieldName = typeof part.fieldName === "string" ? part.fieldName : "";
            const index = Number.isInteger(part.index) ? `[${part.index}]` : "";
            return `${fieldName}${index}`;
          }).filter(Boolean)
        : [];
      const fieldPath = pathParts.join(".");
      const message = typeof item.message === "string" ? item.message : "Google Ads rejected the request.";
      messages.push([code, message, fieldPath ? `Field: ${fieldPath}` : ""].filter(Boolean).join(" — "));
    }
  }

  return [...new Set(messages)];
}

async function googleSearch<T = JsonRecord>(
  context: GoogleAdsCreationContext,
  query: string,
): Promise<T[]> {
  const url = `https://googleads.googleapis.com/${context.apiVersion}/customers/${context.customerId}/googleAds:search`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        "developer-token": context.developerToken,
        "Content-Type": "application/json",
      },
      // Google Ads API v19+ uses a fixed page size. Sending pageSize now
      // returns PAGE_SIZE_NOT_SUPPORTED (HTTP 400 / INVALID_ARGUMENT).
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new ConversionRouteError(
      error instanceof Error ? `Unable to connect to Google Ads: ${error.message}` : "Unable to connect to Google Ads.",
      502,
    );
  }

  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) {
    const specificMessages = googleAdsFailureMessages(payload);
    const message = specificMessages.length
      ? specificMessages.join(" | ")
      : (asRecord(payload.error).message ?? `Google Ads API returned HTTP ${response.status}.`);
    console.error("Google Ads conversion GAQL request failed:", {
      customerId: context.customerId,
      apiVersion: context.apiVersion,
      query,
      requestId: payload.requestId ?? asRecord(payload.error).requestId ?? null,
      error: payload.error ?? payload,
    });
    throw new ConversionRouteError(
      message,
      response.status >= 400 && response.status < 500 ? response.status : 502,
      {
        provider: "googleAds",
        requestId: payload.requestId ?? asRecord(payload.error).requestId ?? null,
        errors: specificMessages,
      },
    );
  }
  return Array.isArray(payload.results) ? payload.results as T[] : [];
}

async function googleMutate(
  context: GoogleAdsCreationContext,
  resource: string,
  body: JsonRecord,
): Promise<JsonRecord> {
  const url = `https://googleads.googleapis.com/${context.apiVersion}/customers/${context.customerId}/${resource}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${context.accessToken}`,
      "developer-token": context.developerToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) {
    throw new ConversionRouteError(
      payload.error?.message ?? `Google Ads mutation failed with HTTP ${response.status}.`,
      response.status >= 400 && response.status < 500 ? response.status : 502,
      payload,
    );
  }
  return payload;
}

function conversionCustomerIdFromSettings(settings: JsonRecord, fallback: string): string {
  const resourceName = settings.googleAdsConversionCustomer ?? settings.google_ads_conversion_customer;
  if (typeof resourceName === "string") {
    const match = resourceName.match(/^customers\/(\d+)$/);
    if (match) return match[1];
  }
  return fallback.replace(/-/g, "");
}

async function getGoogleContextAndSettings(userId: string, accountId: string) {
  const selectedContext = await getGoogleAdsCreationContext(userId, accountId);
  const settingsRows = await googleSearch(selectedContext, `
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.time_zone,
      customer.conversion_tracking_setting.conversion_tracking_status,
      customer.conversion_tracking_setting.conversion_tracking_id,
      customer.conversion_tracking_setting.google_ads_conversion_customer,
      customer.conversion_tracking_setting.cross_account_conversion_tracking_id,
      customer.conversion_tracking_setting.accepted_customer_data_terms,
      customer.conversion_tracking_setting.effective_enablement_setting
    FROM customer
    LIMIT 1
  `.trim());

  const row = asRecord(settingsRows[0]);
  const customer = asRecord(row.customer);
  const tracking = asRecord(customer.conversionTrackingSetting);
  const effectiveCustomerId = conversionCustomerIdFromSettings(tracking, selectedContext.customerId);
  const conversionContext = effectiveCustomerId === selectedContext.customerId
    ? selectedContext
    : await getGoogleAdsCreationContext(userId, effectiveCustomerId);

  return {
    context: conversionContext,
    customer: {
      id: String(customer.id ?? selectedContext.customerId),
      name: customer.descriptiveName ?? null,
      currencyCode: customer.currencyCode ?? null,
      timeZone: customer.timeZone ?? null,
    },
    tracking: {
      status: tracking.conversionTrackingStatus ?? null,
      conversionTrackingId: tracking.conversionTrackingId ?? null,
      conversionCustomer: tracking.googleAdsConversionCustomer ?? null,
      crossAccountConversionTrackingId: tracking.crossAccountConversionTrackingId ?? null,
      acceptedCustomerDataTerms: tracking.acceptedCustomerDataTerms ?? null,
      effectiveEnablementSetting: tracking.effectiveEnablementSetting ?? null,
    },
    conversionCustomerId: effectiveCustomerId,
  };
}

async function getGoogleConversionData(userId: string, accountId: string, rangeFilter: string) {
  const state = await getGoogleContextAndSettings(userId, accountId);
  const actionRows = await googleSearch(state.context, `
    SELECT
      conversion_action.id,
      conversion_action.resource_name,
      conversion_action.name,
      conversion_action.type,
      conversion_action.category,
      conversion_action.status,
      conversion_action.primary_for_goal,
      conversion_action.counting_type,
      conversion_action.click_through_lookback_window_days,
      conversion_action.view_through_lookback_window_days,
      conversion_action.value_settings.default_value,
      conversion_action.value_settings.default_currency_code,
      conversion_action.value_settings.always_use_default_value,
      conversion_action.attribution_model_settings.attribution_model,
      conversion_action.tag_snippets
    FROM conversion_action
    WHERE conversion_action.status != 'REMOVED'
    ORDER BY conversion_action.name
    LIMIT 200
  `.trim());

  // ConversionAction is a resource without the primary `metrics.conversions`
  // fields. Its GAQL compatibility only allows all-conversions metrics.
  // Query Campaign segmented by conversion_action instead, then aggregate
  // each action across campaigns for the selected reporting period.
  let metricRows: JsonRecord[] = [];
  let metricsError: string | null = null;
  try {
    metricRows = await googleSearch(state.context, `
      SELECT
        campaign.id,
        segments.conversion_action,
        metrics.conversions,
        metrics.conversions_value,
        metrics.all_conversions,
        metrics.all_conversions_value
      FROM campaign
      WHERE segments.date DURING ${rangeFilter}
      ORDER BY metrics.conversions DESC
      LIMIT 10000
    `.trim());
  } catch (error) {
    // Keep the conversion-action inventory visible even when a reporting
    // query is temporarily unavailable or rejected for field compatibility.
    metricsError = error instanceof Error ? error.message : "Google conversion metrics could not be loaded.";
    console.warn("Google conversion metrics query failed:", metricsError);
  }

  const metricMap = new Map<string, JsonRecord>();
  for (const rowValue of metricRows) {
    const row = asRecord(rowValue);
    const segments = asRecord(row.segments);
    const actionResourceName = String(segments.conversionAction ?? "");
    const match = actionResourceName.match(/\/conversionActions\/(\d+)$/);
    if (!match) continue;

    const id = match[1];
    const rowMetrics = asRecord(row.metrics);
    const totalsForAction = metricMap.get(id) ?? {
      conversions: 0,
      conversionsValue: 0,
      allConversions: 0,
      allConversionsValue: 0,
    };

    // A campaign query returns one row per campaign/conversion-action pair.
    // Sum those rows to produce account-wide totals for this conversion action.
    totalsForAction.conversions += Number(rowMetrics.conversions ?? 0) || 0;
    totalsForAction.conversionsValue += Number(rowMetrics.conversionsValue ?? 0) || 0;
    totalsForAction.allConversions += Number(rowMetrics.allConversions ?? 0) || 0;
    totalsForAction.allConversionsValue += Number(rowMetrics.allConversionsValue ?? 0) || 0;
    metricMap.set(id, totalsForAction);
  }

  const actions = actionRows.map((rowValue) => {
    const row = asRecord(rowValue);
    const action = asRecord(row.conversionAction);
    const id = String(action.id ?? "");
    const metrics = metricMap.get(id) ?? {};
    return {
      id,
      resourceName: action.resourceName ?? null,
      name: action.name ?? "Unnamed conversion action",
      type: action.type ?? null,
      category: action.category ?? null,
      status: action.status ?? null,
      primaryForGoal: action.primaryForGoal ?? null,
      countingType: action.countingType ?? null,
      clickThroughLookbackWindowDays: action.clickThroughLookbackWindowDays ?? null,
      viewThroughLookbackWindowDays: action.viewThroughLookbackWindowDays ?? null,
      valueSettings: action.valueSettings ?? null,
      attributionModel: asRecord(action.attributionModelSettings).attributionModel ?? null,
      tagSnippets: Array.isArray(action.tagSnippets) ? action.tagSnippets : [],
      metrics: {
        conversions: Number(metrics.conversions ?? 0) || 0,
        conversionsValue: Number(metrics.conversionsValue ?? 0) || 0,
        allConversions: Number(metrics.allConversions ?? 0) || 0,
        allConversionsValue: Number(metrics.allConversionsValue ?? 0) || 0,
      },
    };
  });

  const totals = actions.reduce((sum, action) => {
    sum.conversions += Number(action.metrics.conversions ?? 0) || 0;
    sum.conversionsValue += Number(action.metrics.conversionsValue ?? 0) || 0;
    sum.allConversions += Number(action.metrics.allConversions ?? 0) || 0;
    sum.allConversionsValue += Number(action.metrics.allConversionsValue ?? 0) || 0;
    return sum;
  }, { conversions: 0, conversionsValue: 0, allConversions: 0, allConversionsValue: 0 });

  return {
    accountId,
    conversionCustomerId: state.conversionCustomerId,
    customer: state.customer,
    tracking: state.tracking,
    actions,
    totals,
    metricsError,
    rangeFilter,
  };
}

async function metaGet<T = JsonRecord>(
  context: MetaAdsCreationContext,
  path: string,
  params: URLSearchParams,
): Promise<JsonRecord & { data?: T[]; paging?: JsonRecord; id?: string }> {
  const url = new URL(`https://graph.facebook.com/${context.apiVersion}/${path.replace(/^\/+/, "")}`);
  params.forEach((value, key) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${context.accessToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok || payload.error) {
    throw new ConversionRouteError(
      asRecord(payload.error).message ?? `Meta Graph API returned HTTP ${response.status}.`,
      response.status >= 400 && response.status < 500 ? response.status : 502,
      payload,
    );
  }
  return payload as JsonRecord & { data?: T[]; paging?: JsonRecord; id?: string };
}

async function metaMutate(
  context: MetaAdsCreationContext,
  path: string,
  method: "POST" | "DELETE",
  params?: URLSearchParams,
): Promise<JsonRecord> {
  const url = new URL(`https://graph.facebook.com/${context.apiVersion}/${path.replace(/^\/+/, "")}`);
  let response: Response;
  if (method === "DELETE") {
    params?.forEach((value, key) => url.searchParams.set(key, value));
    response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${context.accessToken}` },
      signal: AbortSignal.timeout(30_000),
    });
  } else {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
      signal: AbortSignal.timeout(30_000),
    });
  }
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok || payload.error) {
    throw new ConversionRouteError(
      asRecord(payload.error).message ?? `Meta Graph API mutation failed with HTTP ${response.status}.`,
      response.status >= 400 && response.status < 500 ? response.status : 502,
      payload,
    );
  }
  return payload;
}


async function getMetaConversionDataWithContext(context: MetaAdsCreationContext, accountId: string) {
  // Meta's ad-account Pixel/Dataset edge exposes event-source metadata such as
  // last_fired_time. Do not call an undocumented Pixel /stats edge or infer
  // separate browser/server event totals from a timestamp.
  const pixelParams = new URLSearchParams({
    fields: "id,name,last_fired_time,creation_time",
    limit: "25",
  });
  const customConversionParams = new URLSearchParams({
    fields: "id,name,description,account_id,custom_event_type,event_source_id,event_source_type,rule,creation_time,first_fired_time,last_fired_time,is_archived,is_unavailable,default_conversion_value,pixel{id,name}",
    limit: "100",
  });

  const [pixelSettled, customSettled] = await Promise.allSettled([
    metaGet(context, `${context.adAccountId}/adspixels`, pixelParams),
    metaGet(context, `${context.adAccountId}/customconversions`, customConversionParams),
  ]);

  const pixelResult = pixelSettled.status === "fulfilled" ? pixelSettled.value : null;
  const customResult = customSettled.status === "fulfilled" ? customSettled.value : null;
  const pixelError = pixelSettled.status === "rejected"
    ? (pixelSettled.reason instanceof Error ? pixelSettled.reason.message : "Meta Pixels/Datasets could not be loaded.")
    : null;
  const customConversionsError = customSettled.status === "rejected"
    ? (customSettled.reason instanceof Error ? customSettled.reason.message : "Meta custom conversions could not be loaded.")
    : null;

  if (!pixelResult && !customResult) {
    throw new ConversionRouteError(
      pixelError ?? customConversionsError ?? "Meta conversion tracking data could not be loaded.",
      502,
    );
  }

  return {
    accountId,
    pixels: Array.isArray(pixelResult?.data) ? pixelResult.data : [],
    customConversions: Array.isArray(customResult?.data) ? customResult.data : [],
    pixelError,
    customConversionsError,
    pagination: {
      pixelsHasMore: Boolean(asRecord(pixelResult?.paging).next),
      customConversionsHasMore: Boolean(asRecord(customResult?.paging).next),
    },
    capi: {
      status: "not_configured_in_adsyntra",
      message: "Conversions API event ingestion is not configured in AdSyntra yet. The page does not collect or expose customer CAPI credentials and does not send browser or server events.",
    },
  };
}

function readBodyString(body: JsonRecord, key: string, maxLength = 255): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new ConversionRouteError(`${key} is required and must be at most ${maxLength} characters.`);
  }
  return value.trim();
}

function requireNumericId(value: string, label: string): string {
  if (!/^\d+$/.test(value)) throw new ConversionRouteError(`A valid numeric ${label} is required.`);
  return value;
}

function sendError(res: Response, error: unknown) {
  const candidate = error as { statusCode?: unknown; message?: unknown; details?: unknown };
  const statusCode = typeof candidate.statusCode === "number" && candidate.statusCode >= 400 && candidate.statusCode <= 599
    ? candidate.statusCode
    : 500;
  if (statusCode >= 500) console.error("Conversion tracking route error:", error);
  return res.status(statusCode).json({
    success: false,
    message: typeof candidate.message === "string" ? candidate.message : "Conversion tracking request failed.",
    ...(statusCode < 500 && candidate.details ? { details: candidate.details } : {}),
  });
}

/* -------------------------------------------------------------------------- */
/* Public website inspection (safe, read-only Pixel installation check)      */
/* -------------------------------------------------------------------------- */

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;

  // Exclude private, loopback, link-local, shared, documentation, benchmark,
  // multicast and reserved address blocks.
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (!normalized) return false;

  let value = normalized;
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const ipv4 = value.slice(lastColon + 1).split(".").map(Number);
    if (ipv4.length !== 4 || ipv4.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    value = `${value.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return false;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return false;
  const words = [...left, ...Array(missing).fill("0"), ...right].map((part) => Number.parseInt(part || "0", 16));
  if (words.length !== 8 || words.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) return false;

  // Accept only globally routable unicast space (2000::/3), excluding
  // documentation, benchmarking, transition and special-purpose ranges.
  const first = words[0];
  if (first < 0x2000 || first > 0x3fff) return false;
  if (first === 0x2002) return false; // 6to4 transition space
  if (first === 0x2001 && [0x0000, 0x0001, 0x0002, 0x0010, 0x0020, 0x0db8].includes(words[1])) return false;
  return true;
}

function isPublicAddress(address: string, family: number): boolean {
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

async function resolvePublicWebsiteAddress(url: URL): Promise<{ address: string; family: number }> {
  if (!/^https?:$/.test(url.protocol)) {
    throw new ConversionRouteError("Website URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new ConversionRouteError("Website URL must not contain a username or password.");
  }
  if (url.port && !((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80"))) {
    throw new ConversionRouteError("Website verification only supports the standard HTTP and HTTPS ports.");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || isIP(hostname) || !hostname.includes(".") || /\.(localhost|local|internal|test|invalid|example)$/.test(hostname)) {
    throw new ConversionRouteError("Enter a public website hostname, such as https://www.example.com.");
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new ConversionRouteError("The website hostname could not be resolved. Check the URL and try again.", 422);
  }
  const publicAddress = addresses.find((item) => isPublicAddress(item.address, item.family));
  if (!publicAddress) {
    throw new ConversionRouteError("The website does not resolve to a publicly reachable IP address.", 422);
  }
  return { address: publicAddress.address, family: publicAddress.family };
}

function requestWebsiteHtml(url: URL, address: string, family: number): Promise<{
  statusCode: number;
  contentType: string;
  location: string | null;
  html: string;
}> {
  return new Promise((resolve, reject) => {
    const pinnedLookup = ((
      _hostname: string,
      _options: unknown,
      callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void,
    ) => callback(null, address, family)) as never;

    const options = {
      hostname: url.hostname,
      port: url.port ? Number(url.port) : undefined,
      path: `${url.pathname || "/"}${url.search}`,
      method: "GET",
      headers: {
        "user-agent": "AdSyntra-Website-Verification/1.0",
        accept: "text/html,application/xhtml+xml",
        "accept-encoding": "identity",
      },
      timeout: 12_000,
      lookup: pinnedLookup,
    };

    const onResponse = (response: import("node:http").IncomingMessage) => {
      const statusCode = response.statusCode ?? 0;
      const location = typeof response.headers.location === "string" ? response.headers.location : null;
      const contentType = String(response.headers["content-type"] ?? "");
      const chunks: Buffer[] = [];
      let bytes = 0;

      if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
        response.resume();
        response.on("end", () => resolve({ statusCode, contentType, location, html: "" }));
        response.on("error", reject);
        return;
      }

      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > 1_000_000) {
          response.destroy(new Error("The website HTML is larger than the 1 MB verification limit."));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => resolve({
        statusCode,
        contentType,
        location: null,
        html: Buffer.concat(chunks).toString("utf8"),
      }));
      response.on("error", reject);
      response.on("aborted", () => reject(new Error("The website closed the response before HTML was received.")));
    };

    const request = url.protocol === "https:"
      ? httpsRequest({ ...options, servername: url.hostname }, onResponse)
      : httpRequest(options, onResponse);

    request.setTimeout(12_000, () => request.destroy(new Error("The website did not respond within 12 seconds.")));
    request.on("error", reject);
    request.end();
  });
}

async function fetchPublicWebsiteHtml(rawUrl: string): Promise<{ requestedUrl: string; finalUrl: string; html: string }> {
  let currentUrl: URL;
  try {
    currentUrl = new URL(rawUrl);
  } catch {
    throw new ConversionRouteError("Enter a valid website URL, including https://.");
  }

  const requestedUrl = currentUrl.toString();
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const resolvedAddress = await resolvePublicWebsiteAddress(currentUrl);
    let response: Awaited<ReturnType<typeof requestWebsiteHtml>>;
    try {
      response = await requestWebsiteHtml(currentUrl, resolvedAddress.address, resolvedAddress.family);
    } catch (error) {
      throw new ConversionRouteError(
        error instanceof Error ? error.message : "The website could not be inspected.",
        422,
      );
    }

    if (response.location) {
      if (redirectCount === 3) throw new ConversionRouteError("The website redirected too many times.", 422);
      try {
        currentUrl = new URL(response.location, currentUrl);
      } catch {
        throw new ConversionRouteError("The website returned an invalid redirect.", 422);
      }
      continue;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new ConversionRouteError(`The website returned HTTP ${response.statusCode}. Check that it is public and reachable.`, 422);
    }
    if (response.contentType && !/text\/html|application\/xhtml\+xml/i.test(response.contentType)) {
      throw new ConversionRouteError("The supplied URL did not return an HTML page.", 422);
    }
    return { requestedUrl, finalUrl: currentUrl.toString(), html: response.html };
  }

  throw new ConversionRouteError("The website could not be inspected.", 422);
}

// Unified read endpoint. Each provider is isolated so one provider failure does not hide the other.
router.get("/", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const { key: range, filter } = getRange(req);
    const [googleAccount, metaAccount] = await Promise.all([
      getSelectedAccount(userId, "googleAds"),
      getSelectedAccount(userId, "metaAds"),
    ]);

    const [googleSettled, metaSettled] = await Promise.allSettled([
      googleAccount ? getGoogleConversionData(userId, googleAccount.externalAccountId, filter) : Promise.resolve(null),
      metaAccount
        ? getMetaAdsCreationContext(userId, metaAccount.externalAccountId)
            .then((context) => getMetaConversionDataWithContext(context, metaAccount.externalAccountId))
        : Promise.resolve(null),
    ]);

    const googleData = googleSettled.status === "fulfilled" ? googleSettled.value : null;
    const metaData = metaSettled.status === "fulfilled" ? metaSettled.value : null;
    const googleError = googleSettled.status === "rejected"
      ? (googleSettled.reason instanceof Error ? googleSettled.reason.message : "Google Ads conversion data could not be loaded.")
      : null;
    const metaError = metaSettled.status === "rejected"
      ? (metaSettled.reason instanceof Error ? metaSettled.reason.message : "Meta tracking data could not be loaded.")
      : null;

    return res.status(200).json({
      success: true,
      range,
      providers: {
        googleAds: {
          connected: Boolean(googleAccount),
          accountId: googleAccount?.externalAccountId ?? null,
          accountName: googleAccount?.name ?? null,
          success: Boolean(googleData),
          data: googleData,
          error: googleError,
        },
        metaAds: {
          connected: Boolean(metaAccount),
          accountId: metaAccount?.externalAccountId ?? null,
          accountName: metaAccount?.name ?? null,
          success: Boolean(metaData),
          data: metaData,
          error: metaError,
        },
      },
      summary: {
        providersSucceeded: Number(Boolean(googleData)) + Number(Boolean(metaData)),
        providersFailed: Number(Boolean(googleError)) + Number(Boolean(metaError)),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// Verify that a selected Meta Pixel ID is referenced by a public website's
// initial HTML. This is a code-presence check, not an event-delivery guarantee.
router.post("/meta/pixels/:pixelId/verify-website", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const account = await getSelectedAccount(userId, "metaAds");
    if (!account) throw new ConversionRouteError("Select a Meta Ads account first.", 404);

    const pixelId = String(req.params.pixelId ?? "").trim();
    if (!/^\d+$/.test(pixelId)) throw new ConversionRouteError("A valid numeric Pixel/Dataset ID is required.");

    const websiteUrl = String(req.body?.websiteUrl ?? "").trim();
    if (!websiteUrl || websiteUrl.length > 2048) {
      throw new ConversionRouteError("Enter a website URL (maximum 2,048 characters).");
    }

    const context = await getMetaAdsCreationContext(userId, account.externalAccountId);
    const pixelResult = await metaGet(context, `${context.adAccountId}/adspixels`, new URLSearchParams({
      fields: "id,name,last_fired_time",
      limit: "100",
    }));
    const pixel = (pixelResult.data ?? []).find((item) => String(asRecord(item).id ?? "") === pixelId);
    if (!pixel) {
      throw new ConversionRouteError("This Pixel/Dataset is not attached to the currently selected Meta ad account.", 403);
    }

    const website = await fetchPublicWebsiteHtml(websiteUrl);
    const html = website.html;
    const initPattern = new RegExp(`fbq\\s*\\(\\s*['\"]init['\"]\\s*,\\s*['\"]?${pixelId}['\"]?\\s*\\)`, "i");
    const noscriptPattern = new RegExp(`facebook\\.com/tr/?\\?(?:[^\\"\'<>]*&)?id=${pixelId}(?:&|[\\"\'<>]|$)`, "i");
    const pixelInitDetected = initPattern.test(html);
    const noscriptPixelDetected = noscriptPattern.test(html);
    const libraryDetected = /connect\.facebook\.net\/[^"'<>]*fbevents\.js/i.test(html)
      || /fbevents\.js/i.test(html);
    const codeDetected = pixelInitDetected || noscriptPixelDetected;
    const status = codeDetected ? "detected" : libraryDetected ? "library_only" : "not_detected";
    const message = status === "detected"
      ? "The selected Pixel ID was found in the website's initial HTML. This confirms a code reference, not that Meta accepted a browser event."
      : status === "library_only"
        ? "The Meta Pixel library is referenced, but the selected Pixel ID was not found in the initial HTML."
        : "The selected Pixel ID was not found in the website's initial HTML. It may be loaded by a tag manager, after consent, or by client-side code.";

    return res.status(200).json({
      success: true,
      verification: {
        pixelId,
        pixelName: asRecord(pixel).name ?? null,
        requestedUrl: website.requestedUrl,
        finalUrl: website.finalUrl,
        checkedAt: new Date().toISOString(),
        status,
        message,
        checks: {
          pixelInitDetected,
          pixelLibraryDetected: libraryDetected,
          noscriptPixelDetected,
        },
        metaLastFiredTime: asRecord(pixel).last_fired_time ?? null,
        limitations: [
          "This scan reads the initial HTML response only; it does not execute JavaScript or consent-management rules.",
          "Pixels injected by a tag manager, CMS plugin, or client-side app after page load may not appear in the initial HTML.",
          "This checks Pixel code presence, not domain ownership or whether a browser event was delivered and accepted by Meta.",
          "Meta's last-fired timestamp is event-source activity metadata and is not a per-event confirmation of this scan.",
        ],
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// Create a Google website conversion action. Tag snippets are returned on the next GET refresh.
router.post("/google/actions", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const account = await getSelectedAccount(userId, "googleAds");
    if (!account) throw new ConversionRouteError("Select a Google Ads account first.", 404);
    const name = readBodyString(asRecord(req.body), "name", 128);
    const category = String(req.body?.category ?? "PURCHASE").toUpperCase();
    if (!GOOGLE_CONVERSION_CATEGORIES.has(category)) throw new ConversionRouteError("Unsupported Google conversion category.");
    const countingType = String(req.body?.countingType ?? "MANY_PER_CLICK").toUpperCase();
    if (!["ONE_PER_CLICK", "MANY_PER_CLICK"].includes(countingType)) throw new ConversionRouteError("countingType must be ONE_PER_CLICK or MANY_PER_CLICK.");

    const state = await getGoogleContextAndSettings(userId, account.externalAccountId);
    const defaultValue = req.body?.defaultValue === undefined ? 0 : Number(req.body.defaultValue);
    if (!Number.isFinite(defaultValue) || defaultValue < 0) {
      throw new ConversionRouteError("defaultValue must be a non-negative number.");
    }
    const currency = typeof state.customer.currencyCode === "string" ? state.customer.currencyCode : undefined;
    const body: JsonRecord = {
      operations: [{
        create: {
          name,
          type: "WEBPAGE",
          category,
          status: "ENABLED",
          primaryForGoal: req.body?.primaryForGoal !== false,
          countingType,
          clickThroughLookbackWindowDays: 30,
          valueSettings: {
            defaultValue,
            ...(currency ? { defaultCurrencyCode: currency } : {}),
            alwaysUseDefaultValue: true,
          },
        },
      }],
    };
    const result = await googleMutate(state.context, "conversionActions:mutate", body);
    const resourceName = result.results?.[0]?.resourceName ?? null;
    return res.status(201).json({ success: true, message: "Google conversion action created.", resourceName });
  } catch (error) {
    return sendError(res, error);
  }
});

// Enable or pause a Google conversion action. Google removal is intentionally not offered here.
router.patch("/google/actions/:actionId/status", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const account = await getSelectedAccount(userId, "googleAds");
    if (!account) throw new ConversionRouteError("Select a Google Ads account first.", 404);
    const actionId = requireNumericId(String(req.params.actionId), "conversion action ID");
    const status = String(req.body?.status ?? "").toUpperCase();
    // ConversionActionStatus supports ENABLED, HIDDEN and REMOVED. HIDDEN is
    // the reversible non-accruing state; PAUSED is not a valid enum here.
    if (!["ENABLED", "HIDDEN"].includes(status)) throw new ConversionRouteError("status must be ENABLED or HIDDEN.");
    const state = await getGoogleContextAndSettings(userId, account.externalAccountId);
    const resourceName = `customers/${state.conversionCustomerId}/conversionActions/${actionId}`;
    const result = await googleMutate(state.context, "conversionActions:mutate", {
      operations: [{ update: { resourceName, status }, updateMask: "status" }],
    });
    return res.status(200).json({ success: true, result });
  } catch (error) {
    return sendError(res, error);
  }
});

// Create a Meta Custom Conversion tied to one Pixel/Dataset from the selected ad account.
router.post("/meta/custom-conversions", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const account = await getSelectedAccount(userId, "metaAds");
    if (!account) throw new ConversionRouteError("Select a Meta Ads account first.", 404);
    const context = await getMetaAdsCreationContext(userId, account.externalAccountId);
    const existingConversions = await metaGet(context, `${context.adAccountId}/customconversions`, new URLSearchParams({ fields: "id", limit: "100" }));
    if ((existingConversions.data ?? []).length >= 100) {
      throw new ConversionRouteError("This Meta ad account has reached the 100 custom-conversion limit.", 409);
    }
    const name = readBodyString(asRecord(req.body), "name", 100);
    const pixelId = requireNumericId(String(req.body?.pixelId ?? ""), "Pixel/Dataset ID");
    // Do not trust a Pixel ID sent by the browser. Confirm it is attached to
    // the authenticated user's currently selected ad account first.
    const accountPixels = await metaGet(context, `${context.adAccountId}/adspixels`, new URLSearchParams({ fields: "id", limit: "100" }));
    const ownsPixel = (accountPixels.data ?? []).some((pixel) => String(asRecord(pixel).id ?? "") === pixelId);
    if (!ownsPixel) throw new ConversionRouteError("The selected Pixel/Dataset is not attached to this Meta ad account.", 403);
    const eventType = String(req.body?.eventType ?? "PURCHASE").toUpperCase();
    if (!META_CUSTOM_EVENT_TYPES.has(eventType)) throw new ConversionRouteError("Unsupported Meta custom conversion event type.");
    const rule = asRecord(req.body?.rule);
    if (!Object.keys(rule).length) throw new ConversionRouteError("A non-empty custom conversion rule is required.");
    const params = new URLSearchParams({
      name,
      event_source_id: pixelId,
      custom_event_type: eventType,
      rule: JSON.stringify(rule),
      action_source_type: "website",
    });
    if (typeof req.body?.description === "string" && req.body.description.trim()) params.set("description", req.body.description.trim().slice(0, 500));
    if (req.body?.defaultConversionValue !== undefined) {
      const defaultValue = Number(req.body.defaultConversionValue);
      if (!Number.isFinite(defaultValue) || defaultValue < 0) throw new ConversionRouteError("defaultConversionValue must be a non-negative number.");
      params.set("default_conversion_value", String(defaultValue));
    }
    const result = await metaMutate(context, `${context.adAccountId}/customconversions`, "POST", params);
    return res.status(201).json({ success: true, customConversion: result });
  } catch (error) {
    return sendError(res, error);
  }
});

async function assertMetaCustomConversionOwnership(context: MetaAdsCreationContext, conversionId: string) {
  const conversion = await metaGet(context, conversionId, new URLSearchParams({ fields: "id,account_id" }));
  const accountId = String(conversion.account_id ?? "").replace(/^act_/, "");
  const selectedId = context.adAccountId.replace(/^act_/, "");
  if (!accountId || accountId !== selectedId) throw new ConversionRouteError("This custom conversion does not belong to the selected Meta ad account.", 403);
}

router.patch("/meta/custom-conversions/:conversionId", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const account = await getSelectedAccount(userId, "metaAds");
    if (!account) throw new ConversionRouteError("Select a Meta Ads account first.", 404);
    const context = await getMetaAdsCreationContext(userId, account.externalAccountId);
    const conversionId = requireNumericId(String(req.params.conversionId), "custom conversion ID");
    await assertMetaCustomConversionOwnership(context, conversionId);
    const params = new URLSearchParams();
    if (typeof req.body?.name === "string" && req.body.name.trim()) params.set("name", req.body.name.trim().slice(0, 100));
    if (typeof req.body?.description === "string") params.set("description", req.body.description.trim().slice(0, 500));
    if (req.body?.defaultConversionValue !== undefined) {
      const defaultValue = Number(req.body.defaultConversionValue);
      if (!Number.isFinite(defaultValue) || defaultValue < 0) throw new ConversionRouteError("defaultConversionValue must be a non-negative number.");
      params.set("default_conversion_value", String(defaultValue));
    }
    if ([...params.keys()].length === 0) throw new ConversionRouteError("Provide name, description or defaultConversionValue to update.");
    const result = await metaMutate(context, conversionId, "POST", params);
    return res.status(200).json({ success: true, result });
  } catch (error) {
    return sendError(res, error);
  }
});

router.delete("/meta/custom-conversions/:conversionId", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const account = await getSelectedAccount(userId, "metaAds");
    if (!account) throw new ConversionRouteError("Select a Meta Ads account first.", 404);
    const context = await getMetaAdsCreationContext(userId, account.externalAccountId);
    const conversionId = requireNumericId(String(req.params.conversionId), "custom conversion ID");
    await assertMetaCustomConversionOwnership(context, conversionId);
    const result = await metaMutate(context, conversionId, "DELETE");
    return res.status(200).json({ success: true, result });
  } catch (error) {
    return sendError(res, error);
  }
});

export default router;
