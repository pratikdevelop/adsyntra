import AiCreativeInstructionModel, {
    type AiCreativeInstructionFields,
} from "../models/ai-creative-instruction.model.js";
import { DEFAULT_AI_CREATIVE_INSTRUCTIONS } from "../config/ai-creative-instructions.defaults.js";
import type { CreativeGenerationTarget } from "../types/ai-creative.types.js";

export interface ResolvedAiCreativeInstructionDocument {
    key: string;
    title: string;
    version: number;
    priority: number;
    campaignType: string;
    providerObjective: string;
    adFormat: string;
    capabilityId: string;
    requirementId: string;
}

export interface ResolvedAiCreativeInstructionBundle {
    target: CreativeGenerationTarget;
    requirementId: string | null;
    copyInstructions: string;
    imageInstructions: string;
    complianceInstructions: string;
    documents: ResolvedAiCreativeInstructionDocument[];
}

let defaultSeedPromise: Promise<void> | null = null;

/**
 * Insert built-in instruction records only when their key does not exist.
 * Operators can safely edit documents in MongoDB without the next generation
 * request overwriting those edits.
 */
export async function ensureDefaultAiCreativeInstructions(): Promise<void> {
    if (!defaultSeedPromise) {
        const operations = DEFAULT_AI_CREATIVE_INSTRUCTIONS.map((instruction) => ({
            updateOne: {
                filter: { key: instruction.key },
                update: { $setOnInsert: instruction },
                upsert: true,
            },
        }));

        defaultSeedPromise = AiCreativeInstructionModel.bulkWrite(
            operations,
            { ordered: false },
        )
            .then(() => undefined)
            .catch(async (error: unknown) => {
                // Multiple API workers may attempt the same upserts at once.
                // Treat duplicate-key races as success when every default key
                // is now present in the collection.
                const existingCount = await AiCreativeInstructionModel.countDocuments({
                    key: { $in: DEFAULT_AI_CREATIVE_INSTRUCTIONS.map((item) => item.key) },
                }).exec().catch(() => 0);
                if (existingCount === DEFAULT_AI_CREATIVE_INSTRUCTIONS.length) {
                    return;
                }

                // Allow a later request to retry a transient/partial failure.
                defaultSeedPromise = null;
                throw new Error(
                    `AI creative instruction defaults could not be initialized: ${error instanceof Error ? error.message : String(error)}`,
                );
            });
    }

    await defaultSeedPromise;
}

function specificityOf(document: AiCreativeInstructionFields): number {
    return [
        document.campaignType,
        document.providerObjective,
        document.adFormat,
        document.capabilityId,
        document.requirementId,
    ].filter((value) => value !== "*").length;
}

function collectInstructionText(
    documents: AiCreativeInstructionFields[],
    field: "copyInstructions" | "imageInstructions" | "complianceInstructions",
): string {
    const parts = documents
        .map((document) => document[field]?.trim())
        .filter((value): value is string => Boolean(value));

    // Limit the final prompt contribution even if an operator creates many
    // highly specific instruction documents.
    return parts.join("\n\n").slice(0, 24_000);
}

/**
 * Resolve only active instructions matching one selected platform/capability.
 * Requirement-level records are included only for the requested slot. Broad
 * provider instructions are ordered before more-specific overrides.
 */
export async function resolveAiCreativeInstructionBundle(
    target: CreativeGenerationTarget,
    requirementId?: string,
): Promise<ResolvedAiCreativeInstructionBundle> {
    await ensureDefaultAiCreativeInstructions();

    const requirementSelector = requirementId?.trim() || "*";
    const documents = await AiCreativeInstructionModel.find({
        status: "ACTIVE",
        platform: target.platform,
        campaignType: { $in: [target.campaignType, "*"] },
        providerObjective: {
            $in: [target.providerObjective || "*", "*"],
        },
        adFormat: { $in: [target.adFormat, "*"] },
        capabilityId: { $in: [target.capabilityId, "*"] },
        requirementId: { $in: [requirementSelector, "*"] },
    })
        .lean<AiCreativeInstructionFields[]>()
        .exec();

    const orderedDocuments = documents.sort((left, right) => {
        const specificityDifference = specificityOf(left) - specificityOf(right);
        if (specificityDifference !== 0) return specificityDifference;
        if (left.priority !== right.priority) return left.priority - right.priority;
        return left.key.localeCompare(right.key);
    });

    const matchingContext = `${target.platform} / ${target.campaignType} / ${target.providerObjective || "objective not supplied"} / ${target.adFormat} / ${target.capabilityId}`;
    const hasFormatInstructions = orderedDocuments.some(
        (document) =>
            document.campaignType === target.campaignType &&
            document.adFormat === target.adFormat &&
            document.capabilityId === target.capabilityId,
    );
    const hasObjectiveInstructions = !target.providerObjective || orderedDocuments.some(
        (document) => document.providerObjective === target.providerObjective,
    );
    const hasRequirementInstructions = !requirementId || orderedDocuments.some(
        (document) => document.requirementId === requirementSelector,
    );

    if (
        orderedDocuments.length === 0 ||
        !hasFormatInstructions ||
        !hasObjectiveInstructions ||
        !hasRequirementInstructions
    ) {
        const missingScopes = [
            !hasFormatInstructions ? "campaign type + ad format + capability" : null,
            !hasObjectiveInstructions ? "provider objective" : null,
            !hasRequirementInstructions ? "asset requirement" : null,
        ].filter(Boolean).join(", ");
        throw new Error(
            `No active AI creative instructions are configured for ${matchingContext}${requirementId ? ` / ${requirementId}` : ""}. Missing matching instruction scope: ${missingScopes || "provider / campaign context"}. Add an ACTIVE instruction document before generating.`,
        );
    }

    return {
        target,
        requirementId: requirementId || null,
        copyInstructions: collectInstructionText(orderedDocuments, "copyInstructions"),
        imageInstructions: collectInstructionText(orderedDocuments, "imageInstructions"),
        complianceInstructions: collectInstructionText(orderedDocuments, "complianceInstructions"),
        documents: orderedDocuments.map((document) => ({
            key: document.key,
            title: document.title,
            version: document.version,
            priority: document.priority,
            campaignType: document.campaignType,
            providerObjective: document.providerObjective,
            adFormat: document.adFormat,
            capabilityId: document.capabilityId,
            requirementId: document.requirementId,
        })),
    };
}
