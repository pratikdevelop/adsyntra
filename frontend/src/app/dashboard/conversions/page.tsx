"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import {
    Alert,
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Stack,
    Switch,
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
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import FacebookRoundedIcon from "@mui/icons-material/FacebookRounded";
import GoogleIcon from "@mui/icons-material/Google";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import LanRoundedIcon from "@mui/icons-material/LanRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SettingsSuggestRoundedIcon from "@mui/icons-material/SettingsSuggestRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import { authenticatedApiRequest } from "@/lib/api";

type ProviderKey = "googleAds" | "metaAds";
type JsonRecord = Record<string, any>;

interface GoogleAction {
    id: string;
    resourceName?: string | null;
    name: string;
    type?: string | null;
    category?: string | null;
    status?: string | null;
    primaryForGoal?: boolean | null;
    countingType?: string | null;
    clickThroughLookbackWindowDays?: number | string | null;
    viewThroughLookbackWindowDays?: number | string | null;
    valueSettings?: JsonRecord | null;
    attributionModel?: string | null;
    tagSnippets?: JsonRecord[];
    metrics?: {
        conversions?: number | string;
        conversionsValue?: number | string;
        allConversions?: number | string;
        allConversionsValue?: number | string;
    };
}

interface MetaPixel {
    id: string;
    name?: string;
    last_fired_time?: string | null;
    creation_time?: string | null;
}

interface MetaCustomConversion {
    id: string;
    name: string;
    description?: string | null;
    custom_event_type?: string | null;
    event_source_id?: string | null;
    event_source_type?: string | null;
    rule?: string | JsonRecord | null;
    first_fired_time?: string | null;
    last_fired_time?: string | null;
    is_archived?: boolean;
    is_unavailable?: boolean;
    default_conversion_value?: number | string | null;
    pixel?: { id?: string; name?: string } | null;
}

interface ConversionsResponse {
    success: boolean;
    range: string;
    providers: {
        googleAds: {
            connected: boolean;
            accountId: string | null;
            accountName?: string | null;
            success: boolean;
            error: string | null;
            data: null | {
                conversionCustomerId: string;
                customer: JsonRecord;
                tracking: JsonRecord;
                actions: GoogleAction[];
                totals: JsonRecord;
                metricsError?: string | null;
            };
        };
        metaAds: {
            connected: boolean;
            accountId: string | null;
            accountName?: string | null;
            success: boolean;
            error: string | null;
            data: null | {
                pixels: MetaPixel[];
                customConversions: MetaCustomConversion[];
                pixelError?: string | null;
                customConversionsError?: string | null;
                pagination?: { pixelsHasMore?: boolean; customConversionsHasMore?: boolean };
                capi: { status: string; message: string };
            };
        };
    };
    summary?: { providersSucceeded: number; providersFailed: number };
}

const GOOGLE_CATEGORIES = [
    "PURCHASE", "ADD_TO_CART", "BEGIN_CHECKOUT", "SIGNUP", "SUBSCRIBE_PAID",
    "CONTACT", "BOOK_APPOINTMENT", "REQUEST_QUOTE", "GET_DIRECTIONS", "OUTBOUND_CLICK",
    "PAGE_VIEW", "ENGAGEMENT", "SUBMIT_LEAD_FORM", "MESSAGE_LEAD", "DEFAULT",
];

const META_EVENT_TYPES = [
    "PURCHASE", "LEAD", "COMPLETE_REGISTRATION", "ADD_TO_CART", "INITIATED_CHECKOUT",
    "ADD_PAYMENT_INFO", "CONTENT_VIEW", "CONTACT", "SEARCH", "SUBSCRIBE", "START_TRIAL", "OTHER",
];

function numberValue(value: unknown): number {
    const valueNumber = Number(value ?? 0);
    return Number.isFinite(valueNumber) ? valueNumber : 0;
}

function formatNumber(value: unknown, digits = 0): string {
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(numberValue(value));
}

function formatCurrency(value: unknown, currency?: string | null): string {
    const amount = numberValue(value);
    if (!currency) return formatNumber(amount, 2);
    try {
        return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
    } catch {
        return `${formatNumber(amount, 2)} ${currency}`;
    }
}

function statusTone(status?: string | null): "success" | "warning" | "error" | "default" {
    const value = (status ?? "").toUpperCase();
    if (["ENABLED", "ACTIVE", "DELIVERING", "CONVERSION_TRACKING_MANAGED_BY_SELF", "CONVERSION_TRACKING_MANAGED_BY_THIS_MANAGER", "CONVERSION_TRACKING_MANAGED_BY_ANOTHER_MANAGER"].includes(value)) return "success";
    if (["HIDDEN", "PENDING", "INACTIVE", "NOT_CONVERSION_TRACKED"].includes(value)) return "warning";
    if (["DISABLED", "REMOVED", "DELETED"].includes(value)) return "error";
    return "default";
}

function readableStatus(value?: string | null): string {
    if (!value) return "Not reported";
    return value.replace(/^CONVERSION_TRACKING_/, "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

function dateText(value?: string | null): string {
    if (!value) return "No timestamp returned";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function actionSnippetText(action: GoogleAction): string {
    return (action.tagSnippets ?? []).map((snippet) => [snippet.globalSiteTag, snippet.eventSnippet]
        .filter((item) => typeof item === "string" && item.trim())
        .join("\n\n")).filter(Boolean).join("\n\n---\n\n");
}

function StatCard({ title, value, description, icon, tone = "blue" }: {
    title: string; value: string; description: string; icon: ReactNode; tone?: "blue" | "violet" | "green" | "amber";
}) {
    const tones = {
        blue: "#2563eb",
        violet: "#7c3aed",
        green: "#10b981",
        amber: "#d97706",
    };
    const accent = tones[tone];
    return (
        <Card
            variant="outlined"
            sx={{
                height: "100%",
                borderRadius: 2,
                transition: "all .15s ease",
                "&:hover": { boxShadow: 2, borderColor: "divider" },
            }}
        >
            <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box
                        sx={{
                            width: 36,
                            height: 36,
                            borderRadius: 1.5,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            bgcolor: accent,
                            color: "white",
                            flexShrink: 0,
                        }}
                    >
                        {icon}
                    </Box>
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>
                        {title}
                    </Typography>
                </Stack>
                <Typography variant="h4" component="p" fontWeight={700} sx={{ mt: 1.5, letterSpacing: "-.02em" }}>
                    {value}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                    {description}
                </Typography>
            </CardContent>
        </Card>
    );
}

function SectionHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
    return (
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }} spacing={1.5} sx={{ mb: 2 }}>
            <Box><Typography variant="h6" fontWeight={700}>{title}</Typography><Typography variant="body2" color="text.secondary">{subtitle}</Typography></Box>
            {action}
        </Stack>
    );
}

function CodePanel({ title, code, onCopy }: { title: string; code: string; onCopy: () => void }) {
    return (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden", bgcolor: "background.default" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider" }}>
                <Typography variant="caption" fontWeight={750}>{title}</Typography>
                <Tooltip title="Copy code" arrow><IconButton size="small" onClick={onCopy}><ContentCopyRoundedIcon fontSize="small" /></IconButton></Tooltip>
            </Stack>
            <Box component="pre" sx={{ m: 0, p: 1.5, maxHeight: 280, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 11.5, lineHeight: 1.6, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{code}</Box>
        </Paper>
    );
}

export default function ConversionsPage() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [overview, setOverview] = useState<ConversionsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [range, setRange] = useState("30d");
    const [providerTab, setProviderTab] = useState<ProviderKey>("googleAds");
    const [creatingGoogle, setCreatingGoogle] = useState(false);
    const [creatingMeta, setCreatingMeta] = useState(false);
    const [googleDialogOpen, setGoogleDialogOpen] = useState(false);
    const [metaDialogOpen, setMetaDialogOpen] = useState(false);
    const [selectedAction, setSelectedAction] = useState<GoogleAction | null>(null);
    const [googleName, setGoogleName] = useState("");
    const [googleCategory, setGoogleCategory] = useState("PURCHASE");
    const [googleCountingType, setGoogleCountingType] = useState("MANY_PER_CLICK");
    const [googleDefaultValue, setGoogleDefaultValue] = useState("0");
    const [metaName, setMetaName] = useState("");
    const [metaPixelId, setMetaPixelId] = useState("");
    const [metaEventType, setMetaEventType] = useState("PURCHASE");
    const [metaDescription, setMetaDescription] = useState("");
    const [metaRule, setMetaRule] = useState('{\n  "and": [\n    { "event": { "eq": "Purchase" } }\n  ]\n}');
    const [metaDefaultValue, setMetaDefaultValue] = useState("0");
    const [mutatingKey, setMutatingKey] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [metaEditTarget, setMetaEditTarget] = useState<MetaCustomConversion | null>(null);
    const [metaEditName, setMetaEditName] = useState("");
    const [metaEditDescription, setMetaEditDescription] = useState("");
    const [metaEditValue, setMetaEditValue] = useState("0");

    const loadData = useCallback(async (isRefresh = false) => {
        if (!isLoaded || !isSignedIn) return;
        isRefresh ? setRefreshing(true) : setLoading(true);
        setError(null);
        try {
            const token = await getToken();
            if (!token) throw new Error("Your session has expired. Please sign in again.");
            const result = await authenticatedApiRequest(`/api/conversions?range=${range}`, token) as ConversionsResponse;
            if (!result?.success) throw new Error("Conversion tracking data could not be loaded.");
            setOverview(result);
            const availablePixels = result.providers.metaAds.data?.pixels ?? [];
            setMetaPixelId((current) => availablePixels.some((pixel) => pixel.id === current)
                ? current
                : availablePixels[0]?.id ?? "");
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Unable to load conversion tracking.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [getToken, isLoaded, isSignedIn, range]);

    useEffect(() => { void loadData(); }, [loadData]);

    const google = overview?.providers.googleAds;
    const meta = overview?.providers.metaAds;
    const googleData = google?.data;
    const metaData = meta?.data;
    const googleActions = googleData?.actions ?? [];
    const pixels = metaData?.pixels ?? [];
    const metaConversions = metaData?.customConversions ?? [];
    const googleTotal = numberValue(googleData?.totals?.conversions);
    const googleTrackingStatus = String(googleData?.tracking?.status ?? "");
    const googleTrackingEnabled = [
        "CONVERSION_TRACKING_MANAGED_BY_SELF",
        "CONVERSION_TRACKING_MANAGED_BY_THIS_MANAGER",
        "CONVERSION_TRACKING_MANAGED_BY_ANOTHER_MANAGER",
    ].includes(googleTrackingStatus);
    const metaRecentlyActive = pixels.filter((pixel) => { const age = pixel.last_fired_time ? Date.now() - new Date(pixel.last_fired_time).getTime() : Number.NaN; return Number.isFinite(age) && age >= 0 && age <= 7 * 24 * 60 * 60 * 1000; }).length;

    const googleCurrency = googleData?.customer?.currencyCode ?? null;

    const copyText = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setNotice("Copied to clipboard.");
        } catch {
            setNotice("Clipboard access is unavailable in this browser.");
        }
    };

    const runGoogleMutation = async (actionId: string, status: "ENABLED" | "HIDDEN") => {
        setMutatingKey(`google:${actionId}`);
        setNotice(null);
        try {
            const token = await getToken();
            if (!token) throw new Error("Your session has expired. Please sign in again.");
            await authenticatedApiRequest(`/api/conversions/google/actions/${encodeURIComponent(actionId)}/status`, token, {
                method: "PATCH", body: JSON.stringify({ status }),
            });
            setNotice(status === "ENABLED" ? "Conversion action enabled." : "Conversion action hidden and no longer accruing conversions.");
            await loadData(true);
        } catch (mutationError) {
            setNotice(mutationError instanceof Error ? mutationError.message : "Unable to update conversion action.");
        } finally {
            setMutatingKey(null);
        }
    };

    const createGoogleAction = async () => {
        if (!googleName.trim()) return;
        setCreatingGoogle(true);
        try {
            const token = await getToken();
            if (!token) throw new Error("Your session has expired. Please sign in again.");
            await authenticatedApiRequest("/api/conversions/google/actions", token, {
                method: "POST",
                body: JSON.stringify({ name: googleName.trim(), category: googleCategory, countingType: googleCountingType, defaultValue: Number(googleDefaultValue) || 0, primaryForGoal: true }),
            });
            setGoogleDialogOpen(false);
            setGoogleName("");
            setNotice("Website conversion action created. Refresh to retrieve its tag snippet.");
            await loadData(true);
        } catch (mutationError) {
            setNotice(mutationError instanceof Error ? mutationError.message : "Unable to create Google conversion action.");
        } finally {
            setCreatingGoogle(false);
        }
    };

    const createMetaConversion = async () => {
        if (!metaName.trim() || !metaPixelId) return;
        let rule: JsonRecord;
        try {
            rule = JSON.parse(metaRule) as JsonRecord;
            if (!rule || typeof rule !== "object" || Array.isArray(rule)) throw new Error("Rule must be a JSON object.");
        } catch (ruleError) {
            setNotice(ruleError instanceof Error ? `Invalid rule JSON: ${ruleError.message}` : "Invalid rule JSON.");
            return;
        }
        setCreatingMeta(true);
        try {
            const token = await getToken();
            if (!token) throw new Error("Your session has expired. Please sign in again.");
            await authenticatedApiRequest("/api/conversions/meta/custom-conversions", token, {
                method: "POST",
                body: JSON.stringify({ name: metaName.trim(), pixelId: metaPixelId, eventType: metaEventType, description: metaDescription.trim(), rule, defaultConversionValue: Number(metaDefaultValue) || 0 }),
            });
            setMetaDialogOpen(false);
            setMetaName("");
            setMetaDescription("");
            setNotice("Meta custom conversion created.");
            await loadData(true);
        } catch (mutationError) {
            setNotice(mutationError instanceof Error ? mutationError.message : "Unable to create Meta custom conversion.");
        } finally {
            setCreatingMeta(false);
        }
    };

    const saveMetaEdit = async () => {
        if (!metaEditTarget) return;
        setMutatingKey(`meta:${metaEditTarget.id}`);
        try {
            const token = await getToken();
            if (!token) throw new Error("Your session has expired. Please sign in again.");
            await authenticatedApiRequest(`/api/conversions/meta/custom-conversions/${encodeURIComponent(metaEditTarget.id)}`, token, {
                method: "PATCH", body: JSON.stringify({ name: metaEditName.trim(), description: metaEditDescription, defaultConversionValue: Number(metaEditValue) || 0 }),
            });
            setMetaEditTarget(null);
            setNotice("Meta custom conversion updated.");
            await loadData(true);
        } catch (mutationError) {
            setNotice(mutationError instanceof Error ? mutationError.message : "Unable to update Meta custom conversion.");
        } finally {
            setMutatingKey(null);
        }
    };

    const deleteMetaConversion = async (item: MetaCustomConversion) => {
        const accepted = window.confirm(`Delete the custom conversion “${item.name}”? This cannot be undone.`);
        if (!accepted) return;
        setMutatingKey(`meta:${item.id}`);
        try {
            const token = await getToken();
            if (!token) throw new Error("Your session has expired. Please sign in again.");
            await authenticatedApiRequest(`/api/conversions/meta/custom-conversions/${encodeURIComponent(item.id)}`, token, { method: "DELETE" });
            setNotice("Meta custom conversion deleted.");
            await loadData(true);
        } catch (mutationError) {
            setNotice(mutationError instanceof Error ? mutationError.message : "Unable to delete Meta custom conversion.");
        } finally {
            setMutatingKey(null);
        }
    };

    const googleSnippet = selectedAction ? actionSnippetText(selectedAction) : "";
    const pixelBaseCode = useMemo(() => {
        if (!metaPixelId) return "Select a Pixel/Dataset to generate its base-code example.";
        return `<!-- Meta Pixel base code: install once in the <head> of every page -->\n<script>\n  !function(f,b,e,v,n,t,s)\n  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?\n  n.callMethod.apply(n,arguments):n.queue.push(arguments)};\n  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';\n  n.queue=[];t=b.createElement(e);t.async=!0;\n  t.src=v;s=b.getElementsByTagName(e)[0];\n  s.parentNode.insertBefore(t,s)}(window, document,'script',\n  'https://connect.facebook.net/en_US/fbevents.js');\n  fbq('init', '${metaPixelId}');\n  fbq('track', 'PageView');\n</script>\n<noscript><img height="1" width="1" style="display:none"\n  src="https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1"\n/></noscript>`;
    }, [metaPixelId]);

    if (!isLoaded || (isSignedIn && loading)) {
        return <Box sx={{ minHeight: 460, display: "grid", placeItems: "center" }}><Stack spacing={1.5} alignItems="center"><CircularProgress /><Typography color="text.secondary">Loading conversion tracking workspace…</Typography></Stack></Box>;
    }

    if (!isSignedIn) {
        return <Box sx={{ p: 3, maxWidth: 1000, mx: "auto" }}><Alert severity="info">Sign in to view conversion tracking for your connected advertising accounts.</Alert></Box>;
    }

    return (
        <Box sx={{ width: "100%", maxWidth: 1700, mx: "auto" }}>
            {/* Page header follows the Campaign Management workspace layout. */}
            <Box
                sx={{
                    display: "flex",
                    flexDirection: { xs: "column", sm: "row" },
                    justifyContent: "space-between",
                    alignItems: { xs: "flex-start", sm: "center" },
                    gap: 2,
                    mb: 3,
                }}
            >
                <Box>
                    <Typography
                        variant="caption"
                        sx={{
                            fontWeight: 600,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: "primary.main",
                        }}
                    >
                        AdSyntra · Tracking
                    </Typography>
                    <Typography
                        variant="h4"
                        component="h1"
                        fontWeight={700}
                        sx={{ mt: 0.5, letterSpacing: "-0.02em" }}
                    >
                        Conversions &amp; Tracking
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        View conversion performance and manage Google Ads and Meta tracking sources.
                    </Typography>
                </Box>

                <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                    <TextField
                        select
                        size="small"
                        value={range}
                        onChange={(event) => setRange(event.target.value)}
                        sx={{ minWidth: 140 }}
                        aria-label="Conversion reporting date range"
                    >
                        <MenuItem value="7d">Last 7 days</MenuItem>
                        <MenuItem value="30d">Last 30 days</MenuItem>
                        <MenuItem value="90d">Last 90 days</MenuItem>
                    </TextField>
                    <Tooltip title="Refresh conversion data">
                        <span>
                            <IconButton
                                onClick={() => void loadData(true)}
                                disabled={refreshing}
                                sx={{ border: 1, borderColor: "divider", bgcolor: "background.paper" }}
                            >
                                {refreshing ? <CircularProgress size={20} /> : <RefreshRoundedIcon />}
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Button
                        variant="contained"
                        size="medium"
                        disableElevation
                        startIcon={<AddRoundedIcon />}
                        onClick={() => providerTab === "googleAds" ? setGoogleDialogOpen(true) : setMetaDialogOpen(true)}
                        disabled={providerTab === "googleAds"
                            ? !google?.connected || !google?.success
                            : !meta?.connected || !meta?.success || pixels.length === 0 || metaConversions.length >= 100}
                        sx={{
                            borderRadius: 2,
                            textTransform: "none",
                            fontWeight: 600,
                            px: 3,
                            py: 1,
                            whiteSpace: "nowrap",
                        }}
                    >
                        {providerTab === "googleAds" ? "New conversion action" : "New custom conversion"}
                    </Button>
                </Stack>
            </Box>
            {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} action={<Button color="inherit" size="small" onClick={() => void loadData()}>Retry</Button>}>{error}</Alert>}
            {notice && <Alert severity={/unable|invalid|error|failed|cannot/i.test(notice) ? "error" : "success"} onClose={() => setNotice(null)} sx={{ mb: 2, borderRadius: 2 }}>{notice}</Alert>}
            {overview && overview.summary?.providersFailed ? <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>Some provider reports could not be loaded. The provider sections below show their individual errors.</Alert> : null}

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))", xl: "repeat(4,minmax(0,1fr))" }, gap: 2, mb: 3 }}>
                <StatCard title="Google conversions" value={google ? formatNumber(googleTotal, 1) : "—"} description={`${range === "7d" ? "7" : range === "90d" ? "90" : "30"} day conversion actions`} icon={<GoogleIcon />} tone="blue" />
                <StatCard title="Google conversion value" value={googleData ? formatCurrency(googleData.totals.conversionsValue, googleCurrency) : "—"} description="Value attributed to conversions" icon={<InsightsRoundedIcon />} tone="green" />
                <StatCard title="Meta Pixels / Datasets" value={meta ? String(pixels.length) : "—"} description={`${metaRecentlyActive} reported activity in the last 7 days`} icon={<FacebookRoundedIcon />} tone="violet" />
                <StatCard title="Meta custom conversions" value={meta ? String(metaConversions.length) : "—"} description="Configured in the selected ad account" icon={<EventAvailableRoundedIcon />} tone="amber" />
            </Box>

            <Card variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
                <Box sx={{ px: { xs: 1, sm: 2 }, borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}>
                    <Tabs value={providerTab} onChange={(_event, value) => setProviderTab(value)} variant="scrollable" scrollButtons="auto">
                        <Tab value="googleAds" icon={<GoogleIcon fontSize="small" />} iconPosition="start" label="Google Ads" />
                        <Tab value="metaAds" icon={<FacebookRoundedIcon fontSize="small" />} iconPosition="start" label="Meta Ads" />
                    </Tabs>
                </Box>

                {providerTab === "googleAds" ? (
                    <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                        <SectionHeading title="Google conversion tracking" subtitle="Conversion account settings, website actions and recent performance" />
                        {!google?.connected ? <Alert severity="info">Select a Google Ads account on the Provider page to view its conversion setup.</Alert> : google.error ? <Alert severity="error">{google.error}</Alert> : googleData ? (
                            <Stack spacing={2.5}>
                                {googleData.metricsError && <Alert severity="warning">Conversion actions loaded, but Google conversion metrics could not be retrieved: {googleData.metricsError}</Alert>}
                                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, bgcolor: "background.paper" }}>
                                    <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={1.5}>
                                        <Box>
                                            <Stack direction="row" spacing={1} alignItems="center"><Typography fontWeight={800}>Account tracking status</Typography><Chip size="small" color={statusTone(googleTrackingStatus)} label={readableStatus(googleTrackingStatus)} /></Stack>
                                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Selected account: {google.accountId} · Conversion account: {googleData.conversionCustomerId}</Typography>
                                        </Box>
                                        <Chip size="small" variant="outlined" label={googleTrackingEnabled ? "Tracking enabled" : "Check account setup"} icon={googleTrackingEnabled ? <CheckCircleRoundedIcon /> : <ErrorOutlineRoundedIcon />} />
                                    </Stack>
                                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3,minmax(0,1fr))" }, gap: 2, mt: 2 }}>
                                        <Box><Typography variant="caption" color="text.secondary">Conversion tracking ID</Typography><Typography variant="body2" fontWeight={700}>{googleData.tracking.conversionTrackingId ?? "Not returned"}</Typography></Box>
                                        <Box><Typography variant="caption" color="text.secondary">Cross-account tracking ID</Typography><Typography variant="body2" fontWeight={700}>{googleData.tracking.crossAccountConversionTrackingId ?? "Not configured"}</Typography></Box>
                                        <Box><Typography variant="caption" color="text.secondary">Customer data terms</Typography><Typography variant="body2" fontWeight={700}>{googleData.tracking.acceptedCustomerDataTerms === true ? "Accepted" : googleData.tracking.acceptedCustomerDataTerms === false ? "Not accepted" : "Not reported"}</Typography></Box>
                                        <Box><Typography variant="caption" color="text.secondary">Enhanced conversions</Typography><Typography variant="body2" fontWeight={700}>{googleData.tracking.effectiveEnablementSetting ?? "Not reported"}</Typography></Box>
                                    </Box>
                                </Paper>

                                <Box>
                                    <SectionHeading title="Conversion actions" subtitle={`${googleActions.length} actions · Performance for ${range === "7d" ? "the last 7 days" : range === "90d" ? "the last 90 days" : "the last 30 days"}`} />
                                    {googleActions.length ? (
                                        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                                            <Table size="medium" sx={{ minWidth: 860 }}>
                                                <TableHead><TableRow><TableCell sx={{ fontWeight: 700 }}>Conversion action</TableCell><TableCell sx={{ fontWeight: 700 }}>Category / type</TableCell><TableCell sx={{ fontWeight: 700 }}>Status</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>Conversions</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>Value</TableCell><TableCell sx={{ fontWeight: 700 }}>Goal</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell></TableRow></TableHead>
                                                <TableBody>
                                                    {googleActions.map((action) => (
                                                        <TableRow hover key={action.id}>
                                                            <TableCell><Typography fontWeight={750}>{action.name}</Typography><Typography variant="caption" color="text.secondary">ID: {action.id}</Typography></TableCell>
                                                            <TableCell><Typography variant="body2">{action.category ?? "—"}</Typography><Typography variant="caption" color="text.secondary">{action.type ?? "—"}</Typography></TableCell>
                                                            <TableCell><Chip size="small" label={readableStatus(action.status)} color={statusTone(action.status)} /></TableCell>
                                                            <TableCell align="right"><Typography fontWeight={700}>{formatNumber(action.metrics?.conversions, 1)}</Typography><Typography variant="caption" color="text.secondary">All: {formatNumber(action.metrics?.allConversions, 1)}</Typography></TableCell>
                                                            <TableCell align="right">{formatCurrency(action.metrics?.conversionsValue, googleCurrency)}</TableCell>
                                                            <TableCell>{action.primaryForGoal ? <Chip size="small" color="success" variant="outlined" label="Primary" /> : <Chip size="small" variant="outlined" label="Secondary" />}</TableCell>
                                                            <TableCell align="right"><Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5}><Tooltip title="View tag snippets and action settings" arrow><IconButton size="small" onClick={() => setSelectedAction(action)}><VisibilityRoundedIcon fontSize="small" /></IconButton></Tooltip><Tooltip title={action.status === "ENABLED" ? "Hide conversion action (stop recording)" : "Enable conversion action"} arrow><span><Switch size="small" checked={action.status === "ENABLED"} disabled={mutatingKey === `google:${action.id}`} onChange={(_event, checked) => void runGoogleMutation(action.id, checked ? "ENABLED" : "HIDDEN")} /></span></Tooltip></Stack></TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    ) : <Alert severity="info">No conversion actions were returned for this conversion account. Create a website conversion action to begin setting up measurement.</Alert>}
                                </Box>

                                <Alert severity="info" variant="outlined">Google website actions require the Google tag on your site and the returned event snippet on the relevant conversion event/page. Creating an action in AdSyntra does not install the tag on your website automatically.</Alert>
                            </Stack>
                        ) : <Alert severity="info">Google conversion data is not available.</Alert>}
                    </CardContent>
                ) : (
                    <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                        <SectionHeading title="Meta event sources & conversions" subtitle="Pixels/Datasets, custom conversion rules and event-source activity" />
                        {!meta?.connected ? <Alert severity="info">Select a Meta Ads account on the Provider page to view its Pixels/Datasets and custom conversions.</Alert> : meta.error ? <Alert severity="error">{meta.error}</Alert> : metaData ? (
                            <Stack spacing={2.5}>
                                {metaData.pixelError && <Alert severity="warning">Pixels/Datasets could not be loaded: {metaData.pixelError}</Alert>}
                                {metaData.customConversionsError && <Alert severity="warning">Custom conversions could not be loaded: {metaData.customConversionsError}</Alert>}
                                {(metaData.pagination?.pixelsHasMore || metaData.pagination?.customConversionsHasMore) && <Alert severity="info">This view currently shows the first page of Meta event sources and custom conversions. Pagination controls are not included yet.</Alert>}
                                <Box>
                                    <SectionHeading title="Pixels & Datasets" subtitle={`${pixels.length} event source(s) linked to ${meta.accountId} · last-fired activity timestamps reported by Meta`} />
                                    {pixels.length ? (
                                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2,minmax(0,1fr))" }, gap: 1.5 }}>
                                            {pixels.map((pixel) => (
                                                <Card variant="outlined" key={pixel.id} sx={{ borderRadius: 2 }}>
                                                    <CardContent sx={{ p: 2.25 }}>
                                                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                                                            <Box sx={{ minWidth: 0 }}><Typography fontWeight={800} sx={{ overflowWrap: "anywhere" }}>{pixel.name ?? "Untitled Pixel / Dataset"}</Typography><Typography variant="caption" color="text.secondary">ID: {pixel.id}</Typography></Box>
                                                            <Chip size="small" variant="outlined" label={pixel.last_fired_time ? "Activity timestamp available" : "No activity timestamp"} color={pixel.last_fired_time ? "success" : "default"} />
                                                        </Stack>
                                                        <Divider sx={{ my: 1.5 }} />
                                                        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
                                                            <Box><Typography variant="caption" color="text.secondary">Last fired</Typography><Typography variant="body2" fontWeight={650}>{dateText(pixel.last_fired_time)}</Typography></Box>
                                                            <Box><Typography variant="caption" color="text.secondary">Created</Typography><Typography variant="body2" fontWeight={650}>{dateText(pixel.creation_time)}</Typography></Box>
                                                        </Box>
                                                        <Divider sx={{ my: 1.5 }} />
                                                        <Alert severity="info" variant="outlined" sx={{ mt: 1.5 }}>
                                                            Meta reports the Pixel/Dataset last-fired timestamp here. This is not a per-event log and does not identify whether individual events arrived from the browser or Conversions API. Use Meta Events Manager for Test Events, diagnostics and event-source details.
                                                        </Alert>
                                                        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1.5 }}><Button size="small" onClick={() => { setMetaPixelId(pixel.id); setNotice(`Selected ${pixel.name ?? "Pixel/Dataset"} for setup instructions.`); }} sx={{ textTransform: "none" }}>Use for setup</Button></Stack>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </Box>
                                    ) : <Alert severity="info">No Pixels/Datasets were returned for this selected Meta ad account. Check the business and ad-account asset permissions in Meta.</Alert>}
                                </Box>

                                <Box>
                                    <SectionHeading title="Custom conversions" subtitle={`${metaConversions.length} rules configured in the selected ad account`} />
                                    {metaConversions.length >= 100 && <Alert severity="warning" sx={{ mb: 1.5 }}>Meta's documented custom-conversion limit is 100 per ad account. AdSyntra has disabled creation for this account.</Alert>}
                                    {metaConversions.length ? (
                                        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                                            <Table size="medium" sx={{ minWidth: 760 }}>
                                                <TableHead><TableRow><TableCell sx={{ fontWeight: 700 }}>Name</TableCell><TableCell sx={{ fontWeight: 700 }}>Event</TableCell><TableCell sx={{ fontWeight: 700 }}>Event source</TableCell><TableCell sx={{ fontWeight: 700 }}>Last fired</TableCell><TableCell sx={{ fontWeight: 700 }}>Status</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell></TableRow></TableHead>
                                                <TableBody>{metaConversions.map((item) => {
                                                    const blocked = item.is_unavailable === true;
                                                    const archived = item.is_archived === true;
                                                    return <TableRow hover key={item.id}>
                                                        <TableCell><Typography fontWeight={750}>{item.name}</Typography><Typography variant="caption" color="text.secondary">ID: {item.id}</Typography></TableCell>
                                                        <TableCell>{item.custom_event_type ?? "—"}</TableCell>
                                                        <TableCell><Typography variant="body2">{item.pixel?.name ?? item.event_source_id ?? "—"}</Typography><Typography variant="caption" color="text.secondary">{item.event_source_type ?? "Pixel"}</Typography></TableCell>
                                                        <TableCell>{dateText(item.last_fired_time)}</TableCell>
                                                        <TableCell><Chip size="small" label={blocked ? "Unavailable" : archived ? "Archived" : "Configured"} color={blocked ? "error" : archived ? "warning" : "success"} /></TableCell>
                                                        <TableCell align="right"><Stack direction="row" justifyContent="flex-end" spacing={0.5}><Tooltip title={blocked ? "Meta marked this conversion unavailable; changes are blocked" : "Edit custom conversion"} arrow><span><IconButton size="small" disabled={blocked || mutatingKey === `meta:${item.id}`} onClick={() => { setMetaEditTarget(item); setMetaEditName(item.name); setMetaEditDescription(item.description ?? ""); setMetaEditValue(String(item.default_conversion_value ?? 0)); }}><SettingsSuggestRoundedIcon fontSize="small" /></IconButton></span></Tooltip><Tooltip title={blocked ? "Meta marked this conversion unavailable" : "Delete custom conversion"} arrow><span><IconButton size="small" color="error" disabled={blocked || mutatingKey === `meta:${item.id}`} onClick={() => void deleteMetaConversion(item)}><ErrorOutlineRoundedIcon fontSize="small" /></IconButton></span></Tooltip></Stack></TableCell>
                                                    </TableRow>;
                                                })}</TableBody>
                                            </Table>
                                        </TableContainer>
                                    ) : <Alert severity="info">No Meta custom conversions were returned. You can create a rule against one of the Pixels/Datasets above.</Alert>}
                                </Box>

                                <Box>
                                    <SectionHeading title="Website Pixel setup" subtitle="Copy the base-code example for the selected Pixel/Dataset" />
                                    <TextField select fullWidth size="small" label="Pixel / Dataset" value={metaPixelId} onChange={(event) => setMetaPixelId(event.target.value)} sx={{ mb: 1.5 }}>
                                        {pixels.map((pixel) => <MenuItem key={pixel.id} value={pixel.id}>{pixel.name ?? pixel.id} · {pixel.id}</MenuItem>)}
                                    </TextField>
                                    <CodePanel title="Meta Pixel base code example" code={pixelBaseCode} onCopy={() => void copyText(pixelBaseCode)} />
                                    <Alert severity="info" sx={{ mt: 1.5 }}>Install and validate Pixel code in Meta Events Manager. This generated example does not verify that the code is installed on your website or that every standard event is firing.</Alert>
                                </Box>

                                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, bgcolor: "background.paper" }}>
                                    <Stack direction="row" spacing={1.25} alignItems="flex-start">
                                        <LanRoundedIcon color="primary" sx={{ mt: 0.2 }} />
                                        <Box>
                                            <Typography fontWeight={800}>Conversions API (server-side tracking)</Typography>
                                            <Chip size="small" label="Not configured in AdSyntra" color="warning" sx={{ mt: 0.75, mb: 1 }} />
                                            <Typography variant="body2" color="text.secondary">{metaData.capi?.message ?? "CAPI credentials and server-event ingestion are not configured."}</Typography>
                                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>A production CAPI integration needs per-customer credential storage, consent-aware event mapping, SHA-256 normalization for eligible user identifiers, event_id deduplication with browser Pixel events, and test-event diagnostics. AdSyntra does not send test or production events from this page yet.</Typography>
                                        </Box>
                                    </Stack>
                                </Paper>
                            </Stack>
                        ) : <Alert severity="info">Meta tracking data is not available.</Alert>}
                    </CardContent>
                )}
            </Card>

            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, bgcolor: "background.paper" }}>
                <Typography variant="subtitle2" fontWeight={800}>Measurement notes</Typography>
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5, lineHeight: 1.7 }}>
                    Google conversion counts come from conversion-action reporting for the selected date range. Meta Pixel last-fired timestamps describe event-source activity reported by Meta; they are not a full event log or a guarantee of attribution. Google and Meta use different attribution models and conversion definitions, so their totals should not be added as if they were identical.
                </Typography>
            </Paper>

            <Dialog open={googleDialogOpen} onClose={() => !creatingGoogle && setGoogleDialogOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>Create Google website conversion</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <Alert severity="info">This creates a WEBPAGE conversion action in the selected Google conversion account. You must install the returned Google tag/event snippet on your website separately.</Alert>
                        <TextField label="Conversion action name" value={googleName} onChange={(event) => setGoogleName(event.target.value)} required fullWidth />
                        <TextField select label="Category" value={googleCategory} onChange={(event) => setGoogleCategory(event.target.value)} fullWidth>{GOOGLE_CATEGORIES.map((item) => <MenuItem key={item} value={item}>{item.replace(/_/g, " ")}</MenuItem>)}</TextField>
                        <TextField select label="Counting method" value={googleCountingType} onChange={(event) => setGoogleCountingType(event.target.value)} fullWidth><MenuItem value="MANY_PER_CLICK">Every conversion</MenuItem><MenuItem value="ONE_PER_CLICK">One conversion</MenuItem></TextField>
                        <TextField label="Default conversion value" type="number" value={googleDefaultValue} onChange={(event) => setGoogleDefaultValue(event.target.value)} inputProps={{ min: 0, step: "0.01" }} InputProps={{ startAdornment: googleCurrency ? <InputAdornment position="start">{googleCurrency}</InputAdornment> : undefined }} fullWidth />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}><Button onClick={() => setGoogleDialogOpen(false)} disabled={creatingGoogle}>Cancel</Button><Button onClick={() => void createGoogleAction()} disabled={creatingGoogle || !googleName.trim()} variant="contained" disableElevation>{creatingGoogle ? <CircularProgress size={18} color="inherit" /> : "Create action"}</Button></DialogActions>
            </Dialog>

            <Dialog open={metaDialogOpen} onClose={() => !creatingMeta && setMetaDialogOpen(false)} fullWidth maxWidth="md">
                <DialogTitle>Create Meta custom conversion</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <Alert severity="info">A custom conversion is a rule over events already received by a Pixel/Dataset. Creating the rule does not install the Pixel or make it send the event.</Alert>
                        <TextField label="Custom conversion name" value={metaName} onChange={(event) => setMetaName(event.target.value)} required fullWidth />
                        <TextField select label="Pixel / Dataset" value={metaPixelId} onChange={(event) => setMetaPixelId(event.target.value)} fullWidth>{pixels.map((pixel) => <MenuItem key={pixel.id} value={pixel.id}>{pixel.name ?? pixel.id} · {pixel.id}</MenuItem>)}</TextField>
                        <TextField select label="Event category" value={metaEventType} onChange={(event) => setMetaEventType(event.target.value)} fullWidth>{META_EVENT_TYPES.map((item) => <MenuItem key={item} value={item}>{item.replace(/_/g, " ")}</MenuItem>)}</TextField>
                        <TextField label="Description (optional)" value={metaDescription} onChange={(event) => setMetaDescription(event.target.value)} fullWidth multiline minRows={2} />
                        <TextField label="Rule JSON" value={metaRule} onChange={(event) => setMetaRule(event.target.value)} fullWidth multiline minRows={5} helperText={'Example: {"and":[{"event":{"eq":"Purchase"}}]}'} InputProps={{ sx: { fontFamily: "monospace", fontSize: 13 } }} />
                        <TextField label="Default conversion value" type="number" value={metaDefaultValue} onChange={(event) => setMetaDefaultValue(event.target.value)} inputProps={{ min: 0, step: "0.01" }} fullWidth />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}><Button onClick={() => setMetaDialogOpen(false)} disabled={creatingMeta}>Cancel</Button><Button onClick={() => void createMetaConversion()} disabled={creatingMeta || !metaName.trim() || !metaPixelId} variant="contained" disableElevation>{creatingMeta ? <CircularProgress size={18} color="inherit" /> : "Create custom conversion"}</Button></DialogActions>
            </Dialog>

            <Dialog open={Boolean(selectedAction)} onClose={() => setSelectedAction(null)} fullWidth maxWidth="md">
                <DialogTitle>{selectedAction?.name ?? "Conversion action"}</DialogTitle>
                <DialogContent dividers>
                    {selectedAction && <Stack spacing={2}>
                        <Stack direction="row" spacing={1} flexWrap="wrap"><Chip size="small" label={selectedAction.category ?? "Unknown category"} /><Chip size="small" label={selectedAction.type ?? "Unknown type"} /><Chip size="small" label={readableStatus(selectedAction.status)} color={statusTone(selectedAction.status)} /></Stack>
                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(3,minmax(0,1fr))" }, gap: 2 }}>
                            <Box><Typography variant="caption" color="text.secondary">Conversion ID</Typography><Typography variant="body2" fontWeight={700}>{selectedAction.id}</Typography></Box>
                            <Box><Typography variant="caption" color="text.secondary">Counting type</Typography><Typography variant="body2" fontWeight={700}>{selectedAction.countingType ?? "—"}</Typography></Box>
                            <Box><Typography variant="caption" color="text.secondary">Primary for goal</Typography><Typography variant="body2" fontWeight={700}>{selectedAction.primaryForGoal ? "Yes" : "No"}</Typography></Box>
                            <Box><Typography variant="caption" color="text.secondary">Click-through window</Typography><Typography variant="body2" fontWeight={700}>{selectedAction.clickThroughLookbackWindowDays ?? "—"} days</Typography></Box>
                            <Box><Typography variant="caption" color="text.secondary">View-through window</Typography><Typography variant="body2" fontWeight={700}>{selectedAction.viewThroughLookbackWindowDays ?? "—"} days</Typography></Box>
                            <Box><Typography variant="caption" color="text.secondary">Attribution model</Typography><Typography variant="body2" fontWeight={700}>{selectedAction.attributionModel ?? "—"}</Typography></Box>
                        </Box>
                        {selectedAction.tagSnippets?.length ? selectedAction.tagSnippets.map((snippet, index) => (
                            <Box key={index}>
                                {typeof snippet.globalSiteTag === "string" && <CodePanel title="Google global site tag" code={snippet.globalSiteTag} onCopy={() => void copyText(String(snippet.globalSiteTag))} />}
                                {typeof snippet.eventSnippet === "string" && <Box sx={{ mt: 1.5 }}><CodePanel title="Conversion event snippet" code={snippet.eventSnippet} onCopy={() => void copyText(String(snippet.eventSnippet))} /></Box>}
                            </Box>
                        )) : <Alert severity="info">No tag snippets were included in Google's response for this action type.</Alert>}
                        <Accordion disableGutters elevation={0}><AccordionSummary><Typography variant="body2" fontWeight={700}>Full provider response</Typography></AccordionSummary><AccordionDetails><Paper variant="outlined" sx={{ p: 1.5, maxHeight: 300, overflow: "auto" }}><Box component="pre" sx={{ m: 0, fontSize: 11.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(selectedAction, null, 2)}</Box></Paper></AccordionDetails></Accordion>
                    </Stack>}
                </DialogContent>
                <DialogActions><Button onClick={() => setSelectedAction(null)}>Close</Button>{selectedAction && googleSnippet && <Button color="primary" variant="contained" onClick={() => void copyText(googleSnippet)} startIcon={<ContentCopyRoundedIcon />}>Copy all snippets</Button>}</DialogActions>
            </Dialog>

            <Dialog open={Boolean(metaEditTarget)} onClose={() => !mutatingKey && setMetaEditTarget(null)} fullWidth maxWidth="sm">
                <DialogTitle>Edit Meta custom conversion</DialogTitle>
                <DialogContent dividers><Stack spacing={2} sx={{ pt: 0.5 }}>
                    <TextField label="Name" value={metaEditName} onChange={(event) => setMetaEditName(event.target.value)} fullWidth />
                    <TextField label="Description" value={metaEditDescription} onChange={(event) => setMetaEditDescription(event.target.value)} fullWidth multiline minRows={2} />
                    <TextField label="Default conversion value" type="number" value={metaEditValue} onChange={(event) => setMetaEditValue(event.target.value)} inputProps={{ min: 0, step: "0.01" }} fullWidth />
                    <Alert severity="info">The event source and rule are retained. Edit these in Meta Events Manager if they need to change.</Alert>
                </Stack></DialogContent>
                <DialogActions sx={{ p: 2 }}><Button onClick={() => setMetaEditTarget(null)} disabled={Boolean(mutatingKey)}>Cancel</Button><Button onClick={() => void saveMetaEdit()} disabled={!metaEditName.trim() || Boolean(mutatingKey)} variant="contained" disableElevation>{mutatingKey ? <CircularProgress size={18} color="inherit" /> : "Save changes"}</Button></DialogActions>
            </Dialog>
        </Box>
    );
}
