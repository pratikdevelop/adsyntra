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
          headers: {
            Authorization: `Bearer ${token}`,
          },
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
        console.log("data : ", data.providers);

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("google") === "connected") {
      setNotice(
        "Google Ads authorization completed. Your connection details have been refreshed.",
      );
    }
    console.log(params.get("meta"));

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
  // Show a message after Google OAuth redirects back to this page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("google") === "connected") {
      setNotice(
        "Google Ads authorization completed. Your connection details have been refreshed.",
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

      if (!token) {
        throw new Error("Please sign in first.");
      }

      const response = await fetch(
        `${API_BASE_URL}/api/google-ads/auth/google`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

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
  const connectMeta = async () => {
    try {
      setIsConnectingMeta(true);
      setError("");
      setNotice("");

      const token = await getToken();

      if (!token) {
        throw new Error("Please sign in first.");
      }

      const response = await fetch(`${API_BASE_URL}/api/meta-ads/auth/meta`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
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

      if (!token) {
        throw new Error("Please sign in first.");
      }

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

        <div className="space-y-2">
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
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-800">
                    {accountName}
                  </span>

                  {accountId && (
                    <span className="mt-1 block break-all text-xs text-slate-500">
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
                  className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${
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
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">
              Workspace settings
            </p>

            <h1 className="mt-2 text-3xl font-bold">Account Connections</h1>

            <p className="mt-2 text-slate-500">
              Connect and manage your advertising accounts from one workspace.
            </p>
          </div>

          {hasSelectedAccount ? (
            <Link
              href="/dashboard"
              className="w-fit rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Go to Dashboard →
            </Link>
          ) : (
            <span className="w-fit rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700">
              Connect and select an account to continue
            </span>
          )}
        </div>

        {/* Notifications */}
        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {notice && (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {notice}
          </div>
        )}

        {/* Connection Summary */}
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <p className="text-sm text-slate-500">Connected providers</p>

            <div className="mt-2 flex items-end gap-2">
              <span className="text-3xl font-bold">
                {isLoading ? "—" : connectedCount}
              </span>

              <span className="mb-1 text-sm text-slate-400">/ 2 providers</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <p className="text-sm text-slate-500">Available providers</p>

            <p className="mt-2 text-3xl font-bold">2</p>
          </div>
        </div>

        {/* Provider Cards */}
        <div className="mt-10">
          <h2 className="text-lg font-bold">Advertising Platforms</h2>

          <p className="mt-1 text-sm text-slate-500">
            Connect your accounts, select an active account, and manage
            campaigns.
          </p>

          {isLoading && (
            <p className="mt-5 text-sm text-slate-500">
              Loading your advertising connections...
            </p>
          )}

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {/* Google Ads */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 text-2xl font-bold text-blue-600">
                    G
                  </div>

                  <div>
                    <h3 className="font-bold">Google Ads</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Advertising platform
                    </p>
                  </div>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    google.connected
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
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
                className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isConnectingGoogle
                  ? "Redirecting..."
                  : google.connected
                    ? "Reconnect Google Ads"
                    : "Connect Google Ads"}
              </button>
            </section>

            {/* Meta Ads */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-2xl font-bold text-white">
                    M
                  </div>

                  <div>
                    <h3 className="font-bold">Meta Ads</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Advertising platform
                    </p>
                  </div>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    meta.connected
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
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
                className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isConnectingMeta
                  ? "Redirecting to Meta..."
                  : meta.connected
                    ? "Reconnect Meta Ads"
                    : "Connect Meta Ads"}
              </button>

              {/* <button
                type="button"
                disabled
                className="mt-6 w-full cursor-not-allowed rounded-xl bg-slate-200 px-4 py-3 text-sm font-semibold text-slate-500"
              >
                {meta.connected
                  ? "Meta Ads Connected"
                  : "Meta Ads Integration Coming Next"}
              </button> */}
            </section>
          </div>
        </div>

        {/* Information */}
        <div className="mt-8 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-900">
            About account connections
          </p>

          <p className="mt-1 text-sm leading-6 text-blue-800">
            Connection details and selected advertising accounts are loaded from
            your backend. Google Ads and Meta Ads access tokens remain encrypted
            on the backend and are never exposed to the frontend.
          </p>
        </div>
      </div>
    </main>
  );
}
