declare global {
    namespace NodeJS {
        interface ProcessEnv {
            TOKEN_ENCRYPTION_KEY: any;
            NODE_ENV: 'development' | 'production' | 'test';
            GOOGLE_ADS_DEVELOPER_TOKEN: any;
            GOOGLE_CLIENT_ID: any;
            GOOGLE_CLIENT_SECRET: any;
            GOOGLE_REDIRECT_URI: any;
            PORT: any;
            GOOGLE_ADS_CUSTOMER_ID: any;
            YOUTUBE_CLIENT_ID: any;
            YOUTUBE_CLIENT_SECRET: any;
            YOUTUBE_REDIRECT_URI: any;
            YOUTUBE_REFRESH_TOKEN: any;
            MONGO_URI: any;
            MONGODB_DB_NAME: any;
            NVIDIA_API_KEY: any;
            META_GRAPH_API_VERSION: any;
            GOOGLE_ADS_API_VERSION: any;
            META_ADS_API_VERSION: any;
            META_ADS_APP_ID: any;
            META_ADS_APP_SECRET: any;
            META_ADS_ACCESS_TOKEN: any;
            META_ADS_ACCOUNT_ID: any;
            OAUTH_STATE_SECRET: any;
            FRONTEND_URL: any;
            SESSION_SECRET: any;
        }
    }
}

// If this file has no imports/exports, force it to be treated as a module
export { };
