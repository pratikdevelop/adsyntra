import { Router, type Request, type Response } from "express";

/**
 * Meta Conversions API (CAPI) test-event route.
 *
 * Expected project layout:
 *   project-root/
 *     .env
 *     routes/meta-conversions-api.routes.ts
 *     src/server.ts
 *
 * Environment variables:
 *   META_CAPI_ACCESS_TOKEN       Token generated for Conversions API in Events Manager
 *   META_CAPI_TEST_EVENT_CODE    Optional default test code from Events Manager > Test Events
 *   META_GRAPH_API_VERSION       Optional; defaults to v25.0 to match the current learning project
 *
 * Route:
 *   POST /meta/pixels/:pixelId/events/test
 *
 * This route deliberately requires a test_event_code. It is intended for learning and
 * test validation, not production event ingestion. Protect it with your application's
 * authentication/authorization middleware before exposing it beyond local development.
 */

const router = Router();

function getGraphApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION || "v25.0";
}
const MAX_EVENT_AGE_SECONDS = 7 * 24 * 60 * 60;
const MAX_FUTURE_SKEW_SECONDS = 5 * 60;
const MAX_EVENTS_PER_REQUEST = 1000;

const ACTION_SOURCES = new Set([
  "website",
  "app",
  "physical_store",
  "chat",
  "phone_call",
  "email",
  "system_generated",
  "other",
  "business_messaging",
]);

const HASHED_USER_DATA_FIELDS = new Set([
  "em",
  "ph",
  "ge",
  "db",
  "fn",
  "ln",
  "ct",
  "st",
  "zp",
  "country",
  "external_id",
]);

interface MetaGraphError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

interface MetaCapiResponse {
  events_received?: number;
  messages?: string[];
  fbtrace_id?: string;
  error?: MetaGraphError;
}

interface MetaServerEvent {
  event_name: string;
  event_time: number;
  event_id?: string;
  action_source: string;
  event_source_url?: string;
  user_data: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNumericId(value: string): boolean {
  return /^\d+$/.test(value);
}

function isSha256Hash(value: unknown): boolean {
  return typeof value === "string" && /^[a-fA-F0-9]{64}$/.test(value);
}

function validateUserData(userData: Record<string, unknown>): string | undefined {
  if (Object.keys(userData).length === 0) {
    return "Each event must include a non-empty user_data object.";
  }

  for (const field of HASHED_USER_DATA_FIELDS) {
    const fieldValue = userData[field];
    if (fieldValue === undefined || fieldValue === null) continue;

    const values = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
    if (values.some((value) => !isSha256Hash(value))) {
      return `user_data.${field} must contain SHA-256 hex hash value(s). Do not send raw personal information.`;
    }
  }

  return undefined;
}

function validateEvent(
  event: unknown,
  index: number,
): { valid: true; value: MetaServerEvent } | { valid: false; error: string } {
  if (!isRecord(event)) {
    return { valid: false, error: `data[${index}] must be an object.` };
  }

  if (!isNonEmptyString(event.event_name) || event.event_name.length > 100) {
    return {
      valid: false,
      error: `data[${index}].event_name is required and must be at most 100 characters.`,
    };
  }

  if (
    typeof event.event_time !== "number" ||
    !Number.isInteger(event.event_time) ||
    event.event_time <= 0
  ) {
    return {
      valid: false,
      error: `data[${index}].event_time must be a positive Unix timestamp in seconds.`,
    };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - event.event_time > MAX_EVENT_AGE_SECONDS) {
    return {
      valid: false,
      error: `data[${index}].event_time must be within the last 7 days.`,
    };
  }
  if (event.event_time > nowSeconds + MAX_FUTURE_SKEW_SECONDS) {
    return {
      valid: false,
      error: `data[${index}].event_time cannot be more than 5 minutes in the future.`,
    };
  }

  if (!isNonEmptyString(event.action_source) || !ACTION_SOURCES.has(event.action_source)) {
    return {
      valid: false,
      error: `data[${index}].action_source must be one of: ${[...ACTION_SOURCES].join(", ")}.`,
    };
  }

  if (event.action_source === "website") {
    if (!isNonEmptyString(event.event_source_url)) {
      return {
        valid: false,
        error: `data[${index}].event_source_url is required when action_source is "website".`,
      };
    }

    try {
      const sourceUrl = new URL(event.event_source_url);
      if (sourceUrl.protocol !== "https:" && sourceUrl.protocol !== "http:") {
        throw new Error("Unsupported protocol");
      }
    } catch {
      return {
        valid: false,
        error: `data[${index}].event_source_url must be a valid HTTP or HTTPS URL.`,
      };
    }
  }

  if (!isRecord(event.user_data)) {
    return {
      valid: false,
      error: `data[${index}].user_data must be an object.`,
    };
  }

  const userDataError = validateUserData(event.user_data);
  if (userDataError) {
    return { valid: false, error: `data[${index}]: ${userDataError}` };
  }

  if (event.event_id !== undefined && !isNonEmptyString(event.event_id)) {
    return {
      valid: false,
      error: `data[${index}].event_id must be a non-empty string when provided.`,
    };
  }

  if (event.custom_data !== undefined && !isRecord(event.custom_data)) {
    return {
      valid: false,
      error: `data[${index}].custom_data must be an object when provided.`,
    };
  }

  return {
    valid: true,
    value: {
      event_name: event.event_name.trim(),
      event_time: event.event_time,
      ...(typeof event.event_id === "string" ? { event_id: event.event_id.trim() } : {}),
      action_source: event.action_source,
      ...(typeof event.event_source_url === "string"
        ? { event_source_url: event.event_source_url }
        : {}),
      user_data: event.user_data,
      ...(isRecord(event.custom_data) ? { custom_data: event.custom_data } : {}),
    },
  };
}

function sendMetaError(res: Response, status: number, result: MetaCapiResponse) {
  return res.status(502).json({
    success: false,
    error: result.error?.message || "Meta rejected the Conversions API request.",
    metaHttpStatus: status,
    metaErrorType: result.error?.type,
    metaErrorCode: result.error?.code,
    metaErrorSubcode: result.error?.error_subcode,
    fbtraceId: result.error?.fbtrace_id,
  });
}

// -----------------------------------------------------------------------------
// Send test event(s) to the Conversions API.
// POST /meta/pixels/:pixelId/events/test
// -----------------------------------------------------------------------------
router.post(
  "pixels/:pixelId/events/test",
  async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");

    try {
      const pixelId = String(req.params.pixelId);
      if (!isNumericId(pixelId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid Pixel/Dataset ID. A numeric ID is required.",
        });
      }

      const capiAccessToken = process.env.META_CAPI_ACCESS_TOKEN;
      if (!capiAccessToken) {
        return res.status(503).json({
          success: false,
          error: "META_CAPI_ACCESS_TOKEN is not configured on the server.",
        });
      }

      const testEventCode = isNonEmptyString(req.body?.test_event_code)
        ? req.body.test_event_code.trim()
        : process.env.META_CAPI_TEST_EVENT_CODE?.trim();

      if (!testEventCode) {
        return res.status(400).json({
          success: false,
          error:
            "A test_event_code is required. Set META_CAPI_TEST_EVENT_CODE in .env or include test_event_code in the request body.",
        });
      }

      const incomingData: unknown = req.body?.data;
      if (!Array.isArray(incomingData) || incomingData.length < 1) {
        return res.status(400).json({
          success: false,
          error: "Request body must include a data array containing at least one event.",
        });
      }

      if (incomingData.length > MAX_EVENTS_PER_REQUEST) {
        return res.status(400).json({
          success: false,
          error: `A request can contain at most ${MAX_EVENTS_PER_REQUEST} events.`,
        });
      }

      const events: MetaServerEvent[] = [];
      for (let index = 0; index < incomingData.length; index += 1) {
        const validated = validateEvent(incomingData[index], index);
        if (!validated.valid) {
          return res.status(400).json({
            success: false,
            error: validated.error,
          });
        }
        events.push(validated.value);
      }

      const endpoint = new URL(
        `https://graph.facebook.com/${getGraphApiVersion()}/${pixelId}/events`,
      );
      // Meta's CAPI endpoint accepts its dedicated access token as an access_token parameter.
      // Never log this URL: it contains a credential.
      endpoint.searchParams.set("access_token", capiAccessToken);

      const metaResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          data: events,
          test_event_code: testEventCode,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const result = (await metaResponse.json()) as MetaCapiResponse;
      if (!metaResponse.ok || result.error) {
        return sendMetaError(res, metaResponse.status, result);
      }

      return res.status(200).json({
        success: true,
        pixelId,
        submittedEvents: events.length,
        eventsReceived: result.events_received ?? 0,
        messages: result.messages ?? [],
        fbtraceId: result.fbtrace_id,
        note: "This request used test_event_code. Verify the events in Events Manager > Test Events.",
      });
    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");

      if (isTimeout) {
        return res.status(504).json({
          success: false,
          error: "Meta Conversions API request timed out. Check Events Manager before retrying.",
        });
      }

      // Do not log the request URL or payload: the URL contains the CAPI access token.
      console.error(
        "Meta Conversions API test event failed; request details redacted.",
        error instanceof Error ? error.name : "Unknown error",
      );
      return res.status(500).json({
        success: false,
        error: "Internal server error while sending the CAPI test event.",
      });
    }
  },
);

export default router;
