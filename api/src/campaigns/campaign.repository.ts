import type { Collection, Db, IndexDescription } from "mongodb";
import { getDatabase } from "../config/db.js";
import type { CampaignOperationRecord, CampaignRecord } from "./campaign.types.js";
import type { CampaignPersistenceBundle } from "./campaign.factory.js";

export interface CampaignCollections {
  campaigns: Collection<CampaignRecord>;
  operations: Collection<CampaignOperationRecord>;
}

export function getCampaignCollections(database: Db = getDatabase()): CampaignCollections {
  return {
    campaigns: database.collection<CampaignRecord>("campaigns"),
    operations: database.collection<CampaignOperationRecord>("campaign_operations"),
  };
}

const campaignIndexes: IndexDescription[] = [
  {
    key: { ownerUserId: 1, initiativeId: 1 },
    name: "campaigns_owner_initiative",
  },
  {
    key: { ownerUserId: 1, provider: 1, createdAt: -1 },
    name: "campaigns_owner_provider_created",
  },
  {
    key: { ownerUserId: 1, provider: 1, accountId: 1, providerCampaignId: 1 },
    name: "campaigns_provider_account_campaign_id_unique",
    unique: true,
    partialFilterExpression: { providerCampaignId: { $type: "string" } },
  },
  {
    key: { ownerUserId: 1, provider: 1, creationStatus: 1, updatedAt: -1 },
    name: "campaigns_owner_provider_creation_status",
  },
];

const operationIndexes: IndexDescription[] = [
  {
    key: { ownerUserId: 1, idempotencyKey: 1 },
    name: "campaign_operations_owner_idempotency_unique",
    unique: true,
  },
  {
    key: { ownerUserId: 1, initiativeId: 1, createdAt: -1 },
    name: "campaign_operations_owner_initiative_created",
  },
  {
    key: { status: 1, updatedAt: 1 },
    name: "campaign_operations_status_updated",
  },
];

export async function ensureCampaignIndexes(database: Db = getDatabase()): Promise<void> {
  const { campaigns, operations } = getCampaignCollections(database);
  await Promise.all([
    campaigns.createIndexes(campaignIndexes),
    operations.createIndexes(operationIndexes),
  ]);
}

export async function insertCampaignRecords(
  records: CampaignRecord[],
  collections: CampaignCollections = getCampaignCollections(),
): Promise<void> {
  if (records.length === 0) return;
  await collections.campaigns.insertMany(records, { ordered: true });
}

export async function insertCampaignOperation(
  operation: CampaignOperationRecord,
  collections: CampaignCollections = getCampaignCollections(),
): Promise<string> {
  const result = await collections.operations.insertOne(operation);
  return result.insertedId.toString();
}


/**
 * Persist the operation first so the unique idempotency key is claimed before
 * any campaign records are written. If the document batch fails, the operation
 * remains visible and is marked for reconciliation rather than being hidden.
 */
export async function persistCampaignBundle(
  bundle: CampaignPersistenceBundle,
  collections: CampaignCollections = getCampaignCollections(),
): Promise<void> {
  const operationId = bundle.operation._id;
  if (!operationId) {
    throw new Error("Campaign operation must have an ObjectId before persistence.");
  }

  await collections.operations.insertOne(bundle.operation);

  try {
    if (bundle.campaignRecords.length > 0) {
      await collections.campaigns.insertMany(bundle.campaignRecords, { ordered: true });
    }
  } catch (error) {
    await collections.operations.updateOne(
      { _id: operationId },
      {
        $set: {
          status: "needs_reconciliation",
          updatedAt: new Date(),
        },
      },
    );
    throw error;
  }
}

export async function findCampaignOperationByIdempotencyKey(
  ownerUserId: string,
  idempotencyKey: string,
  collections: CampaignCollections = getCampaignCollections(),
): Promise<CampaignOperationRecord | null> {
  return collections.operations.findOne({ ownerUserId, idempotencyKey });
}

export async function findCampaignsByInitiative(
  ownerUserId: string,
  initiativeId: string,
  collections: CampaignCollections = getCampaignCollections(),
): Promise<CampaignRecord[]> {
  return collections.campaigns
    .find({ ownerUserId, initiativeId })
    .sort({ createdAt: 1 })
    .toArray();
}
