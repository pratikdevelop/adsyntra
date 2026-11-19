
import {
  Schema,
  model,
  type HydratedDocument,
  type Model,
} from "mongoose";

export type AdvertisingProvider = "googleAds" | "metaAds";

export type ProviderConnectionStatus =
  | "connected"
  | "expired"
  | "revoked"
  | "error";

/**
 * AES-256-GCM encrypted value.
 *
 * This model stores only the encrypted envelope. Encryption and decryption
 * belong in the shared token utility, not in the Mongoose model.
 */
export interface EncryptedSecret {
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface ProviderCredentials {
  accessToken: EncryptedSecret;
  refreshToken: EncryptedSecret | null;
  expiresAt: Date | null;
  tokenType?: string;
}

export interface ProviderConnection {
  userId: string;
  provider: AdvertisingProvider;

  /**
   * Stable identity returned by the provider, when available.
   * Do not use an advertising account ID here: one provider identity
   * can have access to multiple advertising accounts.
   */
  providerUserId?: string;

  status: ProviderConnectionStatus;

  credentials: ProviderCredentials;

  scopes: string[];

  connectedAt: Date;
  lastValidatedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export type ProviderConnectionDocument =
  HydratedDocument<ProviderConnection>;

const encryptedSecretSchema = new Schema<EncryptedSecret>(
  {
    version: {
      type: Number,
      enum: [1],
      required: true,
    },
    iv: {
      type: String,
      required: true,
    },
    authTag: {
      type: String,
      required: true,
    },
    ciphertext: {
      type: String,
      required: true,
    },
  },
  {
    _id: false,
    id: false,
    strict: "throw",
  },
);

const credentialsSchema = new Schema<ProviderCredentials>(
  {
    accessToken: {
      type: encryptedSecretSchema,
      required: true,
    },
    refreshToken: {
      type: encryptedSecretSchema,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    tokenType: {
      type: String,
      trim: true,
    },
  },
  {
    _id: false,
    id: false,
    strict: "throw",
  },
);

const providerConnectionSchema = new Schema<ProviderConnection>(
  {
    userId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      index: true,
    },

    provider: {
      type: String,
      enum: ["googleAds", "metaAds"],
      required: true,
      immutable: true,
    },

    providerUserId: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      enum: ["connected", "expired", "revoked", "error"],
      default: "connected",
      required: true,
    },

    // Credentials are excluded from ordinary queries. Code that needs
    // tokens must explicitly opt in with .select("+credentials").
    credentials: {
      type: credentialsSchema,
      required: true,
      select: false,
    },

    scopes: {
      type: [String],
      default: [],
    },

    connectedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    lastValidatedAt: {
      type: Date,
    },
  },
  {
    collection: "provider_connections",
    timestamps: true,
    versionKey: false,
    strict: "throw",
    toJSON: {
      transform: (_doc, ret) => {
        // Defense in depth: never serialize encrypted tokens in API JSON.
        delete ret.credentials;
        return ret;
      },
    },
  },
);

// One provider identity can be connected only once per application user.
// Multiple Google or Meta identities remain supported when their
// providerUserId values differ. Legacy records without providerUserId
// are not covered by this partial unique index.
providerConnectionSchema.index(
  {
    userId: 1,
    provider: 1,
    providerUserId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      providerUserId: { $type: "string" },
    },
    name: "uniq_user_provider_identity",
  },
);

providerConnectionSchema.index(
  {
    userId: 1,
    provider: 1,
    status: 1,
  },
  {
    name: "idx_user_provider_status",
  },
);

providerConnectionSchema.index(
    {
        userId: 1,
        provider: 1,
    },
    {
        unique: true,
        name: "one_provider_connection_per_user",
    }
);

const ProviderConnectionModel =
 
  model<ProviderConnection>(
    "ProviderConnection",
    providerConnectionSchema,
  );

export default ProviderConnectionModel;
