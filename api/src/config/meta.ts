
function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
  loginConfigId: string;
  redirectUri: string;
  graphApiVersion: string;
  sessionSecret: string;
  frontendUrl: string;
}

export function getMetaOAuthConfig(): MetaOAuthConfig {
  const graphApiVersion =
    process.env.META_GRAPH_API_VERSION?.trim() || "v26.0";

  if (!/^v\d+\.\d+$/.test(graphApiVersion)) {
    throw new Error("META_GRAPH_API_VERSION must look like v26.0");
  }

  const redirectUri = getRequiredEnv("META_REDIRECT_URI");
  const frontendUrl = getRequiredEnv("FRONTEND_URL");

  try {
    new URL(redirectUri);
    new URL(frontendUrl);
  } catch {
    throw new Error("META_REDIRECT_URI and FRONTEND_URL must be valid URLs");
  }

  return {
    appId: getRequiredEnv("META_APP_ID"),
    appSecret: getRequiredEnv("META_APP_SECRET"),
    loginConfigId: getRequiredEnv("META_LOGIN_CONFIG_ID"),
    redirectUri,
    graphApiVersion,
    sessionSecret: getRequiredEnv("SESSION_SECRET"),
    frontendUrl,
  };
}
