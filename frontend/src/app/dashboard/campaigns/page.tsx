"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Divider,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Select,
} from "@mui/material";

import { getCampaigns } from "@/lib/campaign-api";

type ProviderKey = "googleAds" | "metaAds";
type JsonRecord = Record<string, unknown>;
type ChildRecord = Record<string, any>;

interface GlobalCampaign {
  id: string;
  provider: ProviderKey | string;
  accountId?: string | null;
  name: string;
  status?: string | null;
  effectiveStatus?: string | null;
  objective?: string | null;
  campaignType?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  source?: JsonRecord | null;
  bidStrategy?: string | null;
  biddingSystemStatus?: string | null;
}

interface ProviderPagination {
  hasMore?: boolean;
  nextToken?: string | null;
  totalResults?: number | null;
}

interface ProviderResult {
  success?: boolean;
  connected?: boolean;
  status?: string;
  accountId?: string | null;
  data?: unknown;
  error?: unknown;
  campaigns?: GlobalCampaign[];
  pagination?: ProviderPagination;
  account?: {
    id?: string;
    name?: string;
    currency?: string | null;
    timezone?: string | null;
  } | null;
}

interface GlobalCampaignsApiResponse {
  success: boolean;
  message?: string;
  providers?: Partial<Record<ProviderKey, ProviderResult>>;
  campaigns?: GlobalCampaign[];
  stats?: {
    total?: number;
    providersSucceeded?: number;
    providersFailed?: number;
  };
}

interface CampaignsPageProps {
  pageTitle?: string;
  pageDescription?: string;
  initialStatusFilter?: string;
}

const DEFAULT_DESCRIPTION =
  "View Google Ads and Meta Ads campaigns together in one table.";

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object"
    ? (value as JsonRecord)
    : null;
}

function extractProviderCampaigns(
  providerResult: ProviderResult | undefined,
): GlobalCampaign[] {
  if (!providerResult) return [];
  const data = providerResult.data;
  if (Array.isArray(data)) return data as GlobalCampaign[];
  const dataRecord = asRecord(data);
  if (Array.isArray(dataRecord?.campaigns)) {
    return dataRecord.campaigns as GlobalCampaign[];
  }
  if (Array.isArray(providerResult.campaigns)) {
    return providerResult.campaigns;
  }
  return [];
}
function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normalizeProviderCampaign(
  value: GlobalCampaign,
  provider: ProviderKey,
  fallbackAccountId?: string | null,
): GlobalCampaign {
  const raw = asRecord(value) ?? {};
  const rawSource = asRecord(raw.source);
  const source = rawSource ?? raw;
  const nestedRaw = asRecord(raw.raw);
  const nestedCampaign =
    asRecord(raw.campaign) ?? asRecord(nestedRaw?.campaign);
  const rawBidding = asRecord(raw.bidding);

  const idValue = raw.id ?? raw.resourceName ?? raw.resource_name;
  const id = typeof idValue === "string" ? idValue : String(idValue ?? "");
  const accountIdValue =
    raw.accountId ?? raw.account_id ?? fallbackAccountId ?? null;
  const effectiveStatus =
    raw.effectiveStatus ?? raw.effective_status ?? raw.status ?? null;

  // Google campaign type is exposed by the service as channelType.
  // Meta campaign listing does not expose a matching channel-type field.
  const campaignType = firstString(
    raw.campaignType,
    raw.channelType,
    raw.advertisingChannelType,
    raw.advertising_channel_type,
    nestedCampaign?.advertisingChannelType,
    nestedCampaign?.advertising_channel_type,
    raw.providerCampaignType,
  );

  // Google uses bidding.strategy; Meta exposes bid_strategy directly.
  const bidStrategy = firstString(
    rawBidding?.strategy,
    raw.bid_strategy,
    raw.bidStrategy,
    raw.biddingStrategyType,
    nestedCampaign?.biddingStrategyType,
    nestedCampaign?.bid_strategy,
  );

  const biddingSystemStatus = firstString(
    rawBidding?.systemStatus,
    raw.biddingStrategySystemStatus,
    nestedCampaign?.biddingStrategySystemStatus,
  );

  return {
    ...raw,
    id,
    provider,
    accountId: typeof accountIdValue === "string" ? accountIdValue : null,
    name: typeof raw.name === "string" ? raw.name : "Untitled campaign",
    status: typeof raw.status === "string" ? raw.status : null,
    effectiveStatus:
      typeof effectiveStatus === "string" ? effectiveStatus : null,
    objective: typeof raw.objective === "string" ? raw.objective : null,
    campaignType: campaignType,
    bidStrategy,
    biddingSystemStatus,
    createdAt:
      typeof (raw.createdAt ?? raw.created_time) === "string"
        ? String(raw.createdAt ?? raw.created_time)
        : null,
    updatedAt:
      typeof (raw.updatedAt ?? raw.updated_time) === "string"
        ? String(raw.updatedAt ?? raw.updated_time)
        : null,
    source,
  };
}

function getProviderPagination(
  providerResult: ProviderResult | undefined,
): ProviderPagination | undefined {
  if (!providerResult) return undefined;
  if (providerResult.pagination) return providerResult.pagination;
  return asRecord(providerResult.data)?.pagination as
    | ProviderPagination
    | undefined;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getCampaignCurrency(
  campaign: GlobalCampaign,
  providers: Partial<Record<ProviderKey, ProviderResult>>,
): string | null {
  const source = asRecord(campaign.source);
  const customer = asRecord(source?.customer);
  const budget = asRecord(source?.budget);
  const campaignBudget = asRecord(source?.campaignBudget);
  const currency =
    customer?.currencyCode ??
    budget?.currencyCode ??
    campaignBudget?.currencyCode ??
    providers[campaign.provider as ProviderKey]?.account?.currency;
  return typeof currency === "string" && currency.trim()
    ? currency.trim()
    : null;
}

function getCampaignSpend(campaign: GlobalCampaign): number | null {
  const metrics = asRecord(asRecord(campaign.source)?.metrics);
  const spend = readNumber(metrics?.spend);
  if (spend !== null) return spend;
  const costMicros = readNumber(metrics?.costMicros);
  return costMicros !== null ? costMicros / 1_000_000 : null;
}

function getCampaignBudget(campaign: GlobalCampaign): number | null {
  const source = asRecord(campaign.source);
  const normalizedBudget = asRecord(source?.budget);
  const apiBudget = asRecord(source?.campaignBudget);
  const normalizedAmount = readNumber(normalizedBudget?.amount);
  if (normalizedAmount !== null) return normalizedAmount;
  const amountMicros = readNumber(
    normalizedBudget?.amountMicros ?? apiBudget?.amountMicros,
  );
  if (amountMicros !== null) return amountMicros / 1_000_000;

  // Meta Marketing API returns daily_budget / lifetime_budget in minor units.
  const metaDailyBudget = readNumber(source?.daily_budget);
  if (metaDailyBudget !== null) return metaDailyBudget / 100;
  const metaLifetimeBudget = readNumber(source?.lifetime_budget);
  if (metaLifetimeBudget !== null) return metaLifetimeBudget / 100;

  return null;
}

function formatCurrency(value: number | null, currency: string | null): string {
  if (value === null) return "—";
  if (!currency) {
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(
      value,
    );
  }
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString("en-IN")} ${currency}`;
  }
}

function formatMetric(value: unknown): string {
  const parsed = readNumber(value);
  return parsed === null ? "—" : new Intl.NumberFormat("en-IN").format(parsed);
}

function getMetric(campaign: GlobalCampaign, key: string): unknown {
  return asRecord(asRecord(campaign.source)?.metrics)?.[key];
}

function getCampaignType(campaign: GlobalCampaign): string {
  const source = asRecord(campaign.source);
  const nestedRaw = asRecord(source?.raw);
  const rawCampaign =
    asRecord(source?.campaign) ?? asRecord(nestedRaw?.campaign);

  return (
    firstString(
      campaign.campaignType,
      source?.channelType,
      source?.advertisingChannelType,
      source?.advertising_channel_type,
      rawCampaign?.advertisingChannelType,
      rawCampaign?.advertising_channel_type,
    ) ?? (campaign.provider === "metaAds" ? source.buying_type : "—")
  );
}

function getCampaignBidStrategy(campaign: GlobalCampaign): string {
  const source = asRecord(campaign.source);
  const bidding = asRecord(source?.bidding);
  const nestedRaw = asRecord(source?.raw);
  const rawCampaign =
    asRecord(source?.campaign) ?? asRecord(nestedRaw?.campaign);

  return (
    firstString(
      campaign.bidStrategy,
      bidding?.strategy,
      source?.bid_strategy,
      source?.bidStrategy,
      source?.biddingStrategyType,
      rawCampaign?.biddingStrategyType,
      rawCampaign?.bid_strategy,
    ) ?? "—"
  );
}

function getProviderLabel(provider: string): string {
  if (provider === "googleAds") return "Google Ads";
  if (provider === "metaAds") return "Meta Ads";
  return provider;
}

function getProviderColor(
  provider: string,
): "primary" | "secondary" | "default" {
  if (provider === "googleAds") return "primary";
  if (provider === "metaAds") return "secondary";
  return "default";
}

/*function getStatusColor(
  status: string | null | undefined,
): "success" | "warning" | "error" | "default" {
  const normalized = status?.toUpperCase();
  if (normalized === "ACTIVE" || normalized === "ENABLED") return "success";
  if (normalized === "PAUSED") return "warning";
  if (normalized === "FAILED" || normalized === "ERROR") return "error";
  return "default";
}*/

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string; error?: string }
      | undefined;
    return (
      data?.message ??
      data?.error ??
      error.message ??
      "Failed to load campaigns."
    );
  }
  return error instanceof Error ? error.message : "Failed to load campaigns.";
}

// ── Icons (inline SVGs to avoid extra deps) ─────────────────────────────
const Icon = {
  Search: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  Plus: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Refresh: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  ),
  ChevronDown: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  ChevronUp: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m18 15-6-6-6 6" />
    </svg>
  ),
  Layers: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </svg>
  ),
  Google: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21.35 11.1H12v2.9h5.35c-.23 1.4-1.65 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.95S8.78 6.2 12 6.2c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.75 3.66 14.6 2.75 12 2.75 6.9 2.75 2.75 6.9 2.75 12s4.15 9.25 9.25 9.25c5.34 0 8.9-3.75 8.9-9.03 0-.61-.07-1.08-.15-1.12Z" />
    </svg>
  ),
  Meta: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm3.94 12.83c-.65.65-1.42 1.05-2.31 1.18-.13.02-.27.03-.41.03-1.1 0-2.06-.41-2.75-1.21-.72-.85-1.11-1.99-1.11-3.29 0-.55.09-1.09.28-1.55.23-.56.55-1 1.06-1.32.5-.32 1.09-.48 1.73-.48.55 0 1.06.13 1.47.38.41.25.68.6.81.99.11.31.13.63.13.93 0 .24-.01.46-.03.61h-3.55c.06.44.23.79.5 1.04.27.25.63.38 1.06.38.23 0 .45-.05.66-.14.21-.09.36-.22.46-.37l.98.6c-.17.3-.45.56-.82.75-.37.19-.81.29-1.31.29-.55 0-1.05-.13-1.43-.38Z" />
    </svg>
  ),
  Wallet: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  ),
};

function findCreativeMediaUrl(value: unknown, depth = 0): string | null {
  if (depth > 7 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCreativeMediaUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  for (const [key, child] of Object.entries(record)) {
    if (
      typeof child === "string" &&
      /^https?:\/\//i.test(child) &&
      (/(image|thumbnail|picture|preview).*url|url.*(image|thumbnail|picture)/i.test(key) ||
        ["picture", "imageUrl", "thumbnailUrl", "previewImageUrl"].includes(key))
    ) {
      return child;
    }
  }
  for (const child of Object.values(record)) {
    const found = findCreativeMediaUrl(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function getAdCreativeSummary(ad: ChildRecord): {
  headline: string;
  body: string;
  destination: string;
  callToAction: string;
  mediaUrl: string | null;
  assetCount: number;
} {
  const creative = asRecord(ad.creative) ?? asRecord(ad.creativeDetails) ?? {};
  const story = asRecord(creative.object_story_spec) ?? {};
  const linkData = asRecord(story.link_data) ?? {};
  const videoData = asRecord(story.video_data) ?? {};
  const headlines = Array.isArray(ad.headlines) ? ad.headlines : [];
  const descriptions = Array.isArray(ad.descriptions) ? ad.descriptions : [];
  const assetNames = Array.isArray(ad.assetResourceNames) ? ad.assetResourceNames : [];
  const assetFeed = asRecord(creative.asset_feed_spec) ?? {};
  const feedImages = Array.isArray(assetFeed.images) ? assetFeed.images : [];
  const feedVideos = Array.isArray(assetFeed.videos) ? assetFeed.videos : [];
  const carouselAttachments = Array.isArray(linkData.child_attachments)
    ? linkData.child_attachments
    : [];
  const hasDirectMedia = Boolean(
    creative.image_url || creative.thumbnail_url || creative.video_id ||
    linkData.picture || videoData.image_url,
  );
  const metaMediaCount = [feedImages.length, feedVideos.length, carouselAttachments.length]
    .reduce((total, count) => total + count, hasDirectMedia ? 1 : 0);

  return {
    headline: firstString(
      headlines[0],
      creative.title,
      linkData.name,
      videoData.title,
      ad.name,
    ) ?? "Creative headline not supplied",
    body: firstString(
      descriptions[0],
      creative.body,
      linkData.message,
      videoData.message,
    ) ?? "No primary text was returned",
    destination: firstString(
      Array.isArray(ad.finalUrls) ? ad.finalUrls[0] : null,
      creative.link_url,
      linkData.link,
      creative.link_destination_display_url,
    ) ?? "No destination URL",
    callToAction: firstString(
      Array.isArray(ad.callToActions) ? ad.callToActions[0] : null,
      creative.call_to_action_type,
    ) ?? "Not supplied",
    mediaUrl: findCreativeMediaUrl(creative),
    assetCount: assetNames.length || metaMediaCount,
  };
}

// ── Metric Card ────────────────────────────────────────────────────────
function MetricCard({
  label,
  value,
  detail,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        transition: "all 0.15s ease",
        "&:hover": { boxShadow: 2, borderColor: "divider" },
      }}
    >
      <CardContent sx={{ p: 2.5 }}>
        <Stack direction="row" spacing={1.5}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: accent,
              color: "white",
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
          <Typography variant="body2" color="text.secondary" fontWeight={500}>
            {label}
          </Typography>
        </Stack>
        <Typography
          variant="h4"
          component="p"
          fontWeight={700}
          sx={{ mt: 1.5, letterSpacing: "-0.02em" }}
        >
          {value}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.5, display: "block" }}
        >
          {detail}
        </Typography>
      </CardContent>
    </Card>
  );
}

// ── Detail Item ────────────────────────────────────────────────────────
function DetailItem({ label, value }: { label: string; value: unknown }) {
  const display =
    value === null || value === undefined || value === ""
      ? "—"
      : Array.isArray(value)
        ? value.length
          ? value.join(", ")
          : "None"
        : String(value);

  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography
        variant="body2"
        fontWeight={600}
        sx={{ overflowWrap: "anywhere", mt: 0.25 }}
      >
        {display}
      </Typography>
    </Box>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────
export default function CampaignsPage({
  pageTitle = "Campaign Management",
  pageDescription = DEFAULT_DESCRIPTION,
}: CampaignsPageProps = {}) {
  const [campaigns, setCampaigns] = useState<GlobalCampaign[]>([]);
  const [providers, setProviders] = useState<
    Partial<Record<ProviderKey, ProviderResult>>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [adGroupsByCampaign, setAdGroupsByCampaign] = useState<Record<string, ChildRecord[]>>({});
  const [groupsLoadedByCampaign, setGroupsLoadedByCampaign] = useState<Record<string, boolean>>({});
  const [groupNextTokens, setGroupNextTokens] = useState<Record<string, string | null>>({});
  const [groupLoadingKey, setGroupLoadingKey] = useState<string | null>(null);
  const [groupErrors, setGroupErrors] = useState<Record<string, string>>({});
  const [adsByGroup, setAdsByGroup] = useState<Record<string, ChildRecord[]>>({});
  const [adsLoadedByGroup, setAdsLoadedByGroup] = useState<Record<string, boolean>>({});
  const [adsNextTokens, setAdsNextTokens] = useState<Record<string, string | null>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [adsLoadingKey, setAdsLoadingKey] = useState<string | null>(null);
  const [adsErrors, setAdsErrors] = useState<Record<string, string>>({});

  // Filter / search state
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<"all" | ProviderKey>(
    "all",
  );
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [updatingStatusKey, setUpdatingStatusKey] = useState<string | null>(
    null,
  );
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_API_URL || "http://localhost:5000";

  const loadCampaigns = useCallback(async () => {
    setLoading(true);

    try {
      // This endpoint returns both providers in one response.
      // Pagination is intentionally not requested until the GET route forwards
      // googlePageToken / metaPageToken to the provider services.
      const response: any = await getCampaigns();
      console.log();

      const payload = response.data;

      if (!payload?.success) {
        throw new Error(
          payload?.message || "Campaign API returned an unsuccessful response.",
        );
      }

      const providerResults = payload.providers ?? {};
      const googleResult = providerResults.googleAds;
      const metaResult = providerResults.metaAds;

      const googleCampaigns = extractProviderCampaigns(googleResult).map(
        (campaign) =>
          normalizeProviderCampaign(
            campaign,
            "googleAds",
            googleResult?.accountId,
          ),
      );
      const metaCampaigns = extractProviderCampaigns(metaResult).map(
        (campaign) =>
          normalizeProviderCampaign(campaign, "metaAds", metaResult?.accountId),
      );

      // Prefer a combined list if the backend adds one in a future response;
      // otherwise use the provider-specific data returned by this route.
      const combinedCampaigns = Array.isArray(payload.campaigns)
        ? payload.campaigns
        : [...googleCampaigns, ...metaCampaigns];

      setCampaigns(
        combinedCampaigns.map((campaign) => {
          const provider =
            campaign.provider === "metaAds" ? "metaAds" : "googleAds";
          const result = providerResults[provider];
          return normalizeProviderCampaign(
            campaign,
            provider,
            result?.accountId,
          );
        }),
      );

      const newProviders: Partial<Record<ProviderKey, ProviderResult>> = {
        googleAds: {
          ...googleResult,
          pagination: getProviderPagination(googleResult),
          connected: googleResult?.success === true,
          status: googleResult?.success ? "connected" : "disconnected",
        },
        metaAds: {
          ...metaResult,
          pagination: getProviderPagination(metaResult),
          connected: metaResult?.success === true,
          status: metaResult?.success ? "connected" : "disconnected",
        },
      };
      setProviders(newProviders);
      setError(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  const getBackendToken = async (): Promise<string> => {
    const response = await axios.get("/api/token");
    const token = response.data?.token;
    if (typeof token !== "string" || !token.trim()) {
      throw new Error("Your session has expired. Please sign in again.");
    }
    return token;
  };

  const loadCampaignChildren = async (
    campaign: GlobalCampaign,
    pageToken?: string,
  ) => {
    const rowKey = `${campaign.provider}:${campaign.id}`;
    if (!pageToken && groupsLoadedByCampaign[rowKey]) return;

    try {
      setGroupLoadingKey(rowKey);
      setGroupErrors((current) => ({ ...current, [rowKey]: "" }));
      const token = await getBackendToken();
      const isMeta = campaign.provider === "metaAds";
      const path = isMeta
        ? `/api/ads/meta/campaigns/${encodeURIComponent(campaign.id)}/ad-sets`
        : `/api/ads/google/campaigns/${encodeURIComponent(campaign.id)}/ad-groups`;
      const params = pageToken
        ? (isMeta ? { after: pageToken } : { pageToken })
        : {};
      const response = await axios.get(`${backendUrl}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || "Unable to load campaign groups.");
      }

      const rows: ChildRecord[] = isMeta
        ? response.data.adSets ?? []
        : response.data.adGroups ?? [];
      setAdGroupsByCampaign((current) => ({
        ...current,
        [rowKey]: pageToken ? [...(current[rowKey] ?? []), ...rows] : rows,
      }));
      setGroupsLoadedByCampaign((current) => ({ ...current, [rowKey]: true }));
      setGroupNextTokens((current) => ({
        ...current,
        [rowKey]: isMeta
          ? response.data.pagination?.nextCursor ?? null
          : response.data.nextPageToken ?? null,
      }));
    } catch (requestError) {
      setGroupErrors((current) => ({ ...current, [rowKey]: getErrorMessage(requestError) }));
    } finally {
      setGroupLoadingKey(null);
    }
  };

  const loadGroupAds = async (
    campaign: GlobalCampaign,
    group: ChildRecord,
    pageToken?: string,
  ) => {
    const isMeta = campaign.provider === "metaAds";
    const groupId = String(group.id ?? "");
    const groupKey = `${campaign.provider}:${campaign.id}:${groupId}`;
    if (!groupId || (!pageToken && adsLoadedByGroup[groupKey])) return;

    try {
      setAdsLoadingKey(groupKey);
      setAdsErrors((current) => ({ ...current, [groupKey]: "" }));
      const token = await getBackendToken();
      const path = isMeta
        ? `/api/ads/meta/ad-sets/${encodeURIComponent(groupId)}/ads`
        : `/api/ads/google/ad-groups/${encodeURIComponent(groupId)}/ads`;
      const params: Record<string, string> = {};
      if (isMeta) {
        params.campaignId = campaign.id;
        if (pageToken) params.after = pageToken;
      } else if (pageToken) {
        params.pageToken = pageToken;
      }
      const response = await axios.get(`${backendUrl}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || "Unable to load ads for this group.");
      }
      const rows: ChildRecord[] = response.data.ads ?? [];
      setAdsByGroup((current) => ({
        ...current,
        [groupKey]: pageToken ? [...(current[groupKey] ?? []), ...rows] : rows,
      }));
      setAdsLoadedByGroup((current) => ({ ...current, [groupKey]: true }));
      setAdsNextTokens((current) => ({
        ...current,
        [groupKey]: isMeta
          ? response.data.pagination?.nextCursor ?? null
          : response.data.nextPageToken ?? null,
      }));
    } catch (requestError) {
      setAdsErrors((current) => ({ ...current, [groupKey]: getErrorMessage(requestError) }));
    } finally {
      setAdsLoadingKey(null);
    }
  };

  const toggleCampaignChildren = (campaign: GlobalCampaign, rowKey: string) => {
    const willExpand = !expandedRows[rowKey];
    setExpandedRows((current) => ({ ...current, [rowKey]: willExpand }));
    if (willExpand) void loadCampaignChildren(campaign);
  };

  const toggleGroupAds = (campaign: GlobalCampaign, group: ChildRecord) => {
    const groupKey = `${campaign.provider}:${campaign.id}:${String(group.id ?? "")}`;
    const willExpand = !expandedGroups[groupKey];
    setExpandedGroups((current) => ({ ...current, [groupKey]: willExpand }));
    if (willExpand) void loadGroupAds(campaign, group);
  };

  const [editingCampaignKey, setEditingCampaignKey] = useState<string | null>(
    null,
  );
  const [editingName, setEditingName] = useState("");
  const [renamingCampaignKey, setRenamingCampaignKey] = useState<string | null>(
    null,
  );
  const [renameError, setRenameError] = useState<string | null>(null);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  // Derived stats
  const totalSpend = useMemo(() => {
    const totalsByCurrency = new Map<string, number>();
    let unknownCurrencyTotal = 0;
    let hasUnknownCurrencySpend = false;

    campaigns.forEach((campaign) => {
      const spend = getCampaignSpend(campaign);
      if (spend === null) return;
      const currency = getCampaignCurrency(campaign, providers);
      if (currency) {
        totalsByCurrency.set(
          currency,
          (totalsByCurrency.get(currency) ?? 0) + spend,
        );
      } else {
        unknownCurrencyTotal += spend;
        hasUnknownCurrencySpend = true;
      }
    });

    if (totalsByCurrency.size > 1) return "Multiple currencies";
    if (totalsByCurrency.size === 1 && !hasUnknownCurrencySpend) {
      const [currency, amount] = [...totalsByCurrency.entries()][0];
      return formatCurrency(amount, currency);
    }
    if (totalsByCurrency.size === 0 && !hasUnknownCurrencySpend) {
      return "—";
    }
    if (totalsByCurrency.size === 0) {
      return formatCurrency(unknownCurrencyTotal, null);
    }
    return "Multiple currencies";
  }, [campaigns, providers]);

  const startRename = (campaign: GlobalCampaign, rowKey: string) => {
    setEditingCampaignKey(rowKey);
    setEditingName(campaign.name);
    setRenameError(null);
  };

  const cancelRename = () => {
    setEditingCampaignKey(null);
    setEditingName("");
    setRenameError(null);
  };

  const saveCampaignName = async (campaign: GlobalCampaign, rowKey: string) => {
    const newName = editingName.trim();

    if (!newName) {
      setRenameError("Campaign name is required.");
      return;
    }

    if (newName === campaign.name) {
      cancelRename();
      return;
    }

    try {
      setRenamingCampaignKey(rowKey);
      setRenameError(null);
      const response = await axios.get("/api/token");
      if (!response.data) {
        console.log("eer");
      }

      const { token } = response.data;

      await axios.post(
        `${backendUrl}/api/campaigns/rename`,
        {
          provider: campaign.provider,
          campaignId: campaign.id,
          accountId: campaign.accountId,
          name: newName,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      setCampaigns((current) =>
        current.map((item) =>
          `${item.provider}:${item.id}` === rowKey
            ? {
                ...item,
                name: newName,
                source: {
                  ...(asRecord(item.source) ?? {}),
                  name: newName,
                },
              }
            : item,
        ),
      );

      cancelRename();
    } catch (error) {
      setRenameError(getErrorMessage(error));
    } finally {
      setRenamingCampaignKey(null);
    }
  };
  const googleCount = campaigns.filter(
    (c) => c.provider === "googleAds",
  ).length;
  const metaCount = campaigns.filter((c) => c.provider === "metaAds").length;
  const connectedProviders = ["googleAds", "metaAds"].filter(
    (provider) => providers[provider as ProviderKey]?.connected,
  ).length;

  // Available statuses for filter
  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    campaigns.forEach((c) => {
      const s = (c.effectiveStatus || c.status || "").toUpperCase();
      if (s) set.add(s);
    });
    return [...set].sort();
  }, [campaigns]);

  // Filtered campaigns
  const filteredCampaigns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (platformFilter !== "all" && c.provider !== platformFilter)
        return false;
      if (statusFilter !== "all") {
        const s = (c.effectiveStatus || c.status || "").toUpperCase();
        if (s !== statusFilter) return false;
      }
      if (q) {
        const haystack =
          `${c.name} ${c.id} ${c.accountId ?? ""} ${c.objective ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [campaigns, search, platformFilter, statusFilter]);

  const activeFiltersCount =
    (search ? 1 : 0) +
    (platformFilter !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0);

  const clearFilters = () => {
    setSearch("");
    setPlatformFilter("all");
    setStatusFilter("all");
  };

  const handleStatusChange = async (
    campaign: GlobalCampaign,
    newStatus: string,
  ) => {
    const rowKey = `${campaign.provider}:${campaign.id}`;

    if (newStatus === campaign.status) return;

    try {
      setUpdatingStatusKey(rowKey);
      const tokenData = await axios.get("/api/token");
      if (!tokenData.data) {
        console.log("eer");
      }

      const { token } = tokenData.data;
      const response = await axios.post(
        `${backendUrl}/api/campaigns/status`,
        {
          provider: campaign.provider,
          campaignId: campaign.id,
          status: newStatus,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.data?.success) {
        throw new Error(
          response.data?.message || "Failed to update campaign status.",
        );
      }

      setCampaigns((current) =>
        current.map((item) =>
          item.provider === campaign.provider && item.id === campaign.id
            ? {
                ...item,
                status: newStatus,
                effectiveStatus: newStatus,
              }
            : item,
        ),
      );
    } catch (error: unknown) {
      console.error("Campaign status update failed:", error);

      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : "Failed to update campaign status.";

      setError(message);
    } finally {
      setUpdatingStatusKey(null);
    }
  };

  const deleteCampaign = async (campaign: GlobalCampaign) => {
    const confirmed = window.confirm(
      `Delete "${campaign.name}" from ${getProviderLabel(campaign.provider)}? This action cannot be undone.`,
    );
    if (!confirmed) return;

    const rowKey = `${campaign.provider}:${campaign.id}`;
    try {
      const token = await getBackendToken();
      const response = await axios.delete(
        `${backendUrl}/api/campaigns/delete/${campaign.provider}/${campaign.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      if (!response.data?.success) {
        throw new Error(response.data?.message || "Campaign deletion failed.");
      }
      setCampaigns((current) => current.filter((item) => `${item.provider}:${item.id}` !== rowKey));
      setError(null);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    }
  };

  return (
    <Box sx={{ width: "100%", maxWidth: 1700, mx: "auto" }}>
      {/* Header */}
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" }, // Center aligns the button vertically with the title
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "primary.main",
            }}
          >
            AdSyntra · Campaigns
          </Typography>
          <Typography
            variant="h4"
            component="h1"
            fontWeight={700}
            sx={{ mt: 0.5, letterSpacing: "-0.02em" }}
          >
            {pageTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {pageDescription}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5}>
          <Tooltip title="Refresh campaigns">
            <span>
              <IconButton
                onClick={() => void loadCampaigns()}
                disabled={loading}
                sx={{
                  border: 1,
                  borderColor: "divider",
                  bgcolor: "background.paper",
                }}
              >
                <Icon.Refresh />
              </IconButton>
            </span>
          </Tooltip>
          <Button
            component={Link}
            href="/dashboard/campaigns/new"
            variant="contained"
            size="medium" // Changed from large to medium for better proportion
            disableElevation
            startIcon={<Icon.Plus />}
            sx={{
              borderRadius: 2,
              textTransform: "none",
              fontWeight: 600,
              px: 3,
              py: 1,
              height: "fit-content", // Prevents it from stretching
              whiteSpace: "nowrap", // Prevents text from wrapping
            }}
          >
            Create campaign
          </Button>
        </Stack>
      </Box>
      {/* Metric Cards */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(4, minmax(0, 1fr))",
            xl: "repeat(4, minmax(0, 1fr))",
          },
          gap: 2,
          mb: 3,
        }}
      >
        <MetricCard
          label="Total campaigns"
          value={campaigns.length}
          detail="Across all connected platforms"
          icon={<Icon.Layers />}
          accent="#2563eb"
        />
        <MetricCard
          label="Google Ads"
          value={googleCount}
          detail={
            providers.googleAds?.connected
              ? "Account connected"
              : "Not connected"
          }
          icon={<Icon.Google />}
          accent="#1a73e8"
        />
        <MetricCard
          label="Meta Ads"
          value={metaCount}
          detail={
            providers.metaAds?.connected ? "Account connected" : "Not connected"
          }
          icon={<Icon.Meta />}
          accent="#6366f1"
        />
        <MetricCard
          label="Total spend"
          value={totalSpend}
          detail="Based on metrics returned by providers"
          icon={<Icon.Wallet />}
          accent="#10b981"
        />
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2, borderRadius: 2 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => void loadCampaigns()}
            >
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <Paper
        variant="outlined"
        sx={{ width: "100%", overflow: "hidden", borderRadius: 2 }}
      >
        {/* Toolbar */}
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: "divider" }}
        >
          <Box>
            <Stack direction="row" spacing={1}>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: "700",
                }}
              >
                All campaigns
              </Typography>
              <Chip
                label={filteredCampaigns.length}
                size="small"
                sx={{ fontWeight: 700, height: 22 }}
              />
            </Stack>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.25 }}
            >
              {connectedProviders} of 2 providers connected
            </Typography>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              size="small"
              placeholder="Search campaigns…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Box sx={{ color: "text.secondary", display: "flex" }}>
                        <Icon.Search />
                      </Box>
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ minWidth: { sm: 240 } }}
            />
            <TextField
              select
              size="small"
              value={platformFilter}
              onChange={(e) =>
                setPlatformFilter(e.target.value as "all" | ProviderKey)
              }
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="all">All platforms</MenuItem>
              <MenuItem value="googleAds">Google Ads</MenuItem>
              <MenuItem value="metaAds">Meta Ads</MenuItem>
            </TextField>
            <TextField
              select
              size="small"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="all">All statuses</MenuItem>
              {availableStatuses.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
            {activeFiltersCount > 0 && (
              <Button
                size="small"
                onClick={clearFilters}
                sx={{ textTransform: "none" }}
              >
                Clear ({activeFiltersCount})
              </Button>
            )}
          </Stack>
        </Stack>

        {/* Content */}
        {loading ? (
          <Stack
            spacing={2}
            sx={{
              py: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">
              Loading campaigns from Google Ads and Meta Ads…
            </Typography>
          </Stack>
        ) : campaigns.length === 0 ? (
          <Box sx={{ p: 6, textAlign: "center" }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: "700",
              }}
            >
              No campaigns yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              No campaigns were returned by the connected advertising accounts.
            </Typography>
            <Button
              component={Link}
              href="/dashboard/campaigns/new"
              variant="contained"
              disableElevation
              startIcon={<Icon.Plus />}
              sx={{ textTransform: "none" }}
            >
              Create your first campaign
            </Button>
          </Box>
        ) : filteredCampaigns.length === 0 ? (
          <Box sx={{ p: 6, textAlign: "center" }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: "700",
              }}
            >
              No matching campaigns
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Try adjusting your filters or search.
            </Typography>
            <Button onClick={clearFilters} sx={{ textTransform: "none" }}>
              Clear filters
            </Button>
          </Box>
        ) : (
          <TableContainer sx={{ width: "100%", maxHeight: "70vh" }}>
            <Table
              size="medium"
              sx={{ minWidth: 1900 }}
              aria-label="Global advertising campaigns"
              stickyHeader
            >
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      fontWeight: 700,
                      position: "sticky",
                      left: 0,
                      zIndex: 3,
                      bgcolor: "background.paper",
                      borderRight: 1,
                      borderColor: "divider",
                      minWidth: 230,
                    }}
                  >
                    Campaign
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Platform</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Objective</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Bid strategy</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Budget
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Spend
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Impressions
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Reach
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Clicks
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    CTR
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    CPC
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    CPM
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Conversions
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Conv. rate
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Cost / conv.
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Conv. value
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    ROAS
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredCampaigns.map((campaign) => {
                  const currency = getCampaignCurrency(campaign, providers);
                  const status = (
                    campaign.status ||
                    campaign.effectiveStatus ||
                    ""
                  ).toUpperCase();
                  const rowKey = `${campaign.provider}:${campaign.id}`;
                  const isExpanded = Boolean(expandedRows[rowKey]);
                  const source = asRecord(campaign.source);
                  const rawCampaign = asRecord(source?.campaign);
                  const budget =
                    asRecord(source?.budget) ??
                    asRecord(source?.campaignBudget);
                  const bidding = asRecord(source?.bidding);
                  const specialCategories = source?.special_ad_categories;
                  const startTime = source?.start_time;
                  const createdTime =
                    source?.created_time ?? campaign.createdAt;
                  const updatedTime =
                    source?.updated_time ?? campaign.updatedAt;

                  const metricCurrency = currency;
                  const formatPercent = (value: unknown) => {
                    const number = readNumber(value);
                    return number === null
                      ? "—"
                      : `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(number)}%`;
                  };
                  const formatRatio = (value: unknown) => {
                    const number = readNumber(value);
                    return number === null
                      ? "—"
                      : `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(number)}x`;
                  };
                  const displayValue = (value: unknown) =>
                    value === null || value === undefined || value === ""
                      ? "—"
                      : Array.isArray(value)
                        ? value.length
                          ? value.join(", ")
                          : "None"
                        : String(value);

                  return (
                    <Fragment key={rowKey}>
                      <TableRow hover sx={{ "& td": { verticalAlign: "top" } }}>
                        <TableCell
                          sx={{
                            position: "sticky",
                            left: 0,
                            zIndex: 1,
                            bgcolor: "background.paper",
                            borderRight: 1,
                            borderColor: "divider",
                          }}
                        >
                          {editingCampaignKey === rowKey ? (
                            <Stack spacing={1} sx={{ minWidth: 200 }}>
                              <TextField
                                size="small"
                                value={editingName}
                                autoFocus
                                disabled={renamingCampaignKey === rowKey}
                                error={Boolean(renameError)}
                                helperText={renameError}
                                onChange={(event) => {
                                  setEditingName(event.target.value);
                                  setRenameError(null);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    void saveCampaignName(campaign, rowKey);
                                  }

                                  if (event.key === "Escape") {
                                    cancelRename();
                                  }
                                }}
                              />

                              <Stack direction="row" spacing={1}>
                                <Tooltip title="Save campaign name" arrow placement="top" enterDelay={250}>
                                <Button
                                  size="small"
                                  title="Save campaign name"
                                  variant="contained"
                                  disableElevation
                                  disabled={
                                    renamingCampaignKey === rowKey ||
                                    !editingName.trim()
                                  }
                                  onClick={() =>
                                    void saveCampaignName(campaign, rowKey)
                                  }
                                  sx={{ textTransform: "none" }}
                                >
                                  {renamingCampaignKey === rowKey ? (
                                    <CircularProgress
                                      size={16}
                                      color="inherit"
                                    />
                                  ) : (
                                    "Save"
                                  )}
                                </Button>
                                </Tooltip>

                                <Tooltip title="Cancel rename" arrow placement="top" enterDelay={250}>
                                <Button
                                  size="small"
                                  title="Cancel rename"
                                  disabled={renamingCampaignKey === rowKey}
                                  onClick={cancelRename}
                                  sx={{ textTransform: "none" }}
                                >
                                  Cancel
                                </Button>
                                </Tooltip>
                              </Stack>
                            </Stack>
                          ) : (
                            <Stack
                              direction="row"
                              alignItems="center"
                              spacing={0.5}
                            >
                              <Typography variant="body2" fontWeight={600}>
                                {campaign.name || "Untitled campaign"}
                              </Typography>

                              <Tooltip title="Rename campaign" arrow placement="top" enterDelay={250} enterNextDelay={100}>
                                <IconButton
                                  size="small"
                                  title="Rename campaign"
                                  onClick={() => startRename(campaign, rowKey)}
                                  aria-label="Rename campaign"
                                >
                                  <Typography component="span" fontSize={15}>
                                    ✎
                                  </Typography>
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          )}
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                          >
                            ID: {campaign.id}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                          >
                            Account: {campaign.accountId || "—"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={getProviderLabel(campaign.provider)}
                            color={getProviderColor(campaign.provider)}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {campaign.objective || "—"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {getCampaignType(campaign)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {/* <Typography variant="body2">
                            {displayValue(
                              bidding?.strategy ??
                                rawCampaign?.biddingStrategyType ??
                                rawCampaign?.bid_strategy,
                            )}
                          </Typography> */}
                          <Typography variant="body2">
                            {getCampaignBidStrategy(campaign)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={500}>
                            {formatCurrency(
                              getCampaignBudget(campaign),
                              currency,
                            )}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                          >
                            {displayValue(
                              budget?.period ??
                                budget?.type ??
                                (source?.daily_budget != null
                                  ? "Daily"
                                  : source?.lifetime_budget != null
                                    ? "Lifetime"
                                    : null),
                            )}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={500}>
                            {formatCurrency(
                              getCampaignSpend(campaign),
                              currency,
                            )}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          {formatMetric(getMetric(campaign, "impressions"))}
                        </TableCell>
                        <TableCell align="right">
                          {formatMetric(getMetric(campaign, "reach"))}
                        </TableCell>
                        <TableCell align="right">
                          {formatMetric(getMetric(campaign, "clicks"))}
                        </TableCell>
                        <TableCell align="right">
                          {formatPercent(getMetric(campaign, "ctr"))}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(
                            readNumber(getMetric(campaign, "cpc")),
                            metricCurrency,
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(
                            readNumber(getMetric(campaign, "cpm")),
                            metricCurrency,
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {formatMetric(getMetric(campaign, "conversions"))}
                        </TableCell>
                        <TableCell align="right">
                          {formatPercent(getMetric(campaign, "conversionRate"))}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(
                            readNumber(
                              getMetric(campaign, "costPerConversion"),
                            ),
                            metricCurrency,
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(
                            readNumber(getMetric(campaign, "conversionValue")),
                            metricCurrency,
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {formatRatio(getMetric(campaign, "roas"))}
                        </TableCell>
                        <TableCell>
                          <Tooltip title={`Change campaign status${status ? ` · Current: ${status}` : ""}`} arrow placement="top" enterDelay={250} enterNextDelay={100}>
                            <span style={{ display: "inline-flex" }}>
                              <Select
                                size="small"
                                value={status || ""}
                                displayEmpty
                                disabled={updatingStatusKey === rowKey}
                                onChange={(event) =>
                                  handleStatusChange(campaign, event.target.value)
                                }
                                title="Change campaign status"
                                inputProps={{ "aria-label": `Change status for ${campaign.name}` }}
                                sx={{
                                  minWidth: 125,
                                  borderRadius: 2,
                                  fontSize: 13,
                                }}
                              >
                                {campaign.provider === "googleAds" && (
                                  <MenuItem value="ENABLED">Enabled</MenuItem>
                                )}
                                {campaign.provider === "metaAds" && (
                                  <MenuItem value="ACTIVE">Active</MenuItem>
                                )}
                                <MenuItem value="PAUSED">Paused</MenuItem>
                              </Select>
                            </span>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                          <Tooltip title={isExpanded ? "Hide campaign hierarchy" : "View ad groups / ad sets, ads and creative assets"} arrow placement="top" enterDelay={250}>
                          <Button
                            size="small"
                            title={isExpanded ? "Hide campaign hierarchy" : "View campaign hierarchy"}
                            variant="text"
                            onClick={() => toggleCampaignChildren(campaign, rowKey)}
                            endIcon={
                              isExpanded ? (
                                <Icon.ChevronUp />
                              ) : (
                                <Icon.ChevronDown />
                              )
                            }
                            sx={{ textTransform: "none", minWidth: 0 }}
                          >
                            {isExpanded ? "Hide" : "More"}
                          </Button>
                          </Tooltip>
                          <Tooltip title="Open full campaign details" arrow placement="top" enterDelay={250}>
                            <Button
                              component={Link}
                              href={`/dashboard/campaigns/${campaign.provider === "metaAds" ? "metaAds" : "googleAds"}/${encodeURIComponent(campaign.id)}`}
                              size="small"
                              variant="outlined"
                              title="Open full campaign details"
                              sx={{ textTransform: "none", ml: 0.5, minWidth: 0, whiteSpace: "nowrap" }}
                            >
                              Full view
                            </Button>
                          </Tooltip>

                          <Tooltip title="Delete campaign" arrow placement="top" enterDelay={250} enterNextDelay={100}>
                            <span style={{ display: "inline-flex" }}>
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                title="Delete campaign"
                                sx={{
                                  textTransform: "none",
                                  ml: 1,
                                  minWidth: 0,
                                }}
                                onClick={() => void deleteCampaign(campaign)}
                              >
                                Delete
                              </Button>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                      <TableRow key={`${rowKey}:details`}>
                        <TableCell
                          colSpan={20}
                          sx={{
                            py: 0,
                            borderBottom: isExpanded ? undefined : 0,
                            bgcolor: "action.hover",
                          }}
                        >
                          <Collapse
                            in={isExpanded}
                            timeout="auto"
                            unmountOnExit
                          >
                            <Box sx={{ py: 2.5, px: 2 }}>
                              <Typography
                                variant="subtitle2"
                                fontWeight={700}
                                sx={{ mb: 1.5 }}
                              >
                                Campaign details
                              </Typography>
                              <Box
                                sx={{
                                  display: "grid",
                                  gridTemplateColumns: {
                                    xs: "1fr",
                                    sm: "repeat(2, minmax(0, 1fr))",
                                    lg: "repeat(4, minmax(0, 1fr))",
                                  },
                                  gap: 2,
                                }}
                              >
                                <DetailItem
                                  label="Campaign ID"
                                  value={campaign.id}
                                />
                                <DetailItem
                                  label="Account ID"
                                  value={campaign.accountId}
                                />
                                <DetailItem
                                  label="Effective status"
                                  value={campaign.effectiveStatus}
                                />
                                <DetailItem
                                  label="Campaign objective"
                                  value={campaign.objective}
                                />
                                <DetailItem
                                  label="Channel / campaign type"
                                  value={getCampaignType(campaign)}
                                />
                                <DetailItem
                                  label="Bidding strategy"
                                  value={getCampaignBidStrategy(campaign)}
                                />
                                <DetailItem
                                  label="Bidding system status"
                                  value={
                                    campaign.biddingSystemStatus ??
                                    asRecord(source?.bidding)?.systemStatus ??
                                    rawCampaign?.biddingStrategySystemStatus ??
                                    rawCampaign?.bidding_strategy_system_status
                                  }
                                />
                                <DetailItem
                                  label="Budget name"
                                  value={budget?.name}
                                />
                                <DetailItem
                                  label="Budget amount"
                                  value={formatCurrency(
                                    getCampaignBudget(campaign),
                                    currency,
                                  )}
                                />
                                <DetailItem
                                  label="Budget period"
                                  value={
                                    budget?.period ??
                                    budget?.type ??
                                    (source?.daily_budget != null
                                      ? "Daily"
                                      : source?.lifetime_budget != null
                                        ? "Lifetime"
                                        : null)
                                  }
                                />
                                <DetailItem
                                  label="Budget delivery"
                                  value={budget?.deliveryMethod}
                                />

                                <DetailItem
                                  label="Buying type"
                                  value={
                                    source?.buying_type ?? source?.buyingType
                                  }
                                />
                                <DetailItem
                                  label="Start time"
                                  value={startTime}
                                />
                                <DetailItem
                                  label="Created"
                                  value={createdTime}
                                />
                                <DetailItem
                                  label="Last updated"
                                  value={updatedTime}
                                />
                                <DetailItem
                                  label="Special ad categories"
                                  value={specialCategories}
                                />
                              </Box>

                              <Divider sx={{ my: 2.5 }} />
                              <Stack
                                position="relative"
                                display="flex"
                                direction={{ xs: "column", sm: "row" }}
                                justifyContent="space-between"
                                alignItems={{ xs: "flex-start", sm: "center" }}
                                spacing={1}
                                sx={{ mb: 1.5 }}
                              >
                                <Box flex={1} sx={{ minWidth: 0 }}>
                                  <Typography variant="subtitle1" fontWeight={700}>
                                    {campaign.provider === "googleAds" ? "Ad groups" : "Ad sets"}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {campaign.provider === "googleAds"
                                      ? "Google Ads campaign → ad groups → ads → creative assets"
                                      : "Meta campaign → ad sets → ads → creative assets"}
                                  </Typography>
                                </Box>
                                <Button
                                  component={Link}
                                  href="/dashboard/assets"
                                  size="small"
                                  variant="text"
                                  sx={{ textTransform: "none" }}
                                >
                                  Open asset library
                                </Button>
                              </Stack>

                              {groupLoadingKey === rowKey && !adGroupsByCampaign[rowKey] ? (
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
                                  <CircularProgress size={18} />
                                  <Typography variant="body2" color="text.secondary">
                                    Loading {campaign.provider === "googleAds" ? "ad groups" : "ad sets"}…
                                  </Typography>
                                </Stack>
                              ) : null}

                              {groupErrors[rowKey] && (
                                <Alert
                                  severity="error"
                                  sx={{ mb: 1.5 }}
                                  action={<Button color="inherit" size="small" onClick={() => void loadCampaignChildren(campaign)}>Retry</Button>}
                                >
                                  {groupErrors[rowKey]}
                                </Alert>
                              )}

                              {groupsLoadedByCampaign[rowKey] && (adGroupsByCampaign[rowKey]?.length ?? 0) === 0 && !groupErrors[rowKey] && (
                                <Alert severity="info" variant="outlined">
                                  {campaign.provider === "googleAds" && getCampaignType(campaign).toUpperCase().includes("PERFORMANCE_MAX")
                                    ? "This is a Performance Max campaign. Google organizes its creatives under asset groups rather than standard ad groups; asset-group browsing is a separate integration step."
                                    : `No ${campaign.provider === "googleAds" ? "ad groups" : "ad sets"} were returned for this campaign.`}
                                </Alert>
                              )}

                              <Stack spacing={1.25} width={"100%"}  sx={{ mb: 1.5, width: "100%", display:"flex", flexDirection:"column"  }}>
                                {(adGroupsByCampaign[rowKey] ?? []).map((group) => {
                                  const groupId = String(group.id ?? "");
                                  const groupKey = `${campaign.provider}:${campaign.id}:${groupId}`;
                                  const groupAdsOpen = Boolean(expandedGroups[groupKey]);
                                  const groupStatus = String(group.status ?? group.effective_status ?? "—").replace(/_/g, " ");
                                  const groupBudget = campaign.provider === "metaAds"
                                    ? (group.daily_budget ?? group.lifetime_budget)
                                    : group.cpcBidMicros;
                                  return (
                                    <Paper key={groupKey} variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 2, display: "flex", flexDirection: "column" }} >
                                      <h1>test</h1>
                                      <Stack
                                        direction={{ xs: "column", sm: "row" }}
                                        alignItems={{ xs: "stretch", sm: "center" }}
                                        justifyContent="space-between"
                                        spacing={1.5}
                                      >
                                        <Box sx={{ minWidth: 0 }}>
                                          <Typography fontWeight={700} variant="body2">
                                            {group.name || `Untitled ${campaign.provider === "googleAds" ? "ad group" : "ad set"}`}
                                          </Typography>
                                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                                            <Chip size="small" label={groupStatus} color={/ACTIVE|ENABLED/.test(groupStatus) ? "success" : /PAUSED/.test(groupStatus) ? "warning" : "default"} />
                                            {group.type && <Chip size="small" variant="outlined" label={String(group.type).replace(/_/g, " ")} />}
                                            {group.optimization_goal && <Chip size="small" variant="outlined" label={String(group.optimization_goal).replace(/_/g, " ")} />}
                                            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>ID: {groupId}</Typography>
                                          </Stack>
                                          {group.metrics && (
                                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
                                              {`Last 30 days · ${formatMetric(group.metrics.impressions)} impressions · ${formatMetric(group.metrics.clicks)} clicks`}
                                            </Typography>
                                          )}
                                          {campaign.provider === "metaAds" && groupBudget != null && (
                                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                                              {group.daily_budget != null ? "Daily budget" : "Lifetime budget"}: {formatCurrency(readNumber(groupBudget) === null ? null : Number(groupBudget) / 100, currency)}
                                            </Typography>
                                          )}
                                        </Box>
                                        <Tooltip title={groupAdsOpen ? "Hide ads and creative details" : "View ads and creative details"} arrow placement="top" enterDelay={250}>
                                        <Button
                                          size="small"
                                          title={groupAdsOpen ? "Hide ads" : "View ads"}
                                          variant={groupAdsOpen ? "outlined" : "contained"}
                                          disableElevation
                                          onClick={() => toggleGroupAds(campaign, group)}
                                          endIcon={groupAdsOpen ? <Icon.ChevronUp /> : <Icon.ChevronDown />}
                                          sx={{ textTransform: "none", alignSelf: { xs: "flex-start", sm: "center" }, whiteSpace: "nowrap" }}
                                        >
                                          {groupAdsOpen ? "Hide ads" : "View ads"}
                                        </Button>
                                        </Tooltip>
                                      </Stack>

                                      <Collapse in={groupAdsOpen} timeout="auto" unmountOnExit>
                                        <Divider sx={{ my: 1.5 }} />
                                        {adsLoadingKey === groupKey && !adsByGroup[groupKey] ? (
                                          <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
                                            <CircularProgress size={16} />
                                            <Typography variant="body2" color="text.secondary">Loading ads and creative details…</Typography>
                                          </Stack>
                                        ) : null}
                                        {adsErrors[groupKey] && (
                                          <Alert severity="error" sx={{ mb: 1 }} action={<Button color="inherit" size="small" onClick={() => void loadGroupAds(campaign, group)}>Retry</Button>}>
                                            {adsErrors[groupKey]}
                                          </Alert>
                                        )}
                                        {adsLoadedByGroup[groupKey] && (adsByGroup[groupKey]?.length ?? 0) === 0 && !adsErrors[groupKey] && (
                                          <Typography variant="body2" color="text.secondary" sx={{ py: 1.5 }}>No ads were returned for this {campaign.provider === "googleAds" ? "ad group" : "ad set"}.</Typography>
                                        )}
                                        <Stack spacing={1.25}>
                                          {(adsByGroup[groupKey] ?? []).map((ad) => {
                                            const creative = getAdCreativeSummary(ad);
                                            const adStatus = String(ad.status ?? ad.effective_status ?? "—").replace(/_/g, " ");
                                            return (
                                              <Paper key={String(ad.id)} variant="outlined" sx={{ p: 1.5, bgcolor: "background.default" }}>
                                                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "stretch", sm: "flex-start" }}>
                                                  {creative.mediaUrl && (
                                                    <Box
                                                      component="img"
                                                      src={creative.mediaUrl}
                                                      alt="Ad creative preview"
                                                      loading="lazy"
                                                      sx={{ width: { xs: "100%", sm: 112 }, height: { xs: 160, sm: 84 }, objectFit: "cover", borderRadius: 1.5, bgcolor: "action.hover" }}
                                                    />
                                                  )}
                                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                                      <Typography variant="body2" fontWeight={700}>{ad.name || `Ad ${ad.id}`}</Typography>
                                                      <Chip size="small" label={adStatus} color={/ACTIVE|ENABLED/.test(adStatus) ? "success" : /PAUSED/.test(adStatus) ? "warning" : "default"} />
                                                      {ad.type && <Chip size="small" variant="outlined" label={String(ad.type).replace(/_/g, " ")} />}
                                                    </Stack>
                                                    <Typography variant="body2" sx={{ mt: 0.75, fontWeight: 600 }}>{creative.headline}</Typography>
                                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, whiteSpace: "pre-wrap" }}>{creative.body}</Typography>
                                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                                                      <Chip size="small" variant="outlined" label={`CTA: ${creative.callToAction}`} />
                                                      {creative.assetCount > 0 && <Chip size="small" variant="outlined" label={`${creative.assetCount} linked asset${creative.assetCount === 1 ? "" : "s"}`} />}
                                                      {ad.creative?.id && <Chip size="small" variant="outlined" label={`Creative ${ad.creative.id}`} />}
                                                      {Array.isArray(ad.assetResourceNames) && ad.assetResourceNames.slice(0, 2).map((resourceName: string) => (
                                                        <Tooltip key={resourceName} title={resourceName} arrow enterDelay={250}>
                                                          <Chip size="small" variant="outlined" label={`Asset ${resourceName.split("/").at(-1)}`} />
                                                        </Tooltip>
                                                      ))}
                                                    </Stack>
                                                    {creative.destination !== "No destination URL" && (
                                                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75, overflowWrap: "anywhere" }}>
                                                        Destination: {creative.destination}
                                                      </Typography>
                                                    )}
                                                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>Ad ID: {String(ad.id)}</Typography>
                                                  </Box>
                                                </Stack>
                                              </Paper>
                                            );
                                          })}
                                        </Stack>
                                        {adsNextTokens[groupKey] && (
                                          <Button
                                            size="small"
                                            disabled={adsLoadingKey === groupKey}
                                            onClick={() => void loadGroupAds(campaign, group, adsNextTokens[groupKey] ?? undefined)}
                                            sx={{ mt: 1.25, textTransform: "none" }}
                                          >
                                            Load more ads
                                          </Button>
                                        )}
                                      </Collapse>
                                    </Paper>
                                  );
                                })}
                              </Stack>
                              {groupNextTokens[rowKey] && (
                                <Button
                                  size="small"
                                  disabled={groupLoadingKey === rowKey}
                                  onClick={() => void loadCampaignChildren(campaign, groupNextTokens[rowKey] ?? undefined)}
                                  sx={{ mt: 1.5, textTransform: "none" }}
                                >
                                  Load more {campaign.provider === "googleAds" ? "ad groups" : "ad sets"}
                                </Button>
                              )}
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
}
