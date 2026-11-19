
import {
  Schema,
  Types,
  model,
  type HydratedDocument,
  type Model,
} from "mongoose";

export type AdAccountProvider = "googleAds" | "metaAds";

export type AdAccountStatus =
  | "active"
  | "inactive"
  | "disabled";

export interface AdAccount {
  userId: string;
  connectionId: Types.ObjectId;

  provider: AdAccountProvider;
  externalAccountId: string;

  name: string;
  currency?: string;
  timezone?: string;

  status: AdAccountStatus;
  isSelected: boolean;

  providerData?: Record<string, unknown>;

  lastSyncedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export type AdAccountDocument = HydratedDocument<AdAccount>;

const adAccountSchema = new Schema<AdAccount>(
  {
    userId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },

    connectionId: {
      type: Schema.Types.ObjectId,
      ref: "ProviderConnection",
      required: true,
      immutable: true,
    },

    provider: {
      type: String,
      enum: ["googleAds", "metaAds"],
      required: true,
      immutable: true,
    },

    externalAccountId: {
      type: String,
      required: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },

    currency: {
      type: String,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },

    timezone: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "disabled"],
      default: "active",
      required: true,
    },

    isSelected: {
      type: Boolean,
      default: false,
      required: true,
    },

    providerData: {
      type: Schema.Types.Mixed,
      default: undefined,
    },

    lastSyncedAt: {
      type: Date,
    },
  },
  {
    collection: "ad_accounts",
    timestamps: true,
    versionKey: false,
    strict: "throw",
  },
);

// Prevent duplicate advertising accounts for the same connection.
adAccountSchema.index(
  {
    userId: 1,
    connectionId: 1,
    provider: 1,
    externalAccountId: 1,
  },
  {
    unique: true,
    name: "uniq_user_connection_provider_account",
  },
);

// Efficient account filtering.
adAccountSchema.index(
  {
    userId: 1,
    provider: 1,
    status: 1,
  },
  {
    name: "idx_user_provider_account_status",
  },
);

adAccountSchema.index(
  {
    userId: 1,
    provider: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isSelected: true,
    },
    name: "one_selected_account_per_provider_per_user",
  }
);

const AdAccountModel =
  model<AdAccount>("AdAccount", adAccountSchema);

export default AdAccountModel;
