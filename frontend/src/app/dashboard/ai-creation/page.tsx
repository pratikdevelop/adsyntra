"use client";

import { useEffect, useMemo, useState } from "react";
import { TextField } from "@mui/material";
import { useAuth } from "@clerk/nextjs";

/* -------------------------------------------------------------------------- */
/* Frontend contracts                                                         */
/* These intentionally live in this standalone page. The Campaign Builder    */
/* types are not imported until the later integration phase.                 */
/* -------------------------------------------------------------------------- */

type ProviderName = "googleAds" | "metaAds";
type CreativeAspectRatio = "1:1" | "4:5" | "9:16" | "16:9" | "1.91:1";
type GoogleCampaignType =
  | "SEARCH"
  | "PERFORMANCE_MAX"
  | "DISPLAY"
  | "DEMAND_GEN"
  | "APP"
  | "SHOPPING"
  | "HOTEL";
type GoogleDemandGenFormat =
  | "MULTI_ASSET"
  | "VIDEO_RESPONSIVE"
  | "CAROUSEL"
  | "PRODUCT_FEED";

type ConnectionState = {
  connected: boolean;
  selectedAccountId: string | null;
};

type ConnectionResponse = {
  message?: string;
  providers?: Partial<Record<ProviderName, Partial<ConnectionState>>>;
};

type GeneratedMedia = {
  type: "IMAGE" | "VIDEO";
  url: string;
  mimeType: string;
  width: number;
  height: number;
  aspectRatio: CreativeAspectRatio;
  provider: string;
  fileSizeBytes?: number;
  durationSeconds?: number;
  thumbnailUrl?: string;
  isPlaceholder?: boolean;
};

type GoogleCreativePack = {
  campaignType: GoogleCampaignType;
  subFormat?: GoogleDemandGenFormat;
  formatLabel: string;
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
  finalUrl: string;
  displayPath1?: string;
  displayPath2?: string;
  imageUrl?: string;
  imageAspectRatio?: CreativeAspectRatio;
  imageUrls?: string[];
  logoUrls?: string[];
  validationWarnings?: string[];
};

type MetaCreativePack = {
  format: "SINGLE_IMAGE" | "SINGLE_VIDEO" | "CAROUSEL";
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
  callToAction: string;
  callToActionType?: string;
  destinationUrl?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  carouselCards: Array<{
    id?: string;
    headline: string;
    description?: string;
    imageUrl?: string;
    videoUrl?: string;
    destinationUrl?: string;
  }>;
  validationWarnings?: string[];
};

type CreativeVariation = {
  id: string;
  generationId?: string;
  name: string;
  kind: "IMAGE" | "VIDEO";
  prompt: string;
  headline: string;
  primaryText: string;
  callToAction: string;
  aspectRatio: CreativeAspectRatio;
  googleAspectRatio: CreativeAspectRatio;
  url: string;
  googleMediaUrl: string;
  styleLabel: string;
  previewLabel: string;
  generatedAt: string;
  media?: GeneratedMedia | null;
  googlePack?: GoogleCreativePack;
  metaPack?: MetaCreativePack;
  provider: "groq" | "openai";
  imageProvider?: string;
  savedAssetId?: string;
  status?: "GENERATED" | "APPROVED" | "SAVED" | "FAILED";
};

type GenerateCreativeResponse = {
  success: boolean;
  generationId?: string;
  variations: CreativeVariation[];
  provider: "groq" | "openai";
  model: string;
  imageProvider: string;
  generatedAt: string;
  expiresAt: string | null;
  requestedCount?: number;
  generatedCount?: number;
  failedCount?: number;
  partialSuccess?: boolean;
  errors?: Array<{
    variationIndex?: number;
    message: string;
    provider?: string;
    code?: string;
  }>;
  message: string;
};

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000"
).replace(/\/+$/, "");

const ASPECT_RATIOS: CreativeAspectRatio[] = [
  "1:1",
  "4:5",
  "9:16",
  "16:9",
  "1.91:1",
];

const DEFAULT_CONNECTION: ConnectionState = {
  connected: false,
  selectedAccountId: null,
};

const INPUT_CLASS =
  "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-100";

const LABEL_CLASS = "text-sm font-semibold text-slate-700";

const MUI_FIELD_SX = {
  mt: 1,
  "& .MuiOutlinedInput-root": {
    borderRadius: "12px",
    backgroundColor: "#fff",
  },
  "& .MuiInputBase-input": { fontSize: "0.875rem" },
  "& .MuiInputLabel-root": { fontSize: "0.875rem" },
};

function normalizeConnection(
  provider?: Partial<ConnectionState>,
): ConnectionState {
  return {
    connected: Boolean(provider?.connected),
    selectedAccountId:
      typeof provider?.selectedAccountId === "string"
        ? provider.selectedAccountId
        : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getAspectClass(ratio: CreativeAspectRatio): string {
  switch (ratio) {
    case "9:16":
      return "aspect-[9/16]";
    case "4:5":
      return "aspect-[4/5]";
    case "16:9":
      return "aspect-video";
    case "1.91:1":
      return "aspect-[1.91/1]";
    case "1:1":
    default:
      return "aspect-square";
  }
}

function getRatioDimensions(media?: GeneratedMedia | null): string {
  if (!media) return "No media generated";
  return `${media.width} × ${media.height} · ${media.aspectRatio}`;
}

function formatCta(value: string): string {
  return value.replaceAll("_", " ");
}

function Page() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const [connections, setConnections] = useState<
    Record<ProviderName, ConnectionState>
  >({
    googleAds: DEFAULT_CONNECTION,
    metaAds: DEFAULT_CONNECTION,
  });
  const [selectedPlatforms, setSelectedPlatforms] = useState<ProviderName[]>(
    [],
  );
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [connectionError, setConnectionError] = useState("");

  const [creativePrompt, setCreativePrompt] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [productHint, setProductHint] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [creativeStyle, setCreativeStyle] = useState("Premium lifestyle");
  const [creativeAspectRatio, setCreativeAspectRatio] =
    useState<CreativeAspectRatio>("1:1");
  const [googleCreativeAspectRatio, setGoogleCreativeAspectRatio] =
    useState<CreativeAspectRatio>("1.91:1");
  const [googleCampaignType, setGoogleCampaignType] =
    useState<GoogleCampaignType>("SEARCH");
  const [googleDemandGenFormat, setGoogleDemandGenFormat] =
    useState<GoogleDemandGenFormat>("MULTI_ASSET");
  const [numberOfVariations, setNumberOfVariations] = useState<1 | 2 | 3>(2);
  const [textOnly, setTextOnly] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [generationNotice, setGenerationNotice] = useState("");
  const [generationMeta, setGenerationMeta] = useState<{
    generationId?: string;
    model?: string;
    imageProvider?: string;
    generatedAt?: string;
    requestedCount?: number;
    generatedCount?: number;
    failedCount?: number;
  } | null>(null);

  const [creativeVariations, setCreativeVariations] = useState<
    CreativeVariation[]
  >([]);
  const [selectedCreativeId, setSelectedCreativeId] = useState<string | null>(
    null,
  );

  const selectedVariation = useMemo(
    () =>
      creativeVariations.find((item) => item.id === selectedCreativeId) ?? null,
    [creativeVariations, selectedCreativeId],
  );

  /* ------------------------------------------------------------------------ */
  /* Load connected providers                                                 */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setLoadingConnections(false);
      setConnectionError("Please sign in to use AI Creative Studio.");
      setConnections({
        googleAds: DEFAULT_CONNECTION,
        metaAds: DEFAULT_CONNECTION,
      });
      setSelectedPlatforms([]);
      return;
    }

    let cancelled = false;

    const loadConnections = async () => {
      try {
        setLoadingConnections(true);
        setConnectionError("");

        const token = await getToken();
        console.log("getToken", token);
        if (!token) throw new Error("Unable to get authentication token.");

        const response = await fetch(`${API_BASE_URL}/api/connections/me`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        const data = (await response
          .json()
          .catch(() => null)) as ConnectionResponse | null;

        if (!response.ok) {
          throw new Error(
            data?.message || "Failed to load connected providers.",
          );
        }

        if (cancelled) return;

        const google = normalizeConnection(data?.providers?.googleAds);
        const meta = normalizeConnection(data?.providers?.metaAds);

        setConnections({ googleAds: google, metaAds: meta });

        const available: ProviderName[] = [];
        if (google.connected && google.selectedAccountId)
          available.push("googleAds");
        if (meta.connected && meta.selectedAccountId) available.push("metaAds");
        setSelectedPlatforms(available);
      } catch (error) {
        if (!cancelled) {
          setConnectionError(
            error instanceof Error
              ? error.message
              : "Unable to load provider connections.",
          );
        }
      } finally {
        if (!cancelled) setLoadingConnections(false);
      }
    };

    void loadConnections();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn]);

  /* ------------------------------------------------------------------------ */
  /* Provider selection                                                       */
  /* ------------------------------------------------------------------------ */

  const togglePlatform = (provider: ProviderName) => {
    if (
      !connections[provider].connected ||
      !connections[provider].selectedAccountId
    ) {
      return;
    }

    setSelectedPlatforms((current) =>
      current.includes(provider)
        ? current.filter((item) => item !== provider)
        : [...current, provider],
    );
  };

  /* ------------------------------------------------------------------------ */
  /* Generate creatives                                                       */
  /* ------------------------------------------------------------------------ */

  const generateCreativeVariations = async () => {
    const prompt = creativePrompt.trim();

    setGenerationError("");
    setGenerationNotice("");

    if (prompt.length < 8) {
      setGenerationError("Enter a creative brief with at least 8 characters.");
      return;
    }

    if (prompt.length > 2000) {
      setGenerationError("The creative brief must not exceed 2000 characters.");
      return;
    }

    if (!isLoaded || !isSignedIn) {
      setGenerationError("Please sign in before generating creatives.");
      return;
    }

    if (selectedPlatforms.length === 0) {
      setGenerationError(
        "Connect and select at least one advertising platform.",
      );
      return;
    }

    if (websiteUrl.trim() && !isValidHttpUrl(websiteUrl)) {
      setGenerationError("Enter a valid HTTP or HTTPS website URL.");
      return;
    }

    try {
      setIsGenerating(true);

      const token = await getToken();
      if (!token) throw new Error("Unable to get authentication token.");

      // Search, Shopping and Hotel do not need a Google display image.
      // Sending the primary ratio for these formats avoids generating an
      // unnecessary second image in the backend service.
      const googleNeedsVisual =
        selectedPlatforms.includes("googleAds") &&
        !["SEARCH", "SHOPPING", "HOTEL"].includes(googleCampaignType) &&
        !(
          googleCampaignType === "DEMAND_GEN" &&
          ["VIDEO_RESPONSIVE", "PRODUCT_FEED"].includes(googleDemandGenFormat)
        );

      const requestBody = {
        prompt,
        creativeKind: "IMAGE" as const,
        creativeStyle,
        aspectRatio: creativeAspectRatio,
        googleAspectRatio: googleNeedsVisual
          ? googleCreativeAspectRatio
          : creativeAspectRatio,
        campaignType: googleCampaignType,
        demandGenFormat: googleDemandGenFormat,
        platforms: selectedPlatforms,
        numberOfVariations,
        textOnly,
        brandContext: {
          businessName: businessName.trim() || undefined,
          productHint: productHint.trim() || undefined,
          websiteUrl: websiteUrl.trim() || undefined,
        },
      };

      const response = await fetch(`${API_BASE_URL}/api/ai-creative/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
        cache: "no-store",
      });

      const responseData: unknown = await response.json().catch(() => null);

      if (!isRecord(responseData)) {
        throw new Error(
          `AI generation returned an invalid response (HTTP ${response.status}).`,
        );
      }

      if (!response.ok || responseData.success !== true) {
        throw new Error(
          typeof responseData.message === "string"
            ? responseData.message
            : `AI generation failed (HTTP ${response.status}).`,
        );
      }

      const data = responseData as unknown as GenerateCreativeResponse;

      if (!Array.isArray(data.variations) || data.variations.length === 0) {
        throw new Error(
          "AI generation completed without any creative variations.",
        );
      }

      const validVariations = data.variations.filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.headline === "string" &&
          typeof item.primaryText === "string" &&
          typeof item.url === "string",
      );

      if (validVariations.length === 0) {
        throw new Error("AI returned variations in an unsupported format.");
      }

      setCreativeVariations(validVariations);
      setSelectedCreativeId(validVariations[0].id);
      setGenerationMeta({
        generationId: data.generationId,
        model: data.model,
        imageProvider: data.imageProvider,
        generatedAt: data.generatedAt,
        requestedCount: data.requestedCount ?? numberOfVariations,
        generatedCount: data.generatedCount ?? validVariations.length,
        failedCount: data.failedCount ?? 0,
      });

      setGenerationNotice(
        data.message ||
          `Generated ${validVariations.length} creative variation(s) using ${data.model || "Groq"}.`,
      );

      if (data.errors?.length) {
        setGenerationError(
          data.errors
            .map((item) =>
              item.variationIndex
                ? `Variation ${item.variationIndex}: ${item.message}`
                : item.message,
            )
            .join("\n"),
        );
      }
    } catch (error) {
      setGenerationError(
        error instanceof Error
          ? error.message
          : "AI creative generation failed.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* UI                                                                       */
  /* ------------------------------------------------------------------------ */

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="space-y-6">
        <header>
          <p className="text-sm font-semibold text-violet-700">
            Creative workspace
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            AI Creative Studio
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Generate advertising copy and image concepts, review the results,
            and prepare platform-specific creative packs. Campaign and Asset
            Library integration will be connected after this standalone
            workspace is complete.
          </p>
        </header>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-900">
          <strong>Standalone mode:</strong> Generated media is currently a
          temporary preview. This page does not save assets to the Asset Library
          or attach them to campaign drafts. Those workflows will be integrated
          in the next phase.
        </div>

        {/* Provider connections */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-bold text-slate-900">
                Advertising platforms
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Select which platform formats you want the AI to prepare.
              </p>
            </div>
            {loadingConnections && (
              <span className="text-xs text-slate-500">
                Checking connections…
              </span>
            )}
          </div>

          {connectionError && (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              {connectionError}
            </p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(["googleAds", "metaAds"] as ProviderName[]).map((provider) => {
              const connection = connections[provider];
              const connected =
                connection.connected && Boolean(connection.selectedAccountId);
              const selected = selectedPlatforms.includes(provider);
              const label =
                provider === "googleAds" ? "Google Ads" : "Meta Ads";

              return (
                <label
                  key={provider}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-4 transition ${
                    selected
                      ? "border-violet-400 bg-violet-50"
                      : "border-slate-200 bg-white"
                  } ${!connected ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">
                      {label}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {connected
                        ? "Connected account selected"
                        : "Connect and select an account first"}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!connected || loadingConnections}
                    onChange={() => togglePlatform(provider)}
                    className="h-4 w-4 accent-violet-700"
                  />
                </label>
              );
            })}
          </div>
        </section>

        {/* Creative brief */}
        <section className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="font-bold text-slate-900">Creative brief</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Describe the product, audience, key message and visual direction.
            </p>

            <div className="mt-4 space-y-3">
              <TextField
                label="Creative brief *"
                multiline
                minRows={5}
                maxRows={10}
                value={creativePrompt}
                onChange={(event) => setCreativePrompt(event.target.value)}
                placeholder="Example: Create a premium summer campaign visual for a sustainable clothing collection…"
                size="small"
                fullWidth
                sx={MUI_FIELD_SX}
                inputProps={{ maxLength: 2000 }}
              />

              <TextField
                label="Business / brand name"
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                placeholder="Enter your business name"
                size="small"
                fullWidth
                sx={MUI_FIELD_SX}
                />

              <TextField
                label="Product or service"
                value={productHint}
                onChange={(event) => setProductHint(event.target.value)}
                placeholder="What are you advertising?"
                size="small"
                fullWidth
                sx={MUI_FIELD_SX}
              />

              <TextField
                label="Business website / final URL"
                value={websiteUrl}
                onChange={(event) => setWebsiteUrl(event.target.value)}
                placeholder="https://yourwebsite.com"
                size="small"
                fullWidth
                sx={MUI_FIELD_SX}
                helperText="Optional, but required before using the generated pack in a real campaign."
              />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLASS}>Visual style</label>
                <select
                  value={creativeStyle}
                  onChange={(event) => setCreativeStyle(event.target.value)}
                  className={INPUT_CLASS}
                >
                  <option>Premium lifestyle</option>
                  <option>Minimal product focus</option>
                  <option>Bold promotional</option>
                  <option>Editorial / magazine</option>
                  <option>Playful and energetic</option>
                </select>
              </div>

              <div>
                <label className={LABEL_CLASS}>Number of variations</label>
                <select
                  value={numberOfVariations}
                  onChange={(event) =>
                    setNumberOfVariations(
                      Number(event.target.value) as 1 | 2 | 3,
                    )
                  }
                  className={INPUT_CLASS}
                >
                  <option value={1}>1 variation</option>
                  <option value={2}>2 variations</option>
                  <option value={3}>3 variations</option>
                </select>
              </div>

              <div>
                <label className={LABEL_CLASS}>Image aspect ratio</label>
                <select
                  value={creativeAspectRatio}
                  onChange={(event) =>
                    setCreativeAspectRatio(
                      event.target.value as CreativeAspectRatio,
                    )
                  }
                  disabled={textOnly}
                  className={INPUT_CLASS}
                >
                  <option value="1:1">Square · 1:1</option>
                  <option value="4:5">Portrait feed · 4:5</option>
                  <option value="9:16">Stories / Reels · 9:16</option>
                  <option value="16:9">Landscape · 16:9</option>
                  <option value="1.91:1">Landscape · 1.91:1</option>
                </select>
              </div>

              <div>
                <label className={LABEL_CLASS}>Generation mode</label>
                <select
                  value={textOnly ? "TEXT" : "IMAGE"}
                  onChange={(event) =>
                    setTextOnly(event.target.value === "TEXT")
                  }
                  className={INPUT_CLASS}
                >
                  <option value="IMAGE">Copy + image</option>
                  <option value="TEXT">Copy only</option>
                </select>
              </div>
            </div>

            {selectedPlatforms.includes("googleAds") && (
              <div className="mt-5 space-y-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Google Ads output
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    The generated copy pack will match the selected Google
                    campaign format.
                  </p>
                </div>

                <div>
                  <label className={LABEL_CLASS}>Google campaign type</label>
                  <select
                    value={googleCampaignType}
                    onChange={(event) =>
                      setGoogleCampaignType(
                        event.target.value as GoogleCampaignType,
                      )
                    }
                    className={INPUT_CLASS}
                  >
                    <option value="SEARCH">Search</option>
                    <option value="PERFORMANCE_MAX">Performance Max</option>
                    <option value="DISPLAY">Display</option>
                    <option value="DEMAND_GEN">Demand Gen</option>
                    <option value="APP">App</option>
                    <option value="SHOPPING">Shopping</option>
                    <option value="HOTEL">Hotel</option>
                  </select>
                </div>

                {googleCampaignType === "DEMAND_GEN" && (
                  <div>
                    <label className={LABEL_CLASS}>Demand Gen format</label>
                    <select
                      value={googleDemandGenFormat}
                      onChange={(event) =>
                        setGoogleDemandGenFormat(
                          event.target.value as GoogleDemandGenFormat,
                        )
                      }
                      className={INPUT_CLASS}
                    >
                      <option value="MULTI_ASSET">Multi asset</option>
                      <option value="CAROUSEL">Carousel</option>
                      <option value="VIDEO_RESPONSIVE">Video responsive</option>
                      <option value="PRODUCT_FEED">Product feed</option>
                    </select>
                  </div>
                )}

                {!textOnly &&
                  !["SEARCH", "SHOPPING", "HOTEL"].includes(
                    googleCampaignType,
                  ) &&
                  !(
                    googleCampaignType === "DEMAND_GEN" &&
                    ["VIDEO_RESPONSIVE", "PRODUCT_FEED"].includes(
                      googleDemandGenFormat,
                    )
                  ) && (
                    <div>
                      <label className={LABEL_CLASS}>
                        Google image aspect ratio
                      </label>
                      <select
                        value={googleCreativeAspectRatio}
                        onChange={(event) =>
                          setGoogleCreativeAspectRatio(
                            event.target.value as CreativeAspectRatio,
                          )
                        }
                        className={INPUT_CLASS}
                      >
                        {(googleCampaignType === "PERFORMANCE_MAX"
                          ? (["1.91:1", "1:1", "4:5"] as CreativeAspectRatio[])
                          : googleCampaignType === "DISPLAY"
                            ? (["1.91:1", "1:1"] as CreativeAspectRatio[])
                            : ASPECT_RATIOS
                        ).map((ratio) => (
                          <option key={ratio} value={ratio}>
                            {ratio}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[10px] leading-4 text-slate-500">
                        A separate Google image is generated when this differs
                        from the main image ratio.
                      </p>
                    </div>
                  )}

                {["SHOPPING", "HOTEL"].includes(googleCampaignType) && (
                  <p className="text-xs leading-5 text-amber-800">
                    This format is feed/listing-driven. AI can prepare
                    supporting copy, but it does not create Merchant Center or
                    Hotel Center feed assets.
                  </p>
                )}

                {googleCampaignType === "DEMAND_GEN" &&
                  ["VIDEO_RESPONSIVE", "PRODUCT_FEED"].includes(
                    googleDemandGenFormat,
                  ) && (
                    <p className="text-xs leading-5 text-amber-800">
                      This workflow prepares copy only. Actual video or
                      product-feed assets must be supplied separately.
                    </p>
                  )}
              </div>
            )}

            <button
              type="button"
              onClick={generateCreativeVariations}
              disabled={
                isGenerating || loadingConnections || !isLoaded || !isSignedIn
              }
              className={`mt-5 w-full rounded-xl px-5 py-3 text-sm font-semibold text-white transition ${
                isGenerating || loadingConnections || !isLoaded || !isSignedIn
                  ? "cursor-not-allowed bg-violet-400"
                  : "bg-violet-700 hover:bg-violet-800"
              }`}
            >
              {isGenerating
                ? "Generating creatives…"
                : "✦ Generate AI creatives"}
            </button>

            {generationError && (
              <p className="mt-3 whitespace-pre-line rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-800">
                {generationError}
              </p>
            )}
            {generationNotice && (
              <p className="mt-3 rounded-xl bg-violet-50 p-3 text-xs leading-5 text-violet-800">
                {generationNotice}
              </p>
            )}
          </div>

          {/* Generation result summary */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">Generated concepts</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Select a variation to inspect its image and platform-specific
                  copy.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {creativeVariations.length} generated
              </span>
            </div>

            {!creativeVariations.length ? (
              <div className="mt-5 flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <span className="text-4xl text-violet-400">✦</span>
                <p className="mt-3 font-semibold text-slate-800">
                  Your concepts will appear here
                </p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                  Add a brief, select one or both connected platforms, and
                  generate your first set of concepts.
                </p>
              </div>
            ) : (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {creativeVariations.map((variation) => {
                  const selected = selectedCreativeId === variation.id;
                  const mediaUrl = variation.media?.url || variation.url;
                  const isPlaceholder = variation.media?.isPlaceholder === true;

                  return (
                    <button
                      key={variation.id}
                      type="button"
                      onClick={() => setSelectedCreativeId(variation.id)}
                      className={`overflow-hidden rounded-xl border text-left transition ${
                        selected
                          ? "border-violet-600 ring-2 ring-violet-200"
                          : "border-slate-200 hover:border-violet-300"
                      }`}
                    >
                      <div
                        className={`${getAspectClass(variation.aspectRatio)} relative overflow-hidden bg-slate-100`}
                      >
                        {mediaUrl ? (
                          <img
                            src={mediaUrl}
                            alt={variation.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full min-h-40 items-center justify-center p-5 text-center text-xs text-slate-500">
                            Text-only creative · No image generated
                          </div>
                        )}
                        {isPlaceholder && (
                          <span className="absolute left-2 top-2 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-900">
                            Demo placeholder
                          </span>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-xs font-bold text-slate-900">
                          {variation.name}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          {variation.styleLabel} · {variation.aspectRatio}
                        </p>
                        <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-600">
                          {variation.headline}
                        </p>
                        <p
                          className={`mt-3 text-[10px] font-bold ${selected ? "text-violet-700" : "text-slate-400"}`}
                        >
                          {selected ? "Selected for review" : "Select concept"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {generationMeta && (
              <div className="mt-5 grid gap-2 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600 sm:grid-cols-2">
                <p>
                  <strong>Text model:</strong>{" "}
                  {generationMeta.model || "Not reported"}
                </p>
                <p>
                  <strong>Image provider:</strong>{" "}
                  {generationMeta.imageProvider || "Not reported"}
                </p>
                <p>
                  <strong>Generated:</strong>{" "}
                  {generationMeta.generatedCount ?? creativeVariations.length} /{" "}
                  {generationMeta.requestedCount ?? creativeVariations.length}
                </p>
                <p>
                  <strong>Failed:</strong> {generationMeta.failedCount ?? 0}
                </p>
                {generationMeta.generationId && (
                  <p className="break-all sm:col-span-2">
                    <strong>Generation ID:</strong>{" "}
                    {generationMeta.generationId}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Selected variation details */}
        {selectedVariation && (
          <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-violet-700">
                  Creative review
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">
                  {selectedVariation.name}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Generated by {selectedVariation.provider} ·{" "}
                  {selectedVariation.generatedAt
                    ? new Date(selectedVariation.generatedAt).toLocaleString()
                    : "Date unavailable"}
                </p>
              </div>
              <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                {selectedVariation.status || "GENERATED"}
              </span>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div>
                {selectedVariation.media?.url || selectedVariation.url ? (
                  <div
                    className={`${getAspectClass(selectedVariation.aspectRatio)} overflow-hidden rounded-xl bg-slate-100`}
                  >
                    <img
                      src={
                        selectedVariation.media?.url || selectedVariation.url
                      }
                      alt={selectedVariation.name}
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex min-h-60 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    No image generated. This variation contains copy only.
                  </div>
                )}
                <p className="mt-2 text-[11px] text-slate-500">
                  {getRatioDimensions(selectedVariation.media)}
                  {selectedVariation.media?.fileSizeBytes
                    ? ` · ${(selectedVariation.media.fileSizeBytes / 1024 / 1024).toFixed(2)} MB`
                    : ""}
                </p>
                {selectedVariation.media?.isPlaceholder && (
                  <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                    This is a development placeholder. It must not be treated as
                    a production creative.
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Main headline
                  </p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {selectedVariation.headline}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {selectedVariation.headline.length} characters
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Primary text
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {selectedVariation.primaryText}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase text-slate-500">
                      Call to action
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {formatCta(selectedVariation.callToAction)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase text-slate-500">
                      Aspect ratio
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {selectedVariation.aspectRatio}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Google Ads pack */}
            {selectedPlatforms.includes("googleAds") &&
              selectedVariation.googlePack && (
                <div className="space-y-4 rounded-xl border border-blue-200 p-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                      Google Ads creative pack
                    </p>
                    <h3 className="mt-1 font-bold text-slate-900">
                      {selectedVariation.googlePack.formatLabel}
                    </h3>
                    <p className="mt-1 break-all text-xs text-slate-500">
                      Destination: {selectedVariation.googlePack.finalUrl}
                    </p>
                  </div>

                  {selectedVariation.googlePack.headlines.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        Headlines (
                        {selectedVariation.googlePack.headlines.length})
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {selectedVariation.googlePack.headlines.map(
                          (headline, index) => (
                            <div
                              key={`${index}-${headline}`}
                              className="rounded-lg bg-blue-50 p-3"
                            >
                              <p className="text-[10px] text-blue-700">
                                Headline {index + 1} · {headline.length}/30
                              </p>
                              <p className="mt-1 text-xs font-medium text-slate-800">
                                {headline}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {selectedVariation.googlePack.longHeadlines.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        Long headlines
                      </p>
                      <div className="mt-2 space-y-2">
                        {selectedVariation.googlePack.longHeadlines.map(
                          (headline, index) => (
                            <div
                              key={`${index}-${headline}`}
                              className="rounded-lg bg-slate-50 p-3"
                            >
                              <p className="text-xs text-slate-800">
                                {headline}
                              </p>
                              <p className="mt-1 text-[10px] text-slate-500">
                                {headline.length}/90 characters
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {selectedVariation.googlePack.descriptions.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        Descriptions (
                        {selectedVariation.googlePack.descriptions.length})
                      </p>
                      <div className="mt-2 space-y-2">
                        {selectedVariation.googlePack.descriptions.map(
                          (description, index) => (
                            <div
                              key={`${index}-${description}`}
                              className="rounded-lg bg-slate-50 p-3"
                            >
                              <p className="text-xs text-slate-800">
                                {description}
                              </p>
                              <p className="mt-1 text-[10px] text-slate-500">
                                {description.length}/90 characters
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {selectedVariation.googlePack.imageUrl && (
                    <div className="max-w-md">
                      <p className="mb-2 text-xs font-bold text-slate-800">
                        Google-specific image ·{" "}
                        {selectedVariation.googlePack.imageAspectRatio ||
                          selectedVariation.googleAspectRatio}
                      </p>
                      <img
                        src={selectedVariation.googlePack.imageUrl}
                        alt="Google Ads creative"
                        className="max-h-72 w-full rounded-lg border border-slate-200 object-contain"
                      />
                    </div>
                  )}

                  {!!selectedVariation.googlePack.validationWarnings
                    ?.length && (
                    <div className="rounded-lg bg-amber-50 p-3">
                      <p className="text-xs font-bold text-amber-900">
                        Review required
                      </p>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-800">
                        {selectedVariation.googlePack.validationWarnings.map(
                          (warning, index) => (
                            <li key={`${index}-${warning}`}>{warning}</li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}

                  {googleCampaignType === "DEMAND_GEN" &&
                    googleDemandGenFormat === "CAROUSEL" && (
                      <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                        This response does not contain individual carousel card
                        media. Add and review each card image and destination
                        separately before using a carousel campaign.
                      </p>
                    )}
                </div>
              )}

            {/* Meta Ads pack */}
            {selectedPlatforms.includes("metaAds") &&
              selectedVariation.metaPack && (
                <div className="space-y-4 rounded-xl border border-fuchsia-200 p-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-fuchsia-700">
                      Meta Ads creative pack
                    </p>
                    <h3 className="mt-1 font-bold text-slate-900">
                      {selectedVariation.metaPack.format.replaceAll("_", " ")}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      CTA: {formatCta(selectedVariation.metaPack.callToAction)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      Primary text variations
                    </p>
                    <div className="mt-2 space-y-2">
                      {selectedVariation.metaPack.primaryTexts.map(
                        (text, index) => (
                          <div
                            key={`${index}-${text}`}
                            className="rounded-lg bg-fuchsia-50 p-3"
                          >
                            <p className="text-[10px] text-fuchsia-700">
                              Option {index + 1}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-800">
                              {text}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[10px] font-bold uppercase text-slate-500">
                        Headlines
                      </p>
                      {selectedVariation.metaPack.headlines.map(
                        (headline, index) => (
                          <p
                            key={`${index}-${headline}`}
                            className="mt-1 text-xs text-slate-800"
                          >
                            {headline}
                          </p>
                        ),
                      )}
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[10px] font-bold uppercase text-slate-500">
                        Descriptions
                      </p>
                      {selectedVariation.metaPack.descriptions.map(
                        (description, index) => (
                          <p
                            key={`${index}-${description}`}
                            className="mt-1 text-xs text-slate-800"
                          >
                            {description}
                          </p>
                        ),
                      )}
                    </div>
                  </div>

                  {!!selectedVariation.metaPack.validationWarnings?.length && (
                    <div className="rounded-lg bg-amber-50 p-3">
                      <p className="text-xs font-bold text-amber-900">
                        Review required
                      </p>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-800">
                        {selectedVariation.metaPack.validationWarnings.map(
                          (warning, index) => (
                            <li key={`${index}-${warning}`}>{warning}</li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}

            <div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <strong>Standalone review only:</strong> This page currently
              generates and previews creative concepts. It does not save them to
              the Asset Library, attach them to a campaign, or publish ads.
              Those integrations will be implemented after the standalone studio
              is verified.
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

export default Page;
