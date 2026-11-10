"use client";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

type ProviderName = "googleAds" | "metaAds";

interface ProviderConnection {
  connected: boolean;
  accounts: unknown[];
  selectedAccountId: string | null;
}

interface ConnectionsResponse {
  providers?: {
    googleAds?: Partial<ProviderConnection>;
    metaAds?: Partial<ProviderConnection>;
  };
}

const emptyProvider: ProviderConnection = {
  connected: false,
  accounts: [],
  selectedAccountId: null,
};

function normalizeProvider(
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
  if (typeof account === "string") {
    return account;
  }

  if (!account || typeof account !== "object") {
    return null;
  }

  const record = account as Record<string, unknown>;

  const possibleId =
    record.resourceName ??
    record.resource_name ??
    record.customerId ??
    record.customer_id ??
    record.accountId ??
    record.account_id ??
    record.id;

  if (typeof possibleId === "string" && possibleId.trim()) {
    return possibleId.trim();
  }

  if (typeof possibleId === "number") {
    return String(possibleId);
  }

  return null;
}

function getAccountName(account: unknown): string {
  if (typeof account === "string") {
    return account;
  }

  if (!account || typeof account !== "object") {
    return "Advertising account";
  }

  const record = account as Record<string, unknown>;

  const possibleName =
    record.descriptiveName ??
    record.descriptive_name ??
    record.accountName ??
    record.account_name ??
    record.business_name ??
    record.name ??
    record.label;

  if (typeof possibleName === "string" && possibleName.trim()) {
    return possibleName.trim();
  }

  const id = getAccountId(account);
  return id ? `Account ${id}` : "Advertising account";
}

export default function ProviderPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const [google, setGoogle] = useState<ProviderConnection>(emptyProvider);
  const [meta, setMeta] = useState<ProviderConnection>(emptyProvider);

  const [isLoading, setIsLoading] = useState(true);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isConnectingMeta, setIsConnectingMeta] = useState(false);
  const [savingProvider, setSavingProvider] = useState<ProviderName | null>(
    null,
  );

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const connectedCount = Number(google.connected) + Number(meta.connected);
  const hasSelectedAccount =
    (google.connected && Boolean(google.selectedAccountId)) ||
    (meta.connected && Boolean(meta.selectedAccountId));

  // Load saved connections for the signed-in user.
  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setIsLoading(false);
      setError("Please sign in to view your advertising connections.");
      return;
    }

    let cancelled = false;

    const loadConnections = async () => {
      try {
        setIsLoading(true);
        setError("");

        const token = await getToken();
        if (!token) {
          throw new Error("Unable to get your authentication token.");
        }

        const response = await fetch(`${API_BASE_URL}/api/connections/me`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        const data: ConnectionsResponse & { message?: string } =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Failed to load account connections.",
          );
        }

        if (cancelled) return;

        setGoogle(normalizeProvider(data.providers?.googleAds));
        setMeta(normalizeProvider(data.providers?.metaAds));
      } catch (err) {
        if (!cancelled) {
          console.error("Connection loading error:", err);
          setError(
            err instanceof Error
              ? err.message
              : "Something went wrong while loading connections.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadConnections();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn]);

  // Handle OAuth redirect feedback.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("google") === "connected") {
      setNotice(
        "Google Ads authorization completed. Your connection details have been refreshed.",
      );
    }

    if (params.get("meta") === "connected") {
      setNotice(
        "Meta Ads connected successfully. Your advertising accounts have been loaded.",
      );
    }

    if (params.get("meta") === "error") {
      const reason = params.get("reason");
      const messages: Record<string, string> = {
        authorization_denied: "Meta Ads authorization was denied.",
        invalid_callback: "Invalid Meta OAuth callback. Please try again.",
        invalid_or_expired_state:
          "Meta authorization expired or could not be verified. Please reconnect.",
        token_exchange_failed: "Meta token exchange failed. Please reconnect.",
        callback_failed: "Meta connection failed. Please try again.",
      };
      setError(
        messages[reason || ""] || "Unable to complete Meta Ads authorization.",
      );
    }
  }, []);

  // Start Google OAuth.
  const connectGoogle = async () => {
    try {
      setIsConnectingGoogle(true);
      setError("");
      setNotice("");

      const token = await getToken();
      if (!token) throw new Error("Please sign in first.");

      const response = await fetch(`${API_BASE_URL}/api/auth/google`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (!response.ok || !data.authUrl) {
        throw new Error(
          data.message || "Unable to start Google authorization.",
        );
      }

      window.location.assign(data.authUrl);
    } catch (err) {
      console.error("Google connection error:", err);
      setError(
        err instanceof Error ? err.message : "Unable to connect Google Ads.",
      );
      setIsConnectingGoogle(false);
    }
  };

  // Start Meta OAuth.
  const connectMeta = async () => {
    try {
      setIsConnectingMeta(true);
      setError("");
      setNotice("");

      const token = await getToken();
      if (!token) throw new Error("Please sign in first.");

      const response = await fetch(`${API_BASE_URL}/api/auth/meta`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const data = await response.json();
      if (!response.ok || !data.authUrl) {
        throw new Error(
          data.message || "Unable to start Meta Ads authorization.",
        );
      }

      window.location.assign(data.authUrl);
    } catch (err) {
      console.error("Meta connection error:", err);
      setError(
        err instanceof Error ? err.message : "Unable to connect Meta Ads.",
      );
      setIsConnectingMeta(false);
    }
  };

  // Save the selected account for the signed-in user.
  const selectAccount = async (provider: ProviderName, accountId: string) => {
    try {
      setSavingProvider(provider);
      setError("");
      setNotice("");

      const token = await getToken();
      if (!token) throw new Error("Please sign in first.");

      const response = await fetch(
        `${API_BASE_URL}/api/connections/${provider}/select-account`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ accountId }),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Unable to select this account.");
      }

      const updateProvider = (previous: ProviderConnection) => ({
        ...previous,
        selectedAccountId: accountId,
      });

      if (provider === "googleAds") {
        setGoogle(updateProvider);
      } else {
        setMeta(updateProvider);
      }

      setNotice(
        `${provider === "googleAds" ? "Google Ads" : "Meta Ads"} account selected successfully.`,
      );
    } catch (err) {
      console.error("Account selection error:", err);
      setError(
        err instanceof Error ? err.message : "Unable to select the account.",
      );
    } finally {
      setSavingProvider(null);
    }
  };

  // Render the account selector for either provider.
  const renderAccounts = (
    provider: ProviderName,
    connection: ProviderConnection,
  ) => {
    if (!connection.connected) return null;

    if (connection.accounts.length === 0) {
      return (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Connected successfully, but no advertising accounts were returned.
        </div>
      );
    }

    return (
      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-800">
            Available accounts
          </h4>
          <span className="text-xs text-slate-500">
            {connection.accounts.length} account(s)
          </span>
        </div>

        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {connection.accounts.map((account, index) => {
            const accountId = getAccountId(account);
            const accountName = getAccountName(account);
            const isSelected =
              accountId !== null && accountId === connection.selectedAccountId;

            return (
              <button
                key={accountId ?? `account-${index}`}
                type="button"
                disabled={!accountId || savingProvider === provider}
                onClick={() => {
                  if (accountId) {
                    void selectAccount(provider, accountId);
                  }
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                    : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">
                    {accountName}
                  </span>
                  {accountId && (
                    <span className="mt-1 block truncate text-xs text-slate-500">
                      {accountId}
                    </span>
                  )}
                  {!accountId && (
                    <span className="mt-1 block text-xs text-amber-700">
                      Account ID unavailable
                    </span>
                  )}
                </span>

                <span
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    isSelected
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {savingProvider === provider && isSelected
                    ? "Saving..."
                    : isSelected
                      ? "Selected"
                      : "Select"}
                </span>
              </button>
            );
          })}
        </div>

        {!connection.selectedAccountId && (
          <p className="mt-3 text-xs text-slate-500">
            Select an account to use it as your active advertising account.
          </p>
        )}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-lg font-bold text-white shadow-lg shadow-blue-500/25">
              AS
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
                AdSyntra · Workspace settings
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                Account Connections
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Connect and manage your advertising accounts from one workspace.
              </p>
            </div>
          </div>

          {/* Status pill (replaces the dashboard button) */}
          <div
            className={`flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
              hasSelectedAccount
                ? "bg-green-50 text-green-700 ring-1 ring-green-200"
                : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                hasSelectedAccount ? "bg-green-500" : "bg-amber-500"
              }`}
            />
            {hasSelectedAccount
              ? "Account ready"
              : "Connect & select an account to continue"}
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{notice}</span>
          </div>
        )}

        {/* Connection Summary */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Connected providers</p>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
                  />
                </svg>
              </span>
            </div>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-3xl font-bold tracking-tight">
                {isLoading ? "—" : connectedCount}
              </span>
              <span className="mb-1 text-sm text-slate-400">/ 2 providers</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Available providers</p>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
                  />
                </svg>
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight">2</p>
          </div>
        </div>

        {/* Provider Cards */}
        <div className="mt-10">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight">
                Advertising Platforms
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Connect your accounts, select an active account, and manage
                campaigns.
              </p>
            </div>
          </div>

          {isLoading && (
            <p className="mt-5 animate-pulse text-sm text-slate-500">
              Loading your advertising connections...
            </p>
          )}

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {/* Google Ads */}
            <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl font-bold text-blue-600 shadow-sm">
                    G
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">Google Ads</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Search, Display & Performance Max
                    </p>
                  </div>
                </div>

                <span
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                    google.connected
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      google.connected ? "bg-green-500" : "bg-slate-400"
                    }`}
                  />
                  {google.connected ? "Connected" : "Not connected"}
                </span>
              </div>

              <p className="mt-5 text-sm leading-6 text-slate-600">
                Manage Google Search, Display and Performance Max campaigns from
                your workspace.
              </p>

              {renderAccounts("googleAds", google)}

              <button
                type="button"
                onClick={connectGoogle}
                disabled={isConnectingGoogle || isLoading}
                className="mt-auto pt-6"
              >
                <span
                  className={`block w-full rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    google.connected
                      ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {isConnectingGoogle
                    ? "Redirecting..."
                    : google.connected
                      ? "Reconnect Google Ads"
                      : "Connect Google Ads"}
                </span>
              </button>
            </section>

            {/* Meta Ads */}
            <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-xl font-bold text-white shadow-sm">
                    M
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">Meta Ads</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Facebook & Instagram campaigns
                    </p>
                  </div>
                </div>

                <span
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                    meta.connected
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      meta.connected ? "bg-green-500" : "bg-slate-400"
                    }`}
                  />
                  {meta.connected ? "Connected" : "Not connected"}
                </span>
              </div>

              <p className="mt-5 text-sm leading-6 text-slate-600">
                Manage Facebook and Instagram campaigns, audiences and
                advertising creatives.
              </p>

              {renderAccounts("metaAds", meta)}

              {!meta.connected && (
                <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
                  Connect your Meta Business account to retrieve your available
                  Facebook and Instagram advertising accounts.
                </div>
              )}

              <button
                type="button"
                onClick={connectMeta}
                disabled={isConnectingMeta || isLoading}
                className="mt-auto pt-6"
              >
                <span
                  className={`block w-full rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    meta.connected
                      ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 hover:opacity-95"
                  }`}
                >
                  {isConnectingMeta
                    ? "Redirecting to Meta..."
                    : meta.connected
                      ? "Reconnect Meta Ads"
                      : "Connect Meta Ads"}
                </span>
              </button>
            </section>
          </div>
        </div>

        {/* Information */}
        <div className="mt-8 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <svg
            className="mt-0.5 h-5 w-5 shrink-0 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
            />
          </svg>
          <div>
            <p className="text-sm font-semibold text-blue-900">
              About account connections
            </p>
            <p className="mt-1 text-sm leading-6 text-blue-800">
              Connection details and selected advertising accounts are loaded
              from your backend. Google Ads and Meta Ads access tokens remain
              encrypted on the backend and are never exposed to the frontend.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
