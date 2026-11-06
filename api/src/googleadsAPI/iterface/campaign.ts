
export type GoogleCampaignDatePreset =
    | "TODAY"
    | "YESTERDAY"
    | "LAST_7_DAYS"
    | "LAST_14_DAYS"
    | "LAST_30_DAYS"
    | "LAST_BUSINESS_WEEK"
    | "THIS_MONTH"
    | "LAST_MONTH"
    | "THIS_WEEK_SUN_TODAY"
    | "THIS_WEEK_MON_TODAY"
    | "LAST_WEEK_SUN_SAT"
    | "LAST_WEEK_MON_SUN";

export interface GoogleCampaignListOptions {
    /** Opaque Google Ads Search page token. Pass it back unchanged. */
    pageToken?: string;
    /** Google Ads date preset. Defaults to LAST_30_DAYS. */
    datePreset?: string;
}

export interface GoogleCampaignBudgetSummary {
    amount: number | null;
    amountMicros: string | null;
    type: "daily" | "lifetime" | null;
    period: string | null;
    currencyCode: string | null;
    deliveryMethod: string | null;
    name: string | null;
}

export interface GoogleCampaignMetricsSummary {
    spend: number | null;
    impressions: number | null;
    clicks: number | null;
    ctr: number | null;
    cpc: number | null;
    cpm: number | null;
    conversions: number | null;
    conversionRate: number | null;
    costPerConversion: number | null;
    conversionValue: number | null;
    roas: number | null;
    /** Google Ads campaign-level reach is not included in this standard report. */
    reach: null;
}

export interface GoogleCampaignRow {
    id: string;
    platform: "googleAds";
    name: string;
    status: string | null;
    objective: string | null;
    channelType: string | null;
    channelSubType: string | null;
    bidding: {
        strategy: string | null;
        systemStatus: string | null;
    };
    budget: GoogleCampaignBudgetSummary;
    metrics: GoogleCampaignMetricsSummary;
    /** Complete unmodified Google Ads Search row for detail views/debugging. */
    raw: GoogleAdsSearchRow;
    campaign?: Record<string, unknown>;
    campaignBudget?: Record<string, unknown>;
customer?: GoogleCampaignCustomerSummary;
    [key: string]: unknown;
}

export interface CampaignPagination {
    hasMore: boolean;
    /** Opaque provider cursor. Pass it back unchanged on the next request. */
    nextToken: string | null;
    totalResults: number | null;
}

export interface GoogleCampaignListResponse {
    campaigns: GoogleCampaignRow[];
    length: number;
    // datePreset: GoogleCampaignDatePreset;
    currencyCode: string | null;
    pagination: CampaignPagination;
}

export interface GoogleAdsSearchRow {
    campaign?: Record<string, unknown> & {
        id?: string;
        name?: string;
        status?: string;
        advertisingChannelType?: string;
        advertisingChannelSubType?: string;
        biddingStrategyType?: string;
        biddingStrategySystemStatus?: string;
    };
    campaignBudget?: Record<string, unknown> & {
        name?: string;
        amountMicros?: string;
        totalAmountMicros?: string;
        period?: string;
        deliveryMethod?: string;
    };
    customer?: GoogleCampaignCustomerSummary;
    metrics?: {
        impressions?: string | number;
        clicks?: string | number;
        ctr?: string | number;
        costMicros?: string | number;
        averageCpc?: string | number;
        averageCpm?: string | number;
        conversions?: string | number;
        conversionsFromInteractionsRate?: string | number;
        costPerConversion?: string | number;
        conversionsValue?: string | number;
        conversionsValuePerCost?: string | number;
    };
    primaryStatus?: string;
primaryStatusReasons?: string[];
servingStatus?: string;
startDateTime?: string;
endDateTime?: string;
}

export interface GoogleAdsSearchResponse {
    results?: GoogleAdsSearchRow[];
    nextPageToken?: string;
    totalResultsCount?: string;
}

export interface GoogleCampaignAccountSummary {
    id: string;
    name: string | null;
    currencyCode: string | null;
    timeZone: string | null;
}

export interface GoogleCampaignListResponse {
    account: GoogleCampaignAccountSummary | null;
    campaigns: GoogleCampaignRow[];
    length: number;
    pagination: CampaignPagination;
}
export interface GoogleAdsErrorResponse {
    error?: {
        code?: number;
        message?: string;
        status?: string;
    };
}

export interface GoogleCampaignCustomerSummary {
    resourceName?: string;
    currencyCode?: string;
    descriptiveName?: string;
    timeZone?: string;
}