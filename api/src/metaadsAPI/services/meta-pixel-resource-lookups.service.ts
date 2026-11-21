import { getProviderAccessToken } from "../../utils/provider-token.utils.js";

const META_GRAPH_API_VERSION =
  process.env.META_ADS_API_VERSION?.trim() || "v27.0";

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

export interface MetaPixelResource {
  id: string;
  name?: string;
  last_fired_time?: string | null;
  creation_time?: string;
  is_unavailable?: boolean;
}

interface MetaPixelStatsEntry {
  value?: string;
  count?: number | string;
}

interface MetaPixelStatsBucket {
  start_time?: string;
  data?: MetaPixelStatsEntry[];
}

export class MetaPixelLookupError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502,
    public readonly metaError?: MetaGraphError,
  ) {
    super(message);
    this.name = "MetaPixelLookupError";
  }
}

const META_STANDARD_CONVERSION_EVENTS = [
  { eventName: "Purchase", customEventType: "PURCHASE" },
  { eventName: "Lead", customEventType: "LEAD" },
  { eventName: "CompleteRegistration", customEventType: "COMPLETE_REGISTRATION" },
  { eventName: "AddToCart", customEventType: "ADD_TO_CART" },
  { eventName: "AddToWishlist", customEventType: "ADD_TO_WISHLIST" },
  { eventName: "InitiateCheckout", customEventType: "INITIATED_CHECKOUT" },
  { eventName: "AddPaymentInfo", customEventType: "ADD_PAYMENT_INFO" },
  { eventName: "ViewContent", customEventType: "CONTENT_VIEW" },
  { eventName: "Search", customEventType: "SEARCH" },
  { eventName: "Contact", customEventType: "CONTACT" },
  { eventName: "CustomizeProduct", customEventType: "CUSTOMIZE_PRODUCT" },
  { eventName: "Donate", customEventType: "DONATE" },
  { eventName: "FindLocation", customEventType: "FIND_LOCATION" },
  { eventName: "Schedule", customEventType: "SCHEDULE" },
  { eventName: "StartTrial", customEventType: "START_TRIAL" },
  { eventName: "SubmitApplication", customEventType: "SUBMIT_APPLICATION" },
  { eventName: "Subscribe", customEventType: "SUBSCRIBE" },
  { eventName: "Other", customEventType: "OTHER" },
] as const;

function normalizeAdAccountId(rawId: string): string {
  const accountId = rawId.trim().replace(/^act_/i, "");

  if (!/^\d+$/.test(accountId)) {
    throw new MetaPixelLookupError(
      "The selected Meta Ad Account ID is invalid.",
      400,
    );
  }

  return `act_${accountId}`;
}

function normalizeEventName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]/g, "");
}

const STANDARD_EVENT_TYPE_BY_NAME = new Map(
  META_STANDARD_CONVERSION_EVENTS.map((event) => [
    normalizeEventName(event.eventName),
    event.customEventType,
  ]),
);

function getStandardEventType(eventName: string): string | null {
  return STANDARD_EVENT_TYPE_BY_NAME.get(
    normalizeEventName(eventName),
  ) ?? null;
}

async function metaGraphGet<T>(
  path: string,
  accessToken: string,
  params = new URLSearchParams(),
): Promise<MetaGraphResponse<T>> {
  const url = new URL(
    `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${path.replace(/^\/+/, "")}`,
  );

  url.search = params.toString();

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });

  const body = (await response.json().catch(() => null)) as
    | MetaGraphResponse<T>
    | null;

  if (!body || typeof body !== "object") {
    throw new MetaPixelLookupError(
      "Meta returned an invalid response while retrieving Pixel information.",
      502,
    );
  }

  if (!response.ok || body.error) {
    const statusCode =
      response.status >= 400 && response.status < 500
        ? response.status
        : 502;

    throw new MetaPixelLookupError(
      body.error?.message || "Meta Pixel lookup failed.",
      statusCode,
      body.error,
    );
  }

  return body;
}

/**
 * List Pixels/Datasets belonging to the selected Meta Ad Account.
 * The route must resolve the account from the authenticated user's DB record.
 */
export async function listMetaPixelsForAdAccount(
  userId: string,
  rawAdAccountId: string,
  after?: string,
) {
  const adAccountResourceName = normalizeAdAccountId(rawAdAccountId);
  const accessToken = await getProviderAccessToken(userId, "metaAds");

  const params = new URLSearchParams({
    fields: "id,name,last_fired_time,creation_time,is_unavailable",
    limit: "100",
  });

  if (after) {
    params.set("after", after);
  }

  const result = await metaGraphGet<MetaPixelResource>(
    `${adAccountResourceName}/adspixels`,
    accessToken,
    params,
  );

  const pixels = (result.data ?? [])
    .filter((pixel) => /^\d+$/.test(pixel.id))
    .map((pixel) => ({
      id: pixel.id,
      name: pixel.name ?? "Unnamed Pixel/Dataset",
      lastFiredTime: pixel.last_fired_time ?? null,
      creationTime: pixel.creation_time ?? null,
      isUnavailable: pixel.is_unavailable ?? false,
    }));

  const hasNextPage = Boolean(result.paging?.next);

  return {
    adAccountId: adAccountResourceName,
    pixels,
    pagination: {
      hasNextPage,
      nextCursor: hasNextPage
        ? result.paging?.cursors?.after ?? null
        : null,
    },
  };
}

/**
 * Retrieve event activity for a Pixel, ensuring that the Pixel is accessible
 * through the currently selected Ad Account before reading its statistics.
 */
export async function getMetaPixelEventOptions(
  userId: string,
  rawAdAccountId: string,
  pixelId: string,
  days = 7,
) {
  const adAccountResourceName = normalizeAdAccountId(rawAdAccountId);

  if (!/^\d+$/.test(pixelId)) {
    throw new MetaPixelLookupError(
      "The selected Meta Pixel ID is invalid.",
      400,
    );
  }

  if (!Number.isInteger(days) || days < 1 || days > 7) {
    throw new MetaPixelLookupError(
      "The Pixel event lookup period must be between 1 and 7 days.",
      400,
    );
  }

  const accessToken = await getProviderAccessToken(userId, "metaAds");

  // Verify that this Pixel is accessible from the selected Ad Account.
  const ownershipParams = new URLSearchParams({
    fields: "id",
    id_filter: pixelId,
    limit: "100",
  });

  const accountPixels = await metaGraphGet<{ id: string }>(
    `${adAccountResourceName}/adspixels`,
    accessToken,
    ownershipParams,
  );

  const belongsToSelectedAccount =
    accountPixels.data?.some((pixel) => pixel.id === pixelId) ?? false;

  if (!belongsToSelectedAccount) {
    throw new MetaPixelLookupError(
      "The selected Pixel is not available in your currently selected Meta Ad Account.",
      403,
    );
  }

  const endTime = Math.floor(Date.now() / 1000);
  const startTime = endTime - days * 24 * 60 * 60;

  const statsParams = new URLSearchParams({
    aggregation: "event",
    start_time: String(startTime),
    end_time: String(endTime),
  });

  const stats = await metaGraphGet<MetaPixelStatsBucket>(
    `${pixelId}/stats`,
    accessToken,
    statsParams,
  );

  const eventMap = new Map<
    string,
    {
      eventName: string;
      count: number;
      lastSeenAt: string | null;
    }
  >();

  for (const bucket of stats.data ?? []) {
    const bucketTime = bucket.start_time ?? null;

    for (const entry of bucket.data ?? []) {
      const eventName =
        typeof entry.value === "string" ? entry.value.trim() : "";

      if (!eventName) continue;

      const count = Number(entry.count ?? 0);
      const safeCount =
        Number.isFinite(count) && count > 0 ? count : 0;

      const existing = eventMap.get(eventName);

      if (!existing) {
        eventMap.set(eventName, {
          eventName,
          count: safeCount,
          lastSeenAt: bucketTime,
        });
        continue;
      }

      existing.count += safeCount;

      if (bucketTime) {
        const currentTime = existing.lastSeenAt
          ? Date.parse(existing.lastSeenAt)
          : Number.NaN;

        const incomingTime = Date.parse(bucketTime);

        if (
          !existing.lastSeenAt ||
          (Number.isFinite(incomingTime) &&
            (!Number.isFinite(currentTime) ||
              incomingTime > currentTime))
        ) {
          existing.lastSeenAt = bucketTime;
        }
      }
    }
  }

  const observedEvents = [...eventMap.values()]
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.eventName.localeCompare(right.eventName),
    )
    .map((event) => ({
      ...event,
      customEventType: getStandardEventType(event.eventName),
      isStandardConversionEvent:
        getStandardEventType(event.eventName) !== null,
    }));

  const observedByName = new Map(
    observedEvents.map((event) => [
      normalizeEventName(event.eventName),
      event,
    ]),
  );

  const eventOptions = META_STANDARD_CONVERSION_EVENTS.map((event) => {
    const observed = observedByName.get(
      normalizeEventName(event.eventName),
    );

    return {
      eventName: event.eventName,
      customEventType: event.customEventType,
      isObserved: Boolean(observed),
      eventCount: observed?.count ?? 0,
      lastSeenAt: observed?.lastSeenAt ?? null,
    };
  });

  return {
    pixelId,
    adAccountId: adAccountResourceName,
    days,
    eventOptions,
    observedEvents,
  };
}