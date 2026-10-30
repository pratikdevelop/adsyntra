"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

type ProviderName = "googleAds" | "metaAds";
type Objective =
  | "SALES"
  | "LEADS"
  | "WEBSITE_TRAFFIC"
  | "AWARENESS"
  | "ENGAGEMENT"
  | "APP_PROMOTION";

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
  { value: "VIDEO", label: "Video" },
  { value: "DEMAND_GEN", label: "Demand Gen" },
  { value: "SHOPPING", label: "Shopping" },
];

const biddingStrategies = [
  "Maximize Conversions",
  "Maximize Conversion Value",
  "Maximize Clicks",
  "Target CPA",
  "Target ROAS",
  "Manual CPC",
];

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

function getAccountId(account: unknown): string | null {
  if (typeof account === "string") return account;

  if (!account || typeof account !== "object") return null;

  const item = account as Record<string, unknown>;

  const id =
    item.resourceName ??
    item.resource_name ??
    item.customerId ??
    item.customer_id ??
    item.accountId ??
    item.account_id ??
    item.id;

  return id === undefined || id === null ? null : String(id);
}

function getAccountName(account: unknown): string {
  if (typeof account === "string") return account;

  if (!account || typeof account !== "object") {
    return "Advertising account";
  }

  const item = account as Record<string, unknown>;

  const name =
    item.descriptiveName ??
    item.descriptive_name ??
    item.accountName ??
    item.account_name ??
    item.business_name ??
    item.name;

  return typeof name === "string" && name.trim()
    ? name
    : getAccountId(account) || "Advertising account";
}

function selectedAccountLabel(connection: ProviderConnection) {
  const selected = connection.accounts.find(
    (account) => getAccountId(account) === connection.selectedAccountId,
  );

  if (!selected) return connection.selectedAccountId || "No account selected";

  return getAccountName(selected);
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

  // Selected platforms
  const [selectedPlatforms, setSelectedPlatforms] = useState<ProviderName[]>(
    [],
  );

  // Shared campaign information
  const [campaignName, setCampaignName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState<Objective | "">("");

  // Google Ads configuration
  const [googleCampaignType, setGoogleCampaignType] = useState("SEARCH");

  const [googleBidding, setGoogleBidding] = useState("Maximize Conversions");

  const [googleDailyBudget, setGoogleDailyBudget] = useState("");

  // Meta Ads configuration
  const [metaBudgetType, setMetaBudgetType] = useState<"CAMPAIGN" | "AD_SET">(
    "CAMPAIGN",
  );

  const [metaDailyBudget, setMetaDailyBudget] = useState("");

  // Local request preview
  const [preparedPayload, setPreparedPayload] = useState("");

  // Load the user's saved advertising connections.
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

        if (!token) {
          throw new Error("Unable to get authentication token.");
        }

        const response = await fetch(`${API_BASE_URL}/api/connections/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
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

        setConnections({
          googleAds: google,
          metaAds: meta,
        });

        const available: ProviderName[] = [];

        if (google.connected && google.selectedAccountId) {
          available.push("googleAds");
        }

        if (meta.connected && meta.selectedAccountId) {
          available.push("metaAds");
        }

        // Select all providers that already have an active account.
        setSelectedPlatforms(available);
      } catch (err) {
        if (!cancelled) {
          setConnectionError(
            err instanceof Error ? err.message : "Unable to load connections.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingConnections(false);
        }
      }
    };

    void loadConnections();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn]);

  const togglePlatform = (provider: ProviderName) => {
    setError("");
    setPreparedPayload("");

    setSelectedPlatforms((previous) =>
      previous.includes(provider)
        ? previous.filter((item) => item !== provider)
        : [...previous, provider],
    );
  };

  const canUsePlatform = (provider: ProviderName) => {
    const connection = connections[provider];

    return connection.connected && Boolean(connection.selectedAccountId);
  };

  // Validate the shared campaign information.
  const validateBasics = () => {
    if (!selectedPlatforms.length) {
      setError("Select at least one connected advertising platform.");
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
        new URL(websiteUrl);
      } catch {
        setError("Enter a valid website URL, including https://.");
        return false;
      }
    }

    setError("");
    return true;
  };

  // Validate provider-specific settings.
  const validatePlatformSettings = () => {
    if (
      selectedPlatforms.includes("googleAds") &&
      (!Number.isFinite(Number(googleDailyBudget)) ||
        Number(googleDailyBudget) <= 0)
    ) {
      setError("Enter a valid Google Ads daily budget.");
      return false;
    }

    if (
      selectedPlatforms.includes("metaAds") &&
      metaBudgetType === "CAMPAIGN" &&
      (!Number.isFinite(Number(metaDailyBudget)) ||
        Number(metaDailyBudget) <= 0)
    ) {
      setError("Enter a valid Meta Ads campaign daily budget.");
      return false;
    }

    setError("");
    return true;
  };

  const goNext = () => {
    if (step === 1 && !validateBasics()) return;

    if (step === 2 && !validatePlatformSettings()) return;

    setPreparedPayload("");
    setError("");
    setStep((current) => Math.min(current + 1, 3));
  };

  const goBack = () => {
    setError("");
    setPreparedPayload("");
    setStep((current) => Math.max(current - 1, 1));
  };

  // Generate a local preview of the future backend request.
  const prepareCampaign = () => {
    if (!validateBasics() || !validatePlatformSettings()) return;

    const payload = {
      campaign: {
        name: campaignName.trim(),
        businessName: businessName.trim(),
        websiteUrl: websiteUrl.trim() || null,
        description: description.trim() || null,
        objective,
      },

      destinations: selectedPlatforms.map((provider) => {
        const accountId = connections[provider].selectedAccountId;

        if (provider === "googleAds") {
          return {
            provider: "googleAds",
            accountId,
            campaign: {
              campaignType: googleCampaignType,
              biddingStrategy: googleBidding,
              dailyBudget: Number(googleDailyBudget),
            },
          };
        }

        return {
          provider: "metaAds",
          accountId,
          campaign: {
            budgetType: metaBudgetType,
            dailyBudget:
              metaBudgetType === "CAMPAIGN" ? Number(metaDailyBudget) : null,
          },
        };
      }),
    };

    setPreparedPayload(JSON.stringify(payload, null, 2));
    setError("");
  };

  const copyPayload = async () => {
    try {
      await navigator.clipboard.writeText(preparedPayload);
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
      {/* Page heading */}
      <div>
        <p className="text-sm font-semibold text-blue-600">
          Campaign Management
        </p>

        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          Create Campaign
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Build a campaign brief and configure your advertising platforms.
        </p>
      </div>

      {/* Steps */}
      <div className="mt-8 grid grid-cols-3 gap-3">
        {[
          { number: 1, label: "Campaign Basics" },
          { number: 2, label: "Platform Settings" },
          { number: 3, label: "Review" },
        ].map((item) => (
          <div key={item.number}>
            <div
              className={`h-1.5 rounded-full ${
                step >= item.number ? "bg-blue-600" : "bg-slate-200"
              }`}
            />

            <p
              className={`mt-2 text-xs font-semibold sm:text-sm ${
                step === item.number ? "text-blue-700" : "text-slate-400"
              }`}
            >
              {item.number}. {item.label}
            </p>
          </div>
        ))}
      </div>

      {/* Connection loading */}
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

      {/* STEP 1: Campaign Basics */}
      {step === 1 && (
        <section className="mt-8 space-y-7">
          {/* Platform selection */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div>
              <h2 className="text-lg font-bold">
                1. Select advertising platforms
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                You can create campaigns on one or multiple platforms.
              </p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {(
                [
                  {
                    key: "googleAds",
                    title: "Google Ads",
                    description: "Search, Display, Video and more.",
                    letter: "G",
                  },
                  {
                    key: "metaAds",
                    title: "Meta Ads",
                    description: "Facebook and Instagram advertising.",
                    letter: "M",
                  },
                ] as const
              ).map((platform) => {
                const ready = canUsePlatform(platform.key);
                const selected = selectedPlatforms.includes(platform.key);

                const connection = connections[platform.key];

                return (
                  <button
                    type="button"
                    key={platform.key}
                    disabled={!ready || loadingConnections}
                    onClick={() => togglePlatform(platform.key)}
                    className={`rounded-xl border p-5 text-left transition ${
                      selected
                        ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                        : "border-slate-200 bg-white hover:border-blue-300"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-xl font-bold text-blue-700">
                          {platform.letter}
                        </div>

                        <div>
                          <h3 className="font-bold">{platform.title}</h3>

                          <p className="mt-1 text-xs text-slate-500">
                            {platform.description}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          selected
                            ? "bg-blue-600 text-white"
                            : ready
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {selected
                          ? "Selected"
                          : ready
                            ? "Connected"
                            : "Unavailable"}
                      </span>
                    </div>

                    {ready ? (
                      <p className="mt-4 break-all text-xs text-slate-600">
                        Account: {selectedAccountLabel(connection)}
                      </p>
                    ) : (
                      <p className="mt-4 text-xs text-amber-700">
                        Connect and select an account first.
                      </p>
                    )}
                  </button>
                );
              })}
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

          {/* General campaign information */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-bold">2. Campaign information</h2>

            <p className="mt-1 text-sm text-slate-500">
              Enter the shared details for this campaign.
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

          {/* Objective */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-bold">
              3. What is your campaign objective?
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Choose the main business outcome you want. Provider-specific
              objective mapping will be handled separately.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {objectives.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  onClick={() => setObjective(item.value)}
                  className={`rounded-xl border p-4 text-left transition ${
                    objective === item.value
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 hover:border-blue-300"
                  }`}
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

      {/* STEP 2: Platform Settings */}
      {step === 2 && (
        <section className="mt-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold">
              Platform-specific configuration
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              These settings are independent for each advertising platform.
            </p>
          </div>

          {/* Google Settings */}
          {selectedPlatforms.includes("googleAds") && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl font-bold text-blue-700">
                  G
                </div>

                <div>
                  <h3 className="font-bold">Google Ads Settings</h3>
                  <p className="text-xs text-slate-500">
                    {selectedAccountLabel(connections.googleAds)}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Google Campaign Type *</label>

                  <select
                    value={googleCampaignType}
                    onChange={(e) => setGoogleCampaignType(e.target.value)}
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
                  <label className={labelClass}>Bidding Strategy *</label>

                  <select
                    value={googleBidding}
                    onChange={(e) => setGoogleBidding(e.target.value)}
                    className={inputClass}
                  >
                    {biddingStrategies.map((strategy) => (
                      <option key={strategy} value={strategy}>
                        {strategy}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Daily Budget *</label>

                  <input
                    type="number"
                    min="1"
                    value={googleDailyBudget}
                    onChange={(e) => setGoogleDailyBudget(e.target.value)}
                    placeholder="e.g. 500"
                    className={inputClass}
                  />

                  <p className="mt-2 text-xs text-slate-500">
                    Amount in your Google Ads account currency.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Meta Settings */}
          {selectedPlatforms.includes("metaAds") && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl font-bold text-blue-700">
                  M
                </div>

                <div>
                  <h3 className="font-bold">Meta Ads Settings</h3>
                  <p className="text-xs text-slate-500">
                    {selectedAccountLabel(connections.metaAds)}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <label className={labelClass}>Budget Level *</label>

                <select
                  value={metaBudgetType}
                  onChange={(e) =>
                    setMetaBudgetType(e.target.value as "CAMPAIGN" | "AD_SET")
                  }
                  className={inputClass}
                >
                  <option value="CAMPAIGN">Campaign-level budget</option>

                  <option value="AD_SET">Ad set-level budget</option>
                </select>

                <p className="mt-2 text-xs text-slate-500">
                  Campaign-level budget is managed at the campaign level. Ad
                  set-level budget will be configured during ad set setup.
                </p>
              </div>

              {metaBudgetType === "CAMPAIGN" && (
                <div className="mt-5">
                  <label className={labelClass}>Daily Campaign Budget *</label>

                  <input
                    type="number"
                    min="1"
                    value={metaDailyBudget}
                    onChange={(e) => setMetaDailyBudget(e.target.value)}
                    placeholder="e.g. 500"
                    className={inputClass}
                  />

                  <p className="mt-2 text-xs text-slate-500">
                    Amount in your Meta ad account currency.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Important</p>

            <p className="mt-1 text-sm leading-6 text-amber-800">
              Campaign types and bidding strategies must be compatible with the
              selected objective and account. Final API validation will check
              the provider-specific requirements before publishing.
            </p>
          </div>
        </section>
      )}

      {/* STEP 3: Review */}
      {step === 3 && (
        <section className="mt-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold">Review your campaign</h2>

            <p className="mt-1 text-sm text-slate-500">
              Check the campaign brief and platform configurations.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="font-bold">Campaign Overview</h3>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["Business", businessName],
                ["Campaign", campaignName],
                ["Website", websiteUrl || "Not provided"],
                ["Objective", selectedObjective?.label || "Not selected"],
                ["Platforms", selectedPlatforms.join(", ")],
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
                  <strong>Campaign Type:</strong> {googleCampaignType}
                </p>

                <p>
                  <strong>Bidding:</strong> {googleBidding}
                </p>

                <p>
                  <strong>Daily Budget:</strong> {googleDailyBudget}
                </p>
              </div>
            </div>
          )}

          {selectedPlatforms.includes("metaAds") && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">Meta Ads Configuration</h3>

              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p>
                  <strong>Account:</strong>{" "}
                  {selectedAccountLabel(connections.metaAds)}
                </p>

                <p>
                  <strong>Budget Level:</strong>{" "}
                  {metaBudgetType === "CAMPAIGN"
                    ? "Campaign-level"
                    : "Ad set-level"}
                </p>

                {metaBudgetType === "CAMPAIGN" && (
                  <p>
                    <strong>Daily Budget:</strong> {metaDailyBudget}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">
              Before publishing
            </p>

            <p className="mt-1 text-sm leading-6 text-blue-800">
              Audience targeting, ad groups/ad sets, advertisements, creative
              assets and final provider validation will be configured in the
              next stages of campaign creation.
            </p>
          </div>

          <button
            type="button"
            onClick={prepareCampaign}
            className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Prepare Campaign Request
          </button>

          {preparedPayload && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-bold">Campaign Request Preview</h3>

                <button
                  type="button"
                  onClick={copyPayload}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                >
                  Copy JSON
                </button>
              </div>

              <pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-green-300">
                {preparedPayload}
              </pre>

              <p className="mt-4 text-sm text-amber-700">
                This is a local request preview only. Live campaign creation has
                not yet been connected to the backend.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Navigation Buttons */}
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
