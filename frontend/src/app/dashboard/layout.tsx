"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: "▦",
  },
  {
    label: "Campaigns",
    href: "/dashboard/campaigns",
    icon: "◫",
  },
  {
    label: "Create Campaign",
    href: "/dashboard/create-campaign",
    icon: "+",
  },
  {
    label: "Ad Accounts",
    href: "/dashboard/accounts",
    icon: "▣",
  },
  {
    label: "Reports",
    href: "/dashboard/reports",
    icon: "▤",
  },
  {
    label: "Audiences",
    href: "/dashboard/audiences",
    icon: "◎",
  },
  {
    label: "Creative Library",
    href: "/dashboard/creatives",
    icon: "▧",
  },
];

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === href;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-200 px-6 py-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
              U
            </div>

            <div>
              <h1 className="text-lg font-bold">Unified Ads</h1>
              <p className="text-xs text-slate-500">Management Platform</p>
            </div>
          </Link>
        </div>

        <div className="flex-1 px-4 py-6">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </p>

          <nav className="space-y-1">
            {navigation.map((item) => {
              const active = isActive(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span className="flex h-6 w-6 items-center justify-center text-lg">
                    {item.icon}
                  </span>

                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="my-6 border-t border-slate-100" />

          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Configuration
          </p>

          <nav className="space-y-1">
            <Link
              href="/provider"
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                pathname === "/provider"
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center text-lg">
                ⚙
              </span>
              Connections
            </Link>

            <Link
              href="/dashboard/settings"
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                isActive("/dashboard/settings")
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center text-lg">
                ⚙
              </span>
              Settings
            </Link>
          </nav>
        </div>

        <div className="border-t border-slate-200 p-4">
          <p className="text-xs text-slate-400">Unified Ads Platform</p>
          <p className="mt-1 text-xs text-slate-500">
            Manage multiple ad platforms in one place.
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Header */}
        <div className="border-b border-slate-200 bg-white px-4 py-4 md:hidden">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">
              U
            </div>
            <span className="font-bold">Unified Ads</span>
          </Link>

          <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium ${
                  isActive(item.href)
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {item.label}
              </Link>
            ))}

            <Link
              href="/provider"
              className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600"
            >
              Connections
            </Link>
          </nav>
        </div>

        {/* Desktop Topbar */}
        <header className="hidden h-16 items-center justify-between border-b border-slate-200 bg-white px-8 md:flex">
          <div>
            <p className="text-sm font-semibold">
              {navigation.find((item) => isActive(item.href))?.label ??
                (pathname === "/dashboard/settings" ? "Settings" : "Workspace")}
            </p>
          </div>

          <Link
            href="/provider"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Manage Connections
          </Link>
        </header>

        {/* Current Page */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
