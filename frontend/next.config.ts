import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    typescript: {
        ignoreBuildErrors: true
    },
    devIndicators: false,
    experimental: {
        agentUpgrade: "security"
    }
};

export default nextConfig;

