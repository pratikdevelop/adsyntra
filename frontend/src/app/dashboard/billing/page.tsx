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

type GoogleBilling = {
  availability: BillingAvailability;
  message: string | null;
  currency: string | null;
  reportingSpend: number | null;
  currencyIsMixed?: boolean;
  reportingSpendAvailability: "available" | "no_data" | "permission_required" | "error";
  reportingSpendMessage: string | null;
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

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
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
  }, [getToken, isLoaded, isSignedIn, range, googleAccountId, metaAccountId, refreshKey]);

  const google = data?.providers.googleAds;
  const meta = data?.providers.metaAds;
  const googleBilling = google?.billing;
  const metaBilling = meta?.billing;
  const googleAccountsData = google?.accounts?.length
    ? google.accounts
    : google?.account && google.billing
      ? [{ account: google.account, status: google.status, billing: google.billing }]
      : [];
  const metaAccountsData = meta?.accounts?.length
    ? meta.accounts
    : meta?.account && meta.billing
      ? [{ account: meta.account, status: meta.status, billing: meta.billing }]
      : [];

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
        downloadAvailable: invoice.pdfAvailable,
        downloadPath: invoice.pdfAvailable
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
          downloadAvailable: invoice.downloadAvailable,
          downloadPath: invoice.downloadAvailable
            ? `/api/billing/meta/${encodeURIComponent(entry.account.id)}/invoices/${encodeURIComponent(invoice.id)}/download?businessId=${encodeURIComponent(invoice.businessId)}`
            : null,
        });
      }
    }
    return [...googleInvoices, ...metaInvoiceMap.values()].sort((a, b) => (b.issueDate ?? "").localeCompare(a.issueDate ?? ""));
  }, [googleAccountsData, metaAccountsData]);

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
    if (!invoice.downloadPath) return;
    setDownloadingInvoice(`${invoice.provider}-${invoice.accountId}-${invoice.id}`);
    setDownloadError(null);
    try {
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
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${invoice.provider === "googleAds" ? "google" : "meta"}-invoice-${invoice.invoiceNumber}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadFailure) {
      setDownloadError(downloadFailure instanceof Error ? downloadFailure.message : "Invoice download failed.");
    } finally {
      setDownloadingInvoice(null);
    }
  }, [getToken]);

  const exportFilteredInvoices = () => {
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

  const dateText = data?.range ? `${formatDate(data.range.since)} – ${formatDate(data.range.until)}` : "Selected reporting period";

  const renderAccountRollup = (providerFilter?: ProviderKey) => {
    const rows = [
      ...(data?.accounts.googleAds.items ?? []).filter((account) => googleAccountId === ALL_ACCOUNTS || account.id === googleAccountId).map((account) => {
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
          status: loaded?.status ?? (data?.accounts.googleAds.connected ? "Not synced" : "Not connected"),
        };
      }),
      ...(data?.accounts.metaAds.items ?? []).filter((account) => metaAccountId === ALL_ACCOUNTS || account.id === metaAccountId).map((account) => {
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
          status: loaded?.status ?? (data?.accounts.metaAds.connected ? "Not synced" : "Not connected"),
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
              <TableHead><TableRow className="bg-slate-50">{["Provider", "Account", "Currency", "Period spend", "Billing status", "Connection"].map((heading) => <TableCell key={heading} sx={{ fontSize: 11, fontWeight: 800, color: "#64748b", whiteSpace: "nowrap", py: 1.4 }}>{heading}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={6} className="!py-8 text-center !text-sm !text-slate-500">No advertising accounts were found for this selection.</TableCell></TableRow> : rows.map((row) => (
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

  const renderInvoiceManager = () => (
    <Card variant="outlined" className="mb-6 overflow-hidden rounded-2xl border-slate-200 bg-white shadow-[0_3px_16px_rgba(15,23,42,0.04)]" sx={{ borderRadius: 3 }}>
      <CardContent className="!p-5 md:!p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><ReceiptLongOutlinedIcon sx={{ color: "#4338ca" }} /><div><h2 className="text-base font-bold text-slate-900">Invoice management</h2><p className="mt-0.5 text-xs text-slate-500">Search, filter, inspect, download and export invoices returned by provider APIs.</p></div></div>
          <div className="flex items-center gap-2"><Chip size="small" variant="outlined" label={`${filteredInvoices.length} of ${allInvoices.length} invoices`} /><Button size="small" variant="outlined" startIcon={<FileDownloadOutlinedIcon />} disabled={filteredInvoices.length === 0} onClick={exportFilteredInvoices} sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700 }}>Export CSV</Button></div>
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
        <p className="mt-1 text-[11px] leading-5 text-slate-400">Invoice availability and history length depend on provider billing type, account eligibility and permissions. The current lookup requests up to six months of provider history; search and export include only invoices currently returned to AdSyntra.</p>
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
                    {invoice.downloadPath ? (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={downloadingInvoice === downloadKey ? <CircularProgress size={13} /> : <DownloadRoundedIcon />}
                        disabled={downloadingInvoice !== null}
                        onClick={() => void handleDownload(invoice)}
                        sx={{ borderRadius: 2, textTransform: "none", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}
                      >Download</Button>
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
                <Button component="a" href={GOOGLE_BILLING_URL} target="_blank" rel="noreferrer" variant="contained" endIcon={<OpenInNewRoundedIcon />} sx={{ borderRadius: 2.5, textTransform: "none", fontWeight: 700, bgcolor: "#4338ca", whiteSpace: "nowrap", "&:hover": { bgcolor: "#3730a3" } }}>Open Google Ads Billing</Button>
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
                <Button component="a" href={META_BILLING_URL} target="_blank" rel="noreferrer" variant="contained" endIcon={<OpenInNewRoundedIcon />} sx={{ borderRadius: 2.5, textTransform: "none", fontWeight: 700, bgcolor: "#2563eb", whiteSpace: "nowrap", "&:hover": { bgcolor: "#1d4ed8" } }}>Open Meta Billing</Button>
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
            <AccountPicker label="Google Ads account" accounts={data?.accounts.googleAds.items ?? []} value={googleAccountId} onChange={(event) => { setGoogleAccountId(event.target.value); setInvoicePage(0); }} />
            <AccountPicker label="Meta Ads account" accounts={data?.accounts.metaAds.items ?? []} value={metaAccountId} onChange={(event) => { setMetaAccountId(event.target.value); setInvoicePage(0); }} />
            <label className="flex min-w-[130px] flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">Reporting period</span>
              <Select size="small" value={range} onChange={(event) => setRange(event.target.value as RangeOption)} sx={{ borderRadius: 2.5, bgcolor: "white", fontSize: 13, "& .MuiSelect-select": { py: 1.15 } }}>
                <MenuItem value="7d">Last 7 days</MenuItem>
                <MenuItem value="30d">Last 30 days</MenuItem>
                <MenuItem value="90d">Last 90 days</MenuItem>
              </Select>
            </label>
            <Button variant="outlined" startIcon={loading ? <CircularProgress size={14} /> : <RefreshRoundedIcon />} disabled={loading} onClick={() => setRefreshKey((value) => value + 1)} sx={{ height: 40, borderRadius: 2.5, textTransform: "none", fontWeight: 700, borderColor: "#dbe2ee", color: "#334155", bgcolor: "white" }}>Refresh</Button>
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

        {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2.5 }}>{error}</Alert>}
        {downloadError && <Alert severity="error" onClose={() => setDownloadError(null)} sx={{ mb: 3, borderRadius: 2.5 }}>{downloadError}</Alert>}

        {loading && !data ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white">
            <CircularProgress size={30} />
            <p className="text-sm font-medium text-slate-500">Loading provider billing information…</p>
          </div>
        ) : !data ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Billing information is not available right now.</div>
        ) : activeTab === "overview" ? (
          <>
            <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Total advertising spend" value={totalSpendLabel} description={totalSpendDescription} icon={<AccountBalanceWalletOutlinedIcon />} accent="indigo" />
              <MetricCard title="Google Ads spend" value={googleSpend} description={groupedSpendDescription(googleSpendByCurrency, `${googleAccountsData.length} Google account(s) · selected reporting period`)} icon={<GoogleIcon />} accent="blue" />
              <MetricCard title="Meta Ads spend" value={metaSpend} description={groupedSpendDescription(metaSpendByCurrency, `${metaAccountsData.length} Meta account(s) · selected reporting period`)} icon={<FacebookRoundedIcon />} accent="violet" />
              <MetricCard title={metaBalanceLabel} value={metaBalanceValue} description={metaAccountsData.length > 1 ? "Balances remain per-account; prepaid and postpay meanings differ." : metaBilling?.paymentArrangement === "prepaid" ? "Provider-reported balance; not assumed to be remaining credit." : "Provider-reported amount due when available."} icon={<ReceiptLongOutlinedIcon />} accent="emerald" />
            </div>

            {renderAccountRollup()}
            {renderInvoiceManager()}
          </>
        ) : activeTab === "googleAds" ? (
          <div className="space-y-5">
            {googleAccountId === ALL_ACCOUNTS ? renderAccountRollup("googleAds") : renderGooglePanel(true)}
            <Alert icon={<InfoOutlinedIcon />} severity="info" sx={{ borderRadius: 2.5 }}>Google Ads API billing setup, account budget and invoice resources are available for eligible monthly-invoiced accounts. For automatic and manual payment accounts, use Google Ads Billing to manage payment methods and payments.</Alert>
          </div>
        ) : (
          <div className="space-y-5">
            {metaAccountId === ALL_ACCOUNTS ? renderAccountRollup("metaAds") : renderMetaPanel(true)}
            <Alert icon={<InfoOutlinedIcon />} severity="info" sx={{ borderRadius: 2.5 }}>Meta billing fields vary by account type and permissions. The payment method label is shown only when Meta makes it available; payment settings and transactions remain on Meta.</Alert>
          </div>
        )}

        <div className="mt-6 flex flex-col justify-between gap-3 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-sky-50 p-4 sm:flex-row sm:items-center sm:px-5">
          <div className="flex items-start gap-3"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600"><InfoOutlinedIcon /></div><div><p className="text-sm font-semibold text-slate-900">Your provider payments stay with Google and Meta</p><p className="mt-1 text-xs leading-5 text-slate-600">AdSyntra displays available billing information. It does not charge provider bills, process payments or store card, bank or UPI credentials.</p></div></div>
          <div className="flex flex-wrap gap-2">
            <Button component="a" href={GOOGLE_BILLING_URL} target="_blank" rel="noreferrer" size="small" endIcon={<OpenInNewRoundedIcon />} sx={{ textTransform: "none", fontWeight: 700 }}>Google Billing</Button>
            <Button component="a" href={META_BILLING_URL} target="_blank" rel="noreferrer" size="small" endIcon={<OpenInNewRoundedIcon />} sx={{ textTransform: "none", fontWeight: 700 }}>Meta Billing</Button>
          </div>
        </div>
      </div>
      <Drawer
        anchor="right"
        open={Boolean(selectedInvoice)}
        onClose={() => setSelectedInvoice(null)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 500 }, p: 3, overflowY: "auto" } }}
      >
        {selectedInvoice && (
          <div className="flex min-h-full flex-col">
            <div className="mb-6 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Invoice details</p>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">{selectedInvoice.invoiceNumber}</h2>
                <p className="mt-1 text-xs text-slate-500">{providerLabel(selectedInvoice.provider)} · {selectedInvoice.accountName}</p>
              </div>
              <IconButton aria-label="Close invoice details" onClick={() => setSelectedInvoice(null)} size="small"><CloseRoundedIcon /></IconButton>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-5">
              <p className="text-xs font-semibold text-indigo-700">{selectedInvoice.amountLabel}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{formatMoney(selectedInvoice.amount, selectedInvoice.currency)}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">{selectedInvoice.status ? <StatusChip status={selectedInvoice.status} /> : <Chip size="small" variant="outlined" label="Payment status not provided" />}{selectedInvoice.invoiceType && <Chip size="small" variant="outlined" label={selectedInvoice.invoiceType} />}</div>
            </div>
            <div className="mt-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Invoice information</h3>
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
                <div key={label} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 text-sm">
                  <span className="text-slate-500">{label}</span><span className="max-w-[60%] break-all text-right font-semibold text-slate-800">{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 space-y-3 rounded-2xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-900">Amount breakdown</h3>
              {selectedInvoice.subtotal !== null && <div className="flex justify-between gap-3 text-sm"><span className="text-slate-500">Subtotal</span><span className="font-semibold text-slate-800">{formatMoney(selectedInvoice.subtotal, selectedInvoice.currency)}</span></div>}
              {selectedInvoice.tax !== null && <div className="flex justify-between gap-3 text-sm"><span className="text-slate-500">Tax</span><span className="font-semibold text-slate-800">{formatMoney(selectedInvoice.tax, selectedInvoice.currency)}</span></div>}
              {selectedInvoice.amount !== null && <div className="flex justify-between gap-3 border-t border-slate-100 pt-3 text-sm"><span className="font-semibold text-slate-700">Invoice total</span><span className="font-bold text-slate-950">{formatMoney(selectedInvoice.amount, selectedInvoice.currency)}</span></div>}
              {selectedInvoice.amountDue !== null && <div className="flex justify-between gap-3 text-sm"><span className="text-slate-500">Amount due</span><span className="font-semibold text-slate-800">{formatMoney(selectedInvoice.amountDue, selectedInvoice.currency)}</span></div>}
              {selectedInvoice.subtotal === null && selectedInvoice.tax === null && selectedInvoice.amountDue === null && <p className="text-xs leading-5 text-slate-500">The provider did not return a separate subtotal, tax or amount-due breakdown for this invoice.</p>}
            </div>
            <div className="mt-auto pt-6">
              {selectedInvoice.downloadPath ? <Button fullWidth variant="contained" startIcon={<DownloadRoundedIcon />} disabled={downloadingInvoice !== null} onClick={() => void handleDownload(selectedInvoice)} sx={{ borderRadius: 2.5, py: 1.2, textTransform: "none", fontWeight: 700 }}>Download provider invoice PDF</Button> : <Alert severity="info" sx={{ borderRadius: 2.5 }}>A downloadable PDF was not provided by the provider for this invoice.</Alert>}
              <p className="mt-3 text-[11px] leading-5 text-slate-400">Invoice data is supplied by the advertising provider. AdSyntra does not issue, alter or settle provider invoices.</p>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}