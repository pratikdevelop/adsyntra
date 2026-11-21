"use client";

import { FormEvent, useState } from "react";

const RETRY_OPTIONS = {
  META_AD_SET: {
    label: "Meta Ads — Retry Ad Set",
    path: "meta/ad-set/retry",
    description: "Retry creation of the missing Meta Ad Set.",
    defaultPayload: { confirm: true },
  },
  META_CREATIVE: {
    label: "Meta Ads — Retry Creative",
    path: "meta/creative/retry",
    description: "Retry creation of the Meta Ad Creative.",
    defaultPayload: { confirm: true },
  },
} as const;

type RetryType = keyof typeof RETRY_OPTIONS;

interface ApiResult {
  status: number;
  success: boolean;
  data: unknown;
}

export default function CampaignRetryPage() {
  const [campaignId, setCampaignId] = useState("6af467de35de4a0f7ee4be60");

  const [retryType, setRetryType] = useState<RetryType>("META_AD_SET");

  const [payload, setPayload] = useState(
    JSON.stringify(RETRY_OPTIONS.META_AD_SET.defaultPayload, null, 2),
  );

  const [loading, setLoading] = useState(false);
  const [apiResult, setApiResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState("");

  const selectedRetry = RETRY_OPTIONS[retryType];

  const requestPath = `/api/campaigns/${campaignId.trim()}/${selectedRetry.path}`;

  function handleRetryTypeChange(value: RetryType) {
    setRetryType(value);

    setPayload(JSON.stringify(RETRY_OPTIONS[value].defaultPayload, null, 2));

    setApiResult(null);
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setApiResult(null);

    const id = campaignId.trim();

    // MongoDB campaign document ID validation.
    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      setError("Enter a valid 24-character MongoDB campaign ID.");
      return;
    }

    let parsedPayload: unknown;

    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      setError("Invalid JSON payload. Please correct the JSON.");
      return;
    }

    if (
      !parsedPayload ||
      typeof parsedPayload !== "object" ||
      Array.isArray(parsedPayload)
    ) {
      setError("Payload must be a JSON object.");
      return;
    }

    const confirmed = window.confirm(
      `You are about to execute:\n\n` +
        `POST ${requestPath}\n\n` +
        `This can perform a live operation in Meta Ads. Continue?`,
    );

    if (!confirmed) return;

    setLoading(true);

    try {
      const response = await fetch(requestPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsedPayload),
      });

      const rawResponse = await response.text();

      let responseData: unknown;

      try {
        responseData = rawResponse ? JSON.parse(rawResponse) : {};
      } catch {
        responseData = { raw: rawResponse };
      }

      setApiResult({
        status: response.status,
        success: response.ok,
        data: responseData,
      });
    } catch (err) {
      setApiResult({
        status: 0,
        success: false,
        data: {
          message:
            err instanceof Error ? err.message : "Unable to reach the API.",
        },
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Page header */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">
              Campaign Retry Console
            </h1>

            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              Developer Tool
            </span>
          </div>

          <p className="mt-2 text-sm text-slate-500">
            Retry individual campaign creation steps using the existing backend
            APIs.
          </p>
        </div>

        {/* Retry form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          {/* Campaign ID */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Campaign Document ID
            </label>

            <input
              type="text"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              placeholder="Enter MongoDB campaign ID"
              required
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            <p className="mt-1 text-xs text-slate-400">
              Enter your application's MongoDB campaign ID, not the Meta
              campaign ID.
            </p>
          </div>

          {/* Retry operation */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Retry Operation
            </label>

            <select
              value={retryType}
              onChange={(e) =>
                handleRetryTypeChange(e.target.value as RetryType)
              }
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
            >
              {Object.entries(RETRY_OPTIONS).map(([key, option]) => (
                <option key={key} value={key}>
                  {option.label}
                </option>
              ))}
            </select>

            <p className="mt-2 text-xs text-slate-500">
              {selectedRetry.description}
            </p>
          </div>

          {/* Endpoint preview */}
          <div className="rounded-lg bg-slate-900 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              API Request
            </p>

            <p className="mb-2 text-xs font-bold text-green-400">POST</p>

            <code className="break-all text-sm text-slate-100">
              {requestPath}
            </code>
          </div>

          {/* Payload editor */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700">
                Request Payload (JSON)
              </label>

              <button
                type="button"
                onClick={() =>
                  setPayload(
                    JSON.stringify(selectedRetry.defaultPayload, null, 2),
                  )
                }
                className="text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                Reset Payload
              </button>
            </div>

            <textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              rows={10}
              spellCheck={false}
              className="w-full rounded-lg border border-slate-300 bg-slate-950 p-4 font-mono text-sm text-green-300 outline-none focus:border-blue-500"
            />

            <p className="mt-1 text-xs text-slate-400">
              Edit the JSON fields according to the selected backend retry
              endpoint.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Executing Retry..." : "Execute Retry API"}
          </button>
        </form>

        {/* API response */}
        {apiResult && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <h2 className="font-semibold text-slate-800">API Response</h2>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  apiResult.success
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {apiResult.status === 0
                  ? "Network Error"
                  : `HTTP ${apiResult.status}`}
              </span>
            </div>

            <pre className="max-h-[500px] overflow-auto bg-slate-950 p-5 text-xs leading-6 text-green-300">
              {JSON.stringify(apiResult.data, null, 2)}
            </pre>
          </div>
        )}

        {/* Warning */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">Important</p>

          <p className="mt-1 text-xs leading-5 text-amber-700">
            Retry requests can create live advertising resources. Verify
            existing provider resources before executing a retry. Do not use the
            complete campaign creation endpoint to retry an individual step.
          </p>
        </div>
      </div>
    </div>
  );
}
