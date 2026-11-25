"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { useEffect, useMemo, useRef, useState } from "react";

// ── MUI Components ──────────────────────────────────────
import {
  Avatar,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from "@mui/material";

// ── MUI Icons ───────────────────────────────────────────
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import CableOutlinedIcon from "@mui/icons-material/CableOutlined";
import MenuOutlinedIcon from "@mui/icons-material/MenuOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import AdUnitsOutlinedIcon from "@mui/icons-material/AdUnitsOutlined";
import PhotoLibraryOutlinedIcon from "@mui/icons-material/PhotoLibraryOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import TrackChangesOutlinedIcon from "@mui/icons-material/TrackChangesOutlined";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import { authenticatedApiRequest } from "@/lib/api";

// ── Static maps ─────────────────────────────────────────
const PAGE_TITLES: Record<string, string> = {
  "/dashboard/campaigns/new": "Create campaign",
  "/dashboard/profile": "My profile",
};

// ── Account menu ────────────────────────────────────────
function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  if (!isLoaded) {
    return <div className={compact ? "h-9 w-9" : "h-10 w-36"} />;
  }
  if (!isSignedIn || !user) return null;

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || "AdSyntra user";
  const email = user.primaryEmailAddress?.emailAddress ?? "Signed-in account";
  const initials =
    [user.firstName?.[0], user.lastName?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() ||
    email.match(/[A-Za-z]/)?.[0]?.toUpperCase() ||
    "U";
  const close = () => setAnchorEl(null);

  return (
    <>
      <Button
        onClick={(event) => setAnchorEl(event.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={open ? "true" : undefined}
        variant="text"
        color="inherit"
        sx={{
          borderRadius: 3,
          textTransform: "none",
          minWidth: compact ? 42 : 180,
          px: compact ? 0.5 : 1.25,
          py: 0.5,
          gap: 1,
          justifyContent: compact ? "center" : "flex-start",
          "&:hover": { backgroundColor: "action.hover" },
        }}
      >
        <Avatar
          src={user.imageUrl}
          alt={fullName}
          sx={{
            width: compact ? 32 : 36,
            height: compact ? 32 : 36,
            bgcolor: "#4338ca",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          {initials}
        </Avatar>
        {!compact && (
          <Box sx={{ minWidth: 0, flex: 1, textAlign: "left" }}>
            <span className="block max-w-32 truncate text-xs font-bold text-slate-800 dark:text-slate-100">
              {fullName}
            </span>
            <span className="block max-w-32 truncate text-[11px] text-slate-500 dark:text-slate-400">
              {email}
            </span>
          </Box>
        )}
        <ExpandMoreRoundedIcon sx={{ fontSize: 18, color: "#64748b" }} />
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              minWidth: 250,
              borderRadius: 2.5,
              border: "1px solid",
              borderColor: "divider",
              boxShadow: "0 14px 36px rgba(15,23,42,.14)",
            },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
            <Avatar
              src={user.imageUrl}
              alt={fullName}
              sx={{ width: 40, height: 40, bgcolor: "#4338ca", fontSize: 14, fontWeight: 800 }}
            >
              {initials}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                {fullName}
              </span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                {email}
              </span>
            </Box>
          </Box>
        </Box>
        <Divider />
        <MenuItem
          component={Link}
          href="/dashboard/profile"
          onClick={close}
          sx={{ py: 1.1, gap: 1 }}
        >
          <ListItemIcon sx={{ minWidth: 30 }}>
            <PersonOutlineRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="My profile"
            secondary="Personal information & sign-in identity"
            primaryTypographyProps={{ fontSize: 13, fontWeight: 700 }}
            secondaryTypographyProps={{ fontSize: 11 }}
          />
        </MenuItem>
        <MenuItem
          component={Link}
          href="/dashboard/settings"
          onClick={close}
          sx={{ py: 1.1, gap: 1 }}
        >
          <ListItemIcon sx={{ minWidth: 30 }}>
            <SettingsOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Settings"
            secondary="Appearance & workspace preferences"
            primaryTypographyProps={{ fontSize: 13, fontWeight: 700 }}
            secondaryTypographyProps={{ fontSize: 11 }}
          />
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          onClick={() => {
            close();
            void signOut({ redirectUrl: "/" });
          }}
          sx={{ py: 1.1, gap: 1, color: "error.main" }}
        >
          <ListItemIcon sx={{ minWidth: 30, color: "error.main" }}>
            <LogoutRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Sign out"
            primaryTypographyProps={{ fontSize: 13, fontWeight: 700 }}
          />
        </MenuItem>
      </Menu>
    </>
  );
}

// ── Theme preference sync ───────────────────────────────
// Split into two effects so the settings fetch does NOT re-run on every route change.
function ThemePreferenceSync() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const initialLandingHandled = useRef(false);
  const landingPreferenceRef = useRef<"overview" | "campaigns" | null>(null);

  // Effect 1 — fetch settings & apply theme (fires once auth is ready).
  useEffect(() => {
    let cancelled = false;
    let preferenceEventReceived = false;
    let media: MediaQueryList | null = null;
    let onSystemThemeChange: (() => void) | null = null;

    const stopSystemListener = () => {
      if (media && onSystemThemeChange) {
        media.removeEventListener("change", onSystemThemeChange);
      }
      media = null;
      onSystemThemeChange = null;
    };

    const apply = (theme: "system" | "light" | "dark") => {
      const resolved =
        theme === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : theme;
      document.documentElement.dataset.theme = resolved;
    };

    const syncTheme = (theme: "system" | "light" | "dark") => {
      stopSystemListener();
      apply(theme);
      if (theme === "system") {
        media = window.matchMedia("(prefers-color-scheme: dark)");
        onSystemThemeChange = () => apply("system");
        media.addEventListener("change", onSystemThemeChange);
      }
    };

    const onPreferenceChange = (event: Event) => {
      const detail = (event as CustomEvent<{ theme?: string }>).detail;
      if (
        detail?.theme === "system" ||
        detail?.theme === "light" ||
        detail?.theme === "dark"
      ) {
        preferenceEventReceived = true;
        syncTheme(detail.theme);
      }
    };

    window.addEventListener("adsyntra:theme-preference", onPreferenceChange);

    const load = async () => {
      if (!isLoaded) return;
      if (!isSignedIn) {
        syncTheme("system");
        return;
      }
      try {
        const token = await getToken();
        if (!token) return;
        const response = (await authenticatedApiRequest(
          "/api/user-settings",
          token
        )) as {
          settings?: {
            appearance?: { theme?: "system" | "light" | "dark" };
            dashboard?: { defaultLandingPage?: "overview" | "campaigns" };
          };
        };
        if (cancelled || preferenceEventReceived) return;
        syncTheme(response.settings?.appearance?.theme ?? "system");
        landingPreferenceRef.current =
          response.settings?.dashboard?.defaultLandingPage ?? null;
      } catch {
        // Keep the browser's current theme when preference retrieval is unavailable.
      }
    };

    void load();
    return () => {
      cancelled = true;
      window.removeEventListener("adsyntra:theme-preference", onPreferenceChange);
      stopSystemListener();
    };
  }, [getToken, isLoaded, isSignedIn]);

  // Effect 2 — apply landing page preference once, on initial dashboard entry.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (initialLandingHandled.current) return;
    if (pathname !== "/dashboard") return;

    // Wait one tick for Effect 1 to populate the ref (same commit, effects run in order).
    const preference = landingPreferenceRef.current;
    if (preference === null) return;

    initialLandingHandled.current = true;
    if (preference === "campaigns") {
      router.replace("/dashboard/campaigns");
    }
  }, [isLoaded, isSignedIn, pathname, router]);

  return null;
}

// ── Navigation config ───────────────────────────────────
const navigationGroups = [
  {
    label: "Workspace",
    items: [
      {
        label: "Overview",
        href: "/dashboard",
        icon: DashboardOutlinedIcon,
        description: "Workspace summary & KPIs",
      },
    ],
  },
  {
    label: "Ad Management",
    items: [
      {
        label: "Campaigns",
        href: "/dashboard/campaigns",
        icon: CampaignOutlinedIcon,
        description: "Create & manage campaigns",
      },
      {
        label: "Ads Management",
        href: "/dashboard/ads",
        icon: AdUnitsOutlinedIcon,
        description: "Manage published Google & Meta ads",
      },
      {
        label: "Asset Library",
        href: "/dashboard/assets",
        icon: PhotoLibraryOutlinedIcon,
        description: "Manage images, videos & advertising assets",
      },
      {
        label: "AI Creation",
        href: "/dashboard/ai-creation",
        icon: AutoAwesomeOutlinedIcon,
        description: "Generate advertising creatives using AI",
      },
    ],
  },
  {
    label: "Marketing",
    items: [
      {
        label: "Audiences",
        href: "/dashboard/audiences",
        icon: GroupsOutlinedIcon,
        description: "Manage advertising audiences",
      },
      {
        label: "Conversions & Tracking",
        href: "/dashboard/conversions",
        icon: TrackChangesOutlinedIcon,
        description: "Manage conversion tracking and pixels",
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        label: "Billing",
        href: "/dashboard/billing",
        icon: CreditCardOutlinedIcon,
        description: "Manage advertising spend and billing",
      },
      {
        label: "Provider Settings",
        href: "/dashboard/provider",
        icon: CableOutlinedIcon,
        description: "Connect Google & Meta accounts",
      },
      {
        label: "Settings",
        href: "/dashboard/settings",
        icon: SettingsOutlinedIcon,
        description: "Manage application settings",
      },
    ],
  },
];

const navigation = navigationGroups.flatMap((group) => group.items);

// ── Layout ──────────────────────────────────────────────
export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [createMenuAnchor, setCreateMenuAnchor] = useState<HTMLElement | null>(
    null
  );
  const createMenuOpen = Boolean(createMenuAnchor);

  const openCreateMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    setCreateMenuAnchor(event.currentTarget);
  };
  const closeCreateMenu = () => setCreateMenuAnchor(null);

  const createMenuItems = [
    {
      label: "Campaign",
      description: "Open the campaign builder",
      href: "/dashboard/campaigns/new",
      icon: CampaignOutlinedIcon,
    },
    {
      label: "Audience",
      description: "Create and manage audience segments",
      href: "/dashboard/audiences",
      icon: GroupsOutlinedIcon,
    },
    {
      label: "Conversion",
      description: "Set up conversion actions and tracking",
      href: "/dashboard/conversions",
      icon: TrackChangesOutlinedIcon,
    },
    {
      label: "Ad",
      description: "Open the ads management workspace",
      href: "/dashboard/ads",
      icon: AdUnitsOutlinedIcon,
    },
    {
      label: "AI creative",
      description: "Generate ad copy and creatives",
      href: "/dashboard/ai-creation",
      icon: AutoAwesomeOutlinedIcon,
    },
    {
      label: "Asset",
      description: "Open the asset library",
      href: "/dashboard/assets",
      icon: PhotoLibraryOutlinedIcon,
    },
  ];

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === href;

    if (href === "/dashboard/campaigns") {
      if (pathname === "/dashboard/campaigns/new") return true;
      if (
        pathname === "/dashboard/campaigns/drafts" ||
        pathname.startsWith("/dashboard/campaigns/drafts/")
      ) {
        return false;
      }
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const activeItem = useMemo(
    () =>
      navigation
        .filter((item) => isActive(item.href))
        .sort((a, b) => b.href.length - a.href.length)[0],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname]
  );

  const currentPageTitle =
    PAGE_TITLES[pathname] ?? activeItem?.label ?? "Workspace";

  // ── Sidebar (shared between desktop & mobile) ─────────
  const sidebarContent = (
    <>
      {/* Brand + close button (close only visible on mobile) */}
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-5 dark:border-slate-800">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-sm font-bold text-white shadow-md shadow-blue-500/20">
            AS
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
              AdSyntra
            </h1>
            <p className="text-[11px] leading-none text-slate-500 dark:text-slate-400">
              Unified Ads Platform
            </p>
          </div>
        </Link>
        <IconButton
          size="small"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
          sx={{ display: { xs: "inline-flex", md: "none" } }}
        >
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-5">
        {navigationGroups.map((group) => (
          <div key={group.label} className="mb-6 last:mb-0">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {group.label}
            </p>

            <nav className="space-y-0.5" aria-label={`${group.label} navigation`}>
              {group.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;

                return (
                  <Tooltip
                    key={item.href}
                    title={item.description}
                    placement="right"
                    arrow
                    enterDelay={700}
                  >
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                        active
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      }`}
                    >
                      <Icon
                        sx={{
                          fontSize: 20,
                          color: active ? "primary.main" : "inherit",
                        }}
                      />
                      <span className="flex-1">{item.label}</span>
                      {active && (
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                      )}
                    </Link>
                  </Tooltip>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* Footer promo card */}
      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <div className="rounded-xl bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-3 ring-1 ring-blue-100 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40 dark:ring-slate-700">
          <div className="flex items-start gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
              <AutoAwesomeOutlinedIcon
                sx={{ fontSize: 16, color: "primary.main" }}
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                AI Creative Studio
              </p>
              <p className="mt-0.5 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                Generate ads for Google &amp; Meta in seconds.
              </p>
              <Link
                href="/dashboard/ai-creation"
                className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
              >
                Try it now
                <ChevronRightOutlinedIcon sx={{ fontSize: 12 }} />
              </Link>
            </div>
          </div>
        </div>
        <p className="mt-3 px-1 text-[10px] text-slate-400 dark:text-slate-500">
          © {new Date().getFullYear()} AdSyntra
        </p>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* ── Desktop Sidebar ─────────────────────────────── */}
      <aside
        aria-label="Main navigation"
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 md:flex lg:w-64"
      >
        {sidebarContent}
      </aside>

      {/* ── Mobile Drawer (MUI) ─────────────────────────── */}
      <Drawer
        anchor="left"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: "min(85vw, 300px)", sm: 280 },
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <div aria-label="Mobile navigation">{sidebarContent}</div>
      </Drawer>

      {/* ── Main column ─────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Header */}
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/85 md:hidden">
          <div className="flex items-center gap-2">
            <IconButton
              size="small"
              onClick={() => setMobileOpen(true)}
              sx={{ ml: -1 }}
              aria-label="Open menu"
            >
              <MenuOutlinedIcon />
            </IconButton>
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-bold text-white">
                AS
              </div>
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                AdSyntra
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Button
              id="global-create-button-mobile"
              onClick={openCreateMenu}
              variant="contained"
              size="small"
              disableElevation
              startIcon={<AddRoundedIcon />}
              endIcon={<ExpandMoreRoundedIcon />}
              aria-haspopup="menu"
              aria-expanded={createMenuOpen ? "true" : undefined}
              aria-controls={createMenuOpen ? "global-create-menu" : undefined}
              sx={{
                borderRadius: 2,
                px: 1.5,
                py: 0.75,
                textTransform: "none",
                fontWeight: 600,
                minHeight: 34,
                boxShadow: "none",
              }}
            >
              Create
            </Button>
            <AccountMenu compact />
          </div>
        </div>

        {/* Desktop Topbar */}
        <header className="sticky top-0 z-40 hidden h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-8 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/85 md:flex">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Workspace
            </p>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {currentPageTitle}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              id="global-create-button-desktop"
              onClick={openCreateMenu}
              variant="contained"
              size="medium"
              disableElevation
              startIcon={<AddRoundedIcon />}
              endIcon={<ExpandMoreRoundedIcon />}
              aria-haspopup="menu"
              aria-expanded={createMenuOpen ? "true" : undefined}
              aria-controls={createMenuOpen ? "global-create-menu" : undefined}
              sx={{
                borderRadius: 3,
                px: 2,
                py: 1,
                textTransform: "none",
                fontWeight: 600,
                minHeight: 40,
                boxShadow: "0 2px 8px rgba(37,99,235,.16)",
              }}
            >
              Create
            </Button>
            <AccountMenu />
          </div>
        </header>

        <Menu
          id="global-create-menu"
          anchorEl={createMenuAnchor}
          open={createMenuOpen}
          onClose={closeCreateMenu}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{
            paper: {
              elevation: 8,
              sx: {
                mt: 1,
                minWidth: 272,
                p: 0.75,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2.5,
                boxShadow: "0 14px 36px rgba(15, 23, 42, .14)",
              },
            },
          }}
        >
          <div className="px-3 pb-2 pt-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Quick create
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Choose what you want to work on
            </p>
          </div>
          {createMenuItems.map((item) => {
            const Icon = item.icon;
            return (
              <MenuItem
                key={item.href}
                component={Link}
                href={item.href}
                onClick={closeCreateMenu}
                sx={{
                  mx: 0.5,
                  my: 0.5,
                  borderRadius: 3,
                  py: 1.25,
                  gap: 0.5,
                  "&:hover": { backgroundColor: "primary.50" },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: "primary.main" }}>
                  <Icon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  secondary={item.description}
                  primaryTypographyProps={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "text.primary",
                  }}
                  secondaryTypographyProps={{
                    fontSize: 11,
                    color: "text.secondary",
                  }}
                />
                <ChevronRightOutlinedIcon
                  sx={{ fontSize: 17, color: "text.disabled" }}
                />
              </MenuItem>
            );
          })}
          <Divider sx={{ my: 0.75 }} />
          <MenuItem
            component={Link}
            href="/dashboard"
            onClick={closeCreateMenu}
            sx={{
              mx: 0.5,
              borderRadius: 3,
              py: 1,
              "&:hover": { backgroundColor: "action.hover" },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: "text.secondary" }}>
              <DashboardOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Workspace overview"
              secondary="Go back to your dashboard"
              primaryTypographyProps={{ fontSize: 12, fontWeight: 600 }}
              secondaryTypographyProps={{ fontSize: 11 }}
            />
          </MenuItem>
        </Menu>

        <ThemePreferenceSync />

        {/* Current Page */}
        <main className="flex-1 p-4 text-sm sm:p-6 sm:text-[15px] lg:p-8 lg:text-base">
          {children}
        </main>
      </div>
    </div>
  );
}