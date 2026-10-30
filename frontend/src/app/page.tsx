import { auth } from "@clerk/nextjs/server";
// import { SignInButton, SignUpButton } from "@clerk/nextjs";
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
    redirect("/provider");
  }

  return (
    <>
      <header className="w-full flex justify-between items-center p-4 gap-4 h-16">
        <div>
          <h1 className="font-bold">Ad Pilot</h1>
          <p className="text-xs text-slate-500">Unified Ads Platform</p>
        </div>
        <Suspense>
          <Show when="signed-out">
            <SignInButton />
            <SignUpButton>
              <button className="bg-purple-700 text-white rounded-full font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 cursor-pointer">
                Sign Up
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </Suspense>
      </header>
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-bold text-white">
            A
          </div>

          <p className="mt-6 text-sm font-semibold uppercase tracking-widest text-blue-600">
            Unified Ads Platform
          </p>

          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Manage all your ads in one place.
          </h1>

          <p className="mt-4 text-base leading-7 text-slate-600">
            Connect Google Ads and Meta Ads, create campaigns, manage
            advertisements and track performance from one dashboard.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <SignInButton mode="modal" forceRedirectUrl="/provider">
              <button className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700">
                Sign in
              </button>
            </SignInButton>

            <SignUpButton mode="modal" forceRedirectUrl="/provider">
              <button className="rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 transition hover:bg-slate-50">
                Create account
              </button>
            </SignUpButton>
          </div>

          <p className="mt-8 text-sm text-slate-500">
            Google Ads and Meta Ads integrations will be configured inside your
            workspace.
          </p>
        </div>
      </main>
    </>
  );
}
