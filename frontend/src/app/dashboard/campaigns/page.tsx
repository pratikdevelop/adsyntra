"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CAMPAIGN_STATUS_STORAGE_KEY,
  CampaignStatus,
  CampaignRecord,
  getCampaignRecords,
  readManagedCampaigns,
  writeManagedCampaigns,
} from "./_lib/campaigns";

type View = "ALL" | "GOOGLE" | "META" | "GROUPS";
type StatusFilter = "ALL" | CampaignStatus;
const statusStyles: Record<CampaignStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PAUSED: "bg-amber-50 text-amber-700 ring-amber-200",
  DRAFT: "bg-slate-100 text-slate-600 ring-slate-200",
  FAILED: "bg-red-50 text-red-700 ring-red-200",
  ARCHIVED: "bg-slate-100 text-slate-500 ring-slate-200",
};

function PlatformBadge({ platform }: { platform: "GOOGLE" | "META" }) {
  return (
    <span
      className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${platform === "GOOGLE" ? "bg-blue-50 text-blue-700" : "bg-indigo-50 text-indigo-700"}`}
    >
      {platform === "GOOGLE" ? "Google Ads" : "Meta Ads"}
    </span>
  );
}

interface CampaignsPageProps {
  initialStatusFilter?: StatusFilter;
  pageTitle?: string;
  pageDescription?: string;
}

export default function CampaignsPage({
  initialStatusFilter = "ALL",
  pageTitle = "Campaign Management",
  pageDescription = "Manage Google Ads and Meta Ads independently, with a shared initiative view when campaigns come from one brief.",
}: CampaignsPageProps = {}) {
  const isDraftsPage = initialStatusFilter === "DRAFT";
  const [view, setView] = useState<View>("ALL");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter);
  const [statuses, setStatuses] = useState<Record<string, CampaignStatus>>({});
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const load = () => setCampaigns(getCampaignRecords());
    load();
    try {
      const saved = window.localStorage.getItem(CAMPAIGN_STATUS_STORAGE_KEY);
      if (saved)
        setStatuses(JSON.parse(saved) as Record<string, CampaignStatus>);
    } catch {
      setNotice("Saved prototype actions could not be loaded in this browser.");
    }
    const onStorage = () => load();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onStorage);
    };
  }, []);

  const rows = useMemo(
    () => campaigns.map((c) => ({ ...c, status: statuses[c.id] ?? c.status })),
    [campaigns, statuses],
  );
  const groups = useMemo(() => {
    const map = new Map<string, CampaignRecord[]>();
    rows.forEach((row) => {
      const key = row.groupId || row.id;
      map.set(key, [...(map.get(key) ?? []), row]);
    });
    return [...map.entries()].map(([id, items]) => ({
      id,
      name: items[0].name,
      items,
      createdAt: items[0].createdAt,
    }));
  }, [rows]);
  const filtered = useMemo(
    () =>
      rows.filter((c) => {
        const matchView = view === "ALL" || view === c.platform;
        const matchSearch =
          `${c.name} ${c.id} ${c.groupId} ${c.campaignType} ${c.account}`
            .toLowerCase()
            .includes(search.toLowerCase());
        return (
          matchView &&
          matchSearch &&
          (statusFilter === "ALL" || c.status === statusFilter)
        );
      }),
    [rows, view, search, statusFilter],
  );
  const active = filtered.filter((c) => c.status === "ACTIVE").length;
  const paused = filtered.filter((c) => c.status === "PAUSED").length;
  const failed = filtered.filter((c) => c.status === "FAILED").length;

  function updateStatus(id: string, next: CampaignStatus) {
    const nextStatuses = { ...statuses, [id]: next };
    setStatuses(nextStatuses);
    setCampaigns((current) =>
      current.map((c) =>
        c.id === id
          ? { ...c, status: next, updatedAt: new Date().toLocaleString() }
          : c,
      ),
    );
    try {
      window.localStorage.setItem(
        CAMPAIGN_STATUS_STORAGE_KEY,
        JSON.stringify(nextStatuses),
      );
      const stored = readManagedCampaigns();
      writeManagedCampaigns(
        stored.map((c) =>
          c.id === id
            ? { ...c, status: next, updatedAt: new Date().toLocaleString() }
            : c,
        ),
      );
      setNotice(
        `Prototype status updated to ${next.toLowerCase()}. This has not been sent to ${id.endsWith("GOOGLE") ? "Google Ads" : "Meta Ads"}.`,
      );
    } catch {
      setNotice(
        "Status changed on this page, but could not be saved in this browser.",
      );
    }
  }

  function duplicateCampaign(campaign: CampaignRecord) {
    const now = new Date().toLocaleString();
    const copyId = `LOCAL-COPY-${Date.now()}`;
    const copy = {
      ...campaign,
      id: copyId,
      groupId: copyId,
      name: `${campaign.name} (Copy)`,
      status: "DRAFT" as CampaignStatus,
      creationStatus: "DRAFT" as const,
      createdAt: now,
      updatedAt: now,
      source: "LOCAL" as const,
      activity: [
        {
          date: now,
          title: "Prototype duplicate created",
          description:
            "This is a local draft copy; no provider API request was made.",
          status: "warning" as const,
        },
      ],
    };
    const stored = readManagedCampaigns();
    writeManagedCampaigns([copy, ...stored]);
    setCampaigns((current) => [copy, ...current]);
    setNotice("A separate provider-specific draft copy was created locally.");
  }

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (campaign) => statusFilter === "ALL" || campaign.status === statusFilter,
      ),
    }))
    .filter((group) => group.items.length > 0)
    .filter((group) =>
      `${group.name} ${group.id}`.toLowerCase().includes(search.toLowerCase()),
    );

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">
            Campaign workspace
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            {pageTitle}
          </h1>
          <p className="mt-2 text-sm text-slate-500">{pageDescription}</p>
        </div>
        <Link
          href="/dashboard/campaigns/new"
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <span className="mr-2 text-lg leading-none">+</span>Create campaign
        </Link>
      </div>
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <strong className="mr-2 uppercase tracking-wide">Prototype data</strong>
        Provider campaigns are separate records. Shared initiatives only link
        related Google and Meta records; metrics and provider actions remain
        separate. Live provider sync is not connected.
      </div>

      <nav aria-label="Campaign sections" className="mt-6 flex flex-wrap items-center gap-2">
        <Link
          href="/dashboard/campaigns"
          aria-current={!isDraftsPage ? "page" : undefined}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${!isDraftsPage ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
        >
          All campaigns
        </Link>
        <Link
          href="/dashboard/campaigns/drafts"
          aria-current={isDraftsPage ? "page" : undefined}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${isDraftsPage ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
        >
          Drafts
        </Link>
      </nav>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(
          isDraftsPage
            ? [
                { label: "Draft campaigns", value: rows.filter((c) => c.status === "DRAFT").length, hint: "Saved and ready to continue" },
                { label: "Google drafts", value: rows.filter((c) => c.status === "DRAFT" && c.platform === "GOOGLE").length, hint: "Google Ads drafts" },
                { label: "Meta drafts", value: rows.filter((c) => c.status === "DRAFT" && c.platform === "META").length, hint: "Meta Ads drafts" },
                { label: "All campaigns", value: rows.length, hint: "Across both providers" },
              ]
            : [
                { label: "Provider campaigns", value: rows.length, hint: "Separate Google / Meta records" },
                { label: "Active in view", value: active, hint: "Currently marked active" },
                { label: "Paused in view", value: paused, hint: "Currently marked paused" },
                { label: "Failed in view", value: failed, hint: "Needs review" },
              ]
        ).map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm font-medium text-slate-500">{s.label}</p>
            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              {s.value}
            </p>
            <p className="mt-1 text-xs text-slate-400">{s.hint}</p>
          </div>
        ))}
      </div>

      <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Campaign listing
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Each row represents one platform campaign, never a merged Google
                + Meta campaign.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="relative block sm:min-w-64">
                <span className="sr-only">Search campaigns</span>
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  ⌕
                </span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search campaigns or initiatives..."
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilter)
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
              >
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="PAUSED">Paused</option>
                <option value="DRAFT">Draft</option>
                <option value="FAILED">Failed</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {(
              [
                ["ALL", `All platforms (${rows.length})`],
                [
                  "GOOGLE",
                  `Google Ads (${rows.filter((x) => x.platform === "GOOGLE").length})`,
                ],
                [
                  "META",
                  `Meta Ads (${rows.filter((x) => x.platform === "META").length})`,
                ],
                ["GROUPS", `Shared initiatives (${groups.length})`],
              ] as [View, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${view === key ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {notice && (
          <div
            role="status"
            className="border-b border-blue-100 bg-blue-50 px-5 py-3 text-sm text-blue-800"
          >
            {notice}
          </div>
        )}
        {view === "GROUPS" ? (
          <div className="divide-y divide-slate-100">
            {visibleGroups.map((group) => (
              <article key={group.id} className="p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Shared marketing initiative
                    </p>
                    <h3 className="mt-1 text-base font-bold text-slate-900">
                      {group.name}
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      {group.id} · Created {group.createdAt}
                    </p>
                  </div>
                  <span className="w-fit rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                    {group.items.length} platform campaign
                    {group.items.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {group.items.map((campaign) => (
                    <div
                      key={campaign.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <PlatformBadge platform={campaign.platform} />
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[campaign.status]}`}
                        >
                          {campaign.status}
                        </span>
                      </div>
                      <p className="mt-3 font-semibold text-slate-900">
                        {campaign.campaignType}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Budget: {campaign.budget}
                      </p>
                      <Link
                        href={`/dashboard/campaigns/${encodeURIComponent(campaign.id)}`}
                        className="mt-3 inline-flex text-sm font-semibold text-blue-600 hover:text-blue-800"
                      >
                        Open{" "}
                        {campaign.platform === "GOOGLE" ? "Google" : "Meta"}{" "}
                        campaign →
                      </Link>
                    </div>
                  ))}
                </div>
              </article>
            ))}
            {visibleGroups.length === 0 && (
              <EmptyState onClear={() => setSearch("")} />
            )}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-left">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Campaign</th>
                    <th className="px-4 py-4 font-semibold">Platform</th>
                    <th className="px-4 py-4 font-semibold">Budget</th>
                    <th className="px-4 py-4 font-semibold">Status</th>
                    <th className="px-4 py-4 font-semibold">Initiative</th>
                    <th className="px-4 py-4 font-semibold">Updated</th>
                    <th className="px-6 py-4 text-right font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((c) => (
                    <tr key={c.id} className="transition hover:bg-slate-50/70">
                      <td className="px-6 py-4">
                        <Link
                          href={`/dashboard/campaigns/${encodeURIComponent(c.id)}`}
                          className="font-semibold text-slate-900 hover:text-blue-700"
                        >
                          {c.name}
                        </Link>
                        <p className="mt-1 text-xs text-slate-400">
                          {c.id} · {c.campaignType}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <PlatformBadge platform={c.platform} />
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-slate-700">
                        {c.budget}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[c.status]}`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs text-slate-500">
                          {c.groupId}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500">
                        {c.updatedAt}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          {c.status === "ACTIVE" && (
                            <button
                              onClick={() => updateStatus(c.id, "PAUSED")}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
                            >
                              Pause
                            </button>
                          )}
                          {c.status === "PAUSED" && (
                            <button
                              onClick={() => updateStatus(c.id, "ACTIVE")}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
                            >
                              Resume
                            </button>
                          )}
                          <button
                            onClick={() => duplicateCampaign(c)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
                          >
                            Duplicate
                          </button>
                          <Link
                            href={`/dashboard/campaigns/${encodeURIComponent(c.id)}`}
                            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                          >
                            Details
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-slate-100 md:hidden">
              {filtered.map((c) => (
                <article key={c.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/campaigns/${encodeURIComponent(c.id)}`}
                        className="font-semibold text-slate-900"
                      >
                        {c.name}
                      </Link>
                      <p className="mt-1 text-xs text-slate-400">{c.id}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[c.status]}`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <PlatformBadge platform={c.platform} />
                    <span className="text-xs text-slate-500">{c.budget}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {c.status === "ACTIVE" && (
                      <button
                        onClick={() => updateStatus(c.id, "PAUSED")}
                        className="rounded-lg border px-3 py-2 text-xs font-semibold"
                      >
                        Pause
                      </button>
                    )}
                    {c.status === "PAUSED" && (
                      <button
                        onClick={() => updateStatus(c.id, "ACTIVE")}
                        className="rounded-lg border px-3 py-2 text-xs font-semibold"
                      >
                        Resume
                      </button>
                    )}
                    <button
                      onClick={() => duplicateCampaign(c)}
                      className="rounded-lg border px-3 py-2 text-xs font-semibold"
                    >
                      Duplicate
                    </button>
                    <Link
                      href={`/dashboard/campaigns/${encodeURIComponent(c.id)}`}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                    >
                      Details
                    </Link>
                  </div>
                </article>
              ))}
            </div>
            {filtered.length === 0 && (
              <EmptyState
                onClear={() => {
                  setSearch("");
                  setStatusFilter("ALL");
                  setView("ALL");
                }}
              />
            )}
          </>
        )}
      </section>
      <p className="mt-4 text-xs text-slate-400">
        Google metrics, Meta metrics, ad group / ad set breakdowns, and live
        actions will be connected independently through their respective
        reporting and management endpoints.
      </p>
    </div>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-500">
        ⌕
      </div>
      <h3 className="mt-4 font-semibold text-slate-900">No campaigns found</h3>
      <p className="mt-1 text-sm text-slate-500">
        Try changing your search or filters.
      </p>
      <button
        onClick={onClear}
        className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-800"
      >
        Clear filters
      </button>
    </div>
  );
}
