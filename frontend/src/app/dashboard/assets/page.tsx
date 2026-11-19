"use client";

import { useAuth } from "@clerk/nextjs";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  createAssetObjectUrl,
  createTextAsset,
  deleteAsset,
  fetchGoogleAdsAssets,
  fetchMetaAdsAssets,
  getAssetStats,
  listAssets,
  updateAsset,
  uploadAsset,
  type AssetKind,
  type AssetProvider,
  type AssetStatsResponse,
  type LibraryAsset,
  type ProviderCreativeContent,
  type ProviderExtensionContent,
} from "../../../lib/asset-library-api";

/* -------------------------------------------------------------------------- */
/* Types and constants                                                        */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 24;
const FETCH_PAGE_SIZE = 100;

type UploadAssetKind = "IMAGE" | "VIDEO" | "LOGO" | "TEXT";

type SourceFilter = "ALL" | "ADSyntra" | AssetProvider;

const KIND_FILTERS: Array<{
  label: string;
  value: AssetKind | "ALL";
}> = [
  { label: "All assets", value: "ALL" },
  { label: "Images", value: "IMAGE" },
  { label: "Videos", value: "VIDEO" },
  { label: "Logos", value: "LOGO" },
  { label: "Text & copy", value: "TEXT" },
  { label: "CTAs", value: "CTA" },
  { label: "Extensions", value: "EXTENSION" },
  { label: "Creatives", value: "CREATIVE" },
];

const SOURCE_FILTERS: Array<{
  label: string;
  value: SourceFilter;
}> = [
  { label: "All sources", value: "ALL" },
  { label: "AdSyntra", value: "ADSyntra" },
  { label: "Google Ads", value: "googleAds" },
  { label: "Meta Ads", value: "metaAds" },
];

/* -------------------------------------------------------------------------- */
/* Formatting helpers                                                         */
/* -------------------------------------------------------------------------- */

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined || bytes <= 0) {
    return "—";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function getSourceLabel(asset: LibraryAsset): string {
  if (asset.providerAsset?.provider === "googleAds") {
    return "Google Ads";
  }

  if (asset.providerAsset?.provider === "metaAds") {
    return "Meta Ads";
  }

  if (asset.origin === "AI_STUDIO") {
    return "AdSyntra AI";
  }

  return "AdSyntra";
}

function getKindLabel(kind: AssetKind): string {
  const labels: Record<AssetKind, string> = {
    IMAGE: "Image",
    VIDEO: "Video",
    LOGO: "Logo",
    TEXT: "Text",
    CTA: "Call to action",
    EXTENSION: "Extension",
    CREATIVE: "Ad creative",
  };

  return labels[kind];
}

function getCreativeSummary(
  creative: ProviderCreativeContent | null,
): string | null {
  if (!creative) {
    return null;
  }

  return (
    creative.primaryTexts[0] ||
    creative.headlines[0] ||
    creative.descriptions[0] ||
    creative.callToAction ||
    null
  );
}

/* -------------------------------------------------------------------------- */
/* Category matching                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Meta CTA and text records are stored as complete CREATIVE records.
 *
 * This helper lets the UI show them under Text and CTA filters without
 * splitting a provider creative into multiple duplicate database records.
 */
function matchesAssetKind(
  asset: LibraryAsset,
  selectedKind: AssetKind | "ALL",
): boolean {
  if (selectedKind === "ALL") {
    return true;
  }

  if (selectedKind === "TEXT") {
    if (asset.kind === "TEXT") {
      return true;
    }

    const creative = asset.providerCreative;

    return Boolean(
      creative &&
      (creative.primaryTexts.length > 0 ||
        creative.headlines.length > 0 ||
        creative.longHeadlines.length > 0 ||
        creative.descriptions.length > 0),
    );
  }

  if (selectedKind === "CTA") {
    if (asset.kind === "CTA") {
      return true;
    }

    const creative = asset.providerCreative;

    return Boolean(
      creative &&
      (creative.callToAction ||
        creative.callToActionType ||
        creative.carouselCards.some(
          (card) => card.callToAction || card.callToActionType,
        )),
    );
  }

  return asset.kind === selectedKind;
}

/* -------------------------------------------------------------------------- */
/* Small reusable UI components                                               */
/* -------------------------------------------------------------------------- */

function ContentSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {title}
      </h4>

      {children}
    </section>
  );
}

function TextValues({
  values,
  emptyLabel = "No content available.",
}: {
  values: string[];
  emptyLabel?: string;
}) {
  if (!values.length) {
    return <p className="text-xs text-slate-400">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {values.map((value, index) => (
        <div
          key={`${index}-${value.slice(0, 30)}`}
          className="rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-700"
        >
          {value}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Provider and local media preview                                           */
/* -------------------------------------------------------------------------- */

function AssetMedia({
  asset,
  getAccessToken,
}: {
  asset: LibraryAsset;
  getAccessToken: () => Promise<string>;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);

  const providerAsset = asset.providerAsset;
  const isProviderAsset = Boolean(providerAsset);

  const creativeMedia = asset.providerCreative?.media ?? [];

  const videoMedia =
    creativeMedia.find(
      (item) => item.kind === "VIDEO" && (item.mediaUrl || item.videoId),
    ) ?? null;

  const imageMedia =
    creativeMedia.find(
      (item) => item.kind === "IMAGE" && (item.mediaUrl || item.thumbnailUrl),
    ) ?? null;

  const providerVideoId = providerAsset?.videoId ?? videoMedia?.videoId ?? null;

  const providerVideoUrl =
    videoMedia?.mediaUrl ??
    (providerAsset?.videoId ? providerAsset.mediaUrl : null);

  const providerImageUrl =
    providerAsset?.mediaUrl ??
    providerAsset?.thumbnailUrl ??
    imageMedia?.mediaUrl ??
    imageMedia?.thumbnailUrl ??
    null;

  const providerThumbnailUrl =
    providerAsset?.thumbnailUrl ??
    providerAsset?.mediaUrl ??
    videoMedia?.thumbnailUrl ??
    imageMedia?.thumbnailUrl ??
    null;

  /* -------------------------- Local media fetch -------------------------- */

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    setPreviewUrl(null);
    setPreviewError(false);

    if (
      isProviderAsset ||
      !asset.contentUrl ||
      !["IMAGE", "LOGO", "VIDEO"].includes(asset.kind)
    ) {
      return;
    }

    async function loadPreview() {
      try {
        const token = await getAccessToken();
        const url = await createAssetObjectUrl(token, asset);

        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }

        objectUrl = url;
        setPreviewUrl(url);
      } catch {
        if (!cancelled) {
          setPreviewError(true);
        }
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [asset.id, asset.contentUrl, asset.kind, getAccessToken, isProviderAsset]);

  /* -------------------------- Provider video ----------------------------- */

  if (
    providerAsset?.provider === "googleAds" &&
    asset.kind === "VIDEO" &&
    providerVideoId
  ) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(
          providerVideoId,
        )}`}
        title={asset.name}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
      />
    );
  }

  if (isProviderAsset && videoMedia?.kind === "VIDEO" && providerVideoUrl) {
    return (
      <video
        src={providerVideoUrl}
        poster={providerThumbnailUrl ?? undefined}
        controls
        playsInline
        preload="metadata"
        className="h-full w-full bg-black object-contain"
      />
    );
  }

  if (providerAsset && asset.kind === "VIDEO" && providerAsset.mediaUrl) {
    return (
      <video
        src={providerAsset.mediaUrl}
        poster={providerAsset.thumbnailUrl ?? undefined}
        controls
        playsInline
        preload="metadata"
        className="h-full w-full bg-black object-contain"
      />
    );
  }

  /* -------------------------- Provider image ----------------------------- */

  if (isProviderAsset && providerImageUrl) {
    return (
      <div className="relative h-full w-full">
        <img
          src={providerThumbnailUrl ?? providerImageUrl}
          alt={asset.name}
          loading="lazy"
          className="h-full w-full object-cover"
        />

        {asset.kind === "VIDEO" && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-black/65 text-xl text-white">
              ▶
            </span>
          </div>
        )}
      </div>
    );
  }

  /* ---------------------------- Local video ------------------------------ */

  if (
    !isProviderAsset &&
    asset.kind === "VIDEO" &&
    previewUrl &&
    !previewError
  ) {
    return (
      <video
        src={previewUrl}
        controls
        playsInline
        preload="metadata"
        className="h-full w-full bg-black object-contain"
      />
    );
  }

  /* ---------------------------- Local image ------------------------------ */

  if (
    !isProviderAsset &&
    (asset.kind === "IMAGE" || asset.kind === "LOGO") &&
    previewUrl &&
    !previewError
  ) {
    return (
      <img
        src={previewUrl}
        alt={asset.name}
        className="h-full w-full object-cover"
      />
    );
  }

  /* --------------------------- Text preview ------------------------------ */

  if (asset.kind === "TEXT") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-violet-50 p-4 text-left text-sm text-violet-900">
        <p className="line-clamp-5">
          {asset.textContent ||
            asset.providerCreative?.primaryTexts[0] ||
            asset.providerCreative?.headlines[0] ||
            "Text asset"}
        </p>
      </div>
    );
  }

  /* ------------------------- CTA / extension ----------------------------- */

  if (asset.kind === "CTA" || asset.kind === "EXTENSION") {
    const extension = asset.providerExtension;
    const creative = asset.providerCreative;

    const content =
      extension?.text ||
      extension?.linkText ||
      extension?.header ||
      extension?.headline ||
      extension?.phoneNumber ||
      creative?.callToAction ||
      creative?.callToActionType ||
      "Reusable advertising content";

    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-amber-50 p-5 text-center">
        <span className="text-3xl">{asset.kind === "CTA" ? "↗" : "▤"}</span>

        <p className="mt-3 line-clamp-4 text-sm font-semibold text-amber-950">
          {content}
        </p>

        <span className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          {asset.kind === "CTA"
            ? "Call to action"
            : extension?.extensionType || "Extension"}
        </span>
      </div>
    );
  }

  /* ------------------------- Creative preview ---------------------------- */

  if (asset.kind === "CREATIVE") {
    const creative = asset.providerCreative;
    const extension = asset.providerExtension;

    const headline =
      creative?.headlines[0] ||
      creative?.longHeadlines[0] ||
      extension?.headline ||
      null;

    const body =
      creative?.primaryTexts[0] ||
      creative?.descriptions[0] ||
      extension?.description ||
      extension?.text ||
      asset.textContent ||
      null;

    return (
      <div className="flex h-full w-full flex-col justify-center bg-indigo-50 p-5 text-left">
        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
          {creative?.creativeType || "Advertising creative"}
        </span>

        {headline && (
          <p className="mt-3 line-clamp-2 text-sm font-bold text-indigo-950">
            {headline}
          </p>
        )}

        {body && (
          <p className="mt-2 line-clamp-5 text-xs leading-relaxed text-indigo-800">
            {body}
          </p>
        )}

        {!headline && !body && (
          <p className="text-sm text-indigo-700">Creative details available</p>
        )}

        {creative?.callToAction && (
          <span className="mt-3 w-fit rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-indigo-700">
            {creative.callToAction}
          </span>
        )}

        <span className="mt-3 text-[10px] text-indigo-500">
          {creative?.media.length ?? 0} linked media items
        </span>
      </div>
    );
  }

  /* -------------------------- Fallback preview --------------------------- */

  const label =
    asset.kind === "VIDEO" ? "VIDEO" : asset.kind === "LOGO" ? "LOGO" : "IMAGE";

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-100 text-slate-500">
      <span className="text-3xl">{asset.kind === "VIDEO" ? "▶" : "▧"}</span>

      <span className="text-xs font-semibold tracking-wide">
        {previewError ? "PREVIEW UNAVAILABLE" : label}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Creative details                                                           */
/* -------------------------------------------------------------------------- */

function CreativeDetails({ creative }: { creative: ProviderCreativeContent }) {
  return (
    <div className="space-y-5">
      {creative.creativeType && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            {creative.creativeType.replace(/_/g, " ")}
          </span>

          {creative.callToActionType && (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              {creative.callToActionType.replace(/_/g, " ")}
            </span>
          )}
        </div>
      )}

      <ContentSection title="Primary text">
        <TextValues values={creative.primaryTexts} />
      </ContentSection>

      <ContentSection title="Headlines">
        <TextValues values={creative.headlines} />
      </ContentSection>

      <ContentSection title="Long headlines">
        <TextValues values={creative.longHeadlines} />
      </ContentSection>

      <ContentSection title="Descriptions">
        <TextValues values={creative.descriptions} />
      </ContentSection>

      <ContentSection title="Call to action">
        {creative.callToAction ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900">
              {creative.callToAction}
            </p>

            {creative.callToActionType && (
              <p className="mt-1 text-xs text-amber-700">
                Type: {creative.callToActionType}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400">No CTA information returned.</p>
        )}
      </ContentSection>

      {creative.linkDescription && (
        <ContentSection title="Link description">
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            {creative.linkDescription}
          </p>
        </ContentSection>
      )}

      {creative.displayUrl && (
        <ContentSection title="Display URL">
          <p className="break-all text-sm text-blue-700">
            {creative.displayUrl}
          </p>
        </ContentSection>
      )}

      {creative.finalUrls.length > 0 && (
        <ContentSection title="Destination URLs">
          <div className="space-y-2">
            {creative.finalUrls.map((url, index) => (
              <a
                key={`${index}-${url}`}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="block break-all rounded-lg bg-slate-50 p-3 text-xs text-blue-700 hover:underline"
              >
                {url}
              </a>
            ))}
          </div>
        </ContentSection>
      )}

      {creative.media.length > 0 && (
        <ContentSection title="Linked media">
          <div className="grid gap-3 sm:grid-cols-2">
            {creative.media.map((media, index) => (
              <div
                key={`${media.assetId || media.videoId || index}`}
                className="overflow-hidden rounded-lg border border-slate-200"
              >
                {media.thumbnailUrl || media.mediaUrl ? (
                  <img
                    src={media.thumbnailUrl || media.mediaUrl || ""}
                    alt={`Creative media ${index + 1}`}
                    loading="lazy"
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  <div className="grid aspect-video place-items-center bg-slate-100 text-2xl text-slate-400">
                    {media.kind === "VIDEO" ? "▶" : "▧"}
                  </div>
                )}

                <div className="p-2">
                  <p className="text-xs font-semibold text-slate-800">
                    {media.kind}
                  </p>

                  {media.videoId && (
                    <p className="mt-1 break-all text-[10px] text-slate-500">
                      Video ID: {media.videoId}
                    </p>
                  )}

                  {media.imageHash && (
                    <p className="mt-1 break-all text-[10px] text-slate-500">
                      Image hash: {media.imageHash}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ContentSection>
      )}

      {creative.carouselCards.length > 0 && (
        <ContentSection title="Carousel cards">
          <div className="grid gap-3 sm:grid-cols-2">
            {creative.carouselCards.map((card, index) => (
              <div
                key={card.cardId || index}
                className="overflow-hidden rounded-lg border border-slate-200"
              >
                {card.imageUrl || card.thumbnailUrl ? (
                  <img
                    src={card.imageUrl || card.thumbnailUrl || ""}
                    alt={card.headline || `Carousel card ${index + 1}`}
                    loading="lazy"
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  <div className="grid aspect-video place-items-center bg-slate-100 text-2xl text-slate-400">
                    {card.videoId ? "▶" : "▧"}
                  </div>
                )}

                <div className="space-y-2 p-3">
                  <p className="text-[10px] font-bold uppercase text-slate-400">
                    Card {index + 1}
                  </p>

                  {card.headline && (
                    <p className="text-sm font-semibold text-slate-900">
                      {card.headline}
                    </p>
                  )}

                  {card.description && (
                    <p className="text-xs leading-relaxed text-slate-600">
                      {card.description}
                    </p>
                  )}

                  {card.callToAction && (
                    <span className="inline-block rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">
                      {card.callToAction}
                    </span>
                  )}

                  {card.linkUrl && (
                    <p className="break-all text-[10px] text-blue-700">
                      {card.linkUrl}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ContentSection>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Extension details                                                          */
/* -------------------------------------------------------------------------- */

function ExtensionDetails({
  extension,
}: {
  extension: ProviderExtensionContent;
}) {
  const fields: Array<{
    label: string;
    value: string | null;
  }> = [
    { label: "Type", value: extension.extensionType },
    { label: "Text", value: extension.text },
    { label: "Link text", value: extension.linkText },
    { label: "Description 1", value: extension.description1 },
    { label: "Description 2", value: extension.description2 },
    { label: "Header", value: extension.header },
    { label: "Phone number", value: extension.phoneNumber },
    { label: "Promotion target", value: extension.promotionTarget },
    { label: "Promotion code", value: extension.promotionCode },
    { label: "Discount type", value: extension.discountType },
    { label: "Discount value", value: extension.discountValue },
    { label: "Occasion", value: extension.occasion },
    { label: "Currency", value: extension.currencyCode },
    { label: "Price", value: extension.priceAmount },
    { label: "Price qualifier", value: extension.priceQualifier },
    { label: "Business name", value: extension.businessName },
    { label: "Headline", value: extension.headline },
    { label: "Description", value: extension.description },
    { label: "Final URL", value: extension.finalUrl },
    {
      label: "Privacy policy",
      value: extension.privacyPolicyUrl,
    },
  ];

  const visibleFields = fields.filter((field) => field.value !== null);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {visibleFields.map((field) => (
          <div
            key={field.label}
            className="rounded-lg border border-slate-100 p-3"
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {field.label}
            </p>

            <p className="mt-1 break-words text-sm text-slate-800">
              {field.value}
            </p>
          </div>
        ))}
      </div>

      {extension.values.length > 0 && (
        <ContentSection title="Values">
          <TextValues values={extension.values} />
        </ContentSection>
      )}

      {extension.fieldNames.length > 0 && (
        <ContentSection title="Provider fields">
          <div className="flex flex-wrap gap-2">
            {extension.fieldNames.map((field, index) => (
              <span
                key={`${index}-${field}`}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"
              >
                {field}
              </span>
            ))}
          </div>
        </ContentSection>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main page                                                                  */
/* -------------------------------------------------------------------------- */

export default function AssetLibraryPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [stats, setStats] = useState<AssetStatsResponse["stats"] | null>(null);

  const [kindFilter, setKindFilter] = useState<AssetKind | "ALL">("ALL");

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalAssets, setTotalAssets] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  const [syncingProvider, setSyncingProvider] = useState<AssetProvider | null>(
    null,
  );

  const [googlePageToken, setGooglePageToken] = useState<string | null>(null);

  const [metaPageToken, setMetaPageToken] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [assetName, setAssetName] = useState("");
  const [assetKind, setAssetKind] = useState<UploadAssetKind>("IMAGE");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [textContent, setTextContent] = useState("");

  const [editingAsset, setEditingAsset] = useState<LibraryAsset | null>(null);

  const [selectedAsset, setSelectedAsset] = useState<LibraryAsset | null>(null);

  const [editingName, setEditingName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Prevent an older request from overwriting newer filter results.
  const loadSequenceRef = useRef(0);

  const getAccessToken = useCallback(async () => {
    const token = await getToken();

    if (!token) {
      throw new Error("Your session has expired. Please sign in again.");
    }

    return token;
  }, [getToken]);

  /* ------------------------------------------------------------------------ */
  /* Load every matching page for client-side category filtering             */
  /* ------------------------------------------------------------------------ */

  const getAllMatchingAssets = useCallback(
    async (
      token: string,
      provider: AssetProvider | undefined,
      query: string,
    ): Promise<LibraryAsset[]> => {
      const firstResult = await listAssets(token, {
        page: 1,
        pageSize: FETCH_PAGE_SIZE,
        search: query,
        provider,
      });

      const combinedAssets = [...firstResult.assets];

      if (firstResult.pagination.totalPages <= 1) {
        return combinedAssets;
      }

      const remainingPages = await Promise.all(
        Array.from(
          {
            length: firstResult.pagination.totalPages - 1,
          },
          (_, index) =>
            listAssets(token, {
              page: index + 2,
              pageSize: FETCH_PAGE_SIZE,
              search: query,
              provider,
            }),
        ),
      );

      for (const result of remainingPages) {
        combinedAssets.push(...result.assets);
      }

      return combinedAssets;
    },
    [],
  );

  /* ------------------------------------------------------------------------ */
  /* Load library data                                                         */
  /* ------------------------------------------------------------------------ */

  const loadData = useCallback(
    async (overrides?: {
      page?: number;
      kind?: AssetKind | "ALL";
      query?: string;
      source?: SourceFilter;
    }) => {
      if (!isLoaded || !isSignedIn) {
        return;
      }

      const requestId = ++loadSequenceRef.current;

      const targetPage = overrides?.page ?? page;
      const targetKind = overrides?.kind ?? kindFilter;
      const targetQuery = overrides?.query ?? searchQuery;
      const targetSource = overrides?.source ?? sourceFilter;

      setIsLoading(true);
      setError(null);

      try {
        const token = await getAccessToken();

        const statsPromise = getAssetStats(token);

        let visibleAssets: LibraryAsset[] = [];
        let resultTotal = 0;
        let resultPages = 1;

        const provider: AssetProvider | undefined =
          targetSource === "googleAds" || targetSource === "metaAds"
            ? targetSource
            : undefined;

        /**
         * Full fetch is needed for:
         * - AdSyntra-only source filtering.
         * - TEXT filtering because Meta copy belongs to CREATIVE records.
         * - CTA filtering because Meta CTA belongs to CREATIVE records.
         */
        const needsClientFiltering =
          targetSource === "ADSyntra" ||
          targetKind === "TEXT" ||
          targetKind === "CTA";

        if (needsClientFiltering) {
          const allAssets = await getAllMatchingAssets(
            token,
            provider,
            targetQuery,
          );

          let filteredAssets = allAssets;

          if (targetSource === "ADSyntra") {
            filteredAssets = filteredAssets.filter(
              (asset) => !asset.providerAsset,
            );
          }

          filteredAssets = filteredAssets.filter((asset) =>
            matchesAssetKind(asset, targetKind),
          );

          resultTotal = filteredAssets.length;

          resultPages = Math.max(1, Math.ceil(resultTotal / PAGE_SIZE));

          const startIndex = (targetPage - 1) * PAGE_SIZE;

          visibleAssets = filteredAssets.slice(
            startIndex,
            startIndex + PAGE_SIZE,
          );
        } else {
          const listResult = await listAssets(token, {
            page: targetPage,
            pageSize: PAGE_SIZE,
            kind: targetKind === "ALL" ? "ALL" : targetKind,
            search: targetQuery,
            provider,
          });

          visibleAssets = listResult.assets;
          resultTotal = listResult.pagination.total;

          resultPages = Math.max(1, listResult.pagination.totalPages);
        }

        const statsResult = await statsPromise;

        if (requestId !== loadSequenceRef.current) {
          return;
        }

        setAssets(visibleAssets);
        setTotalAssets(resultTotal);
        setTotalPages(resultPages);
        setStats(statsResult.stats);
      } catch (loadError) {
        if (requestId !== loadSequenceRef.current) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the Asset Library.",
        );
      } finally {
        if (requestId === loadSequenceRef.current) {
          setIsLoading(false);
        }
      }
    },
    [
      getAccessToken,
      getAllMatchingAssets,
      isLoaded,
      isSignedIn,
      page,
      kindFilter,
      searchQuery,
      sourceFilter,
    ],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /* ------------------------------------------------------------------------ */
  /* Search debounce                                                           */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1);
      setSearchQuery(searchInput.trim());
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  /* ------------------------------------------------------------------------ */
  /* Upload input                                                              */
  /* ------------------------------------------------------------------------ */

  const allowedFileTypes = useMemo(() => {
    if (assetKind === "VIDEO") {
      return "video/mp4,video/quicktime,video/webm";
    }

    if (assetKind === "IMAGE" || assetKind === "LOGO") {
      return "image/jpeg,image/png,image/webp,image/gif";
    }

    return undefined;
  }, [assetKind]);

  /* ------------------------------------------------------------------------ */
  /* Provider sync                                                             */
  /* ------------------------------------------------------------------------ */

  async function handleProviderSync(provider: AssetProvider) {
    setError(null);
    setNotice(null);
    setSyncingProvider(provider);

    try {
      const token = await getAccessToken();

      const pageToken =
        provider === "googleAds" ? googlePageToken : metaPageToken;

      const result =
        provider === "googleAds"
          ? await fetchGoogleAdsAssets(token, {
              kind: "ALL",
              limit: 50,
              pageToken: pageToken ?? undefined,
            })
          : await fetchMetaAdsAssets(token, {
              kind: "ALL",
              limit: 50,
              pageToken: pageToken ?? undefined,
            });

      if (provider === "googleAds") {
        setGooglePageToken(result.nextPageToken);
      } else {
        setMetaPageToken(result.nextPageToken);
      }

      setSourceFilter(provider);
      setKindFilter("ALL");
      setPage(1);

      setNotice(
        `${result.count} ${
          provider === "googleAds" ? "Google Ads" : "Meta Ads"
        } records synchronized successfully.${
          result.nextPageToken ? " More provider records are available." : ""
        }`,
      );

      // When source is already selected, changing page/kind may not
      // trigger the loading effect. Explicitly reload that case.
      if (sourceFilter === provider && page === 1 && kindFilter === "ALL") {
        await loadData({
          page: 1,
          kind: "ALL",
          query: searchQuery,
          source: provider,
        });
      }
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : `Unable to sync ${
              provider === "googleAds" ? "Google Ads" : "Meta Ads"
            } assets.`,
      );
    } finally {
      setSyncingProvider(null);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Upload                                                                    */
  /* ------------------------------------------------------------------------ */

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setNotice(null);

    if (!assetName.trim()) {
      setError("Enter an asset name.");
      return;
    }

    if (assetKind === "TEXT" && !textContent.trim()) {
      setError("Enter text content before saving this asset.");
      return;
    }

    if (assetKind !== "TEXT" && !selectedFile) {
      setError("Choose a file before uploading.");
      return;
    }

    setIsUploading(true);

    try {
      const token = await getAccessToken();

      if (assetKind === "TEXT") {
        await createTextAsset(token, {
          name: assetName.trim(),
          textContent: textContent.trim(),
          origin: "MANUAL",
        });
      } else if (selectedFile) {
        await uploadAsset(token, {
          name: assetName.trim(),
          kind: assetKind,
          file: selectedFile,
          origin: "MANUAL",
        });
      }

      setAssetName("");
      setSelectedFile(null);
      setTextContent("");

      setKindFilter("ALL");
      setSourceFilter("ALL");
      setPage(1);

      setSearchInput("");
      setSearchQuery("");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setNotice("Asset saved to your AdSyntra library.");

      await loadData({
        page: 1,
        kind: "ALL",
        query: "",
        source: "ALL",
      });
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Asset upload failed.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Delete                                                                    */
  /* ------------------------------------------------------------------------ */

  async function handleDelete(asset: LibraryAsset) {
    const confirmed = window.confirm(
      `Remove “${asset.name}” from your AdSyntra Asset Library? This will not delete the original asset from Google Ads or Meta Ads.`,
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    setNotice(null);

    try {
      const token = await getAccessToken();

      await deleteAsset(token, asset.id);

      setNotice("Asset removed from your AdSyntra library.");

      setSelectedAsset(null);

      const nextPage = assets.length === 1 && page > 1 ? page - 1 : page;

      setPage(nextPage);

      await loadData({
        page: nextPage,
        kind: kindFilter,
        query: searchQuery,
        source: sourceFilter,
      });
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete this asset.",
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Rename                                                                    */
  /* ------------------------------------------------------------------------ */

  function beginRename(asset: LibraryAsset) {
    setEditingAsset(asset);
    setEditingName(asset.name);
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingAsset || !editingName.trim()) {
      return;
    }

    setSavingEdit(true);
    setError(null);

    try {
      const token = await getAccessToken();

      await updateAsset(token, editingAsset.id, {
        name: editingName.trim(),
      });

      setEditingAsset(null);

      if (selectedAsset?.id === editingAsset.id) {
        setSelectedAsset({
          ...selectedAsset,
          name: editingName.trim(),
        });
      }

      setNotice("Asset details updated.");

      await loadData();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update this asset.",
      );
    } finally {
      setSavingEdit(false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Authentication states                                                     */
  /* ------------------------------------------------------------------------ */

  if (!isLoaded) {
    return (
      <div className="p-8 text-sm text-slate-500">Loading your session…</div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        Sign in to access your Asset Library.
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Render                                                                    */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Page heading */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            Ad Management
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Asset Library
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Manage your uploaded media, provider assets and reusable advertising
            creatives in one place.
          </p>
        </div>

        <div className="text-sm text-slate-500">
          {totalAssets} {totalAssets === 1 ? "asset" : "assets"}
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}

      {/* Statistics */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          {
            label: "All assets",
            value: stats?.total ?? "—",
          },
          {
            label: "Images",
            value: stats?.byKind.IMAGE?.count ?? "—",
          },
          {
            label: "Videos",
            value: stats?.byKind.VIDEO?.count ?? "—",
          },
          {
            label: "Text",
            value: stats?.byKind.TEXT?.count ?? "—",
          },
          {
            label: "Creatives",
            value: stats?.byKind.CREATIVE?.count ?? "—",
          },
          {
            label: "Extensions",
            value: stats?.byKind.EXTENSION?.count ?? "—",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-medium text-slate-500">{item.label}</p>

            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
              {item.value}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Asset library */}
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          {/* Provider synchronization */}
          <div className="mb-5 flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Connected platform assets
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                Import original provider references and advertising creative
                information without copying media files.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={syncingProvider !== null}
                onClick={() => void handleProviderSync("googleAds")}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {syncingProvider === "googleAds"
                  ? "Syncing Google…"
                  : googlePageToken
                    ? "Load more Google"
                    : "Sync Google Ads"}
              </button>

              <button
                type="button"
                disabled={syncingProvider !== null}
                onClick={() => void handleProviderSync("metaAds")}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {syncingProvider === "metaAds"
                  ? "Syncing Meta…"
                  : metaPageToken
                    ? "Load more Meta"
                    : "Sync Meta Ads"}
              </button>
            </div>
          </div>

          {/* Source filters */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {SOURCE_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => {
                    setSourceFilter(filter.value);
                    setPage(1);
                  }}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    sourceFilter === filter.value
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search assets, headlines, copy…"
              aria-label="Search assets"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 lg:max-w-xs"
            />
          </div>

          {/* Asset kind filters */}
          <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-100 pb-4">
            {KIND_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => {
                  setKindFilter(filter.value);
                  setPage(1);
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  kindFilter === filter.value
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Asset grid */}
          {isLoading ? (
            <div className="grid min-h-64 place-items-center text-sm text-slate-500">
              Loading assets…
            </div>
          ) : assets.length === 0 ? (
            <div className="grid min-h-64 place-items-center px-6 text-center">
              <div>
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-2xl text-slate-500">
                  ▧
                </div>

                <h2 className="mt-3 text-sm font-semibold text-slate-900">
                  No assets found
                </h2>

                <p className="mt-1 max-w-sm text-sm text-slate-500">
                  No assets match the selected source and category. Upload an
                  asset or synchronize your connected advertising accounts.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {assets.map((asset) => {
                const creativeSummary = getCreativeSummary(
                  asset.providerCreative,
                );

                const extensionSummary =
                  asset.providerExtension?.text ||
                  asset.providerExtension?.linkText ||
                  asset.providerExtension?.header ||
                  null;

                return (
                  <article
                    key={asset.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-sm"
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-slate-100">
                      <AssetMedia
                        asset={asset}
                        getAccessToken={getAccessToken}
                      />
                    </div>

                    <div className="space-y-3 p-3">
                      <div className="min-w-0">
                        <h3
                          className="truncate text-sm font-semibold text-slate-900"
                          title={asset.name}
                        >
                          {asset.name}
                        </h3>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                            {getKindLabel(asset.kind)}
                          </span>

                          <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">
                            {getSourceLabel(asset)}
                          </span>
                        </div>

                        <p className="mt-2 text-xs text-slate-500">
                          {formatBytes(asset.sizeBytes)} ·{" "}
                          {formatDate(asset.createdAt)}
                        </p>

                        {(asset.width || asset.height) && (
                          <p className="mt-1 text-xs text-slate-400">
                            {asset.width ?? "?"} × {asset.height ?? "?"}
                            {asset.aspectRatio ? ` · ${asset.aspectRatio}` : ""}
                          </p>
                        )}
                      </div>

                      {/* Creative summary */}
                      {creativeSummary && (
                        <p className="line-clamp-3 rounded-lg bg-indigo-50 p-2 text-xs leading-relaxed text-indigo-900">
                          {creativeSummary}
                        </p>
                      )}

                      {/* CTA preview */}
                      {asset.providerCreative?.callToAction && (
                        <span className="inline-block rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">
                          CTA: {asset.providerCreative.callToAction}
                        </span>
                      )}

                      {/* Extension preview */}
                      {extensionSummary && (
                        <p className="line-clamp-2 text-xs text-slate-600">
                          {extensionSummary}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                        <button
                          type="button"
                          onClick={() => setSelectedAsset(asset)}
                          className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                        >
                          View details
                        </button>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => beginRename(asset)}
                            className="text-xs font-semibold text-blue-700 hover:text-blue-900"
                          >
                            Rename
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDelete(asset)}
                            className="text-xs font-semibold text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {asset.providerAsset && (
                        <div className="space-y-1 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
                          <p className="truncate">
                            Account:{" "}
                            {asset.providerAsset.accountName ||
                              asset.providerAsset.accountId}
                          </p>

                          <p className="truncate">
                            Provider ID: {asset.providerAsset.assetId}
                          </p>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-500">
              Page {page} of {totalPages}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>

              <button
                type="button"
                disabled={page >= totalPages || isLoading}
                onClick={() =>
                  setPage((value) => Math.min(totalPages, value + 1))
                }
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Upload panel */}
        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-semibold text-slate-900">
            Add an asset
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Upload original files into AdSyntra or save reusable text assets.
          </p>

          <form onSubmit={handleUpload} className="mt-5 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">
                Asset type
              </span>

              <select
                value={assetKind}
                onChange={(event) => {
                  setAssetKind(event.target.value as UploadAssetKind);

                  setSelectedFile(null);

                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
              >
                <option value="IMAGE">Image</option>
                <option value="VIDEO">Video</option>
                <option value="LOGO">Logo</option>
                <option value="TEXT">Text</option>
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">
                Asset name
              </span>

              <input
                value={assetName}
                onChange={(event) => setAssetName(event.target.value)}
                maxLength={150}
                placeholder="e.g. Summer sale hero"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
              />
            </label>

            {assetKind === "TEXT" ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">
                  Text content
                </span>

                <textarea
                  value={textContent}
                  onChange={(event) => setTextContent(event.target.value)}
                  rows={5}
                  maxLength={10000}
                  placeholder="Enter reusable ad copy…"
                  className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </label>
            ) : (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">
                  Choose file
                </span>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={allowedFileTypes}
                  onChange={(event) =>
                    setSelectedFile(event.target.files?.[0] ?? null)
                  }
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                />

                <span className="block text-[11px] text-slate-400">
                  Images: JPG, PNG, WebP or GIF up to 20 MB. Videos: MP4, MOV or
                  WebM up to 100 MB.
                </span>

                {selectedFile && (
                  <span className="block truncate text-xs text-slate-500">
                    Selected: {selectedFile.name} (
                    {formatBytes(selectedFile.size)})
                  </span>
                )}
              </label>
            )}

            <button
              type="submit"
              disabled={
                isUploading ||
                !assetName.trim() ||
                (assetKind === "TEXT" && !textContent.trim()) ||
                (assetKind !== "TEXT" && !selectedFile)
              }
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUploading
                ? "Saving asset…"
                : assetKind === "TEXT"
                  ? "Save text asset"
                  : "Add to Asset Library"}
            </button>
          </form>
        </aside>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Complete asset / creative details modal                            */}
      {/* ------------------------------------------------------------------ */}

      {selectedAsset && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedAsset(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="asset-details-title"
            className="mx-auto my-6 w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div className="min-w-0">
                <h2
                  id="asset-details-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  {selectedAsset.name}
                </h2>

                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                    {getKindLabel(selectedAsset.kind)}
                  </span>

                  <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">
                    {getSourceLabel(selectedAsset)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                aria-label="Close asset details"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[75vh] space-y-6 overflow-y-auto p-5">
              <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                <div className="aspect-video">
                  <AssetMedia
                    asset={selectedAsset}
                    getAccessToken={getAccessToken}
                  />
                </div>
              </div>

              {/* Standalone text */}
              {selectedAsset.textContent && (
                <ContentSection title="Text content">
                  <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
                    {selectedAsset.textContent}
                  </p>
                </ContentSection>
              )}

              {/* Google creative pack */}
              {selectedAsset.googlePack && (
                <div className="space-y-5">
                  <h3 className="text-sm font-bold text-slate-900">
                    Google creative pack
                  </h3>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[10px] font-bold uppercase text-slate-400">
                        Campaign type
                      </p>

                      <p className="mt-1 text-sm text-slate-800">
                        {selectedAsset.googlePack.campaignType}
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[10px] font-bold uppercase text-slate-400">
                        Format
                      </p>

                      <p className="mt-1 text-sm text-slate-800">
                        {selectedAsset.googlePack.formatLabel}
                      </p>
                    </div>
                  </div>

                  <ContentSection title="Headlines">
                    <TextValues values={selectedAsset.googlePack.headlines} />
                  </ContentSection>

                  <ContentSection title="Long headlines">
                    <TextValues
                      values={selectedAsset.googlePack.longHeadlines}
                    />
                  </ContentSection>

                  <ContentSection title="Descriptions">
                    <TextValues
                      values={selectedAsset.googlePack.descriptions}
                    />
                  </ContentSection>

                  <ContentSection title="Final URL">
                    <p className="break-all text-sm text-blue-700">
                      {selectedAsset.googlePack.finalUrl}
                    </p>
                  </ContentSection>
                </div>
              )}

              {/* Provider creative */}
              {selectedAsset.providerCreative && (
                <div className="space-y-5 border-t border-slate-100 pt-5">
                  <h3 className="text-sm font-bold text-slate-900">
                    Advertising creative content
                  </h3>

                  <CreativeDetails creative={selectedAsset.providerCreative} />
                </div>
              )}

              {/* Provider extension */}
              {selectedAsset.providerExtension && (
                <div className="space-y-5 border-t border-slate-100 pt-5">
                  <h3 className="text-sm font-bold text-slate-900">
                    Extension details
                  </h3>

                  <ExtensionDetails
                    extension={selectedAsset.providerExtension}
                  />
                </div>
              )}

              {/* Provider identity */}
              {selectedAsset.providerAsset && (
                <div className="space-y-3 border-t border-slate-100 pt-5">
                  <h3 className="text-sm font-bold text-slate-900">
                    Provider information
                  </h3>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      {
                        label: "Provider",
                        value: getSourceLabel(selectedAsset),
                      },
                      {
                        label: "Account",
                        value:
                          selectedAsset.providerAsset.accountName ||
                          selectedAsset.providerAsset.accountId,
                      },
                      {
                        label: "Asset ID",
                        value: selectedAsset.providerAsset.assetId,
                      },
                      {
                        label: "Asset type",
                        value: selectedAsset.providerAsset.assetType,
                      },
                      {
                        label: "Creative ID",
                        value: selectedAsset.providerAsset.creativeId,
                      },
                      {
                        label: "Ad ID",
                        value: selectedAsset.providerAsset.adId,
                      },
                      {
                        label: "Campaign ID",
                        value: selectedAsset.providerAsset.campaignId,
                      },
                      {
                        label: "Ad Group ID",
                        value: selectedAsset.providerAsset.adGroupId,
                      },
                      {
                        label: "Ad Set ID",
                        value: selectedAsset.providerAsset.adSetId,
                      },
                      {
                        label: "Image hash",
                        value: selectedAsset.providerAsset.imageHash,
                      },
                      {
                        label: "Video ID",
                        value: selectedAsset.providerAsset.videoId,
                      },
                      {
                        label: "Last synchronized",
                        value: formatDate(selectedAsset.providerAsset.syncedAt),
                      },
                    ]
                      .filter((item) => item.value !== null)
                      .map((item) => (
                        <div
                          key={item.label}
                          className="min-w-0 rounded-lg bg-slate-50 p-3"
                        >
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {item.label}
                          </p>

                          <p className="mt-1 break-all text-xs text-slate-700">
                            {item.value}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={() => beginRename(selectedAsset)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Rename
              </button>

              <button
                type="button"
                onClick={() => void handleDelete(selectedAsset)}
                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                Remove from library
              </button>

              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Rename modal                                                        */}
      {/* ------------------------------------------------------------------ */}

      {editingAsset && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setEditingAsset(null);
            }
          }}
        >
          <form
            onSubmit={handleRename}
            className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-xl"
          >
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Rename asset
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Change the name shown in your AdSyntra library.
              </p>
            </div>

            <input
              autoFocus
              value={editingName}
              onChange={(event) => setEditingName(event.target.value)}
              maxLength={150}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingAsset(null)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={savingEdit || !editingName.trim()}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {savingEdit ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
