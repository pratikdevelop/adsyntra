import type {
    AllowedCallToAction,
    CreativeGenerationError,
    GeneratedVariation,
} from "../types/ai-creative.types.js";
export interface ImageDimensions {
    width: number;
    height: number;
}

export interface GeneratedCopy {
    headline: string;
    primaryText: string;
    longHeadline: string;
    headlines: string[];
    longHeadlines: string[];
    descriptions: string[];
    primaryTexts: string[];
    callToAction: AllowedCallToAction;
}

export interface CreativeGenerationResult {
    generationId: string;
    variations: GeneratedVariation[];
    provider: "groq";
    model: string;
    imageProvider: string;
    generatedAt: string;
    expiresAt: string | null;
    requestedCount: number;
    generatedCount: number;
    failedCount: number;
    partialSuccess: boolean;
    errors: CreativeGenerationError[];
}