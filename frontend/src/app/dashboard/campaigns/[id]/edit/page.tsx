"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CampaignRecord,
  ManagedCampaignRecord,
  getCampaignRecords,
  readManagedCampaigns,
  writeManagedCampaigns,
} from "../../_lib/campaigns";

const GOOGLE_TYPES = [
  { value: "SEARCH", label: "Search" },
  { value: "DISPLAY", label: "Display" },
  { value: "PERFORMANCE_MAX", label: "Performance Max" },
  { value: "DEMAND_GEN", label: "Demand Gen" },
  { value: "SHOPPING", label: "Shopping" },
  { value: "HOTEL", label: "Hotel" },
  { value: "APP", label: "App campaign" },
];

const OBJECTIVES = [
  { value: "SALES", label: "Sales" },
  { value: "LEADS", label: "Leads" },
  { value: "WEBSITE_TRAFFIC", label: "Website traffic" },
  { value: "AWARENESS", label: "Awareness" },
  { value: "ENGAGEMENT", label: "Engagement" },
  { value: "APP_PROMOTION", label: "App promotion" },
];

const META_BUYING_TYPES = [
  { value: "AUCTION", label: "Auction" },
  { value: "RESERVED", label: "Reservation" },
];

const fieldClass =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
const labelClass = "text-sm font-semibold text-slate-700";

function typeLabel(campaign: CampaignRecord) {
  if (campaign.platform === "GOOGLE") {
    return (
      GOOGLE_TYPES.find((item) => item.value === campaign.googleCampaignType)
        ?.label ?? campaign.campaignType
    );
  }
  return campaign.metaBuyingType === "RESERVED" ? "Reservation" : "Auction";
}

export default function EditCampaignPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = decodeURIComponent(params.id);

  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("SALES");
  const [budgetLabel, setBudgetLabel] = useState("");
  const [accountLabel, setAccountLabel] = useState("");
  const [googleCampaignType, setGoogleCampaignType] = useState("SEARCH");
  const [metaBuyingType, setMetaBuyingType] = useState("AUCTION");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const found = getCampaignRecords().find((item) => item.id === id) ?? null;
    setCampaign(found);
    if (!found) return;
    setName(found.name);
    setObjective(found.objective);
    setBudgetLabel(found.budgetLabel);
    setAccountLabel(found.accountLabel);
    setGoogleCampaignType(found.googleCampaignType ?? "SEARCH");
    setMetaBuyingType(found.metaBuyingType ?? "AUCTION");
  }, [id]);

  const platformName = campaign?.platform === "GOOGLE" ? "Google Ads" : "Meta Ads";
  const selectedType = useMemo(() => {
    if (!campaign) return "";
    return campaign.platform === "GOOGLE"
      ? googleCampaignType
      : metaBuyingType;
  }, [campaign, googleCampaignType, metaBuyingType]);

  function requestSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!campaign) return;
    if (!name.trim()) {
      setError("Campaign name is required.");
      return;
    }
    if (!budgetLabel.trim()) {
      setError("Please enter the configured budget.");
      return;
    }
    setConfirmOpen(true);
  }

  function saveChanges() {
    if (!campaign) return;
    setSaving(true);
    setError("");

    const existing = readManagedCampaigns();
    const previous = existing.find((item) => item.id === campaign.id);
    const updated: ManagedCampaignRecord = {
      ...(previous ?? campaign),
      id: campaign.id,
      groupId: campaign.groupId,
      name: name.trim(),
      objective,
      budgetLabel: budgetLabel.trim(),
      accountLabel: accountLabel.trim() || "Account not specified",
      campaignType:
        campaign.platform === "GOOGLE"
          ? `Google ${GOOGLE_TYPES.find((item) => item.value === googleCampaignType)?.label ?? googleCampaignType}`
          : `Meta ${metaBuyingType === "RESERVED" ? "Reservation" : "Auction"}`,
      ...(campaign.platform === "GOOGLE"
        ? { googleCampaignType, metaBuyingType: undefined }
        : { metaBuyingType, googleCampaignType: undefined }),
      updatedAt: new Date().toLocaleString(),
      source: previous?.source ?? "LOCAL",
    };

    const next = previous
      ? existing.map((item) => (item.id === campaign.id ? updated : item))
      : [...existing, updated];

    const saved = writeManagedCampaigns(next);
    setSaving(false);
    setConfirmOpen(false);

    if (!saved) {
      setError("Changes could not be saved in this browser. Check local storage availability and try again.");
      return;
    }

    router.push(`/dashboard/campaigns/${encodeURIComponent(campaign.id)}?updated=1`);
  }

  if (!campaign) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-xl font-bold text-slate-900">Campaign not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          This campaign may have been removed or is not available in this browser.
        </p>
        <Link
          href="/dashboard/campaigns"
          className="mt-5 inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Back to campaigns
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <Link
          href={`/dashboard/campaigns/${encodeURIComponent(campaign.id)}`}
          className="text-sm font-semibold text-blue-700 hover:text-blue-800"
        >
          ← Back to campaign details
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                campaign.platform === "GOOGLE"
                  ? "bg-blue-50 text-blue-700"
                  : "bg-indigo-50 text-indigo-700"
              }`}>
                {platformName}
              </span>
              <span className="text-xs text-slate-400">{campaign.id}</span>
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
              Edit campaign
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Update the settings stored for this {platformName} campaign. Its linked platform campaign will not be changed.
            </p>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
            Browser prototype
          </span>
        </div>
      </div>

      <form onSubmit={requestSave} className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-slate-900">Basic information</h2>
            <p className="mt-1 text-sm text-slate-500">
              These changes apply only to the selected platform campaign.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className={labelClass}>Campaign name</span>
              <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={180} required />
            </label>
            <label>
              <span className={labelClass}>Campaign objective</span>
              <select className={fieldClass} value={objective} onChange={(e) => setObjective(e.target.value)}>
                {OBJECTIVES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            {campaign.platform === "GOOGLE" ? (
              <label>
                <span className={labelClass}>Google campaign type</span>
                <select className={fieldClass} value={googleCampaignType} onChange={(e) => setGoogleCampaignType(e.target.value)}>
                  {GOOGLE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
            ) : (
              <label>
                <span className={labelClass}>Meta buying type</span>
                <select className={fieldClass} value={metaBuyingType} onChange={(e) => setMetaBuyingType(e.target.value)}>
                  {META_BUYING_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
            )}
            <label>
              <span className={labelClass}>Budget label</span>
              <input className={fieldClass} value={budgetLabel} onChange={(e) => setBudgetLabel(e.target.value)} placeholder="e.g. ₹1,500 / day" required />
              <span className="mt-1 block text-xs text-slate-500">Edit the displayed budget label. This prototype does not update provider billing or budget resources.</span>
            </label>
            <label>
              <span className={labelClass}>Ad account label</span>
              <input className={fieldClass} value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} placeholder="Connected ad account name" />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <h2 className="text-lg font-bold text-slate-900">Campaign identity</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Platform</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{platformName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Campaign type</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{typeLabel(campaign)} → {selectedType}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Campaign ID</p>
              <p className="mt-1 break-all text-sm font-semibold text-slate-800">{campaign.id}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Shared initiative ID</p>
              <p className="mt-1 break-all text-sm font-semibold text-slate-800">{campaign.groupId}</p>
            </div>
          </div>
        </section>

        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <div className="flex flex-wrap justify-end gap-3">
          <Link href={`/dashboard/campaigns/${encodeURIComponent(campaign.id)}`} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Cancel
          </Link>
          <button type="submit" className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
            Review changes
          </button>
        </div>
      </form>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="confirm-title" className="text-lg font-bold text-slate-900">Save campaign changes?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This will update the local {platformName} campaign record only. No request will be sent to Google Ads or Meta Ads.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">
                Go back
              </button>
              <button type="button" disabled={saving} onClick={saveChanges} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? "Saving..." : "Confirm save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
