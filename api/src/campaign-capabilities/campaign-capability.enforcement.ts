import {
  findCampaignCapabilityByProviderType,
} from "./campaign-capability.registry.js";
import type {
  CampaignCapabilityDefinition,
  CampaignProvider,
  CapabilityOption,
} from "./campaign-capability.types.js";

export interface CampaignCreateGateResult {
  allowed: boolean;
  capability: CampaignCapabilityDefinition | null;
  reason: string | null;
  warning: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(
  record: Record<string, unknown> | null,
  ...keys: string[]
): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function optionContains(
  options: CapabilityOption[] | undefined,
  value: string,
): boolean {
  return Boolean(options?.some((option) =>
    option.value === value &&
    (!option.implementationStatus || option.implementationStatus === "IMPLEMENTED_IN_SOURCE"),
  ));
}

/**
 * Enforce the registry's create-operation status at the API boundary.
 * PARTIAL workflows remain available for validate-only requests, but cannot
 * perform live provider mutations until their documented limitations are fixed.
 */
export function evaluateCampaignCreateGate(
  provider: CampaignProvider,
  providerCampaignType: string,
  validateOnly: boolean,
): CampaignCreateGateResult {
  const capability = findCampaignCapabilityByProviderType(
    provider,
    providerCampaignType,
  ) ?? null;

  if (!capability) {
    return {
      allowed: false,
      capability: null,
      reason: `Campaign creation is not enabled for ${provider} campaign type "${providerCampaignType}" because it is not registered in the Campaign Capability Registry.`,
      warning: null,
    };
  }

  const createStatus = capability.operations.create.status;
  const detail = capability.operations.create;
  const limitationText = detail.limitations?.length
    ? ` Limitations: ${detail.limitations.join(" ")}`
    : "";

  if (createStatus === "IMPLEMENTED_IN_SOURCE") {
    return { allowed: true, capability, reason: null, warning: null };
  }

  if (createStatus === "PARTIAL") {
    if (validateOnly) {
      return {
        allowed: true,
        capability,
        reason: null,
        warning: `${capability.label} is only partially implemented. This request is validation-only; live creation remains blocked.${limitationText}`,
      };
    }

    return {
      allowed: false,
      capability,
      reason: `Live creation is blocked for ${capability.label} because its registry status is PARTIAL. ${detail.summary}${limitationText} Submit a validation-only request or complete the documented implementation work first.`,
      warning: null,
    };
  }

  return {
    allowed: false,
    capability,
    reason: `Creation is not available for ${capability.label} (${createStatus}). ${detail.summary}${limitationText}`,
    warning: null,
  };
}

/**
 * Validate provider options that are explicitly enumerated in the registry.
 * This guards direct API calls as well as the frontend selectors.
 */
export function getCapabilityConfigurationError(
  provider: CampaignProvider,
  providerCampaignType: string,
  providerObjective: string,
  configurationValue: unknown,
): string | null {
  const capability = findCampaignCapabilityByProviderType(
    provider,
    providerCampaignType,
  );
  if (!capability) return null;

  const configuration = asRecord(configurationValue);
  if (!configuration) return null;

  const campaign = asRecord(configuration.campaign);
  const adSet = asRecord(configuration.adSet);

  if (provider === "googleAds") {
    const performanceGoal = readString(campaign, "performanceGoalPreset", "performance_goal_preset");
    if (
      performanceGoal &&
      capability.options?.performanceGoals &&
      !optionContains(capability.options.performanceGoals, performanceGoal)
    ) {
      return `Google Ads performance goal "${performanceGoal}" is not listed as supported for ${capability.label} in the Campaign Capability Registry.`;
    }

    const biddingStrategy = readString(campaign, "biddingStrategy", "bidding_strategy");
    if (
      biddingStrategy &&
      capability.options?.biddingStrategies &&
      !optionContains(capability.options.biddingStrategies, biddingStrategy)
    ) {
      return `Google Ads bidding strategy "${biddingStrategy}" is not listed as supported for ${capability.label} in the Campaign Capability Registry.`;
    }
    return null;
  }

  const objective = readString(campaign, "objective") ?? providerObjective;
  const objectiveOptions = capability.options?.providerObjectives;
  if (objectiveOptions && !optionContains(objectiveOptions, objective)) {
    return `Meta campaign objective "${objective}" is not listed as supported in the Campaign Capability Registry.`;
  }

  const buyingType = readString(campaign, "buyingType", "buying_type") ?? "AUCTION";
  if (
    capability.options?.buyingTypes &&
    !optionContains(capability.options.buyingTypes, buyingType)
  ) {
    return `Meta buying type "${buyingType}" is not enabled for the current AdSyntra campaign workflow.`;
  }

  const optimizationGoal = readString(adSet, "optimization_goal", "optimizationGoal");
  if (optimizationGoal) {
    const allowedGoals = capability.options?.optimizationGoalsByObjective?.[objective];
    if (allowedGoals && !optionContains(allowedGoals, optimizationGoal)) {
      return `Meta optimization goal "${optimizationGoal}" is not supported for objective "${objective}" according to the Campaign Capability Registry.`;
    }
  }

  const bidStrategy =
    readString(adSet, "bid_strategy", "bidStrategy") ??
    readString(campaign, "bidStrategy", "bid_strategy");
  if (
    bidStrategy &&
    capability.options?.biddingStrategies &&
    !optionContains(capability.options.biddingStrategies, bidStrategy)
  ) {
    return `Meta bid strategy "${bidStrategy}" is not enabled for the current AdSyntra campaign workflow.`;
  }

  return null;
}
