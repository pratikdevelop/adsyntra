
import { getProviderAccessToken } from "../../utils/provider-token.utils.js";
const META_GRAPH_API_VERSION = "v26.0";
export const getCampaigns = async (
    userId: string,
    adAccountId: string,
) => {
    try {
        // Validate authenticated user
        if (!userId?.trim()) {
            throw new Error("Authenticated user ID is required.");
        }

        // Validate Meta Ad Account ID
        if (!/^act_\d+$/.test(adAccountId)) {
            throw new Error(
                "Invalid Meta Ads account ID. Expected act_ followed by digits.",
            );
        }

        // Retrieve this user's Meta access token
        const accessToken = await getProviderAccessToken(
            userId,
            "metaAds",
        );

        if (!accessToken) {
            throw new Error(
                "Meta Ads access token is missing. Please connect Meta Ads first.",
            );
        }

        const url = new URL(
            `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${adAccountId}/campaigns`,
        );

        url.searchParams.set(
            "fields",
            "id,name,objective,status,effective_status",
        );

        const metaResponse = await fetch(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        const data: any = await metaResponse.json();

        if (!metaResponse.ok) {
            console.error("Meta Ads API error:", data);

            throw new Error(
                data.error?.message ||
                "Failed to retrieve campaigns from Meta Ads.",
            );
        }

        return {
            data,
            length: data.data?.length ?? 0,
        };

    } catch (error) {
        console.error(
            "Meta Ads campaign retrieval failed:",
            error instanceof Error ? error.message : error,
        );

        throw error instanceof Error
            ? error
            : new Error("Could not retrieve campaigns from Meta Ads.");
    }
};
