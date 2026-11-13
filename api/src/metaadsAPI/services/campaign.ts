import { getProviderAccessToken } from "../../utils/provider-token.utils.js";

export interface MetaCampaignRow {
	id?: string;
	name?: string;
	objective?: string;
	account_id?: string;
	buying_type?: string;
	daily_budget?: string | number;
	lifetime_budget?: string | number;
	spend_cap?: string | number;
	bid_strategy?: string;
	pacing_type?: string[];
	status?: string;
	effective_status?: string;
	start_time?: string;
	stop_time?: string;
	created_time?: string;
	updated_time?: string;
	special_ad_categories?: string[];
	[key: string]: unknown;
}

export interface CampaignPagination {
	hasMore: boolean;
	/** Opaque Meta cursor. Pass it back unchanged as pageToken on the next request. */
	nextToken: string | null;
}

export interface MetaCampaignListResponse {
	campaigns: MetaCampaignRow[];
	length: number;
	pagination: CampaignPagination;
}

interface MetaAdsApiError {
	message?: string;
	type?: string;
	code?: number;
	error_subcode?: number;
	fbtrace_id?: string;
	is_transient?: boolean;
}

interface MetaAdsCampaignsApiResponse {
	data?: MetaCampaignRow[];
	paging?: {
		cursors?: {
			after?: string;
			before?: string;
		};
		next?: string;
		previous?: string;
	};
	error?: MetaAdsApiError;
}

const META_CAMPAIGN_FIELDS = [
	"id",
	"name",
	"objective",
	"account_id",
	"buying_type",
	"daily_budget",
	"lifetime_budget",
	"spend_cap",
	"bid_strategy",
	"pacing_type",
	"status",
	"effective_status",
	"start_time",
	"stop_time",
	"created_time",
	"updated_time",
	"special_ad_categories",
].join(",");
const apiVersion = process.env.META_ADS_API_VERSION?.trim() || "v27.0";

// const META_GRAPH_API_VERSION =
function normalizeAdAccountId(adAccountId: string): string {
	const value = adAccountId.trim();

	// Meta account selection may store either "act_123..." or the numeric ID.
	if (/^act_\d+$/.test(value)) {
		return value;
	}

	if (/^\d+$/.test(value)) {
		return `act_${value}`;
	}

	throw new Error(
		"Invalid Meta Ads account ID. Expected a numeric ID or act_{accountId} resource ID.",
	);
}

function getMetaApiErrorMessage(body: unknown, status: number): string {
	if (body && typeof body === "object" && "error" in body) {
		const apiError = (body as MetaAdsCampaignsApiResponse).error;

		if (apiError?.message) {
			const errorCode =
				apiError.code !== undefined ? ` (code ${apiError.code})` : "";
			const errorType = apiError.type ? ` ${apiError.type}` : "";

			return `Meta Ads API request failed with HTTP ${status}${errorType}${errorCode}: ${apiError.message}`;
		}
	}

	return `Meta Ads API request failed with HTTP ${status}.`;
}

/**
 * Retrieve one page of campaigns for the authenticated user's selected Meta
 * ad account. Pass pagination.nextToken back as pageToken to retrieve the
 * next page. Meta uses cursor pagination, so the cursor must remain opaque.
 */
export const getCampaigns = async (
	userId: string,
	adAccountId: string,
	pageToken?: string,
): Promise<MetaCampaignListResponse> => {
	if (!userId?.trim()) {
		throw new Error("Authenticated user ID is required.");
	}

	if (!adAccountId?.trim()) {
		throw new Error("A Meta Ads account must be selected.");
	}

	const accountResourceId = normalizeAdAccountId(adAccountId);
	// const apiVersion = process.env.META_ADS_API_VERSION?.trim() || "v27.0";

	if (!/^v\d+\.\d+$/.test(apiVersion)) {
		throw new Error(
			"Invalid META_ADS_API_VERSION. Expected a version such as v27.0.",
		);
	}

	if (pageToken !== undefined && !pageToken.trim()) {
		throw new Error("Meta Ads page token cannot be empty.");
	}

	try {
		const accessToken = await getProviderAccessToken(userId, "metaAds");

		const url = new URL(
			`https://graph.facebook.com/${apiVersion}/${accountResourceId}/campaigns`,
		);

		url.searchParams.set("fields", META_CAMPAIGN_FIELDS);
		url.searchParams.set("limit", "100");

		if (pageToken !== undefined) {
			// Do not decode, trim, or otherwise modify provider-issued cursors.
			url.searchParams.set("after", pageToken);
		}

		const response = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
			},
			signal: AbortSignal.timeout(30_000),
		});

		const responseBody: unknown = await response.json().catch(() => null);

		if (!response.ok) {
			throw new Error(getMetaApiErrorMessage(responseBody, response.status));
		}

		if (!responseBody || typeof responseBody !== "object") {
			throw new Error("Meta Ads returned an invalid campaign response.");
		}

		const data = responseBody as MetaAdsCampaignsApiResponse;

		if (data.error) {
			throw new Error(getMetaApiErrorMessage(responseBody, response.status));
		}

		if (!Array.isArray(data.data)) {
			throw new Error(
				"Meta Ads returned an invalid campaign response: expected a data array.",
			);
		}

		const campaigns = data.data;
		const nextCursor = data.paging?.cursors?.after;
		const hasNextPage = Boolean(data.paging?.next);

		if (hasNextPage && !nextCursor) {
			throw new Error(
				"Meta Ads indicated another campaign page but did not return a cursor.",
			);
		}

		return {
			campaigns,
			length: campaigns.length,
			pagination: {
				hasMore: hasNextPage,
				nextToken: hasNextPage ? (nextCursor ?? null) : null,
			},
		};
	} catch (error) {
		console.error(
			"Meta Ads campaign retrieval failed:",
			error instanceof Error ? error.message : "Unknown error",
		);

		throw error instanceof Error
			? error
			: new Error("Failed to retrieve Meta Ads campaigns.");
	}
};

export const renameCampaign = async (
	campaignId: any,
	name: any,
	userId: any,
) => {
	const accessToken = await getProviderAccessToken(userId, "metaAds");


	// 1. Check whether the user has connected Meta.
	if (!accessToken) {
		throw new Error("Connect your Meta account first.");
	}

	// 2. Validate the campaign ID.
	if (!/^\d+$/.test(campaignId)) {
		throw new Error("Invalid campaign ID.");
	}

	// 4. Send the update request to Meta Graph API.
	try {
		const url = new URL(
			`https://graph.facebook.com/${apiVersion}/${campaignId}`,
		);

		const response = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({ name }).toString(),
		});

		const data = await response.json();

		// 5. Handle Meta API errors.
		if (!response.ok) {
			console.error("Meta campaign update error:", data);

			throw new Error("Meta campaign update failed.");
		}

		// 6. Return the successful response.
		return {
			message: "Campaign name updated successfully.",
			data,
		};
	} catch (error) {
		console.error(
			"Meta campaign update request failed:",
			error instanceof Error ? error.message : "Unknown error",
		);

		throw new Error("Could not reach Meta Graph API.");
	}
};

export const updateMetaAdsStatus = async (campaignId: any, status: any, userId: any) => {
	const accessToken = await getProviderAccessToken(userId, "metaAds");

	if (!accessToken) {
		throw new Error("Connect your Meta account first.");
	}

	try {
		const url = new URL(
			`https://graph.facebook.com/${apiVersion}/${campaignId}`,
		);

		const response = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({ status }).toString(),
		});

		const data = await response.json();

		if (!response.ok) {
			console.error("Meta campaign status error:", data);

			throw new Error("Failed to update campaign status.",);

		}

		return {
			message: `Campaign ${status === "PAUSED" ? "paused" : "activated"} successfully.`,
			data,
		};
	} catch (error) {
		console.error(
			"Campaign status request failed:",
			error instanceof Error ? error.message : "Unknown error",
		);

		throw new Error("Could not reach Meta Graph API.");
	}
};
