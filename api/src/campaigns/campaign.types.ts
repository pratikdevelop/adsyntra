import type { ObjectId } from "mongodb";

/**
 * The frontend's campaign-builder.v1 contract is normalized provider intent,
 * not a raw Google Ads or Meta Graph API request body.
 */
export const CAMPAIGN_CONTRACT_VERSION = "campaign-builder.v1" as const;

export type CampaignProvider = "googleAds" | "metaAds";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface CampaignCommonInput {
  name: string;
  businessName: string;
  websiteUrl: string | null;
  description: string | null;
  objective: string;
}

/**
 * Provider configurations deliberately retain the complete normalized form
 * object. The outer fields are typed; nested provider settings remain JSON so
 * adding campaign types or creative fields does not silently discard them.
 */
export interface ProviderCampaignConfiguration {
  accountId: string;
  campaign: JsonObject;
  [key: string]: unknown;
}

export interface GoogleAdsCampaignConfiguration
  extends ProviderCampaignConfiguration {
  adGroup?: JsonObject;
  assetGroup?: JsonObject;
  ad?: JsonObject;
  adCreativeDraft?: JsonObject;
}

export interface MetaAdsCampaignConfiguration
  extends ProviderCampaignConfiguration {
  adSet?: JsonObject;
  ad?: JsonObject;
}

export interface CampaignBuilderV1Input {
  contractVersion: typeof CAMPAIGN_CONTRACT_VERSION;
  contractType: "NORMALIZED_PROVIDER_INTENT_NOT_RAW_API_BODY";
  providerApiTargets?: {
    googleAds?: string;
    metaMarketingApi?: string;
  };
  common: CampaignCommonInput;
  platforms: CampaignProvider[];
  providerConfigurations: {
    googleAds?: GoogleAdsCampaignConfiguration;
    metaAds?: MetaAdsCampaignConfiguration;
  };
  /**
   * apiExecutionPlan is descriptive frontend metadata only. The backend must
   * never execute provider API calls based on this field.
   */
  apiExecutionPlan?: JsonObject;
  launch?: JsonObject;
}

export type CampaignCreationStatus =
  | "pending"
  | "in_progress"
  | "succeeded"
  | "partially_succeeded"
  | "failed"
  | "needs_reconciliation";

export type CampaignDeliveryStatus =
  | "PAUSED"
  | "ACTIVE"
  | "REMOVED"
  | "UNKNOWN";

export type ProviderResourceStatus =
  | "pending"
  | "created"
  | "failed"
  | "unknown";

export interface ProviderResourceReference {
  kind:
    | "campaign"
    | "campaign_budget"
    | "ad_group"
    | "asset_group"
    | "ad_set"
    | "ad"
    | "ad_creative"
    | "asset"
    | "other";
  resourceId: string | null;
  resourceName?: string | null;
  status: ProviderResourceStatus;
  /** Non-secret provider metadata useful for reconciliation and diagnostics. */
  metadata?: JsonObject;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CampaignError {
  code?: string;
  message: string;
  /** Sanitized provider error details; never store access or refresh tokens. */
  details?: JsonValue;
}

export interface CampaignRecord {
  _id?: ObjectId;
  ownerUserId: string;
  initiativeId: string;
  contractVersion: typeof CAMPAIGN_CONTRACT_VERSION;
  provider: CampaignProvider;
  accountId: string;
  name: string;
  businessName: string;
  websiteUrl: string | null;
  description: string | null;
  objective: string;
  /** Version supplied by the UI for diagnostics only, not API selection. */
  requestedProviderApiTarget?: string;
  /** Complete normalized provider object from providerConfigurations[provider]. */
  configuration: ProviderCampaignConfiguration;
  providerCampaignId: string | null;
  providerCampaignResourceName?: string | null;
  providerStatus?: string | null;
  creationStatus: CampaignCreationStatus;
  deliveryStatus: CampaignDeliveryStatus;
  resources: ProviderResourceReference[];
  lastError?: CampaignError | null;
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt?: Date | null;
}

export type CampaignOperationStatus =
  | "queued"
  | "in_progress"
  | "succeeded"
  | "partially_succeeded"
  | "failed"
  | "needs_reconciliation";

export type ProviderAttemptStatus =
  | "pending"
  | "in_progress"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "needs_reconciliation"
  | "skipped";

export interface CampaignProviderOperationResult {
  status: ProviderAttemptStatus;
  campaignRecordId?: ObjectId | null;
  providerCampaignId?: string | null;
  resources: ProviderResourceReference[];
  attemptCount: number;
  error?: CampaignError | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}

export interface CampaignOperationRecord {
  _id?: ObjectId;
  ownerUserId: string;
  initiativeId: string;
  contractVersion: typeof CAMPAIGN_CONTRACT_VERSION;
  idempotencyKey: string;
  requestFingerprint: string;
  status: CampaignOperationStatus;
  providers: Partial<Record<CampaignProvider, CampaignProviderOperationResult>>;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
}
