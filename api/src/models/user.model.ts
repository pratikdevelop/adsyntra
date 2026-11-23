import {
    Schema,
    model,
    type HydratedDocument,
} from "mongoose";

export type UserTheme = "system" | "light" | "dark";
export type UserDateFormat = "locale" | "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
export type UserDefaultDateRange = "7d" | "30d" | "90d";
export type UserDefaultProvider = "googleAds" | "metaAds" | "lastUsed";
export type UserDefaultLandingPage = "overview" | "campaigns";

export interface UserPreferences {
    /** Legacy preference fields are retained for existing API consumers. */
    timezone?: string;
    currency?: string;
    locale?: string;

    appearance?: {
        theme?: UserTheme;
    };

    localization?: {
        timezone?: string;
        locale?: string;
        dateFormat?: UserDateFormat;
    };

    dashboard?: {
        defaultDateRange?: UserDefaultDateRange;
        defaultProvider?: UserDefaultProvider;
        defaultLandingPage?: UserDefaultLandingPage;
    };

    notifications?: {
        inApp?: {
            syncFailures?: boolean;
            connectionIssues?: boolean;
            campaignStatus?: boolean;
            budgetAlerts?: boolean;
            aiCreativeCompleted?: boolean;
        };
        email?: {
            syncFailures?: boolean;
            connectionIssues?: boolean;
            campaignStatus?: boolean;
            budgetAlerts?: boolean;
            aiCreativeCompleted?: boolean;
            weeklySummary?: boolean;
        };
    };
}

export interface User {
    clerkUserId: string;

    email?: string;
    firstName?: string;
    lastName?: string;
    imageUrl?: string;

    preferences: UserPreferences;

    status: "active" | "disabled";
    lastLoginAt?: Date;

    createdAt: Date;
    updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;

const userSchema = new Schema<User>(
    {
        clerkUserId: {
            type: String,
            required: true,
            unique: true,
            immutable: true,
            trim: true,
        },

        email: {
            type: String,
            trim: true,
            lowercase: true,
            maxlength: 320,
        },

        firstName: {
            type: String,
            trim: true,
            maxlength: 100,
        },

        lastName: {
            type: String,
            trim: true,
            maxlength: 100,
        },

        imageUrl: {
            type: String,
            trim: true,
            maxlength: 2048,
        },

        preferences: {
            // Keep these legacy paths intact for compatibility.
            timezone: { type: String, trim: true, maxlength: 100 },
            currency: { type: String, trim: true, uppercase: true, minlength: 3, maxlength: 3 },
            locale: { type: String, trim: true, maxlength: 35 },

            appearance: {
                theme: {
                    type: String,
                    enum: ["system", "light", "dark"],
                    default: "system",
                },
            },

            localization: {
                timezone: { type: String, trim: true, maxlength: 100 },
                locale: { type: String, trim: true, maxlength: 35 },
                dateFormat: {
                    type: String,
                    enum: ["locale", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"],
                    default: "locale",
                },
            },

            dashboard: {
                defaultDateRange: {
                    type: String,
                    enum: ["7d", "30d", "90d"],
                    default: "30d",
                },
                defaultProvider: {
                    type: String,
                    enum: ["googleAds", "metaAds", "lastUsed"],
                    default: "lastUsed",
                },
                defaultLandingPage: {
                    type: String,
                    enum: ["overview", "campaigns"],
                    default: "overview",
                },
            },

            // These are stored as preferences only. They do not imply that a
            // notification delivery channel has been implemented.
            notifications: {
                inApp: {
                    syncFailures: { type: Boolean, default: true },
                    connectionIssues: { type: Boolean, default: true },
                    campaignStatus: { type: Boolean, default: true },
                    budgetAlerts: { type: Boolean, default: true },
                    aiCreativeCompleted: { type: Boolean, default: true },
                },
                email: {
                    syncFailures: { type: Boolean, default: false },
                    connectionIssues: { type: Boolean, default: false },
                    campaignStatus: { type: Boolean, default: false },
                    budgetAlerts: { type: Boolean, default: false },
                    aiCreativeCompleted: { type: Boolean, default: false },
                    weeklySummary: { type: Boolean, default: false },
                },
            },
        },

        status: {
            type: String,
            enum: ["active", "disabled"],
            default: "active",
            required: true,
        },

        lastLoginAt: {
            type: Date,
        },
    },
    {
        collection: "users",
        timestamps: true,
        versionKey: false,
        strict: "throw",
    },
);

// Existing connection storage and account records share this User collection.
// Keep model registration idempotent during Next.js / API development reloads.
const UserModel = model<User>("User", userSchema);

export default UserModel;
