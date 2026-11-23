"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  MenuItem,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import GeneralSettingsIcon from "@mui/icons-material/TuneRounded";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import DashboardCustomizeRoundedIcon from "@mui/icons-material/DashboardCustomizeRounded";
import PrivacyTipOutlinedIcon from "@mui/icons-material/PrivacyTipOutlined";
import CableOutlinedIcon from "@mui/icons-material/CableOutlined";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import { authenticatedApiRequest } from "@/lib/api";

type SectionKey = "general" | "notifications" | "workspace" | "privacy";
type UserSettings = {
  appearance: { theme: "system" | "light" | "dark" };
  localization: {
    timezone: string;
    locale: string;
    dateFormat: "locale" | "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  };
  dashboard: {
    defaultDateRange: "7d" | "30d" | "90d";
    defaultProvider: "googleAds" | "metaAds" | "lastUsed";
    defaultLandingPage: "overview" | "campaigns";
  };
};

type ApiResponse = { success: boolean; message?: string; settings: UserSettings };
type ToastState = { open: boolean; message: string; severity: "success" | "error" | "info" };

const DEFAULT_SETTINGS: UserSettings = {
  appearance: { theme: "system" },
  localization: { timezone: "UTC", locale: "en", dateFormat: "locale" },
  dashboard: { defaultDateRange: "30d", defaultProvider: "lastUsed", defaultLandingPage: "overview" },
};

const SECTIONS: Array<{ key: SectionKey; label: string; description: string; icon: typeof GeneralSettingsIcon }> = [
  { key: "general", label: "General", description: "Appearance & regional preferences", icon: GeneralSettingsIcon },
  { key: "workspace", label: "Workspace", description: "Dashboard defaults", icon: DashboardCustomizeRoundedIcon },
  { key: "notifications", label: "Notifications", description: "Alerts and product updates", icon: NotificationsNoneRoundedIcon },
  { key: "privacy", label: "Data & privacy", description: "Your information and account data", icon: PrivacyTipOutlinedIcon },
];

function SettingsCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card variant="outlined" className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" sx={{ borderRadius: 3, borderColor: "divider", boxShadow: "0 4px 18px rgba(15,23,42,.035)" }}>
      <CardContent sx={{ p: { xs: 2.25, sm: 3 }, "&:last-child": { pb: { xs: 2.25, sm: 3 } } }}>
        <Typography variant="h6" fontWeight={800} className="text-slate-900 dark:text-slate-100">{title}</Typography>
        {description && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5, lineHeight: 1.65 }}>{description}</Typography>}
        {children}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [activeSection, setActiveSection] = useState<SectionKey>("general");
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState<"general" | "workspace" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>({ open: false, message: "", severity: "success" });

  const showToast = useCallback((message: string, severity: ToastState["severity"] = "success") => {
    setToast({ open: true, message, severity });
  }, []);

  const loadSettings = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;
    setLoading(true);
    setLoadError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session has expired. Please sign in again.");
      const response = await authenticatedApiRequest("/api/user-settings", token) as ApiResponse;
      if (!response?.success || !response.settings) throw new Error("The settings service returned an invalid response.");
      setSettings(response.settings);
      setSavedSettings(response.settings);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load your settings.";
      setLoadError(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [getToken, isLoaded, isSignedIn, showToast]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  // Keep the selected appearance preference in sync immediately; the dashboard
  // layout also restores it on a fresh application load.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const applyTheme = () => {
      const resolved = settings.appearance.theme === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : settings.appearance.theme;
      root.dataset.theme = resolved;
    };
    applyTheme();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    if (settings.appearance.theme !== "system") return;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [settings.appearance.theme]);

  const sectionDirty = useMemo(() => ({
    general: JSON.stringify({ appearance: settings.appearance, localization: settings.localization }) !== JSON.stringify({ appearance: savedSettings.appearance, localization: savedSettings.localization }),
    workspace: JSON.stringify(settings.dashboard) !== JSON.stringify(savedSettings.dashboard),
  }), [settings, savedSettings]);

  const saveSection = async (section: "general" | "workspace") => {
    setSavingSection(section);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session has expired. Please sign in again.");
      const payload = section === "general"
        ? { appearance: settings.appearance, localization: settings.localization }
        : { dashboard: settings.dashboard };
      const response = await authenticatedApiRequest("/api/user-settings", token, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }) as ApiResponse;
      if (!response?.success || !response.settings) throw new Error(response?.message || "Your settings could not be saved.");
      setSettings(response.settings);
      setSavedSettings(response.settings);
      if (section === "general" && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("adsyntra:theme-preference", {
          detail: { theme: response.settings.appearance.theme },
        }));
      }
      showToast(response.message || "Settings saved successfully.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save settings.", "error");
    } finally {
      setSavingSection(null);
    }
  };

  const updateAppearance = (theme: UserSettings["appearance"]["theme"]) => {
    setSettings((current) => ({ ...current, appearance: { ...current.appearance, theme } }));
  };
  const updateLocalization = <K extends keyof UserSettings["localization"]>(key: K, value: UserSettings["localization"][K]) => {
    setSettings((current) => ({ ...current, localization: { ...current.localization, [key]: value } }));
  };
  const updateDashboard = <K extends keyof UserSettings["dashboard"]>(key: K, value: UserSettings["dashboard"][K]) => {
    setSettings((current) => ({ ...current, dashboard: { ...current.dashboard, [key]: value } }));
  };

  const discardSection = (section: "general" | "workspace") => {
    if (section === "general") {
      setSettings((current) => ({
        ...current,
        appearance: savedSettings.appearance,
        localization: savedSettings.localization,
      }));
      return;
    }
    setSettings((current) => ({ ...current, dashboard: savedSettings.dashboard }));
  };

  const currentSection = SECTIONS.find((section) => section.key === activeSection) ?? SECTIONS[0]!;
  const SectionIcon = currentSection.icon;

  if (!isLoaded || (isSignedIn && loading)) {
    return <Box className="flex min-h-[420px] items-center justify-center gap-3 text-slate-500"><CircularProgress size={22} /><Typography variant="body2">Loading your settings…</Typography></Box>;
  }

  if (!isSignedIn) {
    return <Card variant="outlined" sx={{ maxWidth: 900, mx: "auto", borderRadius: 3 }}><CardContent><Alert severity="info">Sign in to manage your AdSyntra preferences.</Alert></CardContent></Card>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">AdSyntra · Account</p>
          <Typography component="h1" variant="h4" fontWeight={850} letterSpacing="-.035em" className="dark:!text-slate-100" sx={{ mt: 0.5, color: "#0f172a" }}>Settings</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 680, lineHeight: 1.7 }}>
            Control how AdSyntra looks, how your workspace opens, and how you manage your account.
          </Typography>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button component={Link} href="/dashboard/profile" variant="outlined" sx={{ borderRadius: 2.5, textTransform: "none", fontWeight: 700 }}>My profile</Button>
          <Chip icon={<CheckCircleRoundedIcon />} label="Preferences are private to your account" color="success" variant="outlined" sx={{ borderRadius: 2 }} />
        </div>
      </header>

      {loadError && <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void loadSettings()}>Retry</Button>}>{loadError}</Alert>}

      <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <Card variant="outlined" className="rounded-2xl border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900" sx={{ borderRadius: 3 }}>
            <div className="hidden space-y-1 lg:block">
              {SECTIONS.map((section) => {
                const Icon = section.icon;
                const active = activeSection === section.key;
                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => setActiveSection(section.key)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${active ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                  >
                    <Icon sx={{ fontSize: 20 }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{section.label}</span>
                      <span className={`mt-0.5 block text-[11px] ${active ? "text-indigo-600/80 dark:text-indigo-300/80" : "text-slate-400"}`}>{section.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="lg:hidden">
              <TextField select fullWidth size="small" label="Settings section" value={activeSection} onChange={(event) => setActiveSection(event.target.value as SectionKey)}>
                {SECTIONS.map((section) => <MenuItem key={section.key} value={section.key}>{section.label}</MenuItem>)}
              </TextField>
            </div>
          </Card>

          <Card variant="outlined" className="rounded-2xl border-slate-200 bg-gradient-to-br from-indigo-50 to-blue-50 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-900" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2.25 }}>
              <div className="flex items-center gap-2">
                <Avatar sx={{ width: 30, height: 30, bgcolor: "#e0e7ff", color: "#4338ca" }}><CableOutlinedIcon sx={{ fontSize: 17 }} /></Avatar>
                <Typography variant="subtitle2" fontWeight={800}>Connected services</Typography>
              </div>
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1, lineHeight: 1.6 }}>Manage advertising account connections and subscription details in their dedicated workspaces.</Typography>
              <Button component={Link} href="/dashboard/provider" fullWidth variant="outlined" size="small" sx={{ mt: 1.5, justifyContent: "space-between", textTransform: "none", borderRadius: 2 }}>Provider settings <CableOutlinedIcon sx={{ fontSize: 16 }} /></Button>
              <Button component={Link} href="/dashboard/billing" fullWidth variant="outlined" size="small" sx={{ mt: 1, justifyContent: "space-between", textTransform: "none", borderRadius: 2 }}>Billing & plan <CreditCardOutlinedIcon sx={{ fontSize: 16 }} /></Button>
            </CardContent>
          </Card>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><SectionIcon /></div>
            <div>
              <Typography variant="h5" fontWeight={850} letterSpacing="-.025em">{currentSection.label}</Typography>
              <Typography variant="body2" color="text.secondary">{currentSection.description}</Typography>
            </div>
          </div>

          {activeSection === "general" && (
            <>
              <SettingsCard title="Appearance" description="Choose how AdSyntra is displayed across your workspace.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField select fullWidth label="Theme" size="small" value={settings.appearance.theme} onChange={(event) => updateAppearance(event.target.value as UserSettings["appearance"]["theme"])}>
                    <MenuItem value="system">Use system preference</MenuItem>
                    <MenuItem value="light">Light</MenuItem>
                    <MenuItem value="dark">Dark</MenuItem>
                  </TextField>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>CURRENT PREVIEW</Typography>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`h-7 w-7 rounded-lg border ${settings.appearance.theme === "dark" ? "border-slate-600 bg-slate-900" : "border-slate-200 bg-white"}`} />
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{settings.appearance.theme === "system" ? "Follows your device" : `${settings.appearance.theme[0]!.toUpperCase()}${settings.appearance.theme.slice(1)} appearance`}</span>
                    </div>
                  </div>
                </div>
              </SettingsCard>

              <SettingsCard title="Regional preferences" description="These values control date and time formatting in preference-aware AdSyntra screens.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField fullWidth size="small" label="Timezone" value={settings.localization.timezone} onChange={(event) => updateLocalization("timezone", event.target.value)} helperText="Use an IANA name, for example Asia/Kolkata." />
                  <TextField fullWidth size="small" label="Locale" value={settings.localization.locale} onChange={(event) => updateLocalization("locale", event.target.value)} helperText="For example en-IN, en-US or en-GB." />
                  <TextField select fullWidth size="small" label="Date format" value={settings.localization.dateFormat} onChange={(event) => updateLocalization("dateFormat", event.target.value as UserSettings["localization"]["dateFormat"])}>
                    <MenuItem value="locale">Use locale default</MenuItem>
                    <MenuItem value="DD/MM/YYYY">DD/MM/YYYY</MenuItem>
                    <MenuItem value="MM/DD/YYYY">MM/DD/YYYY</MenuItem>
                    <MenuItem value="YYYY-MM-DD">YYYY-MM-DD</MenuItem>
                  </TextField>
                </div>
              </SettingsCard>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div><Typography variant="body2" fontWeight={800}>General preferences</Typography><Typography variant="caption" color="text.secondary">{sectionDirty.general ? "You have unsaved changes." : "All changes are saved."}</Typography></div>
                <div className="flex items-center gap-2">
                  {sectionDirty.general && <Button variant="text" color="inherit" disabled={savingSection !== null} onClick={() => discardSection("general")} sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700 }}>Discard</Button>}
                  <Button variant="contained" disableElevation startIcon={savingSection === "general" ? <CircularProgress size={16} color="inherit" /> : <SaveRoundedIcon />} disabled={!sectionDirty.general || savingSection !== null} onClick={() => void saveSection("general")} sx={{ borderRadius: 2, textTransform: "none", fontWeight: 750, px: 2.5 }}>{savingSection === "general" ? "Saving…" : "Save changes"}</Button>
                </div>
              </div>
            </>
          )}

          {activeSection === "workspace" && (
            <>
              <SettingsCard title="Dashboard defaults" description="Choose the initial reporting context when you open your AdSyntra workspace. These preferences are stored with your account and can be consumed by dashboard screens.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField select fullWidth size="small" label="Default reporting range" value={settings.dashboard.defaultDateRange} onChange={(event) => updateDashboard("defaultDateRange", event.target.value as UserSettings["dashboard"]["defaultDateRange"])}>
                    <MenuItem value="7d">Last 7 days</MenuItem>
                    <MenuItem value="30d">Last 30 days</MenuItem>
                    <MenuItem value="90d">Last 90 days</MenuItem>
                  </TextField>
                  <TextField select fullWidth size="small" label="Default advertising provider" value={settings.dashboard.defaultProvider} onChange={(event) => updateDashboard("defaultProvider", event.target.value as UserSettings["dashboard"]["defaultProvider"])}>
                    <MenuItem value="lastUsed">Last used provider</MenuItem>
                    <MenuItem value="googleAds">Google Ads</MenuItem>
                    <MenuItem value="metaAds">Meta Ads</MenuItem>
                  </TextField>
                  <TextField select fullWidth size="small" label="Default landing page" value={settings.dashboard.defaultLandingPage} onChange={(event) => updateDashboard("defaultLandingPage", event.target.value as UserSettings["dashboard"]["defaultLandingPage"])}>
                    <MenuItem value="overview">Overview dashboard</MenuItem>
                    <MenuItem value="campaigns">Campaign management</MenuItem>
                  </TextField>
                </div>
              </SettingsCard>
              <SettingsCard title="Connected advertising accounts" description="Your Google Ads and Meta Ads OAuth connections are managed separately from your AdSyntra sign-in identity.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Link href="/dashboard/provider" className="group rounded-xl border border-slate-200 p-4 transition hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-700 dark:hover:border-indigo-500 dark:hover:bg-indigo-500/10">
                    <div className="flex items-center gap-2"><CableOutlinedIcon color="primary" /><span className="text-sm font-bold text-slate-900 dark:text-slate-100">Manage provider connections</span></div>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Connect accounts, choose active ad accounts, and review provider access.</p>
                  </Link>
                  <Link href="/dashboard/billing" className="group rounded-xl border border-slate-200 p-4 transition hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-700 dark:hover:border-indigo-500 dark:hover:bg-indigo-500/10">
                    <div className="flex items-center gap-2"><CreditCardOutlinedIcon color="primary" /><span className="text-sm font-bold text-slate-900 dark:text-slate-100">Manage billing</span></div>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">View plan and billing details in the existing billing workspace.</p>
                  </Link>
                </div>
              </SettingsCard>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div><Typography variant="body2" fontWeight={800}>Workspace defaults</Typography><Typography variant="caption" color="text.secondary">{sectionDirty.workspace ? "You have unsaved changes." : "All changes are saved."}</Typography></div>
                <div className="flex items-center gap-2">
                  {sectionDirty.workspace && <Button variant="text" color="inherit" disabled={savingSection !== null} onClick={() => discardSection("workspace")} sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700 }}>Discard</Button>}
                  <Button variant="contained" disableElevation startIcon={savingSection === "workspace" ? <CircularProgress size={16} color="inherit" /> : <SaveRoundedIcon />} disabled={!sectionDirty.workspace || savingSection !== null} onClick={() => void saveSection("workspace")} sx={{ borderRadius: 2, textTransform: "none", fontWeight: 750, px: 2.5 }}>{savingSection === "workspace" ? "Saving…" : "Save changes"}</Button>
                </div>
              </div>
            </>
          )}

          {activeSection === "notifications" && (
            <SettingsCard title="Notification preferences" description="You will be able to choose which account and campaign events should notify you.">
              <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                Notification delivery is not connected to an email or in-app notification service yet. We are keeping these controls unavailable rather than implying that alerts will be delivered.
              </Alert>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {[
                  ["Sync failures", "Know when an advertising account sync fails."],
                  ["Provider connection issues", "Know when Google Ads or Meta access needs attention."],
                  ["Campaign status changes", "Receive updates when campaigns change status."],
                  ["Budget alerts", "Get notified about configured budget thresholds."],
                  ["AI creative completion", "Know when generated assets are ready."],
                  ["Weekly summary", "Receive a weekly performance overview."],
                ].map(([title, description]) => (
                  <div key={title} className="flex items-center justify-between gap-4 py-4">
                    <div><Typography variant="body2" fontWeight={750}>{title}</Typography><Typography variant="caption" color="text.secondary">{description}</Typography></div>
                    <Chip size="small" label="Coming soon" variant="outlined" />
                  </div>
                ))}
              </div>
            </SettingsCard>
          )}

          {activeSection === "privacy" && (
            <div className="space-y-4">
              <SettingsCard title="Your data & privacy" description="AdSyntra account data is associated with your authenticated Clerk user ID. Provider credentials are stored separately from these profile preferences.">
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <Typography variant="body2" fontWeight={800}>Data export</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>A user-scoped export is planned. It is not enabled until all AdSyntra-owned data sources can be included safely.</Typography>
                    <Chip size="small" label="Not available yet" variant="outlined" sx={{ mt: 1.25 }} />
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                    <Typography variant="body2" fontWeight={800}>Delete AdSyntra account</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Account deletion is intentionally unavailable until provider token revocation, owned-record cleanup, billing retention and retry-safe deletion have been implemented and tested.</Typography>
                    <Chip size="small" color="warning" label="Disabled for safety" sx={{ mt: 1.25 }} />
                  </div>
                </div>
              </SettingsCard>
              <SettingsCard title="Account shortcuts" description="Manage identity and connected services in their respective areas.">
                <div className="flex flex-wrap gap-2">
                  <Button component={Link} href="/dashboard/profile" variant="outlined" sx={{ textTransform: "none", borderRadius: 2 }}>Open profile</Button>
                  <Button component={Link} href="/dashboard/provider" variant="outlined" sx={{ textTransform: "none", borderRadius: 2 }}>Provider settings</Button>
                  <Button component={Link} href="/dashboard/billing" variant="outlined" sx={{ textTransform: "none", borderRadius: 2 }}>Billing</Button>
                </div>
              </SettingsCard>
            </div>
          )}
        </section>
      </div>

      <Snackbar open={toast.open} autoHideDuration={4500} onClose={() => setToast((current) => ({ ...current, open: false }))} anchorOrigin={{ vertical: "top", horizontal: "right" }}>
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast((current) => ({ ...current, open: false }))} sx={{ width: "100%", borderRadius: 2 }}>{toast.message}</Alert>
      </Snackbar>
    </div>
  );
}
