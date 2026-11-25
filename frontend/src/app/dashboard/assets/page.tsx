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

import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import CampaignOutlined from "@mui/icons-material/CampaignOutlined";
import CloseRounded from "@mui/icons-material/CloseRounded";
import CloudUploadOutlined from "@mui/icons-material/CloudUploadOutlined";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlined from "@mui/icons-material/EditOutlined";
import ExtensionOutlined from "@mui/icons-material/ExtensionOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import SearchRounded from "@mui/icons-material/SearchRounded";
import SyncRounded from "@mui/icons-material/SyncRounded";
import TextFieldsRounded from "@mui/icons-material/TextFieldsRounded";
import VideoLibraryOutlined from "@mui/icons-material/VideoLibraryOutlined";

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
      ((creative.primaryTexts ?? []).length > 0 ||
        (creative.headlines ?? []).length > 0 ||
        (creative.longHeadlines ?? []).length > 0 ||
        (creative.descriptions ?? []).length > 0),
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
        (creative.carouselCards ?? []).some(
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
  const creative = asset.providerCreative;
  const creativeMedia = creative?.media ?? [];

  const videoMedia =
    creativeMedia.find(
      (item) =>
        item.kind === "VIDEO" &&
        Boolean(item.mediaUrl || item.thumbnailUrl || item.videoId),
    ) ?? null;

  const imageMedia =
    creativeMedia.find(
      (item) =>
        item.kind === "IMAGE" &&
        Boolean(item.thumbnailUrl || item.mediaUrl),
    ) ?? null;

  const carouselPreview =
    creative?.carouselCards?.find(
      (card) => card.thumbnailUrl || card.imageUrl,
    ) ?? null;

  const providerVideoId = providerAsset?.videoId ?? videoMedia?.videoId ?? null;
  const providerVideoUrl =
    videoMedia?.mediaUrl ??
    (asset.kind === "VIDEO" ? providerAsset?.mediaUrl : null);

  // A CREATIVE can contain both video and image media. Prefer a real image or
  // video thumbnail for the card instead of accidentally passing an MP4 URL to
  // an <img> element.
  const providerImageUrl =
    asset.kind === "CREATIVE"
      ? imageMedia?.thumbnailUrl ??
        imageMedia?.mediaUrl ??
        videoMedia?.thumbnailUrl ??
        carouselPreview?.thumbnailUrl ??
        carouselPreview?.imageUrl ??
        providerAsset?.thumbnailUrl ??
        null
      : providerAsset?.thumbnailUrl ??
        providerAsset?.mediaUrl ??
        imageMedia?.thumbnailUrl ??
        imageMedia?.mediaUrl ??
        null;

  const providerThumbnailUrl =
    providerAsset?.thumbnailUrl ??
    videoMedia?.thumbnailUrl ??
    imageMedia?.thumbnailUrl ??
    carouselPreview?.thumbnailUrl ??
    providerAsset?.mediaUrl ??
    null;

  /* -------------------------- Local media fetch -------------------------- */

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    setPreviewUrl(null);
    setPreviewError(false);

    // Provider URLs are already returned by the provider sync service. Only
    // AdSyntra-owned uploads need the authenticated /content endpoint.
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
          src={providerImageUrl}
          alt={asset.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />

        {(asset.kind === "VIDEO" || Boolean(videoMedia)) && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-black/65 text-xl text-white">
              ▶
            </span>
          </div>
        )}
      </div>
    );
  }

  // A provider video may supply an ID and thumbnail but no downloadable source.
  // Keep the thumbnail visible rather than trying to render the ID as a URL.
  if (isProviderAsset && asset.kind === "VIDEO" && providerThumbnailUrl) {
    return (
      <div className="relative h-full w-full">
        <img
          src={providerThumbnailUrl}
          alt={`${asset.name} thumbnail`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 grid place-items-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-black/65 text-xl text-white">
            ▶
          </span>
        </div>
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
            creative?.primaryTexts?.[0] ||
            creative?.headlines?.[0] ||
            "Text asset"}
        </p>
      </div>
    );
  }

  /* ------------------------- CTA / extension ----------------------------- */

  if (asset.kind === "CTA" || asset.kind === "EXTENSION") {
    const extension = asset.providerExtension;
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
    const extension = asset.providerExtension;
    const headline =
      creative?.headlines?.[0] ||
      creative?.longHeadlines?.[0] ||
      extension?.headline ||
      null;
    const body =
      creative?.primaryTexts?.[0] ||
      creative?.descriptions?.[0] ||
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
          {creative?.media?.length ?? 0} linked media items
        </span>
        {providerAsset?.imageHash && !providerImageUrl && (
          <span className="mt-1 text-[10px] text-indigo-500">
            Provider image hash: {providerAsset.imageHash}
          </span>
        )}
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
      {isProviderAsset && !providerImageUrl && !providerVideoUrl && (
        <span className="px-4 text-center text-[10px]">
          The provider did not return a preview URL for this asset.
        </span>
      )}
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
        <TextValues values={creative.primaryTexts ?? []} />
      </ContentSection>

      <ContentSection title="Headlines">
        <TextValues values={creative.headlines ?? []} />
      </ContentSection>

      <ContentSection title="Long headlines">
        <TextValues values={creative.longHeadlines ?? []} />
      </ContentSection>

      <ContentSection title="Descriptions">
        <TextValues values={creative.descriptions ?? []} />
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

      {(creative.finalUrls ?? []).length > 0 && (
        <ContentSection title="Destination URLs">
          <div className="space-y-2">
            {(creative.finalUrls ?? []).map((url, index) => (
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

      {(creative.media ?? []).length > 0 && (
        <ContentSection title="Linked media">
          <div className="grid gap-3 sm:grid-cols-2">
            {(creative.media ?? []).map((media, index) => (
              <div
                key={`${media.assetId || media.videoId || index}`}
                className="overflow-hidden rounded-lg border border-slate-200"
              >
                {media.kind === "VIDEO" && media.mediaUrl ? (
                  <video
                    src={media.mediaUrl}
                    poster={media.thumbnailUrl ?? undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className="aspect-video w-full bg-black object-contain"
                  />
                ) : media.thumbnailUrl || media.mediaUrl ? (
                  <div className="relative">
                    <img
                      src={media.thumbnailUrl || media.mediaUrl || ""}
                      alt={`Creative media ${index + 1}`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="aspect-video w-full object-cover"
                    />
                    {media.kind === "VIDEO" && (
                      <span className="absolute inset-0 grid place-items-center text-3xl text-white drop-shadow">
                        ▶
                      </span>
                    )}
                  </div>
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

      {(creative.carouselCards ?? []).length > 0 && (
        <ContentSection title="Carousel cards">
          <div className="grid gap-3 sm:grid-cols-2">
            {(creative.carouselCards ?? []).map((card, index) => (
              <div
                key={card.cardId || index}
                className="overflow-hidden rounded-lg border border-slate-200"
              >
                {card.thumbnailUrl || card.imageUrl ? (
                  <div className="relative">
                    <img
                      src={card.thumbnailUrl || card.imageUrl || ""}
                      alt={card.headline || `Carousel card ${index + 1}`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="aspect-video w-full object-cover"
                    />
                    {card.videoId && (
                      <span className="absolute inset-0 grid place-items-center text-3xl text-white drop-shadow">
                        ▶
                      </span>
                    )}
                  </div>
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

      {(extension.values ?? []).length > 0 && (
        <ContentSection title="Values">
          <TextValues values={extension.values ?? []} />
        </ContentSection>
      )}

      {(extension.fieldNames ?? []).length > 0 && (
        <ContentSection title="Provider fields">
          <div className="flex flex-wrap gap-2">
            {(extension.fieldNames ?? []).map((field, index) => (
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
  const [addDialogOpen, setAddDialogOpen] = useState(false);

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
  const [deleteTarget, setDeleteTarget] = useState<LibraryAsset | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

      setAddDialogOpen(false);
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

  function handleDelete(asset: LibraryAsset) {
    setDeleteTarget(asset);
  }

  async function confirmDelete() {
    if (!deleteTarget || isDeleting) return;

    const asset = deleteTarget;
    setIsDeleting(true);
    setError(null);
    setNotice(null);

    try {
      const token = await getAccessToken();
      await deleteAsset(token, asset.id);

      setNotice("Asset removed from your AdSyntra library.");
      setSelectedAsset(null);
      setDeleteTarget(null);

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
    } finally {
      setIsDeleting(false);
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
      <Box className="mx-auto max-w-7xl p-6">
        <Stack spacing={2}>
          <Skeleton variant="text" width={240} height={42} />
          <Skeleton variant="text" width={420} />
          <Box className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} variant="rounded" height={96} />
            ))}
          </Box>
          <Skeleton variant="rounded" height={340} />
        </Stack>
      </Box>
    );
  }

  if (!isSignedIn) {
    return (
      <Box className="mx-auto max-w-7xl p-6">
        <Paper variant="outlined" className="rounded-2xl p-8">
          <Stack alignItems="center" spacing={2}>
            <Avatar sx={{ width: 56, height: 56, bgcolor: "#e8f0fe", color: "#1967d2" }}>
              <Inventory2Outlined />
            </Avatar>
            <Typography variant="h6" fontWeight={700}>Sign in to access your Asset Library</Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Your uploaded media, provider assets and reusable creative content will appear here.
            </Typography>
          </Stack>
        </Paper>
      </Box>
    );
  }

  const statCards = [
    {
      label: "Total assets",
      value: stats?.total ?? "—",
      icon: <Inventory2Outlined />,
      accent: "#1a73e8",
      background: "#e8f0fe",
    },
    {
      label: "Images",
      value: stats?.byKind.IMAGE?.count ?? "—",
      icon: <ImageOutlined />,
      accent: "#188038",
      background: "#e6f4ea",
    },
    {
      label: "Videos",
      value: stats?.byKind.VIDEO?.count ?? "—",
      icon: <VideoLibraryOutlined />,
      accent: "#9334e6",
      background: "#f3e8fd",
    },
    {
      label: "Text assets",
      value: stats?.byKind.TEXT?.count ?? "—",
      icon: <TextFieldsRounded />,
      accent: "#b06000",
      background: "#fef7e0",
    },
    {
      label: "Ad creatives",
      value: stats?.byKind.CREATIVE?.count ?? "—",
      icon: <CampaignOutlined />,
      accent: "#c5221f",
      background: "#fce8e6",
    },
    {
      label: "Extensions",
      value: stats?.byKind.EXTENSION?.count ?? "—",
      icon: <ExtensionOutlined />,
      accent: "#5f6368",
      background: "#f1f3f4",
    },
  ];

  const closeAddDialog = () => {
    if (isUploading) return;
    setAddDialogOpen(false);
    setError(null);
  };

  return (
    <Box className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6">
      {/* Page heading */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <Stack direction="row" alignItems="center" spacing={1.25} className="mb-1">
            <Avatar variant="rounded" sx={{ width: 38, height: 38, bgcolor: "#e8f0fe", color: "#1967d2" }}>
              <Inventory2Outlined fontSize="small" />
            </Avatar>
            <Typography variant="overline" sx={{ color: "#5f6368", fontWeight: 700, letterSpacing: 1.2 }}>
              WORKSPACE / ASSETS
            </Typography>
          </Stack>
          <Typography variant="h4" sx={{ color: "#202124", fontWeight: 700, letterSpacing: "-0.04em", fontSize: { xs: 27, md: 32 } }}>
            Asset Library
          </Typography>
          <Typography variant="body2" sx={{ color: "#5f6368", mt: 0.75, maxWidth: 720 }}>
            One place for your uploaded media, Google Ads and Meta Ads assets, and reusable advertising creatives.
          </Typography>
        </div>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
          <Button
            variant="outlined"
            startIcon={syncingProvider ? <CircularProgress size={16} /> : <SyncRounded />}
            disabled={syncingProvider !== null}
            onClick={() => void loadData({ page })}
            sx={{ borderColor: "#dadce0", color: "#3c4043", textTransform: "none", borderRadius: 2, px: 2.25, py: 1.1, fontWeight: 600 }}
          >
            Refresh library
          </Button>
          <Button
            variant="contained"
            startIcon={<AddRounded />}
            onClick={() => { setError(null); setAddDialogOpen(true); }}
            sx={{ bgcolor: "#1a73e8", "&:hover": { bgcolor: "#1765cc" }, textTransform: "none", borderRadius: 2, px: 2.5, py: 1.1, fontWeight: 700, boxShadow: "none" }}
          >
            Add assets
          </Button>
        </Stack>
      </div>

      {/* Feedback */}
      {error && (
        <Alert severity="error" variant="outlined" onClose={() => setError(null)} sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" variant="outlined" onClose={() => setNotice(null)} sx={{ borderRadius: 2 }}>
          {notice}
        </Alert>
      )}

      {/* Summary metrics */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {statCards.map((item) => (
          <Card key={item.label} variant="outlined" sx={{ borderColor: "#dadce0", borderRadius: 2.5, boxShadow: "none" }}>
            <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                <Typography variant="caption" sx={{ color: "#5f6368", fontWeight: 600 }}>{item.label}</Typography>
                <Avatar variant="rounded" sx={{ width: 32, height: 32, bgcolor: item.background, color: item.accent }}>
                  {item.icon}
                </Avatar>
              </Stack>
              <Typography variant="h5" sx={{ mt: 1.2, color: "#202124", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {item.value}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Main library workspace */}
      <Paper variant="outlined" sx={{ borderColor: "#dadce0", borderRadius: 3, overflow: "hidden", boxShadow: "none" }}>
        {/* Provider sync toolbar */}
        <Box sx={{ px: { xs: 2, md: 2.5 }, py: 2, bgcolor: "#f8fafd", borderBottom: "1px solid #e8eaed" }}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <Typography variant="subtitle1" sx={{ color: "#202124", fontWeight: 700 }}>Connected platforms</Typography>
              <Typography variant="caption" sx={{ color: "#5f6368" }}>
                Sync provider assets and keep their original IDs and creative data in your library.
              </Typography>
            </div>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                size="medium"
                variant="outlined"
                disabled={syncingProvider !== null}
                startIcon={syncingProvider === "googleAds" ? <CircularProgress size={15} /> : <SyncRounded />}
                onClick={() => void handleProviderSync("googleAds")}
                sx={{ borderColor: "#dadce0", color: "#3c4043", textTransform: "none", borderRadius: 2, fontWeight: 600, bgcolor: "#fff" }}
              >
                {syncingProvider === "googleAds" ? "Syncing Google…" : googlePageToken ? "Load more Google" : "Sync Google Ads"}
              </Button>
              <Button
                size="medium"
                variant="outlined"
                disabled={syncingProvider !== null}
                startIcon={syncingProvider === "metaAds" ? <CircularProgress size={15} /> : <SyncRounded />}
                onClick={() => void handleProviderSync("metaAds")}
                sx={{ borderColor: "#dadce0", color: "#3c4043", textTransform: "none", borderRadius: 2, fontWeight: 600, bgcolor: "#fff" }}
              >
                {syncingProvider === "metaAds" ? "Syncing Meta…" : metaPageToken ? "Load more Meta" : "Sync Meta Ads"}
              </Button>
            </Stack>
          </div>
        </Box>

        <Box sx={{ p: { xs: 2, md: 2.5 } }}>
          {/* Search and source filters */}
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ alignItems: "center" }}>
              {SOURCE_FILTERS.map((filter) => {
                const selected = sourceFilter === filter.value;
                return (
                  <Button
                    key={filter.value}
                    size="small"
                    variant={selected ? "contained" : "text"}
                    onClick={() => { setSourceFilter(filter.value); setPage(1); }}
                    sx={{
                      minWidth: 0,
                      px: 1.5,
                      py: 0.8,
                      borderRadius: 5,
                      textTransform: "none",
                      fontWeight: selected ? 700 : 600,
                      bgcolor: selected ? "#e8f0fe" : "transparent",
                      color: selected ? "#1967d2" : "#5f6368",
                      boxShadow: "none",
                      "&:hover": { bgcolor: selected ? "#d2e3fc" : "#f1f3f4", boxShadow: "none" },
                    }}
                  >
                    {filter.label}
                  </Button>
                );
              })}
            </Stack>

            <TextField
              size="small"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search assets, headlines or copy"
              aria-label="Search assets"
              sx={{ width: { xs: "40%", xl: 100 }, "& .MuiOutlinedInput-root": { borderRadius: 2, bgcolor: "#fff" } }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchRounded sx={{ color: "#80868b" }} /></InputAdornment>,
                endAdornment: searchInput ? (
                  <InputAdornment position="end">
                    <IconButton size="small" aria-label="Clear search" onClick={() => setSearchInput("")}><CloseRounded fontSize="small" /></IconButton>
                  </InputAdornment>
                ) : undefined,
              }}
            />
          </div>

          {/* Category filters */}
          <div className="mt-4 flex flex-wrap gap-2 border-b border-[#e8eaed] pb-4">
            {KIND_FILTERS.map((filter) => (
              <Chip
                key={filter.value}
                label={filter.label}
                clickable
                onClick={() => { setKindFilter(filter.value); setPage(1); }}
                color={kindFilter === filter.value ? "primary" : "default"}
                variant={kindFilter === filter.value ? "filled" : "outlined"}
                sx={{
                  borderRadius: 1.5,
                  fontWeight: 600,
                  borderColor: kindFilter === filter.value ? "#1a73e8" : "#dadce0",
                  bgcolor: kindFilter === filter.value ? "#e8f0fe" : "#fff",
                  color: kindFilter === filter.value ? "#1967d2" : "#5f6368",
                  "& .MuiChip-label": { px: 1.5 },
                }}
              />
            ))}
          </div>

          {/* Asset count and loading state */}
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ pt: 2, pb: 1.5 }}>
            <Typography variant="body2" sx={{ color: "#5f6368", fontWeight: 600 }}>
              {totalAssets.toLocaleString()} {totalAssets === 1 ? "asset" : "assets"}
            </Typography>
            <Typography variant="caption" sx={{ color: "#80868b" }}>
              Page {page} of {totalPages}
            </Typography>
          </Stack>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <Card key={index} variant="outlined" sx={{ borderColor: "#e8eaed", borderRadius: 2.5 }}>
                  <Skeleton variant="rectangular" height={160} />
                  <CardContent>
                    <Skeleton width="70%" />
                    <Skeleton width="45%" />
                    <Skeleton variant="rounded" height={30} sx={{ mt: 2 }} />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : assets.length === 0 ? (
            <Paper variant="outlined" sx={{ minHeight: 300, borderStyle: "dashed", borderColor: "#dadce0", borderRadius: 2.5, display: "grid", placeItems: "center", p: 4 }}>
              <Stack alignItems="center" spacing={1.5} sx={{ maxWidth: 420, textAlign: "center" }}>
                <Avatar variant="rounded" sx={{ width: 58, height: 58, bgcolor: "#f1f3f4", color: "#5f6368" }}>
                  <Inventory2Outlined fontSize="large" />
                </Avatar>
                <Typography variant="h6" sx={{ color: "#202124", fontWeight: 700 }}>No assets found</Typography>
                <Typography variant="body2" sx={{ color: "#5f6368" }}>
                  No assets match the selected filters. Add a file to AdSyntra or sync a connected advertising account.
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1 }}>
                  <Button variant="contained" startIcon={<AddRounded />} onClick={() => setAddDialogOpen(true)} sx={{ bgcolor: "#1a73e8", textTransform: "none", boxShadow: "none" }}>Add assets</Button>
                  <Button variant="outlined" startIcon={<SyncRounded />} disabled={syncingProvider !== null} onClick={() => void handleProviderSync("googleAds")} sx={{ borderColor: "#dadce0", color: "#3c4043", textTransform: "none" }}>Sync Google Ads</Button>
                </Stack>
              </Stack>
            </Paper>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {assets.map((asset) => {
                const creativeSummary = getCreativeSummary(asset.providerCreative);
                const extensionSummary =
                  asset.providerExtension?.text ||
                  asset.providerExtension?.linkText ||
                  asset.providerExtension?.header ||
                  null;
                const dimensions = asset.width && asset.height ? `${asset.width} × ${asset.height}` : null;

                return (
                  <Card
                    key={asset.id}
                    variant="outlined"
                    sx={{
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      borderColor: "#dadce0",
                      borderRadius: 2.5,
                      overflow: "hidden",
                      boxShadow: "none",
                      transition: "border-color .18s ease, box-shadow .18s ease, transform .18s ease",
                      "&:hover": { borderColor: "#a8c7fa", boxShadow: "0 2px 8px rgba(60,64,67,.12)", transform: "translateY(-1px)" },
                    }}
                  >
                    <Box sx={{ height: 178, bgcolor: "#f1f3f4", position: "relative", overflow: "hidden" }}>
                      <AssetMedia asset={asset} getAccessToken={getAccessToken} />
                      <Chip
                        size="small"
                        label={getKindLabel(asset.kind)}
                        sx={{ position: "absolute", top: 10, left: 10, bgcolor: "rgba(255,255,255,.94)", color: "#3c4043", fontWeight: 700, boxShadow: "0 1px 3px rgba(0,0,0,.12)" }}
                      />
                    </Box>

                    <CardContent sx={{ p: 2, flex: 1, "&:last-child": { pb: 1.5 } }}>
                      <Stack spacing={1.25}>
                        <div className="min-w-0">
                          <Typography variant="subtitle2" noWrap title={asset.name} sx={{ color: "#202124", fontWeight: 700 }}>
                            {asset.name}
                          </Typography>
                          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.75 }}>
                            <Chip
                              size="small"
                              label={getSourceLabel(asset)}
                              variant="outlined"
                              sx={{ height: 22, maxWidth: "100%", borderColor: "#dadce0", color: "#5f6368", fontSize: 10, fontWeight: 600, "& .MuiChip-label": { px: 1 } }}
                            />
                            {asset.origin === "AI_STUDIO" && (
                              <Chip size="small" icon={<AutoAwesomeOutlined sx={{ "&.MuiChip-icon": { fontSize: 13 } }} />} label="AI" sx={{ height: 22, bgcolor: "#f3e8fd", color: "#7627bb", fontSize: 10, fontWeight: 700 }} />
                            )}
                          </Stack>
                        </div>

                        <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75}>
                          {dimensions && <Typography variant="caption" sx={{ color: "#5f6368" }}>{dimensions}px</Typography>}
                          {asset.aspectRatio && <Typography variant="caption" sx={{ color: "#5f6368" }}>· {asset.aspectRatio}</Typography>}
                          {asset.sizeBytes ? <Typography variant="caption" sx={{ color: "#5f6368" }}>· {formatBytes(asset.sizeBytes)}</Typography> : null}
                        </Stack>

                        {creativeSummary && (
                          <Box sx={{ minHeight: 54, borderRadius: 1.5, bgcolor: "#f8f9fa", p: 1.25 }}>
                            <Typography variant="caption" sx={{ color: "#3c4043", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              {creativeSummary}
                            </Typography>
                          </Box>
                        )}
                        {!creativeSummary && extensionSummary && (
                          <Typography variant="caption" sx={{ color: "#5f6368", minHeight: 32, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {extensionSummary}
                          </Typography>
                        )}
                        {asset.providerCreative?.callToAction && (
                          <Chip size="small" label={`CTA · ${asset.providerCreative.callToAction}`} sx={{ alignSelf: "flex-start", maxWidth: "100%", bgcolor: "#fef7e0", color: "#8a4b00", fontWeight: 600, "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }} />
                        )}
                        <Typography variant="caption" sx={{ color: "#80868b" }}>
                          Added {formatDate(asset.createdAt)}
                        </Typography>
                        {asset.providerAsset && (
                          <Typography variant="caption" noWrap title={asset.providerAsset.accountName || asset.providerAsset.accountId} sx={{ color: "#80868b" }}>
                            Account: {asset.providerAsset.accountName || asset.providerAsset.accountId} · ID: {asset.providerAsset.assetId}
                          </Typography>
                        )}
                      </Stack>
                    </CardContent>

                    <Divider />
                    <CardActions sx={{ px: 1.5, py: 0.75, justifyContent: "space-between" }}>
                      <Button size="small" onClick={() => setSelectedAsset(asset)} sx={{ textTransform: "none", color: "#1967d2", fontWeight: 700 }}>
                        View details
                      </Button>
                      <Stack direction="row" spacing={0.25}>
                        <Tooltip title="Rename asset">
                          <IconButton size="small" onClick={() => beginRename(asset)} aria-label={`Rename ${asset.name}`}>
                            <EditOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Remove from library">
                          <IconButton size="small" color="error" onClick={() => void handleDelete(asset)} aria-label={`Delete ${asset.name}`}>
                            <DeleteOutlineRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </CardActions>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <Stack direction={{ xs: "column", sm: "row" }} alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ pt: 3 }}>
              <Typography variant="caption" sx={{ color: "#5f6368" }}>
                Showing page {page} of {totalPages}
              </Typography>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, value) => setPage(value)}
                color="primary"
                shape="rounded"
                size="medium"
                siblingCount={0}
                boundaryCount={1}
              />
            </Stack>
          )}
        </Box>
      </Paper>

      {/* Add asset dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={closeAddDialog}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <form onSubmit={handleUpload}>
          <DialogTitle sx={{ pb: 1.25 }}>
            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
              <div>
                <Typography variant="h6" sx={{ color: "#202124", fontWeight: 700 }}>Add assets</Typography>
                <DialogContentText sx={{ mt: 0.5, fontSize: 13 }}>
                  Upload reusable media or save ad copy to your AdSyntra library.
                </DialogContentText>
              </div>
              <IconButton type="button" onClick={closeAddDialog} disabled={isUploading} aria-label="Close add asset dialog" size="small"><CloseRounded /></IconButton>
            </Stack>
          </DialogTitle>
          <Divider />
          <DialogContent sx={{ pt: 2.5 }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Stack spacing={2.25}>
              <FormControl fullWidth size="small">
                <InputLabel id="asset-kind-label">Asset type</InputLabel>
                <Select
                  labelId="asset-kind-label"
                  value={assetKind}
                  label="Asset type"
                  onChange={(event) => {
                    setAssetKind(event.target.value as UploadAssetKind);
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  <MenuItem value="IMAGE">Image</MenuItem>
                  <MenuItem value="VIDEO">Video</MenuItem>
                  <MenuItem value="LOGO">Logo</MenuItem>
                  <MenuItem value="TEXT">Text and copy</MenuItem>
                </Select>
              </FormControl>

              <TextField
                label="Asset name"
                value={assetName}
                onChange={(event) => setAssetName(event.target.value)}
                inputProps={{ maxLength: 150 }}
                placeholder="e.g. Summer sale hero"
                fullWidth
                size="small"
                required
              />

              {assetKind === "TEXT" ? (
                <TextField
                  label="Text content"
                  value={textContent}
                  onChange={(event) => setTextContent(event.target.value)}
                  inputProps={{ maxLength: 10000 }}
                  placeholder="Write reusable primary text, headline or description…"
                  minRows={5}
                  maxRows={10}
                  multiline
                  fullWidth
                  helperText={`${textContent.length.toLocaleString()} / 10,000 characters`}
                  required
                />
              ) : (
                <div>
                  <Typography variant="body2" sx={{ mb: 1, color: "#3c4043", fontWeight: 600 }}>Choose a file</Typography>
                  <Paper
                    variant="outlined"
                    sx={{ borderStyle: "dashed", borderColor: selectedFile ? "#1a73e8" : "#dadce0", bgcolor: selectedFile ? "#f8fbff" : "#fafbfc", borderRadius: 2.5, p: 2.5 }}
                  >
                    <Stack alignItems="center" spacing={1.25}>
                      <Avatar variant="rounded" sx={{ width: 46, height: 46, bgcolor: "#e8f0fe", color: "#1967d2" }}>
                        <CloudUploadOutlined />
                      </Avatar>
                      <Typography variant="body2" sx={{ color: "#202124", fontWeight: 600, textAlign: "center" }}>
                        {selectedFile ? selectedFile.name : "Choose a file from your device"}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "#5f6368", textAlign: "center" }}>
                        {selectedFile ? formatBytes(selectedFile.size) : assetKind === "VIDEO" ? "MP4, MOV or WebM · up to 100 MB" : "JPG, PNG, WebP or GIF · up to 20 MB"}
                      </Typography>
                      <Button type="button" component="label" variant="outlined" size="small" startIcon={<CloudUploadOutlined />} sx={{ mt: 0.5, borderColor: "#dadce0", color: "#1967d2", textTransform: "none", fontWeight: 700 }}>
                        {selectedFile ? "Choose another file" : "Browse files"}
                        <input
                          ref={fileInputRef}
                          type="file"
                          hidden
                          accept={allowedFileTypes}
                          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                        />
                      </Button>
                      {selectedFile && (
                        <Button type="button" size="small" color="inherit" onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} sx={{ textTransform: "none" }}>
                          Remove selected file
                        </Button>
                      )}
                    </Stack>
                  </Paper>
                </div>
              )}
              <Alert severity="info" icon={<InfoOutlined />} sx={{ borderRadius: 2, alignItems: "center" }}>
                Private uploads stay in AdSyntra storage. They are uploaded to Google Ads or Meta Ads separately when a campaign needs provider-owned media.
              </Alert>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, borderTop: "1px solid #e8eaed" }}>
            <Button type="button" onClick={closeAddDialog} disabled={isUploading} sx={{ color: "#5f6368", textTransform: "none", fontWeight: 600 }}>Cancel</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={
                isUploading ||
                !assetName.trim() ||
                (assetKind === "TEXT" && !textContent.trim()) ||
                (assetKind !== "TEXT" && !selectedFile)
              }
              startIcon={isUploading ? <CircularProgress size={16} color="inherit" /> : <AddRounded />}
              sx={{ bgcolor: "#1a73e8", "&:hover": { bgcolor: "#1765cc" }, textTransform: "none", fontWeight: 700, boxShadow: "none", borderRadius: 2, px: 2.5 }}
            >
              {isUploading ? "Saving asset…" : assetKind === "TEXT" ? "Save text asset" : "Add to library"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Asset details dialog */}
      <Dialog
        open={Boolean(selectedAsset)}
        onClose={() => setSelectedAsset(null)}
        fullWidth
        maxWidth="lg"
        scroll="paper"
        PaperProps={{ sx: { borderRadius: 3, maxHeight: "90vh" } }}
      >
        {selectedAsset && (
          <>
            <DialogTitle sx={{ pb: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                <div className="min-w-0">
                  <Typography variant="h6" noWrap sx={{ color: "#202124", fontWeight: 700 }}>{selectedAsset.name}</Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Chip size="small" label={getKindLabel(selectedAsset.kind)} />
                    <Chip size="small" label={getSourceLabel(selectedAsset)} color="primary" variant="outlined" />
                  </Stack>
                </div>
                <IconButton onClick={() => setSelectedAsset(null)} aria-label="Close asset details"><CloseRounded /></IconButton>
              </Stack>
            </DialogTitle>
            <Divider />
            <DialogContent sx={{ p: { xs: 2, md: 3 } }}>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
                <div className="space-y-4">
                  <Paper variant="outlined" sx={{ overflow: "hidden", borderColor: "#dadce0", borderRadius: 2.5 }}>
                    <Box sx={{ height: { xs: 220, md: 300 }, bgcolor: "#f1f3f4" }}>
                      <AssetMedia asset={selectedAsset} getAccessToken={getAccessToken} />
                    </Box>
                  </Paper>
                  <Paper variant="outlined" sx={{ borderColor: "#e8eaed", borderRadius: 2.5, p: 2 }}>
                    <Typography variant="subtitle2" sx={{ color: "#202124", fontWeight: 700, mb: 1.5 }}>Asset information</Typography>
                    <Stack spacing={1.25}>
                      {[
                        { label: "Source", value: getSourceLabel(selectedAsset) },
                        { label: "Type", value: getKindLabel(selectedAsset.kind) },
                        { label: "File name", value: selectedAsset.originalFileName },
                        { label: "Format", value: selectedAsset.mimeType },
                        { label: "File size", value: formatBytes(selectedAsset.sizeBytes) },
                        { label: "Dimensions", value: selectedAsset.width && selectedAsset.height ? `${selectedAsset.width} × ${selectedAsset.height}px` : null },
                        { label: "Aspect ratio", value: selectedAsset.aspectRatio },
                        { label: "Added", value: formatDate(selectedAsset.createdAt) },
                      ].filter((item) => item.value !== null && item.value !== undefined && item.value !== "—").map((item) => (
                        <div key={item.label} className="flex min-w-0 items-start justify-between gap-3">
                          <Typography variant="caption" sx={{ color: "#5f6368", flexShrink: 0 }}>{item.label}</Typography>
                          <Typography variant="caption" sx={{ color: "#202124", fontWeight: 600, textAlign: "right", overflowWrap: "anywhere" }}>{item.value}</Typography>
                        </div>
                      ))}
                    </Stack>
                  </Paper>
                </div>

                <div className="min-w-0 space-y-5">
                  {selectedAsset.textContent && (
                    <ContentSection title="Text content">
                      <Paper variant="outlined" sx={{ p: 2, bgcolor: "#fafbfc", borderColor: "#e8eaed", borderRadius: 2 }}>
                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", color: "#3c4043", lineHeight: 1.7 }}>{selectedAsset.textContent}</Typography>
                      </Paper>
                    </ContentSection>
                  )}

                  {selectedAsset.googlePack && (
                    <ContentSection title="Google creative pack">
                      <div className="mb-4 grid grid-cols-2 gap-3">
                        <Paper variant="outlined" sx={{ p: 1.5, borderColor: "#e8eaed", borderRadius: 2 }}>
                          <Typography variant="caption" color="text.secondary">Campaign type</Typography>
                          <Typography variant="body2" fontWeight={700}>{selectedAsset.googlePack.campaignType}</Typography>
                        </Paper>
                        <Paper variant="outlined" sx={{ p: 1.5, borderColor: "#e8eaed", borderRadius: 2 }}>
                          <Typography variant="caption" color="text.secondary">Format</Typography>
                          <Typography variant="body2" fontWeight={700}>{selectedAsset.googlePack.formatLabel}</Typography>
                        </Paper>
                      </div>
                      <div className="space-y-4">
                        <ContentSection title="Headlines"><TextValues values={selectedAsset.googlePack.headlines} /></ContentSection>
                        <ContentSection title="Long headlines"><TextValues values={selectedAsset.googlePack.longHeadlines} /></ContentSection>
                        <ContentSection title="Descriptions"><TextValues values={selectedAsset.googlePack.descriptions} /></ContentSection>
                        <ContentSection title="Final URL"><Typography variant="body2" sx={{ overflowWrap: "anywhere", color: "#1967d2" }}>{selectedAsset.googlePack.finalUrl}</Typography></ContentSection>
                      </div>
                    </ContentSection>
                  )}

                  {selectedAsset.providerCreative && (
                    <ContentSection title="Advertising creative content">
                      <CreativeDetails creative={selectedAsset.providerCreative} />
                    </ContentSection>
                  )}

                  {selectedAsset.providerExtension && (
                    <ContentSection title="Extension details">
                      <ExtensionDetails extension={selectedAsset.providerExtension} />
                    </ContentSection>
                  )}

                  {selectedAsset.providerAsset && (
                    <ContentSection title="Provider information">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {[
                          { label: "Provider", value: getSourceLabel(selectedAsset) },
                          { label: "Account", value: selectedAsset.providerAsset.accountName || selectedAsset.providerAsset.accountId },
                          { label: "Asset ID", value: selectedAsset.providerAsset.assetId },
                          { label: "Asset type", value: selectedAsset.providerAsset.assetType },
                          { label: "Resource name", value: selectedAsset.providerAsset.resourceName },
                          { label: "Media URL", value: selectedAsset.providerAsset.mediaUrl },
                          { label: "Thumbnail URL", value: selectedAsset.providerAsset.thumbnailUrl },
                          { label: "Creative ID", value: selectedAsset.providerAsset.creativeId },
                          { label: "Ad ID", value: selectedAsset.providerAsset.adId },
                          { label: "Campaign ID", value: selectedAsset.providerAsset.campaignId },
                          { label: "Ad Group ID", value: selectedAsset.providerAsset.adGroupId },
                          { label: "Ad Set ID", value: selectedAsset.providerAsset.adSetId },
                          { label: "Image hash", value: selectedAsset.providerAsset.imageHash },
                          { label: "Video ID", value: selectedAsset.providerAsset.videoId },
                          { label: "Last synchronized", value: formatDate(selectedAsset.providerAsset.syncedAt) },
                        ].filter((item) => item.value !== null && item.value !== undefined).map((item) => (
                          <Paper key={item.label} variant="outlined" sx={{ minWidth: 0, p: 1.25, borderColor: "#e8eaed", borderRadius: 1.75 }}>
                            <Typography variant="overline" sx={{ color: "#80868b", fontSize: 9, lineHeight: 1.5 }}>{item.label}</Typography>
                            <Typography variant="caption" sx={{ display: "block", color: "#3c4043", overflowWrap: "anywhere" }}>{item.value}</Typography>
                          </Paper>
                        ))}
                      </div>
                    </ContentSection>
                  )}

                  {!selectedAsset.textContent && !selectedAsset.googlePack && !selectedAsset.providerCreative && !selectedAsset.providerExtension && !selectedAsset.providerAsset && (
                    <Alert severity="info">No additional creative or provider metadata was returned for this asset.</Alert>
                  )}
                </div>
              </div>
            </DialogContent>
            <Divider />
            <DialogActions sx={{ px: 3, py: 2 }}>
              <Button variant="outlined" startIcon={<EditOutlined />} onClick={() => beginRename(selectedAsset)} sx={{ textTransform: "none", borderColor: "#dadce0", color: "#3c4043" }}>Rename</Button>
              <Button color="error" variant="outlined" startIcon={<DeleteOutlineRounded />} onClick={() => void handleDelete(selectedAsset)} sx={{ textTransform: "none" }}>Remove from library</Button>
              <Button variant="contained" onClick={() => setSelectedAsset(null)} sx={{ textTransform: "none", bgcolor: "#1a73e8", boxShadow: "none" }}>Done</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Rename asset dialog */}
      <Dialog
        open={Boolean(editingAsset)}
        onClose={() => !savingEdit && setEditingAsset(null)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <form onSubmit={handleRename}>
          <DialogTitle sx={{ color: "#202124", fontWeight: 700 }}>Rename asset</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
              Change the name displayed in your AdSyntra Asset Library.
            </DialogContentText>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Asset name"
              value={editingName}
              onChange={(event) => setEditingName(event.target.value)}
              inputProps={{ maxLength: 150 }}
              required
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button type="button" onClick={() => setEditingAsset(null)} disabled={savingEdit} sx={{ textTransform: "none", color: "#5f6368" }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={savingEdit || !editingName.trim()} startIcon={savingEdit ? <CircularProgress size={15} color="inherit" /> : <EditOutlined />} sx={{ textTransform: "none", bgcolor: "#1a73e8", boxShadow: "none" }}>
              {savingEdit ? "Saving…" : "Save changes"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => !isDeleting && setDeleteTarget(null)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ color: "#202124", fontWeight: 700 }}>Remove asset from library?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteTarget ? `“${deleteTarget.name}” will be removed from your AdSyntra Asset Library.` : "This asset will be removed from your library."}
            {" "}This action does not delete the original asset from Google Ads or Meta Ads.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={isDeleting} sx={{ textTransform: "none", color: "#5f6368" }}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => void confirmDelete()} disabled={isDeleting} startIcon={isDeleting ? <CircularProgress size={15} color="inherit" /> : <DeleteOutlineRounded />} sx={{ textTransform: "none", boxShadow: "none" }}>
            {isDeleting ? "Removing…" : "Remove asset"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
