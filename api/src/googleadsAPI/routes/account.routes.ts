
import express from "express";
import crypto from "node:crypto";
import { getAuth } from "@clerk/express";

import {
    GOOGLE_ADS_SCOPE,
    createGoogleOAuthClient,
    exchangeGoogleAuthorizationCode,
    refreshGoogleAccessToken,
    youtubeOAuth,
} from "../config.js";

import {
    getUserConnection,
    saveProviderTokens,
    saveProviderAccounts,
} from "../../services/connection-storage.service.js";

const router = express.Router();

const FRONTEND_URL =
    process.env.FRONTEND_URL || "http://localhost:3000";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

interface OAuthState {
    userId: string;
    createdAt: number;
}

// Prototype implementation: state is held in backend memory.
const oauthStates = new Map<string, OAuthState>();

function getFrontendProviderUrl(status: "connected" | "error") {
    const url = new URL("/provider", FRONTEND_URL);
    url.searchParams.set("google", status);
    return url.toString();
}

// --------------------------------------------------
// GOOGLE ADS OAUTH
// --------------------------------------------------

// Step 1: Authenticated user requests a Google auth URL.
router.get("/auth/google", (req, res) => {
    try {
        const { isAuthenticated, userId } = getAuth(req);

        if (!isAuthenticated || !userId) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }

        // Remove expired states.
        const now = Date.now();

        for (const [key, value] of oauthStates.entries()) {
            if (now - value.createdAt > OAUTH_STATE_TTL_MS) {
                oauthStates.delete(key);
            }
        }

        const state = crypto.randomBytes(32).toString("hex");

        // Associate this OAuth attempt with the verified Clerk user.
        oauthStates.set(state, {
            userId,
            createdAt: now,
        });

        const oauthClient = createGoogleOAuthClient();

        const authUrl = oauthClient.generateAuthUrl({
            access_type: "offline",
            scope: [GOOGLE_ADS_SCOPE],
            include_granted_scopes: true,
            prompt: "consent",
            state,
        });

        // Frontend will navigate to this URL.
        return res.json({ authUrl });
    } catch (error) {
        console.error("Google OAuth initiation error:", error);

        return res.status(500).json({
            message: "Unable to start Google authorization",
        });
    }
});

// Step 2: Google redirects back here after authorization.
router.get("/auth/google/callback", async (req, res) => {
    try {
        const { code, state, error: googleError } = req.query;

        if (typeof state !== "string") {
            return res.status(400).send("Invalid OAuth state.");
        }

        const stateData = oauthStates.get(state);

        // State is single-use, even when validation fails.
        oauthStates.delete(state);

        if (
            !stateData ||
            Date.now() - stateData.createdAt > OAUTH_STATE_TTL_MS
        ) {
            return res.status(400).send(
                "OAuth state is invalid or expired. Please try again."
            );
        }

        if (typeof googleError === "string") {
            return res.redirect(getFrontendProviderUrl("error"));
        }

        if (typeof code !== "string") {
            return res.status(400).send(
                "Google authorization code is missing."
            );
        }

        const userId = stateData.userId;

        // Exchange the code for this user's Google tokens.
        const tokens = await exchangeGoogleAuthorizationCode(code);

        if (!tokens.access_token) {
            return res.redirect(getFrontendProviderUrl("error"));
        }

        // Google might not return a refresh token on subsequent
        // authorizations. Preserve the previously saved one.
        const existingConnection = await getUserConnection(userId);

        const refreshToken =
            tokens.refresh_token ??
            existingConnection?.providers.googleAds.tokens?.refreshToken ??
            null;

        // A refresh token is required for persistent access.
        if (!refreshToken) {
            console.error(
                "Google authorization did not provide a refresh token."
            );

            return res.redirect(getFrontendProviderUrl("error"));
        }

        await saveProviderTokens(userId, "googleAds", {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? null,
            expiryDate: tokens.expiry_date ?? null,
        });

        return res.redirect(getFrontendProviderUrl("connected"));
    } catch (error) {
        console.error("Google OAuth callback error:", error);

        return res.redirect(getFrontendProviderUrl("error"));
    }
});

// --------------------------------------------------
// GOOGLE ADS ACCESSIBLE ACCOUNTS
// --------------------------------------------------

router.get("/accounts", async (req, res) => {
    try {
        const { isAuthenticated, userId } = getAuth(req);

        if (!isAuthenticated || !userId) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }

        const developerToken =
            process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

        if (!developerToken) {
            return res.status(500).json({
                message: "Google Ads developer token is not configured.",
            });
        }

        // Retrieve only this Clerk user's Google Ads connection.
        const connection = await getUserConnection(userId);
        const googleConnection = connection?.providers.googleAds;
        const savedTokens = googleConnection?.tokens;

        if (!googleConnection?.connected || !savedTokens?.refreshToken) {
            return res.status(409).json({
                message: "Google Ads account is not connected.",
            });
        }

        let accessToken: string;

        // Reuse the access token while it is still valid.
        if (
            savedTokens.accessToken &&
            savedTokens.expiryDate !== null &&
            savedTokens.expiryDate > Date.now() + 60_000
        ) {
            accessToken = savedTokens.accessToken;
        } else {
            // Refresh using this user's refresh token.
            const refreshed = await refreshGoogleAccessToken(
                savedTokens.refreshToken
            );

            accessToken = refreshed.accessToken;

            // Persist the new access token, preserving the refresh token.
            await saveProviderTokens(userId, "googleAds", {
                accessToken: refreshed.accessToken,
                refreshToken: savedTokens.refreshToken,
                expiryDate: refreshed.expiryDate,
            });
        }

        const response = await fetch(
            "https://googleads.googleapis.com/v25/customers:listAccessibleCustomers",
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    "developer-token": developerToken,
                },
            }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        const resourceNames = Array.isArray(data.resourceNames)
            ? data.resourceNames
            : [];

        // Save only this user's Google Ads account information.
        await saveProviderAccounts(
            userId,
            "googleAds",
            resourceNames
        );

        return res.json({
            message: "Google Ads API successful",
            accessibleCustomers: data,
        });
    } catch (error) {
        console.error("Google Ads accounts error:", error);

        return res.status(500).json({
            message:
                error instanceof Error
                    ? error.message
                    : "Google Ads API failed",
        });
    }
});

// --------------------------------------------------
// YOUTUBE OAUTH
// Kept separate from Google Ads authentication.
// --------------------------------------------------

router.get("/youtube/auth", (_req, res) => {
    const authUrl = youtubeOAuth.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: [
            "https://www.googleapis.com/auth/youtube.upload",
        ],
    });

    const parsedUrl = new URL(authUrl);

    console.log({
        clientIdInUrl: Boolean(
            parsedUrl.searchParams.get("client_id")
        ),
        clientIdMatches:
            parsedUrl.searchParams.get("client_id") ===
            process.env.YOUTUBE_CLIENT_ID,
        redirectUriInUrl:
            parsedUrl.searchParams.get("redirect_uri"),
    });

    return res.redirect(authUrl);
});

router.get("/youtube/oauth2callback", async (req, res) => {
    try {
        const code = String(req.query.code || "");

        if (!code) {
            return res.status(400).send(
                "Authorization code missing"
            );
        }

        const { tokens } = await youtubeOAuth.getToken(code);

        if (!tokens.refresh_token) {
            return res.status(400).send(
                "Refresh token was not returned. Try re-authorizing."
            );
        }

        if (process.env.NODE_ENV === "production") {
            return res.send(
                "YouTube authorization successful. The token is not displayed in production."
            );
        }

        console.log(
            "YOUTUBE_REFRESH_TOKEN=",
            tokens.refresh_token
        );

        return res.send(
            "YouTube authorization successful. Check your backend terminal."
        );
    } catch (error) {
        console.error("YouTube OAuth callback failed:", error);

        return res.status(500).send(
            "Failed to exchange authorization code for tokens."
        );
    }
});

export default router;
