import { getProviderAccessToken } from "../../utils/provider-token.utils.js";

const META_GRAPH_API_VERSION =
  process.env.META_ADS_API_VERSION || "v27.0";

const PAGE_SIZE = 100;
const MAX_PAGE_ACCOUNT_PAGES = 25;

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

interface MetaPageAccount {
  id: string;
  access_token?: string;
  tasks?: string[];
}

interface MetaLeadForm {
  id: string;
  name?: string;
  status?: string;
  created_time?: string;
  locale?: string;
}

export interface MetaInstantFormOption {
  id: string;
  pageId: string;
  name: string;
  status: string | null;
  createdTime: string | null;
  locale: string | null;
  isArchived: boolean;
  isUnavailable: boolean;
}

export class MetaInstantFormLookupError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    details?: unknown,
  ) {
    super(message);
    this.name = "MetaInstantFormLookupError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function isNumericId(value: string): boolean {
  return /^\d+$/.test(value);
}

function getMetaErrorStatus(
  httpStatus: number,
  error?: MetaGraphError,
): number {
  if (error?.code === 190) return 401;
  if ([10, 200].includes(error?.code ?? -1)) return 403;
  if (error?.code === 100) return 400;

  return httpStatus >= 400 && httpStatus < 500
    ? httpStatus
    : 502;
}

async function graphGet<T>(
  url: URL,
  accessToken: string,
  fallbackMessage: string,
): Promise<MetaGraphResponse<T>> {
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
    throw new MetaInstantFormLookupError(
      "Unable to connect to the Meta Graph API.",
      502,
    );
  }

  const payload =
    (await response.json().catch(() => null)) as
      | MetaGraphResponse<T>
      | null;

  if (!response.ok || payload?.error) {
    const metaError = payload?.error;

    throw new MetaInstantFormLookupError(
      metaError?.message || fallbackMessage,
      getMetaErrorStatus(response.status, metaError),
      metaError
        ? {
            type: metaError.type ?? null,
            code: metaError.code ?? null,
            subcode: metaError.error_subcode ?? null,
            fbtraceId: metaError.fbtrace_id ?? null,
          }
        : undefined,
    );
  }

  return payload ?? {};
}

/**
 * Resolve the Page Access Token server-side.
 *
 * The caller must provide a Page ID, but that ID is not trusted.
 * We search the authenticated user's accessible Pages and only
 * return the token when that exact Page is found.
 */
async function getAccessiblePageAccessToken(
  userId: string,
  pageId: string,
): Promise<string> {
  let userAccessToken: string;

  try {
    userAccessToken = await getProviderAccessToken(
      userId,
      "metaAds",
    );
  } catch (error) {
    throw new MetaInstantFormLookupError(
      error instanceof Error
        ? error.message
        : "Unable to retrieve the Meta Ads access token.",
      401,
    );
  }

  let after: string | undefined;
  const seenCursors = new Set<string>();

  for (
    let pageNumber = 0;
    pageNumber < MAX_PAGE_ACCOUNT_PAGES;
    pageNumber += 1
  ) {
    const url = new URL(
      `https://graph.facebook.com/${META_GRAPH_API_VERSION}/me/accounts`,
    );

    url.searchParams.set(
      "fields",
      "id,access_token,tasks",
    );
    url.searchParams.set("limit", String(PAGE_SIZE));

    if (after) {
      url.searchParams.set("after", after);
    }

    const result = await graphGet<MetaPageAccount>(
      url,
      userAccessToken,
      "Unable to retrieve the Facebook Pages available to this Meta identity.",
    );

    const page = (result.data ?? []).find(
      (item) => String(item.id) === pageId,
    );

    if (page) {
      const tasks = Array.isArray(page.tasks)
        ? page.tasks.map((task) => task.toUpperCase())
        : [];

      if (tasks.length > 0 && !tasks.includes("ADVERTISE")) {
        throw new MetaInstantFormLookupError(
          "Your Meta identity does not have the ADVERTISE task for this Facebook Page.",
          403,
        );
      }

      if (
        typeof page.access_token !== "string" ||
        !page.access_token.trim()
      ) {
        throw new MetaInstantFormLookupError(
          "Meta did not return a Page Access Token. Check your Page permissions and Meta app configuration.",
          403,
        );
      }

      return page.access_token;
    }

    const nextCursor = result.paging?.cursors?.after;

    if (!result.paging?.next || !nextCursor) {
      break;
    }

    if (seenCursors.has(nextCursor)) {
      break;
    }

    seenCursors.add(nextCursor);
    after = nextCursor;
  }

  throw new MetaInstantFormLookupError(
    "The selected Facebook Page is not accessible to your connected Meta identity.",
    403,
  );
}

function normalizeInstantForm(
  form: MetaLeadForm,
  pageId: string,
): MetaInstantFormOption {
  const status = form.status?.trim().toUpperCase() || null;

  return {
    id: String(form.id),
    pageId,
    name: form.name?.trim() || `Instant Form ${form.id}`,
    status,
    createdTime: form.created_time ?? null,
    locale: form.locale ?? null,
    isArchived: status === "ARCHIVED",
    isUnavailable:
      status !== null &&
      status !== "ACTIVE" &&
      status !== "ARCHIVED",
  };
}

export async function listMetaInstantFormsForPage(
  userId: string,
  rawPageId: string,
  after?: string,
) {
  const pageId = rawPageId.trim();

  if (!isNumericId(pageId)) {
    throw new MetaInstantFormLookupError(
      "A valid Facebook Page ID is required.",
      400,
    );
  }

  const pageAccessToken =
    await getAccessiblePageAccessToken(userId, pageId);

  const url = new URL(
    `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${pageId}/leadgen_forms`,
  );

  url.searchParams.set(
    "fields",
    "id,name,status,created_time,locale",
  );
  url.searchParams.set("limit", String(PAGE_SIZE));

  if (after) {
    url.searchParams.set("after", after);
  }

  const result = await graphGet<MetaLeadForm>(
    url,
    pageAccessToken,
    "Unable to retrieve Instant Forms for this Facebook Page.",
  );

  const forms = (result.data ?? [])
    .filter(
      (form) =>
        typeof form.id === "string" &&
        isNumericId(String(form.id)),
    )
    .map((form) => normalizeInstantForm(form, pageId));

  const hasNextPage = Boolean(result.paging?.next);

  return {
    pageId,
    count: forms.length,
    forms,
    pagination: {
      limit: PAGE_SIZE,
      hasNextPage,
      nextCursor: hasNextPage
        ? result.paging?.cursors?.after ?? null
        : null,
    },
  };
}