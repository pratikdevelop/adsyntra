"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

type ProviderName = "googleAds" | "metaAds";
type PlatformMode = "googleAds" | "metaAds" | "both";
type Objective =
  | "SALES"
  | "LEADS"
  | "WEBSITE_TRAFFIC"
  | "AWARENESS"
  | "ENGAGEMENT"
  | "APP_PROMOTION";
type MetaBudgetLevel = "CAMPAIGN" | "AD_SET";
type MetaBuyingType = "AUCTION" | "RESERVED";
type GooglePerformanceGoal =
  | "CONVERSIONS"
  | "CONVERSION_VALUE"
  | "CLICKS"
  | "IMPRESSION_SHARE"
  | "IMPRESSIONS";

interface ProviderConnection {
  connected: boolean;
  accounts: unknown[];
  selectedAccountId: string | null;
}

interface ConnectionResponse {
  providers?: {
    googleAds?: Partial<ProviderConnection>;
    metaAds?: Partial<ProviderConnection>;
  };
  message?: string;
}

const initialConnection: ProviderConnection = {
  connected: false,
  accounts: [],
  selectedAccountId: null,
};

const objectives: {
  value: Objective;
  label: string;
  description: string;
}[] = [
  {
    value: "SALES",
    label: "Sales",
    description: "Generate purchases and revenue.",
  },
  {
    value: "LEADS",
    label: "Leads",
    description: "Collect enquiries and customer information.",
  },
  {
    value: "WEBSITE_TRAFFIC",
    label: "Website Traffic",
    description: "Bring visitors to your website.",
  },
  {
    value: "AWARENESS",
    label: "Brand Awareness",
    description: "Reach more people and build recognition.",
  },
  {
    value: "ENGAGEMENT",
    label: "Engagement",
    description: "Encourage interactions with your content.",
  },
  {
    value: "APP_PROMOTION",
    label: "App Promotion",
    description: "Drive app installs and app activity.",
  },
];

const googleCampaignTypes = [
  { value: "SEARCH", label: "Search" },
  { value: "PERFORMANCE_MAX", label: "Performance Max" },
  { value: "DISPLAY", label: "Display" },
  { value: "DEMAND_GEN", label: "Demand Gen" },
  { value: "SHOPPING", label: "Shopping" },
];

// The Google Ads UI asks what the campaign should optimize for. The API does
// not expose one universal `performance_goal` field; this selection is mapped
// to a campaign-type-compatible bidding strategy by the backend.
const googlePerformanceGoalsByType: Record<
  string,
  { value: GooglePerformanceGoal; label: string; biddingStrategy: string }[]
> = {
  SEARCH: [
    {
      value: "CONVERSIONS",
      label: "Conversions",
      biddingStrategy: "MAXIMIZE_CONVERSIONS",
    },
    {
      value: "CONVERSION_VALUE",
      label: "Conversion value",
      biddingStrategy: "MAXIMIZE_CONVERSION_VALUE",
    },
    {
      value: "CLICKS",
      label: "Website clicks",
      biddingStrategy: "TARGET_SPEND",
    },
    {
      value: "IMPRESSION_SHARE",
      label: "Search impression share",
      biddingStrategy: "TARGET_IMPRESSION_SHARE",
    },
  ],
  PERFORMANCE_MAX: [
    {
      value: "CONVERSIONS",
      label: "Conversions",
      biddingStrategy: "MAXIMIZE_CONVERSIONS",
    },
    {
      value: "CONVERSION_VALUE",
      label: "Conversion value",
      biddingStrategy: "MAXIMIZE_CONVERSION_VALUE",
    },
  ],
  DISPLAY: [
    {
      value: "CONVERSIONS",
      label: "Conversions",
      biddingStrategy: "MAXIMIZE_CONVERSIONS",
    },
    {
      value: "CLICKS",
      label: "Website clicks",
      biddingStrategy: "TARGET_SPEND",
    },
    {
      value: "IMPRESSIONS",
      label: "Impressions / reach",
      biddingStrategy: "TARGET_CPM",
    },
  ],
  DEMAND_GEN: [
    {
      value: "CONVERSIONS",
      label: "Conversions",
      biddingStrategy: "MAXIMIZE_CONVERSIONS",
    },
    {
      value: "CONVERSION_VALUE",
      label: "Conversion value",
      biddingStrategy: "MAXIMIZE_CONVERSION_VALUE",
    },
    { value: "CLICKS", label: "Website clicks", biddingStrategy: "TARGET_CPC" },
  ],
  SHOPPING: [
    {
      value: "CONVERSIONS",
      label: "Conversions",
      biddingStrategy: "MAXIMIZE_CONVERSIONS",
    },
    {
      value: "CONVERSION_VALUE",
      label: "Conversion value",
      biddingStrategy: "MAXIMIZE_CONVERSION_VALUE",
    },
    {
      value: "CLICKS",
      label: "Website clicks",
      biddingStrategy: "TARGET_SPEND",
    },
  ],
};

const metaBuyingTypes = [
  { value: "AUCTION", label: "Auction (standard buying)" },
  { value: "RESERVED", label: "Reservation (Reach & Frequency)" },
] as const;

const metaObjectiveMap: Record<Objective, string> = {
  SALES: "OUTCOME_SALES",
  LEADS: "OUTCOME_LEADS",
  WEBSITE_TRAFFIC: "OUTCOME_TRAFFIC",
  AWARENESS: "OUTCOME_AWARENESS",
  ENGAGEMENT: "OUTCOME_ENGAGEMENT",
  APP_PROMOTION: "OUTCOME_APP_PROMOTION",
};

const metaOptimizationOptions: Record<
  Objective,
  { value: string; label: string }[]
> = {
  SALES: [
    { value: "OFFSITE_CONVERSIONS", label: "Offsite Conversions" },
    { value: "VALUE", label: "Conversion Value" },
  ],
  LEADS: [
    { value: "LEAD_GENERATION", label: "Lead Generation" },
    { value: "OFFSITE_CONVERSIONS", label: "Offsite Conversions" },
  ],
  WEBSITE_TRAFFIC: [
    { value: "LINK_CLICKS", label: "Link Clicks" },
    { value: "LANDING_PAGE_VIEWS", label: "Landing Page Views" },
  ],
  AWARENESS: [
    { value: "REACH", label: "Reach" },
    { value: "IMPRESSIONS", label: "Impressions" },
    { value: "AD_RECALL_LIFT", label: "Ad Recall Lift" },
  ],
  ENGAGEMENT: [
    { value: "POST_ENGAGEMENT", label: "Post Engagement" },
    { value: "PAGE_LIKES", label: "Page Likes" },
    { value: "CONVERSATIONS", label: "Conversations" },
  ],
  APP_PROMOTION: [
    { value: "APP_INSTALLS", label: "App Installs" },
    { value: "OFFSITE_CONVERSIONS", label: "App Events / Conversions" },
  ],
};

function normalizeConnection(
  provider?: Partial<ProviderConnection>,
): ProviderConnection {
  return {
    connected: Boolean(provider?.connected),
    accounts: Array.isArray(provider?.accounts) ? provider.accounts : [],
    selectedAccountId:
      typeof provider?.selectedAccountId === "string"
        ? provider.selectedAccountId
        : null,
  };
}

function getAccountRecord(account: unknown): Record<string, unknown> | null {
  return account && typeof account === "object"
    ? (account as Record<string, unknown>)
    : null;
}

function getAccountId(account: unknown): string | null {
  if (typeof account === "string" && account.trim()) return account.trim();
  const item = getAccountRecord(account);
  if (!item) return null;

  const id =
    item.resourceName ??
    item.resource_name ??
    item.customerId ??
    item.customer_id ??
    item.accountId ??
    item.account_id ??
    item.id;

  return id === undefined || id === null || String(id).trim() === ""
    ? null
    : String(id).trim();
}

function getAccountName(account: unknown): string {
  if (typeof account === "string") return account;
  const item = getAccountRecord(account);
  if (!item) return "Advertising account";

  const name =
    item.descriptiveName ??
    item.descriptive_name ??
    item.accountName ??
    item.account_name ??
    item.business_name ??
    item.name;

  return typeof name === "string" && name.trim()
    ? name.trim()
    : getAccountId(account) || "Advertising account";
}

function getAccountCurrency(account: unknown): string | null {
  const item = getAccountRecord(account);
  if (!item) return null;
  const currency = item.currencyCode ?? item.currency_code ?? item.currency;
  return typeof currency === "string" && currency.trim()
    ? currency.trim().toUpperCase()
    : null;
}

function selectedAccount(connection: ProviderConnection): unknown | null {
  return (
    connection.accounts.find(
      (account) => getAccountId(account) === connection.selectedAccountId,
    ) ?? null
  );
}

function selectedAccountLabel(connection: ProviderConnection): string {
  const account = selectedAccount(connection);
  return account
    ? getAccountName(account)
    : connection.selectedAccountId || "No account selected";
}

function selectedCurrency(connection: ProviderConnection): string {
  const account = selectedAccount(connection);
  return getAccountCurrency(account) || "account currency";
}

function isPositiveAmount(value: string): boolean {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

export default function CreateCampaignPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const [connections, setConnections] = useState({
    googleAds: initialConnection,
    metaAds: initialConnection,
  });
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [selectedPlatforms, setSelectedPlatforms] = useState<ProviderName[]>(
    [],
  );

  // Shared campaign brief.
  const [campaignName, setCampaignName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState<Objective | "">("");

  // Google Ads settings.
  const [googleCampaignType, setGoogleCampaignType] = useState("SEARCH");
  const [googlePerformanceGoal, setGooglePerformanceGoal] =
    useState<GooglePerformanceGoal>("CONVERSIONS");
  const [googleDailyBudget, setGoogleDailyBudget] = useState("");

  // Meta Ads settings.
  const [metaBuyingType, setMetaBuyingType] =
    useState<MetaBuyingType>("AUCTION");
  const [metaBudgetLevel, setMetaBudgetLevel] =
    useState<MetaBudgetLevel>("CAMPAIGN");
  const [metaDailyBudget, setMetaDailyBudget] = useState("");
  const [metaOptimizationGoal, setMetaOptimizationGoal] = useState(
    "OFFSITE_CONVERSIONS",
  );
  const [metaBillingEvent, setMetaBillingEvent] = useState("IMPRESSIONS");
  const [metaSpecialAdCategory, setMetaSpecialAdCategory] = useState("NONE");

  const [preparedPayload, setPreparedPayload] = useState("");
  const [copyNotice, setCopyNotice] = useState("");

  const googleReady =
    connections.googleAds.connected &&
    Boolean(connections.googleAds.selectedAccountId);
  const metaReady =
    connections.metaAds.connected &&
    Boolean(connections.metaAds.selectedAccountId);
  const bothReady = googleReady && metaReady;

  const platformMode: PlatformMode | "none" = useMemo(() => {
    if (selectedPlatforms.length === 2) return "both";
    if (selectedPlatforms[0]) return selectedPlatforms[0];
    return "none";
  }, [selectedPlatforms]);

  const availableGooglePerformanceGoals =
    googlePerformanceGoalsByType[googleCampaignType] ||
    googlePerformanceGoalsByType.SEARCH;
  const effectiveGooglePerformanceGoal = availableGooglePerformanceGoals.some(
    (item) => item.value === googlePerformanceGoal,
  )
    ? googlePerformanceGoal
    : availableGooglePerformanceGoals[0].value;
  const selectedGooglePerformanceConfig = availableGooglePerformanceGoals.find(
    (item) => item.value === effectiveGooglePerformanceGoal,
  )!;

  const availableMetaOptimizationOptions = objective
    ? metaOptimizationOptions[objective]
    : [];
  const effectiveMetaOptimizationGoal = availableMetaOptimizationOptions.some(
    (item) => item.value === metaOptimizationGoal,
  )
    ? metaOptimizationGoal
    : availableMetaOptimizationOptions[0]?.value || "";

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setLoadingConnections(false);
      setConnectionError("Please sign in to continue.");
      return;
    }

    let cancelled = false;

    const loadConnections = async () => {
      try {
        setLoadingConnections(true);
        setConnectionError("");
        const token = await getToken();
        if (!token) throw new Error("Unable to get authentication token.");

        const response = await fetch(`${API_BASE_URL}/api/connections/me`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data: ConnectionResponse = await response.json();
        if (!response.ok) {
          throw new Error(
            data.message || "Failed to load advertising accounts.",
          );
        }
        if (cancelled) return;

        const google = normalizeConnection(data.providers?.googleAds);
        const meta = normalizeConnection(data.providers?.metaAds);
        setConnections({ googleAds: google, metaAds: meta });

        const available: ProviderName[] = [];
        if (google.connected && google.selectedAccountId)
          available.push("googleAds");
        if (meta.connected && meta.selectedAccountId) available.push("metaAds");
        setSelectedPlatforms(available);
      } catch (err) {
        if (!cancelled) {
          setConnectionError(
            err instanceof Error ? err.message : "Unable to load connections.",
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

  const clearPreview = () => {
    setPreparedPayload("");
    setCopyNotice("");
  };

  const choosePlatformMode = (mode: PlatformMode) => {
    setError("");
    clearPreview();
    if (mode === "both") {
      setSelectedPlatforms([
        ...(googleReady ? (["googleAds"] as const) : []),
        ...(metaReady ? (["metaAds"] as const) : []),
      ]);
      return;
    }
    setSelectedPlatforms(
      mode === "googleAds"
        ? googleReady
          ? ["googleAds"]
          : []
        : metaReady
          ? ["metaAds"]
          : [],
    );
  };

  const validateBasics = () => {
    if (!selectedPlatforms.length) {
      setError("Select Google Ads, Meta Ads, or both connected platforms.");
      return false;
    }
    if (
      selectedPlatforms.some(
        (provider) => !connections[provider].selectedAccountId,
      )
    ) {
      setError(
        "Select an active advertising account for every chosen platform.",
      );
      return false;
    }
    if (!campaignName.trim()) {
      setError("Enter a campaign name.");
      return false;
    }
    if (!businessName.trim()) {
      setError("Enter your business name.");
      return false;
    }
    if (!objective) {
      setError("Select a campaign objective.");
      return false;
    }
    if (websiteUrl.trim()) {
      try {
        const parsed = new URL(websiteUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch {
        setError("Enter a valid website URL, including https://.");
        return false;
      }
    }
    setError("");
    return true;
  };

  const validatePlatformSettings = () => {
    if (
      selectedPlatforms.includes("googleAds") &&
      !isPositiveAmount(googleDailyBudget)
    ) {
      setError("Enter a Google Ads daily budget greater than zero.");
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      !selectedGooglePerformanceConfig
    ) {
      setError(
        "Choose a performance goal supported by the selected Google campaign type.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      !isPositiveAmount(metaDailyBudget)
    ) {
      setError(
        "Enter a Meta Ads daily budget greater than zero. This is required for both campaign-level and ad set-level budgets.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      metaBuyingType === "RESERVED"
    ) {
      setError(
        "Meta Reserved buying requires a separate Reach & Frequency reservation workflow. This form currently prepares Auction campaigns only; choose Auction until reservation predictions, booking and Ad Set assignment are implemented.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      !effectiveMetaOptimizationGoal
    ) {
      setError("Choose a Meta optimization goal for the selected objective.");
      return false;
    }
    setError("");
    return true;
  };

  const goNext = () => {
    if (step === 1 && !validateBasics()) return;
    if (step === 2 && !validatePlatformSettings()) return;
    clearPreview();
    setError("");
    setStep((current) => Math.min(current + 1, 3));
  };

  const goBack = () => {
    setError("");
    clearPreview();
    setStep((current) => Math.max(current - 1, 1));
  };

  const prepareCampaign = () => {
    if (!validateBasics() || !validatePlatformSettings() || !objective) return;

    const payload = {
      common: {
        name: campaignName.trim(),
        businessName: businessName.trim(),
        websiteUrl: websiteUrl.trim() || null,
        description: description.trim() || null,
        objective,
      },
      platforms: selectedPlatforms,
      providerConfigurations: {
        ...(selectedPlatforms.includes("googleAds") && {
          googleAds: {
            accountId: connections.googleAds.selectedAccountId,
            campaign: {
              campaignType: googleCampaignType,
              // Product-level goal selection; the backend maps it to the
              // supported Google Ads campaign bidding scheme.
              performanceGoal: effectiveGooglePerformanceGoal,
              biddingStrategy: selectedGooglePerformanceConfig.biddingStrategy,
              dailyBudget: Number(googleDailyBudget),
              budgetCurrency: selectedCurrency(connections.googleAds),
            },
          },
        }),
        ...(selectedPlatforms.includes("metaAds") && {
          metaAds: {
            accountId: connections.metaAds.selectedAccountId,
            campaign: {
              objective: metaObjectiveMap[objective],
              // Meta Marketing API campaign-level field: AUCTION or RESERVED.
              buying_type: metaBuyingType,
              special_ad_categories:
                metaSpecialAdCategory === "NONE" ? [] : [metaSpecialAdCategory],
              budgetLevel: metaBudgetLevel,
              ...(metaBudgetLevel === "CAMPAIGN" && {
                daily_budget: Number(metaDailyBudget),
              }),
              budgetCurrency: selectedCurrency(connections.metaAds),
            },
            adSet: {
              // Meta's UI calls this the Performance Goal. The API field is
              // optimization_goal and belongs to the Ad Set, not Campaign.
              optimization_goal: effectiveMetaOptimizationGoal,
              billing_event: metaBillingEvent,
              ...(metaBudgetLevel === "AD_SET" && {
                daily_budget: Number(metaDailyBudget),
              }),
            },
          },
        }),
      },
      launch: {
        // Start paused so the user can review each provider's campaign before activation.
        initialStatus: "PAUSED",
      },
    };

    setPreparedPayload(JSON.stringify(payload, null, 2));
    setCopyNotice("");
    setError("");
  };

  const copyPayload = async () => {
    try {
      await navigator.clipboard.writeText(preparedPayload);
      setCopyNotice("Request JSON copied.");
      setError("");
    } catch {
      setError("Unable to copy the request. Please copy it manually.");
    }
  };

  const inputClass =
    "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const labelClass = "text-sm font-semibold text-slate-700";
  const selectedObjective = objectives.find((item) => item.value === objective);

  return (
    <div className="mx-auto max-w-5xl">
      <div>
        <p className="text-sm font-semibold text-blue-600">
          Campaign Management
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          Unified Campaign Builder
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Create one campaign brief and configure Google Ads, Meta Ads, or both
          from the same workflow.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-3">
        {[
          { number: 1, label: "Campaign Basics" },
          { number: 2, label: "Platform Settings" },
          { number: 3, label: "Review" },
        ].map((item) => (
          <div key={item.number}>
            <div
              className={`h-1.5 rounded-full ${step >= item.number ? "bg-blue-600" : "bg-slate-200"}`}
            />
            <p
              className={`mt-2 text-xs font-semibold sm:text-sm ${step === item.number ? "text-blue-700" : "text-slate-400"}`}
            >
              {item.number}. {item.label}
            </p>
          </div>
        ))}
      </div>

      {loadingConnections && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
          Loading your advertising accounts...
        </div>
      )}

      {connectionError && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {connectionError}
          <div className="mt-2">
            <Link href="/provider" className="font-semibold underline">
              Manage account connections
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {step === 1 && (
        <section className="mt-8 space-y-7">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-bold">1. Choose where to advertise</h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose one platform or select Both to prepare campaigns for Google
              and Meta together.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {(
                [
                  {
                    mode: "googleAds",
                    title: "Google Ads",
                    description: "Search, Display, Video, Performance Max",
                    ready: googleReady,
                  },
                  {
                    mode: "metaAds",
                    title: "Meta Ads",
                    description: "Facebook and Instagram",
                    ready: metaReady,
                  },
                  {
                    mode: "both",
                    title: "Both Platforms",
                    description: "One brief, separate provider settings",
                    ready: bothReady,
                  },
                ] as const
              ).map((option) => {
                const active = platformMode === option.mode;
                return (
                  <button
                    key={option.mode}
                    type="button"
                    disabled={!option.ready || loadingConnections}
                    onClick={() => choosePlatformMode(option.mode)}
                    className={`rounded-xl border p-4 text-left transition ${
                      active
                        ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                        : "border-slate-200 hover:border-blue-300"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">
                        {option.title}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-blue-600 text-white" : option.ready ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}
                      >
                        {active
                          ? "Selected"
                          : option.ready
                            ? "Connected"
                            : "Unavailable"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    key: "googleAds",
                    title: "Google Ads",
                    ready: googleReady,
                    connection: connections.googleAds,
                  },
                  {
                    key: "metaAds",
                    title: "Meta Ads",
                    ready: metaReady,
                    connection: connections.metaAds,
                  },
                ] as const
              ).map((platform) => (
                <div
                  key={platform.key}
                  className="rounded-xl bg-slate-50 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">
                      {platform.title}
                    </span>
                    <span
                      className={
                        platform.ready ? "text-green-700" : "text-slate-500"
                      }
                    >
                      {platform.ready ? "Account ready" : "Account not ready"}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-xs text-slate-500">
                    {platform.ready
                      ? selectedAccountLabel(platform.connection)
                      : "Connect and select an account first."}
                  </p>
                  {platform.ready && (
                    <p className="mt-1 text-xs text-slate-500">
                      Currency: {selectedCurrency(platform.connection)}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {!loadingConnections && (
              <Link
                href="/provider"
                className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:text-blue-800"
              >
                Manage advertising accounts →
              </Link>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-bold">2. Shared campaign brief</h2>
            <p className="mt-1 text-sm text-slate-500">
              These details are reused across the platforms you selected.
            </p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Business Name *</label>
                <input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. ABC Technologies"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Campaign Name *</label>
                <input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. October Product Launch"
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Website URL</label>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://www.example.com"
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Campaign Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your product, offer or campaign..."
                  rows={3}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-bold">
              3. What is your campaign objective?
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose the business outcome. The selected objective is mapped to
              each provider's own campaign model.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {objectives.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setObjective(item.value);
                    clearPreview();
                  }}
                  className={`rounded-xl border p-4 text-left transition ${objective === item.value ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-300"}`}
                >
                  <span className="block text-sm font-bold">{item.label}</span>
                  <span className="mt-2 block text-xs leading-5 text-slate-500">
                    {item.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="mt-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold">Provider-specific settings</h2>
            <p className="mt-1 text-sm text-slate-500">
              Each platform has its own campaign structure, bidding and budget
              configuration.
            </p>
          </div>

          {selectedPlatforms.includes("googleAds") && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl font-bold text-blue-700">
                  G
                </div>
                <div>
                  <h3 className="font-bold">Google Ads</h3>
                  <p className="text-xs text-slate-500">
                    {selectedAccountLabel(connections.googleAds)} ·{" "}
                    {selectedCurrency(connections.googleAds)}
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Google Campaign Type *</label>
                  <select
                    value={googleCampaignType}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      const nextGoals =
                        googlePerformanceGoalsByType[nextType] ||
                        googlePerformanceGoalsByType.SEARCH;
                      setGoogleCampaignType(nextType);
                      if (
                        !nextGoals.some(
                          (item) => item.value === googlePerformanceGoal,
                        )
                      ) {
                        setGooglePerformanceGoal(nextGoals[0].value);
                      }
                      clearPreview();
                    }}
                    className={inputClass}
                  >
                    {googleCampaignTypes.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Performance Goal *</label>
                  <select
                    value={effectiveGooglePerformanceGoal}
                    onChange={(e) => {
                      setGooglePerformanceGoal(
                        e.target.value as GooglePerformanceGoal,
                      );
                      clearPreview();
                    }}
                    className={inputClass}
                  >
                    {availableGooglePerformanceGoals.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-500">
                    Mapped to the Google Ads bidding strategy supported by this
                    campaign type. The API has no universal
                    campaign.performance_goal field.
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-600">
                    API bidding strategy:{" "}
                    {selectedGooglePerformanceConfig.biddingStrategy}
                  </p>
                </div>
                <div className="sm:col-span-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                  For new video campaigns managed through the Google Ads API,
                  use Demand Gen or Performance Max. Some legacy Video campaign
                  types have limited API write support.
                </div>
                <div>
                  <label className={labelClass}>
                    Daily Budget ({selectedCurrency(connections.googleAds)}) *
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={googleDailyBudget}
                    onChange={(e) => {
                      setGoogleDailyBudget(e.target.value);
                      clearPreview();
                    }}
                    placeholder="e.g. 500"
                    className={inputClass}
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Enter the amount in the Google Ads account currency. The
                    backend must convert it to Google Ads micros.
                  </p>
                </div>
              </div>
            </div>
          )}

          {selectedPlatforms.includes("metaAds") && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl font-bold text-blue-700">
                  M
                </div>
                <div>
                  <h3 className="font-bold">Meta Ads</h3>
                  <p className="text-xs text-slate-500">
                    {selectedAccountLabel(connections.metaAds)} ·{" "}
                    {selectedCurrency(connections.metaAds)}
                  </p>
                </div>
              </div>
              {!objective ? (
                <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  Choose a shared campaign objective in Campaign Basics first.
                </p>
              ) : (
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>
                      Meta Campaign Objective
                    </label>
                    <input
                      readOnly
                      value={metaObjectiveMap[objective]}
                      className={`${inputClass} bg-slate-50 text-slate-600`}
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      Mapped from your shared business objective.
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Buying Type *</label>
                    <select
                      value={metaBuyingType}
                      onChange={(e) => {
                        setMetaBuyingType(e.target.value as MetaBuyingType);
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      {metaBuyingTypes.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      Sent as Meta campaign-level <code>buying_type</code>.
                      Reservation buying requires the Reach &amp; Frequency
                      reservation workflow and may depend on account
                      eligibility.
                    </p>
                    {metaBuyingType === "RESERVED" && (
                      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                        Reserved is shown as a supported Meta buying type, but
                        this builder does not yet collect reservation
                        predictions or assign a reservation to an Ad Set. Choose
                        Auction to prepare a request in this version.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Budget Level *</label>
                    <select
                      value={metaBudgetLevel}
                      onChange={(e) => {
                        setMetaBudgetLevel(e.target.value as MetaBudgetLevel);
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      <option value="CAMPAIGN">Campaign-level budget</option>
                      <option value="AD_SET">Ad set-level budget</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>
                      {metaBudgetLevel === "CAMPAIGN"
                        ? "Daily Campaign Budget"
                        : "Daily Ad Set Budget"}{" "}
                      ({selectedCurrency(connections.metaAds)}) *
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={metaDailyBudget}
                      onChange={(e) => {
                        setMetaDailyBudget(e.target.value);
                        clearPreview();
                      }}
                      placeholder="e.g. 500"
                      className={inputClass}
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      Required for either budget level. The backend must convert
                      this to the Meta API's minor currency units.
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>
                      Performance Goal (Meta optimization_goal) *
                    </label>
                    <select
                      value={effectiveMetaOptimizationGoal}
                      onChange={(e) => {
                        setMetaOptimizationGoal(e.target.value);
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      {availableMetaOptimizationOptions.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      This is an Ad Set setting in Meta, not a Campaign field.
                      Options are filtered using the selected campaign
                      objective.
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Billing Event *</label>
                    <select
                      value={metaBillingEvent}
                      onChange={(e) => {
                        setMetaBillingEvent(e.target.value);
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      <option value="IMPRESSIONS">Impressions</option>
                      <option value="LINK_CLICKS">Link Clicks</option>
                      <option value="THRUPLAY">ThruPlay</option>
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      The backend must verify that the billing event is
                      compatible with the optimization goal and account.
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Special Ad Category</label>
                    <select
                      value={metaSpecialAdCategory}
                      onChange={(e) => {
                        setMetaSpecialAdCategory(e.target.value);
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      <option value="NONE">Not applicable</option>
                      <option value="CREDIT">Credit</option>
                      <option value="EMPLOYMENT">Employment</option>
                      <option value="HOUSING">Housing</option>
                      <option value="ISSUES_ELECTIONS_POLITICS">
                        Social issues, elections or politics
                      </option>
                      <option value="ONLINE_GAMBLING_AND_GAMING">
                        Online gambling and gaming
                      </option>
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      Select the applicable category when the advertisement
                      falls into a regulated category.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              Provider validation
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-800">
              Google's performance goal is mapped to a campaign-type-compatible
              bidding strategy. Meta's buying_type belongs to the Campaign,
              while its Performance Goal (optimization_goal) and billing_event
              belong to the Ad Set. The backend must validate the combinations
              and account eligibility before creating anything.
            </p>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="mt-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold">Review your unified campaign</h2>
            <p className="mt-1 text-sm text-slate-500">
              Review each provider independently before preparing the combined
              request.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="font-bold">Shared Campaign Brief</h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["Business", businessName],
                ["Campaign", campaignName],
                ["Website", websiteUrl || "Not provided"],
                ["Objective", selectedObjective?.label || "Not selected"],
                [
                  "Platforms",
                  selectedPlatforms
                    .map((item) =>
                      item === "googleAds" ? "Google Ads" : "Meta Ads",
                    )
                    .join(" + "),
                ],
                ["Description", description || "Not provided"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs font-medium uppercase text-slate-400">
                    {label}
                  </p>
                  <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {selectedPlatforms.includes("googleAds") && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">Google Ads Configuration</h3>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p>
                  <strong>Account:</strong>{" "}
                  {selectedAccountLabel(connections.googleAds)}
                </p>
                <p>
                  <strong>Campaign Type:</strong>{" "}
                  {
                    googleCampaignTypes.find(
                      (item) => item.value === googleCampaignType,
                    )?.label
                  }
                </p>
                <p>
                  <strong>Performance Goal:</strong>{" "}
                  {
                    availableGooglePerformanceGoals.find(
                      (item) => item.value === effectiveGooglePerformanceGoal,
                    )?.label
                  }
                </p>
                <p>
                  <strong>API Bidding Strategy:</strong>{" "}
                  {selectedGooglePerformanceConfig.biddingStrategy}
                </p>
                <p>
                  <strong>Daily Budget:</strong> {googleDailyBudget}{" "}
                  {selectedCurrency(connections.googleAds)}
                </p>
              </div>
            </div>
          )}

          {selectedPlatforms.includes("metaAds") && objective && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">Meta Ads Configuration</h3>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p>
                  <strong>Account:</strong>{" "}
                  {selectedAccountLabel(connections.metaAds)}
                </p>
                <p>
                  <strong>Objective:</strong> {metaObjectiveMap[objective]}
                </p>
                <p>
                  <strong>Buying Type:</strong> {metaBuyingType}
                </p>
                <p>
                  <strong>Budget Level:</strong>{" "}
                  {metaBudgetLevel === "CAMPAIGN"
                    ? "Campaign-level"
                    : "Ad set-level"}
                </p>
                <p>
                  <strong>Daily Budget:</strong> {metaDailyBudget}{" "}
                  {selectedCurrency(connections.metaAds)}
                </p>
                <p>
                  <strong>Performance Goal (Ad Set):</strong>{" "}
                  {effectiveMetaOptimizationGoal}
                </p>
                <p>
                  <strong>Billing Event:</strong> {metaBillingEvent}
                </p>
                <p>
                  <strong>Special Ad Category:</strong> {metaSpecialAdCategory}
                </p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">Launch safety</p>
            <p className="mt-1 text-sm leading-6 text-blue-800">
              The request sets the initial status to PAUSED. Google and Meta
              campaign creation results should be tracked separately, so one
              provider's failure does not hide the other provider's result.
            </p>
          </div>

          <button
            type="button"
            onClick={prepareCampaign}
            className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Prepare Unified Campaign Request
          </button>

          {preparedPayload && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-bold">Unified Campaign Request Preview</h3>
                <button
                  type="button"
                  onClick={copyPayload}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                >
                  Copy JSON
                </button>
              </div>
              {copyNotice && (
                <p className="mt-3 text-sm text-green-700">{copyNotice}</p>
              )}
              <pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-green-300">
                {preparedPayload}
              </pre>
              <p className="mt-4 text-sm text-amber-700">
                This page prepares a request preview only. Live creation is not
                connected until the backend exposes and validates a unified
                campaign-creation endpoint.
              </p>
            </div>
          )}
        </section>
      )}

      <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-6">
        {step > 1 ? (
          <button
            type="button"
            onClick={goBack}
            className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            ← Back
          </button>
        ) : (
          <Link
            href="/dashboard"
            className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
        )}
        {step < 3 && (
          <button
            type="button"
            onClick={goNext}
            disabled={loadingConnections || Boolean(connectionError)}
            className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue →
          </button>
        )}
      </div>
    </div>
  );
}
