import "dotenv/config";

export interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
  loginConfigId: string;
  redirectUri: string;
  graphApiVersion: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} environment variable is missing.`);
  }

  return value;
}

export function getMetaOAuthConfig(): MetaOAuthConfig {
  return {
    appId: requiredEnv("META_APP_ID"),
    appSecret: requiredEnv("META_APP_SECRET"),
    loginConfigId: requiredEnv("META_LOGIN_CONFIG_ID"),
    redirectUri: requiredEnv("META_REDIRECT_URI"),
    graphApiVersion:
      process.env.META_GRAPH_API_VERSION?.trim() || "v26.0",
  };
}

export function createMetaAuthorizationUrl(state: string): string {
  const config = getMetaOAuthConfig();

  const url = new URL(
    `https://www.facebook.com/${config.graphApiVersion}/dialog/oauth`
  );

  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("config_id", config.loginConfigId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  return url.toString();
}