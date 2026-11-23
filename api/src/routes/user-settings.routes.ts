import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";

import UserModel, {
    type UserDateFormat,
    type UserDefaultDateRange,
    type UserDefaultLandingPage,
    type UserDefaultProvider,
    type UserTheme,
} from "../models/user.model.js";

const router = Router();
type JsonRecord = Record<string, unknown>;

const DEFAULT_SETTINGS = {
    appearance: { theme: "system" as UserTheme },
    localization: {
        timezone: "UTC",
        locale: "en",
        dateFormat: "locale" as UserDateFormat,
    },
    dashboard: {
        defaultDateRange: "30d" as UserDefaultDateRange,
        defaultProvider: "lastUsed" as UserDefaultProvider,
        defaultLandingPage: "overview" as UserDefaultLandingPage,
    },
};

function record(value: unknown): JsonRecord {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as JsonRecord
        : {};
}

function requireRecord(value: unknown, section: string): JsonRecord {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${section} must be an object.`);
    }
    return value as JsonRecord;
}

function getAuthenticatedUserId(req: Request): string | null {
    const auth = getAuth(req);
    return auth.isAuthenticated && auth.userId ? auth.userId : null;
}

function sendError(res: Response, status: number, message: string) {
    return res.status(status).json({ success: false, message });
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
    return typeof value === "string" && allowed.includes(value as T);
}

function normalizeSettings(preferencesValue: unknown) {
    const preferences = record(preferencesValue);
    const appearance = record(preferences.appearance);
    const localization = record(preferences.localization);
    const dashboard = record(preferences.dashboard);

    const theme = isOneOf(appearance.theme, ["system", "light", "dark"] as const)
        ? appearance.theme
        : DEFAULT_SETTINGS.appearance.theme;

    const timezoneCandidate = localization.timezone ?? preferences.timezone;
    const localeCandidate = localization.locale ?? preferences.locale;

    return {
        appearance: { theme },
        localization: {
            timezone: typeof timezoneCandidate === "string" && timezoneCandidate.trim()
                ? timezoneCandidate.trim()
                : DEFAULT_SETTINGS.localization.timezone,
            locale: typeof localeCandidate === "string" && localeCandidate.trim()
                ? localeCandidate.trim()
                : DEFAULT_SETTINGS.localization.locale,
            dateFormat: isOneOf(localization.dateFormat, ["locale", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const)
                ? localization.dateFormat
                : DEFAULT_SETTINGS.localization.dateFormat,
        },
        dashboard: {
            defaultDateRange: isOneOf(dashboard.defaultDateRange, ["7d", "30d", "90d"] as const)
                ? dashboard.defaultDateRange
                : DEFAULT_SETTINGS.dashboard.defaultDateRange,
            defaultProvider: isOneOf(dashboard.defaultProvider, ["googleAds", "metaAds", "lastUsed"] as const)
                ? dashboard.defaultProvider
                : DEFAULT_SETTINGS.dashboard.defaultProvider,
            defaultLandingPage: isOneOf(dashboard.defaultLandingPage, ["overview", "campaigns"] as const)
                ? dashboard.defaultLandingPage
                : DEFAULT_SETTINGS.dashboard.defaultLandingPage,
        },
    };
}

function assertOnlyKeys(value: JsonRecord, allowed: readonly string[], section: string): void {
    const unknownKey = Object.keys(value).find((key) => !allowed.includes(key));
    if (unknownKey) {
        throw new Error(`Unsupported ${section} setting: ${unknownKey}.`);
    }
}

function validatePatch(bodyValue: unknown): Record<string, string> {
    const body = requireRecord(bodyValue, "Request body");
    const patch: Record<string, string> = {};
    const topKeys = Object.keys(body);

    if (!topKeys.length) throw new Error("Provide at least one setting to update.");
    assertOnlyKeys(body, ["appearance", "localization", "dashboard"], "top-level");

    if (body.appearance !== undefined) {
        const appearance = requireRecord(body.appearance, "appearance");
        assertOnlyKeys(appearance, ["theme"], "appearance");
        if (!isOneOf(appearance.theme, ["system", "light", "dark"] as const)) {
            throw new Error("appearance.theme must be system, light or dark.");
        }
        patch["preferences.appearance.theme"] = appearance.theme;
    }

    if (body.localization !== undefined) {
        const localization = requireRecord(body.localization, "localization");
        assertOnlyKeys(localization, ["timezone", "locale", "dateFormat"], "localization");

        if (localization.timezone !== undefined) {
            if (typeof localization.timezone !== "string" || localization.timezone.trim().length > 100) {
                throw new Error("localization.timezone must be a valid IANA timezone name.");
            }
            const timezone = localization.timezone.trim();
            try {
                new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
            } catch {
                throw new Error("localization.timezone must be a valid IANA timezone name.");
            }
            patch["preferences.localization.timezone"] = timezone;
            // Maintain the legacy preference path for older consumers.
            patch["preferences.timezone"] = timezone;
        }

        if (localization.locale !== undefined) {
            if (typeof localization.locale !== "string" || localization.locale.trim().length > 35) {
                throw new Error("localization.locale must be a valid locale code.");
            }
            let locale: string;
            try {
                locale = Intl.getCanonicalLocales(localization.locale.trim())[0] ?? "";
            } catch {
                locale = "";
            }
            if (!locale) throw new Error("localization.locale must be a valid locale code.");
            patch["preferences.localization.locale"] = locale;
            patch["preferences.locale"] = locale;
        }

        if (localization.dateFormat !== undefined) {
            if (!isOneOf(localization.dateFormat, ["locale", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const)) {
                throw new Error("localization.dateFormat is not supported.");
            }
            patch["preferences.localization.dateFormat"] = localization.dateFormat;
        }
    }

    if (body.dashboard !== undefined) {
        const dashboard = requireRecord(body.dashboard, "dashboard");
        assertOnlyKeys(dashboard, ["defaultDateRange", "defaultProvider", "defaultLandingPage"], "dashboard");

        if (dashboard.defaultDateRange !== undefined) {
            if (!isOneOf(dashboard.defaultDateRange, ["7d", "30d", "90d"] as const)) {
                throw new Error("dashboard.defaultDateRange must be 7d, 30d or 90d.");
            }
            patch["preferences.dashboard.defaultDateRange"] = dashboard.defaultDateRange;
        }

        if (dashboard.defaultProvider !== undefined) {
            if (!isOneOf(dashboard.defaultProvider, ["googleAds", "metaAds", "lastUsed"] as const)) {
                throw new Error("dashboard.defaultProvider is not supported.");
            }
            patch["preferences.dashboard.defaultProvider"] = dashboard.defaultProvider;
        }

        if (dashboard.defaultLandingPage !== undefined) {
            if (!isOneOf(dashboard.defaultLandingPage, ["overview", "campaigns"] as const)) {
                throw new Error("dashboard.defaultLandingPage must be overview or campaigns.");
            }
            patch["preferences.dashboard.defaultLandingPage"] = dashboard.defaultLandingPage;
        }
    }

    if (!Object.keys(patch).length) throw new Error("Provide at least one supported setting to update.");
    return patch;
}

router.get("/", async (req: Request, res: Response) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return sendError(res, 401, "Authentication required.");

    try {
        const user = await UserModel.findOne({ clerkUserId: userId })
            .select("preferences")
            .lean()
            .exec();

        return res.status(200).json({
            success: true,
            settings: normalizeSettings(user?.preferences),
        });
    } catch (error) {
        console.error("Failed to load user settings:", error);
        return sendError(res, 500, "Unable to load your settings right now.");
    }
});

router.patch("/", async (req: Request, res: Response) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return sendError(res, 401, "Authentication required.");

    let patch: Record<string, string>;
    try {
        patch = validatePatch(req.body);
    } catch (error) {
        return sendError(res, 400, error instanceof Error ? error.message : "Invalid settings payload.");
    }

    try {
        const user = await UserModel.findOneAndUpdate(
            { clerkUserId: userId },
            { $set: patch, $setOnInsert: { clerkUserId: userId } },
            {
                new: true,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true,
            },
        )
            .select("preferences")
            .lean()
            .exec();

        return res.status(200).json({
            success: true,
            message: "Settings saved successfully.",
            settings: normalizeSettings(user?.preferences),
        });
    } catch (error) {
        console.error("Failed to save user settings:", error);
        return sendError(res, 500, "Unable to save your settings right now.");
    }
});

export default router;
