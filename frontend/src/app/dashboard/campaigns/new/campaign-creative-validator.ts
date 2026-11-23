
import type {
    CampaignCreativeCapability,
    CreativeAssetSelection,
    LibraryAsset,
} from "./interfaces";

import type {
    CampaignExecutionMode,
    CreativeMediaType,
    CreativeTextField,
} from "./type";

/* -------------------------------------------------------------------------- */
/* Validation contracts                                                       */
/* -------------------------------------------------------------------------- */



export type CreativeValidationSeverity = "ERROR" | "WARNING";

export interface CreativeValidationIssue {
    code: string;
    severity: CreativeValidationSeverity;
    message: string;
    requirementId?: string;
    assetId?: string;
}

export interface CreativeValidationResult {
    valid: boolean;
    errors: CreativeValidationIssue[];
    warnings: CreativeValidationIssue[];
    selectedAssetCount: number;
    assetCounts: Record<CreativeMediaType, number>;
    selectedByRequirement: Record<string, number>;
}

export interface ValidateCampaignCreativeInput {
    capability: CampaignCreativeCapability;

    /** All currently available Asset Library assets. */
    assets: LibraryAsset[];

    /** Selected assets mapped to their capability requirement. */
    selections: CreativeAssetSelection[];

    /** Text values generated or entered for the selected ad format. */
    textValues?: Partial<Record<CreativeTextField, string[]>>;

    /** Defaults to LIVE so unsupported formats cannot pass accidentally. */
    executionMode?: CampaignExecutionMode;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function addIssue(
    issues: CreativeValidationIssue[],
    severity: CreativeValidationSeverity,
    code: string,
    message: string,
    requirementId?: string,
    assetId?: string,
): void {
    issues.push({
        code,
        severity,
        message,
        requirementId,
        assetId,
    });
}

function getAssetMediaType(
    asset: LibraryAsset,
): CreativeMediaType | null {
    if (asset.kind === "IMAGE" || asset.kind === "LOGO") {
        return "IMAGE";
    }

    if (asset.kind === "VIDEO") {
        return "VIDEO";
    }

    return null;
}

function parseAspectRatio(value?: string): number | undefined {
    if (!value) return undefined;

    const parts = value.split(":").map(Number);

    if (
        parts.length !== 2 ||
        !Number.isFinite(parts[0]) ||
        !Number.isFinite(parts[1]) ||
        parts[0] <= 0 ||
        parts[1] <= 0
    ) {
        return undefined;
    }

    return parts[0] / parts[1];
}

function getActualAspectRatio(
    asset: LibraryAsset,
): number | undefined {
    const storedRatio = parseAspectRatio(asset.aspectRatio);

    if (storedRatio !== undefined) {
        return storedRatio;
    }

    if (
        asset.width &&
        asset.height &&
        asset.width > 0 &&
        asset.height > 0
    ) {
        return asset.width / asset.height;
    }

    return undefined;
}

function aspectRatioMatches(
    actual: number,
    expected: number,
): boolean {
    // Allows minor differences caused by rounded aspect-ratio metadata.
    const tolerance = Math.max(0.03, expected * 0.02);

    return Math.abs(actual - expected) <= tolerance;
}

/* -------------------------------------------------------------------------- */
/* Single asset validation                                                    */
/* -------------------------------------------------------------------------- */

function validateSelectedAsset(
    asset: LibraryAsset,
    selection: CreativeAssetSelection,
    capability: CampaignCreativeCapability,
    issues: CreativeValidationIssue[],
): void {
    const requirement = capability.assetRequirements.find(
        (item) => item.id === selection.requirementId,
    );

    if (!requirement) {
        addIssue(
            issues,
            "ERROR",
            "UNKNOWN_REQUIREMENT",
            `The asset is mapped to an unknown requirement: ${selection.requirementId}.`,
            selection.requirementId,
            asset.id,
        );

        return;
    }

    if (selection.role !== requirement.role) {
        addIssue(
            issues,
            "ERROR",
            "ASSET_ROLE_MISMATCH",
            `Asset role must be ${requirement.role}.`,
            requirement.id,
            asset.id,
        );
    }

    const actualMediaType = getAssetMediaType(asset);

    if (actualMediaType !== requirement.mediaType) {
        addIssue(
            issues,
            "ERROR",
            "MEDIA_TYPE_MISMATCH",
            `This requirement accepts ${requirement.mediaType}, but the selected asset is ${asset.kind}.`,
            requirement.id,
            asset.id,
        );

        return;
    }

    // Validate specialized library asset kinds.
    if (requirement.role === "LOGO" && asset.kind !== "LOGO") {
        addIssue(
            issues,
            "ERROR",
            "LOGO_ASSET_REQUIRED",
            "Select an Asset Library item classified as LOGO for this requirement.",
            requirement.id,
            asset.id,
        );
    }

    if (
        requirement.role !== "LOGO" &&
        asset.kind === "LOGO"
    ) {
        addIssue(
            issues,
            "ERROR",
            "UNEXPECTED_LOGO_ASSET",
            "A logo asset cannot be used as this creative asset.",
            requirement.id,
            asset.id,
        );
    }

    // Validate MIME type.
    if (requirement.allowedMimeTypes?.length) {
        if (!asset.mimeType) {
            addIssue(
                issues,
                "WARNING",
                "MIME_TYPE_NOT_VERIFIED",
                "The asset MIME type is unavailable and must be checked by the backend.",
                requirement.id,
                asset.id,
            );
        } else if (
            !requirement.allowedMimeTypes.some(
                (mimeType) =>
                    mimeType.toLowerCase() ===
                    asset.mimeType!.toLowerCase(),
            )
        ) {
            addIssue(
                issues,
                "ERROR",
                "UNSUPPORTED_MIME_TYPE",
                `Unsupported file type: ${asset.mimeType}.`,
                requirement.id,
                asset.id,
            );
        }
    }

    // Validate aspect ratio.
    if (requirement.allowedAspectRatios?.length) {
        const actualRatio = getActualAspectRatio(asset);

        if (actualRatio === undefined) {
            addIssue(
                issues,
                "WARNING",
                "ASPECT_RATIO_NOT_VERIFIED",
                "Image dimensions or aspect ratio are missing. Verify the source file before provider upload.",
                requirement.id,
                asset.id,
            );
        } else {
            const matches = requirement.allowedAspectRatios.some(
                (ratio) => {
                    const expected = parseAspectRatio(ratio);

                    return (
                        expected !== undefined &&
                        aspectRatioMatches(actualRatio, expected)
                    );
                },
            );

            if (!matches) {
                addIssue(
                    issues,
                    "ERROR",
                    "INVALID_ASPECT_RATIO",
                    `This asset does not match the accepted aspect ratios: ${requirement.allowedAspectRatios.join(", ")}.`,
                    requirement.id,
                    asset.id,
                );
            }
        }
    }

    // Validate dimensions.
    if (requirement.minWidth !== undefined) {
        if (asset.width == null) {
            addIssue(
                issues,
                "WARNING",
                "WIDTH_NOT_VERIFIED",
                "Asset width is unavailable. Verify dimensions before upload.",
                requirement.id,
                asset.id,
            );
        } else if (asset.width < requirement.minWidth) {
            addIssue(
                issues,
                "ERROR",
                "WIDTH_TOO_SMALL",
                `Image width must be at least ${requirement.minWidth}px.`,
                requirement.id,
                asset.id,
            );
        }
    }

    if (requirement.minHeight !== undefined) {
        if (asset.height == null) {
            addIssue(
                issues,
                "WARNING",
                "HEIGHT_NOT_VERIFIED",
                "Asset height is unavailable. Verify dimensions before upload.",
                requirement.id,
                asset.id,
            );
        } else if (asset.height < requirement.minHeight) {
            addIssue(
                issues,
                "ERROR",
                "HEIGHT_TOO_SMALL",
                `Image height must be at least ${requirement.minHeight}px.`,
                requirement.id,
                asset.id,
            );
        }
    }

    if (
        requirement.maxWidth !== undefined &&
        asset.width != null &&
        asset.width > requirement.maxWidth
    ) {
        addIssue(
            issues,
            "ERROR",
            "WIDTH_TOO_LARGE",
            `Asset width cannot exceed ${requirement.maxWidth}px.`,
            requirement.id,
            asset.id,
        );
    }

    if (
        requirement.maxHeight !== undefined &&
        asset.height != null &&
        asset.height > requirement.maxHeight
    ) {
        addIssue(
            issues,
            "ERROR",
            "HEIGHT_TOO_LARGE",
            `Asset height cannot exceed ${requirement.maxHeight}px.`,
            requirement.id,
            asset.id,
        );
    }

    // Validate file size.
    if (requirement.maxFileSizeBytes !== undefined) {
        if (asset.sizeBytes == null) {
            addIssue(
                issues,
                "WARNING",
                "FILE_SIZE_NOT_VERIFIED",
                "File size is unavailable and must be checked by the backend.",
                requirement.id,
                asset.id,
            );
        } else if (
            asset.sizeBytes > requirement.maxFileSizeBytes
        ) {
            addIssue(
                issues,
                "ERROR",
                "FILE_TOO_LARGE",
                `File size exceeds the maximum of ${requirement.maxFileSizeBytes} bytes.`,
                requirement.id,
                asset.id,
            );
        }
    }

    // Validate video duration.
    if (requirement.mediaType === "VIDEO") {
        const duration = (asset as LibraryAsset & {
            durationSeconds?: number | null;
        }).durationSeconds;

        if (
            requirement.minDurationSeconds !== undefined &&
            duration == null
        ) {
            addIssue(
                issues,
                "WARNING",
                "VIDEO_DURATION_NOT_VERIFIED",
                "Video duration is unavailable. Verify it before upload.",
                requirement.id,
                asset.id,
            );
        } else if (
            duration != null &&
            requirement.minDurationSeconds !== undefined &&
            duration < requirement.minDurationSeconds
        ) {
            addIssue(
                issues,
                "ERROR",
                "VIDEO_TOO_SHORT",
                `Video duration must be at least ${requirement.minDurationSeconds} seconds.`,
                requirement.id,
                asset.id,
            );
        }

        if (
            duration != null &&
            requirement.maxDurationSeconds !== undefined &&
            duration > requirement.maxDurationSeconds
        ) {
            addIssue(
                issues,
                "ERROR",
                "VIDEO_TOO_LONG",
                `Video duration cannot exceed ${requirement.maxDurationSeconds} seconds.`,
                requirement.id,
                asset.id,
            );
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Text validation                                                            */
/* -------------------------------------------------------------------------- */

function validateTextRequirements(
    capability: CampaignCreativeCapability,
    textValues: Partial<Record<CreativeTextField, string[]>>,
    issues: CreativeValidationIssue[],
): void {
    for (const requirement of capability.textRequirements) {
        const values = (textValues[requirement.field] ?? [])
            .map((value) => value.trim())
            .filter(Boolean);

        if (values.length < requirement.minCount) {
            addIssue(
                issues,
                "ERROR",
                "TEXT_COUNT_TOO_LOW",
                `${requirement.field} requires at least ${requirement.minCount} value(s); received ${values.length}.`,
                requirement.id,
            );
        }

        if (values.length > requirement.maxCount) {
            addIssue(
                issues,
                "ERROR",
                "TEXT_COUNT_TOO_HIGH",
                `${requirement.field} allows at most ${requirement.maxCount} value(s); received ${values.length}.`,
                requirement.id,
            );
        }

        if (
            requirement.recommendedCount !== undefined &&
            values.length < requirement.recommendedCount &&
            values.length >= requirement.minCount
        ) {
            addIssue(
                issues,
                "WARNING",
                "TEXT_BELOW_RECOMMENDED_COUNT",
                `${requirement.field} recommends ${requirement.recommendedCount} values; currently ${values.length}.`,
                requirement.id,
            );
        }

        values.forEach((value, index) => {
            if (
                requirement.minLength !== undefined &&
                value.length < requirement.minLength
            ) {
                addIssue(
                    issues,
                    "ERROR",
                    "TEXT_TOO_SHORT",
                    `${requirement.field} value ${index + 1} must contain at least ${requirement.minLength} characters.`,
                    requirement.id,
                );
            }

            if (
                requirement.maxLength !== undefined &&
                value.length > requirement.maxLength
            ) {
                addIssue(
                    issues,
                    "ERROR",
                    "TEXT_TOO_LONG",
                    `${requirement.field} value ${index + 1} exceeds ${requirement.maxLength} characters.`,
                    requirement.id,
                );
            }

            if (
                requirement.allowedValues?.length &&
                !requirement.allowedValues.some(
                    (allowedValue) =>
                        allowedValue.toLowerCase() ===
                        value.toLowerCase(),
                )
            ) {
                addIssue(
                    issues,
                    "ERROR",
                    "INVALID_TEXT_VALUE",
                    `${requirement.field} contains an unsupported value: ${value}.`,
                    requirement.id,
                );
            }
        });
    }
}

/* -------------------------------------------------------------------------- */
/* Main campaign creative validator                                           */
/* -------------------------------------------------------------------------- */

export function validateCampaignCreative(
    input: ValidateCampaignCreativeInput,
): CreativeValidationResult {
    const {
        capability,
        assets,
        selections,
        textValues = {},
        executionMode = "LIVE",
    } = input;

    const issues: CreativeValidationIssue[] = [];

    const assetMap = new Map(
        assets.map((asset) => [asset.id, asset]),
    );

    const assetCounts: Record<CreativeMediaType, number> = {
        IMAGE: 0,
        VIDEO: 0,
    };

    const selectedByRequirement: Record<string, number> = {};

    // Unsupported capabilities must not proceed to live provider creation.
    if (capability.status !== "SUPPORTED") {
        addIssue(
            issues,
            executionMode === "LIVE" ? "ERROR" : "WARNING",
            "CAPABILITY_NOT_LIVE_READY",
            `${capability.platform} ${capability.campaignType} / ${capability.adFormat} is ${capability.status}.`,
        );
    }

    // Group selections by requirement.
    for (const requirement of capability.assetRequirements) {
        selectedByRequirement[requirement.id] = 0;
    }

    const validSelections: {
        selection: CreativeAssetSelection;
        asset: LibraryAsset;
    }[] = [];

    for (const selection of selections) {
        const requirement = capability.assetRequirements.find(
            (item) => item.id === selection.requirementId,
        );

        if (!requirement) {
            addIssue(
                issues,
                "ERROR",
                "UNKNOWN_REQUIREMENT",
                `Unknown asset requirement: ${selection.requirementId}.`,
                selection.requirementId,
                selection.assetId,
            );

            continue;
        }

        selectedByRequirement[requirement.id] =
            (selectedByRequirement[requirement.id] ?? 0) + 1;

        const asset = assetMap.get(selection.assetId);

        if (!asset) {
            addIssue(
                issues,
                "ERROR",
                "ASSET_NOT_FOUND",
                `Asset ${selection.assetId} was not found in the Asset Library.`,
                requirement.id,
                selection.assetId,
            );

            continue;
        }

        const mediaType = getAssetMediaType(asset);

        if (mediaType) {
            assetCounts[mediaType] += 1;
        }

        validSelections.push({ selection, asset });

        validateSelectedAsset(
            asset,
            selection,
            capability,
            issues,
        );
    }

    // Validate per-requirement counts.
    for (const requirement of capability.assetRequirements) {
        const selectedCount =
            selectedByRequirement[requirement.id] ?? 0;

        if (selectedCount < requirement.minCount) {
            addIssue(
                issues,
                "ERROR",
                "ASSET_COUNT_TOO_LOW",
                `${requirement.role} requires at least ${requirement.minCount} asset(s); selected ${selectedCount}.`,
                requirement.id,
            );
        }

        if (selectedCount > requirement.maxCount) {
            addIssue(
                issues,
                "ERROR",
                "ASSET_COUNT_TOO_HIGH",
                `${requirement.role} allows at most ${requirement.maxCount} asset(s); selected ${selectedCount}.`,
                requirement.id,
            );
        }

        if (
            requirement.recommendedCount !== undefined &&
            selectedCount < requirement.recommendedCount &&
            selectedCount >= requirement.minCount
        ) {
            addIssue(
                issues,
                "WARNING",
                "ASSET_BELOW_RECOMMENDED_COUNT",
                `${requirement.role} recommends ${requirement.recommendedCount} assets; selected ${selectedCount}.`,
                requirement.id,
            );
        }

        // Ordered formats must have unique, consecutive positions.
        if (requirement.ordered) {
            const positions = validSelections
                .filter(
                    ({ selection }) =>
                        selection.requirementId === requirement.id,
                )
                .map(({ selection }) => selection.position)
                .sort((a, b) => (a ?? 0) - (b ?? 0));

            if (positions.some((position) => position == null)) {
                addIssue(
                    issues,
                    "ERROR",
                    "ASSET_ORDER_REQUIRED",
                    `${requirement.role} requires an explicit position for every selected asset.`,
                    requirement.id,
                );
            } else {
                const numericPositions = positions as number[];
                const uniquePositions = new Set(numericPositions);

                const isConsecutive =
                    uniquePositions.size === numericPositions.length &&
                    numericPositions.every(
                        (position, index) => position === index + 1,
                    );

                if (!isConsecutive) {
                    addIssue(
                        issues,
                        "ERROR",
                        "INVALID_ASSET_ORDER",
                        `${requirement.role} positions must be unique and consecutive, starting at 1.`,
                        requirement.id,
                    );
                }
            }
        }

        // Formats requiring the same aspect ratio across all cards.
        if (
            requirement.ordered &&
            requirement.allowedAspectRatios?.length === 1
        ) {
            // A single allowed ratio already enforces this through
            // the individual asset validation above.
        }
    }

    // Validate aggregate limits across the selected asset groups.
    const uniqueSelectedAssets = new Map<string, CreativeMediaType>();

    for (const { asset } of validSelections) {
        const mediaType = getAssetMediaType(asset);

        if (mediaType) {
            uniqueSelectedAssets.set(asset.id, mediaType);
        }
    }

    const uniqueAssetCounts: Record<CreativeMediaType, number> = {
        IMAGE: 0,
        VIDEO: 0,
    };

    for (const mediaType of uniqueSelectedAssets.values()) {
        uniqueAssetCounts[mediaType] += 1;
    }

    for (const [mediaType, maxCount] of Object.entries(
        capability.maxTotalAssets ?? {},
    ) as [CreativeMediaType, number][]) {
        if (uniqueAssetCounts[mediaType] > maxCount) {
            addIssue(
                issues,
                "ERROR",
                "TOTAL_MEDIA_LIMIT_EXCEEDED",
                `${mediaType} allows at most ${maxCount} unique asset(s) across this format; selected ${uniqueAssetCounts[mediaType]}.`,
            );
        }
    }

    const totalSelectedAssets = uniqueSelectedAssets.size;

    if (
        capability.minTotalAssetCount !== undefined &&
        totalSelectedAssets < capability.minTotalAssetCount
    ) {
        addIssue(
            issues,
            "ERROR",
            "TOTAL_ASSET_COUNT_TOO_LOW",
            `This format requires at least ${capability.minTotalAssetCount} total media asset(s); selected ${totalSelectedAssets}.`,
        );
    }

    if (
        capability.maxTotalAssetCount !== undefined &&
        totalSelectedAssets > capability.maxTotalAssetCount
    ) {
        addIssue(
            issues,
            "ERROR",
            "TOTAL_ASSET_COUNT_TOO_HIGH",
            `This format allows at most ${capability.maxTotalAssetCount} total media asset(s); selected ${totalSelectedAssets}.`,
        );
    }

    // Carousel cards must share a common aspect ratio.
    for (const requirement of capability.assetRequirements.filter(
        (item) => item.ordered && item.allowedAspectRatios?.length,
    )) {
        const selectedForRequirement = validSelections.filter(
            ({ selection }) =>
                selection.requirementId === requirement.id,
        );

        const actualRatios = selectedForRequirement
            .map(({ asset }) => getActualAspectRatio(asset))
            .filter((ratio): ratio is number => ratio !== undefined);

        if (
            actualRatios.length > 1 &&
            !actualRatios.every((ratio) =>
                aspectRatioMatches(ratio, actualRatios[0]),
            )
        ) {
            addIssue(
                issues,
                "ERROR",
                "INCONSISTENT_CARD_ASPECT_RATIO",
                "All cards in this ordered format must use the same aspect ratio.",
                requirement.id,
            );
        }
    }

    // Validate ad text requirements.
    validateTextRequirements(
        capability,
        textValues,
        issues,
    );

    const errors = issues.filter(
        (issue) => issue.severity === "ERROR",
    );

    const warnings = issues.filter(
        (issue) => issue.severity === "WARNING",
    );

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        selectedAssetCount: totalSelectedAssets,
        assetCounts: uniqueAssetCounts,
        selectedByRequirement,
    };
}
