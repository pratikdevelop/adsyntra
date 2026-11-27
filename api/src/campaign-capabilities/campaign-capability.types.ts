export type CampaignProvider = "googleAds" | "metaAds";

/**
 * Source implementation status, not a claim that a provider account has been
 * live-tested. Keep this separate from provider API support and runtime QA.
 */
export type CapabilityImplementationStatus =
  | "IMPLEMENTED_IN_SOURCE"
  | "PARTIAL"
  | "NOT_IMPLEMENTED"
  | "BLOCKED_EXTERNAL"
  | "READ_ONLY";

export type CampaignOperation =
  | "create"
  | "list"
  | "read"
  | "rename"
  | "pause"
  | "resume"
  | "delete"
  | "editConfiguration";

export type CampaignFeature =
  | "budget"
  | "bidding"
  | "schedule"
  | "locationTargeting"
  | "languageTargeting"
  | "audienceTargeting"
  | "demographicTargeting"
  | "placements"
  | "conversionMeasurement"
  | "identityAndDestination"
  | "commerceResources"
  | "creativeAssets"
  | "reporting";

export interface CapabilityStatusDetail {
  status: CapabilityImplementationStatus;
  summary: string;
  limitations?: string[];
}

export interface CapabilityOption {
  value: string;
  label: string;
  description?: string;
   /** Provider enum may exist even when this AdSyntra workflow is not ready. */
 implementationStatus?: CapabilityImplementationStatus;
 limitation?: string;
}

export interface CampaignCapabilityDefinition {
  /** Stable internal identifier. Never send this ID to a provider API. */
  id: string;
  provider: CampaignProvider;
  label: string;
  /** Value currently used by AdSyntra's campaign builder. */
  builderCampaignType: string;
  /** Provider-native campaign type / resource value, if applicable. */
  providerCampaignType: string | null;
  /** Describes whether providerCampaignType is a native API enum or a UI profile. */
  providerCampaignTypeKind: "NATIVE" | "BUILDER_PROFILE";
  hierarchy: string[];
  apiVersion: string;
  operations: Record<CampaignOperation, CapabilityStatusDetail>;
  features: Partial<Record<CampaignFeature, CapabilityStatusDetail>>;
  options?: {
    /** Shared semantic presets are not necessarily provider-native objective fields. */
    businessObjectives?: CapabilityOption[];
    providerObjectives?: CapabilityOption[];
    performanceGoals?: CapabilityOption[];
    biddingStrategies?: CapabilityOption[];
    buyingTypes?: CapabilityOption[];
    optimizationGoalsByObjective?: Record<string, CapabilityOption[]>;
  };
  prerequisites?: string[];
  notes?: string[];
  migration?: {
    replacementProfile?: string;
    message: string;
  };
}

export interface ProviderCapabilitySummary {
  provider: CampaignProvider;
  apiVersion: string;
  hierarchy: string[];
  campaignTypes: CampaignCapabilityDefinition[];
  notes: string[];
}

export interface CampaignCapabilityRegistryResponse {
  registryVersion: string;
  sourceSnapshotDate: string;
  verificationNotice: string;
  apiVersions: Record<CampaignProvider, string>;
  providers: ProviderCapabilitySummary[];
}
