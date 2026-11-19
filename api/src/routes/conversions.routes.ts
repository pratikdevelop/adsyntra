import { Router, type Request, type Response as ExpressResponse } from "express";
import { getAuth } from "@clerk/express";
import AdAccountModel from "../models/ad-account.model.js";
import { getGoogleAdsCreationContext } from "../googleadsAPI/services/campaign-creation.js";
import { getMetaAdsCreationContext } from "../metaadsAPI/services/campaign-creation.js";
import type { GoogleAdsCreationContext } from "../interfaces/campaign-creation.js";
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
    "CONVERTED_LEAD", "QUALIFIED_LEAD",
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

function requireUser(req: Request, res: ExpressResponse): string | null {
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

function getRange(req: Request): {
    key: string;
    filter: string;
} {
    const key = queryString(req, "range") ?? "30d";
    const filter = RANGE_FILTERS[key];
    if (!filter)
        throw new ConversionRouteError("range must be one of 7d, 30d or 90d.");
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
    if (!account?.externalAccountId)
        return null;
    return account;
}

function getGoogleAdsApiVersion(context: GoogleAdsCreationContext): string {
    const version = context.apiVersion?.trim();
    if (!version || !/^v\d+$/.test(version)) {
        throw new ConversionRouteError("Google Ads creation context has an invalid API version.", 500);
    }
    return version;
}

function normalizeCustomerResourceName(customerId: string): string {
    const value = customerId.trim();
    const digitsOnly = value.replace(/^customers\//i, "").replace(/-/g, "");
    if (!/^\d{10}$/.test(digitsOnly)) {
        throw new ConversionRouteError("Invalid Google Ads customer ID. Expected a 10-digit customer ID.");
    }
    return `customers/${digitsOnly}`;
}

function normalizeCustomerDigits(customerId: string): string {
    return normalizeCustomerResourceName(customerId).replace(/^customers\//, "");
}

function getGoogleHeaders(context: GoogleAdsCreationContext): Record<string, string> {
    if (!context.accessToken) {
        throw new ConversionRouteError("Google OAuth access token is missing from the Google Ads creation context.", 500);
    }
    if (!context.developerToken) {
        throw new ConversionRouteError("Google Ads developer token is missing from the Google Ads creation context.", 500);
    }

    const headers: Record<string, string> = {
        Authorization: `Bearer ${context.accessToken}`,
        "Content-Type": "application/json",
        "developer-token": context.developerToken,
    };
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim();
    if (loginCustomerId) {
        headers["login-customer-id"] = loginCustomerId.replace(/-/g, "");
    }
    return headers;
}

function extractGoogleErrorMessage(payload: JsonRecord, fallbackStatus: number): string {
    const error = asRecord(payload.error);
    const details = Array.isArray(error.details) ? error.details : [];
    const specificErrors = details.flatMap((detail: JsonRecord) => {
        const entries = Array.isArray(detail.errors) ? detail.errors : [];
        return entries
            .map((entry: JsonRecord) => entry.message)
            .filter((message: unknown): message is string => typeof message === "string" && Boolean(message));
    });
    if (specificErrors.length > 0)
        return specificErrors.join(" | ");
    return typeof error.message === "string"
        ? error.message
        : `Google Ads API returned HTTP ${fallbackStatus}.`;
}

async function googleSearch<T = JsonRecord>(context: GoogleAdsCreationContext, query: string): Promise<T[]> {
    const apiVersion = getGoogleAdsApiVersion(context);
    const customerResourceName = normalizeCustomerResourceName(context.customerId!);
    const url = `https://googleads.googleapis.com/${apiVersion}/${customerResourceName}/googleAds:search`;
    let response: Response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: getGoogleHeaders(context),
            body: JSON.stringify({ query }),
            signal: AbortSignal.timeout(30000),
        });
    }
    catch (error) {
        const cause = error instanceof Error && "cause" in error
            ? String((error as Error & {
                cause?: unknown;
            }).cause ?? "")
            : "";
        throw new ConversionRouteError(`Unable to connect to Google Ads: ${error instanceof Error ? error.message : "Unknown network error"}${cause ? ` (${cause})` : ""}`, 502);
    }
    const payload = await response.json().catch(() => ({})) as JsonRecord;
    if (!response.ok) {
        throw new ConversionRouteError(extractGoogleErrorMessage(payload, response.status), response.status >= 400 && response.status < 500 ? response.status : 502, payload);
    }
    return Array.isArray(payload.results) ? payload.results as T[] : [];
}

async function googleMutate(context: GoogleAdsCreationContext, resource: string, body: JsonRecord): Promise<JsonRecord> {
    const apiVersion = getGoogleAdsApiVersion(context);
    const customerResourceName = normalizeCustomerResourceName(context.customerId!);
    const url = `https://googleads.googleapis.com/${apiVersion}/${customerResourceName}/${resource}`;
    let response: Response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: getGoogleHeaders(context),
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30000),
        });
    }
    catch (error) {
        throw new ConversionRouteError(`Unable to connect to Google Ads: ${error instanceof Error ? error.message : "Unknown network error"}`, 502);
    }
    const payload = await response.json().catch(() => ({})) as JsonRecord;
    if (!response.ok) {
        throw new ConversionRouteError(extractGoogleErrorMessage(payload, response.status), response.status >= 400 && response.status < 500 ? response.status : 502, payload);
    }
    return payload;
}

function conversionCustomerIdFromSettings(settings: JsonRecord, fallback: string): string {
    const resourceName = settings.googleAdsConversionCustomer ?? settings.google_ads_conversion_customer;
    if (typeof resourceName === "string") {
        const match = resourceName.match(/^customers\/(\d+)$/);
        if (match)
            return match[1];
    }
    return normalizeCustomerDigits(fallback);
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
    const effectiveCustomerId = conversionCustomerIdFromSettings(tracking, selectedContext.customerId!);
    const selectedCustomerId = normalizeCustomerDigits(selectedContext.customerId!);
    const conversionContext = effectiveCustomerId === selectedCustomerId
        ? selectedContext
        : await getGoogleAdsCreationContext(userId, effectiveCustomerId);
    // Conversion actions and their default currency belong to the conversion
    // customer, which can be a manager account when cross-account tracking is on.
    let conversionCustomerCurrencyCode = customer.currencyCode ?? null;
    if (effectiveCustomerId !== selectedCustomerId) {
        const conversionCustomerRows = await googleSearch(conversionContext, `
            SELECT customer.currency_code
            FROM customer
            LIMIT 1
        `.trim());
        const conversionCustomer = asRecord(asRecord(conversionCustomerRows[0]).customer);
        conversionCustomerCurrencyCode = conversionCustomer.currencyCode ?? null;
    }
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
        conversionCustomerCurrencyCode,
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

  conversion_action.origin,

  conversion_action.owner_customer,

  conversion_action.status,

  conversion_action.primary_for_goal,

  conversion_action.counting_type,

  conversion_action.click_through_lookback_window_days,

  conversion_action.view_through_lookback_window_days,

  conversion_action.value_settings.default_value,

  conversion_action.value_settings.default_currency_code,

  conversion_action.value_settings.always_use_default_value,

  conversion_action.attribution_model_settings.attribution_model,

  conversion_action.attribution_model_settings.data_driven_model_status,

  conversion_action.google_analytics_4_settings.property_id,

  conversion_action.google_analytics_4_settings.property_name,

  conversion_action.google_analytics_4_settings.event_name,

  conversion_action.firebase_settings.project_id,

  conversion_action.firebase_settings.property_id,

  conversion_action.firebase_settings.property_name,

  conversion_action.firebase_settings.event_name,

  conversion_action.phone_call_duration_seconds,

  conversion_action.app_id,

  conversion_action.mobile_app_vendor,

  conversion_action.tag_snippets

FROM conversion_action

WHERE conversion_action.status != 'REMOVED'

ORDER BY conversion_action.name

LIMIT 10000

  `.trim());
    // ConversionAction inventory provides action-specific configuration.
    // Performance metrics come from Campaign segmented by conversion_action,
    // then are summed across campaigns for account-wide action totals.
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
    }
    catch (error) {
        // Keep the conversion-action inventory visible even when a reporting
        // query is temporarily unavailable or rejected for field compatibility.
        metricsError = error instanceof Error ? error.message : "Google conversion metrics could not be loaded.";
        console.warn("Google conversion metrics query failed:", metricsError);
    }
    const metricMap = new Map<string, JsonRecord>();
    for (const rowValue of metricRows) {
        const row = asRecord(rowValue);
        const segments = asRecord(row.segments);
        const resourceName = String(segments.conversionAction ?? "");
        const match = resourceName.match(/\/conversionActions\/(\d+)$/);
        if (!match)
            continue;
        const id = match[1];
        const rowMetrics = asRecord(row.metrics);
        const totalMetrics = metricMap.get(id) ?? {
            conversions: 0,
            conversionsValue: 0,
            allConversions: 0,
            allConversionsValue: 0,
        };
        // The campaign query returns rows per campaign/action pair, so sum
        // them to produce account-wide totals for each conversion action.
        totalMetrics.conversions += Number(rowMetrics.conversions ?? 0) || 0;
        totalMetrics.conversionsValue += Number(rowMetrics.conversionsValue ?? 0) || 0;
        totalMetrics.allConversions += Number(rowMetrics.allConversions ?? 0) || 0;
        totalMetrics.allConversionsValue += Number(rowMetrics.allConversionsValue ?? 0) || 0;
        metricMap.set(id, totalMetrics);
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

async function metaGet<T = JsonRecord>(context: MetaAdsCreationContext, path: string, params: URLSearchParams): Promise<JsonRecord & {
    data?: T[];
    paging?: JsonRecord;
    id?: string;
}> {
    const normalizedPath = path.replace(/^\/+/, "");
    const url = new URL(`https://graph.facebook.com/${context.apiVersion}/${normalizedPath}`);
    params.forEach((value, key) => url.searchParams.set(key, value));
    let response: Response;
    try {
        response = await fetch(url, {
            method: "GET",
            headers: { Authorization: `Bearer ${context.accessToken}` },
            signal: AbortSignal.timeout(30000),
        });
    }
    catch (error) {
        throw new ConversionRouteError(`Unable to connect to Meta Graph API: ${error instanceof Error ? error.message : "Unknown network error"}`, 502);
    }
    const payload = await response.json().catch(() => ({})) as JsonRecord;
    if (!response.ok || payload.error) {
        throw new ConversionRouteError(asRecord(payload.error).message ?? `Meta Graph API returned HTTP ${response.status}.`, response.status >= 400 && response.status < 500 ? response.status : 502, payload);
    }
    return payload as JsonRecord & {
        data?: T[];
        paging?: JsonRecord;
        id?: string;
    };
}

async function metaMutate(context: MetaAdsCreationContext, path: string, method: "POST" | "DELETE", params?: URLSearchParams): Promise<JsonRecord> {
    const normalizedPath = path.replace(/^\/+/, "");
    const url = new URL(`https://graph.facebook.com/${context.apiVersion}/${normalizedPath}`);
    let response: Response;
    try {
        if (method === "DELETE") {
            params?.forEach((value, key) => url.searchParams.set(key, value));
            response = await fetch(url, {
                method,
                headers: { Authorization: `Bearer ${context.accessToken}` },
                signal: AbortSignal.timeout(30000),
            });
        }
        else {
            response = await fetch(url, {
                method,
                headers: {
                    Authorization: `Bearer ${context.accessToken}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: params,
                signal: AbortSignal.timeout(30000),
            });
        }
    }
    catch (error) {
        throw new ConversionRouteError(`Unable to connect to Meta Graph API: ${error instanceof Error ? error.message : "Unknown network error"}`, 502);
    }
    const payload = await response.json().catch(() => ({})) as JsonRecord;
    if (!response.ok || payload.error) {
        throw new ConversionRouteError(asRecord(payload.error).message ?? `Meta Graph API mutation failed with HTTP ${response.status}.`, response.status >= 400 && response.status < 500 ? response.status : 502, payload);
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
        fields: "id,name,description,account_id,custom_event_type,event_source_type,data_sources,rule,creation_time,first_fired_time,last_fired_time,is_archived,is_unavailable,default_conversion_value,pixel{id,name}",
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
        throw new ConversionRouteError(pixelError ?? customConversionsError ?? "Meta conversion tracking data could not be loaded.", 502);
    }
    return {
        accountId,
        pixels: Array.isArray(pixelResult?.data) ? pixelResult.data : [],
        customConversions: Array.isArray(customResult?.data)
            ? customResult.data.map((value) => {
                const conversion = asRecord(value);
                const pixel = asRecord(conversion.pixel);
                return {
                    ...conversion,
                    // Keep the previous frontend response key populated from
                    // the documented Pixel field instead of requesting an
                    // undocumented `event_source_id` response field.
                    event_source_id: conversion.event_source_id ?? pixel.id ?? null,
                };
            })
            : [],
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
    if (!/^\d+$/.test(value))
        throw new ConversionRouteError(`A valid numeric ${label} is required.`);
    return value;
}

function sendError(res: ExpressResponse, error: unknown) {
    const candidate = error as {
        statusCode?: unknown;
        message?: unknown;
        details?: unknown;
    };
    const statusCode = typeof candidate.statusCode === "number" && candidate.statusCode >= 400 && candidate.statusCode <= 599
        ? candidate.statusCode
        : 500;
    if (statusCode >= 500)
        console.error("Conversion tracking route error:", error);
    return res.status(statusCode).json({
        success: false,
        message: typeof candidate.message === "string" ? candidate.message : "Conversion tracking request failed.",
        ...(statusCode < 500 && candidate.details ? { details: candidate.details } : {}),
    });
}
// Unified read endpoint. Each provider is isolated so one provider failure does not hide the other.

router.get("/", async (req: Request, res: ExpressResponse) => {
    const userId = requireUser(req, res);
    if (!userId)
        return;
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
    }
    catch (error) {
        return sendError(res, error);
    }
});
// Create a Google website conversion action. Tag snippets are returned on the next GET refresh.

router.post("/google/actions", async (req: Request, res: ExpressResponse) => {
    const userId = requireUser(req, res);
    if (!userId)
        return;
    try {
        const account = await getSelectedAccount(userId, "googleAds");
        if (!account)
            throw new ConversionRouteError("Select a Google Ads account first.", 404);
        const name = readBodyString(asRecord(req.body), "name", 128);
        const category = String(req.body?.category ?? "PURCHASE").toUpperCase();
        if (!GOOGLE_CONVERSION_CATEGORIES.has(category))
            throw new ConversionRouteError("Unsupported Google conversion category.");
        const countingType = String(req.body?.countingType ?? "MANY_PER_CLICK").toUpperCase();
        if (!["ONE_PER_CLICK", "MANY_PER_CLICK"].includes(countingType))
            throw new ConversionRouteError("countingType must be ONE_PER_CLICK or MANY_PER_CLICK.");
        const state = await getGoogleContextAndSettings(userId, account.externalAccountId);
        const defaultValue = req.body?.defaultValue === undefined ? 0 : Number(req.body.defaultValue);
        if (!Number.isFinite(defaultValue) || defaultValue < 0) {
            throw new ConversionRouteError("defaultValue must be a non-negative number.");
        }
        const currency = typeof state.conversionCustomerCurrencyCode === "string"
            ? state.conversionCustomerCurrencyCode
            : undefined;
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
    }
    catch (error) {
        return sendError(res, error);
    }
});
// Enable or hide a Google conversion action. Google removal is intentionally not offered here.

router.patch("/google/actions/:actionId/status", async (req: Request, res: ExpressResponse) => {
    const userId = requireUser(req, res);
    if (!userId)
        return;
    try {
        const account = await getSelectedAccount(userId, "googleAds");
        if (!account)
            throw new ConversionRouteError("Select a Google Ads account first.", 404);
        const actionId = requireNumericId(String(req.params.actionId), "conversion action ID");
        const status = String(req.body?.status ?? "").toUpperCase();
        // ConversionActionStatus supports ENABLED, HIDDEN and REMOVED. HIDDEN is
        // the reversible non-accruing state; PAUSED is not a valid enum here.
        if (!["ENABLED", "HIDDEN"].includes(status))
            throw new ConversionRouteError("status must be ENABLED or HIDDEN.");
        const state = await getGoogleContextAndSettings(userId, account.externalAccountId);
        const resourceName = `customers/${state.conversionCustomerId}/conversionActions/${actionId}`;
        const result = await googleMutate(state.context, "conversionActions:mutate", {
            operations: [{ update: { resourceName, status }, updateMask: "status" }],
        });
        return res.status(200).json({ success: true, result });
    }
    catch (error) {
        return sendError(res, error);
    }
});
// Create a Meta Custom Conversion tied to one Pixel/Dataset from the selected ad account.

router.post("/meta/custom-conversions", async (req: Request, res: ExpressResponse) => {
    const userId = requireUser(req, res);
    if (!userId)
        return;
    try {
        const account = await getSelectedAccount(userId, "metaAds");
        if (!account)
            throw new ConversionRouteError("Select a Meta Ads account first.", 404);
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
        if (!ownsPixel)
            throw new ConversionRouteError("The selected Pixel/Dataset is not attached to this Meta ad account.", 403);
        const eventType = String(req.body?.eventType ?? "PURCHASE").toUpperCase();
        if (!META_CUSTOM_EVENT_TYPES.has(eventType))
            throw new ConversionRouteError("Unsupported Meta custom conversion event type.");
        const rule = asRecord(req.body?.rule);
        if (!Object.keys(rule).length)
            throw new ConversionRouteError("A non-empty custom conversion rule is required.");
        const params = new URLSearchParams({
            name,
            event_source_id: pixelId,
            custom_event_type: eventType,
            rule: JSON.stringify(rule),
            action_source_type: "website",
        });
        if (typeof req.body?.description === "string" && req.body.description.trim())
            params.set("description", req.body.description.trim().slice(0, 500));
        if (req.body?.defaultConversionValue !== undefined) {
            const defaultValue = Number(req.body.defaultConversionValue);
            if (!Number.isFinite(defaultValue) || defaultValue < 0)
                throw new ConversionRouteError("defaultConversionValue must be a non-negative number.");
            params.set("default_conversion_value", String(defaultValue));
        }
        const result = await metaMutate(context, `${context.adAccountId}/customconversions`, "POST", params);
        return res.status(201).json({ success: true, customConversion: result });
    }
    catch (error) {
        return sendError(res, error);
    }
});

async function assertMetaCustomConversionOwnership(context: MetaAdsCreationContext, conversionId: string) {
    const conversion = await metaGet(context, conversionId, new URLSearchParams({ fields: "id,account_id" }));
    const accountId = String(conversion.account_id ?? "").replace(/^act_/, "");
    const selectedId = context.adAccountId.replace(/^act_/, "");
    if (!accountId || accountId !== selectedId)
        throw new ConversionRouteError("This custom conversion does not belong to the selected Meta ad account.", 403);
}

router.patch("/meta/custom-conversions/:conversionId", async (req: Request, res: ExpressResponse) => {
    const userId = requireUser(req, res);
    if (!userId)
        return;
    try {
        const account = await getSelectedAccount(userId, "metaAds");
        if (!account)
            throw new ConversionRouteError("Select a Meta Ads account first.", 404);
        const context = await getMetaAdsCreationContext(userId, account.externalAccountId);
        const conversionId = requireNumericId(String(req.params.conversionId), "custom conversion ID");
        await assertMetaCustomConversionOwnership(context, conversionId);
        const params = new URLSearchParams();
        if (typeof req.body?.name === "string" && req.body.name.trim())
            params.set("name", req.body.name.trim().slice(0, 100));
        if (typeof req.body?.description === "string")
            params.set("description", req.body.description.trim().slice(0, 500));
        if (req.body?.defaultConversionValue !== undefined) {
            const defaultValue = Number(req.body.defaultConversionValue);
            if (!Number.isFinite(defaultValue) || defaultValue < 0)
                throw new ConversionRouteError("defaultConversionValue must be a non-negative number.");
            params.set("default_conversion_value", String(defaultValue));
        }
        if (!params.toString())
            throw new ConversionRouteError("Provide name, description or defaultConversionValue to update.");
        const result = await metaMutate(context, conversionId, "POST", params);
        return res.status(200).json({ success: true, result });
    }
    catch (error) {
        return sendError(res, error);
    }
});

router.delete("/meta/custom-conversions/:conversionId", async (req: Request, res: ExpressResponse) => {
    const userId = requireUser(req, res);
    if (!userId)
        return;
    try {
        const account = await getSelectedAccount(userId, "metaAds");
        if (!account)
            throw new ConversionRouteError("Select a Meta Ads account first.", 404);
        const context = await getMetaAdsCreationContext(userId, account.externalAccountId);
        const conversionId = requireNumericId(String(req.params.conversionId), "custom conversion ID");
        await assertMetaCustomConversionOwnership(context, conversionId);
        const result = await metaMutate(context, conversionId, "DELETE");
        return res.status(200).json({ success: true, result });
    }
    catch (error) {
        return sendError(res, error);
    }
});

export default router;
