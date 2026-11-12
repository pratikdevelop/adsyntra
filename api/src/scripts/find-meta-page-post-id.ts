import "dotenv/config";
import mongoose from "mongoose";

import {
  getMetaAdsCreationContext,
} from "../metaadsAPI/services/campaign-creation.js";

interface MetaPage {
  id: string;
  name: string;
  tasks: string[];
  access_token?: string;
}

interface MetaPost {
  id: string;
  message?: string;
  permalink_url?: string;
  created_time?: string;
}

interface MetaApiResponse {
  data?: unknown[];
  paging?: {
    cursors?: {
      after?: string;
    };
  };
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getMetaError(body: unknown): string {
  if (isRecord(body) && isRecord(body.error)) {
    const error = body.error;
    const parts = [
      typeof error.message === "string" ? error.message : "Unknown Meta API error",
      error.code !== undefined ? `code=${String(error.code)}` : undefined,
      error.error_subcode !== undefined
        ? `subcode=${String(error.error_subcode)}`
        : undefined,
      typeof error.fbtrace_id === "string"
        ? `fbtrace_id=${error.fbtrace_id}`
        : undefined,
    ].filter(Boolean);
    return parts.join(" | ");
  }

  return JSON.stringify(body);
}

async function metaGet(
  url: URL,
  accessToken: string,
): Promise<MetaApiResponse> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Meta API HTTP ${response.status}: ${getMetaError(body)}`);
  }

  if (!isRecord(body)) {
    throw new Error("Meta API returned an unexpected non-object response.");
  }

  if (body.error) {
    throw new Error(`Meta API error: ${getMetaError(body)}`);
  }

  return body as MetaApiResponse;
}

function getPostUrlIdentifiers(value: string | undefined): {
  storyFbid?: string;
  pageId?: string;
} {
  if (!value) return {};

  try {
    const url = new URL(value);
    return {
      storyFbid: url.searchParams.get("story_fbid") ?? undefined,
      pageId: url.searchParams.get("id") ?? undefined,
    };
  } catch {
    return {};
  }
}

function matchesTargetPost(
  post: MetaPost,
  targetUrl: string,
  targetStoryFbid?: string,
): boolean {
  const permalink = post.permalink_url;
  if (!permalink) return false;

  if (permalink === targetUrl) return true;

  const permalinkIds = getPostUrlIdentifiers(permalink);
  if (
    targetStoryFbid &&
    permalinkIds.storyFbid &&
    permalinkIds.storyFbid === targetStoryFbid
  ) {
    return true;
  }

  return Boolean(targetStoryFbid && permalink.includes(targetStoryFbid));
}

async function listMetaPages(
  apiVersion: string,
  userAccessToken: string,
): Promise<MetaPage[]> {
  const pages: MetaPage[] = [];
  let after: string | undefined;

  for (let pageNumber = 0; pageNumber < 50; pageNumber += 1) {
    const url = new URL(`https://graph.facebook.com/${apiVersion}/me/accounts`);
    url.searchParams.set("fields", "id,name,access_token,tasks");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);

    const body = await metaGet(url, userAccessToken);

    for (const item of body.data ?? []) {
      if (!isRecord(item)) continue;
      if (typeof item.id !== "string" || typeof item.name !== "string") continue;

      pages.push({
        id: item.id,
        name: item.name,
        access_token:
          typeof item.access_token === "string" ? item.access_token : undefined,
        tasks: Array.isArray(item.tasks)
          ? item.tasks.filter((task): task is string => typeof task === "string")
          : [],
      });
    }

    after = body.paging?.cursors?.after;
    if (!after) break;

    if (pageNumber === 49) {
      console.warn("Reached the 50-page safety limit while listing Pages.");
    }
  }

  return pages;
}

async function findPagePosts(
  apiVersion: string,
  pageId: string,
  pageAccessToken: string,
  targetUrl: string,
): Promise<{ match?: MetaPost; posts: MetaPost[] }> {
  const targetStoryFbid = getPostUrlIdentifiers(targetUrl).storyFbid;
  const allPosts: MetaPost[] = [];
  let after: string | undefined;

  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const url = new URL(`https://graph.facebook.com/${apiVersion}/${pageId}/posts`);
    url.searchParams.set("fields", "id,message,permalink_url,created_time");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);

    const body = await metaGet(url, pageAccessToken);

    for (const item of body.data ?? []) {
      if (!isRecord(item) || typeof item.id !== "string") continue;

      const post: MetaPost = {
        id: item.id,
        message: typeof item.message === "string" ? item.message : undefined,
        permalink_url:
          typeof item.permalink_url === "string" ? item.permalink_url : undefined,
        created_time:
          typeof item.created_time === "string" ? item.created_time : undefined,
      };

      allPosts.push(post);

      if (matchesTargetPost(post, targetUrl, targetStoryFbid)) {
        return { match: post, posts: allPosts };
      }
    }

    after = body.paging?.cursors?.after;
    if (!after) break;

    if (pageNumber === 99) {
      console.warn("Reached the 100-page safety limit while searching posts.");
    }
  }

  return { posts: allPosts };
}

async function main(): Promise<void> {
  const mongoUri =
    process.env.MONGODB_URI ??
    process.env.MONGO_URI ??
    process.env.MONGO_URL;

  const userId = process.env.META_DIAGNOSTIC_USER_ID?.trim();
  const accountId =
    process.env.META_AD_ACCOUNT_ID?.trim() || "act_1820194389321017";
  const targetUrl =
    process.env.META_TEST_POST_URL?.trim() ||
    "https://www.facebook.com/permalink.php?story_fbid=pfbid0guNnmagmMrk4Qv42FbbCMKBYyTArC1iBYi4MZ8FooWLra7g9pqm5CakZFMZ5vLFil&id=1383140784881581";

  const urlIds = getPostUrlIdentifiers(targetUrl);
  const expectedPageId =
    process.env.META_TEST_PAGE_ID?.trim() || urlIds.pageId || "1383140784881581";

  if (!mongoUri) {
    throw new Error("MongoDB connection string is missing. Check the backend .env file.");
  }
  if (!userId) {
    throw new Error("META_DIAGNOSTIC_USER_ID is missing from the backend .env file.");
  }
  if (!expectedPageId || !/^\d+$/.test(expectedPageId)) {
    throw new Error("Could not determine a valid numeric Facebook Page ID from the target URL.");
  }
  if (!urlIds.storyFbid) {
    throw new Error("The target URL does not contain a story_fbid parameter.");
  }

  let mongoConnected = false;

  try {
    console.log("\nConnecting to application MongoDB...");
    await mongoose.connect(mongoUri);
    mongoConnected = true;
    console.log("MongoDB connected.");

    // Uses the same encrypted/stored Meta token as the application.
    // Never print context.accessToken or Page access tokens.
    const context = await getMetaAdsCreationContext(userId, accountId);

    console.log("Stored Meta token retrieved from the application.");
    console.log("Ad Account:", context.adAccountId);
    console.log("Graph API version:", context.apiVersion);
    console.log("Target Page:", expectedPageId);

    console.log("\nFinding Pages available to the stored Meta user token...");
    const pages = await listMetaPages(context.apiVersion, context.accessToken);

    const matchedPage = pages.find((page) => page.id === expectedPageId);

    if (!matchedPage) {
      console.log("\nExpected Page was not returned by /me/accounts.");
      console.table(pages.map(({ id, name, tasks }) => ({
        pageId: id,
        pageName: name,
        tasks: tasks.join(", "),
      })));
      throw new Error(
        `Page ${expectedPageId} is not available through this stored token. Check that it is a User Access Token with pages_show_list and that the user has access to the Page.`,
      );
    }

    if (!matchedPage.access_token) {
      throw new Error(
        `Meta returned Page ${expectedPageId} but did not return its Page access token. Check Page permissions and token type.`,
      );
    }

    console.log("Found Page:", matchedPage.name);
    console.log("Page ID:", matchedPage.id);
    console.log("Page tasks:", matchedPage.tasks.join(", ") || "not provided");
    console.log("Page access token retrieved (hidden).");

    console.log("\nSearching Page posts for the supplied permalink...");
    const result = await findPagePosts(
      context.apiVersion,
      matchedPage.id,
      matchedPage.access_token,
      targetUrl,
    );

    if (result.match) {
      console.log("\n========================================");
      console.log("MATCH FOUND");
      console.log("========================================");
      console.log("Page name:", matchedPage.name);
      console.log("Page ID:", matchedPage.id);
      console.log("Graph API Post ID:", result.match.id);
      console.log("Created:", result.match.created_time ?? "not returned");
      console.log("Permalink:", result.match.permalink_url ?? "not returned");
      console.log("\nUse this exact value for object_story_id:");
      console.log(result.match.id);
      return;
    }

    console.log("\nNo exact permalink/pfbid match was found in the Page posts returned.");
    console.log(`Posts checked: ${result.posts.length}`);
    console.log("Recent posts are listed below so you can identify the target by message/date:");

    console.table(
      result.posts.slice(-30).reverse().map((post) => ({
        postId: post.id,
        created: post.created_time ?? "",
        message: (post.message ?? "[No message text]").replace(/\s+/g, " ").slice(0, 160),
        permalink: post.permalink_url ?? "",
      })),
    );

    console.log(
      "\nIf the post is not listed, check whether it was published by this Page and whether the stored token has pages_read_engagement (and, where required, pages_read_user_content).",
    );
    process.exitCode = 2;
  } finally {
    if (mongoConnected || mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log("\nMongoDB connection closed.");
    }
  }
}

main().catch((error: unknown) => {
  console.error("\nMETA POST ID LOOKUP FAILED:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
