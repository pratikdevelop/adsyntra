
import { META_DATE_PRESETS } from "./filtering.js";

type DateFilterInput = {
    datePreset?: unknown;
    since?: unknown;
    until?: unknown;
};

type DateFilterResult =
    | {
        success: true;
        params: URLSearchParams;
        dateFilter:
        | { type: "preset"; datePreset: string }
        | { type: "custom"; since: string; until: string };
    }
    | {
        success: false;
        message: string;
    };

// ==========================================
// DATE VALIDATION
// ==========================================

function isValidDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));

    if (year < 1 || month < 1 || month > 12 || day < 1) {
        return false;
    }

    const isLeapYear =
        year % 4 === 0 &&
        (year % 100 !== 0 || year % 400 === 0);

    const daysInMonth = [
        31,
        isLeapYear ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    const maxDays = daysInMonth[month - 1];

    return maxDays !== undefined && day <= maxDays;

    // return day <= daysInMonth[month - 1] ?? false;
}

// ==========================================
// BUILD INSIGHTS DATE FILTER
// ==========================================

export function buildInsightsDateFilter(
    input: DateFilterInput
): DateFilterResult {

    const { datePreset, since, until } = input;

    const hasPreset = datePreset !== undefined;
    const hasSince = since !== undefined;
    const hasUntil = until !== undefined;

    // Do not allow preset and custom dates together.

    if (hasPreset && (hasSince || hasUntil)) {
        return {
            success: false,
            message:
                "Use either datePreset or since/until, not both",
        };
    }

    // ======================================
    // CUSTOM DATE RANGE
    // ======================================

    if (hasSince || hasUntil) {
        if (
            typeof since !== "string" ||
            typeof until !== "string" ||
            !isValidDate(since) ||
            !isValidDate(until)
        ) {
            return {
                success: false,
                message:
                    "Both since and until must be valid YYYY-MM-DD dates",
            };
        }

        if (since > until) {
            return {
                success: false,
                message: "since cannot be after until",
            };
        }

        const params = new URLSearchParams();

        params.set(
            "time_range",
            JSON.stringify({ since, until })
        );

        return {
            success: true,
            params,
            dateFilter: {
                type: "custom",
                since,
                until,
            },
        };
    }

    // ======================================
    // PRESET DATE RANGE
    // ======================================

    if (
        datePreset !== undefined &&
        typeof datePreset !== "string"
    ) {
        return {
            success: false,
            message: "datePreset must be a string",
        };
    }

    const selectedPreset =
        typeof datePreset === "string"
            ? datePreset
            : META_DATE_PRESETS.LAST_30D;

    const allowedPresets: string[] =
        Object.values(META_DATE_PRESETS);

    if (!allowedPresets.includes(selectedPreset)) {
        return {
            success: false,
            message: "Unsupported datePreset value",
        };
    }

    const params = new URLSearchParams();

    params.set("date_preset", selectedPreset);

    return {
        success: true,
        params,
        dateFilter: {
            type: "preset",
            datePreset: selectedPreset,
        },
    };
}
