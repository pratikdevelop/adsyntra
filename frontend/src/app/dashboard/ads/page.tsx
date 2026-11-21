"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listAssets,
  type LibraryAsset,
} from "../../../lib/asset-library-api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";
const ASSET_PAGE_SIZE = 100;

type Provider = "googleAds" | "metaAds";
type Filter = "ALL" | Provider;
type GoogleAdMetrics = {
  impressions: number;
  clicks: number;
  ctr: number;
  costMicros: string;
  conversions: number;
  conversionsValue: number;
};
type GoogleAd = {
  provider: "googleAds";
  accountId: string;
  id: string;
  name: string | null;
  type: string | null;
  campaignId: string | null;
  campaignName: string | null;
  campaignChannelType?: string | null;
  campaignStatus?: string | null;
  campaignPrimaryStatus?: string | null;
  campaignPrimaryStatusReasons?: string[];
  adGroupId: string | null;
  adGroupName: string | null;
  adGroupStatus?: string | null;
  adGroupPrimaryStatus?: string | null;
  adGroupPrimaryStatusReasons?: string[];
  status: string | null;
  primaryStatus: string | null;
  primaryStatusReasons?: string[];
  actionItems?: string[];
  reviewStatus?: string | null;
  policyTopics?: Array<{ topic: string | null; type: string | null; evidences?: unknown[]; constraints?: unknown[] }>;
  adStrength: string | null;
  approvalStatus: string | null;
  finalUrls: string[];
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
  callToActions: string[];
  businessNames: string[];
  assetResourceNames: string[];
  /** Resolved by the Google Ads API backend from linked IMAGE assets. */
  imageUrls?: string[];
  creativeDetails: Record<string, unknown>;
  metrics: GoogleAdMetrics;
};
type MetaAd = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  issues_info?: Array<Record<string, unknown>>;
  failed_delivery_checks?: Array<Record<string, unknown>>;
  adset_id?: string;
  campaign_id?: string;
  creative?: {
    id?: string;
    name?: string;
    title?: string;
    body?: string;
    call_to_action_type?: string;
    image_url?: string;
    thumbnail_url?: string;
    video_id?: string;
    link_url?: string;
    link_destination_display_url?: string;
    object_story_spec?: Record<string, unknown>;
    asset_feed_spec?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};
type GoogleAdsPage = {
  ads: GoogleAd[];
  count: number;
  nextPageToken: string | null;
  metricsDateRange: string;
};
type MetaAdsPage = {
  ads: MetaAd[];
  count: number;
  pagination: {
    hasNextPage: boolean;
    nextCursor: string | null;
    previousCursor: string | null;
  };
};

type GooglePMaxCampaign = {
  id: string;
  name: string;
};

type GooglePMaxAssetGroup = {
  id: string;
  resourceName: string | null;
  name: string | null;
  status: string | null;
  primaryStatus: string | null;
  primaryStatusReasons: string[];
  adStrength: string | null;
  finalUrls: string[];
  path1: string | null;
  path2: string | null;
  campaignId: string;
  campaignName: string | null;
  campaignChannelType?: string | null;
  campaignStatus?: string | null;
  campaignPrimaryStatus?: string | null;
  campaignPrimaryStatusReasons?: string[];
};

type GooglePMaxAsset = {
  id: string | null;
  resourceName: string | null;
  assetGroupId: string;
  campaignId: string;
  fieldType: string | null;
  status: string | null;
  primaryStatus: string | null;
  primaryStatusReasons: string[];
  primaryStatusDetails: Array<{
    status: string | null;
    reason: string | null;
    offlineEvaluationErrorReasons: string[];
  }>;
  approvalStatus: string | null;
  reviewStatus: string | null;
  policyTopics: Array<{ topic: string | null; type: string | null; evidences?: unknown[]; constraints?: unknown[] }>;
  source: string | null;
  name: string | null;
  type: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  videoId: string | null;
  videoTitle: string | null;
  textContent: string | null;
  callToAction: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  finalUrls: string[];
  details: Record<string, unknown>;
};

type GooglePMaxAssetGroupAssetsPage = {
  success?: boolean;
  assets: GooglePMaxAsset[];
  nextPageToken: string | null;
  message?: string;
};

type GooglePMaxAssetGroupsPage = {
  success?: boolean;
  assetGroups: GooglePMaxAssetGroup[];
  nextPageToken: string | null;
  message?: string;
};

type CampaignsApiResponse = {
  success?: boolean;
  message?: string;
  providers?: {
    googleAds?: {
      data?: unknown;
      campaigns?: unknown[];
      accountId?: string | null;
      success?: boolean;
    };
  };
  campaigns?: unknown[];
};

type GooglePMaxRaw = {
  campaign: GooglePMaxCampaign;
  assetGroup: GooglePMaxAssetGroup;
  asset: GooglePMaxAsset;
};
type ProviderConnection = {
  connected: boolean;
  accounts: unknown[];
  selectedAccountId: string | null;
};
type ConnectionsResponse = {
  providers?: {
    googleAds?: Partial<ProviderConnection>;
    metaAds?: Partial<ProviderConnection>;
  };
  message?: string;
};
type Cursors = { googleAds: string | null; metaAds: string | null };
type AdRecord = {
  provider: Provider;
  /** PMax rows are linked asset records, not provider-generated ad instances. */
  recordKind: "STANDARD_AD" | "PMAX_ASSET";
  id: string;
  name: string;
  status: string;
  primaryStatus?: string;
  campaign: string;
  type: string;
  text: string[];
  urls: string[];
  imageUrls: string[];
  videoId?: string;
  assetGroupName?: string;
  assetGroupId?: string;
  assetFieldType?: string;
  cta?: string;
  raw: GoogleAd | MetaAd | GooglePMaxRaw;
};

const emptyConnection = (): ProviderConnection => ({
  connected: false,
  accounts: [],
  selectedAccountId: null,
});

const asText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
}

function googleCampaignId(value: Record<string, unknown>): string {
  const directId = firstText(value.id, value.campaignId, value.campaign_id);
  if (/^\d+$/.test(directId)) return directId;

  const resourceName = firstText(value.resourceName, value.resource_name);
  const match = resourceName.match(/(?:^|\/)campaigns\/(\d+)$/);
  return match?.[1] || "";
}

const unique = (values: string[]): string[] =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))];

function providerName(provider: Provider): string {
  return provider === "googleAds" ? "Google Ads" : "Meta Ads";
}

function formatNumber(value?: number): string {
  return new Intl.NumberFormat().format(value || 0);
}

function moneyFromMicros(value?: string): string {
  const amount = Number(value || 0) / 1_000_000;
  return Number.isFinite(amount)
    ? amount.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      })
    : "—";
}

function validMediaUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

async function adsRequest<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    message?: string;
  };
  if (!response.ok) {
    throw new Error(payload.message || `Ads request failed (${response.status}).`);
  }
  return payload;
}

function fetchGoogleAds(
  token: string,
  accountId: string,
  pageToken?: string | null,
): Promise<GoogleAdsPage> {
  const params = new URLSearchParams({
    accountId,
    metricsDateRange: "LAST_30_DAYS",
  });
  if (pageToken) params.set("pageToken", pageToken);
  return adsRequest(`/api/ads/google/ads?${params.toString()}`, token);
}

function fetchMetaAds(
  token: string,
  accountId: string,
  after?: string | null,
): Promise<MetaAdsPage> {
  const params = new URLSearchParams({ accountId, limit: "25" });
  if (after) params.set("after", after);
  return adsRequest(`/api/ads/meta/ads?${params.toString()}`, token);
}

/**
 * Read the selected Google account's campaigns and identify Performance Max.
 * The standard /google/ads endpoint is based on ad_group_ad and intentionally
 * cannot return PMax asset groups, so those are fetched through their own API.
 */
async function fetchGooglePMaxCampaigns(token: string): Promise<GooglePMaxCampaign[]> {
  const payload = await adsRequest<CampaignsApiResponse>("/api/campaigns", token);
  if (payload.success === false) {
    throw new Error(payload.message || "Unable to load Google Ads campaigns for Performance Max discovery.");
  }

  const provider = asRecord(payload.providers?.googleAds);
  const providerData = asRecord(provider.data);
  const rows = Array.isArray(providerData.campaigns)
    ? providerData.campaigns
    : Array.isArray(provider.campaigns)
      ? provider.campaigns
      : Array.isArray(payload.campaigns)
        ? payload.campaigns.filter((item) => firstText(asRecord(item).provider, asRecord(item).platform) === "googleAds")
        : [];

  const campaigns = rows.map((item) => {
    const raw = asRecord(item);
    const source = asRecord(raw.raw);
    const nestedCampaign = asRecord(source.campaign ?? raw.campaign);
    const id = googleCampaignId(raw) || googleCampaignId(nestedCampaign);
    const channelType = firstText(
      raw.channelType,
      raw.campaignType,
      raw.advertisingChannelType,
      raw.advertising_channel_type,
      nestedCampaign.advertisingChannelType,
      nestedCampaign.advertising_channel_type,
    ).toUpperCase();
    const name = firstText(raw.name, nestedCampaign.name) || `Performance Max campaign ${id}`;
    return { id, name, channelType };
  }).filter((item) => item.id && item.channelType.includes("PERFORMANCE_MAX"));

  return campaigns.map(({ id, name }) => ({ id, name }));
}

async function fetchAllGooglePMaxAssetGroups(
  token: string,
  campaignId: string,
): Promise<GooglePMaxAssetGroup[]> {
  const rows: GooglePMaxAssetGroup[] = [];
  let pageToken: string | null = null;
  let page = 0;

  do {
    const params = new URLSearchParams();
    if (pageToken) params.set("pageToken", pageToken);
    const queryString = params.toString();
    const query = queryString ? `?${queryString}` : "";
    const result = await adsRequest<GooglePMaxAssetGroupsPage>(
      `/api/ads/google/campaigns/${encodeURIComponent(campaignId)}/asset-groups${query}`,
      token,
    );
    if (result.success === false) {
      throw new Error(result.message || `Unable to load asset groups for Performance Max campaign ${campaignId}.`);
    }
    rows.push(...(Array.isArray(result.assetGroups) ? result.assetGroups : []));
    pageToken = result.nextPageToken || null;
    page += 1;
  } while (pageToken && page < 100);

  if (pageToken) {
    throw new Error(`Performance Max asset-group pagination exceeded the safety limit for campaign ${campaignId}.`);
  }
  return rows;
}

async function fetchAllGooglePMaxAssets(
  token: string,
  campaignId: string,
  assetGroupId: string,
): Promise<GooglePMaxAsset[]> {
  const rows: GooglePMaxAsset[] = [];
  let pageToken: string | null = null;
  let page = 0;

  do {
    const params = new URLSearchParams({ campaignId });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await adsRequest<GooglePMaxAssetGroupAssetsPage>(
      `/api/ads/google/asset-groups/${encodeURIComponent(assetGroupId)}/assets?${params.toString()}`,
      token,
    );
    if (result.success === false) {
      throw new Error(result.message || `Unable to load assets for Performance Max asset group ${assetGroupId}.`);
    }
    rows.push(...(Array.isArray(result.assets) ? result.assets : []));
    pageToken = result.nextPageToken || null;
    page += 1;
  } while (pageToken && page < 100);

  if (pageToken) {
    throw new Error(`Performance Max asset pagination exceeded the safety limit for asset group ${assetGroupId}.`);
  }
  return rows;
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = await Promise.all(items.slice(index, index + batchSize).map(mapper));
    results.push(...batch);
  }
  return results;
}

function providerReasonLabel(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function isUninformativeReason(value: string): boolean {
  return !value.trim() || ["UNKNOWN", "UNSPECIFIED", "UNRECOGNIZED"].includes(value.trim().toUpperCase());
}

function describeProviderValue(value: unknown, depth = 0): string[] {
  if (value === null || value === undefined || depth > 3) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value).trim();
    return text ? [text] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => describeProviderValue(item, depth + 1)).slice(0, 12);
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .flatMap(([key, child]) => {
        const label = providerReasonLabel(key);
        return describeProviderValue(child, depth + 1).map((part) => `${label}: ${part}`);
      })
      .slice(0, 12);
  }
  return [];
}

function googlePolicyTopicMessages(
  topics: Array<{ topic: string | null; type: string | null; evidences?: unknown[]; constraints?: unknown[] }> = [],
): string[] {
  const messages: string[] = [];
  for (const policy of topics) {
    const topic = asText(policy.topic);
    const type = asText(policy.type);
    if (topic || type) {
      messages.push(`Policy finding: ${[topic, type ? providerReasonLabel(type) : ""].filter(Boolean).join(" · ")}`);
    }
    for (const evidence of policy.evidences || []) {
      const details = describeProviderValue(evidence);
      if (details.length) messages.push(`Policy evidence: ${details.join(" · ")}`);
    }
    for (const constraint of policy.constraints || []) {
      const details = describeProviderValue(constraint);
      if (details.length) messages.push(`Serving constraint: ${details.join(" · ")}`);
    }
  }
  return unique(messages);
}

function googleAssetLinkDiagnostics(asset: GooglePMaxAsset, group: GooglePMaxAssetGroup): string[] {
  const messages: string[] = [];
  for (const reason of asset.primaryStatusReasons || []) {
    if (!isUninformativeReason(reason)) messages.push(`Asset: ${providerReasonLabel(reason)}`);
  }
  for (const detail of asset.primaryStatusDetails || []) {
    if (detail.reason && !isUninformativeReason(detail.reason)) messages.push(`Asset detail: ${providerReasonLabel(detail.reason)}`);
    for (const evaluationReason of detail.offlineEvaluationErrorReasons || []) {
      if (!isUninformativeReason(evaluationReason)) messages.push(`Review detail: ${providerReasonLabel(evaluationReason)}`);
    }
  }
  messages.push(...googlePolicyTopicMessages(asset.policyTopics || []));
  for (const reason of group.primaryStatusReasons || []) {
    if (!isUninformativeReason(reason)) messages.push(`Asset group: ${providerReasonLabel(reason)}`);
  }
  for (const reason of group.campaignPrimaryStatusReasons || []) {
    if (!isUninformativeReason(reason)) messages.push(`Campaign: ${providerReasonLabel(reason)}`);
  }
  const uniqueMessages = unique(messages);
  if (uniqueMessages.length) return uniqueMessages;

  const servingStatus = `${asset.primaryStatus || ""} ${group.primaryStatus || ""} ${group.campaignPrimaryStatus || ""}`.toUpperCase();
  if (/NOT_ELIGIBLE|DISAPPROVED|LIMITED|PENDING|WITH_ISSUES/.test(servingStatus)) {
    return ["The provider returned a restricted or pending status but did not include a specific explanation in this response."];
  }
  return [];
}

function metaIssueMessages(ad: MetaAd): string[] {
  const messages: string[] = [];
  const issueGroups: Array<{ label: string; values: unknown[] }> = [
    { label: "Meta issue", values: Array.isArray(ad.issues_info) ? ad.issues_info : [] },
    { label: "Delivery check", values: Array.isArray(ad.failed_delivery_checks) ? ad.failed_delivery_checks : [] },
  ];

  for (const group of issueGroups) {
    for (const value of group.values) {
      const issue = asRecord(value);
      const level = firstText(issue.level, issue.object_level);
      const summary = firstText(issue.error_summary, issue.summary, issue.title, issue.name);
      const message = firstText(issue.error_message, issue.message, issue.description, issue.details);
      const additional = firstText(issue.additional_info, issue.additionalInfo);
      const code = firstText(issue.error_code, issue.code);
      const issueType = firstText(issue.error_type, issue.type);
      const checkName = firstText(issue.check_name);
      const mid = firstText(issue.mid);
      const parts = [
        level ? `${providerReasonLabel(level)} level` : "",
        checkName ? `Check: ${providerReasonLabel(checkName)}` : "",
        issueType ? `Type: ${providerReasonLabel(issueType)}` : "",
        summary,
        message && message !== summary ? message : "",
        code ? `Code ${code}` : "",
        additional,
        mid ? `Reference ${mid}` : "",
      ].filter(Boolean);
      if (parts.length) messages.push(`${group.label}: ${parts.join(" — ")}`);
      else {
        const fallback = describeProviderValue(issue);
        if (fallback.length) messages.push(`${group.label}: ${fallback.join(" · ")}`);
      }
    }
  }

  const status = firstText(ad.effective_status, ad.status).toUpperCase();
  if (!messages.length && /DISAPPROVED|WITH_ISSUES|PENDING_REVIEW|IN_PROCESS|PENDING_BILLING_INFO/.test(status)) {
    messages.push(`Meta reports ${providerReasonLabel(status)} but did not return detailed issue information for this ad.`);
  }
  return unique(messages);
}

function diagnosticsForRecord(record: AdRecord): string[] {
  if (record.recordKind === "PMAX_ASSET") {
    const raw = record.raw as GooglePMaxRaw;
    return googleAssetLinkDiagnostics(raw.asset, raw.assetGroup);
  }

  if (record.provider === "googleAds") {
    const ad = record.raw as GoogleAd;
    const messages: string[] = [];
    for (const reason of ad.primaryStatusReasons || []) {
      if (!isUninformativeReason(reason)) messages.push(`Ad: ${providerReasonLabel(reason)}`);
    }
    for (const reason of ad.adGroupPrimaryStatusReasons || []) {
      if (!isUninformativeReason(reason)) messages.push(`Ad group: ${providerReasonLabel(reason)}`);
    }
    for (const reason of ad.campaignPrimaryStatusReasons || []) {
      if (!isUninformativeReason(reason)) messages.push(`Campaign: ${providerReasonLabel(reason)}`);
    }
    messages.push(...googlePolicyTopicMessages(ad.policyTopics || []));
    if (ad.approvalStatus && /DISAPPROVED|APPROVED_LIMITED|AREA_OF_INTEREST_ONLY/.test(ad.approvalStatus.toUpperCase())) {
      messages.push(`Policy approval: ${providerReasonLabel(ad.approvalStatus)}`);
    }
    if (ad.reviewStatus && /REVIEW_IN_PROGRESS|UNDER_APPEAL/.test(ad.reviewStatus.toUpperCase())) {
      messages.push(`Policy review: ${providerReasonLabel(ad.reviewStatus)}`);
    }

    const parentStatuses = [
      ad.adGroupStatus ? `Ad group status: ${providerReasonLabel(ad.adGroupStatus)}` : "",
      ad.campaignStatus ? `Campaign status: ${providerReasonLabel(ad.campaignStatus)}` : "",
    ].filter((value) => /PAUSED|REMOVED|PENDING|ENDED|SUSPENDED|MISCONFIGURED/.test(value.toUpperCase()));
    messages.push(...parentStatuses);

    const blockedStatus = `${ad.primaryStatus || ""} ${ad.approvalStatus || ""} ${ad.adGroupPrimaryStatus || ""} ${ad.campaignPrimaryStatus || ""}`.toUpperCase();
    if (!messages.length && /NOT_ELIGIBLE|DISAPPROVED|LIMITED|PENDING|WITH_ISSUES/.test(blockedStatus)) {
      messages.push("Google Ads returned a restricted or pending status but did not include a specific explanation in this response.");
    }
    return unique(messages);
  }

  return metaIssueMessages(record.raw as MetaAd);
}

function recordNeedsAttention(record: AdRecord): boolean {
  const status = `${record.status} ${record.primaryStatus || ""}`.toUpperCase();
  return diagnosticsForRecord(record).length > 0 || /NOT_ELIGIBLE|DISAPPROVED|LIMITED|PENDING_REVIEW|WITH_ISSUES|IN_PROCESS|FAILED|BLOCKED/.test(status);
}

function googlePMaxAssetRecord(
  campaign: GooglePMaxCampaign,
  group: GooglePMaxAssetGroup,
  asset: GooglePMaxAsset,
  index: number,
): AdRecord {
  const fieldType = asText(asset.fieldType) || "ASSET";
  const assetType = asText(asset.type) || "UNKNOWN";
  const assetKey = asText(asset.id) || asText(asset.resourceName) || `asset-${index + 1}`;
  const mediaUrl = validMediaUrl(asset.mediaUrl);
  const thumbnailUrl = validMediaUrl(asset.thumbnailUrl);
  const videoId = asText(asset.videoId) || undefined;
  const textContent = asText(asset.textContent);
  const videoTitle = asText(asset.videoTitle);
  const callToAction = asText(asset.callToAction);

  return {
    provider: "googleAds",
    recordKind: "PMAX_ASSET",
    id: `pmax:${campaign.id}:${group.id}:${assetKey}:${index}`,
    name: firstText(asset.name, videoTitle, textContent) || `${fieldType.replace(/_/g, " ")} asset`,
    status: firstText(asset.primaryStatus, asset.status) || "UNKNOWN",
    primaryStatus: asText(asset.primaryStatus) || undefined,
    campaign: campaign.name,
    type: `Performance Max · ${fieldType.replace(/_/g, " ")} · ${assetType.replace(/_/g, " ")}`,
    text: unique([textContent, videoTitle, callToAction]),
    urls: Array.isArray(asset.finalUrls) ? asset.finalUrls.filter((url) => Boolean(validMediaUrl(url))) : [],
    imageUrls: unique([mediaUrl || "", thumbnailUrl || ""]),
    videoId,
    assetGroupName: asText(group.name) || `Asset group ${group.id}`,
    assetGroupId: group.id,
    assetFieldType: fieldType,
    cta: callToAction || undefined,
    raw: { campaign, assetGroup: group, asset },
  };
}

/** Load every linked PMax asset for the connected account, with bounded concurrency. */
async function fetchGooglePMaxRecords(token: string): Promise<AdRecord[]> {
  const campaigns = await fetchGooglePMaxCampaigns(token);
  if (!campaigns.length) return [];

  const groupsByCampaign = await Promise.all(
    campaigns.map(async (campaign) => ({
      campaign,
      groups: await fetchAllGooglePMaxAssetGroups(token, campaign.id),
    })),
  );

  const tasks = groupsByCampaign.flatMap(({ campaign, groups }) =>
    groups.map((group) => ({ campaign, group })),
  );

  const assetsByGroup = await mapInBatches(tasks, 4, async ({ campaign, group }) => ({
    campaign,
    group,
    assets: await fetchAllGooglePMaxAssets(token, campaign.id, group.id),
  }));

  return assetsByGroup.flatMap(({ campaign, group, assets }) =>
    assets.map((asset, index) => googlePMaxAssetRecord(campaign, group, asset, index)),
  );
}

/** Read already-synchronized creative/media records from the Asset Library. */
function normalizeLibraryAccountId(provider: Provider, accountId: string): string {
  if (provider === "googleAds") {
    // Google stores the account reference as customers/{id} in connections,
    // while synchronized Asset Library records use the numeric customer ID.
    return accountId.trim().replace(/^customers\//i, "").replace(/-/g, "");
  }
  const numericId = accountId.trim().replace(/^act_/i, "");
  return `act_${numericId}`;
}

async function getAllProviderAssets(
  token: string,
  provider: Provider,
  accountId: string,
): Promise<LibraryAsset[]> {
  const libraryAccountId = normalizeLibraryAccountId(provider, accountId);
  const first = await listAssets(token, {
    page: 1,
    pageSize: ASSET_PAGE_SIZE,
    provider,
    providerAccountId: libraryAccountId,
  });
  const allAssets = [...first.assets];
  if (first.pagination.totalPages <= 1) return allAssets;

  const remaining = await Promise.all(
    Array.from({ length: first.pagination.totalPages - 1 }, (_, index) =>
      listAssets(token, {
        page: index + 2,
        pageSize: ASSET_PAGE_SIZE,
        provider,
        providerAccountId: libraryAccountId,
      }),
    ),
  );
  for (const page of remaining) allAssets.push(...page.assets);
  return allAssets;
}

function imageUrlsFromLibraryAsset(asset: LibraryAsset): string[] {
  const providerAsset = asset.providerAsset;
  const urls: string[] = [];

  if (asset.kind === "IMAGE" || asset.kind === "LOGO") {
    const imageUrl = validMediaUrl(providerAsset?.mediaUrl);
    const thumbnail = validMediaUrl(providerAsset?.thumbnailUrl);
    if (imageUrl) urls.push(imageUrl);
    if (thumbnail) urls.push(thumbnail);
  }

  for (const media of asset.providerCreative?.media ?? []) {
    if (media.kind !== "IMAGE") continue;
    const mediaUrl = validMediaUrl(media.mediaUrl);
    const thumbnail = validMediaUrl(media.thumbnailUrl);
    if (mediaUrl) urls.push(mediaUrl);
    if (thumbnail) urls.push(thumbnail);
  }

  for (const card of asset.providerCreative?.carouselCards ?? []) {
    const imageUrl = validMediaUrl(card.imageUrl);
    const thumbnail = validMediaUrl(card.thumbnailUrl);
    if (imageUrl) urls.push(imageUrl);
    if (thumbnail) urls.push(thumbnail);
  }

  return unique(urls);
}

function buildGoogleImageMap(assets: LibraryAsset[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const asset of assets) {
    const resourceName = asText(asset.providerAsset?.resourceName);
    if (!resourceName) continue;
    const urls = imageUrlsFromLibraryAsset(asset);
    if (urls.length) map.set(resourceName, urls);
  }
  return map;
}

type MetaAssetIndex = {
  creativesById: Map<string, LibraryAsset>;
  imagesByHash: Map<string, string[]>;
  videoThumbnailsById: Map<string, string[]>;
};

function buildMetaAssetIndex(assets: LibraryAsset[]): MetaAssetIndex {
  const creativesById = new Map<string, LibraryAsset>();
  const imagesByHash = new Map<string, string[]>();
  const videoThumbnailsById = new Map<string, string[]>();

  for (const asset of assets) {
    const providerAsset = asset.providerAsset;
    if (providerAsset?.provider !== "metaAds") continue;

    const creativeId = asText(providerAsset.creativeId) || asText(providerAsset.assetId);
    if (creativeId && (asset.kind === "CREATIVE" || providerAsset.creativeId)) {
      creativesById.set(creativeId, asset);
    }

    const imageHash = asText(providerAsset.imageHash);
    if (imageHash) {
      const urls = imageUrlsFromLibraryAsset(asset);
      if (urls.length) imagesByHash.set(imageHash, urls);
    }

    const videoId = asText(providerAsset.videoId);
    if (videoId) {
      const thumbnails = unique([
        validMediaUrl(providerAsset.thumbnailUrl) || "",
        validMediaUrl(providerAsset.mediaUrl) || "",
      ]);
      if (thumbnails.length) videoThumbnailsById.set(videoId, thumbnails);
    }
  }

  return { creativesById, imagesByHash, videoThumbnailsById };
}

/** Pull image/preview URL fields directly from Google's nested ad-format payload. */
function collectGoogleCreativeImageUrls(value: unknown): string[] {
  const urls: string[] = [];
  const visited = new Set<object>();
  const visit = (current: unknown): void => {
    if (!current || typeof current !== "object") return;
    if (visited.has(current as object)) return;
    visited.add(current as object);
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (
        typeof child === "string" &&
        /(image|thumbnail|preview).*url|url.*(image|thumbnail|preview)/i.test(key)
      ) {
        const url = validMediaUrl(child);
        if (url) urls.push(url);
      } else {
        visit(child);
      }
    }
  };
  visit(value);
  return unique(urls);
}

function googleRecord(ad: GoogleAd, imageMap: Map<string, string[]>): AdRecord {
  const linkedImages = (ad.assetResourceNames || []).flatMap(
    (resourceName) => imageMap.get(resourceName) || [],
  );
  const directImages = collectGoogleCreativeImageUrls(ad.creativeDetails);

  return {
    provider: "googleAds",
    recordKind: "STANDARD_AD",
    id: ad.id,
    name: ad.name || `Google Ad ${ad.id}`,
    // Prefer Google's serving diagnosis over the advertiser-controlled
    // ENABLED/PAUSED flag so an enabled-but-ineligible ad is not shown green.
    status: ad.primaryStatus || ad.status || "UNKNOWN",
    primaryStatus: ad.primaryStatus || undefined,
    campaign: ad.campaignName || ad.campaignId || "Campaign unavailable",
    type: (ad.type || "Ad").replace(/_/g, " "),
    text: unique([
      ...(ad.headlines || []),
      ...(ad.longHeadlines || []),
      ...(ad.descriptions || []),
    ]),
    urls: ad.finalUrls || [],
    imageUrls: unique([
      ...(ad.imageUrls || []).map((url) => validMediaUrl(url) || ""),
      ...linkedImages,
      ...directImages,
    ]),
    cta: ad.callToActions?.[0],
    raw: ad,
  };
}

function collectMetaDirectImageUrls(creative: NonNullable<MetaAd["creative"]>): string[] {
  const urls: string[] = [];
  const add = (value: unknown) => {
    const url = validMediaUrl(value);
    if (url) urls.push(url);
  };

  add(creative.image_url);
  add(creative.thumbnail_url);

  const story = creative.object_story_spec || {};
  const storyRecord = story as Record<string, unknown>;
  for (const key of ["link_data", "photo_data", "video_data", "template_data"]) {
    const section = storyRecord[key];
    if (!section || typeof section !== "object") continue;
    const item = section as Record<string, unknown>;
    add(item.image_url);
    add(item.picture);
    const children = item.child_attachments;
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child && typeof child === "object") {
          const card = child as Record<string, unknown>;
          add(card.picture);
          add(card.image_url);
          add(card.thumbnail_url);
        }
      }
    }
  }

  const feedSpec = (creative.asset_feed_spec || {}) as Record<string, unknown>;
  if (Array.isArray(feedSpec.images)) {
    for (const item of feedSpec.images) {
      if (item && typeof item === "object") {
        const image = item as Record<string, unknown>;
        add(image.url);
        add(image.url_128);
      }
    }
  }
  return unique(urls);
}

function metaRecord(ad: MetaAd, assetIndex: MetaAssetIndex): AdRecord {
  const creative = ad.creative || {};
  const creativeId = asText(creative.id);
  const libraryCreative = creativeId ? assetIndex.creativesById.get(creativeId) : undefined;
  const libraryContent = libraryCreative?.providerCreative;
  const story = (creative.object_story_spec || {}) as Record<string, unknown>;
  const linkData = (story.link_data || {}) as Record<string, unknown>;
  const videoData = (story.video_data || {}) as Record<string, unknown>;

  const text = unique([
    ...(libraryContent?.primaryTexts || []),
    ...(libraryContent?.headlines || []),
    ...(libraryContent?.descriptions || []),
    asText(creative.body),
    asText(creative.title),
    asText(linkData.message),
    asText(linkData.name),
    asText(videoData.message),
    asText(videoData.title),
  ]);

  const linkedImages = libraryCreative
    ? [
        ...imageUrlsFromLibraryAsset(libraryCreative),
        ...(libraryContent?.media || []).flatMap((media) => {
          if (media.kind === "IMAGE" && media.imageHash) {
            return assetIndex.imagesByHash.get(media.imageHash) || [];
          }
          if (media.kind === "VIDEO" && media.videoId) {
            return assetIndex.videoThumbnailsById.get(media.videoId) || [];
          }
          return [];
        }),
      ]
    : [];
  const directImages = collectMetaDirectImageUrls(creative);
  const imageUrls = unique([
    ...linkedImages,
    ...directImages,
    validMediaUrl(libraryCreative?.providerAsset?.thumbnailUrl) || "",
  ]);
  const url =
    asText(creative.link_url) ||
    asText(linkData.link) ||
    asText(creative.link_destination_display_url) ||
    libraryContent?.finalUrls?.[0] ||
    "";

  return {
    provider: "metaAds",
    recordKind: "STANDARD_AD",
    id: ad.id,
    name: ad.name || `Meta Ad ${ad.id}`,
    status: ad.effective_status || ad.status || "UNKNOWN",
    campaign: ad.campaign_id || "Campaign unavailable",
    type: asText(libraryContent?.creativeType).replace(/_/g, " ") || "Meta creative",
    text,
    urls: url ? [url] : [],
    imageUrls,
    cta: asText(libraryContent?.callToAction) || asText(creative.call_to_action_type) || undefined,
    raw: ad,
  };
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 break-words text-xs text-slate-700">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="text-xs font-bold text-slate-800">{value}</p>
    </div>
  );
}

function AdImages({ urls, alt, videoId }: { urls: string[]; alt: string; videoId?: string }) {
  const validVideoId = videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null;
  if (!urls.length && validVideoId) {
    return (
      <div className="bg-slate-50 p-2">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(validVideoId)}`}
          title={`${alt} video creative`}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="aspect-video w-full rounded-lg border-0 bg-black"
        />
      </div>
    );
  }
  if (!urls.length) {
    return (
      <div className="flex min-h-36 items-center justify-center bg-slate-50 p-5 text-center">
        <div className="max-w-sm">
          <span className="text-3xl text-slate-300">▧</span>
          <p className="mt-2 text-xs text-slate-500">No linked image or video preview was returned for this creative.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-36 grid-cols-2 gap-1 bg-slate-50 p-1">
      {urls.slice(0, 4).map((url, index) => (
        <img
          key={`${index}-${url}`}
          src={url}
          alt={`${alt} creative ${index + 1}`}
          loading="lazy"
          className={`max-h-48 min-h-32 w-full bg-white object-contain ${urls.length === 1 ? "col-span-2" : ""}`}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ))}
      {urls.length > 4 && (
        <div className="col-span-2 px-2 py-1 text-center text-[10px] text-slate-500">
          +{urls.length - 4} more creative images
        </div>
      )}
    </div>
  );
}

export default function AdManagementPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [connections, setConnections] = useState({
    googleAds: emptyConnection(),
    metaAds: emptyConnection(),
  });
  const [ads, setAds] = useState<AdRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState<Provider | null>(null);
  const [cursors, setCursors] = useState<Cursors>({ googleAds: null, metaAds: null });
  const [hasMore, setHasMore] = useState({ googleAds: false, metaAds: false });
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdRecord | null>(null);
  const requestId = useRef(0);

  const getAccessToken = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error("Your session has expired. Please sign in again.");
    return token;
  }, [getToken]);

  const loadInitial = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setAds([]);
    setCursors({ googleAds: null, metaAds: null });
    setHasMore({ googleAds: false, metaAds: false });

    try {
      const token = await getAccessToken();
      const response = await fetch(`${API_BASE_URL}/api/connections/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const connectionData = (await response.json()) as ConnectionsResponse;
      if (!response.ok) {
        throw new Error(connectionData.message || "Unable to load connected advertising accounts.");
      }

      const normalize = (provider?: Partial<ProviderConnection>): ProviderConnection => ({
        connected: Boolean(provider?.connected),
        accounts: Array.isArray(provider?.accounts) ? provider.accounts : [],
        selectedAccountId:
          typeof provider?.selectedAccountId === "string" ? provider.selectedAccountId : null,
      });
      const nextConnections = {
        googleAds: normalize(connectionData.providers?.googleAds),
        metaAds: normalize(connectionData.providers?.metaAds),
      };
      if (id !== requestId.current) return;
      setConnections(nextConnections);

      const [googleAdsResult, metaAdsResult, googleAssetsResult, metaAssetsResult, googlePMaxResult] =
        await Promise.allSettled([
          nextConnections.googleAds.connected && nextConnections.googleAds.selectedAccountId
            ? fetchGoogleAds(token, nextConnections.googleAds.selectedAccountId)
            : Promise.resolve(null),
          nextConnections.metaAds.connected && nextConnections.metaAds.selectedAccountId
            ? fetchMetaAds(token, nextConnections.metaAds.selectedAccountId)
            : Promise.resolve(null),
          nextConnections.googleAds.connected && nextConnections.googleAds.selectedAccountId
            ? getAllProviderAssets(token, "googleAds", nextConnections.googleAds.selectedAccountId)
            : Promise.resolve([] as LibraryAsset[]),
          nextConnections.metaAds.connected && nextConnections.metaAds.selectedAccountId
            ? getAllProviderAssets(token, "metaAds", nextConnections.metaAds.selectedAccountId)
            : Promise.resolve([] as LibraryAsset[]),
          nextConnections.googleAds.connected && nextConnections.googleAds.selectedAccountId
            ? fetchGooglePMaxRecords(token)
            : Promise.resolve([] as AdRecord[]),
        ]);

      if (id !== requestId.current) return;

      const messages: string[] = [];
      const googleAds = googleAdsResult.status === "fulfilled" ? googleAdsResult.value : null;
      const metaAds = metaAdsResult.status === "fulfilled" ? metaAdsResult.value : null;
      const googleAssets = googleAssetsResult.status === "fulfilled" ? googleAssetsResult.value : [];
      const metaAssets = metaAssetsResult.status === "fulfilled" ? metaAssetsResult.value : [];
      const googlePMaxRecords = googlePMaxResult.status === "fulfilled" ? googlePMaxResult.value : [];

      if (googleAdsResult.status === "rejected") {
        messages.push(`Google Ads: ${googleAdsResult.reason instanceof Error ? googleAdsResult.reason.message : "Unable to load ads."}`);
      }
      if (metaAdsResult.status === "rejected") {
        messages.push(`Meta Ads: ${metaAdsResult.reason instanceof Error ? metaAdsResult.reason.message : "Unable to load ads."}`);
      }
      if (googleAssetsResult.status === "rejected") {
        messages.push(`Google creative images could not be resolved from Asset Library: ${googleAssetsResult.reason instanceof Error ? googleAssetsResult.reason.message : "asset lookup failed."}`);
      }
      if (metaAssetsResult.status === "rejected") {
        messages.push(`Meta creative images could not be resolved from Asset Library: ${metaAssetsResult.reason instanceof Error ? metaAssetsResult.reason.message : "asset lookup failed."}`);
      }
      if (googlePMaxResult.status === "rejected") {
        messages.push(`Google Performance Max assets could not be loaded: ${googlePMaxResult.reason instanceof Error ? googlePMaxResult.reason.message : "asset-group lookup failed."}`);
      }

      const googleImageMap = buildGoogleImageMap(googleAssets);
      const metaAssetIndex = buildMetaAssetIndex(metaAssets);
      const records: AdRecord[] = [
        ...(googleAds?.ads || []).map((ad) => googleRecord(ad, googleImageMap)),
        ...googlePMaxRecords,
        ...(metaAds?.ads || []).map((ad) => metaRecord(ad, metaAssetIndex)),
      ];
      setAds(records);

      setCursors({
        googleAds: googleAds?.nextPageToken ?? null,
        metaAds: metaAds?.pagination.nextCursor ?? null,
      });
      setHasMore({
        googleAds: Boolean(googleAds?.nextPageToken),
        metaAds: Boolean(metaAds?.pagination.hasNextPage),
      });

      if (messages.length) setError(messages.join(" "));
    } catch (err) {
      if (id === requestId.current) {
        setError(err instanceof Error ? err.message : "Unable to load ads.");
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [getAccessToken, isLoaded, isSignedIn]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  async function loadMore(provider: Provider) {
    if (loadingMore) return;
    const accountId = connections[provider].selectedAccountId;
    if (!accountId) return;
    setLoadingMore(provider);
    setError(null);
    try {
      const token = await getAccessToken();
      if (provider === "googleAds") {
        const [result, assets] = await Promise.all([
          fetchGoogleAds(token, accountId, cursors.googleAds),
          getAllProviderAssets(token, "googleAds", accountId),
        ]);
        const imageMap = buildGoogleImageMap(assets);
        setAds((current) => [...current, ...result.ads.map((ad) => googleRecord(ad, imageMap))]);
        setCursors((current) => ({ ...current, googleAds: result.nextPageToken }));
        setHasMore((current) => ({ ...current, googleAds: Boolean(result.nextPageToken) }));
      } else {
        const [result, assets] = await Promise.all([
          fetchMetaAds(token, accountId, cursors.metaAds),
          getAllProviderAssets(token, "metaAds", accountId),
        ]);
        const assetIndex = buildMetaAssetIndex(assets);
        setAds((current) => [...current, ...result.ads.map((ad) => metaRecord(ad, assetIndex))]);
        setCursors((current) => ({ ...current, metaAds: result.pagination.nextCursor }));
        setHasMore((current) => ({ ...current, metaAds: result.pagination.hasNextPage }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to load more ${providerName(provider)}.`);
    } finally {
      setLoadingMore(null);
    }
  }

  const filtered = useMemo(
    () =>
      ads.filter((ad) => {
        const rawProviderStatus = ad.provider === "googleAds" && ad.recordKind === "STANDARD_AD"
          ? (ad.raw as GoogleAd).status || ""
          : "";
        const statusText = `${ad.status} ${ad.primaryStatus || ""} ${rawProviderStatus}`.toUpperCase();
        const diagnostics = diagnosticsForRecord(ad);
        const statusMatches = statusFilter === "ALL"
          ? true
          : statusFilter === "WITH_ISSUES"
            ? recordNeedsAttention(ad)
            : ad.status.toUpperCase() === statusFilter ||
              (ad.primaryStatus || "").toUpperCase() === statusFilter ||
              rawProviderStatus.toUpperCase() === statusFilter;
        const searchText = `${ad.name} ${ad.campaign} ${ad.type} ${ad.assetGroupName || ""} ${ad.assetFieldType || ""} ${ad.videoId || ""} ${ad.text.join(" ")} ${diagnostics.join(" ")} ${statusText} ${ad.id}`;
        return (filter === "ALL" || ad.provider === filter) &&
          statusMatches &&
          searchText.toLowerCase().includes(search.toLowerCase());
      }),
    [ads, filter, statusFilter, search],
  );

  const googleCount = ads.filter((ad) => ad.provider === "googleAds").length;
  const metaCount = ads.filter((ad) => ad.provider === "metaAds").length;
  const attentionCount = ads.filter(recordNeedsAttention).length;

  if (!isLoaded) return <div className="p-8 text-sm text-slate-500">Loading your session…</div>;
  if (!isSignedIn) return <div className="rounded-xl border bg-white p-8 text-sm text-slate-600">Sign in to view your ads.</div>;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-3 sm:p-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-600">Ad Management</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Connected Ads</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Browse the ad formats returned by each connected provider. Eligibility, policy and delivery explanations use provider-reported diagnostics and are shown whenever those details are available.
          </p>
        </div>
        <button
          onClick={() => void loadInitial()}
          disabled={loading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "↻ Refresh ads"}
        </button>
      </header>

      {error && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { title: "Google Ads records", count: googleCount, account: connections.googleAds.selectedAccountId || (connections.googleAds.connected ? "No account selected" : "Not connected"), tone: "blue" },
          { title: "Meta Ads records", count: metaCount, account: connections.metaAds.selectedAccountId || (connections.metaAds.connected ? "No account selected" : "Not connected"), tone: "indigo" },
          { title: "Needs attention", count: attentionCount, account: "Provider-reported issues and restrictions", tone: "violet" },
          { title: "Total records", count: ads.length, account: "Across selected accounts", tone: "slate" },
        ].map((card) => (
          <div key={card.title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-600">{card.title}</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${card.tone === "blue" ? "bg-blue-50 text-blue-700" : card.tone === "indigo" ? "bg-indigo-50 text-indigo-700" : card.tone === "violet" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-700"}`}>{card.count}</span>
            </div>
            <p className="mt-3 truncate text-xs text-slate-400" title={card.account}>Account: {card.account}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {([
              { label: "All ads", value: "ALL" },
              { label: "Google Ads", value: "googleAds" },
              { label: "Meta Ads", value: "metaAds" },
            ] as const).map((item) => (
              <button
                key={item.value}
                onClick={() => setFilter(item.value)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${filter === item.value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
            >
              <option value="ALL">All statuses</option>
              <option value="ENABLED">Enabled</option>
              <option value="ACTIVE">Active (Meta)</option>
              <option value="ELIGIBLE">Eligible</option>
              <option value="LIMITED">Limited</option>
              <option value="NOT_ELIGIBLE">Not eligible</option>
              <option value="DISAPPROVED">Disapproved</option>
              <option value="PENDING">Pending</option>
              <option value="PENDING_REVIEW">Pending review</option>
              <option value="PAUSED">Paused</option>
              <option value="REMOVED">Removed</option>
              <option value="WITH_ISSUES">Needs attention</option>
            </select>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search ads, formats, campaigns or issue details…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 sm:w-72"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid min-h-64 place-items-center text-sm text-slate-500">Loading ads and matching creative media…</div>
        ) : filtered.length === 0 ? (
          <div className="grid min-h-64 place-items-center px-6 text-center">
            <div>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-2xl">▧</div>
              <h2 className="mt-3 text-base font-semibold text-slate-900">No ads found</h2>
              <p className="mt-1 max-w-lg text-sm text-slate-500">
                {!connections.googleAds.selectedAccountId && !connections.metaAds.selectedAccountId
                  ? "Connect an advertising provider and select an account on the Provider page to see its ads here."
                  : "No ads match these filters, or the selected accounts have no ads available."}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 sm:p-5">
            {filtered.map((ad) => (
              <article key={`${ad.provider}-${ad.id}`} className="overflow-hidden rounded-xl border border-slate-200 transition hover:border-slate-300 hover:shadow-md">
                <AdImages urls={ad.imageUrls} alt={ad.name} videoId={ad.videoId} />
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-slate-900" title={ad.name}>{ad.name}</h3>
                      <p className="mt-1 truncate text-xs text-slate-500">{ad.campaign}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${ad.provider === "googleAds" ? "bg-blue-50 text-blue-700" : "bg-indigo-50 text-indigo-700"}`}>{providerName(ad.provider)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{ad.type}</span>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${/ENABLED|ACTIVE|ELIGIBLE/.test(`${ad.status} ${ad.primaryStatus || ""}`.toUpperCase()) ? "bg-emerald-50 text-emerald-700" : /PAUSED|PENDING|LIMITED|REVIEW|WITH_ISSUES|IN_PROCESS/.test(`${ad.status} ${ad.primaryStatus || ""}`.toUpperCase()) ? "bg-amber-50 text-amber-700" : /REMOVED|DISAPPROVED|NOT_ELIGIBLE|FAILED|BLOCKED/.test(`${ad.status} ${ad.primaryStatus || ""}`.toUpperCase()) ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{ad.status.replace(/_/g, " ")}</span>
                    {ad.imageUrls.length > 0 && <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700">{ad.imageUrls.length} media</span>}
                    {ad.recordKind === "PMAX_ASSET" && <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700">Linked asset</span>}
                  </div>
                  {ad.assetGroupName && <p className="truncate text-[11px] font-medium text-violet-700" title={ad.assetGroupName}>Asset Group: {ad.assetGroupName}</p>}
                  {(() => {
                    const reasons = diagnosticsForRecord(ad);
                    return reasons.length > 0 ? (
                      <div className="rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Why this record needs attention</p>
                        <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-amber-900">{reasons[0]}{reasons.length > 1 ? ` +${reasons.length - 1} more details` : ""}</p>
                      </div>
                    ) : null;
                  })()}
                  <p className="line-clamp-3 min-h-12 text-xs leading-relaxed text-slate-600">{ad.text[0] || (ad.videoId ? `YouTube video asset: ${ad.videoId}` : "No ad copy available.")}</p>
                  {ad.provider === "googleAds" && ad.recordKind === "STANDARD_AD" && (
                    <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                      {(() => {
                        const googleAd = ad.raw as GoogleAd;
                        return <>
                          <Metric label="Impressions" value={formatNumber(googleAd.metrics?.impressions)} />
                          <Metric label="Clicks" value={formatNumber(googleAd.metrics?.clicks)} />
                          <Metric label="Cost" value={moneyFromMicros(googleAd.metrics?.costMicros)} />
                        </>;
                      })()}
                    </div>
                  )}
                  <button
                    onClick={() => setSelected(ad)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    View ad details →
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        <footer className="flex flex-col gap-3 border-t border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">Showing {filtered.length} of {ads.length} loaded records · Provider formats and hierarchy are preserved; status explanations are shown when returned by Google Ads or Meta.</p>
          <div className="flex flex-wrap gap-2">
            {(filter === "ALL" ? (["googleAds", "metaAds"] as Provider[]) : [filter])
              .filter((provider) => hasMore[provider])
              .map((provider) => (
                <button
                  key={provider}
                  onClick={() => void loadMore(provider)}
                  disabled={loadingMore !== null}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {loadingMore === provider ? `Loading ${providerName(provider)}…` : `Load more ${providerName(provider)}`}
                </button>
              ))}
          </div>
        </footer>
      </section>

      {selected && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="ad-details-title" className="mx-auto my-8 max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{providerName(selected.provider)} · {selected.id}</p>
                <h2 id="ad-details-title" className="mt-1 text-lg font-bold text-slate-900">{selected.name}</h2>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg border px-3 py-1.5 text-sm">✕</button>
            </div>
            <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5">
              {selected.videoId && /^[A-Za-z0-9_-]{11}$/.test(selected.videoId) && (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(selected.videoId)}`}
                  title={`${selected.name} video creative`}
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="aspect-video w-full rounded-xl border-0 bg-black"
                />
              )}
              {selected.imageUrls.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {selected.imageUrls.map((url, index) => (
                    <img
                      key={`${index}-${url}`}
                      src={url}
                      alt={`${selected.name} creative ${index + 1}`}
                      loading="lazy"
                      className="max-h-80 w-full rounded-xl bg-slate-50 object-contain"
                    />
                  ))}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Info label="Status" value={selected.status} />
                <Info label="Campaign" value={selected.campaign} />
                <Info label="Format" value={selected.type} />
                <Info label="Record ID" value={selected.id} />
                {selected.provider === "googleAds" && selected.recordKind === "STANDARD_AD" && <>
                  <Info label="Campaign channel" value={(selected.raw as GoogleAd).campaignChannelType || "Not returned"} />
                  <Info label="Campaign status" value={(selected.raw as GoogleAd).campaignPrimaryStatus || (selected.raw as GoogleAd).campaignStatus || "Not returned"} />
                  <Info label="Ad group" value={(selected.raw as GoogleAd).adGroupName || (selected.raw as GoogleAd).adGroupId || "—"} />
                  <Info label="Ad group serving status" value={(selected.raw as GoogleAd).adGroupPrimaryStatus || (selected.raw as GoogleAd).adGroupStatus || "Not returned"} />
                  <Info label="Ad serving status" value={(selected.raw as GoogleAd).primaryStatus || "Not returned"} />
                  <Info label="Ad status (configured)" value={(selected.raw as GoogleAd).status || "Not returned"} />
                  <Info label="Ad strength" value={(selected.raw as GoogleAd).adStrength || "—"} />
                  <Info label="Approval" value={(selected.raw as GoogleAd).approvalStatus || "—"} />
                  <Info label="Policy review" value={(selected.raw as GoogleAd).reviewStatus || "Not returned"} />
                  <Info label="Reporting period" value="Last 30 days" />
                </>}
                {selected.recordKind === "PMAX_ASSET" && <>
                  <Info label="Record type" value="Performance Max linked asset" />
                  <Info label="Asset group" value={selected.assetGroupName || "—"} />
                  <Info label="Asset group ID" value={selected.assetGroupId || "—"} />
                  <Info label="Asset ID" value={(selected.raw as GooglePMaxRaw).asset.id || (selected.raw as GooglePMaxRaw).asset.resourceName || "—"} />
                  <Info label="Asset field" value={selected.assetFieldType || "—"} />
                  <Info label="Video ID" value={selected.videoId || "—"} />
                  <Info label="Serving status" value={selected.primaryStatus || selected.status} />
                  <Info label="Asset group serving status" value={(selected.raw as GooglePMaxRaw).assetGroup.primaryStatus || (selected.raw as GooglePMaxRaw).assetGroup.status || "—"} />
                  <Info label="Asset source" value={(selected.raw as GooglePMaxRaw).asset.source || "—"} />
                  <Info label="Asset MIME type" value={(selected.raw as GooglePMaxRaw).asset.mimeType || "—"} />
                  <Info label="Policy approval" value={(selected.raw as GooglePMaxRaw).asset.approvalStatus || "Not returned"} />
                  <Info label="Policy review" value={(selected.raw as GooglePMaxRaw).asset.reviewStatus || "Not returned"} />
                  <Info label="Campaign channel" value={(selected.raw as GooglePMaxRaw).assetGroup.campaignChannelType || "PERFORMANCE_MAX"} />
                  <Info label="Campaign status" value={(selected.raw as GooglePMaxRaw).assetGroup.campaignPrimaryStatus || (selected.raw as GooglePMaxRaw).assetGroup.campaignStatus || "Not returned"} />
                </>}
                {selected.provider === "metaAds" && selected.recordKind === "STANDARD_AD" && <>
                  <Info label="Effective status" value={(selected.raw as MetaAd).effective_status || selected.status} />
                  <Info label="Provider issues" value={String(Array.isArray((selected.raw as MetaAd).issues_info) ? (selected.raw as MetaAd).issues_info!.length : 0)} />
                  <Info label="Failed delivery checks" value={String(Array.isArray((selected.raw as MetaAd).failed_delivery_checks) ? (selected.raw as MetaAd).failed_delivery_checks!.length : 0)} />
                </>}
              </div>
              {selected.provider === "googleAds" && selected.recordKind === "STANDARD_AD" && (selected.raw as GoogleAd).actionItems?.length ? (
                <section className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-blue-900">Google Ads suggested improvements</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-700">
                    {(selected.raw as GoogleAd).actionItems!.map((item, index) => <li key={`google-action-${index}`}>{providerReasonLabel(item)}</li>)}
                  </ul>
                </section>
              ) : null}
              {(() => {
                const diagnostics = diagnosticsForRecord(selected);
                const status = `${selected.status} ${selected.primaryStatus || ""}`.toUpperCase();
                const hasAttention = diagnostics.length > 0 || /NOT_ELIGIBLE|DISAPPROVED|LIMITED|PENDING_REVIEW|WITH_ISSUES|IN_PROCESS|FAILED|BLOCKED/.test(status);
                if (!hasAttention) return null;
                return (
                  <section className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-amber-900">Eligibility, policy & delivery details</h3>
                    {diagnostics.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-700">
                        {diagnostics.map((reason, index) => <li key={`provider-diagnostic-${index}`}>{reason}</li>)}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs leading-relaxed text-slate-600">
                        The provider returned a status that may affect delivery, but did not include a more specific explanation in this response. This can depend on the campaign, account, creative, destination, review state or market. Check the provider's account for the latest review details.
                      </p>
                    )}
                  </section>
                );
              })()}
              {selected.text.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Ad copy</h3>
                  <div className="space-y-2">
                    {selected.text.map((text, index) => <p key={index} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{text}</p>)}
                  </div>
                </section>
              )}
              {selected.cta && <Info label="Call to action" value={selected.cta} />}
              {selected.urls.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Destination URLs</h3>
                  {selected.urls.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="mb-2 block break-all rounded-lg bg-slate-50 p-3 text-xs text-blue-700 hover:underline">{url}</a>
                  ))}
                </section>
              )}
              {selected.provider === "googleAds" && selected.recordKind === "STANDARD_AD" && (
                <section>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Performance · Last 30 days</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {(() => {
                      const metrics = (selected.raw as GoogleAd).metrics;
                      return [
                        ["Impressions", formatNumber(metrics.impressions)],
                        ["Clicks", formatNumber(metrics.clicks)],
                        ["CTR", `${(metrics.ctr || 0).toFixed(2)}%`],
                        ["Spend", moneyFromMicros(metrics.costMicros)],
                        ["Conversions", formatNumber(metrics.conversions)],
                        ["Conversion value", formatNumber(metrics.conversionsValue)],
                      ].map(([label, value]) => <Info key={label} label={label} value={value} />);
                    })()}
                  </div>
                </section>
              )}
              <details className="rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">Raw provider response</summary>
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">{JSON.stringify(selected.raw, null, 2)}</pre>
              </details>
            </div>
            <div className="flex justify-end border-t border-slate-100 p-4">
              <button onClick={() => setSelected(null)} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white">Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
