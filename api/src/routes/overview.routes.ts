import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";

import AdAccountModel from "../models/ad-account.model.js";
import { getUserConnection } from "../utils/connection-storage.utils.js";
import {
    getGoogleOverview,
    getMetaOverview,
    type OverviewAccount,
    type OverviewDateRange,
    type OverviewMetrics,
    type OverviewProvider,
    type OverviewProviderDetails,
    type OverviewRange,
    type OverviewTrendPoint,
    type ProviderOverviewData,
} from "../services/overview.service.js";

const router = Router();

interface ProviderOverviewResponse {
    status: "connected" | "not_connected" | "no_account" | "error";
    account: OverviewAccount | null;
    metrics: OverviewMetrics;
    campaigns: ProviderOverviewData["campaigns"];
    trend: ProviderOverviewData["trend"];
    details: OverviewProviderDetails;
    partial: boolean;
    error: string | null;
}

function emptyMetrics(): OverviewMetrics {
    return {
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        conversionValue: 0,
        reach: 0,
        linkClicks: 0,
        ctr: 0,
        cpc: 0,
        cpa: 0,
        roas: 0,
    };
}

function emptyDetails(): OverviewProviderDetails {
    return {
        previousPeriod: emptyMetrics(),
        searchTerms: [],
        negativeCandidates: [],
        conversionActions: [],
        adGroups: [],
        adSets: [],
        ads: [],
        actionTypes: [],
        demographics: [],
        placements: [],
        countries: [],
    };
}

function errorMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : "Unable to load reporting data from this provider.";
}

function getDateRange(range: OverviewRange): OverviewDateRange {
    const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

    return {
        since: start.toISOString().slice(0, 10),
        until: end.toISOString().slice(0, 10),
    };
}

function toOverviewAccount(account: {
    externalAccountId: string;
    name: string;
    currency?: string;
}): OverviewAccount {
    return {
        id: account.externalAccountId,
        name: account.name,
        currency: account.currency ?? null,
    };
}

async function loadProvider(
    provider: OverviewProvider,
    connected: boolean,
    selectedAccount: OverviewAccount | null,
    userId: string,
    dates: OverviewDateRange,
): Promise<ProviderOverviewResponse> {
    if (!connected) {
        return {
            status: "not_connected",
            account: null,
            metrics: emptyMetrics(),
            campaigns: [],
            trend: [],
            details: emptyDetails(),
            partial: false,
            error: null,
        };
    }

    if (!selectedAccount) {
        return {
            status: "no_account",
            account: null,
            metrics: emptyMetrics(),
            campaigns: [],
            trend: [],
            details: emptyDetails(),
            partial: false,
            error: null,
        };
    }

    try {
        const result = provider === "googleAds"
            ? await getGoogleOverview(userId, selectedAccount, dates)
            : await getMetaOverview(userId, selectedAccount, dates);

        return {
            status: "connected",
            account: {
                ...selectedAccount,
                currency: result.currency ?? selectedAccount.currency,
            },
            metrics: result.metrics,
            campaigns: result.campaigns,
            trend: result.trend,
            details: result.details,
            partial: result.partial,
            error: null,
        };
    } catch (error) {
        console.error(`${provider} overview request failed:`, error);

        return {
            status: "error",
            account: selectedAccount,
            metrics: emptyMetrics(),
            campaigns: [],
            trend: [],
            details: emptyDetails(),
            partial: false,
            error: errorMessage(error),
        };
    }
}

function buildSummary(providers: Record<OverviewProvider, ProviderOverviewResponse>) {
    const entries = Object.values(providers);
    const impressions = entries.reduce((sum, item) => sum + item.metrics.impressions, 0);
    const clicks = entries.reduce((sum, item) => sum + item.metrics.clicks, 0);
    const conversions = entries.reduce((sum, item) => sum + item.metrics.conversions, 0);
    const conversionValue = entries.reduce((sum, item) => sum + item.metrics.conversionValue, 0);

    const spendByCurrency = new Map<string, number>();
    let spendWithoutCurrency = 0;

    for (const item of entries) {
        if (item.status !== "connected") continue;

        const currency = item.account?.currency?.toUpperCase();
        if (currency && /^[A-Z]{3}$/.test(currency)) {
            spendByCurrency.set(
                currency,
                (spendByCurrency.get(currency) ?? 0) + item.metrics.spend,
            );
        } else if (item.metrics.spend > 0) {
            spendWithoutCurrency += item.metrics.spend;
        }
    }

    const currencies = [...spendByCurrency.entries()]
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => a.currency.localeCompare(b.currency));

    const hasMultipleCurrencies = currencies.length > 1;
    const hasUnknownCurrencySpend = spendWithoutCurrency > 0;
    const singleCurrency = currencies.length === 1 ? currencies[0] : undefined;
    const canShowOneTotal = Boolean(singleCurrency) && !hasUnknownCurrencySpend;

    return {
        spend: canShowOneTotal && singleCurrency
            ? singleCurrency.amount
            : currencies.length === 0 && !hasUnknownCurrencySpend ? 0 : null,
        currency: canShowOneTotal && singleCurrency ? singleCurrency.currency : null,
        spendByCurrency: currencies,
        hasMultipleCurrencies,
        hasUnknownCurrencySpend,
        spendWithoutCurrency,
        impressions,
        clicks,
        conversions,
        conversionValue,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        reportingAccounts: entries.filter((item) => item.status === "connected").length,
    };
}

function mergeTrend(
    providers: Record<OverviewProvider, ProviderOverviewResponse>,
): OverviewTrendPoint[] {
    const byDate = new Map<string, OverviewTrendPoint>();
    const connectedProviders = Object.values(providers).filter(
        (provider) => provider.status === "connected",
    );
    const currencies = new Set(
        connectedProviders
            .map((provider) => provider.account?.currency?.toUpperCase())
            .filter((currency): currency is string => Boolean(currency)),
    );
    const hasUnlabelledSpend = connectedProviders.some(
        (provider) => !provider.account?.currency && provider.metrics.spend > 0,
    );
    const canCombineSpend = currencies.size <= 1 && !hasUnlabelledSpend;

    for (const provider of Object.values(providers)) {
        for (const point of provider.trend) {
            const existing = byDate.get(point.date) ?? {
                date: point.date,
                spend: 0,
                impressions: 0,
                clicks: 0,
                conversions: 0,
                conversionValue: 0,
                reach: 0,
                linkClicks: 0,
            };

            if (canCombineSpend) existing.spend += point.spend;
            existing.impressions += point.impressions;
            existing.clicks += point.clicks;
            existing.conversions += point.conversions;
            existing.conversionValue += point.conversionValue;
            existing.reach += point.reach;
            existing.linkClicks += point.linkClicks;
            byDate.set(point.date, existing);
        }
    }

    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

router.get("/", async (req: Request, res: Response) => {
    const { userId } = getAuth(req);

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Authentication required.",
        });
    }

    const requestedRange = typeof req.query.range === "string"
        ? req.query.range
        : "30d";

    if (!["7d", "30d", "90d"].includes(requestedRange)) {
        return res.status(400).json({
            success: false,
            message: "range must be one of: 7d, 30d, 90d.",
        });
    }

    try {
        const range = requestedRange as OverviewRange;
        const dates = getDateRange(range);
        const [connection, googleAccountDoc, metaAccountDoc] = await Promise.all([
            getUserConnection(userId),
            AdAccountModel.findOne({
                userId,
                provider: "googleAds",
                isSelected: true,
            })
                .select("externalAccountId name currency")
                .lean()
                .exec(),
            AdAccountModel.findOne({
                userId,
                provider: "metaAds",
                isSelected: true,
            })
                .select("externalAccountId name currency")
                .lean()
                .exec(),
        ]);

        const googleAccount = googleAccountDoc ? toOverviewAccount(googleAccountDoc) : null;
        const metaAccount = metaAccountDoc ? toOverviewAccount(metaAccountDoc) : null;

        const [googleAds, metaAds] = await Promise.all([
            loadProvider(
                "googleAds",
                Boolean(connection?.providers.googleAds.connected),
                googleAccount,
                userId,
                dates,
            ),
            loadProvider(
                "metaAds",
                Boolean(connection?.providers.metaAds.connected),
                metaAccount,
                userId,
                dates,
            ),
        ]);

        const providers: Record<OverviewProvider, ProviderOverviewResponse> = {
            googleAds,
            metaAds,
        };

        // Do not rank spend across currencies: each provider's account currency
        // can differ. Each provider contributes its own top campaign rows.
        const campaigns = [
            ...googleAds.campaigns,
            ...metaAds.campaigns,
        ];

        return res.status(200).json({
            success: true,
            range,
            dateRange: dates,
            summary: buildSummary(providers),
            providers,
            trend: mergeTrend(providers),
            campaigns,
            reportingNote:
                "Google Ads and Meta Ads use different attribution rules and conversion definitions. Conversion totals are displayed as platform-reported values. Spend is only combined when connected accounts share the same currency; campaign spend is compared within each platform.",
        });
    } catch (error) {
        console.error("Dashboard overview request failed:", error);
        return res.status(500).json({
            success: false,
            message: errorMessage(error),
        });
    }
});

export default router;
