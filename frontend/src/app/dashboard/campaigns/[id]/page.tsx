"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  CAMPAIGN_STATUS_STORAGE_KEY,
  CampaignStatus,
  CampaignRecord,
  getCampaignRecords,
  readManagedCampaigns,
  writeManagedCampaigns,
} from "../_lib/campaigns";

const statusStyles: Record<CampaignStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PAUSED: "bg-amber-50 text-amber-700 ring-amber-200",
  DRAFT: "bg-slate-100 text-slate-600 ring-slate-200",
  FAILED: "bg-red-50 text-red-700 ring-red-200",
  ARCHIVED: "bg-slate-100 text-slate-500 ring-slate-200",
};

export default function CampaignDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [status, setStatus] = useState<CampaignStatus | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const load = () => {
      const found = getCampaignRecords().find((item) => item.id === id) ?? null;
      setCampaign(found);
      if (found) {
        try {
          const saved = window.localStorage.getItem(
            CAMPAIGN_STATUS_STORAGE_KEY,
          );
          const parsed = saved
            ? (JSON.parse(saved) as Record<string, CampaignStatus>)
            : {};
          setStatus(parsed[found.id] ?? found.status);
        } catch {
          setStatus(found.status);
        }
      }
    };
    load();
    window.addEventListener("storage", load);
    window.addEventListener("focus", load);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener("focus", load);
    };
  }, [id]);

  function updateStatus(next: CampaignStatus) {
    if (!campaign) return;
    setStatus(next);
    try {
      const saved = window.localStorage.getItem(CAMPAIGN_STATUS_STORAGE_KEY);
      const parsed = saved
        ? (JSON.parse(saved) as Record<string, CampaignStatus>)
        : {};
      window.localStorage.setItem(
        CAMPAIGN_STATUS_STORAGE_KEY,
        JSON.stringify({ ...parsed, [campaign.id]: next }),
      );
      const stored = readManagedCampaigns();
      writeManagedCampaigns(
        stored.map((item) =>
          item.id === campaign.id
            ? { ...item, status: next, updatedAt: new Date().toLocaleString() }
            : item,
        ),
      );
      setCampaign({
        ...campaign,
        status: next,
        updatedAt: new Date().toLocaleString(),
      });
      setNotice(
        `Prototype status changed to ${next.toLowerCase()}. No change was sent to the advertising platform.`,
      );
    } catch {
      setNotice(
        "Status changed on this page but could not be saved in this browser.",
      );
    }
  }

  const currentStatus = status ?? campaign?.status;
  const relatedCampaigns = useMemo(() => {
    if (!campaign) return [];
    return getCampaignRecords().filter(
      (item) => item.groupId === campaign.groupId && item.id !== campaign.id,
    );
  }, [campaign]);

  if (!campaign) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm font-semibold text-blue-600">
          Campaign not found
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          This campaign isn’t in the prototype dataset
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          The ID may belong to a live provider campaign or a campaign created in
          a different session. Live campaign lookup is not connected yet.
        </p>
        <Link
          href="/dashboard/campaigns"
          className="mt-6 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Back to campaigns
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5">
        <Link
          href="/dashboard/campaigns"
          className="text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          ← Back to campaigns
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {campaign.platform === "GOOGLE" ? "Google Ads" : "Meta Ads"}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[currentStatus!]}`}
              >
                {currentStatus}
              </span>
              <span className="text-xs text-slate-400">{campaign.id}</span>
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {campaign.name}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              {campaign.description}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {currentStatus === "ACTIVE" && (
              <button
                onClick={() => updateStatus("PAUSED")}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Pause campaign
              </button>
            )}
            {currentStatus === "PAUSED" && (
              <button
                onClick={() => updateStatus("ACTIVE")}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Resume campaign
              </button>
            )}
            <button
              onClick={() =>
                setNotice(
                  "Edit campaign is not connected yet. Use the existing Create Campaign workflow to prepare a new campaign.",
                )
              }
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>
          </div>
        </div>
        {notice && (
          <div
            role="status"
            className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800"
          >
            {notice}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Daily / configured budget", value: campaign.budget },
          { label: "Campaign objective", value: campaign.objective },
          { label: "Campaign type", value: campaign.campaignType },
          {
            label: "Creation result",
            value: campaign.creationStatus.replaceAll("_", " "),
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {item.label}
            </p>
            <p className="mt-3 text-base font-bold text-slate-900">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-900">
            Campaign configuration
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            High-level information available in the current prototype record.
          </p>
          <dl className="mt-6 divide-y divide-slate-100">
            {[
              ["Advertising account", campaign.account],
              ["Campaign structure", campaign.structureLabel],
              ["Created", campaign.createdAt],
              ["Last updated", campaign.updatedAt],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex flex-col gap-1 py-4 sm:flex-row sm:justify-between sm:gap-6"
              >
                <dt className="text-sm text-slate-500">{label}</dt>
                <dd className="text-sm font-semibold text-slate-800 sm:text-right">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-900">
            Related platform campaigns
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Campaigns created from the same shared marketing initiative. Each
            platform keeps its own settings and reporting.
          </p>
          <div className="mt-5 space-y-3">
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Current platform campaign
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {campaign.platform === "GOOGLE" ? "Google Ads" : "Meta Ads"} ·{" "}
                {campaign.campaignType}
              </p>
            </div>
            {relatedCampaigns.map((related) => (
              <Link
                key={related.id}
                href={`/dashboard/campaigns/${encodeURIComponent(related.id)}`}
                className="block rounded-xl border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-slate-50"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {related.platform === "GOOGLE" ? "Google Ads" : "Meta Ads"} ·
                  Linked campaign
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {related.campaignType}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Budget: {related.budget} · Status: {related.status}
                </p>
              </Link>
            ))}
            {relatedCampaigns.length === 0 && (
              <p className="text-sm text-slate-500">
                No other platform campaign is linked to this initiative.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Activity & execution history
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Prototype events for illustrating campaign lifecycle states.
            </p>
          </div>
          <span className="w-fit rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            Demo history
          </span>
        </div>
        <div className="mt-6 space-y-5">
          {campaign.activity.map((event, index) => (
            <div key={`${event.date}-${index}`} className="flex gap-4">
              <div
                className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  event.status === "success"
                    ? "bg-emerald-50 text-emerald-700"
                    : event.status === "warning"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-red-50 text-red-700"
                }`}
              >
                {event.status === "success"
                  ? "✓"
                  : event.status === "warning"
                    ? "!"
                    : "×"}
              </div>
              <div className="min-w-0 flex-1 border-b border-slate-100 pb-5 last:border-0 last:pb-0">
                <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                  <p className="text-sm font-semibold text-slate-900">
                    {event.title}
                  </p>
                  <p className="text-xs text-slate-400">{event.date}</p>
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {event.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <p className="mt-4 text-xs text-slate-400">
        Performance reporting, ad group/ad set breakdowns, and live provider
        synchronization will be added when the corresponding backend endpoints
        are available.
      </p>
    </div>
  );
}
