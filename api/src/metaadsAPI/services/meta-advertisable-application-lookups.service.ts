import { getProviderAccessToken } from "../../utils/provider-token.utils.js";

const META_GRAPH_API_VERSION =
  process.env.META_ADS_API_VERSION || "v27.0";

const PAGE_SIZE = 100;

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

interface MetaAdvertisableApplication {
  id: string;
  name?: string;
  advertisable_app_events?: string[];
}

export interface MetaAdvertisableApplicationOption {
  id: string;
  name: string;
  advertisableAppEvents: string[];
}

export class MetaAdvertisableApplicationLookupError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.name = "MetaAdvertisableApplicationLookupError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function getMetaErrorStatus(
  httpStatus: number,
  error?: MetaGraphError,
): number {
  if (error?.code === 190) return 401;
  if ([10, 200].includes(error?.code ?? -1)) return 403;
  if (error?.code === 100) return 400;
  if (error?.code === 80004) return 429;

  return httpStatus >= 400 && httpStatus < 500
    ? httpStatus
    : 502;
}

export async function listMetaAdvertisableApplications(
  userId: string,
  rawAdAccountId: string,
  after?: string,
) {
  const adAccountId = rawAdAccountId
    .trim()
    .replace(/^act_/i, "");

  if (!/^\d+$/.test(adAccountId)) {
    throw new MetaAdvertisableApplicationLookupError(
      "A valid Meta Ad Account ID is required.",
      400,
    );
  }

  let accessToken: string;

  try {
    accessToken = await getProviderAccessToken(userId, "metaAds");
  } catch (error) {
    throw new MetaAdvertisableApplicationLookupError(
      error instanceof Error
        ? error.message
        : "Unable to retrieve the Meta Ads access token.",
      401,
    );
  }

  const url = new URL(
    `https://graph.facebook.com/${META_GRAPH_API_VERSION}/act_${adAccountId}/advertisable_applications`,
  );

  url.searchParams.set(
    "fields",
    "id,name,advertisable_app_events",
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
    throw new MetaAdvertisableApplicationLookupError(
      "Unable to connect to the Meta Graph API.",
      502,
    );
  }

  const payload =
    (await response.json().catch(() => null)) as
      | MetaGraphResponse<MetaAdvertisableApplication>
      | null;

  if (!response.ok || payload?.error) {
    const graphError = payload?.error;

    throw new MetaAdvertisableApplicationLookupError(
      graphError?.message ||
        "Unable to retrieve advertisable Meta applications.",
      getMetaErrorStatus(response.status, graphError),
      graphError
        ? {
            type: graphError.type ?? null,
            code: graphError.code ?? null,
            subcode: graphError.error_subcode ?? null,
            fbtraceId: graphError.fbtrace_id ?? null,
          }
        : undefined,
    );
  }

  const applications = (payload?.data ?? [])
    .filter(
      (app) =>
        typeof app.id === "string" &&
        /^\d+$/.test(app.id),
    )
    .map((app) => ({
      id: app.id,
      name: app.name?.trim() || `Meta App ${app.id}`,
      advertisableAppEvents: Array.isArray(
        app.advertisable_app_events,
      )
        ? [
            ...new Set(
              app.advertisable_app_events.filter(
                (event): event is string =>
                  typeof event === "string" && Boolean(event.trim()),
              ),
            ),
          ]
        : [],
    }));

  const hasNextPage = Boolean(payload?.paging?.next);

  return {
    adAccountId,
    count: applications.length,
    applications,
    pagination: {
      limit: PAGE_SIZE,
      hasNextPage,
      nextCursor: hasNextPage
        ? payload?.paging?.cursors?.after ?? null
        : null,
    },
  };
}