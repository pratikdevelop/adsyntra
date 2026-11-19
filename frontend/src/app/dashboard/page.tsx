"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { authenticatedApiRequest } from "@/lib/api";

import {
  Alert,
  AlertTitle,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";

type RangeOption = "7d" | "30d" | "90d";
type ProviderKey = "googleAds" | "metaAds";
type ProviderStatus = "connected" | "not_connected" | "no_account" | "error";

interface Metrics {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  reach: number;
  linkClicks: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
}

interface TrendPoint {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  reach: number;
  linkClicks: number;
}

interface CampaignRow {
  id: string;
  name: string;
  provider: ProviderKey;
  status: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  ctr: number;
  roas: number;
  currency: string | null;
}

interface SearchTermRow {
  term: string;
  campaignName: string;
  adGroupName: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversionValue: number;
  ctr: number;
}

interface ConversionActionRow {
  name: string;
  category: string;
  conversions: number;
  conversionValue: number;
  spend: number | null;
  costPerConversion: number | null;
  roas: number | null;
}

interface AdGroupRow {
  id: string;
  name: string;
  campaignName: string;
  status: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  currency: string | null;
}

interface BreakdownRow {
  dimension: string;
  label: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  conversions: number;
  ctr: number;
}

interface ActionTypeRow {
  actionType: string;
  value: number;
}

interface ProviderDetails {
  previousPeriod: Metrics;
  searchTerms: SearchTermRow[];
  negativeCandidates: SearchTermRow[];
  conversionActions: ConversionActionRow[];
  adGroups: AdGroupRow[];
  adSets: CampaignRow[];
  ads: CampaignRow[];
  actionTypes: ActionTypeRow[];
  demographics: BreakdownRow[];
  placements: BreakdownRow[];
  countries: BreakdownRow[];
}

interface ProviderReport {
  status: ProviderStatus;
  account: { id: string; name: string; currency: string | null } | null;
  metrics: Metrics;
  campaigns: CampaignRow[];
  trend: TrendPoint[];
  details: ProviderDetails;
  partial: boolean;
  error: string | null;
}

interface OverviewResponse {
  success: boolean;
  range: RangeOption;
  dateRange: { since: string; until: string };
  summary: {
    spend: number | null;
    currency: string | null;
    spendByCurrency: Array<{ currency: string; amount: number }>;
    hasMultipleCurrencies: boolean;
    hasUnknownCurrencySpend: boolean;
    spendWithoutCurrency: number;
    impressions: number;
    clicks: number;
    conversions: number;
    conversionValue: number;
    ctr: number;
    reportingAccounts: number;
  };
  providers: Record<ProviderKey, ProviderReport>;
  trend: TrendPoint[];
  campaigns: CampaignRow[];
  reportingNote: string;
}

const RANGE_OPTIONS: Array<{ value: RangeOption; label: string }> = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

const EMPTY_METRICS: Metrics = {
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

const EMPTY_DETAILS: ProviderDetails = {
  previousPeriod: EMPTY_METRICS,
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

const EMPTY_PROVIDER: ProviderReport = {
  status: "not_connected",
  account: null,
  metrics: EMPTY_METRICS,
  campaigns: [],
  trend: [],
  details: EMPTY_DETAILS,
  partial: false,
  error: null,
};

/* -------------------------------------------------------------------------- */
/* Clearly-labelled local demo reporting                                      */
/* -------------------------------------------------------------------------- */

function demoDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function splitTotal(total: number, days: number, phase: number): number[] {
  const weights = Array.from({ length: days }, (_, index) =>
    Math.max(
      0.35,
      1 +
        0.2 * Math.sin((index + phase) * 0.72) +
        0.09 * Math.cos((index + phase) * 0.31),
    ),
  );
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  let remaining = total;
  return weights.map((weight, index) => {
    if (index === days - 1) return remaining;
    const value = Math.round((total * weight) / weightTotal);
    remaining -= value;
    return value;
  });
}

function makeDemoMetrics(input: {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  reach: number;
  linkClicks: number;
}): Metrics {
  return {
    ...input,
    ctr: input.impressions > 0 ? (input.clicks / input.impressions) * 100 : 0,
    cpc: input.clicks > 0 ? input.spend / input.clicks : 0,
    cpa: input.conversions > 0 ? input.spend / input.conversions : 0,
    roas: input.spend > 0 ? input.conversionValue / input.spend : 0,
  };
}

function makeDemoOverview(range: RangeOption): OverviewResponse {
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const today = new Date();
  const dates = Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - index - 1));
    return demoDateKey(date);
  });

  const makeTrend = (
    totals: {
      spend: number;
      impressions: number;
      clicks: number;
      conversions: number;
      conversionValue: number;
      reach: number;
      linkClicks: number;
    },
    phase: number,
  ): TrendPoint[] => {
    const values = {
      spend: splitTotal(totals.spend, days, phase),
      impressions: splitTotal(totals.impressions, days, phase + 1),
      clicks: splitTotal(totals.clicks, days, phase + 2),
      conversions: splitTotal(totals.conversions, days, phase + 3),
      conversionValue: splitTotal(totals.conversionValue, days, phase + 4),
      reach: splitTotal(totals.reach, days, phase + 5),
      linkClicks: splitTotal(totals.linkClicks, days, phase + 6),
    };
    return dates.map((date, index) => ({
      date,
      spend: values.spend[index] ?? 0,
      impressions: values.impressions[index] ?? 0,
      clicks: values.clicks[index] ?? 0,
      conversions: values.conversions[index] ?? 0,
      conversionValue: values.conversionValue[index] ?? 0,
      reach: values.reach[index] ?? 0,
      linkClicks: values.linkClicks[index] ?? 0,
    }));
  };

  const googleTotals = {
    spend: 84250,
    impressions: 486200,
    clicks: 15840,
    conversions: 612,
    conversionValue: 337000,
    reach: 0,
    linkClicks: 0,
  };
  const metaTotals = {
    spend: 52300,
    impressions: 322800,
    clicks: 12650,
    conversions: 438,
    conversionValue: 214400,
    reach: 198200,
    linkClicks: 11020,
  };
  const googleTrend = makeTrend(googleTotals, 1);
  const metaTrend = makeTrend(metaTotals, 4);
  const googleMetrics = makeDemoMetrics(googleTotals);
  const metaMetrics = makeDemoMetrics(metaTotals);

  const googleCampaigns: CampaignRow[] = [
    {
      id: "demo-g-1",
      name: "Search | High-intent keywords",
      provider: "googleAds",
      status: "ENABLED",
      spend: 32600,
      impressions: 158400,
      clicks: 5920,
      conversions: 248,
      conversionValue: 142000,
      ctr: 3.74,
      roas: 4.36,
      currency: "INR",
    },
    {
      id: "demo-g-2",
      name: "Performance Max | All products",
      provider: "googleAds",
      status: "ENABLED",
      spend: 24800,
      impressions: 186500,
      clicks: 5340,
      conversions: 196,
      conversionValue: 103500,
      ctr: 2.86,
      roas: 4.17,
      currency: "INR",
    },
    {
      id: "demo-g-3",
      name: "Brand Search | India",
      provider: "googleAds",
      status: "ENABLED",
      spend: 16850,
      impressions: 82400,
      clicks: 3380,
      conversions: 132,
      conversionValue: 72100,
      ctr: 4.1,
      roas: 4.28,
      currency: "INR",
    },
    {
      id: "demo-g-4",
      name: "Display Remarketing",
      provider: "googleAds",
      status: "PAUSED",
      spend: 10000,
      impressions: 58900,
      clicks: 1200,
      conversions: 36,
      conversionValue: 19400,
      ctr: 2.04,
      roas: 1.94,
      currency: "INR",
    },
  ];
  const metaCampaigns: CampaignRow[] = [
    {
      id: "demo-m-1",
      name: "Sales | Retargeting | 30 days",
      provider: "metaAds",
      status: "ACTIVE",
      spend: 22400,
      impressions: 104200,
      clicks: 4820,
      conversions: 196,
      conversionValue: 102500,
      ctr: 4.63,
      roas: 4.58,
      currency: "INR",
    },
    {
      id: "demo-m-2",
      name: "Leads | Lookalike audience",
      provider: "metaAds",
      status: "ACTIVE",
      spend: 17100,
      impressions: 126800,
      clicks: 4610,
      conversions: 158,
      conversionValue: 76300,
      ctr: 3.64,
      roas: 4.46,
      currency: "INR",
    },
    {
      id: "demo-m-3",
      name: "Traffic | Instagram Reels",
      provider: "metaAds",
      status: "ACTIVE",
      spend: 12800,
      impressions: 72400,
      clicks: 2720,
      conversions: 84,
      conversionValue: 35600,
      ctr: 3.76,
      roas: 2.78,
      currency: "INR",
    },
  ];

  const google: ProviderReport = {
    status: "connected",
    account: {
      id: "demo-google-account",
      name: "Demo Google Ads Account",
      currency: "INR",
    },
    metrics: googleMetrics,
    campaigns: googleCampaigns,
    trend: googleTrend,
    details: {
      previousPeriod: makeDemoMetrics({
        spend: 76800,
        impressions: 451000,
        clicks: 14700,
        conversions: 558,
        conversionValue: 298000,
        reach: 0,
        linkClicks: 0,
      }),
      searchTerms: [
        {
          term: "buy running shoes online",
          campaignName: "Search | High-intent keywords",
          adGroupName: "Running shoes",
          impressions: 18400,
          clicks: 1260,
          spend: 8120,
          conversions: 86,
          conversionValue: 46200,
          ctr: 6.85,
        },
        {
          term: "best sports shoes",
          campaignName: "Search | High-intent keywords",
          adGroupName: "Sports footwear",
          impressions: 14200,
          clicks: 940,
          spend: 6240,
          conversions: 61,
          conversionValue: 32800,
          ctr: 6.62,
        },
        {
          term: "brand store near me",
          campaignName: "Brand Search | India",
          adGroupName: "Brand terms",
          impressions: 8900,
          clicks: 720,
          spend: 2180,
          conversions: 44,
          conversionValue: 24700,
          ctr: 8.09,
        },
        {
          term: "lightweight gym shoes",
          campaignName: "Search | High-intent keywords",
          adGroupName: "Gym shoes",
          impressions: 7600,
          clicks: 510,
          spend: 3740,
          conversions: 29,
          conversionValue: 15800,
          ctr: 6.71,
        },
        {
          term: "discount sports footwear",
          campaignName: "Performance Max | All products",
          adGroupName: "—",
          impressions: 12100,
          clicks: 380,
          spend: 2960,
          conversions: 18,
          conversionValue: 9600,
          ctr: 3.14,
        },
      ],
      negativeCandidates: [
        {
          term: "free shoe samples",
          campaignName: "Search | High-intent keywords",
          adGroupName: "Running shoes",
          impressions: 2400,
          clicks: 31,
          spend: 930,
          conversions: 0,
          conversionValue: 0,
          ctr: 1.29,
        },
        {
          term: "shoe repair jobs",
          campaignName: "Search | High-intent keywords",
          adGroupName: "Sports footwear",
          impressions: 1800,
          clicks: 24,
          spend: 710,
          conversions: 0,
          conversionValue: 0,
          ctr: 1.33,
        },
      ],
      conversionActions: [
        {
          name: "Purchase",
          category: "PURCHASE",
          conversions: 382,
          conversionValue: 226400,
          spend: 84250,
          costPerConversion: 220.55,
          roas: 2.69,
        },
        {
          name: "Add to cart",
          category: "ADD_TO_CART",
          conversions: 146,
          conversionValue: 72400,
          spend: 84250,
          costPerConversion: 576.37,
          roas: 0.86,
        },
        {
          name: "Begin checkout",
          category: "BEGIN_CHECKOUT",
          conversions: 62,
          conversionValue: 38100,
          spend: 84250,
          costPerConversion: 1358.87,
          roas: 0.45,
        },
        {
          name: "Lead form submit",
          category: "SUBMIT_LEAD_FORM",
          conversions: 22,
          conversionValue: 0,
          spend: 84250,
          costPerConversion: 3829.55,
          roas: 0,
        },
      ],
      adGroups: [
        {
          id: "demo-ag-1",
          name: "Running shoes",
          campaignName: "Search | High-intent keywords",
          status: "ENABLED",
          spend: 21800,
          impressions: 102500,
          clicks: 3820,
          conversions: 164,
          ctr: 3.73,
          currency: "INR",
        },
        {
          id: "demo-ag-2",
          name: "Sports footwear",
          campaignName: "Search | High-intent keywords",
          status: "ENABLED",
          spend: 10800,
          impressions: 55900,
          clicks: 2100,
          conversions: 84,
          ctr: 3.76,
          currency: "INR",
        },
        {
          id: "demo-ag-3",
          name: "Brand terms",
          campaignName: "Brand Search | India",
          status: "ENABLED",
          spend: 16850,
          impressions: 82400,
          clicks: 3380,
          conversions: 132,
          ctr: 4.1,
          currency: "INR",
        },
        {
          id: "demo-ag-4",
          name: "Remarketing audience",
          campaignName: "Display Remarketing",
          status: "PAUSED",
          spend: 10000,
          impressions: 58900,
          clicks: 1200,
          conversions: 36,
          ctr: 2.04,
          currency: "INR",
        },
      ],
      adSets: [],
      ads: [],
      actionTypes: [],
      demographics: [],
      placements: [],
      countries: [],
    },
    partial: false,
    error: null,
  };

  const meta: ProviderReport = {
    status: "connected",
    account: {
      id: "demo-meta-account",
      name: "Demo Meta Ad Account",
      currency: "INR",
    },
    metrics: metaMetrics,
    campaigns: metaCampaigns,
    trend: metaTrend,
    details: {
      previousPeriod: makeDemoMetrics({
        spend: 47900,
        impressions: 298000,
        clicks: 11300,
        conversions: 392,
        conversionValue: 187000,
        reach: 181000,
        linkClicks: 9860,
      }),
      searchTerms: [],
      negativeCandidates: [],
      conversionActions: [],
      adGroups: [],
      adSets: [
        {
          id: "demo-as-1",
          name: "Website visitors | 30 days",
          provider: "metaAds",
          status: "ACTIVE",
          spend: 16400,
          impressions: 76800,
          clicks: 3580,
          conversions: 148,
          conversionValue: 78100,
          ctr: 4.66,
          roas: 4.76,
          currency: "INR",
        },
        {
          id: "demo-as-2",
          name: "Lookalike | 1% buyers",
          provider: "metaAds",
          status: "ACTIVE",
          spend: 14200,
          impressions: 98200,
          clicks: 3540,
          conversions: 122,
          conversionValue: 58900,
          ctr: 3.6,
          roas: 4.15,
          currency: "INR",
        },
        {
          id: "demo-as-3",
          name: "Instagram engaged users",
          provider: "metaAds",
          status: "ACTIVE",
          spend: 11700,
          impressions: 69400,
          clicks: 2780,
          conversions: 96,
          conversionValue: 46200,
          ctr: 4.0,
          roas: 3.95,
          currency: "INR",
        },
      ],
      ads: [
        {
          id: "demo-ad-1",
          name: "Summer collection | Carousel",
          provider: "metaAds",
          status: "ACTIVE",
          spend: 12800,
          impressions: 58900,
          clicks: 2760,
          conversions: 116,
          conversionValue: 62400,
          ctr: 4.69,
          roas: 4.88,
          currency: "INR",
        },
        {
          id: "demo-ad-2",
          name: "Customer review | Reel",
          provider: "metaAds",
          status: "ACTIVE",
          spend: 10400,
          impressions: 63200,
          clicks: 2390,
          conversions: 89,
          conversionValue: 43100,
          ctr: 3.78,
          roas: 4.14,
          currency: "INR",
        },
        {
          id: "demo-ad-3",
          name: "Product benefits | Story",
          provider: "metaAds",
          status: "ACTIVE",
          spend: 9200,
          impressions: 54200,
          clicks: 2080,
          conversions: 72,
          conversionValue: 34800,
          ctr: 3.84,
          roas: 3.78,
          currency: "INR",
        },
        {
          id: "demo-ad-4",
          name: "Offer creative | Static",
          provider: "metaAds",
          status: "ACTIVE",
          spend: 8100,
          impressions: 48700,
          clicks: 1850,
          conversions: 61,
          conversionValue: 29800,
          ctr: 3.8,
          roas: 3.68,
          currency: "INR",
        },
      ],
      actionTypes: [
        { actionType: "purchase", value: 214 },
        { actionType: "lead", value: 126 },
        { actionType: "add_to_cart", value: 288 },
        { actionType: "initiate_checkout", value: 104 },
        { actionType: "landing_page_view", value: 3180 },
      ],
      demographics: [
        {
          dimension: "age_gender",
          label: "18–24 · Female",
          spend: 6800,
          impressions: 42600,
          reach: 28600,
          clicks: 1720,
          conversions: 52,
          ctr: 4.04,
        },
        {
          dimension: "age_gender",
          label: "18–24 · Male",
          spend: 7200,
          impressions: 46800,
          reach: 31200,
          clicks: 1840,
          conversions: 58,
          ctr: 3.93,
        },
        {
          dimension: "age_gender",
          label: "25–34 · Female",
          spend: 12400,
          impressions: 74600,
          reach: 48600,
          clicks: 3120,
          conversions: 126,
          ctr: 4.18,
        },
        {
          dimension: "age_gender",
          label: "25–34 · Male",
          spend: 13600,
          impressions: 81200,
          reach: 52600,
          clicks: 3280,
          conversions: 118,
          ctr: 4.04,
        },
        {
          dimension: "age_gender",
          label: "35–44 · Female",
          spend: 7200,
          impressions: 44800,
          reach: 29600,
          clicks: 1680,
          conversions: 62,
          ctr: 3.75,
        },
        {
          dimension: "age_gender",
          label: "35–44 · Male",
          spend: 5100,
          impressions: 32800,
          reach: 17600,
          clicks: 1010,
          conversions: 22,
          ctr: 3.08,
        },
      ],
      placements: [
        {
          dimension: "placement",
          label: "instagram_reels",
          spend: 16800,
          impressions: 98400,
          reach: 62400,
          clicks: 4260,
          conversions: 152,
          ctr: 4.33,
        },
        {
          dimension: "placement",
          label: "instagram_stories",
          spend: 14200,
          impressions: 82600,
          reach: 53800,
          clicks: 3260,
          conversions: 118,
          ctr: 3.95,
        },
        {
          dimension: "placement",
          label: "facebook_feed",
          spend: 12800,
          impressions: 78600,
          reach: 52200,
          clicks: 2980,
          conversions: 102,
          ctr: 3.79,
        },
        {
          dimension: "placement",
          label: "instagram_feed",
          spend: 8500,
          impressions: 63200,
          reach: 39800,
          clicks: 2150,
          conversions: 66,
          ctr: 3.4,
        },
      ],
      countries: [
        {
          dimension: "country",
          label: "India",
          spend: 39800,
          impressions: 246000,
          reach: 153000,
          clicks: 9620,
          conversions: 342,
          ctr: 3.91,
        },
        {
          dimension: "country",
          label: "United Arab Emirates",
          spend: 5200,
          impressions: 28400,
          reach: 18200,
          clicks: 1140,
          conversions: 38,
          ctr: 4.01,
        },
        {
          dimension: "country",
          label: "United States",
          spend: 4100,
          impressions: 22600,
          reach: 14800,
          clicks: 920,
          conversions: 31,
          ctr: 4.07,
        },
        {
          dimension: "country",
          label: "United Kingdom",
          spend: 1900,
          impressions: 12800,
          reach: 8200,
          clicks: 540,
          conversions: 18,
          ctr: 4.22,
        },
        {
          dimension: "country",
          label: "Singapore",
          spend: 1300,
          impressions: 9000,
          reach: 6000,
          clicks: 430,
          conversions: 9,
          ctr: 4.78,
        },
      ],
    },
    partial: false,
    error: null,
  };

  const spend = googleMetrics.spend + metaMetrics.spend;
  const impressions = googleMetrics.impressions + metaMetrics.impressions;
  const clicks = googleMetrics.clicks + metaMetrics.clicks;
  const conversions = googleMetrics.conversions + metaMetrics.conversions;
  const conversionValue =
    googleMetrics.conversionValue + metaMetrics.conversionValue;
  const campaigns = [...googleCampaigns, ...metaCampaigns].sort(
    (a, b) => b.spend - a.spend,
  );

  return {
    success: true,
    range,
    dateRange: {
      since: dates[0] ?? demoDateKey(today),
      until: dates[dates.length - 1] ?? demoDateKey(today),
    },
    summary: {
      spend,
      currency: "INR",
      spendByCurrency: [{ currency: "INR", amount: spend }],
      hasMultipleCurrencies: false,
      hasUnknownCurrencySpend: false,
      spendWithoutCurrency: 0,
      impressions,
      clicks,
      conversions,
      conversionValue,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      reportingAccounts: 2,
    },
    providers: { googleAds: google, metaAds: meta },
    trend: dates.map((date, index) => {
      const g = googleTrend[index] ?? {
        date,
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        conversionValue: 0,
        reach: 0,
        linkClicks: 0,
      };
      const m = metaTrend[index] ?? {
        date,
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        conversionValue: 0,
        reach: 0,
        linkClicks: 0,
      };
      return {
        date,
        spend: g.spend + m.spend,
        impressions: g.impressions + m.impressions,
        clicks: g.clicks + m.clicks,
        conversions: g.conversions + m.conversions,
        conversionValue: g.conversionValue + m.conversionValue,
        reach: m.reach,
        linkClicks: m.linkClicks,
      };
    }),
    campaigns,
    reportingNote:
      "DEMO MODE: all metrics, campaigns, search terms and breakdowns on this page are fictional sample data for UI preview only. They are not fetched from or sent to Google Ads or Meta Ads.",
  };
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function numberText(value: number, digits = 0): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: digits,
  }).format(value || 0);
}

function currencyNumber(value: number, currency: string | null): string {
  if (!currency) return numberText(value, 2);
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value || 0);
  } catch {
    return `${currency} ${numberText(value, 2)}`;
  }
}

function dateLabel(value: string, withYear = false): string {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

function providerName(provider: ProviderKey): string {
  return provider === "googleAds" ? "Google Ads" : "Meta Ads";
}

function statusLabel(status: ProviderStatus): string {
  if (status === "connected") return "Connected";
  if (status === "no_account") return "Select an account";
  if (status === "error") return "Needs attention";
  return "Not connected";
}

function MetricCard({
  label,
  value,
  helper,
  icon,
  accent,
  loading,
}: {
  label: string;
  value: string;
  helper: string;
  icon: string;
  accent: string;
  loading: boolean;
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        borderRadius: 3,
        borderColor: "#e2e8f0",
        boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
      }}
    >
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <div className="flex items-center justify-between gap-3">
          <Typography variant="body2" color="text.secondary" fontWeight={600}>
            {label}
          </Typography>
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${accent}`}
          >
            {icon}
          </span>
        </div>
        <Typography
          variant="h4"
          component="p"
          fontWeight={750}
          letterSpacing="-0.03em"
          sx={{ mt: 2.5, color: "#0f172a" }}
        >
          {loading ? <span className="text-slate-300">•••</span> : value}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          component="p"
          sx={{ mt: 1, minHeight: 16 }}
        >
          {helper}
        </Typography>
      </CardContent>
    </Card>
  );
}

function ProviderCard({
  provider,
  report,
  demoMode = false,
}: {
  provider: ProviderKey;
  report: ProviderReport;
  demoMode?: boolean;
}) {
  const google = provider === "googleAds";
  const chipColor = demoMode
    ? "warning"
    : report.status === "connected"
      ? "success"
      : report.status === "error"
        ? "error"
        : report.status === "no_account"
          ? "warning"
          : "default";

  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        borderRadius: 3,
        borderColor: "#e2e8f0",
        boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
      }}
    >
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold ${google ? "bg-blue-50 text-blue-700" : "bg-indigo-50 text-indigo-700"}`}
            >
              {google ? "G" : "M"}
            </span>
            <div>
              <Typography
                variant="subtitle1"
                fontWeight={700}
                color="text.primary"
              >
                {providerName(provider)}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                component="p"
                sx={{ maxWidth: 220 }}
                noWrap
              >
                {report.account?.name ?? "No advertising account selected"}
              </Typography>
            </div>
          </div>
          <Chip
            size="small"
            color={chipColor}
            variant={
              demoMode || report.status === "connected" ? "filled" : "outlined"
            }
            label={demoMode ? "Demo account" : statusLabel(report.status)}
          />
        </div>

        {report.status === "connected" ? (
          <>
            <Divider sx={{ my: 2.5 }} />
            <Typography
              variant="overline"
              color="text.secondary"
              fontWeight={600}
            >
              Spend in selected period
            </Typography>
            <Typography
              variant="h4"
              component="p"
              fontWeight={750}
              sx={{ mt: 0.5, color: "#0f172a" }}
            >
              {currencyNumber(
                report.metrics.spend,
                report.account?.currency ?? null,
              )}
            </Typography>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ["Impressions", compactNumber(report.metrics.impressions)],
                ["Clicks", compactNumber(report.metrics.clicks)],
                ["Conversions", numberText(report.metrics.conversions, 1)],
                ["CTR", `${numberText(report.metrics.ctr, 2)}%`],
              ].map(([label, value]) => (
                <div key={label}>
                  <Typography variant="caption" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    color="text.primary"
                  >
                    {value}
                  </Typography>
                </div>
              ))}
            </div>
            <Divider sx={{ my: 2 }} />
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
              <span>
                CPC{" "}
                <b className="text-slate-800">
                  {currencyNumber(
                    report.metrics.cpc,
                    report.account?.currency ?? null,
                  )}
                </b>
              </span>
              <span>
                CPA{" "}
                <b className="text-slate-800">
                  {currencyNumber(
                    report.metrics.cpa,
                    report.account?.currency ?? null,
                  )}
                </b>
              </span>
              <span>
                ROAS{" "}
                <b className="text-slate-800">
                  {numberText(report.metrics.roas, 2)}×
                </b>
              </span>
              {report.metrics.reach > 0 && (
                <span>
                  Reach{" "}
                  <b className="text-slate-800">
                    {compactNumber(report.metrics.reach)}
                  </b>
                </span>
              )}
            </div>
            {report.partial && (
              <Alert
                severity="warning"
                variant="outlined"
                sx={{ mt: 2, py: 0 }}
              >
                Some detailed reports were unavailable or reached their page
                limit.
              </Alert>
            )}
          </>
        ) : (
          <div className="mt-5 rounded-xl bg-slate-50 px-4 py-4">
            <Typography variant="body2" color="text.secondary">
              {report.error ??
                (report.status === "no_account"
                  ? "Your platform is connected. Select an advertising account to load its performance."
                  : report.status === "error"
                    ? "The provider could not return reporting data."
                    : "Connect this platform to include its performance in your overview.")}
            </Typography>
            <Button
              component={Link}
              href="/dashboard/provider"
              size="small"
              variant="text"
              sx={{ mt: 1, px: 0, textTransform: "none", fontWeight: 700 }}
            >
              Manage account connection →
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ChartSeries {
  name: string;
  color: string;
  values: number[];
}

function LineChart({
  title,
  description,
  dates,
  series,
  valueFormatter,
}: {
  title: string;
  description: string;
  dates: string[];
  series: ChartSeries[];
  valueFormatter: (value: number) => string;
}) {
  const width = 680;
  const height = 220;
  const left = 58;
  const right = 16;
  const top = 18;
  const bottom = 32;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const allValues = series
    .flatMap((item) => item.values)
    .filter(Number.isFinite);
  const maximum = Math.max(1, ...allValues);
  const pointsFor = (values: number[]) =>
    values.map((value, index) => {
      const x =
        left +
        (dates.length <= 1
          ? plotWidth / 2
          : (index / (dates.length - 1)) * plotWidth);
      const y = top + plotHeight - (Math.max(0, value) / maximum) * plotHeight;
      return { x, y, value };
    });

  if (!dates.length || !series.some((item) => item.values.length)) {
    return (
      <Card
        variant="outlined"
        sx={{ borderRadius: 3, borderColor: "#e2e8f0", height: "100%" }}
      >
        <CardContent sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {description}
          </Typography>
          <div className="mt-5 flex h-44 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400">
            No trend data available.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 3,
        borderColor: "#e2e8f0",
        height: "100%",
        boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
      }}
    >
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Typography
              variant="subtitle1"
              fontWeight={800}
              color="text.primary"
            >
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {description}
            </Typography>
          </div>
          <div className="flex flex-wrap gap-3">
            {series.map((item) => (
              <span
                key={item.name}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.name}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto min-w-[520px] w-full"
            role="img"
            aria-label={title}
          >
            {[0, 1, 2, 3].map((tick) => {
              const y = top + (plotHeight / 3) * tick;
              const value = maximum * (1 - tick / 3);
              return (
                <g key={tick}>
                  <line
                    x1={left}
                    x2={width - right}
                    y1={y}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray="4 5"
                  />
                  <text
                    x={left - 10}
                    y={y + 4}
                    textAnchor="end"
                    fill="#94a3b8"
                    fontSize="10"
                  >
                    {valueFormatter(value)}
                  </text>
                </g>
              );
            })}
            {series.map((item) => {
              const points = pointsFor(item.values);
              const pointString = points
                .map((point) => `${point.x},${point.y}`)
                .join(" ");
              return (
                <g key={item.name}>
                  <polyline
                    points={pointString}
                    fill="none"
                    stroke={item.color}
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {points.map((point, index) => (
                    <circle
                      key={`${item.name}-${index}`}
                      cx={point.x}
                      cy={point.y}
                      r="3.5"
                      fill={item.color}
                      stroke="white"
                      strokeWidth="1.5"
                    >
                      <title>{`${dateLabel(dates[index] ?? "")}: ${item.name} ${valueFormatter(point.value)}`}</title>
                    </circle>
                  ))}
                </g>
              );
            })}
            <text x={left} y={height - 8} fill="#94a3b8" fontSize="10">
              {dateLabel(dates[0] ?? "")}
            </text>
            <text
              x={width - right}
              y={height - 8}
              textAnchor="end"
              fill="#94a3b8"
              fontSize="10"
            >
              {dateLabel(dates[dates.length - 1] ?? "")}
            </text>
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionTitle({
  title,
  subtitle,
  href,
  linkLabel,
}: {
  title: string;
  subtitle: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <Typography
          variant="h6"
          component="h2"
          fontWeight={800}
          color="text.primary"
        >
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {subtitle}
        </Typography>
      </div>
      {href && (
        <Button
          component={Link}
          href={href}
          size="small"
          variant="text"
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          {linkLabel ?? "View all"} →
        </Button>
      )}
    </div>
  );
}

function ReportTable({
  headers,
  rows,
  emptyText,
}: {
  headers: string[];
  rows: ReactNode[][];
  emptyText: string;
}) {
  return (
    <TableContainer sx={{ width: "100%", overflowX: "auto" }}>
      <Table
        size="small"
        sx={{ minWidth: 600 }}
        aria-label="Advertising report"
      >
        <TableHead>
          <TableRow sx={{ backgroundColor: "#f8fafc" }}>
            {headers.map((header) => (
              <TableCell
                key={header}
                sx={{
                  py: 1.5,
                  px: 2,
                  color: "#64748b",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  borderBottomColor: "#e2e8f0",
                }}
              >
                {header}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length > 0 ? (
            rows.map((row, index) => (
              <TableRow key={index} hover>
                {row.map((cell, cellIndex) => (
                  <TableCell
                    key={cellIndex}
                    sx={{
                      px: 2,
                      py: 1.5,
                      color: "#475569",
                      fontSize: 13,
                      borderBottomColor: "#f1f5f9",
                    }}
                  >
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={headers.length}
                align="center"
                sx={{ py: 5, color: "text.secondary", fontSize: 13 }}
              >
                {emptyText}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function ComparisonCard({
  name,
  report,
}: {
  name: string;
  report: ProviderReport;
}) {
  if (report.status !== "connected") return null;
  const current = report.metrics;
  const previous = report.details.previousPeriod;
  const values: Array<[string, number, number]> = [
    ["Spend", current.spend, previous.spend],
    ["Clicks", current.clicks, previous.clicks],
    ["Conversions", current.conversions, previous.conversions],
  ];

  return (
    <Card
      variant="outlined"
      sx={{ borderRadius: 3, borderColor: "#e2e8f0", height: "100%" }}
    >
      <CardContent sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          {name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Selected period vs. previous equal-length period
        </Typography>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {values.map(([label, now, before]) => {
            const change =
              before > 0 ? ((now - before) / Math.abs(before)) * 100 : null;
            const positive = change !== null && change >= 0;
            return (
              <div key={label}>
                <Typography variant="caption" color="text.secondary">
                  {label}
                </Typography>
                <Typography
                  variant="body2"
                  fontWeight={750}
                  sx={{ mt: 0.5, color: "#0f172a" }}
                >
                  {label === "Spend"
                    ? currencyNumber(now, report.account?.currency ?? null)
                    : numberText(now, 1)}
                </Typography>
                <Typography
                  variant="caption"
                  fontWeight={600}
                  sx={{
                    mt: 0.5,
                    display: "block",
                    color:
                      change === null
                        ? "text.secondary"
                        : positive
                          ? "success.main"
                          : "error.main",
                  }}
                >
                  {change === null
                    ? "No previous baseline"
                    : `${positive ? "+" : ""}${numberText(change, 1)}%`}
                </Typography>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [range, setRange] = useState<RangeOption>("30d");
  const [liveOverview, setLiveOverview] = useState<OverviewResponse | null>(
    null,
  );
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadOverview = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;
    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token)
        throw new Error("Your session has expired. Please sign in again.");
      const result = (await authenticatedApiRequest(
        `/api/overview?range=${range}`,
        token,
      )) as OverviewResponse;
      if (!result?.success)
        throw new Error("The dashboard overview could not be loaded.");
      setLiveOverview(result);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load dashboard overview.",
      );
    } finally {
      setLoading(false);
    }
  }, [getToken, isLoaded, isSignedIn, range]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview, refreshKey]);

  const overview = demoMode ? makeDemoOverview(range) : liveOverview;
  const google = overview?.providers.googleAds ?? EMPTY_PROVIDER;
  const meta = overview?.providers.metaAds ?? EMPTY_PROVIDER;

  const spendValue = useMemo(() => {
    if (!overview || overview.summary.reportingAccounts === 0) return "—";
    const summary = overview.summary;
    if (summary.spend !== null && summary.currency)
      return currencyNumber(summary.spend, summary.currency);
    if (summary.hasMultipleCurrencies) return "Multiple currencies";
    if (summary.hasUnknownCurrencySpend) return "Currency unavailable";
    return currencyNumber(summary.spend ?? 0, summary.currency);
  }, [overview]);

  const spendHelper = useMemo(() => {
    if (!overview) return "Combined provider reporting";
    if (overview.summary.spendByCurrency.length > 1) {
      return overview.summary.spendByCurrency
        .map((item) => `${item.currency} ${compactNumber(item.amount)}`)
        .join(" · ");
    }
    if (overview.summary.spendByCurrency.length === 1) {
      return `${overview.summary.spendByCurrency[0]?.currency} reporting currency`;
    }
    if (overview.summary.hasUnknownCurrencySpend)
      return "Account currency is unavailable";
    return "No spend reported in this period";
  }, [overview]);

  const trendDates = useMemo(() => {
    const set = new Set(
      [...google.trend, ...meta.trend].map((point) => point.date),
    );
    return [...set].sort();
  }, [google.trend, meta.trend]);

  const trendSeries = useMemo(() => {
    const mapSeries = (report: ProviderReport, key: keyof TrendPoint) => {
      const values = new Map(
        report.trend.map((point) => [point.date, Number(point[key]) || 0]),
      );
      return trendDates.map((date) => values.get(date) ?? 0);
    };
    return {
      googleImpressions: mapSeries(google, "impressions"),
      metaImpressions: mapSeries(meta, "impressions"),
      googleClicks: mapSeries(google, "clicks"),
      metaClicks: mapSeries(meta, "clicks"),
      googleConversions: mapSeries(google, "conversions"),
      metaConversions: mapSeries(meta, "conversions"),
      googleSpend: mapSeries(google, "spend"),
      metaSpend: mapSeries(meta, "spend"),
    };
  }, [google, meta, trendDates]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-500">
        <CircularProgress size={20} /> Loading your workspace…
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography color="text.secondary">
            Sign in to view your AdSyntra workspace overview.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const isConnected = (report: ProviderReport) => report.status === "connected";
  const topCampaignRows = overview?.campaigns ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-10">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <Typography variant="overline" color="primary.main" fontWeight={800}>
            Workspace Overview
          </Typography>
          <Typography
            variant="h4"
            component="h1"
            fontWeight={800}
            letterSpacing="-0.03em"
            sx={{ mt: 0.5, color: "#0f172a" }}
          >
            Dashboard
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1, maxWidth: 650, lineHeight: 1.7 }}
          >
            A detailed view of your Google Ads and Meta Ads performance,
            reporting and campaign insights.
          </Typography>
          {overview?.dateRange && (
            <Typography
              variant="caption"
              color="text.secondary"
              component="p"
              sx={{ mt: 1 }}
            >
              Reporting period: {dateLabel(overview.dateRange.since, true)} –{" "}
              {dateLabel(overview.dateRange.until, true)}
            </Typography>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => setDemoMode((enabled) => !enabled)}
            aria-pressed={demoMode}
            variant={demoMode ? "outlined" : "contained"}
            color={demoMode ? "warning" : "secondary"}
            startIcon={<AutoAwesomeRoundedIcon />}
            sx={{
              borderRadius: 2.5,
              textTransform: "none",
              fontWeight: 700,
              boxShadow: "none",
            }}
          >
            {demoMode ? "Exit demo data" : "Show demo data"}
          </Button>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={range}
            onChange={(_event: unknown, value: RangeOption | null) => {
              if (value) setRange(value);
            }}
            aria-label="Reporting date range"
            sx={{
              backgroundColor: "#fff",
              borderRadius: 2.5,
              "& .MuiToggleButton-root": {
                px: 1.5,
                py: 0.8,
                textTransform: "none",
                fontWeight: 700,
                borderColor: "#e2e8f0",
              },
            }}
          >
            {RANGE_OPTIONS.map((option) => (
              <ToggleButton key={option.value} value={option.value}>
                {option.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
            variant="outlined"
            color="inherit"
            startIcon={
              loading ? <CircularProgress size={16} /> : <RefreshRoundedIcon />
            }
            sx={{
              borderRadius: 2.5,
              textTransform: "none",
              fontWeight: 700,
              borderColor: "#e2e8f0",
              color: "#334155",
            }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </header>

      {demoMode && (
        <Alert
          severity="warning"
          variant="standard"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setDemoMode(false)}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              Return to live data
            </Button>
          }
          sx={{ borderRadius: 3, alignItems: "center" }}
        >
          <AlertTitle sx={{ mb: 0.25, fontWeight: 800 }}>
            Demo mode · You are viewing sample reporting data
          </AlertTitle>
          These fictional figures are for previewing the dashboard only. They
          are not live account results and will not be sent to either
          advertising platform.
        </Alert>
      )}

      {error && !demoMode && (
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setRefreshKey((value) => value + 1)}
              sx={{ textTransform: "none", fontWeight: 700 }}
            >
              Try again
            </Button>
          }
          sx={{ borderRadius: 3, alignItems: "center" }}
        >
          {error}
        </Alert>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Total Spend"
          value={spendValue}
          helper={spendHelper}
          icon="¤"
          accent="bg-blue-50 text-blue-700"
          loading={loading && !overview}
        />
        <MetricCard
          label="Impressions"
          value={overview ? compactNumber(overview.summary.impressions) : "—"}
          helper="Across connected ad accounts"
          icon="◉"
          accent="bg-violet-50 text-violet-700"
          loading={loading && !overview}
        />
        <MetricCard
          label="Clicks"
          value={overview ? compactNumber(overview.summary.clicks) : "—"}
          helper="All reported ad clicks"
          icon="↗"
          accent="bg-cyan-50 text-cyan-700"
          loading={loading && !overview}
        />
        <MetricCard
          label="Conversions"
          value={overview ? numberText(overview.summary.conversions, 1) : "—"}
          helper="Platform-reported conversion actions"
          icon="✓"
          accent="bg-emerald-50 text-emerald-700"
          loading={loading && !overview}
        />
        <MetricCard
          label="Overall CTR"
          value={overview ? `${numberText(overview.summary.ctr, 2)}%` : "—"}
          helper="Clicks divided by impressions"
          icon="%"
          accent="bg-amber-50 text-amber-700"
          loading={loading && !overview}
        />
      </section>

      <section>
        <SectionTitle
          title="Advertising platforms"
          subtitle="Connection status, reporting currency and performance by account."
          href="/dashboard/provider"
          linkLabel="Manage accounts"
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <ProviderCard
            provider="googleAds"
            report={google}
            demoMode={demoMode}
          />
          <ProviderCard provider="metaAds" report={meta} demoMode={demoMode} />
        </div>
      </section>

      <section>
        <SectionTitle
          title="Performance charts"
          subtitle="Daily reporting trends from each selected advertising account."
        />
        <div className="grid gap-5 xl:grid-cols-2">
          <LineChart
            title="Impressions by day"
            description="Google and Meta impressions use the same count unit."
            dates={trendDates}
            series={[
              {
                name: "Google Ads",
                color: "#2563eb",
                values: trendSeries.googleImpressions,
              },
              {
                name: "Meta Ads",
                color: "#7c3aed",
                values: trendSeries.metaImpressions,
              },
            ]}
            valueFormatter={compactNumber}
          />
          <LineChart
            title="Clicks by day"
            description="Daily clicks reported by each platform."
            dates={trendDates}
            series={[
              {
                name: "Google Ads",
                color: "#0891b2",
                values: trendSeries.googleClicks,
              },
              {
                name: "Meta Ads",
                color: "#c026d3",
                values: trendSeries.metaClicks,
              },
            ]}
            valueFormatter={compactNumber}
          />
          <LineChart
            title="Google Ads spend trend"
            description={`Daily spend · ${google.account?.currency ?? "currency not supplied"}`}
            dates={google.trend.map((point) => point.date)}
            series={[
              {
                name: "Google Ads",
                color: "#2563eb",
                values: trendSeries.googleSpend,
              },
            ]}
            valueFormatter={(value) => compactNumber(value)}
          />
          <LineChart
            title="Meta Ads spend trend"
            description={`Daily spend · ${meta.account?.currency ?? "currency not supplied"}`}
            dates={meta.trend.map((point) => point.date)}
            series={[
              {
                name: "Meta Ads",
                color: "#7c3aed",
                values: trendSeries.metaSpend,
              },
            ]}
            valueFormatter={(value) => compactNumber(value)}
          />
          <LineChart
            title="Conversions by day"
            description="Platform-attributed conversions; definitions may differ."
            dates={trendDates}
            series={[
              {
                name: "Google Ads",
                color: "#059669",
                values: trendSeries.googleConversions,
              },
              {
                name: "Meta Ads",
                color: "#d97706",
                values: trendSeries.metaConversions,
              },
            ]}
            valueFormatter={(value) => numberText(value, 1)}
          />
        </div>
      </section>

      <section>
        <SectionTitle
          title="Period comparison"
          subtitle="Current period compared with the immediately preceding period of equal length."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <ComparisonCard name="Google Ads" report={google} />
          <ComparisonCard name="Meta Ads" report={meta} />
        </div>
      </section>

      <Card
        component="section"
        variant="outlined"
        sx={{
          borderRadius: 3,
          overflow: "hidden",
          borderColor: "#e2e8f0",
          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center">
          <div>
            <Typography
              variant="subtitle1"
              fontWeight={800}
              color="text.primary"
            >
              Top campaigns
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Top campaign rows returned by each platform, ranked within that
              platform’s reporting account.
            </Typography>
          </div>
          <Button
            component={Link}
            href="/dashboard/campaigns"
            size="small"
            variant="text"
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            All campaigns →
          </Button>
        </div>
        <ReportTable
          headers={[
            "Campaign",
            "Platform",
            "Spend",
            "Impressions",
            "Clicks",
            "Conversions",
            "CTR",
            "ROAS",
          ]}
          rows={topCampaignRows.map((campaign) => [
            <span
              key="name"
              className="block max-w-[220px] truncate font-semibold text-slate-800"
            >
              {campaign.name}
            </span>,
            <Chip
              key="provider"
              size="small"
              color={
                campaign.provider === "googleAds" ? "primary" : "secondary"
              }
              variant="outlined"
              label={providerName(campaign.provider)}
            />,
            currencyNumber(campaign.spend, campaign.currency),
            compactNumber(campaign.impressions),
            compactNumber(campaign.clicks),
            numberText(campaign.conversions, 1),
            `${numberText(campaign.ctr, 2)}%`,
            `${numberText(campaign.roas, 2)}×`,
          ])}
          emptyText={
            loading
              ? "Loading campaign performance…"
              : "No campaign activity in this period."
          }
        />
      </Card>

      {isConnected(google) && (
        <section className="space-y-5">
          <div>
            <Typography
              variant="h6"
              component="h2"
              fontWeight={800}
              color="text.primary"
            >
              Google Ads reports
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Search query performance, conversion tracking and ad-group
              performance.
            </Typography>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card
              variant="outlined"
              sx={{
                borderRadius: 3,
                overflow: "hidden",
                borderColor: "#e2e8f0",
              }}
            >
              <div className="border-b border-slate-100 px-5 py-4">
                <Typography
                  variant="subtitle2"
                  fontWeight={800}
                  color="text.primary"
                >
                  Top search terms
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="p"
                  sx={{ mt: 0.5 }}
                >
                  Terms that generated clicks in the selected period.
                </Typography>
              </div>
              <ReportTable
                headers={[
                  "Search term",
                  "Campaign",
                  "Clicks",
                  "Spend",
                  "Conversions",
                ]}
                rows={google.details.searchTerms.map((item) => [
                  <span
                    key="term"
                    className="block max-w-[190px] truncate font-medium text-slate-800"
                  >
                    {item.term}
                  </span>,
                  <span key="campaign" className="block max-w-[145px] truncate">
                    {item.campaignName}
                  </span>,
                  compactNumber(item.clicks),
                  currencyNumber(item.spend, google.account?.currency ?? null),
                  numberText(item.conversions, 1),
                ])}
                emptyText="No search-term report rows returned for this period."
              />
            </Card>
            <Card
              variant="outlined"
              sx={{
                borderRadius: 3,
                overflow: "hidden",
                borderColor: "#e2e8f0",
              }}
            >
              <div className="border-b border-slate-100 px-5 py-4">
                <Typography
                  variant="subtitle2"
                  fontWeight={800}
                  color="text.primary"
                >
                  Conversion actions
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="p"
                  sx={{ mt: 0.5 }}
                >
                  Conversions and values by action. Google does not attribute
                  campaign spend to each action in this report.
                </Typography>
              </div>
              <ReportTable
                headers={["Action", "Category", "Conversions", "Value", "ROAS"]}
                rows={google.details.conversionActions.map((item) => [
                  <span
                    key="action"
                    className="block max-w-[180px] truncate font-medium text-slate-800"
                  >
                    {item.name}
                  </span>,
                  item.category,
                  numberText(item.conversions, 1),
                  currencyNumber(
                    item.conversionValue,
                    google.account?.currency ?? null,
                  ),
                  item.roas === null ? "—" : `${numberText(item.roas, 2)}×`,
                ])}
                emptyText="No conversion-action rows returned for this period."
              />
            </Card>
          </div>
          <Card
            variant="outlined"
            sx={{ borderRadius: 3, overflow: "hidden", borderColor: "#fde68a" }}
          >
            <div className="border-b border-amber-100 px-5 py-4">
              <Typography
                variant="subtitle2"
                fontWeight={800}
                color="text.primary"
              >
                Search terms to review
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                component="p"
                sx={{ mt: 0.5 }}
              >
                Terms with at least 10 clicks and zero recorded conversions.
                Review relevance before adding negative keywords.
              </Typography>
            </div>
            <ReportTable
              headers={[
                "Search term",
                "Campaign",
                "Clicks",
                "Spend",
                "Conversions",
              ]}
              rows={google.details.negativeCandidates.map((item) => [
                <span
                  key="term"
                  className="block max-w-[190px] truncate font-medium text-slate-800"
                >
                  {item.term}
                </span>,
                <span key="campaign" className="block max-w-[145px] truncate">
                  {item.campaignName}
                </span>,
                compactNumber(item.clicks),
                currencyNumber(item.spend, google.account?.currency ?? null),
                numberText(item.conversions, 1),
              ])}
              emptyText="No high-click, zero-conversion search terms found."
            />
          </Card>
          <Card
            variant="outlined"
            sx={{ borderRadius: 3, overflow: "hidden", borderColor: "#e2e8f0" }}
          >
            <div className="border-b border-slate-100 px-5 py-4">
              <Typography
                variant="subtitle2"
                fontWeight={800}
                color="text.primary"
              >
                Top ad groups
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                component="p"
                sx={{ mt: 0.5 }}
              >
                Google Ads campaign → ad group performance.
              </Typography>
            </div>
            <ReportTable
              headers={[
                "Ad group",
                "Campaign",
                "Status",
                "Spend",
                "Impressions",
                "Clicks",
                "Conversions",
              ]}
              rows={google.details.adGroups.map((item) => [
                <span key="name" className="font-medium text-slate-800">
                  {item.name}
                </span>,
                item.campaignName,
                item.status ?? "—",
                currencyNumber(item.spend, item.currency),
                compactNumber(item.impressions),
                compactNumber(item.clicks),
                numberText(item.conversions, 1),
              ])}
              emptyText="No ad-group report rows returned."
            />
          </Card>
        </section>
      )}

      {isConnected(meta) && (
        <section className="space-y-5">
          <div>
            <Typography
              variant="h6"
              component="h2"
              fontWeight={800}
              color="text.primary"
            >
              Meta Ads insights
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Ad set and ad performance, audience demographics, placements and
              countries.
            </Typography>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card
              variant="outlined"
              sx={{
                borderRadius: 3,
                overflow: "hidden",
                borderColor: "#e2e8f0",
              }}
            >
              <div className="border-b border-slate-100 px-5 py-4">
                <Typography
                  variant="subtitle2"
                  fontWeight={800}
                  color="text.primary"
                >
                  Audience: age & gender
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="p"
                  sx={{ mt: 0.5 }}
                >
                  Meta account insights broken down by demographic segment.
                </Typography>
              </div>
              <ReportTable
                headers={[
                  "Audience",
                  "Spend",
                  "Reach",
                  "Impressions",
                  "Clicks",
                  "Conversions",
                ]}
                rows={meta.details.demographics.map((item) => [
                  <span key="label" className="font-medium text-slate-800">
                    {item.label}
                  </span>,
                  currencyNumber(item.spend, meta.account?.currency ?? null),
                  compactNumber(item.reach),
                  compactNumber(item.impressions),
                  compactNumber(item.clicks),
                  numberText(item.conversions, 1),
                ])}
                emptyText="No demographic breakdown available."
              />
            </Card>
            <Card
              variant="outlined"
              sx={{
                borderRadius: 3,
                overflow: "hidden",
                borderColor: "#e2e8f0",
              }}
            >
              <div className="border-b border-slate-100 px-5 py-4">
                <Typography
                  variant="subtitle2"
                  fontWeight={800}
                  color="text.primary"
                >
                  Placement performance
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="p"
                  sx={{ mt: 0.5 }}
                >
                  Publisher platform and placement position.
                </Typography>
              </div>
              <ReportTable
                headers={["Placement", "Spend", "Impressions", "Clicks", "CTR"]}
                rows={meta.details.placements.map((item) => [
                  <span
                    key="label"
                    className="font-medium capitalize text-slate-800"
                  >
                    {item.label.replace(/_/g, " ")}
                  </span>,
                  currencyNumber(item.spend, meta.account?.currency ?? null),
                  compactNumber(item.impressions),
                  compactNumber(item.clicks),
                  `${numberText(item.ctr, 2)}%`,
                ])}
                emptyText="No placement breakdown available."
              />
            </Card>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card
              variant="outlined"
              sx={{
                borderRadius: 3,
                overflow: "hidden",
                borderColor: "#e2e8f0",
              }}
            >
              <div className="border-b border-slate-100 px-5 py-4">
                <Typography
                  variant="subtitle2"
                  fontWeight={800}
                  color="text.primary"
                >
                  Top ad sets
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="p"
                  sx={{ mt: 0.5 }}
                >
                  Meta Ads campaign → ad set performance.
                </Typography>
              </div>
              <ReportTable
                headers={[
                  "Ad set",
                  "Spend",
                  "Impressions",
                  "Clicks",
                  "Conversions",
                ]}
                rows={meta.details.adSets.map((item) => [
                  <span
                    key="name"
                    className="block max-w-[190px] truncate font-medium text-slate-800"
                  >
                    {item.name}
                  </span>,
                  currencyNumber(item.spend, item.currency),
                  compactNumber(item.impressions),
                  compactNumber(item.clicks),
                  numberText(item.conversions, 1),
                ])}
                emptyText="No ad-set report rows returned."
              />
            </Card>
            <Card
              variant="outlined"
              sx={{
                borderRadius: 3,
                overflow: "hidden",
                borderColor: "#e2e8f0",
              }}
            >
              <div className="border-b border-slate-100 px-5 py-4">
                <Typography
                  variant="subtitle2"
                  fontWeight={800}
                  color="text.primary"
                >
                  Top ads
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="p"
                  sx={{ mt: 0.5 }}
                >
                  Ad-level results from Meta Insights.
                </Typography>
              </div>
              <ReportTable
                headers={[
                  "Ad",
                  "Spend",
                  "Impressions",
                  "Clicks",
                  "Conversions",
                ]}
                rows={meta.details.ads.map((item) => [
                  <span
                    key="name"
                    className="block max-w-[190px] truncate font-medium text-slate-800"
                  >
                    {item.name}
                  </span>,
                  currencyNumber(item.spend, item.currency),
                  compactNumber(item.impressions),
                  compactNumber(item.clicks),
                  numberText(item.conversions, 1),
                ])}
                emptyText="No ad-level report rows returned."
              />
            </Card>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card
              variant="outlined"
              sx={{
                borderRadius: 3,
                overflow: "hidden",
                borderColor: "#e2e8f0",
              }}
            >
              <div className="border-b border-slate-100 px-5 py-4">
                <Typography
                  variant="subtitle2"
                  fontWeight={800}
                  color="text.primary"
                >
                  Top conversion actions
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="p"
                  sx={{ mt: 0.5 }}
                >
                  Action types reported by Meta. Not every action type is a
                  purchase or lead.
                </Typography>
              </div>
              <ReportTable
                headers={["Action type", "Reported actions"]}
                rows={meta.details.actionTypes.map((item) => [
                  <span
                    key="action"
                    className="break-all font-medium text-slate-800"
                  >
                    {item.actionType}
                  </span>,
                  numberText(item.value, 1),
                ])}
                emptyText="No action-type breakdown available."
              />
            </Card>
            <Card
              variant="outlined"
              sx={{
                borderRadius: 3,
                overflow: "hidden",
                borderColor: "#e2e8f0",
              }}
            >
              <div className="border-b border-slate-100 px-5 py-4">
                <Typography
                  variant="subtitle2"
                  fontWeight={800}
                  color="text.primary"
                >
                  Country performance
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="p"
                  sx={{ mt: 0.5 }}
                >
                  Delivery and response by country.
                </Typography>
              </div>
              <ReportTable
                headers={["Country", "Spend", "Reach", "Clicks", "Conversions"]}
                rows={meta.details.countries.slice(0, 10).map((item) => [
                  <span key="country" className="font-medium text-slate-800">
                    {item.label}
                  </span>,
                  currencyNumber(item.spend, meta.account?.currency ?? null),
                  compactNumber(item.reach),
                  compactNumber(item.clicks),
                  numberText(item.conversions, 1),
                ])}
                emptyText="No country breakdown available."
              />
            </Card>
          </div>
        </section>
      )}

      <Card
        component="section"
        variant="outlined"
        sx={{
          borderRadius: 3,
          borderColor: "#e2e8f0",
          backgroundColor: "#f8fafc",
        }}
      >
        <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
          <Typography variant="subtitle2" fontWeight={800} color="text.primary">
            Reporting notes
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5, fontSize: 12, lineHeight: 1.7 }}
          >
            {overview?.reportingNote ??
              "Platform attribution and conversion definitions can differ."}
            {!demoMode && (
              <>
                {" "}
                Meta conversion totals in the dashboard use selected action
                types, while the action table preserves the API action-type
                breakdown. Spend comparisons are kept separate by account
                currency.
              </>
            )}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            component="p"
            sx={{ mt: 1 }}
          >
            {!demoMode &&
            google.status !== "connected" &&
            meta.status !== "connected"
              ? "Connect an advertising account to start receiving reports. "
              : ""}
            Some optional reports may be empty when an account does not have
            that data, lacks the required permissions, or the provider does not
            support that report combination.
          </Typography>
        </CardContent>
      </Card>
    </div>
  );
}
