"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, UserButton } from "@clerk/nextjs";
import { Suspense, useState } from "react";

// ── MUI Components ──────────────────────────────────────
import { Box, Drawer, IconButton, Tooltip } from "@mui/material";

// ── MUI Icons ───────────────────────────────────────────
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import CableOutlinedIcon from "@mui/icons-material/CableOutlined";
import MenuOutlinedIcon from "@mui/icons-material/MenuOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
// import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import AdUnitsOutlinedIcon from "@mui/icons-material/AdUnitsOutlined";
import PhotoLibraryOutlinedIcon from "@mui/icons-material/PhotoLibraryOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import TrackChangesOutlinedIcon from "@mui/icons-material/TrackChangesOutlined";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
/*
const navigation = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: DashboardOutlinedIcon,
    description: "Workspace summary & KPIs",
  },
  {
    label: "Campaigns",
    href: "/dashboard/campaigns",
    icon: CampaignOutlinedIcon,
    description: "Create & manage campaigns",
  },
  {
    label: "Provider Settings",
    href: "/dashboard/provider",
    icon: CableOutlinedIcon,
    description: "Connect Google & Meta accounts",
  },
];*/
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
        label: "Campaign Management",
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

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const activeItem = navigation
    .filter((item) => isActive(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];

  const currentPageTitle =
    pathname === "/dashboard/campaigns/new"
      ? "Create campaign"
      : (activeItem?.label ??
        (pathname === "/dashboard/settings" ? "Settings" : "Workspace"));

  // ── Sidebar (shared between desktop & mobile) ─────────
  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="border-b border-slate-200 px-5 py-5">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-sm font-bold text-white shadow-md shadow-blue-500/20">
            AS
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900">
              AdSyntra
            </h1>
            <p className="text-[11px] leading-none text-slate-500">
              Unified Ads Platform
            </p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      {/* <div className="flex-1 overflow-y-auto px-3 py-5">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Workspace
        </p>

        <nav className="space-y-0.5">
          {navigation.map((item) => {
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
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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

        {/* <div className="my-4 border-t border-slate-100" />

        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Resources
        </p> */}

      {/* <nav className="space-y-0.5">
          <Link
            href="/dashboard/help"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <HelpOutlineOutlinedIcon sx={{ fontSize: 20 }} />
            <span>Help &amp; Support</span>
          </Link>
        </nav> 
      </div> */}

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-5">
        {navigationGroups.map((group) => (
          <div key={group.label} className="mb-6 last:mb-0">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              {group.label}
            </p>

            <nav className="space-y-0.5">
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
                          ? "bg-blue-50 text-blue-700"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
      <div className="border-t border-slate-200 p-3">
        <div className="rounded-xl bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-3 ring-1 ring-blue-100">
          <div className="flex items-start gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
              <AutoAwesomeOutlinedIcon
                sx={{ fontSize: 16, color: "primary.main" }}
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900">
                AI Creative Studio
              </p>
              <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
                Generate ads for Google &amp; Meta in seconds.
              </p>
              <Link
                href="/dashboard/ai-creation"
                className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 hover:text-blue-800"
              >
                Try it now
                <ChevronRightOutlinedIcon sx={{ fontSize: 12 }} />
              </Link>
            </div>
          </div>
        </div>
        <p className="mt-3 px-1 text-[10px] text-slate-400">
          © {new Date().getFullYear()} AdSyntra
        </p>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* ── Desktop Sidebar ─────────────────────────────── */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        {sidebarContent}
      </aside>

      {/* ── Mobile Drawer (MUI) ─────────────────────────── */}
      <Drawer
        anchor="left"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            width: 280,
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "flex-end", p: 1 }}>
          <IconButton
            size="small"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <CloseOutlinedIcon fontSize="small" />
          </IconButton>
        </Box>
        {sidebarContent}
      </Drawer>

      {/* ── Main column ─────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Header */}
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-md md:hidden">
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
              <span className="text-sm font-bold text-slate-900">AdSyntra</span>
            </Link>
          </div>

          <Suspense fallback={<div className="h-8 w-8" />}>
            <Show when="signed-in">
              <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
            </Show>
          </Suspense>
        </div>

        {/* Desktop Topbar */}
        <header className="sticky top-0 z-40 hidden h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-8 backdrop-blur-md md:flex">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Workspace
            </p>
            <p className="text-sm font-bold text-slate-900">
              {currentPageTitle}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/provider"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Manage Connections
            </Link>
            <Suspense fallback={<div className="h-9 w-9" />}>
              <Show when="signed-in">
                <UserButton
                  appearance={{ elements: { avatarBox: "h-9 w-9" } }}
                />
              </Show>
            </Suspense>
          </div>
        </header>

        {/* Current Page */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
