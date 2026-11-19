export type CampaignStatus = "ACTIVE" | "PAUSED" | "DRAFT" | "FAILED" | "ARCHIVED";
export type CampaignProvider = "googleAds" | "metaAds";
export type CampaignPlatform = "GOOGLE" | "META";

export interface ManagedCampaignRecord {
  id: string;
  /** Shared marketing initiative ID. Google and Meta rows from one brief share this value. */
  groupId?: string;
  name: string;
  provider: CampaignProvider;
  campaignType: string;
  googleCampaignType?: string;
  metaBuyingType?: string;
  objective: string;
  budgetLabel: string;
  status: CampaignStatus;
  creationStatus: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED" | "DRAFT";
  accountLabel: string;
  createdAt: string;
  updatedAt: string;
  source: "SAMPLE" | "LOCAL";
  jobId?: string;
}

export interface CampaignRecord extends ManagedCampaignRecord {
  groupId: string;
  platform: CampaignPlatform;
  budget: string;
  account: string;
  description: string;
  structureLabel: string;
  providerId?: string;
  activity: { date: string; title: string; description: string; status: "success" | "warning" | "error" }[];
}

export const CAMPAIGNS_STORAGE_KEY = "unified-ads-managed-campaigns-v1";
export const CAMPAIGN_STATUS_STORAGE_KEY = "unified-ads-campaign-status-v1";

export const sampleCampaigns: CampaignRecord[] = [
  {
    id: "DEMO-CMP-001-GOOGLE", groupId: "DEMO-GROUP-001", name: "Summer Search | Website Sales",
    provider: "googleAds", platform: "GOOGLE", campaignType: "Google Search", googleCampaignType: "SEARCH",
    objective: "SALES", budgetLabel: "₹1,500 / day", budget: "₹1,500 / day", status: "ACTIVE", creationStatus: "SUCCESS",
    accountLabel: "Demo Google Ads account", account: "Demo Google Ads account", createdAt: "Nov 01, 2026", updatedAt: "Nov 03, 2026 · 10:15 AM",
    source: "SAMPLE", description: "Sample Google Search campaign record.", structureLabel: "Campaign → Ad groups → Ads",
    activity: [{ date: "Nov 01, 2026", title: "Sample campaign added", description: "Illustrative record; no provider sync has been performed.", status: "warning" }],
  },
  {
    id: "DEMO-CMP-002-META", groupId: "DEMO-GROUP-002", name: "New Arrivals | Instagram & Facebook",
    provider: "metaAds", platform: "META", campaignType: "Meta Auction", metaBuyingType: "AUCTION",
    objective: "SALES", budgetLabel: "₹1,200 / day", budget: "₹1,200 / day", status: "ACTIVE", creationStatus: "SUCCESS",
    accountLabel: "Demo Meta ad account", account: "Demo Meta ad account", createdAt: "Oct 29, 2026", updatedAt: "Nov 03, 2026 · 09:40 AM",
    source: "SAMPLE", description: "Sample Meta campaign record.", structureLabel: "Campaign → Ad sets → Ads",
    activity: [{ date: "Oct 29, 2026", title: "Sample campaign added", description: "Illustrative record; no provider sync has been performed.", status: "warning" }],
  },
  {
    id: "DEMO-CMP-003-GOOGLE", groupId: "DEMO-GROUP-003", name: "Brand Awareness | Google + Meta",
    provider: "googleAds", platform: "GOOGLE", campaignType: "Google Display", googleCampaignType: "DISPLAY",
    objective: "AWARENESS", budgetLabel: "₹1,000 / day", budget: "₹1,000 / day", status: "PAUSED", creationStatus: "SUCCESS",
    accountLabel: "Demo Google Ads account", account: "Demo Google Ads account", createdAt: "Oct 25, 2026", updatedAt: "Nov 02, 2026 · 04:20 PM",
    source: "SAMPLE", description: "Google Ads side of a shared awareness initiative.", structureLabel: "Campaign → Ad groups → Ads",
    activity: [{ date: "Oct 25, 2026", title: "Sample campaign added", description: "Illustrative Google campaign; no provider sync has been performed.", status: "warning" }],
  },
  {
    id: "DEMO-CMP-003-META", groupId: "DEMO-GROUP-003", name: "Brand Awareness | Google + Meta",
    provider: "metaAds", platform: "META", campaignType: "Meta Auction", metaBuyingType: "AUCTION",
    objective: "AWARENESS", budgetLabel: "₹800 / day", budget: "₹800 / day", status: "PAUSED", creationStatus: "PARTIAL_SUCCESS",
    accountLabel: "Demo Meta ad account", account: "Demo Meta ad account", createdAt: "Oct 25, 2026", updatedAt: "Nov 02, 2026 · 04:20 PM",
    source: "SAMPLE", description: "Meta Ads side of a shared awareness initiative.", structureLabel: "Campaign → Ad sets → Ads",
    activity: [{ date: "Oct 25, 2026", title: "Sample campaign added", description: "Illustrative Meta campaign; no provider sync has been performed.", status: "warning" }],
  },
];

function normalizeLegacyRecord(record: Record<string, unknown>): ManagedCampaignRecord[] {
  // Migrate old prototype rows that represented Google + Meta as one BOTH record.
  if (record.provider !== "both") return [record as unknown as ManagedCampaignRecord];
  const baseId = String(record.id ?? `LEGACY-${Date.now()}`);
  const groupId = String(record.groupId ?? baseId);
  const common = { ...record, groupId };
  const budget = String(record.budgetLabel ?? "Budget not configured");
  const googleBudget = budget.match(/Google\s+([^·]+)/i)?.[1]?.trim() ?? budget;
  const metaBudget = budget.match(/Meta\s+([^·]+)/i)?.[1]?.trim() ?? budget;
  const account = String(record.accountLabel ?? "Account not specified");
  const googleAccount = account.split(" · ")[0] ?? account;
  const metaAccount = account.split(" · ").at(-1) ?? account;
  return [
    { ...common, id: `${baseId}-GOOGLE`, provider: "googleAds", campaignType: `Google ${String(record.googleCampaignType ?? "Campaign")}`, budgetLabel: googleBudget, accountLabel: googleAccount } as unknown as ManagedCampaignRecord,
    { ...common, id: `${baseId}-META`, provider: "metaAds", campaignType: "Meta Campaign", budgetLabel: metaBudget, accountLabel: metaAccount } as unknown as ManagedCampaignRecord,
  ];
}

export function readManagedCampaigns(): ManagedCampaignRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CAMPAIGNS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => normalizeLegacyRecord(item as Record<string, unknown>));
  } catch { return []; }
}

export function writeManagedCampaigns(records: ManagedCampaignRecord[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Store only provider-specific records. Never persist a BOTH row.
    const normalized = records.flatMap((item) => normalizeLegacyRecord(item as unknown as Record<string, unknown>));
    window.localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch { return false; }
}

export function toCampaignRecord(record: ManagedCampaignRecord): CampaignRecord {
  const platform = record.provider === "googleAds" ? "GOOGLE" : "META";
  return {
    ...record,
    groupId: record.groupId ?? record.id,
    platform,
    budget: record.budgetLabel,
    account: record.accountLabel || "Account not specified",
    description: `${record.campaignType} campaign · ${record.objective.replaceAll("_", " ").toLowerCase()}.`,
    structureLabel: platform === "GOOGLE" ? "Campaign → Ad groups → Ads" : "Campaign → Ad sets → Ads",
    activity: [{
      date: record.updatedAt,
      title: record.source === "SAMPLE" ? "Sample record" : record.creationStatus === "DRAFT" ? "Draft saved" : "Campaign request processed",
      description: record.jobId ? `Execution job ${record.jobId}. Provider resource creation is represented by the prototype execution monitor.` : "Stored in this browser prototype; live provider sync is not connected.",
      status: record.creationStatus === "FAILED" ? "error" : record.creationStatus === "PARTIAL_SUCCESS" ? "warning" : "success",
    }],
  };
}

export function getCampaignRecords(): CampaignRecord[] {
  const saved = readManagedCampaigns().map(toCampaignRecord);
  const savedIds = new Set(saved.map((item) => item.id));
  return [...saved, ...sampleCampaigns.filter((item) => !savedIds.has(item.id))];
}
