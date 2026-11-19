
import {
  getGoogleAdsCreationContext,
} from "./campaign-creation.js";

import type {
  GoogleAdsCreationContext,
} from "../../interfaces/campaign-creation.js";

import type {
  AssetKind,
  ProviderCreativeContent,
  ProviderCreativeMediaReference,
  ProviderExtensionContent,
} from "../../models/asset.model.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */
export const EXTENSION_ASSET_TYPES = [
  "CALL",
  "CALLOUT",
  "SITELINK",
  "STRUCTURED_SNIPPET",
  "PROMOTION",
  "PRICE",
  "LEAD_FORM",
  "MOBILE_APP",
  "HOTEL_CALLOUT",
  "HOTEL_PROPERTY",
  "LOCATION",
  "AFFILIATE_LOCATION",
  "BUSINESS_MESSAGE",
  "BOOK_ON_GOOGLE",
  "APP_DEEP_LINK",
  "PAGE_FEED",
];

const CREATIVE_ASSET_TYPES = [
  "DEMAND_GEN_CAROUSEL_CARD",
  "MEDIA_BUNDLE",
  "YOUTUBE_VIDEO_LIST",
];

export type GoogleAdsAssetFilter =
  | "ALL"
  | "IMAGE"
  | "VIDEO"
  | "TEXT"
  | "CTA"
  | "EXTENSION"
  | "CREATIVE";

export interface GoogleAdsProviderAsset {
  provider: "googleAds";
  accountId: string;

  assetId: string;
  resourceName: string;

  /** Native Google Ads asset type or ad type. */
  assetType: string;

  name: string;
  kind: AssetKind;

  mimeType: string | null;

  mediaUrl: string | null;
  thumbnailUrl: string | null;

  imageHash: null;
  videoId: string | null;

  width: number | null;
  height: number | null;
  aspectRatio: string | null;

  sizeBytes: number | null;

  /** Populated for reusable Google TEXT assets. */
  textContent: string | null;

  /** Populated for complete Google ad creatives and CTA assets. */
  providerCreative: ProviderCreativeContent | null;

  /** Populated for Google extension assets. */
  providerExtension: ProviderExtensionContent | null;

  /** Relationship metadata for ad-level creatives. */
  creativeId: string | null;
  adId: string | null;
  campaignId: string | null;
  adGroupId: string | null;

  source: string | null;
}

export interface ListGoogleAdsAssetsInput {
  kind?: GoogleAdsAssetFilter;
  limit?: number;
  pageToken?: string;
}

export interface ListGoogleAdsAssetsResult {
  provider: "googleAds";
  accountId: string;
  assets: GoogleAdsProviderAsset[];
  nextPageToken: string | null;
}

/* -------------------------------------------------------------------------- */
/* Google Ads Asset API response types                                        */
/* -------------------------------------------------------------------------- */

interface GoogleAdsPriceOffering {
  header?: string;
  description?: string;
  finalUrl?: string;
  unit?: string;
  price?: {
    amountMicros?: string | number;
    currencyCode?: string;
  };
}

interface GoogleAdsAssetRecord {
  resourceName?: string;
  id?: string | number;
  name?: string;
  type?: string;
  source?: string;
  finalUrls?: string[];

  imageAsset?: {
    mimeType?: string;
    fileSize?: string | number;
    fullSize?: {
      url?: string;
      widthPixels?: string | number;
      heightPixels?: string | number;
    };
  };

  youtubeVideoAsset?: {
    youtubeVideoId?: string;
    youtubeVideoTitle?: string;
  };

  textAsset?: {
    text?: string;
  };

  callToActionAsset?: {
    callToAction?: string;
  };

  calloutAsset?: {
    calloutText?: string;
  };

  sitelinkAsset?: {
    linkText?: string;
    description1?: string;
    description2?: string;
  };

  structuredSnippetAsset?: {
    header?: string;
    values?: string[];
  };

  promotionAsset?: {
    promotionTarget?: string;
    promotionCode?: string;
    percentOff?: string | number;
    moneyAmountOff?: {
      amountMicros?: string | number;
      currencyCode?: string;
    };
    occasion?: string;
    redemptionStartDate?: string;
    redemptionEndDate?: string;
    termsAndConditionsText?: string;
  };

  priceAsset?: {
    type?: string;
    priceQualifier?: string;
    priceOfferings?: GoogleAdsPriceOffering[];
  };

  callAsset?: {
    phoneNumber?: string;
    countryCode?: string;
  };

  leadFormAsset?: {
    businessName?: string;
    callToActionDescription?: string;
    callToActionType?: string;
    description?: string;
    headline?: string;
    privacyPolicyUrl?: string;
  };

  hotelCalloutAsset?: {
    text?: string;
    languageCode?: string;
  };

  hotelPropertyAsset?: {
    hotelName?: string;
    hotelAddress?: unknown;
    placeId?: string;
  };

  demandGenCarouselCardAsset?: {
    headline?: string;
    callToActionText?: string;
    marketingImageAsset?: string;
    portraitMarketingImageAsset?: string;
    squareMarketingImageAsset?: string;
  };
}

interface GoogleAdsAssetSearchRow {
  asset?: GoogleAdsAssetRecord;
}

interface GoogleAdsSearchResponse {
  results?: GoogleAdsAssetSearchRow[];
  nextPageToken?: string;
  fieldMask?: string;
}

/* -------------------------------------------------------------------------- */
/* Google Ads Ad response types                                               */
/* -------------------------------------------------------------------------- */

interface GoogleAdsAdTextAsset {
  text?: string;
}

interface GoogleAdsResponsiveSearchAd {
  headlines?: GoogleAdsAdTextAsset[];
  descriptions?: GoogleAdsAdTextAsset[];
  path1?: string;
  path2?: string;
}

interface GoogleAdsResponsiveDisplayAd {
  headlines?: GoogleAdsAdTextAsset[];
  longHeadline?: GoogleAdsAdTextAsset;
  descriptions?: GoogleAdsAdTextAsset[];

  businessName?: string;
  callToActionText?: string;
  promoText?: string;
}

interface GoogleAdsAdRecord {
  id?: string | number;
  name?: string;
  type?: string;
  finalUrls?: string[];

  responsiveSearchAd?: GoogleAdsResponsiveSearchAd;
  responsiveDisplayAd?: GoogleAdsResponsiveDisplayAd;
}

interface GoogleAdsAdGroupAdRecord {
  resourceName?: string;
  status?: string;
  ad?: GoogleAdsAdRecord;
}

interface GoogleAdsAdGroupRecord {
  id?: string | number;
  name?: string;
}

interface GoogleAdsCampaignRecord {
  id?: string | number;
  name?: string;
}

interface GoogleAdsAdSearchRow {
  adGroupAd?: GoogleAdsAdGroupAdRecord;
  adGroup?: GoogleAdsAdGroupRecord;
  campaign?: GoogleAdsCampaignRecord;
}

interface GoogleAdsAdSearchResponse {
  results?: GoogleAdsAdSearchRow[];
  nextPageToken?: string;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

interface GoogleAdsErrorResponse {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: unknown[];
  };
}

export class GoogleAdsAssetServiceError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    details?: unknown,
  ) {
    super(message);
    this.name = "GoogleAdsAssetServiceError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */


/* -------------------------------------------------------------------------- */
/* General helpers                                                            */
/* -------------------------------------------------------------------------- */

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return value.trim() || null;
}

function parseNumber(value: unknown): number | null {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : null;
}

function normalizeHttpsUrl(value: unknown): string | null {
  const raw = normalizeString(value);

  if (!raw) {
    return null;
  }

  try {
    const parsed = new URL(raw);

    return parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values
        .map((value) => normalizeString(value))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function normalizeGoogleMimeType(
  value: string | undefined,
): string | null {
  switch (value) {
    case "IMAGE_JPEG":
      return "image/jpeg";

    case "IMAGE_PNG":
      return "image/png";

    case "IMAGE_GIF":
      return "image/gif";

    default:
      return null;
  }
}

function calculateAspectRatio(
  width: number | null,
  height: number | null,
): string | null {
  if (!width || !height) {
    return null;
  }

  const ratio = width / height;

  const knownRatios = [
    { ratio: 1, label: "1:1" },
    { ratio: 4 / 5, label: "4:5" },
    { ratio: 9 / 16, label: "9:16" },
    { ratio: 16 / 9, label: "16:9" },
    { ratio: 1.91, label: "1.91:1" },
  ];

  const matched = knownRatios.find(
    (item) => Math.abs(item.ratio - ratio) <= 0.015,
  );

  return (
    matched?.label ??
    (ratio >= 1
      ? `${ratio.toFixed(2)}:1`
      : `1:${(1 / ratio).toFixed(2)}`)
  );
}

function normalizeAdTextList(
  values: GoogleAdsAdTextAsset[] | undefined,
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return uniqueStrings(values.map((item) => item?.text));
}

function normalizeLongHeadline(
  value: GoogleAdsAdTextAsset | undefined,
): string[] {
  const text = normalizeString(value?.text);
  return text ? [text] : [];
}

/* -------------------------------------------------------------------------- */
/* Filter helpers                                                             */
/* -------------------------------------------------------------------------- */

function getAssetTypesForFilter(
  kind: GoogleAdsAssetFilter,
): string[] | null {
  switch (kind) {
    case "ALL":
      return null;

    case "IMAGE":
      return ["IMAGE"];

    case "VIDEO":
      return ["YOUTUBE_VIDEO"];

    case "TEXT":
      return ["TEXT"];

    case "CTA":
      return ["CALL_TO_ACTION"];

    case "EXTENSION":
      return EXTENSION_ASSET_TYPES;

    case "CREATIVE":
      return CREATIVE_ASSET_TYPES;

    default:
      throw new GoogleAdsAssetServiceError(
        "Unsupported Google Ads asset filter.",
        400,
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Asset type mapping                                                         */
/* -------------------------------------------------------------------------- */

function mapGoogleAssetKind(
  assetType: string,
): AssetKind {
  switch (assetType) {
    case "IMAGE":
      return "IMAGE";

    case "YOUTUBE_VIDEO":
      return "VIDEO";

    case "TEXT":
      return "TEXT";

    case "CALL_TO_ACTION":
      return "CTA";

    case "DEMAND_GEN_CAROUSEL_CARD":
    case "MEDIA_BUNDLE":
    case "YOUTUBE_VIDEO_LIST":
      return "CREATIVE";

    default:
      return "EXTENSION";
  }
}

/* -------------------------------------------------------------------------- */
/* Google Ads asset query                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Retrieves standalone and reusable Google Ads assets.
 *
 * Includes:
 * - Images
 * - YouTube videos
 * - Text assets
 * - Call-to-action assets
 * - Callout assets
 * - Sitelinks
 * - Structured snippets
 * - Promotions
 * - Prices
 * - Calls
 * - Lead forms
 * - Hotel-related assets
 * - Demand Gen carousel cards
 * - Other supported Google Ads asset types
 */
function buildAssetQuery(
  kind: GoogleAdsAssetFilter,
  afterId: string | null,
  limit: number,
): string {
  const selectedTypes = getAssetTypesForFilter(kind);

  const conditions = [
    `asset.id > ${afterId ?? "0"}`,
  ];

  if (selectedTypes) {
    conditions.push(
      `asset.type IN (${selectedTypes
        .map((type) => `'${type}'`)
        .join(", ")})`,
    );
  }

  const fields = [
    "asset.id",
    "asset.resource_name",
    "asset.name",
    "asset.type",
    "asset.source",
    "asset.final_urls",

    "asset.image_asset.mime_type",
    "asset.image_asset.file_size",
    "asset.image_asset.full_size.url",
    "asset.image_asset.full_size.width_pixels",
    "asset.image_asset.full_size.height_pixels",

    "asset.youtube_video_asset.youtube_video_id",
    "asset.youtube_video_asset.youtube_video_title",

    "asset.text_asset.text",
    "asset.call_to_action_asset.call_to_action",
    "asset.callout_asset.callout_text",

    "asset.sitelink_asset.link_text",
    "asset.sitelink_asset.description1",
    "asset.sitelink_asset.description2",

    "asset.structured_snippet_asset.header",
    "asset.structured_snippet_asset.values",

    "asset.promotion_asset.promotion_target",
    "asset.promotion_asset.promotion_code",
    "asset.promotion_asset.percent_off",
    "asset.promotion_asset.money_amount_off.amount_micros",
    "asset.promotion_asset.money_amount_off.currency_code",
    "asset.promotion_asset.occasion",
    "asset.promotion_asset.redemption_start_date",
    "asset.promotion_asset.redemption_end_date",
    "asset.promotion_asset.terms_and_conditions_text",

    "asset.price_asset.type",
    "asset.price_asset.price_qualifier",
    "asset.price_asset.price_offerings",

    "asset.call_asset.phone_number",
    "asset.call_asset.country_code",

    "asset.lead_form_asset.business_name",
    "asset.lead_form_asset.call_to_action_description",
    "asset.lead_form_asset.call_to_action_type",
    "asset.lead_form_asset.description",
    "asset.lead_form_asset.headline",
    "asset.lead_form_asset.privacy_policy_url",

    "asset.hotel_callout_asset.text",
    "asset.hotel_callout_asset.language_code",

    "asset.hotel_property_asset.hotel_name",
    "asset.hotel_property_asset.hotel_address",
    "asset.hotel_property_asset.place_id",

    "asset.demand_gen_carousel_card_asset.headline",
    "asset.demand_gen_carousel_card_asset.call_to_action_text",
    "asset.demand_gen_carousel_card_asset.marketing_image_asset",
    "asset.demand_gen_carousel_card_asset.portrait_marketing_image_asset",
    "asset.demand_gen_carousel_card_asset.square_marketing_image_asset",
  ];

  return `
        SELECT
            ${fields.join(", ")}
        FROM asset
        WHERE ${conditions.join(" AND ")}
        ORDER BY asset.id ASC
        LIMIT ${limit}
    `.trim().replace(/\s+/g, " ");
}

/* -------------------------------------------------------------------------- */
/* Google Ads ad creative query                                               */
/* -------------------------------------------------------------------------- */

/**
 * Retrieves complete ad-level creative content.
 *
 * Responsive search ad headlines and descriptions are stored under
 * ad_group_ad.ad.responsive_search_ad, not as ordinary image/video assets.
 *
 * Responsive display ad content is also retrieved.
 */
function buildAdCreativeQuery(
  afterId: string | null,
  limit: number,
): string {
  return `
        SELECT
            ad_group_ad.resource_name,
            ad_group_ad.status,

            ad_group_ad.ad.id,
            ad_group_ad.ad.name,
            ad_group_ad.ad.type,
            ad_group_ad.ad.final_urls,

            ad_group_ad.ad.responsive_search_ad.headlines,
            ad_group_ad.ad.responsive_search_ad.descriptions,
            ad_group_ad.ad.responsive_search_ad.path1,
            ad_group_ad.ad.responsive_search_ad.path2,

            ad_group_ad.ad.responsive_display_ad.headlines,
            ad_group_ad.ad.responsive_display_ad.long_headline,
            ad_group_ad.ad.responsive_display_ad.descriptions,
            ad_group_ad.ad.responsive_display_ad.business_name,
            ad_group_ad.ad.responsive_display_ad.call_to_action_text,
            ad_group_ad.ad.responsive_display_ad.promo_text,

            campaign.id,
            campaign.name,

            ad_group.id,
            ad_group.name

        FROM ad_group_ad

        WHERE
            ad_group_ad.status != 'REMOVED'
            AND ad_group_ad.ad.type IN (
                'RESPONSIVE_SEARCH_AD',
                'RESPONSIVE_DISPLAY_AD'
            )
            AND ad_group_ad.ad.id > ${afterId ?? "0"}

        ORDER BY ad_group_ad.ad.id ASC
        LIMIT ${limit}
    `.trim().replace(/\s+/g, " ");
}

/* -------------------------------------------------------------------------- */
/* Google Ads API request                                                     */
/* -------------------------------------------------------------------------- */

async function searchGoogleAds<T>(
  context: GoogleAdsCreationContext,
  query: string,
): Promise<T> {
  const url =
    `https://googleads.googleapis.com/` +
    `${context.apiVersion}/customers/` +
    `${context.customerId}/googleAds:search`;

  const body = {
    query,
  };

  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        "Content-Type": "application/json",
        "developer-token": context.developerToken,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new GoogleAdsAssetServiceError(
      error instanceof Error
        ? `Unable to connect to Google Ads: ${error.message}`
        : "Unable to connect to Google Ads.",
      502,
    );
  }

  const responseText = await response.text();

  let responseData:
    | T
    | GoogleAdsErrorResponse;

  try {
    responseData = responseText
      ? JSON.parse(responseText)
      : ({} as T);
  } catch {
    throw new GoogleAdsAssetServiceError(
      "Google Ads returned an invalid JSON response.",
      502,
      {
        responseText: responseText.slice(0, 1000),
        requestId: response.headers.get("request-id"),
      },
    );
  }

  if (!response.ok) {
    const errorResponse =
      (responseData as GoogleAdsErrorResponse).error;

    const details = {
      googleError: errorResponse ?? responseData,
      requestId: response.headers.get("request-id"),
      query,
    };

    console.error(
      "Google Ads GAQL request failed:",
      JSON.stringify(details, null, 2),
    );

    throw new GoogleAdsAssetServiceError(
      errorResponse?.message ??
      `Google Ads request failed with status ${response.status}.`,
      response.status >= 400 && response.status < 600
        ? response.status
        : 502,
      details,
    );
  }

  return responseData as T;
}

/* -------------------------------------------------------------------------- */
/* Provider extension mapping                                                 */
/* -------------------------------------------------------------------------- */

function getPromotionDiscount(
  promotion: GoogleAdsAssetRecord["promotionAsset"],
): {
  discountType: string | null;
  discountValue: string | null;
} {
  if (promotion?.percentOff !== undefined) {
    return {
      discountType: "PERCENT",
      discountValue: String(promotion.percentOff),
    };
  }

  const moneyAmount = promotion?.moneyAmountOff;

  if (moneyAmount) {
    const micros = Number(moneyAmount.amountMicros);

    return {
      discountType: "AMOUNT",
      discountValue: Number.isFinite(micros)
        ? `${(micros / 1_000_000).toFixed(2)} ${moneyAmount.currencyCode ?? ""
          }`.trim()
        : null,
    };
  }

  return {
    discountType: null,
    discountValue: null,
  };
}

function formatPriceOffering(
  offering: GoogleAdsPriceOffering,
): string | null {
  const parts: string[] = [];

  const header = normalizeString(offering.header);
  const description = normalizeString(offering.description);
  const finalUrl = normalizeString(offering.finalUrl);

  const amountMicros = Number(offering.price?.amountMicros);
  const currencyCode = normalizeString(
    offering.price?.currencyCode,
  );

  if (header) parts.push(header);
  if (description) parts.push(description);

  if (Number.isFinite(amountMicros)) {
    parts.push(
      `${(amountMicros / 1_000_000).toFixed(2)} ${currencyCode ?? ""
        }`.trim(),
    );
  }

  if (normalizeString(offering.unit)) {
    parts.push(normalizeString(offering.unit)!);
  }

  if (finalUrl) parts.push(finalUrl);

  return parts.length ? parts.join(" · ") : null;
}

function mapGoogleExtension(
  asset: GoogleAdsAssetRecord,
): ProviderExtensionContent {
  const type = asset.type ?? "UNKNOWN";

  const promotion = asset.promotionAsset;
  const price = asset.priceAsset;
  const leadForm = asset.leadFormAsset;
  const sitelink = asset.sitelinkAsset;
  const callout = asset.calloutAsset;
  const snippet = asset.structuredSnippetAsset;
  const call = asset.callAsset;
  const hotelCallout = asset.hotelCalloutAsset;
  const hotelProperty = asset.hotelPropertyAsset;

  const discount = getPromotionDiscount(promotion);

  const priceOfferings = price?.priceOfferings ?? [];
  const firstPrice = priceOfferings[0];

  const priceMicros = Number(
    firstPrice?.price?.amountMicros,
  );

  const priceAmount = Number.isFinite(priceMicros)
    ? (priceMicros / 1_000_000).toFixed(2)
    : null;

  const structuredValues = snippet?.values ?? [];

  const values = [
    ...structuredValues,
    ...priceOfferings
      .map(formatPriceOffering)
      .filter((value): value is string => Boolean(value)),
  ];

  const fieldNames: string[] = [
    type,
  ];

  if (leadForm?.callToActionType) {
    fieldNames.push(
      `CALL_TO_ACTION_TYPE:${leadForm.callToActionType}`,
    );
  }

  if (promotion?.occasion) {
    fieldNames.push(
      `PROMOTION_OCCASION:${promotion.occasion}`,
    );
  }

  if (hotelProperty?.placeId) {
    fieldNames.push(
      `PLACE_ID:${hotelProperty.placeId}`,
    );
  }

  const text =
    normalizeString(callout?.calloutText) ??
    normalizeString(hotelCallout?.text) ??
    normalizeString(promotion?.promotionTarget);

  const firstFinalUrl = asset.finalUrls?.[0] ?? null;

  return {
    extensionType: type,

    text,

    linkText:
      normalizeString(sitelink?.linkText),

    description1:
      normalizeString(sitelink?.description1),

    description2:
      normalizeString(sitelink?.description2),

    header:
      normalizeString(snippet?.header) ??
      normalizeString(price?.type),

    values,

    phoneNumber:
      normalizeString(call?.phoneNumber),

    promotionTarget:
      normalizeString(promotion?.promotionTarget),

    promotionCode:
      normalizeString(promotion?.promotionCode),

    discountType: discount.discountType,
    discountValue: discount.discountValue,

    occasion:
      normalizeString(promotion?.occasion),

    currencyCode:
      normalizeString(
        promotion?.moneyAmountOff?.currencyCode,
      ) ??
      normalizeString(firstPrice?.price?.currencyCode),

    priceAmount,

    priceQualifier:
      normalizeString(price?.priceQualifier),

    businessName:
      normalizeString(leadForm?.businessName),

    headline:
      normalizeString(leadForm?.headline),

    description:
      normalizeString(leadForm?.description),

    privacyPolicyUrl:
      normalizeString(leadForm?.privacyPolicyUrl),

    finalUrl:
      normalizeString(firstFinalUrl),

    fieldNames,
  };
}

/* -------------------------------------------------------------------------- */
/* Carousel card mapping                                                      */
/* -------------------------------------------------------------------------- */

function mapGoogleCarouselCard(
  asset: GoogleAdsAssetRecord,
): ProviderCreativeContent {
  const card = asset.demandGenCarouselCardAsset;

  const media: ProviderCreativeMediaReference[] = [];

  const imageResource =
    normalizeString(card?.marketingImageAsset) ??
    normalizeString(card?.squareMarketingImageAsset) ??
    normalizeString(card?.portraitMarketingImageAsset);

  if (imageResource) {
    media.push({
      kind: "IMAGE",
      assetId: imageResource,
      imageHash: null,
      videoId: null,
      mediaUrl: null,
      thumbnailUrl: null,
    });
  }

  return {
    creativeType: "DEMAND_GEN_CAROUSEL_CARD",

    primaryTexts: [],

    headlines: uniqueStrings([
      card?.headline,
    ]),

    longHeadlines: [],
    descriptions: [],

    callToAction:
      normalizeString(card?.callToActionText),

    callToActionType: null,

    linkDescription: null,
    displayUrl: null,

    finalUrls: uniqueStrings(asset.finalUrls ?? []),

    carouselCards: [
      {
        cardId: normalizeString(asset.id?.toString()),
        headline: normalizeString(card?.headline),
        description: null,
        linkUrl: normalizeString(asset.finalUrls?.[0]),
        callToAction: normalizeString(card?.callToActionText),
        callToActionType: null,
        imageUrl: null,
        videoId: null,
        thumbnailUrl: null,
      },
    ],

    media,

    relatedAssetIds: imageResource
      ? [imageResource]
      : [],
  };
}

/* -------------------------------------------------------------------------- */
/* Map a Google Ads Asset resource                                            */
/* -------------------------------------------------------------------------- */

function mapGoogleAdsAsset(
  asset: GoogleAdsAssetRecord,
  accountId: string,
): GoogleAdsProviderAsset | null {
  const resourceName = normalizeString(asset.resourceName);

  const assetId =
    normalizeString(asset.id?.toString()) ??
    resourceName?.split("/").at(-1) ??
    null;

  const assetType = normalizeString(asset.type);

  if (!assetId || !resourceName || !assetType) {
    return null;
  }

  const kind = mapGoogleAssetKind(assetType);

  let mediaUrl: string | null = null;
  let thumbnailUrl: string | null = null;
  let videoId: string | null = null;

  let mimeType: string | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let sizeBytes: number | null = null;

  let textContent: string | null = null;

  let providerCreative: ProviderCreativeContent | null = null;
  let providerExtension: ProviderExtensionContent | null = null;

  if (assetType === "IMAGE") {
    mediaUrl = normalizeHttpsUrl(
      asset.imageAsset?.fullSize?.url,
    );

    thumbnailUrl = mediaUrl;

    mimeType = normalizeGoogleMimeType(
      asset.imageAsset?.mimeType,
    );

    width = parseNumber(
      asset.imageAsset?.fullSize?.widthPixels,
    );

    height = parseNumber(
      asset.imageAsset?.fullSize?.heightPixels,
    );

    sizeBytes = parseNumber(
      asset.imageAsset?.fileSize,
    );
  }

  if (assetType === "YOUTUBE_VIDEO") {
    videoId = normalizeString(
      asset.youtubeVideoAsset?.youtubeVideoId,
    );

    mimeType = "video/youtube";

    // Google Ads supplies the YouTube ID, not an MP4 download URL.
    mediaUrl = null;
    thumbnailUrl = null;
  }

  if (assetType === "TEXT") {
    textContent = normalizeString(
      asset.textAsset?.text,
    );
  }

  if (assetType === "CALL_TO_ACTION") {
    const callToAction = normalizeString(
      asset.callToActionAsset?.callToAction,
    );

    providerCreative = {
      creativeType: "CALL_TO_ACTION",
      primaryTexts: [],
      headlines: [],
      longHeadlines: [],
      descriptions: [],
      callToAction,
      callToActionType: callToAction,
      linkDescription: null,
      displayUrl: null,
      finalUrls: uniqueStrings(asset.finalUrls ?? []),
      carouselCards: [],
      media: [],
      relatedAssetIds: [],
    };
  }

  if (assetType === "DEMAND_GEN_CAROUSEL_CARD") {
    providerCreative = mapGoogleCarouselCard(asset);
  }

  if (kind === "EXTENSION") {
    providerExtension = mapGoogleExtension(asset);
  }

  return {
    provider: "googleAds",
    accountId,

    assetId,
    resourceName,
    assetType,

    name:
      normalizeString(asset.name) ??
      normalizeString(asset.textAsset?.text) ??
      normalizeString(asset.sitelinkAsset?.linkText) ??
      normalizeString(asset.calloutAsset?.calloutText) ??
      normalizeString(asset.demandGenCarouselCardAsset?.headline) ??
      `Google Ads ${assetType} ${assetId}`,

    kind,
    mimeType,

    mediaUrl,
    thumbnailUrl,

    imageHash: null,
    videoId,

    width,
    height,
    aspectRatio: calculateAspectRatio(width, height),

    sizeBytes,

    textContent,

    providerCreative,
    providerExtension,

    creativeId: null,
    adId: null,
    campaignId: null,
    adGroupId: null,

    source: normalizeString(asset.source),
  };
}

/* -------------------------------------------------------------------------- */
/* Map Google Ads AdTextAsset values                                          */
/* -------------------------------------------------------------------------- */

function mapGoogleAdsAd(
  row: GoogleAdsAdSearchRow,
  accountId: string,
): GoogleAdsProviderAsset | null {
  const adGroupAd = row.adGroupAd;
  const ad = adGroupAd?.ad;

  const resourceName = normalizeString(
    adGroupAd?.resourceName,
  );

  const adId = normalizeString(ad?.id?.toString());

  if (!resourceName || !adId || !ad?.type) {
    return null;
  }

  const adGroupId = normalizeString(
    row.adGroup?.id?.toString(),
  );

  const campaignId = normalizeString(
    row.campaign?.id?.toString(),
  );

  const resourceTail =
    resourceName.split("/").at(-1) ?? adId;

  const responsiveSearch = ad.responsiveSearchAd;
  const responsiveDisplay = ad.responsiveDisplayAd;

  const headlines = normalizeAdTextList(
    responsiveSearch?.headlines ??
    responsiveDisplay?.headlines,
  );

  const descriptions = normalizeAdTextList(
    responsiveSearch?.descriptions ??
    responsiveDisplay?.descriptions,
  );

  const longHeadlines = normalizeLongHeadline(
    responsiveDisplay?.longHeadline,
  );

  const callToAction = normalizeString(
    responsiveDisplay?.callToActionText,
  );

  const promoText = normalizeString(
    responsiveDisplay?.promoText,
  );

  const path1 = normalizeString(responsiveSearch?.path1);
  const path2 = normalizeString(responsiveSearch?.path2);

  const displayUrl = [path1, path2]
    .filter(Boolean)
    .join("/");

  const creative: ProviderCreativeContent = {
    creativeType: ad.type,

    primaryTexts: [],

    headlines,
    longHeadlines,
    descriptions,

    callToAction,
    callToActionType: null,

    linkDescription: promoText,

    displayUrl: displayUrl || null,

    finalUrls: uniqueStrings(ad.finalUrls ?? []),

    carouselCards: [],

    media: [],

    relatedAssetIds: [],
  };

  return {
    provider: "googleAds",
    accountId,

    // The ad group ID is included to keep the library identifier
    // unique even if the same ad ID appears in a different context.
    assetId: `ad-${resourceTail}`,

    resourceName,

    assetType: `AD_${ad.type}`,

    name:
      normalizeString(ad.name) ??
      `${ad.type.replace(/_/g, " ")} ${adId}`,

    kind: "CREATIVE",

    mimeType: null,

    mediaUrl: null,
    thumbnailUrl: null,

    imageHash: null,
    videoId: null,

    width: null,
    height: null,
    aspectRatio: null,

    sizeBytes: null,

    textContent: null,

    providerCreative: creative,
    providerExtension: null,

    creativeId: adId,
    adId,
    campaignId,
    adGroupId,

    source: "GOOGLE_AD",
  };
}

/* -------------------------------------------------------------------------- */
/* Composite pagination token                                                 */
/* -------------------------------------------------------------------------- */

interface GoogleAdsPageState {
  version: 2;
  kind: GoogleAdsAssetFilter;

  assetsAfterId: string | null;
  adsAfterId: string | null;

  assetsDone: boolean;
  adsDone: boolean;
}

/**
 * One API page may contain results from both the Asset and Ad resources.
 * Keep their page tokens together so loading more does not repeat
 * the already completed resource query.
 */
function createInitialPageState(
  kind: GoogleAdsAssetFilter,
  includeAds: boolean,
): GoogleAdsPageState {
  return {
    version: 2,
    kind,
    assetsAfterId: null,
    adsAfterId: null,
    assetsDone: false,
    adsDone: !includeAds,
  };
}

function encodePageState(
  state: GoogleAdsPageState,
): string | null {
  if (state.assetsDone && state.adsDone) {
    return null;
  }

  return Buffer.from(
    JSON.stringify(state),
    "utf8",
  ).toString("base64url");
}

function decodePageState(
  pageToken: string | undefined,
  kind: GoogleAdsAssetFilter,
  includeAds: boolean,
): GoogleAdsPageState {
  if (!pageToken) {
    return createInitialPageState(kind, includeAds);
  }

  if (pageToken.length > 10000) {
    throw new GoogleAdsAssetServiceError(
      "Google Ads pagination token is too long.",
      400,
    );
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(pageToken, "base64url").toString("utf8"),
    ) as Partial<GoogleAdsPageState>;

    const validId = (
      value: unknown,
    ): value is string | null =>
      value === null ||
      (
        typeof value === "string" &&
        /^\d+$/.test(value)
      );

    if (
      parsed.version !== 2 ||
      parsed.kind !== kind ||
      !validId(parsed.assetsAfterId) ||
      !validId(parsed.adsAfterId) ||
      typeof parsed.assetsDone !== "boolean" ||
      typeof parsed.adsDone !== "boolean"
    ) {
      throw new Error("Invalid pagination state.");
    }

    return {
      version: 2,
      kind,
      assetsAfterId: parsed.assetsAfterId ?? null,
      adsAfterId: parsed.adsAfterId ?? null,
      assetsDone: parsed.assetsDone,
      adsDone: !includeAds || parsed.adsDone,
    };
  } catch {
    throw new GoogleAdsAssetServiceError(
      "Invalid or outdated Google Ads pagination token. Restart the Google Ads sync.",
      400,
    );
  }
}

function getGoogleAdsNumericId(
  value: unknown,
  fieldName: string,
): string {
  const normalized =
    typeof value === "string" || typeof value === "number"
      ? String(value).trim()
      : "";

  if (!/^\d+$/.test(normalized)) {
    throw new GoogleAdsAssetServiceError(
      `Google Ads returned an invalid ${fieldName}.`,
      502,
    );
  }

  return normalized;
}

/* -------------------------------------------------------------------------- */
/* Main service                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Retrieve Google Ads assets and creative records from the selected account.
 *
 * Uses the existing OAuth and refresh-token behavior through
 * getGoogleAdsCreationContext().
 *
 * This service does not download or copy provider media.
 *
 * Supported asset records:
 * - Images
 * - YouTube videos
 * - Reusable text assets
 * - Call-to-action assets
 * - Call, callout and sitelink extensions
 * - Structured snippets
 * - Promotions and prices
 * - Lead forms
 * - Hotel-related extensions
 * - Demand Gen carousel card assets
 *
 * Supported complete ad creatives:
 * - Responsive Search Ads
 * - Responsive Display Ads
 *
 * Account ownership and selected-account validation must be performed
 * by the authenticated API route before calling this service.
 */
export async function listGoogleAdsAssets(
  userId: string,
  accountId: string,
  input: ListGoogleAdsAssetsInput = {},
): Promise<ListGoogleAdsAssetsResult> {
  if (!userId?.trim()) {
    throw new GoogleAdsAssetServiceError(
      "Authenticated user ID is required.",
      401,
    );
  }

  if (!accountId?.trim()) {
    throw new GoogleAdsAssetServiceError(
      "Google Ads customer ID is required.",
      400,
    );
  }

  const kind = input.kind ?? "ALL";

  const supportedFilters: GoogleAdsAssetFilter[] = [
    "ALL",
    "IMAGE",
    "VIDEO",
    "TEXT",
    "CTA",
    "EXTENSION",
    "CREATIVE",
  ];

  if (!supportedFilters.includes(kind)) {
    throw new GoogleAdsAssetServiceError(
      "Invalid Google Ads asset filter.",
      400,
    );
  }

  const limit = input.limit ?? 50;

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new GoogleAdsAssetServiceError(
      "Google Ads asset limit must be between 1 and 100.",
      400,
    );
  }

  const pageToken = input.pageToken?.trim();

  if (pageToken && pageToken.length > 10000) {
    throw new GoogleAdsAssetServiceError(
      "Google Ads page token is invalid or too long.",
      400,
    );
  }

  const context = await getGoogleAdsCreationContext(
    userId,
    accountId,
  );

  // Ad-level creatives also contain reusable text and CTA information.
  const includeAds = [
    "ALL",
    "CREATIVE",
    "TEXT",
    "CTA",
  ].includes(kind);

  const pageState = decodePageState(
    pageToken,
    kind,
    includeAds,
  );

  const assetQuery = buildAssetQuery(
    kind,
    pageState.assetsAfterId,
    limit,
  );

  const adQuery = includeAds
    ? buildAdCreativeQuery(
      pageState.adsAfterId,
      limit,
    )
    : null;

  const [
    assetPage,
    adPage,
  ] = await Promise.all([
    pageState.assetsDone
      ? Promise.resolve<GoogleAdsSearchResponse>({
        results: [],
      })
      : searchGoogleAds<GoogleAdsSearchResponse>(
        context,
        assetQuery,
      ),

    !includeAds || pageState.adsDone || !adQuery
      ? Promise.resolve<GoogleAdsAdSearchResponse>({
        results: [],
      })
      : searchGoogleAds<GoogleAdsAdSearchResponse>(
        context,
        adQuery,
      ),
  ]);

  const assetRows = (assetPage.results ?? [])
    .filter(
      (row): row is any =>
        Boolean(row.asset),
    );

  const assetRecords = assetRows.map(
    (row) => row.asset!,
  );

  const mappedAssets = assetRecords
    .map((asset) =>
      mapGoogleAdsAsset(
        asset,
        context.customerId,
      ),
    )
    .filter(
      (asset): asset is GoogleAdsProviderAsset =>
        asset !== null,
    );

  const adRows = adPage.results ?? [];

  const mappedAdAssets = adRows
    .map((row) =>
      mapGoogleAdsAd(
        row,
        context.customerId,
      ),
    )
    .filter(
      (asset): asset is GoogleAdsProviderAsset =>
        asset !== null,
    );

  // Preserve ad-level creative records for the TEXT and CTA filters
  // without creating separate duplicate provider records.
  const filteredAdAssets = mappedAdAssets.filter(
    (asset) => {
      const creative = asset.providerCreative;

      if (!creative) {
        return false;
      }

      if (kind === "TEXT") {
        return (
          creative.headlines.length > 0 ||
          creative.longHeadlines.length > 0 ||
          creative.descriptions.length > 0
        );
      }

      if (kind === "CTA") {
        return Boolean(creative.callToAction);
      }

      return true;
    },
  );

  const assets = [
    ...mappedAssets,
    ...filteredAdAssets,
  ];

  // Use the last ID returned in each query as the next cursor.
  const assetsDone =
    pageState.assetsDone ||
    assetRecords.length < limit;

  const adsDone =
    pageState.adsDone ||
    !includeAds ||
    adRows.length < limit;

  let assetsAfterId = pageState.assetsAfterId;
  let adsAfterId = pageState.adsAfterId;

  if (!assetsDone && assetRecords.length > 0) {
    assetsAfterId = getGoogleAdsNumericId(
      assetRecords[assetRecords.length - 1]!.id,
      "asset ID",
    );
  }

  if (!adsDone && adRows.length > 0) {
    adsAfterId = getGoogleAdsNumericId(
      adRows[adRows.length - 1]?.adGroupAd?.ad?.id,
      "ad ID",
    );
  }

  const nextPageToken = encodePageState({
    version: 2,
    kind,
    assetsAfterId,
    adsAfterId,
    assetsDone,
    adsDone,
  });

  return {
    provider: "googleAds",
    accountId: context.customerId,
    assets,
    nextPageToken,
  };
}
