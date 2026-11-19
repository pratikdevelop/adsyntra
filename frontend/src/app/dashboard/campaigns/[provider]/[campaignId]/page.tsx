"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";

import PaidRoundedIcon from "@mui/icons-material/PaidRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import TouchAppRoundedIcon from "@mui/icons-material/TouchAppRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import ShoppingCartRoundedIcon from "@mui/icons-material/ShoppingCartRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import SpeedRoundedIcon from "@mui/icons-material/SpeedRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import VideocamRoundedIcon from "@mui/icons-material/VideocamRounded";
import TextFieldsRoundedIcon from "@mui/icons-material/TextFieldsRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import InboxRoundedIcon from "@mui/icons-material/InboxRounded";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { getCampaigns } from "@/lib/campaign-api";

/* ---------------------------------------------------------------- types */
type ProviderKey = "googleAds" | "metaAds";
type RecordValue = Record<string, any>;
type ChildRecord = RecordValue;

interface CampaignRecord extends RecordValue {
  id: string;
  provider: ProviderKey;
  name: string;
  accountId: string | null;
  status: string | null;
  effectiveStatus: string | null;
  objective: string | null;
  source: RecordValue;
}

interface CampaignApiResponse {
  success?: boolean;
  message?: string;
  campaigns?: RecordValue[];
  providers?: Partial<Record<ProviderKey, RecordValue>>;
}

/* --------------------------------------------------------------- helpers */
function asRecord(value: unknown): RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}

function stringValue(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatNumber(value: unknown): string {
  const number = numberValue(value);
  return number === null
    ? "—"
    : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(number);
}

function formatCurrency(value: unknown, currency: string | null): string {
  const number = numberValue(value);
  if (number === null) return "—";
  if (!currency) return formatNumber(number);
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(number);
  } catch {
    return `${formatNumber(number)} ${currency}`;
  }
}

function statusColor(
  status: string | null
): "success" | "warning" | "error" | "default" {
  const normalized = (status ?? "").toUpperCase();
  if (["ACTIVE", "ENABLED", "DELIVERING", "ELIGIBLE"].includes(normalized)) return "success";
  if (["PAUSED", "PENDING", "IN_PROCESS", "LIMITED"].includes(normalized)) return "warning";
  if (["REMOVED", "DELETED", "DISAPPROVED", "FAILED"].includes(normalized)) return "error";
  return "default";
}

function normalizeCampaign(
  rawValue: RecordValue,
  provider: ProviderKey,
  fallbackAccountId?: string | null
): CampaignRecord {
  const raw = asRecord(rawValue);
  const source = Object.keys(asRecord(raw.source)).length ? asRecord(raw.source) : raw;
  const nested = asRecord(source.campaign ?? asRecord(source.raw).campaign);
  const id = stringValue(raw.id, raw.resourceName, raw.resource_name) ?? "";
  return {
    ...raw,
    id,
    provider,
    name: stringValue(raw.name) ?? "Untitled campaign",
    accountId: stringValue(raw.accountId, raw.account_id, fallbackAccountId),
    status: stringValue(raw.status),
    effectiveStatus: stringValue(raw.effectiveStatus, raw.effective_status, raw.status),
    objective: stringValue(raw.objective, source.objective, nested.objective),
    campaignType: stringValue(
      raw.campaignType,
      raw.channelType,
      raw.advertisingChannelType,
      source.channelType,
      source.advertising_channel_type,
      nested.advertising_channel_type
    ),
    bidStrategy: stringValue(
      raw.bidStrategy,
      raw.bid_strategy,
      asRecord(source.bidding).strategy,
      nested.biddingStrategyType
    ),
    source,
  };
}

function getCampaignRows(
  payload: CampaignApiResponse,
  provider: ProviderKey
): RecordValue[] {
  if (Array.isArray(payload.campaigns)) {
    const matching = payload.campaigns.filter((item) => asRecord(item).provider === provider);
    if (matching.length) return matching;
  }
  const result = asRecord(payload.providers?.[provider]);
  if (Array.isArray(result.campaigns)) return result.campaigns;
  const data = asRecord(result.data);
  if (Array.isArray(result.data)) return result.data as RecordValue[];
  if (Array.isArray(data.campaigns)) return data.campaigns;
  return [];
}

function getCurrency(campaign: CampaignRecord): string | null {
  const source = campaign.source;
  const budget = asRecord(source.budget ?? source.campaignBudget);
  const customer = asRecord(source.customer);
  return stringValue(
    customer.currencyCode,
    budget.currencyCode,
    source.currencyCode,
    source.currency,
    campaign.currency
  );
}

function getBudget(campaign: CampaignRecord): { amount: number | null; period: string | null } {
  const source = campaign.source;
  const normalized = asRecord(source.budget);
  const apiBudget = asRecord(source.campaignBudget);
  const googleAmount = numberValue(normalized.amount);
  if (googleAmount !== null)
    return { amount: googleAmount, period: stringValue(normalized.period, normalized.type) };
  const micros = numberValue(normalized.amountMicros ?? apiBudget.amountMicros ?? apiBudget.amount_micros);
  if (micros !== null)
    return { amount: micros / 1_000_000, period: stringValue(normalized.period, normalized.type) };
  const daily = numberValue(source.daily_budget);
  if (daily !== null) return { amount: daily / 100, period: "Daily" };
  const lifetime = numberValue(source.lifetime_budget);
  if (lifetime !== null) return { amount: lifetime / 100, period: "Lifetime" };
  return { amount: null, period: null };
}

function getSpend(campaign: CampaignRecord): number | null {
  const metrics = asRecord(campaign.source.metrics ?? campaign.metrics);
  const spend = numberValue(metrics.spend);
  if (spend !== null) return spend;
  const micros = numberValue(metrics.costMicros ?? metrics.cost_micros);
  return micros === null ? null : micros / 1_000_000;
}

/* ------------------------------- creative extraction (unchanged) --------- */
interface CreativeMediaItem {
  url: string;
  label: string;
  sourcePath: string;
  width?: number | null;
  height?: number | null;
  mimeType?: string | null;
}
interface CreativeVideoItem {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  sourcePath: string;
  embedUrl: string | null;
}
interface CreativeAssetItem {
  id: string;
  type: string;
  name: string | null;
  text: string | null;
  url: string | null;
  videoId: string | null;
  width?: number | null;
  height?: number | null;
  thumbnailUrl?: string | null;
  mimeType?: string | null;
  resolutionError?: string | null;
  sourcePath: string;
  details: RecordValue;
}

function textValues(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text ? [text] : [];
  }
  if (Array.isArray(value)) return value.flatMap(textValues);
  const record = asRecord(value);
  for (const key of ["text", "title", "body", "headline", "name", "description", "message"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return [candidate.trim()];
  }
  return [];
}

function collectCreativeUrls(value: unknown): Array<{ url: string; path: string }> {
  const found: Array<{ url: string; path: string }> = [];
  const visited = new Set<object>();
  const isHttpUrl = (candidate: unknown): candidate is string => {
    if (typeof candidate !== "string") return false;
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  };
  const visit = (current: unknown, path: string, depth: number): void => {
    if (depth > 12 || current === null || current === undefined) return;
    if (typeof current !== "object") return;
    if (visited.has(current)) return;
    visited.add(current);
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(current as RecordValue)) {
      const childPath = path ? `${path}.${key}` : key;
      const normalizedKey = key.toLowerCase().replace(/[_-]/g, "");
      const imageField = ["imageurl", "thumbnailurl", "picture", "previewimageurl", "fullsizeurl"].includes(normalizedKey);
      const urlInImageCollection =
        normalizedKey === "url" && /(^|\.)(images|pictures|photos|thumbnails)(\.|\[)/i.test(path);
      if ((imageField || urlInImageCollection) && isHttpUrl(child)) {
        found.push({ url: child, path: childPath });
      } else {
        visit(child, childPath, depth + 1);
      }
    }
  };
  visit(value, "creative", 0);
  return [...new Map(found.map((item) => [item.url, item])).values()];
}

function collectVideoIds(
  value: unknown
): Array<{ id: string; path: string; title: string | null; thumbnailUrl: string | null }> {
  const found: Array<{ id: string; path: string; title: string | null; thumbnailUrl: string | null }> = [];
  const visited = new Set<object>();
  const visit = (current: unknown, path: string, depth: number): void => {
    if (depth > 12 || current === null || current === undefined || typeof current !== "object") return;
    if (visited.has(current)) return;
    visited.add(current);
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1));
      return;
    }
    const record = current as RecordValue;
    for (const [key, child] of Object.entries(record)) {
      const nextPath = path ? `${path}.${key}` : key;
      const normalizedKey = key.toLowerCase().replace(/[_-]/g, "");
      if (["videoid", "youtubevideoid"].includes(normalizedKey) && typeof child === "string" && child.trim()) {
        const title = stringValue(record.title, record.name, record.youtubeVideoTitle);
        const thumbnailUrl = stringValue(
          record.thumbnail_url,
          record.thumbnailUrl,
          record.image_url,
          record.imageUrl
        );
        found.push({ id: child.trim(), path: nextPath, title, thumbnailUrl });
      } else {
        visit(child, nextPath, depth + 1);
      }
    }
  };
  visit(value, "creative", 0);
  return [...new Map(found.map((item) => [item.id, item])).values()];
}

function extractCreative(ad: ChildRecord, provider: ProviderKey) {
  const creative = asRecord(ad.creative ?? ad.creativeDetails ?? ad.creative_details ?? ad.adCreative);
  const formatPayload = asRecord(ad.creativeDetails ?? ad.creative_details ?? ad);
  const story = asRecord(creative.object_story_spec ?? creative.objectStorySpec);
  const linkData = asRecord(story.link_data ?? story.linkData);
  const videoData = asRecord(story.video_data ?? story.videoData);
  const feed = asRecord(creative.asset_feed_spec ?? creative.assetFeedSpec);
  const rawLinkedAssets = Array.isArray(ad.linkedAssets)
    ? ad.linkedAssets
    : Array.isArray(ad.resolvedAssets)
      ? ad.resolvedAssets
      : Array.isArray(ad.linked_assets)
        ? ad.linked_assets
        : [];

  const linkedAssets: CreativeAssetItem[] = rawLinkedAssets.map((value, index) => {
    const asset = asRecord(value);
    const type = stringValue(asset.type, asset.assetType, asset.asset_type) ?? "OTHER";
    const resourceName = stringValue(asset.resourceName, asset.resource_name, asset.id) ?? `asset-${index + 1}`;
    const details = asRecord(asset.details ?? asset.raw);
    const sourcePath =
      stringValue(asset.sourcePath, asset.source_path) ??
      (provider === "googleAds"
        ? "ads[].assetResourceNames[] → asset.resource_name"
        : "ads[].creative.asset_feed_spec.images[].hash → adimages");
    return {
      id: resourceName,
      type: type.toUpperCase(),
      name: stringValue(asset.name),
      text: stringValue(
        asset.textContent,
        asset.text_content,
        asset.callToAction,
        asset.call_to_action,
        asset.displayText,
        asset.display_text
      ),
      url: stringValue(asset.mediaUrl, asset.media_url, asset.url, asset.imageUrl, asset.image_url),
      videoId: stringValue(asset.videoId, asset.video_id),
      width: numberValue(asset.width),
      height: numberValue(asset.height),
      thumbnailUrl: stringValue(asset.thumbnailUrl, asset.thumbnail_url),
      mimeType: stringValue(asset.mimeType, asset.mime_type),
      resolutionError: stringValue(asset.resolutionError, asset.resolution_error),
      sourcePath,
      details,
    };
  });

  const directUrls = [...collectCreativeUrls(creative), ...collectCreativeUrls(formatPayload)];
  const images: CreativeMediaItem[] = [
    ...linkedAssets
      .filter((a) => a.type === "IMAGE" && (a.url || a.thumbnailUrl))
      .map((a) => ({
        url: (a.url ?? a.thumbnailUrl) as string,
        label: a.name ?? "Image asset",
        sourcePath: a.sourcePath,
        width: a.width ?? numberValue(asRecord(asRecord(a.details.imageAsset).fullSize).widthPixels),
        height: a.height ?? numberValue(asRecord(asRecord(a.details.imageAsset).fullSize).heightPixels),
        mimeType: a.mimeType ?? stringValue(a.details.mimeType, a.details.mime_type),
      })),
    ...directUrls.map((item) => ({ url: item.url, label: "Creative image", sourcePath: item.path })),
  ];
  const uniqueImages = [...new Map(images.map((item) => [item.url, item])).values()];

  const videoIds = collectVideoIds(creative).concat(collectVideoIds(formatPayload));
  const videos: CreativeVideoItem[] = [
    ...linkedAssets
      .filter((a) => a.type.includes("VIDEO") || a.videoId)
      .map((a) => {
        const id = a.videoId ?? "";
        const youtube = /^[A-Za-z0-9_-]{11}$/.test(id);
        return {
          videoId: id,
          title: a.name ?? "Video asset",
          thumbnailUrl: a.thumbnailUrl ?? stringValue(a.details.thumbnailUrl, a.details.thumbnail_url),
          sourcePath: a.sourcePath,
          embedUrl: youtube ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null,
        };
      }),
    ...videoIds.map((v) => ({
      videoId: v.id,
      title: v.title ?? "Video creative",
      thumbnailUrl: v.thumbnailUrl,
      sourcePath: v.path,
      embedUrl: /^[A-Za-z0-9_-]{11}$/.test(v.id)
        ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}`
        : null,
    })),
  ].filter((item) => item.videoId);
  const uniqueVideos = [...new Map(videos.map((item) => [item.videoId, item])).values()];

  const feedTitles = textValues(feed.titles ?? feed.title);
  const feedBodies = textValues(feed.bodies ?? feed.body);
  const feedDescriptions = textValues(feed.descriptions ?? feed.description);
  const headlines = [
    ...textValues(ad.headlines),
    ...textValues(ad.longHeadlines),
    ...feedTitles,
    ...textValues(creative.title),
    ...textValues(linkData.name),
    ...textValues(videoData.title),
  ];
  const bodies = [
    ...textValues(ad.descriptions),
    ...feedBodies,
    ...textValues(creative.body),
    ...textValues(linkData.message),
    ...textValues(videoData.message),
  ];
  const descriptions = [
    ...feedDescriptions,
    ...textValues(creative.description),
    ...textValues(linkData.description),
  ];
  const ctaObject = asRecord(creative.call_to_action ?? linkData.call_to_action ?? videoData.call_to_action);
  const callToAction = stringValue(
    Array.isArray(ad.callToActions) ? ad.callToActions[0] : null,
    creative.call_to_action_type,
    ctaObject.type,
    ctaObject.value
  );
  const destination = stringValue(
    Array.isArray(ad.finalUrls) ? ad.finalUrls[0] : null,
    creative.link_url,
    linkData.link,
    videoData.link,
    creative.link_destination_display_url,
    feed.link_urls
  );

  const nativeTextAssets = linkedAssets.filter(
    (a) => a.type === "TEXT" || a.type === "CALLOUT" || (a.text && !["IMAGE", "VIDEO"].includes(a.type))
  );
  const textFieldSpecs: Array<[string, unknown, string]> = [
    ["Headline", ad.headlines, "ads[].headlines[]"],
    ["Long headline", ad.longHeadlines, "ads[].longHeadlines[]"],
    ["Description", ad.descriptions, "ads[].descriptions[]"],
    ["Call to action", ad.callToActions, "ads[].callToActions[]"],
    ["Business name", ad.businessNames, "ads[].businessNames[]"],
    ["Dynamic title", feed.titles ?? feed.title, "ad.creative.asset_feed_spec.titles[]"],
    ["Dynamic body", feed.bodies ?? feed.body, "ad.creative.asset_feed_spec.bodies[]"],
    ["Dynamic description", feed.descriptions ?? feed.description, "ad.creative.asset_feed_spec.descriptions[]"],
    ["Dynamic link URL", feed.link_urls ?? feed.linkUrls, "ad.creative.asset_feed_spec.link_urls[]"],
  ];
  const expandedTextAssets = textFieldSpecs.flatMap(([label, value, sourcePath]) =>
    textValues(value).map((text, index) => ({
      id: `copy-${label.toLowerCase().replace(/\s+/g, "-")}-${index}`,
      type: label.toUpperCase().replace(/\s+/g, "_"),
      name: label,
      text,
      url: /^https?:\/\//i.test(text) ? text : null,
      videoId: null as string | null,
      sourcePath,
      details: {} as RecordValue,
    }))
  );
  const textAssets = [...nativeTextAssets, ...expandedTextAssets].filter(
    (asset, index, all) =>
      all.findIndex((i) => i.type === asset.type && (i.text ?? i.url) === (asset.text ?? asset.url)) === index
  );
  const otherAssets = linkedAssets.filter(
    (a) =>
      !["IMAGE", "VIDEO", "YOUTUBE_VIDEO", "TEXT", "CALLOUT"].includes(a.type) ||
      (a.type === "IMAGE" && !a.url && !a.thumbnailUrl)
  );
  const unresolvedAssets = linkedAssets.filter(
    (a) => a.type === "UNRESOLVED" || (a.type === "IMAGE" && !a.url && !a.thumbnailUrl)
  );
  const assetReferences = Array.isArray(ad.assetResourceNames)
    ? ad.assetResourceNames.map(String)
    : Array.isArray(ad.asset_resource_names)
      ? ad.asset_resource_names.map(String)
      : linkedAssets.map((asset) => asset.id);

  const apiPath =
    provider === "googleAds"
      ? "GET /api/ads/google/ad-groups/:adGroupId/ads → ads[].assetResourceNames[] → Asset lookup → ads[].linkedAssets[]"
      : "GET /api/ads/meta/ad-sets/:adSetId/ads → ads[].creative → asset_feed_spec.images[].hash → Ad Account /adimages → ads[].resolvedAssets[]";

  return {
    headline: headlines[0] ?? stringValue(ad.name) ?? "Creative headline not supplied",
    body: bodies[0] ?? "No primary text was returned",
    description: descriptions[0] ?? null,
    destination,
    callToAction,
    images: uniqueImages,
    videos: uniqueVideos,
    textAssets,
    otherAssets,
    unresolvedAssets,
    linkedAssets,
    assetReferences,
    apiPath,
    directPayloadPaths: directUrls.map((item) => item.path),
    creative,
  };
}

/* ------------------------------------------------------------ UI atoms */
function DetailField({ label, value }: { label: string; value: unknown }) {
  const display =
    value === null || value === undefined || value === ""
      ? "—"
      : Array.isArray(value)
        ? value.length
          ? value.join(", ")
          : "None"
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ letterSpacing: ".02em" }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        fontWeight={600}
        sx={{ mt: 0.35, overflowWrap: "anywhere", lineHeight: 1.45 }}
      >
        {display}
      </Typography>
    </Box>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.35, minWidth: 0 }}>
        <Typography
          variant="body2"
          fontWeight={600}
          sx={{ fontFamily: "ui-monospace,monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}
        >
          {value}
        </Typography>
        <Tooltip title={copied ? "Copied!" : "Copy"} arrow>
          <IconButton size="small" onClick={copy} sx={{ p: 0.4 }}>
            {copied ? <CheckRoundedIcon fontSize="inherit" color="success" /> : <ContentCopyRoundedIcon fontSize="inherit" />}
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );
}

type Accent = "blue" | "emerald" | "amber" | "violet" | "rose" | "cyan" | "slate";

const ACCENT_MAP: Record<Accent, { bg: string; fg: string }> = {
  blue: { bg: "rgba(59,130,246,0.10)", fg: "#2563eb" },
  emerald: { bg: "rgba(16,185,129,0.10)", fg: "#059669" },
  amber: { bg: "rgba(245,158,11,0.12)", fg: "#d97706" },
  violet: { bg: "rgba(139,92,246,0.10)", fg: "#7c3aed" },
  rose: { bg: "rgba(244,63,94,0.10)", fg: "#e11d48" },
  cyan: { bg: "rgba(6,182,212,0.10)", fg: "#0891b2" },
  slate: { bg: "rgba(100,116,139,0.10)", fg: "#475569" },
};

function MetricCard({
  label,
  value,
  hint,
  icon,
  accent = "slate",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  accent?: Accent;
}) {
  const colors = ACCENT_MAP[accent];
  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        borderRadius: 3,
        borderColor: "divider",
        transition: "box-shadow .2s, transform .2s",
        "&:hover": { boxShadow: 2, transform: "translateY(-1px)" },
      }}
    >
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }} className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Typography variant="caption" color="text.secondary" fontWeight={600} className="truncate block">
            {label}
          </Typography>
          <Typography variant="h5" fontWeight={800} sx={{ mt: 0.5, letterSpacing: "-0.03em" }} className="truncate">
            {value}
          </Typography>
          {hint && (
            <Typography variant="caption" color="text.secondary" className="truncate block mt-0.5">
              {hint}
            </Typography>
          )}
        </div>
        <Box
          className="shrink-0 flex items-center justify-center"
          sx={{ width: 38, height: 38, borderRadius: 2, bgcolor: colors.bg, color: colors.fg }}
        >
          {icon}
        </Box>
      </CardContent>
    </Card>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  end,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  end?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-start gap-3 min-w-0">
        <Box
          className="shrink-0 flex items-center justify-center"
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            bgcolor: "action.hover",
            color: "primary.main",
          }}
        >
          {icon}
        </Box>
        <div className="min-w-0">
          <Typography variant="h6" fontWeight={750} sx={{ lineHeight: 1.2 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {subtitle}
            </Typography>
          )}
        </div>
      </div>
      {end && <div className="shrink-0">{end}</div>}
    </div>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        borderRadius: 3,
        border: 1,
        borderColor: "divider",
        borderStyle: "dashed",
        p: 4,
        textAlign: "center",
        bgcolor: "action.hover",
      }}
    >
      <Box
        sx={{
          mx: "auto",
          mb: 1.5,
          width: 48,
          height: 48,
          borderRadius: 3,
          bgcolor: "background.paper",
          display: "grid",
          placeItems: "center",
          color: "text.secondary",
          boxShadow: 1,
        }}
      >
        <InboxRoundedIcon />
      </Box>
      <Typography fontWeight={700}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 420, mx: "auto" }}>
        {description}
      </Typography>
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Box>
  );
}

function CampaignSkeleton() {
  return (
    <Box sx={{ maxWidth: 1500, mx: "auto", p: { xs: 2, md: 3 } }}>
      <Skeleton width={120} height={24} />
      <Skeleton width="60%" height={44} sx={{ mt: 1 }} />
      <Skeleton width="40%" height={20} sx={{ mt: 1 }} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={96} />
        ))}
      </div>
      <Skeleton variant="rounded" height={260} sx={{ mt: 3 }} />
      <Skeleton variant="rounded" height={320} sx={{ mt: 3 }} />
    </Box>
  );
}

/* ----------------------------------------------------------- main page */
export default function CampaignDetailPage() {
  const params = useParams<{ provider: string; campaignId: string }>();
  const provider =
    params.provider === "metaAds" ? "metaAds" : params.provider === "googleAds" ? "googleAds" : null;
  const campaignId = decodeURIComponent(params.campaignId ?? "");
  const backendUrl =
    process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_API_URL || "http://localhost:5000";

  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [campaignLoading, setCampaignLoading] = useState(true);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [groups, setGroups] = useState<ChildRecord[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [groupsNext, setGroupsNext] = useState<string | null>(null);
  const [adsByGroup, setAdsByGroup] = useState<Record<string, ChildRecord[]>>({});
  const [adsLoaded, setAdsLoaded] = useState<Record<string, boolean>>({});
  const [adsNext, setAdsNext] = useState<Record<string, string | null>>({});
  const [adsLoading, setAdsLoading] = useState<string | null>(null);
  const [adsErrors, setAdsErrors] = useState<Record<string, string>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const getToken = useCallback(async () => {
    const response = await axios.get("/api/token");
    const token = response.data?.token;
    if (typeof token !== "string" || !token.trim())
      throw new Error("Your session has expired. Please sign in again.");
    return token;
  }, []);

  const loadCampaign = useCallback(async () => {
    if (!provider || !campaignId) {
      setCampaignError("The campaign URL is invalid. Please return to the campaign list.");
      setCampaignLoading(false);
      return;
    }
    setCampaignLoading(true);
    setCampaignError(null);
    try {
      const response = await getCampaigns();
      if (response instanceof Error) throw response;
      const payload = response?.data as CampaignApiResponse | undefined;
      if (!payload?.success) throw new Error(payload?.message ?? "Unable to load campaign details.");
      const providerResult = asRecord(payload.providers?.[provider]);
      const matching = getCampaignRows(payload, provider).map((raw) =>
        normalizeCampaign(raw, provider, stringValue(providerResult.accountId))
      );
      const found = matching.find((item) => item.id === campaignId || item.id.split("/").at(-1) === campaignId);
      if (!found)
        throw new Error(
          "This campaign was not found in the currently selected advertising account. Check the provider and selected account, then return to the campaign list."
        );
      setCampaign(found);
    } catch (error) {
      setCampaignError(error instanceof Error ? error.message : "Unable to load campaign details.");
    } finally {
      setCampaignLoading(false);
    }
  }, [campaignId, provider]);

  const loadGroups = useCallback(
    async (pageToken?: string) => {
      if (!provider || !campaignId) return;
      setGroupsLoading(true);
      setGroupsError(null);
      try {
        const token = await getToken();
        const path =
          provider === "metaAds"
            ? `/api/ads/meta/campaigns/${encodeURIComponent(campaignId)}/ad-sets`
            : `/api/ads/google/campaigns/${encodeURIComponent(campaignId)}/ad-groups`;
        const qp: Record<string, string> = {};
        if (pageToken) qp[provider === "metaAds" ? "after" : "pageToken"] = pageToken;
        const response = await axios.get(`${backendUrl}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
          params: qp,
        });
        if (!response.data?.success)
          throw new Error(response.data?.message ?? "Unable to load campaign groups.");
        const rows: ChildRecord[] =
          provider === "metaAds" ? response.data.adSets ?? [] : response.data.adGroups ?? [];
        setGroups((current) => (pageToken ? [...current, ...rows] : rows));
        setGroupsNext(
          provider === "metaAds"
            ? response.data.pagination?.nextCursor ?? null
            : response.data.nextPageToken ?? null
        );
      } catch (error) {
        setGroupsError(error instanceof Error ? error.message : "Unable to load campaign groups.");
      } finally {
        setGroupsLoading(false);
      }
    },
    [backendUrl, campaignId, getToken, provider]
  );

  const loadAds = useCallback(
    async (group: ChildRecord, nextCursor?: string) => {
      if (!provider || !campaignId) return;
      const groupId = stringValue(group.id, group.resourceName);
      if (!groupId) return;
      const key = `${provider}:${groupId}`;
      setAdsLoading(key);
      setAdsErrors((current) => ({ ...current, [key]: "" }));
      try {
        const token = await getToken();
        const path =
          provider === "metaAds"
            ? `/api/ads/meta/ad-sets/${encodeURIComponent(groupId)}/ads`
            : `/api/ads/google/ad-groups/${encodeURIComponent(groupId)}/ads`;
        const qp: Record<string, string> = {};
        if (provider === "metaAds") {
          qp.campaignId = campaignId;
          if (nextCursor) qp.after = nextCursor;
        } else if (nextCursor) {
          qp.pageToken = nextCursor;
        }
        const response = await axios.get(`${backendUrl}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
          params: qp,
        });
        if (!response.data?.success)
          throw new Error(response.data?.message ?? "Unable to load ads and creative data.");
        const rows: ChildRecord[] = response.data.ads ?? [];
        setAdsByGroup((current) => ({
          ...current,
          [key]: nextCursor ? [...(current[key] ?? []), ...rows] : rows,
        }));
        setAdsLoaded((current) => ({ ...current, [key]: true }));
        setAdsNext((current) => ({
          ...current,
          [key]:
            provider === "metaAds"
              ? response.data.pagination?.nextCursor ?? null
              : response.data.nextPageToken ?? null,
        }));
      } catch (error) {
        setAdsErrors((current) => ({
          ...current,
          [key]: error instanceof Error ? error.message : "Unable to load ads and creative data.",
        }));
      } finally {
        setAdsLoading(null);
      }
    },
    [backendUrl, campaignId, getToken, provider]
  );

  useEffect(() => {
    void loadCampaign();
    void loadGroups();
  }, [loadCampaign, loadGroups]);

  const currency = campaign ? getCurrency(campaign) : null;
  const metrics = campaign ? asRecord(campaign.source.metrics ?? campaign.metrics) : {};
  const budget = campaign ? getBudget(campaign) : { amount: null, period: null };
  const totalAdsLoaded = Object.values(adsByGroup).reduce((total, rows) => total + rows.length, 0);
  const campaignStatus = campaign?.effectiveStatus ?? campaign?.status ?? "Unknown";
  const isPerformanceMax = String(campaign?.campaignType ?? "").toUpperCase().includes("PERFORMANCE_MAX");

  const settingFields = useMemo(() => {
    if (!campaign) return [];
    const source = campaign.source;
    const bidding = asRecord(source.bidding);
    const budgetSource = asRecord(source.budget ?? source.campaignBudget);
    return [
      ["Campaign ID", campaign.id],
      ["Ad account", campaign.accountId],
      ["Objective", campaign.objective],
      ["Campaign type", campaign.campaignType ?? source.buying_type],
      ["Bidding strategy", campaign.bidStrategy ?? source.bid_strategy ?? bidding.strategy],
      ["Bidding status", campaign.biddingSystemStatus ?? bidding.systemStatus],
      ["Budget", budget.amount === null ? null : formatCurrency(budget.amount, currency)],
      ["Budget period", budget.period ?? budgetSource.period ?? budgetSource.type],
      ["Budget delivery", budgetSource.deliveryMethod ?? budgetSource.delivery_method],
      ["Buying type", source.buying_type ?? source.buyingType],
      ["Start time", source.startTime ?? source.start_time],
      ["End time", source.endTime ?? source.end_time],
      ["Created", campaign.createdAt ?? source.created_time],
      ["Last updated", campaign.updatedAt ?? source.updated_time],
      ["Effective status", campaign.effectiveStatus],
    ] as Array<[string, unknown]>;
  }, [campaign, budget.amount, budget.period, currency]);

  /* -------------------------------------------------- loading & error */
  if (campaignLoading) return <CampaignSkeleton />;

  if (campaignError || !campaign) {
    return (
      <Box sx={{ maxWidth: 720, mx: "auto", p: { xs: 2, md: 3 } }}>
        <Button
          component={Link}
          href="/dashboard/campaigns"
          startIcon={<ArrowBackRoundedIcon />}
          sx={{ mb: 2, textTransform: "none" }}
        >
          Back to campaigns
        </Button>
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: 3 }}>
            <Alert severity="error" sx={{ mb: 2 }}>
              {campaignError ?? "Campaign details are unavailable."}
            </Alert>
            <Button onClick={() => void loadCampaign()} startIcon={<RefreshRoundedIcon />} variant="contained">
              Try again
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  /* ------------------------------------------------------------ render */
  return (
    <Box sx={{ width: "100%", maxWidth: 1500, mx: "auto", px: { xs: 1.5, sm: 2.5, lg: 3 }, pb: 4 }}>
      {/* Sticky header */}
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          py: 2,
          mx: { xs: -1.5, sm: -2.5, lg: -3 },
          px: { xs: 1.5, sm: 2.5, lg: 3 },
          bgcolor: (theme) =>
            theme.palette.mode === "dark" ? "rgba(10,12,20,0.75)" : "rgba(255,255,255,0.75)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
              <Button
                component={Link}
                href="/dashboard/campaigns"
                size="small"
                startIcon={<ArrowBackRoundedIcon fontSize="small" />}
                sx={{ textTransform: "none", color: "text.secondary", minWidth: 0, px: 0.75 }}
              >
                All campaigns
              </Button>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip
                size="small"
                icon={<CampaignRoundedIcon fontSize="small" />}
                label={provider === "googleAds" ? "Google Ads" : "Meta Ads"}
                color={provider === "googleAds" ? "primary" : "secondary"}
                variant="outlined"
              />
              <Chip size="small" label={campaignStatus.replace(/_/g, " ")} color={statusColor(campaignStatus)} />
            </Stack>
            <Typography
              component="h1"
              variant="h5"
              fontWeight={800}
              sx={{ mt: 0.75, letterSpacing: "-0.03em", overflowWrap: "anywhere" }}
            >
              {campaign.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
              ID: {campaign.id} · Account: {campaign.accountId ?? "—"}
            </Typography>
          </div>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap className="shrink-0">
            <Tooltip title="Refresh campaign and hierarchy data" arrow>
              <span>
                <IconButton
                  onClick={() => {
                    void loadCampaign();
                    void loadGroups();
                  }}
                  disabled={groupsLoading}
                  sx={{ border: 1, borderColor: "divider", borderRadius: 2 }}
                >
                  <RefreshRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Button
              component={Link}
              href="/dashboard/assets"
              variant="outlined"
              endIcon={<OpenInNewRoundedIcon />}
              sx={{ textTransform: "none", borderRadius: 2 }}
            >
              Asset library
            </Button>
          </Stack>
        </div>
      </Box>

      <Stack spacing={3} sx={{ mt: 3 }}>
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Budget" value={formatCurrency(budget.amount, currency)} hint={budget.period ?? "Campaign budget"} icon={<SavingsRoundedIcon fontSize="small" />} accent="violet" />
          <MetricCard label="Spend" value={formatCurrency(getSpend(campaign), currency)} hint="Returned by provider" icon={<PaidRoundedIcon fontSize="small" />} accent="emerald" />
          <MetricCard label="Impressions" value={formatNumber(metrics.impressions)} icon={<VisibilityRoundedIcon fontSize="small" />} accent="blue" />
          <MetricCard label="Clicks" value={formatNumber(metrics.clicks)} icon={<TouchAppRoundedIcon fontSize="small" />} accent="cyan" />
          <MetricCard label="CTR" value={numberValue(metrics.ctr) === null ? "—" : `${formatNumber(metrics.ctr)}%`} icon={<TrendingUpRoundedIcon fontSize="small" />} accent="amber" />
          <MetricCard label="Conversions" value={formatNumber(metrics.conversions ?? metrics.actions)} icon={<ShoppingCartRoundedIcon fontSize="small" />} accent="rose" />
          <MetricCard label="Conversion value" value={formatCurrency(metrics.conversionValue ?? metrics.conversions_value, currency)} icon={<PaidRoundedIcon fontSize="small" />} accent="emerald" />
          <MetricCard label="ROAS" value={numberValue(metrics.roas) === null ? "—" : `${formatNumber(metrics.roas)}x`} icon={<SpeedRoundedIcon fontSize="small" />} accent="violet" />
        </div>

        {/* Campaign settings */}
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: { xs: 2, md: 2.75 } }}>
            <SectionHeader
              icon={<TuneRoundedIcon fontSize="small" />}
              title="Campaign settings"
              subtitle="Provider-specific configuration and campaign metadata"
              end={
                <Chip
                  size="small"
                  label={provider === "googleAds" ? "Google resource" : "Meta campaign"}
                  variant="outlined"
                />
              }
            />
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-4">
              {settingFields.map(([label, value]) =>
                label === "Campaign ID" && typeof value === "string" ? (
                  <CopyField key={label} label={label} value={value} />
                ) : (
                  <DetailField key={label} label={label} value={value} />
                )
              )}
            </div>
            <Accordion
              disableGutters
              elevation={0}
              sx={{
                mt: 2.5,
                borderTop: 1,
                borderColor: "divider",
                "&:before": { display: "none" },
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                <Typography variant="body2" fontWeight={650}>
                  Full provider campaign payload
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Paper
                  variant="outlined"
                  sx={{ p: 1.5, maxHeight: 380, overflow: "auto", bgcolor: "background.default", borderRadius: 2 }}
                >
                  <Box
                    component="pre"
                    sx={{ m: 0, fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "ui-monospace,monospace" }}
                  >
                    {JSON.stringify(campaign.source, null, 2)}
                  </Box>
                </Paper>
              </AccordionDetails>
            </Accordion>
          </CardContent>
        </Card>

        {/* Hierarchy */}
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: { xs: 2, md: 2.75 } }}>
            <SectionHeader
              icon={<AccountTreeRoundedIcon fontSize="small" />}
              title={provider === "googleAds" ? "Ad groups & ads" : "Ad sets & ads"}
              subtitle="Explore the campaign structure, ad content and creative assets"
              end={
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip size="small" label={`${groups.length} ${provider === "googleAds" ? "ad groups" : "ad sets"}`} variant="outlined" />
                  <Chip size="small" label={`${totalAdsLoaded} ads loaded`} variant="outlined" />
                </Stack>
              }
            />

            {groupsError && (
              <Alert
                severity="error"
                sx={{ mb: 2, borderRadius: 2 }}
                action={
                  <Button color="inherit" size="small" onClick={() => void loadGroups()}>
                    Retry
                  </Button>
                }
              >
                {groupsError}
              </Alert>
            )}

            {groupsLoading && groups.length === 0 && (
              <Stack spacing={1.5}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} variant="rounded" height={72} />
                ))}
              </Stack>
            )}

            {!groupsLoading && !groupsError && groups.length === 0 && (
              <EmptyState
                title={
                  isPerformanceMax
                    ? "Performance Max campaign detected"
                    : `No ${provider === "googleAds" ? "ad groups" : "ad sets"} returned`
                }
                description={
                  isPerformanceMax
                    ? "Performance Max campaigns organize creatives into Asset Groups rather than standard ad groups. Asset Group browsing isn't included on this page yet."
                    : "The provider did not return any child groups for this campaign."
                }
              />
            )}

            <Stack spacing={1.5}>
              {groups.map((group, index) => {
                const groupId = stringValue(group.id, group.resourceName) ?? `group-${index}`;
                const key = `${provider}:${groupId}`;
                const expanded = Boolean(expandedGroups[key]);
                const rows = adsByGroup[key] ?? [];
                const groupMetrics = asRecord(group.metrics);
                const groupName =
                  stringValue(group.name) ?? `${provider === "googleAds" ? "Ad group" : "Ad set"} ${index + 1}`;
                const groupStatus = stringValue(group.status, group.effective_status) ?? "Unknown";
                const groupBudget =
                  provider === "metaAds" ? numberValue(group.daily_budget ?? group.lifetime_budget) : null;

                return (
                  <Accordion
                    key={key}
                    expanded={expanded}
                    onChange={(_e, isOpen) => {
                      setExpandedGroups((current) => ({ ...current, [key]: isOpen }));
                      if (isOpen && !adsLoaded[key] && adsLoading !== key) void loadAds(group);
                    }}
                    disableGutters
                    elevation={0}
                    sx={{
                      border: 1,
                      borderColor: "divider",
                      borderRadius: "14px !important",
                      overflow: "hidden",
                      "&:before": { display: "none" },
                      transition: "border-color .2s",
                      "&:hover": { borderColor: "primary.main" },
                    }}
                  >
                    <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ px: { xs: 1.5, md: 2 }, py: 1 }}>
                      <Box sx={{ minWidth: 0, width: "100%", pr: 1 }}>
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          alignItems={{ xs: "flex-start", sm: "center" }}
                          spacing={1}
                          flexWrap="wrap"
                          useFlexGap
                        >
                          <Typography fontWeight={750} sx={{ overflowWrap: "anywhere" }}>
                            {groupName}
                          </Typography>
                          <Chip size="small" label={groupStatus.replace(/_/g, " ")} color={statusColor(groupStatus)} />
                          <Chip
                            size="small"
                            label={provider === "googleAds" ? stringValue(group.type) ?? "Ad group" : "Ad set"}
                            variant="outlined"
                          />
                        </Stack>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.6 }}>
                          ID: {groupId}
                          {provider === "googleAds" && groupMetrics.impressions != null
                            ? ` · ${formatNumber(groupMetrics.impressions)} impressions · ${formatNumber(groupMetrics.clicks)} clicks`
                            : ""}
                          {provider === "metaAds" && group.optimization_goal
                            ? ` · ${String(group.optimization_goal).replace(/_/g, " ")}`
                            : ""}
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0, px: { xs: 1.5, md: 2 } }}>
                      <Divider sx={{ mb: 2 }} />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <DetailField label="Group ID" value={groupId} />
                        <DetailField label="Status" value={groupStatus} />
                        <DetailField label="Start time" value={group.start_time ?? group.startDate} />
                        <DetailField label="End time" value={group.end_time ?? group.endDate} />
                        {provider === "googleAds" ? (
                          <>
                            <DetailField label="Type" value={group.type} />
                            <DetailField label="Impressions · last 30 days" value={formatNumber(groupMetrics.impressions)} />
                            <DetailField label="Clicks · last 30 days" value={formatNumber(groupMetrics.clicks)} />
                            <DetailField
                              label="CTR"
                              value={numberValue(groupMetrics.ctr) === null ? null : `${formatNumber(groupMetrics.ctr)}%`}
                            />
                          </>
                        ) : (
                          <>
                            <DetailField
                              label="Daily budget"
                              value={
                                group.daily_budget == null
                                  ? null
                                  : formatCurrency((groupBudget ?? 0) / 100, currency)
                              }
                            />
                            <DetailField label="Billing event" value={group.billing_event} />
                            <DetailField label="Optimization goal" value={group.optimization_goal} />
                            <DetailField label="Bid strategy" value={group.bid_strategy} />
                          </>
                        )}
                      </div>

                      {provider === "metaAds" && group.targeting && (
                        <Accordion
                          disableGutters
                          elevation={0}
                          sx={{ mb: 1.5, border: 1, borderColor: "divider", borderRadius: 2, "&:before": { display: "none" } }}
                        >
                          <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                            <Typography variant="body2" fontWeight={650}>
                              Targeting configuration
                            </Typography>
                          </AccordionSummary>
                          <AccordionDetails>
                            <Box
                              component="pre"
                              sx={{ m: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}
                            >
                              {JSON.stringify(group.targeting, null, 2)}
                            </Box>
                          </AccordionDetails>
                        </Accordion>
                      )}
                      <Accordion
                        disableGutters
                        elevation={0}
                        sx={{ mb: 2, border: 1, borderColor: "divider", borderRadius: 2, "&:before": { display: "none" } }}
                      >
                        <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                          <Typography variant="body2" fontWeight={650}>
                            Full {provider === "googleAds" ? "ad group" : "ad set"} payload
                          </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Box
                            component="pre"
                            sx={{ m: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}
                          >
                            {JSON.stringify(group, null, 2)}
                          </Box>
                        </AccordionDetails>
                      </Accordion>

                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                        <Typography variant="subtitle2" fontWeight={750}>
                          Ads and creative
                        </Typography>
                        <Chip size="small" label={adsLoaded[key] ? rows.length : "Not loaded"} variant="outlined" />
                        {adsLoading === key && <CircularProgress size={16} />}
                      </Stack>

                      {adsErrors[key] && (
                        <Alert
                          severity="error"
                          sx={{ mb: 1.5, borderRadius: 2 }}
                          action={
                            <Button color="inherit" size="small" onClick={() => void loadAds(group)}>
                              Retry
                            </Button>
                          }
                        >
                          {adsErrors[key]}
                        </Alert>
                      )}

                      {adsLoaded[key] && rows.length === 0 && !adsErrors[key] && (
                        <EmptyState
                          title="No ads returned"
                          description={`No ads were returned for this ${provider === "googleAds" ? "ad group" : "ad set"
                            }.`}
                        />
                      )}

                      <Stack spacing={2}>
                        {rows.map((ad, adIndex) => {
                          const creative = extractCreative(ad, campaign.provider);
                          const adId = stringValue(ad.id, ad.resourceName) ?? `ad-${adIndex}`;
                          const adStatus = stringValue(ad.status, ad.effective_status) ?? "Unknown";
                          const adType = stringValue(ad.type, ad.adType, ad.ad_type) ?? "Ad";
                          const creativeId = stringValue(asRecord(ad.creative).id, ad.creativeId, ad.creative_id);
                          const hasMedia = creative.images.length > 0 || creative.videos.length > 0;
                          const imageCount = creative.images.length;
                          const videoCount = creative.videos.length;

                          return (
                            <Paper
                              key={adId}
                              variant="outlined"
                              sx={{
                                overflow: "hidden",
                                borderRadius: 3,
                                borderColor: "divider",
                                transition: "box-shadow .2s, transform .2s",
                                "&:hover": { boxShadow: 3, transform: "translateY(-1px)" },
                              }}
                            >
                              <Box sx={{ p: { xs: 1.5, md: 2.25 } }}>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                                      <Typography variant="subtitle1" fontWeight={800} sx={{ overflowWrap: "anywhere" }}>
                                        {stringValue(ad.name) ?? `Ad ${adId}`}
                                      </Typography>
                                      <Chip size="small" label={adStatus.replace(/_/g, " ")} color={statusColor(adStatus)} />
                                      <Chip size="small" label={adType.replace(/_/g, " ")} variant="outlined" />
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                                      Ad ID: {adId}
                                      {creativeId ? ` · Creative ID: ${creativeId}` : ""}
                                    </Typography>
                                  </div>
                                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap className="shrink-0">
                                    <Chip size="small" icon={<ImageRoundedIcon fontSize="small" />} label={`${imageCount}`} variant="outlined" />
                                    <Chip size="small" icon={<VideocamRoundedIcon fontSize="small" />} label={`${videoCount}`} variant="outlined" />
                                    <Chip size="small" icon={<TextFieldsRoundedIcon fontSize="small" />} label={`${creative.textAssets.length}`} variant="outlined" />
                                  </Stack>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,0.95fr)_minmax(0,1.35fr)] gap-4 mt-4">
                                  {/* Creative preview */}
                                  <Box
                                    sx={{
                                      minWidth: 0,
                                      p: 1.5,
                                      borderRadius: 3,
                                      color: "#f8fafc",
                                      backgroundImage:
                                        "radial-gradient(circle at 15% 10%, rgba(59,130,246,0.22), transparent 42%), linear-gradient(145deg, #0b1220, #111827)",
                                      border: "1px solid rgba(255,255,255,.06)",
                                    }}
                                  >
                                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.25 }}>
                                      <Typography
                                        variant="overline"
                                        sx={{ color: "#cbd5e1", fontWeight: 800, letterSpacing: ".14em", fontSize: 11 }}
                                      >
                                        CREATIVE PREVIEW
                                      </Typography>
                                      <Chip
                                        size="small"
                                        label={hasMedia ? "Media attached" : "No preview URL"}
                                        sx={{
                                          color: "#e2e8f0",
                                          bgcolor: "rgba(255,255,255,.08)",
                                          border: "1px solid rgba(255,255,255,.12)",
                                          fontSize: 11,
                                        }}
                                      />
                                    </Stack>

                                    {hasMedia ? (
                                      <Stack spacing={1.25}>
                                        {creative.images.length > 0 && (
                                          <div
                                            className={`grid gap-2 ${creative.images.length === 1 ? "grid-cols-1" : "grid-cols-2"
                                              }`}
                                          >
                                            {creative.images.map((image, imageIndex) => (
                                              <Box
                                                key={`${image.url}-${imageIndex}`}
                                                sx={{
                                                  minWidth: 0,
                                                  overflow: "hidden",
                                                  borderRadius: 2,
                                                  bgcolor: "#020617",
                                                  border: "1px solid rgba(255,255,255,.10)",
                                                }}
                                              >
                                                <Box
                                                  component="img"
                                                  src={image.url}
                                                  alt={image.label || `Creative image ${imageIndex + 1}`}
                                                  loading="lazy"
                                                  referrerPolicy="no-referrer"
                                                  sx={{
                                                    display: "block",
                                                    width: "100%",
                                                    height: creative.images.length === 1 ? 260 : 150,
                                                    objectFit: "contain",
                                                    bgcolor: "#020617",
                                                  }}
                                                />
                                                <Box sx={{ px: 1, py: 0.75 }}>
                                                  <Typography
                                                    variant="caption"
                                                    sx={{ color: "#e2e8f0", display: "block", fontWeight: 700 }}
                                                  >
                                                    {image.label || `Image ${imageIndex + 1}`}
                                                  </Typography>
                                                  <Typography
                                                    variant="caption"
                                                    sx={{
                                                      color: "#94a3b8",
                                                      display: "block",
                                                      overflowWrap: "anywhere",
                                                      fontSize: 10,
                                                    }}
                                                  >
                                                    {image.sourcePath}
                                                  </Typography>
                                                </Box>
                                              </Box>
                                            ))}
                                          </div>
                                        )}
                                        {creative.videos.map((video, videoIndex) => (
                                          <Box
                                            key={`${video.videoId}-${videoIndex}`}
                                            sx={{
                                              overflow: "hidden",
                                              borderRadius: 2,
                                              bgcolor: "#020617",
                                              border: "1px solid rgba(255,255,255,.10)",
                                            }}
                                          >
                                            {video.embedUrl ? (
                                              <Box
                                                component="iframe"
                                                src={video.embedUrl}
                                                title={video.title || `Video creative ${videoIndex + 1}`}
                                                loading="lazy"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                                allowFullScreen
                                                sx={{ display: "block", width: "100%", aspectRatio: "16 / 9", border: 0 }}
                                              />
                                            ) : video.thumbnailUrl ? (
                                              <Box
                                                component="img"
                                                src={video.thumbnailUrl}
                                                alt={video.title || "Video thumbnail"}
                                                loading="lazy"
                                                referrerPolicy="no-referrer"
                                                sx={{ width: "100%", height: 190, objectFit: "contain", display: "block" }}
                                              />
                                            ) : (
                                              <Box sx={{ p: 3, textAlign: "center" }}>
                                                <Typography variant="h6" sx={{ color: "#f8fafc" }}>
                                                  Video asset
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: "#cbd5e1", overflowWrap: "anywhere" }}>
                                                  Video ID: {video.videoId}
                                                </Typography>
                                              </Box>
                                            )}
                                            <Box sx={{ px: 1, py: 0.75 }}>
                                              <Typography
                                                variant="caption"
                                                sx={{ color: "#e2e8f0", display: "block", fontWeight: 700 }}
                                              >
                                                {video.title}
                                              </Typography>
                                            </Box>
                                          </Box>
                                        ))}
                                      </Stack>
                                    ) : (
                                      <Box sx={{ minHeight: 220, display: "grid", placeItems: "center", textAlign: "center", px: 2 }}>
                                        <Box>
                                          <Box
                                            sx={{
                                              mx: "auto",
                                              mb: 1,
                                              width: 44,
                                              height: 44,
                                              borderRadius: 2,
                                              display: "grid",
                                              placeItems: "center",
                                              bgcolor: "rgba(255,255,255,.06)",
                                              border: "1px solid rgba(255,255,255,.10)",
                                              color: "#94a3b8",
                                            }}
                                          >
                                            <ImageRoundedIcon />
                                          </Box>
                                          <Typography fontWeight={750} sx={{ color: "#f8fafc" }}>
                                            No renderable media URL
                                          </Typography>
                                          <Typography
                                            variant="caption"
                                            sx={{ color: "#94a3b8", display: "block", mt: 0.5 }}
                                          >
                                            The provider returned creative references or text fields. See asset references below.
                                          </Typography>
                                        </Box>
                                      </Box>
                                    )}
                                  </Box>

                                  {/* Copy + destination */}
                                  <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1.5 }}>
                                    <Box>
                                      <Typography
                                        variant="overline"
                                        color="primary.main"
                                        fontWeight={800}
                                        sx={{ letterSpacing: ".12em" }}
                                      >
                                        AD COPY
                                      </Typography>
                                      <Typography
                                        variant="h6"
                                        fontWeight={850}
                                        sx={{ mt: 0.25, letterSpacing: "-.02em", overflowWrap: "anywhere" }}
                                      >
                                        {creative.headline}
                                      </Typography>
                                      <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{ mt: 1, whiteSpace: "pre-wrap", lineHeight: 1.7 }}
                                      >
                                        {creative.body}
                                      </Typography>
                                      {creative.description && (
                                        <Typography variant="body2" sx={{ mt: 1, lineHeight: 1.65 }}>
                                          {creative.description}
                                        </Typography>
                                      )}
                                    </Box>
                                    <Divider />
                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                      {creative.callToAction && (
                                        <Chip label={`CTA · ${creative.callToAction}`} color="primary" size="small" />
                                      )}
                                      {creative.images.length > 0 && (
                                        <Chip label={`${creative.images.length} image(s)`} size="small" variant="outlined" />
                                      )}
                                      {creative.videos.length > 0 && (
                                        <Chip label={`${creative.videos.length} video(s)`} size="small" variant="outlined" />
                                      )}
                                      {creative.textAssets.length > 0 && (
                                        <Chip label={`${creative.textAssets.length} text`} size="small" variant="outlined" />
                                      )}
                                      {creative.otherAssets.length > 0 && (
                                        <Chip label={`${creative.otherAssets.length} other`} size="small" variant="outlined" />
                                      )}
                                    </Stack>
                                    {creative.destination && (
                                      <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover", minWidth: 0 }}>
                                        <Typography variant="caption" color="text.secondary" fontWeight={750}>
                                          DESTINATION URL
                                        </Typography>
                                        <Box
                                          component="a"
                                          href={creative.destination}
                                          target="_blank"
                                          rel="noreferrer"
                                          sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 0.75,
                                            mt: 0.4,
                                            color: "primary.main",
                                            fontSize: 13,
                                            fontWeight: 700,
                                            overflowWrap: "anywhere",
                                            textDecoration: "none",
                                            "&:hover": { textDecoration: "underline" },
                                          }}
                                        >
                                          {creative.destination}
                                          <OpenInNewRoundedIcon sx={{ fontSize: 16, flexShrink: 0 }} />
                                        </Box>
                                      </Box>
                                    )}
                                  </Box>
                                </div>

                                {creative.unresolvedAssets.length > 0 && (
                                  <Alert
                                    severity="warning"
                                    icon={<WarningAmberRoundedIcon />}
                                    sx={{ mt: 2, borderRadius: 2 }}
                                  >
                                    {creative.unresolvedAssets.length} asset reference(s) were returned but could not be rendered as media.
                                  </Alert>
                                )}

                                <Accordion
                                  disableGutters
                                  elevation={0}
                                  sx={{ mt: 2, borderTop: 1, borderColor: "divider", "&:before": { display: "none" } }}
                                >
                                  <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                                    <Box>
                                      <Typography variant="body2" fontWeight={800}>
                                        API response & payload mapping
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        Where each preview and asset field comes from
                                      </Typography>
                                    </Box>
                                  </AccordionSummary>
                                  <AccordionDetails>
                                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}>
                                      <Typography variant="caption" color="text.secondary" fontWeight={800}>
                                        REQUEST PATH
                                      </Typography>
                                      <Typography
                                        variant="body2"
                                        fontWeight={700}
                                        sx={{ mt: 0.5, fontFamily: "ui-monospace,monospace", overflowWrap: "anywhere" }}
                                      >
                                        {creative.apiPath}
                                      </Typography>
                                    </Paper>
                                    <Paper
                                      variant="outlined"
                                      sx={{ p: 1.25, mt: 1.5, maxHeight: 420, overflow: "auto", bgcolor: "background.default", borderRadius: 2 }}
                                    >
                                      <Typography variant="caption" color="text.secondary" fontWeight={800}>
                                        RAW PROVIDER AD + RESOLVED ASSETS
                                      </Typography>
                                      <Box
                                        component="pre"
                                        sx={{ m: 0, mt: 1, fontSize: 11.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "ui-monospace,monospace" }}
                                      >
                                        {JSON.stringify({ ad, resolvedCreativeAssets: creative.linkedAssets }, null, 2)}
                                      </Box>
                                    </Paper>
                                  </AccordionDetails>
                                </Accordion>
                              </Box>
                            </Paper>
                          );
                        })}
                      </Stack>

                      {adsNext[key] && (
                        <Button
                          size="small"
                          onClick={() => void loadAds(group, adsNext[key] ?? undefined)}
                          disabled={adsLoading === key}
                          sx={{ mt: 1.5, textTransform: "none" }}
                        >
                          Load more ads
                        </Button>
                      )}
                    </AccordionDetails>
                  </Accordion>
                );
              })}
            </Stack>

            {groupsNext && (
              <Button
                onClick={() => void loadGroups(groupsNext)}
                disabled={groupsLoading}
                sx={{ mt: 2, textTransform: "none" }}
              >
                {groupsLoading
                  ? "Loading…"
                  : `Load more ${provider === "googleAds" ? "ad groups" : "ad sets"}`}
              </Button>
            )}
            {groupsLoading && groups.length > 0 && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                <CircularProgress size={16} />
                <Typography variant="caption" color="text.secondary">
                  Loading more groups…
                </Typography>
              </Stack>
            )}
          </CardContent>
        </Card>

        <Typography variant="caption" color="text.secondary">
          Provider data is read-only on this page. Metrics and available creative fields depend on the
          provider response and selected reporting period.
        </Typography>
      </Stack>
    </Box>
  );
}