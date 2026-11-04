import { createHash, randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import {
  CAMPAIGN_CONTRACT_VERSION,
  type CampaignBuilderV1Input,
  type CampaignOperationRecord,
  type CampaignProvider,
  type CampaignRecord,
  type GoogleAdsCampaignConfiguration,
  type JsonObject,
  type MetaAdsCampaignConfiguration,
  type ProviderCampaignConfiguration,
} from "./campaign.types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalNullableString(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string or null.`);
  }
  return value.trim() || null;
}

function parseProviderConfiguration(
  raw: any,
  provider: CampaignProvider,
): ProviderCampaignConfiguration {
  if (!isRecord(raw)) {
    throw new Error(`providerConfigurations.${provider} is required.`);
  }
  const accountId = requiredString(raw[`accountId`], `providerConfigurations.${provider}.accountId`);
  if (!isRecord(raw[`campaign`])) {
    throw new Error(`providerConfigurations.${provider}.campaign must be an object.`);
  }
  requiredString(raw[`campaign`][`name`], `providerConfigurations.${provider}.campaign.name`);

  return {
    ...raw,
    accountId,
    campaign: raw[`campaign`] as JsonObject,
  } as ProviderCampaignConfiguration;
}

/**
 * Validate the stable outer shape of the existing campaign-builder.v1 payload.
 * Provider-specific nested fields remain intact for the provider adapters.
 */
export function parseCampaignBuilderV1Input(raw: unknown): CampaignBuilderV1Input {
  if (!isRecord(raw)) {
    throw new Error("Campaign request body must be a JSON object.");
  }
  if (raw[`contractVersion`] !== CAMPAIGN_CONTRACT_VERSION) {
    throw new Error(`contractVersion must be ${CAMPAIGN_CONTRACT_VERSION}.`);
  }
  if (raw[`contractType`] !== "NORMALIZED_PROVIDER_INTENT_NOT_RAW_API_BODY") {
    throw new Error("Unsupported campaign contractType.");
  }
  if (!isRecord(raw[`common`])) {
    throw new Error("common must be an object.");
  }
  if (!Array.isArray(raw[`platforms`]) || raw[`platforms`].length === 0) {
    throw new Error("Select at least one campaign provider.");
  }

  const platforms = raw[`platforms`].map((value): CampaignProvider => {
    if (value !== "googleAds" && value !== "metaAds") {
      throw new Error("platforms may contain only googleAds and metaAds.");
    }
    return value;
  });
  if (new Set(platforms).size !== platforms.length) {
    throw new Error("platforms must not contain duplicate providers.");
  }

  const common = {
    name: requiredString(raw[`common`][`name`], "common.name"),
    businessName: requiredString(raw[`common`][`businessName`], "common.businessName"),
    websiteUrl: optionalNullableString(raw[`common`][`websiteUrl`], "common.websiteUrl"),
    description: optionalNullableString(raw[`common`][`description`], "common.description"),
    objective: requiredString(raw[`common`][`objective`], "common.objective"),
  };

  if (!isRecord(raw[`providerConfigurations`])) {
    throw new Error("providerConfigurations must be an object.");
  }

  const providerConfigurations: CampaignBuilderV1Input["providerConfigurations"] = {};
  for (const provider of platforms) {
    const configuration = parseProviderConfiguration(
      raw[`providerConfigurations`][provider],
      provider,
    );
    if (provider === "googleAds") {
      providerConfigurations.googleAds = configuration as GoogleAdsCampaignConfiguration;
    } else {
      providerConfigurations.metaAds = configuration as MetaAdsCampaignConfiguration;
    }
  }

  return {
    contractVersion: CAMPAIGN_CONTRACT_VERSION,
    contractType: "NORMALIZED_PROVIDER_INTENT_NOT_RAW_API_BODY",
    providerApiTargets: isRecord(raw[`providerApiTargets`])
      ? {
        ...(typeof raw[`providerApiTargets`][`googleAds`] === "string"
          ? { googleAds: raw[`providerApiTargets`][`googleAds`] }
          : {}),
        ...(typeof raw[`providerApiTargets`][`metaMarketingApi`] === "string"
          ? { metaMarketingApi: raw[`providerApiTargets`][`metaMarketingApi`] }
          : {}),
      }
      : undefined,
    common,
    platforms,
    providerConfigurations,
    // Keep this metadata available to the caller for diagnostics, but it is
    // deliberately excluded from campaign documents and provider execution.
    ...(isRecord(raw[`apiExecutionPlan`]) ? { apiExecutionPlan: raw[`apiExecutionPlan`] as JsonObject } : {}),

    ...(isRecord(raw[`launch`]) ? { launch: raw[`launch`] as JsonObject } : {}),
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

export function fingerprintCampaignIntent(input: CampaignBuilderV1Input): string {
  const fingerprintInput = { ...input };
  delete fingerprintInput.apiExecutionPlan;
  // These labels come from the UI and do not select the backend API version.
  delete fingerprintInput.providerApiTargets;
  const canonical = JSON.stringify(stableValue(fingerprintInput));
  if (canonical === undefined) {
    throw new Error("Campaign request could not be serialized for idempotency.");
  }
  return createHash("sha256").update(canonical).digest("hex");
}

export interface BuildCampaignPersistenceBundleInput {
  ownerUserId: string;
  idempotencyKey: string;
  campaign: CampaignBuilderV1Input;
  now?: Date;
  initiativeId?: string;
}

export interface CampaignPersistenceBundle {
  initiativeId: string;
  campaignRecords: CampaignRecord[];
  operation: CampaignOperationRecord;
}

/**
 * Build the initial MongoDB documents before calling either ads provider.
 * One document is created per selected provider, linked by initiativeId.
 */
export function buildCampaignPersistenceBundle(
  args: BuildCampaignPersistenceBundleInput,
): CampaignPersistenceBundle {
  const ownerUserId = requiredString(args.ownerUserId, "ownerUserId");
  const idempotencyKey = requiredString(args.idempotencyKey, "idempotencyKey");
  if (idempotencyKey.length > 200) {
    throw new Error("Idempotency-Key must be at most 200 characters.");
  }

  const campaign = parseCampaignBuilderV1Input(args.campaign);
  const now = args.now ?? new Date();
  const initiativeId = args.initiativeId ?? randomUUID();
  const campaignRecords: CampaignRecord[] = campaign.platforms.map((provider) => {
    const configuration = campaign.providerConfigurations[provider];
    if (!configuration) {
      throw new Error(`Missing ${provider} campaign configuration.`);
    }

    const campaignSettings: any = configuration.campaign;
    const providerCampaignName =
      typeof campaignSettings.name === "string" && campaignSettings.name.trim()
        ? campaignSettings.name.trim()
        : campaign.common.name;
    const providerObjective =
      typeof campaignSettings.objective === "string"
        ? campaignSettings.objective
        : null;
    const providerCampaignType =
      typeof campaignSettings.campaignType === "string"
        ? campaignSettings.campaignType
        : null;
    const requestedProviderApiTarget =
      provider === "googleAds"
        ? campaign.providerApiTargets?.googleAds
        : campaign.providerApiTargets?.metaMarketingApi;

    return {
      _id: new ObjectId(),
      ownerUserId,
      initiativeId,
      contractVersion: CAMPAIGN_CONTRACT_VERSION,
      provider,
      accountId: configuration.accountId,
      name: providerCampaignName,
      businessName: campaign.common.businessName,
      websiteUrl: campaign.common.websiteUrl,
      description: campaign.common.description,
      objective: campaign.common.objective,
      providerObjective,
      providerCampaignType,
      ...(requestedProviderApiTarget
        ? { requestedProviderApiTarget }
        : {}),
      configuration,
      providerCampaignId: null,
      providerCampaignResourceName: null,
      providerStatus: null,
      creationStatus: "pending",
      deliveryStatus: "PAUSED",
      resources: [],
      lastError: null,
      createdAt: now,
      updatedAt: now,
      lastSyncedAt: null,
    };
  });

  const providers: CampaignOperationRecord["providers"] = {};
  for (const record of campaignRecords) {
    providers[record.provider] = {
      status: "pending",
      campaignRecordId: record._id ?? null,
      providerCampaignId: null,
      resources: [],
      attemptCount: 0,
      error: null,
      startedAt: null,
      finishedAt: null,
    };
  }

  const operation: CampaignOperationRecord = {
    _id: new ObjectId(),
    ownerUserId,
    initiativeId,
    contractVersion: CAMPAIGN_CONTRACT_VERSION,
    idempotencyKey,
    requestFingerprint: fingerprintCampaignIntent(campaign),
    status: "queued",
    providers,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  return { initiativeId, campaignRecords, operation };
}
