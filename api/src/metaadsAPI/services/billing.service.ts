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

export interface MetaSpendTrendPoint {
  date: string;
  amount: number;
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
  spendTrend: MetaSpendTrendPoint[];
  spendTrendAvailability: "available" | "no_data" | "permission_required" | "error";
  spendTrendMessage: string | null;

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

async function getAllMetaBusinessInvoiceRows(input: {
  version: string;
  businessId: string;
  accessToken: string;
  parameters: Record<string, string>;
}): Promise<UnknownRecord[]> {
  const rows: UnknownRecord[] = [];
  let after: string | null = null;
  const maxPages = 20;

  for (let page = 0; page < maxPages; page += 1) {
    const payload = await metaGet(
      input.version,
      `${input.businessId}/business_invoices`,
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
      throw new Error("Meta Business invoices returned another page without a paging cursor. Invoice history may be incomplete.");
    }
    if (nextAfter === after) {
      throw new Error("Meta Business invoices returned a repeated paging cursor. Invoice history could not be verified.");
    }
    after = nextAfter;
  }

  throw new Error(`Meta Business invoice history exceeded the ${maxPages}-page safety limit. The returned invoice list was not treated as complete.`);
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

type MetaSpendTrendResult = {
  points: MetaSpendTrendPoint[];
  availability: MetaBillingOverview["periodSpendAvailability"];
  message: string | null;
};

function dailyPointsFromMetaRows(rows: UnknownRecord[]): MetaSpendTrendPoint[] | null {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const date = stringValue(row.dateStart ?? row.date_start);
    const spend = numberValue(row.spend);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || spend === null) return null;
    totals.set(date, (totals.get(date) ?? 0) + spend);
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount }));
}

async function getMetaSpendTrend(input: {
  version: string;
  accountId: string;
  accessToken: string;
  dates: BillingDateRange;
}): Promise<MetaSpendTrendResult> {
  let primaryError: unknown = null;
  let primarySucceeded = false;
  try {
    const rows = await getAllMetaInsightsRows({
      version: input.version,
      accountId: input.accountId,
      accessToken: input.accessToken,
      parameters: {
        fields: "date_start,spend",
        level: "account",
        time_increment: "1",
        time_range: JSON.stringify({ since: input.dates.since, until: input.dates.until }),
        limit: "500",
      },
    });
    primarySucceeded = true;
    if (rows.length > 0) {
      const points = dailyPointsFromMetaRows(rows);
      if (points) return { points, availability: "available", message: null };
      primaryError = new Error("Meta account-level daily Insights returned rows without valid date_start or spend values.");
    }
  } catch (error) {
    primaryError = error;
  }

  try {
    const campaignRows = await getAllMetaInsightsRows({
      version: input.version,
      accountId: input.accountId,
      accessToken: input.accessToken,
      parameters: {
        fields: "campaign_id,date_start,spend",
        level: "campaign",
        time_increment: "1",
        time_range: JSON.stringify({ since: input.dates.since, until: input.dates.until }),
        limit: "500",
      },
    });
    if (campaignRows.length > 0) {
      const points = dailyPointsFromMetaRows(campaignRows);
      if (!points) throw new Error("Meta campaign-level daily Insights returned invalid date_start or spend values.");
      return {
        points,
        availability: "available",
        message: primaryError
          ? "Daily spend was retrieved from campaign-level Insights because the account-level daily report was unavailable."
          : null,
      };
    }

    if (primarySucceeded) {
      return {
        points: [], availability: "no_data",
        message: `Meta returned no daily account-level or campaign-level Insights rows for ${input.dates.since} to ${input.dates.until}. Missing dates are not treated as zero spend.`,
      };
    }

    const permissionRequired = isPermissionError(primaryError);
    return {
      points: [], availability: permissionRequired ? "permission_required" : "error",
      message: `Meta daily Insights could not be loaded. ${metaInsightsErrorText(primaryError)}`,
    };
  } catch (fallbackError) {
    const permissionRequired = isPermissionError(primaryError) || isPermissionError(fallbackError);
    return {
      points: [], availability: permissionRequired ? "permission_required" : "error",
      message: `Meta daily Insights failed. Account-level: ${primaryError ? metaInsightsErrorText(primaryError) : "No usable rows."} Campaign-level: ${metaInsightsErrorText(fallbackError)}`,
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

  const [insightResult, trendResult, fundingResult, taxResult] = await Promise.allSettled([
    getMetaPeriodSpend({ version, accountId, accessToken, dates: input.dates }),
    getMetaSpendTrend({ version, accountId, accessToken, dates: input.dates }),
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
  const spendTrend: MetaSpendTrendResult = trendResult.status === "fulfilled"
    ? trendResult.value
    : {
        points: [],
        availability: isPermissionError(trendResult.reason) ? "permission_required" : "error",
        message: trendResult.reason instanceof Error ? trendResult.reason.message.slice(0, 400) : "Meta daily Insights could not be loaded.",
      };

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

      // Meta treats start_date as exclusive. Use the day before the first
      // month in the six-month window so that month's first-day billing period
      // is not accidentally omitted.
      const invoiceSince = new Date(Date.UTC(
        invoiceUntil.getUTCFullYear(),
        invoiceUntil.getUTCMonth() - 5,
        0,
      ));

      const invoiceDates = {

        since: invoiceSince.toISOString().slice(0, 10),

        until: invoiceUntil.toISOString().slice(0, 10),

      };

      const rows = await getAllMetaBusinessInvoiceRows({
        version,
        businessId,
        accessToken,
        parameters: {
          fields: [
            "id", "invoice_id", "invoice_date", "billing_period", "due_date",
            "payment_status", "amount_due", "billed_amount_details", "currency", "invoice_type",
            "ad_account_ids", "download_uri", "cdn_download_uri",
          ].join(","),
          start_date: invoiceDates.since,
          end_date: invoiceDates.until,
          limit: "50",
        },
      });

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

    spendTrend: spendTrend.points,

    spendTrendAvailability: spendTrend.availability,

    spendTrendMessage: spendTrend.message,

    paymentMethod,

    tax,

    business,

    invoicesAvailability,

    invoicesMessage,

    invoices,

    lastSyncedAt: new Date().toISOString(),

  };

}


export interface MetaBillingActivity {
  id: string;
  eventType: string;
  title: string;
  description: string;
  eventTime: string | null;
  accountTime: string | null;
  actorName: string | null;
  objectName: string | null;
  objectType: string | null;
}

export interface MetaBillingActivitiesResult {
  availability: "available" | "not_supported" | "permission_required" | "error";
  message: string | null;
  activities: MetaBillingActivity[];
  truncated: boolean;
  lastSyncedAt: string;
}

const BILLING_ACTIVITY_TITLES: Record<string, { title: string; description: string }> = {
  ad_account_billing_charge: {
    title: "Billing charge recorded",
    description: "Meta recorded a charge against this ad account.",
  },
  ad_account_billing_charge_back: {
    title: "Billing chargeback recorded",
    description: "Meta recorded a chargeback against a previous account charge.",
  },
  ad_account_billing_charge_back_reversal: {
    title: "Chargeback reversal recorded",
    description: "Meta recorded a reversal of a previous chargeback.",
  },
  ad_account_billing_chargeback: {
    title: "Billing chargeback recorded",
    description: "Meta recorded a chargeback against a previous account charge.",
  },
  ad_account_billing_chargeback_reversal: {
    title: "Chargeback reversal recorded",
    description: "Meta recorded a reversal of a previous chargeback.",
  },
  ad_account_billing_decline: {
    title: "Billing payment declined",
    description: "Meta reports that a billing charge was declined. Review the account in Meta Billing.",
  },
  ad_account_billing_charge_failed: {
    title: "Billing charge failed",
    description: "Meta reports that a billing charge failed. Review the account in Meta Billing.",
  },
  ad_account_billing_refund: {
    title: "Billing refund recorded",
    description: "Meta recorded a refund on this ad account.",
  },
  add_funding_source: {
    title: "Funding source added",
    description: "A funding source was added to this ad account in Meta.",
  },
  remove_funding_source: {
    title: "Funding source removed",
    description: "A funding source was removed from this ad account in Meta.",
  },
  billing_event: {
    title: "Billing event recorded",
    description: "Meta recorded a billing-related event for this ad account.",
  },
  funding_event_initiated: {
    title: "Funding event initiated",
    description: "Meta reports that a funding event was initiated.",
  },
  funding_event_successful: {
    title: "Funds added successfully",
    description: "Meta reports that a funding event completed successfully.",
  },
  ad_account_update_spend_limit: {
    title: "Account spending limit updated",
    description: "The ad account spending limit was updated in Meta.",
  },
  ad_account_reset_spend_limit: {
    title: "Account spending limit reset",
    description: "The ad account spending limit was reset in Meta.",
  },
  ad_account_remove_spend_limit: {
    title: "Account spending limit removed",
    description: "The ad account spending limit was removed in Meta.",
  },
};

function normalizeActivityTime(value: unknown): string | null {
  const raw = stringValue(value);
  if (!raw) return null;
  const numeric = Number(raw);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 100_000_000_000 ? numeric * 1000 : numeric)
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function billingActivityFromRecord(
  row: UnknownRecord,
  accountId: string,
  index: number,
): MetaBillingActivity | null {
  const eventType = stringValue(row.eventType ?? row.event_type)?.toLowerCase();
  if (!eventType || !BILLING_ACTIVITY_TITLES[eventType]) return null;

  const time = normalizeActivityTime(row.eventTime ?? row.event_time);
  const actorName = stringValue(row.actorName ?? row.actor_name);
  const objectName = stringValue(row.objectName ?? row.object_name);
  const titleAndDescription = BILLING_ACTIVITY_TITLES[eventType]!;
  const translatedTitle = stringValue(row.translatedEventType ?? row.translated_event_type);
  const objectId = stringValue(row.objectId ?? row.object_id);
  const actorId = stringValue(row.actorId ?? row.actor_id);

  return {
    id: stringValue(row.id) ?? [accountId, eventType, time ?? "unknown-time", objectId ?? "", actorId ?? "", index].join(":"),
    eventType,
    // Prefer Meta's translated label when supplied, but keep a safe, readable
    // event-specific fallback for responses that omit it.
    title: translatedTitle ?? titleAndDescription.title,
    description: titleAndDescription.description,
    eventTime: time,
    accountTime: stringValue(row.dateTimeInTimezone ?? row.date_time_in_timezone),
    actorName,
    objectName,
    objectType: stringValue(row.objectType ?? row.object_type),
  };
}

function activityErrorAvailability(error: unknown): MetaBillingActivitiesResult["availability"] {
  if (isPermissionError(error)) return "permission_required";
  if (error instanceof MetaBillingApiError && [400, 404].includes(error.statusCode)) return "not_supported";
  return "error";
}

/**
 * Retrieves only Meta-reported billing/account-funding activity. The Ad
 * Activity edge is read-only and its availability depends on the token's
 * account permissions. It is not a complete payments ledger.
 */
export async function getMetaBillingActivities(input: {
  userId: string;
  accountId: string;
  dates: BillingDateRange;
}): Promise<MetaBillingActivitiesResult> {
  const lastSyncedAt = new Date().toISOString();
  try {
    const accessToken = await getProviderAccessToken(input.userId, "metaAds");
    const version = process.env.META_GRAPH_API_VERSION?.trim() || "v26.0";
    const accountId = input.accountId.startsWith("act_") ? input.accountId : `act_${input.accountId}`;
    if (!/^act_\d+$/.test(accountId)) throw new Error("Invalid Meta ad account ID.");

    const account = await metaGet(version, accountId, accessToken, { fields: "business{id}" });
    const businessId = stringValue(asRecord(account.business).id);

    const parameters: Record<string, string> = {
      fields: [
        "event_time", "date_time_in_timezone", "event_type", "translated_event_type",
        "extra_data", "actor_id", "actor_name", "object_id", "object_name", "object_type",
      ].join(","),
      category: "BUDGET",
      since: input.dates.since,
      until: input.dates.until,
      limit: "100",
    };
    // Meta requires business_id on the activities edge when the ad account
    // belongs to a Business Manager.
    if (businessId) parameters.business_id = businessId;

    const activities: MetaBillingActivity[] = [];
    const seenCursors = new Set<string>();
    const maxPages = 5;
    let cursor: string | null = null;
    let hasMore = false;

    for (let page = 0; page < maxPages; page += 1) {
      if (cursor) parameters.after = cursor;
      else delete parameters.after;

      const payload = await metaGet(version, `${accountId}/activities`, accessToken, parameters);
      const rows = Array.isArray(payload.data) ? payload.data.map(asRecord) : [];
      rows.forEach((row, index) => {
        const activity = billingActivityFromRecord(row, accountId, activities.length + index);
        if (activity) activities.push(activity);
      });

      const paging = asRecord(payload.paging);
      const cursors = asRecord(paging.cursors);
      let nextCursor = stringValue(cursors.after);
      if (!nextCursor && stringValue(paging.next)) {
        try {
          nextCursor = new URL(String(paging.next)).searchParams.get("after");
        } catch {
          nextCursor = null;
        }
      }

      hasMore = Boolean(nextCursor && rows.length > 0);
      if (!hasMore) break;
      if (seenCursors.has(nextCursor!)) {
        hasMore = true;
        break;
      }
      seenCursors.add(nextCursor!);
      cursor = nextCursor;
    }

    const truncated = hasMore;
    activities.sort((a, b) => (b.eventTime ?? "").localeCompare(a.eventTime ?? ""));
    return {
      availability: "available",
      message: truncated
        ? `Meta activity history reached the ${maxPages}-page safety limit. Results may be incomplete for ${input.dates.since} to ${input.dates.until}.`
        : activities.length === 0
          ? `Meta returned no billing activity events for ${input.dates.since} to ${input.dates.until}.`
          : null,
      activities,
      truncated,
      lastSyncedAt: new Date().toISOString(),
    };
  } catch (error) {
    const availability = activityErrorAvailability(error);
    const message = error instanceof Error ? error.message.slice(0, 400) : "Meta billing activity could not be loaded.";
    return {
      availability,
      message: availability === "permission_required"
        ? "Meta did not allow access to account activity. Check the connected user's ad account permissions and reconnect if required."
        : availability === "not_supported"
          ? "Meta activity history is not available for this account or API permission set."
          : message,
      activities: [],
      truncated: false,
      lastSyncedAt: new Date().toISOString(),
    };
  }
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