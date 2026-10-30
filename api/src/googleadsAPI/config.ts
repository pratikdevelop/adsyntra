
import "dotenv/config";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";

// Google Ads OAuth configuration
const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
} = process.env;

export const GOOGLE_ADS_SCOPE =
  "https://www.googleapis.com/auth/adwords";

// Create a fresh OAuth client when exchanging or refreshing tokens.
// This avoids sharing mutable credentials between different users.
export function createGoogleOAuthClient(): OAuth2Client {
  if (
    !GOOGLE_CLIENT_ID ||
    !GOOGLE_CLIENT_SECRET ||
    !GOOGLE_REDIRECT_URI
  ) {
    throw new Error("Google OAuth environment variables are missing.");
  }

  return new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

// Used for generating the Google authorization URL.
// Do not use this shared instance to store individual users' credentials.
export const oauth2Client = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

// Exchange Google's authorization code for tokens.
// The caller is responsible for securely saving the tokens
// against the authenticated Clerk user.
export async function exchangeGoogleAuthorizationCode(code: string) {
  const client = createGoogleOAuthClient();

  const { tokens } = await client.getToken(code);

  if (!tokens.access_token) {
    throw new Error("Google did not return an access token.");
  }

  return tokens;
}

// Generate a fresh access token using a specific user's refresh token.
// The caller must save the returned access token and expiry in
// data/user-connections.json.
export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiryDate: number;
}> {
  if (!refreshToken) {
    throw new Error("No Google refresh token found for this user.");
  }

  const client = createGoogleOAuthClient();

  client.setCredentials({
    refresh_token: refreshToken,
  });

  const { token, res } = await client.getAccessToken();

  if (!token) {
    throw new Error("Unable to generate Google access token.");
  }

  const expiryDate = res?.data?.expiry_date;

  return {
    accessToken: token,
    expiryDate:
      typeof expiryDate === "number"
        ? expiryDate
        : Date.now() + 50 * 60 * 1000,
  };
}

// --------------------------------------------------
// YouTube OAuth configuration
// Kept separate from Google Ads OAuth.
// --------------------------------------------------

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
const redirectUri = process.env.YOUTUBE_REDIRECT_URI;

if (!clientId || !clientSecret || !redirectUri) {
  console.warn(
    "YouTube OAuth is not configured. YouTube routes will not work."
  );
}

export const youtubeOAuth = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

youtubeOAuth.setCredentials({
  refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
});

export const youtube = google.youtube({
  version: "v3",
  auth: youtubeOAuth,
});
