/**
 * Persistence boundary for the unified Google Ads / Meta Ads campaign builder.
 *
 * This module deliberately does not assume a backend route or database ORM.
 * Wire `CampaignPersistenceApi` to the project's existing authenticated API
 * once its route/controller contract is available. The Create Campaign UI can
 * keep producing campaign-builder.v1 exactly as it does today.
 */

export type CampaignProvider = "googleAds" | "metaAds";
export type ProviderRunStatus =
  | "DRAFT"
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "FAILED";

export interface CampaignBuilderPayloadV1 {
  contractVersion: "campaign-builder.v1";
  contractType: "NORMALIZED_PROVIDER_INTENT_NOT_RAW_API_BODY";
  common: {
    name: string;
    businessName: string;
    websiteUrl: string | null;
    description: string | null;
    objective: string;
  };
  platforms: CampaignProvider[];
  providerConfigurations: Partial<
    Record<CampaignProvider, Record<string, unknown>>
  >;
  apiExecutionPlan?: Record<string, unknown>;
  launch?: { initialStatus?: "PAUSED" | "ACTIVE" };
  [key: string]: unknown;
}

/** One shared brief can create two independently managed provider records. */
export interface ProviderCampaignRecord {
  schemaVersion: 1;
  initiativeId: string;
  provider: CampaignProvider;
  name: string;
  objective: string;
  accountId: string;
  providerCampaignId: string | null;
  providerParentResourceId: string | null;
  status: ProviderRunStatus;
  configuration: Record<string, unknown>;
  lastSyncedAt: string | null;
  lastError: { code?: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignInitiativeRecord {
  schemaVersion: 1;
  id: string;
  name: string;
  businessName: string;
  websiteUrl: string | null;
  description: string | null;
  objective: string;
  providerCampaignIds: Partial<Record<CampaignProvider, string>>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCampaignPersistenceRequest {
  schemaVersion: 1;
  idempotencyKey: string;
  initiative: Pick<
    CampaignInitiativeRecord,
    "name" | "businessName" | "websiteUrl" | "description" | "objective"
  >;
  campaigns: Array<{
    provider: CampaignProvider;
    accountId: string;
    configuration: Record<string, unknown>;
    initialStatus: "PAUSED";
  }>;
}

export interface ProviderCreateResult {
  provider: CampaignProvider;
  status: ProviderRunStatus;
  providerCampaignId?: string;
  providerParentResourceId?: string;
  error?: { code?: string; message: string };
}

export interface CreateCampaignPersistenceResponse {
  initiative: CampaignInitiativeRecord;
  campaigns: ProviderCampaignRecord[];
  results: ProviderCreateResult[];
}

export interface CampaignPersistenceApi {
  /** Persist the initiative and provider-specific configurations before launch. */
  saveDraft(
    request: Omit<CreateCampaignPersistenceRequest, "idempotencyKey">,
  ): Promise<{ initiativeId: string; campaignIds: Partial<Record<CampaignProvider, string>> }>;

  /** Create each selected provider independently; partial success is expected. */
  createCampaigns(
    request: CreateCampaignPersistenceRequest,
  ): Promise<CreateCampaignPersistenceResponse>;

  /** Fetch one provider record with its saved configuration for the edit page. */
  getCampaign(campaignId: string): Promise<ProviderCampaignRecord>;

  /** Update only the provider record addressed by campaignId. */
  updateCampaign(
    campaignId: string,
    patch: { configuration: Record<string, unknown>; expectedUpdatedAt?: string },
  ): Promise<ProviderCampaignRecord>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Validate the builder contract and prevent a missing provider config being saved. */
export function assertCampaignBuilderPayload(
  value: unknown,
): asserts value is CampaignBuilderPayloadV1 {
  if (!isObject(value) || value.contractVersion !== "campaign-builder.v1") {
    throw new Error("Unsupported campaign builder payload version.");
  }
  if (!isObject(value.common) || !isObject(value.providerConfigurations)) {
    throw new Error("Campaign payload is missing common or provider configuration data.");
  }
  if (!Array.isArray(value.platforms) || value.platforms.length === 0) {
    throw new Error("Select at least one advertising platform.");
  }
  for (const provider of value.platforms) {
    if (provider !== "googleAds" && provider !== "metaAds") {
      throw new Error(`Unsupported campaign provider: ${String(provider)}`);
    }
    const configuration = value.providerConfigurations[provider];
    if (!isObject(configuration)) {
      throw new Error(`Missing ${provider} configuration in campaign payload.`);
    }
    if (typeof configuration.accountId !== "string" || !configuration.accountId.trim()) {
      throw new Error(`Missing selected account ID for ${provider}.`);
    }
  }
  if (typeof value.common.name !== "string" || !value.common.name.trim()) {
    throw new Error("Campaign name is required.");
  }
}

/**
 * Convert the existing unified payload into separate provider campaign rows.
 * The full provider configuration is retained so edit screens can hydrate
 * every supported field without attempting to reconstruct it from API readback.
 */
export function buildCreateCampaignRequest(
  payload: CampaignBuilderPayloadV1,
  idempotencyKey: string,
): CreateCampaignPersistenceRequest {
  assertCampaignBuilderPayload(payload);
  if (!idempotencyKey.trim()) throw new Error("An idempotency key is required.");

  return {
    schemaVersion: 1,
    idempotencyKey,
    initiative: {
      name: payload.common.name.trim(),
      businessName: payload.common.businessName,
      websiteUrl: payload.common.websiteUrl,
      description: payload.common.description,
      objective: payload.common.objective,
    },
    campaigns: payload.platforms.map((provider) => {
      const configuration = payload.providerConfigurations[provider];
      if (!configuration || !isObject(configuration)) {
        throw new Error(`Missing ${provider} configuration.`);
      }
      return {
        provider,
        accountId: String(configuration.accountId),
        configuration: structuredClone(configuration),
        // Creation starts paused so each platform can be reviewed independently.
        initialStatus: "PAUSED" as const,
      };
    }),
  };
}

/** Do not treat a multi-provider operation as atomic. */
export function summarizeProviderResults(results: ProviderCreateResult[]) {
  const successful = results.filter((result) => result.status === "SUCCESS").length;
  const failed = results.filter((result) => result.status === "FAILED").length;
  const pending = results.length - successful - failed;
  const overallStatus: ProviderRunStatus =
    successful === results.length
      ? "SUCCESS"
      : failed === results.length
        ? "FAILED"
        : successful > 0 || (failed > 0 && pending > 0)
          ? "PARTIAL_SUCCESS"
          : "RUNNING";

  return { overallStatus, successful, failed, pending };
}

/**
 * Build a provider-specific update patch. Callers must pass the configuration
 * for the same provider as the campaign record; never fan one edit to both APIs.
 */
export function buildProviderUpdatePatch(
  campaign: Pick<ProviderCampaignRecord, "provider" | "configuration" | "updatedAt">,
  nextConfiguration: Record<string, unknown>,
) {
  if (!isObject(nextConfiguration)) {
    throw new Error("Updated campaign configuration must be an object.");
  }
  if (nextConfiguration.provider && nextConfiguration.provider !== campaign.provider) {
    throw new Error("Provider mismatch: this campaign can only be edited on its own platform.");
  }
  return {
    configuration: structuredClone(nextConfiguration),
    expectedUpdatedAt: campaign.updatedAt,
  };
}
