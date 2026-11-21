import { Schema, model, type HydratedDocument } from "mongoose";

export const AI_CREATIVE_INSTRUCTION_STATUSES = [
    "ACTIVE",
    "DRAFT",
    "ARCHIVED",
] as const;

export type AiCreativeInstructionStatus =
    (typeof AI_CREATIVE_INSTRUCTION_STATUSES)[number];

/**
 * A reusable prompt instruction document. Selector fields support exact
 * matching and the wildcard "*". More specific documents override general
 * ones when instructions are assembled for a generation request.
 */
export interface AiCreativeInstructionFields {
    key: string;
    title: string;
    platform: "googleAds" | "metaAds";
    campaignType: string;
    providerObjective: string;
    adFormat: string;
    capabilityId: string;
    requirementId: string;
    priority: number;
    version: number;
    status: AiCreativeInstructionStatus;
    copyInstructions: string;
    imageInstructions: string;
    complianceInstructions: string;
    notes?: string;
}

export type AiCreativeInstructionDocument =
    HydratedDocument<AiCreativeInstructionFields>;

const aiCreativeInstructionSchema = new Schema<AiCreativeInstructionFields>(
    {
        key: { type: String, required: true, trim: true, unique: true, index: true },
        title: { type: String, required: true, trim: true, maxlength: 180 },
        platform: { type: String, required: true, enum: ["googleAds", "metaAds"], index: true },
        campaignType: { type: String, required: true, default: "*", index: true },
        providerObjective: { type: String, required: true, default: "*", index: true },
        adFormat: { type: String, required: true, default: "*", index: true },
        capabilityId: { type: String, required: true, default: "*", index: true },
        requirementId: { type: String, required: true, default: "*", index: true },
        priority: { type: Number, default: 0 },
        version: { type: Number, default: 1, min: 1 },
        status: {
            type: String,
            enum: AI_CREATIVE_INSTRUCTION_STATUSES,
            default: "ACTIVE",
            index: true,
        },
        copyInstructions: { type: String, default: "", maxlength: 12000 },
        imageInstructions: { type: String, default: "", maxlength: 12000 },
        complianceInstructions: { type: String, default: "", maxlength: 12000 },
        notes: { type: String, default: "", maxlength: 2000 },
    },
    {
        timestamps: true,
        collection: "ai_creative_instructions",
        strict: true,
    },
);

aiCreativeInstructionSchema.index({
    status: 1,
    platform: 1,
    campaignType: 1,
    providerObjective: 1,
    adFormat: 1,
    capabilityId: 1,
    requirementId: 1,
});

const AiCreativeInstructionModel =
    
    model<AiCreativeInstructionFields>(
        "AiCreativeInstruction",
        aiCreativeInstructionSchema,
    );

export default AiCreativeInstructionModel;
