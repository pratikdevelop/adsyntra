import { Schema, model, type HydratedDocument } from "mongoose";

export const ADVERTISING_PROVIDERS = ["googleAds", "metaAds"] as const;

export type AdvertisingProvider = (typeof ADVERTISING_PROVIDERS)[number];

/**
 * Provider lifecycle values are strings intentionally.
 * Google Ads and Meta use different native status vocabularies, and the
 * campaign orchestration layer may add internal creation states over time.
 */
export type ProviderCampaignConfiguration = Record<string, unknown>;

export interface ProviderCampaignData {
  accountId: string;
  providerObjective: string;
  providerCampaignType: string;
  requestedProviderApiTarget?: string | null;
  configuration: ProviderCampaignConfiguration;

  providerCampaignId?: string | null;
  providerCampaignResourceName?: string | null;
  providerStatus?: string | null;
  creationStatus: string;
  deliveryStatus: string;
  resources: unknown[];
  lastError?: string | null;
  lastSyncedAt?: Date | null;
}

export interface CampaignProviders {
  googleAds?: ProviderCampaignData;
  metaAds?: ProviderCampaignData;
}

/** One document represents one logical, cross-channel campaign; MongoDB _id is its app ID. */
export interface Campaign {
  /** Clerk user ID; all campaign queries must be scoped by this field. */
  ownerUserId: string;
  contractVersion: string;

  /** User-facing campaign brief shared by the selected providers. */
  name: string;
  businessName: string;
  websiteUrl?: string | null;
  description?: string | null;
  objective: string;

  /** Providers requested for this campaign. */
  platforms: AdvertisingProvider[];

  /** Provider execution and provider-specific configuration. */
  providers: CampaignProviders;

  createdAt: Date;
  updatedAt: Date;
}

export type CampaignDocument = HydratedDocument<Campaign>;

const providerCampaignSchema = new Schema<ProviderCampaignData>(
  {
    accountId: {
      type: String,
      required: true,
      trim: true,
    },
    providerObjective: {
      type: String,
      required: true,
      trim: true,
    },
    providerCampaignType: {
      type: String,
      required: true,
      trim: true,
    },
    requestedProviderApiTarget: {
      type: String,
      default: null,
      trim: true,
    },
    // Provider configurations differ substantially. Keep the original
    // provider-specific object instead of flattening it into common fields.
    configuration: {
      type: Schema.Types.Mixed,
      required: true,
    },

    providerCampaignId: {
      type: String,
      default: null,
      trim: true,
    },
    providerCampaignResourceName: {
      type: String,
      default: null,
      trim: true,
    },
    providerStatus: {
      type: String,
      default: null,
      trim: true,
    },
    creationStatus: {
      type: String,
      required: true,
      default: "pending",
      trim: true,
    },
    // Keep provider-native delivery status as a string; do not force Google
    // and Meta status values into one artificial enum.
    deliveryStatus: {
      type: String,
      required: true,
      default: "PAUSED",
      trim: true,
    },
    resources: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    lastError: {
      type: String,
      default: null,
    },
    lastSyncedAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
    versionKey: false,
    strict: "throw",
  }
);

const campaignProvidersSchema = new Schema<CampaignProviders>(
  {
    googleAds: {
      type: providerCampaignSchema,
      default: undefined,
    },
    metaAds: {
      type: providerCampaignSchema,
      default: undefined,
    },
  },
  {
    _id: false,
    versionKey: false,
    strict: "throw",
  }
);

const campaignSchema = new Schema<Campaign>(
  {
    ownerUserId: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    contractVersion: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    websiteUrl: {
      type: String,
      default: null,
      trim: true,
    },
    description: {
      type: String,
      default: null,
      trim: true,
    },
    objective: {
      type: String,
      required: true,
      trim: true,
    },

    platforms: {
      type: [
        {
          type: String,
          enum: ADVERTISING_PROVIDERS,
        },
      ],
      required: true,
      validate: {
        validator: (platforms: AdvertisingProvider[]) =>
          Array.isArray(platforms) &&
          platforms.length > 0 &&
          new Set(platforms).size === platforms.length,
        message: "platforms must contain at least one unique provider",
      },
    },

    providers: {
      type: campaignProvidersSchema,
      required: true,
      default: () => ({}),
    },
  },
  {
    collection: "campaigns",
    timestamps: true,
    // Keep Mongoose's __v version key available. optimisticConcurrency
    // protects document.save() flows from silently overwriting stale copies.
    optimisticConcurrency: true,
    strict: "throw",
  }
);

// Main list view: most recently updated campaigns for a user.
campaignSchema.index(
  { ownerUserId: 1, updatedAt: -1 },
  { name: "campaigns_owner_updated" }
);

// Provider external IDs must not be duplicated within the same user account.
// The partial filters exclude providers that have not yet received an ID.
campaignSchema.index(
  {
    ownerUserId: 1,
    "providers.googleAds.accountId": 1,
    "providers.googleAds.providerCampaignId": 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      "providers.googleAds.providerCampaignId": { $type: "string" },
    },
    name: "campaigns_google_external_id_unique",
  }
);

campaignSchema.index(
  {
    ownerUserId: 1,
    "providers.metaAds.accountId": 1,
    "providers.metaAds.providerCampaignId": 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      "providers.metaAds.providerCampaignId": { $type: "string" },
    },
    name: "campaigns_meta_external_id_unique",
  }
);

// Account-filtered campaign lists for each provider.
campaignSchema.index(
  {
    ownerUserId: 1,
    "providers.googleAds.accountId": 1,
    updatedAt: -1,
  },
  { name: "campaigns_owner_google_account_updated" }
);

campaignSchema.index(
  {
    ownerUserId: 1,
    "providers.metaAds.accountId": 1,
    updatedAt: -1,
  },
  { name: "campaigns_owner_meta_account_updated" }
);

const CampaignModel =
  model<Campaign>("Campaign", campaignSchema);

export default CampaignModel;