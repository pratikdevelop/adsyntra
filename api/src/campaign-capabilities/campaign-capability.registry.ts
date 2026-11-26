import { CAMPAIGN_CAPABILITY_DATA } from "./campaign-capability.data.js";
import type {
  CampaignCapabilityDefinition,
  CampaignCapabilityRegistryResponse,
  CampaignOperation,
  CampaignProvider,
} from "./campaign-capability.types.js";
export const CAMPAIGN_CAPABILITY_REGISTRY_VERSION = "1.1.0";
export const CAMPAIGN_CAPABILITY_SOURCE_SNAPSHOT_DATE = "2026-11-26";

function resolveGoogleAdsApiVersion(): string {
  const configured = process.env.GOOGLE_ADS_API_VERSION?.trim();
  return configured && /^v\d+$/.test(configured) ? configured : "v26";
}

function resolveMetaApiVersion(): string {
  const configured = process.env.META_GRAPH_API_VERSION?.trim();
  return configured && /^v\d+\.\d+$/.test(configured) ? configured : "v26.0";
}

export function isCampaignProvider(value: string): value is CampaignProvider {
  return value === "googleAds" || value === "metaAds";
}

export function getCampaignCapabilityRegistry(): CampaignCapabilityRegistryResponse {
  const apiVersions: Record<CampaignProvider, string> = {
    googleAds: resolveGoogleAdsApiVersion(),
    metaAds: resolveMetaApiVersion(),
  };

  const providers = (Object.keys(CAMPAIGN_CAPABILITY_DATA) as CampaignProvider[]).map((provider) => ({
    provider,
    apiVersion: apiVersions[provider],
    hierarchy: provider === "googleAds"
      ? ["Google Ads Customer", "Campaign", "Ad Group or Asset Group", "Ad / Criteria / Assets"]
      : ["Meta Ad Account", "Campaign", "Ad Set", "Ad"],
    campaignTypes: CAMPAIGN_CAPABILITY_DATA[provider].map((capability) => ({
      ...capability,
      apiVersion: apiVersions[provider],
    })),
    notes: provider === "googleAds"
      ? [
          "Google Ads keeps its provider-native resource hierarchy and campaign-type-specific rules.",
          "The builder business objective is an AdSyntra semantic preset, not a universal Google Campaign.objective field.",
        ]
      : [
          "Meta Campaign, Ad Set and Ad remain separate provider-native resources.",
          "Budget, optimization, billing, placements and destination compatibility must be validated together.",
        ],
  }));

  return {
    registryVersion: CAMPAIGN_CAPABILITY_REGISTRY_VERSION,
    sourceSnapshotDate: CAMPAIGN_CAPABILITY_SOURCE_SNAPSHOT_DATE,
    verificationNotice: "Statuses describe source-code coverage in the supplied AdSyntra project snapshot. They do not mean live provider validation, account eligibility or production readiness has been verified.",
    apiVersions,
    providers,
  };
}

export function getCampaignCapabilities(
  provider?: CampaignProvider,
): CampaignCapabilityDefinition[] {
  if (provider) {
    return getCampaignCapabilityRegistry().providers
      .find((item) => item.provider === provider)?.campaignTypes ?? [];
  }

  return getCampaignCapabilityRegistry().providers.flatMap((item) => item.campaignTypes);
}

/** Resolve an incoming provider-native campaign type to its registry entry. */
export function findCampaignCapabilityByProviderType(
  provider: CampaignProvider,
  providerCampaignType: string,
): CampaignCapabilityDefinition | undefined {
  const normalizedType = providerCampaignType.trim().toUpperCase();
  return getCampaignCapabilities(provider).find((capability) =>
    capability.providerCampaignType?.toUpperCase() === normalizedType,
  );
}


export function findCampaignCapability(
  provider: CampaignProvider,
  campaignType: string,
): CampaignCapabilityDefinition | undefined {
  const normalizedType = campaignType.trim().toUpperCase();
  return getCampaignCapabilities(provider).find(
    (capability) => capability.builderCampaignType.toUpperCase() === normalizedType,
  );
}

export function isCampaignOperationImplementedInSource(
  provider: CampaignProvider,
  campaignType: string,
  operation: CampaignOperation,
): boolean {
  const capability = findCampaignCapability(provider, campaignType);
  return capability?.operations[operation]?.status === "IMPLEMENTED_IN_SOURCE";
}
