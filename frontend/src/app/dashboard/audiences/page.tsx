"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import ErrorOutlineRounded from "@mui/icons-material/ErrorOutlineRounded";
import GroupsRounded from "@mui/icons-material/GroupsRounded";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import StorageRounded from "@mui/icons-material/StorageRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import { authenticatedApiRequest } from "@/lib/api";

type ProviderKey = "googleAds" | "metaAds";
type ActiveTab = "all" | ProviderKey;
type AudienceRecord = Record<string, unknown>;

type ReportResult<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

type AudienceCollection = {
  count: number;
  userLists?: AudienceRecord[];
  audiences?: AudienceRecord[];
  pagination?: {
    hasMore?: boolean;
    nextCursor?: string | null;
  };
};

interface ProviderOverview {
  connected: boolean;
  accountId: string | null;
}

interface AudienceOverviewResponse {
  success: boolean;
  message?: string;
  providers: {
    googleAds: ProviderOverview & {
      userLists: ReportResult<AudienceCollection>;
      audiences: ReportResult<AudienceCollection>;
    };
    metaAds: ProviderOverview & {
      customAudiences: ReportResult<AudienceCollection>;
      savedAudiences: ReportResult<AudienceCollection>;
    };
  };
  summary?: {
    successfulReports: number;
    failedReports: number;
  };
}

interface AudienceRow {
  id: string;
  name: string;
  provider: ProviderKey;
  kind: string;
  status: string | null;
  size: string;
  description: string;
  details: AudienceRecord;
}

type GoogleAgeRange = "18_24" | "25_34" | "35_44" | "45_54" | "55_64" | "65_PLUS";
type GoogleGender = "MALE" | "FEMALE" | "UNDETERMINED";
type MetaWebsiteEvent = "PageView" | "ViewContent" | "AddToCart" | "Purchase";
type GoogleCreateType = "website" | "reusable";

const surfaceSx = {
  border: "1px solid #E0E3E8",
  borderRadius: 1.5,
  boxShadow: "none",
  backgroundColor: "#FFFFFF",
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asCount(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(numeric)
    : String(value);
}

function sizeRange(lower: unknown, upper: unknown): string {
  if (lower == null && upper == null) return "Not provided";
  if (lower != null && upper != null) return `${asCount(lower)} – ${asCount(upper)}`;
  return asCount(lower ?? upper);
}

function statusColor(
  status: string | null,
): "success" | "warning" | "error" | "default" {
  const value = (status ?? "").toUpperCase();
  if (["OPEN", "READY", "ACTIVE", "NORMAL", "READY_FOR_USE", "ENABLED"].includes(value)) return "success";
  if (["CLOSED", "PAUSED", "IN_PROGRESS", "UPDATING", "POPULATING"].includes(value)) return "warning";
  if (["ERROR", "FAILED", "DELETED", "DISABLED"].includes(value)) return "error";
  return "default";
}

function extractItems(report: ReportResult<AudienceCollection> | undefined): AudienceRecord[] {
  if (!report?.success || !report.data) return [];
  if (Array.isArray(report.data.userLists)) return report.data.userLists;
  if (Array.isArray(report.data.audiences)) return report.data.audiences;
  return [];
}

function getAudienceRows(data: AudienceOverviewResponse | null): AudienceRow[] {
  if (!data?.providers) return [];

  const google = data.providers.googleAds;
  const meta = data.providers.metaAds;
  const rows: AudienceRow[] = [];

  extractItems(google?.userLists).forEach((item) => {
    const id = asString(item.id, asString(item.resourceName, asString(item.name, "google-user-list")));
    rows.push({
      id: `google-user-list-${id}`,
      name: asString(item.name, "Unnamed user list"),
      provider: "googleAds",
      kind: `User list · ${asString(item.type, "Audience segment")}`,
      status: asString(item.membershipStatus, asString(item.accountUserListStatus)) || null,
      size: `Search: ${asCount(item.sizeForSearch)} · Display: ${asCount(item.sizeForDisplay)}`,
      description: "Google Ads audience segment / user list",
      details: item,
    });
  });

  extractItems(google?.audiences).forEach((item) => {
    const id = asString(item.id, asString(item.resourceName, asString(item.name, "google-audience")));
    rows.push({
      id: `google-audience-${id}`,
      name: asString(item.name, "Unnamed audience"),
      provider: "googleAds",
      kind: "Reusable audience",
      status: asString(item.status) || null,
      size: "Not exposed by this resource",
      description: asString(item.description, "Reusable combination of audience segments and dimensions"),
      details: item,
    });
  });

  extractItems(meta?.customAudiences).forEach((item) => {
    const subtype = asString(item.subtype, "CUSTOM").toUpperCase();
    rows.push({
      id: `meta-custom-${asString(item.id, asString(item.name, "audience"))}`,
      name: asString(item.name, "Unnamed custom audience"),
      provider: "metaAds",
      kind: subtype === "LOOKALIKE" ? "Lookalike audience" : `Custom audience · ${subtype}`,
      status: asString(item.operationStatus, asString(item.deliveryStatus)) || null,
      size: sizeRange(item.approximateCountLowerBound, item.approximateCountUpperBound),
      description: asString(item.description, "Meta custom audience"),
      details: item,
    });
  });

  extractItems(meta?.savedAudiences).forEach((item) => {
    rows.push({
      id: `meta-saved-${asString(item.id, asString(item.name, "audience"))}`,
      name: asString(item.name, "Unnamed saved audience"),
      provider: "metaAds",
      kind: "Saved audience",
      status: asString(item.runStatus) || null,
      size: sizeRange(item.approximateCountLowerBound, item.approximateCountUpperBound),
      description: asString(item.description, "Reusable Meta targeting specification"),
      details: item,
    });
  });

  return rows;
}

function providerLabel(provider: ProviderKey): string {
  return provider === "googleAds" ? "Google Ads" : "Meta Ads";
}

function accountLabel(accountId: string | null | undefined): string {
  return accountId || "No account selected";
}

function getReportError(reports: Array<ReportResult<AudienceCollection>>): string | null {
  return reports.find((report) => !report.success && report.error)?.error ?? null;
}

function EmptyState({
  provider,
  connected,
  accountId,
  searching,
  allEmptyReportsSucceeded,
}: {
  provider: ActiveTab;
  connected: boolean;
  accountId: string | null;
  searching: boolean;
  allEmptyReportsSucceeded: boolean;
}) {
  const isMeta = provider === "metaAds";
  const isProviderView = provider !== "all";

  let title = searching ? "No matching audiences" : "Your audience workspace is ready";
  let body = searching
    ? "Try a different audience name or search term."
    : "No audience records match this view yet.";

  if (!searching && isProviderView && !connected) {
    title = `${providerLabel(provider)} is not connected`;
    body = "Connect an advertising account to view its audience data here.";
  } else if (!searching && isMeta && connected && allEmptyReportsSucceeded) {
    title = "No Meta audiences returned";
    body = "AdSyntra successfully checked Custom Audiences and Saved Audiences for this connected ad account. Meta returned zero records for both lists. If you expected audiences here, confirm that this is the correct ad account and that the connected Meta user has access to those audience assets.";
  } else if (!searching && isMeta && connected) {
    title = "No Meta audience records yet";
    body = "There are no Meta audience records to show in the current response.";
  } else if (!searching && provider === "googleAds" && connected) {
    title = "No Google audiences found";
    body = "No Google Ads user lists or reusable audiences were returned for the selected account.";
  }

  return (
    <Box sx={{ px: { xs: 2, sm: 4 }, py: { xs: 5, sm: 7 }, textAlign: "center", maxWidth: 660, mx: "auto" }}>
      <Avatar sx={{ width: 60, height: 60, mx: "auto", mb: 2, bgcolor: isMeta ? "#F0EAFE" : "#EEF2FF", color: isMeta ? "#6554C0" : "#3759C7" }}>
        {isMeta ? <GroupsRounded /> : <StorageRounded />}
      </Avatar>
      <Typography variant="h6" fontWeight={750} color="#182230">{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.1, lineHeight: 1.75 }}>{body}</Typography>
      {isMeta && connected && !searching && allEmptyReportsSucceeded && (
        <Alert severity="info" variant="outlined" sx={{ mt: 2.2, textAlign: "left", borderRadius: 2 }}>
          This list shows saved Custom and Saved Audience assets. Targeting controls such as age, gender, location, and interests are a separate part of audience setup and are not returned by these two list requests.
        </Alert>
      )}
      {isMeta && connected && accountId && !searching && allEmptyReportsSucceeded && (
        <Chip
          size="small"
          label={`Selected account · ${accountId}`}
          sx={{ mt: 2, bgcolor: "#F6F3FF", color: "#5946A8", fontWeight: 650 }}
        />
      )}
    </Box>
  );
}

export default function AudiencesPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [overview, setOverview] = useState<AudienceOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("all");
  const [search, setSearch] = useState("");
  const [selectedAudience, setSelectedAudience] = useState<AudienceRow | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createProvider, setCreateProvider] = useState<ProviderKey>("googleAds");
  const [googleCreateType, setGoogleCreateType] = useState<GoogleCreateType>("website");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [urlContains, setUrlContains] = useState("");
  const [lookbackDays, setLookbackDays] = useState("30");
  const [selectedAgeRanges, setSelectedAgeRanges] = useState<GoogleAgeRange[]>(["25_34", "35_44"]);
  const [selectedGenders, setSelectedGenders] = useState<GoogleGender[]>(["MALE", "FEMALE"]);
  const [includeUndetermined, setIncludeUndetermined] = useState(false);
  const [metaPixelId, setMetaPixelId] = useState("");
  const [metaEvent, setMetaEvent] = useState<MetaWebsiteEvent>("PageView");
  const [metaRetentionDays, setMetaRetentionDays] = useState("30");

  const loadAudiences = useCallback(async (isRefresh = false) => {
    if (!isLoaded || !isSignedIn) return;

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error("Your session has expired. Please sign in again.");

      const result = await authenticatedApiRequest("/api/audiences", token) as AudienceOverviewResponse;
      if (!result?.success || !result.providers) {
        throw new Error(result?.message ?? "The audience report could not be loaded.");
      }

      setOverview(result);
      setLastSynced(new Date());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load audiences.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken, isLoaded, isSignedIn]);

  useEffect(() => {
    void loadAudiences();
  }, [loadAudiences]);

  const resetCreateForm = useCallback(() => {
    setFormName("");
    setFormDescription("");
    setUrlContains("");
    setLookbackDays("30");
    setSelectedAgeRanges(["25_34", "35_44"]);
    setSelectedGenders(["MALE", "FEMALE"]);
    setIncludeUndetermined(false);
    setMetaPixelId("");
    setMetaEvent("PageView");
    setMetaRetentionDays("30");
    setCreateError(null);
  }, []);

  const openCreateDialog = () => {
    const defaultProvider = overview?.providers.googleAds.connected
      ? "googleAds"
      : "metaAds";
    setCreateProvider(defaultProvider);
    setGoogleCreateType("website");
    resetCreateForm();
    setCreateOpen(true);
  };

  const handleCreateAudience = async () => {
    setCreateError(null);
    setNotice(null);

    if (!formName.trim()) {
      setCreateError("Enter an audience name.");
      return;
    }

    setCreating(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session has expired. Please sign in again.");

      let endpoint = "";
      let payload: Record<string, unknown> = {
        name: formName.trim(),
        description: formDescription.trim() || undefined,
      };

      if (createProvider === "googleAds" && googleCreateType === "website") {
        if (!urlContains.trim()) throw new Error("Enter a URL fragment to match, such as /pricing or example.com.");
        endpoint = "/api/audiences/google/user-lists";
        payload = { ...payload, urlContains: urlContains.trim(), lookbackWindowDays: Number(lookbackDays) };
      } else if (createProvider === "googleAds") {
        if (!selectedAgeRanges.length && !selectedGenders.length) {
          throw new Error("Select at least one age range or gender.");
        }
        endpoint = "/api/audiences/google/reusable";
        payload = {
          ...payload,
          ageRanges: selectedAgeRanges,
          genders: selectedGenders,
          includeUndetermined,
        };
      } else {
        if (!/^\d+$/.test(metaPixelId.trim())) throw new Error("Enter a numeric Meta Pixel or Dataset ID.");
        endpoint = "/api/audiences/meta/website-custom";
        payload = {
          ...payload,
          pixelId: metaPixelId.trim(),
          eventName: metaEvent,
          retentionDays: Number(metaRetentionDays),
        };
      }

      const result = await authenticatedApiRequest(endpoint, token, {
        method: "POST",
        body: JSON.stringify(payload),
      }) as { success?: boolean; data?: { name?: string; resourceName?: string; id?: string }; message?: string };

      if (!result?.success) throw new Error(result?.message ?? "Audience creation failed.");

      const createdName = result.data?.name ?? formName.trim();
      setNotice(`${createdName} was created in ${providerLabel(createProvider)}.`);
      setCreateOpen(false);
      resetCreateForm();
      await loadAudiences(true);
    } catch (creationError) {
      setCreateError(creationError instanceof Error ? creationError.message : "Unable to create audience.");
    } finally {
      setCreating(false);
    }
  };

  const toggleAgeRange = (range: GoogleAgeRange) => {
    setSelectedAgeRanges((current) => current.includes(range)
      ? current.filter((item) => item !== range)
      : [...current, range]);
  };

  const toggleGender = (gender: GoogleGender) => {
    setSelectedGenders((current) => current.includes(gender)
      ? current.filter((item) => item !== gender)
      : [...current, gender]);
  };

  const allRows = useMemo(() => getAudienceRows(overview), [overview]);
  const googleReports = overview
    ? [overview.providers.googleAds.userLists, overview.providers.googleAds.audiences]
    : [];
  const metaReports = overview
    ? [overview.providers.metaAds.customAudiences, overview.providers.metaAds.savedAudiences]
    : [];

  const googleError = getReportError(googleReports);
  const metaError = getReportError(metaReports);
  const googleCount = allRows.filter((row) => row.provider === "googleAds").length;
  const metaCount = allRows.filter((row) => row.provider === "metaAds").length;
  const connectedPlatformsCount = Number(Boolean(overview?.providers.googleAds.connected))
    + Number(Boolean(overview?.providers.metaAds.connected));

  const visibleRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return allRows.filter((row) => {
      const matchesProvider = activeTab === "all" || row.provider === activeTab;
      const matchesSearch = !normalizedSearch || [row.name, row.kind, row.description, row.status ?? ""]
        .some((value) => value.toLowerCase().includes(normalizedSearch));
      return matchesProvider && matchesSearch;
    });
  }, [activeTab, allRows, search]);

  const selectedProvider = activeTab === "all" ? null : activeTab;
  const selectedConnected = selectedProvider
    ? Boolean(overview?.providers[selectedProvider].connected)
    : true;
  const selectedAccountId = selectedProvider
    ? overview?.providers[selectedProvider].accountId ?? null
    : null;
  const metaEmptyReportsSucceeded = Boolean(
    overview?.providers.metaAds.customAudiences.success &&
    overview?.providers.metaAds.savedAudiences.success,
  );

  const syncedLabel = lastSynced
    ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(lastSynced)
    : "Not synced yet";

  if (!isLoaded || (isSignedIn && loading)) {
    return (
      <Box sx={{ minHeight: 420, display: "grid", placeItems: "center", bgcolor: "#F6F8FC" }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress size={30} />
          <Typography variant="body2" color="text.secondary">Loading your audiences…</Typography>
        </Stack>
      </Box>
    );
  }

  if (!isSignedIn) {
    return (
      <Box sx={{ maxWidth: 900, mx: "auto", p: { xs: 2, md: 4 } }}>
        <Alert severity="info">Sign in to view audiences from your connected advertising accounts.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "#F7F9FC", px: { xs: 1.5, sm: 2.5, lg: 4 }, py: { xs: 2.5, sm: 3 } }}>
      <Box sx={{ width: "100%", maxWidth: 1480, mx: "auto" }}>
        {/* Page header - aligned with Campaign Management */}
        <Box
          sx={{
            display: "flex",
            width: "100%",
            minWidth: 0,
            flexDirection: { xs: "column", sm: "row" },
            justifyContent: "space-between",
            alignItems: { xs: "stretch", sm: "center" },
            gap: 2,
            mb: 3,
          }}
        >
          <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
            <Typography
              variant="overline"
              sx={{ color: "#3F5BD9", fontWeight: 800, letterSpacing: 1.1, lineHeight: 1.5 }}
            >
              ADSYNTRA · AUDIENCES
            </Typography>
            <Typography
              variant="h4"
              sx={{ mt: 0.35, color: "#111827", fontSize: { xs: 27, sm: 32 }, fontWeight: 500, letterSpacing: -0.8 }}
            >
              Audience Management
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.45, color: "#475569" }}>
              View and create audience segments across your Google Ads and Meta Ads accounts.
            </Typography>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1.1 }}>
              <Typography variant="caption" color="text.secondary">
                Google Ads: {overview?.providers.googleAds.connected ? "Connected" : "Not connected"}
              </Typography>
              <Box sx={{ width: 4, height: 4, borderRadius: "50%", bgcolor: "#A0A8B5" }} />
              <Typography variant="caption" color="text.secondary">
                Meta Ads: {overview?.providers.metaAds.connected ? "Connected" : "Not connected"}
              </Typography>
              <Box sx={{ width: 4, height: 4, borderRadius: "50%", bgcolor: "#A0A8B5" }} />
              <Typography variant="caption" color="text.secondary">Last synced · {syncedLabel}</Typography>
            </Stack>
          </Box>
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: { xs: "flex-start", sm: "flex-end" },
              gap: 1.5,
              flex: "0 0 auto",
              alignSelf: { xs: "flex-start", sm: "center" },
              width: { xs: "100%", sm: "auto" },
            }}
          >
            <Tooltip title="Refresh audiences">
              <span>
                <IconButton
                  onClick={() => void loadAudiences(true)}
                  disabled={refreshing}
                  aria-label="Refresh audiences"
                  sx={{
                    width: 40,
                    height: 40,
                    minWidth: 40,
                    minHeight: 40,
                    maxHeight: 40,
                    flex: "0 0 40px",
                    border: "1px solid #D9DEE7",
                    color: "#526071",
                    bgcolor: "#FFFFFF",
                    borderRadius: 1.5,
                  }}
                >
                  {refreshing ? <CircularProgress size={19} /> : <RefreshRounded fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
            <Button
              onClick={openCreateDialog}
              variant="contained"
              startIcon={<AddRounded />}
              sx={{
                height: 40,
                minHeight: 40,
                maxHeight: 40,
                width: "auto",
                minWidth: 0,
                flex: "0 0 auto",
                alignSelf: "center",
                display: "inline-flex",
                px: 2.4,
                py: 0.75,
                borderRadius: 1.5,
                textTransform: "none",
                fontWeight: 700,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                color: "#FFFFFF",
                bgcolor: "#3F5BD9 !important",
                boxShadow: "none",
                "&:hover": { bgcolor: "#304BC3 !important", boxShadow: "none" },
              }}
            >
              Create audience
            </Button>
          </Box>
        </Box>

        {/* Supported creation scope notice */}
        <Alert
          icon={<InfoOutlined fontSize="inherit" />}
          severity="info"
          sx={{
            mt: 2.5,
            borderRadius: 1.5,
            bgcolor: "#EFF6FF",
            color: "#23466F",
            border: "1px solid #D7E8FC",
            alignItems: "center",
            "& .MuiAlert-icon": { color: "#3678C8", alignItems: "center" },
            "& .MuiAlert-message": { fontSize: 13, lineHeight: 1.65 },
          }}
        >
          You can create the supported audience types from this page: Google website remarketing lists, Google reusable demographic audiences, and Meta website Custom Audiences. Editing, deleting, customer-list uploads, and lookalike creation are not included in this first release.
        </Alert>

        {error && (
          <Alert
            severity="error"
            sx={{ mt: 2, borderRadius: 1.5, alignItems: "center" }}
            action={<Button color="inherit" size="small" onClick={() => void loadAudiences()}>Retry</Button>}
          >
            {error}
          </Alert>
        )}
        {notice && (
          <Alert severity="success" sx={{ mt: 2, borderRadius: 1.5 }} onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}

        {overview && (googleError || metaError) && (
          <Alert severity="warning" sx={{ mt: 2, borderRadius: 1.5 }}>
            Some provider reports could not be loaded. {googleError ? `Google Ads: ${googleError} ` : ""}{metaError ? `Meta Ads: ${metaError}` : ""}
          </Alert>
        )}

        {/* Summary cards */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" }, gap: 2, mt: 2 }}>
          <SummaryCard
            label="Total audiences"
            value={asCount(allRows.length)}
            helper="Records returned by connected accounts"
            icon={<GroupsRounded />}
            iconBg="#EEF2FF"
            iconColor="#5368C9"
            accent="#5368C9"
          />
          <SummaryCard
            label="Google Ads"
            value={asCount(googleCount)}
            helper={accountLabel(overview?.providers.googleAds.accountId)}
            icon={<StorageRounded />}
            iconBg="#EAF2FF"
            iconColor="#3973C9"
            connected={overview?.providers.googleAds.connected ?? false}
            accent="#3973C9"
          />
          <SummaryCard
            label="Meta Ads"
            value={asCount(metaCount)}
            helper={accountLabel(overview?.providers.metaAds.accountId)}
            icon={<GroupsRounded />}
            iconBg="#F1EDFF"
            iconColor="#7158C5"
            connected={overview?.providers.metaAds.connected ?? false}
            accent="#7158C5"
          />
          <SummaryCard
            label="Connected platforms"
            value={`${connectedPlatformsCount}/2`}
            helper="Google Ads and Meta Ads"
            icon={<CheckCircleRounded />}
            iconBg="#EAF8F1"
            iconColor="#16865B"
            accent="#16865B"
          />
        </Box>

        {/* Audience list */}
        <Paper elevation={0} sx={{ ...surfaceSx, mt: 2, overflow: "hidden" }}>
          <Box sx={{ px: { xs: 2, sm: 2.75 }, pt: 1.8, pb: 0 }}>
            <Stack sx={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 780, color: "#182230", letterSpacing: -.35 }}>
                  Audience library
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                  Browse the records returned by each connected provider.
                </Typography>
              </Box>
              <TextField
                size="small"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or type"
                aria-label="Search audiences by name or type"
                sx={{ width: { xs: "100%", md: 310 }, "& .MuiOutlinedInput-root": { bgcolor: "#FFFFFF", borderRadius: 1.2 } }}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><SearchRounded sx={{ color: "#8A94A6", fontSize: 20 }} /></InputAdornment>,
                  endAdornment: search ? (
                    <InputAdornment position="end">
                      <IconButton size="small" aria-label="Clear search" onClick={() => setSearch("")} edge="end"><CloseRounded fontSize="small" /></IconButton>
                    </InputAdornment>
                  ) : undefined,
                }}
              />
            </Stack>
            <Tabs
              value={activeTab}
              onChange={(_event, value: ActiveTab) => setActiveTab(value)}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
              sx={{
                mt: 1.8,
                minHeight: 48,
                "& .MuiTabs-indicator": { height: 3, borderRadius: "3px 3px 0 0", bgcolor: "#3F5BD9" },
                "& .MuiTab-root": { minHeight: 48, px: 2, textTransform: "none", fontWeight: 700, color: "#707B8D", fontSize: 13 },
                "& .Mui-selected": { color: "#3F5BD9 !important" },
              }}
            >
              <Tab value="all" label={<TabLabel label="All audiences" count={allRows.length} />} />
              <Tab value="googleAds" label={<TabLabel label="Google Ads" count={googleCount} />} />
              <Tab value="metaAds" label={<TabLabel label="Meta Ads" count={metaCount} />} />
            </Tabs>
          </Box>
          <Divider sx={{ borderColor: "#EDF0F5" }} />

          {visibleRows.length === 0 ? (
            <EmptyState
              provider={activeTab}
              connected={selectedConnected}
              accountId={selectedAccountId}
              searching={Boolean(search.trim())}
              allEmptyReportsSucceeded={activeTab === "metaAds" && metaEmptyReportsSucceeded}
            />
          ) : isMobile ? (
            <Stack spacing={0} divider={<Divider sx={{ borderColor: "#EEF1F5" }} />}>
              {visibleRows.map((row) => (
                <MobileAudienceCard key={row.id} row={row} onView={() => setSelectedAudience(row)} />
              ))}
            </Stack>
          ) : (
            <TableContainer>
              <Table sx={{ minWidth: 790 }} aria-label="Audience library">
                <TableHead>
                  <TableRow sx={{ bgcolor: "#FAFBFD" }}>
                    <TableCell sx={headCellSx}>AUDIENCE</TableCell>
                    <TableCell sx={headCellSx}>PROVIDER</TableCell>
                    <TableCell sx={headCellSx}>TYPE</TableCell>
                    <TableCell sx={headCellSx}>STATUS</TableCell>
                    <TableCell sx={headCellSx}>ESTIMATED SIZE</TableCell>
                    <TableCell align="right" sx={headCellSx}> </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleRows.map((row) => (
                    <TableRow key={row.id} hover sx={{ "&:last-child td": { borderBottom: 0 }, "& td": { borderColor: "#F0F2F6" } }}>
                      <TableCell sx={{ py: 2.1, minWidth: 240 }}>
                        <Stack spacing={0.4}>
                          <Typography sx={{ fontWeight: 730, color: "#202B3B", fontSize: 13.5 }}>{row.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{row.description}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell><ProviderBadge provider={row.provider} /></TableCell>
                      <TableCell><Typography variant="body2" color="#4B5668">{row.kind}</Typography></TableCell>
                      <TableCell><StatusBadge status={row.status} /></TableCell>
                      <TableCell><Typography variant="body2" sx={{ color: "#4B5668", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{row.size}</Typography></TableCell>
                      <TableCell align="right">
                        <Button
                          onClick={() => setSelectedAudience(row)}
                          size="small"
                          endIcon={<ChevronRightRounded />}
                          sx={{ borderRadius: 1.5, textTransform: "none", fontWeight: 750, color: "#405BC0", px: 1.3 }}
                        >
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {visibleRows.length > 0 && (
            <Box sx={{ px: 2.5, py: 1.4, borderTop: "1px solid #EDF0F5", bgcolor: "#FCFCFE" }}>
              <Typography variant="caption" color="text.secondary">
                Showing {visibleRows.length} of {allRows.length} loaded records · First page only
              </Typography>
            </Box>
          )}
        </Paper>

        {/* Provider diagnostics */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.8, mt: 2 }}>
          <ProviderStatusCard
            provider="googleAds"
            connected={overview?.providers.googleAds.connected ?? false}
            accountId={overview?.providers.googleAds.accountId ?? null}
            error={googleError}
            count={googleCount}
          />
          <ProviderStatusCard
            provider="metaAds"
            connected={overview?.providers.metaAds.connected ?? false}
            accountId={overview?.providers.metaAds.accountId ?? null}
            error={metaError}
            count={metaCount}
            emptyReportsSucceeded={metaEmptyReportsSucceeded}
          />
        </Box>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2.2, px: 0.25 }}>
          <InfoOutlined sx={{ fontSize: 15, color: "#8A95A7" }} />
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            Audience size values are provider-reported estimates. Google Search and Display sizes are shown separately; Meta may return approximate ranges.
          </Typography>
        </Stack>
      </Box>

      <Dialog
        open={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        fullScreen={isMobile}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: isMobile ? 0 : 2 } }}
      >
        <DialogTitle sx={{ px: 3, py: 2.25, borderBottom: "1px solid #EDF0F5" }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
            <Box>
              <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1, fontWeight: 750 }}>NEW AUDIENCE</Typography>
              <Typography variant="h6" fontWeight={800} color="#192536">Create audience</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>Create the audience in the selected ad account.</Typography>
            </Box>
            <IconButton onClick={() => !creating && setCreateOpen(false)} disabled={creating} aria-label="Close create audience dialog"><CloseRounded /></IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ p: { xs: 2, sm: 3 }, bgcolor: "#FAFBFD" }}>
          <Stack spacing={2.2} sx={{ pt: 0.5 }}>
            {!overview?.providers[createProvider].connected && (
              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                Connect and select a {providerLabel(createProvider)} account before creating an audience.
              </Alert>
            )}
            {createError && <Alert severity="error" sx={{ borderRadius: 2 }}>{createError}</Alert>}
            <FormControl fullWidth size="small">
              <InputLabel id="create-audience-provider-label">Advertising platform</InputLabel>
              <Select
                labelId="create-audience-provider-label"
                value={createProvider}
                label="Advertising platform"
                onChange={(event) => {
                  setCreateProvider(event.target.value as ProviderKey);
                  setCreateError(null);
                }}
              >
                <MenuItem value="googleAds">Google Ads</MenuItem>
                <MenuItem value="metaAds">Meta Ads</MenuItem>
              </Select>
            </FormControl>
            {createProvider === "googleAds" ? (
              <FormControl fullWidth size="small">
                <InputLabel id="google-audience-type-label">Audience type</InputLabel>
                <Select
                  labelId="google-audience-type-label"
                  value={googleCreateType}
                  label="Audience type"
                  onChange={(event) => setGoogleCreateType(event.target.value as GoogleCreateType)}
                >
                  <MenuItem value="website">Website remarketing user list</MenuItem>
                  <MenuItem value="reusable">Reusable demographic audience</MenuItem>
                </Select>
              </FormControl>
            ) : (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                This creates a Website Custom Audience from Pixel/Dataset events. Customer-list uploads and lookalike creation are separate workflows and are not included in this first release.
              </Alert>
            )}

            <TextField
              label="Audience name"
              fullWidth
              size="small"
              value={formName}
              onChange={(event) => setFormName(event.target.value)}
              inputProps={{ maxLength: createProvider === "googleAds" ? 255 : 400 }}
              required
            />
            <TextField
              label="Description (optional)"
              fullWidth
              size="small"
              multiline
              minRows={2}
              value={formDescription}
              onChange={(event) => setFormDescription(event.target.value)}
              inputProps={{ maxLength: createProvider === "googleAds" ? 2048 : 400 }}
            />

            {createProvider === "googleAds" && googleCreateType === "website" && (
              <>
                <TextField
                  label="URL contains"
                  fullWidth
                  size="small"
                  value={urlContains}
                  onChange={(event) => setUrlContains(event.target.value)}
                  placeholder="/pricing or example.com/products"
                  helperText="Matches the built-in website URL parameter (url__). Your Google tag must be collecting website visits."
                />
                <TextField
                  label="Lookback window (days)"
                  type="number"
                  fullWidth
                  size="small"
                  value={lookbackDays}
                  onChange={(event) => setLookbackDays(event.target.value)}
                  inputProps={{ min: 1, max: 540 }}
                  helperText="Allowed range: 1–540 days."
                />
                <Alert severity="warning" sx={{ borderRadius: 2 }}>
                  Google website remarketing lists depend on a configured Google tag and matching events. Newly created user lists may not populate immediately. Google Ads API user lists are not supported in test accounts.
                </Alert>
              </>
            )}

            {createProvider === "googleAds" && googleCreateType === "reusable" && (
              <>
                <Box>
                  <Typography variant="subtitle2" fontWeight={750} sx={{ mb: 0.8 }}>Age ranges</Typography>
                  <FormGroup row sx={{ gap: { xs: 0.2, sm: 1 } }}>
                    {([
                      ["18_24", "18–24"], ["25_34", "25–34"], ["35_44", "35–44"],
                      ["45_54", "45–54"], ["55_64", "55–64"], ["65_PLUS", "65+"],
                    ] as Array<[GoogleAgeRange, string]>).map(([value, label]) => (
                      <FormControlLabel
                        key={value}
                        control={<Checkbox size="small" checked={selectedAgeRanges.includes(value)} onChange={() => toggleAgeRange(value)} />}
                        label={<Typography variant="body2">{label}</Typography>}
                        sx={{ mr: 1.2 }}
                      />
                    ))}
                  </FormGroup>
                </Box>
                <Divider sx={{ borderColor: "#E9EDF4" }} />
                <Box>
                  <Typography variant="subtitle2" fontWeight={750} sx={{ mb: 0.8 }}>Gender</Typography>
                  <FormGroup row>
                    {([
                      ["MALE", "Male"], ["FEMALE", "Female"], ["UNDETERMINED", "Undetermined"],
                    ] as Array<[GoogleGender, string]>).map(([value, label]) => (
                      <FormControlLabel
                        key={value}
                        control={<Checkbox size="small" checked={selectedGenders.includes(value)} onChange={() => toggleGender(value)} />}
                        label={<Typography variant="body2">{label}</Typography>}
                        sx={{ mr: 1.2 }}
                      />
                    ))}
                  </FormGroup>
                </Box>
                <FormControlLabel
                  control={<Checkbox size="small" checked={includeUndetermined} onChange={(event) => setIncludeUndetermined(event.target.checked)} />}
                  label={<Typography variant="body2">Include users with undetermined age</Typography>}
                />
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  Google reusable audiences combine demographic dimensions and are intended for supported campaign types such as Performance Max, Demand Gen and App campaigns. Creating the audience does not automatically attach it to a campaign.
                </Alert>
              </>
            )}

            {createProvider === "metaAds" && (
              <>
                <TextField
                  label="Meta Pixel ID"
                  fullWidth
                  size="small"
                  value={metaPixelId}
                  onChange={(event) => setMetaPixelId(event.target.value)}
                  placeholder="Numeric Meta Pixel ID"
                  helperText="Use the Meta Pixel connected to the website events you want to include."
                />
                <FormControl fullWidth size="small">
                  <InputLabel id="meta-audience-event-label">Website event</InputLabel>
                  <Select
                    labelId="meta-audience-event-label"
                    value={metaEvent}
                    label="Website event"
                    onChange={(event) => setMetaEvent(event.target.value as MetaWebsiteEvent)}
                  >
                    <MenuItem value="PageView">All website visitors (PageView)</MenuItem>
                    <MenuItem value="ViewContent">Viewed content</MenuItem>
                    <MenuItem value="AddToCart">Added to cart</MenuItem>
                    <MenuItem value="Purchase">Completed purchase</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  label="Retention (days)"
                  type="number"
                  fullWidth
                  size="small"
                  value={metaRetentionDays}
                  onChange={(event) => setMetaRetentionDays(event.target.value)}
                  inputProps={{ min: 1, max: 180 }}
                  helperText="Allowed range: 1–180 days."
                />
                <Alert severity="warning" sx={{ borderRadius: 2 }}>
                  Before creating Website Custom Audiences, accept Meta's Custom Audience Terms in Ads Manager and confirm that this Pixel/Dataset belongs to or is shared with the selected ad account. Audience population depends on incoming events and may take time.
                </Alert>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: "1px solid #EDF0F5", bgcolor: "#FFFFFF" }}>
          <Button onClick={() => setCreateOpen(false)} disabled={creating} sx={{ textTransform: "none", fontWeight: 700, color: "#687487" }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void handleCreateAudience()}
            disabled={creating || !overview?.providers[createProvider].connected}
            startIcon={creating ? <CircularProgress size={16} color="inherit" /> : <AddRounded />}
            sx={{ borderRadius: 1.5, px: 2.2, textTransform: "none", fontWeight: 750, bgcolor: "#405BC0", boxShadow: "none", "&:hover": { bgcolor: "#334DAA", boxShadow: "none" } }}
          >
            {creating ? "Creating…" : "Create audience"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(selectedAudience)}
        onClose={() => setSelectedAudience(null)}
        fullScreen={isMobile}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { borderRadius: isMobile ? 0 : 2, overflow: "hidden" } }}
      >
        <DialogTitle sx={{ px: 3, py: 2.25, borderBottom: "1px solid #EDF0F5" }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1, fontWeight: 750 }}>AUDIENCE DETAILS</Typography>
              <Typography variant="h6" fontWeight={780} sx={{ color: "#192536", overflowWrap: "anywhere" }}>{selectedAudience?.name}</Typography>
              {selectedAudience && <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}><ProviderBadge provider={selectedAudience.provider} /><Chip size="small" label={selectedAudience.kind} variant="outlined" sx={{ borderColor: "#E4E8EF", color: "#586477" }} />{selectedAudience.status && <StatusBadge status={selectedAudience.status} />}</Stack>}
            </Box>
            <IconButton onClick={() => setSelectedAudience(null)} aria-label="Close details"><CloseRounded /></IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ p: { xs: 2, sm: 3 }, bgcolor: "#FAFBFD" }}>
          {selectedAudience && (
            <Stack spacing={2}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 1.5, borderColor: "#E8ECF3", boxShadow: "none" }}>
                <Typography variant="caption" color="text.secondary" fontWeight={700}>ESTIMATED SIZE</Typography>
                <Typography variant="h5" fontWeight={800} sx={{ mt: 0.5, color: "#1C2B45" }}>{selectedAudience.size}</Typography>
                <Typography variant="caption" color="text.secondary">{selectedAudience.description}</Typography>
              </Paper>
              <Paper variant="outlined" sx={{ borderRadius: 1.5, borderColor: "#E8ECF3", overflow: "hidden", boxShadow: "none" }}>
                <Box sx={{ px: 2, py: 1.4, borderBottom: "1px solid #EDF0F5", bgcolor: "#FFFFFF" }}>
                  <Typography variant="subtitle2" fontWeight={750}>Provider data</Typography>
                </Box>
                <Box component="pre" sx={{ m: 0, p: 2, maxHeight: { xs: "none", sm: 460 }, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12, lineHeight: 1.65, color: "#475569", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                  {JSON.stringify(selectedAudience.details, null, 2)}
                </Box>
              </Paper>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5, borderTop: "1px solid #EDF0F5" }}>
          <Button onClick={() => setSelectedAudience(null)} sx={{ textTransform: "none", fontWeight: 750 }}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

const headCellSx = {
  py: 1.5,
  borderColor: "#EDF0F5",
  color: "#7B8798",
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: 0.8,
  whiteSpace: "nowrap" as const,
};

function SummaryCard({
  label,
  value,
  helper,
  icon,
  iconBg,
  iconColor,
  accent,
  connected,
}: {
  label: string;
  value: string;
  helper: string;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  accent: string;
  connected?: boolean;
}) {
  return (
    <Card elevation={0} sx={{ ...surfaceSx, overflow: "hidden", minWidth: 0 }}>
      <CardContent sx={{ p: 2.1, "&:last-child": { pb: 2.1 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: "#687487" }}>{label}</Typography>
            <Typography variant="h4" sx={{ mt: 1.1, fontSize: 30, fontWeight: 600, letterSpacing: -0.7, lineHeight: 1.1, color: "#172235", fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
          </Box>
          <Avatar variant="rounded" sx={{ width: 38, height: 38, borderRadius: 1.5, bgcolor: iconBg, color: iconColor, border: `1px solid ${accent}22` }}>{icon}</Avatar>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={0.65} sx={{ mt: 1.6, minWidth: 0 }}>
          {connected !== undefined && (
            <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: connected ? "#16A36A" : "#9AA4B2", flex: "0 0 auto" }} />
          )}
          <Typography variant="caption" color="text.secondary" noWrap title={helper}>{helper}</Typography>
          {connected !== undefined && <Chip size="small" label={connected ? "Connected" : "Disconnected"} color={connected ? "success" : "default"} variant="outlined" sx={{ ml: "auto", height: 21, fontSize: 10, fontWeight: 700 }} />}
        </Stack>
      </CardContent>
    </Card>
  );
}

function TabLabel({ label, count }: { label: string; count: number }) {
  return (
    <Stack direction="row" spacing={0.9} alignItems="center">
      <span>{label}</span>
      <Box component="span" sx={{ px: 0.75, py: 0.1, minWidth: 22, borderRadius: 1, bgcolor: "rgba(100,116,139,.10)", color: "#758195", fontSize: 10.5, lineHeight: 1.7, fontWeight: 800, textAlign: "center" }}>
        {count}
      </Box>
    </Stack>
  );
}

function ProviderBadge({ provider }: { provider: ProviderKey }) {
  const isGoogle = provider === "googleAds";
  return (
    <Stack direction="row" spacing={0.8} alignItems="center" sx={{ whiteSpace: "nowrap" }}>
      <Avatar sx={{ width: 23, height: 23, bgcolor: isGoogle ? "#EAF2FF" : "#F0ECFF", color: isGoogle ? "#3973C9" : "#7158C5", fontSize: 11, fontWeight: 850 }}>
        {isGoogle ? "G" : "M"}
      </Avatar>
      <Typography variant="body2" sx={{ fontSize: 12.5, fontWeight: 700, color: "#4C596C" }}>{providerLabel(provider)}</Typography>
    </Stack>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Typography variant="caption" color="text.disabled">Not supplied</Typography>;
  const color = statusColor(status);
  return (
    <Chip
      size="small"
      label={status.replace(/_/g, " ")}
      color={color}
      variant="outlined"
      sx={{ height: 23, textTransform: "capitalize", fontSize: 10.5, fontWeight: 750, borderRadius: 1.5, "& .MuiChip-label": { px: 1 } }}
    />
  );
}

function MobileAudienceCard({ row, onView }: { row: AudienceRow; onView: () => void }) {
  return (
    <Box sx={{ px: 2, py: 2.1 }}>
      <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="flex-start">
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 760, color: "#202B3B", overflowWrap: "anywhere" }}>{row.name}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.45, lineHeight: 1.5 }}>{row.description}</Typography>
        </Box>
        <Tooltip title="View details">
          <IconButton onClick={onView} size="small" aria-label={`View ${row.name} details`} sx={{ flex: "0 0 auto", color: "#405BC0", bgcolor: "#F1F4FF", "&:hover": { bgcolor: "#E6EBFF" } }}>
            <VisibilityRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Stack direction="row" spacing={1.4} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1.4 }}>
        <ProviderBadge provider={row.provider} />
        <Typography variant="caption" color="text.secondary">{row.kind}</Typography>
      </Stack>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.4 }}>
        <Box>
          <Typography variant="caption" color="text.secondary">Estimated size</Typography>
          <Typography variant="body2" fontWeight={700} color="#435066">{row.size}</Typography>
        </Box>
        <StatusBadge status={row.status} />
      </Stack>
    </Box>
  );
}

function ProviderStatusCard({
  provider,
  connected,
  accountId,
  error,
  count,
  emptyReportsSucceeded,
}: {
  provider: ProviderKey;
  connected: boolean;
  accountId: string | null;
  error: string | null;
  count: number;
  emptyReportsSucceeded?: boolean;
}) {
  const isMeta = provider === "metaAds";
  const hasEmptySuccess = isMeta && connected && count === 0 && emptyReportsSucceeded;
  return (
    <Paper elevation={0} sx={{ ...surfaceSx, p: 2.1, minWidth: 0 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Stack direction="row" spacing={1} alignItems="center" minWidth={0}>
          <Avatar sx={{ width: 34, height: 34, bgcolor: isMeta ? "#F0ECFF" : "#EAF2FF", color: isMeta ? "#7158C5" : "#3973C9", fontWeight: 850, fontSize: 13 }}>{isMeta ? "M" : "G"}</Avatar>
          <Box minWidth={0}>
            <Typography variant="subtitle2" fontWeight={780}>{providerLabel(provider)}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>{accountLabel(accountId)}</Typography>
          </Box>
        </Stack>
        <Chip size="small" label={connected ? "Connected" : "Not connected"} color={connected ? "success" : "default"} variant="outlined" sx={{ fontWeight: 700, fontSize: 10.5 }} />
      </Stack>
      <Divider sx={{ my: 1.6, borderColor: "#EEF1F5" }} />
      {error ? (
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <ErrorOutlineRounded sx={{ color: "#D97706", fontSize: 18, mt: 0.1 }} />
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.65 }}>{error}</Typography>
        </Stack>
      ) : hasEmptySuccess ? (
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <CheckCircleRounded sx={{ color: "#16A36A", fontSize: 18, mt: 0.1 }} />
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.65 }}>
            Both audience reports completed successfully. The selected Meta ad account returned zero Custom Audiences and zero Saved Audiences.
          </Typography>
        </Stack>
      ) : (
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <CheckCircleRounded sx={{ color: connected ? "#16A36A" : "#9AA4B2", fontSize: 18, mt: 0.1 }} />
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.65 }}>
            {connected ? `${count} audience record${count === 1 ? "" : "s"} loaded from this account.` : "Connect this provider to load audience data."}
          </Typography>
        </Stack>
      )}
    </Paper>
  );
}
