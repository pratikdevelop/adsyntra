import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";

import AdAccountModel from "../models/ad-account.model.js";
import { getUserConnection } from "../utils/connection-storage.utils.js";
import {
  downloadGoogleBillingInvoice,
  getGoogleBillingOverview,
  type BillingDateRange,
} from "../googleadsAPI/services/billing.service.js";
import {
  downloadMetaBillingInvoice,
  getMetaBillingOverview,
} from "../metaadsAPI/services/billing.service.js";

const router = Router();

type ProviderKey = "googleAds" | "metaAds";
type RangeKey = "7d" | "30d" | "90d";
type BillingAvailability = "available" | "not_supported" | "permission_required" | "error";

interface AccountSummary {
  id: string;
  name: string;
  currency: string | null;
  timezone: string | null;
  status: string;
  isSelected: boolean;
}

function getAuthenticatedUserId(req: Request): string | null {
  const auth = getAuth(req);
  return auth.isAuthenticated && auth.userId ? auth.userId : null;
}

function isRangeKey(value: unknown): value is RangeKey {
  return value === "7d" || value === "30d" || value === "90d";
}

function getDateRange(range: RangeKey): BillingDateRange {
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const today = new Date();
  const start = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return {
    since: start.toISOString().slice(0, 10),
    until: today.toISOString().slice(0, 10),
  };
}

function queryString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  // Provider error messages are useful for diagnosing missing permissions and
  // configuration, but never return serialized API payloads or credentials.
  return error.message.slice(0, 500);
}

function availabilityForError(error: unknown): BillingAvailability {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/permission|not authorized|access denied|insufficient.*scope|reconnect/.test(message)) {
    return "permission_required";
  }
  return "error";
}

function toAccountSummary(account: {
  externalAccountId: string;
  name: string;
  currency?: string;
  timezone?: string;
  status: string;
  isSelected: boolean;
}): AccountSummary {
  return {
    id: account.externalAccountId,
    name: account.name,
    currency: account.currency ?? null,
    timezone: account.timezone ?? null,
    status: account.status,
    isSelected: account.isSelected,
  };
}


async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function getOwnedAccount(
  userId: string,
  provider: ProviderKey,
  externalAccountId: string,
) {
  return AdAccountModel.findOne({
    userId,
    provider,
    externalAccountId,
  })
    .select("externalAccountId name currency timezone status isSelected")
    .lean()
    .exec();
}

router.get("/", async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }
  res.setHeader("Cache-Control", "private, no-store");

  const requestedRange = queryString(req.query.range) ?? "30d";
  if (!isRangeKey(requestedRange)) {
    return res.status(400).json({
      success: false,
      message: "range must be one of: 7d, 30d, 90d.",
    });
  }

  const requestedGoogleId = queryString(req.query.googleAccountId);
  const requestedMetaId = queryString(req.query.metaAccountId);

  try {
    const [connection, googleAccountsRaw, metaAccountsRaw] = await Promise.all([
      getUserConnection(userId),
      AdAccountModel.find({ userId, provider: "googleAds" })
        .select("externalAccountId name currency timezone status isSelected")
        .sort({ isSelected: -1, name: 1 })
        .lean()
        .exec(),
      AdAccountModel.find({ userId, provider: "metaAds" })
        .select("externalAccountId name currency timezone status isSelected")
        .sort({ isSelected: -1, name: 1 })
        .lean()
        .exec(),
    ]);

    const defaultGoogleId = googleAccountsRaw.find((account) => account.isSelected)?.externalAccountId ??
      googleAccountsRaw[0]?.externalAccountId ?? null;
    const defaultMetaId = metaAccountsRaw.find((account) => account.isSelected)?.externalAccountId ??
      metaAccountsRaw[0]?.externalAccountId ?? null;
    const googleAccountId = requestedGoogleId && requestedGoogleId !== "all" ? requestedGoogleId : defaultGoogleId;
    const metaAccountId = requestedMetaId && requestedMetaId !== "all" ? requestedMetaId : defaultMetaId;

    const googleAccount = googleAccountId
      ? googleAccountsRaw.find((account) => account.externalAccountId === googleAccountId)
      : undefined;
    const metaAccount = metaAccountId
      ? metaAccountsRaw.find((account) => account.externalAccountId === metaAccountId)
      : undefined;

    // The special `all` selector is accepted only as a selector, never as an
    // account ID. Specific IDs are checked against the signed-in user's rows.
    if (requestedGoogleId && requestedGoogleId !== "all" && !googleAccount) {
      return res.status(404).json({ success: false, message: "Google Ads account not found for this user." });
    }
    if (requestedMetaId && requestedMetaId !== "all" && !metaAccount) {
      return res.status(404).json({ success: false, message: "Meta Ads account not found for this user." });
    }

    const dates = getDateRange(requestedRange);
    const googleConnected = Boolean(connection?.providers.googleAds.connected);
    const metaConnected = Boolean(connection?.providers.metaAds.connected);
    const googleTargets = requestedGoogleId === "all" ? googleAccountsRaw : googleAccount ? [googleAccount] : [];
    const metaTargets = requestedMetaId === "all" ? metaAccountsRaw : metaAccount ? [metaAccount] : [];

    const [googleAccountsData, metaAccountsData] = await Promise.all([
      googleConnected
        ? mapWithConcurrency(googleTargets, 2, async (account) => {
            try {
              const billing = await getGoogleBillingOverview({
                userId,
                accountId: account.externalAccountId,
                currency: account.currency ?? null,
                dates,
              });
              return { account: toAccountSummary(account), status: billing.availability === "error" ? "error" : "connected", billing };
            } catch (error) {
              console.error(`Google Ads billing request failed for ${account.externalAccountId}:`, error);
              return {
                account: toAccountSummary(account),
                status: "error",
                billing: {
                  availability: availabilityForError(error),
                  message: safeErrorMessage(error, "Google Ads billing information could not be loaded."),
                  currency: account.currency ?? null,
                  reportingSpend: null,
                  reportingSpendAvailability: "error" as const,
                  reportingSpendMessage: safeErrorMessage(error, "Google Ads reporting data could not be loaded."),
                  billingSetups: [],
                  accountBudgets: [],
                  invoices: [],
                  invoicesAvailability: "error" as const,
                  invoicesMessage: "Google invoice history could not be loaded.",
                  lastSyncedAt: new Date().toISOString(),
                },
              };
            }
          })
        : Promise.resolve([]),
      metaConnected
        ? mapWithConcurrency(metaTargets, 2, async (account) => {
            try {
              const billing = await getMetaBillingOverview({ userId, accountId: account.externalAccountId, dates });
              return { account: toAccountSummary(account), status: billing.availability === "error" ? "error" : "connected", billing };
            } catch (error) {
              console.error(`Meta Ads billing request failed for ${account.externalAccountId}:`, error);
              return {
                account: toAccountSummary(account),
                status: "error",
                billing: {
                  availability: availabilityForError(error),
                  message: safeErrorMessage(error, "Meta Ads billing information could not be loaded."),
                  currency: account.currency ?? null,
                  accountStatus: { code: null, label: "Unknown" },
                  paymentArrangement: "unknown" as const,
                  balance: null,
                  balanceLabel: "Balance unavailable",
                  amountSpentLifetimeOrCap: null,
                  spendCap: null,
                  periodSpend: null,
                  periodSpendAvailability: "error" as const,
                  periodSpendMessage: safeErrorMessage(error, "Meta Ads reporting data could not be loaded."),
                  paymentMethod: { availability: "not_available" as const, displayString: null, type: null },
                  tax: { availability: "not_available" as const, taxId: null, taxIdStatus: null },
                  business: null,
                  invoicesAvailability: "error" as const,
                  invoicesMessage: "Meta invoice information could not be loaded.",
                  invoices: [],
                  lastSyncedAt: new Date().toISOString(),
                },
              };
            }
          })
        : Promise.resolve([]),
    ]);

    const selectedGoogleData = googleAccountsData.find((entry) => entry.account.id === googleAccountId) ?? null;
    const selectedMetaData = metaAccountsData.find((entry) => entry.account.id === metaAccountId) ?? null;

    return res.status(200).json({
      success: true,
      range: { key: requestedRange, ...dates },
      accounts: {
        googleAds: {
          connected: googleConnected,
          selectedAccountId: googleAccountId,
          allSelected: requestedGoogleId === "all",
          items: googleAccountsRaw.map(toAccountSummary),
        },
        metaAds: {
          connected: metaConnected,
          selectedAccountId: metaAccountId,
          allSelected: requestedMetaId === "all",
          items: metaAccountsRaw.map(toAccountSummary),
        },
      },
      providers: {
        googleAds: {
          status: !googleConnected ? "not_connected" : !googleAccount ? "no_account" : selectedGoogleData?.status ?? "error",
          account: selectedGoogleData?.account ?? (googleAccount ? toAccountSummary(googleAccount) : null),
          billing: selectedGoogleData?.billing ?? null,
          accounts: googleAccountsData,
        },
        metaAds: {
          status: !metaConnected ? "not_connected" : !metaAccount ? "no_account" : selectedMetaData?.status ?? "error",
          account: selectedMetaData?.account ?? (metaAccount ? toAccountSummary(metaAccount) : null),
          billing: selectedMetaData?.billing ?? null,
          accounts: metaAccountsData,
        },
      },
    });
  } catch (error) {
    console.error("Billing dashboard request failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load billing information right now.",
    });
  }
});

router.get("/google/:accountId/invoices/:invoiceId/download", async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });

  const accountId = String(req.params.accountId);
  const invoiceId = String(req.params.invoiceId);
  const billingSetupId = queryString(req.query.billingSetupId);
  const issueYear = Number(req.query.issueYear);
  const issueMonth = queryString(req.query.issueMonth);

  if (!/^\d+$/.test(accountId) || !/^[A-Za-z0-9._-]{1,128}$/.test(invoiceId) || !billingSetupId || !issueMonth ||
      !Number.isInteger(issueYear) || issueYear < 2019) {
    return res.status(400).json({ success: false, message: "Invalid Google invoice download parameters." });
  }

  try {
    const account = await getOwnedAccount(userId, "googleAds", accountId);
    if (!account) return res.status(404).json({ success: false, message: "Google Ads account not found." });

    const file = await downloadGoogleBillingInvoice({
      userId,
      accountId,
      invoiceId,
      billingSetupId,
      issueYear,
      issueMonth,
    });
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(Buffer.from(file.bytes));
  } catch (error) {
    console.error("Google invoice download failed:", error);
    return res.status(502).json({
      success: false,
      message: safeErrorMessage(error, "Google invoice could not be downloaded."),
    });
  }
});

router.get("/meta/:accountId/invoices/:invoiceId/download", async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });

  const accountId = String(req.params.accountId);
  const invoiceId = String(req.params.invoiceId);
  const businessId = queryString(req.query.businessId);

  if (!/^(?:act_)?\d+$/.test(accountId) || !/^\d+$/.test(invoiceId) || !businessId) {
    return res.status(400).json({ success: false, message: "Invalid Meta invoice download parameters." });
  }

  try {
    const account = await getOwnedAccount(userId, "metaAds", accountId);
    if (!account) return res.status(404).json({ success: false, message: "Meta Ads account not found." });

    const file = await downloadMetaBillingInvoice({ userId, accountId, businessId, invoiceId });
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(Buffer.from(file.bytes));
  } catch (error) {
    console.error("Meta invoice download failed:", error);
    return res.status(502).json({
      success: false,
      message: safeErrorMessage(error, "Meta invoice could not be downloaded."),
    });
  }
});

export default router;