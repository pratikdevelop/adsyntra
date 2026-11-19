
import "dotenv/config";
import mongoose from "mongoose";

import {
    getMetaAdsCreationContext,
} from "../metaadsAPI/services/campaign-creation.js";


const META_API_VERSION = "v25.0";
const META_CAMPAIGN_ID = "120249490875360775";


function isRecord(
    value: unknown,
): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

async function checkMetaAdSets() {
    const mongoUri =
        process.env.MONGODB_URI ??
        process.env.MONGO_URI ??
        process.env.MONGO_URL;

    const userId = process.env.META_DIAGNOSTIC_USER_ID;

    const accountId =
        process.env.META_AD_ACCOUNT_ID ??
        "act_1820194389321017";

    //    const expectedPageId =
    //        process.env.META_TEST_PAGE_ID ?? "1383140784881581";

    if (!mongoUri) {
        throw new Error(
            "MongoDB connection string is missing. Check your backend .env file.",
        );
    }



    console.log("\nConnecting to application MongoDB...");

    await mongoose.connect(mongoUri);

    try {
        console.log("MongoDB connected.");

        // Retrieves the same stored Meta token used by the application.
        const context = await getMetaAdsCreationContext(
            userId,
            accountId,
        );

        console.log("\nMeta access token retrieved successfully.");
        console.log("Meta Ad Account:", context.adAccountId);
        console.log("Graph API Version:", context.apiVersion);


        const url = new URL(
            `https://graph.facebook.com/${META_API_VERSION}/${META_CAMPAIGN_ID}/adsets`
        );

        url.searchParams.set(
            "fields",
            "id,name,campaign_id,effective_status"
        );
        url.searchParams.set("limit", "100");

        console.log("Checking Meta Ad Sets...");
        console.log("Campaign ID:", META_CAMPAIGN_ID);
        console.log("accessToken", context.accessToken)

        const response = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${context.accessToken}`,
            },
        });

        const result = await response.json();

        if (!response.ok) {
            console.error("Meta API request failed:");
            console.error(JSON.stringify(result, null, 2));
            process.exitCode = 1;
            return;
        }

        const adSets = result.data ?? [];

        if (adSets.length === 0) {
            console.log("\nNo Ad Sets found for this campaign.");
            return;
        }

        console.log(`\nFound ${adSets.length} Ad Set(s):`);
        console.log(JSON.stringify(adSets, null, 2));

        if (result.paging?.next) {
            console.log("\nMore results may exist. Pagination is available.");
        }
    } catch (error) {
        console.error("Error: ", error)
    }
}

checkMetaAdSets().catch((error) => {
    console.error("Verification failed:", error);
    process.exitCode = 1;
});
