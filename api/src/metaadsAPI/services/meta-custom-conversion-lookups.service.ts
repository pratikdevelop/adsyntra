import { getProviderAccessToken } from "../../utils/provider-token.utils.js";

const META_GRAPH_API_VERSION =
  process.env.META_ADS_API_VERSION || "v27.0";

const PAGE_SIZE = 100;

export class MetaCustomConversionLookupError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    details?: unknown,
  ) {
    super(message);
    this.name = "MetaCustomConversionLookupError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

interface MetaGraphError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

interface MetaGraphResponse<T> {
  data?: T[];
  paging?: {
    cursors?: {
      after?: string;
    };
    next?: string;
  };
  error?: MetaGraphError;
}

interface MetaCustomConversion {
  id: string;
  name?: string;
  account_id?: string;
  custom_event_type?: string;
  description?: string;
  creation_time?: string;
  first_fired_time?: string;
  last_fired_time?: string;
  event_source_type?: string;
  is_archived?: boolean;
  is_unavailable?: boolean;
  rule?: string;
  pixel?: unknown;
  data_sources?: unknown[];
}

export interface MetaCustomConversionOption {
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
}

function normalizeAdAccountId(rawId: string): string {
  return rawId.trim().replace(/^act_/i, "");
}

function isNumericId(value: string): boolean {
  return /^\d+$/.test(value);
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Meta can expose the conversion's source through its pixel or
 * data_sources fields. Extract IDs without assuming one response shape.
 */
function extractSourceIds(
  value: unknown,
  result = new Set<string>(),
  depth = 0,
): Set<string> {
  if (depth > 3 || value == null) {
    return result;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      extractSourceIds(item, result, depth + 1);
    }
    return result;
  }

  if (typeof value === "string") {
    if (isNumericId(value)) result.add(value);
    return result;
  }

  if (!isRecord(value)) {
    return result;
  }

  for (const key of [
    "id",
    "source_id",
    "pixel_id",
    "event_source_id",
  ]) {
    const candidate = value[key];

    if (
      typeof candidate === "string" &&
      isNumericId(candidate)
    ) {
      result.add(candidate);
    }
  }

  for (const key of [
    "pixel",
    "event_source",
    "data_source",
    "data_sources",
  ]) {
    if (value[key] !== undefined) {
      extractSourceIds(value[key], result, depth + 1);
    }
  }

  return result;
}

function normalizeConversion(
  raw: MetaCustomConversion,
  selectedPixelId: string,
): MetaCustomConversionOption | null {
  const sourceIds = new Set<string>();

  extractSourceIds(raw.pixel, sourceIds);
  extractSourceIds(raw.data_sources, sourceIds);

  const sourcePixelIds = [...sourceIds];

  // Do not show a conversion when its source cannot be linked to
  // the Pixel currently selected in the campaign form.
  if (!sourcePixelIds.includes(selectedPixelId)) {
    return null;
  }

  return {
    id: String(raw.id),
    name: raw.name?.trim() || `Custom Conversion ${raw.id}`,
    accountId: raw.account_id,
    customEventType: raw.custom_event_type,
    description: raw.description,
    creationTime: raw.creation_time,
    firstFiredTime: raw.first_fired_time,
    lastFiredTime: raw.last_fired_time,
    eventSourceType: raw.event_source_type,
    sourcePixelId: selectedPixelId,
    sourcePixelIds,
    isArchived: Boolean(raw.is_archived),
    isUnavailable: Boolean(raw.is_unavailable),
    rule: raw.rule,
  };
}

export async function listMetaCustomConversionsForPixel(
  userId: string,
  rawAdAccountId: string,
  rawPixelId: string,
  after?: string,
) {
  const adAccountId = normalizeAdAccountId(rawAdAccountId);
  const pixelId = rawPixelId.trim();

  if (!isNumericId(adAccountId)) {
    throw new MetaCustomConversionLookupError(
      "The selected Meta Ad Account ID is invalid.",
      400,
    );
  }

  if (!isNumericId(pixelId)) {
    throw new MetaCustomConversionLookupError(
      "A valid Pixel/Dataset ID is required.",
      400,
    );
  }

  let accessToken: string;

  try {
    accessToken = await getProviderAccessToken(
      userId,
      "metaAds",
    );
  } catch (error) {
    throw new MetaCustomConversionLookupError(
      error instanceof Error
        ? error.message
        : "Unable to retrieve the Meta Ads access token.",
      401,
    );
  }

  const url = new URL(
    `https://graph.facebook.com/${META_GRAPH_API_VERSION}/act_${adAccountId}/customconversions`,
  );

  url.searchParams.set(
    "fields",
    [
      "id",
      "name",
      "account_id",
      "custom_event_type",
      "description",
      "creation_time",
      "first_fired_time",
      "last_fired_time",
      "event_source_type",
      "is_archived",
      "is_unavailable",
      "pixel",
      "data_sources",
      "rule",
    ].join(","),
  );

  url.searchParams.set("limit", String(PAGE_SIZE));

  if (after) {
    url.searchParams.set("after", after);
  }

  let response: globalThis.Response;

  try {
    response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch {
    throw new MetaCustomConversionLookupError(
      "Unable to connect to the Meta Graph API.",
      502,
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | MetaGraphResponse<MetaCustomConversion>
    | null;

  if (!response.ok || payload?.error) {
    throw new MetaCustomConversionLookupError(
      payload?.error?.message ||
        "Meta could not return the Custom Conversions for this account.",
      502,
      {
        metaStatus: response.status,
        metaErrorCode: payload?.error?.code,
        metaErrorSubcode: payload?.error?.error_subcode,
        fbtraceId: payload?.error?.fbtrace_id,
      },
    );
  }

  const conversions = (payload?.data ?? [])
    .map((item) => normalizeConversion(item, pixelId))
    .filter(
      (item): item is MetaCustomConversionOption =>
        item !== null,
    );

  const hasNextPage = Boolean(payload?.paging?.next);

  return {
    adAccountId: `act_${adAccountId}`,
    pixelId,
    count: conversions.length,
    customConversions: conversions,
    pagination: {
      limit: PAGE_SIZE,
      hasNextPage,
      nextCursor: hasNextPage
        ? payload?.paging?.cursors?.after ?? null
        : null,
    },
  };
}