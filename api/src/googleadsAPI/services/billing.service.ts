import { getGoogleAdsCreationContext } from "./campaign-creation.js";

export interface BillingDateRange {
  since: string;
  until: string;
}

interface GoogleAdsContext {
  customerId: string;
  accessToken: string;
  developerToken: string;
  apiVersion: string;
}

type UnknownRecord = Record<string, unknown>;

export interface GoogleBillingSetup {
  id: string;
  resourceName: string;
  status: string | null;
  paymentsAccountId: string | null;
  paymentsAccountName: string | null;
  paymentsProfileId: string | null;
  paymentsProfileName: string | null;
  startDateTime: string | null;
  endDateTime: string | null;
}

export interface GoogleAccountBudget {
  id: string;
  name: string | null;
  status: string | null;
  billingSetup: string | null;
  approvedSpendingLimit: number | null;
  adjustedSpendingLimit: number | null;
  proposedSpendingLimit: number | null;
  currency: string | null;
  startDateTime: string | null;
  endDateTime: string | null;
}

export interface GoogleBillingInvoice {
  id: string;
  invoiceType: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  pdfAvailable: boolean;
  billingSetupId: string;
  issueYear: number;
  issueMonth: string;
}

export interface GoogleBillingOverview {
  availability: "available" | "not_supported" | "permission_required" | "error";
  message: string | null;
  currency: string | null;
  reportingSpend: number | null;
  currencyIsMixed?: boolean;
  reportingSpendAvailability: "available" | "no_data" | "permission_required" | "error";
  reportingSpendMessage: string | null;
  billingSetups: GoogleBillingSetup[];
  accountBudgets: GoogleAccountBudget[];
  invoices: GoogleBillingInvoice[];
  invoicesAvailability: "available" | "not_supported" | "permission_required" | "error";
  invoicesMessage: string | null;
  lastSyncedAt: string;
}

export class GoogleBillingApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
    public readonly requestId?: string | null,
  ) {
    super(message);
    this.name = "GoogleBillingApiError";
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

function microsToAmount(value: unknown): number | null {
  const micros = numberValue(value);
  return micros === null ? null : micros / 1_000_000;
}

function nestedRecord(value: UnknownRecord, key: string): UnknownRecord {
  return asRecord(value[key]);
}

function googleErrorMessage(payload: unknown, fallback: string): string {
  const error = nestedRecord(asRecord(payload), "error");
  const baseMessage = stringValue(error.message) ?? fallback;
  const details = Array.isArray(error.details) ? error.details.map(asRecord) : [];
  const failure = details.find((detail) =>
    (stringValue(detail["@type"]) ?? "").includes("GoogleAdsFailure"),
  );
  if (!failure) return baseMessage;

  const errors = Array.isArray(failure.errors) ? failure.errors.map(asRecord) : [];
  const descriptions = errors.slice(0, 4).map((item) => {
    const errorCode = nestedRecord(item, "errorCode");
    const codeEntry = Object.entries(errorCode).find(([, value]) => value !== null && value !== undefined);
    const code = codeEntry ? `${codeEntry[0]}=${String(codeEntry[1])}` : null;
    const message = stringValue(item.message);
    const location = nestedRecord(item, "location");
    const pathElements = Array.isArray(location.fieldPathElements)
      ? location.fieldPathElements.map((part) => stringValue(asRecord(part).fieldName)).filter(Boolean)
      : [];
    const triggerRecord = nestedRecord(item, "trigger");
    const trigger = Object.values(triggerRecord).map(stringValue).find(Boolean) ?? null;
    return [code, message, pathElements.length ? `at ${pathElements.join(".")}` : null, trigger ? `trigger: ${trigger}` : null]
      .filter(Boolean)
      .join("; ");
  }).filter(Boolean);

  const requestId = stringValue(failure.requestId ?? failure.request_id);
  const diagnostics = [
    descriptions.length ? `Google Ads details: ${descriptions.join(" | ")}` : null,
    requestId ? `request ID: ${requestId}` : null,
  ].filter(Boolean);
  return diagnostics.length ? `${baseMessage} ${diagnostics.join(". ")}.` : baseMessage;
}

async function googleAdsSearch(
  context: GoogleAdsContext,
  query: string,
  options: { customerId?: string; loginCustomerId?: string | null } = {},
): Promise<UnknownRecord[]> {
  const customerId = (options.customerId ?? context.customerId).replace(/[^0-9]/g, "");
  const configuredLoginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim().replace(/[^0-9]/g, "") || null;
  const loginCustomerId = options.loginCustomerId === undefined
    ? configuredLoginCustomerId
    : options.loginCustomerId?.replace(/[^0-9]/g, "") ?? null;
  const response = await fetch(
    `https://googleads.googleapis.com/${context.apiVersion}/customers/${customerId}/googleAds:search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        "Content-Type": "application/json",
        "developer-token": context.developerToken,
        ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const responseRequestId = response.headers.get("request-id") ?? response.headers.get("x-goog-request-id");
    const errorMessage = googleErrorMessage(payload, `Google Ads API returned HTTP ${response.status}.`);
    throw new GoogleBillingApiError(
      responseRequestId && !errorMessage.includes(responseRequestId)
        ? `${errorMessage} Request ID: ${responseRequestId}.`
        : errorMessage,
      response.status,
      payload,
      responseRequestId,
    );
  }

  const result = asRecord(payload);
  return Array.isArray(result.results)
    ? result.results.map(asRecord)
    : [];
}

function billingSetupFromRow(row: UnknownRecord): GoogleBillingSetup | null {
  const setup = nestedRecord(row, "billingSetup");
  const id = stringValue(setup.id);
  const resourceName = stringValue(setup.resourceName);
  if (!id || !resourceName) return null;

  const paymentsAccountInfo = nestedRecord(setup, "paymentsAccountInfo");
  return {
    id,
    resourceName,
    status: stringValue(setup.status),
    paymentsAccountId: stringValue(paymentsAccountInfo.paymentsAccountId),
    paymentsAccountName: stringValue(paymentsAccountInfo.paymentsAccountName),
    paymentsProfileId: stringValue(paymentsAccountInfo.paymentsProfileId),
    paymentsProfileName: stringValue(paymentsAccountInfo.paymentsProfileName),
    startDateTime: stringValue(setup.startDateTime),
    endDateTime: stringValue(setup.endDateTime),
  };
}

function accountBudgetFromRow(
  row: UnknownRecord,
  currency: string | null,
): GoogleAccountBudget | null {
  const budget = nestedRecord(row, "accountBudget");
  const id = stringValue(budget.id);
  if (!id) return null;

  return {
    id,
    name: stringValue(budget.name),
    status: stringValue(budget.status),
    billingSetup: stringValue(budget.billingSetup),
    approvedSpendingLimit: microsToAmount(budget.approvedSpendingLimitMicros),
    adjustedSpendingLimit: microsToAmount(budget.adjustedSpendingLimitMicros),
    proposedSpendingLimit: microsToAmount(budget.proposedSpendingLimitMicros),
    currency,
    startDateTime:
      stringValue(budget.approvedStartDateTime) ??
      stringValue(budget.proposedStartDateTime),
    endDateTime:
      stringValue(budget.approvedEndDateTime) ??
      stringValue(budget.proposedEndDateTime),
  };
}

function getRecentIssueMonths(count: number): Array<{ year: number; month: string }> {
  const monthNames = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
  ];
  const now = new Date();
  const months: Array<{ year: number; month: string }> = [];
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    months.push({ year: date.getUTCFullYear(), month: monthNames[date.getUTCMonth()] ?? "JANUARY" });
  }
  return months;
}

interface GoogleReportingSpendResult {
  amount: number | null;
  currency: string | null;
  currencyIsMixed?: boolean;
  availability: "available" | "no_data" | "permission_required" | "error";
  message: string | null;
}

function errorText(error: unknown): string {
  if (error instanceof GoogleBillingApiError) {
    return `HTTP ${error.statusCode}: ${error.message.slice(0, 350)}`;
  }
  return error instanceof Error ? error.message.slice(0, 400) : "Unknown Google Ads reporting error.";
}

function reportingErrorAvailability(...errors: unknown[]): GoogleReportingSpendResult["availability"] {
  return errors.some((error) => error instanceof GoogleBillingApiError && [401, 403].includes(error.statusCode))
    ? "permission_required"
    : "error";
}

/**
 * Retrieve spend from the customer-level report first. If Google returns no
 * customer row, or that query cannot be used, fall back to campaign rows and
 * sum cost_micros. An explicit numeric zero is valid spend data; an empty
 * response is not silently converted to zero.
 */
async function getGoogleReportingSpendForCustomer(
  context: GoogleAdsContext,
  dates: BillingDateRange,
  fallbackCurrency: string | null,
  loginCustomerId?: string | null,
): Promise<GoogleReportingSpendResult> {
  const dateFilter = `WHERE segments.date BETWEEN '${dates.since}' AND '${dates.until}'`;
  let primarySucceeded = false;
  let primaryError: unknown = null;
  let primaryHadRows = false;
  const requestOptions = loginCustomerId === undefined ? {} : { loginCustomerId };

  try {
    const rows = await googleAdsSearch(
      context,
      `SELECT customer.id, customer.currency_code, metrics.cost_micros FROM customer ${dateFilter}`,
      requestOptions,
    );
    primarySucceeded = true;
    primaryHadRows = rows.length > 0;

    if (rows.length > 0) {
      let totalMicros = 0;
      let hasReadableSpend = true;
      for (const row of rows) {
        const micros = numberValue(nestedRecord(row, "metrics").costMicros);
        if (micros === null) {
          hasReadableSpend = false;
          break;
        }
        totalMicros += micros;
      }
      const currency = stringValue(nestedRecord(rows[0]!, "customer").currencyCode) ?? fallbackCurrency;
      if (hasReadableSpend && Number.isFinite(totalMicros)) {
        return { amount: microsToAmount(totalMicros), currency, availability: "available", message: null };
      }
      primaryError = new Error("Google Ads returned customer reporting rows without readable metrics.cost_micros values.");
    }
  } catch (error) {
    primaryError = error;
  }

  try {
    const campaignRows = await googleAdsSearch(
      context,
      `SELECT campaign.id, metrics.cost_micros FROM campaign ${dateFilter}`,
      requestOptions,
    );

    if (campaignRows.length > 0) {
      let totalMicros = 0;
      for (const row of campaignRows) {
        const micros = numberValue(nestedRecord(row, "metrics").costMicros);
        if (micros === null) {
          throw new Error("Google Ads returned campaign reporting rows without a readable metrics.cost_micros value.");
        }
        totalMicros += micros;
      }
      if (!Number.isFinite(totalMicros)) throw new Error("Google Ads returned an invalid campaign spend total.");
      return { amount: totalMicros / 1_000_000, currency: fallbackCurrency, availability: "available", message: null };
    }

    if (primarySucceeded && !primaryHadRows) {
      return {
        amount: null,
        currency: fallbackCurrency,
        availability: "no_data",
        message: `Google Ads returned no reporting rows for ${dates.since} to ${dates.until}. No zero spend is assumed.`,
      };
    }

    const primaryMessage = primaryError ? errorText(primaryError) : "The customer-level report contained no readable spend value.";
    return {
      amount: null,
      currency: fallbackCurrency,
      availability: reportingErrorAvailability(primaryError),
      message: `Google Ads reporting data could not be read. ${primaryMessage}`,
    };
  } catch (fallbackError) {
    if (primarySucceeded && !primaryHadRows) {
      return {
        amount: null,
        currency: fallbackCurrency,
        availability: "no_data",
        message: `Google Ads returned no customer-level reporting rows for ${dates.since} to ${dates.until}. The campaign-level fallback could not be completed: ${errorText(fallbackError)}`,
      };
    }
    const primaryMessage = primaryError ? errorText(primaryError) : "The customer-level report returned no usable rows.";
    return {
      amount: null,
      currency: fallbackCurrency,
      availability: reportingErrorAvailability(primaryError, fallbackError),
      message: `Google Ads reporting failed. Customer-level report: ${primaryMessage} Campaign-level fallback: ${errorText(fallbackError)}`,
    };
  }
}

function isMetricsForManagerError(result: GoogleReportingSpendResult): boolean {
  return result.message?.includes("REQUESTED_METRICS_FOR_MANAGER") ?? false;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

async function getManagerAccountReportingSpend(
  context: GoogleAdsContext,
  dates: BillingDateRange,
): Promise<GoogleReportingSpendResult> {
  let clientRows: UnknownRecord[];
  try {
    clientRows = await googleAdsSearch(
      context,
      "SELECT customer_client.client_customer, customer_client.manager, customer_client.currency_code " +
      "FROM customer_client WHERE customer_client.manager = FALSE",
      { loginCustomerId: context.customerId },
    );
  } catch (error) {
    return {
      amount: null,
      currency: null,
      availability: reportingErrorAvailability(error),
      message: `Google identified this as a manager account, but its client accounts could not be listed: ${errorText(error)}`,
    };
  }

  const clients = new Map<string, string | null>();
  for (const row of clientRows) {
    const client = nestedRecord(row, "customerClient");
    const resourceName = stringValue(client.clientCustomer);
    const clientId = resourceName?.match(/customers\/(\d+)/)?.[1] ?? null;
    if (clientId) clients.set(clientId, stringValue(client.currencyCode));
  }

  if (clients.size === 0) {
    return {
      amount: null,
      currency: null,
      availability: "no_data",
      message: "This is a Google Ads manager account, but Google returned no non-manager client accounts to report on.",
    };
  }

  const clientEntries = [...clients.entries()];
  const results = await mapWithConcurrency(clientEntries, 4, async ([clientId, currency]) => ({
    clientId,
    currency,
    result: await getGoogleReportingSpendForCustomer(
      { ...context, customerId: clientId },
      dates,
      currency,
      context.customerId,
    ),
  }));

  const failed = results.filter(({ result }) => result.availability !== "available");
  const resolvedCurrencies = results.map(({ result, currency }) => result.currency ?? currency);
  if (resolvedCurrencies.some((value) => !value)) {
    return {
      amount: null,
      currency: null,
      availability: "error",
      message: "Google returned one or more manager client accounts without a confirmed currency. AdSyntra will not calculate a combined spend total until every client currency is known.",
    };
  }
  const currencies = new Set(resolvedCurrencies as string[]);

  if (currencies.size > 1) {
    return {
      amount: null,
      currency: null,
      currencyIsMixed: true,
      availability: "error",
      message: `This Google Ads manager account contains client accounts using multiple currencies (${[...currencies].join(", ")}). AdSyntra will not combine these amounts. Select individual client accounts to view spend by currency.`,
    };
  }

  if (failed.length > 0) {
    const sampleErrors = failed.slice(0, 3).map(({ clientId, result }) => `${clientId}: ${result.message ?? result.availability}`);
    return {
      amount: null,
      currency: [...currencies][0] ?? null,
      availability: failed.some(({ result }) => result.availability === "permission_required") ? "permission_required" : "error",
      message: `${failed.length} of ${results.length} Google Ads client accounts did not return a complete spend result. AdSyntra is not showing a partial manager-account total. ${sampleErrors.join(" | ")}`,
    };
  }

  const total = results.reduce((sum, { result }) => sum + (result.amount ?? 0), 0);
  return {
    amount: total,
    currency: [...currencies][0] ?? null,
    availability: "available",
    message: `Spend is aggregated from ${results.length} non-manager client account(s) because Google does not provide manager-account-level metrics.`,
  };
}

async function getGoogleReportingSpend(
  context: GoogleAdsContext,
  dates: BillingDateRange,
  fallbackCurrency: string | null,
): Promise<GoogleReportingSpendResult> {
  const directResult = await getGoogleReportingSpendForCustomer(context, dates, fallbackCurrency);
  if (isMetricsForManagerError(directResult)) {
    return getManagerAccountReportingSpend(context, dates);
  }
  return directResult;
}

async function listGoogleInvoicesForMonth(
  context: GoogleAdsContext,
  billingSetup: GoogleBillingSetup,
  year: number,
  month: string,
): Promise<UnknownRecord[]> {
  const params = new URLSearchParams({
    billingSetup: billingSetup.resourceName,
    issueMonth: month,
    issueYear: String(year),
    includeGranularLevelInvoiceDetails: "false",
  });
  const response = await fetch(
    `https://googleads.googleapis.com/${context.apiVersion}/customers/${context.customerId}/invoices?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        "developer-token": context.developerToken,
        ...(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim()
          ? { "login-customer-id": process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.trim().replace(/-/g, "") }
          : {}),
      },
      signal: AbortSignal.timeout(30_000),
    },
  );

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new GoogleBillingApiError(
      googleErrorMessage(payload, `Google invoice retrieval returned HTTP ${response.status}.`),
      response.status,
      payload,
    );
  }

  const result = asRecord(payload);
  return Array.isArray(result.invoices)
    ? result.invoices.map(asRecord)
    : [];
}

function invoiceFromRecord(
  invoice: UnknownRecord,
  setup: GoogleBillingSetup,
  year: number,
  month: string,
): GoogleBillingInvoice | null {
  const id = stringValue(invoice.id);
  if (!id) return null;

  return {
    id,
    invoiceType: stringValue(invoice.type),
    issueDate: stringValue(invoice.issueDate),
    dueDate: stringValue(invoice.dueDate),
    currency: stringValue(invoice.currencyCode),
    subtotal: microsToAmount(invoice.subtotalAmountMicros),
    tax: microsToAmount(invoice.taxAmountMicros),
    total: microsToAmount(invoice.totalAmountMicros),
    pdfAvailable: Boolean(stringValue(invoice.pdfUrl)),
    billingSetupId: setup.id,
    issueYear: year,
    issueMonth: month,
  };
}

function availabilityFromError(error: unknown): GoogleBillingOverview["availability"] {
  if (error instanceof GoogleBillingApiError && [401, 403].includes(error.statusCode)) {
    return "permission_required";
  }
  if (error instanceof GoogleBillingApiError && [400, 404].includes(error.statusCode)) {
    return "not_supported";
  }
  return "error";
}

function messageForBillingError(
  error: unknown,
  availability: GoogleBillingOverview["availability"],
): string {
  if (availability === "permission_required") {
    return "Google did not allow access to billing details for this account. Open Google Ads Billing to review access and payment settings.";
  }
  if (availability === "not_supported") {
    return "Google's Billing API did not return monthly-invoicing billing resources for this account. You can still review and manage its payment arrangement in Google Ads.";
  }
  return error instanceof Error
    ? error.message
    : "Google Ads billing information could not be loaded.";
}

export async function getGoogleBillingOverview(input: {
  userId: string;
  accountId: string;
  currency: string | null;
  dates: BillingDateRange;
}): Promise<GoogleBillingOverview> {
  const context = await getGoogleAdsCreationContext(input.userId, input.accountId);
  const [reportingResult, setupResult] = await Promise.allSettled([
    getGoogleReportingSpend(context, input.dates, input.currency),
    googleAdsSearch(context,
      "SELECT billing_setup.resource_name, billing_setup.id, billing_setup.status, " +
      "billing_setup.payments_account, billing_setup.payments_account_info.payments_account_id, " +
      "billing_setup.payments_account_info.payments_account_name, " +
      "billing_setup.payments_account_info.payments_profile_id, " +
      "billing_setup.payments_account_info.payments_profile_name, " +
      "billing_setup.start_date_time, billing_setup.end_date_time " +
      "FROM billing_setup ORDER BY billing_setup.start_date_time DESC",
    ),
  ]);

  const reporting: GoogleReportingSpendResult = reportingResult.status === "fulfilled"
    ? reportingResult.value
    : {
        amount: null,
        currency: input.currency,
        availability: "error",
        message: errorText(reportingResult.reason),
      };
  const currency = reporting.currencyIsMixed ? null : reporting.currency ?? input.currency;

  if (setupResult.status === "rejected") {
    const availability = availabilityFromError(setupResult.reason);
    return {
      availability,
      message: messageForBillingError(setupResult.reason, availability),
      currency,
      reportingSpend: reporting.amount,
      currencyIsMixed: reporting.currencyIsMixed ?? false,
      reportingSpendAvailability: reporting.availability,
      reportingSpendMessage: reporting.message,
      billingSetups: [],
      accountBudgets: [],
      invoices: [],
      invoicesAvailability: availability,
      invoicesMessage: messageForBillingError(setupResult.reason, availability),
      lastSyncedAt: new Date().toISOString(),
    };
  }

  const billingSetups = setupResult.value
    .map(billingSetupFromRow)
    .filter((setup): setup is GoogleBillingSetup => setup !== null);

  if (billingSetups.length === 0) {
    return {
      availability: "not_supported",
      message: "No monthly-invoicing billing setup was returned for this Google Ads account. Open Google Ads Billing to view or configure the account's available payment options.",
      currency,
      reportingSpend: reporting.amount,
      currencyIsMixed: reporting.currencyIsMixed ?? false,
      reportingSpendAvailability: reporting.availability,
      reportingSpendMessage: reporting.message,
      billingSetups: [],
      accountBudgets: [],
      invoices: [],
      invoicesAvailability: "not_supported",
      invoicesMessage: "Google invoice API history is available for eligible monthly-invoiced accounts only.",
      lastSyncedAt: new Date().toISOString(),
    };
  }

  let accountBudgets: GoogleAccountBudget[] = [];
  let budgetError: unknown = null;
  try {
    const budgetRows = await googleAdsSearch(
      context,
      "SELECT account_budget.resource_name, account_budget.id, account_budget.name, " +
      "account_budget.status, account_budget.billing_setup, " +
      "account_budget.approved_spending_limit_micros, " +
      "account_budget.proposed_spending_limit_micros, " +
      "account_budget.adjusted_spending_limit_micros, " +
      "account_budget.approved_start_date_time, account_budget.proposed_start_date_time, " +
      "account_budget.approved_end_date_time, account_budget.proposed_end_date_time " +
      "FROM account_budget ORDER BY account_budget.approved_start_date_time DESC",
    );
    accountBudgets = budgetRows
      .map((row) => accountBudgetFromRow(row, currency))
      .filter((budget): budget is GoogleAccountBudget => budget !== null);
  } catch (error) {
    budgetError = error;
  }

  const invoiceResults: GoogleBillingInvoice[] = [];
  let invoiceError: unknown = null;
  const issueMonths = getRecentIssueMonths(6);
  const invoiceJobs = billingSetups.slice(0, 3).flatMap((setup) =>
    issueMonths.map((period) => ({ setup, period })),
  );
  // Bound concurrency so a manager account with several billing setups does not
  // fan out an unrestricted burst of InvoiceService requests.
  for (let offset = 0; offset < invoiceJobs.length; offset += 3) {
    const batch = invoiceJobs.slice(offset, offset + 3);
    const batchResults = await Promise.all(batch.map(async ({ setup, period }) => {
      try {
        const invoices = await listGoogleInvoicesForMonth(
          context,
          setup,
          period.year,
          period.month,
        );
        return { setup, period, invoices, error: null as unknown };
      } catch (error) {
        return { setup, period, invoices: [] as UnknownRecord[], error };
      }
    }));

    for (const result of batchResults) {
      invoiceError = invoiceError ?? result.error;
      for (const invoice of result.invoices) {
        const mapped = invoiceFromRecord(
          invoice,
          result.setup,
          result.period.year,
          result.period.month,
        );
        if (mapped) invoiceResults.push(mapped);
      }
    }
  }

  const uniqueInvoices = new Map<string, GoogleBillingInvoice>();
  for (const invoice of invoiceResults) uniqueInvoices.set(invoice.id, invoice);

  const availability: GoogleBillingOverview["availability"] = budgetError
    ? availabilityFromError(budgetError)
    : "available";
  const invoicesAvailability: GoogleBillingOverview["invoicesAvailability"] = invoiceError
    ? availabilityFromError(invoiceError)
    : "available";

  return {
    availability,
    message: availability === "available"
      ? null
      : messageForBillingError(budgetError, availability),
    currency,
    reportingSpend: reporting.amount,
    currencyIsMixed: reporting.currencyIsMixed ?? false,
    reportingSpendAvailability: reporting.availability,
    reportingSpendMessage: reporting.message,
    billingSetups,
    accountBudgets,
    invoices: [...uniqueInvoices.values()].sort((a, b) =>
      (b.issueDate ?? "").localeCompare(a.issueDate ?? ""),
    ),
    invoicesAvailability,
    invoicesMessage: invoiceError
      ? messageForBillingError(invoiceError, invoicesAvailability)
      : uniqueInvoices.size === 0
        ? "No Google Ads invoices were returned for the recent six-month lookup. Invoice API history is available only for eligible monthly-invoiced accounts."
        : null,
    lastSyncedAt: new Date().toISOString(),
  };
}

async function getInvoicesForExactMonth(
  context: GoogleAdsContext,
  billingSetupId: string,
  year: number,
  month: string,
): Promise<UnknownRecord[]> {
  if (!/^\d+$/.test(billingSetupId)) {
    throw new Error("Invalid Google billing setup ID.");
  }
  if (!/^\d{4}$/.test(String(year)) || year < 2019) {
    throw new Error("Invalid Google invoice issue year.");
  }
  const monthUpper = month.toUpperCase();
  const allowedMonths = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
  ];
  if (!allowedMonths.includes(monthUpper)) {
    throw new Error("Invalid Google invoice issue month.");
  }

  const setup: GoogleBillingSetup = {
    id: billingSetupId,
    resourceName: `customers/${context.customerId}/billingSetups/${billingSetupId}`,
    status: null,
    paymentsAccountId: null,
    paymentsAccountName: null,
    paymentsProfileId: null,
    paymentsProfileName: null,
    startDateTime: null,
    endDateTime: null,
  };
  return listGoogleInvoicesForMonth(context, setup, year, monthUpper);
}

export async function downloadGoogleBillingInvoice(input: {
  userId: string;
  accountId: string;
  invoiceId: string;
  billingSetupId: string;
  issueYear: number;
  issueMonth: string;
}): Promise<{ bytes: Uint8Array; filename: string; contentType: string }> {
  const context = await getGoogleAdsCreationContext(input.userId, input.accountId);
  const invoices = await getInvoicesForExactMonth(
    context,
    input.billingSetupId,
    input.issueYear,
    input.issueMonth,
  );
  const invoice = invoices.find((entry) => stringValue(entry.id) === input.invoiceId);
  if (!invoice) throw new Error("Invoice was not found for this Google Ads account.");

  const pdfUrl = stringValue(invoice.pdfUrl);
  if (!pdfUrl) throw new Error("Google did not provide a PDF for this invoice.");

  const url = new URL(pdfUrl);
  const hostAllowed = ["googleapis.com", "google.com", "googleusercontent.com"].some(
    (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
  ) || url.hostname === "storage.googleapis.com";
  if (url.protocol !== "https:" || !hostAllowed) {
    throw new Error("Google returned an unexpected invoice download host.");
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${context.accessToken}` },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    throw new Error(`Google invoice download failed with HTTP ${response.status}.`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 25 * 1024 * 1024) {
    throw new Error("Google returned an invalid invoice file size.");
  }
  const contentType = response.headers.get("content-type")?.split(";")[0] || "application/pdf";
  if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
    throw new Error("Google returned a file that is not a PDF invoice.");
  }

  return {
    bytes,
    filename: `google-ads-invoice-${input.invoiceId}.pdf`,
    contentType: "application/pdf",
  };
}
