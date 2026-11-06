"use client";

import { useAuth } from "@clerk/nextjs";
import { useState, type FormEvent } from "react";

type MatchType = "BROAD" | "PHRASE" | "EXACT";

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getResponseMessage(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("message" in data)) {
    return null;
  }

  const message = (data as { message?: unknown }).message;

  return typeof message === "string" ? message : null;
}

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const labelClass = "mb-1 block text-sm font-medium text-gray-700";

export default function GoogleAdsTestCampaignPage() {
  const { isLoaded, isSignedIn } = useAuth();

  const [accountId, setAccountId] = useState("");
  const [businessName, setBusinessName] = useState("Demo Business");
  const [campaignName, setCampaignName] = useState(
    "Google Search Validation Test",
  );
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("100");

  const [matchType, setMatchType] = useState<MatchType>("BROAD");

  const [keywords, setKeywords] = useState("example product");

  const [headlines, setHeadlines] = useState(
    "Discover Our Products\nShop Online Today\nExplore Great Offers",
  );

  const [descriptions, setDescriptions] = useState(
    "Discover our products and explore our latest offers.\nShop online and learn more about what we offer.",
  );

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");

  const testCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");
      setResult(null);

      const normalizedAccountId = accountId.trim();
      const normalizedCampaignName = campaignName.trim();
      const normalizedBusinessName = businessName.trim();
      const normalizedWebsiteUrl = websiteUrl.trim();

      const amount = Number(budgetAmount);

      const positiveKeywords = splitLines(keywords).map((text) => ({
        text,
        matchType,
      }));

      const headlineItems = splitLines(headlines);
      const descriptionItems = splitLines(descriptions);

      if (!normalizedAccountId) {
        throw new Error("Google Ads Customer ID is required.");
      }

      if (!normalizedCampaignName || !normalizedBusinessName) {
        throw new Error("Campaign name and business name are required.");
      }

      if (!normalizedWebsiteUrl) {
        throw new Error("Website URL is required.");
      }

      try {
        const parsedUrl = new URL(normalizedWebsiteUrl);

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          throw new Error("Invalid protocol.");
        }
      } catch {
        throw new Error("Enter a valid HTTP or HTTPS website URL.");
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Daily budget must be greater than zero.");
      }

      if (positiveKeywords.length === 0) {
        throw new Error("Enter at least one positive keyword.");
      }

      if (headlineItems.length < 3 || headlineItems.length > 15) {
        throw new Error("Enter between 3 and 15 headlines.");
      }

      if (descriptionItems.length < 2 || descriptionItems.length > 4) {
        throw new Error("Enter between 2 and 4 descriptions.");
      }

      const payload = {
        name: normalizedCampaignName,
        businessName: normalizedBusinessName,
        websiteUrl: normalizedWebsiteUrl,
        description: "Google Search campaign validation test",
        objective: "SALES",

        platforms: ["googleAds"],

        providers: {
          googleAds: {
            accountId: normalizedAccountId,
            providerObjective: "SALES",
            providerCampaignType: "SEARCH",

            configuration: {
              budget: {
                name: `${normalizedCampaignName} - Daily Budget`,
                amount,
              },

              campaign: {
                name: normalizedCampaignName,
                biddingStrategy: "MAXIMIZE_CLICKS",
              },

              adGroup: {
                name: `${normalizedCampaignName} - Ad Group`,
              },

              keywords: {
                positive: positiveKeywords,
              },

              ad: {
                finalUrl: normalizedWebsiteUrl,
                headlines: headlineItems,
                descriptions: descriptionItems,
              },
            },
          },
        },

        // Safety: this UI test never creates live resources.
        execution: {
          validateOnly: false,
          confirm: true,
        },
      };

      // Same-origin Next.js API proxy.
      // The proxy handles Clerk authentication server-side.
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          getResponseMessage(data) ??
            `Campaign request failed with status ${response.status}.`,
        );
      }

      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Google Ads campaign validation failed.",
      );
    } finally {
      setLoading(false);
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
          Google Ads Search Campaign Testing
        </h1>

        <p className="mt-2 text-sm text-gray-600">
          Test your existing Google Ads Search campaign creation flow through
          the global campaign API.
        </p>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h2 className="font-semibold text-blue-900">Validation-only mode</h2>

        <p className="mt-1 text-sm text-blue-800">
          This test sends validateOnly: true and confirm: false. Google Ads
          validates the operations, but no live campaign resources are created.
        </p>
      </div>

      <form onSubmit={testCampaign} className="space-y-6">
        <section className="space-y-4 rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900">
            1. Google Ads Account
          </h2>

          <div>
            <label className={labelClass}>Google Ads Customer ID</label>

            <input
              className={inputClass}
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              placeholder="Enter your connected Google Ads Customer ID"
              required
            />

            <p className="mt-1 text-xs text-gray-500">
              Enter the account ID exactly as stored in your connected
              advertising account.
            </p>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900">
            2. Campaign Details
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
            <label className={labelClass}>Website / Final URL</label>

            <input
              className={inputClass}
              type="url"
              value={websiteUrl}
              onChange={(event) => setWebsiteUrl(event.target.value)}
              placeholder="https://example.com"
              required
            />
          </div>

          <div>
            <label className={labelClass}>
              Daily Budget (account currency)
            </label>

            <input
              className={inputClass}
              type="number"
              min="0.01"
              step="0.01"
              value={budgetAmount}
              onChange={(event) => setBudgetAmount(event.target.value)}
              required
            />

            <p className="mt-1 text-xs text-gray-500">
              Enter the amount in your Google Ads account currency, not micros.
            </p>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900">
            3. Search Configuration
          </h2>

          <div>
            <label className={labelClass}>Bidding Strategy</label>

            <input className={inputClass} value="MAXIMIZE_CLICKS" readOnly />
          </div>

          <div>
            <label className={labelClass}>Keyword Match Type</label>

            <select
              className={inputClass}
              value={matchType}
              onChange={(event) =>
                setMatchType(event.target.value as MatchType)
              }
            >
              <option value="BROAD">Broad</option>
              <option value="PHRASE">Phrase</option>
              <option value="EXACT">Exact</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Positive Keywords</label>

            <textarea
              className={inputClass}
              rows={4}
              value={keywords}
              onChange={(event) => setKeywords(event.target.value)}
              placeholder={"Enter one keyword per line"}
              required
            />

            <p className="mt-1 text-xs text-gray-500">
              Each non-empty line becomes one positive keyword.
            </p>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900">
            4. Responsive Search Ad
          </h2>

          <div>
            <label className={labelClass}>Headlines (one per line)</label>

            <textarea
              className={inputClass}
              rows={5}
              value={headlines}
              onChange={(event) => setHeadlines(event.target.value)}
              required
            />

            <p className="mt-1 text-xs text-gray-500">
              Enter 3–15 unique headlines, each up to 30 characters.
            </p>
          </div>

          <div>
            <label className={labelClass}>Descriptions (one per line)</label>

            <textarea
              className={inputClass}
              rows={4}
              value={descriptions}
              onChange={(event) => setDescriptions(event.target.value)}
              required
            />

            <p className="mt-1 text-xs text-gray-500">
              Enter 2–4 unique descriptions, each up to 90 characters.
            </p>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="font-medium text-red-800">
              Campaign validation failed
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
          {loading
            ? "Validating Google Ads Campaign..."
            : "Validate Google Search Campaign"}
        </button>
      </form>

      {result !== null && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              API Response
            </h2>

            <p className="text-sm text-gray-600">
              Review the global campaign response and Google Ads validation
              result below.
            </p>
          </div>

          <pre className="max-h-[600px] overflow-auto rounded-xl bg-gray-950 p-5 text-xs text-green-300">
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}
