import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { Suspense } from "react";

export default async function Home() {
  const { userId } = await auth();

  // Already signed in? Go directly to account connections.
  if (userId) {
    redirect("/dashboard/provider");
  }

  // https://www.facebook.com/business/news/click-attribution

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-sm font-bold text-white shadow-md shadow-blue-500/20">
              A
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-slate-900">
                Ad Pilot
              </h1>
              <p className="text-[11px] leading-none text-slate-500">
                Unified Ads Platform
              </p>
            </div>
          </div>
          <Suspense>
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

      {/* Hero Section */}
      <main className="relative overflow-hidden">
        {/* Background decorative elements */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-blue-400/10 blur-3xl" />
          <div className="absolute -bottom-40 right-0 h-[400px] w-[400px] rounded-full bg-indigo-400/10 blur-3xl" />
          <div className="absolute top-1/2 left-0 h-[300px] w-[300px] rounded-full bg-purple-400/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
          <div className="mx-auto max-w-3xl text-center">
            {/* Badge */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
              Unified Ads Platform
            </div>

            {/* Heading */}
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              Manage all your ads in{" "}
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                one place.
              </span>
            </h1>

            {/* Subtext */}
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              Connect Google Ads and Meta Ads, create campaigns, manage
              advertisements and track performance from one unified dashboard.
            </p>

            {/* CTA Buttons */}
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <SignInButton mode="modal" forceRedirectUrl="/dashboard/provider">
                <button className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-3.5 font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:shadow-xl hover:shadow-blue-500/30 sm:w-auto">
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    Sign in
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
              </SignInButton>

              <SignUpButton mode="modal" forceRedirectUrl="/dashboard/provider">
                <button className="w-full rounded-xl border border-slate-300 bg-white px-8 py-3.5 font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 sm:w-auto">
                  Create account
                </button>
              </SignUpButton>
            </div>

            <p className="mt-6 text-sm text-slate-500">
              Google Ads and Meta Ads integrations will be configured inside
              your workspace.
            </p>
          </div>

          {/* Feature Cards */}
          <div className="mx-auto mt-20 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              {
                title: "Google Ads",
                description:
                  "Connect and manage your Google Ads campaigns directly from the dashboard.",
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
                color: "text-blue-600 bg-blue-50",
              },
              {
                title: "Meta Ads",
                description:
                  "Integrate Meta Ads to monitor and optimize your advertising performance.",
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
                color: "text-indigo-600 bg-indigo-50",
              },
              {
                title: "Unified Analytics",
                description:
                  "Track performance across all your ad platforms in a single view.",
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
                color: "text-purple-600 bg-purple-50",
              },
            ].map((feature) => (
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
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} Ad Pilot. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <a href="#" className="transition hover:text-slate-900">
              Privacy
            </a>
            <a href="#" className="transition hover:text-slate-900">
              Terms
            </a>
            <a href="#" className="transition hover:text-slate-900">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
