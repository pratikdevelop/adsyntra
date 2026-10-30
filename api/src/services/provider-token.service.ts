
import { OAuth2Client } from "google-auth-library";

import {
    getUserConnection,
    saveProviderTokens,
} from "./connection-storage.service.js";

export type AdProvider = "googleAds" | "metaAds";

const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

/**
 * Returns the access token belonging to a specific user and provider.
 *
 * Google Ads:
 * - Returns the saved token if it is still valid.
 * - Refreshes it using the user's stored refresh token when necessary.
 *
 * Meta Ads:
 * - Returns the saved token while it is valid.
 * - Requests reauthorization when it expires because Meta's
 *   standard user-token flow is not the same as Google's refresh flow.
 */
export async function getProviderAccessToken(
    userId: string,
    provider: AdProvider,
): Promise<string> {
    if (!userId?.trim()) {
        throw new Error("Authenticated user ID is required.");
    }

    const connection = await getUserConnection(userId);

    if (!connection) {
        throw new Error(
            `No advertising connection found for ${provider}.`,
        );
    }

    const providerConnection = connection.providers[provider];
    const tokens = providerConnection?.tokens;

    if (!tokens?.accessToken) {
        throw new Error(
            `${provider} is not connected. Please connect your account.`,
        );
    }

    const now = Date.now();

    const tokenIsValid =
        tokens.expiryDate === null ||
        tokens.expiryDate > now + TOKEN_EXPIRY_BUFFER_MS;

    // Return the saved token when it has not expired.
    if (tokenIsValid) {
        return tokens.accessToken;
    }

    // Google Ads: refresh using this user's refresh token.
    if (provider === "googleAds") {
        if (!tokens.refreshToken) {
            throw new Error(
                "Google refresh token is missing. Please reconnect Google Ads.",
            );
        }

        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const redirectUri = process.env.GOOGLE_REDIRECT_URI;

        if (!clientId || !clientSecret || !redirectUri) {
            throw new Error(
                "Google OAuth environment variables are missing.",
            );
        }

        // A separate OAuth client per call avoids sharing credentials
        // between different users.
        const oauthClient = new OAuth2Client(
            clientId,
            clientSecret,
            redirectUri,
        );

        oauthClient.setCredentials({
            refresh_token: tokens.refreshToken,
            expiry_date: 0,
        });

        try {
            const result = await oauthClient.getAccessToken();

            const newAccessToken =
                result.token ?? oauthClient.credentials.access_token;

            if (!newAccessToken) {
                throw new Error("Google did not return a new access token.");
            }

            const newRefreshToken =
                oauthClient.credentials.refresh_token ??
                tokens.refreshToken;

            const newExpiryDate =
                oauthClient.credentials.expiry_date ?? null;

            await saveProviderTokens(userId, "googleAds", {
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
                expiryDate: newExpiryDate,
            });

            return newAccessToken;
        } catch (error) {
            console.error("Google token refresh failed:", error);

            throw new Error(
                "Google Ads token refresh failed. Please reconnect Google Ads.",
            );
        }
    }

    // Meta Ads: do not use Google's refresh-token logic.
    // Meta user-token exchange and token lifetimes are provider-specific.
    if (provider === "metaAds") {
        throw new Error(
            "Meta Ads access token has expired. Please reconnect Meta Ads.",
        );
    }

    throw new Error("Unsupported advertising provider.");
}
