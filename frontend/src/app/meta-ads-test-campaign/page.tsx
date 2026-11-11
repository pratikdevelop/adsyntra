"use client";

import { useAuth } from "@clerk/nextjs";
import { useState, type FormEvent } from "react";

type MetaObjective = "OUTCOME_TRAFFIC" | "OUTCOME_SALES";
type MetaBudgetLevel = "CAMPAIGN" | "AD_SET";

type MetaCallToAction =
  | "LEARN_MORE"
  | "SHOP_NOW"
  | "SIGN_UP"
  | "CONTACT_US"
  | "GET_QUOTE"
  | "DOWNLOAD";

type SpecialAdCategory =
  | "HOUSING"
  | "EMPLOYMENT"
  | "CREDIT"
  | "ISSUES_ELECTIONS_POLITICS";

function getResponseMessage(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("message" in data)) {
    return null;
  }

  const message = (data as { message?: unknown }).message;
  return typeof message === "string" ? message : null;
}

function getCampaignId(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("campaign" in data)) {
    return null;
  }

  const campaign = (data as { campaign?: unknown }).campaign;

  if (
    typeof campaign !== "object" ||
    campaign === null ||
    !("id" in campaign)
  ) {
    return null;
  }

  const id = (campaign as { id?: unknown }).id;

  return typeof id === "string" ? id : null;
}

function splitCommaValues(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function isValidHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const labelClass = "mb-1 block text-sm font-medium text-gray-700";

const objectiveOptions: Record<
  MetaObjective,
  {
    label: string;
    sharedObjective: string;
    optimizationGoal: string;
    billingEvent: string;
  }
> = {
  OUTCOME_TRAFFIC: {
    label: "Website Traffic",
    sharedObjective: "WEBSITE_TRAFFIC",
    optimizationGoal: "LINK_CLICKS",
    billingEvent: "IMPRESSIONS",
  },
  OUTCOME_SALES: {
    label: "Sales",
    sharedObjective: "SALES",
    optimizationGoal: "OFFSITE_CONVERSIONS",
    billingEvent: "IMPRESSIONS",
  },
};

const specialCategories: {
  value: SpecialAdCategory;
  label: string;
}[] = [
  { value: "HOUSING", label: "Housing" },
  { value: "EMPLOYMENT", label: "Employment" },
  { value: "CREDIT", label: "Credit" },
  {
    value: "ISSUES_ELECTIONS_POLITICS",
    label: "Social issues, elections or politics",
  },
];

export default function MetaAdsTestCampaignPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  // Meta account and shared campaign details.
  const [accountId, setAccountId] = useState("1820194389321017");
  const [businessName, setBusinessName] = useState("Demo Business");
  const [campaignName, setCampaignName] = useState(
    "Meta Website Traffic Validation Test",
  );
  const [websiteUrl, setWebsiteUrl] = useState("https://example.com");

  // Campaign configuration.
  const [metaObjective, setMetaObjective] =
    useState<MetaObjective>("OUTCOME_TRAFFIC");

  const [buyingType] = useState<"AUCTION">("AUCTION");

  const [specialAdCategory, setSpecialAdCategory] = useState<
    SpecialAdCategory | "NONE"
  >("NONE");

  // Budget configuration.
  const [budgetLevel, setBudgetLevel] = useState<MetaBudgetLevel>("CAMPAIGN");

  const [dailyBudget, setDailyBudget] = useState("500");
  const [budgetCurrency, setBudgetCurrency] = useState("INR");

  // Ad Set configuration.
  const [adSetName, setAdSetName] = useState("Meta Test - Ad Set");

  const [countries, setCountries] = useState("IN");
  const [minimumAge, setMinimumAge] = useState("18");
  const [maximumAge, setMaximumAge] = useState("65");

  const [gender, setGender] = useState<"ALL" | "MEN" | "WOMEN">("ALL");

  // Sales conversion configuration.
  const [pixelId, setPixelId] = useState("");
  const [conversionEvent, setConversionEvent] = useState("PURCHASE");

  // Ad Creative configuration.
  const [pageId, setPageId] = useState("1383140784881581");
  const [instagramActorId, setInstagramActorId] = useState("");

  const [primaryText, setPrimaryText] = useState(
    "Discover our latest products and explore exclusive offers.",
  );

  const [headline, setHeadline] = useState("Discover Our Products");

  const [creativeDescription, setCreativeDescription] = useState(
    "Shop online and explore our latest collection.",
  );

  const [imageUrl, setImageUrl] = useState(
    "https://mamp.one/wp-content/uploads/2024/09/image-resources2.jpg",
  );
  const [callToAction, setCallToAction] =
    useState<MetaCallToAction>("LEARN_MORE");

  // Ad configuration.
  const [adName, setAdName] = useState("Meta Website Traffic Test Ad");

  // Request state.
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");

  const [retryLoading, setRetryLoading] = useState(false);
  const [retryResult, setRetryResult] = useState<unknown>(null);
  const [retryError, setRetryError] = useState("");
  const [campaignIdForRetry, setCampaignIdForRetry] = useState("");

  const testCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");
      setResult(null);

      const accountIdValue = accountId.trim();

      const normalizedAccountId = accountIdValue.startsWith("act_")
        ? accountIdValue
        : `act_${accountIdValue}`;
      const normalizedBusinessName = businessName.trim();
      const normalizedCampaignName = campaignName.trim();
      const normalizedWebsiteUrl = websiteUrl.trim();

      const normalizedPageId = pageId.trim();
      const normalizedImageUrl = imageUrl.trim();

      const amount = Number(dailyBudget);
      const minAge = Number(minimumAge);
      const maxAge = Number(maximumAge);

      const selectedObjective = objectiveOptions[metaObjective];

      const countryCodes = splitCommaValues(countries);

      // Account validation.
      if (!normalizedAccountId) {
        throw new Error("Meta Ads Account ID is required.");
      }

      if (!/^(act_)?\d+$/.test(normalizedAccountId)) {
        throw new Error(
          "Enter a numeric Meta Ad Account ID, optionally prefixed with act_.",
        );
      }

      // Shared campaign validation.
      if (!normalizedCampaignName || !normalizedBusinessName) {
        throw new Error("Campaign name and business name are required.");
      }

      if (normalizedCampaignName.length > 255) {
        throw new Error("Campaign name must not exceed 255 characters.");
      }

      if (!isValidHttpsUrl(normalizedWebsiteUrl)) {
        throw new Error("Enter a valid HTTPS website URL.");
      }

      // Budget validation.
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Daily budget must be greater than zero.");
      }

      if (!/^[A-Z]{3}$/i.test(budgetCurrency.trim())) {
        throw new Error(
          "Enter a valid three-letter budget currency, such as INR or USD.",
        );
      }

      // Targeting validation.
      if (
        countryCodes.length === 0 ||
        countryCodes.some((country) => !/^[A-Z]{2}$/.test(country))
      ) {
        throw new Error(
          "Enter valid two-letter country codes, such as IN or US.",
        );
      }

      if (
        !Number.isInteger(minAge) ||
        !Number.isInteger(maxAge) ||
        minAge < 18 ||
        maxAge > 65 ||
        minAge > maxAge
      ) {
        throw new Error("Enter a valid age range between 18 and 65.");
      }

      // Creative validation.
      if (!/^\d+$/.test(normalizedPageId)) {
        throw new Error("A valid numeric Facebook Page ID is required.");
      }

      if (instagramActorId.trim() && !/^\d+$/.test(instagramActorId.trim())) {
        throw new Error("Instagram Actor ID must be numeric.");
      }

      if (!primaryText.trim() || !headline.trim()) {
        throw new Error("Primary text and headline are required.");
      }

      if (!isValidHttpsUrl(normalizedImageUrl)) {
        throw new Error("Enter a valid HTTPS image URL.");
      }

      // Sales campaigns require a conversion source.
      if (metaObjective === "OUTCOME_SALES") {
        if (!/^\d+$/.test(pixelId.trim())) {
          throw new Error(
            "A valid numeric Meta Pixel ID is required for Sales campaigns.",
          );
        }

        if (!conversionEvent.trim()) {
          throw new Error("Select or enter a Meta conversion event.");
        }
      }

      const selectedSpecialCategories =
        specialAdCategory === "NONE" ? [] : [specialAdCategory];

      const targeting = {
        geo_locations: {
          countries: countryCodes,
        },
        age_min: minAge,
        age_max: maxAge,
        ...(gender !== "ALL" && {
          genders: [gender === "MEN" ? 1 : 2],
        }),
      };

      const campaignConfiguration = {
        name: normalizedCampaignName,
        objective: metaObjective,
        buying_type: buyingType,
        special_ad_categories: selectedSpecialCategories,
        budgetLevel,

        ...(budgetLevel === "CAMPAIGN" && {
          dailyBudgetAmount: amount,
          budgetCurrency: budgetCurrency.trim().toUpperCase(),
          bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        }),
      };

      const adSetConfiguration = {
        name: adSetName.trim(),
        optimization_goal: selectedObjective.optimizationGoal,
        billing_event: selectedObjective.billingEvent,
        targeting,
        destinationType: "WEBSITE",
        placements: {
          mode: "AUTOMATIC",
        },
        budgetLevel,

        ...(budgetLevel === "AD_SET" && {
          dailyBudgetAmount: amount,
          budgetCurrency: budgetCurrency.trim().toUpperCase(),
          bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        }),

        ...(metaObjective === "OUTCOME_SALES" && {
          promoted_object: {
            pixel_id: pixelId.trim(),
            custom_event_type: conversionEvent.trim().toUpperCase(),
          },
        }),
      };

      const creativeDraft = {
        name: `${adName.trim()} Creative`,
        pageId: normalizedPageId,

        ...(instagramActorId.trim() && {
          instagramActorId: instagramActorId.trim(),
        }),

        primaryText: primaryText.trim(),
        headline: headline.trim(),
        description: creativeDescription.trim() || undefined,
        imageUrl: normalizedImageUrl,
        destinationUrl: normalizedWebsiteUrl,
        callToAction,
      };

      const payload = {
        name: normalizedCampaignName,
        businessName: normalizedBusinessName,
        websiteUrl: normalizedWebsiteUrl,
        description: "Meta Ads single-image website campaign test",
        objective: selectedObjective.sharedObjective,

        platforms: ["metaAds"],

        providers: {
          metaAds: {
            accountId: normalizedAccountId,
            providerObjective: metaObjective,
            providerCampaignType: "STANDARD",

            configuration: {
              campaign: campaignConfiguration,
              adSet: adSetConfiguration,
              ad: {
                name: adName.trim(),
                creativeDraft,
              },
            },
          },
        },

        // Safety: validation-only mode.
        execution: {
          validateOnly: false,
          confirm: true,
        },
      };

      // Same-origin Next.js API proxy.
      // Clerk authentication is handled by the proxy.
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();

      let data: unknown = null;

      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        data = responseText;
      }

      console.log("Meta Campaign HTTP Status:", response.status);
      console.log("Meta Campaign Response:", data);

      setResult(data);

      if (!response.ok) {
        const message =
          getResponseMessage(data) ??
          (typeof data === "string" && data.trim()
            ? data
            : response.statusText);

        throw new Error(
          `HTTP ${response.status}: ${message || "Meta campaign request failed."}`,
        );
      }

      const campaignId = getCampaignId(data);

      if (campaignId) {
        setCampaignIdForRetry(campaignId);
      } else {
        setCampaignIdForRetry("");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Meta Ads campaign validation failed.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRetryMetaAdSet = async () => {
    if (!campaignIdForRetry) {
      setRetryError("Campaign ID is missing.");
      return;
    }

    try {
      setRetryLoading(true);
      setRetryError("");
      setRetryResult(null);

      const token = await getToken();

      if (!token) {
        throw new Error("Unable to retrieve your authentication token.");
      }

      const response = await fetch(
        `/api/campaigns/${campaignIdForRetry}/meta/ad-set/retry`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
          body: JSON.stringify({
            confirm: true,
            billing_event: "IMPRESSIONS",
          }),
        },
      );

      const data: unknown = await response.json().catch(() => null);

      setRetryResult(data);

      if (!response.ok) {
        throw new Error(
          getResponseMessage(data) ??
            `Ad Set retry failed with status ${response.status}.`,
        );
      }
    } catch (err) {
      setRetryError(
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setRetryLoading(false);
    }
  };
  if (!isLoaded) {
    return <p className="p-8">Loading authentication...</p>;
  }

  if (!isSignedIn) {
    return <p className="p-8">Please sign in first.</p>;
  }
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Meta Ads Campaign Testing
        </h1>

        <p className="mt-2 text-sm text-gray-600">
          Test the Meta campaign creation flow through the global campaign API.
        </p>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h2 className="font-semibold text-blue-900">Validation-only mode</h2>

        <p className="mt-1 text-sm text-blue-800">
          This request uses validateOnly: true and confirm: false. The backend
          validates the campaign, Ad Set and creative configuration without
          creating live Meta resources.
        </p>

        <p className="mt-2 text-xs text-blue-800">
          Note: Meta does not provide a single dry-run operation for this full
          multi-resource workflow. This mode runs the backend's local
          validation; it does not prove that every live Graph API request will
          be accepted.
        </p>
      </div>

      <form onSubmit={testCampaign} className="space-y-6">
        {/* 1. Account */}
        <section className="space-y-4 rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900">
            1. Meta Ads Account
          </h2>

          <div>
            <label className={labelClass}>Meta Ad Account ID</label>

            <input
              className={inputClass}
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              placeholder="Enter your connected Meta Ad Account ID"
              required
            />

            <p className="mt-1 text-xs text-gray-500">
              Enter the account ID as stored in your connected advertising
              account. Numeric ID or act_ prefixed ID is accepted by the
              creation service.
            </p>
          </div>
        </section>

        {/* 2. Campaign */}
        <section className="space-y-4 rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900">
            2. Campaign Configuration
          </h2>

          <div>
            <label className={labelClass}>Business Name</label>

            <input
              className={inputClass}
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Campaign Name</label>

            <input
              className={inputClass}
              value={campaignName}
              onChange={(event) => setCampaignName(event.target.value)}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Campaign Objective</label>

            <select
              className={inputClass}
              value={metaObjective}
              onChange={(event) =>
                setMetaObjective(event.target.value as MetaObjective)
              }
            >
              <option value="OUTCOME_TRAFFIC">Website Traffic</option>

              <option value="OUTCOME_SALES">Sales</option>
            </select>

            <p className="mt-1 text-xs text-gray-500">
              The selected objective determines the Ad Set optimization goal and
              billing event.
            </p>
          </div>

          <div>
            <label className={labelClass}>Buying Type</label>

            <input className={inputClass} value="AUCTION" readOnly />
          </div>

          <div>
            <label className={labelClass}>Special Ad Category</label>

            <select
              className={inputClass}
              value={specialAdCategory}
              onChange={(event) =>
                setSpecialAdCategory(
                  event.target.value as SpecialAdCategory | "NONE",
                )
              }
            >
              <option value="NONE">None</option>

              {specialCategories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Website URL</label>

            <input
              className={inputClass}
              type="url"
              value={websiteUrl}
              onChange={(event) => setWebsiteUrl(event.target.value)}
              placeholder="https://example.com"
              required
            />
          </div>
        </section>

        {/* 3. Budget */}
        <section className="space-y-4 rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900">
            3. Budget and Bidding
          </h2>

          <div>
            <label className={labelClass}>Budget Level</label>

            <select
              className={inputClass}
              value={budgetLevel}
              onChange={(event) =>
                setBudgetLevel(event.target.value as MetaBudgetLevel)
              }
            >
              <option value="CAMPAIGN">Campaign Budget (CBO)</option>

              <option value="AD_SET">Ad Set Budget (ABO)</option>
            </select>

            <p className="mt-1 text-xs text-gray-500">
              The budget is sent to only one level. Campaign budget and Ad Set
              budget are never sent together.
            </p>
          </div>

          <div>
            <label className={labelClass}>Daily Budget</label>

            <input
              className={inputClass}
              type="number"
              min="0.01"
              step="0.01"
              value={dailyBudget}
              onChange={(event) => setDailyBudget(event.target.value)}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Ad Account Currency</label>

            <input
              className={inputClass}
              value={budgetCurrency}
              onChange={(event) =>
                setBudgetCurrency(event.target.value.toUpperCase())
              }
              placeholder="INR"
              maxLength={3}
              required
            />

            <p className="mt-1 text-xs text-gray-500">
              This must match the selected Meta Ad Account's currency. Enter the
              amount in major currency units.
            </p>
          </div>

          <div>
            <label className={labelClass}>Bid Strategy</label>

            <input
              className={inputClass}
              value="LOWEST_COST_WITHOUT_CAP"
              readOnly
            />

            <p className="mt-1 text-xs text-gray-500">
              Highest volume without a bid cap.
            </p>
          </div>
        </section>

        {/* 4. Ad Set */}
        <section className="space-y-4 rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900">
            4. Ad Set Configuration
          </h2>

          <div>
            <label className={labelClass}>Ad Set Name</label>

            <input
              className={inputClass}
              value={adSetName}
              onChange={(event) => setAdSetName(event.target.value)}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Optimization Goal</label>

            <input
              className={inputClass}
              value={objectiveOptions[metaObjective].optimizationGoal}
              readOnly
            />
          </div>

          <div>
            <label className={labelClass}>Billing Event</label>

            <input
              className={inputClass}
              value={objectiveOptions[metaObjective].billingEvent}
              readOnly
            />
          </div>

          <div>
            <label className={labelClass}>Target Countries</label>

            <input
              className={inputClass}
              value={countries}
              onChange={(event) => setCountries(event.target.value)}
              placeholder="IN, US"
              required
            />

            <p className="mt-1 text-xs text-gray-500">
              Enter ISO two-letter country codes, separated by commas.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Minimum Age</label>

              <input
                className={inputClass}
                type="number"
                min="18"
                max="65"
                value={minimumAge}
                onChange={(event) => setMinimumAge(event.target.value)}
                required
              />
            </div>

            <div>
              <label className={labelClass}>Maximum Age</label>

              <input
                className={inputClass}
                type="number"
                min="18"
                max="65"
                value={maximumAge}
                onChange={(event) => setMaximumAge(event.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Gender</label>

            <select
              className={inputClass}
              value={gender}
              onChange={(event) =>
                setGender(event.target.value as "ALL" | "MEN" | "WOMEN")
              }
            >
              <option value="ALL">All</option>
              <option value="MEN">Men</option>
              <option value="WOMEN">Women</option>
            </select>
          </div>

          {metaObjective === "OUTCOME_SALES" && (
            <>
              <div>
                <label className={labelClass}>Meta Pixel ID</label>

                <input
                  className={inputClass}
                  value={pixelId}
                  onChange={(event) => setPixelId(event.target.value)}
                  placeholder="Enter numeric Pixel ID"
                  required
                />
              </div>

              <div>
                <label className={labelClass}>Conversion Event</label>

                <select
                  className={inputClass}
                  value={conversionEvent}
                  onChange={(event) => setConversionEvent(event.target.value)}
                >
                  <option value="PURCHASE">Purchase</option>
                  <option value="ADD_TO_CART">Add to Cart</option>
                  <option value="LEAD">Lead</option>
                  <option value="INITIATED_CHECKOUT">Initiated Checkout</option>
                  <option value="COMPLETE_REGISTRATION">
                    Complete Registration
                  </option>
                </select>
              </div>
            </>
          )}
        </section>

        {/* 5. Creative */}
        <section className="space-y-4 rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900">
            5. Ad Creative Configuration
          </h2>

          <div>
            <label className={labelClass}>Facebook Page ID</label>

            <input
              className={inputClass}
              value={pageId}
              onChange={(event) => setPageId(event.target.value)}
              placeholder="Enter numeric Facebook Page ID"
              required
            />
          </div>

          <div>
            <label className={labelClass}>Instagram Actor ID (Optional)</label>

            <input
              className={inputClass}
              value={instagramActorId}
              onChange={(event) => setInstagramActorId(event.target.value)}
              placeholder="Enter Instagram Actor ID"
            />
          </div>

          <div>
            <label className={labelClass}>Primary Text</label>

            <textarea
              className={inputClass}
              rows={4}
              value={primaryText}
              onChange={(event) => setPrimaryText(event.target.value)}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Headline</label>

            <input
              className={inputClass}
              value={headline}
              onChange={(event) => setHeadline(event.target.value)}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Description (Optional)</label>

            <textarea
              className={inputClass}
              rows={2}
              value={creativeDescription}
              onChange={(event) => setCreativeDescription(event.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>Image URL</label>

            <input
              className={inputClass}
              type="url"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="https://example.com/image.jpg"
              required
            />

            <p className="mt-1 text-xs text-gray-500">
              Use a publicly accessible HTTPS image URL.
            </p>
          </div>

          <div>
            <label className={labelClass}>Call to Action</label>

            <select
              className={inputClass}
              value={callToAction}
              onChange={(event) =>
                setCallToAction(event.target.value as MetaCallToAction)
              }
            >
              <option value="LEARN_MORE">Learn More</option>
              <option value="SHOP_NOW">Shop Now</option>
              <option value="SIGN_UP">Sign Up</option>
              <option value="CONTACT_US">Contact Us</option>
              <option value="GET_QUOTE">Get Quote</option>
              <option value="DOWNLOAD">Download</option>
            </select>
          </div>
        </section>

        {/* 6. Ad */}
        <section className="space-y-4 rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900">
            6. Ad Configuration
          </h2>

          <div>
            <label className={labelClass}>Ad Name</label>

            <input
              className={inputClass}
              value={adName}
              onChange={(event) => setAdName(event.target.value)}
              required
            />
          </div>

          <p className="text-xs text-gray-500">
            The backend creates the Ad Creative first, then uses its generated
            ID and the Ad Set ID to create the Ad.
          </p>
        </section>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="font-medium text-red-800">
              Meta campaign validation failed
            </p>

            <p className="mt-1 whitespace-pre-wrap text-sm text-red-700">
              {error}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Creating Meta Campaign..." : "Create Meta Campaign"}
        </button>
      </form>

      {result !== null && (
        <>
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                API Response
              </h2>

              <p className="text-sm text-gray-600">
                Review the global campaign response, Meta creation status and
                provider errors. with retry
              </p>
            </div>

            <pre className="max-h-[600px] overflow-auto rounded-xl bg-gray-950 p-5 text-xs text-green-300">
              {JSON.stringify(result, null, 2)}
            </pre>
          </section>

          {campaignIdForRetry && (
            <section className="space-y-4 rounded-xl border border-orange-200 bg-orange-50 p-5">
              <div>
                <h2 className="text-lg font-semibold text-orange-900">
                  Retry Meta Ad Set Creation
                </h2>
                <p className="mt-2 text-sm text-orange-800">
                  This retries only Ad Set creation using the existing Campaign
                  ID. It will not create another Campaign.
                </p>
                <p className="mt-2 break-all text-xs text-gray-700">
                  Campaign ID: {campaignIdForRetry}
                </p>{" "}
              </div>

              <button
                type="button"
                onClick={handleRetryMetaAdSet}
                disabled={retryLoading}
                className="rounded-lg bg-orange-600 px-5 py-3 font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {retryLoading ? "Retrying Ad Set..." : "Retry Meta Ad Set"}
              </button>

              {retryError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="font-medium text-red-800">Retry Failed</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-red-700">
                    {retryError}
                  </p>
                </div>
              )}

              {retryResult !== null && (
                <div>
                  <h3 className="mb-2 font-semibold text-gray-900">
                    Retry API Response
                  </h3>

                  <pre className="max-h-[500px] overflow-auto rounded-lg bg-gray-950 p-4 text-xs text-green-300">
                    {JSON.stringify(retryResult, null, 2)}
                  </pre>
                </div>
              )}
            </section>
          )}
        </>
      )}
      {/* {campaignIdForRetry && (
<div className="mt-6 rounded-lg border p-4">
  <h3 className="text-lg font-semibold">
    Retry Meta Ad Set Creation
  </h3>

  <p className="mt-2 text-sm text-gray-500">
    Campaign ID: {campaignIdForRetry}
  </p>

  <button
    type="button"
    onClick={handleRetryMetaAdSet}
    disabled={retryLoading}
    className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
  >
    {retryLoading ? "Retrying Ad Set..." : "Retry Meta Ad Set"}
  </button>

  {retryError && (
    <pre className="mt-4 whitespace-pre-wrap text-sm text-red-500">
      {retryError}
    </pre>
  )}

  {retryResult && (
    <pre className="mt-4 overflow-auto rounded-md bg-gray-100 p-3 text-sm">
      {JSON.stringify(retryResult, null, 2)}
    </pre>
  )}
</div>
)} */}
    </main>
  );
}
