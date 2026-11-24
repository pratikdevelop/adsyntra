import type { BillingDateRange } from "../../googleadsAPI/services/billing.service.js";

import { getProviderAccessToken } from "../../utils/provider-token.utils.js";

export interface MetaBillingInvoice {

  id: string;

  invoiceNumber: string | null;

  invoiceDate: string | null;

  billingPeriod: string | null;

  dueDate: string | null;

  paymentStatus: string | null;

  amountDue: number | null;

  amount: number | null;

  currency: string | null;

  invoiceType: string | null;

  downloadAvailable: boolean;

  businessId: string;

}

export interface MetaBillingOverview {

  availability: "available" | "not_supported" | "permission_required" | "error";

  message: string | null;

  currency: string | null;

  accountStatus: { code: number | null; label: string };

  paymentArrangement: "prepaid" | "postpay" | "unknown";

  balance: number | null;

  balanceLabel: string;

  amountSpentLifetimeOrCap: number | null;

  spendCap: number | null;

  periodSpend: number | null;

  periodSpendAvailability: "available" | "no_data" | "permission_required" | "error";
  periodSpendMessage: string | null;

  paymentMethod: {

    availability: "available" | "permission_required" | "not_available";

    displayString: string | null;

    type: string | null;

  };

  tax: {

    availability: "available" | "not_available";

    taxId: string | null;

    taxIdStatus: number | null;

  };

  business: { id: string; name: string | null } | null;

  invoicesAvailability: "available" | "not_supported" | "permission_required" | "error";

  invoicesMessage: string | null;

  invoices: MetaBillingInvoice[];

  lastSyncedAt: string;

}

type UnknownRecord = Record<string, unknown>;

export class MetaBillingApiError extends Error {

  constructor(

    message: string,

    public readonly statusCode: number,

    public readonly metaCode?: number,

    public readonly details?: unknown,

  ) {

    super(message);

    this.name = "MetaBillingApiError";

  }

}

function asRecord(value: unknown): UnknownRecord {

  return value && typeof value === "object" && !Array.isArray(value)

    ? value as UnknownRecord

    : {};

}

function stringValue(value: unknown): string | null {

  if (typeof value !== "string" && typeof value !== "number") return null;

  const result = String(value).trim();

  return result || null;

}

function numberValue(value: unknown): number | null {

  if (value === null || value === undefined || value === "") return null;

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;

}

function metaError(payload: unknown): UnknownRecord {

  return asRecord(asRecord(payload).error);

}

function errorMessage(payload: unknown, fallback: string): string {

  return stringValue(metaError(payload).message) ?? fallback;

}

function isPermissionError(error: unknown): boolean {

  return error instanceof MetaBillingApiError &&

    (error.statusCode === 401 || error.statusCode === 403 || error.metaCode === 200);

}

async function metaGet(

  version: string,

  path: string,

  accessToken: string,

  parameters: Record<string, string> = {},

): Promise<UnknownRecord> {

  const url = new URL(`https://graph.facebook.com/${version}/${path.replace(/^\/+/, "")}`);

  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);

  const response = await fetch(url, {

    method: "GET",

    headers: { Authorization: `Bearer ${accessToken}` },

    signal: AbortSignal.timeout(30_000),

  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok || asRecord(payload).error) {

    const error = metaError(payload);

    throw new MetaBillingApiError(

      errorMessage(payload, `Meta Graph API returned HTTP ${response.status}.`),

      response.status,

      numberValue(error.code) ?? undefined,

      payload,

    );

  }

  return asRecord(payload);

}

type MetaPeriodSpendResult = {
  amount: number | null;
  availability: MetaBillingOverview["periodSpendAvailability"];
  message: string | null;
};

function metaInsightsErrorText(error: unknown): string {
  if (error instanceof MetaBillingApiError) {
    return `HTTP ${error.statusCode}${error.metaCode ? `, Meta code ${error.metaCode}` : ""}: ${error.message.slice(0, 300)}`;
  }
  return error instanceof Error ? error.message.slice(0, 350) : "Unknown Meta Insights error.";
}

function sumMetaSpendRows(rows: UnknownRecord[]): number | null {
  if (rows.length === 0) return null;
  let total = 0;
  for (const row of rows) {
    const spend = numberValue(row.spend);
    if (spend === null) return null;
    total += spend;
  }
  return Number.isFinite(total) ? total : null;
}

async function getAllMetaInsightsRows(input: {
  version: string;
  accountId: string;
  accessToken: string;
  parameters: Record<string, string>;
}): Promise<UnknownRecord[]> {
  const rows: UnknownRecord[] = [];
  let after: string | null = null;
  const maxPages = 20;

  for (let page = 0; page < maxPages; page += 1) {
    const payload = await metaGet(
      input.version,
      `${input.accountId}/insights`,
      input.accessToken,
      { ...input.parameters, ...(after ? { after } : {}) },
    );
    const pageRows = Array.isArray(payload.data) ? payload.data.map(asRecord) : [];
    rows.push(...pageRows);

    const paging = asRecord(payload.paging);
    const nextUrl = stringValue(paging.next);
    if (!nextUrl) return rows;

    let nextAfter = stringValue(asRecord(paging.cursors).after);
    if (!nextAfter) {
      try {
        nextAfter = new URL(nextUrl).searchParams.get("after");
      } catch {
        nextAfter = null;
      }
    }
    if (!nextAfter) {
      throw new Error("Meta Insights returned another page but did not expose a paging cursor. The spend total may be incomplete.");
    }
    if (nextAfter === after) {
      throw new Error("Meta Insights returned a repeated paging cursor. The spend total could not be verified.");
    }
    after = nextAfter;
  }

  throw new Error(`Meta Insights exceeded the ${maxPages}-page safety limit. The spend total was not treated as complete.`);
}

async function getMetaPeriodSpend(input: {
  version: string;
  accountId: string;
  accessToken: string;
  dates: BillingDateRange;
}): Promise<MetaPeriodSpendResult> {
  let primaryError: unknown = null;
  let primaryHadRows = false;

  try {
    const primary = await metaGet(input.version, `${input.accountId}/insights`, input.accessToken, {
      fields: "spend",
      level: "account",
      time_range: JSON.stringify({ since: input.dates.since, until: input.dates.until }),
      summary: "spend",
      limit: "1",
    });
    const rows = Array.isArray(primary.data) ? primary.data.map(asRecord) : [];
    primaryHadRows = rows.length > 0;
    const summarySpend = numberValue(asRecord(primary.summary).spend);

    if (summarySpend !== null) {
      return { amount: summarySpend, availability: "available", message: null };
    }
    if (rows.length > 0) {
      const rowSpend = sumMetaSpendRows(rows);
      if (rowSpend !== null) {
        return { amount: rowSpend, availability: "available", message: null };
      }
      primaryError = new Error("Meta account-level Insights returned rows without a readable spend value.");
    }
  } catch (error) {
    primaryError = error;
  }

  // Verify an empty/invalid account-level response against campaign-level
  // Insights. Monthly aggregation limits row volume, and every page is read.
  try {
    const campaignRows = await getAllMetaInsightsRows({
      version: input.version,
      accountId: input.accountId,
      accessToken: input.accessToken,
      parameters: {
        fields: "campaign_id,spend",
        level: "campaign",
        time_increment: "monthly",
        time_range: JSON.stringify({ since: input.dates.since, until: input.dates.until }),
        limit: "500",
      },
    });

    if (campaignRows.length > 0) {
      const campaignSpend = sumMetaSpendRows(campaignRows);
      if (campaignSpend !== null) {
        return {
          amount: campaignSpend,
          availability: "available",
          message: "Spend was verified using campaign-level Meta Insights because the account-level summary did not return a usable total.",
        };
      }
      return {
        amount: null,
        availability: "error",
        message: "Meta campaign-level Insights returned rows without readable spend values. The total was not estimated.",
      };
    }

    if (primaryHadRows) {
      return {
        amount: null,
        availability: "error",
        message: `Meta account-level Insights returned rows but no usable spend value. Campaign-level verification returned no rows. ${primaryError ? metaInsightsErrorText(primaryError) : ""}`.trim(),
      };
    }

    return {
      amount: null,
      availability: "no_data",
      message: `Meta returned no account-level or campaign-level Insights rows for ${input.dates.since} to ${input.dates.until}. AdSyntra is not assuming this means zero spend.`,
    };
  } catch (fallbackError) {
    const permissionRequired = [primaryError, fallbackError].some(isPermissionError);
    return {
      amount: null,
      availability: permissionRequired ? "permission_required" : "error",
      message: `Meta Insights could not verify this account's spend. Account-level request: ${primaryError ? metaInsightsErrorText(primaryError) : "No usable account-level spend was returned."} Campaign-level verification: ${metaInsightsErrorText(fallbackError)}`,
    };
  }
}

function accountStatusLabel(code: number | null): string {

  const labels: Record<number, string> = {

    1: "Active",

    2: "Disabled",

    3: "Unsettled",

    7: "Pending risk review",

    8: "Pending settlement",

    9: "In grace period",

    100: "Pending closure",

    101: "Closed",

  };

  return code === null ? "Unknown" : labels[code] ?? `Status ${code}`;

}

function amountFromCurrencyObject(value: unknown): number | null {

  if (typeof value === "string" || typeof value === "number") return numberValue(value);

  const record = asRecord(value);

  return numberValue(record.amount) ?? numberValue(record.value) ?? numberValue(record.amount_due);

}

// Meta's Ad Account balance, amount_spent and spend_cap are returned in the

// currency's minor unit (for example, cents for USD). Reporting Insights and

// Business invoice amounts are already expressed as display amounts and must

// not pass through this conversion.

function minorUnitsToAmount(value: unknown, currency: string | null): number | null {

  const minorUnits = numberValue(value);

  if (minorUnits === null) return null;

  if (!currency || !/^[A-Z]{3}$/.test(currency)) return null;

  try {

    const fractionDigits = new Intl.NumberFormat("en", {

      style: "currency",

      currency,

    }).resolvedOptions().maximumFractionDigits ?? 2;

    return minorUnits / (10 ** fractionDigits);

  } catch {

    return null;

  }

}

function maskTaxIdentifier(value: string | null): string | null {

  if (!value) return null;

  const normalized = value.trim();

  if (normalized.length <= 4) return normalized;

  return `${"•".repeat(Math.min(normalized.length - 4, 12))}${normalized.slice(-4)}`;

}

function invoiceFromRecord(value: UnknownRecord, businessId: string): MetaBillingInvoice | null {

  const id = stringValue(value.id);

  if (!id) return null;

  const amountDueObject = asRecord(value.amountDue ?? value.amount_due);

  const billedDetails = asRecord(value.billedAmountDetails ?? value.billed_amount_details);

  const invoiceTotal = amountFromCurrencyObject(value.amount) ??

    amountFromCurrencyObject(billedDetails.totalAmount ?? billedDetails.total_amount);

  return {

    id,

    invoiceNumber: stringValue(value.invoiceId ?? value.invoice_id),

    invoiceDate: stringValue(value.invoiceDate ?? value.invoice_date),

    billingPeriod: stringValue(value.billingPeriod ?? value.billing_period),

    dueDate: stringValue(value.dueDate ?? value.due_date),

    paymentStatus: stringValue(value.paymentStatus ?? value.payment_status),

    amountDue: amountFromCurrencyObject(

      Object.keys(amountDueObject).length ? amountDueObject : value.amountDue ?? value.amount_due,

    ),

    amount: invoiceTotal,

    currency: stringValue(value.currency) ?? stringValue(billedDetails.currency) ?? stringValue(amountDueObject.currency),

    invoiceType: stringValue(value.invoiceType ?? value.invoice_type ?? value.type),

    downloadAvailable: Boolean(

      stringValue(value.downloadUri ?? value.download_uri) ??

      stringValue(value.cdnDownloadUri ?? value.cdn_download_uri),

    ),

    businessId,

  };

}

function invoiceAvailabilityFromError(

  error: unknown,

): MetaBillingOverview["invoicesAvailability"] {

  if (isPermissionError(error)) return "permission_required";

  if (error instanceof MetaBillingApiError && [400, 404].includes(error.statusCode)) {

    return "not_supported";

  }

  return "error";

}

function invoiceMessageFromError(

  error: unknown,

  availability: MetaBillingOverview["invoicesAvailability"],

): string {

  if (availability === "permission_required") {

    return "Meta did not allow access to Business invoices. A person with the appropriate finance role and Business permissions may be required.";

  }

  if (availability === "not_supported") {

    return "Meta did not return Business Manager monthly invoices for this account. Card-funded and other non-invoiced accounts may not have API invoice history.";

  }

  return error instanceof Error

    ? error.message

    : "Meta invoice history could not be loaded.";

}

export async function getMetaBillingOverview(input: {

  userId: string;

  accountId: string;

  dates: BillingDateRange;

}): Promise<MetaBillingOverview> {

  const accessToken = await getProviderAccessToken(input.userId, "metaAds");

  const version = process.env.META_GRAPH_API_VERSION?.trim() || "v26.0";

  const accountId = input.accountId.startsWith("act_")

    ? input.accountId

    : `act_${input.accountId}`;

  if (!/^act_\d+$/.test(accountId)) throw new Error("Invalid Meta ad account ID.");

  const account = await metaGet(version, accountId, accessToken, {

    fields: [

      "id", "account_id", "name", "account_status", "currency", "balance",

      "amount_spent", "spend_cap", "is_prepay_account", "business{id,name}",

      "timezone_name",

    ].join(","),

  });

  const currency = stringValue(account.currency);

  const businessRecord = asRecord(account.business);

  const businessId = stringValue(businessRecord.id);

  const business = businessId

    ? { id: businessId, name: stringValue(businessRecord.name) }

    : null;

  const accountStatusCode = numberValue(account.accountStatus ?? account.account_status);

  const prepaid = account.isPrepayAccount ?? account.is_prepay_account;

  const paymentArrangement: MetaBillingOverview["paymentArrangement"] =

    typeof prepaid === "boolean" ? (prepaid ? "prepaid" : "postpay") : "unknown";

  const [insightResult, fundingResult, taxResult] = await Promise.allSettled([
    getMetaPeriodSpend({ version, accountId, accessToken, dates: input.dates }),
    metaGet(version, accountId, accessToken, { fields: "funding_source_details" }),
    metaGet(version, accountId, accessToken, { fields: "tax_id,tax_id_status" }),
  ]);

  const periodSpend = insightResult.status === "fulfilled" ? insightResult.value.amount : null;
  const periodSpendAvailability: MetaBillingOverview["periodSpendAvailability"] =
    insightResult.status === "fulfilled"
      ? insightResult.value.availability
      : isPermissionError(insightResult.reason) ? "permission_required" : "error";
  const periodSpendMessage = insightResult.status === "fulfilled"
    ? insightResult.value.message
    : insightResult.reason instanceof Error
      ? insightResult.reason.message.slice(0, 400)
      : "Meta Ads Insights could not be loaded.";

  let paymentMethod: MetaBillingOverview["paymentMethod"] = {

    availability: "not_available",

    displayString: null,

    type: null,

  };

  if (fundingResult.status === "fulfilled") {

    const details = asRecord(fundingResult.value.fundingSourceDetails ?? fundingResult.value.funding_source_details);

    paymentMethod = {

      availability: "available",

      displayString: stringValue(details.displayString ?? details.DISPLAY_STRING),

      type: stringValue(details.type ?? details.TYPE),

    };

  } else if (isPermissionError(fundingResult.reason)) {

    paymentMethod.availability = "permission_required";

  }

  const tax = taxResult.status === "fulfilled"

    ? {

        availability: "available" as const,

        taxId: maskTaxIdentifier(stringValue(taxResult.value.taxId ?? taxResult.value.tax_id)),

        taxIdStatus: numberValue(taxResult.value.taxIdStatus ?? taxResult.value.tax_id_status),

      }

    : {

        availability: "not_available" as const,

        taxId: null,

        taxIdStatus: null,

      };

  let invoicesAvailability: MetaBillingOverview["invoicesAvailability"] = "not_supported";

  let invoicesMessage: string | null = businessId

    ? "Meta Business invoices are available only to eligible monthly-invoiced businesses with the required finance access."

    : "This ad account did not return an owning Business ID, so Business Manager invoice history cannot be queried.";

  let invoices: MetaBillingInvoice[] = [];

  if (businessId) {

    try {

      // Invoice history has its own six-month window. It must not shrink to

      // the selected 7/30/90-day advertising reporting period.

      const invoiceUntil = new Date();

      const invoiceSince = new Date(Date.UTC(

        invoiceUntil.getUTCFullYear(),

        invoiceUntil.getUTCMonth() - 5,

        1,

      ));

      const invoiceDates = {

        since: invoiceSince.toISOString().slice(0, 10),

        until: invoiceUntil.toISOString().slice(0, 10),

      };

      const invoicePayload = await metaGet(version, `${businessId}/business_invoices`, accessToken, {

        fields: [

          "id", "invoice_id", "invoice_date", "billing_period", "due_date",

          "payment_status", "amount_due", "billed_amount_details", "currency", "invoice_type",

          "ad_account_ids", "download_uri", "cdn_download_uri",

        ].join(","),

        start_date: invoiceDates.since,

        end_date: invoiceDates.until,

        limit: "50",

      });

      const rows = Array.isArray(invoicePayload.data) ? invoicePayload.data : [];

      const numericAccountId = accountId.replace(/^act_/, "");

      invoices = rows

        .map(asRecord)

        .filter((rawRow) => {

          const accountIds = rawRow.adAccountIds ?? rawRow.ad_account_ids;

          // Business invoices can cover several ad accounts. Do not expose a

          // business-wide invoice in an account-specific view unless Meta

          // explicitly associates that invoice with this connected account.

          if (!Array.isArray(accountIds) || accountIds.length === 0) return false;

          return accountIds.some((id) => String(id).replace(/^act_/, "") === numericAccountId);

        })

        .map((row) => invoiceFromRecord(row, businessId))

        .filter((invoice): invoice is MetaBillingInvoice => invoice !== null);

      invoicesAvailability = "available";

      invoicesMessage = invoices.length === 0

        ? "No matching Meta Business invoices were returned for the selected date range."

        : null;

    } catch (error) {

      invoicesAvailability = invoiceAvailabilityFromError(error);

      invoicesMessage = invoiceMessageFromError(error, invoicesAvailability);

    }

  }

  return {

    availability: "available",

    message: null,

    currency,

    accountStatus: { code: accountStatusCode, label: accountStatusLabel(accountStatusCode) },

    paymentArrangement,

    balance: minorUnitsToAmount(account.balance, currency),

    balanceLabel: paymentArrangement === "prepaid" ? "Balance reported by Meta" : "Amount due",

    amountSpentLifetimeOrCap: minorUnitsToAmount(account.amountSpent ?? account.amount_spent, currency),

    spendCap: minorUnitsToAmount(account.spendCap ?? account.spend_cap, currency),

    periodSpend,

    periodSpendAvailability,
    periodSpendMessage,

    paymentMethod,

    tax,

    business,

    invoicesAvailability,

    invoicesMessage,

    invoices,

    lastSyncedAt: new Date().toISOString(),

  };

}

function safeMetaDownloadUrl(rawUrl: string): URL {

  const url = new URL(rawUrl);

  const allowed = ["facebook.com", "facebook.net", "fbcdn.net"];

  const allowedHost = allowed.some((domain) =>

    url.hostname === domain || url.hostname.endsWith(`.${domain}`),

  );

  if (url.protocol !== "https:" || !allowedHost) {

    throw new Error("Meta returned an unexpected invoice download host.");

  }

  return url;

}

export async function downloadMetaBillingInvoice(input: {

  userId: string;

  accountId: string;

  businessId: string;

  invoiceId: string;

}): Promise<{ bytes: Uint8Array; filename: string; contentType: string }> {

  if (!/^\d+$/.test(input.businessId) || !/^\d+$/.test(input.invoiceId)) {

    throw new Error("Invalid Meta invoice or Business ID.");

  }

  const accessToken = await getProviderAccessToken(input.userId, "metaAds");

  const version = process.env.META_GRAPH_API_VERSION?.trim() || "v26.0";

  const accountId = input.accountId.startsWith("act_")

    ? input.accountId

    : `act_${input.accountId}`;

  // Verify that the invoice belongs to the Business linked to this user's ad account.

  const account = await metaGet(version, accountId, accessToken, { fields: "business{id}" });

  const linkedBusinessId = stringValue(asRecord(account.business).id);

  if (!linkedBusinessId || linkedBusinessId !== input.businessId) {

    throw new Error("The requested Meta Business does not own this connected ad account.");

  }

  const invoice = await metaGet(version, input.invoiceId, accessToken, {

    fields: "id,download_uri,cdn_download_uri,ad_account_ids",

  });

  const invoiceAccountIds = invoice.adAccountIds ?? invoice.ad_account_ids;

  const numericAccountId = accountId.replace(/^act_/, "");

  if (!Array.isArray(invoiceAccountIds) || !invoiceAccountIds.some(

    (id) => String(id).replace(/^act_/, "") === numericAccountId,

  )) {

    throw new Error("The requested Meta invoice is not associated with this connected ad account.");

  }

  const rawUrl = stringValue(invoice.cdnDownloadUri ?? invoice.cdn_download_uri) ??

    stringValue(invoice.downloadUri ?? invoice.download_uri);

  if (!rawUrl) throw new Error("Meta did not provide a download URL for this invoice.");

  const url = safeMetaDownloadUrl(rawUrl);

  const response = await fetch(url, {

    headers: { Authorization: `Bearer ${accessToken}` },

    signal: AbortSignal.timeout(45_000),

  });

  if (!response.ok) throw new Error(`Meta invoice download failed with HTTP ${response.status}.`);

  const bytes = new Uint8Array(await response.arrayBuffer());

  if (bytes.byteLength === 0 || bytes.byteLength > 25 * 1024 * 1024) {

    throw new Error("Meta returned an invalid invoice file size.");

  }

  const contentType = response.headers.get("content-type")?.split(";")[0] || "application/pdf";

  if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {

    throw new Error("Meta returned a file that is not a PDF invoice.");

  }

  return {

    bytes,

    filename: `meta-ads-invoice-${input.invoiceId}.pdf`,

    contentType: "application/pdf",

  };

}