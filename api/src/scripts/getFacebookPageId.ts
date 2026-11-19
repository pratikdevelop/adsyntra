
import "dotenv/config";
import mongoose from "mongoose";

import {
    getMetaAdsCreationContext,
} from "../metaadsAPI/services/campaign-creation.js";

interface MetaPage {
    id: string;
    name: string;
    tasks: string[];
}

function isRecord(
    value: unknown,
): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

async function listMetaPages(): Promise<void> {

    const mongoUri =
        process.env[`MONGODB_URI`] ??
        process.env.MONGO_URI ??
        process.env[`MONGO_URL`];

    const userId = process.env[`META_DIAGNOSTIC_USER_ID`];

    const accountId =
        process.env[`META_AD_ACCOUNT_ID`] ??
        "act_1820194389321017";

    const expectedPageId =
        process.env.META_TEST_PAGE_ID ?? "1383140784881581";

    if (!mongoUri) {
        throw new Error(
            "MongoDB connection string is missing. Check your backend .env file.",
        );
    }

    if (!userId) {
        throw new Error(
            "META_DIAGNOSTIC_USER_ID is missing.",
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

        const pages: MetaPage[] = [];

        let after: string | undefined;

        // Retrieve every available page using pagination.
        for (let pageNumber = 0; pageNumber < 50; pageNumber++) {
            const url = new URL(
                `https://graph.facebook.com/${context.apiVersion}/me/accounts`,
            );

            url.searchParams.set("fields", "id,name,tasks");
            url.searchParams.set("limit", "100");

            if (after) {
                url.searchParams.set("after", after);
            }

            const response = await fetch(url, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${context.accessToken}`,
                    Accept: "application/json",
                },
                signal: AbortSignal.timeout(30000),
            });

            const responseBody: unknown =
                await response.json().catch(() => null);

            if (!response.ok) {
                const metaError =
                    isRecord(responseBody) &&
                        isRecord(responseBody.error)
                        ? responseBody.error
                        : null;

                throw new Error(
                    `Meta API HTTP ${response.status}: ${typeof metaError?.message === "string"
                        ? metaError.message
                        : JSON.stringify(responseBody)
                    }`,
                );
            }

            if (
                !isRecord(responseBody) ||
                !Array.isArray(responseBody.data)
            ) {
                throw new Error(
                    "Unexpected response received from Meta Pages API.",
                );
            }

            for (const item of responseBody.data) {
                if (!isRecord(item)) continue;

                if (
                    typeof item.id !== "string" ||
                    typeof item.name !== "string"
                ) {
                    continue;
                }

                const tasks = Array.isArray(item.tasks)
                    ? item.tasks.filter(
                        (task): task is string =>
                            typeof task === "string",
                    )
                    : [];

                pages.push({
                    id: item.id,
                    name: item.name,
                    tasks,
                });
            }

            const paging = isRecord(responseBody.paging)
                ? responseBody.paging
                : {};

            const cursors = isRecord(paging.cursors)
                ? paging.cursors
                : {};

            after =
                typeof cursors.after === "string"
                    ? cursors.after
                    : undefined;

            if (!after) break;

            if (pageNumber === 49) {
                console.warn(
                    "Stopped after 50 pages. Additional pages may exist.",
                );
            }
        }

        console.log("\n==================================");
        console.log("FACEBOOK PAGES ACCESSIBLE TO TOKEN");
        console.log("==================================\n");

        if (pages.length === 0) {
            console.log("No Facebook Pages returned by Meta.");
        } else {
            console.table(
                pages.map((page) => ({
                    pageName: page.name,
                    pageId: page.id,
                    tasks: page.tasks.join(", "),
                    isExpectedPage: page.id === expectedPageId,
                })),
            );
        }

        const matchedPage = pages.find(
            (page) => page.id === expectedPageId,
        );

        console.log("\nExpected Page ID:", expectedPageId);

        if (matchedPage) {
            console.log("RESULT: Expected Facebook Page FOUND.");
            console.log("Page Name:", matchedPage.name);
            console.log("Page ID:", matchedPage.id);
            console.log("Page Tasks:", matchedPage.tasks);
        } else {
            console.log("RESULT: Expected Facebook Page NOT FOUND.");
            console.log(
                "The stored token did not return this Page through /me/accounts.",
            );
        }

        console.log("\nTotal Pages Found:", pages.length);
    } catch (err) {
        console.log(
            "eer", err
        );

    }
    finally {
        await mongoose.disconnect();

        console.log("Diagnostic user ID:", userId);
        console.log("Diagnostic account ID:", accountId);
        console.log("MongoDB database:", mongoose.connection.name);
        console.log("\nMongoDB connection closed.");
    }
}

listMetaPages().catch((error: unknown) => {
    console.error("\nMETA PAGE DIAGNOSTIC FAILED:");
    console.error(
        error instanceof Error ? error.message : error,
    );

    process.exitCode = 1;
});
