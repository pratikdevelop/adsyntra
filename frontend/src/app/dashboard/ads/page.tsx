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
  adGroupId: string | null;
  adGroupName: string | null;
  status: string | null;
  primaryStatus: string | null;
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
  id: string;
  name: string;
  status: string;
  campaign: string;
  type: string;
  text: string[];
  urls: string[];
  imageUrls: string[];
  cta?: string;
  raw: GoogleAd | MetaAd;
};

const emptyConnection = (): ProviderConnection => ({
  connected: false,
  accounts: [],
  selectedAccountId: null,
});

const asText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

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
    id: ad.id,
    name: ad.name || `Google Ad ${ad.id}`,
    status: ad.status || ad.primaryStatus || "UNKNOWN",
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

function AdImages({ urls, alt }: { urls: string[]; alt: string }) {
  if (!urls.length) {
    return (
      <div className="flex min-h-36 items-center justify-center bg-slate-50 p-5 text-center">
        <div className="max-w-sm">
          <span className="text-3xl text-slate-300">▧</span>
          <p className="mt-2 text-xs text-slate-500">No linked image preview was found for this ad.</p>
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

      const [googleAdsResult, metaAdsResult, googleAssetsResult, metaAssetsResult] =
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
        ]);

      if (id !== requestId.current) return;

      const messages: string[] = [];
      const googleAds = googleAdsResult.status === "fulfilled" ? googleAdsResult.value : null;
      const metaAds = metaAdsResult.status === "fulfilled" ? metaAdsResult.value : null;
      const googleAssets = googleAssetsResult.status === "fulfilled" ? googleAssetsResult.value : [];
      const metaAssets = metaAssetsResult.status === "fulfilled" ? metaAssetsResult.value : [];

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

      const googleImageMap = buildGoogleImageMap(googleAssets);
      const metaAssetIndex = buildMetaAssetIndex(metaAssets);
      const records: AdRecord[] = [
        ...(googleAds?.ads || []).map((ad) => googleRecord(ad, googleImageMap)),
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
      ads.filter(
        (ad) =>
          (filter === "ALL" || ad.provider === filter) &&
          (statusFilter === "ALL" || ad.status.toUpperCase() === statusFilter) &&
          `${ad.name} ${ad.campaign} ${ad.text.join(" ")} ${ad.id}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [ads, filter, statusFilter, search],
  );

  const googleCount = ads.filter((ad) => ad.provider === "googleAds").length;
  const metaCount = ads.filter((ad) => ad.provider === "metaAds").length;

  if (!isLoaded) return <div className="p-8 text-sm text-slate-500">Loading your session…</div>;
  if (!isSignedIn) return <div className="rounded-xl border bg-white p-8 text-sm text-slate-600">Sign in to view your ads.</div>;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-3 sm:p-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-600">Ad Management</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Connected Ads</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Ads are loaded from the Ads API. Their matching creative previews are resolved from your existing Asset Library.
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

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { title: "Google Ads", count: googleCount, account: connections.googleAds.selectedAccountId || (connections.googleAds.connected ? "No account selected" : "Not connected"), tone: "blue" },
          { title: "Meta Ads", count: metaCount, account: connections.metaAds.selectedAccountId || (connections.metaAds.connected ? "No account selected" : "Not connected"), tone: "indigo" },
          { title: "Total ads", count: ads.length, account: "Across selected accounts", tone: "slate" },
        ].map((card) => (
          <div key={card.title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-600">{card.title}</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${card.tone === "blue" ? "bg-blue-50 text-blue-700" : card.tone === "indigo" ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-700"}`}>{card.count}</span>
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
              <option value="PAUSED">Paused</option>
              <option value="REMOVED">Removed</option>
              <option value="ACTIVE">Active (Meta)</option>
              <option value="WITH_ISSUES">With issues</option>
            </select>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search ads, campaigns or copy…"
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
                <AdImages urls={ad.imageUrls} alt={ad.name} />
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
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">{ad.status.replace(/_/g, " ")}</span>
                    {ad.imageUrls.length > 0 && <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700">{ad.imageUrls.length} media</span>}
                  </div>
                  <p className="line-clamp-3 min-h-12 text-xs leading-relaxed text-slate-600">{ad.text[0] || "No ad copy available."}</p>
                  {ad.provider === "googleAds" && (
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
          <p className="text-xs text-slate-400">Showing {filtered.length} of {ads.length} loaded ads · Google and Meta use separate provider pagination.</p>
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
                <Info label="Ad ID" value={selected.id} />
                {selected.provider === "googleAds" && <>
                  <Info label="Ad group" value={(selected.raw as GoogleAd).adGroupName || (selected.raw as GoogleAd).adGroupId || "—"} />
                  <Info label="Ad strength" value={(selected.raw as GoogleAd).adStrength || "—"} />
                  <Info label="Approval" value={(selected.raw as GoogleAd).approvalStatus || "—"} />
                  <Info label="Reporting period" value="Last 30 days" />
                </>}
              </div>
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
              {selected.provider === "googleAds" && (
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
