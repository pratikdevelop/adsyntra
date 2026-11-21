"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import {
  CAMPAIGNS_STORAGE_KEY,
  ManagedCampaignRecord,
  readManagedCampaigns,
  writeManagedCampaigns,
} from "../../../../interfaces/campaigns.interface";
import { ClickAwayListener, Collapse } from "@mui/material";
import { InputAdornment } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import {
  initialConnection,
  googlePerformanceGoalsByType,
  googleAppGoalOptionsBySubtype,
  metaOptimizationOptions,
  metaBillingOptionsByGoal,
  googleCampaignTypes,
  metaObjectiveMap,
  objectives,
  googleObjectiveFromShared,
  googleMarketingObjectiveOptions,
  googleAppSubtypeOptions,
  metaBuyingTypes,
  metaBidStrategies,
} from "@/constants/campaign-creation.constant";
import {
  ProviderConnection,
  LibraryAsset,
  CreativeVariation,
  DemoCreationJob,
  ConnectionResponse,
  GoogleCreativePack,
  GenerateCreativeResponse,
  GenerateCreativeRequest,
  GeneratedCreativeAsset,
  CreativeAssetGenerationError,
} from "@/interfaces/campaign-creation.interface";
import {
  ProviderName,
  Objective,
  GoogleMarketingObjective,
  GoogleEuPoliticalStatus,
  GoogleBiddingMode,
  GooglePerformanceGoal,
  GoogleBudgetMode,
  GoogleBiddingScope,
  GoogleHotelBidStrategy,
  GoogleAppSubtype,
  GoogleAppGoalType,
  MetaBudgetLevel,
  MetaBidStrategy,
  WorkspaceView,
  CampaignPlatformFilter,
  CampaignLifecycleStatus,
  AssetKind,
  CreativeAspectRatio,
  ManagedStatus,
  CampaignExecutionMode,
  PlatformMode,
  CampaignExecutionPayload,
  MetaBuyingType,
} from "@/types/campaign-creation.type";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  Step,
  StepButton,
  Stepper,
  Tab,
  Tabs,
  IconButton,
  TextField,
  Stack,
  Typography,
  Checkbox,
  Autocomplete,
} from "@mui/material";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

const GOOGLE_ADS_IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

type NormalizedGoogleImage = {
  blob: Blob;
  mimeType: "image/jpeg" | "image/png";
  extension: "jpg" | "png";
  width: number;
  height: number;
};

/**
 * Google Ads Image Assets currently accept JPEG and PNG only and have a 5 MB
 * upload limit. Convert WebP/GIF (and oversized JPEG/PNG) before they are
 * attached to the Google Display campaign. The original library asset remains
 * untouched; a normalized copy is saved as a regular Asset Library item.
 */
async function normalizeImageBlobForGoogleAds(
  sourceBlob: Blob,
): Promise<NormalizedGoogleImage> {
  if (!sourceBlob || sourceBlob.size === 0) {
    throw new Error("The selected image file is empty.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(sourceBlob);
  } catch {
    throw new Error(
      "This image format cannot be decoded by the browser for Google Ads upload.",
    );
  }

  try {
    const width = bitmap.width;
    const height = bitmap.height;
    const sourceMimeType = sourceBlob.type.toLowerCase();
    const alreadySupported =
      sourceMimeType === "image/jpeg" || sourceMimeType === "image/png";

    if (
      alreadySupported &&
      sourceBlob.size <= GOOGLE_ADS_IMAGE_UPLOAD_MAX_BYTES
    ) {
      return {
        blob: sourceBlob,
        mimeType: sourceMimeType as "image/jpeg" | "image/png",
        extension: sourceMimeType === "image/jpeg" ? "jpg" : "png",
        width,
        height,
      };
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      throw new Error("Unable to prepare this image for Google Ads upload.");
    }
    context.drawImage(bitmap, 0, 0, width, height);

    const toBlob = (type: string, quality?: number) =>
      new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, type, quality);
      });

    // Prefer PNG to preserve transparency when converting WebP/GIF.
    const pngBlob = await toBlob("image/png");
    if (!pngBlob) {
      throw new Error("Unable to convert this image to PNG.");
    }
    if (pngBlob.size <= GOOGLE_ADS_IMAGE_UPLOAD_MAX_BYTES) {
      return {
        blob: pngBlob,
        mimeType: "image/png",
        extension: "png",
        width,
        height,
      };
    }

    // If PNG exceeds Google's size limit, flatten onto white and compress to JPEG.
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    for (const quality of [0.9, 0.82, 0.74, 0.66]) {
      const jpegBlob = await toBlob("image/jpeg", quality);
      if (jpegBlob && jpegBlob.size <= GOOGLE_ADS_IMAGE_UPLOAD_MAX_BYTES) {
        return {
          blob: jpegBlob,
          mimeType: "image/jpeg",
          extension: "jpg",
          width,
          height,
        };
      }
    }

    throw new Error(
      "This image is still larger than Google Ads' 5 MB image limit after conversion. Choose a smaller image.",
    );
  } finally {
    bitmap.close();
  }
}

function getLibraryAssetAspectRatio(asset: LibraryAsset): number | null {
  const storedRatio = asset.aspectRatio?.trim();
  if (storedRatio) {
    const ratioMatch = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(
      storedRatio,
    );
    if (ratioMatch) {
      const numerator = Number(ratioMatch[1]);
      const denominator = Number(ratioMatch[2]);
      if (numerator > 0 && denominator > 0) return numerator / denominator;
    }
    const numericRatio = Number(storedRatio);
    if (Number.isFinite(numericRatio) && numericRatio > 0) return numericRatio;
  }

  if (asset.width && asset.height && asset.width > 0 && asset.height > 0) {
    return asset.width / asset.height;
  }
  return null;
}

type LiveCampaignResource = {
  resourceType?: string;
  resourceId?: string;
};

type LiveProviderErrorDetails = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    is_transient?: boolean;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
};

type LiveProviderResult = {
  success?: boolean;
  accountId?: string;
  creationStatus?: string;
  deliveryStatus?: string;
  providerCampaignId?: string;
  failedStep?: string;
  error?: string;
  partialResources?: LiveCampaignResource[];
  // Successful provider operations return a keyed object; array-valued keys
  // represent multiple created resources (for example keywords/criteria).
  createdResources?: Record<string, string | string[] | undefined>;
  providerStatusCode?: number;
  providerErrorDetails?: LiveProviderErrorDetails;
};

type LiveCampaignApiResponse = {
  success?: boolean;
  partialSuccess?: boolean;
  message?: string;
  failedProviders?: string[];
  successfulProviders?: string[];
  campaign?: {
    id?: string;
    name?: string;
    createdAt?: string;
    providers?: Record<
      string,
      {
        providerCampaignId?: string;
        creationStatus?: string;
        deliveryStatus?: string;
      }
    >;
  };
  providers?: Record<string, LiveProviderResult>;
};

type CampaignCreativeTargetReference = {
  generationId: string;
  capabilityId: string;
  requirementId: string;
  role: GeneratedCreativeAsset["role"];
  assetIndex: number;
  platform: "googleAds" | "metaAds";
};


type MetaPageResource = {
  id: string;
  name?: string;
  tasks?: string[];
  instagram_business_account?: { id: string; username?: string } | null;
};

type MetaPageLookupResponse = {
  success: boolean;
  message?: string;
  pages?: MetaPageResource[];
  pagination?: {
    hasNextPage?: boolean;
    nextCursor?: string | null;
  };
};

async function requestMetaPageLookup(
  getToken: () => Promise<string | null>,
  after?: string,
): Promise<MetaPageLookupResponse> {
  const token = await getToken();
  if (!token) throw new Error("Unable to retrieve your authentication token.");

  const url = new URL(`${API_BASE_URL}/api/campaigns/lookups/meta/pages`);
  if (after) url.searchParams.set("after", after);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | MetaPageLookupResponse
    | null;

  if (!response.ok || payload?.success !== true) {
    throw new Error(
      payload?.message || `Facebook Page lookup failed (${response.status}).`,
    );
  }

  return payload;
}


function formatLiveResourceName(resourceType: string): string {
  const normalized = resourceType.replace(/[\s_-]/g, "").toLowerCase();
  const labels: Record<string, string> = {
    budget: "Campaign Budget",
    campaignbudget: "Campaign Budget",
    campaign: "Campaign",
    adset: "Ad Set",
    adgroup: "Ad Group",
    assetgroup: "Asset Group",
    creative: "Ad Creative",
    adcreative: "Ad Creative",
    locationcriteria: "Location Targeting",
    positivekeywords: "Positive Keywords",
    negativekeywords: "Negative Keywords",
    responsivesearchad: "Responsive Search Ad",
    ad: "Ad",
  };

  return (
    labels[normalized] ||
    resourceType.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ")
  );
}

export type AssetReviewStatus =
  | "DRAFT"
  | "APPROVED"
  | "REJECTED";

type CampaignLibraryAsset = LibraryAsset & {
  reviewStatus?: AssetReviewStatus;
  reviewedAt?: string | null;
  reviewedByUserId?: string | null;
};

function normalizeConnection(
  provider?: Partial<ProviderConnection>,
): ProviderConnection {
  return {
    connected: Boolean(provider?.connected),
    accounts: Array.isArray(provider?.accounts) ? provider.accounts : [],
    selectedAccountId:
      typeof provider?.selectedAccountId === "string"
        ? provider.selectedAccountId
        : null,
  };
}

function getAccountRecord(account: unknown): Record<string, unknown> | null {
  return account && typeof account === "object"
    ? (account as Record<string, unknown>)
    : null;
}

function getAccountId(account: unknown): string | null {
  if (typeof account === "string" && account.trim()) return account.trim();
  const item = getAccountRecord(account);
  if (!item) return null;

  const id =
    item.resourceName ??
    item.resource_name ??
    item.customerId ??
    item.customer_id ??
    item.accountId ??
    item.account_id ??
    item.id;

  return id === undefined || id === null || String(id).trim() === ""
    ? null
    : String(id).trim();
}

function getAccountName(account: unknown): string {
  if (typeof account === "string") return account;
  const item = getAccountRecord(account);
  if (!item) return "Advertising account";

  const name =
    item.descriptiveName ??
    item.descriptive_name ??
    item.accountName ??
    item.account_name ??
    item.business_name ??
    item.name;

  return typeof name === "string" && name.trim()
    ? name.trim()
    : getAccountId(account) || "Advertising account";
}

function getAccountCurrency(account: unknown): string | null {
  const item = getAccountRecord(account);
  if (!item) return null;
  const currency = item.currencyCode ?? item.currency_code ?? item.currency;
  return typeof currency === "string" && currency.trim()
    ? currency.trim().toUpperCase()
    : null;
}

function selectedAccount(connection: any): unknown | null {
  return (
    connection.accounts?.find(
      (account: any) => getAccountId(account) === connection.selectedAccountId,
    ) ?? null
  );
}

function selectedAccountLabel(connection: any): string {
  const account = selectedAccount(connection);
  return account
    ? getAccountName(account)
    : connection.selectedAccountId || "No account selected";
}

function selectedCurrency(connection: any): string {
  const account = selectedAccount(connection);
  return getAccountCurrency(account) || "account currency";
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object"
    ? (value as Record<string, any>)
    : {};
}

function normalizeProviderCampaignStatus(
  provider: ProviderName,
  row: Record<string, any>,
): CampaignLifecycleStatus {
  const rawStatus = String(row.status ?? "").toUpperCase();
  const effectiveStatus = String(row.effective_status ?? "").toUpperCase();

  if (
    ["REMOVED", "ARCHIVED", "DELETED"].includes(rawStatus) ||
    ["REMOVED", "ARCHIVED", "DELETED"].includes(effectiveStatus)
  ) {
    return "ARCHIVED";
  }

  if (
    rawStatus === "PAUSED" ||
    (provider === "metaAds" &&
      ["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"].includes(effectiveStatus))
  ) {
    return "PAUSED";
  }

  if (["ENABLED", "ACTIVE"].includes(rawStatus)) return "ACTIVE";
  return "DRAFT";
}

function formatCurrencyAmount(amount: number, currencyCode: string): string {
  if (!Number.isFinite(amount)) return "Not reported";
  if (!/^[A-Z]{3}$/.test(currencyCode)) return String(amount);

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

// Meta campaign budget fields are expressed in the currency's smallest unit.
function formatMetaBudgetAmount(
  value: unknown,
  currencyCode: string,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  const minorUnits = Number(value);
  if (!Number.isFinite(minorUnits)) return null;
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    return `${minorUnits} minor units`;
  }

  try {
    const fractionDigits = new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
    }).resolvedOptions().maximumFractionDigits;
    return formatCurrencyAmount(
      minorUnits / 10 ** fractionDigits,
      currencyCode,
    );
  } catch {
    return `${minorUnits} minor units`;
  }
}

function formatCampaignDate(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function mapCampaignListResponse(
  responseData: unknown,
  connections: { googleAds: ProviderConnection; metaAds: ProviderConnection },
): ManagedCampaignRecord[] {
  const response = asObject(responseData);
  const providerResults = asObject(response.providers);
  const savedCampaigns = Array.isArray(response.savedCampaigns)
    ? response.savedCampaigns.map(asObject)
    : [];

  const providers: any = ["googleAds", "metaAds"];
  const records: any[] = [];

  for (const provider of providers) {
    const providerResult = asObject(providerResults[provider]);
    if (providerResult.success !== true) continue;

    const campaigns = asObject(providerResult.data).campaigns;
    if (!Array.isArray(campaigns)) continue;

    const currencyCode = selectedCurrency(connections[provider]);
    const accountLabel = selectedAccountLabel(connections[provider]);

    for (const item of campaigns) {
      const row = asObject(item);
      const providerCampaignId = String(
        row.id ?? row.campaign?.id ?? "",
      ).trim();
      if (!providerCampaignId) continue;

      const savedCampaign = savedCampaigns.find((saved) => {
        const savedProvider = asObject(asObject(saved.providers)[provider]);
        const savedId = String(
          savedProvider.providerCampaignId ?? savedProvider.campaignId ?? "",
        );
        const savedAccountId = String(savedProvider.accountId ?? "");
        const responseAccountId = String(providerResult.accountId ?? "");
        return (
          savedId === providerCampaignId &&
          (!savedAccountId ||
            !responseAccountId ||
            savedAccountId === responseAccountId)
        );
      });

      const savedProvider = savedCampaign
        ? asObject(asObject(savedCampaign.providers)[provider])
        : {};
      const campaignName = String(
        savedCampaign?.name ??
        row.name ??
        row.campaign?.name ??
        "Unnamed campaign",
      );

      let budgetLabel = "Not reported";
      if (provider === "googleAds") {
        const budget = asObject(row.budget);
        const amount = Number(budget.amount);
        if (
          budget.amount !== null &&
          budget.amount !== undefined &&
          Number.isFinite(amount)
        ) {
          const currency = String(budget.currencyCode ?? currencyCode);
          const rendered = formatCurrencyAmount(amount, currency);
          budgetLabel = `${rendered}${budget.type === "daily" ? " / day" : budget.type === "lifetime" ? " total" : ""}`;
        }
      } else {
        const daily = formatMetaBudgetAmount(row.daily_budget, currencyCode);
        const lifetime = formatMetaBudgetAmount(
          row.lifetime_budget,
          currencyCode,
        );
        if (daily) budgetLabel = `${daily} / day`;
        else if (lifetime) budgetLabel = `${lifetime} lifetime`;
        else budgetLabel = "Budget managed at Ad Set level or not reported";
      }

      const objective =
        savedCampaign?.objective ?? row.objective ?? row.channelType ?? "—";
      const campaignType =
        provider === "googleAds"
          ? `Google ${String(row.channelType ?? "Campaign").replaceAll("_", " ")}`
          : `Meta ${String(row.buying_type ?? "Campaign").replaceAll("_", " ")}`;
      const creationStatusRaw = String(
        savedProvider.creationStatus ?? "created",
      ).toLowerCase();
      const creationStatus =
        creationStatusRaw === "partial" ||
          creationStatusRaw === "partial_success"
          ? "PARTIAL_SUCCESS"
          : creationStatusRaw === "failed"
            ? "FAILED"
            : "SUCCESS";

      records.push({
        id: `${provider}:${providerCampaignId}`,
        groupId: String(
          savedCampaign?._id ??
          savedCampaign?.id ??
          `${provider}:${providerCampaignId}`,
        ),
        name: campaignName,
        provider,
        campaignType,
        googleCampaignType:
          provider === "googleAds" ? (row.channelType ?? undefined) : undefined,
        objective,
        budgetLabel,
        status: normalizeProviderCampaignStatus(provider, row),
        creationStatus,
        accountLabel:
          accountLabel === "No account selected"
            ? String(providerResult.accountId ?? accountLabel)
            : accountLabel,
        createdAt: formatCampaignDate(
          savedCampaign?.createdAt ?? row.created_time ?? row.createdAt,
        ),
        updatedAt: formatCampaignDate(
          row.updated_time ??
          savedCampaign?.updatedAt ??
          savedCampaign?.createdAt,
        ),
        source: "LIVE",
        providerCampaignId,
        providerAccountId: providerResult.accountId ?? row.account_id ?? null,
        providerStatus: row.status ?? null,
        effectiveStatus:
          row.effective_status ??
          row.primaryStatus ??
          row.servingStatus ??
          null,
        objectiveRaw: row.objective ?? null,
        metrics: row.metrics ?? null,
      });
    }
  }

  return records as unknown as ManagedCampaignRecord[];
}

function isPositiveAmount(value: string): boolean {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

type GoogleAdsLookupOption = {
  id?: string | number;
  name?: string;
  canonicalName?: string;
  canonical_name?: string;
  descriptiveName?: string;
  descriptive_name?: string;
  resourceName?: string;
  resource_name?: string;
  countryCode?: string;
  country_code?: string;
  targetType?: string;
  target_type?: string;
  type?: string;
  status?: string;
  membershipStatus?: string;
  accessReason?: string;
  description?: string;
  category?: string;
  primaryForGoal?: boolean;
  currencyCode?: string;
  attachedCampaignCount?: number;
};

type MetaCampaignLookupOption = {
  id?: string | number;
  key?: string | number;
  name?: string;
  label?: string;
  description?: string;
  type?: string;
  country_code?: string;
  countryCode?: string;
  country_name?: string;
  region?: string;
  region_name?: string;
  city?: string;
  radius?: number;
  distance_unit?: string;
  path?: string[];
  targeting?: Record<string, any>;
  targeting_spec?: Record<string, any>;
  approximate_count_lower_bound?: number;
  approximate_count_upper_bound?: number;
  subtype?: string;
  [key: string]: unknown;
};

type MetaPixelResource = {
  id: string;
  name: string;
  lastFiredTime: string | null;
  creationTime: string | null;
  isUnavailable: boolean;
};

type MetaPixelLookupResponse = {
  success: boolean;
  message?: string;
  adAccountId?: string;
  pixels?: MetaPixelResource[];
  pagination?: {
    hasNextPage?: boolean;
    nextCursor?: string | null;
  };
};

type MetaPixelEventOption = {
  eventName: string;
  customEventType: string;
  isObserved: boolean;
  eventCount: number;
  lastSeenAt: string | null;
};

type MetaPixelEventsResponse = {
  success: boolean;
  message?: string;
  pixelId?: string;
  eventOptions?: MetaPixelEventOption[];
  observedEvents?: Array<{
    eventName: string;
    count: number;
    customEventType: string | null;
    isStandardConversionEvent: boolean;
  }>;
};

type MetaCustomConversionResource = {
  id: string;
  name: string;
  accountId?: string;
  customEventType?: string;
  description?: string;
  creationTime?: string;
  firstFiredTime?: string;
  lastFiredTime?: string;
  eventSourceType?: string;
  sourcePixelId: string;
  sourcePixelIds: string[];
  isArchived: boolean;
  isUnavailable: boolean;
  rule?: string;
};

type MetaCustomConversionLookupResponse = {
  success: boolean;
  message?: string;
  customConversions?: MetaCustomConversionResource[];
  pagination?: {
    hasNextPage?: boolean;
    nextCursor?: string | null;
  };
};

async function requestMetaCustomConversions(
  getToken: () => Promise<string | null>,
  pixelId: string,
  after?: string,
): Promise<MetaCustomConversionLookupResponse> {
  const token = await getToken();

  if (!token) {
    throw new Error(
      "Unable to retrieve your authentication token.",
    );
  }

  const url = new URL(
    `${API_BASE_URL}/api/campaigns/lookups/meta/custom-conversions`,
  );

  url.searchParams.set("pixelId", pixelId);

  if (after) {
    url.searchParams.set("after", after);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const payload =
    (await response.json().catch(() => null)) as
    | MetaCustomConversionLookupResponse
    | null;

  if (!response.ok || payload?.success !== true) {
    throw new Error(
      payload?.message ||
      `Meta Custom Conversion lookup failed (${response.status}).`,
    );
  }

  return payload;
}
async function requestMetaPixels(
  getToken: () => Promise<string | null>,
): Promise<MetaPixelLookupResponse> {
  const token = await getToken();

  if (!token) {
    throw new Error("Unable to retrieve your authentication token.");
  }

  const response = await fetch(
    `${API_BASE_URL}/api/campaigns/lookups/meta/pixels`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | MetaPixelLookupResponse
    | null;

  if (!response.ok || payload?.success !== true) {
    throw new Error(
      payload?.message ||
      `Meta Pixel lookup failed (${response.status}).`,
    );
  }

  return payload;
}

async function requestMetaPixelEvents(
  getToken: () => Promise<string | null>,
  pixelId: string,
): Promise<MetaPixelEventsResponse> {
  const token = await getToken();

  if (!token) {
    throw new Error("Unable to retrieve your authentication token.");
  }

  const response = await fetch(
    `${API_BASE_URL}/api/campaigns/lookups/meta/pixels/${encodeURIComponent(pixelId)}/events?days=7`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | MetaPixelEventsResponse
    | null;

  if (!response.ok || payload?.success !== true) {
    throw new Error(
      payload?.message ||
      `Meta Pixel event lookup failed (${response.status}).`,
    );
  }

  return payload;
}

function getMetaLookupRows(payload: unknown): MetaCampaignLookupOption[] {
  const root = asObject(payload);
  const data = asObject(root.data);
  const nested = asObject(data.data);
  const candidates = [
    root.results,
    root.audiences,
    root.locations,
    Array.isArray(root.data) ? root.data : null,
    data.results,
    data.audiences,
    data.locations,
    Array.isArray(data.data) ? data.data : null,
    nested.results,
    nested.audiences,
    nested.locations,
    nested.data,
  ];
  const rows = candidates.find(Array.isArray);
  return (rows ?? []) as MetaCampaignLookupOption[];
}

function getMetaLookupId(option: MetaCampaignLookupOption): string {
  const value = option.id ?? option.key ?? option.resourceName ?? option.resource_name;
  return value === undefined || value === null ? "" : String(value).trim();
}

function getMetaLookupLabel(option: MetaCampaignLookupOption): string {
  const path = Array.isArray(option.path) ? option.path.join(" / ") : "";
  const label = option.name ?? option.label ?? path;
  return String(label || getMetaLookupId(option));
}

function appendUniqueValues(current: string, values: string[], separator = "\n") {
  const existing = current
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const next = new Set(existing);
  values.map((value) => value.trim()).filter(Boolean).forEach((value) => next.add(value));
  return [...next].join(separator);
}

async function fetchMetaCampaignLookupOptions(
  apiBaseUrl: string,
  token: string,
  endpoint: string,
  params: Record<string, string> = {},
): Promise<MetaCampaignLookupOption[]> {
  const url = new URL(`${apiBaseUrl.replace(/\/$/, "")}/api/campaigns/${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  const root = asObject(payload);
  if (!response.ok || root.success === false) {
    throw new Error(
      String(root.message ?? root.error ?? `Meta ${endpoint} lookup failed (${response.status}).`),
    );
  }
  return getMetaLookupRows(payload).filter((item) => Boolean(getMetaLookupId(item)));
}

function normalizeGoogleCustomerId(value: string): string {
  return value
    .trim()
    .replace(/^customers\//i, "")
    .replace(/-/g, "");
}

function getGoogleLookupRows(
  payload: unknown,
  keys: string[],
): GoogleAdsLookupOption[] {
  const root = asObject(payload);
  const data = asObject(root.data);
  const nested = asObject(data.data);

  const candidates = [
    root.items,
    root.results,
    Array.isArray(root.data) ? root.data : null,
    data.items,
    data.results,
    ...keys.map((key) => root[key]),
    ...keys.map((key) => data[key]),
    ...keys.map((key) => nested[key]),
  ];

  const rows = candidates.find(Array.isArray);

  return (rows ?? []) as GoogleAdsLookupOption[];
}

function getGoogleLookupResourceName(
  option: GoogleAdsLookupOption,
  prefix?: string,
): string {
  const resourceName = option.resourceName ?? option.resource_name;

  if (typeof resourceName === "string" && resourceName.trim()) {
    return resourceName.trim();
  }

  const id = String(option.id ?? "").trim();

  if (!id) return "";
  if (id.includes("/")) return id;

  return prefix && /^\d+$/.test(id) ? `${prefix}/${id}` : "";
}

function getGoogleLookupLabel(option: GoogleAdsLookupOption): string {
  return String(
    option.canonicalName ??
    option.canonical_name ??
    option.name ??
    option.descriptiveName ??
    option.descriptive_name ??
    option.resourceName ??
    option.resource_name ??
    "",
  );
}

function toggleGoogleResourceName(
  current: string,
  resourceName: string,
  checked: boolean,
): string {
  const values = current
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  const next = new Set(values);

  if (checked) {
    next.add(resourceName);
  } else {
    next.delete(resourceName);
  }

  return [...next].join("\n");
}
async function fetchGoogleLookupOptions(
  apiBaseUrl: string,
  token: string,
  customerId: string,
  endpoint: string,
  responseKeys: string[],
  resourcePrefix?: string,
  params: Record<string, string> = {},
): Promise<GoogleAdsLookupOption[]> {
  const url = new URL(
    `${apiBaseUrl.replace(/\/+$/, "")}/api/campaigns/lookups/google/${endpoint}`,
  );

  url.searchParams.set("customerId", customerId);

  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);
  const root = asObject(payload);
  const data = asObject(root.data);

  if (!response.ok || root.success === false) {
    const message =
      root.message ??
      (typeof root.error === "string" ? root.error : "") ??
      asObject(root.error).message;

    throw new Error(
      String(
        message || `Google Ads ${endpoint} lookup failed (${response.status}).`,
      ),
    );
  }

  const returnedAccountId = root.accountId ?? data.accountId ?? data.customerId;

  if (
    returnedAccountId &&
    normalizeGoogleCustomerId(String(returnedAccountId)) !== customerId
  ) {
    throw new Error(
      "Google Ads lookup returned data for a different customer account.",
    );
  }

  return getGoogleLookupRows(payload, responseKeys).filter((item) =>
    Boolean(getGoogleLookupResourceName(item, resourcePrefix)),
  );
}
export default function CreateCampaignPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [googleLocationOptionsOpen, setGoogleLocationOptionsOpen] =
    useState(false);
  const [connections, setConnections] = useState<any>({
    googleAds: initialConnection,
    metaAds: initialConnection,
  });
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  // Tracks the furthest wizard step reached so completed steps can be reopened directly.
  const [furthestStep, setFurthestStep] = useState(1);
  const [selectedPlatforms, setSelectedPlatforms] = useState<ProviderName[]>(
    [],
  );

  // Shared campaign brief.
  const [campaignName, setCampaignName] = useState(
    "Demo - Summer Sale Campaign",
  );
  const [businessName, setBusinessName] = useState("Acme Demo Store");
  const [websiteUrl, setWebsiteUrl] = useState(
    "https://conversanemo-ai.onrender.com/",
  );
  const [description, setDescription] = useState(
    "Promote the summer collection and drive online purchases.",
  );
  const [objective, setObjective] = useState<Objective | "">("SALES");

  // Google Ads settings.
  const [googleCampaignType, setGoogleCampaignType] = useState("SEARCH");
  const [googleMarketingObjective, setGoogleMarketingObjective] =
    useState<GoogleMarketingObjective>("SALES");
  const [googleEuPoliticalStatus, setGoogleEuPoliticalStatus] =
    useState<GoogleEuPoliticalStatus>(
      "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    );
  const [googleBiddingMode, setGoogleBiddingMode] =
    useState<GoogleBiddingMode>("AUTOMATED");
  const [googlePerformanceGoal, setGooglePerformanceGoal] =
    useState<GooglePerformanceGoal>("CONVERSIONS");
  const [googleBudgetMode, setGoogleBudgetMode] =
    useState<GoogleBudgetMode>("DAILY");
  const [googleDailyBudget, setGoogleDailyBudget] = useState("1500");
  const [googleCampaignTotalBudget, setGoogleCampaignTotalBudget] =
    useState("15000");
  const [googleBiddingScope, setGoogleBiddingScope] =
    useState<GoogleBiddingScope>("STANDARD");
  const [
    googlePortfolioStrategyResourceName,
    setGooglePortfolioStrategyResourceName,
  ] = useState("");
  const [googleStartDate, setGoogleStartDate] = useState("2026-11-12");
  const [googleEndDate, setGoogleEndDate] = useState("2026-12-12");
  const [googleGeoTargetResources, setGoogleGeoTargetResources] = useState("");
  const [
    metaCustomConversionOptions,
    setMetaCustomConversionOptions,
  ] = useState<MetaCustomConversionResource[]>([]);

  const [
    metaCustomConversionId,
    setMetaCustomConversionId,
  ] = useState("");

  const [
    metaCustomConversionsLoading,
    setMetaCustomConversionsLoading,
  ] = useState(false);

  const [
    metaCustomConversionsError,
    setMetaCustomConversionsError,
  ] = useState("");
  const [
    googleCustomConversionGoalResourceName,
    setGoogleCustomConversionGoalResourceName,
  ] = useState("");
  const [googleLanguageResources, setGoogleLanguageResources] = useState("");
  const [googleTargetCpa, setGoogleTargetCpa] = useState("500");
  const [googleTargetRoas, setGoogleTargetRoas] = useState("3.0");
  const [googleAdGroupUserLists, setGoogleAdGroupUserLists] = useState("");
  const [googleImpressionSharePercent, setGoogleImpressionSharePercent] =
    useState("80");
  const [googleImpressionShareLocation, setGoogleImpressionShareLocation] =
    useState("TOP_OF_PAGE");
  const [googleImpressionShareMaxCpc, setGoogleImpressionShareMaxCpc] =
    useState("100");
  const [googleSearchPartners, setGoogleSearchPartners] = useState(false);
  const [googleDisplayExpansion, setGoogleDisplayExpansion] = useState(false);
  const [googleHotelCenterId, setGoogleHotelCenterId] = useState("123456789");
  const [googleHotelBidStrategy, setGoogleHotelBidStrategy] =
    useState<GoogleHotelBidStrategy>("PERCENT_CPC");
  const [googleHotelBidCeiling, setGoogleHotelBidCeiling] = useState("25");
  const [googleHotelAdGroupName, setGoogleHotelAdGroupName] =
    useState("Hotel Ad Group");
  const [googleHotelTargetCountry, setGoogleHotelTargetCountry] =
    useState("US");
  const [googleHotelLanguage, setGoogleHotelLanguage] = useState("en");
  const [googleHotelListingMode, setGoogleHotelListingMode] = useState<
    "ALL_HOTELS" | "SELECTED_HOTELS"
  >("ALL_HOTELS");
  const [googleHotelPropertyIds, setGoogleHotelPropertyIds] =
    useState("DEMO_HOTEL_001");
  const [googleMerchantCenterId, setGoogleMerchantCenterId] =
    useState("123456789");
  const [googleShoppingPriority, setGoogleShoppingPriority] = useState("0");
  const [googleShoppingFeedLabel, setGoogleShoppingFeedLabel] =
    useState("DEMO_FEED");
  const [googleShoppingProductGroupType, setGoogleShoppingProductGroupType] =
    useState("ALL_PRODUCTS");
  const [googleShoppingProductGroupValue, setGoogleShoppingProductGroupValue] =
    useState("DEMO_CATEGORY");
  const [demandGenChannels, setDemandGenChannels] = useState({
    youtube_in_feed: true,
    youtube_in_stream: true,
    youtube_shorts: true,
    discover: true,
    gmail: true,
    display: false,
    maps: false,
  });
  const [googleAppSubtype, setGoogleAppSubtype] =
    useState<GoogleAppSubtype>("APP_CAMPAIGN");
  const [googleAppGoalType, setGoogleAppGoalType] = useState<GoogleAppGoalType>(
    "OPTIMIZE_INSTALLS_WITHOUT_TARGET_INSTALL_COST",
  );
  const [googleAppId, setGoogleAppId] = useState("com.example.demostore");
  const [googleAppStore, setGoogleAppStore] = useState("GOOGLE_APP_STORE");
  const [googleAppTargetCost, setGoogleAppTargetCost] = useState("75");
  const [googleAppTargetRoas, setGoogleAppTargetRoas] = useState("2.5");
  const [googleAppHeadlines, setGoogleAppHeadlines] = useState(
    "Shop the Demo App\nDiscover New Arrivals\nSimple Online Shopping",
  );
  const [googleAppDescriptions, setGoogleAppDescriptions] = useState(
    "Browse products and exclusive app offers.\nEnjoy a simple and convenient shopping experience.",
  );
  const [googleAppImageUrls, setGoogleAppImageUrls] = useState(
    "https://example.com/app-image-1.jpg\nhttps://example.com/app-image-2.jpg",
  );
  const [googleAppYoutubeVideoIds, setGoogleAppYoutubeVideoIds] =
    useState("DEMO_VIDEO_ID_123");
  const [
    googleAppEngagementAudienceResource,
    setGoogleAppEngagementAudienceResource,
  ] = useState("");
  const [
    googleAppSelectiveConversionActions,
    setGoogleAppSelectiveConversionActions,
  ] = useState("");

  // Meta Ads settings.
  const [metaBuyingType, setMetaBuyingType] =
    useState<MetaBuyingType>("AUCTION");
  const [metaBudgetLevel, setMetaBudgetLevel] =
    useState<MetaBudgetLevel>("CAMPAIGN");
  // Meta requires an explicit boolean when the Campaign does not own the budget.
  // Keep this opt-in and default it to false.
  const [metaIsAdsetBudgetSharingEnabled, setMetaIsAdsetBudgetSharingEnabled] =
    useState(false);
  const [metaBudgetMode, setMetaBudgetMode] = useState<"DAILY" | "LIFETIME">(
    "DAILY",
  );
  const [metaDailyBudget, setMetaDailyBudget] = useState("1200");
  const [metaLifetimeBudget, setMetaLifetimeBudget] = useState("25000");
  const [metaStartTime, setMetaStartTime] = useState("2026-11-12T09:00");
  const [metaEndTime, setMetaEndTime] = useState("2026-12-12T18:00");
  const [metaOptimizationGoal, setMetaOptimizationGoal] = useState(
    "OFFSITE_CONVERSIONS",
  );
  const [metaBillingEvent, setMetaBillingEvent] = useState("IMPRESSIONS");
  const [metaBidStrategy, setMetaBidStrategy] = useState<MetaBidStrategy>(
    "LOWEST_COST_WITHOUT_CAP",
  );
  const [metaBidAmount, setMetaBidAmount] = useState("150");
  const [metaMinimumRoas, setMetaMinimumRoas] = useState("2.0");
  const [metaCountries, setMetaCountries] = useState("");
  const [metaRegionKeys, setMetaRegionKeys] = useState("");
  const [metaCityKeys, setMetaCityKeys] = useState("");
  const [metaZipKeys, setMetaZipKeys] = useState("");
  const [metaCityRadius, setMetaCityRadius] = useState("25");
  const [metaCityDistanceUnit, setMetaCityDistanceUnit] = useState<
    "kilometer" | "mile"
  >("kilometer");
  const [metaAgeMin, setMetaAgeMin] = useState("18");
  const [metaAgeMax, setMetaAgeMax] = useState("65");
  const [metaGender, setMetaGender] = useState<"ALL" | "MEN" | "WOMEN">("ALL");
  const [metaSpecialAdCategories, setMetaSpecialAdCategories] = useState<
    string[]
  >([]);
  const [metaPlacementMode, setMetaPlacementMode] = useState<
    "AUTOMATIC" | "MANUAL"
  >("AUTOMATIC");
  const [metaPublisherPlatforms, setMetaPublisherPlatforms] = useState<
    string[]
  >(["facebook", "instagram", "messenger", "audience_network"]);
  const [metaFacebookPositions, setMetaFacebookPositions] = useState<string[]>([
    "feed",
    "story",
    "reels",
  ]);
  const [metaInstagramPositions, setMetaInstagramPositions] = useState<
    string[]
  >(["stream", "story", "reels", "explore"]);
  const [metaMessengerPositions, setMetaMessengerPositions] = useState<
    string[]
  >(["messenger_home", "sponsored_messages"]);
  const [metaAudienceNetworkPositions, setMetaAudienceNetworkPositions] =
    useState<string[]>(["classic", "rewarded_video"]);
  const [metaAudienceInterestIds, setMetaAudienceInterestIds] =
    useState("");
  const [metaIncludedCustomAudienceIds, setMetaIncludedCustomAudienceIds] =
    useState("");
  const [metaExcludedCustomAudienceIds, setMetaExcludedCustomAudienceIds] =
    useState("");

  // Google child structure: standard Ad Group or Performance Max Asset Group.
  const [googleAdGroupName, setGoogleAdGroupName] = useState("Main Ad Group");
  const [googleKeywordLines, setGoogleKeywordLines] = useState(
    "online shopping\nsummer sale\nbuy quality products\nnew season collection",
  );
  const [googleNegativeKeywordLines, setGoogleNegativeKeywordLines] = useState(
    "free\nused\nwholesale",
  );
  const [googleKeywordMatchType, setGoogleKeywordMatchType] =
    useState("PHRASE");
  const [googleDefaultCpcBid, setGoogleDefaultCpcBid] = useState("20");
  const [pmaxAssetGroupName, setPmaxAssetGroupName] =
    useState("Main Asset Group");
  const [pmaxFinalUrl, setPmaxFinalUrl] = useState("");
  const [pmaxHeadlines, setPmaxHeadlines] = useState("");
  const [pmaxLongHeadline, setPmaxLongHeadline] = useState("");
  const [pmaxDescriptions, setPmaxDescriptions] = useState("");
  const [pmaxBusinessName, setPmaxBusinessName] = useState("");
  // Google locks this setting when the PMax campaign is created. Default to enabled.
  const [pmaxBrandGuidelinesEnabled, setPmaxBrandGuidelinesEnabled] =
    useState(true);
  const [pmaxPortraitImageUrl, setPmaxPortraitImageUrl] = useState("");
  const [pmaxYoutubeVideoIds, setPmaxYoutubeVideoIds] = useState("");
  const [pmaxLogoUrl, setPmaxLogoUrl] = useState("");
  const [pmaxLandscapeImageUrl, setPmaxLandscapeImageUrl] = useState("");
  const [pmaxSquareImageUrl, setPmaxSquareImageUrl] = useState("");
  const [pmaxSearchThemes, setPmaxSearchThemes] = useState("");
  const [pmaxAudienceResourceNames, setPmaxAudienceResourceNames] =
    useState("");
  const [
    googleDemandGenAudienceResources,
    setGoogleDemandGenAudienceResources,
  ] = useState("");

  // Meta child structure: Ad Set and a starter link-ad creative draft.
  const [metaAdSetName, setMetaAdSetName] = useState("Main Ad Set");
  const [metaPageOptions, setMetaPageOptions] = useState<MetaPageResource[]>([]);
  const [metaPagesLoading, setMetaPagesLoading] = useState(false);
  const [metaPagesError, setMetaPagesError] = useState("");
  const [metaPagesNextCursor, setMetaPagesNextCursor] = useState<string | null>(null);
  const [metaPageId, setMetaPageId] = useState("");
  const [metaInstagramActorId, setMetaInstagramActorId] = useState("");
  // const [metaPixelId, setMetaPixelId] = useState("1589401625816003");
  // const [metaConversionEvent, setMetaConversionEvent] = useState("PURCHASE");
  const [metaPixelId, setMetaPixelId] = useState("");
  const [metaConversionEvent, setMetaConversionEvent] = useState("PURCHASE");

  const [metaPixelOptions, setMetaPixelOptions] = useState<
    MetaPixelResource[]
  >([]);

  const [metaPixelEvents, setMetaPixelEvents] = useState<
    MetaPixelEventOption[]
  >([]);

  const [metaPixelsLoading, setMetaPixelsLoading] = useState(false);
  const [metaPixelEventsLoading, setMetaPixelEventsLoading] = useState(false);

  const [metaPixelsError, setMetaPixelsError] = useState("");
  const [metaPixelEventsError, setMetaPixelEventsError] = useState("");

  const [metaPrimaryText, setMetaPrimaryText] = useState(
    "Discover the latest collection from Acme Demo Store. Shop seasonal favourites and find something you love.",
  );
  const [metaAdHeadline, setMetaAdHeadline] = useState(
    "Explore the Summer Collection",
  );
  const [metaAdDescription, setMetaAdDescription] = useState(
    "New arrivals and seasonal offers.",
  );
  const [metaCreativeImageUrl, setMetaCreativeImageUrl] = useState(
    "https://bkacontent.com/wp-content/uploads/2016/06/Depositphotos_31146757_l-2015.webp",
  );
  const [metaCreativeFormat, setMetaCreativeFormat] = useState<
    "SINGLE_IMAGE" | "SINGLE_VIDEO" | "CAROUSEL"
  >("SINGLE_IMAGE");
  const [metaCreativeVideoId, setMetaCreativeVideoId] =
    useState("DEMO_META_VIDEO_ID");
  const [metaCarouselCards, setMetaCarouselCards] = useState(
    "New Arrivals | https://example.com/card-1.jpg | https://example.com/collection\nSummer Offers | https://example.com/card-2.jpg | https://example.com/offers",
  );
  const [metaDestinationType, setMetaDestinationType] = useState<
    "WEBSITE" | "INSTANT_FORM" | "MESSAGING" | "APP"
  >("WEBSITE");
  const [metaInstantFormId, setMetaInstantFormId] = useState("123456789012345");
  const [metaMessagingDestinationId, setMetaMessagingDestinationId] =
    useState("123456789012345");
  const [metaAppId, setMetaAppId] = useState("com.example.demostore");
  const [metaAppStoreUrl, setMetaAppStoreUrl] = useState(
    "https://example.com/app",
  );
  const [metaMessagingType, setMetaMessagingType] = useState<
    "MESSENGER" | "INSTAGRAM_DIRECT" | "WHATSAPP"
  >("MESSENGER");
  const [metaDestinationUrl, setMetaDestinationUrl] = useState(
    "https://conversanemo-ai.onrender.com/",
  );
  const [metaCallToAction, setMetaCallToAction] = useState("LEARN_MORE");

  // Google ad drafts are collected after the campaign's Ad Group / Asset Group.
  const [googleSearchFinalUrl, setGoogleSearchFinalUrl] = useState(
    "https://conversanemo-ai.onrender.com/",
  );
  const [googleSearchHeadlines, setGoogleSearchHeadlines] = useState(
    "Shop Quality Products\nSummer Sale Is Here\nFast Delivery Available",
  );
  const [googleSearchDescriptions, setGoogleSearchDescriptions] = useState(
    "Discover quality products at great prices. Browse the latest collection online.\nShop today and enjoy convenient delivery on eligible orders.",
  );
  const [googleSearchPath1, setGoogleSearchPath1] = useState("summer-sale");
  const [googleSearchPath2, setGoogleSearchPath2] = useState("shop-online");
  const [googleDisplayFinalUrl, setGoogleDisplayFinalUrl] = useState(
    "https://conversanemo-ai.onrender.com/",
  );
  const [googleDisplayHeadlines, setGoogleDisplayHeadlines] = useState(
    "Discover New Arrivals\nSummer Sale Today",
  );
  const [googleDisplayDescriptions, setGoogleDisplayDescriptions] = useState(
    "Explore quality products for every day.\nShop the latest collection with convenient delivery.",
  );
  const [googleDisplayImageUrl, setGoogleDisplayImageUrl] = useState(
    "https://example.com/image.jpg",
  );
  const [googleDisplaySquareImageUrl, setGoogleDisplaySquareImageUrl] =
    useState("https://example.com/square-image.jpg");
  const [googleDisplayLongHeadline, setGoogleDisplayLongHeadline] = useState(
    "Discover great products in our summer collection",
  );
  const [googleDisplayBusinessName, setGoogleDisplayBusinessName] =
    useState("Acme Demo Store");
  const [googleDemandGenFormat, setGoogleDemandGenFormat] = useState<
    "MULTI_ASSET" | "VIDEO_RESPONSIVE" | "CAROUSEL" | "PRODUCT_FEED"
  >("MULTI_ASSET");
  const [googleDemandGenProductHeadline, setGoogleDemandGenProductHeadline] =
    useState("Shop the Summer Collection");
  const [
    googleDemandGenProductDescription,
    setGoogleDemandGenProductDescription,
  ] = useState("Discover seasonal favourites and new arrivals online.");
  const [googleDemandGenProductLogoUrl, setGoogleDemandGenProductLogoUrl] =
    useState("https://example.com/logo.png");
  const [googleDemandGenProductGroupMode, setGoogleDemandGenProductGroupMode] =
    useState<"ALL_PRODUCTS" | "SELECTED_PRODUCTS">("ALL_PRODUCTS");
  const [googleDemandGenLogoUrl, setGoogleDemandGenLogoUrl] = useState(
    "https://example.com/logo.png",
  );
  const [googleDemandGenVideoIds, setGoogleDemandGenVideoIds] = useState(
    "DEMO_YOUTUBE_VIDEO_ID",
  );
  const [googleDemandGenCarouselCards, setGoogleDemandGenCarouselCards] =
    useState(
      "New Arrivals | https://example.com/dg-card-1.jpg | https://example.com/new-arrivals\nSummer Offers | https://example.com/dg-card-2.jpg | https://example.com/offers",
    );

  // Prototype workspace modules. These remain local mock data until backend APIs exist.
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("builder");
  const [campaignRecords, setCampaignRecords] = useState<
    ManagedCampaignRecord[]
  >([]);
  const [campaignRecordsLoaded, setCampaignRecordsLoaded] = useState(false);
  const [campaignListLoading, setCampaignListLoading] = useState(false);
  const [campaignListError, setCampaignListError] = useState("");
  const [campaignListRefresh, setCampaignListRefresh] = useState(0);
  const [googleLocationQuery, setGoogleLocationQuery] = useState("");
  const [googleLocationOptions, setGoogleLocationOptions] = useState<
    GoogleAdsLookupOption[]
  >([]);
  const [googleLocationLoading, setGoogleLocationLoading] = useState(false);
  const [googleLocationError, setGoogleLocationError] = useState("");

  const [googleLanguageOptions, setGoogleLanguageOptions] = useState<
    GoogleAdsLookupOption[]
  >([]);
  const [googleLanguageSearch, setGoogleLanguageSearch] = useState("");
  const [googleLanguageLoading, setGoogleLanguageLoading] = useState(false);
  const [googleLanguageError, setGoogleLanguageError] = useState("");

  const [googleUserListOptions, setGoogleUserListOptions] = useState<
    GoogleAdsLookupOption[]
  >([]);
  const [googleUserListSearch, setGoogleUserListSearch] = useState("");
  const [googleUserListLoading, setGoogleUserListLoading] = useState(false);
  const [googleUserListError, setGoogleUserListError] = useState("");

  const [googleConversionGoalOptions, setGoogleConversionGoalOptions] =
    useState<GoogleAdsLookupOption[]>([]);
  const [googleConversionGoalLoading, setGoogleConversionGoalLoading] =
    useState(false);
  const [googleConversionGoalError, setGoogleConversionGoalError] =
    useState("");
  const [googleAudienceOptions, setGoogleAudienceOptions] = useState<GoogleAdsLookupOption[]>([]);
  const [googleAudienceLoading, setGoogleAudienceLoading] = useState(false);
  const [googleAudienceError, setGoogleAudienceError] = useState("");
  const [googleConversionActionOptions, setGoogleConversionActionOptions] = useState<GoogleAdsLookupOption[]>([]);
  const [googleConversionActionLoading, setGoogleConversionActionLoading] = useState(false);
  const [googleConversionActionError, setGoogleConversionActionError] = useState("");
  const [googlePortfolioStrategyOptions, setGooglePortfolioStrategyOptions] = useState<GoogleAdsLookupOption[]>([]);
  const [googlePortfolioStrategyLoading, setGooglePortfolioStrategyLoading] = useState(false);
  const [googlePortfolioStrategyError, setGooglePortfolioStrategyError] = useState("");

  // Meta audience and location resource discovery is scoped to the selected
  // Meta account wherever the provider API exposes account-owned resources.
  const [metaCustomAudienceOptions, setMetaCustomAudienceOptions] = useState<MetaCampaignLookupOption[]>([]);
  const [metaSavedAudienceOptions, setMetaSavedAudienceOptions] = useState<MetaCampaignLookupOption[]>([]);
  const [metaSelectedSavedAudience, setMetaSelectedSavedAudience] = useState<MetaCampaignLookupOption | null>(null);
  const [metaAudienceLoading, setMetaAudienceLoading] = useState(false);
  const [metaAudienceError, setMetaAudienceError] = useState("");
  const [metaSelectedInterestOptions, setMetaSelectedInterestOptions] = useState<MetaCampaignLookupOption[]>([]);
  const [metaTargetingQuery, setMetaTargetingQuery] = useState("");
  const [metaTargetingOptions, setMetaTargetingOptions] = useState<MetaCampaignLookupOption[]>([]);
  const [metaTargetingLoading, setMetaTargetingLoading] = useState(false);
  const [metaTargetingError, setMetaTargetingError] = useState("");
  const [metaLocationKind, setMetaLocationKind] = useState<"country" | "region" | "city" | "zip">("country");
  const [metaLocationQuery, setMetaLocationQuery] = useState("");
  const [metaLocationOptions, setMetaLocationOptions] = useState<MetaCampaignLookupOption[]>([]);
  const [metaLocationLoading, setMetaLocationLoading] = useState(false);
  const [metaLocationError, setMetaLocationError] = useState("");
  const [metaSelectedLocationOptions, setMetaSelectedLocationOptions] = useState<MetaCampaignLookupOption[]>([]);

  useEffect(() => {
    if (!isLoaded) return;

    let cancelled = false;

    const loadMetaPixels = async () => {
      setMetaPixelOptions([]);
      setMetaPixelId("");
      setMetaPixelEvents([]);
      setMetaConversionEvent("PURCHASE");
      setMetaPixelsError("");
      setMetaPixelEventsError("");

      if (
        !isSignedIn ||
        !connections.metaAds.connected ||
        !connections.metaAds.selectedAccountId
      ) {
        setMetaPixelsLoading(false);
        return;
      }

      try {
        setMetaPixelsLoading(true);

        const payload = await requestMetaPixels(getToken);

        if (cancelled) return;

        const pixels = Array.isArray(payload.pixels)
          ? payload.pixels
          : [];

        setMetaPixelOptions(pixels);
      } catch (err) {
        if (!cancelled) {
          setMetaPixelsError(
            err instanceof Error
              ? err.message
              : "Unable to load Meta Pixels/Datasets.",
          );
        }
      } finally {
        if (!cancelled) {
          setMetaPixelsLoading(false);
        }
      }
    };

    void loadMetaPixels();

    return () => {
      cancelled = true;
    };
  }, [
    getToken,
    isLoaded,
    isSignedIn,
    connections.metaAds.connected,
    connections.metaAds.selectedAccountId,
  ]);
  useEffect(() => {
    if (!metaPixelId || !isSignedIn) {
      setMetaPixelEvents([]);
      setMetaPixelEventsError("");
      setMetaPixelEventsLoading(false);
      return;
    }

    let cancelled = false;

    const loadEvents = async () => {
      try {
        setMetaPixelEvents([]);
        setMetaPixelEventsError("");
        setMetaPixelEventsLoading(true);

        const payload = await requestMetaPixelEvents(
          getToken,
          metaPixelId,
        );

        if (cancelled) return;

        const events = Array.isArray(payload.eventOptions)
          ? payload.eventOptions
          : [];

        setMetaPixelEvents(events);

        // Preserve the existing event if it is still supported.
        const currentEventExists = events.some(
          (event) => event.customEventType === metaConversionEvent,
        );

        if (!currentEventExists && events.length > 0) {
          setMetaConversionEvent("PURCHASE");
        }
      } catch (err) {
        if (!cancelled) {
          setMetaPixelEventsError(
            err instanceof Error
              ? err.message
              : "Unable to load Pixel conversion events.",
          );
        }
      } finally {
        if (!cancelled) {
          setMetaPixelEventsLoading(false);
        }
      }
    };

    void loadEvents();

    return () => {
      cancelled = true;
    };
  }, [getToken, isSignedIn, metaPixelId]);

  useEffect(() => {
    let cancelled = false;

    // A Custom Conversion is tied to its source Pixel.
    // Clear the previous selection whenever the Pixel changes.
    setMetaCustomConversionId("");
    setMetaCustomConversionOptions([]);
    setMetaCustomConversionsError("");

    if (
      !isLoaded ||
      !isSignedIn ||
      !connections.metaAds.connected ||
      !connections.metaAds.selectedAccountId ||
      !metaPixelId.trim()
    ) {
      setMetaCustomConversionsLoading(false);
      return;
    }

    const loadCustomConversions = async () => {
      setMetaCustomConversionsLoading(true);

      try {
        const result = await requestMetaCustomConversions(
          getToken,
          metaPixelId.trim(),
        );

        if (cancelled) return;

        setMetaCustomConversionOptions(
          result.customConversions ?? [],
        );
      } catch (error) {
        if (cancelled) return;

        setMetaCustomConversionOptions([]);
        setMetaCustomConversionsError(
          error instanceof Error
            ? error.message
            : "Unable to load Meta Custom Conversions.",
        );
      } finally {
        if (!cancelled) {
          setMetaCustomConversionsLoading(false);
        }
      }
    };

    void loadCustomConversions();

    return () => {
      cancelled = true;
    };
  }, [
    metaPixelId,
    connections.metaAds.connected,
    connections.metaAds.selectedAccountId,
    isLoaded,
    isSignedIn,
    getToken,
  ]);
  // Only local drafts remain in browser storage. Live campaign rows always
  // come from the authenticated backend listing endpoint.
  useEffect(() => {
    const savedDrafts = readManagedCampaigns().filter(
      (record: any) => record.source === "LOCAL",
    );
    setCampaignRecords(savedDrafts as ManagedCampaignRecord[]);
    setCampaignRecordsLoaded(true);

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== CAMPAIGNS_STORAGE_KEY) return;
      const nextDrafts = readManagedCampaigns().filter(
        (record: any) => record.source === "LOCAL",
      );
      setCampaignRecords((current) => [
        ...current.filter((record: any) => record.source === "LIVE"),
        ...(nextDrafts as ManagedCampaignRecord[]),
      ]);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    setGoogleDisplayLandscapeAssetResourceName("");
    setGoogleDisplaySquareAssetResourceName("");

    setGoogleDisplayLandscapeFile(null);
    setGoogleDisplaySquareFile(null);

    setGoogleDisplayAssetUploadError("");
    clearPreview();
  }, [connections.googleAds.selectedAccountId]);

  useEffect(() => {
    if (!campaignRecordsLoaded) return;
    const localDrafts = campaignRecords.filter(
      (record: any) => record.source === "LOCAL",
    );
    writeManagedCampaigns(localDrafts);
  }, [campaignRecords, campaignRecordsLoaded]);

  const [campaignSearch, setCampaignSearch] = useState("");
  const [campaignPlatformFilter, setCampaignPlatformFilter] =
    useState<CampaignPlatformFilter>("ALL");
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<
    CampaignLifecycleStatus | "ALL"
  >("ALL");
  const [selectedCampaignId, setSelectedCampaignId] = useState("DEMO-CMP-001");
  const [campaignNotice, setCampaignNotice] = useState("");
  // Shared, authenticated Asset Library data; no seeded demo assets.
  const [assetLibrary, setAssetLibrary] = useState<CampaignLibraryAsset[]>([]);
  const [assetLibraryLoading, setAssetLibraryLoading] = useState(false);
  const [assetLibraryError, setAssetLibraryError] = useState("");
  const [assetLibraryPreviewUrls, setAssetLibraryPreviewUrls] = useState<Record<string, string>>({});
  const [assetLibraryPreviewFailures, setAssetLibraryPreviewFailures] = useState<Record<string, boolean>>({});
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false);
  const [assetNotice, setAssetNotice] = useState("");
  const [reviewingAssetIds, setReviewingAssetIds] = useState<string[]>([]);
  const [assetLibraryFilter, setAssetLibraryFilter] = useState<
    "ALL" | "IMAGE" | "VIDEO" | "LOGO" | "TEXT"
  >("ALL");
  const [assetLibrarySearch, setAssetLibrarySearch] = useState("");

  const [googleCreativeAspectRatio, setGoogleCreativeAspectRatio] =
    useState<CreativeAspectRatio>("1.91:1");
  const [aiCreativePrompt, setAiCreativePrompt] = useState(description);
  const [aiCreativeStyle, setAiCreativeStyle] = useState("Premium lifestyle");
  const [aiCreativeAspectRatio, setAiCreativeAspectRatio] =
    useState<CreativeAspectRatio>("1:1");
  const [aiCreativeTextOnly, setAiCreativeTextOnly] = useState(false);
  const [aiCreativeGeneratePmaxLogoConcepts, setAiCreativeGeneratePmaxLogoConcepts] = useState(false);
  const [aiCreativeVariationCount, setAiCreativeVariationCount] = useState<
    1 | 2 | 3
  >(2);
  const [aiCreativeGenerating, setAiCreativeGenerating] = useState(false);
  const [aiCreativeSaving, setAiCreativeSaving] = useState(false);
  const [aiCreativeError, setAiCreativeError] = useState("");
  const [aiCreativeNotice, setAiCreativeNotice] = useState("");
  const [aiCreativeMeta, setAiCreativeMeta] = useState<{
    model?: string;
    imageProvider?: string;
    generatedCount?: number;
    failedCount?: number;
    requestedAssetCount?: number;
    generatedAssetCount?: number;
    failedAssetCount?: number;
    generationId?: string;
  } | null>(null);
  const [creativeVariations, setCreativeVariations] = useState<
    CreativeVariation[]
  >([]);
  const [campaignGeneratedAssets, setCampaignGeneratedAssets] = useState<
    GeneratedCreativeAsset[]
  >([]);
  const [campaignAssetErrors, setCampaignAssetErrors] = useState<
    CreativeAssetGenerationError[]
  >([]);
  const [generatedCapabilityCopies, setGeneratedCapabilityCopies] = useState<
    NonNullable<GenerateCreativeResponse["generatedCapabilityCopies"]>
  >([]);
  const [creativeBrandIdentity, setCreativeBrandIdentity] = useState<
    GenerateCreativeResponse["brandIdentity"] | null
  >(null);
  const [selectedCreativeId, setSelectedCreativeId] = useState<string | null>(
    null,
  );
  const [attachedCreativeAssetIds, setAttachedCreativeAssetIds] = useState<
    string[]
  >([]);
  const [savingCampaignAssetIds, setSavingCampaignAssetIds] = useState<
    string[]
  >([]);
  // Keys are generated-asset IDs; values point to the permanent Asset Library ID.
  const [savedCampaignAssetIds, setSavedCampaignAssetIds] = useState<
    Record<string, string>
  >({});
  // Keys are permanent Asset Library IDs so campaign requests can retain the
  // exact campaign capability/requirement that each generated image fulfils.
  const [campaignAssetAssignments, setCampaignAssetAssignments] = useState<
    Record<string, CampaignCreativeTargetReference>
  >({});
  const [creativeStudioNotice, setCreativeStudioNotice] = useState("");
  const [managedStatuses, setManagedStatuses] = useState<
    Record<string, ManagedStatus>
  >({});
  const [duplicatedDrafts, setDuplicatedDrafts] = useState<string[]>([]);
  const [savedDraft, setSavedDraft] = useState<{
    name: string;
    savedAt: string;
    step: number;
  } | null>(null);

  const [preparedPayload, setPreparedPayload] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [demoJob, setDemoJob] = useState<DemoCreationJob | null>(null);
  const [executionMode, setExecutionMode] =
    useState<CampaignExecutionMode>("VALIDATE_ONLY");
  const [campaignSubmitting, setCampaignSubmitting] = useState(false);

  const [campaignApiResponse, setCampaignApiResponse] = useState<unknown>(null);

  const [campaignApiError, setCampaignApiError] = useState("");
  const [retryingMetaAction, setRetryingMetaAction] = useState<"ad-set" | "creative" | null>(null);
  const [metaRetryResult, setMetaRetryResult] = useState<{
    action: "ad-set" | "creative";
    message: string;
    resourceId?: string;
  } | null>(null);
  const [metaRetryNeedsAttention, setMetaRetryNeedsAttention] = useState(false);

  const [apiPayloadPreview, setApiPayloadPreview] = useState("");
  const [googleDisplayLandscapeFile, setGoogleDisplayLandscapeFile] =
    useState<File | null>(null);

  const [googleDisplaySquareFile, setGoogleDisplaySquareFile] =
    useState<File | null>(null);

  const [
    googleDisplayLandscapeAssetResourceName,
    setGoogleDisplayLandscapeAssetResourceName,
  ] = useState("");

  const [
    googleDisplaySquareAssetResourceName,
    setGoogleDisplaySquareAssetResourceName,
  ] = useState("");

  const [googleDisplayAssetUploading, setGoogleDisplayAssetUploading] =
    useState<"LANDSCAPE" | "SQUARE" | null>(null);

  const [googleDisplayAssetUploadError, setGoogleDisplayAssetUploadError] =
    useState("");
  // Campaign results are derived from the real POST /api/campaigns response.
  const liveApiResponse =
    campaignApiResponse && typeof campaignApiResponse === "object"
      ? (campaignApiResponse as LiveCampaignApiResponse)
      : null;
  const liveProviderEntries = (() => {
    const providerEntries = Object.entries(liveApiResponse?.providers ?? {});
    if (providerEntries.length > 0) return providerEntries;

    // Some route-level failures return { message, details } instead of a
    // providers map. Infer a provider only when the response identifies one,
    // or when this request selected exactly one provider.
    const responseEnvelope = asObject(campaignApiResponse);
    const responseDetails = asObject(responseEnvelope.details);
    const originalErrorDetails = asObject(responseDetails.originalErrorDetails);
    const graphError = asObject(
      responseDetails.error ??
      originalErrorDetails.error ??
      responseEnvelope.error,
    );
    const failedProviders = Array.isArray(liveApiResponse?.failedProviders)
      ? liveApiResponse.failedProviders
      : [];
    const explicitFailedProvider = String(
      responseEnvelope.failedProvider ?? responseEnvelope.provider ?? "",
    );
    const inferredProvider =
      failedProviders.length === 1
        ? failedProviders[0]
        : explicitFailedProvider === "googleAds" || explicitFailedProvider === "metaAds"
          ? explicitFailedProvider
          : selectedPlatforms.length === 1
            ? selectedPlatforms[0]
            : null;

    if (!inferredProvider || (!Object.keys(graphError).length && !campaignApiError)) {
      return [] as Array<[string, LiveProviderResult]>;
    }

    return [[
      inferredProvider,
      {
        success: false,
        failedStep: String(responseDetails.failedStep ?? responseEnvelope.failedStep ?? "campaign"),
        error: String(
          graphError.error_user_msg ??
          graphError.message ??
          responseEnvelope.message ??
          campaignApiError,
        ),
        providerStatusCode: Number(
          responseEnvelope.statusCode ?? responseDetails.statusCode,
        ) || undefined,
        providerErrorDetails: Object.keys(graphError).length
          ? { error: graphError }
          : undefined,
      },
    ],
    ] as Array<[string, LiveProviderResult]>;
  })();
  const handleGoogleLocationSearch = async () => {
    setGoogleLocationOptionsOpen(true);
    await searchGoogleLocations();
  };
  const hasLiveCreatedResources = liveProviderEntries.some(
    ([providerKey, providerResult]) => {
      const campaignProvider =
        liveApiResponse?.campaign?.providers?.[providerKey];
      const hasCreatedResources = Object.values(
        providerResult.createdResources ?? {},
      ).some((value) =>
        Array.isArray(value)
          ? value.length > 0
          : typeof value === "string" && value.trim().length > 0,
      );

      return (
        (providerResult.partialResources?.length ?? 0) > 0 ||
        hasCreatedResources ||
        Boolean(campaignProvider?.providerCampaignId)
      );
    },
  );
  const liveOverallStatus =
    liveApiResponse?.success === true
      ? "Success"
      : liveApiResponse?.partialSuccess || hasLiveCreatedResources
        ? "Partially created"
        : "Failed";

  const googleReady =
    connections.googleAds.connected &&
    Boolean(connections.googleAds.selectedAccountId);
  const metaReady =
    connections.metaAds.connected &&
    Boolean(connections.metaAds.selectedAccountId);
  const selectedMetaPage =
    metaPageOptions.find((page) => page.id === metaPageId) ?? null;
  const selectedMetaInstagram =
    selectedMetaPage?.instagram_business_account ?? null;
  const bothReady = googleReady && metaReady;

  const platformMode: PlatformMode | "none" = useMemo(() => {
    if (selectedPlatforms.length === 2) return "both";
    if (selectedPlatforms[0]) return selectedPlatforms[0];
    return "none";
  }, [selectedPlatforms]);

  const googleSupportsCampaignTotalBudget = [
    "SEARCH",
    "PERFORMANCE_MAX",
    "DEMAND_GEN",
    "SHOPPING",
  ].includes(googleCampaignType);
  const effectiveGoogleBudgetMode: GoogleBudgetMode =
    googleSupportsCampaignTotalBudget && googleBudgetMode === "CAMPAIGN_TOTAL"
      ? "CAMPAIGN_TOTAL"
      : "DAILY";
  const googlePortfolioStrategyEligible = ["SEARCH", "SHOPPING"].includes(
    googleCampaignType,
  );
  const effectiveGoogleBiddingScope: GoogleBiddingScope =
    googlePortfolioStrategyEligible && googleBiddingScope === "PORTFOLIO"
      ? "PORTFOLIO"
      : "STANDARD";

  const availableGooglePerformanceGoals =
    googleCampaignType === "APP"
      ? []
      : googleCampaignType === "PERFORMANCE_MAX"
        ? googlePerformanceGoalsByType.PERFORMANCE_MAX.filter((item) =>
          ["CONVERSIONS", "CONVERSION_VALUE"].includes(item.value),
        )
        : googlePerformanceGoalsByType[googleCampaignType] ||
        googlePerformanceGoalsByType.SEARCH;
  const effectiveGooglePerformanceGoal = availableGooglePerformanceGoals.some(
    (item) => item.value === googlePerformanceGoal,
  )
    ? googlePerformanceGoal
    : availableGooglePerformanceGoals[0]?.value || "CONVERSIONS";
  const selectedGooglePerformanceConfig =
    availableGooglePerformanceGoals.find(
      (item) => item.value === effectiveGooglePerformanceGoal,
    ) || null;
  const availableGoogleBiddingModes: GoogleBiddingMode[] =
    googleCampaignType === "SEARCH"
      ? ["AUTOMATED", "MANUAL_CPC"]
      : googleCampaignType === "DISPLAY"
        ? ["AUTOMATED", "MANUAL_CPC", "MANUAL_CPM"]
        : ["AUTOMATED"];
  const effectiveGoogleBiddingMode = availableGoogleBiddingModes.includes(
    googleBiddingMode,
  )
    ? googleBiddingMode
    : "AUTOMATED";
  const effectiveGoogleBiddingStrategy =
    effectiveGoogleBiddingMode === "MANUAL_CPC"
      ? "MANUAL_CPC"
      : effectiveGoogleBiddingMode === "MANUAL_CPM"
        ? "MANUAL_CPM"
        : selectedGooglePerformanceConfig?.biddingStrategy ||
        "MAXIMIZE_CONVERSIONS";
  const availableGoogleAppGoals =
    googleAppGoalOptionsBySubtype[googleAppSubtype];
  const effectiveGoogleAppGoal = availableGoogleAppGoals.some(
    (item) => item.value === googleAppGoalType,
  )
    ? googleAppGoalType
    : availableGoogleAppGoals[0].value;
  const selectedGoogleAppGoal = availableGoogleAppGoals.find(
    (item) => item.value === effectiveGoogleAppGoal,
  )!;

  const availableMetaOptimizationOptions = objective
    ? metaOptimizationOptions[objective]
    : [];
  const effectiveMetaOptimizationGoal = availableMetaOptimizationOptions.some(
    (item) => item.value === metaOptimizationGoal,
  )
    ? metaOptimizationGoal
    : availableMetaOptimizationOptions[0]?.value || "";
  const availableMetaBillingOptions =
    metaBillingOptionsByGoal[effectiveMetaOptimizationGoal] ||
    metaBillingOptionsByGoal.DEFAULT;
  const effectiveMetaBillingEvent = availableMetaBillingOptions.some(
    (item) => item.value === metaBillingEvent,
  )
    ? metaBillingEvent
    : availableMetaBillingOptions[0]?.value || "IMPRESSIONS";

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setLoadingConnections(false);
      setConnectionError("Please sign in to continue.");
      return;
    }

    let cancelled = false;

    const loadConnections = async () => {
      try {
        setLoadingConnections(true);
        setConnectionError("");
        const token = await getToken();
        if (!token) throw new Error("Unable to get authentication token.");

        const response = await fetch(`${API_BASE_URL}/api/connections/me`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data: ConnectionResponse = await response.json();
        if (!response.ok) {
          throw new Error(
            data.message || "Failed to load advertising accounts.",
          );
        }
        if (cancelled) return;

        const google = normalizeConnection(data.providers?.googleAds);
        const meta = normalizeConnection(data.providers?.metaAds);
        setConnections({ googleAds: google, metaAds: meta });

        const available: ProviderName[] = [];
        if (google.connected && google.selectedAccountId)
          available.push("googleAds");
        if (meta.connected && meta.selectedAccountId) available.push("metaAds");
        setSelectedPlatforms(available);
      } catch (err) {
        if (!cancelled) {
          setConnectionError(
            err instanceof Error ? err.message : "Unable to load connections.",
          );
        }
      } finally {
        if (!cancelled) setLoadingConnections(false);
      }
    };

    void loadConnections();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isLoaded) return;

    let cancelled = false;

    const loadMetaPages = async () => {
      setMetaPageOptions([]);
      setMetaPageId("");
      setMetaInstagramActorId("");
      setMetaPagesNextCursor(null);
      setMetaPagesError("");

      if (
        !isSignedIn ||
        !connections.metaAds.connected ||
        !connections.metaAds.selectedAccountId
      ) {
        setMetaPagesLoading(false);
        return;
      }

      try {
        setMetaPagesLoading(true);
        const payload = await requestMetaPageLookup(getToken);
        if (cancelled) return;

        setMetaPageOptions(Array.isArray(payload.pages) ? payload.pages : []);
        setMetaPagesNextCursor(payload.pagination?.nextCursor ?? null);
      } catch (err) {
        if (!cancelled) {
          setMetaPagesError(
            err instanceof Error
              ? err.message
              : "Unable to load Facebook Pages.",
          );
        }
      } finally {
        if (!cancelled) setMetaPagesLoading(false);
      }
    };

    void loadMetaPages();
    return () => {
      cancelled = true;
    };
  }, [
    getToken,
    isLoaded,
    isSignedIn,
    connections.metaAds.connected,
    connections.metaAds.selectedAccountId,
  ]);

  const loadMoreMetaPages = async () => {
    if (!metaPagesNextCursor || metaPagesLoading) return;

    try {
      setMetaPagesLoading(true);
      setMetaPagesError("");
      const payload = await requestMetaPageLookup(getToken, metaPagesNextCursor);
      const incomingPages = Array.isArray(payload.pages) ? payload.pages : [];
      setMetaPageOptions((current) => {
        const existingIds = new Set(current.map((page) => page.id));
        return [
          ...current,
          ...incomingPages.filter((page) => !existingIds.has(page.id)),
        ];
      });
      setMetaPagesNextCursor(payload.pagination?.nextCursor ?? null);
    } catch (err) {
      setMetaPagesError(
        err instanceof Error ? err.message : "Unable to load more Facebook Pages.",
      );
    } finally {
      setMetaPagesLoading(false);
    }
  };

  const refreshMetaPages = async () => {
    if (metaPagesLoading) return;

    try {
      setMetaPagesLoading(true);
      setMetaPagesError("");
      const payload = await requestMetaPageLookup(getToken);
      const refreshedPages = Array.isArray(payload.pages) ? payload.pages : [];
      setMetaPageOptions(refreshedPages);
      setMetaPagesNextCursor(payload.pagination?.nextCursor ?? null);

      if (metaPageId && !refreshedPages.some((page) => page.id === metaPageId)) {
        setMetaPageId("");
        setMetaInstagramActorId("");
        clearPreview();
      } else if (metaPageId) {
        const refreshedSelection = refreshedPages.find(
          (page) => page.id === metaPageId,
        );
        const linkedInstagramId =
          refreshedSelection?.instagram_business_account?.id ?? "";
        if (metaInstagramActorId && metaInstagramActorId !== linkedInstagramId) {
          setMetaInstagramActorId(linkedInstagramId);
          clearPreview();
        }
      }
    } catch (err) {
      setMetaPagesError(
        err instanceof Error ? err.message : "Unable to refresh Facebook Pages.",
      );
    } finally {
      setMetaPagesLoading(false);
    }
  };

  // Load the current user's saved assets from the same API used by the Asset Library page.
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setAssetLibrary([]);
      return;
    }

    let cancelled = false;
    const loadAssets = async () => {
      try {
        setAssetLibraryLoading(true);
        setAssetLibraryError("");
        const token = await getToken();
        if (!token)
          throw new Error("Unable to retrieve your authentication token.");

        const response = await fetch(
          `${API_BASE_URL}/api/assets?page=1&pageSize=100`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
            cache: "no-store",
          },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.success === false) {
          throw new Error(
            payload?.message ||
            `Asset Library request failed (${response.status}).`,
          );
        }
        const rows = Array.isArray(payload?.assets)
          ? payload.assets
          : Array.isArray(payload?.data?.assets)
            ? payload.data.assets
            : [];
        const mapped: CampaignLibraryAsset[] = rows
          .filter((row: any) => row && typeof row.id === "string")
          .map((row: any) => ({
            id: row.id,
            name: String(row.name || "Untitled asset"),
            kind: row.kind as AssetKind,
            // Private AdSyntra storage is deliberately not exposed as a provider URL.
            url:
              typeof row.mediaUrl === "string"
                ? row.mediaUrl
                : typeof row.url === "string"
                  ? row.url
                  : "",
            addedAt: row.createdAt
              ? new Date(row.createdAt).toLocaleString()
              : "Saved asset",
            origin: row.origin,
            reviewStatus:
              row.reviewStatus === "APPROVED" ||
                row.reviewStatus === "REJECTED" ||
                row.reviewStatus === "DRAFT"
                ? row.reviewStatus
                : row.kind === "LOGO" && row.origin === "AI_STUDIO"
                  ? "DRAFT"
                  : "APPROVED",
            reviewedAt: row.reviewedAt ?? null,
            reviewedByUserId: row.reviewedByUserId ?? null,
            prompt: row.prompt ?? undefined,
            aspectRatio: row.aspectRatio ?? undefined,
            platformTargets: Array.isArray(row.platformTargets)
              ? row.platformTargets
              : [],
            googlePack: row.googlePack ?? undefined,
            textContent: row.textContent ?? null,
            contentUrl: row.contentUrl ?? null,
            originalFileName: row.originalFileName ?? null,
            mimeType: row.mimeType ?? null,
            sizeBytes: row.sizeBytes ?? null,
            width: row.width ?? null,
            height: row.height ?? null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            provider: row.provider ?? row.providerAsset?.provider ?? null,
            providerAccountId:
              row.providerAccountId ?? row.providerAsset?.accountId ?? null,
            providerAssetId:
              row.providerAssetId ?? row.providerAsset?.assetId ?? null,
          }));
        if (!cancelled) setAssetLibrary(mapped);
      } catch (loadError) {
        if (!cancelled)
          setAssetLibraryError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load the Asset Library.",
          );
      } finally {
        if (!cancelled) {
          setAssetLibraryLoading(false);
        }
      }
    };
    void loadAssets();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn]);

  // Private Asset Library media endpoints require the user's bearer token.
  // Fetch protected content into temporary object URLs so the dialog's <img>
  // elements can render it; public/external media URLs remain direct URLs.
  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];

    const loadPrivatePreviews = async () => {
      setAssetLibraryPreviewUrls({});
      setAssetLibraryPreviewFailures({});
      const previewAssets = assetLibrary.filter(
        (asset) => asset.kind === "IMAGE" || asset.kind === "LOGO",
      );
      if (!previewAssets.length || !isLoaded || !isSignedIn) return;

      try {
        const token = await getToken();
        if (!token) return;

        const entries = await Promise.all(
          previewAssets.map(async (asset): Promise<[string, string] | null> => {
            const privatePath = asset.contentUrl?.trim() ||
              (asset.url && !/^https?:\/\//i.test(asset.url) ? asset.url : "");

            if (!privatePath) {
              const directUrl = asset.url?.trim();
              return directUrl ? [asset.id, directUrl] : null;
            }

            const previewRequestUrl = /^https?:\/\//i.test(privatePath)
              ? privatePath
              : `${API_BASE_URL.replace(/\/$/, "")}${privatePath.startsWith("/") ? "" : "/"}${privatePath}`;

            try {
              const response = await fetch(previewRequestUrl, {
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
              });
              if (!response.ok) {
                const fallbackUrl = asset.url?.trim();
                return fallbackUrl && /^https?:\/\//i.test(fallbackUrl)
                  ? [asset.id, fallbackUrl]
                  : null;
              }

              const blob = await response.blob();
              if (!blob.size) return null;
              const objectUrl = URL.createObjectURL(blob);
              objectUrls.push(objectUrl);
              return [asset.id, objectUrl];
            } catch {
              const fallbackUrl = asset.url?.trim();
              return fallbackUrl && /^https?:\/\//i.test(fallbackUrl)
                ? [asset.id, fallbackUrl]
                : null;
            }
          }),
        );

        if (!cancelled) {
          const resolvedEntries = entries.filter(
            (entry): entry is [string, string] => Boolean(entry),
          );
          const resolvedIds = new Set(resolvedEntries.map(([assetId]) => assetId));
          setAssetLibraryPreviewUrls(Object.fromEntries(resolvedEntries));
          setAssetLibraryPreviewFailures(
            Object.fromEntries(
              previewAssets
                .filter((asset) => !resolvedIds.has(asset.id))
                .map((asset) => [asset.id, true]),
            ),
          );
        } else {
          objectUrls.forEach((url) => URL.revokeObjectURL(url));
        }
      } catch {
        // Preview failures are non-blocking; the asset remains selectable by ID.
      }
    };

    void loadPrivatePreviews();
    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [assetLibrary, getToken, isLoaded, isSignedIn]);

  // Load live campaigns from the backend after provider connections are known.
  useEffect(() => {
    if (
      !isLoaded ||
      !isSignedIn ||
      loadingConnections ||
      !campaignRecordsLoaded
    ) {
      return;
    }

    const hasGoogleAccount = Boolean(connections.googleAds.selectedAccountId);
    const hasMetaAccount = Boolean(connections.metaAds.selectedAccountId);

    if (!hasGoogleAccount && !hasMetaAccount) {
      setCampaignListLoading(false);
      setCampaignListError(
        "Connect and select a Google Ads or Meta Ads account to load campaigns.",
      );
      setCampaignRecords((current) =>
        current.filter((record: any) => record.source !== "LIVE"),
      );
      return;
    }

    let cancelled = false;
    const loadCampaignList = async () => {
      try {
        setCampaignListLoading(true);
        setCampaignListError("");
        const token = await getToken();
        if (!token)
          throw new Error(
            "Unable to retrieve your authentication token. Please sign in again.",
          );

        const response = await fetch(`${API_BASE_URL}/api/campaigns`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          cache: "no-store",
        });
        const responseData = await response.json().catch(() => null);
        if (!response.ok || responseData?.success === false) {
          const failedProviderDetails = (
            [
              ["Google Ads", "googleAds"],
              ["Meta Ads", "metaAds"],
            ] as const
          )
            .map(([label, key]) => {
              const providerResult = asObject(
                asObject(responseData?.providers)[key],
              );
              if (providerResult.success === true) return null;
              const detail =
                providerResult.message ??
                providerResult.error ??
                providerResult.errorMessage;
              return detail ? `${label}: ${String(detail)}` : null;
            })
            .filter(Boolean);
          throw new Error(
            [
              responseData?.message ||
              `Campaign listing failed with HTTP ${response.status}.`,
              ...failedProviderDetails,
            ].join(" "),
          );
        }

        const liveRecords = mapCampaignListResponse(responseData, connections);
        const providerResults = asObject(responseData?.providers);
        const providerErrors = (
          [
            ["Google Ads", "googleAds", hasGoogleAccount],
            ["Meta Ads", "metaAds", hasMetaAccount],
          ] as const
        )
          .filter(
            ([, key, selected]) =>
              selected && asObject(providerResults[key]).success !== true,
          )
          .map(([label, key]) => {
            const providerResult = asObject(providerResults[key]);
            return `${label}: ${String(providerResult.message ?? providerResult.error ?? "Unable to retrieve campaigns.")}`;
          });

        if (cancelled) return;
        setCampaignRecords((current) => [
          ...liveRecords,
          ...current.filter((record: any) => record.source !== "LIVE"),
        ]);
        if (liveRecords.length > 0) setSelectedCampaignId(liveRecords[0].id);
        setCampaignListError(providerErrors.join(" "));
      } catch (err) {
        if (!cancelled) {
          setCampaignListError(
            err instanceof Error ? err.message : "Unable to load campaigns.",
          );
          setCampaignRecords((current) =>
            current.filter((record: any) => record.source !== "LIVE"),
          );
        }
      } finally {
        if (!cancelled) setCampaignListLoading(false);
      }
    };

    void loadCampaignList();
    return () => {
      cancelled = true;
    };
  }, [
    getToken,
    isLoaded,
    isSignedIn,
    loadingConnections,
    campaignRecordsLoaded,
    campaignListRefresh,
    connections.googleAds.selectedAccountId,
    connections.metaAds.selectedAccountId,
  ]);

  const clearPreview = () => {
    setPreparedPayload("");
    setApiPayloadPreview("");
    setCopyNotice("");

    setCampaignApiResponse(null);
    setCampaignApiError("");
    setMetaRetryResult(null);
    setMetaRetryNeedsAttention(false);
  };

  useEffect(() => {
    const selectedAccountId = connections.googleAds.selectedAccountId;

    if (!isLoaded || !isSignedIn || !selectedAccountId) {
      setGoogleLanguageOptions([]);
      setGoogleUserListOptions([]);
      setGoogleConversionGoalOptions([]);
      setGoogleAudienceOptions([]);
      setGoogleConversionActionOptions([]);
      setGooglePortfolioStrategyOptions([]);
      setGoogleAdGroupUserLists("");
      setGoogleCustomConversionGoalResourceName("");
      setGooglePortfolioStrategyResourceName("");
      setGoogleAppEngagementAudienceResource("");
      setGoogleAppSelectiveConversionActions("");
      setGoogleDemandGenAudienceResources("");
      setPmaxAudienceResourceNames("");
      setGoogleLanguageLoading(false);
      setGoogleUserListLoading(false);
      setGoogleConversionGoalLoading(false);
      setGoogleAudienceLoading(false);
      setGoogleConversionActionLoading(false);
      setGooglePortfolioStrategyLoading(false);
      setGoogleLanguageError("");
      setGoogleUserListError("");
      setGoogleConversionGoalError("");
      setGoogleAudienceError("");
      setGoogleConversionActionError("");
      setGooglePortfolioStrategyError("");
      return;
    }

    const customerId = normalizeGoogleCustomerId(selectedAccountId);

    if (!/^\d+$/.test(customerId)) {
      const message = "Invalid selected Google Ads customer ID.";

      setGoogleLanguageOptions([]);
      setGoogleUserListOptions([]);
      setGoogleConversionGoalOptions([]);
      setGoogleAudienceOptions([]);
      setGoogleConversionActionOptions([]);
      setGooglePortfolioStrategyOptions([]);
      setGoogleAdGroupUserLists("");
      setGoogleCustomConversionGoalResourceName("");
      setGooglePortfolioStrategyResourceName("");
      setGoogleAppEngagementAudienceResource("");
      setGoogleAppSelectiveConversionActions("");
      setGoogleDemandGenAudienceResources("");
      setPmaxAudienceResourceNames("");
      setGoogleLanguageLoading(false);
      setGoogleUserListLoading(false);
      setGoogleConversionGoalLoading(false);
      setGoogleAudienceLoading(false);
      setGoogleConversionActionLoading(false);
      setGooglePortfolioStrategyLoading(false);
      setGoogleLanguageError(message);
      setGoogleUserListError(message);
      setGoogleConversionGoalError(message);
      setGoogleAudienceError(message);
      setGoogleConversionActionError(message);
      setGooglePortfolioStrategyError(message);
      return;
    }

    let cancelled = false;

    // Never carry account-specific selections into another Google account.
    setGoogleAdGroupUserLists("");
    setGoogleCustomConversionGoalResourceName("");
    setGooglePortfolioStrategyResourceName("");
    setGoogleAppEngagementAudienceResource("");
    setGoogleAppSelectiveConversionActions("");
    setGoogleDemandGenAudienceResources("");
    setPmaxAudienceResourceNames("");
    setGoogleAudienceLoading(true);
    setGoogleConversionActionLoading(true);
    setGooglePortfolioStrategyLoading(true);

    setGoogleLanguageLoading(true);
    setGoogleUserListLoading(true);
    setGoogleConversionGoalLoading(true);

    setGoogleLanguageError("");
    setGoogleUserListError("");
    setGoogleConversionGoalError("");
    setGoogleConversionGoalError("");
    setGoogleAudienceError("");
    setGoogleConversionActionError("");
    setGooglePortfolioStrategyError("");

    const loadGoogleLookups = async () => {
      try {
        const token = await getToken();

        if (!token) {
          throw new Error(
            "Unable to retrieve your Clerk authentication token.",
          );
        }

        const results = await Promise.allSettled([
          fetchGoogleLookupOptions(
            API_BASE_URL,
            token,
            customerId,
            "languages",
            ["languages"],
            "languageConstants",
          ),
          fetchGoogleLookupOptions(
            API_BASE_URL,
            token,
            customerId,
            "user-lists",
            ["userLists", "user_lists"],
          ),
          fetchGoogleLookupOptions(
            API_BASE_URL,
            token,
            customerId,
            "conversion-goals",
            ["goals", "conversionGoals", "customConversionGoals"],
          ),
          fetchGoogleLookupOptions(
            API_BASE_URL,
            token,
            customerId,
            "audiences",
            ["audiences"],
          ),
          fetchGoogleLookupOptions(
            API_BASE_URL,
            token,
            customerId,
            "conversion-actions",
            ["conversionActions", "conversion_actions"],
          ),
          fetchGoogleLookupOptions(
            API_BASE_URL,
            token,
            customerId,
            "portfolio-strategies",
            ["biddingStrategies", "portfolioStrategies", "strategies"],
          ),
        ]);

        if (cancelled) return;

        const [languages, userLists, goals, audiences, actions, strategies] = results;

        if (languages.status === "fulfilled") {
          setGoogleLanguageOptions(languages.value);
        } else {
          setGoogleLanguageOptions([]);
          setGoogleLanguageError(
            languages.reason instanceof Error
              ? languages.reason.message
              : "Unable to load Google Ads languages.",
          );
        }

        if (audiences.status === "fulfilled") {
          setGoogleAudienceOptions(audiences.value);
        } else {
          setGoogleAudienceOptions([]);
          setGoogleAudienceError(audiences.reason instanceof Error ? audiences.reason.message : "Unable to load Google Ads Audiences.");
        }
        if (actions.status === "fulfilled") {
          setGoogleConversionActionOptions(actions.value);
        } else {
          setGoogleConversionActionOptions([]);
          setGoogleConversionActionError(actions.reason instanceof Error ? actions.reason.message : "Unable to load Google Ads Conversion Actions.");
        }
        if (strategies.status === "fulfilled") {
          setGooglePortfolioStrategyOptions(strategies.value);
        } else {
          setGooglePortfolioStrategyOptions([]);
          setGooglePortfolioStrategyError(strategies.reason instanceof Error ? strategies.reason.message : "Unable to load Google Ads portfolio strategies.");
        }

        if (userLists.status === "fulfilled") {
          setGoogleUserListOptions(userLists.value);
        } else {
          setGoogleUserListOptions([]);
          setGoogleUserListError(
            userLists.reason instanceof Error
              ? userLists.reason.message
              : "Unable to load Google Ads user lists.",
          );
        }

        if (goals.status === "fulfilled") {
          setGoogleConversionGoalOptions(goals.value);
        } else {
          setGoogleConversionGoalOptions([]);
          setGoogleConversionGoalError(
            goals.reason instanceof Error
              ? goals.reason.message
              : "Unable to load Google Ads conversion goals.",
          );
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error
              ? err.message
              : "Unable to load Google Ads lookup data.";

          setGoogleLanguageError(message);
          setGoogleUserListError(message);
          setGoogleConversionGoalError(message);
          setGoogleAudienceError(message);
          setGoogleConversionActionError(message);
          setGooglePortfolioStrategyError(message);
        }
      } finally {
        if (!cancelled) {
          setGoogleLanguageLoading(false);
          setGoogleUserListLoading(false);
          setGoogleConversionGoalLoading(false);
          setGoogleAudienceLoading(false);
          setGoogleConversionActionLoading(false);
          setGooglePortfolioStrategyLoading(false);
        }
      }
    };

    void loadGoogleLookups();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, connections.googleAds.selectedAccountId]);

  useEffect(() => {
    const selectedAccountId = connections.metaAds.selectedAccountId;
    if (!isLoaded || !isSignedIn || !selectedAccountId) {
      setMetaCustomAudienceOptions([]);
      setMetaSavedAudienceOptions([]);
      setMetaSelectedSavedAudience(null);
      setMetaIncludedCustomAudienceIds("");
      setMetaExcludedCustomAudienceIds("");
      setMetaSelectedInterestOptions([]);
      setMetaAudienceLoading(false);
      setMetaAudienceError("");
      return;
    }

    let cancelled = false;
    setMetaCustomAudienceOptions([]);
    setMetaSavedAudienceOptions([]);
    setMetaSelectedSavedAudience(null);
    setMetaIncludedCustomAudienceIds("");
    setMetaExcludedCustomAudienceIds("");
    setMetaSelectedInterestOptions([]);
    setMetaAudienceLoading(true);
    setMetaAudienceError("");

    const loadMetaAudiences = async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Unable to retrieve your Clerk authentication token.");
        const results = await Promise.allSettled([
          fetchMetaCampaignLookupOptions(API_BASE_URL, token, "meta/audiences/custom", { limit: "100" }),
          fetchMetaCampaignLookupOptions(API_BASE_URL, token, "meta/audiences/saved", { limit: "100" }),
        ]);
        if (cancelled) return;
        const [custom, saved] = results;
        if (custom.status === "fulfilled") setMetaCustomAudienceOptions(custom.value);
        else setMetaAudienceError(custom.reason instanceof Error ? custom.reason.message : "Unable to load Meta Custom Audiences.");
        if (saved.status === "fulfilled") setMetaSavedAudienceOptions(saved.value);
        else setMetaAudienceError((current) => current || (saved.reason instanceof Error ? saved.reason.message : "Unable to load Meta Saved Audiences."));
      } catch (lookupError) {
        if (!cancelled) setMetaAudienceError(lookupError instanceof Error ? lookupError.message : "Unable to load Meta audience resources.");
      } finally {
        if (!cancelled) setMetaAudienceLoading(false);
      }
    };
    void loadMetaAudiences();
    return () => { cancelled = true; };
  }, [getToken, isLoaded, isSignedIn, connections.metaAds.selectedAccountId]);

  const searchMetaDetailedTargetingOptions = async () => {
    const query = metaTargetingQuery.trim();
    if (query.length < 2) {
      setMetaTargetingError("Enter at least two characters to search Meta interests.");
      return;
    }
    try {
      setMetaTargetingLoading(true);
      setMetaTargetingError("");
      const token = await getToken();
      if (!token) throw new Error("Unable to retrieve your Clerk authentication token.");
      const options = await fetchMetaCampaignLookupOptions(
        API_BASE_URL,
        token,
        "meta/targeting/detailed",
        { kind: "interest", query, limit: "25" },
      );
      setMetaTargetingOptions(options);
      if (!options.length) setMetaTargetingError("No matching Meta interests were found.");
    } catch (lookupError) {
      setMetaTargetingOptions([]);
      setMetaTargetingError(lookupError instanceof Error ? lookupError.message : "Unable to search Meta interests.");
    } finally {
      setMetaTargetingLoading(false);
    }
  };

  const searchMetaLocationOptions = async () => {
    const query = metaLocationQuery.trim();
    if (query.length < 2) {
      setMetaLocationError("Enter at least two characters to search Meta locations.");
      return;
    }
    try {
      setMetaLocationLoading(true);
      setMetaLocationError("");
      const token = await getToken();
      if (!token) throw new Error("Unable to retrieve your Clerk authentication token.");
      const options = await fetchMetaCampaignLookupOptions(
        API_BASE_URL,
        token,
        "meta/targeting/locations",
        { query, type: metaLocationKind, limit: "25" },
      );
      setMetaLocationOptions(options);
      setMetaSelectedLocationOptions([]);
      if (!options.length) setMetaLocationError("No matching Meta locations were found.");
    } catch (lookupError) {
      setMetaLocationOptions([]);
      setMetaLocationError(lookupError instanceof Error ? lookupError.message : "Unable to search Meta locations.");
    } finally {
      setMetaLocationLoading(false);
    }
  };

  const addSelectedMetaLocations = () => {
    const values = metaSelectedLocationOptions
      .map((option) => {
        if (metaLocationKind === "country") return String(option.country_code ?? option.countryCode ?? option.key ?? "").trim().toUpperCase();
        return String(option.key ?? option.id ?? "").trim();
      })
      .filter(Boolean);
    if (!values.length) return;
    if (metaLocationKind === "country") setMetaCountries((current) => appendUniqueValues(current, values, ", "));
    if (metaLocationKind === "region") setMetaRegionKeys((current) => appendUniqueValues(current, values));
    if (metaLocationKind === "city") setMetaCityKeys((current) => appendUniqueValues(current, values));
    if (metaLocationKind === "zip") setMetaZipKeys((current) => appendUniqueValues(current, values));
    setMetaSelectedLocationOptions([]);
    clearPreview();
  };

  const applyMetaSavedAudience = (option: MetaCampaignLookupOption | null) => {
    if (!option) return;
    const rawTargeting = option.targeting ?? option.targeting_spec;
    let parsedTargeting: unknown = rawTargeting;
    if (typeof rawTargeting === "string") {
      try { parsedTargeting = JSON.parse(rawTargeting); } catch { parsedTargeting = {}; }
    }
    const targeting = asObject(parsedTargeting);
    const geo = asObject(targeting.geo_locations);
    const countries = Array.isArray(geo.countries) ? geo.countries.map(String) : [];
    const regions = Array.isArray(geo.regions) ? geo.regions.map((item: any) => String(item?.key ?? "")).filter(Boolean) : [];
    const cities = Array.isArray(geo.cities) ? geo.cities.map((item: any) => String(item?.key ?? "")).filter(Boolean) : [];
    const zips = Array.isArray(geo.zips) ? geo.zips.map((item: any) => String(item?.key ?? "")).filter(Boolean) : [];
    if (countries.length) setMetaCountries(countries.join(", "));
    if (regions.length) setMetaRegionKeys(regions.join("\n"));
    if (cities.length) setMetaCityKeys(cities.join("\n"));
    if (zips.length) setMetaZipKeys(zips.join("\n"));
    if (Number.isFinite(Number(targeting.age_min))) setMetaAgeMin(String(targeting.age_min));
    if (Number.isFinite(Number(targeting.age_max))) setMetaAgeMax(String(targeting.age_max));
    if (Array.isArray(targeting.genders) && targeting.genders.length === 1) {
      setMetaGender(Number(targeting.genders[0]) === 1 ? "MEN" : "WOMEN");
    } else {
      setMetaGender("ALL");
    }
    const flexible = Array.isArray(targeting.flexible_spec) ? targeting.flexible_spec : [];
    const interestIds = flexible.flatMap((item: any) => Array.isArray(item?.interests) ? item.interests.map((entry: any) => String(entry?.id ?? "")).filter(Boolean) : []);
    if (interestIds.length) {
      setMetaAudienceInterestIds(interestIds.join("\n"));
      const savedOptions = interestIds.map((id: string) => ({ id, name: `Saved interest ${id}` }));
      setMetaSelectedInterestOptions(savedOptions);
      setMetaTargetingOptions((current) => {
        const byId = new Map(current.map((item) => [getMetaLookupId(item), item]));
        savedOptions.forEach((item) => { if (!byId.has(getMetaLookupId(item))) byId.set(getMetaLookupId(item), item); });
        return [...byId.values()];
      });
    }
    clearPreview();
  };

  const searchGoogleLocations = async () => {
    const query = googleLocationQuery.trim();

    if (query.length < 2) {
      setGoogleLocationError(
        "Enter at least two characters to search locations.",
      );
      return;
    }

    const customerId = normalizeGoogleCustomerId(
      connections.googleAds.selectedAccountId || "",
    );

    if (!/^\d+$/.test(customerId)) {
      setGoogleLocationError("Select a valid Google Ads account first.");
      return;
    }

    try {
      setGoogleLocationLoading(true);
      setGoogleLocationError("");

      const token = await getToken();

      if (!token) {
        throw new Error("Unable to retrieve your Clerk authentication token.");
      }

      const locations = await fetchGoogleLookupOptions(
        API_BASE_URL,
        token,
        customerId,
        "locations",
        ["locations"],
        "geoTargetConstants",
        {
          q: query,
          locale: "en",
        },
      );

      setGoogleLocationOptions(locations);

      if (!locations.length) {
        setGoogleLocationError("No matching Google Ads locations were found.");
      }
    } catch (err) {
      setGoogleLocationOptions([]);
      setGoogleLocationError(
        err instanceof Error
          ? err.message
          : "Unable to search Google Ads locations.",
      );
    } finally {
      setGoogleLocationLoading(false);
    }
  };
  const choosePlatformMode = (mode: PlatformMode) => {
    setError("");
    clearPreview();
    if (mode === "both") {
      setSelectedPlatforms([
        ...(googleReady ? (["googleAds"] as const) : []),
        ...(metaReady ? (["metaAds"] as const) : []),
      ]);
      return;
    }
    setSelectedPlatforms(
      mode === "googleAds"
        ? googleReady
          ? ["googleAds"]
          : []
        : metaReady
          ? ["metaAds"]
          : [],
    );
  };

  const uploadGoogleDisplayImage = async (
    role: "LANDSCAPE" | "SQUARE",
    file: File | null,
  ) => {
    if (!file) {
      setGoogleDisplayAssetUploadError(
        `Select a ${role.toLowerCase()} image first.`,
      );
      return;
    }

    const accountId = connections.googleAds.selectedAccountId;

    if (!accountId) {
      setGoogleDisplayAssetUploadError("Select a Google Ads account first.");
      return;
    }

    try {
      setGoogleDisplayAssetUploading(role);
      setGoogleDisplayAssetUploadError("");

      const token = await getToken();

      if (!token) {
        throw new Error("Please sign in again.");
      }

      const formData = new FormData();

      formData.append("image", file);
      formData.append("accountId", accountId);
      formData.append("role", role);
      formData.append("name", file.name.replace(/\.[^/.]+$/, ""));
      formData.append("confirm", "true");

      const response = await fetch(
        `${API_BASE_URL}/api/campaigns/google/display/assets/upload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
          cache: "no-store",
        },
      );

      const responseData: any = await response.json().catch(() => null);

      if (!response.ok || responseData?.success !== true) {
        throw new Error(
          responseData?.message || "Google Ads image upload failed.",
        );
      }

      const resourceName = responseData?.asset?.resourceName;

      if (typeof resourceName !== "string" || !resourceName.trim()) {
        throw new Error(
          "Google Ads did not return an image asset resource name.",
        );
      }

      if (role === "LANDSCAPE") {
        setGoogleDisplayLandscapeAssetResourceName(resourceName);
      } else {
        setGoogleDisplaySquareAssetResourceName(resourceName);
      }

      setAssetNotice(
        `${role === "LANDSCAPE" ? "Landscape" : "Square"} image uploaded to Google Ads successfully.`,
      );

      clearPreview();
    } catch (error) {
      setGoogleDisplayAssetUploadError(
        error instanceof Error
          ? error.message
          : "Unable to upload Google Display image.",
      );
    } finally {
      setGoogleDisplayAssetUploading(null);
    }
  };
  const validateBasics = () => {
    if (!selectedPlatforms.length) {
      setError("Select Google Ads, Meta Ads, or both connected platforms.");
      return false;
    }
    if (
      selectedPlatforms.some(
        (provider) => !connections[provider].selectedAccountId,
      )
    ) {
      setError(
        "Select an active advertising account for every chosen platform.",
      );
      return false;
    }
    if (!campaignName.trim()) {
      setError("Enter a campaign name.");
      return false;
    }
    if (!businessName.trim()) {
      setError("Enter your business name.");
      return false;
    }
    if (!objective) {
      setError("Select a campaign objective.");
      return false;
    }
    if (websiteUrl.trim()) {
      try {
        const parsed = new URL(websiteUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch {
        setError("Enter a valid website URL, including https://.");
        return false;
      }
    }
    setError("");
    return true;
  };
  console.log("googleLanguageResources", googleLanguageResources);

  const geoResources = googleGeoTargetResources
    .split(/[\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean);

  // googleLanguageResources is already an array
  const languageResources = googleLanguageResources;
  const validateMetaPageIdentityStep = (): boolean => {
    if (!selectedPlatforms.includes("metaAds")) {
      return true;
    }

    const pageId = metaPageId.trim();

    // Check that the user selected a real Facebook Page.
    if (
      !isRealMetaId(pageId) ||
      !selectedPage ||
      selectedPage.id !== pageId
    ) {
      setError(
        "Select a Facebook Page returned by your connected Meta account.",
      );
      return false;
    }

    // Check that the selected Page has advertising permission.
    if (
      selectedPage.tasks?.length &&
      !selectedPage.tasks.includes("ADVERTISE")
    ) {
      setError(
        "The selected Facebook Page does not include the ADVERTISE task. Choose a Page with advertising access.",
      );
      return false;
    }

    setError("");
    return true;
  };
  const validatePlatformSettings = () => {
    if (
      selectedPlatforms.includes("googleAds") &&
      effectiveGoogleBudgetMode === "DAILY" &&
      !isPositiveAmount(googleDailyBudget)
    ) {
      setError("Enter a Google Ads average daily budget greater than zero.");
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
    ) {
      if (!isPositiveAmount(googleCampaignTotalBudget)) {
        setError("Enter a Google Ads campaign total budget greater than zero.");
        return false;
      }
      if (
        !googleStartDate ||
        !googleEndDate ||
        googleEndDate <= googleStartDate
      ) {
        setError(
          "Google campaign total budgets require a start date and an end date later than the start date.",
        );
        return false;
      }
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      googleBiddingScope === "PORTFOLIO" &&
      googlePortfolioStrategyEligible
    ) {
      if (effectiveGoogleBiddingMode !== "AUTOMATED") {
        setError(
          "Portfolio bidding is available only for automated Search and Shopping campaigns. Use standard bidding for this campaign type.",
        );
        return false;
      }
      if (
        !/^customers\/\d+\/biddingStrategies\/\d+$/.test(
          googlePortfolioStrategyResourceName.trim(),
        )
      ) {
        setError(
          "Enter an existing Google portfolio bidding strategy resource name, such as customers/123456/biddingStrategies/789.",
        );
        return false;
      }
    }
    if (selectedPlatforms.includes("googleAds") && !googleEuPoliticalStatus) {
      setError(
        "Declare whether the Google campaign contains EU political advertising.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      googleCustomConversionGoalResourceName.trim() &&
      !/^customers\/\d+\/customConversionGoals\/\d+$/.test(
        googleCustomConversionGoalResourceName.trim(),
      )
    ) {
      setError(
        "Enter a valid Google Custom Conversion Goal resource name, such as customers/123456/customConversionGoals/789.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      googleStartDate &&
      googleEndDate &&
      googleEndDate <= googleStartDate
    ) {
      setError("Google campaign end date must be later than its start date.");
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      (geoResources.some((v) => !/^geoTargetConstants\/\d+$/.test(v)) ||
        languageResources.some((v) => !/^languageConstants\/\d+$/.test(v)))
    ) {
      setError(
        "Use Google resource names: geoTargetConstants/ID and languageConstants/ID.",
      );
      return false;
    }
    const adGroupUserLists = googleAdGroupUserLists
      .split(/[\n,]+/)
      .map((v) => v.trim())
      .filter(Boolean);
    const pmaxAudienceNames = pmaxAudienceResourceNames
      .split(/[\n,]+/)
      .map((v) => v.trim())
      .filter(Boolean);
    const demandGenAudienceNames = googleDemandGenAudienceResources
      .split(/[\n,]+/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (
      selectedPlatforms.includes("googleAds") &&
      adGroupUserLists.some(
        (v) =>
          !/^customers\/\d+\/userLists\/\d+$/.test(v) &&
          !/^userLists\/\d+$/.test(v),
      )
    ) {
      setError(
        "Google remarketing lists must use user-list resource names such as customers/123/userLists/456.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      [...pmaxAudienceNames, ...demandGenAudienceNames].some(
        (v) => !/^customers\/\d+\/audiences\/\d+$/.test(v),
      )
    ) {
      setError(
        "Performance Max and Demand Gen audience signals must use Audience resource names such as customers/123/audiences/456.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      googleMarketingObjective === "LOCAL_STORES_VISITS" &&
      googleCampaignType !== "PERFORMANCE_MAX"
    ) {
      setError(
        "Google local store visit goals should use Performance Max in this builder. Select Performance Max and ensure eligible store/location assets and conversion goals are configured.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      googleCampaignType === "SHOPPING"
    ) {
      if (!/^\d+$/.test(googleMerchantCenterId.trim())) {
        setError(
          "Enter the numeric Merchant Center account ID linked to Google Ads.",
        );
        return false;
      }
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      googleCampaignType === "DEMAND_GEN" &&
      !Object.values(demandGenChannels).some(Boolean)
    ) {
      setError("Select at least one Demand Gen channel.");
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      googleCampaignType === "HOTEL"
    ) {
      if (!/^\d+$/.test(googleHotelCenterId.trim())) {
        setError(
          "Enter the numeric Hotel Center account ID linked to this Google Ads account.",
        );
        return false;
      }
      if (!isPositiveAmount(googleHotelBidCeiling)) {
        setError("Enter a positive Hotel CPC bid ceiling.");
        return false;
      }
      if (!googleHotelAdGroupName.trim()) {
        setError("Enter a Hotel Ad Group name.");
        return false;
      }
      if (!googleHotelTargetCountry.trim() || !googleHotelLanguage.trim()) {
        setError(
          "Choose a target country and language for the Hotel campaign.",
        );
        return false;
      }
      if (
        googleHotelListingMode === "SELECTED_HOTELS" &&
        !googleHotelPropertyIds
          .split(/[\n,]+/)
          .map((v) => v.trim())
          .filter(Boolean).length
      ) {
        setError(
          "Enter at least one Hotel Center property ID, or choose All hotels.",
        );
        return false;
      }
    } else if (
      selectedPlatforms.includes("googleAds") &&
      googleCampaignType === "APP"
    ) {
      if (!googleAppId.trim()) {
        setError("Enter the Google Play package name or App Store app ID.");
        return false;
      }
      if (
        googleAppSubtype === "APP_CAMPAIGN_FOR_PRE_REGISTRATION" &&
        googleAppStore !== "GOOGLE_APP_STORE"
      ) {
        setError(
          "App pre-registration is available for Google Play apps; select Google Play Store.",
        );
        return false;
      }
      if (googleAppSubtype === "APP_CAMPAIGN_FOR_ENGAGEMENT") {
        if (
          !/^customers\/\d+\/audiences\/\d+$/.test(
            googleAppEngagementAudienceResource.trim(),
          )
        ) {
          setError(
            "App engagement requires an existing Google Audience resource name, such as customers/123456/audiences/789. Include the app-user list segment in that Audience.",
          );
          return false;
        }
        const actionNames = googleAppSelectiveConversionActions
          .split(/[\n,]+/)
          .map((v) => v.trim())
          .filter(Boolean);
        if (
          !actionNames.length ||
          actionNames.some(
            (v) => !/^customers\/\d+\/conversionActions\/\d+$/.test(v),
          )
        ) {
          setError(
            "Add at least one eligible conversion action resource, such as customers/123456/conversionActions/789.",
          );
          return false;
        }
      }
      if (
        selectedGoogleAppGoal?.targetKind === "CPA" &&
        !isPositiveAmount(googleAppTargetCost)
      ) {
        setError(
          "Enter the target CPA / CPI required by the selected App campaign goal.",
        );
        return false;
      }
      if (
        selectedGoogleAppGoal?.targetKind === "ROAS" &&
        !isPositiveAmount(googleAppTargetRoas)
      ) {
        setError("Enter a positive target ROAS (for example, 3.0 for 300%).");
        return false;
      }
    } else if (
      selectedPlatforms.includes("googleAds") &&
      !selectedGooglePerformanceConfig
    ) {
      setError(
        "Choose a performance goal supported by the selected Google campaign type.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      googleCampaignType === "SEARCH" &&
      effectiveGooglePerformanceGoal === "IMPRESSION_SHARE" &&
      effectiveGoogleBiddingMode === "AUTOMATED"
    ) {
      const share = Number(googleImpressionSharePercent);
      if (
        !Number.isFinite(share) ||
        share < 1 ||
        share > 100 ||
        !isPositiveAmount(googleImpressionShareMaxCpc)
      ) {
        setError(
          "For Target Impression Share, enter a target between 1 and 100 and a positive maximum CPC bid ceiling.",
        );
        return false;
      }
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      ["SEARCH", "PERFORMANCE_MAX"].includes(googleCampaignType) &&
      effectiveGooglePerformanceGoal === "CONVERSIONS" &&
      effectiveGoogleBiddingMode === "AUTOMATED" &&
      googleTargetCpa &&
      !isPositiveAmount(googleTargetCpa)
    ) {
      setError("Target CPA must be a positive amount.");
      return false;
    }

    // Display image requirements are checked in validateAdCreation(), after
    // the user has reached the creative step and can select AI-generated or
    // existing Asset Library images. Do not block navigation through provider
    // settings before those creative assets can be attached.
    if (
      selectedPlatforms.includes("googleAds") &&
      googleCampaignType !== "APP" &&
      googleCampaignType !== "HOTEL" &&
      effectiveGooglePerformanceGoal === "CONVERSION_VALUE" &&
      googleTargetRoas &&
      !isPositiveAmount(googleTargetRoas)
    ) {
      setError(
        "Target ROAS must be greater than zero (for example, 3.0 for 300%).",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      metaBudgetMode === "DAILY" &&
      !isPositiveAmount(metaDailyBudget)
    ) {
      setError("Enter a Meta daily budget greater than zero.");
      return false;
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      metaBudgetMode === "LIFETIME"
    ) {
      if (!isPositiveAmount(metaLifetimeBudget)) {
        setError("Enter a Meta lifetime budget greater than zero.");
        return false;
      }
      if (
        !metaStartTime ||
        !metaEndTime ||
        new Date(metaEndTime) <= new Date(metaStartTime)
      ) {
        setError(
          "Lifetime budgets require a valid start time and an end time later than the start time.",
        );
        return false;
      }
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      metaBudgetMode === "DAILY" &&
      ((metaStartTime && !metaEndTime) ||
        (!metaStartTime && metaEndTime) ||
        (metaStartTime &&
          metaEndTime &&
          new Date(metaEndTime) <= new Date(metaStartTime)))
    ) {
      setError(
        "For a daily budget schedule, provide both start and end times and make the end later than the start.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      metaBuyingType === "RESERVED"
    ) {
      setError(
        "Meta Reserved buying requires a separate Reach & Frequency reservation workflow. This form currently prepares Auction campaigns only; choose Auction until reservation predictions, booking and Ad Set assignment are implemented.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      metaPlacementMode === "MANUAL" &&
      (!metaPublisherPlatforms.length ||
        (metaPublisherPlatforms.includes("facebook") &&
          !metaFacebookPositions.length) ||
        (metaPublisherPlatforms.includes("instagram") &&
          !metaInstagramPositions.length) ||
        (metaPublisherPlatforms.includes("messenger") &&
          !metaMessengerPositions.length) ||
        (metaPublisherPlatforms.includes("audience_network") &&
          !metaAudienceNetworkPositions.length))
    ) {
      setError(
        "Select at least one placement position for every selected Meta publisher platform.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      !effectiveMetaOptimizationGoal
    ) {
      setError("Choose a Meta optimization goal for the selected objective.");
      return false;
    }
    if (selectedPlatforms.includes("metaAds")) {
      const splitMetaLocations = (value: string) =>
        value
          .split(/[\n,]+/)
          .map((item) => item.trim())
          .filter(Boolean);

      const countryCodes = splitMetaLocations(metaCountries).map((code) =>
        code.toUpperCase(),
      );

      const regionKeys = splitMetaLocations(metaRegionKeys);
      const cityKeys = splitMetaLocations(metaCityKeys);
      const zipKeys = splitMetaLocations(metaZipKeys);

      const minAge = Number(metaAgeMin);
      const maxAge = Number(metaAgeMax);

      const hasAnyLocation =
        countryCodes.length > 0 ||
        regionKeys.length > 0 ||
        cityKeys.length > 0 ||
        zipKeys.length > 0;

      if (
        !hasAnyLocation ||
        (countryCodes.length > 0 &&
          countryCodes.some((code) => !/^[A-Z]{2}$/.test(code)))
      ) {
        setError(
          "Select at least one valid Meta country, region, city or ZIP location.",
        );
        return false;
      }
      const metaObjective = metaObjectiveMap[objective];
      const metaCurrency = selectedCurrency(connections.metaAds);

      const pageId = metaPageId.trim();
      const instagramActorId = metaInstagramActorId.trim();

      const hasRealPageId = isRealMetaId(pageId);
      const hasRealInstagramActorId = isRealMetaId(instagramActorId);

      const metaDestination = metaDestinationUrl.trim() || websiteUrl.trim();
      const metaImageUrl = metaCreativeImageUrl.trim();

      const metaPixel = metaPixelId.trim();
      const metaConversionEventValue = metaConversionEvent.trim();

      const hasRealPixel = isRealMetaId(metaPixel);

      const requiresWebsiteConversionPixel = [
        "OFFSITE_CONVERSIONS",
        "VALUE",
      ].includes(effectiveMetaOptimizationGoal);

      const isHttpsUrl = (value: string) => {
        try {
          return new URL(value).protocol === "https:";
        } catch {
          return false;
        }
      };

      if (step === 3 && !hasRealPageId) {
        setError(
          "Select a Facebook Page returned by your connected Meta account.",
        );
        return false;
      }

      const selectedMetaCustomConversion =
        metaCustomConversionOptions.find(
          (conversion) =>
            conversion.id === metaCustomConversionId,
        );

      const hasValidMetaCustomConversion = Boolean(
        selectedMetaCustomConversion &&
        !selectedMetaCustomConversion.isArchived &&
        !selectedMetaCustomConversion.isUnavailable &&
        selectedMetaCustomConversion.sourcePixelId ===
        metaPixel,
      );

      if (
        metaCustomConversionId &&
        !hasValidMetaCustomConversion
      ) {
        setError(
          "The selected Meta Custom Conversion is unavailable or does not belong to the selected Pixel. Select another conversion.",
        );
        return false;
      }
      const selectedPage = metaPageOptions.find((page) => page.id === pageId);

      if (
        selectedPage?.tasks?.length &&
        !selectedPage.tasks.includes("ADVERTISE")
      ) {
        setError(
          "The selected Facebook Page does not include the ADVERTISE task. Choose a Page with advertising access.",
        );
        return false;
      }
      if (instagramActorId && !hasRealInstagramActorId) {
        setError(
          "Choose the Instagram professional account linked to the selected Facebook Page.",
        );
        return false;
      }

      if (
        step === 3 &&
        requiresWebsiteConversionPixel &&
        !hasValidMetaCustomConversion &&
        (!hasRealPixel || !metaConversionEventValue)
      ) {
        setError(
          "Website conversion optimization requires either a valid Pixel with a standard conversion event or an available Custom Conversion.",
        );
        return false;
      }
      if (!/^[A-Z]{3}$/.test(metaCurrency)) {
        setError(
          "Unable to determine a valid three-letter currency for the selected Meta account.",
        );
        return false;
      }

      if (!isHttpsUrl(metaImageUrl)) {
        setError("Enter a valid HTTPS URL for the Meta creative image.");
        return false;
      }

      if (!isHttpsUrl(metaDestination)) {
        setError(
          "Enter a valid HTTPS URL for the Meta website destination.",
        );
        return false;
      }
      const metaBudgetAmount =
        metaBudgetMode === "DAILY"
          ? Number(metaDailyBudget)
          : Number(metaLifetimeBudget);

      if (!Number.isFinite(metaBudgetAmount) || metaBudgetAmount <= 0) {
        setError("Enter a valid positive Meta budget.");
        return false;
      }

      // Current backend Campaign-level bidding input does not expose
      // bid amount or minimum-ROAS constraints.
      if (
        metaBudgetLevel === "CAMPAIGN" &&
        metaBidStrategy !== "LOWEST_COST_WITHOUT_CAP"
      ) {
        setError(
          "The current Campaign-level Meta budget flow supports LOWEST_COST_WITHOUT_CAP only. Select Ad Set-level budgeting to use Bid Cap, Cost Cap or Minimum ROAS.",
        );
        return false;
      }

      if (
        metaBidStrategy === "LOWEST_COST_WITH_MIN_ROAS" &&
        effectiveMetaOptimizationGoal !== "VALUE"
      ) {
        setError("Meta Minimum ROAS requires VALUE optimization.");
        return false;
      }
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      ["LOWEST_COST_WITH_BID_CAP", "COST_CAP"].includes(metaBidStrategy) &&
      !isPositiveAmount(metaBidAmount)
    ) {
      setError(
        "Enter a positive bid amount for the selected Meta bid strategy.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      metaBidStrategy === "LOWEST_COST_WITH_MIN_ROAS"
    ) {
      if (
        effectiveMetaOptimizationGoal !== "VALUE" ||
        !isPositiveAmount(metaMinimumRoas)
      ) {
        setError(
          "Meta Minimum ROAS requires the VALUE optimization goal and a positive ROAS floor.",
        );
        return false;
      }
    }
    setError("");
    return true;
  };

  const validateAdStructure = () => {
    if (selectedPlatforms.includes("googleAds")) {
      if (googleCampaignType === "PERFORMANCE_MAX") {
        if (!pmaxAssetGroupName.trim()) {
          setError("Enter a name for the Performance Max Asset Group.");
          return false;
        }
      } else {
        if (!googleAdGroupName.trim() && googleCampaignType !== "HOTEL") {
          setError("Enter a Google Ads Ad Group name.");
          return false;
        }
        if (googleCampaignType === "SEARCH") {
          const keywords = googleKeywordLines
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean);
          if (!keywords.length) {
            setError("Add at least one keyword for this Search Ad Group.");
            return false;
          }
          if (
            googleCampaignType === "SEARCH" &&
            effectiveGoogleBiddingMode === "MANUAL_CPC" &&
            !isPositiveAmount(googleDefaultCpcBid)
          ) {
            setError(
              "Enter a positive default CPC bid for the Manual CPC Search Ad Group.",
            );
            return false;
          }
        }
        if (
          googleCampaignType === "DISPLAY" &&
          ["MANUAL_CPC", "MANUAL_CPM"].includes(effectiveGoogleBiddingMode) &&
          !isPositiveAmount(googleDefaultCpcBid)
        ) {
          setError(
            "Enter a positive Ad Group-level bid for the selected manual Display bidding method.",
          );
          return false;
        }
        if (googleCampaignType === "HOTEL" && !googleHotelAdGroupName.trim()) {
          setError("Enter a Hotel Ad Group name.");
          return false;
        }
      }
    }

    if (selectedPlatforms.includes("metaAds") && !metaAdSetName.trim()) {
      setError("Enter a Meta Ad Set name.");
      return false;
    }

    setError("");
    return true;
  };

  const isValidHttpUrl = (value: string) => {
    try {
      const parsed = new URL(value.trim());
      return ["http:", "https:"].includes(parsed.protocol);
    } catch {
      return false;
    }
  };

  const getAttachedGoogleDisplayAsset = (requirementId: string) =>
    assetLibrary.find((asset) => {
      const assignment = campaignAssetAssignments[asset.id];
      return (
        asset.kind === "IMAGE" &&
        attachedCreativeAssetIds.includes(asset.id) &&
        assignment?.platform === "googleAds" &&
        assignment.capabilityId === "google-display-responsive-display" &&
        assignment.requirementId === requirementId
      );
    });

  const GOOGLE_PMAX_CAPABILITY_ID = "google-performance-max-asset-group";
  const GOOGLE_PMAX_REQUIREMENTS = {
    LOGO: "google-pmax-logo-images",
    LANDSCAPE: "google-pmax-landscape-images",
    SQUARE: "google-pmax-square-images",
    PORTRAIT: "google-pmax-portrait-images",
    LANDSCAPE_LOGO: "google-pmax-landscape-logo-images",
  } as const;


  const isAiStudioLogo = (asset: LibraryAsset) =>
    asset.kind === "LOGO" && asset.origin === "AI_STUDIO";

  const isAiGeneratedLogoDraft = (asset: CampaignLibraryAsset) => {
    return isAiStudioLogo(asset) && asset.reviewStatus !== "APPROVED";
  }


  const getAttachedGooglePmaxAssets = (requirementId: string) =>
    assetLibrary.filter((asset) => {
      const assignment = campaignAssetAssignments[asset.id];
      const requiresApprovedLogo =
        requirementId === GOOGLE_PMAX_REQUIREMENTS.LOGO ||
        requirementId === GOOGLE_PMAX_REQUIREMENTS.LANDSCAPE_LOGO;

      return (
        attachedCreativeAssetIds.includes(asset.id) &&
        assignment?.platform === "googleAds" &&
        assignment.capabilityId === GOOGLE_PMAX_CAPABILITY_ID &&
        assignment.requirementId === requirementId &&
        !(requiresApprovedLogo && isAiGeneratedLogoDraft(asset))
      );
    });


  const validateAdCreation = () => {
    if (selectedPlatforms.includes("googleAds")) {
      if (googleCampaignType === "SEARCH") {
        const headlines = googleSearchHeadlines
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        const descriptions = googleSearchDescriptions
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        if (!isValidHttpUrl(googleSearchFinalUrl.trim() || websiteUrl.trim())) {
          setError("Enter a valid final URL for the Google Search ad.");
          return false;
        }
        if (
          headlines.length < 3 ||
          headlines.length > 15 ||
          headlines.some((item) => item.length > 30)
        ) {
          setError(
            "Add 3–15 Google Search headlines, with no headline longer than 30 characters.",
          );
          return false;
        }
        if (
          descriptions.length < 2 ||
          descriptions.length > 4 ||
          descriptions.some((item) => item.length > 90)
        ) {
          setError(
            "Add 2–4 Google Search descriptions, with no description longer than 90 characters.",
          );
          return false;
        }
      } else if (googleCampaignType === "PERFORMANCE_MAX") {
        const headlines = pmaxHeadlines
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        const descriptions = pmaxDescriptions
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        if (!isValidHttpUrl(pmaxFinalUrl.trim() || websiteUrl.trim())) {
          setError(
            "Enter a valid final URL for the Performance Max Asset Group.",
          );
          return false;
        }
        const longHeadlines = pmaxLongHeadline
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        if (
          headlines.length < 3 ||
          headlines.length > 15 ||
          headlines.some((item) => item.length > 30)
        ) {
          setError(
            "Performance Max needs 3–15 headlines, each no longer than 30 characters.",
          );
          return false;
        }
        if (
          longHeadlines.length < 1 ||
          longHeadlines.length > 5 ||
          longHeadlines.some((item) => item.length > 90)
        ) {
          setError(
            "Add 1–5 Performance Max long headlines, each no longer than 90 characters.",
          );
          return false;
        }
        if (
          descriptions.length < 2 ||
          descriptions.length > 5 ||
          descriptions.some((item) => item.length > 90)
        ) {
          setError(
            "Performance Max needs 2–5 descriptions, each no longer than 90 characters.",
          );
          return false;
        }
        if (!descriptions.some((item) => item.length <= 60)) {
          setError(
            "At least one Performance Max description must be 60 characters or fewer.",
          );
          return false;
        }
        if (!pmaxBusinessName.trim() || pmaxBusinessName.trim().length > 25) {
          setError(
            "Enter a Performance Max business name (maximum 25 characters).",
          );
          return false;
        }
        const pmaxLogoAssets = getAttachedGooglePmaxAssets(
          GOOGLE_PMAX_REQUIREMENTS.LOGO,
        );
        const pmaxLandscapeAssets = getAttachedGooglePmaxAssets(
          GOOGLE_PMAX_REQUIREMENTS.LANDSCAPE,
        );
        const pmaxSquareAssets = getAttachedGooglePmaxAssets(
          GOOGLE_PMAX_REQUIREMENTS.SQUARE,
        );

        if (!pmaxLogoAssets.length) {
          setError(
            "Attach at least one approved logo from the Asset Library for Performance Max.",
          );
          return false;
        }
        if (!pmaxLandscapeAssets.length) {
          setError(
            "Attach at least one Landscape image from the Asset Library for Performance Max.",
          );
          return false;
        }
        if (!pmaxSquareAssets.length) {
          setError(
            "Attach at least one Square image from the Asset Library for Performance Max.",
          );
          return false;
        }
        const pmaxPortraitAssets = getAttachedGooglePmaxAssets(
          GOOGLE_PMAX_REQUIREMENTS.PORTRAIT,
        );
        const pmaxLandscapeLogoAssets = getAttachedGooglePmaxAssets(
          GOOGLE_PMAX_REQUIREMENTS.LANDSCAPE_LOGO,
        );
        const invalidPmaxLogoCounts = pmaxBrandGuidelinesEnabled
          ? pmaxLogoAssets.length + pmaxLandscapeLogoAssets.length > 5
          : pmaxLandscapeLogoAssets.length > 20;
        if (
          pmaxLogoAssets.length > 5 ||
          pmaxLandscapeAssets.length > 20 ||
          pmaxSquareAssets.length > 20 ||
          pmaxPortraitAssets.length > 20 ||
          invalidPmaxLogoCounts
        ) {
          setError(
            pmaxBrandGuidelinesEnabled
              ? "With brand guidelines enabled, provide at least one square logo and no more than five total campaign logo assets (including up to four additional LOGO or Landscape Logo assets)."
              : "Performance Max allows up to 5 square logos, 20 landscape images, 20 square images, 20 portrait images and 20 landscape logos per Asset Group.",
          );
          return false;
        }
        const pmaxVideoIds = pmaxYoutubeVideoIds
          .split(/[\n,]+/)
          .map((item) => item.trim())
          .filter(Boolean);
        if (pmaxVideoIds.length > 15) {
          setError(
            "Performance Max supports up to 15 YouTube video assets per Asset Group.",
          );
          return false;
        }
        if (
          pmaxVideoIds.some((videoId) => !/^[A-Za-z0-9_-]{11}$/.test(videoId))
        ) {
          setError(
            "Each YouTube video ID must be an 11-character YouTube ID. Leave the field empty when no video is being added.",
          );
          return false;
        }
      } else if (googleCampaignType === "DISPLAY") {
        const headlines = googleDisplayHeadlines
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        const descriptions = googleDisplayDescriptions
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        if (
          !isValidHttpUrl(googleDisplayFinalUrl.trim() || websiteUrl.trim())
        ) {
          setError("Enter a valid final URL for the responsive Display ad.");
          return false;
        }
        if (
          headlines.length < 1 ||
          headlines.length > 5 ||
          headlines.some((item) => item.length > 30)
        ) {
          setError(
            "Responsive Display requires 1–5 headlines, each no longer than 30 characters.",
          );
          return false;
        }
        if (
          !googleDisplayLongHeadline.trim() ||
          googleDisplayLongHeadline.trim().length > 90
        ) {
          setError("Enter one Display long headline (maximum 90 characters).");
          return false;
        }
        if (
          descriptions.length < 1 ||
          descriptions.length > 5 ||
          descriptions.some((item) => item.length > 90)
        ) {
          setError(
            "Responsive Display requires 1–5 descriptions, each no longer than 90 characters.",
          );
          return false;
        }
        if (
          !googleDisplayBusinessName.trim() ||
          googleDisplayBusinessName.trim().length > 25
        ) {
          setError("Enter a Display business name (maximum 25 characters).");
          return false;
        }
        const hasLandscapeLibraryAsset = Boolean(
          getAttachedGoogleDisplayAsset("google-display-landscape-images"),
        );
        const hasSquareLibraryAsset = Boolean(
          getAttachedGoogleDisplayAsset("google-display-square-images"),
        );
        const hasLandscapeImage =
          hasLandscapeLibraryAsset ||
          Boolean(googleDisplayLandscapeAssetResourceName.trim()) ||
          (executionMode !== "LIVE" && isValidHttpUrl(googleDisplayImageUrl));
        const hasSquareImage =
          hasSquareLibraryAsset ||
          Boolean(googleDisplaySquareAssetResourceName.trim()) ||
          (executionMode !== "LIVE" &&
            isValidHttpUrl(googleDisplaySquareImageUrl));

        if (!hasLandscapeImage || !hasSquareImage) {
          setError(
            executionMode === "LIVE"
              ? "Attach both a Landscape and a Square image from the Asset Library, or upload both images to Google Ads first."
              : "Responsive Display requires an attached Landscape image and an attached Square image, or valid image URLs for validation.",
          );
          return false;
        }
      } else if (googleCampaignType === "DEMAND_GEN") {
        if (
          !isValidHttpUrl(googleDisplayFinalUrl.trim() || websiteUrl.trim())
        ) {
          setError("Enter a valid final URL for the Demand Gen ad.");
          return false;
        }
        if (!googleDisplayBusinessName.trim()) {
          setError("Enter the Demand Gen business name.");
          return false;
        }
        if (googleDemandGenFormat === "MULTI_ASSET") {
          const headlines = googleDisplayHeadlines
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean);
          const descriptions = googleDisplayDescriptions
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean);
          if (
            !headlines.length ||
            !descriptions.length ||
            !isValidHttpUrl(googleDisplayImageUrl)
          ) {
            setError(
              "Demand Gen multi-asset ads need headlines, descriptions and at least one valid image URL.",
            );
            return false;
          }
        } else if (googleDemandGenFormat === "PRODUCT_FEED") {
          if (
            !/^\d+$/.test(googleMerchantCenterId.trim()) ||
            !googleDemandGenProductHeadline.trim() ||
            !googleDemandGenProductDescription.trim() ||
            !isValidHttpUrl(googleDemandGenProductLogoUrl)
          ) {
            setError(
              "Demand Gen product ads require a linked Merchant Center ID, headline, description and valid square logo URL.",
            );
            return false;
          }
        } else if (googleDemandGenFormat === "VIDEO_RESPONSIVE") {
          if (
            !googleDemandGenVideoIds.trim() ||
            !isValidHttpUrl(googleDemandGenLogoUrl)
          ) {
            setError(
              "Demand Gen video ads require at least one YouTube video ID and a valid logo image URL (v24+).",
            );
            return false;
          }
        } else {
          const cards = googleDemandGenCarouselCards
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean);
          if (
            cards.length < 2 ||
            cards.length > 10 ||
            cards.some(
              (item) =>
                item.split("|").length < 3 ||
                !isValidHttpUrl(item.split("|")[1]?.trim() || "") ||
                !isValidHttpUrl(item.split("|")[2]?.trim() || ""),
            )
          ) {
            setError(
              "Demand Gen Carousel requires 2–10 lines in the format: headline | image URL | final URL.",
            );
            return false;
          }
        }
      } else if (googleCampaignType === "APP") {
        const headlines = googleAppHeadlines
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        const descriptions = googleAppDescriptions
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        if (headlines.length < 2 || !descriptions.length) {
          setError(
            "App campaigns need at least two text headlines and one description for the selected App Ad draft.",
          );
          return false;
        }
        const imageUrls = googleAppImageUrls
          .split(/[\n,]+/)
          .map((v) => v.trim())
          .filter(Boolean);
        if (
          !imageUrls.every(isValidHttpUrl) ||
          imageUrls.length +
          googleAppYoutubeVideoIds
            .split(/[\n,]+/)
            .map((v) => v.trim())
            .filter(Boolean).length ===
          0
        ) {
          setError(
            "Add at least one valid image asset URL or YouTube video ID for the App Ad.",
          );
          return false;
        }
      }
    }

    if (selectedPlatforms.includes("metaAds")) {
      if (!metaPageId.trim() || !metaPageOptions.some((page) => page.id === metaPageId)) {
        setError("Select a Facebook Page available to your connected Meta account.");
        return false;
      }
      if (metaDestinationType === "APP" && objective !== "APP_PROMOTION") {
        setError(
          "Choose the App Promotion objective when using a Meta App destination.",
        );
        return false;
      }
      if (metaDestinationType === "INSTANT_FORM" && objective !== "LEADS") {
        setError("Instant Form destination requires the Leads objective.");
        return false;
      }
const stepCustomConversion =
  metaCustomConversionOptions.find(
    (conversion) =>
      conversion.id === metaCustomConversionId,
  );

const hasValidStepCustomConversion = Boolean(
  stepCustomConversion &&
    !stepCustomConversion.isArchived &&
    !stepCustomConversion.isUnavailable &&
    stepCustomConversion.sourcePixelId ===
      metaPixelId.trim(),
);

if (
  metaDestinationType === "WEBSITE" &&
  ["OFFSITE_CONVERSIONS", "VALUE"].includes(
    effectiveMetaOptimizationGoal,
  ) &&
  !hasValidStepCustomConversion &&
  (!metaPixelId.trim() || !metaConversionEvent.trim())
) {
  setError(
    "Website conversion optimization requires either a Pixel with a standard event or an available Custom Conversion.",
  );
  return false;
}
      if (!metaPrimaryText.trim() || !metaAdHeadline.trim()) {
        setError("Enter the Meta ad primary text and headline.");
        return false;
      }
      if (
        metaCreativeFormat === "SINGLE_IMAGE" &&
        !isValidHttpUrl(metaCreativeImageUrl)
      ) {
        setError("Enter a valid image URL for the Meta single-image creative.");
        return false;
      }
      if (
        metaCreativeFormat === "SINGLE_VIDEO" &&
        !metaCreativeVideoId.trim()
      ) {
        setError(
          "Enter the uploaded Meta Video ID for the single-video creative.",
        );
        return false;
      }
      if (metaCreativeFormat === "CAROUSEL") {
        const cards = metaCarouselCards
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        if (
          cards.length < 2 ||
          cards.length > 10 ||
          cards.some(
            (item) =>
              item.split("|").length < 3 ||
              !isValidHttpUrl(item.split("|")[1]?.trim() || "") ||
              !isValidHttpUrl(item.split("|")[2]?.trim() || ""),
          )
        ) {
          setError(
            "Meta carousel needs 2–10 lines in the format: headline | image URL | destination URL.",
          );
          return false;
        }
      }
      if (
        metaDestinationType === "WEBSITE" &&
        !isValidHttpUrl(metaDestinationUrl.trim() || websiteUrl.trim())
      ) {
        setError("Enter a valid Meta website destination URL.");
        return false;
      }
      if (metaDestinationType === "INSTANT_FORM" && !metaInstantFormId.trim()) {
        setError(
          "Select or enter an existing Meta Instant Form ID for this lead ad.",
        );
        return false;
      }
      if (
        metaDestinationType === "MESSAGING" &&
        !metaMessagingDestinationId.trim()
      ) {
        setError("Select or enter the connected messaging destination ID.");
        return false;
      }
      if (
        metaDestinationType === "APP" &&
        (!metaAppId.trim() ||
          !metaAppStoreUrl.trim() ||
          !isValidHttpUrl(metaAppStoreUrl.trim()))
      ) {
        setError(
          "Enter the promoted app ID and a valid App Store / Play Store URL for this Meta App destination.",
        );
        return false;
      }
      if (
        metaDestinationType === "MESSAGING" &&
        !["LEADS", "ENGAGEMENT"].includes(objective)
      ) {
        setError(
          "Choose Leads or Engagement for a Meta messaging destination.",
        );
        return false;
      }
      if (websiteUrl.trim() && !isValidHttpUrl(websiteUrl)) {
        setError(
          "Enter a valid website URL before using it as the Meta ad destination.",
        );
        return false;
      }
    }

    setError("");
    return true;
  };

  const markStepReached = (targetStep: number) => {
    const nextStep = Math.min(5, Math.max(1, targetStep));
    setStep(nextStep);
    setFurthestStep((current) => Math.max(current, nextStep));
  };

  // Previously reached steps can be opened directly. Backward jumps are
  // immediate; forward jumps revalidate every step being left so required
  // fields cannot be skipped after an earlier edit.
  const handleStepClick = (targetStep: number) => {
    if (targetStep < 1 || targetStep > furthestStep || targetStep > 5) return;

    if (targetStep > step) {
      for (
        let stepToValidate = step;
        stepToValidate < targetStep;
        stepToValidate += 1
      ) {
        let isValid = true;
        if (stepToValidate === 1) isValid = validateBasics();
        if (stepToValidate === 2) isValid = validatePlatformSettings();
        if (stepToValidate === 3) isValid = validateAdStructure();
        if (stepToValidate === 4) isValid = validateAdCreation();
        if (!isValid) return;
      }
    }

    setStep(targetStep);
    setError("");
    clearPreview();
  };

  const goNext = () => {
    if (step === 1 && !validateBasics()) return;
    if (step === 2 && !validatePlatformSettings()) return;
    if (step === 3 && !validateAdStructure()) return;
    if (step === 4 && !validateAdCreation()) return;
    clearPreview();
    setError("");
    markStepReached(step + 1);
  };

  const goBack = () => {
    setError("");
    clearPreview();
    setStep((current) => Math.max(current - 1, 1));
  };

  const prepareCampaign = () => {
    try {
      if (
        !validateBasics() ||
        !validatePlatformSettings() ||
        !validateAdStructure() ||
        !validateAdCreation() ||
        !objective
      ) {
        return;
      }
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Campaign validation failed. Review the highlighted settings and try again.",
      );
      return;
    }

    let executionPayload: CampaignExecutionPayload;

    try {
      executionPayload = buildExecutionPayload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to build the backend campaign request.",
      );
      return;
    }

    const splitMetaLocations = (value: string) =>
      value
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean);

    const countryCodes = splitMetaLocations(metaCountries).map((code) =>
      code.toUpperCase(),
    );

    const regionKeys = splitMetaLocations(metaRegionKeys);
    const cityKeys = splitMetaLocations(metaCityKeys);
    const zipKeys = splitMetaLocations(metaZipKeys);

    const executionGeoLocations =
      zipKeys.length > 0
        ? {
          zips: zipKeys.map((key) => ({
            key: key.toUpperCase(),
          })),
        }
        : cityKeys.length > 0
          ? {
            cities: cityKeys.map((key) => ({
              key,
              radius: Number(metaCityRadius),
              distance_unit: metaCityDistanceUnit,
            })),
          }
          : regionKeys.length > 0
            ? {
              regions: regionKeys.map((key) => ({ key })),
            }
            : {
              countries: countryCodes,
            };

    const interests = metaTargetingOptions.filter((option: any) => {
      return metaAudienceInterestIds.includes(option.id)
    })
    console.log("interesr", interests);

    const payload = {
      contractVersion: "campaign-builder.v1",
      providerApiTargets: { googleAds: "v26", metaMarketingApi: "v26.0" },
      contractType: "NORMALIZED_PROVIDER_INTENT_NOT_RAW_API_BODY",
      common: {
        name: campaignName.trim(),
        businessName: businessName.trim(),
        websiteUrl: websiteUrl.trim() || null,
        description: description.trim() || null,
        objective,
      },
      platforms: selectedPlatforms,
      creativeAssetReferences: assetLibrary
        .filter((asset) => attachedCreativeAssetIds.includes(asset.id))
        .map((asset) => ({
          assetId: asset.id,
          name: asset.name,
          kind: asset.kind,
          sourceUrl: asset.url || null,
          contentUrl: asset.contentUrl || null,
          storageReference: asset.contentUrl
            ? "ADSYNTRA_PRIVATE_STORAGE"
            : "EXTERNAL_OR_PROVIDER_MEDIA",
          source: asset.origin || "MANUAL",
          prompt: asset.prompt || null,
          textContent: asset.textContent || null,
          aspectRatio: asset.aspectRatio || null,
          intendedPlatforms: Array.from(
            new Set([
              ...(asset.platformTargets?.length
                ? asset.platformTargets
                : selectedPlatforms
              ).filter((platform) => selectedPlatforms.includes(platform)),
              ...(campaignAssetAssignments[asset.id]?.platform
                ? [campaignAssetAssignments[asset.id].platform]
                : []),
            ]),
          ),
          approvalStatus: "APPROVED_DEMO_ASSET",
          providerUploadRequired:
            asset.kind !== "TEXT" && Boolean(asset.contentUrl),
          ...(campaignAssetAssignments[asset.id]
            ? { campaignCreativeTarget: campaignAssetAssignments[asset.id] }
            : {}),
          note:
            asset.kind === "TEXT"
              ? "Copy is stored for reuse; the selected provider copy fields are included in the campaign configuration."
              : asset.contentUrl
                ? "This media is in private AdSyntra storage. Resolve the asset ID, upload it to the selected provider, and use the returned provider media ID before creating the ad."
                : "Verify this external/provider media reference and account ownership before provider mutation.",
        })),
      providerConfigurations: {
        ...(selectedPlatforms.includes("googleAds") && {
          googleAds: {
            accountId: connections.googleAds.selectedAccountId,
            campaign: {
              name: campaignName.trim(),
              campaignType: googleCampaignType,
              advertising_channel_type: googleCampaignTypes.find(
                (item) => item.value === googleCampaignType,
              )?.channelType,
              marketingObjective: googleMarketingObjective,
              conversionGoalConfiguration:
                googleCustomConversionGoalResourceName.trim()
                  ? {
                    mode: "CUSTOM_CONVERSION_GOAL",
                    customConversionGoalResourceName:
                      googleCustomConversionGoalResourceName.trim(),
                    apiMapping:
                      "After campaign creation, update ConversionGoalCampaignConfig.custom_conversion_goal using ConversionGoalCampaignConfigService. The custom goal must already exist in the effective conversion customer.",
                  }
                  : {
                    mode: "ACCOUNT_DEFAULT",
                    apiMapping:
                      "Keep account-level CustomerConversionGoal settings; do not invent a Campaign objective field.",
                  },
              ...(googleCampaignType === "APP" &&
                googleAppSubtype === "APP_CAMPAIGN_FOR_ENGAGEMENT" && {
                selectiveOptimizationConversionActionResourceNames:
                  googleAppSelectiveConversionActions
                    .split(/[\n,]+/)
                    .map((v) => v.trim())
                    .filter(Boolean),
              }),
              ...(googleCampaignType === "APP" && {
                advertising_channel_sub_type: googleAppSubtype,
                app_campaign_setting: {
                  app_id: googleAppId.trim(),
                  app_store: googleAppStore,
                  bidding_strategy_goal_type: effectiveGoogleAppGoal,
                },
                biddingStrategy:
                  selectedGoogleAppGoal.targetKind === "CPA"
                    ? "TARGET_CPA"
                    : selectedGoogleAppGoal.targetKind === "ROAS"
                      ? "TARGET_ROAS"
                      : effectiveGoogleAppGoal ===
                        "OPTIMIZE_TOTAL_VALUE_WITHOUT_TARGET_ROAS"
                        ? "MAXIMIZE_CONVERSION_VALUE"
                        : "MAXIMIZE_CONVERSIONS",
                ...(selectedGoogleAppGoal.targetKind === "CPA" && {
                  targetCpaAmount: Number(googleAppTargetCost),
                }),
                ...(selectedGoogleAppGoal.targetKind === "ROAS" && {
                  targetRoas: Number(googleAppTargetRoas),
                }),
              }),
              ...(googleCampaignType === "SHOPPING" && {
                shopping_setting: {
                  merchant_id: googleMerchantCenterId.trim(),
                  campaign_priority: Number(googleShoppingPriority),
                  ...(googleShoppingFeedLabel.trim() && {
                    feed_label: googleShoppingFeedLabel.trim(),
                  }),
                },
              }),
              ...(googleCampaignType === "DEMAND_GEN" &&
                googleDemandGenFormat === "PRODUCT_FEED" && {
                shopping_setting: {
                  merchant_id: googleMerchantCenterId.trim(),
                  ...(googleShoppingFeedLabel.trim() && {
                    feed_label: googleShoppingFeedLabel.trim(),
                  }),
                },
              }),
              ...(googleCampaignType === "HOTEL" && {
                hotel_setting: { hotel_center_id: googleHotelCenterId.trim() },
                network_settings: { target_google_search: true },
                biddingStrategy: googleHotelBidStrategy,
                hotelCpcBidCeilingAmount: Number(googleHotelBidCeiling),
                hotelTargeting: {
                  country: googleHotelTargetCountry.trim().toUpperCase(),
                  language: googleHotelLanguage.trim().toLowerCase(),
                },
              }),
              ...(googleCampaignType !== "APP" &&
                googleCampaignType !== "HOTEL" && {
                performanceGoalPreset: effectiveGooglePerformanceGoal,
                biddingMode: effectiveGoogleBiddingMode,
                ...(effectiveGoogleBiddingScope === "STANDARD" && {
                  biddingStrategy: effectiveGoogleBiddingStrategy,
                }),
                ...(effectiveGoogleBiddingScope === "PORTFOLIO" && {
                  portfolioBiddingStrategyResourceName:
                    googlePortfolioStrategyResourceName.trim(),
                }),
                ...(googleCampaignType === "DEMAND_GEN" &&
                  effectiveGooglePerformanceGoal === "CLICKS" && {
                  biddingApiMapping:
                    "Map Website clicks to the Google Maximize Clicks strategy only where supported by the selected campaign type. The TargetSpend scheme remains documented, but target_spend.target_spend_micros is deprecated; do not populate that deprecated amount field or send a generic Target CPC field.",
                }),
                ...(effectiveGoogleBiddingMode === "MANUAL_CPC" && {
                  manualCpc: { enhancedCpcEnabled: false },
                  adGroupBidSetupRequired: true,
                }),
                ...(effectiveGoogleBiddingMode === "MANUAL_CPM" && {
                  manualCpm: {},
                  adGroupBidSetupRequired: true,
                }),
                ...(["SEARCH", "PERFORMANCE_MAX"].includes(
                  googleCampaignType,
                ) &&
                  effectiveGoogleBiddingMode === "AUTOMATED" &&
                  effectiveGooglePerformanceGoal === "CONVERSIONS" &&
                  googleTargetCpa && {
                  targetCpaAmount: Number(googleTargetCpa),
                }),
                ...(effectiveGoogleBiddingMode === "AUTOMATED" &&
                  effectiveGooglePerformanceGoal === "CONVERSION_VALUE" &&
                  googleTargetRoas && {
                  targetRoas: Number(googleTargetRoas),
                }),
                ...(effectiveGooglePerformanceGoal === "IMPRESSION_SHARE" &&
                  effectiveGoogleBiddingMode === "AUTOMATED" && {
                  targetImpressionShare: {
                    location: googleImpressionShareLocation,
                    locationFraction:
                      Number(googleImpressionSharePercent) / 100,
                    maxCpcBidCeilingAmount: Number(
                      googleImpressionShareMaxCpc,
                    ),
                  },
                }),
              }),
              ...(googleCampaignType === "SEARCH" && {
                network_settings: {
                  target_google_search: true,
                  target_search_network: googleSearchPartners,
                  target_content_network: googleDisplayExpansion,
                },
              }),
              campaignBudget:
                effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                  ? {
                    period: "CUSTOM_PERIOD",
                    totalAmount: Number(googleCampaignTotalBudget),
                    explicitlyShared: false,
                    amountField: "total_amount_micros",
                  }
                  : {
                    period: "DAILY",
                    averageDailyAmount: Number(googleDailyBudget),
                    explicitlyShared: false,
                    amountField: "amount_micros",
                  },
              budgetApiMapping: {
                service: "CampaignBudgetService.MutateCampaignBudgets",
                resource: "CampaignBudget",
                apiAmountField:
                  effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                    ? "total_amount_micros"
                    : "amount_micros",
                apiPeriod:
                  effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                    ? "CUSTOM_PERIOD"
                    : "DAILY",
                amountConversion:
                  "Google Ads account currency × 1,000,000 micros per currency unit.",
                explicitly_shared: false,
                attachToCampaign:
                  "Campaign.campaign_budget = CampaignBudget.resource_name",
                totalBudgetSchedule:
                  effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                    ? "Set Campaign.start_date_time and Campaign.end_date_time in the Google Ads customer time zone; end_date_time is required for CUSTOM_PERIOD."
                    : null,
                atomicOption:
                  "Prefer one GoogleAdsService.Mutate request with temporary resource IDs for CampaignBudget + Campaign to avoid an orphaned budget; otherwise create budget first and clean up/reuse it if Campaign creation fails.",
              },
              biddingApiMapping: {
                scope: effectiveGoogleBiddingScope,
                ...(effectiveGoogleBiddingScope === "PORTFOLIO"
                  ? {
                    service: "BiddingStrategyService / CampaignService",
                    resource: "BiddingStrategy",
                    strategyResourceName:
                      googlePortfolioStrategyResourceName.trim(),
                    campaignField: "Campaign.bidding_strategy",
                    instruction:
                      "Verify customer ownership and campaign/bidding-scheme compatibility, then reference the existing portfolio strategy. If creating a new strategy, use BiddingStrategyService.MutateBiddingStrategies first.",
                  }
                  : {
                    service:
                      "CampaignService.MutateCampaigns or GoogleAdsService.Mutate",
                    resource: "Campaign.campaign_bidding_strategy union",
                    strategy: effectiveGoogleBiddingStrategy,
                    instruction:
                      "Map the strategy to the matching typed union field (for example maximize_conversions, maximize_conversion_value, target_spend, target_impression_share, manual_cpc, manual_cpm, target_cpm or percent_cpc); do not send the builder label as a literal API field.",
                  }),
                ...(["SEARCH", "PERFORMANCE_MAX"].includes(
                  googleCampaignType,
                ) &&
                  effectiveGooglePerformanceGoal === "CONVERSIONS" &&
                  googleTargetCpa && {
                  targetCpaAmount: Number(googleTargetCpa),
                  apiField: "maximize_conversions.target_cpa_micros",
                }),
                ...(effectiveGooglePerformanceGoal === "CONVERSION_VALUE" &&
                  googleTargetRoas && {
                  targetRoas: Number(googleTargetRoas),
                  apiField: "maximize_conversion_value.target_roas",
                }),
                manualBidPlacement:
                  effectiveGoogleBiddingMode === "MANUAL_CPC" ||
                    effectiveGoogleBiddingMode === "MANUAL_CPM"
                    ? "AdGroup.cpc_bid_micros or AdGroup.cpm_bid_micros, as supported by the selected campaign type"
                    : null,
              },
              ...(googleStartDate && {
                startDate: googleStartDate.replaceAll("-", ""),
              }),
              ...(googleEndDate && {
                endDate: googleEndDate.replaceAll("-", ""),
              }),
              ...(googleCampaignType === "DEMAND_GEN"
                ? {
                  campaignCriteria: {
                    locationResourceNames: [],
                    languageResourceNames: [],
                  },
                  adGroupCriteria: {
                    locationResourceNames: geoResources,
                    languageResourceNames: languageResources,
                    apiMapping:
                      "Create AdGroupCriterion location and language criteria; Demand Gen location/language criteria are configured at Ad Group level.",
                  },
                }
                : {
                  campaignCriteria: {
                    locationResourceNames: geoResources,
                    languageResourceNames: languageResources,
                  },
                }),
              budgetCurrency: selectedCurrency(connections.googleAds),
              ...(["PERFORMANCE_MAX", "DEMAND_GEN", "APP"].includes(
                googleCampaignType,
              ) && {
                campaignBudgetSettings: {
                  explicitlyShared: false,
                  note: "Create a dedicated CampaignBudget; these campaign workflows do not use a shared campaign budget.",
                },
              }),
              contains_eu_political_advertising: googleEuPoliticalStatus,
              status: "PAUSED",
            },
            ...(googleCampaignType === "PERFORMANCE_MAX"
              ? {
                brandGuidelinesEnabled: pmaxBrandGuidelinesEnabled,
                assetGroup: {
                  name: pmaxAssetGroupName.trim(),
                  final_urls: [pmaxFinalUrl.trim() || websiteUrl.trim()],
                  textAssets: {
                    headlines: pmaxHeadlines
                      .split("\n")
                      .map((item) => item.trim())
                      .filter(Boolean),
                    longHeadlines: pmaxLongHeadline
                      .split("\n")
                      .map((item) => item.trim())
                      .filter(Boolean),
                    descriptions: pmaxDescriptions
                      .split("\n")
                      .map((item) => item.trim())
                      .filter(Boolean),
                    businessName: pmaxBusinessName.trim(),
                  },
                  assetAssignments: assetLibrary
                    .filter((asset) =>
                      attachedCreativeAssetIds.includes(asset.id),
                    )
                    .map((asset) => ({
                      assetId: asset.id,
                      assignment: campaignAssetAssignments[asset.id],
                    }))
                    .filter(
                      (entry) =>
                        entry.assignment?.platform === "googleAds" &&
                        entry.assignment.capabilityId ===
                        "google-performance-max-asset-group",
                    ),
                  youtubeVideoIds: pmaxYoutubeVideoIds
                    .split(/[\n,]+/)
                    .map((item) => item.trim())
                    .filter(Boolean),
                  ...(pmaxSearchThemes.trim() && {
                    searchThemes: pmaxSearchThemes
                      .split("\n")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  }),
                  ...(pmaxAudienceResourceNames.trim() && {
                    audienceSignals: {
                      audienceResourceNames: pmaxAudienceResourceNames
                        .split(/[\n,]+/)
                        .map((item) => item.trim())
                        .filter(Boolean),
                      apiMapping:
                        "Create one AssetGroupSignal.audience operation per Audience resource name. A Google Audience can contain user-list segments and other dimensions.",
                    },
                  }),
                  status: "PAUSED",
                  note: "Resolve owner-scoped Asset Library IDs, prepare role-specific derivatives, upload them to the selected Google Ads customer, then atomically create the Asset Group and its required AssetGroupAsset links. When brand guidelines are enabled, link Business Name and Logo at campaign creation instead of the Asset Group.",
                },
              }
              : {
                adGroup: {
                  name:
                    googleCampaignType === "HOTEL"
                      ? googleHotelAdGroupName.trim()
                      : googleAdGroupName.trim(),
                  status: "PAUSED",
                  ...(googleCampaignType === "APP" &&
                    googleAppSubtype === "APP_CAMPAIGN_FOR_ENGAGEMENT" && {
                    audienceSetting: { useAudienceGrouped: true },
                    audienceCriteria: [
                      {
                        type: "AUDIENCE",
                        audienceResourceName:
                          googleAppEngagementAudienceResource.trim(),
                        apiMapping:
                          "Create AdGroupCriterion.audience.audience with AudienceInfo; enable AdGroup.audience_setting.use_audience_grouped=true. The Audience should include eligible app-user segments.",
                      },
                    ],
                  }),
                  ...(googleCampaignType === "SHOPPING" && {
                    type: "SHOPPING_PRODUCT_ADS",
                    productListingGroup: {
                      partitionType: googleShoppingProductGroupType,
                      value: googleShoppingProductGroupValue.trim() || null,
                      note: "Build a root listing group and valid subdivision/unit tree with AdGroupCriterion resources before creating the product ad.",
                    },
                  }),
                  ...(googleCampaignType === "HOTEL" && {
                    ad_group_type: "HOTEL_ADS",
                    hotelListingGroups: {
                      selection: googleHotelListingMode,
                      propertyIds:
                        googleHotelListingMode === "SELECTED_HOTELS"
                          ? googleHotelPropertyIds
                            .split(/[\n,]+/)
                            .map((item) => item.trim())
                            .filter(Boolean)
                          : [],
                    },
                  }),
                  ...(["SEARCH", "DISPLAY", "SHOPPING"].includes(
                    googleCampaignType,
                  ) &&
                    googleAdGroupUserLists.trim() && {
                    audienceCriteria: googleAdGroupUserLists
                      .split(/[\n,]+/)
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .map((resourceName) => ({
                        type: "USER_LIST",
                        userListResourceName: resourceName,
                        apiMapping:
                          "Create AdGroupCriterion.user_list.user_list for each selected audience.",
                      })),
                  }),
                  ...(googleCampaignType === "DEMAND_GEN" &&
                    googleDemandGenAudienceResources.trim() && {
                    audienceCriteria: googleDemandGenAudienceResources
                      .split(/[\n,]+/)
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .map((resourceName) => ({
                        type: "AUDIENCE",
                        audienceResourceName: resourceName,
                        apiMapping:
                          "Create AdGroupCriterion.audience.audience with AudienceInfo; set AdGroup.audience_setting.use_audience_grouped=true before adding criteria.",
                      })),
                  }),
                  ...(googleCampaignType === "SEARCH" && {
                    keywords: googleKeywordLines
                      .split("\n")
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .map((text) => ({
                        text,
                        matchType: googleKeywordMatchType,
                        negative: false,
                      })),
                    negativeKeywords: googleNegativeKeywordLines
                      .split("\n")
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .map((text) => ({
                        text,
                        matchType: googleKeywordMatchType,
                        negative: true,
                      })),
                    keywordApiMapping:
                      "Create positive and negative AdGroupCriterion resources separately; use keyword.match_type and negative=true on the criterion.",
                    ...(effectiveGoogleBiddingMode === "MANUAL_CPC" && {
                      defaultCpcBidAmount: Number(googleDefaultCpcBid),
                    }),
                  }),
                  ...(googleCampaignType === "DISPLAY" &&
                    effectiveGoogleBiddingMode === "MANUAL_CPC" && {
                    defaultCpcBidAmount: Number(googleDefaultCpcBid),
                  }),
                  ...(googleCampaignType === "DISPLAY" &&
                    effectiveGoogleBiddingMode === "MANUAL_CPM" && {
                    defaultCpmBidAmount: Number(googleDefaultCpcBid),
                  }),
                  ...(googleCampaignType === "DEMAND_GEN" && {
                    ...(googleDemandGenAudienceResources.trim() && {
                      audienceSetting: { useAudienceGrouped: true },
                    }),
                    demand_gen_ad_group_settings: {
                      channel_controls: {
                        selected_channels: demandGenChannels,
                      },
                    },
                    ...(googleDemandGenFormat === "PRODUCT_FEED" && {
                      productListingGroup: {
                        selection: googleDemandGenProductGroupMode,
                        note: "Create a ListingGroupInfo root UNIT or SUBDIVISION tree through AdGroupCriterionService; start with all-products root when no split is requested.",
                      },
                    }),
                  }),
                },
              }),
            ...(googleCampaignType === "SHOPPING" && {
              ad: {
                name: `${googleAdGroupName.trim()} - Shopping Product Ad`,
                type: "SHOPPING_PRODUCT_AD",
                status: "PAUSED",
                apiResourceMapping:
                  "Create AdGroupAd.ad.shopping_product_ad after creating the Shopping Ad Group and its product listing group criteria.",
              },
            }),
            ...(googleCampaignType === "HOTEL" && {
              ad: {
                name: `${googleHotelAdGroupName.trim()} - Hotel Ad`,
                type: "HOTEL_AD",
                status: "PAUSED",
                apiResourceMapping:
                  "Create AdGroupAd.ad.hotel_ad with HotelAdInfo; Hotel listing group criteria are separate AdGroupCriterion resources.",
              },
            }),
            ...(googleCampaignType === "SEARCH" && {
              ad: {
                name: `${googleAdGroupName.trim()} - Responsive Search Ad`,
                type: "RESPONSIVE_SEARCH_AD",
                finalUrls: [googleSearchFinalUrl.trim() || websiteUrl.trim()],
                responsiveSearchAd: {
                  headlines: googleSearchHeadlines
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .map((text) => ({ text })),
                  descriptions: googleSearchDescriptions
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .map((text) => ({ text })),
                  ...(googleSearchPath1.trim() && {
                    path1: googleSearchPath1.trim(),
                  }),
                  ...(googleSearchPath2.trim() && {
                    path2: googleSearchPath2.trim(),
                  }),
                },
                status: "PAUSED",
                note: "Normalized responsive-search-ad draft; backend maps this to AdGroupAd and Ad.responsive_search_ad.",
              },
            }),
            ...(googleCampaignType === "DISPLAY" && {
              adCreativeDraft: {
                format: "RESPONSIVE_DISPLAY_AD",
                finalUrl: googleDisplayFinalUrl.trim() || websiteUrl.trim(),
                headlines: googleDisplayHeadlines
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
                longHeadline: googleDisplayLongHeadline.trim(),
                descriptions: googleDisplayDescriptions
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
                businessName: googleDisplayBusinessName.trim(),
                imageAssets: {
                  landscapeImageUrl: googleDisplayImageUrl.trim(),
                  squareImageUrl: googleDisplaySquareImageUrl.trim(),
                },
                status: "PAUSED",
                apiResourceMapping:
                  "AdGroupAd.ad.responsive_display_ad; upload and reference Google Asset resources.",
              },
            }),
            ...(googleCampaignType === "DEMAND_GEN" && {
              adCreativeDraft: {
                format: googleDemandGenFormat,
                finalUrl: googleDisplayFinalUrl.trim() || websiteUrl.trim(),
                businessName: googleDisplayBusinessName.trim(),
                ...(googleDemandGenFormat === "MULTI_ASSET" && {
                  headlines: googleDisplayHeadlines
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean),
                  descriptions: googleDisplayDescriptions
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean),
                  imageUrl: googleDisplayImageUrl.trim(),
                }),
                ...(googleDemandGenFormat === "PRODUCT_FEED" && {
                  productAd: {
                    headline: googleDemandGenProductHeadline.trim(),
                    description: googleDemandGenProductDescription.trim(),
                    logoImageUrl: googleDemandGenProductLogoUrl.trim(),
                  },
                  merchantCenterId: googleMerchantCenterId.trim(),
                  feedLabel: googleShoppingFeedLabel.trim() || null,
                  productListingSelection: googleDemandGenProductGroupMode,
                }),
                ...(googleDemandGenFormat === "VIDEO_RESPONSIVE" && {
                  youtubeVideoIds: googleDemandGenVideoIds
                    .split(/[\n,]+/)
                    .map((item) => item.trim())
                    .filter(Boolean),
                  logoImageUrl: googleDemandGenLogoUrl.trim(),
                }),
                ...(googleDemandGenFormat === "CAROUSEL" && {
                  cards: googleDemandGenCarouselCards
                    .split("\n")
                    .map((row) => row.trim())
                    .filter(Boolean)
                    .map((row) => {
                      const [headline, imageUrl, finalUrl] = row
                        .split("|")
                        .map((v) => v.trim());
                      return { headline, imageUrl, finalUrl };
                    }),
                }),
                status: "PAUSED",
                apiResourceMapping:
                  "Create DemandGenMultiAssetAdInfo, DemandGenVideoResponsiveAdInfo, DemandGenCarouselAdInfo, or DemandGenProductAdInfo. Product-feed campaigns also require linked ShoppingSetting and AdGroupCriterion listing groups. Upload/link Google Asset resources before AdGroupAd creation.",
              },
            }),
            ...(googleCampaignType === "APP" && {
              ad: {
                type:
                  googleAppSubtype === "APP_CAMPAIGN_FOR_ENGAGEMENT"
                    ? "APP_ENGAGEMENT_AD"
                    : googleAppSubtype === "APP_CAMPAIGN_FOR_PRE_REGISTRATION"
                      ? "APP_PRE_REGISTRATION_AD"
                      : "APP_AD",
                headlines: googleAppHeadlines
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
                descriptions: googleAppDescriptions
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
                imageUrls: googleAppImageUrls
                  .split(/[\n,]+/)
                  .map((item) => item.trim())
                  .filter(Boolean),
                youtubeVideoIds: googleAppYoutubeVideoIds
                  .split(/[\n,]+/)
                  .map((item) => item.trim())
                  .filter(Boolean),
                status: "PAUSED",
                apiResourceMapping:
                  "Map subtype to AppAdInfo, AppEngagementAdInfo or AppPreRegistrationAdInfo. Non-text media must already exist as Google Asset resources.",
              },
            }),
          },
        }),
        ...(selectedPlatforms.includes("metaAds") && {
          metaAds: {
            accountId: connections.metaAds.selectedAccountId,
            campaign: {
              name: campaignName.trim(),
              status: "PAUSED",
              objective: metaObjectiveMap[objective],
              buying_type: metaBuyingType,
              special_ad_categories: metaSpecialAdCategories,
              budgetLevel: metaBudgetLevel,
              ...(metaBudgetLevel === "AD_SET" && {
                is_adset_budget_sharing_enabled:
                  metaIsAdsetBudgetSharingEnabled,
              }),
              ...(metaBudgetLevel === "CAMPAIGN" &&
                metaBudgetMode === "DAILY" && {
                dailyBudgetAmount: Number(metaDailyBudget),
                bid_strategy: metaBidStrategy,
              }),
              ...(metaBudgetLevel === "CAMPAIGN" &&
                metaBudgetMode === "LIFETIME" && {
                lifetimeBudgetAmount: Number(metaLifetimeBudget),
                bid_strategy: metaBidStrategy,
              }),
              budgetCurrency: selectedCurrency(connections.metaAds),
              budgetApiMapping: {
                resourceOwner:
                  metaBudgetLevel === "CAMPAIGN"
                    ? "Campaign (CBO)"
                    : "Ad Set (ABO)",
                apiField:
                  metaBudgetMode === "DAILY"
                    ? "daily_budget"
                    : "lifetime_budget",
                amountConversion:
                  "Convert the entered account-currency amount to the currency's smallest unit using currency metadata; do not hardcode a ×100 conversion for every currency.",
                mutualExclusion:
                  "Campaign-level and Ad Set-level budgets must never be sent together for this setup.",
                campaignCreate:
                  metaBudgetLevel === "CAMPAIGN"
                    ? "Include budget field on Campaign create."
                    : "Omit budget fields from Campaign create.",
                adSetCreate:
                  metaBudgetLevel === "AD_SET"
                    ? "Include budget field on Ad Set create."
                    : "Omit budget fields from Ad Set create.",
              },
              biddingApiMapping: {
                strategy: metaBidStrategy,
                strategyOwner:
                  metaBudgetLevel === "CAMPAIGN"
                    ? "Campaign (CBO)"
                    : "Ad Set (ABO)",
                apiField: "bid_strategy",
                bidAmountField: [
                  "LOWEST_COST_WITH_BID_CAP",
                  "COST_CAP",
                ].includes(metaBidStrategy)
                  ? "bid_amount"
                  : null,
                roasConstraintField:
                  metaBidStrategy === "LOWEST_COST_WITH_MIN_ROAS"
                    ? "bid_constraints.roas_average_floor"
                    : null,
                bidAmountConversion:
                  "Convert bid_amount to the ad account currency smallest unit using currency metadata.",
                alwaysOnAdSetFields: ["optimization_goal", "billing_event"],
                note: "The adapter must confirm bid strategy and bid/ROAS constraint support for the selected objective, budget owner and Graph API version.",
              },
            },
            adSet: {
              name: metaAdSetName.trim(),
              campaignLink:
                "Backend supplies the newly created campaign_id returned by the Campaign create call.",
              status: "PAUSED",
              optimization_goal: effectiveMetaOptimizationGoal,
              billing_event: effectiveMetaBillingEvent,
              bidStrategyPlacement:
                metaBudgetLevel === "CAMPAIGN" ? "CAMPAIGN" : "AD_SET",
              scheduleMapping:
                "Meta start_time and end_time belong to the Ad Set, including when the budget is at Campaign level.",
              targeting: {
                geo_locations: executionGeoLocations,
                ...(metaSpecialAdCategories.length === 0 && {
                  age_min: Number(metaAgeMin),
                  age_max: Number(metaAgeMax),
                  ...(metaGender !== "ALL" && {
                    genders: [metaGender === "MEN" ? 1 : 2],
                  }),
                }),
                ...(metaAudienceInterestIds.trim() && {
                  flexible_spec: [
                    {
                      interests: interests
                        .map((int) => ({ id: int.id, name: int.name })),
                    },
                  ],
                }),
                ...(metaIncludedCustomAudienceIds.trim() && {
                  custom_audiences: metaIncludedCustomAudienceIds
                    .split(/[\n,]+/)
                    .map((id) => ({ id: id.trim() })),
                }),
                ...(metaExcludedCustomAudienceIds.trim() && {
                  excluded_custom_audiences: metaExcludedCustomAudienceIds
                    .split(/[\n,]+/)
                    .map((id) => ({ id: id.trim() })),
                }),
                ...(metaPlacementMode === "MANUAL"
                  ? {
                    publisher_platforms: metaPublisherPlatforms,
                    ...(metaPublisherPlatforms.includes("facebook") && {
                      facebook_positions: metaFacebookPositions,
                    }),
                    ...(metaPublisherPlatforms.includes("instagram") && {
                      instagram_positions: metaInstagramPositions,
                    }),
                    ...(metaPublisherPlatforms.includes("messenger") && {
                      messenger_positions: metaMessengerPositions,
                    }),
                    ...(metaPublisherPlatforms.includes(
                      "audience_network",
                    ) && {
                      audience_network_positions:
                        metaAudienceNetworkPositions,
                    }),
                  }
                  : {
                    placementMode: "AUTOMATIC",
                    adapterInstruction:
                      "Omit publisher_platforms and all placement position arrays for automatic placements. Advantage+ Audience is a separate feature and is not enabled by this selection.",
                  }),
              },
              ...(metaBudgetLevel === "AD_SET" &&
                metaBudgetMode === "DAILY" && {
                dailyBudgetAmount: Number(metaDailyBudget),
                bid_strategy: metaBidStrategy,
              }),
              ...(metaBudgetLevel === "AD_SET" &&
                metaBudgetMode === "LIFETIME" && {
                lifetimeBudgetAmount: Number(metaLifetimeBudget),
                bid_strategy: metaBidStrategy,
              }),
              ...(metaStartTime &&
                metaEndTime && {
                start_time: new Date(metaStartTime).toISOString(),
                end_time: new Date(metaEndTime).toISOString(),
              }),
              ...(["LOWEST_COST_WITH_BID_CAP", "COST_CAP"].includes(
                metaBidStrategy,
              ) && {
                bidAmountInput: Number(metaBidAmount),
              }),
              ...(metaBidStrategy === "LOWEST_COST_WITH_MIN_ROAS" && {
                bid_constraints: {
                  roas_average_floor: Math.round(
                    Number(metaMinimumRoas) * 10000,
                  ),
                },
              }),
              ...(metaDestinationType === "APP" && {
                promoted_object: {
                  application_id: metaAppId.trim(),
                  object_store_url: metaAppStoreUrl.trim(),
                },
              }),
              ...(metaDestinationType === "WEBSITE" &&
                (metaCustomConversionId.trim() ||
                  metaPixelId.trim()) && {
                promoted_object: metaCustomConversionId.trim()
                  ? {
                    custom_conversion_id:
                      metaCustomConversionId.trim(),
                  }
                  : {
                    pixel_id: metaPixelId.trim(),
                    ...(metaConversionEvent.trim() && {
                      custom_event_type: metaConversionEvent.trim(),
                    }),
                  },
              }),
            },
            ad: {
              name: `${metaAdSetName.trim()} - Ad`,
              status: "PAUSED",
              creativeDraft: {
                format: metaCreativeFormat,
                pageId: metaPageId.trim(),
                ...(metaInstagramActorId.trim() && {
                  instagramActorId: metaInstagramActorId.trim(),
                }),
                primaryText: metaPrimaryText.trim(),
                headline: metaAdHeadline.trim(),
                description: metaAdDescription.trim() || null,
                ...(metaCreativeFormat === "SINGLE_IMAGE" && {
                  imageUrl: metaCreativeImageUrl.trim(),
                }),
                ...(metaCreativeFormat === "SINGLE_VIDEO" && {
                  uploadedVideoId: metaCreativeVideoId.trim(),
                }),
                ...(metaCreativeFormat === "CAROUSEL" && {
                  cards: metaCarouselCards
                    .split("\n")
                    .map((row) => row.trim())
                    .filter(Boolean)
                    .map((row) => {
                      const [headline, imageUrl, destinationUrl] = row
                        .split("|")
                        .map((v) => v.trim());
                      return { headline, imageUrl, destinationUrl };
                    }),
                }),
                destination: {
                  type: metaDestinationType,
                  ...(metaDestinationType === "WEBSITE" && {
                    url: metaDestinationUrl.trim() || websiteUrl.trim(),
                  }),
                  ...(metaDestinationType === "INSTANT_FORM" && {
                    instantFormId: metaInstantFormId.trim(),
                  }),
                  ...(metaDestinationType === "MESSAGING" && {
                    messagingType: metaMessagingType,
                    messagingDestinationId: metaMessagingDestinationId.trim(),
                  }),
                  ...(metaDestinationType === "APP" && {
                    appId: metaAppId.trim(),
                    appStoreUrl: metaAppStoreUrl.trim(),
                  }),
                },
                callToAction: metaCallToAction,
                apiResourceMapping:
                  "Upload image/video assets first; create AdCreative with object_story_spec or asset_feed_spec and then create Ad using creative_id. For lead forms, resolve the Page-owned lead_gen_form_id; for messaging, build the eligible Messenger/Instagram/WhatsApp destination spec; for app, map app identity/store destination and promoted_object for the selected app campaign objective.",
              },
              note: "creativeDraft is a normalized builder object, not a direct Meta Graph API field. Backend sequence: upload media to the Ad Account; create AdCreative with object_story_spec/link_data, video_data or carousel child attachments as appropriate; then create Ad using the returned creative_id and Ad Set ID.",
            },
          },
        }),
      },
      apiExecutionPlan: {
        googleAds: selectedPlatforms.includes("googleAds")
          ? {
            budget: {
              create:
                "CampaignBudgetService.MutateCampaignBudgets (or GoogleAdsService.Mutate with temporary resource IDs for an atomic budget + campaign create)",
              update:
                "CampaignBudgetService.MutateCampaignBudgets using the existing campaign_budget resource name; update the budget rather than replacing it where possible.",
              read: "GAQL campaign_budget query through GoogleAdsService.Search / SearchStream; join campaigns by campaign_budget resource name.",
              currentConfiguration:
                effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                  ? "CUSTOM_PERIOD + total_amount_micros"
                  : "DAILY + amount_micros",
            },
            bidding: {
              standard:
                "CampaignService.MutateCampaigns: set the Campaign.campaign_bidding_strategy union with one supported typed scheme.",
              portfolio:
                "BiddingStrategyService.MutateBiddingStrategies to create/update portfolio resources; Campaign.bidding_strategy references the portfolio resource name.",
              validation:
                "Check campaign type, strategy scheme, conversion tracking, target values, account currency and any campaign-specific restrictions before mutation.",
            },
            dependencyOrder: [
              "Validate account customer ID, currency, campaign type and bidding compatibility",
              "Create or resolve CampaignBudget resource",
              "Create Campaign with campaign_budget and campaign_bidding_strategy",
              "Create campaign-specific Ad Group / Asset Group and child resources",
              "Read back resource IDs and budget/bidding configuration",
            ],
            failureHandling:
              "For tightly dependent resources, use GoogleAdsService.Mutate with temporary resource names and atomic execution; do not enable partial_failure for dependent operations that reference temporary IDs. Use partial_failure only for independent operations and only where the specific method supports it. If a separate budget call succeeds but campaign creation fails, retain and reconcile/reuse or clean up the orphaned budget.",
          }
          : null,
        metaAds: selectedPlatforms.includes("metaAds")
          ? {
            budgetOwner:
              metaBudgetLevel === "CAMPAIGN"
                ? "Campaign (CBO)"
                : "Ad Set (ABO)",
            create: [
              metaBudgetLevel === "CAMPAIGN"
                ? "POST /act_{ad_account_id}/campaigns with daily_budget or lifetime_budget plus bid_strategy when supported"
                : "POST /act_{ad_account_id}/campaigns without budget fields",
              metaBudgetLevel === "AD_SET"
                ? "POST /act_{ad_account_id}/adsets with daily_budget or lifetime_budget plus bid_strategy"
                : "POST /act_{ad_account_id}/adsets with optimization_goal, billing_event, targeting and schedule; omit Ad Set budget and campaign-level bid strategy stays on Campaign",
            ],
            update:
              metaBudgetLevel === "CAMPAIGN"
                ? "PATCH /{campaign_id} for campaign-level daily_budget / lifetime_budget and applicable bid strategy"
                : "PATCH /{adset_id} for Ad Set daily_budget / lifetime_budget and applicable bid strategy",
            read: "Read Campaign / Ad Set budget_remaining and budget fields; use Insights for spend and delivery metrics.",
            amountConversion:
              "Convert human amounts to the ad account currency's smallest unit using currency metadata; do not assume every currency has two decimal places.",
            alwaysAdSetFields: [
              "optimization_goal",
              "billing_event",
              "targeting",
              "start_time / end_time when supplied",
            ],
            validation:
              "Never send campaign-level and Ad Set-level budgets together. Enforce lifetime-budget schedule rules, objective/optimization/billing compatibility, bid strategy requirements and bid amount / ROAS constraints.",
            dependencyOrder: [
              "Validate account currency and objective",
              "Create Campaign (include budget and bid strategy only for CBO)",
              "Create Ad Set (include budget and bid strategy only for ABO; always include optimization_goal and billing_event)",
              "Create AdCreative and Ad",
              "Read back campaign/ad set budget and delivery status",
            ],
          }
          : null,
      },
      launch: {
        initialStatus: "PAUSED",
      },
    };

    setDemoJob(null);
    setSavedDraft(null);
    const campaignAssetReferences = assetLibrary
      .filter((asset) => attachedCreativeAssetIds.includes(asset.id))
      .map((asset) => ({
        assetId: asset.id,
        name: asset.name,
        kind: asset.kind,
        sourceUrl: asset.url || null,
        contentUrl: asset.contentUrl || null,
        storageReference: asset.contentUrl
          ? "ADSYNTRA_PRIVATE_STORAGE"
          : "EXTERNAL_OR_PROVIDER_MEDIA",
        source: asset.origin || "MANUAL",
        prompt: asset.prompt || null,
        textContent: asset.textContent || null,
        aspectRatio: asset.aspectRatio || null,
        intendedPlatforms: Array.from(
          new Set([
            ...(asset.platformTargets?.length
              ? asset.platformTargets
              : selectedPlatforms
            ).filter((platform) => selectedPlatforms.includes(platform)),
            ...(campaignAssetAssignments[asset.id]?.platform
              ? [campaignAssetAssignments[asset.id].platform]
              : []),
          ]),
        ),
        approvalStatus: "APPROVED_BY_CAMPAIGN_USER",
        providerUploadRequired:
          asset.kind !== "TEXT" && Boolean(asset.contentUrl),
        ...(campaignAssetAssignments[asset.id]
          ? { campaignCreativeTarget: campaignAssetAssignments[asset.id] }
          : {}),
        note: asset.contentUrl
          ? "Private AdSyntra media must be uploaded to the selected provider before ad creation."
          : "Verify the external/provider media reference before ad creation.",
      }));
    const campaignRequestPayload = {
      ...executionPayload,
      creativeAssetReferences: campaignAssetReferences,
    };

    setPreparedPayload(JSON.stringify(payload, null, 2));
    setApiPayloadPreview(JSON.stringify(campaignRequestPayload, null, 2));
    setCopyNotice("");
    setError("");
  };
  const submitCampaignRequest = async () => {
    if (!apiPayloadPreview) {
      setCampaignApiError(
        "Prepare the unified campaign request before submitting.",
      );
      return;
    }

    if (!isLoaded || !isSignedIn) {
      setCampaignApiError(
        "Please sign in before submitting the campaign request.",
      );
      return;
    }

    // Explicit confirmation is required before any live provider mutation.
    if (executionMode === "LIVE") {
      const confirmed = window.confirm(
        [
          "You are about to create real advertising resources.",
          "",
          "Google Ads and Meta Ads will be processed independently.",
          "All successfully created resources are intended to start PAUSED.",
          "",
          "A provider failure may happen after some parent resources have already been created.",
          "Inspect the result and provider accounts before retrying.",
          "",
          "Do you want to continue?",
        ].join("\n"),
      );

      if (!confirmed) return;
    }

    try {
      setCampaignSubmitting(true);
      setCampaignApiError("");
      setCampaignApiResponse(null);
      setMetaRetryResult(null);
      setMetaRetryNeedsAttention(false);

      const token = await getToken();

      if (!token) {
        throw new Error(
          "Unable to retrieve your authentication token. Please sign in again.",
        );
      }

      const response = await fetch(`${API_BASE_URL}/api/campaigns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: apiPayloadPreview,
        cache: "no-store",
      });

      const responseData = await response.json().catch(() => null);

      setCampaignApiResponse(responseData);
      // Refresh the listing because the request may have created parent
      // resources even when a later provider step failed.
      if (responseData) setCampaignListRefresh((value) => value + 1);

      if (!response.ok || responseData?.success === false) {
        throw new Error(
          responseData?.message ||
          `Campaign API request failed with status ${response.status}.`,
        );
      }
    } catch (err) {
      setCampaignApiError(
        err instanceof Error
          ? err.message
          : "Unable to submit the campaign request.",
      );
    } finally {
      setCampaignSubmitting(false);
    }
  };
  const retryMetaCampaignStep = async (action: "ad-set" | "creative") => {
    const applicationCampaignId = String(liveApiResponse?.campaign?.id ?? "").trim();

    if (
      executionMode !== "LIVE" ||
      !/^[a-fA-F0-9]{24}$/.test(applicationCampaignId)
    ) {
      setCampaignApiError(
        "A saved AdSyntra campaign record is required to retry a partially created Meta campaign. Campaign-level rejections cannot use the resource retry endpoint.",
      );
      return;
    }

    const label = action === "ad-set" ? "Meta Ad Set" : "Meta Ad Creative";
    const confirmed = window.confirm(
      [
        `Retry the failed ${label} step?`,
        "",
        "This uses the existing saved Meta Campaign and reuses already-created resources. It does not submit Google Ads or create another Meta Campaign.",
        "",
        "Continue only after reviewing the failed step and confirming that the Meta account is still correct.",
      ].join("\n"),
    );
    if (!confirmed) return;

    const retryBody: Record<string, unknown> = {
      confirm: true,
      ...(action === "ad-set" && effectiveMetaOptimizationGoal === "LINK_CLICKS"
        ? { billing_event: "IMPRESSIONS" }
        : {}),
    };

    try {
      setCampaignSubmitting(true);
      setRetryingMetaAction(action);
      setCampaignApiError("");
      setMetaRetryResult(null);
      setMetaRetryNeedsAttention(false);

      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(applicationCampaignId)}/meta/${action}/retry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(retryBody),
          cache: "no-store",
        },
      );
      const responseData = await response.json().catch(() => null);
      const responseRoot = asObject(responseData);

      if (!response.ok || responseRoot.success !== true) {
        if (String(responseRoot.creationStatus ?? "").toLowerCase() === "needs_attention") {
          setMetaRetryNeedsAttention(true);
        }
        throw new Error(
          String(
            responseRoot.message ||
            `${label} retry failed with HTTP ${response.status}.`,
          ),
        );
      }

      const returnedProvider = asObject(responseRoot.provider);
      const resourceId = String(
        action === "ad-set"
          ? returnedProvider.adSetId ?? asObject(responseRoot.adSet).adSetId ?? ""
          : returnedProvider.creativeId ?? asObject(responseRoot.creative).creativeId ?? "",
      ).trim();
      if (!/^\d+$/.test(resourceId)) {
        throw new Error(
          `${label} retry returned success without a valid resource ID. Check the Meta account before retrying again.`,
        );
      }

      const resourceType = action === "ad-set" ? "adSet" : "creative";
      setCampaignApiResponse((current) => {
        const root = asObject(current);
        const providerResults = asObject(root.providers);
        const previousMetaResult = asObject(providerResults.metaAds);
        const previousResources = Array.isArray(previousMetaResult.partialResources)
          ? previousMetaResult.partialResources
          : [];
        const mergedResources = [
          ...previousResources.filter((item: unknown) => {
            const resource = asObject(item);
            const type = String(resource.resourceType ?? "").replace(/[\s_-]/g, "").toLowerCase();
            return !(type === resourceType.toLowerCase() && String(resource.resourceId ?? resource.id ?? "") === resourceId);
          }),
          { resourceType, resourceId, status: "created" },
        ];

        return {
          ...root,
          success: false,
          partialSuccess: true,
          providers: {
            ...providerResults,
            metaAds: {
              ...previousMetaResult,
              success: false,
              creationStatus: "partial",
              failedStep: null,
              error: null,
              partialResources: mergedResources,
              providerStatusCode: undefined,
              providerErrorDetails: undefined,
            },
          },
        } as LiveCampaignApiResponse;
      });

      setMetaRetryResult({
        action,
        message: String(
          responseRoot.message || `${label} was created under the existing Meta Campaign.`,
        ),
        resourceId,
      });
      setCampaignListRefresh((value) => value + 1);
    } catch (retryError) {
      setCampaignApiError(
        retryError instanceof Error
          ? retryError.message
          : `${label} retry failed.`,
      );
    } finally {
      setCampaignSubmitting(false);
      setRetryingMetaAction(null);
    }
  };
  const placeholderMetaIds = new Set([
    "123456789012345",
    "123456789",
    "987654321",
    "600000000000001",
    "600000000000002",
    "600000000000003",
  ]);
  const isRealMetaId = (value: string) => {
    const id = value.trim();
    return /^\d+$/.test(id) && !placeholderMetaIds.has(id);
  };

  const buildExecutionPayload = (): CampaignExecutionPayload => {
    if (!objective) {
      throw new Error("Select a campaign objective.");
    }

    const splitValues = (value: string) =>
      value
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean);

    const usesExampleDomain = (value: string) => {
      try {
        const hostname = new URL(value).hostname.toLowerCase();
        return hostname === "example.com" || hostname.endsWith(".example.com");
      } catch {
        return true;
      }
    };

    const realMetaIds = (value: string) =>
      splitValues(value).filter(isRealMetaId);

    const providers: CampaignExecutionPayload["providers"] = {};
    const buildGoogleDisplayProvider = () => {
      if (effectiveGoogleBudgetMode !== "DAILY") {
        throw new Error(
          "Google Display currently supports a daily budget in this campaign creation flow.",
        );
      }

      const accountId = connections.googleAds.selectedAccountId;

      if (!accountId) {
        throw new Error("Connect and select a Google Ads account.");
      }

      const displayFinalUrl = googleDisplayFinalUrl.trim() || websiteUrl.trim();

      // Validate final URL.
      try {
        const url = new URL(displayFinalUrl);

        if (!["https:", "http:"].includes(url.protocol)) {
          throw new Error();
        }
      } catch {
        throw new Error("Enter a valid Google Display final URL.");
      }

      // Validate creative text.
      const headlines = splitValues(googleDisplayHeadlines);
      const descriptions = splitValues(googleDisplayDescriptions);
      const longHeadline = googleDisplayLongHeadline.trim();
      const displayBusinessName = googleDisplayBusinessName.trim();

      if (
        headlines.length < 1 ||
        headlines.length > 5 ||
        !headlines.every((value) => value.length <= 30)
      ) {
        throw new Error(
          "Google Responsive Display Ads require 1–5 headlines, each up to 30 characters.",
        );
      }

      if (!longHeadline || longHeadline.length > 90) {
        throw new Error(
          "Google Display long headline is required and must not exceed 90 characters.",
        );
      }

      if (
        descriptions.length < 1 ||
        descriptions.length > 5 ||
        !descriptions.every((value) => value.length <= 90)
      ) {
        throw new Error(
          "Google Display requires 1–5 descriptions, each up to 90 characters.",
        );
      }

      if (!displayBusinessName || displayBusinessName.length > 25) {
        throw new Error(
          "Google Display business name is required and must not exceed 25 characters.",
        );
      }

      // A campaign-attached private Asset Library image is a valid image input
      // even though its content URL is authenticated and not a public HTTPS URL.
      // The backend resolves its Asset ID and uploads it to Google Ads during LIVE.
      const googleDisplayCapabilityId = "google-display-responsive-display";
      const landscapeRequirementId = "google-display-landscape-images";
      const squareRequirementId = "google-display-square-images";
      const isAttachedForRequirement = (
        asset: LibraryAsset,
        requirementId: string,
      ) =>
        attachedCreativeAssetIds.includes(asset.id) &&
        campaignAssetAssignments[asset.id]?.platform === "googleAds" &&
        campaignAssetAssignments[asset.id]?.capabilityId ===
        googleDisplayCapabilityId &&
        campaignAssetAssignments[asset.id]?.requirementId === requirementId;

      const landscapeAsset =
        assetLibrary.find((asset) =>
          isAttachedForRequirement(asset, landscapeRequirementId),
        ) ||
        assetLibrary.find(
          (asset) =>
            asset.url === googleDisplayImageUrl.trim() ||
            asset.contentUrl === googleDisplayImageUrl.trim(),
        );
      const squareAsset =
        assetLibrary.find((asset) =>
          isAttachedForRequirement(asset, squareRequirementId),
        ) ||
        assetLibrary.find(
          (asset) =>
            asset.url === googleDisplaySquareImageUrl.trim() ||
            asset.contentUrl === googleDisplaySquareImageUrl.trim(),
        );

      const landscapeImageUrl =
        googleDisplayImageUrl.trim() || landscapeAsset?.contentUrl || "";
      const squareImageUrl =
        googleDisplaySquareImageUrl.trim() || squareAsset?.contentUrl || "";

      const validateImageUrl = (value: string, label: string) => {
        try {
          const url = new URL(value);
          if (url.protocol !== "https:") throw new Error();
        } catch {
          throw new Error(`A valid HTTPS ${label} image URL is required.`);
        }
      };

      if (!landscapeAsset?.contentUrl) {
        validateImageUrl(landscapeImageUrl, "landscape");
      }
      if (!squareAsset?.contentUrl) {
        validateImageUrl(squareImageUrl, "square");
      }

      if (!landscapeImageUrl && !landscapeAsset?.contentUrl) {
        throw new Error(
          "Select a landscape image from the Asset Library or provide an HTTPS image URL.",
        );
      }
      if (!squareImageUrl && !squareAsset?.contentUrl) {
        throw new Error(
          "Select a square image from the Asset Library or provide an HTTPS image URL.",
        );
      }

      // Validate dimensions consistently with the server-side provider upload.
      const landscapeRatio = landscapeAsset
        ? getLibraryAssetAspectRatio(landscapeAsset)
        : null;
      const squareRatio = squareAsset
        ? getLibraryAssetAspectRatio(squareAsset)
        : null;

      if (landscapeRatio !== null && landscapeRatio < 1.2) {
        throw new Error(
          "Google Display landscape images must use a landscape aspect ratio (at least 1.2:1).",
        );
      }

      if (squareRatio !== null && (squareRatio < 0.9 || squareRatio > 1.1)) {
        throw new Error(
          "Google Display square images must use an approximately 1:1 aspect ratio.",
        );
      }

      // Normalize bidding strategy.
      const biddingStrategy =
        effectiveGoogleBiddingMode === "MANUAL_CPC" ||
          effectiveGoogleBiddingMode === "MANUAL_CPM"
          ? effectiveGoogleBiddingMode
          : effectiveGoogleBiddingStrategy === "TARGET_SPEND"
            ? "MAXIMIZE_CLICKS"
            : effectiveGoogleBiddingStrategy;

      const supportedStrategies = [
        "MANUAL_CPC",
        "MANUAL_CPM",
        "MAXIMIZE_CLICKS",
        "MAXIMIZE_CONVERSIONS",
        "MAXIMIZE_CONVERSION_VALUE",
        "TARGET_CPA",
        "TARGET_ROAS",
      ];

      if (!supportedStrategies.includes(biddingStrategy)) {
        throw new Error(
          `Bidding strategy ${biddingStrategy} is not supported for Google Display.`,
        );
      }

      if (effectiveGoogleBiddingScope === "PORTFOLIO") {
        throw new Error(
          "Portfolio bidding is not yet connected to the Google Display creation flow.",
        );
      }

      if (effectiveGooglePerformanceGoal === "IMPRESSION_SHARE") {
        throw new Error(
          "Impression Share bidding is not currently supported by the Google Display creation flow.",
        );
      }

      const biddingOptions = {
        ...(isPositiveAmount(googleTargetCpa) &&
          biddingStrategy === "TARGET_CPA" && {
          targetCpa: Number(googleTargetCpa),
        }),

        ...(isPositiveAmount(googleTargetRoas) &&
          biddingStrategy === "TARGET_ROAS" && {
          targetRoas: Number(googleTargetRoas),
        }),
      };

      // Validate manual bids.
      const adGroupBids: Record<string, number> = {};

      if (
        effectiveGoogleBiddingMode === "MANUAL_CPC" ||
        effectiveGoogleBiddingMode === "MANUAL_CPM"
      ) {
        if (!isPositiveAmount(googleDefaultCpcBid)) {
          throw new Error("Enter a valid positive manual Display bid amount.");
        }

        if (effectiveGoogleBiddingMode === "MANUAL_CPC") {
          adGroupBids.defaultCpcBidAmount = Number(googleDefaultCpcBid);
        }

        if (effectiveGoogleBiddingMode === "MANUAL_CPM") {
          adGroupBids.defaultCpmBidAmount = Number(googleDefaultCpcBid);
        }
      }

      // Normalize Google campaign dates.
      const normalizeGoogleDate = (
        value: string,
        label: string,
      ): string | undefined => {
        if (!value.trim()) return undefined;

        const normalized = value.trim().replaceAll("-", "");

        if (!/^\d{8}$/.test(normalized)) {
          throw new Error(`Invalid Google campaign ${label}.`);
        }

        const year = Number(normalized.slice(0, 4));
        const month = Number(normalized.slice(4, 6));
        const day = Number(normalized.slice(6, 8));

        const date = new Date(Date.UTC(year, month - 1, day));

        if (
          date.getUTCFullYear() !== year ||
          date.getUTCMonth() !== month - 1 ||
          date.getUTCDate() !== day
        ) {
          throw new Error(`Invalid Google campaign ${label}.`);
        }

        return normalized;
      };

      const startDate = normalizeGoogleDate(googleStartDate, "start date");

      const endDate = normalizeGoogleDate(googleEndDate, "end date");

      if (startDate && endDate && endDate <= startDate) {
        throw new Error(
          "Google campaign end date must be later than its start date.",
        );
      }

      // Prepare audience resource names.
      const audienceResources = splitValues(googleAdGroupUserLists);

      const customerId = accountId
        .trim()
        .replace(/^customers\//i, "")
        .replace(/-/g, "");

      if (!/^\d+$/.test(customerId)) {
        throw new Error("Invalid selected Google Ads customer ID.");
      }

      const availableUserListResourceNames = new Set(
        googleUserListOptions
          .map((option) => getGoogleLookupResourceName(option))
          .filter(Boolean),
      );

      for (const resourceName of audienceResources) {
        if (!availableUserListResourceNames.has(resourceName)) {
          throw new Error(
            `User list ${resourceName} is not available in the current Google Ads account lookup results. Reload the audience lists and select an available list.`,
          );
        }
      }

      // A saved Asset Library image can be uploaded by the backend during LIVE.
      // A pre-uploaded Google Asset resource name is still accepted as before.
      const hasAttachedLandscapeLibraryAsset = assetLibrary.some((asset) =>
        isAttachedForRequirement(asset, landscapeRequirementId),
      );
      const hasAttachedSquareLibraryAsset = assetLibrary.some((asset) =>
        isAttachedForRequirement(asset, squareRequirementId),
      );

      if (
        executionMode === "LIVE" &&
        ((!googleDisplayLandscapeAssetResourceName &&
          !hasAttachedLandscapeLibraryAsset) ||
          (!googleDisplaySquareAssetResourceName &&
            !hasAttachedSquareLibraryAsset))
      ) {
        throw new Error(
          "Attach both a landscape and a square image from the Asset Library, or upload both images to Google Ads before creating a live Display campaign.",
        );
      }

      return {
        accountId,
        providerObjective: googleMarketingObjective,
        providerCampaignType: "DISPLAY",
        containsEuPoliticalAdvertising: googleEuPoliticalStatus,

        configuration: {
          budget: {
            name: `${campaignName.trim()} - Budget`,
            amount: Number(googleDailyBudget),
          },

          campaign: {
            name: campaignName.trim(),
            campaignType: "DISPLAY",
            biddingStrategy,
            biddingOptions:
              Object.keys(biddingOptions).length > 0
                ? biddingOptions
                : undefined,
            performanceGoalPreset: effectiveGooglePerformanceGoal,
            biddingMode: effectiveGoogleBiddingMode,
            marketingObjective: googleMarketingObjective,
            startDate,
            endDate,
          },

          adGroup: {
            name: googleAdGroupName.trim(),
            status: "PAUSED",
            ...adGroupBids,

            audienceCriteria: audienceResources.map((userListResourceName) => ({
              type: "USER_LIST",
              userListResourceName,
              targetingMode: "TARGETING",
            })),
          },

          locations: geoResources.map((geoTargetConstantResourceName) => ({
            geoTargetConstantResourceName,
          })),

          languages: languageResources,

          adCreativeDraft: {
            format: "RESPONSIVE_DISPLAY_AD",
            finalUrl: displayFinalUrl,
            headlines,
            longHeadline,
            descriptions,
            businessName: displayBusinessName,

            imageAssets: {
              landscapeImageUrl,
              squareImageUrl,

              marketingImageAssetResourceNames:
                googleDisplayLandscapeAssetResourceName
                  ? [googleDisplayLandscapeAssetResourceName]
                  : [],

              squareMarketingImageAssetResourceNames:
                googleDisplaySquareAssetResourceName
                  ? [googleDisplaySquareAssetResourceName]
                  : [],
            },

            providerUploadRequired: true,
            status: "PAUSED",
          },
        },
      };
    };
    const buildGooglePerformanceMaxProvider = () => {
      const accountId = connections.googleAds.selectedAccountId;
      if (!accountId) {
        throw new Error("Connect and select a Google Ads account.");
      }

      const finalUrl = pmaxFinalUrl.trim() || websiteUrl.trim();
      if (!isValidHttpUrl(finalUrl)) {
        throw new Error("Enter a valid final URL for the Performance Max Asset Group.");
      }
      if (executionMode === "LIVE" && usesExampleDomain(finalUrl)) {
        throw new Error("Replace the example.com Performance Max final URL before live execution.");
      }

      // Build only the two standard PMax bidding strategies supported by the
      // backend flow. PMax portfolio bidding is intentionally not enabled.
      if (effectiveGoogleBiddingScope !== "STANDARD") {
        throw new Error("Standard Performance Max currently supports standard bidding only; portfolio bidding is not available in this flow.");
      }

      const biddingStrategy = effectiveGoogleBiddingStrategy;
      if (!["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE"].includes(biddingStrategy)) {
        throw new Error(`Google bidding strategy "${biddingStrategy}" is not supported for Standard Performance Max.`);
      }
      if (
        (effectiveGooglePerformanceGoal === "CONVERSIONS" && biddingStrategy !== "MAXIMIZE_CONVERSIONS") ||
        (effectiveGooglePerformanceGoal === "CONVERSION_VALUE" && biddingStrategy !== "MAXIMIZE_CONVERSION_VALUE")
      ) {
        throw new Error("The Performance Max bidding strategy does not match the selected performance goal.");
      }

      const budget = effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
        ? {
          period: "CUSTOM_PERIOD",
          totalAmount: Number(googleCampaignTotalBudget),
          explicitlyShared: false,
        }
        : {
          period: "DAILY",
          averageDailyAmount: Number(googleDailyBudget),
          explicitlyShared: false,
        };

      if (!Number.isFinite(
        effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
          ? Number(googleCampaignTotalBudget)
          : Number(googleDailyBudget),
      ) || (
        effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
          ? Number(googleCampaignTotalBudget)
          : Number(googleDailyBudget)
      ) <= 0) {
        throw new Error("Enter a Performance Max budget amount greater than zero.");
      }

      const startDate = googleStartDate.trim().replaceAll("-", "");
      const endDate = googleEndDate.trim().replaceAll("-", "");
      if (effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL" && (!startDate || !endDate)) {
        throw new Error("A Performance Max campaign-total budget requires both a start date and an end date.");
      }
      if (startDate && endDate && endDate <= startDate) {
        throw new Error("Performance Max end date must be later than its start date.");
      }

      const headlines = splitValues(pmaxHeadlines);
      const longHeadlines = splitValues(pmaxLongHeadline);
      const descriptions = splitValues(pmaxDescriptions);
      const videoIds = splitValues(pmaxYoutubeVideoIds);
      const searchThemes = splitValues(pmaxSearchThemes);
      const audienceResourceNames = splitValues(pmaxAudienceResourceNames);

      // These checks mirror validateAdCreation so the payload builder cannot
      // silently emit an incomplete PMax asset group if called independently.
      if (headlines.length < 3 || headlines.length > 15 || headlines.some((value) => value.length > 30)) {
        throw new Error("Performance Max requires 3–15 headlines, each no longer than 30 characters.");
      }
      if (longHeadlines.length < 1 || longHeadlines.length > 5 || longHeadlines.some((value) => value.length > 90)) {
        throw new Error("Performance Max requires 1–5 long headlines, each no longer than 90 characters.");
      }
      if (
        descriptions.length < 2 ||
        descriptions.length > 5 ||
        descriptions.some((value) => value.length > 90) ||
        !descriptions.some((value) => value.length <= 60)
      ) {
        throw new Error("Performance Max requires 2–5 descriptions (maximum 90 characters) and at least one description of 60 characters or fewer.");
      }
      if (!pmaxBusinessName.trim() || pmaxBusinessName.trim().length > 25) {
        throw new Error("Enter a Performance Max business name (maximum 25 characters).");
      }
      if (videoIds.length > 15 || videoIds.some((videoId) => !/^[A-Za-z0-9_-]{11}$/.test(videoId))) {
        throw new Error("Performance Max accepts up to 15 valid 11-character YouTube video IDs.");
      }
      if (audienceResourceNames.some((value) => !/^customers\/\d+\/audiences\/\d+$/.test(value))) {
        throw new Error("Performance Max audience signals must be Google Audience resource names, such as customers/123/audiences/456.");
      }

      const logoAssets = getAttachedGooglePmaxAssets(GOOGLE_PMAX_REQUIREMENTS.LOGO);
      const landscapeAssets = getAttachedGooglePmaxAssets(GOOGLE_PMAX_REQUIREMENTS.LANDSCAPE);
      const squareAssets = getAttachedGooglePmaxAssets(GOOGLE_PMAX_REQUIREMENTS.SQUARE);
      const portraitAssets = getAttachedGooglePmaxAssets(GOOGLE_PMAX_REQUIREMENTS.PORTRAIT);
      const landscapeLogoAssets = getAttachedGooglePmaxAssets(GOOGLE_PMAX_REQUIREMENTS.LANDSCAPE_LOGO);

      if (!logoAssets.length || !landscapeAssets.length || !squareAssets.length) {
        throw new Error("Attach at least one PMax logo, one landscape image and one square image from the Asset Library.");
      }
      if (
        logoAssets.length > 5 ||
        landscapeAssets.length > 20 ||
        squareAssets.length > 20 ||
        portraitAssets.length > 20 ||
        landscapeLogoAssets.length > (pmaxBrandGuidelinesEnabled ? 4 : 20) ||
        (pmaxBrandGuidelinesEnabled && logoAssets.length + landscapeLogoAssets.length > 5)
      ) {
        throw new Error("The selected Performance Max image assignments exceed the supported asset limits.");
      }

      const targetCpaAmount =
        effectiveGooglePerformanceGoal === "CONVERSIONS" &&
          biddingStrategy === "MAXIMIZE_CONVERSIONS" &&
          isPositiveAmount(googleTargetCpa)
          ? Number(googleTargetCpa)
          : undefined;
      const targetRoas =
        effectiveGooglePerformanceGoal === "CONVERSION_VALUE" &&
          biddingStrategy === "MAXIMIZE_CONVERSION_VALUE" &&
          isPositiveAmount(googleTargetRoas)
          ? Number(googleTargetRoas)
          : undefined;

      const negativeMatchType = googleKeywordMatchType as
        | "BROAD"
        | "PHRASE"
        | "EXACT";
      const negativeKeywords = splitValues(googleNegativeKeywordLines).map((text) => ({
        text,
        matchType: negativeMatchType,
      }));

      return {
        accountId,
        providerObjective: googleMarketingObjective,
        providerCampaignType: "PERFORMANCE_MAX",
        configuration: {
          // The backend uses this root-level switch when linking campaign-level
          // brand assets versus Asset Group-level brand assets.
          brandGuidelinesEnabled: pmaxBrandGuidelinesEnabled,
          campaign: {
            name: campaignName.trim(),
            biddingStrategy,
            biddingMode: effectiveGoogleBiddingMode,
            biddingScope: "STANDARD",
            performanceGoalPreset: effectiveGooglePerformanceGoal,
            marketingObjective: googleMarketingObjective,
            ...(startDate ? { startDate } : {}),
            ...(endDate ? { endDate } : {}),
            ...(targetCpaAmount !== undefined ? { targetCpaAmount } : {}),
            ...(targetRoas !== undefined ? { targetRoas } : {}),
            campaignBudget: budget,
            campaignCriteria: {
              locationResourceNames: geoResources,
              languageResourceNames: languageResources,
            },
            contains_eu_political_advertising: googleEuPoliticalStatus,
          },
          assetGroup: {
            name: pmaxAssetGroupName.trim(),
            final_urls: [finalUrl],
            textAssets: {
              headlines,
              longHeadlines,
              descriptions,
              businessName: pmaxBusinessName.trim(),
            },
            youtubeVideoIds: videoIds,
            ...(searchThemes.length > 0 ? { searchThemes } : {}),
            ...(audienceResourceNames.length > 0
              ? { audienceSignals: { audienceResourceNames } }
              : {}),
            status: "PAUSED",
          },
          ...(negativeKeywords.length > 0 ? { negativeKeywords } : {}),
        },
      };
    };

    // --------------------------------------------------
    // GOOGLE ADS — SEARCH, DISPLAY AND STANDARD PERFORMANCE MAX
    // --------------------------------------------------
    if (selectedPlatforms.includes("googleAds")) {
      if (googleCampaignType === "DISPLAY") {
        providers.googleAds = buildGoogleDisplayProvider();
      } else if (googleCampaignType === "PERFORMANCE_MAX") {
        providers.googleAds = buildGooglePerformanceMaxProvider();
      } else if (googleCampaignType === "SEARCH") {
        if (effectiveGoogleBudgetMode !== "DAILY") {
          throw new Error(
            "The current Google Search creation flow supports a daily budget. Campaign-total budgets need a separate backend implementation.",
          );
        }

        const googleFinalUrl = googleSearchFinalUrl.trim() || websiteUrl.trim();

        if (
          effectiveGooglePerformanceGoal === "IMPRESSION_SHARE" ||
          effectiveGoogleBiddingStrategy === "TARGET_IMPRESSION_SHARE"
        ) {
          throw new Error(
            "The current Google Search campaign flow does not yet support the Impression Share bidding configuration.",
          );
        }

        // The UI uses Google's older Target Spend label for Maximize Clicks.
        const biddingStrategy =
          effectiveGoogleBiddingStrategy === "TARGET_SPEND"
            ? "MAXIMIZE_CLICKS"
            : effectiveGoogleBiddingStrategy;

        const supportedStrategies = [
          "MANUAL_CPC",
          "MAXIMIZE_CLICKS",
          "MAXIMIZE_CONVERSIONS",
          "MAXIMIZE_CONVERSION_VALUE",
        ];

        if (!supportedStrategies.includes(biddingStrategy)) {
          throw new Error(
            `Google bidding strategy "${biddingStrategy}" is not supported by the current Search creation flow.`,
          );
        }

        const biddingOptions = {
          ...(effectiveGooglePerformanceGoal === "CONVERSIONS" &&
            isPositiveAmount(googleTargetCpa) && {
            targetCpa: Number(googleTargetCpa),
          }),
          ...(effectiveGooglePerformanceGoal === "CONVERSION_VALUE" &&
            isPositiveAmount(googleTargetRoas) && {
            targetRoas: Number(googleTargetRoas),
          }),
        };

        const matchType = googleKeywordMatchType as
          | "BROAD"
          | "PHRASE"
          | "EXACT";

        const positiveKeywords = splitValues(googleKeywordLines).map(
          (text) => ({
            text,
            matchType,
          }),
        );

        const negativeKeywords = splitValues(googleNegativeKeywordLines).map(
          (text) => ({
            text,
            matchType,
          }),
        );

        if (executionMode === "LIVE" && usesExampleDomain(googleFinalUrl)) {
          throw new Error(
            "Replace the example.com Google final URL before live execution.",
          );
        }

        providers.googleAds = {
          accountId: connections.googleAds.selectedAccountId!,
          providerObjective: googleMarketingObjective,
          providerCampaignType: "SEARCH",

          configuration: {
            budget: {
              name: `${campaignName.trim()} - Budget`,
              amount: Number(googleDailyBudget),
            },

            campaign: {
              name: campaignName.trim(),
              biddingStrategy,
              ...(Object.keys(biddingOptions).length > 0 && {
                biddingOptions,
              }),
            },

            adGroup: {
              name: googleAdGroupName.trim(),
            },

            keywords: {
              positive: positiveKeywords,
              negative: negativeKeywords,
            },

            locations: geoResources.map((geoTargetConstantResourceName) => ({
              geoTargetConstantResourceName,
            })),

            ad: {
              finalUrl: googleFinalUrl,
              headlines: splitValues(googleSearchHeadlines),
              descriptions: splitValues(googleSearchDescriptions),
              ...(googleSearchPath1.trim() && {
                path1: googleSearchPath1.trim(),
              }),
              ...(googleSearchPath2.trim() && {
                path2: googleSearchPath2.trim(),
              }),
            },
          },
        };
      } else {
        throw new Error(
          "The current global Google Ads creation flow supports SEARCH, DISPLAY and PERFORMANCE_MAX campaigns only.",
        );
      }
    }

    // --------------------------------------------------
    // META ADS — current global creation flow:
    // single-image website ad
    // --------------------------------------------------
    if (selectedPlatforms.includes("metaAds")) {
      if (
        metaCreativeFormat !== "SINGLE_IMAGE" ||
        metaDestinationType !== "WEBSITE"
      ) {
        throw new Error(
          "The current Meta global creation flow supports SINGLE_IMAGE creatives with a WEBSITE destination only.",
        );
      }

      const metaObjective = metaObjectiveMap[objective];
      const metaCurrency = selectedCurrency(connections.metaAds);
      const pageId = metaPageId.trim();
      const instagramActorId = metaInstagramActorId.trim();
      // const hasRealInstagramActorId = isRealMetaId(instagramActorId);
      const selectedPage = metaPageOptions.find((page) => page.id === pageId);
      const hasRealInstagramActorId = Boolean(
        instagramActorId &&
        selectedPage?.instagram_business_account?.id === instagramActorId,
      );
      const metaDestination = metaDestinationUrl.trim() || websiteUrl.trim();

      if (!selectedPage) {
        throw new Error(
          "Select a Facebook Page returned by your connected Meta account before preparing the campaign.",
        );
      }
      if (selectedPage.tasks?.length && !selectedPage.tasks.includes("ADVERTISE")) {
        throw new Error(
          "The selected Facebook Page does not include the ADVERTISE task. Choose a Page with advertising access.",
        );
      }
      if (instagramActorId && !hasRealInstagramActorId) {
        throw new Error(
          "The Instagram professional account must be linked to the selected Facebook Page.",
        );
      }
      const metaImageUrl = metaCreativeImageUrl.trim();
      const isHttpsUrl = (value: string) => {
        try {
          return new URL(value).protocol === "https:";
        } catch {
          return false;
        }
      };

      if (!isHttpsUrl(metaImageUrl)) {
        throw new Error("Enter a valid HTTPS URL for the Meta creative image.");
      }

      if (!isHttpsUrl(metaDestination)) {
        throw new Error(
          "Enter a valid HTTPS URL for the Meta website destination.",
        );
      }

      const metaPixel = metaPixelId.trim();
      const metaConversionEventValue = metaConversionEvent.trim();

      const hasRealPixel = isRealMetaId(metaPixel);
const prepareCustomConversion =
  metaCustomConversionOptions.find(
    (conversion) =>
      conversion.id === metaCustomConversionId,
  );

const hasValidPrepareCustomConversion = Boolean(
  prepareCustomConversion &&
    !prepareCustomConversion.isArchived &&
    !prepareCustomConversion.isUnavailable &&
    prepareCustomConversion.sourcePixelId === metaPixel,
);
      const requiresWebsiteConversionPixel = [
        "OFFSITE_CONVERSIONS",
        "VALUE",
      ].includes(effectiveMetaOptimizationGoal);

      // Meta website conversion validation also runs in VALIDATE_ONLY mode.
    if (
  requiresWebsiteConversionPixel &&
  !hasValidPrepareCustomConversion &&
  (!hasRealPixel || !metaConversionEventValue)
) {
  throw new Error(
    "Meta website conversion optimization requires either a valid Pixel with a standard event or an available Custom Conversion.",
  );
}

      if (executionMode === "LIVE" && pageId === "123456789012345") {
        throw new Error(
          "Replace the placeholder Meta Page ID with a Page ID available to your connected Meta account.",
        );
      }
if (
  executionMode === "LIVE" &&
  requiresWebsiteConversionPixel &&
  !hasRealPixel &&
  !hasValidPrepareCustomConversion
) {
  throw new Error(
    "A valid Meta Pixel or Custom Conversion is required for the selected website conversion optimization goal.",
  );
}

      if (
        executionMode === "LIVE" &&
        (usesExampleDomain(metaDestination) || usesExampleDomain(metaImageUrl))
      ) {
        throw new Error(
          "Replace the example.com Meta image and destination URLs before live execution.",
        );
      }

      const regionKeys = realMetaIds(metaRegionKeys);
      const cityKeys = realMetaIds(metaCityKeys);
      const interestIds = realMetaIds(metaAudienceInterestIds);
      const includedAudienceIds = realMetaIds(metaIncludedCustomAudienceIds);
      const excludedAudienceIds = realMetaIds(metaExcludedCustomAudienceIds);

      const metaStartDate = metaStartTime ? new Date(metaStartTime) : null;

      const metaEndDate = metaEndTime ? new Date(metaEndTime) : null;

      if (metaStartDate && Number.isNaN(metaStartDate.getTime())) {
        throw new Error("Enter a valid Meta start date.");
      }

      if (metaEndDate && Number.isNaN(metaEndDate.getTime())) {
        throw new Error("Enter a valid Meta end date.");
      }

      if (metaStartDate && metaStartDate.getTime() <= Date.now()) {
        throw new Error("Meta campaign start date must be in the future.");
      }

      if (
        metaStartDate &&
        metaEndDate &&
        metaEndDate.getTime() <= metaStartDate.getTime()
      ) {
        throw new Error("Meta end date must be later than the start date.");
      }

      if (metaBudgetMode === "LIFETIME" && !metaEndDate) {
        throw new Error(
          "A Meta Ad Set end date is required for a lifetime budget.",
        );
      }

      const zipKeys = splitValues(metaZipKeys);

      const geoLocations =
        zipKeys.length > 0
          ? {
            zips: zipKeys.map((key) => ({
              key: key.toUpperCase(),
            })),
          }
          : cityKeys.length > 0
            ? {
              cities: cityKeys.map((key) => ({
                key,
                radius: Number(metaCityRadius),
                distance_unit: metaCityDistanceUnit,
              })),
            }
            : regionKeys.length > 0
              ? {
                regions: regionKeys.map((key) => ({ key })),
              }
              : {
                countries: splitValues(metaCountries).map((code) =>
                  code.toUpperCase(),
                ),
              };

      const targeting = {
        geo_locations: geoLocations,

        ...(metaSpecialAdCategories.length === 0 && {
          age_min: Number(metaAgeMin),
          age_max: Number(metaAgeMax),
          ...(metaGender !== "ALL" && {
            genders: [metaGender === "MEN" ? 1 : 2],
          }),
        }),

        ...(interestIds.length > 0 && {
          flexible_spec: [
            {
              interests: interestIds.map((id) => ({ id })),
            },
          ],
        }),

        ...(includedAudienceIds.length > 0 && {
          custom_audiences: includedAudienceIds.map((id) => ({ id })),
        }),

        ...(excludedAudienceIds.length > 0 && {
          excluded_custom_audiences: excludedAudienceIds.map((id) => ({
            id,
          })),
        }),
      };

      const placements = {
        mode: metaPlacementMode,
        ...(metaPlacementMode === "MANUAL" && {
          publisherPlatforms: metaPublisherPlatforms,
          ...(metaPublisherPlatforms.includes("facebook") && {
            facebookPositions: metaFacebookPositions,
          }),
          ...(metaPublisherPlatforms.includes("instagram") && {
            instagramPositions: metaInstagramPositions,
          }),
          ...(metaPublisherPlatforms.includes("messenger") && {
            messengerPositions: metaMessengerPositions,
          }),
          ...(metaPublisherPlatforms.includes("audience_network") && {
            audienceNetworkPositions: metaAudienceNetworkPositions,
          }),
        }),
      };

      providers.metaAds = {
        accountId: connections.metaAds.selectedAccountId!,
        providerObjective: metaObjective,
        providerCampaignType: "CAMPAIGN",

        configuration: {
          campaign: {
            name: campaignName.trim(),
            objective: metaObjective,
            buyingType: metaBuyingType,
            specialAdCategories: metaSpecialAdCategories,
            budgetLevel: metaBudgetLevel,
            budgetCurrency: metaCurrency,
            ...(metaBudgetLevel === "AD_SET" && {
              isAdsetBudgetSharingEnabled:
                metaIsAdsetBudgetSharingEnabled,
            }),

            ...(metaBudgetLevel === "CAMPAIGN" &&
              metaBudgetMode === "DAILY" && {
              dailyBudgetAmount: Number(metaDailyBudget),
            }),

            ...(metaBudgetLevel === "CAMPAIGN" &&
              metaBudgetMode === "LIFETIME" && {
              lifetimeBudgetAmount: Number(metaLifetimeBudget),
            }),

            ...(metaBudgetLevel === "CAMPAIGN" && {
              bidStrategy: metaBidStrategy,
            }),
          },

          adSet: {
            name: metaAdSetName.trim(),
            campaignObjective: metaObjective,
            optimization_goal: effectiveMetaOptimizationGoal,
            billing_event: effectiveMetaBillingEvent,
            targeting,
            placements,
            budgetLevel: metaBudgetLevel,
            budgetCurrency: metaCurrency,

            ...(metaBudgetLevel === "AD_SET" &&
              metaBudgetMode === "DAILY" && {
              dailyBudgetAmount: Number(metaDailyBudget),
            }),

            ...(metaBudgetLevel === "AD_SET" &&
              metaBudgetMode === "LIFETIME" && {
              lifetimeBudgetAmount: Number(metaLifetimeBudget),
            }),

            ...(metaBudgetLevel === "AD_SET" && {
              bid_strategy: metaBidStrategy,
            }),

            ...(metaBudgetLevel === "AD_SET" &&
              ["LOWEST_COST_WITH_BID_CAP", "COST_CAP"].includes(
                metaBidStrategy,
              ) && {
              bidAmountInput: Number(metaBidAmount),
            }),

            ...(metaBudgetLevel === "AD_SET" &&
              metaBidStrategy === "LOWEST_COST_WITH_MIN_ROAS" && {
              bid_constraints: {
                roas_average_floor: Math.round(
                  Number(metaMinimumRoas) * 10000,
                ),
              },
            }),
            ...(metaStartTime && {
              startTime: new Date(metaStartTime).toISOString(),
            }),

            ...(metaEndTime && {
              endTime: new Date(metaEndTime).toISOString(),
            }),

            ...(metaCustomConversionId.trim()
              ? {
                promoted_object: {
                  custom_conversion_id:
                    metaCustomConversionId.trim(),
                },
              }
              : hasRealPixel
                ? {
                  promoted_object: {
                    pixel_id: metaPixel,
                    ...(metaConversionEventValue && {
                      custom_event_type:
                        metaConversionEventValue,
                    }),
                  },
                }
                : {}),

            destinationType: "WEBSITE",
          },

          ad: {
            name: `${metaAdSetName.trim()} - Ad`,
            creativeDraft: {
              format: "SINGLE_IMAGE",
              pageId,
              ...(hasRealInstagramActorId && {
                instagramActorId,
              }),
              primaryText: metaPrimaryText.trim(),
              headline: metaAdHeadline.trim(),
              description: metaAdDescription.trim() || null,
              imageUrl: metaImageUrl,
              destinationUrl: metaDestination,
              callToAction: metaCallToAction,
            },
          },
        },
      };
    }

    return {
      name: campaignName.trim(),
      businessName: businessName.trim(),
      websiteUrl: websiteUrl.trim() || null,
      description: description.trim() || null,
      objective,
      platforms: selectedPlatforms,
      providers,
      execution: {
        validateOnly: executionMode === "VALIDATE_ONLY",
        confirm: executionMode === "LIVE",
      },
    };
  };

  const saveCurrentDraft = () => {
    if (!validateBasics() || !validatePlatformSettings()) return;
    const savedAt = new Date().toLocaleString();
    const recordId = `LOCAL-DRAFT-${String(Date.now()).slice(-7)}`;
    const groupId = recordId;
    const draftRecords: any = selectedPlatforms.map((platform) => ({
      id: `${recordId}-${platform === "googleAds" ? "GOOGLE" : "META"}`,
      groupId,
      name: campaignName.trim() || "Untitled campaign",
      provider: platform,
      campaignType:
        platform === "googleAds"
          ? `Google ${googleCampaignType}`
          : `Meta ${metaBuyingType}`,
      googleCampaignType:
        platform === "googleAds" ? googleCampaignType : undefined,
      objective: (objective || "SALES") as Objective,
      budgetLabel:
        platform === "googleAds"
          ? `Google ${effectiveGoogleBudgetMode === "DAILY" ? googleDailyBudget + "/day" : googleCampaignTotalBudget + " total"}`
          : `Meta ${metaBudgetMode === "DAILY" ? metaDailyBudget + "/day" : metaLifetimeBudget + " lifetime"}`,
      status: "DRAFT",
      creationStatus: "DRAFT",
      accountLabel: selectedAccountLabel(connections[platform]),
      createdAt: savedAt,
      updatedAt: savedAt,
      source: "LOCAL",
    }));
    setSavedDraft({
      name: draftRecords[0]?.name ?? "Untitled campaign",
      savedAt,
      step,
    });
    setCampaignRecords((current) => [...draftRecords, ...current]);
    setSelectedCampaignId(draftRecords[0]?.id ?? recordId);
    setCampaignNotice(
      `${draftRecords.length} provider-specific draft record(s) were saved under one shared initiative.`,
    );
    setError("");
    setWorkspaceView("campaign");
  };

  const ensureGoogleDisplayCompatibleAsset = async (
    asset: LibraryAsset,
  ): Promise<LibraryAsset> => {
    if (!asset.contentUrl) {
      throw new Error(
        "This image is not stored in private AdSyntra Asset Library storage. Upload it to the Asset Library first, then select it for Google Display.",
      );
    }

    const currentMimeType = (asset.mimeType || "").toLowerCase();
    if (
      (currentMimeType === "image/jpeg" || currentMimeType === "image/png") &&
      (asset.sizeBytes ?? 0) > 0 &&
      (asset.sizeBytes ?? 0) <= GOOGLE_ADS_IMAGE_UPLOAD_MAX_BYTES
    ) {
      return asset;
    }

    const token = await getToken();
    if (!token)
      throw new Error("Unable to retrieve your authentication token.");

    const contentUrl = /^https?:\/\//i.test(asset.contentUrl)
      ? asset.contentUrl
      : `${API_BASE_URL.replace(/\/$/, "")}${asset.contentUrl.startsWith("/") ? "" : "/"}${asset.contentUrl}`;
    const imageResponse = await fetch(contentUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!imageResponse.ok) {
      throw new Error(
        `Unable to read the selected Asset Library image (${imageResponse.status}).`,
      );
    }

    const sourceBlob = await imageResponse.blob();
    const normalized = await normalizeImageBlobForGoogleAds(sourceBlob);
    const safeName =
      asset.name
        .replace(/[^a-z0-9-_]+/gi, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 110) || "google-display-image";
    const file = new File(
      [normalized.blob],
      `${safeName}-google-ads.${normalized.extension}`,
      { type: normalized.mimeType },
    );
    const form = new FormData();
    form.append("file", file);
    form.append("name", `${asset.name} · Google Ads compatible`.slice(0, 150));
    form.append("kind", "IMAGE");
    form.append(
      "origin",
      asset.origin === "AI_STUDIO" ? "AI_STUDIO" : "MANUAL",
    );
    form.append("prompt", asset.prompt || "");
    form.append(
      "platformTargets",
      JSON.stringify(
        Array.from(
          new Set([
            ...(asset.platformTargets || []).filter((platform) =>
              selectedPlatforms.includes(platform),
            ),
            "googleAds",
          ]),
        ),
      ),
    );

    const uploadResponse = await fetch(`${API_BASE_URL}/api/assets/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      cache: "no-store",
    });
    const uploadPayload = await uploadResponse.json().catch(() => null);
    if (
      !uploadResponse.ok ||
      uploadPayload?.success === false ||
      typeof uploadPayload?.asset?.id !== "string"
    ) {
      throw new Error(
        uploadPayload?.message ||
        `Unable to save the Google-compatible image copy (${uploadResponse.status}).`,
      );
    }

    const row = uploadPayload.asset;
    const normalizedAsset: LibraryAsset = {
      id: row.id,
      name: String(row.name || `${asset.name} · Google Ads compatible`),
      kind: "IMAGE",
      url:
        typeof row.mediaUrl === "string"
          ? row.mediaUrl
          : typeof row.url === "string"
            ? row.url
            : "",
      addedAt: row.createdAt
        ? new Date(row.createdAt).toLocaleString()
        : new Date().toLocaleString(),
      origin:
        row.origin || (asset.origin === "AI_STUDIO" ? "AI_STUDIO" : "MANUAL"),
      prompt: row.prompt || asset.prompt,
      aspectRatio: row.aspectRatio || asset.aspectRatio,
      platformTargets: Array.isArray(row.platformTargets)
        ? row.platformTargets
        : ["googleAds"],
      contentUrl: row.contentUrl || null,
      originalFileName: row.originalFileName || file.name,
      mimeType: row.mimeType || normalized.mimeType,
      sizeBytes: row.sizeBytes ?? normalized.blob.size,
      width: row.width ?? normalized.width,
      height: row.height ?? normalized.height,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    setAssetLibrary((current) => [
      normalizedAsset,
      ...current.filter((item) => item.id !== normalizedAsset.id),
    ]);
    return normalizedAsset;
  };

  const useLibraryAsset = async (
    asset: CampaignLibraryAsset,
    target:
      | "meta"
      | "pmax-logo"
      | "pmax-landscape"
      | "pmax-square"
      | "pmax-portrait"
      | "pmax-landscape-logo"
      | "google-display"
      | "google-display-square"
      | "demand-gen"
      | "app-image"
      | "google-display"
      | "google-display-square",
  ) => {
    const isGoogleDisplayTarget =
      target === "google-display" || target === "google-display-square";

    if (isGoogleDisplayTarget) {
      if (!selectedPlatforms.includes("googleAds")) {
        setAssetNotice(
          "Select Google Ads as a campaign platform before assigning a Google Display image.",
        );
        return;
      }

      if (asset.kind !== "IMAGE") {
        setAssetNotice("Google Display requires an IMAGE asset.");
        return;
      }

      const expectedRole = target === "google-display" ? "LANDSCAPE" : "SQUARE";
      const actualRatio = getLibraryAssetAspectRatio(asset);
      const actualRole =
        actualRatio === null
          ? null
          : actualRatio >= 1.2
            ? "LANDSCAPE"
            : actualRatio >= 0.9 && actualRatio <= 1.1
              ? "SQUARE"
              : null;

      if (actualRole && actualRole !== expectedRole) {
        setAssetNotice(
          `${asset.name} is ${actualRole.toLowerCase()} and cannot be assigned to the ${expectedRole.toLowerCase()} requirement. Choose an image with the matching aspect ratio.`,
        );
        return;
      }

      try {
        const compatibleAsset = await ensureGoogleDisplayCompatibleAsset(asset);
        const capabilityId = "google-display-responsive-display";
        const requirementId =
          expectedRole === "LANDSCAPE"
            ? "google-display-landscape-images"
            : "google-display-square-images";

        // Assign a unique index within the selected requirement. This metadata
        // travels with the campaign request and is persisted in the provider's
        // Mixed configuration by POST /api/campaigns.
        setCampaignAssetAssignments((current) => {
          const existing = current[compatibleAsset.id];
          if (
            existing?.capabilityId === capabilityId &&
            existing.requirementId === requirementId &&
            existing.platform === "googleAds"
          ) {
            return current;
          }

          const usedIndexes = new Set(
            Object.entries(current)
              .filter(
                ([assetId, assignment]) =>
                  assetId !== compatibleAsset.id &&
                  assignment.platform === "googleAds" &&
                  assignment.capabilityId === capabilityId &&
                  assignment.requirementId === requirementId,
              )
              .map(([, assignment]) => assignment.assetIndex),
          );
          let assetIndex = 0;
          while (usedIndexes.has(assetIndex)) assetIndex += 1;

          return {
            ...current,
            [compatibleAsset.id]: {
              generationId: `asset-library-${compatibleAsset.id}`,
              capabilityId,
              requirementId,
              role: expectedRole as GeneratedCreativeAsset["role"],
              assetIndex,
              platform: "googleAds",
            },
          };
        });

        setAttachedCreativeAssetIds((current) =>
          current.includes(compatibleAsset.id)
            ? current
            : [...current, compatibleAsset.id],
        );
        if (expectedRole === "LANDSCAPE") {
          setGoogleDisplayImageUrl(
            compatibleAsset.url || compatibleAsset.contentUrl || "",
          );
        } else {
          setGoogleDisplaySquareImageUrl(
            compatibleAsset.url || compatibleAsset.contentUrl || "",
          );
        }
        setAssetNotice(
          `${compatibleAsset.name} is attached as Google Display ${expectedRole.toLowerCase()}. The assignment will be saved with this campaign and the private image will be uploaded to Google Ads during LIVE execution.`,
        );
        setWorkspaceView("builder");
        markStepReached(4);
        clearPreview();
      } catch (selectionError) {
        setAssetNotice(
          selectionError instanceof Error
            ? selectionError.message
            : "Unable to prepare this image for Google Display.",
        );
      }
      return;
    }

    const pmaxTargetConfig = {
      "pmax-logo": {
        requirementId: GOOGLE_PMAX_REQUIREMENTS.LOGO,
        role: "LOGO",
        allowedKinds: ["IMAGE", "LOGO"],
        label: "logo",
      },
      "pmax-landscape": {
        requirementId: GOOGLE_PMAX_REQUIREMENTS.LANDSCAPE,
        role: "LANDSCAPE",
        allowedKinds: ["IMAGE"],
        label: "landscape image",
      },
      "pmax-square": {
        requirementId: GOOGLE_PMAX_REQUIREMENTS.SQUARE,
        role: "SQUARE",
        allowedKinds: ["IMAGE"],
        label: "square image",
      },
      "pmax-portrait": {
        requirementId: GOOGLE_PMAX_REQUIREMENTS.PORTRAIT,
        role: "PORTRAIT",
        allowedKinds: ["IMAGE"],
        label: "portrait image",
      },
      "pmax-landscape-logo": {
        requirementId: GOOGLE_PMAX_REQUIREMENTS.LANDSCAPE_LOGO,
        role: "LANDSCAPE_LOGO",
        allowedKinds: ["IMAGE", "LOGO"],
        label: "landscape logo",
      },
    } as const;

    if (target in pmaxTargetConfig) {
      if (
        !selectedPlatforms.includes("googleAds") ||
        googleCampaignType !== "PERFORMANCE_MAX"
      ) {
        setAssetNotice(
          "Select Google Ads and Performance Max before assigning a PMax asset.",
        );
        return;
      }

      const config = pmaxTargetConfig[target as keyof typeof pmaxTargetConfig];

      const isPmaxLogoSlot =
        config.requirementId === GOOGLE_PMAX_REQUIREMENTS.LOGO ||
        config.requirementId === GOOGLE_PMAX_REQUIREMENTS.LANDSCAPE_LOGO;
      if (isPmaxLogoSlot && isAiGeneratedLogoDraft(asset)) {
        setAssetNotice(
          asset.reviewStatus === "REJECTED"
            ? "This AI-generated logo was rejected. Approve it in the Asset Library before assigning it to Performance Max."
            : "This AI-generated logo is still a draft. Review and approve it in the Asset Library before assigning it to Performance Max.",
        );
        return;
      }
      if (!(config.allowedKinds as readonly string[]).includes(asset.kind)) {
        setAssetNotice(
          `Performance Max ${config.label} requires an IMAGE or LOGO Asset Library item of the supported type.`,
        );
        return;
      }


      if (!asset.id?.trim()) {
        setAssetNotice(
          "The selected Asset Library item has no stable asset ID.",
        );
        return;
      }

      setCampaignAssetAssignments((current) => {
        const existing = current[asset.id];
        if (
          existing?.platform === "googleAds" &&
          existing.capabilityId === "google-performance-max-asset-group" &&
          existing.requirementId === config.requirementId
        ) {
          return current;
        }

        const usedIndexes = new Set(
          Object.entries(current)
            .filter(
              ([assetId, assignment]) =>
                assetId !== asset.id &&
                assignment.platform === "googleAds" &&
                assignment.capabilityId ===
                "google-performance-max-asset-group" &&
                assignment.requirementId === config.requirementId,
            )
            .map(([, assignment]) => assignment.assetIndex),
        );
        let assetIndex = 0;
        while (usedIndexes.has(assetIndex)) assetIndex += 1;

        return {
          ...current,
          [asset.id]: {
            generationId: `asset-library-${asset.id}`,
            capabilityId: "google-performance-max-asset-group",
            requirementId: config.requirementId,
            role: config.role as GeneratedCreativeAsset["role"],
            assetIndex,
            platform: "googleAds",
          },
        };
      });

      setAttachedCreativeAssetIds((current) =>
        current.includes(asset.id) ? current : [...current, asset.id],
      );
      setAssetNotice(
        `${asset.name} is attached as a Performance Max ${config.label}. The backend will prepare a provider-compatible derivative and upload it to the selected Google Ads account during LIVE execution.`,
      );
      setWorkspaceView("builder");
      markStepReached(4);
      clearPreview();
      return;
    }

    const isPrivateAdSyntraAsset =
      Boolean(asset.contentUrl) && !asset.url.trim();
    if (isPrivateAdSyntraAsset) {
      if (!["IMAGE", "LOGO", "VIDEO"].includes(asset.kind)) {
        setAssetNotice(
          `${asset.name} is a text asset and cannot be used in this media slot.`,
        );
        return;
      }
      setAttachedCreativeAssetIds((current) =>
        current.includes(asset.id) ? current : [...current, asset.id],
      );
      setAssetNotice(
        `${asset.name} is attached by its saved asset ID. It remains in private AdSyntra storage and needs the provider-specific upload step before a live ad can use it.`,
      );
      clearPreview();
      return;
    }

    let applied = false;

    const isImage = asset.kind === "IMAGE";
    const isImageOrLogo = asset.kind === "IMAGE" || asset.kind === "LOGO";

    const validRatio = (allowed: string[]) =>
      !asset.aspectRatio || allowed.includes(asset.aspectRatio);

    switch (target) {
      case "meta":
        if (isImage) {
          setMetaCreativeImageUrl(asset.url);
          applied = true;
        }
        break;

      case "pmax-logo":
        if (isImageOrLogo && validRatio(["1:1"])) {
          setPmaxLogoUrl(asset.url);
          applied = true;
        }
        break;

      case "pmax-landscape":
        if (isImage && validRatio(["1.91:1"])) {
          setPmaxLandscapeImageUrl(asset.url);
          applied = true;
        }
        break;

      case "pmax-square":
        if (isImage && validRatio(["1:1"])) {
          setPmaxSquareImageUrl(asset.url);
          applied = true;
        }
        break;

      case "pmax-portrait":
        if (isImage && validRatio(["4:5"])) {
          setPmaxPortraitImageUrl(asset.url);
          applied = true;
        }
        break;

      case "google-display":
        if (isImage && validRatio(["1.91:1", "16:9"])) {
          setGoogleDisplayImageUrl(asset.url);
          applied = true;
        }
        break;

      case "google-display-square":
        if (isImage && validRatio(["1:1"])) {
          setGoogleDisplaySquareImageUrl(asset.url);
          applied = true;
        }
        break;

      case "demand-gen":
        if (!isImage) break;

        if (googleDemandGenFormat === "CAROUSEL") {
          setGoogleDemandGenCarouselCards((current) => {
            const card = `${asset.name} | ${asset.url} | ${websiteUrl.trim() || "https://example.com"}`;

            return current ? `${current}\n${card}` : card;
          });

          applied = true;
        } else if (googleDemandGenFormat === "MULTI_ASSET") {
          setGoogleDisplayImageUrl(asset.url);
          applied = true;
        } else if (googleDemandGenFormat === "PRODUCT_FEED") {
          setGoogleDemandGenProductLogoUrl(asset.url);
          applied = true;
        }
        break;

      case "app-image":
        if (isImage) {
          setGoogleAppImageUrls((current) =>
            [
              asset.url,
              ...current
                .split(/[\n,]+/)
                .map((value) => value.trim())
                .filter(Boolean),
            ]
              .filter((value, index, values) => values.indexOf(value) === index)
              .slice(0, 20)
              .join("\n"),
          );

          applied = true;
        }
        break;
    }

    if (!applied) {
      setAssetNotice(
        `${asset.name} cannot be used for ${target.replace("pmax-", "Performance Max ")}. Check its asset type, aspect ratio and selected campaign format.`,
      );
      return;
    }

    // Track the selected asset in the campaign draft.
    setAttachedCreativeAssetIds((current) =>
      current.includes(asset.id) ? current : [...current, asset.id],
    );

    setAssetNotice(
      `${asset.name} selected for ${target.replace("pmax-", "Performance Max ").replaceAll("-", " ")}. Check the required crop and asset rules before publishing.`,
    );

    setWorkspaceView("builder");
    markStepReached(4);
    clearPreview();
  };

  const saveCampaignGeneratedLogoDraft = async (
    generatedAsset: GeneratedCreativeAsset,
  ) => {
    const isLogoDraft =
      generatedAsset.role === "SQUARE_LOGO" ||
      generatedAsset.role === "LANDSCAPE_LOGO";

    if (!isLogoDraft) {
      setAiCreativeError("Only generated logo concepts can be saved as logo drafts.");
      return;
    }

    if (savedCampaignAssetIds[generatedAsset.id]) {
      setAssetNotice("This logo concept is already saved in the Asset Library as a draft.");
      setAssetLibraryOpen(true);
      return;
    }

    if (generatedAsset.media?.isPlaceholder || !generatedAsset.media?.url) {
      setAiCreativeError("This logo concept is a development placeholder or has no media URL, so it cannot be saved.");
      return;
    }

    setSavingCampaignAssetIds((current) =>
      current.includes(generatedAsset.id)
        ? current
        : [...current, generatedAsset.id],
    );
    setAiCreativeError("");
    setAssetNotice("");

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Unable to retrieve your authentication token.");
      }

      const imageResponse = await fetch(generatedAsset.media.url, {
        cache: "no-store",
      });
      if (!imageResponse.ok) {
        throw new Error(`Unable to download generated logo (${imageResponse.status}).`);
      }

      const blob = await imageResponse.blob();
      const mimeType = (
        blob.type || generatedAsset.media.mimeType || ""
      ).toLowerCase();
      if (!mimeType.startsWith("image/") || blob.size === 0) {
        throw new Error("The generated logo output is not a valid image file.");
      }

      const allowedLogoMimeTypes = new Set([
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
      ]);
      if (!allowedLogoMimeTypes.has(mimeType)) {
        throw new Error("The generated logo must be JPG, PNG, WebP or GIF before it can be saved.");
      }

      const extension = mimeType === "image/webp"
        ? "webp"
        : mimeType === "image/gif"
          ? "gif"
          : mimeType === "image/jpeg"
            ? "jpg"
            : "png";
      const safeName =
        generatedAsset.name
          .replace(/[^a-z0-9-_]/gi, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 110) || "ai-logo-concept";
      const file = new File(
        [blob],
        `${safeName}-${generatedAsset.assetIndex}.${extension}`,
        { type: mimeType },
      );

      const form = new FormData();
      form.append("file", file);
      form.append("name", `${generatedAsset.name} · AI logo draft`.slice(0, 150));
      form.append("kind", "LOGO");
      form.append("origin", "AI_STUDIO");
      form.append(
        "prompt",
        `AI_LOGO_CONCEPT_DRAFT | ${generatedAsset.role} | ${generatedAsset.prompt || aiCreativePrompt}`.slice(0, 5000),
      );
      form.append("platformTargets", JSON.stringify(["googleAds"]));

      const uploadResponse = await fetch(`${API_BASE_URL}/api/assets/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        cache: "no-store",
      });
      const uploadPayload = await uploadResponse.json().catch(() => null);
      if (
        !uploadResponse.ok ||
        uploadPayload?.success === false ||
        typeof uploadPayload?.asset?.id !== "string"
      ) {
        throw new Error(
          uploadPayload?.message ||
          `Logo draft upload failed (HTTP ${uploadResponse.status}).`,
        );
      }

      const row = uploadPayload.asset;
      const savedAsset: CampaignLibraryAsset = {
        id: row.id,
        name: String(row.name || `${generatedAsset.name} · AI logo draft`),
        kind: "LOGO",
        url:
          typeof row.mediaUrl === "string"
            ? row.mediaUrl
            : typeof row.url === "string"
              ? row.url
              : "",
        addedAt: row.createdAt
          ? new Date(row.createdAt).toLocaleString()
          : new Date().toLocaleString(),
        origin: "AI_STUDIO",
        reviewStatus:
          row.reviewStatus === "APPROVED" || row.reviewStatus === "REJECTED"
            ? row.reviewStatus
            : "DRAFT",
        reviewedAt: row.reviewedAt ?? null,
        reviewedByUserId: row.reviewedByUserId ?? null,
        prompt: row.prompt || `AI_LOGO_CONCEPT_DRAFT | ${generatedAsset.role}`,
        aspectRatio: row.aspectRatio || generatedAsset.media.aspectRatio,
        platformTargets: Array.isArray(row.platformTargets)
          ? row.platformTargets
          : ["googleAds"],
        contentUrl: row.contentUrl || null,
        originalFileName: row.originalFileName || file.name,
        mimeType: row.mimeType || mimeType,
        sizeBytes: row.sizeBytes ?? blob.size,
        width: row.width ?? generatedAsset.media.width,
        height: row.height ?? generatedAsset.media.height,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };

      // Store the logo in the reusable library only. It is not attached to
      // the campaign's official brand-logo requirement while still a draft.
      setAssetLibrary((current) => [
        savedAsset,
        ...current.filter((asset) => asset.id !== savedAsset.id),
      ]);
      setSavedCampaignAssetIds((current) => ({
        ...current,
        [generatedAsset.id]: savedAsset.id,
      }));
      setAssetNotice(
        `${savedAsset.name} was saved to the Asset Library as an AI-generated draft. It has not been attached to the campaign.`,
      );
      setAiCreativeNotice(
        `Saved ${generatedAsset.name} to the Asset Library as a draft logo concept. Review it before using an approved brand logo in a live campaign.`,
      );
      setAssetLibraryOpen(true);
    } catch (saveError) {
      setAiCreativeError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save the generated logo draft.",
      );
    } finally {
      setSavingCampaignAssetIds((current) =>
        current.filter((id) => id !== generatedAsset.id),
      );
    }
  };


  const reviewAiLogoAsset = async (
    asset: CampaignLibraryAsset,
    status: Exclude<AssetReviewStatus, "DRAFT">,
  ) => {
    if (!isAiStudioLogo(asset)) {
      setAssetNotice("Only AI-generated logo concepts can be reviewed here.");
      return;
    }

    if (reviewingAssetIds.includes(asset.id)) return;

    setReviewingAssetIds((current) => [...current, asset.id]);
    setAssetNotice("");
    setAssetLibraryError("");

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Unable to retrieve your authentication token.");
      }

      const response = await fetch(
        `${API_BASE_URL}/api/assets/${encodeURIComponent(asset.id)}/review`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ status }),
          cache: "no-store",
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success === false || !payload?.asset) {
        throw new Error(
          payload?.message || `Logo review update failed (${response.status}).`,
        );
      }

      const row = payload.asset;
      const updatedAsset: CampaignLibraryAsset = {
        ...asset,
        reviewStatus: row.reviewStatus ?? status,
        reviewedAt: row.reviewedAt ?? new Date().toISOString(),
        reviewedByUserId: row.reviewedByUserId ?? null,
        name: String(row.name || asset.name),
      };

      setAssetLibrary((current) =>
        current.map((item) =>
          item.id === updatedAsset.id ? updatedAsset : item,
        ),
      );

      if (status === "REJECTED") {
        // A logo rejected after selection must not remain in the campaign draft.
        setAttachedCreativeAssetIds((current) =>
          current.filter((id) => id !== asset.id),
        );
        setCampaignAssetAssignments((current) => {
          const next = { ...current };
          delete next[asset.id];
          return next;
        });
        setAssetNotice(
          `${asset.name} was rejected and removed from this campaign's PMax logo assignments.`,
        );
      } else {
        setAssetNotice(
          `${asset.name} is approved. Select PMax logo or PMax landscape logo to attach it to this campaign.`,
        );
      }
    } catch (reviewError) {
      setAssetLibraryError(
        reviewError instanceof Error
          ? reviewError.message
          : "Unable to update the logo review status.",
      );
    } finally {
      setReviewingAssetIds((current) =>
        current.filter((id) => id !== asset.id),
      );
    }
  };


  const getLibraryTextParts = (asset: CampaignLibraryAsset) => {
    const raw = String(asset.textContent || "").trim();
    const blocks = raw
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter(Boolean);
    const ctaBlock = blocks.find((part) => /^CTA\s*:/i.test(part)) || "";
    const contentBlocks = blocks.filter((part) => !/^CTA\s*:/i.test(part));
    const headline = (contentBlocks[0] || raw).replace(/^Headline\s*:\s*/i, "").trim();
    const body = (contentBlocks[1] || contentBlocks[0] || raw)
      .replace(/^(Primary text|Description|Body)\s*:\s*/i, "")
      .trim();
    const callToAction = ctaBlock.replace(/^CTA\s*:\s*/i, "").trim();

    return { raw, headline, body, callToAction };
  };

  const appendLibraryText = (current: string, value: string) => {
    const additions = value
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const existing = current
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const next = [...existing];

    for (const item of additions) {
      if (!next.some((existingItem) => existingItem.toLowerCase() === item.toLowerCase())) {
        next.push(item);
      }
    }

    return next.join("\n");
  };

  const applyTextLibraryAsset = (
    asset: CampaignLibraryAsset,
    target:
      | "google-headline"
      | "google-long-headline"
      | "google-description"
      | "meta-primary-text"
      | "meta-headline"
      | "meta-description"
      | "meta-cta",
  ) => {
    const parts = getLibraryTextParts(asset);
    let appliedLabel = "";

    switch (target) {
      case "google-headline": {
        if (!selectedPlatforms.includes("googleAds")) return;
        const value = parts.headline || parts.raw;
        if (googleCampaignType === "SEARCH") {
          setGoogleSearchHeadlines((current) => appendLibraryText(current, value));
        } else if (googleCampaignType === "PERFORMANCE_MAX") {
          setPmaxHeadlines((current) => appendLibraryText(current, value));
        } else if (googleCampaignType === "DISPLAY") {
          setGoogleDisplayHeadlines((current) => appendLibraryText(current, value));
        } else if (googleCampaignType === "DEMAND_GEN" && googleDemandGenFormat === "MULTI_ASSET") {
          setGoogleDisplayHeadlines((current) => appendLibraryText(current, value));
        } else if (googleCampaignType === "APP") {
          setGoogleAppHeadlines((current) => appendLibraryText(current, value));
        } else {
          setAssetNotice("This Google campaign format does not use a reusable headline field here.");
          return;
        }
        appliedLabel = "Google headline";
        break;
      }
      case "google-long-headline": {
        if (!selectedPlatforms.includes("googleAds")) return;
        const value = parts.headline || parts.raw;
        if (googleCampaignType === "PERFORMANCE_MAX") {
          setPmaxLongHeadline((current) => appendLibraryText(current, value));
        } else if (googleCampaignType === "DISPLAY") {
          setGoogleDisplayLongHeadline((current) => appendLibraryText(current, value));
        } else {
          setAssetNotice("Long headlines are not used by the currently selected Google campaign format.");
          return;
        }
        appliedLabel = "Google long headline";
        break;
      }
      case "google-description": {
        if (!selectedPlatforms.includes("googleAds")) return;
        const value = parts.body || parts.raw;
        if (googleCampaignType === "SEARCH") {
          setGoogleSearchDescriptions((current) => appendLibraryText(current, value));
        } else if (googleCampaignType === "PERFORMANCE_MAX") {
          setPmaxDescriptions((current) => appendLibraryText(current, value));
        } else if (googleCampaignType === "DISPLAY") {
          setGoogleDisplayDescriptions((current) => appendLibraryText(current, value));
        } else if (googleCampaignType === "DEMAND_GEN" && googleDemandGenFormat === "MULTI_ASSET") {
          setGoogleDisplayDescriptions((current) => appendLibraryText(current, value));
        } else if (googleCampaignType === "APP") {
          setGoogleAppDescriptions((current) => appendLibraryText(current, value));
        } else {
          setAssetNotice("This Google campaign format does not use a reusable description field here.");
          return;
        }
        appliedLabel = "Google description";
        break;
      }
      case "meta-primary-text": {
        if (!selectedPlatforms.includes("metaAds")) return;
        setMetaPrimaryText(parts.body || parts.raw);
        appliedLabel = "Meta primary text";
        break;
      }
      case "meta-headline": {
        if (!selectedPlatforms.includes("metaAds")) return;
        setMetaAdHeadline(parts.headline || parts.raw);
        appliedLabel = "Meta headline";
        break;
      }
      case "meta-description": {
        if (!selectedPlatforms.includes("metaAds")) return;
        setMetaAdDescription(parts.body || parts.raw);
        appliedLabel = "Meta description";
        break;
      }
      case "meta-cta": {
        if (!selectedPlatforms.includes("metaAds") || !parts.callToAction) return;
        setMetaCallToAction(parts.callToAction.replace(/\s+/g, "_").toUpperCase());
        appliedLabel = "Meta call to action";
        break;
      }
    }

    if (appliedLabel) {
      setAttachedCreativeAssetIds((current) =>
        current.includes(asset.id) ? current : [...current, asset.id],
      );
      setAssetNotice(`${asset.name} applied to ${appliedLabel}. Existing campaign text was preserved and duplicate lines were skipped.`);
    }
  };

  const filteredAssetLibrary = useMemo(() => {
    const query = assetLibrarySearch.trim().toLowerCase();
    return assetLibrary.filter((asset) => {
      const matchesType =
        assetLibraryFilter === "ALL" || asset.kind === assetLibraryFilter;
      if (!matchesType) return false;
      if (!query) return true;
      return [asset.name, asset.kind, asset.origin, asset.prompt, asset.textContent, asset.googlePack?.formatLabel]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [assetLibrary, assetLibraryFilter, assetLibrarySearch]);

  const applyGoogleCopyPack = (pack: GoogleCreativePack) => {
    if (!selectedPlatforms.includes("googleAds")) {
      setCreativeStudioNotice(
        "Select Google Ads in Campaign Basics before applying Google ad assets.",
      );
      return false;
    }
    if (
      pack.campaignType !== googleCampaignType ||
      (pack.campaignType === "DEMAND_GEN" &&
        pack.subFormat !== googleDemandGenFormat)
    ) {
      setCreativeStudioNotice(
        `This pack was created for Google ${pack.campaignType}${pack.subFormat ? ` / ${pack.subFormat}` : ""}. Match the current campaign type and ad format before reusing it.`,
      );
      return false;
    }

    const headlines = pack.headlines.join("\n");
    const descriptions = pack.descriptions.join("\n");
    if (googleCampaignType === "SEARCH") {
      setGoogleSearchHeadlines(headlines);
      setGoogleSearchDescriptions(descriptions);
    } else if (googleCampaignType === "PERFORMANCE_MAX") {
      setPmaxHeadlines(headlines);
      setPmaxLongHeadline(pack.longHeadlines[0] || "");
      setPmaxDescriptions(descriptions);
    } else if (googleCampaignType === "DISPLAY") {
      setGoogleDisplayHeadlines(pack.headlines.slice(0, 5).join("\n"));
      setGoogleDisplayLongHeadline(pack.longHeadlines[0] || "");
      setGoogleDisplayDescriptions(descriptions);
    } else if (googleCampaignType === "DEMAND_GEN") {
      if (googleDemandGenFormat === "MULTI_ASSET") {
        setGoogleDisplayHeadlines(pack.headlines.slice(0, 5).join("\n"));
        setGoogleDisplayDescriptions(descriptions);
      } else if (googleDemandGenFormat === "CAROUSEL" && pack.imageUrl) {
        setGoogleDemandGenCarouselCards(
          `${pack.headlines[0]} | ${pack.imageUrl} | ${pack.finalUrl}`,
        );
      }
    } else if (googleCampaignType === "APP") {
      setGoogleAppHeadlines(pack.headlines.slice(0, 5).join("\n"));
      setGoogleAppDescriptions(descriptions);
    }

    if (pack.businessName?.trim()) {
      if (googleCampaignType === "PERFORMANCE_MAX") {
        setPmaxBusinessName(pack.businessName.trim());
      } else if (googleCampaignType === "DISPLAY") {
        setGoogleDisplayBusinessName(pack.businessName.trim());
      }
    }

    return true;
  };

  const applyGoogleCreativeVariation = (variation: CreativeVariation) => {
    if (!variation.googlePack || !applyGoogleCopyPack(variation.googlePack))
      return;
    const ratio = variation.googleAspectRatio;
    let mediaNote = "";

    if (variation.kind === "IMAGE") {
      if (googleCampaignType === "PERFORMANCE_MAX") {
        if (ratio === "1.91:1")
          setPmaxLandscapeImageUrl(variation.googleMediaUrl);
        else if (ratio === "1:1")
          setPmaxSquareImageUrl(variation.googleMediaUrl);
        else if (ratio === "4:5")
          setPmaxPortraitImageUrl(variation.googleMediaUrl);
        else
          mediaNote =
            "The image ratio does not match a Performance Max image slot. Choose 1.91:1, 1:1 or 4:5; no automatic crop was created.";
      } else if (googleCampaignType === "DISPLAY") {
        if (ratio === "1:1")
          setGoogleDisplaySquareImageUrl(variation.googleMediaUrl);
        else if (ratio === "1.91:1" || ratio === "16:9")
          setGoogleDisplayImageUrl(variation.googleMediaUrl);
        else
          mediaNote =
            "Responsive Display uses landscape and square image slots. This image needs a compatible crop before it can be used.";
      } else if (googleCampaignType === "DEMAND_GEN") {
        if (googleDemandGenFormat === "CAROUSEL") {
          setGoogleDemandGenCarouselCards(
            `${variation.headline} | ${variation.googleMediaUrl} | ${variation.googlePack.finalUrl}`,
          );
        } else if (googleDemandGenFormat === "MULTI_ASSET") {
          if (ratio === "1:1")
            setGoogleDisplaySquareImageUrl(variation.googleMediaUrl);
          else if (ratio === "1.91:1" || ratio === "16:9")
            setGoogleDisplayImageUrl(variation.googleMediaUrl);
          else
            mediaNote =
              "Choose a square or landscape image for this Demand Gen multi-asset concept.";
        } else {
          mediaNote =
            "This Demand Gen format is not a social-post image slot. Choose a compatible image format or use the video/product-feed inputs.";
        }
      } else if (googleCampaignType === "APP") {
        setGoogleAppImageUrls((current) =>
          [
            variation.googleMediaUrl,
            ...current
              .split(/[\n,]+/)
              .map((value) => value.trim())
              .filter(Boolean),
          ]
            .filter((value, index, values) => values.indexOf(value) === index)
            .slice(0, 20)
            .join("\n"),
        );
      } else if (googleCampaignType === "SEARCH") {
        mediaNote =
          "Google Search Responsive Search Ads are text-based. The image was saved to the Asset Library but was not attached to the Search ad.";
      } else if (["SHOPPING", "HOTEL"].includes(googleCampaignType)) {
        mediaNote =
          googleCampaignType === "SHOPPING"
            ? "Shopping ad imagery comes from the linked Merchant Center product feed; this generic image was not attached to the feed."
            : "Hotel ads use eligible Hotel Center property/listing data; this social-style image was not attached to a Hotel ad.";
      }
    } else {
      mediaNote =
        ["PERFORMANCE_MAX", "DISPLAY", "APP"].includes(googleCampaignType) ||
          (googleCampaignType === "DEMAND_GEN" &&
            googleDemandGenFormat === "VIDEO_RESPONSIVE")
          ? "The video concept is only a demo reference. This Google format requires an uploaded / YouTube-hosted video asset ID; an example MP4 URL cannot be used as that ID."
          : googleCampaignType === "SEARCH"
            ? "Google Search Responsive Search Ads are text-based. This video was saved as a reusable library concept, not attached to the Search ad."
            : googleCampaignType === "SHOPPING"
              ? "Shopping product visuals come from the Merchant Center feed; this video concept was not attached to the product feed."
              : googleCampaignType === "HOTEL"
                ? "Hotel ads use Hotel Center property and price data; this video concept was not attached to the listing."
                : "This selected Google ad format does not take a standalone video post. Choose the video-responsive format and provide a hosted video ID if supported.";
    }

    const googleVisualCanMap =
      variation.kind === "IMAGE" &&
      ((googleCampaignType === "PERFORMANCE_MAX" &&
        ["1.91:1", "1:1", "4:5"].includes(ratio)) ||
        (googleCampaignType === "DISPLAY" &&
          ["1.91:1", "1:1", "16:9"].includes(ratio)) ||
        (googleCampaignType === "APP" &&
          ["1:1", "4:5", "9:16", "16:9"].includes(ratio)) ||
        (googleCampaignType === "DEMAND_GEN" &&
          ["MULTI_ASSET", "CAROUSEL"].includes(googleDemandGenFormat) &&
          ["1.91:1", "1:1", "4:5"].includes(ratio)));
    const googleCopyCanMap =
      ["SEARCH", "PERFORMANCE_MAX", "DISPLAY", "APP"].includes(
        googleCampaignType,
      ) ||
      (googleCampaignType === "DEMAND_GEN" &&
        ["MULTI_ASSET", "CAROUSEL"].includes(googleDemandGenFormat) &&
        variation.kind === "IMAGE");

    if (variation.kind === "IMAGE" && googleVisualCanMap) {
      const googleMediaAssetId = `${variation.id}-GOOGLE-MEDIA`;
      const googleMediaAsset: LibraryAsset = {
        id: googleMediaAssetId,
        name: `${variation.name} · Google ${googleCampaignType} · ${variation.googleAspectRatio}`,
        kind: "IMAGE",
        url: variation.googleMediaUrl,
        addedAt: new Date().toLocaleString(),
        origin: "AI_STUDIO",
        prompt: variation.prompt,
        aspectRatio: variation.googleAspectRatio,
        platformTargets: ["googleAds"],
      };
      setAssetLibrary((current) =>
        current.some((asset) => asset.id === googleMediaAssetId)
          ? current
          : [googleMediaAsset, ...current],
      );
      if (googleVisualCanMap) {
        setAttachedCreativeAssetIds((current) =>
          current.includes(googleMediaAssetId)
            ? current
            : [...current, googleMediaAssetId],
        );
      }
    }

    const copyAssetId = `${variation.id}-GOOGLE-COPY`;
    const copyAsset: LibraryAsset = {
      id: copyAssetId,
      name: `${variation.name} · Google ${variation.googlePack.formatLabel}`,
      kind: "TEXT",
      url: "",
      addedAt: new Date().toLocaleString(),
      origin: "AI_STUDIO",
      platformTargets: ["googleAds"],
      googlePack: variation.googlePack,
    };
    setAssetLibrary((current) =>
      current.some((asset) => asset.id === copyAssetId)
        ? current
        : [copyAsset, ...current],
    );
    if (googleCopyCanMap) {
      setAttachedCreativeAssetIds((current) =>
        current.includes(copyAssetId) ? current : [...current, copyAssetId],
      );
    }

    setCreativeStudioNotice(
      `${googleCopyCanMap ? `Google ${variation.googlePack.formatLabel} assets applied to the ${googleCampaignType} draft.` : `This ${variation.googlePack.formatLabel} concept was saved to the Asset Library; this format is driven by feed / listing data or a separately hosted video, so the demo text pack was not applied to campaign fields.`}${mediaNote ? ` ${mediaNote}` : ""}`,
    );
    setWorkspaceView("builder");
    markStepReached(4);
    clearPreview();
  };

  const generateCampaignCreatives = async () => {
    setAiCreativeError("");
    setAiCreativeNotice("");
    setCampaignAssetErrors([]);
    setCampaignGeneratedAssets([]);
    setGeneratedCapabilityCopies([]);
    setCreativeBrandIdentity(null);
    setCreativeVariations([]);
    setSelectedCreativeId(null);
    setAiCreativeMeta(null);

    const brief = aiCreativePrompt.trim();
    if (brief.length < 8) {
      setAiCreativeError("Enter a creative brief with at least 8 characters.");
      return;
    }
    if (brief.length > 2000) {
      setAiCreativeError("The creative brief must not exceed 2000 characters.");
      return;
    }
    if (selectedPlatforms.length === 0) {
      setAiCreativeError(
        "Select Google Ads, Meta Ads, or both in Campaign Basics first.",
      );
      return;
    }
    if (websiteUrl.trim()) {
      try {
        const parsed = new URL(websiteUrl.trim());
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch {
        setAiCreativeError(
          "Enter a valid HTTP or HTTPS website URL in Campaign Basics.",
        );
        return;
      }
    }

    try {
      setAiCreativeGenerating(true);
      const token = await getToken();
      if (!token)
        throw new Error("Unable to retrieve your authentication token.");

      const googleNeedsVisual =
        selectedPlatforms.includes("googleAds") &&
        !["SEARCH", "SHOPPING", "HOTEL"].includes(googleCampaignType) &&
        !(
          googleCampaignType === "DEMAND_GEN" &&
          ["VIDEO_RESPONSIVE", "PRODUCT_FEED"].includes(googleDemandGenFormat)
        );

      const contextualPrompt = [
        brief,
        `Business: ${businessName.trim() || "Advertiser"}`,
        `Product or service: ${description.trim() || "Use the exact product or service described in the creative brief"}`,
        `Campaign: ${campaignName.trim() || "Advertising campaign"}`,
        "The visual must directly represent the product or service described above. Do not introduce unrelated products, objects, industries, or stock-photo subjects.",
        "Create a polished commercial advertising image. Do not render text, logos, fake UI, watermarks, or unrelated objects inside the image.",
      ].join(". ");

      const creativeTargets: GenerateCreativeRequest["creativeTargets"] = [];
      const assetRequests: GenerateCreativeRequest["assetRequests"] = [];

      const addTarget = (
        capabilityId: string,
        platform: "googleAds" | "metaAds",
        campaignType: string,
        adFormat: string,
        providerObjective?: string,
      ) => {
        creativeTargets.push({
          capabilityId,
          platform,
          campaignType,
          adFormat,
          ...(providerObjective ? { providerObjective } : {}),
        });
      };

      const addImageRequest = (
        capabilityId: string,
        requirementId: string,
        requestedCount: number,
        aspectRatio: CreativeAspectRatio,
      ) => {
        assetRequests.push({
          capabilityId,
          requirementId,
          requestedCount,
          mediaType: "IMAGE",
          aspectRatio,
        });
      };

      // Capability targets are always sent so text-only requests still receive
      // copy that matches the selected ad format. Only media requests are gated
      // by text-only mode.
      if (selectedPlatforms.includes("googleAds")) {
        if (googleCampaignType === "SEARCH") {
          addTarget(
            "google-search-responsive-search",
            "googleAds",
            "SEARCH",
            "RESPONSIVE_SEARCH",
          );
        } else if (googleCampaignType === "DISPLAY") {
          const capabilityId = "google-display-responsive-display";
          addTarget(
            capabilityId,
            "googleAds",
            "DISPLAY",
            "RESPONSIVE_DISPLAY",
          );
          if (!aiCreativeTextOnly) {
            addImageRequest(
              capabilityId,
              "google-display-landscape-images",
              1,
              "1.91:1",
            );
            addImageRequest(
              capabilityId,
              "google-display-square-images",
              1,
              "1:1",
            );
          }
        } else if (googleCampaignType === "PERFORMANCE_MAX") {
          const capabilityId = "google-performance-max-asset-group";
          addTarget(
            capabilityId,
            "googleAds",
            "PERFORMANCE_MAX",
            "ASSET_GROUP",
          );
          if (!aiCreativeTextOnly) {
            addImageRequest(
              capabilityId,
              "google-pmax-landscape-images",
              1,
              "1.91:1",
            );
            addImageRequest(
              capabilityId,
              "google-pmax-square-images",
              1,
              "1:1",
            );
            addImageRequest(
              capabilityId,
              "google-pmax-portrait-images",
              1,
              "4:5",
            );
            if (aiCreativeGeneratePmaxLogoConcepts && businessName.trim()) {
              addImageRequest(
                capabilityId,
                "google-pmax-square-logo",
                1,
                "1:1",
              );
              addImageRequest(
                capabilityId,
                "google-pmax-landscape-logo",
                1,
                "4:1" as CreativeAspectRatio,
              );
            }
          }
        } else if (googleCampaignType === "DEMAND_GEN") {
          if (googleDemandGenFormat === "CAROUSEL") {
            const capabilityId = "google-demand-gen-carousel";
            addTarget(capabilityId, "googleAds", "DEMAND_GEN", "CAROUSEL");
            if (!aiCreativeTextOnly) {
              addImageRequest(
                capabilityId,
                "google-demand-gen-carousel-card-images",
                Math.max(2, aiCreativeVariationCount),
                "1:1",
              );
            }
          } else if (googleDemandGenFormat === "MULTI_ASSET") {
            const capabilityId = "google-demand-gen-single-image";
            addTarget(
              capabilityId,
              "googleAds",
              "DEMAND_GEN",
              "SINGLE_IMAGE",
            );
            if (!aiCreativeTextOnly) {
              addImageRequest(
                capabilityId,
                "google-demand-gen-landscape-images",
                1,
                "1.91:1",
              );
              addImageRequest(
                capabilityId,
                "google-demand-gen-square-images",
                1,
                "1:1",
              );
              addImageRequest(
                capabilityId,
                "google-demand-gen-portrait-images",
                1,
                "4:5",
              );
            }
          }
          // VIDEO_RESPONSIVE and PRODUCT_FEED remain copy-only/unmapped here.
        }
      }

      // Meta Ads: capability text is generated in both modes; images only in image mode.
      if (selectedPlatforms.includes("metaAds")) {
        const metaObjective = objective
          ? metaObjectiveMap[objective]
          : undefined;

        if (metaCreativeFormat === "SINGLE_IMAGE") {
          const capabilityId = "meta-single-image";
          const allowedMetaRatios: CreativeAspectRatio[] = [
            "1:1",
            "4:5",
            "1.91:1",
            "9:16",
          ];
          const ratio = allowedMetaRatios.includes(aiCreativeAspectRatio)
            ? aiCreativeAspectRatio
            : "1:1";

          addTarget(
            capabilityId,
            "metaAds",
            "OBJECTIVE_BASED",
            "SINGLE_IMAGE",
            metaObjective,
          );
          if (!aiCreativeTextOnly) {
            addImageRequest(
              capabilityId,
              "meta-single-primary-image",
              1,
              ratio,
            );
          }
        } else if (metaCreativeFormat === "CAROUSEL") {
          const capabilityId = "meta-carousel";
          const ratio: CreativeAspectRatio = ["1:1", "4:5"].includes(
            aiCreativeAspectRatio,
          )
            ? aiCreativeAspectRatio
            : "1:1";

          addTarget(
            capabilityId,
            "metaAds",
            "OBJECTIVE_BASED",
            "CAROUSEL",
            metaObjective,
          );
          if (!aiCreativeTextOnly) {
            addImageRequest(
              capabilityId,
              "meta-carousel-card-images",
              Math.max(2, aiCreativeVariationCount),
              ratio,
            );
          }
        }
        // SINGLE_VIDEO is intentionally excluded until a real video provider exists.
      }

      const requestBody: GenerateCreativeRequest = {
        prompt: contextualPrompt,
        creativeKind: "IMAGE",
        creativeStyle: aiCreativeStyle,
        aspectRatio: aiCreativeAspectRatio,
        googleAspectRatio: googleNeedsVisual
          ? googleCreativeAspectRatio
          : aiCreativeAspectRatio,
        campaignType: googleCampaignType,
        demandGenFormat: googleDemandGenFormat,
        platforms: selectedPlatforms.filter(
          (platform): platform is "googleAds" | "metaAds" =>
            platform === "googleAds" || platform === "metaAds",
        ),
        numberOfVariations: aiCreativeVariationCount,
        textOnly: aiCreativeTextOnly,
        brandContext: {
          businessName: businessName.trim() || undefined,
          productHint: description.trim() || undefined,
          websiteUrl: websiteUrl.trim() || undefined,
        },
        creativeTargets,
        assetRequests,
      };

      const response = await fetch(`${API_BASE_URL}/api/ai-creative/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(requestBody),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!payload || typeof payload !== "object") {
        throw new Error(
          `AI generation returned an invalid response (HTTP ${response.status}).`,
        );
      }
      if (!response.ok || payload.success !== true) {
        throw new Error(
          typeof payload.message === "string"
            ? payload.message
            : `AI generation failed (HTTP ${response.status}).`,
        );
      }

      const data = payload as GenerateCreativeResponse;
      if (!Array.isArray(data.variations)) {
        throw new Error(
          "AI generation returned an invalid variations collection.",
        );
      }
      if (!Array.isArray(data.generatedAssets)) {
        throw new Error(
          "AI generation returned an invalid campaign assets collection.",
        );
      }

      const validVariations = data.variations.filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.headline === "string" &&
          typeof item.primaryText === "string" &&
          typeof item.url === "string",
      );
      const validAssets = data.generatedAssets.filter(
        (asset) =>
          asset &&
          typeof asset.id === "string" &&
          typeof asset.capabilityId === "string" &&
          typeof asset.requirementId === "string" &&
          typeof asset.name === "string" &&
          asset.media &&
          typeof asset.media.url === "string" &&
          typeof asset.media.aspectRatio === "string",
      );

      const validCapabilityCopies = Array.isArray(data.generatedCapabilityCopies)
        ? data.generatedCapabilityCopies.filter(
          (item) =>
            item &&
            typeof item.capabilityId === "string" &&
            typeof item.platform === "string" &&
            Array.isArray(item.texts),
        )
        : [];

      if (
        validVariations.length === 0 &&
        validAssets.length === 0 &&
        validCapabilityCopies.length === 0
      ) {
        throw new Error(
          "AI generation completed without any creative variations, campaign assets, or capability-specific copy.",
        );
      }

      setCreativeVariations(validVariations);
      setSelectedCreativeId(validVariations[0]?.id ?? null);
      setCampaignGeneratedAssets(validAssets);
      setGeneratedCapabilityCopies(validCapabilityCopies);
      setCreativeBrandIdentity(data.brandIdentity ?? null);

      const assetErrors = Array.isArray(data.assetErrors)
        ? data.assetErrors
        : [];
      setCampaignAssetErrors(assetErrors);

      setAiCreativeMeta({
        model: data.model,
        imageProvider: data.imageProvider,
        generatedCount: data.generatedCount ?? validVariations.length,
        failedCount: data.failedCount ?? 0,
        requestedAssetCount:
          data.requestedAssetCount ??
          assetRequests.reduce(
            (total, request) => total + request.requestedCount,
            0,
          ),
        generatedAssetCount: data.generatedAssetCount ?? validAssets.length,
        failedAssetCount: data.failedAssetCount ?? assetErrors.length,
        generationId: data.generationId,
      });

      setAiCreativeNotice(
        data.message ||
        `Generated ${validVariations.length} creative variation(s) and ${validAssets.length} campaign asset(s).`,
      );

      const variationErrors = (
        Array.isArray(data.errors) ? data.errors : []
      ).map((item) =>
        item.variationIndex
          ? `Variation ${item.variationIndex}: ${item.message}`
          : item.message,
      );
      if (variationErrors.length > 0) {
        setAiCreativeError(variationErrors.join("\n"));
      }
    } catch (generationError) {
      setAiCreativeError(
        generationError instanceof Error
          ? generationError.message
          : "AI creative generation failed.",
      );
    } finally {
      setAiCreativeGenerating(false);
    }
  };

  const saveAndAttachCampaignGeneratedAsset = async (
    generatedAsset: GeneratedCreativeAsset,
  ) => {
    if (
      generatedAsset.role === "SQUARE_LOGO" ||
      generatedAsset.role === "LANDSCAPE_LOGO"
    ) {
      setAiCreativeError(
        "AI-generated logo concepts must be saved as drafts, not attached as approved campaign logos.",
      );
      return;
    }
    if (savedCampaignAssetIds[generatedAsset.id]) {
      setAssetNotice(
        "This generated image is already saved and attached to the campaign.",
      );
      setAssetLibraryOpen(true);
      return;
    }


    if (generatedAsset.media?.isPlaceholder || !generatedAsset.media?.url) {
      setAiCreativeError(
        "This generated image is a development placeholder or has no media URL, so it cannot be saved as a campaign asset.",
      );
      return;
    }

    const platform = generatedAsset.capabilityId.startsWith("google-")
      ? "googleAds"
      : generatedAsset.capabilityId.startsWith("meta-")
        ? "metaAds"
        : null;

    if (!platform) {
      setAiCreativeError(
        `Unsupported campaign capability: ${generatedAsset.capabilityId}.`,
      );
      return;
    }

    if (!selectedPlatforms.includes(platform)) {
      setAiCreativeError(
        `The generated asset targets ${platform === "googleAds" ? "Google Ads" : "Meta Ads"}, but that platform is not selected for this campaign.`,
      );
      return;
    }

    setSavingCampaignAssetIds((current) =>
      current.includes(generatedAsset.id)
        ? current
        : [...current, generatedAsset.id],
    );
    setAiCreativeError("");
    setAssetNotice("");

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Unable to retrieve your authentication token.");
      }

      const imageResponse = await fetch(generatedAsset.media.url, {
        cache: "no-store",
      });
      if (!imageResponse.ok) {
        throw new Error(
          `Unable to download generated image (${imageResponse.status}).`,
        );
      }

      const blob = await imageResponse.blob();
      const sourceMimeType = (
        blob.type ||
        generatedAsset.media.mimeType ||
        ""
      ).toLowerCase();
      if (!sourceMimeType.startsWith("image/") || blob.size === 0) {
        throw new Error("The generated output is not a valid image file.");
      }
      const normalizedImage = await normalizeImageBlobForGoogleAds(blob);
      const mimeType = normalizedImage.mimeType;
      const extension = normalizedImage.extension;

      const safeName =
        generatedAsset.name
          .replace(/[^a-z0-9-_]+/gi, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 110) || "campaign-ai-creative";
      const file = new File(
        [normalizedImage.blob],
        `${safeName}-${generatedAsset.assetIndex}.${extension}`,
        { type: mimeType },
      );
      const form = new FormData();
      form.append("file", file);
      form.append("name", generatedAsset.name.slice(0, 150));
      form.append("kind", "IMAGE");
      form.append("origin", "AI_STUDIO");
      form.append("prompt", generatedAsset.prompt || aiCreativePrompt);
      form.append("platformTargets", JSON.stringify([platform]));

      const uploadResponse = await fetch(`${API_BASE_URL}/api/assets/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        cache: "no-store",
      });
      const uploadPayload = await uploadResponse.json().catch(() => null);
      if (
        !uploadResponse.ok ||
        uploadPayload?.success === false ||
        typeof uploadPayload?.asset?.id !== "string"
      ) {
        throw new Error(
          uploadPayload?.message ||
          `Asset Library upload failed (HTTP ${uploadResponse.status}).`,
        );
      }

      const row = uploadPayload.asset;
      const savedAsset: LibraryAsset = {
        id: row.id,
        name: String(row.name || generatedAsset.name),
        kind: "IMAGE",
        // Private Asset Library media is referenced by asset ID/contentUrl,
        // never treated as a public Google/Meta media URL.
        url:
          typeof row.mediaUrl === "string"
            ? row.mediaUrl
            : typeof row.url === "string"
              ? row.url
              : "",
        addedAt: row.createdAt
          ? new Date(row.createdAt).toLocaleString()
          : new Date().toLocaleString(),
        origin: "AI_STUDIO",
        prompt: row.prompt || generatedAsset.prompt,
        aspectRatio: row.aspectRatio || generatedAsset.media.aspectRatio,
        platformTargets: Array.isArray(row.platformTargets)
          ? row.platformTargets
          : [platform],
        contentUrl: row.contentUrl || null,
        originalFileName: row.originalFileName || file.name,
        mimeType: row.mimeType || mimeType,
        sizeBytes: row.sizeBytes ?? normalizedImage.blob.size,
        width: row.width ?? normalizedImage.width,
        height: row.height ?? normalizedImage.height,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };

      const assignment: CampaignCreativeTargetReference = {
        generationId: generatedAsset.generationId,
        capabilityId: generatedAsset.capabilityId,
        requirementId: generatedAsset.requirementId,
        role: generatedAsset.role,
        assetIndex: generatedAsset.assetIndex,
        platform,
      };

      setAssetLibrary((current) => [
        savedAsset,
        ...current.filter((asset) => asset.id !== savedAsset.id),
      ]);
      setAttachedCreativeAssetIds((current) =>
        current.includes(savedAsset.id) ? current : [...current, savedAsset.id],
      );
      setSavedCampaignAssetIds((current) => ({
        ...current,
        [generatedAsset.id]: savedAsset.id,
      }));
      setCampaignAssetAssignments((current) => ({
        ...current,
        [savedAsset.id]: assignment,
      }));

      setAssetNotice(
        `${savedAsset.name} was saved to the Asset Library and attached to ${platform === "googleAds" ? "Google Ads" : "Meta Ads"} · ${generatedAsset.requirementId}.`,
      );
      setAiCreativeNotice(
        `Saved and attached ${generatedAsset.name} to the ${platform === "googleAds" ? "Google Ads" : "Meta Ads"} campaign requirement ${generatedAsset.requirementId}. The private media must still be uploaded to the provider before LIVE ad creation.`,
      );
    } catch (saveError) {
      setAiCreativeError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save the generated campaign asset.",
      );
    } finally {
      setSavingCampaignAssetIds((current) =>
        current.filter((id) => id !== generatedAsset.id),
      );
    }
  };

  const saveAndApplyCreativeVariation = async () => {
    const variation = creativeVariations.find(
      (item) => item.id === selectedCreativeId,
    );
    if (!variation) {
      setAiCreativeError("Select a generated creative first.");
      return;
    }
    if (selectedPlatforms.length === 0) {
      setAiCreativeError("Select at least one advertising platform first.");
      return;
    }

    setAiCreativeSaving(true);
    setAiCreativeError("");
    setAiCreativeNotice("");
    const token = await getToken();
    if (!token) {
      setAiCreativeSaving(false);
      setAiCreativeError("Unable to retrieve your authentication token.");
      return;
    }

    const saved: LibraryAsset[] = [];
    const errors: string[] = [];
    if (!aiCreativeTextOnly && variation.kind === "IMAGE" && variation.url) {
      try {
        if (
          variation.media?.isPlaceholder ||
          variation.url.includes("placehold.co")
        ) {
          throw new Error(
            "The generated image is a placeholder and was not saved as a campaign asset.",
          );
        }
        const imageResponse = await fetch(variation.url);
        if (!imageResponse.ok)
          throw new Error(
            `Unable to read generated image (${imageResponse.status}).`,
          );
        const blob = await imageResponse.blob();
        if (!blob.type.toLowerCase().startsWith("image/") || blob.size === 0) {
          throw new Error("AI output was not a valid image file.");
        }
        const extension = blob.type.toLowerCase().includes("webp")
          ? "webp"
          : blob.type.toLowerCase().includes("jpeg")
            ? "jpg"
            : "png";
        const safeName =
          variation.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") ||
          "ai-creative";
        const file = new File([blob], `${safeName}.${extension}`, {
          type: blob.type,
        });
        const form = new FormData();
        form.append("file", file);
        form.append("name", `${variation.name} · AI image`);
        form.append("kind", "IMAGE");
        form.append("origin", "AI_STUDIO");
        form.append("prompt", variation.prompt || aiCreativePrompt);
        form.append("platformTargets", JSON.stringify(selectedPlatforms));
        const uploadResponse = await fetch(
          `${API_BASE_URL}/api/assets/upload`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
            cache: "no-store",
          },
        );
        const uploadPayload = await uploadResponse.json().catch(() => null);
        if (
          !uploadResponse.ok ||
          uploadPayload?.success === false ||
          !uploadPayload?.asset?.id
        ) {
          throw new Error(
            uploadPayload?.message ||
            `Asset upload failed (HTTP ${uploadResponse.status}).`,
          );
        }
        const row = uploadPayload.asset;
        saved.push({
          id: String(row.id),
          name: String(row.name || `${variation.name} · AI image`),
          kind: "IMAGE",
          url:
            typeof row.mediaUrl === "string"
              ? row.mediaUrl
              : typeof row.url === "string"
                ? row.url
                : "",
          addedAt: row.createdAt
            ? new Date(row.createdAt).toLocaleString()
            : new Date().toLocaleString(),
          origin: "AI_STUDIO",
          prompt: row.prompt || variation.prompt,
          aspectRatio: row.aspectRatio || variation.aspectRatio,
          platformTargets: Array.isArray(row.platformTargets)
            ? row.platformTargets
            : selectedPlatforms,
          contentUrl: row.contentUrl || null,
          originalFileName: row.originalFileName || file.name,
          mimeType: row.mimeType || blob.type,
          sizeBytes: row.sizeBytes ?? blob.size,
          width: row.width ?? null,
          height: row.height ?? null,
        });
      } catch (mediaError) {
        errors.push(
          mediaError instanceof Error
            ? mediaError.message
            : "Unable to save generated image.",
        );
      }
    }

    const copyText = [
      variation.headline,
      variation.primaryText,
      `CTA: ${variation.callToAction}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    // /api/assets/text stores ad copy, not image binaries. The AI service
    // currently puts generated Base64 image data in googlePack.imageUrl and
    // googlePack.imageUrls. Keep only the compact text fields here; the image
    // has already been uploaded separately through /api/assets/upload.
    const sourceGooglePack = variation.googlePack;
    const googlePackForTextAsset = sourceGooglePack
      ? {
        campaignType: sourceGooglePack.campaignType,
        ...(sourceGooglePack.subFormat
          ? { subFormat: sourceGooglePack.subFormat }
          : {}),
        formatLabel: sourceGooglePack.formatLabel,
        headlines: [...sourceGooglePack.headlines],
        longHeadlines: [...sourceGooglePack.longHeadlines],
        descriptions: [...sourceGooglePack.descriptions],
        finalUrl: sourceGooglePack.finalUrl,
        ...(typeof sourceGooglePack.imageUrl === "string" &&
          /^https?:\/\//i.test(sourceGooglePack.imageUrl) &&
          sourceGooglePack.imageUrl.length <= 2048
          ? { imageUrl: sourceGooglePack.imageUrl }
          : {}),
      }
      : null;


    if (copyText.trim()) {
      try {
        const textResponse = await fetch(`${API_BASE_URL}/api/assets/text`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: `${variation.name} · AI copy`,
            textContent: copyText,
            origin: "AI_STUDIO",
            prompt: variation.prompt || aiCreativePrompt,
            platformTargets: selectedPlatforms,
            googlePack: googlePackForTextAsset
          }),
          cache: "no-store",
        });
        const textPayload = await textResponse.json().catch(() => null);
        if (
          !textResponse.ok ||
          textPayload?.success === false ||
          !textPayload?.asset?.id
        ) {
          throw new Error(
            textPayload?.message ||
            `Copy asset save failed (HTTP ${textResponse.status}).`,
          );
        }
        const row = textPayload.asset;
        saved.push({
          id: String(row.id),
          name: String(row.name || `${variation.name} · AI copy`),
          kind: "TEXT",
          url: "",
          addedAt: row.createdAt
            ? new Date(row.createdAt).toLocaleString()
            : new Date().toLocaleString(),
          origin: "AI_STUDIO",
          prompt: row.prompt || variation.prompt,
          platformTargets: Array.isArray(row.platformTargets)
            ? row.platformTargets
            : selectedPlatforms,
          googlePack: row.googlePack ?? googlePackForTextAsset ?? undefined,
          textContent: row.textContent ?? copyText,
        });
      } catch (copyError) {
        errors.push(
          copyError instanceof Error
            ? copyError.message
            : "Unable to save generated copy.",
        );
      }
    }
    setAiCreativeSaving(false);
    if (saved.length === 0) {
      setAiCreativeError(
        errors[0] || "No creative content could be saved to the Asset Library.",
      );
      return;
    }

    setAssetLibrary((current) => {
      const ids = new Set(saved.map((asset) => asset.id));
      return [...saved, ...current.filter((asset) => !ids.has(asset.id))];
    });
    setAttachedCreativeAssetIds((current) => [
      ...new Set([...current, ...saved.map((asset) => asset.id)]),
    ]);

    const googleCopyApplied =
      selectedPlatforms.includes("googleAds") && variation.googlePack
        ? applyGoogleCopyPack(variation.googlePack)
        : false;
    let metaCopyApplied = false;
    if (selectedPlatforms.includes("metaAds")) {
      const pack = variation.metaPack;
      setMetaPrimaryText(pack?.primaryTexts?.[0] || variation.primaryText);
      setMetaAdHeadline(pack?.headlines?.[0] || variation.headline);
      setMetaAdDescription(pack?.descriptions?.[0] || "");
      if (pack?.callToActionType || pack?.callToAction)
        setMetaCallToAction(pack.callToActionType || pack.callToAction);
      else if (variation.callToAction)
        setMetaCallToAction(variation.callToAction);
      if (pack?.format === "CAROUSEL" && pack.carouselCards?.length) {
        setMetaCreativeFormat("CAROUSEL");
        setMetaCarouselCards(
          pack.carouselCards
            .map(
              (card) =>
                `${card.headline} | ${card.imageUrl || ""} | ${card.destinationUrl || websiteUrl.trim()}`,
            )
            .join("\n"),
        );
      }
      metaCopyApplied = true;
    }
    const imageAsset = saved.find((asset) => asset.kind === "IMAGE");
    setCreativeVariations((current) =>
      current.map((item) =>
        item.id === variation.id
          ? {
            ...item,
            status: "SAVED",
            savedAssetId: imageAsset?.id || saved[0].id,
          }
          : item,
      ),
    );
    setAssetLibraryOpen(true);
    setAssetNotice(
      `${saved.length} AI asset(s) saved and attached to this campaign draft.`,
    );
    setAiCreativeNotice(
      `Saved ${saved.length} asset(s) to the Asset Library and attached them to this campaign. ${googleCopyApplied ? "Google ad copy was applied. " : ""}${metaCopyApplied ? "Meta ad copy was applied. " : ""}Private media still needs the provider-specific upload step before a live ad can use it.${errors.length ? ` Partial save: ${errors.join(" ")}` : ""}`,
    );
    clearPreview();
  };

  const copyPayload = async () => {
    try {
      await navigator.clipboard.writeText(preparedPayload);
      setCopyNotice("Request JSON copied.");
      setError("");
    } catch {
      setError("Unable to copy the request. Please copy it manually.");
    }
  };

  const inputClass =
    "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const labelClass = "text-sm font-semibold text-slate-700";
  const muiFieldSx = {
    mt: 1,
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px",
      backgroundColor: "#fff",
    },
    "& .MuiInputBase-input": { fontSize: "0.875rem" },
    "& .MuiInputLabel-root": { fontSize: "0.875rem" },
  };
  const selectedObjective = objectives.find((item) => item.value === objective);

  const filteredCampaignRecords = useMemo(() => {
    const query = campaignSearch.trim().toLowerCase();
    return campaignRecords.filter((record: any) => {
      const matchesQuery =
        !query ||
        [
          record.name,
          record.id,
          record.campaignType,
          record.objective,
          record.accountLabel,
        ].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(query),
        );
      const matchesPlatform =
        campaignPlatformFilter === "ALL" ||
        (campaignPlatformFilter === "GOOGLE" &&
          record.provider === "googleAds") ||
        (campaignPlatformFilter === "META" && record.provider === "metaAds") ||
        (campaignPlatformFilter === "BOTH" &&
          (record.provider === "both" ||
            campaignRecords.some(
              (candidate: any) =>
                candidate.groupId === record.groupId &&
                candidate.provider !== record.provider,
            )));
      const matchesStatus =
        campaignStatusFilter === "ALL" ||
        record.status === campaignStatusFilter;
      return matchesQuery && matchesPlatform && matchesStatus;
    });
  }, [
    campaignRecords,
    campaignSearch,
    campaignPlatformFilter,
    campaignStatusFilter,
  ]);

  const selectedCampaign =
    campaignRecords.find((record) => record.id === selectedCampaignId) ??
    campaignRecords[0] ??
    null;

  const campaignMetrics = useMemo(
    () => ({
      total: campaignRecords.filter((record) => record.status !== "ARCHIVED")
        .length,
      active: campaignRecords.filter((record) => record.status === "ACTIVE")
        .length,
      paused: campaignRecords.filter((record) => record.status === "PAUSED")
        .length,
      drafts: campaignRecords.filter((record) => record.status === "DRAFT")
        .length,
      attention: campaignRecords.filter((record) => record.status === "FAILED")
        .length,
    }),
    [campaignRecords],
  );

  return (
    <div className="flex flex-col p-2">
      <Paper
        elevation={0}
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, borderColor: "divider" }}
      >
        <div>
          <p className="text-sm font-semibold text-blue-600">
            Campaign Creation
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Unified Campaign Builder
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Create one campaign brief and configure Google Ads, Meta Ads, or
            both from the same workflow.
          </p>
          {/* <Alert
            severity="warning"
            sx={{ mt: 2, borderRadius: 2, alignItems: "flex-start" }}
          >
            <strong>Demo data is prefilled.</strong> Sample names, budgets,
            copy, URLs and placeholder IDs are included to help you explore
            every form section. Replace all sample IDs, assets, targeting values
            and account-specific settings with real values before using any
            provider payload. This prototype prepares a request preview and does
            not send campaign mutations.
          </Alert> */}
        </div>
      </Paper>

      {
        <div className="mt-8  pb-2">
          <Stepper
            activeStep={step - 1}
            nonLinear
            alternativeLabel
            sx={{
              minWidth: { xs: 680, sm: "100%" },
              "& .MuiStepLabel-label": {
                mt: 1,
                fontSize: { xs: "0.7rem", sm: "0.8rem" },
                fontWeight: 600,
                whiteSpace: "normal",
              },
              "& .MuiStepIcon-root.Mui-active": { color: "primary.main" },
              "& .MuiStepIcon-root.Mui-completed": { color: "success.main" },
              "& .MuiStepConnector-line": { borderTopWidth: 2 },
            }}
          >
            {[
              { number: 1, label: "Campaign Basics" },
              { number: 2, label: "Platform Settings" },
              { number: 3, label: "Ad Groups / Ad Sets" },
              { number: 4, label: "Ad Creation & Assets" },
              { number: 5, label: "Review & Create" },
            ].map((item) => (
              <Step key={item.number} completed={item.number < furthestStep}>
                <StepButton
                  onClick={() => handleStepClick(item.number)}
                  disabled={item.number > furthestStep}
                  aria-label={`Open ${item.label}`}
                >
                  {item.label}
                </StepButton>
              </Step>
            ))}
          </Stepper>
          <p className="mt-3 text-center text-xs text-slate-500">
            Click a completed step to jump back and edit it. Use Continue to
            unlock the next step after validation.
          </p>
        </div>
      }

      {loadingConnections && (
        <Alert
          severity="info"
          icon={<CircularProgress size={18} />}
          sx={{ mt: 3, borderRadius: 2, alignItems: "center" }}
        >
          Loading your advertising accounts...
        </Alert>
      )}

      {connectionError && (
        <Alert severity="error" sx={{ mt: 3, borderRadius: 2 }}>
          {connectionError}
          <div className="mt-2">
            <Link
              href="/dashboard/provider"
              className="font-semibold underline"
            >
              Manage account connections
            </Link>
          </div>
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 3, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {step === 1 && (
        <section className="mt-8 space-y-7">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-bold">1. Choose where to advertise</h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose one platform or select Both to prepare campaigns for Google
              and Meta together.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {(
                [
                  {
                    mode: "googleAds",
                    title: "Google Ads",
                    description:
                      "Search, Display, Demand Gen, Performance Max, Shopping, Hotel and App",
                    ready: googleReady,
                    connection: connections.googleAds,
                  },
                  {
                    mode: "metaAds",
                    title: "Meta Ads",
                    description: "Facebook and Instagram",
                    ready: metaReady,
                    connection: connections.metaAds,
                  },
                  {
                    mode: "both",
                    title: "Both Platforms",
                    description: "One brief, separate provider settings",
                    ready: bothReady,
                    connection: [],
                  },
                ] as const
              ).map((option) => {
                const active = platformMode === option.mode;
                return (
                  <button
                    key={option.mode}
                    type="button"
                    disabled={!option.ready || loadingConnections}
                    onClick={() => choosePlatformMode(option.mode)}
                    className={`rounded-xl border p-4 text-left transition ${active
                      ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                      : "border-slate-200 hover:border-blue-300"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">
                        {option.title}
                      </span>
                      <Chip
                        size="small"
                        color={
                          active
                            ? "primary"
                            : option.ready
                              ? "success"
                              : "default"
                        }
                        variant={active ? "filled" : "outlined"}
                        label={
                          active
                            ? "Selected"
                            : option.ready
                              ? "Connected"
                              : "Unavailable"
                        }
                        sx={{ height: 24, fontSize: "0.7rem", fontWeight: 700 }}
                      />
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {option.description}
                    </p>
                    {option.mode !== "both" ? (
                      <>
                        <p className="mt-1 break-words text-xs text-slate-500">
                          {option.ready
                            ? selectedAccountLabel(option.connection)
                            : "Connect and select an account first."}
                        </p>
                        {option.ready && (
                          <p className="mt-1 text-xs text-slate-500">
                            Currency: {selectedCurrency(option.connection)}
                          </p>
                        )}
                      </>
                    ) : (
                      <></>
                    )}
                  </button>
                );
              })}
            </div>

            {/* <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    key: "googleAds",
                    title: "Google Ads",
                    ready: googleReady,
                    ,
                  },
                  {
                    key: "metaAds",
                    title: "Meta Ads",
                    ready: metaReady,
                    
                  },
                ] as const
              ).map((platform) => (
                <div
                  key={platform.key}
                  className="rounded-xl bg-slate-50 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">
                      {platform.title}
                    </span>
                    <span
                      className={
                        platform.ready ? "text-green-700" : "text-slate-500"
                      }
                    >
                      {platform.ready ? "Account ready" : "Account not ready"}
                    </span>
                  </div>
                  
                </div>
              ))}
            </div> */}

            {!loadingConnections && (
              <Link
                href="/dashboard/provider"
                className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:text-blue-800"
              >
                Manage advertising accounts →
              </Link>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-bold">2. Shared campaign brief</h2>
            <p className="mt-1 text-sm text-slate-500">
              These details are reused across the platforms you selected.
            </p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <TextField
                  label="Business Name *"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. ABC Technologies"
                  size="small"
                  fullWidth
                  sx={muiFieldSx}
                />
              </div>
              <div>
                <TextField
                  label="Campaign Name *"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. October Product Launch"
                  size="small"
                  fullWidth
                  sx={muiFieldSx}
                />
              </div>
              <div className="sm:col-span-2">
                <TextField
                  type="url"
                  label="Website URL"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://www.example.com"
                  size="small"
                  fullWidth
                  sx={muiFieldSx}
                />
              </div>
              <div className="sm:col-span-2">
                <TextField
                  label="Campaign Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your product, offer or campaign..."
                  multiline
                  minRows={3}
                  size="small"
                  fullWidth
                  sx={muiFieldSx}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-bold">
              3. What is your campaign objective?
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose the business outcome. The selected objective is mapped to
              each provider's own campaign model.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {objectives.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setObjective(item.value);
                    setGoogleMarketingObjective(
                      googleObjectiveFromShared[item.value],
                    );
                    clearPreview();
                  }}
                  className={`rounded-xl border p-4 text-left transition ${objective === item.value ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-300"}`}
                >
                  <span className="block text-sm font-bold">{item.label}</span>
                  <span className="mt-2 block text-xs leading-5 text-slate-500">
                    {item.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="mt-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold">Provider-specific settings</h2>
            <p className="mt-1 text-sm text-slate-500">
              Each platform has its own campaign structure, bidding and budget
              configuration.
            </p>
          </div>

          {selectedPlatforms.includes("googleAds") && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl font-bold text-blue-700">
                  G
                </div>
                <div>
                  <h3 className="font-bold">Google Ads</h3>
                  <p className="text-xs text-slate-500">
                    {selectedAccountLabel(connections.googleAds)} ·{" "}
                    {selectedCurrency(connections.googleAds)}
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>
                    Google Marketing Objective *
                  </label>
                  <select
                    value={googleMarketingObjective}
                    onChange={(e) => {
                      setGoogleMarketingObjective(
                        e.target.value as GoogleMarketingObjective,
                      );
                      clearPreview();
                    }}
                    className={inputClass}
                  >
                    {googleMarketingObjectiveOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-500">
                    This is a builder-level goal preset used to guide campaign
                    setup; Google Ads does not have one universal campaign
                    objective field.
                  </p>
                  {googleMarketingObjective === "LOCAL_STORES_VISITS" && (
                    <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                      Local store goals require an eligible Performance Max
                      setup, linked location assets and suitable store
                      conversion goals.
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>
                    EU Political Advertising Declaration *
                  </label>
                  <select
                    value={googleEuPoliticalStatus}
                    onChange={(e) => {
                      setGoogleEuPoliticalStatus(
                        e.target.value as GoogleEuPoliticalStatus,
                      );
                      clearPreview();
                    }}
                    className={inputClass}
                  >
                    <option value="">Select a declaration</option>
                    <option value="DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING">
                      Does not contain EU political advertising
                    </option>
                    <option value="CONTAINS_EU_POLITICAL_ADVERTISING">
                      Contains EU political advertising
                    </option>
                  </select>
                  <p className="mt-2 text-xs text-slate-500">
                    Google Ads API v26 requires this declaration when creating a
                    campaign. Select the answer that accurately describes the
                    campaign.
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Google Campaign Type *</label>
                  <select
                    value={googleCampaignType}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      const nextGoals =
                        googlePerformanceGoalsByType[nextType] ||
                        googlePerformanceGoalsByType.SEARCH;
                      setGoogleCampaignType(nextType);
                      setGoogleCreativeAspectRatio(
                        ["PERFORMANCE_MAX", "DISPLAY"].includes(nextType)
                          ? "1.91:1"
                          : "1:1",
                      );
                      if (
                        ![
                          "SEARCH",
                          "PERFORMANCE_MAX",
                          "DEMAND_GEN",
                          "SHOPPING",
                        ].includes(nextType)
                      )
                        setGoogleBudgetMode("DAILY");
                      if (!["SEARCH", "SHOPPING"].includes(nextType))
                        setGoogleBiddingScope("STANDARD");
                      if (
                        !nextGoals.some(
                          (item) => item.value === googlePerformanceGoal,
                        )
                      ) {
                        setGooglePerformanceGoal(nextGoals[0].value);
                      }
                      if (nextType !== "SEARCH" && nextType !== "DISPLAY") {
                        setGoogleBiddingMode("AUTOMATED");
                      }
                      clearPreview();
                    }}
                    className={inputClass}
                  >
                    {googleCampaignTypes.map((item) => (
                      <option
                        key={item.value}
                        value={item.value}
                        disabled={Boolean(item.disabled)}
                      >
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                {googleCampaignType !== "APP" &&
                  googleCampaignType !== "HOTEL" && (
                    <div>
                      <label className={labelClass}>Performance Goal *</label>
                      <select
                        value={effectiveGooglePerformanceGoal}
                        onChange={(e) => {
                          setGooglePerformanceGoal(
                            e.target.value as GooglePerformanceGoal,
                          );
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        {availableGooglePerformanceGoals.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs text-slate-500">
                        A builder-level goal mapped to a valid Google bidding
                        scheme. Google Ads has no universal
                        campaign.performance_goal field.
                      </p>
                      {selectedGooglePerformanceConfig && (
                        <p className="mt-1 text-xs font-medium text-slate-600">
                          Recommended API bidding strategy:{" "}
                          {effectiveGoogleBiddingStrategy}
                        </p>
                      )}
                    </div>
                  )}

                {(googleCampaignType === "SEARCH" ||
                  googleCampaignType === "DISPLAY") && (
                    <div>
                      <label className={labelClass}>Bidding Method *</label>
                      <select
                        value={effectiveGoogleBiddingMode}
                        onChange={(e) => {
                          const nextMode = e.target.value as GoogleBiddingMode;
                          setGoogleBiddingMode(nextMode);
                          if (nextMode !== "AUTOMATED")
                            setGoogleBiddingScope("STANDARD");
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        <option value="AUTOMATED">
                          Automated (based on Performance Goal)
                        </option>
                        <option value="MANUAL_CPC">Manual CPC</option>
                        {googleCampaignType === "DISPLAY" && (
                          <option value="MANUAL_CPM">Manual CPM</option>
                        )}
                      </select>
                      <p className="mt-2 text-xs text-slate-500">
                        Manual CPC/CPM uses an Ad Group-level bid in the Google
                        Ads API. Manual CPM is only shown for Display. Manual CPV
                        is not offered because new Video campaign creation is not
                        supported through this API workflow.
                      </p>
                    </div>
                  )}
                {googlePortfolioStrategyEligible &&
                  effectiveGoogleBiddingMode === "AUTOMATED" && (
                    <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4">
                      <label className={labelClass}>
                        Google Bidding Strategy Scope *
                      </label>
                      <select
                        value={effectiveGoogleBiddingScope}
                        onChange={(e) => {
                          setGoogleBiddingScope(
                            e.target.value as GoogleBiddingScope,
                          );
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        <option value="STANDARD">
                          Standard strategy (configured on this Campaign)
                        </option>
                        <option value="PORTFOLIO">
                          Use an existing portfolio strategy
                        </option>
                      </select>
                      {effectiveGoogleBiddingScope === "PORTFOLIO" ? (
                        <div className="mt-3">
                          <label className={labelClass}>
                            Portfolio Bidding Strategy Resource Name *
                          </label>
                          <Autocomplete
                            options={googlePortfolioStrategyOptions}
                            value={googlePortfolioStrategyOptions.find((option) => getGoogleLookupResourceName(option) === googlePortfolioStrategyResourceName) ?? null}
                            loading={googlePortfolioStrategyLoading}
                            getOptionLabel={(option) => `${getGoogleLookupLabel(option)}${option.type ? ` · ${option.type}` : ""}`}
                            isOptionEqualToValue={(option, value) => getGoogleLookupResourceName(option) === getGoogleLookupResourceName(value)}
                            onChange={(_, option) => {
                              setGooglePortfolioStrategyResourceName(option ? getGoogleLookupResourceName(option) : "");
                              clearPreview();
                            }}
                            renderInput={(params) => <TextField {...params} size="small" placeholder="Search account portfolio strategies" />}
                          />
                          {googlePortfolioStrategyLoading && <p className="mt-2 text-xs text-slate-500">Loading portfolio strategies for the selected Google account...</p>}
                          {googlePortfolioStrategyError && <p className="mt-2 text-xs text-red-600">{googlePortfolioStrategyError}</p>}
                          {!googlePortfolioStrategyLoading && !googlePortfolioStrategyError && googlePortfolioStrategyOptions.length === 0 && <p className="mt-2 text-xs text-slate-500">No eligible portfolio strategies were returned for this account.</p>}
                          <p className="mt-2 text-xs text-slate-500">
                            The referenced portfolio strategy must already exist
                            in this Google Ads customer. The backend must verify
                            its bidding scheme and campaign-type compatibility
                            before linking Campaign.bidding_strategy.
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">
                          Standard strategies are sent through the Campaign
                          campaign_bidding_strategy union. Portfolio strategies
                          are separate BiddingStrategy resources and are
                          referenced by resource name.
                        </p>
                      )}
                    </div>
                  )}

                {["SEARCH", "PERFORMANCE_MAX"].includes(googleCampaignType) &&
                  effectiveGooglePerformanceGoal === "CONVERSIONS" &&
                  effectiveGoogleBiddingMode === "AUTOMATED" && (
                    <div>
                      <label className={labelClass}>
                        Optional Target CPA (
                        {selectedCurrency(connections.googleAds)})
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={googleTargetCpa}
                        onChange={(e) => {
                          setGoogleTargetCpa(e.target.value);
                          clearPreview();
                        }}
                        placeholder="Leave blank to maximize conversions"
                        className={inputClass}
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        Available for Search and Performance Max. The backend
                        maps this to the optional target CPA on Maximize
                        Conversions.
                      </p>
                    </div>
                  )}
                {effectiveGooglePerformanceGoal === "CONVERSION_VALUE" &&
                  googleCampaignType !== "APP" &&
                  googleCampaignType !== "HOTEL" &&
                  effectiveGoogleBiddingMode === "AUTOMATED" && (
                    <div>
                      <label className={labelClass}>Optional Target ROAS</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.1"
                        value={googleTargetRoas}
                        onChange={(e) => {
                          setGoogleTargetRoas(e.target.value);
                          clearPreview();
                        }}
                        placeholder="e.g. 3.0 = 300%"
                        className={inputClass}
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        Enter a ratio (3.0 means 300%). The backend passes this
                        as the target ROAS parameter.
                      </p>
                    </div>
                  )}
                {effectiveGooglePerformanceGoal === "IMPRESSION_SHARE" &&
                  googleCampaignType === "SEARCH" &&
                  effectiveGoogleBiddingMode === "AUTOMATED" && (
                    <>
                      <div>
                        <label className={labelClass}>
                          Target Search Placement
                        </label>
                        <select
                          value={googleImpressionShareLocation}
                          onChange={(e) => {
                            setGoogleImpressionShareLocation(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        >
                          <option value="ANYWHERE_ON_PAGE">
                            Anywhere on results page
                          </option>
                          <option value="TOP_OF_PAGE">
                            Top of results page
                          </option>
                          <option value="ABSOLUTE_TOP_OF_PAGE">
                            Absolute top of results page
                          </option>
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>
                          Target Impression Share (%)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={googleImpressionSharePercent}
                          onChange={(e) => {
                            setGoogleImpressionSharePercent(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Maximum CPC Bid Ceiling (
                          {selectedCurrency(connections.googleAds)})
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={googleImpressionShareMaxCpc}
                          onChange={(e) => {
                            setGoogleImpressionShareMaxCpc(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                    </>
                  )}

                {googleCampaignType === "SHOPPING" && (
                  <>
                    <div>
                      <label className={labelClass}>
                        Merchant Center Account ID *
                      </label>
                      <input
                        inputMode="numeric"
                        value={googleMerchantCenterId}
                        onChange={(e) => {
                          setGoogleMerchantCenterId(e.target.value);
                          clearPreview();
                        }}
                        placeholder="Linked Merchant Center account ID"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Shopping Campaign Priority *
                      </label>
                      <select
                        value={googleShoppingPriority}
                        onChange={(e) => {
                          setGoogleShoppingPriority(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        <option value="0">Low (0)</option>
                        <option value="1">Medium (1)</option>
                        <option value="2">High (2)</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>
                        Feed Label (optional)
                      </label>
                      <input
                        value={googleShoppingFeedLabel}
                        onChange={(e) => {
                          setGoogleShoppingFeedLabel(e.target.value);
                          clearPreview();
                        }}
                        placeholder="IN"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Product Listing Group
                      </label>
                      <select
                        value={googleShoppingProductGroupType}
                        onChange={(e) => {
                          setGoogleShoppingProductGroupType(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        <option value="ALL_PRODUCTS">All products</option>
                        <option value="BRAND">Brand</option>
                        <option value="PRODUCT_TYPE">Product type</option>
                        <option value="CUSTOM_LABEL_0">Custom label 0</option>
                        <option value="ITEM_ID">Item ID</option>
                      </select>
                    </div>
                    {googleShoppingProductGroupType !== "ALL_PRODUCTS" && (
                      <div>
                        <label className={labelClass}>
                          Product group value *
                        </label>
                        <input
                          value={googleShoppingProductGroupValue}
                          onChange={(e) => {
                            setGoogleShoppingProductGroupValue(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                    )}
                    <p className="sm:col-span-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                      Standard Shopping requires a linked Merchant Center
                      account and shopping_setting. The API adapter must create
                      the product listing-group tree under the Ad Group. Smart
                      Shopping is not offered; use Performance Max instead.
                    </p>
                  </>
                )}

                {googleCampaignType === "DEMAND_GEN" && (
                  <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-800">
                      Demand Gen channel controls
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      These controls belong to the Ad Group, not
                      campaign.network_settings.
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {(
                        [
                          ["youtube_in_feed", "YouTube In-Feed"],
                          ["youtube_in_stream", "YouTube In-Stream"],
                          ["youtube_shorts", "YouTube Shorts"],
                          ["discover", "Discover"],
                          ["gmail", "Gmail"],
                          ["display", "Display"],
                          ["maps", "Maps"],
                        ] as const
                      ).map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 text-sm text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={demandGenChannels[key]}
                            onChange={(e) => {
                              setDemandGenChannels((current) => ({
                                ...current,
                                [key]: e.target.checked,
                              }));
                              clearPreview();
                            }}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {googleCampaignType === "HOTEL" && (
                  <>
                    <div>
                      <label className={labelClass}>
                        Hotel Center Account ID *
                      </label>
                      <input
                        inputMode="numeric"
                        value={googleHotelCenterId}
                        onChange={(e) => {
                          setGoogleHotelCenterId(e.target.value);
                          clearPreview();
                        }}
                        placeholder="Linked Hotel Center account ID"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Hotel Bidding Strategy *
                      </label>
                      <select
                        value={googleHotelBidStrategy}
                        onChange={(e) => {
                          setGoogleHotelBidStrategy(
                            e.target.value as GoogleHotelBidStrategy,
                          );
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        <option value="PERCENT_CPC">Percent CPC</option>
                        <option value="MANUAL_CPC">Manual CPC</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>
                        CPC Bid Ceiling (
                        {selectedCurrency(connections.googleAds)}) *
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={googleHotelBidCeiling}
                        onChange={(e) => {
                          setGoogleHotelBidCeiling(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <p className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                      Hotel campaigns require a linked Hotel Center account.
                      Google documents Manual CPC and Percent CPC for Hotel
                      campaigns; the backend must create the corresponding hotel
                      setting and bidding scheme.
                    </p>
                  </>
                )}

                {googleCampaignType === "APP" && (
                  <>
                    <div>
                      <label className={labelClass}>
                        App Campaign Subtype *
                      </label>
                      <select
                        value={googleAppSubtype}
                        onChange={(e) => {
                          const next = e.target.value as GoogleAppSubtype;
                          setGoogleAppSubtype(next);
                          const first = googleAppGoalOptionsBySubtype[next][0];
                          setGoogleAppGoalType(first.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        {googleAppSubtypeOptions.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>App Store *</label>
                      <select
                        value={googleAppStore}
                        onChange={(e) => {
                          setGoogleAppStore(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        <option value="GOOGLE_APP_STORE">Google Play</option>
                        <option value="APPLE_APP_STORE">Apple App Store</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>
                        App ID / Package Name *
                      </label>
                      <input
                        value={googleAppId}
                        onChange={(e) => {
                          setGoogleAppId(e.target.value);
                          clearPreview();
                        }}
                        placeholder="com.example.app or App Store ID"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        App Performance Goal *
                      </label>
                      <select
                        value={effectiveGoogleAppGoal}
                        onChange={(e) => {
                          setGoogleAppGoalType(
                            e.target.value as GoogleAppGoalType,
                          );
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        {availableGoogleAppGoals.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedGoogleAppGoal.targetKind === "CPA" && (
                      <div>
                        <label className={labelClass}>
                          Target CPA / CPI (
                          {selectedCurrency(connections.googleAds)}) *
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={googleAppTargetCost}
                          onChange={(e) => {
                            setGoogleAppTargetCost(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                    )}
                    {selectedGoogleAppGoal.targetKind === "ROAS" && (
                      <div>
                        <label className={labelClass}>Target ROAS *</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.1"
                          value={googleAppTargetRoas}
                          onChange={(e) => {
                            setGoogleAppTargetRoas(e.target.value);
                            clearPreview();
                          }}
                          placeholder="e.g. 3.0 = 300%"
                          className={inputClass}
                        />
                      </div>
                    )}
                    <p className="sm:col-span-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                      Google App campaigns use advertising_channel_type
                      MULTI_CHANNEL plus a subtype. App engagement requires an
                      eligible Audience criterion containing an app-user
                      segment. The API maps each subtype to its own App Ad
                      resource; verify app-store/subtype availability before
                      creation.
                    </p>
                  </>
                )}
                <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-800">
                    Campaign schedule & targeting
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>
                        Start Date{" "}
                        {effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                          ? "*"
                          : "(optional)"}
                      </label>
                      <input
                        type="date"
                        value={googleStartDate}
                        onChange={(e) => {
                          setGoogleStartDate(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        End Date{" "}
                        {effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                          ? "*"
                          : "(optional)"}
                      </label>
                      <input
                        type="date"
                        value={googleEndDate}
                        onChange={(e) => {
                          setGoogleEndDate(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>

                    <Stack spacing={3} className="col-span-2" sx={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
                      {/* LOCATIONS */}
                      <Box sx={{ flex: 1 }}>
                        <Typography
                          variant="subtitle2"
                          fontWeight={600}
                          sx={{ mb: 1 }}
                        >
                          Locations
                        </Typography>

                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1}
                          alignItems={{ xs: "stretch", sm: "flex-start" }}
                        ><TextField
                            fullWidth
                            size="small"
                            value={googleLocationQuery}
                            onChange={(e) => setGoogleLocationQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void handleGoogleLocationSearch();
                              }
                            }}
                            placeholder="Search city, state or country"
                            InputProps={{
                              endAdornment: (
                                <InputAdornment position="end">
                                  <IconButton
                                    onClick={() => void handleGoogleLocationSearch()}
                                    disabled={googleLocationLoading}
                                    edge="end"
                                    aria-label="Search locations"
                                    size="small"
                                  >
                                    {googleLocationLoading ? (
                                      <CircularProgress size={19} />
                                    ) : (
                                      <SearchIcon />
                                    )}
                                  </IconButton>
                                </InputAdornment>
                              ),
                            }}
                            sx={{
                              "& .MuiOutlinedInput-root": {
                                borderRadius: 2,
                                backgroundColor: "background.paper",
                              },
                            }}
                          />
                        </Stack>

                        {googleLocationError && (
                          <Typography
                            color="error"
                            variant="caption"
                            sx={{ display: "block", mt: 1 }}
                          >
                            {googleLocationError}
                          </Typography>
                        )}


                        <ClickAwayListener
                          onClickAway={() =>
                            setGoogleLocationOptionsOpen(false)
                          }
                        >
                          <Box>
                            <Collapse
                              in={
                                googleLocationOptionsOpen &&
                                googleLocationOptions.length > 0
                              }
                            >
                              <Paper
                                variant="outlined"
                                sx={{
                                  mt: 1.5,
                                  p: 1,
                                  maxHeight: 220,
                                  overflowY: "auto",
                                  borderRadius: 2,
                                  borderColor: "divider",
                                }}
                              >
                                <Stack spacing={0.5}>
                                  {googleLocationOptions.map((option) => {
                                    const resourceName =
                                      getGoogleLookupResourceName(
                                        option,
                                        "geoTargetConstants",
                                      );

                                    if (!resourceName) return null;

                                    const selected =
                                      geoResources.includes(resourceName);

                                    return (
                                      <Box
                                        component="label"
                                        key={resourceName}
                                        sx={{
                                          display: "flex",
                                          alignItems: "flex-start",
                                          gap: 1,
                                          p: 1,
                                          width: "100%",
                                          minWidth: 0,
                                          borderRadius: 1.5,
                                          cursor: "pointer",
                                          bgcolor: selected
                                            ? "action.selected"
                                            : "transparent",
                                          "&:hover": {
                                            bgcolor: "action.hover",
                                          },
                                        }}
                                      >
                                        <Checkbox
                                          size="small"
                                          checked={selected}
                                          onChange={(e) => {
                                            setGoogleGeoTargetResources(
                                              (current) =>
                                                toggleGoogleResourceName(
                                                  current,
                                                  resourceName,
                                                  e.target.checked,
                                                ),
                                            );
                                            clearPreview();
                                          }}
                                          sx={{ p: 0.5, mt: 0.1 }}
                                        />

                                        <Box sx={{ minWidth: 0, flex: 1 }}>
                                          <Typography
                                            variant="body2"
                                            fontWeight={500}
                                          >
                                            {getGoogleLookupLabel(option)}
                                          </Typography>

                                          <Typography
                                            variant="caption"
                                            color="text.secondary"
                                            sx={{
                                              display: "block",
                                              overflowWrap: "anywhere",
                                            }}
                                          >
                                            {resourceName}
                                          </Typography>
                                        </Box>
                                      </Box>
                                    );
                                  })}
                                </Stack>

                                <Box
                                  sx={{
                                    display: "flex",
                                    justifyContent: "flex-end",
                                    mt: 1,
                                    pt: 1,
                                    borderTop: 1,
                                    borderColor: "divider",
                                  }}
                                >
                                  <Button
                                    size="small"
                                    variant="contained"
                                    onClick={() =>
                                      setGoogleLocationOptionsOpen(false)
                                    }
                                    sx={{
                                      textTransform: "none",
                                      borderRadius: 1.5,
                                    }}
                                  >
                                    Done
                                  </Button>
                                </Box>
                              </Paper>
                            </Collapse>

                            <Stack
                              direction="row"
                              alignItems="center"
                              justifyContent="space-between"
                              sx={{ mt: 1.5 }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Select the locations where your ads should
                                appear.
                              </Typography>

                              <Chip
                                size="small"
                                variant="outlined"
                                color="primary"
                                label={`${geoResources.length} selected`}
                              />
                            </Stack>
                          </Box>
                        </ClickAwayListener>
                      </Box>

                      <Box sx={{ flex: 1 }}>
                        <Typography
                          variant="subtitle2"
                          fontWeight={600}
                          sx={{ mb: 1 }}
                        >
                          Languages
                        </Typography>

                        <Autocomplete
                          multiple
                          openOnFocus
                          disableCloseOnSelect
                          options={googleLanguageOptions}
                          loading={googleLanguageLoading}
                          value={googleLanguageOptions.filter((option) => {
                            const resourceName = getGoogleLookupResourceName(
                              option,
                              "languageConstants",
                            );

                            return (
                              !!resourceName &&
                              languageResources.includes(resourceName)
                            );
                          })}
                          inputValue={googleLanguageSearch}
                          onInputChange={(_, value) => {
                            setGoogleLanguageSearch(value);
                          }}
                          onChange={(_, selectedOptions) => {
                            const selectedResources = selectedOptions
                              .map((option) =>
                                getGoogleLookupResourceName(
                                  option,
                                  "languageConstants",
                                ),
                              )
                              .filter((resourceName): resourceName is string =>
                                Boolean(resourceName),
                              );

                            setGoogleLanguageResources(selectedResources);
                            clearPreview();
                          }}
                          getOptionLabel={(option) =>
                            getGoogleLookupLabel(option)
                          }
                          isOptionEqualToValue={(option, value) =>
                            getGoogleLookupResourceName(
                              option,
                              "languageConstants",
                            ) ===
                            getGoogleLookupResourceName(
                              value,
                              "languageConstants",
                            )
                          }
                          filterOptions={(options, { inputValue }) => {
                            const search = inputValue.trim().toLowerCase();

                            return options.filter((option) => {
                              const searchText = [
                                getGoogleLookupLabel(option),
                                option.id,
                                option.resourceName,
                                option.resource_name,
                              ]
                                .join(" ")
                                .toLowerCase();

                              return searchText.includes(search);
                            });
                          }}
                          noOptionsText="No languages found"
                          loadingText="Loading Google Ads languages..."
                          ListboxProps={{
                            style: {
                              maxHeight: 240,
                            },
                          }}
                          renderOption={(props, option, { selected }) => {
                            const resourceName = getGoogleLookupResourceName(
                              option,
                              "languageConstants",
                            );

                            return (
                              <Box
                                component="li"
                                {...props}
                                key={
                                  resourceName || getGoogleLookupLabel(option)
                                }
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1,
                                  py: 1,
                                }}
                              >
                                <Checkbox
                                  size="small"
                                  checked={selected}
                                  sx={{ p: 0.5 }}
                                />

                                <Box sx={{ minWidth: 0 }}>
                                  <Typography variant="body2" fontWeight={500}>
                                    {getGoogleLookupLabel(option)}
                                  </Typography>

                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ overflowWrap: "anywhere" }}
                                  >
                                    {resourceName}
                                  </Typography>
                                </Box>
                              </Box>
                            );
                          }}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              size="small"
                              placeholder={
                                languageResources.length > 0
                                  ? "Search or add languages"
                                  : "Click to select languages"
                              }
                              error={Boolean(googleLanguageError)}
                              helperText={googleLanguageError || undefined}
                              InputProps={{
                                ...params.InputProps,
                                endAdornment: (
                                  <>
                                    {googleLanguageLoading && (
                                      <CircularProgress
                                        color="inherit"
                                        size={18}
                                      />
                                    )}
                                    {params?.InputProps?.endAdornment}
                                  </>
                                ),
                              }}
                            />
                          )}
                          sx={{
                            "& .MuiAutocomplete-tag": {
                              maxWidth: "calc(100% - 16px)",
                            },
                            "& .MuiOutlinedInput-root": {
                              borderRadius: 2,
                            },
                          }}
                        />

                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            mt: 1.5,
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Select the languages you want to target.
                          </Typography>

                          <Chip
                            size="small"
                            color="primary"
                            variant="outlined"
                            label={`${languageResources.length} selected`}
                          />
                        </Box>
                      </Box>
                    </Stack>
                    {/* Google Ads Custom Conversion Goal Lookup */}
                    <div className="sm:col-span-2">
                      <label className={labelClass}>
                        Custom Conversion Goal (optional)
                      </label>

                      <select
                        value={googleCustomConversionGoalResourceName}
                        onChange={(e) => {
                          setGoogleCustomConversionGoalResourceName(
                            e.target.value,
                          );
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        <option value="">
                          Use account-level conversion goals
                        </option>

                        {googleConversionGoalOptions.map((option) => {
                          const resourceName =
                            getGoogleLookupResourceName(option);

                          if (!resourceName) return null;

                          return (
                            <option key={resourceName} value={resourceName}>
                              {getGoogleLookupLabel(option)} — {resourceName}
                            </option>
                          );
                        })}
                      </select>

                      {googleConversionGoalLoading && (
                        <p className="mt-2 text-xs text-slate-500">
                          Loading conversion goals...
                        </p>
                      )}

                      {googleConversionGoalError && (
                        <p className="mt-2 text-xs text-red-600">
                          {googleConversionGoalError}
                        </p>
                      )}

                      <p className="mt-1 text-xs text-slate-500">
                        Leave blank to use account-level conversion goals.
                        Custom goals must exist in the effective conversion
                        customer.
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    The backend must resolve supported geo/language resource
                    names and create CampaignCriterion resources. These are not
                    free-text location names. Google conversion goals are
                    configured with ConversionGoalCampaignConfig /
                    CampaignConversionGoal resources—not a generic Campaign
                    objective field.
                  </p>
                </div>
                {googleCampaignType === "SEARCH" && (
                  <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-800">
                      Search Network Settings
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked
                          readOnly
                          className="mt-1"
                        />
                        <span>
                          <strong>Google Search</strong>
                          <span className="block text-xs text-slate-500">
                            Primary Search Network (required for this Search
                            setup)
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={googleSearchPartners}
                          onChange={(e) => {
                            setGoogleSearchPartners(e.target.checked);
                            clearPreview();
                          }}
                          className="mt-1"
                        />
                        <span>
                          <strong>Search Partners</strong>
                          <span className="block text-xs text-slate-500">
                            Maps to network_settings.target_search_network
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={googleDisplayExpansion}
                          onChange={(e) => {
                            setGoogleDisplayExpansion(e.target.checked);
                            clearPreview();
                          }}
                          className="mt-1"
                        />
                        <span>
                          <strong>Display Network expansion</strong>
                          <span className="block text-xs text-slate-500">
                            Maps to network_settings.target_content_network
                          </span>
                        </span>
                      </label>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      Google Search is enabled separately. Search Partners are
                      controlled through target_search_network in the API.
                    </p>
                  </div>
                )}
                <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-800">
                    Google Campaign Budget API
                  </p>
                  {googleSupportsCampaignTotalBudget && (
                    <div className="mt-3">
                      <label className={labelClass}>Budget Period *</label>
                      <select
                        value={effectiveGoogleBudgetMode}
                        onChange={(e) => {
                          setGoogleBudgetMode(
                            e.target.value as GoogleBudgetMode,
                          );
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        <option value="DAILY">Average daily budget</option>
                        <option value="CAMPAIGN_TOTAL">
                          Campaign total budget
                        </option>
                      </select>
                    </div>
                  )}
                  {effectiveGoogleBudgetMode === "DAILY" ? (
                    <div className="mt-3">
                      <label className={labelClass}>
                        Average Daily Budget (
                        {selectedCurrency(connections.googleAds)}) *
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={googleDailyBudget}
                        onChange={(e) => {
                          setGoogleDailyBudget(e.target.value);
                          clearPreview();
                        }}
                        placeholder="e.g. 500"
                        className={inputClass}
                      />
                      {googleCampaignType === "DEMAND_GEN" && (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                          Google Ads API enforces a minimum Demand Gen daily
                          budget of USD 5 (or account-currency equivalent) for
                          new and modified campaigns from April 1, 2026. In API
                          v26, the backend can query
                          currency_constant.demand_gen_info.minimum_budget_per_day_micros
                          before submission.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3">
                      <label className={labelClass}>
                        Campaign Total Budget (
                        {selectedCurrency(connections.googleAds)}) *
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={googleCampaignTotalBudget}
                        onChange={(e) => {
                          setGoogleCampaignTotalBudget(e.target.value);
                          clearPreview();
                        }}
                        placeholder="Total amount for the full campaign period"
                        className={inputClass}
                      />
                      <p className="mt-2 text-xs text-amber-700">
                        Campaign total budgets require start and end dates, use
                        period=CUSTOM_PERIOD and total_amount_micros, and cannot
                        be shared. Supported here for Search, Performance Max,
                        Demand Gen and Standard Shopping.
                      </p>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-slate-500">
                    Create a separate CampaignBudget resource with
                    CampaignBudgetService.MutateCampaignBudgets, then attach its
                    resource name to Campaign.campaign_budget. Convert
                    account-currency amounts to micros (× 1,000,000).
                  </p>
                </div>
              </div>
            </div>
          )}

          {selectedPlatforms.includes("metaAds") && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl font-bold text-blue-700">
                  M
                </div>
                <div>
                  <h3 className="font-bold">Meta Ads</h3>
                  <p className="text-xs text-slate-500">
                    {selectedAccountLabel(connections.metaAds)} ·{" "}
                    {selectedCurrency(connections.metaAds)}
                  </p>
                </div>
              </div>
              {!objective ? (
                <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  Choose a shared campaign objective in Campaign Basics first.
                </p>
              ) : (
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>
                      Meta Campaign Objective
                    </label>
                    <input
                      readOnly
                      value={metaObjectiveMap[objective]}
                      className={`${inputClass} bg-slate-50 text-slate-600`}
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      Mapped from your shared business objective.
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Buying Type *</label>
                    <select
                      value={metaBuyingType}
                      onChange={(e) => {
                        setMetaBuyingType(e.target.value as MetaBuyingType);
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      {metaBuyingTypes.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      Sent as Meta campaign-level <code>buying_type</code>.
                      Reservation buying requires the Reach &amp; Frequency
                      reservation workflow and may depend on account
                      eligibility.
                    </p>
                    {metaBuyingType === "RESERVED" && (
                      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                        Reserved is shown as a supported Meta buying type, but
                        this builder does not yet collect reservation
                        predictions or assign a reservation to an Ad Set. Choose
                        Auction to prepare a request in this version.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Budget Level *</label>
                    <select
                      value={metaBudgetLevel}
                      onChange={(e) => {
                        setMetaBudgetLevel(e.target.value as MetaBudgetLevel);
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      <option value="CAMPAIGN">Campaign-level budget</option>
                      <option value="AD_SET">Ad set-level budget</option>
                    </select>
                  </div>
                  {metaBudgetLevel === "AD_SET" && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={metaIsAdsetBudgetSharingEnabled}
                          onChange={(event) => {
                            setMetaIsAdsetBudgetSharingEnabled(event.target.checked);
                            clearPreview();
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-slate-900">
                            Allow ad sets to share budget
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-slate-600">
                            Optional Meta budget-sharing optimization. When enabled, Meta may move up to 20% of an ad set's budget to other ad sets in the same campaign. Disabled by default.
                          </span>
                        </span>
                      </label>
                    </div>
                  )}
                  <div>
                    <label className={labelClass}>Budget Type *</label>
                    <select
                      value={metaBudgetMode}
                      onChange={(e) => {
                        setMetaBudgetMode(
                          e.target.value as "DAILY" | "LIFETIME",
                        );
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      <option value="DAILY">Daily budget</option>
                      <option value="LIFETIME">Lifetime budget</option>
                    </select>
                  </div>
                  {metaBudgetMode === "DAILY" ? (
                    <div>
                      <label className={labelClass}>
                        {metaBudgetLevel === "CAMPAIGN"
                          ? "Daily Campaign Budget"
                          : "Daily Ad Set Budget"}{" "}
                        ({selectedCurrency(connections.metaAds)}) *
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={metaDailyBudget}
                        onChange={(e) => {
                          setMetaDailyBudget(e.target.value);
                          clearPreview();
                        }}
                        placeholder="e.g. 500"
                        className={inputClass}
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        Only one budget level is used: Campaign (CBO) or Ad Set
                        (ABO). Converted to the account currency's minor units.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className={labelClass}>
                        {metaBudgetLevel === "CAMPAIGN"
                          ? "Lifetime Campaign Budget"
                          : "Lifetime Ad Set Budget"}{" "}
                        ({selectedCurrency(connections.metaAds)}) *
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={metaLifetimeBudget}
                        onChange={(e) => {
                          setMetaLifetimeBudget(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className={labelClass}>Start Time *</label>
                          <input
                            type="datetime-local"
                            value={metaStartTime}
                            onChange={(e) => {
                              setMetaStartTime(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>End Time *</label>
                          <input
                            type="datetime-local"
                            value={metaEndTime}
                            onChange={(e) => {
                              setMetaEndTime(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Meta requires an end_time with lifetime_budget. The
                        backend converts the amount to minor units.
                      </p>
                    </div>
                  )}
                  {metaBudgetMode === "DAILY" && (
                    <div className="sm:col-span-2 rounded-xl border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-slate-800">
                        Optional Ad Set schedule
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className={labelClass}>
                            Start Time (optional)
                          </label>
                          <input
                            type="datetime-local"
                            value={metaStartTime}
                            onChange={(e) => {
                              setMetaStartTime(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>
                            End Time (optional)
                          </label>
                          <input
                            type="datetime-local"
                            value={metaEndTime}
                            onChange={(e) => {
                              setMetaEndTime(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        For daily budgets, both values may be omitted. If
                        provided, the backend sends them on the Ad Set.
                      </p>
                    </div>
                  )}
                  <div>
                    <label className={labelClass}>
                      Performance Goal (Meta optimization_goal) *
                    </label>
                    <select
                      value={effectiveMetaOptimizationGoal}
                      onChange={(e) => {
                        setMetaOptimizationGoal(e.target.value);
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      {availableMetaOptimizationOptions.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      This is an Ad Set setting in Meta, not a Campaign field.
                      Options are filtered using the selected campaign
                      objective.
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Billing Event *</label>
                    <select
                      value={effectiveMetaBillingEvent}
                      onChange={(e) => {
                        setMetaBillingEvent(e.target.value);
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      {availableMetaBillingOptions.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      Choices are narrowed by the optimization goal; the backend
                      must still verify the selected pair against the account
                      and API version.
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Bid Strategy *</label>
                    <select
                      value={metaBidStrategy}
                      onChange={(e) => {
                        setMetaBidStrategy(e.target.value as MetaBidStrategy);
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      {metaBidStrategies.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      Applied at Campaign level for campaign budgets or Ad Set
                      level for ad set budgets.
                    </p>
                  </div>
                  {["LOWEST_COST_WITH_BID_CAP", "COST_CAP"].includes(
                    metaBidStrategy,
                  ) && (
                      <div>
                        <label className={labelClass}>
                          Bid Amount ({selectedCurrency(connections.metaAds)}) *
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={metaBidAmount}
                          onChange={(e) => {
                            setMetaBidAmount(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                        <p className="mt-2 text-xs text-slate-500">
                          The backend converts this amount to the currency's minor
                          units before sending bid_amount.
                        </p>
                      </div>
                    )}
                  {metaBidStrategy === "LOWEST_COST_WITH_MIN_ROAS" && (
                    <div>
                      <label className={labelClass}>Minimum ROAS Floor *</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.1"
                        value={metaMinimumRoas}
                        onChange={(e) => {
                          setMetaMinimumRoas(e.target.value);
                          clearPreview();
                        }}
                        placeholder="e.g. 2.0"
                        className={inputClass}
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        Requires Meta's VALUE optimization goal. The backend
                        converts this ratio to
                        bid_constraints.roas_average_floor.
                      </p>
                    </div>
                  )}
                  <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-800">
                      Audience targeting (Ad Set)
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Search Meta's location and audience catalogues below. Selected country codes and geo keys are inserted into the provider targeting fields; the API resource IDs are never invented.
                    </p>
                    +                    <div className="mt-4 space-y-4">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <label className={labelClass}>Saved Audience template (optional)</label>
                        <Autocomplete
                          options={metaSavedAudienceOptions}
                          value={metaSelectedSavedAudience}
                          loading={metaAudienceLoading}
                          getOptionLabel={getMetaLookupLabel}
                          isOptionEqualToValue={(option, value) => getMetaLookupId(option) === getMetaLookupId(value)}
                          onChange={(_, option) => { setMetaSelectedSavedAudience(option); applyMetaSavedAudience(option); }}
                          renderInput={(params) => <TextField {...params} size="small" placeholder="Choose a saved Meta audience to prefill targeting" />}
                        />
                        {metaAudienceLoading && <p className="mt-2 text-xs text-slate-500">Loading account audiences...</p>}
                        {metaAudienceError && <p className="mt-2 text-xs text-red-600">{metaAudienceError}</p>}
                        <p className="mt-1 text-xs text-slate-500">Selecting a saved audience copies supported location, age, gender and interest criteria into this draft. Review the values before publishing.</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="text-sm font-semibold text-slate-800">Search Meta locations</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
                          <select value={metaLocationKind} onChange={(event) => { setMetaLocationKind(event.target.value as "country" | "region" | "city" | "zip"); setMetaLocationOptions([]); setMetaSelectedLocationOptions([]); setMetaLocationError(""); }} className={inputClass}>
                            <option value="country">Country</option><option value="region">Region</option><option value="city">City</option><option value="zip">ZIP / postal code</option>
                          </select>
                          <input value={metaLocationQuery} onChange={(event) => setMetaLocationQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchMetaLocationOptions(); } }} placeholder="Search country, region, city or postal code" className={inputClass} />
                          <Button variant="contained" size="small" onClick={searchMetaLocationOptions} disabled={metaLocationLoading} sx={{ borderRadius: "8px", textTransform: "none", minWidth: 110 }}>{metaLocationLoading ? "Searching..." : "Search"}</Button>
                        </div>
                        {metaLocationOptions.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                          <Autocomplete multiple size="small" options={metaLocationOptions} value={metaSelectedLocationOptions} getOptionLabel={getMetaLookupLabel} isOptionEqualToValue={(option, value) => getMetaLookupId(option) === getMetaLookupId(value)} onChange={(_, values) => setMetaSelectedLocationOptions(values)} renderInput={(params) => <TextField {...params} label="Matching locations" placeholder="Select one or more locations" />} />
                          <Button variant="outlined" size="small" onClick={addSelectedMetaLocations} disabled={!metaSelectedLocationOptions.length} sx={{ borderRadius: "8px", textTransform: "none" }}>Add selected</Button>
                        </div>}
                        {metaLocationError && <p className="mt-2 text-xs text-red-600">{metaLocationError}</p>}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>Countries *</label>
                        <input
                          value={metaCountries}
                          onChange={(e) => {
                            setMetaCountries(e.target.value);
                            clearPreview();
                          }}
                          placeholder="IN, US"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Region Keys (optional; one per line)
                        </label>
                        <textarea
                          rows={2}
                          value={metaRegionKeys}
                          onChange={(e) => {
                            setMetaRegionKeys(e.target.value);
                            clearPreview();
                          }}
                          placeholder="Meta geo-location region key"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          City Keys (optional; one per line)
                        </label>
                        <textarea
                          rows={2}
                          value={metaCityKeys}
                          onChange={(e) => {
                            setMetaCityKeys(e.target.value);
                            clearPreview();
                          }}
                          placeholder="Meta geo-location city key"
                          className={inputClass}
                        />
                      </div>
                      {metaCityKeys.trim() && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className={labelClass}>City radius</label>
                            <input
                              type="number"
                              min="1"
                              max="80"
                              value={metaCityRadius}
                              onChange={(e) => {
                                setMetaCityRadius(e.target.value);
                                clearPreview();
                              }}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Distance unit</label>
                            <select
                              value={metaCityDistanceUnit}
                              onChange={(e) => {
                                setMetaCityDistanceUnit(
                                  e.target.value as "kilometer" | "mile",
                                );
                                clearPreview();
                              }}
                              className={inputClass}
                            >
                              <option value="kilometer">Kilometers</option>
                              <option value="mile">Miles</option>
                            </select>
                          </div>
                        </div>
                      )}
                      <div>
                        <label className={labelClass}>
                          ZIP Keys (optional; e.g. US:94103)
                        </label>
                        <textarea
                          rows={2}
                          value={metaZipKeys}
                          onChange={(e) => {
                            setMetaZipKeys(e.target.value);
                            clearPreview();
                          }}
                          placeholder="US:94103"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Gender</label>
                        <select
                          value={metaGender}
                          onChange={(e) => {
                            setMetaGender(
                              e.target.value as "ALL" | "MEN" | "WOMEN",
                            );
                            clearPreview();
                          }}
                          className={inputClass}
                        >
                          <option value="ALL">All genders</option>
                          <option value="MEN">Men</option>
                          <option value="WOMEN">Women</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Minimum Age *</label>
                        <input
                          type="number"
                          min="18"
                          max="65"
                          value={metaAgeMin}
                          onChange={(e) => {
                            setMetaAgeMin(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Maximum Age *</label>
                        <input
                          type="number"
                          min="18"
                          max="65"
                          value={metaAgeMax}
                          onChange={(e) => {
                            setMetaAgeMax(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div className="sm:col-span-2 rounded-lg border border-slate-200 p-3">
                        <label className={labelClass}>Search Meta interests</label>
                        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                          <input value={metaTargetingQuery} onChange={(event) => setMetaTargetingQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchMetaDetailedTargetingOptions(); } }} placeholder="e.g. online shopping, fitness, travel" className={inputClass} />
                          <Button variant="contained" size="small" onClick={searchMetaDetailedTargetingOptions} disabled={metaTargetingLoading} sx={{ borderRadius: "8px", textTransform: "none", minWidth: 110 }}>{metaTargetingLoading ? "Searching..." : "Search"}</Button>
                        </div>
                        {metaTargetingOptions.length > 0 && <div className="mt-3">
                          <Autocomplete multiple size="small" options={metaTargetingOptions} value={metaSelectedInterestOptions} getOptionLabel={getMetaLookupLabel} isOptionEqualToValue={(option, value) => getMetaLookupId(option) === getMetaLookupId(value)} onChange={(_, options) => { setMetaSelectedInterestOptions(options); setMetaAudienceInterestIds(options.map(getMetaLookupId).filter(Boolean).join("\n")); clearPreview(); }} renderInput={(params) => <TextField {...params} label="Selected interests" placeholder="Select Meta interests" />} />
                          <p className="mt-1 text-xs text-slate-500">Selected interest IDs: {metaAudienceInterestIds.split(/[\n,]+/).filter(Boolean).length}</p>
                        </div>}
                        {metaTargetingError && <p className="mt-2 text-xs text-red-600">{metaTargetingError}</p>}
                      </div>
                      <div>
                        <Autocomplete multiple size="small" options={metaCustomAudienceOptions} loading={metaAudienceLoading} value={metaCustomAudienceOptions.filter((option) => metaIncludedCustomAudienceIds.split(/[\n,]+/).map((value) => value.trim()).includes(getMetaLookupId(option)))} getOptionLabel={getMetaLookupLabel} isOptionEqualToValue={(option, value) => getMetaLookupId(option) === getMetaLookupId(value)} onChange={(_, options) => { setMetaIncludedCustomAudienceIds(options.map(getMetaLookupId).filter(Boolean).join("\n")); clearPreview(); }} renderInput={(params) => <TextField {...params} label="Include Custom Audiences" placeholder="Search account audiences" />} />
                      </div>
                      <div>
                        <Autocomplete multiple size="small" options={metaCustomAudienceOptions} loading={metaAudienceLoading} value={metaCustomAudienceOptions.filter((option) => metaExcludedCustomAudienceIds.split(/[\n,]+/).map((value) => value.trim()).includes(getMetaLookupId(option)))} getOptionLabel={getMetaLookupLabel} isOptionEqualToValue={(option, value) => getMetaLookupId(option) === getMetaLookupId(value)} onChange={(_, options) => { setMetaExcludedCustomAudienceIds(options.map(getMetaLookupId).filter(Boolean).join("\n")); clearPreview(); }} renderInput={(params) => <TextField {...params} label="Exclude Custom Audiences" placeholder="Search account audiences" />} />
                      </div>
                      <div className="sm:col-span-2 rounded-lg border border-slate-200 p-3">
                        <label className={labelClass}>Placements *</label>
                        <select
                          value={metaPlacementMode}
                          onChange={(e) => {
                            setMetaPlacementMode(
                              e.target.value as "AUTOMATIC" | "MANUAL",
                            );
                            clearPreview();
                          }}
                          className={inputClass}
                        >
                          <option value="AUTOMATIC">
                            Automatic placements (Advantage+ placements)
                          </option>
                          <option value="MANUAL">Manual placements</option>
                        </select>
                        {metaPlacementMode === "MANUAL" && (
                          <>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {[
                                ["facebook", "Facebook"],
                                ["instagram", "Instagram"],
                                ["messenger", "Messenger"],
                                ["audience_network", "Audience Network"],
                              ].map(([value, label]) => (
                                <label
                                  key={value}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    checked={metaPublisherPlatforms.includes(
                                      value,
                                    )}
                                    onChange={(e) =>
                                      setMetaPublisherPlatforms((current) =>
                                        e.target.checked
                                          ? [...current, value]
                                          : current.filter((v) => v !== value),
                                      )
                                    }
                                  />
                                  {label}
                                </label>
                              ))}
                            </div>
                            {metaPublisherPlatforms.includes("facebook") && (
                              <div className="mt-3">
                                <label className={labelClass}>
                                  Facebook positions (comma-separated)
                                </label>
                                <input
                                  value={metaFacebookPositions.join(", ")}
                                  onChange={(e) => {
                                    setMetaFacebookPositions(
                                      e.target.value
                                        .split(",")
                                        .map((v) => v.trim())
                                        .filter(Boolean),
                                    );
                                    clearPreview();
                                  }}
                                  className={inputClass}
                                  placeholder="feed, story, reels"
                                />
                              </div>
                            )}
                            {metaPublisherPlatforms.includes("instagram") && (
                              <div className="mt-3">
                                <label className={labelClass}>
                                  Instagram positions (comma-separated)
                                </label>
                                <input
                                  value={metaInstagramPositions.join(", ")}
                                  onChange={(e) => {
                                    setMetaInstagramPositions(
                                      e.target.value
                                        .split(",")
                                        .map((v) => v.trim())
                                        .filter(Boolean),
                                    );
                                    clearPreview();
                                  }}
                                  className={inputClass}
                                  placeholder="stream, story, reels, explore"
                                />
                              </div>
                            )}
                            {metaPublisherPlatforms.includes("messenger") && (
                              <div className="mt-3">
                                <label className={labelClass}>
                                  Messenger positions (comma-separated)
                                </label>
                                <input
                                  value={metaMessengerPositions.join(", ")}
                                  onChange={(e) => {
                                    setMetaMessengerPositions(
                                      e.target.value
                                        .split(",")
                                        .map((v) => v.trim())
                                        .filter(Boolean),
                                    );
                                    clearPreview();
                                  }}
                                  className={inputClass}
                                  placeholder="messenger_home, sponsored_messages"
                                />
                              </div>
                            )}
                            {metaPublisherPlatforms.includes(
                              "audience_network",
                            ) && (
                                <div className="mt-3">
                                  <label className={labelClass}>
                                    Audience Network positions (comma-separated)
                                  </label>
                                  <input
                                    value={metaAudienceNetworkPositions.join(
                                      ", ",
                                    )}
                                    onChange={(e) => {
                                      setMetaAudienceNetworkPositions(
                                        e.target.value
                                          .split(",")
                                          .map((v) => v.trim())
                                          .filter(Boolean),
                                      );
                                      clearPreview();
                                    }}
                                    className={inputClass}
                                    placeholder="classic, rewarded_video"
                                  />
                                </div>
                              )}
                          </>
                        )}
                      </div>
                    </div>
                    {metaSpecialAdCategories.length > 0 && (
                      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                        Special Ad Category selected: restricted categories can
                        limit age, gender, location and detailed-targeting
                        controls. This builder omits age/gender targeting for
                        this campaign; the API and policy validation must
                        enforce the applicable market rules.
                      </p>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>
                      Special Ad Categories (select every applicable category)
                    </label>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {[
                        ["CREDIT", "Credit"],
                        [
                          "FINANCIAL_PRODUCTS_SERVICES",
                          "Financial Products & Services",
                        ],
                        ["EMPLOYMENT", "Employment"],
                        ["HOUSING", "Housing"],
                        [
                          "ISSUES_ELECTIONS_POLITICS",
                          "Social issues, elections or politics",
                        ],
                        [
                          "ONLINE_GAMBLING_AND_GAMING",
                          "Online gambling and gaming",
                        ],
                      ].map(([value, label]) => (
                        <label
                          key={value}
                          className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={metaSpecialAdCategories.includes(value)}
                            onChange={(e) => {
                              setMetaSpecialAdCategories((current) =>
                                e.target.checked
                                  ? [...current, value]
                                  : current.filter((item) => item !== value),
                              );
                              clearPreview();
                            }}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Leave all unchecked only when none apply. The API field is
                      an array, so the builder supports multiple applicable
                      categories.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              Provider validation
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-800">
              Google's channel type, sub-type, network settings and bidding
              fields differ by campaign type. Meta's buying_type and
              special_ad_categories belong to the Campaign; optimization_goal,
              billing_event, targeting and creatives belong to the Ad Set / Ad
              layers. The backend must validate every provider combination and
              account eligibility before creating anything.
            </p>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="mt-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold">
              Ad Group, Asset Group & Ad Set setup
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Configure the next resource layer for each selected provider.
              These are separate provider-specific structures.
            </p>
          </div>

          {selectedPlatforms.includes("googleAds") && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold text-slate-900">Google Ads</h3>
              {googleCampaignType === "PERFORMANCE_MAX" ? (
                <div className="mt-5">
                  <div className="max-w-xl">
                    <label className={labelClass}>Asset Group Name *</label>
                    <input
                      value={pmaxAssetGroupName}
                      onChange={(e) => {
                        setPmaxAssetGroupName(e.target.value);
                        clearPreview();
                      }}
                      className={inputClass}
                    />
                  </div>
                  <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                    Performance Max uses an Asset Group rather than a standard
                    Ad Group. We will configure its headlines, descriptions,
                    images and logo in the next step.
                  </p>
                </div>
              ) : googleCampaignType === "HOTEL" ? (
                <div className="mt-5 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>
                        Hotel Ad Group Name *
                      </label>
                      <input
                        value={googleHotelAdGroupName}
                        onChange={(e) => {
                          setGoogleHotelAdGroupName(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Target Country Code *
                      </label>
                      <input
                        value={googleHotelTargetCountry}
                        onChange={(e) => {
                          setGoogleHotelTargetCountry(
                            e.target.value.toUpperCase(),
                          );
                          clearPreview();
                        }}
                        placeholder="US"
                        maxLength={2}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Language Code *</label>
                      <input
                        value={googleHotelLanguage}
                        onChange={(e) => {
                          setGoogleHotelLanguage(e.target.value.toLowerCase());
                          clearPreview();
                        }}
                        placeholder="en"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Hotel Listing Selection *
                      </label>
                      <select
                        value={googleHotelListingMode}
                        onChange={(e) => {
                          setGoogleHotelListingMode(
                            e.target.value as "ALL_HOTELS" | "SELECTED_HOTELS",
                          );
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        <option value="ALL_HOTELS">
                          All hotels in linked feed
                        </option>
                        <option value="SELECTED_HOTELS">
                          Selected hotel properties
                        </option>
                      </select>
                    </div>
                    {googleHotelListingMode === "SELECTED_HOTELS" && (
                      <div className="sm:col-span-2">
                        <label className={labelClass}>
                          Hotel Center Property IDs *
                        </label>
                        <textarea
                          rows={3}
                          value={googleHotelPropertyIds}
                          onChange={(e) => {
                            setGoogleHotelPropertyIds(e.target.value);
                            clearPreview();
                          }}
                          placeholder="Enter one Hotel Center property ID per line"
                          className={inputClass}
                        />
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    Hotel campaigns use hotel listings and pricing from Hotel
                    Center; they do not use ordinary text/image ad creatives.
                    This prototype collects the account, targeting and listing
                    choices. Actual listing-group tree operations and Hotel
                    Center feed management require backend/API work and an
                    allowlisted linked account.
                  </div>
                </div>
              ) : (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Ad Group Name *</label>
                    <input
                      value={googleAdGroupName}
                      onChange={(e) => {
                        setGoogleAdGroupName(e.target.value);
                        clearPreview();
                      }}
                      className={inputClass}
                    />
                  </div>

                  {["SEARCH", "DISPLAY", "SHOPPING"].includes(
                    googleCampaignType,
                  ) && (
                      <div className="sm:col-span-2">
                        <label className={labelClass}>
                          Audience User Lists (optional)
                        </label>

                        <input
                          value={googleUserListSearch}
                          onChange={(e) =>
                            setGoogleUserListSearch(e.target.value)
                          }
                          placeholder="Search your Google Ads audience lists"
                          className={inputClass}
                        />

                        {googleUserListLoading && (
                          <p className="mt-2 text-xs text-slate-500">
                            Loading audience user lists...
                          </p>
                        )}

                        {googleUserListError && (
                          <p className="mt-2 text-xs text-red-600">
                            {googleUserListError}
                          </p>
                        )}

                        {!googleUserListLoading &&
                          googleUserListOptions.length > 0 && (
                            <div className="mt-3 max-h-52 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
                              {googleUserListOptions
                                .filter((option) => {
                                  const searchText = [
                                    getGoogleLookupLabel(option),
                                    option.resourceName,
                                    option.resource_name,
                                    option.type,
                                  ]
                                    .join(" ")
                                    .toLowerCase();

                                  return searchText.includes(
                                    googleUserListSearch.toLowerCase(),
                                  );
                                })
                                .map((option) => {
                                  const resourceName =
                                    getGoogleLookupResourceName(option);

                                  if (!resourceName) return null;

                                  const selected = googleAdGroupUserLists
                                    .split(/[\n,]+/)
                                    .map((value) => value.trim())
                                    .filter(Boolean)
                                    .includes(resourceName);

                                  return (
                                    <label
                                      key={resourceName}
                                      className="flex cursor-pointer items-start gap-2 text-sm text-slate-700"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={(e) => {
                                          setGoogleAdGroupUserLists((current) =>
                                            toggleGoogleResourceName(
                                              current,
                                              resourceName,
                                              e.target.checked,
                                            ),
                                          );
                                          clearPreview();
                                        }}
                                        className="mt-1"
                                      />

                                      <span>
                                        <span className="block font-medium">
                                          {getGoogleLookupLabel(option)}
                                        </span>
                                        <span className="block text-xs text-slate-500">
                                          {resourceName}
                                        </span>
                                      </span>
                                    </label>
                                  );
                                })}
                            </div>
                          )}

                        {!googleUserListLoading &&
                          !googleUserListError &&
                          googleUserListOptions.length === 0 && (
                            <p className="mt-2 text-xs text-slate-500">
                              No accessible user lists were returned for this
                              Google Ads account.
                            </p>
                          )}

                        <p className="mt-2 text-xs text-slate-500">
                          Selected user lists:{" "}
                          {
                            googleAdGroupUserLists
                              .split(/[\n,]+/)
                              .map((value) => value.trim())
                              .filter(Boolean).length
                          }
                          . Only lists returned by the account lookup can be
                          selected here.
                        </p>
                      </div>
                    )}
                  {googleCampaignType === "DEMAND_GEN" && (
                    <div className="sm:col-span-2">
                      <label className={labelClass}>
                        Demand Gen Audience Resource Names (optional; one per
                        line)
                      </label>
                      <Autocomplete
                        multiple
                        options={googleAudienceOptions}
                        value={googleAudienceOptions.filter((option) => googleDemandGenAudienceResources.split(/[\n,]+/).map((value) => value.trim()).includes(getGoogleLookupResourceName(option)))}
                        loading={googleAudienceLoading}
                        getOptionLabel={(option) => getGoogleLookupLabel(option)}
                        isOptionEqualToValue={(option, value) => getGoogleLookupResourceName(option) === getGoogleLookupResourceName(value)}
                        onChange={(_, options) => {
                          setGoogleDemandGenAudienceResources(options.map((option) => getGoogleLookupResourceName(option)).filter(Boolean).join("\n"));
                          clearPreview();
                        }}
                        renderInput={(params) => <TextField {...params} size="small" placeholder="Search customer Audiences" />}
                      />
                      {googleAudienceError && <p className="mt-2 text-xs text-red-600">{googleAudienceError}</p>}
                      <p className="mt-1 text-xs text-slate-500">
                        Demand Gen uses AudienceInfo criteria, not direct
                        UserListInfo criteria. Create or select a reusable
                        Google Audience first.
                      </p>
                    </div>
                  )}
                  {googleCampaignType === "SEARCH" && (
                    <>
                      <div>
                        <label className={labelClass}>Keyword Match Type</label>
                        <select
                          value={googleKeywordMatchType}
                          onChange={(e) => {
                            setGoogleKeywordMatchType(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        >
                          <option value="BROAD">Broad match</option>
                          <option value="PHRASE">Phrase match</option>
                          <option value="EXACT">Exact match</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelClass}>
                          Keywords * (one keyword per line)
                        </label>
                        <textarea
                          rows={5}
                          value={googleKeywordLines}
                          onChange={(e) => {
                            setGoogleKeywordLines(e.target.value);
                            clearPreview();
                          }}
                          placeholder={
                            "project management software\nteam collaboration tool\nworkflow automation"
                          }
                          className={inputClass}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelClass}>
                          Negative Keywords (optional; one per line)
                        </label>
                        <textarea
                          rows={3}
                          value={googleNegativeKeywordLines}
                          onChange={(e) => {
                            setGoogleNegativeKeywordLines(e.target.value);
                            clearPreview();
                          }}
                          placeholder={"free\njobs\nused"}
                          className={inputClass}
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          These become separate negative AdGroupCriterion
                          resources; they do not share the positive keyword
                          resource.
                        </p>
                      </div>
                      {effectiveGoogleBiddingMode === "MANUAL_CPC" && (
                        <div>
                          <label className={labelClass}>
                            Default CPC Bid (
                            {selectedCurrency(connections.googleAds)}) *
                          </label>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={googleDefaultCpcBid}
                            onChange={(e) => {
                              setGoogleDefaultCpcBid(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            The backend converts this amount to micros for the
                            Ad Group bid field.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  {googleCampaignType === "DISPLAY" &&
                    ["MANUAL_CPC", "MANUAL_CPM"].includes(
                      effectiveGoogleBiddingMode,
                    ) && (
                      <div>
                        <label className={labelClass}>
                          Default{" "}
                          {effectiveGoogleBiddingMode === "MANUAL_CPC"
                            ? "CPC"
                            : "CPM"}{" "}
                          Bid ({selectedCurrency(connections.googleAds)}) *
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={googleDefaultCpcBid}
                          onChange={(e) => {
                            setGoogleDefaultCpcBid(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          The backend converts this amount to micros and maps it
                          to the matching Ad Group bid field.
                        </p>
                      </div>
                    )}
                  <p className="sm:col-span-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                    The Ad Group belongs to the selected Google campaign.
                    Responsive Search Ad copy is configured in the next step.
                    Demand Gen channel selections remain in Platform Settings
                    because they are Ad Group settings.
                  </p>
                </div>
              )}
            </div>
          )}

          {selectedPlatforms.includes("metaAds") && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold text-slate-900">
                Meta Ads — Ad Set configuration
              </h3>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Ad Set Name *</label>
                  <input
                    value={metaAdSetName}
                    onChange={(e) => {
                      setMetaAdSetName(e.target.value);
                      clearPreview();
                    }}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Meta Pixel / Dataset *
                  </label>

                  <select
                    value={metaPixelId}
                    onChange={(e) => {
                      setMetaPixelId(e.target.value);
                      setMetaPixelEvents([]);
                      setMetaPixelEventsError("");
                      setMetaConversionEvent("PURCHASE");
                      clearPreview();
                    }}
                    disabled={metaPixelsLoading || metaPixelOptions.length === 0}
                    className={inputClass}
                  >
                    <option value="">
                      {metaPixelsLoading
                        ? "Loading Pixels/Datasets..."
                        : metaPixelOptions.length > 0
                          ? "Select a Pixel/Dataset"
                          : "No Pixels/Datasets available"}
                    </option>

                    {metaPixelOptions
                      .filter((pixel) => !pixel.isUnavailable)
                      .map((pixel) => (
                        <option key={pixel.id} value={pixel.id}>
                          {pixel.name} · {pixel.id}
                        </option>
                      ))}
                  </select>

                  <p className="mt-1 text-xs text-slate-500">
                    Select a Pixel/Dataset belonging to your currently connected Meta Ad Account.
                  </p>

                  {metaPixelsError && (
                    <p className="mt-2 text-xs text-red-600">
                      {metaPixelsError}
                    </p>
                  )}

                  {!metaPixelsLoading &&
                    !metaPixelsError &&
                    metaPixelOptions.length === 0 &&
                    connections.metaAds.selectedAccountId && (
                      <p className="mt-2 text-xs text-amber-700">
                        No Pixels/Datasets were returned for this Ad Account.
                        Check your Meta account access and permissions.
                      </p>
                    )}
                </div>
                <div>
                  <label className={labelClass}>
                    Conversion Event *
                  </label>

                  <select
                    value={metaConversionEvent}
                    disabled={Boolean(metaCustomConversionId)}
                    onChange={(e) => {
                      setMetaCustomConversionId("");
                      setMetaConversionEvent(e.target.value);
                      clearPreview();
                    }}
                    className={inputClass}
                  >
                    {metaPixelEventsLoading ? (
                      <option value="">Loading conversion events...</option>
                    ) : (
                      <>
                        <option value="">Select Conversion Event</option>

                        {metaPixelEvents.map((event) => (
                          <option
                            key={event.customEventType}
                            value={event.customEventType}
                          >
                            {event.eventName}
                            {event.isObserved
                              ? ` · ${event.eventCount} recent events`
                              : " · No recent activity"}
                          </option>
                        ))}
                      </>
                    )}
                  </select>

                  {metaPixelEventsError && (
                    <p className="mt-2 text-xs text-red-600">
                      {metaPixelEventsError}
                    </p>
                  )}

                  {metaPixelId && !metaPixelEventsLoading && (
                    <p className="mt-1 text-xs text-slate-500">
                      Events are based on the selected Pixel's recent activity.
                      Standard conversion events are also available when no activity is reported.
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>
                    Custom Conversion (optional)
                  </label>

                  <select
                    value={metaCustomConversionId}
                    disabled={
                      !metaPixelId ||
                      metaCustomConversionsLoading ||
                      metaCustomConversionOptions.length === 0
                    }
                    onChange={(e) => {
                      setMetaCustomConversionId(e.target.value);
                      clearPreview();
                    }}
                    className={inputClass}
                  >
                    <option value="">
                      Use standard conversion event
                    </option>

                    {metaCustomConversionOptions.map((conversion) => {
                      const unavailable =
                        conversion.isArchived ||
                        conversion.isUnavailable;

                      return (
                        <option
                          key={conversion.id}
                          value={conversion.id}
                          disabled={unavailable}
                        >
                          {conversion.name}
                          {conversion.customEventType
                            ? ` — ${conversion.customEventType}`
                            : ""}
                          {conversion.isArchived
                            ? " (Archived)"
                            : conversion.isUnavailable
                              ? " (Unavailable)"
                              : ""}
                        </option>
                      );
                    })}
                  </select>

                  {metaCustomConversionsLoading && (
                    <p className="mt-1 text-xs text-slate-500">
                      Loading Custom Conversions…
                    </p>
                  )}

                  {metaCustomConversionsError && (
                    <p className="mt-1 text-xs text-red-600">
                      {metaCustomConversionsError}
                    </p>
                  )}

                  {!metaCustomConversionsLoading &&
                    !metaCustomConversionsError &&
                    metaPixelId &&
                    metaCustomConversionOptions.filter(
                      (conversion) =>
                        !conversion.isArchived &&
                        !conversion.isUnavailable,
                    ).length === 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        No available Custom Conversions were found for
                        this Pixel.
                      </p>
                    )}

                  <p className="mt-1 text-xs text-slate-500">
                    Select a Custom Conversion instead of a standard
                    event when your campaign should optimize for a
                    defined conversion rule.
                  </p>
                </div>
              </div>
              <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                Audience, budget, optimization and billing settings are
                configured in Platform Settings. Page identity, ad copy, media
                and call-to-action are configured in the next Ad Creation step.
              </p>
            </div>
          )}
        </section>
      )}

      {step === 4 && (
        <>
          <section
            id="ai-creative-panel"
            className="mt-6 space-y-5 rounded-2xl border border-violet-200 bg-white p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-violet-700">
                  AI Creative Studio · Step 4
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  Generate campaign-ready creative
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                  Generate advertising copy variations and correctly sized image
                  assets for this campaign's selected Google Ads and Meta Ads
                  formats.
                </p>
              </div>
              <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                {selectedPlatforms
                  .map((p) => (p === "googleAds" ? "Google Ads" : "Meta Ads"))
                  .join(" + ") || "No platform selected"}
              </span>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Creative brief *</label>
                  <textarea
                    rows={5}
                    maxLength={2000}
                    value={aiCreativePrompt}
                    onChange={(e) => setAiCreativePrompt(e.target.value)}
                    placeholder="Describe exactly what the business sells or offers, the audience, key benefit, message, mood and visual direction. Avoid broad instructions such as 'advertise my website'."
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    {aiCreativePrompt.length}/2000 characters. The campaign
                    description is also included as product/service context.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Visual style</label>
                    <select
                      value={aiCreativeStyle}
                      onChange={(e) => setAiCreativeStyle(e.target.value)}
                      className={inputClass}
                    >
                      <option>Premium lifestyle</option>
                      <option>Minimal product focus</option>
                      <option>Bold promotional</option>
                      <option>Editorial / magazine</option>
                      <option>Playful and energetic</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Number of variations</label>
                    <select
                      value={aiCreativeVariationCount}
                      onChange={(e) =>
                        setAiCreativeVariationCount(
                          Number(e.target.value) as 1 | 2 | 3,
                        )
                      }
                      className={inputClass}
                    >
                      <option value={1}>1 variation</option>
                      <option value={2}>2 variations</option>
                      <option value={3}>3 variations</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Image aspect ratio</label>
                    <select
                      value={aiCreativeAspectRatio}
                      onChange={(e) =>
                        setAiCreativeAspectRatio(
                          e.target.value as CreativeAspectRatio,
                        )
                      }
                      disabled={aiCreativeTextOnly}
                      className={inputClass}
                    >
                      <option value="1:1">Square · 1:1</option>
                      <option value="4:5">Portrait feed · 4:5</option>
                      <option value="9:16">Stories / Reels · 9:16</option>
                      <option value="16:9">Landscape · 16:9</option>
                      <option value="1.91:1">Landscape · 1.91:1</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Generation mode</label>
                    <select
                      value={aiCreativeTextOnly ? "TEXT" : "IMAGE"}
                      onChange={(e) =>
                        setAiCreativeTextOnly(e.target.value === "TEXT")
                      }
                      className={inputClass}
                    >
                      <option value="IMAGE">Copy + image</option>
                      <option value="TEXT">Copy only</option>
                    </select>
                  </div>
                </div>
                {selectedPlatforms.includes("googleAds") &&
                  !aiCreativeTextOnly &&
                  !["SEARCH", "SHOPPING", "HOTEL"].includes(
                    googleCampaignType,
                  ) &&
                  !(
                    googleCampaignType === "DEMAND_GEN" &&
                    ["VIDEO_RESPONSIVE", "PRODUCT_FEED"].includes(
                      googleDemandGenFormat,
                    )
                  ) && (
                    <div>
                      <label className={labelClass}>
                        Google image aspect ratio
                      </label>
                      <select
                        value={googleCreativeAspectRatio}
                        onChange={(e) =>
                          setGoogleCreativeAspectRatio(
                            e.target.value as CreativeAspectRatio,
                          )
                        }
                        className={inputClass}
                      >
                        <option value="1.91:1">Landscape · 1.91:1</option>
                        <option value="1:1">Square · 1:1</option>
                        <option value="4:5">Portrait · 4:5</option>
                        <option value="16:9">Landscape · 16:9</option>
                      </select>
                    </div>
                  )}
                {selectedPlatforms.includes("googleAds") &&
                  googleCampaignType === "PERFORMANCE_MAX" &&
                  Boolean(businessName.trim()) &&
                  !aiCreativeTextOnly && (
                    <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <input
                        type="checkbox"
                        checked={aiCreativeGeneratePmaxLogoConcepts}
                        onChange={(event) =>
                          setAiCreativeGeneratePmaxLogoConcepts(event.target.checked)
                        }
                        className="mt-0.5 h-4 w-4 accent-violet-700"
                      />
                      <span>
                        <span className="block text-xs font-semibold text-amber-900">
                          Generate optional PMax logo concepts
                        </span>
                        <span className="mt-1 block text-[10px] leading-4 text-amber-800">
                          Generates square and landscape draft concepts. Save them to the Asset Library for review; they remain ineligible for official campaign logo slots until approved.

                        </span>
                      </span>
                    </label>
                  )}
                <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                  <strong>Campaign context:</strong>{" "}
                  {businessName || "Business not set"} ·{" "}
                  {description || "Product/service not set"} · {campaignName}
                  <p className="mt-1">
                    Website: {websiteUrl || "Not provided"}
                  </p>
                  <p className="mt-1">
                    Google format: {googleCampaignType}
                    {googleCampaignType === "DEMAND_GEN"
                      ? ` / ${googleDemandGenFormat}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void generateCampaignCreatives()}
                  disabled={
                    aiCreativeGenerating ||
                    loadingConnections ||
                    selectedPlatforms.length === 0
                  }
                  className="rounded-xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {aiCreativeGenerating
                    ? "Generating campaign creatives…"
                    : "Generate campaign creatives"}
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">
                      Generated concepts
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Select a variation to review its image and provider copy.
                    </p>
                  </div>
                  {creativeVariations.length > 0 && (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      {creativeVariations.length} generated
                    </span>
                  )}
                </div>
                {creativeVariations.length === 0 ? (
                  <div className="mt-4 flex min-h-48 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                    Your generated concepts will appear here.
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {creativeVariations.map((variation) => {
                      const active = selectedCreativeId === variation.id;
                      return (
                        <button
                          key={variation.id}
                          type="button"
                          onClick={() => setSelectedCreativeId(variation.id)}
                          className={`overflow-hidden rounded-xl border bg-white text-left transition ${active ? "border-violet-600 ring-2 ring-violet-200" : "border-slate-200 hover:border-violet-300"}`}
                        >
                          <div className="flex aspect-square items-center justify-center overflow-hidden bg-slate-100">
                            {variation.url ? (
                              <img
                                src={variation.url}
                                alt={variation.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="p-4 text-center text-xs text-slate-500">
                                Copy-only concept
                              </span>
                            )}
                          </div>
                          <div className="p-3">
                            <p className="text-xs font-bold text-slate-900">
                              {variation.name}
                            </p>
                            <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                              {variation.headline}
                            </p>
                            <p
                              className={`mt-2 text-[10px] font-bold ${active ? "text-violet-700" : "text-slate-400"}`}
                            >
                              {variation.status ||
                                (active
                                  ? "Selected for review"
                                  : "Select concept")}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {aiCreativeMeta && (
                  <div className="mt-4 grid gap-2 rounded-lg bg-white p-3 text-[11px] text-slate-600 sm:grid-cols-2">
                    <p>
                      <strong>Text model:</strong>{" "}
                      {aiCreativeMeta.model || "Not reported"}
                    </p>
                    <p>
                      <strong>Image provider:</strong>{" "}
                      {aiCreativeMeta.imageProvider || "Not reported"}
                    </p>
                    <p>
                      <strong>Generated:</strong>{" "}
                      {aiCreativeMeta.generatedCount ??
                        creativeVariations.length}
                    </p>
                    <p>
                      <strong>Failed variations:</strong>{" "}
                      {aiCreativeMeta.failedCount ?? 0}
                    </p>
                    <p>
                      <strong>Campaign assets:</strong>{" "}
                      {aiCreativeMeta.generatedAssetCount ?? 0} /{" "}
                      {aiCreativeMeta.requestedAssetCount ?? 0}
                    </p>
                    <p>
                      <strong>Failed assets:</strong>{" "}
                      {aiCreativeMeta.failedAssetCount ?? 0}
                    </p>
                    {aiCreativeMeta.generationId && (
                      <p className="break-all sm:col-span-2">
                        <strong>Generation ID:</strong>{" "}
                        {aiCreativeMeta.generationId}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {campaignGeneratedAssets.length > 0 && (
              <div className="rounded-xl border border-violet-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">
                      Campaign-ready generated assets
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Images are grouped by the selected provider campaign
                      format and asset requirement.
                    </p>
                  </div>
                  <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                    {campaignGeneratedAssets.length} image(s)
                  </span>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {campaignGeneratedAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                    >
                      <div className="flex aspect-[4/3] items-center justify-center bg-slate-100">
                        {asset.media.url ? (
                          <img
                            src={asset.media.url}
                            alt={asset.name}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="text-xs text-slate-500">
                            Preview unavailable
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 p-3">
                        <p className="text-sm font-semibold text-slate-900">
                          {asset.name}
                        </p>
                        <p className="text-xs text-slate-600">
                          {asset.role.replaceAll("_", " ")} ·{" "}
                          {asset.media.aspectRatio}
                        </p>
                        {(asset.role === "SQUARE_LOGO" || asset.role === "LANDSCAPE_LOGO") && (
                          <p className="rounded-lg bg-amber-50 p-2 text-[10px] leading-4 text-amber-800">
                            AI logo concept — draft only. Save it to the Asset Library for review; do not assign it as an official campaign logo until approved.

                          </p>
                        )}
                        <p className="break-all text-[10px] text-slate-400">
                          {asset.capabilityId} / {asset.requirementId}
                        </p>
                        {asset.media.isPlaceholder && (
                          <p className="text-[10px] font-semibold text-amber-700">
                            Development placeholder — not for publishing
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {(() => {
                            const isLogoDraft =
                              asset.role === "SQUARE_LOGO" ||
                              asset.role === "LANDSCAPE_LOGO";
                            const isSaving = savingCampaignAssetIds.includes(asset.id);
                            const isSaved = Boolean(savedCampaignAssetIds[asset.id]);

                            return (
                              <button
                                type="button"
                                onClick={() =>
                                  void (isLogoDraft
                                    ? saveCampaignGeneratedLogoDraft(asset)
                                    : saveAndAttachCampaignGeneratedAsset(asset))
                                }
                                disabled={
                                  asset.media.isPlaceholder ||
                                  isSaving ||
                                  isSaved
                                }
                                className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isSaving
                                  ? "Saving…"
                                  : isSaved
                                    ? isLogoDraft
                                      ? "Saved as draft"
                                      : "Saved & attached"
                                    : isLogoDraft
                                      ? "Save logo draft to Asset Library"
                                      : "Save to Library & attach"}
                              </button>
                            );
                          })()}
                          {asset.role === "SQUARE_LOGO" ||
                            asset.role === "LANDSCAPE_LOGO" ? (
                            <span className="text-[10px] text-amber-700">
                              Saving creates a draft; approve it in the Asset Library before campaign use.
                            </span>
                          ) : null}
                          {savedCampaignAssetIds[asset.id] && (
                            <span className="text-[10px] font-semibold text-emerald-700">
                              Asset Library ID:{" "}
                              {savedCampaignAssetIds[asset.id]}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {campaignAssetErrors.length > 0 && (
              <Alert
                severity="warning"
                sx={{ borderRadius: 2, whiteSpace: "pre-line" }}
              >
                {campaignAssetErrors
                  .map(
                    (item) =>
                      `${item.requirementId} · asset ${item.assetIndex}: ${item.message}`,
                  )
                  .join("\n")}
              </Alert>
            )}

            {aiCreativeError && (
              <Alert
                severity="error"
                sx={{ borderRadius: 2, whiteSpace: "pre-line" }}
              >
                {aiCreativeError}
              </Alert>
            )}
            {aiCreativeNotice && (
              <Alert
                severity="success"
                sx={{ borderRadius: 2, whiteSpace: "pre-line" }}
              >
                {aiCreativeNotice}
              </Alert>
            )}

            {(generatedCapabilityCopies.length > 0 || creativeBrandIdentity) && (
              <div className="space-y-4 rounded-xl border border-blue-200 bg-white p-4">
                <div>
                  <h3 className="font-bold text-slate-900">Capability-specific ad copy</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Generated from the selected campaign format's registered text requirements.
                  </p>
                </div>
                {creativeBrandIdentity && (
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Brand identity supplied to AI</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{creativeBrandIdentity.businessName}</p>
                    {creativeBrandIdentity.websiteUrl && (
                      <p className="mt-1 break-all text-xs text-slate-500">{creativeBrandIdentity.websiteUrl}</p>
                    )}
                    <p className="mt-1 text-[10px] text-slate-400">User-provided context; not independently verified.</p>
                  </div>
                )}
                {generatedCapabilityCopies.map((copy) => (
                  <div key={copy.capabilityId} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {copy.platform === "googleAds" ? "Google Ads" : "Meta Ads"} · {copy.campaignType.replaceAll("_", " ")} · {copy.adFormat.replaceAll("_", " ")}
                      </p>
                      <span className="text-[10px] text-slate-400">{copy.capabilityId}</span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {copy.texts.map((item) => (
                        <div key={`${item.requirementId}-${item.textIndex}`} className="rounded-lg bg-slate-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.field.replaceAll("_", " ")} · {item.textIndex}</p>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-800">{item.text}</p>
                          <p className="mt-1 text-[10px] text-slate-400">{item.text.length} characters</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {creativeVariations.some((v) => v.id === selectedCreativeId) &&
              (() => {
                const variation = creativeVariations.find(
                  (v) => v.id === selectedCreativeId,
                )!;
                return (
                  <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                      <div>
                        {variation.url ? (
                          <img
                            src={variation.url}
                            alt={variation.name}
                            className="max-h-80 w-full rounded-lg bg-white object-contain"
                          />
                        ) : (
                          <div className="flex min-h-48 items-center justify-center rounded-lg bg-white p-5 text-sm text-slate-500">
                            No image generated for this copy-only variation.
                          </div>
                        )}
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase text-slate-500">
                            Headline
                          </p>
                          <p className="mt-1 font-bold text-slate-900">
                            {variation.headline}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-slate-500">
                            Primary text
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {variation.primaryText}
                          </p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-lg bg-white p-3">
                            <p className="text-[10px] font-bold uppercase text-slate-500">
                              CTA
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-800">
                              {String(
                                variation.callToAction || "LEARN_MORE",
                              ).replaceAll("_", " ")}
                            </p>
                          </div>
                          <div className="rounded-lg bg-white p-3">
                            <p className="text-[10px] font-bold uppercase text-slate-500">
                              Aspect ratio
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-800">
                              {variation.aspectRatio}
                            </p>
                          </div>
                        </div>
                        {variation.googlePack && (
                          <div className="space-y-2 text-xs text-blue-800">
                            <p>
                              Google pack: {variation.googlePack.formatLabel} ·{" "}
                              {variation.googlePack.headlines.length} headline(s)
                            </p>
                            {variation.googlePack.businessName && (
                              <p>Business name: {variation.googlePack.businessName}</p>
                            )}
                            {((variation.googlePack.squareLogoUrls?.length ?? 0) > 0 ||
                              (variation.googlePack.landscapeLogoUrls?.length ?? 0) > 0) && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                                  <p className="font-semibold text-amber-900">AI logo concepts · draft only</p>
                                  <p className="mt-1 text-[10px] leading-4 text-amber-800">These concepts can be saved to the Asset Library for review, but must be approved before use as official campaign logos.</p>

                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {(variation.googlePack.squareLogoUrls ?? []).map((url, index) => (
                                      <img key={`sq-${index}`} src={url} alt={`Square logo draft ${index + 1}`} className="h-16 w-16 rounded bg-white object-contain p-1" />
                                    ))}
                                    {(variation.googlePack.landscapeLogoUrls ?? []).map((url, index) => (
                                      <img key={`land-${index}`} src={url} alt={`Landscape logo draft ${index + 1}`} className="h-16 w-32 rounded bg-white object-contain p-1" />
                                    ))}
                                  </div>
                                </div>
                              )}
                          </div>
                        )}
                        {variation.metaPack && (
                          <p className="text-xs text-fuchsia-800">
                            Meta pack:{" "}
                            {variation.metaPack.format.replaceAll("_", " ")}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="max-w-3xl text-xs leading-5 text-slate-500">
                        Save & attach stores media and copy in the Asset
                        Library, adds stable asset IDs to this campaign draft,
                        and fills supported ad-copy fields. Private media still
                        requires provider-specific upload before publishing.
                      </p>
                      <button
                        type="button"
                        onClick={() => void saveAndApplyCreativeVariation()}
                        disabled={aiCreativeSaving}
                        className="rounded-xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {aiCreativeSaving
                          ? "Saving & applying…"
                          : "Save & attach to campaign"}
                      </button>
                    </div>
                  </div>
                );
              })()}
          </section>

          <Dialog
            open={assetLibraryOpen}
            onClose={() => setAssetLibraryOpen(false)}
            fullWidth
            maxWidth="lg"
            scroll="paper"
            aria-labelledby="campaign-asset-library-title"
            PaperProps={{
              sx: {
                borderRadius: "16px",
                minHeight: { xs: "70vh", md: "60vh" },
                maxHeight: "88vh",
                overflow: "hidden",
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.20)",
                "& .MuiButton-root": {
                  borderRadius: "8px",
                  minHeight: 36,
                  px: 1.5,
                  py: 0.75,
                  fontSize: "0.78rem",
                  fontWeight: 650,
                  letterSpacing: 0,
                  textTransform: "none",
                  boxShadow: "none",
                  whiteSpace: "nowrap",
                },
                "& .MuiButton-sizeSmall": {
                  minHeight: 32,
                  px: 1.25,
                  py: 0.5,
                  fontSize: "0.72rem",
                },
                "& .MuiButton-contained:hover": { boxShadow: "none" },
                "& .MuiButton-outlined": { borderColor: "#cbd5e1" },
                "& .MuiOutlinedInput-root": { borderRadius: "10px" },
              },
            }}
          >
            <DialogTitle
              id="campaign-asset-library-title"
              sx={{ px: { xs: 2, sm: 3 }, pt: 2.5, pb: 2, borderBottom: "1px solid #e2e8f0" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-slate-900">
                    Campaign Assets & Copy Library
                  </p>
                  <p className="mt-1 text-xs font-normal text-slate-500">
                    Browse reusable media and copy. Only compatible actions for the selected campaign are enabled.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {assetLibrary.length} saved asset(s)
                </span>
              </div>
            </DialogTitle>
            <DialogContent
              dividers
              sx={{
                px: { xs: 2, sm: 3 },
                py: { xs: 2, sm: 3 },
                bgcolor: "#f8fafc",
                borderTop: 0,
                borderBottom: 0,
              }}
            >
              <div className="mb-5 space-y-4">
                <TextField
                  fullWidth
                  size="small"
                  value={assetLibrarySearch}
                  onChange={(event) => setAssetLibrarySearch(event.target.value)}
                  placeholder="Search by asset name, copy, prompt or format"
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
                  }}
                />
                <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
                  {([
                    ["ALL", "All", assetLibrary.length],
                    ["IMAGE", "Images", assetLibrary.filter((item) => item.kind === "IMAGE").length],
                    ["VIDEO", "Videos", assetLibrary.filter((item) => item.kind === "VIDEO").length],
                    ["LOGO", "Logos", assetLibrary.filter((item) => item.kind === "LOGO").length],
                    ["TEXT", "Copy & text", assetLibrary.filter((item) => item.kind === "TEXT").length],
                  ] as const).map(([value, label, count]) => (
                    <Button
                      key={value}
                      size="small"
                      variant={assetLibraryFilter === value ? "contained" : "outlined"}
                      color={assetLibraryFilter === value ? "primary" : "inherit"}
                      sx={{
                        borderColor: assetLibraryFilter === value ? "primary.main" : "#e2e8f0",
                        bgcolor: assetLibraryFilter === value ? "primary.main" : "#fff",
                        color: assetLibraryFilter === value ? "#fff" : "#475569",
                        "&:hover": {
                          bgcolor: assetLibraryFilter === value ? "primary.dark" : "#f1f5f9",
                          borderColor: assetLibraryFilter === value ? "primary.dark" : "#cbd5e1",
                        },
                      }}
                      onClick={() => setAssetLibraryFilter(value)}
                    >
                      {label} ({count})
                    </Button>
                  ))}
                </div>
              </div>
              {assetLibraryLoading && (
                <div className="flex min-h-32 items-center justify-center">
                  <CircularProgress size={28} />
                  <span className="ml-3 text-sm text-slate-500">
                    Loading saved assets…
                  </span>
                </div>
              )}
              {assetLibraryError && (
                <Alert severity="error" sx={{ mb: 2, borderRadius: "10px" }}>
                  {assetLibraryError}
                </Alert>
              )}
              {assetNotice && (
                <Alert severity="info" sx={{ mb: 2, borderRadius: "10px" }}>
                  {assetNotice}
                </Alert>
              )}
              {!assetLibraryLoading && assetLibrary.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <p className="text-sm font-semibold text-slate-700">
                    No saved assets yet
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Generate a creative or upload media in the full Asset
                    Library.
                  </p>
                </div>
              )}
              {!assetLibraryLoading && assetLibrary.length > 0 && filteredAssetLibrary.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <p className="text-sm font-semibold text-slate-700">No matching assets</p>
                  <p className="mt-1 text-xs text-slate-500">Try another category or search term.</p>
                </div>
              )}
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {filteredAssetLibrary.map((asset) => {
                  const textParts = asset.kind === "TEXT" ? getLibraryTextParts(asset) : null;
                  const previewUrl = assetLibraryPreviewUrls[asset.id] ||
                    (!asset.contentUrl ? asset.url : "");
                  const isImageAsset = asset.kind === "IMAGE" || asset.kind === "LOGO";
                  return (
                    <div
                      key={asset.id}
                      className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                    >
                      {isImageAsset ? (
                        <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden border-b border-slate-100 bg-gradient-to-br from-slate-100 to-slate-200 p-3">
                          {previewUrl && !assetLibraryPreviewFailures[asset.id] ? (
                            <img
                              src={previewUrl}
                              alt={asset.name}
                              loading="lazy"
                              onError={() =>
                                setAssetLibraryPreviewFailures((current) => ({
                                  ...current,
                                  [asset.id]: true,
                                }))
                              }
                              className="h-full w-full rounded-lg object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                            />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white/70 px-4 text-center">
                              <span className="text-xs font-semibold text-slate-500">
                                {assetLibraryPreviewFailures[asset.id] ? "Image preview could not be loaded" : asset.contentUrl ? "Loading private preview…" : "Preview unavailable"}
                              </span>
                              <span className="text-[10px] leading-4 text-slate-400">
                                {assetLibraryPreviewFailures[asset.id] ? "The saved asset remains available for campaign selection" : asset.contentUrl ? "Retrieving image from your private library" : "The original file is still available for campaign selection"}
                              </span>
                            </div>
                          )}
                          <span className="absolute left-3 top-3 rounded-full border border-white/70 bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 shadow-sm">
                            {asset.kind === "LOGO" ? "Logo" : "Image"}
                          </span>
                        </div>
                      ) : (
                        <div className="flex aspect-[4/3] items-center justify-center border-b border-slate-100 bg-gradient-to-br from-slate-50 to-slate-100 text-sm font-semibold text-slate-500">
                          {asset.kind === "VIDEO" ? "Video asset" : asset.kind === "TEXT" ? "Copy & text asset" : `${asset.kind} asset`}
                        </div>
                      )}
                      <div className="flex flex-1 flex-col p-4">
                        <p className="break-words text-sm font-semibold leading-5 text-slate-900">
                          {asset.name}
                        </p>
                        <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
                          {asset.kind} <span className="px-1 text-slate-300">·</span> {asset.origin || "MANUAL"} <span className="px-1 text-slate-300">·</span> {asset.addedAt}
                        </p>
                        {isAiStudioLogo(asset) && (
                          <div className={`mt-2 rounded-lg border p-2 text-[10px] leading-4 ${asset.reviewStatus === "APPROVED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : asset.reviewStatus === "REJECTED" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                            <p className="font-semibold">AI logo · {asset.reviewStatus || "DRAFT"}</p>
                            <p>
                              {asset.reviewStatus === "APPROVED"
                                ? "Approved by you and available for Performance Max logo slots."
                                : asset.reviewStatus === "REJECTED"
                                  ? "Rejected. It cannot be assigned until you approve it."
                                  : "Draft concept. Review it and approve it before campaign use."}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button
                                size="small"
                                variant="contained"
                                color="success"
                                disabled={reviewingAssetIds.includes(asset.id) || asset.reviewStatus === "APPROVED"}
                                onClick={() => void reviewAiLogoAsset(asset, "APPROVED")}
                              >
                                {reviewingAssetIds.includes(asset.id) ? "Saving…" : "Approve logo"}
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                disabled={reviewingAssetIds.includes(asset.id) || asset.reviewStatus === "REJECTED"}
                                onClick={() => void reviewAiLogoAsset(asset, "REJECTED")}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        )}
                        {asset.aspectRatio && (
                          <p className="mt-1 text-[10px] text-slate-400">
                            Aspect ratio: {asset.aspectRatio}
                          </p>
                        )}
                        {asset.textContent && (
                          <p className="mt-3 line-clamp-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                            {asset.textContent}
                          </p>
                        )}
                        {asset.kind === "TEXT" && asset.googlePack && (
                          <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/60 p-2 text-[10px] leading-4 text-blue-900">
                            <p className="font-semibold">Google copy pack · {asset.googlePack.formatLabel}</p>
                            <p className="mt-1">{asset.googlePack.headlines.length} headline(s) · {asset.googlePack.descriptions.length} description(s)</p>
                            {asset.googlePack.headlines.slice(0, 2).map((headline, index) => (
                              <p key={`saved-copy-headline-${index}`} className="mt-1 line-clamp-1">Headline: {headline}</p>
                            ))}
                            {asset.googlePack.descriptions.slice(0, 1).map((description, index) => (
                              <p key={`saved-copy-description-${index}`} className="mt-1 line-clamp-2">Description: {description}</p>
                            ))}
                            {asset.googlePack.businessName && <p>Business name: {asset.googlePack.businessName}</p>}
                          </div>
                        )}
                        {asset.kind === "VIDEO" && (
                          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] leading-4 text-amber-800">
                            Video is available for viewing in this library, but direct private-video attachment is not enabled in this Campaign Creation flow yet. Use a supported hosted video ID field where available.
                          </p>
                        )}
                        <p className="mt-2 break-all text-[10px] text-slate-400">
                          Asset ID: {asset.id}
                        </p>
                        <div className="mt-auto flex flex-wrap gap-2 pt-4">
                          {asset.kind === "TEXT" && asset.googlePack && selectedPlatforms.includes("googleAds") &&
                            (["SEARCH", "PERFORMANCE_MAX", "DISPLAY", "APP"].includes(googleCampaignType) ||
                              (googleCampaignType === "DEMAND_GEN" && ["MULTI_ASSET", "CAROUSEL"].includes(googleDemandGenFormat))) && (
                              <Button
                                size="small"
                                variant="contained"
                                onClick={() => {
                                  if (!applyGoogleCopyPack(asset.googlePack!)) return;
                                  setAttachedCreativeAssetIds((current) => current.includes(asset.id) ? current : [...current, asset.id]);
                                  setAssetNotice(`${asset.name} copy pack applied to the current Google ${googleCampaignType.replaceAll("_", " ")} draft.`);
                                }}
                              >
                                Apply Google copy pack
                              </Button>
                            )}
                          {asset.kind === "TEXT" && asset.textContent && (
                            <div className="w-full space-y-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Use this copy in</p>
                              {selectedPlatforms.includes("googleAds") && ["SEARCH", "PERFORMANCE_MAX", "DISPLAY", "APP"].includes(googleCampaignType) && (
                                <div className="flex flex-wrap gap-2">
                                  <Button size="small" variant="outlined" onClick={() => applyTextLibraryAsset(asset, "google-headline")}>Google headline</Button>
                                  <Button size="small" variant="outlined" onClick={() => applyTextLibraryAsset(asset, "google-description")}>Google description</Button>
                                  {(["PERFORMANCE_MAX", "DISPLAY"].includes(googleCampaignType)) && (
                                    <Button size="small" variant="outlined" onClick={() => applyTextLibraryAsset(asset, "google-long-headline")}>Google long headline</Button>
                                  )}
                                </div>
                              )}
                              {selectedPlatforms.includes("metaAds") && (
                                <div className="flex flex-wrap gap-2">
                                  <Button size="small" variant="outlined" onClick={() => applyTextLibraryAsset(asset, "meta-primary-text")}>Meta primary text</Button>
                                  <Button size="small" variant="outlined" onClick={() => applyTextLibraryAsset(asset, "meta-headline")}>Meta headline</Button>
                                  <Button size="small" variant="outlined" onClick={() => applyTextLibraryAsset(asset, "meta-description")}>Meta description</Button>
                                  {textParts?.callToAction && (
                                    <Button size="small" variant="outlined" onClick={() => applyTextLibraryAsset(asset, "meta-cta")}>Use CTA: {textParts.callToAction}</Button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {asset.kind === "IMAGE" &&
                            selectedPlatforms.includes("metaAds") &&
                            metaCreativeFormat === "SINGLE_IMAGE" && (
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => useLibraryAsset(asset, "meta")}
                              >
                                Select for Meta
                              </Button>
                            )}
                          {(asset.kind === "IMAGE" || asset.kind === "LOGO") &&
                            googleCampaignType === "PERFORMANCE_MAX" && (
                              <>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  disabled={isAiGeneratedLogoDraft(asset)}

                                  onClick={() =>
                                    useLibraryAsset(asset, "pmax-logo")
                                  }
                                >
                                  PMax logo
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  disabled={isAiGeneratedLogoDraft(asset)}
                                  onClick={() =>
                                    useLibraryAsset(
                                      asset,
                                      "pmax-landscape-logo",
                                    )
                                  }
                                >
                                  PMax landscape logo
                                </Button>
                                {isAiGeneratedLogoDraft(asset) && (
                                  <p className="w-full text-[10px] text-amber-700">
                                    Approve this AI logo above before assigning it to PMax.
                                  </p>
                                )}
                              </>
                            )}
                          {asset.kind === "IMAGE" &&
                            googleCampaignType === "PERFORMANCE_MAX" && (
                              <>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() =>
                                    useLibraryAsset(asset, "pmax-landscape")
                                  }
                                >
                                  PMax landscape
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() =>
                                    useLibraryAsset(asset, "pmax-square")
                                  }
                                >
                                  PMax square
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() =>
                                    useLibraryAsset(asset, "pmax-portrait")
                                  }
                                >
                                  PMax portrait
                                </Button>
                              </>
                            )}
                          {asset.kind === "IMAGE" &&
                            googleCampaignType === "DISPLAY" && (
                              <>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() =>
                                    useLibraryAsset(asset, "google-display")
                                  }
                                >
                                  Display landscape
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() =>
                                    useLibraryAsset(
                                      asset,
                                      "google-display-square",
                                    )
                                  }
                                >
                                  Display square
                                </Button>
                              </>
                            )}
                          {asset.kind === "IMAGE" &&
                            googleCampaignType === "DEMAND_GEN" &&
                            ["MULTI_ASSET", "CAROUSEL"].includes(
                              googleDemandGenFormat,
                            ) && (
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() =>
                                  useLibraryAsset(asset, "demand-gen")
                                }
                              >
                                Select for Demand Gen
                              </Button>
                            )}
                          {asset.kind === "IMAGE" &&
                            googleCampaignType === "APP" && (
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() =>
                                  useLibraryAsset(asset, "app-image")
                                }
                              >
                                Select app image
                              </Button>
                            )}
                        </div>
                        {campaignAssetAssignments[asset.id]?.platform ===
                          "googleAds" &&
                          campaignAssetAssignments[asset.id]?.capabilityId ===
                          "google-display-responsive-display" && (
                            <p className="mt-2 text-[10px] font-bold text-blue-700">
                              Google Display ·{" "}
                              {campaignAssetAssignments[asset.id].role} · slot{" "}
                              {campaignAssetAssignments[asset.id].assetIndex +
                                1}
                            </p>
                          )}
                        {campaignAssetAssignments[asset.id]?.platform ===
                          "googleAds" &&
                          campaignAssetAssignments[asset.id]?.capabilityId ===
                          "google-performance-max-asset-group" && (
                            <p className="mt-2 text-[10px] font-bold text-blue-700">
                              Google Performance Max ·{" "}
                              {campaignAssetAssignments[asset.id].role} · slot{" "}
                              {campaignAssetAssignments[asset.id].assetIndex +
                                1}
                            </p>
                          )}
                        {attachedCreativeAssetIds.includes(asset.id) && (
                          <p className="mt-1 text-[10px] font-bold text-emerald-700">
                            Attached to this campaign
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </DialogContent>
            <DialogActions
              sx={{
                px: { xs: 2, sm: 3 },
                py: 2,
                gap: 1.5,
                justifyContent: "space-between",
                borderTop: "1px solid #e2e8f0",
                bgcolor: "#fff",
              }}
            >
              <Button component={Link} href="/dashboard/assets" variant="text" color="inherit">
                Open full Asset Library
              </Button>
              <Button
                onClick={() => setAssetLibraryOpen(false)}
                variant="contained"
                sx={{ minWidth: 104, bgcolor: "#0f172a", "&:hover": { bgcolor: "#1e293b" } }}
              >
                Done
              </Button>
            </DialogActions>
          </Dialog>

          <section className="mt-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold">Ad Creation & Assets</h2>
              <p className="mt-1 text-sm text-slate-500">
                Create the ad content that belongs to the groups and ad sets
                configured in the previous step. Each provider keeps its native
                format.
              </p>
            </div>

            {selectedPlatforms.includes("googleAds") && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">
                      Google Ads creative
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Format depends on the selected campaign type: Search ad,
                      responsive display / Demand Gen draft, or Performance Max
                      asset group.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAssetLibraryOpen(true);
                      setAssetNotice("");
                    }}
                    className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    Open Asset Library
                  </button>
                </div>

                {googleCampaignType === "SEARCH" && (
                  <div className="mt-5 space-y-4">
                    <div>
                      <label className={labelClass}>Final URL *</label>
                      <input
                        type="url"
                        value={googleSearchFinalUrl}
                        onChange={(e) => {
                          setGoogleSearchFinalUrl(e.target.value);
                          clearPreview();
                        }}
                        placeholder={
                          websiteUrl || "https://www.example.com/landing-page"
                        }
                        className={inputClass}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>
                          Display path 1 (optional)
                        </label>
                        <input
                          value={googleSearchPath1}
                          onChange={(e) => {
                            setGoogleSearchPath1(e.target.value);
                            clearPreview();
                          }}
                          maxLength={15}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Display path 2 (optional)
                        </label>
                        <input
                          value={googleSearchPath2}
                          onChange={(e) => {
                            setGoogleSearchPath2(e.target.value);
                            clearPreview();
                          }}
                          maxLength={15}
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>
                        Responsive Search Ad headlines * (3–15; one per line;
                        maximum 30 characters each)
                      </label>
                      <textarea
                        rows={5}
                        value={googleSearchHeadlines}
                        onChange={(e) => {
                          setGoogleSearchHeadlines(e.target.value);
                          clearPreview();
                        }}
                        placeholder={
                          "Build better workflows\nManage projects in one place\nStart your free trial"
                        }
                        className={inputClass}
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        {
                          googleSearchHeadlines
                            .split("\n")
                            .filter((item) => item.trim()).length
                        }{" "}
                        headline(s)
                      </p>
                    </div>
                    <div>
                      <label className={labelClass}>
                        Descriptions * (2–4; one per line; maximum 90 characters
                        each)
                      </label>
                      <textarea
                        rows={4}
                        value={googleSearchDescriptions}
                        onChange={(e) => {
                          setGoogleSearchDescriptions(e.target.value);
                          clearPreview();
                        }}
                        placeholder={
                          "Plan work, collaborate and deliver projects faster.\nTry the workspace built for growing teams."
                        }
                        className={inputClass}
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        {
                          googleSearchDescriptions
                            .split("\n")
                            .filter((item) => item.trim()).length
                        }{" "}
                        description(s)
                      </p>
                    </div>
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                      This creates a Responsive Search Ad draft under the Search
                      Ad Group. In the real integration, the backend maps the
                      headlines, descriptions and final URL into Google's
                      `AdGroupAd` / `ResponsiveSearchAd` resources.
                    </div>
                  </div>
                )}

                {googleCampaignType === "PERFORMANCE_MAX" && (
                  <div className="mt-5 space-y-4">
                    <div>
                      <label className={labelClass}>Final URL *</label>
                      <input
                        type="url"
                        value={pmaxFinalUrl}
                        onChange={(e) => {
                          setPmaxFinalUrl(e.target.value);
                          clearPreview();
                        }}
                        placeholder={
                          websiteUrl || "https://www.example.com/landing-page"
                        }
                        className={inputClass}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>Business Name *</label>
                        <input
                          value={pmaxBusinessName}
                          onChange={(e) => {
                            setPmaxBusinessName(e.target.value);
                            clearPreview();
                          }}
                          maxLength={25}
                          placeholder="Your business name (max 25 characters)"
                          className={inputClass}
                        />
                      </div>
                      <div className="rounded-xl border border-slate-200 p-4">
                        <label className="flex items-start gap-3 text-sm font-semibold text-slate-800">
                          <input
                            type="checkbox"
                            checked={pmaxBrandGuidelinesEnabled}
                            onChange={(e) => {
                              setPmaxBrandGuidelinesEnabled(e.target.checked);
                              clearPreview();
                            }}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300"
                          />
                          Enable Google brand guidelines
                        </label>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          {pmaxBrandGuidelinesEnabled
                            ? "Business Name and Logo are linked to the campaign. This setting is locked when the campaign is created."
                            : "Business Name and Logo are linked to each custom Asset Group. This setting is locked when the campaign is created."}
                        </p>
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>
                        Headlines * (minimum 3; one per line; maximum 30
                        characters each)
                      </label>
                      <textarea
                        rows={4}
                        value={pmaxHeadlines}
                        onChange={(e) => {
                          setPmaxHeadlines(e.target.value);
                          clearPreview();
                        }}
                        placeholder={
                          "Your first headline\nYour second headline\nYour third headline"
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Long Headlines * (1–5; one per line; maximum 90
                        characters each)
                      </label>
                      <textarea
                        rows={2}
                        value={pmaxLongHeadline}
                        onChange={(e) => {
                          setPmaxLongHeadline(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Descriptions * (2–5; at least one must be 60 characters
                        or fewer; maximum 90 characters each)
                      </label>
                      <textarea
                        rows={4}
                        value={pmaxDescriptions}
                        onChange={(e) => {
                          setPmaxDescriptions(e.target.value);
                          clearPreview();
                        }}
                        placeholder={"First description\nSecond description"}
                        className={inputClass}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>
                          {pmaxBrandGuidelinesEnabled
                            ? "Campaign Logo *"
                            : "Asset Group Logo *"}
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setAssetLibraryOpen(true);
                            setAssetNotice(
                              "Choose a square brand logo and select PMax logo in the Asset Library.",
                            );
                          }}
                          className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-blue-700"
                        >
                          Choose Logo from Asset Library
                        </button>
                        <p className="mt-2 text-xs text-slate-500">
                          {
                            getAttachedGooglePmaxAssets(
                              GOOGLE_PMAX_REQUIREMENTS.LOGO,
                            ).length
                          }{" "}
                          logo asset(s) attached.{" "}
                          {pmaxBrandGuidelinesEnabled
                            ? "This logo will be linked at campaign level."
                            : "This logo will be linked to the Asset Group."}{" "}
                          Use an approved brand logo; AI image generation must
                          not invent your logo.
                        </p>
                      </div>
                      <div>
                        <label className={labelClass}>Landscape Image *</label>
                        <button
                          type="button"
                          onClick={() => {
                            setAssetLibraryOpen(true);
                            setAssetNotice(
                              "Choose an image and select PMax landscape in the Asset Library.",
                            );
                          }}
                          className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-blue-700"
                        >
                          Choose Landscape Image
                        </button>
                        <p className="mt-2 text-xs text-slate-500">
                          {
                            getAttachedGooglePmaxAssets(
                              GOOGLE_PMAX_REQUIREMENTS.LANDSCAPE,
                            ).length
                          }{" "}
                          landscape image(s) attached. Target ratio: 1.91:1.
                        </p>
                      </div>
                      <div>
                        <label className={labelClass}>Square Image *</label>
                        <button
                          type="button"
                          onClick={() => {
                            setAssetLibraryOpen(true);
                            setAssetNotice(
                              "Choose an image and select PMax square in the Asset Library.",
                            );
                          }}
                          className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-blue-700"
                        >
                          Choose Square Image
                        </button>
                        <p className="mt-2 text-xs text-slate-500">
                          {
                            getAttachedGooglePmaxAssets(
                              GOOGLE_PMAX_REQUIREMENTS.SQUARE,
                            ).length
                          }{" "}
                          square image(s) attached. Target ratio: 1:1.
                        </p>
                      </div>
                      <div>
                        <label className={labelClass}>
                          Portrait Image (optional)
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setAssetLibraryOpen(true);
                            setAssetNotice(
                              "Choose an image and select PMax portrait in the Asset Library.",
                            );
                          }}
                          className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-blue-700"
                        >
                          Choose Portrait Image
                        </button>
                        <p className="mt-2 text-xs text-slate-500">
                          {
                            getAttachedGooglePmaxAssets(
                              GOOGLE_PMAX_REQUIREMENTS.PORTRAIT,
                            ).length
                          }{" "}
                          portrait image(s) attached. Target ratio: 4:5.
                        </p>
                      </div>
                      <div>
                        <label className={labelClass}>
                          Landscape Logo (optional)
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setAssetLibraryOpen(true);
                            setAssetNotice(
                              "Choose a landscape logo and select PMax landscape logo in the Asset Library.",
                            );
                          }}
                          className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-blue-700"
                        >
                          Choose Landscape Logo
                        </button>
                        <p className="mt-2 text-xs text-slate-500">
                          {
                            getAttachedGooglePmaxAssets(
                              GOOGLE_PMAX_REQUIREMENTS.LANDSCAPE_LOGO,
                            ).length
                          }{" "}
                          landscape logo(s) attached. Target ratio: 4:1.{" "}
                          {pmaxBrandGuidelinesEnabled
                            ? "These are additional campaign-level brand assets (maximum four additional assets across logo types)."
                            : "These are optional Asset Group assets."}
                        </p>
                      </div>
                      <div>
                        <label className={labelClass}>
                          YouTube Video IDs (optional; one per line)
                        </label>
                        <textarea
                          rows={2}
                          value={pmaxYoutubeVideoIds}
                          onChange={(e) => {
                            setPmaxYoutubeVideoIds(e.target.value);
                            clearPreview();
                          }}
                          placeholder="YouTube video ID"
                          className={inputClass}
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          Use an existing YouTube-hosted video of at least 10
                          seconds. A private Asset Library MP4 is not a YouTube
                          video asset.
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>
                          Search Themes (optional; one per line)
                        </label>
                        <textarea
                          rows={3}
                          value={pmaxSearchThemes}
                          onChange={(e) => {
                            setPmaxSearchThemes(e.target.value);
                            clearPreview();
                          }}
                          placeholder={
                            "running shoes\ncomfortable walking shoes"
                          }
                          className={inputClass}
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          Maps to AssetGroupSignal.search_theme. These are
                          signals, not keyword targeting.
                        </p>
                      </div>
                      <div>
                        <label className={labelClass}>
                          Audience Resource Names (optional)
                        </label>
                        <Autocomplete
                          multiple
                          options={googleAudienceOptions}
                          value={googleAudienceOptions.filter((option) => pmaxAudienceResourceNames.split(/[\n,]+/).map((value) => value.trim()).includes(getGoogleLookupResourceName(option)))}
                          loading={googleAudienceLoading}
                          getOptionLabel={(option) => `${getGoogleLookupLabel(option)}${option.description ? ` — ${option.description}` : ""}`}
                          isOptionEqualToValue={(option, value) => getGoogleLookupResourceName(option) === getGoogleLookupResourceName(value)}
                          onChange={(_, options) => {
                            setPmaxAudienceResourceNames(options.map((option) => getGoogleLookupResourceName(option)).filter(Boolean).join("\n"));
                            clearPreview();
                          }}
                          renderInput={(params) => <TextField {...params} size="small" placeholder="Search customer Audiences" />}
                        />
                        {googleAudienceError && <p className="mt-2 text-xs text-red-600">{googleAudienceError}</p>}
                        {googleAudienceLoading && <p className="mt-2 text-xs text-slate-500">Loading Google Audiences...</p>}
                        <p className="mt-1 text-xs text-slate-500">
                          Maps to AssetGroupSignal.audience. Use a customers /
                          audiences resource name; create the reusable Audience
                          resource first.
                        </p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                      A non-retail Performance Max Asset Group uses linked
                      assets. In production, upload assets first and link the
                      required asset types to the Asset Group in the appropriate
                      mutate workflow. Search themes and audience signals are
                      optional signals, not hard targeting restrictions.
                    </div>
                  </div>
                )}

                {googleCampaignType === "DISPLAY" && (
                  <div className="mt-5 space-y-4">
                    <div>
                      <label className={labelClass}>Final URL *</label>
                      <input
                        type="url"
                        value={googleDisplayFinalUrl}
                        onChange={(e) => {
                          setGoogleDisplayFinalUrl(e.target.value);
                          clearPreview();
                        }}
                        placeholder={
                          websiteUrl || "https://www.example.com/landing-page"
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Headlines * (1–5; max 30 characters each)
                      </label>
                      <textarea
                        rows={3}
                        value={googleDisplayHeadlines}
                        onChange={(e) => {
                          setGoogleDisplayHeadlines(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Long Headline * (max 90 characters)
                      </label>
                      <input
                        value={googleDisplayLongHeadline}
                        onChange={(e) => {
                          setGoogleDisplayLongHeadline(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Descriptions * (1–5; max 90 characters each)
                      </label>
                      <textarea
                        rows={3}
                        value={googleDisplayDescriptions}
                        onChange={(e) => {
                          setGoogleDisplayDescriptions(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Business Name * (max 25 characters)
                      </label>
                      <input
                        value={googleDisplayBusinessName}
                        onChange={(e) => {
                          setGoogleDisplayBusinessName(e.target.value);
                          clearPreview();
                        }}
                        placeholder={businessName}
                        className={inputClass}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {/* <div>
                        <label className={labelClass}>
                          Landscape Image URL * (1.91:1; min 600×314)
                        </label>
                        <input
                          type="url"
                          value={googleDisplayImageUrl}
                          onChange={(e) => {
                            setGoogleDisplayImageUrl(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div> */}
                      <div className="mt-3 space-y-2">
                        <label className={labelClass}>
                          Upload Landscape Image to Google Ads
                        </label>

                        <input
                          type="file"
                          accept="image/jpeg,image/png"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            setGoogleDisplayLandscapeFile(file);
                            setGoogleDisplayLandscapeAssetResourceName("");
                            clearPreview();
                          }}
                          className={inputClass}
                        />

                        <button
                          type="button"
                          disabled={
                            !googleDisplayLandscapeFile ||
                            googleDisplayAssetUploading !== null
                          }
                          onClick={() =>
                            void uploadGoogleDisplayImage(
                              "LANDSCAPE",
                              googleDisplayLandscapeFile,
                            )
                          }
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {googleDisplayAssetUploading === "LANDSCAPE"
                            ? "Uploading..."
                            : "Upload Landscape Image"}
                        </button>

                        {googleDisplayLandscapeAssetResourceName && (
                          <p className="break-all text-xs text-green-700">
                            Uploaded: {googleDisplayLandscapeAssetResourceName}
                          </p>
                        )}
                      </div>
                      {/* <div>
                        <label className={labelClass}>
                          Square Image URL * (1:1; min 300×300)
                        </label>
                        <input
                          type="url"
                          value={googleDisplaySquareImageUrl}
                          onChange={(e) => {
                            setGoogleDisplaySquareImageUrl(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div> */}
                      <div className="mt-3 space-y-2">
                        <label className={labelClass}>
                          Upload Square Image to Google Ads
                        </label>

                        <input
                          type="file"
                          accept="image/jpeg,image/png"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            setGoogleDisplaySquareFile(file);
                            setGoogleDisplaySquareAssetResourceName("");
                            clearPreview();
                          }}
                          className={inputClass}
                        />

                        <button
                          type="button"
                          disabled={
                            !googleDisplaySquareFile ||
                            googleDisplayAssetUploading !== null
                          }
                          onClick={() =>
                            void uploadGoogleDisplayImage(
                              "SQUARE",
                              googleDisplaySquareFile,
                            )
                          }
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {googleDisplayAssetUploading === "SQUARE"
                            ? "Uploading..."
                            : "Upload Square Image"}
                        </button>

                        {googleDisplaySquareAssetResourceName && (
                          <p className="break-all text-xs text-green-700">
                            Uploaded: {googleDisplaySquareAssetResourceName}
                          </p>
                        )}
                      </div>

                      {googleDisplayAssetUploadError && (
                        <p className="text-xs text-red-600">
                          {googleDisplayAssetUploadError}
                        </p>
                      )}
                    </div>
                    <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                      Responsive Display Ad requirements: landscape + square
                      image, short headlines, long headline, descriptions and
                      business name. Image dimensions/ratios must be verified
                      from uploaded media metadata by the production backend.
                    </p>
                  </div>
                )}

                {googleCampaignType === "DEMAND_GEN" && (
                  <div className="mt-5 space-y-4">
                    <div>
                      <label className={labelClass}>
                        Demand Gen Ad Format *
                      </label>
                      <select
                        value={googleDemandGenFormat}
                        onChange={(e) => {
                          setGoogleDemandGenFormat(
                            e.target.value as typeof googleDemandGenFormat,
                          );
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        <option value="MULTI_ASSET">
                          Multi-asset image ad
                        </option>
                        <option value="VIDEO_RESPONSIVE">
                          Responsive video ad
                        </option>
                        <option value="CAROUSEL">Carousel ad</option>
                        <option value="PRODUCT_FEED">Product feed ad</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Final URL *</label>
                      <input
                        type="url"
                        value={googleDisplayFinalUrl}
                        onChange={(e) => {
                          setGoogleDisplayFinalUrl(e.target.value);
                          clearPreview();
                        }}
                        placeholder={
                          websiteUrl || "https://www.example.com/landing-page"
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Business Name *</label>
                      <input
                        value={googleDisplayBusinessName}
                        onChange={(e) => {
                          setGoogleDisplayBusinessName(e.target.value);
                          clearPreview();
                        }}
                        placeholder={businessName}
                        className={inputClass}
                      />
                    </div>
                    {googleDemandGenFormat === "MULTI_ASSET" && (
                      <>
                        <div>
                          <label className={labelClass}>Headlines *</label>
                          <textarea
                            rows={3}
                            value={googleDisplayHeadlines}
                            onChange={(e) => {
                              setGoogleDisplayHeadlines(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Descriptions *</label>
                          <textarea
                            rows={3}
                            value={googleDisplayDescriptions}
                            onChange={(e) => {
                              setGoogleDisplayDescriptions(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Image URL *</label>
                          <input
                            type="url"
                            value={googleDisplayImageUrl}
                            onChange={(e) => {
                              setGoogleDisplayImageUrl(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                      </>
                    )}
                    {googleDemandGenFormat === "VIDEO_RESPONSIVE" && (
                      <>
                        <div>
                          <label className={labelClass}>
                            YouTube Video IDs * (one per line)
                          </label>
                          <textarea
                            rows={2}
                            value={googleDemandGenVideoIds}
                            onChange={(e) => {
                              setGoogleDemandGenVideoIds(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>
                            Logo Image URL * (v24+)
                          </label>
                          <input
                            type="url"
                            value={googleDemandGenLogoUrl}
                            onChange={(e) => {
                              setGoogleDemandGenLogoUrl(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                      </>
                    )}
                    {googleDemandGenFormat === "PRODUCT_FEED" && (
                      <>
                        <div>
                          <label className={labelClass}>
                            Merchant Center Account ID *
                          </label>
                          <input
                            inputMode="numeric"
                            value={googleMerchantCenterId}
                            onChange={(e) => {
                              setGoogleMerchantCenterId(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                            placeholder="Linked Merchant Center ID"
                          />
                        </div>
                        <div>
                          <label className={labelClass}>
                            Feed Label (optional)
                          </label>
                          <input
                            value={googleShoppingFeedLabel}
                            onChange={(e) => {
                              setGoogleShoppingFeedLabel(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>
                            Product Ad Headline *
                          </label>
                          <input
                            value={googleDemandGenProductHeadline}
                            onChange={(e) => {
                              setGoogleDemandGenProductHeadline(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>
                            Product Ad Description *
                          </label>
                          <input
                            value={googleDemandGenProductDescription}
                            onChange={(e) => {
                              setGoogleDemandGenProductDescription(
                                e.target.value,
                              );
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>
                            Square Logo URL * (min 128×128)
                          </label>
                          <input
                            type="url"
                            value={googleDemandGenProductLogoUrl}
                            onChange={(e) => {
                              setGoogleDemandGenProductLogoUrl(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>
                            Product Listing Selection
                          </label>
                          <select
                            value={googleDemandGenProductGroupMode}
                            onChange={(e) => {
                              setGoogleDemandGenProductGroupMode(
                                e.target.value as
                                | "ALL_PRODUCTS"
                                | "SELECTED_PRODUCTS",
                              );
                              clearPreview();
                            }}
                            className={inputClass}
                          >
                            <option value="ALL_PRODUCTS">All products</option>
                            <option value="SELECTED_PRODUCTS">
                              Selected product groups (backend listing tree
                              required)
                            </option>
                          </select>
                        </div>
                        <p className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                          Requires Merchant Center linked to Google Ads. Product
                          feed and listing-group criteria are managed separately
                          from the creative.
                        </p>
                      </>
                    )}
                    {googleDemandGenFormat === "CAROUSEL" && (
                      <div>
                        <label className={labelClass}>
                          Carousel Cards * (2–10; one per line: headline | image
                          URL | final URL)
                        </label>
                        <textarea
                          rows={5}
                          value={googleDemandGenCarouselCards}
                          onChange={(e) => {
                            setGoogleDemandGenCarouselCards(e.target.value);
                            clearPreview();
                          }}
                          placeholder={
                            "Explore products | https://cdn.example.com/card1.jpg | https://example.com/product1"
                          }
                          className={inputClass}
                        />
                      </div>
                    )}
                    <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                      Demand Gen uses dedicated API ad resources:
                      DemandGenMultiAssetAdInfo, DemandGenVideoResponsiveAdInfo
                      or DemandGenCarouselAdInfo. These are not Responsive
                      Display Ads. Video ad assets and logos must be
                      uploaded/linked as Google Asset resources.
                    </p>
                  </div>
                )}

                {googleCampaignType === "APP" && (
                  <div className="mt-5 space-y-4">
                    <div>
                      <label className={labelClass}>
                        App Ad Headlines * (one per line)
                      </label>
                      <textarea
                        rows={3}
                        value={googleAppHeadlines}
                        onChange={(e) => {
                          setGoogleAppHeadlines(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        App Ad Descriptions * (one per line)
                      </label>
                      <textarea
                        rows={3}
                        value={googleAppDescriptions}
                        onChange={(e) => {
                          setGoogleAppDescriptions(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Image Asset URLs (one per line)
                      </label>
                      <textarea
                        rows={3}
                        value={googleAppImageUrls}
                        onChange={(e) => {
                          setGoogleAppImageUrls(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        YouTube Video IDs (optional; one per line)
                      </label>
                      <textarea
                        rows={2}
                        value={googleAppYoutubeVideoIds}
                        onChange={(e) => {
                          setGoogleAppYoutubeVideoIds(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    {googleAppSubtype === "APP_CAMPAIGN_FOR_ENGAGEMENT" && (
                      <>
                        <div>
                          <label className={labelClass}>
                            Eligible App-User Audience Resource *
                          </label>
                          <Autocomplete
                            options={googleAudienceOptions}
                            value={googleAudienceOptions.find((option) => getGoogleLookupResourceName(option) === googleAppEngagementAudienceResource) ?? null}
                            loading={googleAudienceLoading}
                            getOptionLabel={(option) => getGoogleLookupLabel(option)}
                            isOptionEqualToValue={(option, value) => getGoogleLookupResourceName(option) === getGoogleLookupResourceName(value)}
                            onChange={(_, option) => {
                              setGoogleAppEngagementAudienceResource(option ? getGoogleLookupResourceName(option) : "");
                              clearPreview();
                            }}
                            renderInput={(params) => <TextField {...params} size="small" placeholder="Select an eligible Google Audience" />}
                          />
                          {googleAudienceError && <p className="mt-2 text-xs text-red-600">{googleAudienceError}</p>}
                        </div>
                        <div>
                          <label className={labelClass}>
                            Selective Conversion Action Resources * (one per
                            line)
                          </label>
                          <Autocomplete
                            multiple
                            options={googleConversionActionOptions}
                            value={googleConversionActionOptions.filter((option) => googleAppSelectiveConversionActions.split(/[\n,]+/).map((value) => value.trim()).includes(getGoogleLookupResourceName(option)))}
                            loading={googleConversionActionLoading}
                            getOptionLabel={(option) => `${getGoogleLookupLabel(option)}${option.category ? ` · ${option.category}` : ""}${option.primaryForGoal === false ? " · Secondary" : ""}`}
                            isOptionEqualToValue={(option, value) => getGoogleLookupResourceName(option) === getGoogleLookupResourceName(value)}
                            onChange={(_, options) => {
                              setGoogleAppSelectiveConversionActions(options.map((option) => getGoogleLookupResourceName(option)).filter(Boolean).join("\n"));
                              clearPreview();
                            }}
                            renderInput={(params) => <TextField {...params} size="small" placeholder="Select conversion actions" />}
                          />
                          {googleConversionActionLoading && <p className="mt-2 text-xs text-slate-500">Loading conversion actions...</p>}
                          {googleConversionActionError && <p className="mt-2 text-xs text-red-600">{googleConversionActionError}</p>}
                        </div>
                      </>
                    )}
                    <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                      Google maps the selected subtype to AppAdInfo,
                      AppEngagementAdInfo or AppPreRegistrationAdInfo.
                      Engagement requires an eligible UserList criterion and
                      selective-optimization conversion actions. Media must
                      exist as Google Asset resources before linking. The legacy
                      UI-only App Campaign installs workflow is distinct from
                      API-supported current App campaign subtypes.
                    </p>
                  </div>
                )}

                {["SHOPPING", "HOTEL", "APP"].includes(googleCampaignType) && (
                  <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                    {googleCampaignType === "SHOPPING" &&
                      "Shopping ads are primarily built from the linked Merchant Center product feed. Product titles, images, prices and landing pages are managed in Merchant Center rather than through a standard manual ad creative form."}
                    {googleCampaignType === "HOTEL" &&
                      "Hotel campaigns use Hotel Center property, availability and price data. They do not use a standard manually authored text/image ad creative in this wizard."}
                    {googleCampaignType === "APP" &&
                      "App campaign creatives use subtype-specific AppAdInfo, AppEngagementAdInfo or AppPreRegistrationAdInfo. Add the text and existing media assets below."}
                  </div>
                )}
              </div>
            )}

            {selectedPlatforms.includes("metaAds") && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">
                      Meta Ads — Ad Creative
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      The creative is created separately and then referenced by
                      the Meta Ad resource.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAssetLibraryOpen(true);
                      setAssetNotice("");
                    }}
                    className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    Open Asset Library
                  </button>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Creative Format *</label>
                    <select
                      value={metaCreativeFormat}
                      onChange={(e) => {
                        setMetaCreativeFormat(
                          e.target.value as typeof metaCreativeFormat,
                        );
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      <option value="SINGLE_IMAGE">Single image</option>
                      <option value="SINGLE_VIDEO">Single video</option>
                      <option value="CAROUSEL">Carousel (2–10 cards)</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Destination Type *</label>
                    <select
                      value={metaDestinationType}
                      onChange={(e) => {
                        setMetaDestinationType(
                          e.target.value as typeof metaDestinationType,
                        );
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      <option value="WEBSITE">Website</option>
                      <option value="INSTANT_FORM">
                        Instant Form (existing form)
                      </option>
                      <option value="MESSAGING">
                        Messaging (connected destination)
                      </option>
                      <option value="APP">Mobile App</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Facebook Page *</label>
                    <select
                      value={metaPageId}
                      onChange={(e) => {
                        const nextPageId = e.target.value;
                        const nextPage = metaPageOptions.find(
                          (page) => page.id === nextPageId,
                        );
                        setMetaPageId(nextPageId);
                        setMetaInstagramActorId(
                          nextPage?.instagram_business_account?.id ?? "",
                        );
                        clearPreview();
                      }}
                      disabled={metaPagesLoading || metaPageOptions.length === 0}
                      className={inputClass}
                    >
                      <option value="">
                        {metaPagesLoading
                          ? "Loading Facebook Pages..."
                          : metaPageOptions.length
                            ? "Select a Facebook Page"
                            : "No Facebook Pages loaded"}
                      </option>
                      {metaPageOptions.map((page) => {
                        const hasAdvertiseTask =
                          !page.tasks?.length || page.tasks.includes("ADVERTISE");
                        return (
                          <option
                            key={page.id}
                            value={page.id}
                            disabled={!hasAdvertiseTask}
                          >
                            {page.name || "Unnamed Facebook Page"} · {page.id}
                            {!hasAdvertiseTask ? " · No ADVERTISE task" : ""}
                          </option>
                        );
                      })}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      Pages are loaded from the connected Meta identity. Page IDs are stored automatically; they are not entered manually.
                    </p>
                    {metaPagesError && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-red-600">{metaPagesError}</p>
                        <button
                          type="button"
                          onClick={() => void refreshMetaPages()}
                          disabled={metaPagesLoading}
                          className="text-xs font-semibold text-blue-700 disabled:opacity-50"
                        >
                          Retry Page lookup
                        </button>
                      </div>
                    )}
                    {selectedMetaPage && (
                      <p className="mt-2 text-xs text-slate-500">
                        Page tasks: {selectedMetaPage.tasks?.length
                          ? selectedMetaPage.tasks.join(", ")
                          : "Not returned by Meta"}
                      </p>
                    )}
                    {!metaPagesLoading &&
                      !metaPagesError &&
                      connections.metaAds.selectedAccountId &&
                      metaPageOptions.length === 0 && (
                        <p className="mt-2 text-xs text-amber-700">
                          No Facebook Pages were returned. Check that the connected Meta identity has access to a Page and the required Page permissions.
                        </p>
                      )}
                    {metaPagesNextCursor && (
                      <button
                        type="button"
                        onClick={() => void loadMoreMetaPages()}
                        disabled={metaPagesLoading}
                        className="mt-2 text-xs font-semibold text-blue-700 disabled:opacity-50"
                      >
                        {metaPagesLoading ? "Loading..." : "Load more Pages"}
                      </button>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>
                      Linked Instagram Professional Account (optional)
                    </label>
                    <select
                      value={metaInstagramActorId}
                      onChange={(e) => {
                        setMetaInstagramActorId(e.target.value);
                        clearPreview();
                      }}
                      disabled={!selectedMetaInstagram}
                      className={inputClass}
                    >
                      <option value="">Do not use Instagram identity</option>
                      {selectedMetaInstagram && (
                        <option value={selectedMetaInstagram.id}>
                          {selectedMetaInstagram.username
                            ? `@${selectedMetaInstagram.username}`
                            : "Linked Instagram professional account"} · {selectedMetaInstagram.id}
                        </option>
                      )}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedMetaInstagram
                        ? "This Instagram professional account is linked to the selected Facebook Page."
                        : metaPageId
                          ? "No linked Instagram professional account was returned for this Page."
                          : "Select a Facebook Page to check its linked Instagram account."}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Primary Text *</label>
                    <textarea
                      rows={4}
                      value={metaPrimaryText}
                      onChange={(e) => {
                        setMetaPrimaryText(e.target.value);
                        clearPreview();
                      }}
                      placeholder="Write the main message users will see in the ad..."
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Ad Headline *</label>
                    <input
                      value={metaAdHeadline}
                      onChange={(e) => {
                        setMetaAdHeadline(e.target.value);
                        clearPreview();
                      }}
                      placeholder="A short compelling headline"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      Ad Description (optional)
                    </label>
                    <input
                      value={metaAdDescription}
                      onChange={(e) => {
                        setMetaAdDescription(e.target.value);
                        clearPreview();
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Call to Action</label>
                    <select
                      value={metaCallToAction}
                      onChange={(e) => {
                        setMetaCallToAction(e.target.value);
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      <option value="LEARN_MORE">Learn More</option>
                      <option value="SHOP_NOW">Shop Now</option>
                      <option value="SIGN_UP">Sign Up</option>
                      <option value="CONTACT_US">Contact Us</option>
                      <option value="GET_QUOTE">Get Quote</option>
                      <option value="DOWNLOAD">Download</option>
                    </select>
                  </div>
                  {metaCreativeFormat === "SINGLE_IMAGE" && (
                    <div>
                      <label className={labelClass}>Creative Image URL *</label>
                      <input
                        type="url"
                        value={metaCreativeImageUrl}
                        onChange={(e) => {
                          setMetaCreativeImageUrl(e.target.value);
                          clearPreview();
                        }}
                        placeholder="https://.../ad-image.jpg"
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setAssetLibraryOpen(true);
                          setAssetNotice(
                            "Choose an image for the Meta creative.",
                          );
                        }}
                        className="mt-2 text-xs font-semibold text-blue-700"
                      >
                        Choose from Asset Library
                      </button>
                    </div>
                  )}
                  {metaCreativeFormat === "SINGLE_VIDEO" && (
                    <div>
                      <label className={labelClass}>
                        Uploaded Meta Video ID *
                      </label>
                      <input
                        value={metaCreativeVideoId}
                        onChange={(e) => {
                          setMetaCreativeVideoId(e.target.value);
                          clearPreview();
                        }}
                        placeholder="Video ID returned by Meta video upload"
                        className={inputClass}
                      />
                    </div>
                  )}
                  {metaCreativeFormat === "CAROUSEL" && (
                    <div className="sm:col-span-2">
                      <label className={labelClass}>
                        Carousel Cards * (2–10; one per line: headline | image
                        URL | destination URL)
                      </label>
                      <textarea
                        rows={5}
                        value={metaCarouselCards}
                        onChange={(e) => {
                          setMetaCarouselCards(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                        placeholder={
                          "Card 1 | https://cdn.example.com/1.jpg | https://example.com/1\nCard 2 | https://cdn.example.com/2.jpg | https://example.com/2"
                        }
                      />
                    </div>
                  )}
                  {metaDestinationType === "WEBSITE" && (
                    <div>
                      <label className={labelClass}>
                        Website Destination URL *
                      </label>
                      <input
                        type="url"
                        value={metaDestinationUrl}
                        onChange={(e) => {
                          setMetaDestinationUrl(e.target.value);
                          clearPreview();
                        }}
                        placeholder={
                          websiteUrl || "https://example.com/landing-page"
                        }
                        className={inputClass}
                      />
                    </div>
                  )}
                  {metaDestinationType === "INSTANT_FORM" && (
                    <div>
                      <label className={labelClass}>
                        Existing Instant Form ID *
                      </label>
                      <input
                        value={metaInstantFormId}
                        onChange={(e) => {
                          setMetaInstantFormId(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                  )}
                  {metaDestinationType === "MESSAGING" && (
                    <>
                      <div>
                        <label className={labelClass}>
                          Messaging Destination *
                        </label>
                        <select
                          value={metaMessagingType}
                          onChange={(e) => {
                            setMetaMessagingType(
                              e.target.value as typeof metaMessagingType,
                            );
                            clearPreview();
                          }}
                          className={inputClass}
                        >
                          <option value="MESSENGER">Messenger</option>
                          <option value="INSTAGRAM_DIRECT">
                            Instagram Direct
                          </option>
                          <option value="WHATSAPP">WhatsApp</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>
                          Connected Messaging Asset ID *
                        </label>
                        <input
                          value={metaMessagingDestinationId}
                          onChange={(e) => {
                            setMetaMessagingDestinationId(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                    </>
                  )}
                  {metaDestinationType === "APP" && (
                    <>
                      <div>
                        <label className={labelClass}>Promoted App ID *</label>
                        <input
                          value={metaAppId}
                          onChange={(e) => {
                            setMetaAppId(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          App Store / Play Store URL *
                        </label>
                        <input
                          type="url"
                          value={metaAppStoreUrl}
                          onChange={(e) => {
                            setMetaAppStoreUrl(e.target.value);
                            clearPreview();
                          }}
                          placeholder="https://apps.apple.com/... or https://play.google.com/..."
                          className={inputClass}
                        />
                      </div>
                    </>
                  )}
                </div>
                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  This prototype covers website, existing Instant Form,
                  messaging destination and app destination intent for
                  single-image, video and carousel creatives. Production
                  requires eligible linked Page/app/form assets, media uploads,
                  `object_story_spec` or `asset_feed_spec`, and the AdCreative →
                  Ad creation sequence. Some objective/destination combinations
                  remain account- and API-version-dependent.
                </p>
              </div>
            )}
          </section>
        </>
      )}

      {step === 5 && (
        <section className="mt-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold">Review your unified campaign</h2>
            <p className="mt-1 text-sm text-slate-500">
              Review each provider independently before preparing the combined
              request.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="font-bold">Shared Campaign Brief</h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["Business", businessName],
                ["Campaign", campaignName],
                ["Website", websiteUrl || "Not provided"],
                ["Objective", selectedObjective?.label || "Not selected"],
                [
                  "Platforms",
                  selectedPlatforms
                    .map((item) =>
                      item === "googleAds" ? "Google Ads" : "Meta Ads",
                    )
                    .join(" + "),
                ],
                ["Description", description || "Not provided"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs font-medium uppercase text-slate-400">
                    {label}
                  </p>
                  <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-6">
            <h3 className="text-lg font-bold text-slate-900">
              Budget & Bidding API Workflow
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Budget and bidding are first-class API resources/settings—not just
              form values. The following provider-specific operations are
              included in this request plan.
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {selectedPlatforms.includes("googleAds") && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="font-semibold text-slate-900">Google Ads</p>
                  <p className="mt-2 text-sm text-slate-700">
                    <strong>Budget resource:</strong> CampaignBudget
                  </p>
                  <p className="text-sm text-slate-700">
                    <strong>Operation:</strong>{" "}
                    CampaignBudgetService.MutateCampaignBudgets
                  </p>
                  <p className="text-sm text-slate-700">
                    <strong>Period:</strong>{" "}
                    {effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                      ? "CUSTOM_PERIOD / total_amount_micros"
                      : "DAILY / amount_micros"}
                  </p>
                  <p className="text-sm text-slate-700">
                    <strong>Amount:</strong>{" "}
                    {effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                      ? googleCampaignTotalBudget
                      : googleDailyBudget}{" "}
                    {selectedCurrency(connections.googleAds)}
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    <strong>Bidding resource:</strong>{" "}
                    {effectiveGoogleBiddingScope === "PORTFOLIO"
                      ? "BiddingStrategy (portfolio)"
                      : "Campaign.campaign_bidding_strategy (standard)"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Create/resolve budget → attach its resource name to Campaign
                    → create the remaining child resources. Update the existing
                    CampaignBudget when changing budget amounts; avoid replacing
                    it without considering spend history.
                  </p>
                </div>
              )}
              {selectedPlatforms.includes("metaAds") && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="font-semibold text-slate-900">Meta Ads</p>
                  <p className="mt-2 text-sm text-slate-700">
                    <strong>Budget owner:</strong>{" "}
                    {metaBudgetLevel === "CAMPAIGN"
                      ? "Campaign (CBO)"
                      : "Ad Set (ABO)"}
                  </p>
                  <p className="text-sm text-slate-700">
                    <strong>Budget field:</strong>{" "}
                    {metaBudgetMode === "DAILY"
                      ? "daily_budget"
                      : "lifetime_budget"}
                  </p>
                  <p className="text-sm text-slate-700">
                    <strong>Bidding owner:</strong>{" "}
                    {metaBudgetLevel === "CAMPAIGN" ? "Campaign" : "Ad Set"}
                  </p>
                  {metaBudgetLevel === "AD_SET" && (
                    <p className="text-sm text-slate-700">
                      <strong>Ad set budget sharing:</strong>{" "}
                      {metaIsAdsetBudgetSharingEnabled ? "Enabled" : "Disabled"}
                    </p>
                  )}
                  <p className="text-sm text-slate-700">
                    <strong>Ad Set delivery:</strong> optimization_goal +
                    billing_event
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Create Campaign → create Ad Set. Include the budget at one
                    level only; convert to currency minor units based on the
                    account currency.
                  </p>
                </div>
              )}
            </div>
            <div className="mt-4 rounded-lg border border-indigo-100 bg-white p-3 text-xs leading-5 text-slate-600">
              <strong>Budget management after creation:</strong> Google updates
              use CampaignBudgetService; standard bidding updates use
              CampaignService and portfolio strategy updates use
              BiddingStrategyService. Meta updates target the Campaign or Ad Set
              that owns the budget. Read-back should compare configured budget
              with remaining budget and spend metrics.
            </div>
          </div>

          {selectedPlatforms.includes("googleAds") && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">Google Ads Configuration</h3>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p>
                  <strong>Account:</strong>{" "}
                  {selectedAccountLabel(connections.googleAds)}
                </p>
                <p>
                  <strong>Campaign Type:</strong>{" "}
                  {
                    googleCampaignTypes.find(
                      (item) => item.value === googleCampaignType,
                    )?.label
                  }
                </p>
                <p>
                  <strong>Google API Channel:</strong>{" "}
                  {
                    googleCampaignTypes.find(
                      (item) => item.value === googleCampaignType,
                    )?.channelType
                  }
                </p>
                <p>
                  <strong>Google Marketing Objective:</strong>{" "}
                  {googleMarketingObjective}
                </p>
                <p>
                  <strong>EU Political Advertising:</strong>{" "}
                  {googleEuPoliticalStatus || "Not declared"}
                </p>
                {googleCampaignType === "APP" ? (
                  <>
                    <p>
                      <strong>App subtype:</strong> {googleAppSubtype}
                    </p>
                    <p>
                      <strong>App goal:</strong> {effectiveGoogleAppGoal}
                    </p>
                    <p>
                      <strong>App ID:</strong> {googleAppId}
                    </p>
                  </>
                ) : googleCampaignType === "HOTEL" ? (
                  <>
                    <p>
                      <strong>Hotel Center ID:</strong> {googleHotelCenterId}
                    </p>
                    <p>
                      <strong>Hotel bidding:</strong> {googleHotelBidStrategy}
                    </p>
                  </>
                ) : googleCampaignType === "SHOPPING" ? (
                  <>
                    <p>
                      <strong>Merchant Center ID:</strong>{" "}
                      {googleMerchantCenterId}
                    </p>
                    <p>
                      <strong>Campaign priority:</strong>{" "}
                      {googleShoppingPriority}
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <strong>Performance Goal:</strong>{" "}
                      {
                        availableGooglePerformanceGoals.find(
                          (item) =>
                            item.value === effectiveGooglePerformanceGoal,
                        )?.label
                      }
                    </p>
                    <p>
                      <strong>Bidding Method:</strong>{" "}
                      {effectiveGoogleBiddingMode}
                    </p>
                    <p>
                      <strong>API Bidding Strategy:</strong>{" "}
                      {effectiveGoogleBiddingStrategy}
                    </p>
                  </>
                )}
                <p>
                  <strong>Budget Type:</strong>{" "}
                  {effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                    ? "Campaign total"
                    : "Average daily"}
                </p>
                <p>
                  <strong>Budget Amount:</strong>{" "}
                  {effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                    ? googleCampaignTotalBudget
                    : googleDailyBudget}{" "}
                  {selectedCurrency(connections.googleAds)}
                </p>
                <p>
                  <strong>Budget API:</strong> CampaignBudgetService →
                  Campaign.campaign_budget
                </p>
                <p>
                  <strong>Bidding Scope:</strong> {effectiveGoogleBiddingScope}
                </p>
                {effectiveGoogleBiddingScope === "PORTFOLIO" && (
                  <p>
                    <strong>Portfolio Strategy:</strong>{" "}
                    {googlePortfolioStrategyResourceName}
                  </p>
                )}
                {googleCampaignType === "PERFORMANCE_MAX" ? (
                  <>
                    <p>
                      <strong>Asset Group:</strong> {pmaxAssetGroupName}
                    </p>
                    <p>
                      <strong>Final URL:</strong> {pmaxFinalUrl || websiteUrl}
                    </p>
                    <p>
                      <strong>Headlines / Descriptions:</strong>{" "}
                      {
                        pmaxHeadlines.split("\n").filter((item) => item.trim())
                          .length
                      }{" "}
                      /{" "}
                      {
                        pmaxDescriptions
                          .split("\n")
                          .filter((item) => item.trim()).length
                      }
                    </p>
                    <p>
                      <strong>Business Name:</strong> {pmaxBusinessName}
                    </p>
                    <p>
                      <strong>Google Brand Guidelines:</strong>{" "}
                      {pmaxBrandGuidelinesEnabled
                        ? "Enabled (campaign-level brand assets)"
                        : "Disabled (Asset Group-level brand assets)"}
                    </p>
                    <p>
                      <strong>Search Themes:</strong>{" "}
                      {
                        pmaxSearchThemes
                          .split("\n")
                          .filter((item) => item.trim()).length
                      }
                    </p>
                    <p>
                      <strong>Audience Signals:</strong>{" "}
                      {
                        pmaxAudienceResourceNames
                          .split(/[\n,]+/)
                          .filter((item) => item.trim()).length
                      }
                    </p>
                  </>
                ) : googleCampaignType === "HOTEL" ? (
                  <>
                    <p>
                      <strong>Hotel Ad Group:</strong> {googleHotelAdGroupName}
                    </p>
                    <p>
                      <strong>Targeting:</strong> {googleHotelTargetCountry} ·{" "}
                      {googleHotelLanguage}
                    </p>
                    <p>
                      <strong>Hotel selection:</strong>{" "}
                      {googleHotelListingMode === "ALL_HOTELS"
                        ? "All hotels"
                        : `${googleHotelPropertyIds.split(/[\n,]+/).filter((item) => item.trim()).length} selected properties`}
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <strong>Ad Group:</strong> {googleAdGroupName}
                    </p>
                    {googleCampaignType === "SEARCH" && (
                      <>
                        <p>
                          <strong>Keywords:</strong>{" "}
                          {
                            googleKeywordLines
                              .split("\n")
                              .filter((item) => item.trim()).length
                          }{" "}
                          ({googleKeywordMatchType})
                        </p>
                        <p>
                          <strong>Responsive Search Ad:</strong>{" "}
                          {
                            googleSearchHeadlines
                              .split("\n")
                              .filter((item) => item.trim()).length
                          }{" "}
                          headlines ·{" "}
                          {
                            googleSearchDescriptions
                              .split("\n")
                              .filter((item) => item.trim()).length
                          }{" "}
                          descriptions
                        </p>
                        <p>
                          <strong>Ad Final URL:</strong>{" "}
                          {googleSearchFinalUrl || websiteUrl}
                        </p>
                      </>
                    )}
                  </>
                )}
                {googleCampaignType === "SEARCH" && (
                  <p>
                    <strong>Search Partners / Display expansion:</strong>{" "}
                    {googleSearchPartners ? "On" : "Off"} /{" "}
                    {googleDisplayExpansion ? "On" : "Off"}
                  </p>
                )}
              </div>
            </div>
          )}

          {selectedPlatforms.includes("metaAds") && objective && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">Meta Ads Configuration</h3>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p>
                  <strong>Account:</strong>{" "}
                  {selectedAccountLabel(connections.metaAds)}
                </p>
                <p>
                  <strong>Objective:</strong> {metaObjectiveMap[objective]}
                </p>
                <p>
                  <strong>Buying Type:</strong> {metaBuyingType}
                </p>
                <p>
                  <strong>Budget Level:</strong>{" "}
                  {metaBudgetLevel === "CAMPAIGN"
                    ? "Campaign-level"
                    : "Ad set-level"}
                </p>
                <p>
                  <strong>Budget Type:</strong> {metaBudgetMode}
                </p>
                <p>
                  <strong>Budget Amount:</strong>{" "}
                  {metaBudgetMode === "DAILY"
                    ? metaDailyBudget
                    : metaLifetimeBudget}{" "}
                  {selectedCurrency(connections.metaAds)}
                </p>
                <p>
                  <strong>Budget API Owner:</strong>{" "}
                  {metaBudgetLevel === "CAMPAIGN"
                    ? "Campaign (CBO)"
                    : "Ad Set (ABO)"}
                </p>
                <p>
                  <strong>Performance Goal (Ad Set):</strong>{" "}
                  {effectiveMetaOptimizationGoal}
                </p>
                <p>
                  <strong>Billing Event:</strong> {effectiveMetaBillingEvent}
                </p>
                <p>
                  <strong>Targeting:</strong> {metaCountries.toUpperCase()} ·{" "}
                  {metaSpecialAdCategories.length
                    ? "Special-category restrictions apply"
                    : `Ages ${metaAgeMin}–${metaAgeMax} · ${metaGender === "ALL" ? "All genders" : metaGender}`}
                </p>
                <p>
                  <strong>Bid Strategy:</strong> {metaBidStrategy}
                </p>
                {metaBidAmount && (
                  <p>
                    <strong>Bid Amount:</strong> {metaBidAmount}{" "}
                    {selectedCurrency(connections.metaAds)}
                  </p>
                )}
                {metaMinimumRoas && (
                  <p>
                    <strong>Minimum ROAS:</strong> {metaMinimumRoas}
                  </p>
                )}
                <p>
                  <strong>Special Ad Category:</strong>{" "}
                  {metaSpecialAdCategories.length
                    ? metaSpecialAdCategories.join(", ")
                    : "None"}
                </p>
                <p>
                  <strong>Ad Set:</strong> {metaAdSetName}
                </p>
                <p>
                  <strong>Facebook Page:</strong>{" "}
                  {selectedMetaPage?.name || "Not selected"}
                  {metaPageId ? ` (${metaPageId})` : ""}
                </p>
                <p>
                  <strong>Instagram account:</strong>{" "}
                  {selectedMetaInstagram?.username
                    ? `@${selectedMetaInstagram.username}`
                    : metaInstagramActorId || "Not selected"}
                </p>
                <p>
                  <strong>Pixel ID:</strong> {metaPixelId || "Not provided"}
                </p>
                <p>
                  <strong>Creative:</strong> {metaAdHeadline} ·{" "}
                  {metaCallToAction}
                </p>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="font-bold">Campaign structure and ad drafts</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {selectedPlatforms.includes("googleAds") && (
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800">
                    Google Ads hierarchy
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    {googleCampaignType === "PERFORMANCE_MAX"
                      ? "Campaign → Asset Group → Assets"
                      : googleCampaignType === "APP"
                        ? "Campaign → Ad Group → App Assets / App Ad"
                        : googleCampaignType === "HOTEL"
                          ? "Campaign → Ad Group → Hotel Listing Groups / Hotel Ads"
                          : "Campaign → Ad Group → Ad"}
                  </p>
                </div>
              )}
              {selectedPlatforms.includes("metaAds") && (
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800">
                    Meta Ads hierarchy
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Campaign → Ad Set → Ad → Creative
                  </p>
                </div>
              )}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Campaign details, provider-specific groups and ad sets, and
              creative drafts are prepared together in this prototype. In
              production, each provider resource will be created and tracked
              independently.
            </p>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">Launch safety</p>
            <p className="mt-1 text-sm leading-6 text-blue-800">
              The request sets the initial status to PAUSED. Google and Meta
              campaign creation results should be tracked separately, so one
              provider's failure does not hide the other provider's result.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <label className="block text-sm font-semibold text-slate-800">
              Backend execution mode
            </label>

            <select
              value={executionMode}
              onChange={(event) => {
                setExecutionMode(event.target.value as CampaignExecutionMode);
                setApiPayloadPreview("");
              }}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="VALIDATE_ONLY">
                Validate only — no provider mutations
              </option>
              <option value="LIVE">
                Live execution — create paused provider resources
              </option>
            </select>

            <p className="mt-2 text-xs leading-5 text-slate-500">
              This setting controls the backend request preview. Preparing the
              request does not submit it or create campaigns.
            </p>
          </div>
          <button
            type="button"
            onClick={prepareCampaign}
            className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Prepare Unified Campaign Request
          </button>

          {preparedPayload && (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-bold">
                    Unified Campaign Request Preview
                  </h3>
                  <button
                    type="button"
                    onClick={copyPayload}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                  >
                    Copy JSON
                  </button>
                </div>
                {copyNotice && (
                  <p className="mt-3 text-sm text-green-700">{copyNotice}</p>
                )}
                <pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-green-300">
                  {preparedPayload}
                </pre>
                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-800">
                  Preparing this preview does not submit the campaign request.
                  The Backend API Request Preview below contains the separate
                  payload submitted to POST /api/campaigns. Validate-only mode
                  performs Google Ads validation and Meta local configuration
                  validation without creating provider resources. Meta
                  validation is not a remote Graph API dry run. Live execution
                  sends real provider API mutations. Successfully created
                  resources are intended to start PAUSED. A provider can
                  partially succeed if a dependent resource fails. The current
                  creation scope is Google Search campaigns and Meta
                  single-image website campaigns. Settings not included in the
                  backend request are not applied by this operation.
                </p>
              </div>

              {/*
                MOCK SCENARIO TESTING DISABLED.
                The previous Prototype simulation panel is kept here as a comment
                for reference. The result panel below now reads live backend API
                responses from POST /api/campaigns.

              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">
                      Prototype simulation
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-slate-900">
                      Campaign creation results
                    </h3>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                      Test how the application should report independent
                      provider outcomes. These are mock responses only; no
                      campaign is sent to Google or Meta.
                    </p>
                  </div>
                  <span className="rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
                    Mock API mode
                  </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      {
                        value: "ALL_SUCCESS",
                        title: "Both platforms succeed",
                        description: "All selected resources are created.",
                      },
                      {
                        value: "PROVIDER_FAILURE",
                        title: "One provider fails",
                        description:
                          "Google succeeds while Meta fails (or the only selected provider fails).",
                      },
                      {
                        value: "ALL_FAILURE",
                        title: "All platforms fail",
                        description:
                          "Each selected provider returns a campaign-level error.",
                      },
                      {
                        value: "RESOURCE_FAILURE",
                        title: "A child resource fails",
                        description:
                          "Campaign succeeds, but an Ad Group or Ad Set fails.",
                      },
                      {
                        value: "TIMEOUT",
                        title: "Request timeout / unknown result",
                        description:
                          "A request times out; dependent steps are blocked pending reconciliation.",
                      },
                    ] as {
                      value: DemoScenario;
                      title: string;
                      description: string;
                    }[]
                  ).map((scenario) => (
                    <button
                      key={scenario.value}
                      type="button"
                      onClick={() => runDemoScenario(scenario.value)}
                      className="rounded-xl border border-indigo-200 bg-white p-4 text-left transition hover:border-indigo-400 hover:shadow-sm"
                    >
                      <span className="block text-sm font-semibold text-slate-900">
                        {scenario.title}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">
                        {scenario.description}
                      </span>
                      <span className="mt-3 inline-block text-xs font-bold text-indigo-700">
                        Run scenario →
                      </span>
                    </button>
                  ))}
                </div>

                {demoJob && (
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Creation job
                        </p>
                        <h4 className="mt-1 font-bold text-slate-900">
                          {demoJob.jobId}
                        </h4>
                        <p className="mt-1 text-xs text-slate-500">
                          {demoJob.createdAt}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${demoJob.overallStatus === "SUCCESS" ? "bg-green-100 text-green-800" : demoJob.overallStatus === "FAILED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}
                      >
                        {demoJob.overallStatus === "SUCCESS"
                          ? "Success"
                          : demoJob.overallStatus === "FAILED"
                            ? "Failed"
                            : "Partial success"}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      {demoJob.providers.map((provider) => {
                        const providerLabel =
                          provider.provider === "googleAds"
                            ? "Google Ads"
                            : "Meta Ads";
                        const failedResources = provider.resources.filter(
                          (resource) => resource.status === "FAILED",
                        ).length;
                        const timedOutResources = provider.resources.filter(
                          (resource) => resource.status === "TIMED_OUT",
                        ).length;
                        const pendingResources = provider.resources.filter(
                          (resource) =>
                            resource.status === "NOT_STARTED" ||
                            resource.status === "BLOCKED",
                        ).length;
                        return (
                          <div
                            key={provider.provider}
                            className="rounded-xl border border-slate-200 p-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h5 className="font-bold text-slate-900">
                                {providerLabel}
                              </h5>
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${provider.status === "SUCCESS" ? "bg-green-100 text-green-800" : provider.status === "FAILED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}
                              >
                                {provider.status === "SUCCESS"
                                  ? "Created"
                                  : provider.status === "FAILED"
                                    ? "Failed"
                                    : "Partially created"}
                              </span>
                            </div>
                            <div className="mt-4 space-y-3">
                              {provider.resources.map((resource) => (
                                <div
                                  key={resource.key}
                                  className="flex items-start gap-3"
                                >
                                  <span
                                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${resource.status === "SUCCESS" ? "bg-green-100 text-green-700" : resource.status === "FAILED" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}
                                  >
                                    {resource.status === "SUCCESS"
                                      ? "✓"
                                      : resource.status === "FAILED"
                                        ? "!"
                                        : resource.status === "TIMED_OUT"
                                          ? "?"
                                          : resource.status === "BLOCKED"
                                            ? "Ⅱ"
                                            : "–"}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="text-sm font-semibold text-slate-800">
                                        {resource.label}
                                      </span>
                                      <span
                                        className={`text-xs font-semibold ${resource.status === "SUCCESS" ? "text-green-700" : resource.status === "FAILED" ? "text-red-700" : "text-slate-500"}`}
                                      >
                                        {resource.status === "SUCCESS"
                                          ? "Success"
                                          : resource.status === "FAILED"
                                            ? "Failed"
                                            : resource.status === "TIMED_OUT"
                                              ? "Timed out — reconcile"
                                              : resource.status === "BLOCKED"
                                                ? "Blocked by dependency"
                                                : "Not started"}
                                      </span>
                                    </div>
                                    {resource.resourceId && (
                                      <p className="mt-1 break-all font-mono text-[11px] text-slate-400">
                                        ID: {resource.resourceId}
                                      </p>
                                    )}
                                    {resource.endpoint && (
                                      <p className="mt-1 break-all font-mono text-[10px] text-slate-400">
                                        {resource.endpoint}
                                      </p>
                                    )}
                                    {resource.requestId && (
                                      <p className="mt-1 font-mono text-[10px] text-slate-400">
                                        Request: {resource.requestId} · Attempt:{" "}
                                        {resource.attemptCount ?? 1}
                                      </p>
                                    )}
                                    {resource.responseSummary && (
                                      <p className="mt-1 text-[11px] text-slate-500">
                                        {resource.responseSummary}
                                      </p>
                                    )}
                                    {resource.errorMessage && (
                                      <div className="mt-2 rounded-lg bg-red-50 p-3">
                                        <p className="text-[11px] font-bold uppercase text-red-700">
                                          {resource.errorCode}
                                        </p>
                                        <p className="mt-1 text-xs leading-5 text-red-700">
                                          {resource.errorMessage}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {(failedResources > 0 ||
                              timedOutResources > 0 ||
                              pendingResources > 0) && (
                              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                                {timedOutResources > 0 && (
                                  <div className="w-full space-y-2">
                                    <p className="text-xs font-medium text-amber-700">
                                      Do not retry timed-out requests yet. First
                                      query the provider account to determine
                                      whether the resource was created.
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        reconcileDemoTimeout(provider.provider)
                                      }
                                      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                                    >
                                      Simulate reconciliation lookup
                                    </button>
                                  </div>
                                )}
                                {failedResources > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      retryDemoFailedSteps(provider.provider)
                                    }
                                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                                  >
                                    Retry failed step
                                    {failedResources > 1 ? "s" : ""}
                                  </button>
                                )}
                                {pendingResources > 0 &&
                                  failedResources === 0 &&
                                  timedOutResources === 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        continueDemoProvider(provider.provider)
                                      }
                                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                      Continue remaining steps
                                    </button>
                                  )}
                              </div>
                            )}
                            {failedResources > 0 && pendingResources > 0 && (
                              <p className="mt-2 text-xs text-slate-500">
                                Retry the failed resource first. Then continue
                                the resources that depend on it.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                      <strong>Demo behavior:</strong> successful resource IDs
                      are retained. Failed steps can be retried; blocked steps
                      wait for their dependency. A timeout is an unknown
                      outcome, not proof of failure: reconcile by querying the
                      provider before retrying to avoid duplicate resources.
                      Endpoint names, IDs and responses are illustrative, not
                      live provider records.
                    </div>
                  </div>
                )}
              </div>
              */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">
                  Live provider execution
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Mock success, failure and timeout scenarios are disabled.
                  Submit this campaign request to see the actual Campaign, Ad
                  Set / Ad Group, Creative and Ad results returned by the
                  backend below.
                </p>
              </div>

              <div className="mt-5 border-t border-slate-200 pt-5">
                <button
                  type="button"
                  onClick={submitCampaignRequest}
                  disabled={campaignSubmitting || !apiPayloadPreview}
                  className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {campaignSubmitting
                    ? "Submitting campaign request..."
                    : executionMode === "LIVE"
                      ? "Create Paused Campaigns"
                      : "Validate Campaign Request"}
                </button>

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {executionMode === "VALIDATE_ONLY"
                    ? "This submits the request for backend validation. Google and Meta provider resources will not be created."
                    : "This submits a live request. Successfully created provider resources will start PAUSED."}
                </p>

                {Boolean(campaignApiError || campaignApiResponse) && (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                          Live backend response
                        </p>
                        <h3 className="mt-1 text-lg font-bold text-slate-900">
                          Campaign creation results
                        </h3>
                        {liveApiResponse?.campaign?.name && (
                          <p className="mt-1 text-sm text-slate-600">
                            {liveApiResponse.campaign.name}
                          </p>
                        )}
                      </div>
                      {liveApiResponse && (
                        <span
                          className={`rounded-full px-3 py-1.5 text-xs font-bold ${liveApiResponse.success === true
                            ? "bg-green-100 text-green-800"
                            : hasLiveCreatedResources ||
                              liveApiResponse.partialSuccess
                              ? "bg-amber-100 text-amber-800"
                              : "bg-red-100 text-red-800"
                            }`}
                        >
                          {liveOverallStatus}
                        </span>
                      )}
                    </div>

                    {liveApiResponse?.message && (
                      <p className="mt-4 text-sm leading-6 text-slate-700">
                        {liveApiResponse.message}
                      </p>
                    )}

                    {liveApiResponse?.campaign?.id && (
                      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">
                          Application campaign record:
                        </span>{" "}
                        <span className="break-all font-mono">
                          {liveApiResponse.campaign.id}
                        </span>
                        {liveApiResponse.campaign.createdAt && (
                          <span className="ml-2">
                            ·{" "}
                            {new Date(
                              liveApiResponse.campaign.createdAt,
                            ).toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}

                    {liveProviderEntries.length > 0 ? (
                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        {liveProviderEntries.map(
                          ([providerKey, providerResult]) => {
                            const providerLabel =
                              providerKey === "googleAds"
                                ? "Google Ads"
                                : providerKey === "metaAds"
                                  ? "Meta Ads"
                                  : providerKey;
                            const campaignProvider =
                              liveApiResponse?.campaign?.providers?.[
                              providerKey
                              ];
                            // Partial executions use partialResources[]; successful
                            // executions (such as Google Ads mutate) use a keyed
                            // createdResources object with string and string[] IDs.
                            const resourcesFromProvider = Object.entries(
                              providerResult.createdResources ?? {},
                            ).flatMap(([resourceType, value]) => {
                              const ids = Array.isArray(value)
                                ? value
                                : [value];

                              return ids
                                .filter(
                                  (resourceId): resourceId is string =>
                                    typeof resourceId === "string" &&
                                    resourceId.trim().length > 0,
                                )
                                .map((resourceId) => ({
                                  resourceType,
                                  resourceId,
                                }));
                            });

                            const allCreatedResources = [
                              ...(providerResult.partialResources ?? []),
                              ...resourcesFromProvider,
                            ];

                            // Avoid showing the same resource twice if both
                            // response fields contain its ID.
                            const createdResources = Array.from(
                              new Map(
                                allCreatedResources.map((resource) => [
                                  `${resource.resourceType ?? "resource"}:${resource.resourceId ?? ""}`,
                                  resource,
                                ]),
                              ).values(),
                            );

                            if (
                              campaignProvider?.providerCampaignId &&
                              !createdResources.some(
                                (resource) =>
                                  resource.resourceType?.toLowerCase() ===
                                  "campaign",
                              )
                            ) {
                              createdResources.unshift({
                                resourceType: "campaign",
                                resourceId: campaignProvider.providerCampaignId,
                              });
                            }

                            const providerIsPartial =
                              providerResult.success !== true &&
                              (createdResources.length > 0 ||
                                providerResult.creationStatus?.toLowerCase() ===
                                "partial");
                            const providerStatusLabel =
                              providerResult.success === true
                                ? "Created"
                                : providerIsPartial
                                  ? "Partially created"
                                  : "Failed";
                            const providerResultRecord = asObject(providerResult);
                            const providerErrorContainer = asObject(
                              providerResultRecord.providerErrorDetails,
                            );
                            const nestedProviderError = asObject(
                              providerErrorContainer.error,
                            );
                            const providerDetails = asObject(providerResultRecord.details);
                            const directDetailsError = asObject(providerDetails.error);
                            const originalDetailsError = asObject(
                              asObject(providerDetails.originalErrorDetails).error,
                            );
                            const topLevelDetailsError = asObject(
                              asObject(asObject(liveApiResponse).details).error,
                            );
                            const providerErrorDetails =
                              Object.keys(nestedProviderError).length > 0
                                ? nestedProviderError
                                : Object.keys(providerErrorContainer).length > 0
                                  ? providerErrorContainer
                                  : Object.keys(directDetailsError).length > 0
                                    ? directDetailsError
                                    : Object.keys(originalDetailsError).length > 0
                                      ? originalDetailsError
                                      : topLevelDetailsError;
                            const providerError =
                              providerResult.error ||
                              providerErrorDetails.error_user_msg ||
                              providerErrorDetails.message ||
                              (typeof providerDetails.originalError === "string"
                                ? providerDetails.originalError
                                : undefined);
                            const providerStatusCode = Number(
                              providerResult.providerStatusCode ??
                              providerResultRecord.statusCode ??
                              providerDetails.statusCode,
                            );
                            const providerErrorCode = Number(providerErrorDetails.code);
                            const providerErrorSubcode = Number(
                              providerErrorDetails.error_subcode,
                            );
                            const providerHasTimeout = /time.?out|timed out|socket hang up|connection reset|aborted|unknown outcome/i.test(
                              String(providerError || ""),
                            );
                            const failedStepName = String(
                              providerResult.failedStep ?? "",
                            ).trim().toLowerCase();
                            const normalizedResourceTypes = new Set(
                              createdResources.map((resource) =>
                                String(resource.resourceType ?? "")
                                  .replace(/[\s_-]/g, "")
                                  .toLowerCase(),
                              ),
                            );
                            const hasExistingMetaCampaign = Boolean(
                              providerResult.providerCampaignId ||
                              campaignProvider?.providerCampaignId ||
                              normalizedResourceTypes.has("campaign"),
                            );
                            const hasExistingMetaAdSet = normalizedResourceTypes.has("adset");
                            const hasExistingMetaCreative = normalizedResourceTypes.has("creative");
                            const hasExistingMetaAd = normalizedResourceTypes.has("ad");
                            const applicationCampaignId = String(
                              liveApiResponse?.campaign?.id ?? "",
                            ).trim();
                            const canRetryMetaAdSet =
                              providerKey === "metaAds" &&
                              executionMode === "LIVE" &&
                              providerResult.success !== true &&
                              providerResult.creationStatus?.toLowerCase() === "partial" &&
                              failedStepName.includes("ad set") &&
                              hasExistingMetaCampaign &&
                              !hasExistingMetaAdSet &&
                              !providerHasTimeout &&
                              !metaRetryNeedsAttention &&
                              !(metaRetryResult?.action === "ad-set") &&
                              /^[a-fA-F0-9]{24}$/.test(applicationCampaignId);
                            const canRetryMetaCreative =
                              providerKey === "metaAds" &&
                              executionMode === "LIVE" &&
                              providerResult.success !== true &&
                              providerResult.creationStatus?.toLowerCase() === "partial" &&
                              failedStepName.includes("creative") &&
                              hasExistingMetaCampaign &&
                              hasExistingMetaAdSet &&
                              !hasExistingMetaCreative &&
                              !hasExistingMetaAd &&
                              !providerHasTimeout &&
                              !metaRetryNeedsAttention &&
                              !(metaRetryResult?.action === "creative") &&
                              /^[a-fA-F0-9]{24}$/.test(applicationCampaignId);
                            const isMetaCampaignCreateWithoutRemoteId =
                              providerKey === "metaAds" &&
                              providerResult.success !== true &&
                              providerResult.creationStatus?.toLowerCase() === "failed" &&
                              !hasExistingMetaCampaign &&
                              createdResources.length === 0;
                            const metaRetryAction = canRetryMetaAdSet
                              ? "ad-set"
                              : canRetryMetaCreative
                                ? "creative"
                                : null;

                            return (
                              <div
                                key={providerKey}
                                className="rounded-xl border border-slate-200 p-4"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <h4 className="font-bold text-slate-900">
                                    {providerLabel}
                                  </h4>
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${providerResult.success === true
                                      ? "bg-green-100 text-green-800"
                                      : providerIsPartial
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-red-100 text-red-800"
                                      }`}
                                  >
                                    {providerStatusLabel}
                                  </span>
                                </div>

                                <div className="mt-3 space-y-1 text-xs text-slate-500">
                                  {providerResult.accountId && (
                                    <p>
                                      Ad account:{" "}
                                      <span className="font-mono">
                                        {providerResult.accountId}
                                      </span>
                                    </p>
                                  )}
                                  {(campaignProvider?.providerCampaignId ||
                                    providerResult.providerCampaignId) && (
                                      <p>
                                        Campaign ID:{" "}
                                        <span className="break-all font-mono">
                                          {campaignProvider?.providerCampaignId ||
                                            providerResult.providerCampaignId}
                                        </span>
                                      </p>
                                    )}
                                  {(providerResult.deliveryStatus ||
                                    campaignProvider?.deliveryStatus) && (
                                      <p>
                                        Delivery status:{" "}
                                        {providerResult.deliveryStatus ||
                                          campaignProvider?.deliveryStatus}
                                      </p>
                                    )}
                                </div>

                                <div className="mt-4 space-y-3">
                                  {createdResources.map((resource, index) => (
                                    <div
                                      key={`${resource.resourceType ?? "resource"}-${resource.resourceId ?? index}`}
                                      className="flex items-start gap-3"
                                    >
                                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
                                        ✓
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-slate-800">
                                          {formatLiveResourceName(
                                            resource.resourceType || "resource",
                                          )}
                                        </p>
                                        {resource.resourceId && (
                                          <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
                                            ID: {resource.resourceId}
                                          </p>
                                        )}
                                        <p className="mt-1 text-[11px] font-medium text-green-700">
                                          Created by provider API
                                        </p>
                                      </div>
                                    </div>
                                  ))}

                                  {providerResult.failedStep && (
                                    <div className="flex items-start gap-3">
                                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700">
                                        !
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-slate-800">
                                          {formatLiveResourceName(
                                            providerResult.failedStep,
                                          )}
                                        </p>
                                        <p className="mt-1 text-[11px] font-semibold text-red-700">
                                          Failed at this step
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                  {!createdResources.length &&
                                    !providerResult.failedStep && (
                                      <p className="text-xs text-slate-500">
                                        {providerResult.success === true
                                          ? "Provider completed successfully. No individual resource IDs were returned."
                                          : "No provider resources were confirmed as created."}
                                      </p>
                                    )}
                                </div>

                                {providerError && (
                                  <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-3">
                                    {providerErrorDetails.error_user_title && (
                                      <p className="text-[11px] font-bold uppercase tracking-wide text-red-800">
                                        {providerErrorDetails.error_user_title}
                                      </p>
                                    )}
                                    <p className="mt-1 text-xs leading-5 text-red-700">
                                      {providerError}
                                    </p>
                                    {providerErrorDetails.error_user_msg &&
                                      providerErrorDetails.error_user_msg !== providerError && (
                                        <p className="mt-1 text-xs leading-5 text-red-700">
                                          {providerErrorDetails.error_user_msg}
                                        </p>
                                      )}
                                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-red-600">
                                      {Number.isFinite(providerStatusCode) && providerStatusCode > 0 && (
                                        <span>HTTP {providerStatusCode}</span>
                                      )}
                                      {providerErrorDetails.code !== undefined && (
                                        <span>API code {String(providerErrorDetails.code)}</span>
                                      )}
                                      {providerErrorDetails.error_subcode !== undefined && (
                                        <span>Subcode {String(providerErrorDetails.error_subcode)}</span>
                                      )}
                                      {providerErrorDetails.fbtrace_id && (
                                        <span className="break-all">
                                          Trace: {String(providerErrorDetails.fbtrace_id)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {metaRetryAction && (
                                  <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                                    <p className="text-xs leading-5 text-blue-900">
                                      {metaRetryAction === "ad-set"
                                        ? "The Meta Campaign already exists, but Ad Set creation failed. Retry will reuse that Campaign and create only the missing Ad Set."
                                        : "The Meta Campaign and Ad Set already exist, but Creative creation failed. Retry will reuse both and create only the missing Ad Creative."}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => void retryMetaCampaignStep(metaRetryAction)}
                                      disabled={campaignSubmitting}
                                      className="mt-3 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {retryingMetaAction === metaRetryAction
                                        ? `Retrying ${metaRetryAction === "ad-set" ? "Ad Set" : "Creative"}...`
                                        : `Retry failed ${metaRetryAction === "ad-set" ? "Ad Set" : "Creative"} step`}
                                    </button>
                                  </div>
                                )}

                                {isMetaCampaignCreateWithoutRemoteId && (
                                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                                    Meta Campaign creation failed before a remote Campaign ID was saved. The Ad Set / Creative retry endpoints require an existing Campaign and cannot safely retry this stage. Correct the Campaign settings, prepare a fresh request and submit a new live attempt. For Ad Set-level budgets, the updated builder now sends an explicit budget-sharing boolean (false by default).
                                  </p>
                                )}

                                {providerResult.success !== true &&
                                  !metaRetryAction &&
                                  (providerIsPartial || providerHasTimeout) && (
                                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                                      A provider resource may already exist or the result is unknown. Do not submit the full campaign again. Reconcile the Meta account first; retry is offered only for a confirmed Ad Set or Creative failure with the required existing parent IDs.
                                    </p>
                                  )}
                              </div>
                            );
                          },
                        )}
                      </div>
                    ) : liveApiResponse ? (
                      <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                        The backend returned a response, but it did not include
                        a provider results object.
                      </p>
                    ) : null}

                    {metaRetryResult && (
                      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                        <p className="text-sm font-semibold text-blue-900">
                          {metaRetryResult.action === "ad-set"
                            ? "Meta Ad Set retry succeeded"
                            : "Meta Creative retry succeeded"}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-blue-800">
                          {metaRetryResult.message}
                        </p>
                        {metaRetryResult.resourceId && (
                          <p className="mt-2 break-all font-mono text-xs text-blue-700">
                            Resource ID: {metaRetryResult.resourceId}
                          </p>
                        )}
                        <p className="mt-2 text-xs leading-5 text-blue-800">
                          This confirms only the retried resource. The remaining Meta creation steps are not marked complete by this response.
                        </p>
                      </div>
                    )}

                    {campaignApiError &&
                      campaignApiError !== liveApiResponse?.message && (
                        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                          <p className="text-sm font-semibold text-red-800">
                            Campaign request error
                          </p>
                          <p className="mt-1 text-sm text-red-700">
                            {campaignApiError}
                          </p>
                        </div>
                      )}

                    {liveApiResponse && (
                      <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                          View raw backend response
                        </summary>
                        <pre className="mt-3 max-h-[420px] overflow-auto rounded-lg bg-slate-950 p-4 text-[11px] leading-5 text-slate-100">
                          {JSON.stringify(liveApiResponse, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}

      <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-6">
        {step > 1 ? (
          <Button
            type="button"
            onClick={goBack}
            variant="outlined"
            color="inherit"
            sx={{
              borderRadius: 2.5,
              px: 2.5,
              py: 1.2,
              textTransform: "none",
              fontWeight: 700,
            }}
          >
            ← Back
          </Button>
        ) : (
          <Button
            component={Link}
            href="/dashboard"
            variant="outlined"
            color="inherit"
            sx={{
              borderRadius: 2.5,
              px: 2.5,
              py: 1.2,
              textTransform: "none",
              fontWeight: 700,
            }}
          >
            Cancel
          </Button>
        )}
        {step >= 3 && step < 5 && (
          <Button
            type="button"
            onClick={saveCurrentDraft}
            variant="outlined"
            color="inherit"
            size="small"
            sx={{
              borderRadius: 2.5,
              px: 2,
              py: 1.2,
              textTransform: "none",
              fontWeight: 700,
            }}
          >
            Save draft & finish later
          </Button>
        )}
        {step < 5 && (
          <Button
            type="button"
            onClick={goNext}
            disabled={loadingConnections || Boolean(connectionError)}
            variant="contained"
            disableElevation
            sx={{
              borderRadius: 2.5,
              px: 3,
              py: 1.25,
              textTransform: "none",
              fontWeight: 700,
            }}
          >
            Continue →
          </Button>
        )}
      </div>
    </div>
  );
}