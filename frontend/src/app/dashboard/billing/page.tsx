"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Select,
  TablePagination,
  TextField,
  InputAdornment,
  type SelectChangeEvent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import GoogleIcon from "@mui/icons-material/Google";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import FacebookRoundedIcon from "@mui/icons-material/FacebookRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";

import { authenticatedApiRequest } from "@/lib/api";

type RangeOption = "7d" | "30d" | "90d";
type ProviderKey = "googleAds" | "metaAds";
type BillingAvailability = "available" | "not_supported" | "permission_required" | "error";
type ProviderStatus = "connected" | "not_connected" | "no_account" | "error";

type AccountSummary = {
  id: string;
  name: string;
  currency: string | null;
  timezone: string | null;
  status: string;
  isSelected: boolean;
};

type GoogleBillingSetup = {
  id: string;
  resourceName: string;
  status: string | null;
  paymentsAccountId: string | null;
  paymentsAccountName: string | null;
  paymentsProfileId: string | null;
  paymentsProfileName: string | null;
  startDateTime: string | null;
  endDateTime: string | null;
};

type GoogleAccountBudget = {
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
};

type GoogleInvoice = {
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
};

type SpendTrendPoint = { date: string; amount: number };
type SpendTrendAvailability = "available" | "no_data" | "permission_required" | "error";

type GoogleBilling = {
  availability: BillingAvailability;
  message: string | null;
  currency: string | null;
  reportingSpend: number | null;
  currencyIsMixed?: boolean;
  reportingSpendAvailability: "available" | "no_data" | "permission_required" | "error";
  reportingSpendMessage: string | null;
  spendTrend: SpendTrendPoint[];
  spendTrendAvailability: SpendTrendAvailability;
  spendTrendMessage: string | null;
  billingSetups: GoogleBillingSetup[];
  accountBudgets: GoogleAccountBudget[];
  invoices: GoogleInvoice[];
  invoicesAvailability: BillingAvailability;
  invoicesMessage: string | null;
  lastSyncedAt: string;
};

type MetaInvoice = {
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
};

type MetaBilling = {
  availability: BillingAvailability;
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
  spendTrend: SpendTrendPoint[];
  spendTrendAvailability: SpendTrendAvailability;
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
  invoicesAvailability: BillingAvailability;
  invoicesMessage: string | null;
  invoices: MetaInvoice[];
  lastSyncedAt: string;
};

type ProviderAccountData<T> = {
  account: AccountSummary;
  status: ProviderStatus;
  billing: T;
};

type ProviderData<T> = {
  status: ProviderStatus;
  account: AccountSummary | null;
  billing: T | null;
  accounts: ProviderAccountData<T>[];
};

type MetaBillingActivity = {
  id: string;
  eventType: string;
  title: string;
  description: string;
  eventTime: string | null;
  accountTime: string | null;
  actorName: string | null;
  objectName: string | null;
  objectType: string | null;
};

type MetaActivityAccount = {
  account: AccountSummary;
  availability: "available" | "not_supported" | "permission_required" | "error";
  message: string | null;
  activities: MetaBillingActivity[];
  truncated: boolean;
  lastSyncedAt: string;
};

type MetaActivitiesResponse = {
  success: boolean;
  connected: boolean;
  range: { key: RangeOption; since: string; until: string };
  accounts: MetaActivityAccount[];
  message?: string;
};

type UnifiedBillingActivity = {
  id: string;
  provider: ProviderKey;
  accountId: string;
  accountName: string;
  title: string;
  description: string;
  eventType: string;
  eventTime: string | null;
  actorName: string | null;
  sourceLabel: string;
};

type BillingAlertItem = {
  id: string;
  provider: ProviderKey;
  accountId: string;
  accountName: string;
  title: string;
  message: string;
  severity: "error" | "warning" | "info";
  createdAt: string | null;
};

type BillingResponse = {
  success: boolean;
  message?: string;
  range: { key: RangeOption; since: string; until: string };
  accounts: {
    googleAds: { connected: boolean; selectedAccountId: string | null; allSelected: boolean; items: AccountSummary[] };
    metaAds: { connected: boolean; selectedAccountId: string | null; allSelected: boolean; items: AccountSummary[] };
  };
  providers: {
    googleAds: ProviderData<GoogleBilling>;
    metaAds: ProviderData<MetaBilling>;
  };
};

type UnifiedInvoice = {
  provider: ProviderKey;
  id: string;
  invoiceNumber: string;
  billingPeriod: string;
  issueDate: string | null;
  dueDate: string | null;
  amount: number | null;
  amountDue: number | null;
  subtotal: number | null;
  tax: number | null;
  amountLabel: "Invoice total" | "Amount due";
  currency: string | null;
  status: string | null;
  invoiceType: string | null;
  accountName: string;
  accountId: string;
  accountIds: string[];
  businessId: string | null;
  downloadAvailable: boolean;
  downloadPath: string | null;
};

const ALL_ACCOUNTS = "__all__";
const GOOGLE_BILLING_URL = "https://ads.google.com/aw/billing/summary";
const META_BILLING_URL = "https://business.facebook.com/billing_hub/";

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createDemoSpendTrend(range: RangeOption, periodTotal: number, seed: number): SpendTrendPoint[] {
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const today = new Date();
  const weights = Array.from({ length: days }, (_, index) =>
    0.72 + ((index * 7 + seed * 11) % 13) / 20 + (Math.sin(index * 0.63 + seed) + 1) * 0.11,
  );
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  return weights.map((weight, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (days - index - 1));
    return {
      date: localDateString(date),
      amount: Number((periodTotal * weight / weightTotal).toFixed(2)),
    };
  });
}

function createDemoBillingResponse(range: RangeOption): BillingResponse {
  const now = new Date();
  const rangeDays = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const since = new Date(now);
  since.setDate(since.getDate() - (rangeDays - 1));
  const issuedRecently = new Date(now);
  issuedRecently.setDate(issuedRecently.getDate() - 8);
  const issuedEarlier = new Date(now);
  issuedEarlier.setDate(issuedEarlier.getDate() - 36);
  const dueSoon = new Date(now);
  dueSoon.setDate(dueSoon.getDate() + 7);
  const syncedAt = now.toISOString();

  const googleAccounts: AccountSummary[] = [
    { id: "demo-google-8229327311", name: "Northstar Fashion Store", currency: "INR", timezone: "Asia/Kolkata", status: "active", isSelected: true },
    { id: "demo-google-1802289931", name: "Urban Tech Solutions", currency: "INR", timezone: "Asia/Kolkata", status: "active", isSelected: false },
  ];
  const metaAccounts: AccountSummary[] = [
    { id: "act_demo_1820194389321017", name: "Northstar Fashion – Meta", currency: "INR", timezone: "Asia/Kolkata", status: "active", isSelected: true },
    { id: "act_demo_2249899152233723", name: "Urban Tech – Meta", currency: "INR", timezone: "Asia/Kolkata", status: "active", isSelected: false },
  ];

  const googleBilling: GoogleBilling[] = [
    {
      availability: "available", message: null, currency: "INR", reportingSpend: 24500.75,
      currencyIsMixed: false, reportingSpendAvailability: "available", reportingSpendMessage: null,
      spendTrend: createDemoSpendTrend(range, 24500.75, 1), spendTrendAvailability: "available", spendTrendMessage: null,
      billingSetups: [{ id: "demo-setup-001", resourceName: "demo/billingSetups/001", status: "APPROVED", paymentsAccountId: "DEMO-4211-3373", paymentsAccountName: "Northstar Payments", paymentsProfileId: "DEMO-2999-8499", paymentsProfileName: "Northstar Finance", startDateTime: localDateString(issuedEarlier), endDateTime: null }],
      accountBudgets: [{ id: "demo-budget-001", name: "Northstar monthly account budget", status: "APPROVED", billingSetup: "demo/billingSetups/001", approvedSpendingLimit: 150000, adjustedSpendingLimit: 150000, proposedSpendingLimit: null, currency: "INR", startDateTime: localDateString(issuedEarlier), endDateTime: null }],
      invoices: [
        { id: "DEMO-G-2026-001", invoiceType: "MONTHLY", issueDate: localDateString(issuedRecently), dueDate: localDateString(dueSoon), currency: "INR", subtotal: 12000, tax: 2160, total: 14160, pdfAvailable: false, billingSetupId: "demo-setup-001", issueYear: issuedRecently.getFullYear(), issueMonth: issuedRecently.toLocaleString("en", { month: "long" }).toUpperCase() },
        { id: "DEMO-G-2026-002", invoiceType: "MONTHLY", issueDate: localDateString(issuedEarlier), dueDate: localDateString(issuedRecently), currency: "INR", subtotal: 9800, tax: 1764, total: 11564, pdfAvailable: false, billingSetupId: "demo-setup-001", issueYear: issuedEarlier.getFullYear(), issueMonth: issuedEarlier.toLocaleString("en", { month: "long" }).toUpperCase() },
      ],
      invoicesAvailability: "available", invoicesMessage: null, lastSyncedAt: syncedAt,
    },
    {
      availability: "available", message: null, currency: "INR", reportingSpend: 18200.25,
      currencyIsMixed: false, reportingSpendAvailability: "available", reportingSpendMessage: null,
      spendTrend: createDemoSpendTrend(range, 18200.25, 2), spendTrendAvailability: "available", spendTrendMessage: null,
      billingSetups: [{ id: "demo-setup-002", resourceName: "demo/billingSetups/002", status: "APPROVED", paymentsAccountId: "DEMO-5531-1122", paymentsAccountName: "Urban Tech Payments", paymentsProfileId: "DEMO-5544-7788", paymentsProfileName: "Urban Tech Finance", startDateTime: localDateString(issuedEarlier), endDateTime: null }],
      accountBudgets: [{ id: "demo-budget-002", name: "Urban Tech account budget", status: "APPROVED", billingSetup: "demo/billingSetups/002", approvedSpendingLimit: 100000, adjustedSpendingLimit: 100000, proposedSpendingLimit: null, currency: "INR", startDateTime: localDateString(issuedEarlier), endDateTime: null }],
      invoices: [{ id: "DEMO-G-2026-003", invoiceType: "MONTHLY", issueDate: localDateString(issuedRecently), dueDate: localDateString(dueSoon), currency: "INR", subtotal: 8000, tax: 1440, total: 9440, pdfAvailable: false, billingSetupId: "demo-setup-002", issueYear: issuedRecently.getFullYear(), issueMonth: issuedRecently.toLocaleString("en", { month: "long" }).toUpperCase() }],
      invoicesAvailability: "available", invoicesMessage: null, lastSyncedAt: syncedAt,
    },
  ];

  const metaBilling: MetaBilling[] = [
    {
      availability: "available", message: null, currency: "INR", accountStatus: { code: 1, label: "Active" },
      paymentArrangement: "postpay", balance: 425.5, balanceLabel: "Amount due", amountSpentLifetimeOrCap: 184500,
      spendCap: 250000, periodSpend: 32800.5, periodSpendAvailability: "available", periodSpendMessage: null,
      spendTrend: createDemoSpendTrend(range, 32800.5, 3), spendTrendAvailability: "available", spendTrendMessage: null,
      paymentMethod: { availability: "available", displayString: "Visa •••• 4242 (demo)", type: "CARD" },
      tax: { availability: "available", taxId: "••••••••1234", taxIdStatus: 1 },
      business: { id: "900000000000001", name: "Northstar Demo Business" },
      invoicesAvailability: "available", invoicesMessage: null,
      invoices: [{ id: "DEMO-M-2026-001", invoiceNumber: "DEMO-M-2026-001", invoiceDate: localDateString(issuedRecently), billingPeriod: "Current demo billing period", dueDate: localDateString(dueSoon), paymentStatus: "PENDING", amountDue: 425.5, amount: 14160, currency: "INR", invoiceType: "MONTHLY", downloadAvailable: false, businessId: "900000000000001" }],
      lastSyncedAt: syncedAt,
    },
    {
      availability: "available", message: null, currency: "INR", accountStatus: { code: 1, label: "Active" },
      paymentArrangement: "prepaid", balance: 12500, balanceLabel: "Balance reported by Meta", amountSpentLifetimeOrCap: 87500,
      spendCap: 100000, periodSpend: 15600.25, periodSpendAvailability: "available", periodSpendMessage: null,
      spendTrend: createDemoSpendTrend(range, 15600.25, 4), spendTrendAvailability: "available", spendTrendMessage: null,
      paymentMethod: { availability: "available", displayString: "Prepaid funds (demo)", type: "PREPAID" },
      tax: { availability: "not_available", taxId: null, taxIdStatus: null },
      business: { id: "900000000000002", name: "Urban Tech Demo Business" },
      invoicesAvailability: "not_supported", invoicesMessage: "Demo example: this account does not expose monthly invoice records.", invoices: [],
      lastSyncedAt: syncedAt,
    },
  ];

  return {
    success: true,
    range: { key: range, since: localDateString(since), until: localDateString(now) },
    accounts: {
      googleAds: { connected: true, selectedAccountId: googleAccounts[0]!.id, allSelected: true, items: googleAccounts },
      metaAds: { connected: true, selectedAccountId: metaAccounts[0]!.id, allSelected: true, items: metaAccounts },
    },
    providers: {
      googleAds: {
        status: "connected", account: googleAccounts[0]!, billing: googleBilling[0]!,
        accounts: googleAccounts.map((account, index) => ({ account, status: "connected" as const, billing: googleBilling[index]! })),
      },
      metaAds: {
        status: "connected", account: metaAccounts[0]!, billing: metaBilling[0]!,
        accounts: metaAccounts.map((account, index) => ({ account, status: "connected" as const, billing: metaBilling[index]! })),
      },
    },
  };
}

function formatMoney(value: number | null | undefined, currency: string | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Not available";
  if (!currency || !/^[A-Z]{3}$/.test(currency)) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
}

function escapePdfText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function createDemoInvoicePdf(invoice: UnifiedInvoice): Blob {
  const currency = invoice.currency ?? "INR";
  const money = (value: number | null) =>
    value === null ? "Not provided" : `${currency} ${value.toFixed(2)}`;
  const rows = [
    "DEMO SAMPLE - NOT A REAL PROVIDER INVOICE",
    "ADSyntra | Billing Preview",
    "",
    `Provider: ${providerLabel(invoice.provider)}`,
    `Account: ${invoice.accountName}`,
    `Account ID: ${invoice.accountIds.join(", ")}`,
    `Invoice number: ${invoice.invoiceNumber}`,
    `Billing period: ${invoice.billingPeriod}`,
    `Issue date: ${invoice.issueDate ?? "Not provided"}`,
    `Due date: ${invoice.dueDate ?? "Not provided"}`,
    `Invoice type: ${invoice.invoiceType ?? "Not provided"}`,
    `Payment status: ${invoice.status ?? "Not provided by provider"}`,
    "",
    `Subtotal: ${money(invoice.subtotal)}`,
    `Tax: ${money(invoice.tax)}`,
    `Invoice total: ${money(invoice.amount)}`,
    `Amount due: ${money(invoice.amountDue)}`,
    "",
    "This file is generated by AdSyntra for demonstration purposes only.",
    "It is not issued by Google, Meta, or any payment provider.",
    "It is not a tax invoice, payment demand, or proof of payment.",
  ];

  const commands = [
    "q",
    "0.88 g",
    "BT",
    "/F1 66 Tf",
    "0.707 0.707 -0.707 0.707 190 365 Tm",
    "(DEMO) Tj",
    "ET",
    "Q",
    "0 g",
    "BT",
    "/F1 17 Tf",
    "50 790 Td",
  ];
  rows.forEach((row, index) => {
    if (index === 1) commands.push("/F1 12 Tf");
    if (index === 2 || index === 13) commands.push("/F1 10 Tf");
    if (index === 0) commands.push("/F1 15 Tf");
    commands.push(`(${escapePdfText(row)}) Tj`);
    if (index < rows.length - 1) commands.push("0 -27 Td");
  });
  commands.push("ET");

  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not synced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function providerLabel(provider: ProviderKey): string {
  return provider === "googleAds" ? "Google Ads" : "Meta Ads";
}

function availabilityLabel(availability: BillingAvailability | undefined): string {
  if (availability === "available") return "Available";
  if (availability === "not_supported") return "Not available for this billing type";
  if (availability === "permission_required") return "Permission required";
  return "Could not load";
}

function StatusChip({ status }: { status: string | null | undefined }) {
  const normalized = (status ?? "").toLowerCase();
  const color = normalized.includes("active") || normalized.includes("approved") || normalized === "paid" || normalized === "connected"
    ? "success"
    : normalized.includes("pending") || normalized.includes("partial")
      ? "warning"
      : normalized.includes("cancel") || normalized.includes("declin") || normalized.includes("unsettled") || normalized.includes("disabled")
        ? "error"
        : "default";
  return <Chip size="small" label={status || "Unknown"} color={color} variant={color === "default" ? "outlined" : "filled"} />;
}

function SectionTitle({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      {eyebrow && <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{eyebrow}</p>}
      <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
      {subtitle && <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p>}
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  icon,
  accent = "indigo",
}: {
  title: string;
  value: string;
  description: string;
  icon: ReactNode;
  accent?: "indigo" | "blue" | "violet" | "emerald";
}) {
  const accentClass = {
    indigo: "bg-indigo-50 text-indigo-600",
    blue: "bg-sky-50 text-sky-600",
    violet: "bg-violet-50 text-violet-600",
    emerald: "bg-emerald-50 text-emerald-600",
  }[accent];
  return (
    <Card variant="outlined" className="h-full rounded-2xl border-slate-200 bg-white shadow-[0_3px_14px_rgba(15,23,42,0.035)]" sx={{ borderRadius: 3 }}>
      <CardContent className="!p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-slate-600">{title}</p>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accentClass}`}>{icon}</div>
        </div>
        <p className="mt-4 text-[26px] font-bold tracking-tight text-slate-950">{value}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </CardContent>
    </Card>
  );
}

type SpendAnalyticsPoint = {
  date: string;
  googleSpend: number | null;
  metaSpend: number | null;
};

type SpendAnalyticsCardProps = {
  currency: string;
  timezone: string | null;
  points: SpendAnalyticsPoint[];
  googleTotal: number | null;
  metaTotal: number | null;
  googleAccountCount: number;
  metaAccountCount: number;
  providerFilter?: ProviderKey;
};

function buildSpendLinePath(
  points: SpendAnalyticsPoint[],
  key: "googleSpend" | "metaSpend",
  minTime: number,
  maxTime: number,
  maxValue: number,
): string[] {
  const left = 58;
  const right = 878;
  const top = 18;
  const bottom = 218;
  const span = Math.max(1, maxTime - minTime);
  const paths: string[] = [];
  let current = "";
  let previousTime: number | null = null;
  for (const point of points) {
    const value = point[key];
    if (value === null || !Number.isFinite(value)) {
      if (current) paths.push(current);
      current = "";
      previousTime = null;
      continue;
    }
    const time = new Date(`${point.date}T12:00:00Z`).getTime();
    if (!Number.isFinite(time)) continue;
    const x = left + ((time - minTime) / span) * (right - left);
    const y = bottom - (value / maxValue) * (bottom - top);
    const isConsecutive = previousTime !== null && time - previousTime <= 86_400_000 * 1.5;
    current += `${current && isConsecutive ? " L" : " M"}${x.toFixed(1)},${y.toFixed(1)}`;
    if (current.startsWith(" ")) current = current.trimStart();
    previousTime = time;
  }
  if (current) paths.push(current);
  return paths;
}

function SpendAnalyticsCard({
  currency,
  timezone,
  points,
  googleTotal,
  metaTotal,
  googleAccountCount,
  metaAccountCount,
  providerFilter,
}: SpendAnalyticsCardProps) {
  const datedPoints = points
    .map((point) => ({ ...point, time: new Date(`${point.date}T12:00:00Z`).getTime() }))
    .filter((point) => Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);
  const minTime = datedPoints[0]?.time ?? Date.now();
  const maxTime = datedPoints[datedPoints.length - 1]?.time ?? minTime + 86_400_000;
  const values = datedPoints.flatMap((point) => [point.googleSpend, point.metaSpend]).filter((value): value is number => value !== null && Number.isFinite(value));
  const maxValue = Math.max(1, ...values) * 1.15;
  const googlePaths = providerFilter === "metaAds" ? [] : buildSpendLinePath(datedPoints, "googleSpend", minTime, maxTime, maxValue);
  const metaPaths = providerFilter === "googleAds" ? [] : buildSpendLinePath(datedPoints, "metaSpend", minTime, maxTime, maxValue);
  const googleHasPoints = datedPoints.some((point) => point.googleSpend !== null) && providerFilter !== "metaAds";
  const metaHasPoints = datedPoints.some((point) => point.metaSpend !== null) && providerFilter !== "googleAds";
  const maxLabel = formatMoney(maxValue / 1.15, currency);
  const monthTotals = new Map<string, { google: number | null; meta: number | null }>();
  for (const point of datedPoints) {
    const month = point.date.slice(0, 7);
    const entry = monthTotals.get(month) ?? { google: null, meta: null };
    if (point.googleSpend !== null && providerFilter !== "metaAds") entry.google = (entry.google ?? 0) + point.googleSpend;
    if (point.metaSpend !== null && providerFilter !== "googleAds") entry.meta = (entry.meta ?? 0) + point.metaSpend;
    monthTotals.set(month, entry);
  }
  const monthlyRows = [...monthTotals.entries()].sort(([a], [b]) => a.localeCompare(b));
  const monthlyMax = Math.max(1, ...monthlyRows.flatMap(([, totals]) => [totals.google, totals.meta].filter((value): value is number => value !== null)));
  const hasAnySeries = googleHasPoints || metaHasPoints;

  return (
    <Card variant="outlined" className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-[0_3px_16px_rgba(15,23,42,0.04)]" sx={{ borderRadius: 3 }}>
      <CardContent className="!p-5 md:!p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Advertising analytics</p>
            <h2 className="mt-1 text-base font-bold text-slate-900">Daily spend trend <span className="text-slate-400">· {currency}</span></h2>
            <p className="mt-1 text-xs text-slate-500">Account time zone: {timezone || "Not provided"}. Daily amounts returned by provider reporting APIs; missing dates remain blank, not zero.</p>
          </div>
          <Chip size="small" variant="outlined" label="Provider reporting data" />
        </div>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {providerFilter !== "metaAds" && <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600"><GoogleIcon sx={{ color: "#4285F4", fontSize: 17 }} /> Google Ads · {googleAccountCount} account(s)</div>
            <p className="mt-2 text-lg font-bold text-slate-950">{googleTotal === null ? "Not available" : formatMoney(googleTotal, currency)}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">Sum of charted daily rows</p>
          </div>}
          {providerFilter !== "googleAds" && <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600"><FacebookRoundedIcon sx={{ color: "#7c3aed", fontSize: 17 }} /> Meta Ads · {metaAccountCount} account(s)</div>
            <p className="mt-2 text-lg font-bold text-slate-950">{metaTotal === null ? "Not available" : formatMoney(metaTotal, currency)}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">Sum of charted daily rows</p>
          </div>}
        </div>
        {!hasAnySeries ? (
          <div className="flex min-h-[230px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
            <TrendingUpRoundedIcon sx={{ color: "#94a3b8", fontSize: 30 }} />
            <p className="mt-2 text-sm font-semibold text-slate-700">Daily spend data is not available</p>
            <p className="mt-1 max-w-lg text-xs leading-5 text-slate-500">No chart values are fabricated. Check each account's reporting availability or select another reporting period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <svg viewBox="0 0 920 270" role="img" aria-label={`Daily advertising spend trend in ${currency}`} className="h-[250px] min-w-[620px] w-full">
              {[0, 1, 2, 3, 4].map((step) => {
                const y = 218 - step * 50;
                const value = maxValue * step / 4;
                return <g key={step}>
                  <line x1="58" x2="878" y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 5" />
                  <text x="48" y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</text>
                </g>;
              })}
              {googlePaths.map((path, index) => <path key={`g-${index}`} d={path} fill="none" stroke="#4285F4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}
              {metaPaths.map((path, index) => <path key={`m-${index}`} d={path} fill="none" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}
              {datedPoints.map((point) => {
                const x = 58 + ((point.time - minTime) / Math.max(1, maxTime - minTime)) * 820;
                const googleY = point.googleSpend === null ? null : 218 - (point.googleSpend / maxValue) * 200;
                const metaY = point.metaSpend === null ? null : 218 - (point.metaSpend / maxValue) * 200;
                return <g key={point.date}>
                  {googleY !== null && providerFilter !== "metaAds" && <circle cx={x} cy={googleY} r="3.5" fill="#4285F4"><title>{`${formatDate(point.date)} · Google Ads ${formatMoney(point.googleSpend, currency)}`}</title></circle>}
                  {metaY !== null && providerFilter !== "googleAds" && <circle cx={x} cy={metaY} r="3.5" fill="#8b5cf6"><title>{`${formatDate(point.date)} · Meta Ads ${formatMoney(point.metaSpend, currency)}`}</title></circle>}
                </g>;
              })}
              {datedPoints.length > 0 && [datedPoints[0], datedPoints[Math.floor((datedPoints.length - 1) / 2)], datedPoints[datedPoints.length - 1]].filter((point, index, array) => point && array.findIndex((candidate) => candidate.date === point.date) === index).map((point) => {
                const x = 58 + ((point.time - minTime) / Math.max(1, maxTime - minTime)) * 820;
                return <text key={point.date} x={x} y="247" textAnchor="middle" fontSize="10" fill="#64748b">{formatDate(point.date)}</text>;
              })}
            </svg>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          {providerFilter !== "metaAds" && <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />Google Ads</span>}
          {providerFilter !== "googleAds" && <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" />Meta Ads</span>}
          <span className="text-[11px] text-slate-400">Scale: {maxLabel} peak daily spend</span>
        </div>
        {monthlyRows.length > 0 && (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <h3 className="mb-3 text-sm font-bold text-slate-800">Reported spend by calendar month</h3>
            <div className="space-y-3">
              {monthlyRows.map(([month, totals]) => (
                <div key={month}>
                  <p className="mb-1.5 text-xs font-semibold text-slate-600">{new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`))}</p>
                  {providerFilter !== "metaAds" && <div className="mb-1 flex items-center gap-2"><span className="w-14 text-[10px] text-slate-400">Google</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${totals.google === null ? 0 : Math.max(0, totals.google / monthlyMax * 100)}%` }} /></div><span className="w-28 text-right text-[10px] font-semibold text-slate-600">{totals.google === null ? "Not reported" : formatMoney(totals.google, currency)}</span></div>}
                  {providerFilter !== "googleAds" && <div className="flex items-center gap-2"><span className="w-14 text-[10px] text-slate-400">Meta</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500" style={{ width: `${totals.meta === null ? 0 : Math.max(0, totals.meta / monthlyMax * 100)}%` }} /></div><span className="w-28 text-right text-[10px] font-semibold text-slate-600">{totals.meta === null ? "Not reported" : formatMoney(totals.meta, currency)}</span></div>}
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-4 text-slate-400">Monthly bars sum the daily values returned within the selected reporting window. Dates not returned by the provider are not assumed to be zero.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProviderHeader({ provider, status }: { provider: ProviderKey; status: ProviderStatus }) {
  const connected = status === "connected";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${provider === "googleAds" ? "bg-slate-50" : "bg-blue-50"}`}>
          {provider === "googleAds" ? <GoogleIcon sx={{ color: "#4285F4", fontSize: 25 }} /> : <FacebookRoundedIcon sx={{ color: "#1877F2", fontSize: 25 }} />}
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">{providerLabel(provider)}</h3>
          <p className="text-xs text-slate-500">{connected ? "Connected advertising account" : status === "not_connected" ? "Provider not connected" : status === "no_account" ? "No ad account selected" : "Connection needs attention"}</p>
        </div>
      </div>
      <Chip
        size="small"
        icon={connected ? <CheckCircleRoundedIcon /> : <WarningAmberRoundedIcon />}
        label={connected ? "Connected" : status === "not_connected" ? "Not connected" : status === "no_account" ? "No account" : "Needs attention"}
        color={connected ? "success" : "warning"}
        variant="outlined"
      />
    </div>
  );
}

function AccountPicker({
  label,
  accounts,
  value,
  onChange,
}: {
  label: string;
  accounts: AccountSummary[];
  value: string;
  onChange: (event: SelectChangeEvent<string>) => void;
}) {
  if (accounts.length === 0) return null;
  return (
    <label className="flex min-w-[220px] flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">{label}</span>
      <Select
        size="small"
        value={value}
        onChange={onChange}
        displayEmpty
        sx={{ minWidth: 220, borderRadius: 2.5, bgcolor: "white", fontSize: 13, "& .MuiSelect-select": { py: 1.15 } }}
      >
        <MenuItem value={ALL_ACCOUNTS} sx={{ fontSize: 13, fontWeight: 700 }}>
          All connected accounts ({accounts.length})
        </MenuItem>
        {accounts.map((account) => (
          <MenuItem key={account.id} value={account.id} sx={{ fontSize: 13 }}>
            {account.name} · {account.id}
          </MenuItem>
        ))}
      </Select>
    </label>
  );
}

export default function BillingPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [range, setRange] = useState<RangeOption>("30d");
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | ProviderKey>("overview");
  const [googleAccountId, setGoogleAccountId] = useState(ALL_ACCOUNTS);
  const [metaAccountId, setMetaAccountId] = useState(ALL_ACCOUNTS);
  const [data, setData] = useState<BillingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceProviderFilter, setInvoiceProviderFilter] = useState<"all" | ProviderKey>("all");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<"all" | "paid" | "unpaid" | "unknown">("all");
  const [invoiceDateFilter, setInvoiceDateFilter] = useState<"all" | "30d" | "90d" | "6m">("all");
  const [invoicePage, setInvoicePage] = useState(0);
  const [invoiceRowsPerPage, setInvoiceRowsPerPage] = useState(10);
  const [selectedInvoice, setSelectedInvoice] = useState<UnifiedInvoice | null>(null);
  const [metaActivityData, setMetaActivityData] = useState<MetaActivitiesResponse | null>(null);
  const [metaActivityLoading, setMetaActivityLoading] = useState(false);
  const [metaActivityError, setMetaActivityError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (isDemoMode) {
        setLoading(false);
        setError(null);
        return;
      }
      if (!isLoaded) return;
      if (!isSignedIn) {
        setLoading(false);
        setError("Sign in to view your advertising billing information.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token) throw new Error("Your session could not be verified. Please sign in again.");
        const params = new URLSearchParams({
          range,
          googleAccountId: googleAccountId === ALL_ACCOUNTS ? "all" : googleAccountId,
          metaAccountId: metaAccountId === ALL_ACCOUNTS ? "all" : metaAccountId,
        });
        const response = await authenticatedApiRequest(`/api/billing?${params.toString()}`, token) as BillingResponse;
        if (cancelled) return;
        setData(response);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Billing information could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [getToken, isLoaded, isSignedIn, range, googleAccountId, metaAccountId, refreshKey, isDemoMode]);

  useEffect(() => {
    let cancelled = false;
    const loadActivities = async () => {
      if (isDemoMode) {
        setMetaActivityData(null);
        setMetaActivityError(null);
        setMetaActivityLoading(false);
        return;
      }
      if (!isLoaded || !isSignedIn) return;
      setMetaActivityLoading(true);
      setMetaActivityError(null);
      try {
        const token = await getToken();
        if (!token) throw new Error("Your session has expired. Please sign in again.");
        const params = new URLSearchParams({
          range,
          accountId: metaAccountId === ALL_ACCOUNTS ? "all" : metaAccountId,
        });
        const response = await authenticatedApiRequest(`/api/billing/meta/activities?${params.toString()}`, token) as MetaActivitiesResponse;
        if (!cancelled) setMetaActivityData(response);
      } catch (activityError) {
        if (!cancelled) {
          setMetaActivityError(activityError instanceof Error ? activityError.message : "Meta billing activity could not be loaded.");
          setMetaActivityData(null);
        }
      } finally {
        if (!cancelled) setMetaActivityLoading(false);
      }
    };
    void loadActivities();
    return () => { cancelled = true; };
  }, [getToken, isLoaded, isSignedIn, range, metaAccountId, refreshKey, isDemoMode]);

  const demoData = useMemo(() => {
    const base = createDemoBillingResponse(range);
    const googleEntry = base.providers.googleAds.accounts.find((entry) => entry.account.id === googleAccountId)
      ?? base.providers.googleAds.accounts[0]
      ?? null;
    const metaEntry = base.providers.metaAds.accounts.find((entry) => entry.account.id === metaAccountId)
      ?? base.providers.metaAds.accounts[0]
      ?? null;
    const googleAllSelected = googleAccountId === ALL_ACCOUNTS;
    const metaAllSelected = metaAccountId === ALL_ACCOUNTS;

    return {
      ...base,
      accounts: {
        googleAds: {
          ...base.accounts.googleAds,
          selectedAccountId: googleAllSelected ? null : googleEntry?.account.id ?? null,
          allSelected: googleAllSelected,
        },
        metaAds: {
          ...base.accounts.metaAds,
          selectedAccountId: metaAllSelected ? null : metaEntry?.account.id ?? null,
          allSelected: metaAllSelected,
        },
      },
      providers: {
        googleAds: {
          ...base.providers.googleAds,
          account: googleEntry?.account ?? null,
          billing: googleEntry?.billing ?? null,
        },
        metaAds: {
          ...base.providers.metaAds,
          account: metaEntry?.account ?? null,
          billing: metaEntry?.billing ?? null,
        },
      },
    };
  }, [range, googleAccountId, metaAccountId]);
  const displayData = isDemoMode ? demoData : data;

  const google = displayData?.providers.googleAds;
  const meta = displayData?.providers.metaAds;
  const googleBilling = google?.billing;
  const metaBilling = meta?.billing;
  const googleAccountsDataAll = google?.accounts?.length
    ? google.accounts
    : google?.account && google.billing
      ? [{ account: google.account, status: google.status, billing: google.billing }]
      : [];
  const metaAccountsDataAll = meta?.accounts?.length
    ? meta.accounts
    : meta?.account && meta.billing
      ? [{ account: meta.account, status: meta.status, billing: meta.billing }]
      : [];
  const googleAccountsData = isDemoMode
    ? googleAccountsDataAll.filter((entry) => googleAccountId === ALL_ACCOUNTS || entry.account.id === googleAccountId)
    : googleAccountsDataAll;
  const metaAccountsData = isDemoMode
    ? metaAccountsDataAll.filter((entry) => metaAccountId === ALL_ACCOUNTS || entry.account.id === metaAccountId)
    : metaAccountsDataAll;

  const demoMetaActivities = useMemo<MetaActivityAccount[]>(() => {
    if (!isDemoMode) return [];
    const now = new Date();
    const ago = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
    return metaAccountsData.map((entry, index) => ({
      account: entry.account,
      availability: "available" as const,
      message: null,
      truncated: false,
      lastSyncedAt: entry.billing.lastSyncedAt,
      activities: [
        {
          id: `demo-meta-${entry.account.id}-charge`,
          eventType: "ad_account_billing_charge",
          title: "Billing charge recorded",
          description: "Meta recorded a billing charge against this sample ad account.",
          eventTime: ago(5 + index * 3),
          accountTime: null,
          actorName: "Meta billing system (demo)",
          objectName: entry.account.name,
          objectType: "AD_ACCOUNT",
        },
        {
          id: `demo-meta-${entry.account.id}-funding`,
          eventType: "funding_event_successful",
          title: "Funds added successfully",
          description: "Meta reports a successful funding event in this sample timeline.",
          eventTime: ago(30 + index * 6),
          accountTime: null,
          actorName: "Meta billing system (demo)",
          objectName: entry.account.name,
          objectType: "AD_ACCOUNT",
        },
        ...(index === 0 ? [{
          id: `demo-meta-${entry.account.id}-decline`,
          eventType: "ad_account_billing_decline",
          title: "Billing payment declined (demo example)",
          description: "Sample alert only. No real payment was declined.",
          eventTime: ago(52),
          accountTime: null,
          actorName: "Meta billing system (demo)",
          objectName: entry.account.name,
          objectType: "AD_ACCOUNT",
        }] : []),
      ],
    }));
  }, [isDemoMode, metaAccountsData]);

  const liveMetaActivities = metaActivityData?.accounts ?? [];
  const selectedMetaActivityAccounts = isDemoMode
    ? demoMetaActivities.filter((entry) => metaAccountId === ALL_ACCOUNTS || entry.account.id === metaAccountId)
    : liveMetaActivities.filter((entry) => metaAccountId === ALL_ACCOUNTS || entry.account.id === metaAccountId);

  const billingActivities = useMemo<UnifiedBillingActivity[]>(() => {
    const rangeStart = displayData?.range.since ?? "0000-01-01";
    const rangeEnd = displayData?.range.until ?? "9999-12-31";
    const googleEvents: UnifiedBillingActivity[] = googleAccountsData.flatMap((entry) =>
      (entry.billing.invoices ?? []).flatMap((invoice) => invoice.issueDate && invoice.issueDate >= rangeStart && invoice.issueDate <= rangeEnd ? [{
        id: `google-invoice-issued-${entry.account.id}-${invoice.id}`,
        provider: "googleAds" as const,
        accountId: entry.account.id,
        accountName: entry.account.name,
        title: "Invoice issued",
        description: `Google Ads invoice ${invoice.id} was issued${invoice.total !== null ? ` for ${formatMoney(invoice.total, invoice.currency ?? entry.billing.currency)}` : ""}. Payment status is not provided by this invoice response.`,
        eventType: "google_invoice_issued",
        eventTime: invoice.issueDate,
        actorName: "Google Ads",
        sourceLabel: "Google invoice history",
      }] : []),
    );
    const metaEvents: UnifiedBillingActivity[] = selectedMetaActivityAccounts.flatMap((accountEntry) =>
      accountEntry.activities.map((activity) => ({
        id: activity.id,
        provider: "metaAds" as const,
        accountId: accountEntry.account.id,
        accountName: accountEntry.account.name,
        title: activity.title,
        description: activity.description,
        eventType: activity.eventType,
        eventTime: activity.eventTime,
        actorName: activity.actorName,
        sourceLabel: "Meta Ad Activity",
      })),
    );
    return [...googleEvents, ...metaEvents].sort((a, b) => (b.eventTime ?? "").localeCompare(a.eventTime ?? ""));
  }, [displayData?.range.since, displayData?.range.until, googleAccountsData, selectedMetaActivityAccounts]);

  const allInvoices = useMemo<UnifiedInvoice[]>(() => {
    const googleInvoices: UnifiedInvoice[] = googleAccountsData.flatMap((entry) =>
      (entry.billing.invoices ?? []).map((invoice) => ({
        provider: "googleAds" as const,
        id: invoice.id,
        invoiceNumber: invoice.id,
        billingPeriod: invoice.issueDate ? new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(new Date(invoice.issueDate)) : "—",
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        amount: invoice.total,
        amountDue: null,
        subtotal: invoice.subtotal,
        tax: invoice.tax,
        amountLabel: "Invoice total" as const,
        currency: invoice.currency ?? (entry.billing.currencyIsMixed ? null : entry.billing.currency ?? entry.account.currency),
        status: null,
        invoiceType: invoice.invoiceType,
        accountName: entry.account.name,
        accountId: entry.account.id,
        accountIds: [entry.account.id],
        businessId: null,
        downloadAvailable: isDemoMode || invoice.pdfAvailable,
        downloadPath: !isDemoMode && invoice.pdfAvailable
          ? `/api/billing/google/${encodeURIComponent(entry.account.id)}/invoices/${encodeURIComponent(invoice.id)}/download?billingSetupId=${encodeURIComponent(invoice.billingSetupId)}&issueYear=${invoice.issueYear}&issueMonth=${invoice.issueMonth}`
          : null,
      })),
    );

    // Meta Business invoices can cover several ad accounts. The per-account
    // lookup intentionally verifies membership, so merge duplicate invoice
    // records into one row while retaining all associated connected accounts.
    const metaInvoiceMap = new Map<string, UnifiedInvoice>();
    for (const entry of metaAccountsData) {
      for (const invoice of entry.billing.invoices ?? []) {
        const key = `${invoice.businessId}:${invoice.id}`;
        const existing = metaInvoiceMap.get(key);
        if (existing) {
          if (!existing.accountIds.includes(entry.account.id)) {
            existing.accountIds.push(entry.account.id);
            existing.accountName = `${existing.accountName}, ${entry.account.name}`;
          }
          continue;
        }
        metaInvoiceMap.set(key, {
          provider: "metaAds",
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber ?? invoice.id,
          billingPeriod: invoice.billingPeriod ?? "—",
          issueDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          amount: invoice.amount ?? invoice.amountDue,
          amountDue: invoice.amountDue,
          subtotal: null,
          tax: null,
          amountLabel: invoice.amount !== null ? "Invoice total" : "Amount due",
          currency: invoice.currency ?? entry.billing.currency ?? entry.account.currency,
          status: invoice.paymentStatus,
          invoiceType: invoice.invoiceType,
          accountName: entry.account.name,
          accountId: entry.account.id,
          accountIds: [entry.account.id],
          businessId: invoice.businessId,
          downloadAvailable: isDemoMode || invoice.downloadAvailable,
          downloadPath: !isDemoMode && invoice.downloadAvailable
            ? `/api/billing/meta/${encodeURIComponent(entry.account.id)}/invoices/${encodeURIComponent(invoice.id)}/download?businessId=${encodeURIComponent(invoice.businessId)}`
            : null,
        });
      }
    }
    return [...googleInvoices, ...metaInvoiceMap.values()].sort((a, b) => (b.issueDate ?? "").localeCompare(a.issueDate ?? ""));
  }, [googleAccountsData, metaAccountsData, isDemoMode]);

  const billingAlerts = useMemo<BillingAlertItem[]>(() => {
    const alerts: BillingAlertItem[] = [];
    const today = new Date();
    const addAlert = (alert: BillingAlertItem) => alerts.push(alert);

    for (const entry of googleAccountsData) {
      for (const setup of entry.billing.billingSetups ?? []) {
        const setupStatus = (setup.status ?? "").toUpperCase();
        if (["PENDING", "APPROVED_HELD", "CANCELLED"].includes(setupStatus)) {
          addAlert({
            id: `google-setup-${entry.account.id}-${setup.id}-${setupStatus}`,
            provider: "googleAds",
            accountId: entry.account.id,
            accountName: entry.account.name,
            title: `Google billing setup ${setupStatus.toLowerCase().replace(/_/g, " ")}`,
            message: "Google reports a billing setup status that may need review. Check the official Google Ads billing page for details.",
            severity: setupStatus === "CANCELLED" ? "warning" : "info",
            createdAt: setup.startDateTime,
          });
        }
      }
      for (const invoice of entry.billing.invoices ?? []) {
        if (!invoice.dueDate) continue;
        const due = new Date(`${invoice.dueDate}T00:00:00`);
        if (Number.isNaN(due.getTime())) continue;
        const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
        if (daysUntilDue < 0) {
          addAlert({
            id: `google-invoice-check-${entry.account.id}-${invoice.id}`,
            provider: "googleAds",
            accountId: entry.account.id,
            accountName: entry.account.name,
            title: "Google invoice due date has passed",
            message: `Invoice ${invoice.id} had a due date of ${formatDate(invoice.dueDate)}. Google Ads API does not expose its payment status here; verify payment directly in Google Ads.`,
            severity: "warning",
            createdAt: invoice.dueDate,
          });
        } else if (daysUntilDue <= 7) {
          addAlert({
            id: `google-invoice-due-${entry.account.id}-${invoice.id}`,
            provider: "googleAds",
            accountId: entry.account.id,
            accountName: entry.account.name,
            title: "Google invoice due date approaching",
            message: `Invoice ${invoice.id} has a due date of ${formatDate(invoice.dueDate)}. Confirm its current payment status in Google Ads.`,
            severity: "info",
            createdAt: invoice.dueDate,
          });
        }
      }
    }

    for (const entry of metaAccountsData) {
      const code = entry.billing.accountStatus.code;
      if (code === 3 || code === 8 || code === 9) {
        addAlert({
          id: `meta-account-status-${entry.account.id}-${code}`,
          provider: "metaAds",
          accountId: entry.account.id,
          accountName: entry.account.name,
          title: `Meta account status: ${entry.billing.accountStatus.label}`,
          message: "Meta reports an unsettled, pending-settlement or grace-period state. Open Meta Billing to review the account.",
          severity: "warning",
          createdAt: entry.billing.lastSyncedAt,
        });
      } else if (code === 2 || code === 101) {
        addAlert({
          id: `meta-account-status-${entry.account.id}-${code}`,
          provider: "metaAds",
          accountId: entry.account.id,
          accountName: entry.account.name,
          title: `Meta ad account is ${entry.billing.accountStatus.label.toLowerCase()}`,
          message: "This is the account status returned by Meta, not a confirmed payment failure. Review the account in Meta if this status is unexpected.",
          severity: "info",
          createdAt: entry.billing.lastSyncedAt,
        });
      }
      for (const invoice of entry.billing.invoices ?? []) {
        const status = (invoice.paymentStatus ?? "").toLowerCase().replace(/[_-]+/g, " ");
        const due = invoice.dueDate ? new Date(`${invoice.dueDate}T00:00:00`) : null;
        const isExplicitlyUnpaid = /unpaid|overdue|declin|failed|payment due/.test(status);
        if (isExplicitlyUnpaid && due && !Number.isNaN(due.getTime()) && due.getTime() < today.getTime()) {
          addAlert({
            id: `meta-invoice-overdue-${entry.account.id}-${invoice.id}`,
            provider: "metaAds",
            accountId: entry.account.id,
            accountName: entry.account.name,
            title: "Meta invoice reported unpaid after its due date",
            message: `Meta reports status “${invoice.paymentStatus}” for invoice ${invoice.invoiceNumber ?? invoice.id}, due ${formatDate(invoice.dueDate)}. Confirm and resolve it in Meta Business Billing.`,
            severity: "error",
            createdAt: invoice.dueDate,
          });
        }
      }
    }

    for (const accountEntry of selectedMetaActivityAccounts) {
      for (const activity of accountEntry.activities) {
        if (activity.eventType === "ad_account_billing_decline" || activity.eventType === "ad_account_billing_charge_failed") {
          addAlert({
            id: `meta-billing-event-${activity.id}`,
            provider: "metaAds",
            accountId: accountEntry.account.id,
            accountName: accountEntry.account.name,
            title: activity.title,
            message: `${activity.description} Open Meta Billing to review the payment.`,
            severity: "error",
            createdAt: activity.eventTime,
          });
        } else if (["ad_account_billing_charge_back", "ad_account_billing_chargeback"].includes(activity.eventType)) {
          addAlert({
            id: `meta-chargeback-${activity.id}`,
            provider: "metaAds",
            accountId: accountEntry.account.id,
            accountName: accountEntry.account.name,
            title: activity.title,
            message: activity.description,
            severity: "warning",
            createdAt: activity.eventTime,
          });
        }
      }
    }

    return alerts.sort((a, b) => {
      const severityRank = { error: 0, warning: 1, info: 2 };
      const severityDifference = severityRank[a.severity] - severityRank[b.severity];
      return severityDifference || (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });
  }, [googleAccountsData, metaAccountsData, selectedMetaActivityAccounts]);

  const spendByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const entry of googleAccountsData) {
      const billing = entry.billing;
      if (billing.reportingSpend !== null && billing.reportingSpendAvailability === "available" && billing.currency) {
        totals.set(billing.currency, (totals.get(billing.currency) ?? 0) + billing.reportingSpend);
      }
    }
    for (const entry of metaAccountsData) {
      const billing = entry.billing;
      if (billing.periodSpend !== null && billing.periodSpendAvailability === "available" && billing.currency) {
        totals.set(billing.currency, (totals.get(billing.currency) ?? 0) + billing.periodSpend);
      }
    }
    return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
  }, [googleAccountsData, metaAccountsData]);

  const groupedSpendLabel = (entries: Array<{ amount: number; currency: string }>) => {
    if (entries.length === 0) return "Not available";
    if (entries.length === 1) return formatMoney(entries[0]!.amount, entries[0]!.currency);
    return "Multiple currencies";
  };
  const groupedSpendDescription = (entries: Array<{ amount: number; currency: string }>, fallback: string) =>
    entries.length > 1 ? entries.map((item) => formatMoney(item.amount, item.currency)).join(" · ") : fallback;

  const googleSpendByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const entry of googleAccountsData) {
      if (entry.billing.reportingSpendAvailability === "available" && entry.billing.reportingSpend !== null && entry.billing.currency) {
        totals.set(entry.billing.currency, (totals.get(entry.billing.currency) ?? 0) + entry.billing.reportingSpend);
      }
    }
    return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
  }, [googleAccountsData]);
  const metaSpendByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const entry of metaAccountsData) {
      if (entry.billing.periodSpendAvailability === "available" && entry.billing.periodSpend !== null && entry.billing.currency) {
        totals.set(entry.billing.currency, (totals.get(entry.billing.currency) ?? 0) + entry.billing.periodSpend);
      }
    }
    return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
  }, [metaAccountsData]);

  const googleReportingStatuses = googleAccountsData.map((entry) => entry.billing.reportingSpendAvailability);
  const metaReportingStatuses = metaAccountsData.map((entry) => entry.billing.periodSpendAvailability);
  const allReportingStatuses = [...googleReportingStatuses, ...metaReportingStatuses];
  const hasReportingErrors = allReportingStatuses.some((status) => status === "error" || status === "permission_required");
  const hasNoReportingRows = allReportingStatuses.some((status) => status === "no_data");
  const reportingLabel = (entries: Array<{ amount: number; currency: string }>, statuses: Array<"available" | "no_data" | "permission_required" | "error">) => {
    if (entries.length > 0) return groupedSpendLabel(entries);
    if (statuses.length === 0) return "Not available";
    if (statuses.every((status) => status === "no_data")) return "No spend data";
    if (statuses.some((status) => status === "error" || status === "permission_required")) return "Data unavailable";
    return "No spend data";
  };
  const totalSpendLabel = reportingLabel(spendByCurrency, allReportingStatuses);
  const totalSpendDescription = [
    groupedSpendDescription(spendByCurrency, "Provider reporting spend for the selected period"),
    ...(hasNoReportingRows ? ["One or more accounts returned no reporting rows for this period; this is not shown as ₹0.00."] : []),
    ...(hasReportingErrors ? ["Reporting could not be retrieved for one or more accounts. See account-level messages below."] : []),
  ].join(" · ");
  const googleSpend = reportingLabel(googleSpendByCurrency, googleReportingStatuses);
  const metaSpend = reportingLabel(metaSpendByCurrency, metaReportingStatuses);
  const metaBalanceLabel = metaAccountsData.length === 1 ? metaBilling?.balanceLabel ?? "Meta balance" : "Meta account balances";
  const metaBalanceValue = metaAccountsData.length === 1 && metaBilling
    ? formatMoney(metaBilling.balance, metaBilling.currency)
    : metaAccountsData.length > 1 ? "See accounts" : "Not available";

  const filteredInvoices = useMemo(() => {
    const now = new Date();
    const days = invoiceDateFilter === "30d" ? 30 : invoiceDateFilter === "90d" ? 90 : invoiceDateFilter === "6m" ? 183 : null;
    const cutoff = days ? new Date(now.getTime() - days * 24 * 60 * 60 * 1000) : null;
    const query = invoiceSearch.trim().toLowerCase();
    return allInvoices.filter((invoice) => {
      if (invoiceProviderFilter !== "all" && invoice.provider !== invoiceProviderFilter) return false;
      if (invoiceStatusFilter !== "all") {
        const normalizedStatus = (invoice.status ?? "").toLowerCase().replace(/[_-]+/g, " ").trim();
        const isPaid = ["paid", "fully paid", "paid in full", "settled", "complete", "completed"].includes(normalizedStatus);
        if (invoiceStatusFilter === "unknown" && invoice.status) return false;
        if (invoiceStatusFilter === "paid" && !isPaid) return false;
        if (invoiceStatusFilter === "unpaid" && (!invoice.status || isPaid)) return false;
      }
      if (cutoff && invoice.issueDate) {
        const issueDate = new Date(invoice.issueDate);
        if (!Number.isNaN(issueDate.getTime()) && issueDate < cutoff) return false;
      } else if (cutoff && !invoice.issueDate) return false;
      if (query) {
        const haystack = [invoice.invoiceNumber, invoice.id, invoice.accountName, ...invoice.accountIds, invoice.billingPeriod, providerLabel(invoice.provider)]
          .join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [allInvoices, invoiceDateFilter, invoiceProviderFilter, invoiceSearch, invoiceStatusFilter]);

  const paginatedInvoices = filteredInvoices.slice(invoicePage * invoiceRowsPerPage, invoicePage * invoiceRowsPerPage + invoiceRowsPerPage);

  const handleDownload = useCallback(async (invoice: UnifiedInvoice) => {
    if (!isDemoMode && !invoice.downloadPath) return;
    setDownloadingInvoice(`${invoice.provider}-${invoice.accountId}-${invoice.id}`);
    setDownloadError(null);
    try {
      let blob: Blob;
      if (isDemoMode) {
        // Demo files are generated locally; they never call Google or Meta APIs.
        blob = createDemoInvoicePdf(invoice);
      } else {
        const token = await getToken();
        if (!token) throw new Error("Your session has expired. Please sign in again.");
        const apiBase = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";
        const response = await fetch(`${apiBase}${invoice.downloadPath}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { message?: string } | null;
          throw new Error(payload?.message || "Invoice download failed.");
        }
        blob = await response.blob();
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const prefix = isDemoMode ? "DEMO-" : "";
      anchor.download = `${prefix}${invoice.provider === "googleAds" ? "google" : "meta"}-invoice-${invoice.invoiceNumber}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadFailure) {
      setDownloadError(downloadFailure instanceof Error ? downloadFailure.message : "Invoice download failed.");
    } finally {
      setDownloadingInvoice(null);
    }
  }, [getToken, isDemoMode]);

  const exportFilteredInvoices = () => {
    if (isDemoMode) return;
    const headers = ["Provider", "Account(s)", "Account ID(s)", "Business ID", "Invoice number", "Billing period", "Issue date", "Due date", "Currency", "Subtotal", "Tax", "Invoice total", "Amount due", "Status", "Invoice type", "PDF available"];
    const csvCell = (value: unknown) => {
      let text = value === null || value === undefined ? "" : String(value);
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = filteredInvoices.map((invoice) => [
      providerLabel(invoice.provider), invoice.accountName, invoice.accountIds.join(" | "), invoice.businessId, invoice.invoiceNumber,
      invoice.billingPeriod, invoice.issueDate, invoice.dueDate, invoice.currency,
      invoice.subtotal, invoice.tax, invoice.amount, invoice.amountDue, invoice.status,
      invoice.invoiceType, invoice.downloadAvailable ? "Yes" : "No",
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `adsyntra-provider-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const dateText = displayData?.range ? `${formatDate(displayData.range.since)} – ${formatDate(displayData.range.until)}` : "Selected reporting period";

  const spendAnalytics = useMemo(() => {
    const grouping = new Map<string, { currency: string; timezone: string | null }>();
    for (const entry of [...googleAccountsData, ...metaAccountsData]) {
      const currency = entry.billing.currency ?? entry.account.currency;
      if (!currency || !/^[A-Z]{3}$/.test(currency)) continue;
      const timezone = entry.account.timezone ?? null;
      const key = `${currency}|${timezone ?? "__unknown_timezone__"}`;
      grouping.set(key, { currency, timezone });
    }

    const buildProviderSeries = (provider: ProviderKey, currency: string, timezone: string | null) => {
      const entries = (provider === "googleAds" ? googleAccountsData : metaAccountsData)
        .filter((entry) => (entry.billing.currency ?? entry.account.currency) === currency && (entry.account.timezone ?? null) === timezone);
      if (entries.length === 0) return { points: new Map<string, number>(), total: null as number | null, accountCount: 0, messages: [] as string[] };
      const messages = entries
        .filter((entry) => entry.billing.spendTrendAvailability !== "available" || !entry.billing.spendTrend.length)
        .map((entry) => `${entry.account.name}: ${entry.billing.spendTrendMessage ?? `Daily reporting ${entry.billing.spendTrendAvailability}.`}`);
      if (!timezone && entries.length > 1) {
        messages.push("Multiple accounts have no stored account time zone. Select one account at a time to avoid combining different local reporting days.");
      }
      const complete = Boolean(timezone || entries.length === 1) && entries.every((entry) => entry.billing.spendTrendAvailability === "available" && entry.billing.spendTrend.length > 0);
      if (!complete) return { points: new Map<string, number>(), total: null as number | null, accountCount: entries.length, messages };

      const dailyMaps = entries.map((entry) => new Map(entry.billing.spendTrend.map((point) => [point.date, point.amount])));
      const dateSet = new Set(dailyMaps.flatMap((map) => [...map.keys()]));
      const points = new Map<string, number>();
      for (const date of dateSet) {
        // Only sum a date when every selected account in this currency/time zone returned it.
        // An absent provider row is kept as a gap, never fabricated as zero.
        if (dailyMaps.every((map) => map.has(date))) {
          points.set(date, dailyMaps.reduce((sum, map) => sum + (map.get(date) ?? 0), 0));
        }
      }
      const total = [...points.values()].reduce((sum, value) => sum + value, 0);
      return { points, total, accountCount: entries.length, messages };
    };

    return [...grouping.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => {
      const googleSeries = buildProviderSeries("googleAds", group.currency, group.timezone);
      const metaSeries = buildProviderSeries("metaAds", group.currency, group.timezone);
      const dates = [...new Set([...googleSeries.points.keys(), ...metaSeries.points.keys()])].sort();
      const points: SpendAnalyticsPoint[] = dates.map((date) => ({
        date,
        googleSpend: googleSeries.points.get(date) ?? null,
        metaSpend: metaSeries.points.get(date) ?? null,
      }));
      return {
        key,
        currency: group.currency,
        timezone: group.timezone,
        points,
        googleTotal: googleSeries.total,
        metaTotal: metaSeries.total,
        googleAccountCount: googleSeries.accountCount,
        metaAccountCount: metaSeries.accountCount,
        googleMessages: googleSeries.messages,
        metaMessages: metaSeries.messages,
      };
    });
  }, [googleAccountsData, metaAccountsData]);

  const renderSpendAnalytics = (providerFilter?: ProviderKey) => {
    const selected = spendAnalytics.map((entry) => ({
      ...entry,
      points: entry.points.map((point) => ({
        ...point,
        googleSpend: providerFilter === "metaAds" ? null : point.googleSpend,
        metaSpend: providerFilter === "googleAds" ? null : point.metaSpend,
      })),
    }));
    const hasChartData = selected.some((entry) =>
      entry.points.some((point) => point.googleSpend !== null || point.metaSpend !== null));
    return (
      <div className="mb-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Spend analytics</h2>
          <p className="mt-1 text-sm text-slate-500">Compare provider-reported daily spend and monthly totals without merging different currencies.</p>
        </div>
        {selected.filter((entry) => entry.points.some((point) => point.googleSpend !== null || point.metaSpend !== null)).map((entry) => (
          <SpendAnalyticsCard
            key={entry.key}
            currency={entry.currency}
            timezone={entry.timezone}
            points={entry.points}
            googleTotal={providerFilter === "metaAds" ? null : entry.googleTotal}
            metaTotal={providerFilter === "googleAds" ? null : entry.metaTotal}
            googleAccountCount={entry.googleAccountCount}
            metaAccountCount={entry.metaAccountCount}
            providerFilter={providerFilter}
          />
        ))}
        {!hasChartData && (
          <Card variant="outlined" className="rounded-2xl border-slate-200 bg-white" sx={{ borderRadius: 3 }}>
            <CardContent className="!p-5">
              <div className="flex items-start gap-3"><InfoOutlinedIcon sx={{ color: "#64748b" }} /><div><p className="text-sm font-semibold text-slate-800">No daily spend analytics available for this selection</p><p className="mt-1 text-xs leading-5 text-slate-500">The selected accounts did not return daily reporting rows, or their currency could not be confirmed. The dashboard will not create sample values in Live Data mode.</p></div></div>
            </CardContent>
          </Card>
        )}
        {selected.some((entry) => (providerFilter !== "metaAds" && entry.googleMessages.length > 0) || (providerFilter !== "googleAds" && entry.metaMessages.length > 0)) && (
          <Alert severity="info" sx={{ borderRadius: 2.5 }}>
            Some accounts could not be included in the analytics chart. Their spend is excluded rather than estimated. Review the account-level reporting messages below.
          </Alert>
        )}
      </div>
    );
  };

  const renderAccountRollup = (providerFilter?: ProviderKey) => {
    const rows = [
      ...(displayData?.accounts.googleAds.items ?? []).filter((account) => googleAccountId === ALL_ACCOUNTS || account.id === googleAccountId).map((account) => {
        const loaded = googleAccountsData.find((entry) => entry.account.id === account.id);
        return {
          provider: "googleAds" as const,
          account,
          spend: loaded?.billing.reportingSpend ?? null,
          spendAvailable: loaded?.billing.reportingSpendAvailability === "available",
          spendStatus: loaded?.billing.reportingSpendAvailability ?? "error",
          spendMessage: loaded?.billing.reportingSpendMessage ?? null,
          currency: loaded?.billing.currencyIsMixed ? "Mixed" : loaded?.billing.currency ?? account.currency,
          billingStatus: loaded?.billing.billingSetups[0]?.status ?? (loaded ? availabilityLabel(loaded.billing.availability) : "Not synced"),
          status: loaded?.status ?? (displayData?.accounts.googleAds.connected ? "Not synced" : "Not connected"),
          lastSyncedAt: loaded?.billing.lastSyncedAt ?? null,
        };
      }),
      ...(displayData?.accounts.metaAds.items ?? []).filter((account) => metaAccountId === ALL_ACCOUNTS || account.id === metaAccountId).map((account) => {
        const loaded = metaAccountsData.find((entry) => entry.account.id === account.id);
        return {
          provider: "metaAds" as const,
          account,
          spend: loaded?.billing.periodSpend ?? null,
          spendAvailable: loaded?.billing.periodSpendAvailability === "available",
          spendStatus: loaded?.billing.periodSpendAvailability ?? "error",
          spendMessage: loaded?.billing.periodSpendMessage ?? null,
          currency: loaded?.billing.currency ?? account.currency,
          billingStatus: loaded?.billing.accountStatus.label ?? "Not synced",
          status: loaded?.status ?? (displayData?.accounts.metaAds.connected ? "Not synced" : "Not connected"),
          lastSyncedAt: loaded?.billing.lastSyncedAt ?? null,
        };
      }),
    ].filter((row) => !providerFilter || row.provider === providerFilter);
    return (
      <Card variant="outlined" className="mb-6 overflow-hidden rounded-2xl border-slate-200 bg-white shadow-[0_3px_16px_rgba(15,23,42,0.04)]" sx={{ borderRadius: 3 }}>
        <CardContent className="!p-5 md:!p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-base font-bold text-slate-900">Connected advertising accounts</h2><p className="mt-1 text-xs text-slate-500">Account-level spend and provider status for the selected reporting period. Amounts remain in each account currency.</p></div>
            <Chip size="small" variant="outlined" label={`${rows.length} accounts`} />
          </div>
          <TableContainer className="rounded-xl border border-slate-100">
            <Table size="small" aria-label="Connected advertising billing accounts">
              <TableHead><TableRow className="bg-slate-50">{["Provider", "Account", "Currency", "Period spend", "Billing status", "Connection", "Last synced"].map((heading) => <TableCell key={heading} sx={{ fontSize: 11, fontWeight: 800, color: "#64748b", whiteSpace: "nowrap", py: 1.4 }}>{heading}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={7} className="!py-8 text-center !text-sm !text-slate-500">No advertising accounts were found for this selection.</TableCell></TableRow> : rows.map((row) => (
                  <TableRow key={`${row.provider}-${row.account.id}`} hover>
                    <TableCell><div className="flex items-center gap-2 text-xs font-semibold text-slate-700">{row.provider === "googleAds" ? <GoogleIcon sx={{ color: "#4285F4", fontSize: 18 }} /> : <FacebookRoundedIcon sx={{ color: "#1877F2", fontSize: 18 }} />}{providerLabel(row.provider)}</div></TableCell>
                    <TableCell><p className="text-xs font-semibold text-slate-800">{row.account.name}</p><p className="text-[10px] text-slate-400">{row.account.id}</p></TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{row.currency ?? "—"}</TableCell>
                    <TableCell sx={{ fontSize: 12, fontWeight: 700, minWidth: 150 }}>
                      <span className="whitespace-nowrap">{row.spendAvailable ? formatMoney(row.spend, row.currency) : row.spendStatus === "no_data" ? "No spend data" : "Data unavailable"}</span>
                      {!row.spendAvailable && row.spendMessage && <p className="mt-1 max-w-[240px] text-[10px] font-normal leading-4 text-slate-500" title={row.spendMessage}>{row.spendMessage}</p>}
                    </TableCell>
                    <TableCell><StatusChip status={row.billingStatus} /></TableCell>
                    <TableCell><StatusChip status={row.status} /></TableCell>
                    <TableCell sx={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }} title={row.lastSyncedAt ?? "Not synced"}>{isDemoMode ? "Demo preview" : formatDateTime(row.lastSyncedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <p className="mt-3 text-[11px] leading-5 text-slate-400">Google billing setup status and Meta ad account status describe different provider concepts; they are shown as reported and are not treated as equivalent payment states.</p>
        </CardContent>
      </Card>
    );
  };

  const renderBillingIntelligence = (providerFilter?: ProviderKey) => {
    const allProviderActivities = billingActivities.filter((activity) => !providerFilter || activity.provider === providerFilter);
    const allProviderAlerts = billingAlerts.filter((alert) => !providerFilter || alert.provider === providerFilter);
    const activities = allProviderActivities.slice(0, 12);
    const alerts = allProviderAlerts.slice(0, 8);
    const filteredMetaActivityAccounts = selectedMetaActivityAccounts.filter((entry) => !providerFilter || providerFilter === "metaAds");
    const unavailableMetaAccounts = filteredMetaActivityAccounts.filter((entry) => entry.availability !== "available");
    const limitedMetaAccounts = filteredMetaActivityAccounts.filter((entry) => entry.truncated);
    const googleAccountCount = googleAccountsData.filter((entry) => (entry.billing.invoices ?? []).length > 0).length;

    return (
      <div className="mb-6 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card variant="outlined" className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-[0_3px_16px_rgba(15,23,42,0.04)]" sx={{ borderRadius: 3 }}>
          <CardContent className="!p-5 md:!p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><NotificationsActiveRoundedIcon /></div>
                <div><h2 className="text-base font-bold text-slate-900">Billing alerts</h2><p className="mt-0.5 text-xs text-slate-500">In-dashboard notices based on provider-reported data.</p></div>
              </div>
              <Chip size="small" color={alerts.some((item) => item.severity === "error") ? "error" : alerts.length ? "warning" : "success"} variant="outlined" label={`${allProviderAlerts.length} active`} />
            </div>
            {isDemoMode && <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>Demo alerts are fictional examples for preview only.</Alert>}
            {alerts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-7 text-center">
                <CheckCircleRoundedIcon sx={{ fontSize: 28, color: "#16a34a" }} />
                <p className="mt-2 text-sm font-semibold text-slate-800">No billing alerts detected</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">No alert conditions were identified from the billing information currently available.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((item) => (
                  <div key={item.id} className={`rounded-xl border p-3 ${item.severity === "error" ? "border-rose-200 bg-rose-50/60" : item.severity === "warning" ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-slate-50/70"}`}>
                    <div className="flex items-start gap-2.5">
                      <ErrorOutlineRoundedIcon sx={{ mt: 0.1, fontSize: 18, color: item.severity === "error" ? "#e11d48" : item.severity === "warning" ? "#d97706" : "#64748b" }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold text-slate-900">{item.title}</p><Chip size="small" variant="outlined" label={providerLabel(item.provider)} sx={{ height: 20, fontSize: 10 }} /></div>
                        <p className="mt-1 text-[11px] font-medium text-slate-500">{item.accountName} · {item.accountId}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{item.message}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-slate-400">{item.createdAt ? formatDateTime(item.createdAt) : "Provider date not supplied"}</span>
                          <Button size="small" variant="text" onClick={() => { setActiveTab(item.provider); if (item.provider === "googleAds") setGoogleAccountId(item.accountId); else setMetaAccountId(item.accountId); }} sx={{ minWidth: 0, px: 1, textTransform: "none", fontSize: 10, fontWeight: 800 }}>View account</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-[10px] leading-4 text-slate-400">Alerts are generated when this page loads. Email, SMS and push notifications are not enabled by this phase. Low-balance alerts are omitted unless a reliable prepaid-balance signal and threshold are available.</p>
          </CardContent>
        </Card>

        <Card variant="outlined" className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-[0_3px_16px_rgba(15,23,42,0.04)]" sx={{ borderRadius: 3 }}>
          <CardContent className="!p-5 md:!p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><HistoryRoundedIcon /></div><div><h2 className="text-base font-bold text-slate-900">Billing activity timeline</h2><p className="mt-0.5 text-xs text-slate-500">Provider events and invoice milestones in the selected period.</p></div></div>
              <Chip size="small" variant="outlined" label={`${allProviderActivities.length} events`} />
            </div>
            {providerFilter !== "metaAds" && <div className="mb-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">Google's Ads API billing resources expose eligible monthly invoice/setup information, not a universal payment transaction ledger. Google events below are invoice issue milestones only.</div>}
            {metaActivityLoading && !isDemoMode && providerFilter !== "googleAds" && <div className="mb-3 flex items-center gap-2 text-xs text-slate-500"><CircularProgress size={14} /> Loading Meta account activities…</div>}
            {metaActivityError && !isDemoMode && providerFilter !== "googleAds" && <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>{metaActivityError}</Alert>}
            {metaActivityData?.message && !metaActivityData.connected && !isDemoMode && providerFilter !== "googleAds" && <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>{metaActivityData.message}</Alert>}
            {unavailableMetaAccounts.length > 0 && providerFilter !== "googleAds" && unavailableMetaAccounts.map((entry) => <Alert key={entry.account.id} severity={entry.availability === "permission_required" ? "warning" : "info"} sx={{ mb: 1, borderRadius: 2 }}>{entry.account.name}: {entry.message ?? "Meta activity history is not available."}</Alert>)}
            {limitedMetaAccounts.length > 0 && providerFilter !== "googleAds" && <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>Some Meta activity histories reached the pagination safety limit. The displayed events may be incomplete.</Alert>}
            {activities.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-7 text-center">
                <HistoryRoundedIcon sx={{ fontSize: 28, color: "#94a3b8" }} />
                <p className="mt-2 text-sm font-semibold text-slate-800">No billing activity events found</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">The provider did not return billable activity events or invoice issue milestones for the selected period.</p>
              </div>
            ) : (
              <div className="max-h-[560px] space-y-0 overflow-y-auto pr-1">
                {activities.map((activity, index) => (
                  <div key={activity.id} className="relative flex gap-3 pb-4">
                    <div className="flex w-8 shrink-0 flex-col items-center"><div className={`flex h-8 w-8 items-center justify-center rounded-full ${activity.provider === "googleAds" ? "bg-blue-50 text-blue-600" : "bg-indigo-50 text-indigo-600"}`}>{activity.provider === "googleAds" ? <GoogleIcon sx={{ fontSize: 17 }} /> : <FacebookRoundedIcon sx={{ fontSize: 17 }} />}</div>{index < activities.length - 1 && <div className="mt-1 w-px flex-1 bg-slate-200" />}</div>
                    <div className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold text-slate-900">{activity.title}</p><span className="text-[10px] text-slate-400">{activity.eventTime ? formatDateTime(activity.eventTime) : "Date not provided"}</span></div>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{activity.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400"><span>{activity.accountName}</span>{activity.actorName && <span>By {activity.actorName}</span>}<span>{activity.sourceLabel}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[10px] leading-4 text-slate-400">Meta activity records are read-only and only appear when the connected user has access. They are not a complete financial statement or payment ledger.</p>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderInvoiceManager = () => (
    <Card variant="outlined" className="mb-6 overflow-hidden rounded-2xl border-slate-200 bg-white shadow-[0_3px_16px_rgba(15,23,42,0.04)]" sx={{ borderRadius: 3 }}>
      <CardContent className="!p-5 md:!p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><ReceiptLongOutlinedIcon sx={{ color: "#4338ca" }} /><div><h2 className="text-base font-bold text-slate-900">Invoice management</h2><p className="mt-0.5 text-xs text-slate-500">Search, filter, inspect, download and export invoices returned by provider APIs.</p></div></div>
          <div className="flex items-center gap-2"><Chip size="small" variant="outlined" label={`${filteredInvoices.length} of ${allInvoices.length} invoices`} /><Button size="small" variant="outlined" startIcon={<FileDownloadOutlinedIcon />} disabled={isDemoMode || filteredInvoices.length === 0} onClick={exportFilteredInvoices} sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700 }}>{isDemoMode ? "Export disabled in demo" : "Export CSV"}</Button></div>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <TextField size="small" placeholder="Search invoice, account or ID…" value={invoiceSearch} onChange={(event) => { setInvoiceSearch(event.target.value); setInvoicePage(0); }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: "#94a3b8", fontSize: 19 }} /></InputAdornment> }} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5, bgcolor: "white", fontSize: 13 } }} />
          <Select size="small" value={invoiceProviderFilter} onChange={(event) => { setInvoiceProviderFilter(event.target.value as typeof invoiceProviderFilter); setInvoicePage(0); }} sx={{ borderRadius: 2.5, bgcolor: "white", fontSize: 13 }}>
            <MenuItem value="all">All providers</MenuItem><MenuItem value="googleAds">Google Ads</MenuItem><MenuItem value="metaAds">Meta Ads</MenuItem>
          </Select>
          <Select size="small" value={invoiceStatusFilter} onChange={(event) => { setInvoiceStatusFilter(event.target.value as typeof invoiceStatusFilter); setInvoicePage(0); }} sx={{ borderRadius: 2.5, bgcolor: "white", fontSize: 13 }}>
            <MenuItem value="all">All statuses</MenuItem><MenuItem value="paid">Paid</MenuItem><MenuItem value="unpaid">Not marked paid</MenuItem><MenuItem value="unknown">Status not provided</MenuItem>
          </Select>
          <Select size="small" value={invoiceDateFilter} onChange={(event) => { setInvoiceDateFilter(event.target.value as typeof invoiceDateFilter); setInvoicePage(0); }} sx={{ borderRadius: 2.5, bgcolor: "white", fontSize: 13 }}>
            <MenuItem value="all">All available dates</MenuItem><MenuItem value="30d">Last 30 days</MenuItem><MenuItem value="90d">Last 90 days</MenuItem><MenuItem value="6m">Last 6 months</MenuItem>
          </Select>
        </div>
        {renderInvoiceTable(paginatedInvoices)}
        <TablePagination
          component="div"
          count={filteredInvoices.length}
          page={invoicePage}
          onPageChange={(_, page) => setInvoicePage(page)}
          rowsPerPage={invoiceRowsPerPage}
          onRowsPerPageChange={(event) => { setInvoiceRowsPerPage(Number(event.target.value)); setInvoicePage(0); }}
          rowsPerPageOptions={[5, 10, 25, 50]}
          sx={{ borderBottom: 0, ".MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows": { fontSize: 12, color: "#64748b" } }}
        />
        <p className="mt-1 text-[11px] leading-5 text-slate-400">Invoice availability and history length depend on provider billing type, account eligibility and permissions. The current lookup requests up to six months of provider history. Google checks every returned billing setup; Meta follows invoice pagination. Search and export include the invoices returned by provider APIs.</p>
      </CardContent>
    </Card>
  );

  const renderInvoiceTable = (invoices: UnifiedInvoice[]) => (
    <TableContainer className="rounded-xl border border-slate-100">
      <Table size="small" aria-label="Advertising provider invoices">
        <TableHead>
          <TableRow className="bg-slate-50">
            {["Provider", "Account", "Invoice", "Issue date", "Due date", "Amount", "Status", "Action"].map((heading) => (
              <TableCell key={heading} sx={{ fontSize: 11, fontWeight: 800, color: "#64748b", whiteSpace: "nowrap", py: 1.4 }}>{heading}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {invoices.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="!py-8 text-center !text-sm !text-slate-500">No provider invoices match the current filters.</TableCell></TableRow>
          ) : invoices.map((invoice) => {
            const downloadKey = `${invoice.provider}-${invoice.accountId}-${invoice.id}`;
            return (
              <TableRow key={downloadKey} hover>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    {invoice.provider === "googleAds" ? <GoogleIcon sx={{ color: "#4285F4", fontSize: 19 }} /> : <FacebookRoundedIcon sx={{ color: "#1877F2", fontSize: 19 }} />}
                    {providerLabel(invoice.provider)}
                  </div>
                </TableCell>
                <TableCell sx={{ minWidth: 150 }}>
                  <p className="text-xs font-semibold text-slate-700">{invoice.accountName}</p>
                  <p className="text-[10px] text-slate-400">{invoice.accountIds.length > 1 ? `${invoice.accountIds.length} connected accounts` : invoice.accountId}</p>
                </TableCell>
                <TableCell sx={{ fontSize: 12, fontWeight: 650, color: "#334155" }}>{invoice.invoiceNumber}</TableCell>
                <TableCell sx={{ fontSize: 12, color: "#475569", whiteSpace: "nowrap" }}>{formatDate(invoice.issueDate)}</TableCell>
                <TableCell sx={{ fontSize: 12, color: "#475569", whiteSpace: "nowrap" }}>{formatDate(invoice.dueDate)}</TableCell>
                <TableCell sx={{ fontSize: 12, fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}>
                  <div>{formatMoney(invoice.amount, invoice.currency)}</div>
                  <div className="mt-0.5 text-[10px] font-normal text-slate-400">{invoice.amountLabel}</div>
                </TableCell>
                <TableCell>{invoice.status ? <StatusChip status={invoice.status} /> : <Chip size="small" label="Status not provided" variant="outlined" />}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button size="small" variant="text" startIcon={<VisibilityRoundedIcon />} onClick={() => setSelectedInvoice(invoice)} sx={{ borderRadius: 2, textTransform: "none", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", minWidth: 0 }}>Details</Button>
                    {isDemoMode || invoice.downloadPath ? (
                      <Button
                        size="small"
                        variant="outlined"
                        color={isDemoMode ? "secondary" : "primary"}
                        startIcon={downloadingInvoice === downloadKey ? <CircularProgress size={13} /> : <DownloadRoundedIcon />}
                        disabled={downloadingInvoice !== null}
                        onClick={() => void handleDownload(invoice)}
                        sx={{ borderRadius: 2, textTransform: "none", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}
                      >{isDemoMode ? "Demo PDF" : "Download"}</Button>
                    ) : <Typography variant="caption" color="text.secondary">PDF unavailable</Typography>}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );


  const renderGooglePanel = (detail = false) => {
    if (!google) return null;
    const billing = google.billing;
    const activeSetup = billing?.billingSetups[0];
    const primaryBudget = billing?.accountBudgets[0];
    return (
      <Card variant="outlined" className="rounded-2xl border-slate-200 bg-white shadow-[0_3px_16px_rgba(15,23,42,0.04)]" sx={{ borderRadius: 3 }}>
        <CardContent className="!p-5 md:!p-6">
          <ProviderHeader provider="googleAds" status={google.status} />
          {google.account && <p className="mt-3 text-xs text-slate-500">{google.account.name} · {google.account.id}</p>}
          {billing?.lastSyncedAt && <p className="mt-1 text-[11px] text-slate-400">{isDemoMode ? "Demo sample · not synced with Google Ads" : `Last synced: ${formatDateTime(billing.lastSyncedAt)}`}</p>}
          <Divider sx={{ my: 2.5 }} />
          {google.status !== "connected" ? (
            <Alert severity="info" sx={{ borderRadius: 2.5 }}>{google.status === "not_connected" ? "Connect Google Ads to retrieve its billing information." : google.status === "no_account" ? "Select a Google Ads account to view billing details." : "The Google Ads connection needs attention. Reconnect it from Provider Settings."}</Alert>
          ) : (
            <>
              {billing?.message && <Alert severity={billing.availability === "error" ? "error" : billing.availability === "permission_required" ? "warning" : "info"} sx={{ mb: 2, borderRadius: 2.5 }}>{billing.message}</Alert>}
              {billing?.reportingSpendMessage && <Alert severity={billing.reportingSpendAvailability === "error" ? "error" : billing.reportingSpendAvailability === "permission_required" ? "warning" : "info"} sx={{ mb: 2, borderRadius: 2.5 }}>{billing.reportingSpendMessage}</Alert>}
              <div className={`grid gap-4 ${detail ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-3"}`}>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500">Billing setup status</p>
                  {activeSetup ? <div className="mt-2"><StatusChip status={activeSetup.status} /><p className="mt-2 text-xs text-slate-500">{activeSetup.endDateTime ? `Ends ${formatDate(activeSetup.endDateTime)}` : activeSetup.startDateTime ? `Started ${formatDate(activeSetup.startDateTime)}` : "Dates not provided"}</p></div> : <p className="mt-2 text-sm font-semibold text-slate-800">{availabilityLabel(billing?.availability)}</p>}
                  {activeSetup?.paymentsAccountId && <p className="mt-2 text-xs text-slate-600">Payments account {activeSetup.paymentsAccountId}</p>}
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500">Payments profile</p>
                  <p className="mt-2 text-sm font-bold text-slate-900">{activeSetup?.paymentsProfileName || "Not provided"}</p>
                  <p className="mt-1 break-all text-xs text-slate-500">{activeSetup?.paymentsProfileId ? `Profile ${activeSetup.paymentsProfileId}` : "Available details depend on the billing setup."}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500">Account-level budget</p>
                  {primaryBudget ? <>
                    <p className="mt-2 text-lg font-bold text-slate-900">{formatMoney(primaryBudget.approvedSpendingLimit, primaryBudget.currency || billing?.currency)}</p>
                    <p className="mt-1 text-xs text-slate-500">Approved limit · {primaryBudget.status || "Status unavailable"}</p>
                    {primaryBudget.adjustedSpendingLimit !== null && <p className="mt-1 text-xs text-slate-500">Adjusted limit: {formatMoney(primaryBudget.adjustedSpendingLimit, primaryBudget.currency || billing?.currency)}</p>}
                  </> : <p className="mt-2 text-sm font-semibold text-slate-800">Not available</p>}
                </div>
              </div>
              {detail && billing?.accountBudgets && billing.accountBudgets.length > 0 && (
                <div className="mt-6">
                  <SectionTitle title="Account budget details" subtitle="These are Google Ads account-level billing budgets, not individual campaign budgets." />
                  <div className="space-y-2">
                    {billing.accountBudgets.map((budget) => (
                      <div key={budget.id} className="grid gap-2 rounded-xl border border-slate-100 p-3 text-xs md:grid-cols-4">
                        <div><p className="text-slate-400">Budget</p><p className="mt-1 font-semibold text-slate-800">{budget.name || budget.id}</p></div>
                        <div><p className="text-slate-400">Approved limit</p><p className="mt-1 font-semibold text-slate-800">{formatMoney(budget.approvedSpendingLimit, budget.currency || billing.currency)}</p></div>
                        <div><p className="text-slate-400">Adjusted / proposed</p><p className="mt-1 font-semibold text-slate-800">{formatMoney(budget.adjustedSpendingLimit ?? budget.proposedSpendingLimit, budget.currency || billing.currency)}</p></div>
                        <div><p className="text-slate-400">Status / period</p><p className="mt-1 font-semibold text-slate-800">{budget.status || "Unknown"} · {formatDate(budget.startDateTime)} – {formatDate(budget.endDateTime)}</p></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">Manage Google Ads payments</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">Add or update payment methods and make eligible payments securely in Google Ads.</p>
                </div>
                {isDemoMode ? <Chip color="warning" variant="outlined" label="Unavailable in demo preview" /> : <Button component="a" href={GOOGLE_BILLING_URL} target="_blank" rel="noreferrer" variant="contained" endIcon={<OpenInNewRoundedIcon />} sx={{ borderRadius: 2.5, textTransform: "none", fontWeight: 700, bgcolor: "#4338ca", whiteSpace: "nowrap", "&:hover": { bgcolor: "#3730a3" } }}>Open Google Ads Billing</Button>}
              </div>
              {detail && (
                <div className="mt-6">
                  <SectionTitle title="Google Ads invoices" subtitle="Google invoice history is available through the API for eligible monthly-invoiced accounts." />
                  {billing?.invoicesMessage && <Alert severity={billing.invoicesAvailability === "permission_required" ? "warning" : "info"} sx={{ mb: 2, borderRadius: 2.5 }}>{billing.invoicesMessage}</Alert>}
                  {billing?.invoices.length ? renderInvoiceTable(allInvoices.filter((invoice) => invoice.provider === "googleAds")) : null}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderMetaPanel = (detail = false) => {
    if (!meta) return null;
    const billing = meta.billing;
    const cap = billing?.spendCap;
    const amountSpent = billing?.amountSpentLifetimeOrCap;
    const capPercent = cap && cap > 0 && amountSpent !== null && amountSpent !== undefined
      ? Math.min(100, Math.max(0, amountSpent / cap * 100))
      : null;
    return (
      <Card variant="outlined" className="rounded-2xl border-slate-200 bg-white shadow-[0_3px_16px_rgba(15,23,42,0.04)]" sx={{ borderRadius: 3 }}>
        <CardContent className="!p-5 md:!p-6">
          <ProviderHeader provider="metaAds" status={meta.status} />
          {meta.account && <p className="mt-3 text-xs text-slate-500">{meta.account.name} · {meta.account.id}</p>}
          {billing?.lastSyncedAt && <p className="mt-1 text-[11px] text-slate-400">{isDemoMode ? "Demo sample · not synced with Meta" : `Last synced: ${formatDateTime(billing.lastSyncedAt)}`}</p>}
          <Divider sx={{ my: 2.5 }} />
          {meta.status !== "connected" ? (
            <Alert severity="info" sx={{ borderRadius: 2.5 }}>{meta.status === "not_connected" ? "Connect Meta Ads to retrieve its billing information." : meta.status === "no_account" ? "Select a Meta Ads account to view billing details." : "The Meta Ads connection needs attention. Reconnect it from Provider Settings."}</Alert>
          ) : (
            <>
              {billing?.message && <Alert severity={billing.availability === "error" ? "error" : "info"} sx={{ mb: 2, borderRadius: 2.5 }}>{billing.message}</Alert>}
              {billing?.periodSpendMessage && <Alert severity={billing.periodSpendAvailability === "error" ? "error" : billing.periodSpendAvailability === "permission_required" ? "warning" : "info"} sx={{ mb: 2, borderRadius: 2.5 }}>{billing.periodSpendMessage}</Alert>}
              <div className={`grid gap-4 ${detail ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-3"}`}>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500">{billing?.balanceLabel || "Balance reported by Meta"}</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">{formatMoney(billing?.balance, billing?.currency)}</p>
                  <p className="mt-1 text-xs text-slate-500">Provider-reported balance; not a prepaid-credit guarantee.</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500">Account status</p>
                  <p className="mt-2 text-sm font-bold text-slate-900">{billing?.accountStatus.label || "Unknown"}</p>
                  <p className="mt-1 text-xs text-slate-500">Payment arrangement: {billing?.paymentArrangement === "prepaid" ? "Prepaid" : billing?.paymentArrangement === "postpay" ? "Automatic / postpay" : "Not identified"}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500">Account spend cap</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">{cap === 0 ? "No cap" : formatMoney(cap, billing?.currency)}</p>
                  {capPercent !== null ? <>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${capPercent}%` }} /></div>
                    <p className="mt-1 text-[11px] text-slate-500">{formatMoney(amountSpent, billing?.currency)} spent against cap · {capPercent.toFixed(1)}%</p>
                  </> : <p className="mt-1 text-xs text-slate-500">{amountSpent !== null && amountSpent !== undefined ? `${formatMoney(amountSpent, billing?.currency)} reported spent` : "Spend-cap usage unavailable"}</p>}
                </div>
              </div>
              {detail && (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 p-4">
                    <p className="text-xs font-semibold text-slate-500">Payment method</p>
                    <p className="mt-2 text-sm font-bold text-slate-900">{billing?.paymentMethod.displayString || billing?.paymentMethod.type || (billing?.paymentMethod.availability === "permission_required" ? "Manage permission required" : "Not provided by Meta")}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Only a provider-returned display label is shown. Full card, bank and payment credentials are never retrieved or stored.</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 p-4">
                    <p className="text-xs font-semibold text-slate-500">Tax information</p>
                    <p className="mt-2 text-sm font-bold text-slate-900">{billing?.tax.taxId ? `Tax ID ${billing.tax.taxId}` : "Not available"}</p>
                    <p className="mt-1 text-xs text-slate-500">Tax ID status code: {billing?.tax.taxIdStatus ?? "Not provided"}</p>
                  </div>
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">Manage Meta billing and payments</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">Review payment methods, settle balances and manage billing directly in Meta Business.</p>
                </div>
                {isDemoMode ? <Chip color="warning" variant="outlined" label="Unavailable in demo preview" /> : <Button component="a" href={META_BILLING_URL} target="_blank" rel="noreferrer" variant="contained" endIcon={<OpenInNewRoundedIcon />} sx={{ borderRadius: 2.5, textTransform: "none", fontWeight: 700, bgcolor: "#2563eb", whiteSpace: "nowrap", "&:hover": { bgcolor: "#1d4ed8" } }}>Open Meta Billing</Button>}
              </div>
              {detail && (
                <div className="mt-6">
                  <SectionTitle title="Meta Business invoices" subtitle="Invoices are returned only when the Business uses eligible monthly invoicing and the connected identity has finance access." />
                  {billing?.invoicesMessage && <Alert severity={billing.invoicesAvailability === "permission_required" ? "warning" : "info"} sx={{ mb: 2, borderRadius: 2.5 }}>{billing.invoicesMessage}</Alert>}
                  {billing?.invoices.length ? renderInvoiceTable(allInvoices.filter((invoice) => invoice.provider === "metaAds")) : null}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-full bg-slate-50/70 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-indigo-200"><CreditCardOutlinedIcon sx={{ fontSize: 28 }} /></div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-[30px]">Billing</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Track advertising spend, review provider invoices and manage billing securely on Google and Meta.</p>
              <p className="mt-2 text-xs text-slate-400">Reporting period: {dateText}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">Data view</span>
              <div className="flex h-10 items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                <Button size="small" variant={!isDemoMode ? "contained" : "text"} onClick={() => { setIsDemoMode(false); setGoogleAccountId(ALL_ACCOUNTS); setMetaAccountId(ALL_ACCOUNTS); setInvoicePage(0); setSelectedInvoice(null); setDownloadError(null); }} sx={{ height: 32, px: 1.5, borderRadius: 2, textTransform: "none", fontSize: 12, fontWeight: 700, boxShadow: !isDemoMode ? 1 : 0 }}>Live Data</Button>
                <Button size="small" variant={isDemoMode ? "contained" : "text"} color={isDemoMode ? "warning" : "inherit"} onClick={() => { setIsDemoMode(true); setGoogleAccountId(ALL_ACCOUNTS); setMetaAccountId(ALL_ACCOUNTS); setInvoicePage(0); setSelectedInvoice(null); setDownloadError(null); }} sx={{ height: 32, px: 1.5, borderRadius: 2, textTransform: "none", fontSize: 12, fontWeight: 700, boxShadow: isDemoMode ? 1 : 0 }}>Demo Preview</Button>
              </div>
            </div>
            <AccountPicker label="Google Ads account" accounts={displayData?.accounts.googleAds.items ?? []} value={googleAccountId} onChange={(event) => { setGoogleAccountId(event.target.value); setInvoicePage(0); }} />
            <AccountPicker label="Meta Ads account" accounts={displayData?.accounts.metaAds.items ?? []} value={metaAccountId} onChange={(event) => { setMetaAccountId(event.target.value); setInvoicePage(0); }} />
            <label className="flex min-w-[130px] flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">Reporting period</span>
              <Select size="small" value={range} onChange={(event) => setRange(event.target.value as RangeOption)} sx={{ borderRadius: 2.5, bgcolor: "white", fontSize: 13, "& .MuiSelect-select": { py: 1.15 } }}>
                <MenuItem value="7d">Last 7 days</MenuItem>
                <MenuItem value="30d">Last 30 days</MenuItem>
                <MenuItem value="90d">Last 90 days</MenuItem>
              </Select>
            </label>
            <Button variant="outlined" startIcon={loading ? <CircularProgress size={14} /> : <RefreshRoundedIcon />} disabled={loading || isDemoMode} onClick={() => setRefreshKey((value) => value + 1)} sx={{ height: 40, borderRadius: 2.5, textTransform: "none", fontWeight: 700, borderColor: "#dbe2ee", color: "#334155", bgcolor: "white" }}>Refresh</Button>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
          {(["overview", "googleAds", "metaAds"] as const).map((tab) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${activeTab === tab ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-indigo-200" : "text-slate-600 hover:bg-slate-50"}`}>
              {tab === "overview" ? <TrendingUpRoundedIcon sx={{ fontSize: 17 }} /> : tab === "googleAds" ? <GoogleIcon sx={{ fontSize: 17 }} /> : <FacebookRoundedIcon sx={{ fontSize: 17 }} />}
              {tab === "overview" ? "Overview" : providerLabel(tab)}
            </button>
          ))}
        </div>

        {isDemoMode && <Alert severity="warning" icon={<InfoOutlinedIcon />} sx={{ mb: 3, borderRadius: 2.5 }}>
          <strong>Demo preview — illustrative data only.</strong> These sample accounts, spend amounts, invoices and payment labels are fictional, not fetched from Google or Meta. Demo PDFs are generated locally and clearly marked as samples; they are not provider invoices and cannot be used for payment or tax purposes.
        </Alert>}
        {!isDemoMode && error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2.5 }}>{error}</Alert>}
        {downloadError && <Alert severity="error" onClose={() => setDownloadError(null)} sx={{ mb: 3, borderRadius: 2.5 }}>{downloadError}</Alert>}

        {loading && !displayData ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white">
            <CircularProgress size={30} />
            <p className="text-sm font-medium text-slate-500">Loading provider billing information…</p>
          </div>
        ) : !displayData ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Billing information is not available right now.</div>
        ) : activeTab === "overview" ? (
          <>
            <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Total advertising spend" value={totalSpendLabel} description={totalSpendDescription} icon={<AccountBalanceWalletOutlinedIcon />} accent="indigo" />
              <MetricCard title="Google Ads spend" value={googleSpend} description={groupedSpendDescription(googleSpendByCurrency, `${googleAccountsData.length} Google account(s) · selected reporting period`)} icon={<GoogleIcon />} accent="blue" />
              <MetricCard title="Meta Ads spend" value={metaSpend} description={groupedSpendDescription(metaSpendByCurrency, `${metaAccountsData.length} Meta account(s) · selected reporting period`)} icon={<FacebookRoundedIcon />} accent="violet" />
              <MetricCard title={metaBalanceLabel} value={metaBalanceValue} description={metaAccountsData.length > 1 ? "Balances remain per-account; prepaid and postpay meanings differ." : metaBilling?.paymentArrangement === "prepaid" ? "Provider-reported balance; not assumed to be remaining credit." : "Provider-reported amount due when available."} icon={<ReceiptLongOutlinedIcon />} accent="emerald" />
            </div>

            {renderSpendAnalytics()}
            {renderAccountRollup()}
            {renderBillingIntelligence()}
            {renderInvoiceManager()}
          </>
        ) : activeTab === "googleAds" ? (
          <div className="space-y-5">
            {googleAccountId === ALL_ACCOUNTS ? renderAccountRollup("googleAds") : renderGooglePanel(true)}
            {renderSpendAnalytics("googleAds")}
            {renderBillingIntelligence("googleAds")}
            <Alert icon={<InfoOutlinedIcon />} severity="info" sx={{ borderRadius: 2.5 }}>Google Ads API billing setup, account budget and invoice resources are available for eligible monthly-invoiced accounts. For automatic and manual payment accounts, use Google Ads Billing to manage payment methods and payments.</Alert>
          </div>
        ) : (
          <div className="space-y-5">
            {metaAccountId === ALL_ACCOUNTS ? renderAccountRollup("metaAds") : renderMetaPanel(true)}
            {renderSpendAnalytics("metaAds")}
            {renderBillingIntelligence("metaAds")}
            <Alert icon={<InfoOutlinedIcon />} severity="info" sx={{ borderRadius: 2.5 }}>Meta billing fields vary by account type and permissions. The payment method label is shown only when Meta makes it available; payment settings and transactions remain on Meta.</Alert>
          </div>
        )}

        <div className="mt-6 flex flex-col justify-between gap-3 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-sky-50 p-4 sm:flex-row sm:items-center sm:px-5">
          <div className="flex items-start gap-3"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600"><InfoOutlinedIcon /></div><div><p className="text-sm font-semibold text-slate-900">{isDemoMode ? "Demo preview is separate from provider billing" : "Your provider payments stay with Google and Meta"}</p><p className="mt-1 text-xs leading-5 text-slate-600">{isDemoMode ? "Sample records are shown for presentation only. Switch to Live Data to view connected Google Ads and Meta Ads accounts." : "AdSyntra displays available billing information. It does not charge provider bills, process payments or store card, bank or UPI credentials."}</p></div></div>
          {!isDemoMode && <div className="flex flex-wrap gap-2">
            <Button component="a" href={GOOGLE_BILLING_URL} target="_blank" rel="noreferrer" size="small" endIcon={<OpenInNewRoundedIcon />} sx={{ textTransform: "none", fontWeight: 700 }}>Google Billing</Button>
            <Button component="a" href={META_BILLING_URL} target="_blank" rel="noreferrer" size="small" endIcon={<OpenInNewRoundedIcon />} sx={{ textTransform: "none", fontWeight: 700 }}>Meta Billing</Button>
          </div>}
        </div>
      </div>
      <Drawer
        anchor="right"
        open={Boolean(selectedInvoice)}
        onClose={() => setSelectedInvoice(null)}
        PaperProps={{
          sx: {
            width: { xs: "100%", sm: 460, md: 500 },
            maxWidth: "100vw",
            p: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            bgcolor: "#f8fafc",
          },
        }}
      >
        {selectedInvoice && (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Invoice details</p>
                  {isDemoMode && <Chip size="small" color="warning" label="DEMO SAMPLE" />}
                </div>
                <h2 className="mt-1 break-all text-lg font-bold tracking-tight text-slate-950">{selectedInvoice.invoiceNumber}</h2>
                <p className="mt-1 text-xs text-slate-500">{providerLabel(selectedInvoice.provider)} · {selectedInvoice.accountName}</p>
              </div>
              <IconButton aria-label="Close invoice details" onClick={() => setSelectedInvoice(null)} size="small" sx={{ border: "1px solid #e2e8f0", bgcolor: "white" }}>
                <CloseRoundedIcon />
              </IconButton>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
              {isDemoMode && (
                <Alert severity="warning" sx={{ borderRadius: 2.5, fontSize: 12 }}>
                  Sample invoice for presentation only. This is not an invoice issued by Google or Meta.
                </Alert>
              )}

              <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
                <p className="text-xs font-semibold text-indigo-700">{selectedInvoice.amountLabel}</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{formatMoney(selectedInvoice.amount, selectedInvoice.currency)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {selectedInvoice.status
                    ? <StatusChip status={selectedInvoice.status} />
                    : <Chip size="small" variant="outlined" label="Payment status not provided" />}
                  {selectedInvoice.invoiceType && <Chip size="small" variant="outlined" label={selectedInvoice.invoiceType} />}
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h3 className="text-sm font-bold text-slate-900">Invoice information</h3>
                </div>
                <div className="divide-y divide-slate-100 px-4">
                  {[
                    ["Provider", providerLabel(selectedInvoice.provider)],
                    ["Ad account", selectedInvoice.accountName],
                    [selectedInvoice.accountIds.length > 1 ? "Connected account IDs" : "Account ID", selectedInvoice.accountIds.join(", ")],
                    ...(selectedInvoice.businessId ? [["Business ID", selectedInvoice.businessId]] : []),
                    ["Invoice number", selectedInvoice.invoiceNumber],
                    ["Billing period", selectedInvoice.billingPeriod],
                    ["Issue date", formatDate(selectedInvoice.issueDate)],
                    ["Due date", formatDate(selectedInvoice.dueDate)],
                    ["Currency", selectedInvoice.currency ?? "Not provided"],
                    ...(selectedInvoice.invoiceType ? [["Invoice type", selectedInvoice.invoiceType]] : []),
                    ...(selectedInvoice.status ? [["Payment status", selectedInvoice.status]] : [["Payment status", "Not provided by provider"]]),
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-4 py-3 text-xs sm:text-sm">
                      <span className="shrink-0 text-slate-500">{label}</span>
                      <span className="max-w-[65%] break-all text-right font-semibold text-slate-800">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-bold text-slate-900">Amount breakdown</h3>
                {selectedInvoice.subtotal !== null && <div className="flex justify-between gap-3 text-sm"><span className="text-slate-500">Subtotal</span><span className="font-semibold text-slate-800">{formatMoney(selectedInvoice.subtotal, selectedInvoice.currency)}</span></div>}
                {selectedInvoice.tax !== null && <div className="flex justify-between gap-3 text-sm"><span className="text-slate-500">Tax</span><span className="font-semibold text-slate-800">{formatMoney(selectedInvoice.tax, selectedInvoice.currency)}</span></div>}
                {selectedInvoice.amount !== null && <div className="flex justify-between gap-3 border-t border-slate-100 pt-3 text-sm"><span className="font-semibold text-slate-700">Invoice total</span><span className="font-bold text-slate-950">{formatMoney(selectedInvoice.amount, selectedInvoice.currency)}</span></div>}
                {selectedInvoice.amountDue !== null && <div className="flex justify-between gap-3 text-sm"><span className="text-slate-500">Amount due</span><span className="font-semibold text-slate-800">{formatMoney(selectedInvoice.amountDue, selectedInvoice.currency)}</span></div>}
                {selectedInvoice.subtotal === null && selectedInvoice.tax === null && selectedInvoice.amountDue === null && <p className="text-xs leading-5 text-slate-500">The provider did not return a separate subtotal, tax or amount-due breakdown for this invoice.</p>}
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
              {isDemoMode ? (
                <Button
                  fullWidth
                  variant="contained"
                  color="secondary"
                  startIcon={downloadingInvoice ? <CircularProgress size={16} color="inherit" /> : <DownloadRoundedIcon />}
                  disabled={downloadingInvoice !== null}
                  onClick={() => void handleDownload(selectedInvoice)}
                  sx={{ borderRadius: 2.5, py: 1.25, textTransform: "none", fontWeight: 800 }}
                >
                  Download sample PDF
                </Button>
              ) : selectedInvoice.downloadPath ? (
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={downloadingInvoice ? <CircularProgress size={16} color="inherit" /> : <DownloadRoundedIcon />}
                  disabled={downloadingInvoice !== null}
                  onClick={() => void handleDownload(selectedInvoice)}
                  sx={{ borderRadius: 2.5, py: 1.25, textTransform: "none", fontWeight: 800 }}
                >
                  Download provider invoice PDF
                </Button>
              ) : (
                <Alert severity="info" sx={{ borderRadius: 2.5 }}>A downloadable PDF was not provided by the provider for this invoice.</Alert>
              )}
              <p className="mt-3 text-center text-[10px] leading-4 text-slate-400">
                {isDemoMode
                  ? "DEMO PDF only · generated locally by AdSyntra · not issued by Google or Meta."
                  : "Invoice data is supplied by the advertising provider. AdSyntra does not issue, alter or settle provider invoices."}
              </p>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}


