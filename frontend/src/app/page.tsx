import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { Suspense } from "react";

export const metadata = {
  title: "AdSyntra — Unified Ads Platform for Google Ads & Meta Ads",
  description:
    "Connect Google Ads and Meta Ads, create campaigns, manage advertisements and track performance from one unified dashboard.",
  openGraph: {
    title: "AdSyntra — Unified Ads Platform",
    description: "Manage all your ads in one place.",
    type: "website",
  },
};

const FEATURES = [
  {
    title: "Google Ads",
    description:
      "Connect, create and monitor Google Search, Display, Shopping, Performance Max and Demand Gen campaigns from one workspace.",
    color: "text-blue-600 bg-blue-50",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
        />
      </svg>
    ),
  },
  {
    title: "Meta Ads",
    description:
      "Unify Facebook and Instagram campaign creation, ad sets, creatives and audience targeting in the same interface.",
    color: "text-indigo-600 bg-indigo-50",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
        />
      </svg>
    ),
  },
  {
    title: "Unified Analytics",
    description:
      "Compare spend, impressions, CTR, conversions and ROAS across all connected accounts from a single dashboard view.",
    color: "text-purple-600 bg-purple-50",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6"
        />
      </svg>
    ),
  },
  {
    title: "AI Creative Studio",
    description:
      "Generate campaign-ready headlines, descriptions, images and video concepts tailored for each platform's format.",
    color: "text-violet-600 bg-violet-50",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
        />
      </svg>
    ),
  },
];

const STATS = [
  { label: "Campaigns unified", value: "10k+" },
  { label: "Ad spend managed", value: "$40M+" },
  { label: "Avg. ROAS uplift", value: "+28%" },
  { label: "Marketers onboard", value: "3,500+" },
];

const TESTIMONIALS = [
  {
    quote:
      "AdSyntra replaced three dashboards and a spreadsheet. We now launch Google + Meta campaigns in one go.",
    name: "Priya Sharma",
    role: "Head of Growth, NovaMart",
  },
  {
    quote:
      "The AI Creative Studio is our new design team. It generates platform-ready copy faster than any agency.",
    name: "Marcus Lee",
    role: "Performance Marketer, ByteWave",
  },
  {
    quote:
      "Cross-platform ROAS reporting alone is worth the price. The unified budget guardrails saved us thousands.",
    name: "Ana Torres",
    role: "Founder, Craft & Co.",
  },
];

export default async function Home() {
  const { userId } = await auth();

  // Already signed in? Go directly to account connections.
  if (userId) {
    redirect("/dashboard/provider");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      {/* ═══════════════ HEADER ═══════════════ */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <a href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-sm font-bold text-white shadow-md shadow-blue-500/20">
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
          </a>

          <nav className="hidden items-center gap-8 md:flex">
            <a
              href="#features"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Features
            </a>
            <a
              href="#stats"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Results
            </a>
            <a
              href="#testimonials"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Customers
            </a>
          </nav>

          <Suspense fallback={<div className="h-9 w-24" />}>
            <div className="flex items-center gap-3">
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button className="hidden rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 sm:block">
                    Sign In
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                    Get Started
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <UserButton
                  appearance={{
                    elements: { avatarBox: "h-9 w-9" },
                  }}
                />
              </Show>
            </div>
          </Suspense>
        </div>
      </header>

      {/* ═══════════════ HERO ═══════════════ */}
      <main className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-blue-400/10 blur-3xl" />
          <div className="absolute -bottom-40 right-0 h-[400px] w-[400px] rounded-full bg-indigo-400/10 blur-3xl" />
          <div className="absolute top-1/2 left-0 h-[300px] w-[300px] rounded-full bg-purple-400/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
              Now live for Google Ads &amp; Meta Ads
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              Manage all your ads in{" "}
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                one place.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              Connect Google Ads and Meta Ads, create campaigns, manage
              advertisements and track performance from one unified dashboard.
              Built for teams that ship fast.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <SignUpButton mode="modal" forceRedirectUrl="/dashboard/provider">
                <button className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-3.5 font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:shadow-xl hover:shadow-blue-500/30 sm:w-auto">
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    Start for free
                    <svg
                      className="h-4 w-4 transition-transform group-hover:translate-x-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  </span>
                </button>
              </SignUpButton>

              <SignInButton mode="modal" forceRedirectUrl="/dashboard/provider">
                <button className="w-full rounded-xl border border-slate-300 bg-white px-8 py-3.5 font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 sm:w-auto">
                  Sign in
                </button>
              </SignInButton>
            </div>

            <p className="mt-6 text-sm text-slate-500">
              No credit card required · Google &amp; Meta accounts connect in
              under 2 minutes
            </p>
          </div>

          {/* ═══════════════ FEATURES ═══════════════ */}
          <section
            id="features"
            className="mx-auto mt-20 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
          >
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-slate-300 hover:shadow-md"
              >
                <div
                  className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${feature.color}`}
                >
                  {feature.icon}
                </div>
                <h3 className="text-base font-semibold text-slate-900">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </section>

          {/* ═══════════════ STATS ═══════════════ */}
          <section
            id="stats"
            className="mx-auto mt-24 max-w-5xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12"
          >
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              {STATS.map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-xs font-medium uppercase tracking-wider text-slate-500 sm:text-sm">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* ═══════════════ TESTIMONIALS ═══════════════ */}
          <section id="testimonials" className="mx-auto mt-24 max-w-6xl">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
                Trusted by growth teams
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Loved by marketers everywhere
              </h2>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {TESTIMONIALS.map((t) => (
                <div
                  key={t.name}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <p className="text-sm leading-6 text-slate-700">
                    “{t.quote}”
                  </p>
                  <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
                      {t.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {t.name}
                      </p>
                      <p className="text-xs text-slate-500">{t.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ═══════════════ FINAL CTA ═══════════════ */}
          <section className="mx-auto mt-24 max-w-4xl rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-10 text-center shadow-xl sm:p-16">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to unify your ads?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-300">
              Join thousands of marketers running Google Ads and Meta Ads from a
              single dashboard. Free to start.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <SignUpButton mode="modal" forceRedirectUrl="/dashboard/provider">
                <button className="w-full rounded-xl bg-white px-8 py-3.5 font-semibold text-slate-900 shadow-lg transition hover:bg-slate-100 sm:w-auto">
                  Create free account
                </button>
              </SignUpButton>
              <a
                href="#features"
                className="w-full rounded-xl border border-white/20 px-8 py-3.5 text-center font-semibold text-white transition hover:bg-white/10 sm:w-auto"
              >
                Learn more
              </a>
            </div>
          </section>
        </div>
      </main>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer className="mt-24 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-bold text-white">
                  AS
                </div>
                <span className="text-sm font-bold text-slate-900">
                  AdSyntra
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                The unified ads platform for modern growth teams.
              </p>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900">
                Product
              </h4>
              <ul className="mt-3 space-y-2 text-sm text-slate-500">
                <li>
                  <a href="#features" className="hover:text-slate-900">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-slate-900">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-slate-900">
                    Changelog
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900">
                Company
              </h4>
              <ul className="mt-3 space-y-2 text-sm text-slate-500">
                <li>
                  <a href="#" className="hover:text-slate-900">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-slate-900">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-slate-900">
                    Contact
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900">
                Legal
              </h4>
              <ul className="mt-3 space-y-2 text-sm text-slate-500">
                <li>
                  <a href="#" className="hover:text-slate-900">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-slate-900">
                    Terms
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-slate-900">
                    Security
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-slate-100 pt-6 sm:flex-row">
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} AdSyntra. All rights reserved.
            </p>
            <p className="text-xs text-slate-400">
              Built for teams shipping ads at scale.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
