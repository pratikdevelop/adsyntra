import { ProviderName, Objective, CampaignLifecycleStatus, DemoOverallStatus, CreativeAspectRatio, AssetKind, DemoResourceStatus, DemoProviderStatus, DemoScenario } from "./type";

export interface ManagedCampaignRecord {
    id: string;
    groupId?: string;
    name: string;
    provider: ProviderName;
    campaignType: string;
    googleCampaignType?: string;
    objective: Objective;
    budgetLabel: string;
    status: CampaignLifecycleStatus;
    creationStatus: DemoOverallStatus | "DRAFT";
    accountLabel: string;
    createdAt: string;
    updatedAt: string;
    source: "SAMPLE" | "LOCAL";
    jobId?: string;
}

export interface GoogleCreativePack {
    campaignType: string;
    subFormat?: string;
    formatLabel: string;
    headlines: string[];
    longHeadlines: string[];
    descriptions: string[];
    finalUrl: string;
    imageUrl?: string;
}

export interface CreativeVariation {
    id: string;
    name: string;
    kind: "IMAGE" | "VIDEO";
    prompt: string;
    headline: string;
    primaryText: string;
    callToAction: string;
    aspectRatio: CreativeAspectRatio;
    googleAspectRatio: CreativeAspectRatio;
    googleMediaUrl: string;
    styleLabel: string;
    previewLabel: string;
    url: string;
    generatedAt: string;
    googlePack: GoogleCreativePack;
}

export interface LibraryAsset {
    id: string;
    name: string;
    kind: AssetKind;
    url: string;
    addedAt: string;
    origin?: "MANUAL" | "AI_STUDIO";
    prompt?: string;
    aspectRatio?: string;
    platformTargets?: ProviderName[];
    googlePack?: GoogleCreativePack;
}

export interface DemoResourceResult {
    key: string;
    label: string;
    status: DemoResourceStatus;
    resourceId: string | null;
    errorCode?: string;
    errorMessage?: string;
    endpoint?: string;
    attemptCount?: number;
    requestId?: string;
    responseSummary?: string;
}

export interface DemoProviderResult {
    provider: ProviderName;
    status: DemoProviderStatus;
    resources: DemoResourceResult[];
}

export interface DemoCreationJob {
    jobId: string;
    createdAt: string;
    scenario: DemoScenario;
    overallStatus: DemoOverallStatus;
    providers: DemoProviderResult[];
}

export interface ConnectionResponse {
    providers?: {
        googleAds?: Partial<ProviderConnection>;
        metaAds?: Partial<ProviderConnection>;
    };
    message?: string;
}

export interface ProviderConnection {
    connected: boolean;
    accounts: unknown[];
    selectedAccountId: string | null;
}