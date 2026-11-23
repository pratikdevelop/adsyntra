import {
  getAccessiblePageAccessToken,
  MetaInstantFormLookupError,
} from "./meta-instant-form-lookups.service.js";

const META_GRAPH_API_VERSION =
  process.env.META_ADS_API_VERSION || "v27.0";

interface MetaGraphError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

interface MetaGraphNode<T> {
  error?: MetaGraphError;
  [key: string]: unknown;
}

interface MetaPageIdentity {
  id: string;
  name?: string;
  instagram_business_account?: {
    id: string;
    username?: string;
  } | null;
}

interface MetaPageWhatsAppMetadata {
  id: string;
  whatsapp_number?: string | null;
  has_whatsapp_number?: boolean;
  has_whatsapp_business_number?: boolean;
}

export type MetaMessagingDestinationType =
  | "MESSENGER"
  | "INSTAGRAM_DIRECT"
  | "WHATSAPP";

export interface MetaMessagingDestinationOption {
  type: MetaMessagingDestinationType;
  id: string;
  pageId: string;
  name: string;
  isAvailable: boolean;
  unavailableReason: string | null;
  whatsappNumber?: string | null;
}

export class MetaMessagingDestinationLookupError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    details?: unknown,
  ) {
    super(message);
    this.name = "MetaMessagingDestinationLookupError";
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

  return httpStatus >= 400 && httpStatus < 500
    ? httpStatus
    : 502;
}

async function graphGetNode<T>(
  url: URL,
  accessToken: string,
  fallbackMessage: string,
): Promise<T> {
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
    throw new MetaMessagingDestinationLookupError(
      "Unable to connect to the Meta Graph API.",
      502,
    );
  }

  const payload =
    (await response.json().catch(() => null)) as
      | (T & { error?: MetaGraphError })
      | null;

  if (!response.ok || payload?.error) {
    const graphError = payload?.error;

    throw new MetaMessagingDestinationLookupError(
      graphError?.message || fallbackMessage,
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

  return payload as T;
}

export async function listMetaMessagingDestinationsForPage(
  userId: string,
  rawPageId: string,
) {
  const pageId = rawPageId.trim();

  if (!/^\d+$/.test(pageId)) {
    throw new MetaMessagingDestinationLookupError(
      "A valid Facebook Page ID is required.",
      400,
    );
  }

  let pageAccessToken: string;

  try {
    pageAccessToken = await getAccessiblePageAccessToken(
      userId,
      pageId,
    );
  } catch (error) {
    throw new MetaMessagingDestinationLookupError(
      error instanceof Error
        ? error.message
        : "Unable to verify access to the selected Facebook Page.",
      error instanceof MetaInstantFormLookupError
        ? error.statusCode
        : 502,
      error instanceof MetaInstantFormLookupError
        ? error.details
        : undefined,
    );
  }

  const pageUrl = new URL(
    `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${pageId}`,
  );

  pageUrl.searchParams.set(
    "fields",
    "id,name,instagram_business_account{id,username}",
  );

  const page = await graphGetNode<MetaPageIdentity>(
    pageUrl,
    pageAccessToken,
    "Unable to retrieve the selected Facebook Page identity.",
  );

  if (String(page.id) !== pageId) {
    throw new MetaMessagingDestinationLookupError(
      "Meta returned a different Facebook Page than the selected Page.",
      502,
    );
  }

  const destinations: MetaMessagingDestinationOption[] = [];

  // Messenger uses the selected Facebook Page identity.
  destinations.push({
    type: "MESSENGER",
    id: page.id,
    pageId: page.id,
    name: page.name?.trim() || `Facebook Page ${page.id}`,
    isAvailable: true,
    unavailableReason: null,
  });

  // Instagram Direct requires a linked Instagram professional account.
  const instagram = page.instagram_business_account;

  destinations.push({
    type: "INSTAGRAM_DIRECT",
    id: instagram?.id ? String(instagram.id) : "",
    pageId: page.id,
    name: instagram?.username
      ? `@${instagram.username}`
      : "Instagram professional account",
    isAvailable: Boolean(instagram?.id),
    unavailableReason: instagram?.id
      ? null
      : "No linked Instagram professional account was returned for this Facebook Page.",
  });

  // WhatsApp metadata is queried separately because Page metadata access
  // may not be enabled for every connected Meta identity.
  const whatsappUrl = new URL(
    `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${pageId}`,
  );

  whatsappUrl.searchParams.set(
    "fields",
    "id,whatsapp_number,has_whatsapp_number,has_whatsapp_business_number",
  );

  let whatsapp: MetaPageWhatsAppMetadata | null = null;
  let whatsappLookupFailed = false;

  try {
    whatsapp = await graphGetNode<MetaPageWhatsAppMetadata>(
      whatsappUrl,
      pageAccessToken,
      "Unable to retrieve WhatsApp Business information for this Page.",
    );
  } catch {
    // Keep Messenger and Instagram available even when WhatsApp metadata
    // cannot be read due to a missing permission or unavailable Page field.
    whatsappLookupFailed = true;
  }

  const whatsappNumber =
    typeof whatsapp?.whatsapp_number === "string"
      ? whatsapp.whatsapp_number.trim()
      : "";

  const isWhatsAppBusinessNumber =
    whatsapp?.has_whatsapp_business_number === true;

  destinations.push({
    type: "WHATSAPP",
    id: whatsappNumber,
    pageId: page.id,
    name: whatsappNumber
      ? `WhatsApp ${whatsappNumber}`
      : "WhatsApp Business number",
    isAvailable:
      Boolean(whatsappNumber) && isWhatsAppBusinessNumber,
    unavailableReason: whatsappLookupFailed
      ? "Meta did not allow this connected identity to read the Page's WhatsApp metadata."
      : !whatsappNumber
        ? "No WhatsApp number was returned for this Facebook Page."
        : !isWhatsAppBusinessNumber
          ? "The linked number was not confirmed as a WhatsApp Business number."
          : null,
    whatsappNumber: whatsappNumber || null,
  });

  return {
    pageId: page.id,
    pageName: page.name ?? null,
    count: destinations.filter((item) => item.isAvailable).length,
    destinations,
  };
}