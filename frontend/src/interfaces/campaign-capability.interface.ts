export type CampaignCapabilityProvider = "googleAds" | "metaAds";

export type CapabilityImplementationStatus =
  | "IMPLEMENTED_IN_SOURCE"
  | "PARTIAL"
  | "NOT_IMPLEMENTED"
  | "BLOCKED_EXTERNAL"
  | "READ_ONLY";

export interface CampaignCapabilityStatusDetail {
  status: CapabilityImplementationStatus;
  summary: string;
  limitations?: string[];
}

export interface CampaignCapabilityOption {
  value: string;
  label: string;
  description?: string;
 implementationStatus?: CapabilityImplementationStatus;
  limitation?: string;
}

export interface CampaignCapabilityDefinition {
  id: string;
  provider: CampaignCapabilityProvider;
  label: string;
  builderCampaignType: string;
  providerCampaignType: string | null;
  providerCampaignTypeKind: "NATIVE" | "BUILDER_PROFILE";
  hierarchy: string[];
  apiVersion: string;
  operations: Record<string, CampaignCapabilityStatusDetail>;
  features: Record<string, CampaignCapabilityStatusDetail | undefined>;
  options?: {
    businessObjectives?: CampaignCapabilityOption[];
    providerObjectives?: CampaignCapabilityOption[];
    performanceGoals?: CampaignCapabilityOption[];
    biddingStrategies?: CampaignCapabilityOption[];
    buyingTypes?: CampaignCapabilityOption[];
    optimizationGoalsByObjective?: Record<string, CampaignCapabilityOption[]>;
  };
  prerequisites?: string[];
  notes?: string[];
  migration?: {
    replacementProfile?: string;
    message: string;
  };
}

export interface CampaignCapabilityProviderSummary {
  provider: CampaignCapabilityProvider;
  apiVersion: string;
  hierarchy: string[];
  campaignTypes: CampaignCapabilityDefinition[];
  notes: string[];
}

export interface CampaignCapabilityRegistry {
  registryVersion: string;
  sourceSnapshotDate: string;
  verificationNotice: string;
  apiVersions: Record<CampaignCapabilityProvider, string>;
  providers: CampaignCapabilityProviderSummary[];
}

export interface CampaignCapabilityRegistryApiResponse {
  success: boolean;
  data?: CampaignCapabilityRegistry;
  message?: string;
}

export function formatCapabilityStatus(status?: CapabilityImplementationStatus): string {
  switch (status) {
    case "IMPLEMENTED_IN_SOURCE":
      return "Implemented in source";
    case "PARTIAL":
      return "Partially implemented";
    case "NOT_IMPLEMENTED":
      return "Not implemented";
    case "BLOCKED_EXTERNAL":
      return "Blocked by external prerequisite";
    case "READ_ONLY":
      return "Read / report only";
    default:
      return "Status unavailable";
  }
}
