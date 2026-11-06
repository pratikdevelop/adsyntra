"use client";

import Link from "next/link";
import { Fragment } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

type ProviderKey = "googleAds" | "metaAds";
type JsonRecord = Record<string, unknown>;

interface GlobalCampaign {
  id: string;
  provider: ProviderKey | string;
  accountId?: string | null;
  name: string;
  status?: string | null;
  effectiveStatus?: string | null;
  objective?: string | null;
  campaignType?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  source?: JsonRecord | null;
}

interface ProviderPagination {
  hasMore?: boolean;
  nextToken?: string | null;
  totalResults?: number | null;
}

interface ProviderResult {
  success?: boolean;
  connected?: boolean;
  status?: string;
  accountId?: string | null;
  data?: unknown;
  error?: unknown;
  campaigns?: GlobalCampaign[];
  account?: {
    id?: string;
    name?: string;
    currency?: string | null;
    timezone?: string | null;
  } | null;
  pagination?: ProviderPagination;
}

interface GlobalCampaignsApiResponse {
  success: boolean;
  message?: string;
  providers?: Partial<Record<ProviderKey, ProviderResult>>;
  campaigns?: GlobalCampaign[];
  stats?: {
    total?: number;
    providersSucceeded?: number;
    providersFailed?: number;
  };
}

interface CampaignsPageProps {
  pageTitle?: string;
  pageDescription?: string;
  /** Kept so existing route wrappers remain type-compatible. The global table no longer filters by status. */
  initialStatusFilter?: string;
}

const DEFAULT_DESCRIPTION =
  "View Google Ads and Meta Ads campaigns together in one table.";
function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object"
    ? (value as JsonRecord)
    : null;
}

function extractProviderCampaigns(
  providerResult: ProviderResult | undefined,
): GlobalCampaign[] {
  if (!providerResult) return [];

  const data = providerResult.data;

  if (Array.isArray(data)) {
    return data as GlobalCampaign[];
  }

  const dataRecord = asRecord(data);

  if (Array.isArray(dataRecord?.campaigns)) {
    return dataRecord.campaigns as GlobalCampaign[];
  }

  if (Array.isArray(providerResult.campaigns)) {
    return providerResult.campaigns;
  }

  return [];
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getCampaignCurrency(
  campaign: GlobalCampaign,
  providers: Partial<Record<ProviderKey, ProviderResult>>,
): string | null {
  const source = asRecord(campaign.source);
  const customer = asRecord(source?.customer);
  const budget = asRecord(source?.budget);
  const campaignBudget = asRecord(source?.campaignBudget);
  const currency =
    customer?.currencyCode ??
    budget?.currencyCode ??
    campaignBudget?.currencyCode ??
    providers[campaign.provider as ProviderKey]?.account?.currency;

  return typeof currency === "string" && currency.trim()
    ? currency.trim()
    : null;
}

function getCampaignSpend(campaign: GlobalCampaign): number | null {
  const metrics = asRecord(asRecord(campaign.source)?.metrics);
  const spend = readNumber(metrics?.spend);
  if (spend !== null) return spend;

  const costMicros = readNumber(metrics?.costMicros);
  return costMicros !== null ? costMicros / 1_000_000 : null;
}

function getCampaignBudget(campaign: GlobalCampaign): number | null {
  const source = asRecord(campaign.source);
  const normalizedBudget = asRecord(source?.budget);
  const apiBudget = asRecord(source?.campaignBudget);

  const normalizedAmount = readNumber(normalizedBudget?.amount);
  if (normalizedAmount !== null) return normalizedAmount;

  const amountMicros = readNumber(
    normalizedBudget?.amountMicros ?? apiBudget?.amountMicros,
  );
  return amountMicros !== null ? amountMicros / 1_000_000 : null;
}

function formatCurrency(value: number | null, currency: string | null): string {
  if (value === null) return "—";
  if (!currency) {
    return new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 2,
    }).format(value);
  }

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString("en-IN")} ${currency}`;
  }
}

function formatMetric(value: unknown): string {
  const parsed = readNumber(value);
  return parsed === null ? "—" : new Intl.NumberFormat("en-IN").format(parsed);
}

function getMetric(campaign: GlobalCampaign, key: string): unknown {
  return asRecord(asRecord(campaign.source)?.metrics)?.[key];
}

function getCampaignType(campaign: GlobalCampaign): string {
  if (campaign.campaignType) return campaign.campaignType;
  const source = asRecord(campaign.source);
  const rawCampaign = asRecord(source?.campaign);
  const channel = rawCampaign?.advertisingChannelType ?? source?.buying_type;
  return typeof channel === "string" ? channel : "—";
}

function getProviderLabel(provider: string): string {
  if (provider === "googleAds") return "Google Ads";
  if (provider === "metaAds") return "Meta Ads";
  return provider;
}

function getProviderColor(
  provider: string,
): "primary" | "secondary" | "default" {
  if (provider === "googleAds") return "primary";
  if (provider === "metaAds") return "secondary";
  return "default";
}

function getStatusColor(
  status: string | null | undefined,
): "success" | "warning" | "error" | "default" {
  const normalized = status?.toUpperCase();
  if (normalized === "ACTIVE" || normalized === "ENABLED") return "success";
  if (normalized === "PAUSED") return "warning";
  if (normalized === "FAILED" || normalized === "ERROR") return "error";
  return "default";
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string; error?: string }
      | undefined;
    return (
      data?.message ??
      data?.error ??
      error.message ??
      "Failed to load campaigns."
    );
  }
  return error instanceof Error ? error.message : "Failed to load campaigns.";
}

export default function CampaignsPage({
  pageTitle = "Campaign Management",
  pageDescription = DEFAULT_DESCRIPTION,
}: CampaignsPageProps = {}) {
  const [campaigns, setCampaigns] = useState<GlobalCampaign[]>([]);
  const [providers, setProviders] = useState<
    Partial<Record<ProviderKey, ProviderResult>>
  >({});
  const providersRef = useRef<Partial<Record<ProviderKey, ProviderResult>>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const loadCampaigns = useCallback(async (append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const params: Record<string, string> = {};
      if (append) {
        const googleToken =
          providersRef.current.googleAds?.pagination?.nextToken;
        const metaToken = providersRef.current.metaAds?.pagination?.nextToken;
        if (googleToken) params.googlePageToken = googleToken;
        if (metaToken) params.metaPageToken = metaToken;
      }

      const response = await axios.get<GlobalCampaignsApiResponse>(
        "/api/campaigns",
        { params },
      );
      const payload = response.data;

      console.log("Campaigns response:", payload);

      if (!payload?.success) {
        throw new Error(
          payload?.message || "Campaign API returned an unsuccessful response.",
        );
      }

      const providerResults = payload.providers ?? {};

      const googleResult = providerResults.googleAds;
      const metaResult = providerResults.metaAds;

      const googleCampaigns = extractProviderCampaigns(googleResult);
      const metaCampaigns = extractProviderCampaigns(metaResult);

      const incomingCampaigns: GlobalCampaign[] = [
        ...googleCampaigns.map((campaign) => ({
          ...campaign,
          provider: "googleAds" as const,
          accountId: campaign.accountId ?? googleResult?.accountId ?? null,
        })),

        ...metaCampaigns.map((campaign) => ({
          ...campaign,
          provider: "metaAds" as const,
          accountId: campaign.accountId ?? metaResult?.accountId ?? null,
        })),
      ];

      setCampaigns((current) => {
        if (!append) return incomingCampaigns;

        const merged = new Map<string, GlobalCampaign>();

        [...current, ...incomingCampaigns].forEach((campaign) => {
          merged.set(`${campaign.provider}:${campaign.id}`, campaign);
        });

        return [...merged.values()];
      });
      setProviders({
        googleAds: {
          ...googleResult,
          connected: googleResult?.success === true,
          status: googleResult?.success ? "connected" : "disconnected",
        },

        metaAds: {
          ...metaResult,
          connected: metaResult?.success === true,
          status: metaResult?.success ? "connected" : "disconnected",
        },
      });
      setError(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns(false);
  }, [loadCampaigns]);

  const totalSpend = useMemo(() => {
    const totalsByCurrency = new Map<string, number>();
    let unknownCurrencyTotal = 0;
    let hasUnknownCurrencySpend = false;

    campaigns.forEach((campaign) => {
      const spend = getCampaignSpend(campaign);
      if (spend === null) return;
      const currency = getCampaignCurrency(campaign, providers);
      if (currency) {
        totalsByCurrency.set(
          currency,
          (totalsByCurrency.get(currency) ?? 0) + spend,
        );
      } else {
        unknownCurrencyTotal += spend;
        hasUnknownCurrencySpend = true;
      }
    });

    if (totalsByCurrency.size > 1) return "Multiple currencies";
    if (totalsByCurrency.size === 1 && !hasUnknownCurrencySpend) {
      const [currency, amount] = [...totalsByCurrency.entries()][0];
      return formatCurrency(amount, currency);
    }
    if (totalsByCurrency.size === 0 && !hasUnknownCurrencySpend) {
      return formatCurrency(0, null);
    }
    if (totalsByCurrency.size === 0) {
      return formatCurrency(unknownCurrencyTotal, null);
    }
    return "Multiple currencies";
  }, [campaigns, providers]);

  const googleCount = campaigns.filter(
    (campaign) => campaign.provider === "googleAds",
  ).length;
  const metaCount = campaigns.filter(
    (campaign) => campaign.provider === "metaAds",
  ).length;
  const connectedProviders = ["googleAds", "metaAds"].filter(
    (provider) => providers[provider as ProviderKey]?.connected,
  ).length;

  const hasMore = Boolean(
    providers.googleAds?.pagination?.hasMore ||
    providers.metaAds?.pagination?.hasMore,
  );

  return (
    <Box sx={{ width: "100%", maxWidth: 1600, mx: "auto" }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        // justifyContent="space-between"
        // alignItems={{ xs: "stretch", sm: "center" }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4" component="h1" fontWeight={700}>
            {pageTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            {pageDescription}
          </Typography>
        </Box>
        <Button
          component={Link}
          href="/dashboard/campaigns/new"
          variant="contained"
          size="large"
          disableElevation
        >
          Create campaign
        </Button>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0, 1fr))",
            xl: "repeat(4, minmax(0, 1fr))",
          },
          gap: 2,
          mb: 3,
        }}
      >
        <MetricCard
          label="Total campaigns"
          value={campaigns.length}
          detail="Across all connected platforms"
        />
        <MetricCard
          label="Google Ads"
          value={googleCount}
          detail={
            providers.googleAds?.connected
              ? "Account connected"
              : "Not connected"
          }
        />
        <MetricCard
          label="Meta Ads"
          value={metaCount}
          detail={
            providers.metaAds?.connected ? "Account connected" : "Not connected"
          }
        />
        <MetricCard
          label="Total spend"
          value={totalSpend}
          detail="Based on metrics returned by providers"
        />
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => void loadCampaigns(false)}
            >
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ width: "100%", overflow: "hidden" }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", sm: "center" }}
          spacing={1}
          sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: "divider" }}
        >
          <Box>
            <Typography variant="h6" fontWeight={700}>
              All campaigns
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {campaigns.length} campaigns · {connectedProviders} of 2 providers
              connected
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Chip
              label={`Google ${providers.googleAds?.status ?? "unknown"}`}
              color={providers.googleAds?.connected ? "success" : "default"}
              variant="outlined"
              size="small"
            />
            <Chip
              label={`Meta ${providers.metaAds?.status ?? "unknown"}`}
              color={providers.metaAds?.connected ? "success" : "default"}
              variant="outlined"
              size="small"
            />
          </Stack>
        </Stack>

        {loading ? (
          <Stack
            alignItems="center"
            justifyContent="center"
            spacing={2}
            sx={{ py: 9 }}
          >
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">
              Loading campaigns from Google Ads and Meta Ads…
            </Typography>
          </Stack>
        ) : campaigns.length === 0 ? (
          <Alert severity="info" sx={{ m: 2 }}>
            No campaigns were returned by the connected advertising accounts.
          </Alert>
        ) : (
          <TableContainer sx={{ width: "100%" }}>
            <Table
              size="medium"
              sx={{ minWidth: 1900 }}
              aria-label="Global advertising campaigns"
            >
              <TableHead>
                <TableRow sx={{ backgroundColor: "action.hover" }}>
                  <TableCell sx={{ fontWeight: 700 }}>Campaign</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Platform</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Objective</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Campaign type</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Bid strategy</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Budget
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Spend
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Impressions
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Reach
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Clicks
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    CTR
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    CPC
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    CPM
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Conversions
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Conv. rate
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Cost / conv.
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Conv. value
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    ROAS
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>
                    Details
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Action
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {campaigns.map((campaign) => {
                  const currency = getCampaignCurrency(campaign, providers);
                  const status =
                    campaign.effectiveStatus || campaign.status || "UNKNOWN";
                  const rowKey = `${campaign.provider}:${campaign.id}`;
                  const isExpanded = Boolean(expandedRows[rowKey]);
                  const source = asRecord(campaign.source);
                  const rawCampaign = asRecord(source?.campaign);
                  const budget =
                    asRecord(source?.budget) ??
                    asRecord(source?.campaignBudget);
                  const bidding = asRecord(source?.bidding);
                  const specialCategories = source?.special_ad_categories;
                  const startTime = source?.start_time;
                  const createdTime =
                    source?.created_time ?? campaign.createdAt;
                  const updatedTime =
                    source?.updated_time ?? campaign.updatedAt;

                  const metricCurrency = currency;
                  const formatPercent = (value: unknown) => {
                    const number = readNumber(value);
                    return number === null
                      ? "—"
                      : `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(number)}%`;
                  };
                  const formatRatio = (value: unknown) => {
                    const number = readNumber(value);
                    return number === null
                      ? "—"
                      : `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(number)}x`;
                  };
                  const displayValue = (value: unknown) =>
                    value === null || value === undefined || value === ""
                      ? "—"
                      : Array.isArray(value)
                        ? value.length
                          ? value.join(", ")
                          : "None"
                        : String(value);

                  return (
                    <Fragment key={rowKey}>
                      <TableRow hover>
                        <TableCell sx={{ minWidth: 230 }}>
                          <Typography variant="body2" fontWeight={600}>
                            {campaign.name || "Untitled campaign"}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                          >
                            ID: {campaign.id}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                          >
                            Account: {campaign.accountId || "—"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={getProviderLabel(campaign.provider)}
                            color={getProviderColor(campaign.provider)}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>{campaign.objective || "—"}</TableCell>
                        <TableCell>{getCampaignType(campaign)}</TableCell>
                        <TableCell>
                          {displayValue(
                            bidding?.strategy ??
                              rawCampaign?.biddingStrategyType,
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(
                            getCampaignBudget(campaign),
                            currency,
                          )}
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                          >
                            {displayValue(budget?.period ?? budget?.type)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(getCampaignSpend(campaign), currency)}
                        </TableCell>
                        <TableCell align="right">
                          {formatMetric(getMetric(campaign, "impressions"))}
                        </TableCell>
                        <TableCell align="right">
                          {formatMetric(getMetric(campaign, "reach"))}
                        </TableCell>
                        <TableCell align="right">
                          {formatMetric(getMetric(campaign, "clicks"))}
                        </TableCell>
                        <TableCell align="right">
                          {formatPercent(getMetric(campaign, "ctr"))}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(
                            readNumber(getMetric(campaign, "cpc")),
                            metricCurrency,
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(
                            readNumber(getMetric(campaign, "cpm")),
                            metricCurrency,
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {formatMetric(getMetric(campaign, "conversions"))}
                        </TableCell>
                        <TableCell align="right">
                          {formatPercent(getMetric(campaign, "conversionRate"))}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(
                            readNumber(
                              getMetric(campaign, "costPerConversion"),
                            ),
                            metricCurrency,
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(
                            readNumber(getMetric(campaign, "conversionValue")),
                            metricCurrency,
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {formatRatio(getMetric(campaign, "roas"))}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={status}
                            color={getStatusColor(status)}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Button
                            size="small"
                            onClick={() =>
                              setExpandedRows((current) => ({
                                ...current,
                                [rowKey]: !current[rowKey],
                              }))
                            }
                          >
                            {isExpanded ? "Hide" : "Expand"}
                          </Button>
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            component={Link}
                            href={`/dashboard/campaigns/${encodeURIComponent(campaign.id)}`}
                            size="small"
                            variant="text"
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                      <TableRow key={`${rowKey}:details`}>
                        <TableCell
                          colSpan={21}
                          sx={{
                            py: 0,
                            borderBottom: isExpanded ? undefined : 0,
                          }}
                        >
                          <Collapse
                            in={isExpanded}
                            timeout="auto"
                            unmountOnExit
                          >
                            <Box sx={{ py: 2.5 }}>
                              <Typography
                                variant="subtitle2"
                                fontWeight={700}
                                sx={{ mb: 1.5 }}
                              >
                                Campaign details
                              </Typography>
                              <Box
                                sx={{
                                  display: "grid",
                                  gridTemplateColumns: {
                                    xs: "1fr",
                                    sm: "repeat(2, minmax(0, 1fr))",
                                    lg: "repeat(4, minmax(0, 1fr))",
                                  },
                                  gap: 2,
                                }}
                              >
                                <DetailItem
                                  label="Campaign ID"
                                  value={campaign.id}
                                />
                                <DetailItem
                                  label="Account ID"
                                  value={campaign.accountId}
                                />
                                <DetailItem
                                  label="Effective status"
                                  value={campaign.effectiveStatus}
                                />
                                <DetailItem
                                  label="Campaign objective"
                                  value={campaign.objective}
                                />
                                <DetailItem
                                  label="Channel / campaign type"
                                  value={getCampaignType(campaign)}
                                />
                                <DetailItem
                                  label="Bidding strategy"
                                  value={
                                    bidding?.strategy ??
                                    rawCampaign?.biddingStrategyType
                                  }
                                />
                                <DetailItem
                                  label="Bidding system status"
                                  value={
                                    bidding?.systemStatus ??
                                    rawCampaign?.biddingStrategySystemStatus
                                  }
                                />
                                <DetailItem
                                  label="Budget name"
                                  value={budget?.name}
                                />
                                <DetailItem
                                  label="Budget amount"
                                  value={formatCurrency(
                                    getCampaignBudget(campaign),
                                    currency,
                                  )}
                                />
                                <DetailItem
                                  label="Budget period"
                                  value={budget?.period ?? budget?.type}
                                />
                                <DetailItem
                                  label="Budget delivery"
                                  value={budget?.deliveryMethod}
                                />
                                <DetailItem
                                  label="Buying type"
                                  value={source?.buying_type}
                                />
                                <DetailItem
                                  label="Start time"
                                  value={startTime}
                                />
                                <DetailItem
                                  label="Created"
                                  value={createdTime}
                                />
                                <DetailItem
                                  label="Last updated"
                                  value={updatedTime}
                                />
                                <DetailItem
                                  label="Special ad categories"
                                  value={specialCategories}
                                />
                              </Box>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {!loading && hasMore && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              p: 2,
              borderTop: 1,
              borderColor: "divider",
            }}
          >
            <Button
              onClick={() => void loadCampaigns(true)}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <CircularProgress size={18} sx={{ mr: 1 }} />
              ) : null}
              Load more campaigns
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

function DetailItem({ label, value }: { label: string; value: unknown }) {
  const display =
    value === null || value === undefined || value === ""
      ? "—"
      : Array.isArray(value)
        ? value.length
          ? value.join(", ")
          : "None"
        : String(value);

  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography
        variant="body2"
        fontWeight={600}
        sx={{ overflowWrap: "anywhere", mt: 0.25 }}
      >
        {display}
      </Typography>
    </Box>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary" fontWeight={500}>
          {label}
        </Typography>
        <Typography
          variant="h4"
          component="p"
          fontWeight={700}
          sx={{ mt: 1.25 }}
        >
          {value}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.75, display: "block" }}
        >
          {detail}
        </Typography>
      </CardContent>
    </Card>
  );
}
