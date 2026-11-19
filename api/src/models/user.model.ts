import {
    Schema,
    model,
    type HydratedDocument,
} from "mongoose";

export interface UserPreferences {
    timezone?: string;
    currency?: string;
    locale?: string;
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
            timezone: {
                type: String,
                trim: true,
                maxlength: 100,
            },
            currency: {
                type: String,
                trim: true,
                uppercase: true,
                minlength: 3,
                maxlength: 3,
            },
            locale: {
                type: String,
                trim: true,
                maxlength: 20,
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

// The unique constraint on clerkUserId is declared in the schema field above.
// Keep model registration idempotent during development hot reloads.
const UserModel =
    model<User>("User", userSchema);

export default UserModel;
