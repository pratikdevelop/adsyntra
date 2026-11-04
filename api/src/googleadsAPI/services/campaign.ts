import { getProviderAccessToken } from "../../utils/provider-token.utils.js";


export const getCampaigns = async (userId: any, customerId: string) => {
    try {
        console.log("Fetching campaigns for userId:", userId, "customerId:", customerId);
        const accessToken = await getProviderAccessToken(
            userId,
            "googleAds",
        );

        if (!customerId) {
            throw new Error("GOOGLE_ADS_CUSTOMER_ID is missing");
        }

        const query = `
              SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                campaign.advertising_channel_type,
                campaign.campaign_budget
              FROM campaign
              ORDER BY campaign.id
            `;

        const response = await fetch(
            `https://googleads.googleapis.com/v25/${customerId}/googleAds:search`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    "developer-token": process.env[`GOOGLE_ADS_DEVELOPER_TOKEN`]!,
                },
                body: JSON.stringify({
                    query,
                }),
            },
        );

        const data: any = await response.json();

        if (!response.ok) {
            throw new Error("Failed to retrieve campaigns");
        }

        return {
            campaigns: data,
            length: data.results?.length ?? 0,
        }
    } catch (error) {
        console.error("Google Ads error:", error);

        throw new Error("Failed to retrieve campaigns");
    }
}