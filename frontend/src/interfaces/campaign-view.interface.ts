export type ProviderKey = "googleAds" | "metaAds";
export type RecordValue = Record<string, any>;
export type ChildRecord = RecordValue;
export type Accent = "blue" | "emerald" | "amber" | "violet" | "rose" | "cyan" | "slate";

export const ACCENT_MAP: Record<Accent, { bg: string; fg: string }> = {
  blue: { bg: "rgba(59,130,246,0.10)", fg: "#2563eb" },
  emerald: { bg: "rgba(16,185,129,0.10)", fg: "#059669" },
  amber: { bg: "rgba(245,158,11,0.12)", fg: "#d97706" },
  violet: { bg: "rgba(139,92,246,0.10)", fg: "#7c3aed" },
  rose: { bg: "rgba(244,63,94,0.10)", fg: "#e11d48" },
  cyan: { bg: "rgba(6,182,212,0.10)", fg: "#0891b2" },
  slate: { bg: "rgba(100,116,139,0.10)", fg: "#475569" },
};

export interface CampaignRecord extends RecordValue {
  id: string;
  provider: ProviderKey;
  name: string;
  accountId: string | null;
  status: string | null;
  effectiveStatus: string | null;
  objective: string | null;
  source: RecordValue;
}

export interface CampaignApiResponse {
  success?: boolean;
  message?: string;
  campaigns?: RecordValue[];
  providers?: Partial<Record<ProviderKey, RecordValue>>;
}


/* ------------------------------- creative extraction (unchanged) --------- */
export interface CreativeMediaItem {
  url: string;
  label: string;
  sourcePath: string;
  width?: number | null;
  height?: number | null;
  mimeType?: string | null;
}
export interface CreativeVideoItem {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  sourcePath: string;
  embedUrl: string | null;
}
export interface CreativeAssetItem {
  id: string;
  type: string;
  name: string | null;
  text: string | null;
  url: string | null;
  videoId: string | null;
  width?: number | null;
  height?: number | null;
  thumbnailUrl?: string | null;
  mimeType?: string | null;
  resolutionError?: string | null;
  sourcePath: string;
  details: RecordValue;
}
