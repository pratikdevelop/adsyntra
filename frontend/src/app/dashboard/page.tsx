import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-blue-600">
            Workspace Overview
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">Dashboard</h1>

          <p className="mt-2 text-sm text-slate-500">
            Manage your Google Ads and Meta Ads campaigns from one place.
          </p>
        </div>

        <Link
          href="/dashboard/create-campaign"
          className="rounded-xl bg-blue-600 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Create Campaign
        </Link>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {["Total Spend", "Impressions", "Clicks", "Conversions"].map((item) => (
          <div
            key={item}
            className="rounded-2xl border border-slate-200 bg-white p-6"
          >
            <p className="text-sm text-slate-500">{item}</p>
            <p className="mt-3 text-2xl font-bold text-slate-800">—</p>
            <p className="mt-2 text-xs text-slate-400">
              Waiting for campaign data
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-bold text-slate-900">Advertising Platforms</h2>

          <p className="mt-2 text-sm text-slate-500">
            Manage your connected advertising platforms.
          </p>

          <Link
            href="/provider"
            className="mt-5 inline-block text-sm font-semibold text-blue-600 hover:text-blue-800"
          >
            Manage Accounts →
          </Link>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-bold text-slate-900">Campaign Management</h2>

          <p className="mt-2 text-sm text-slate-500">
            Create and manage advertising campaigns across platforms.
          </p>

          <Link
            href="/dashboard/campaigns"
            className="mt-5 inline-block text-sm font-semibold text-blue-600 hover:text-blue-800"
          >
            View Campaigns →
          </Link>
        </section>
      </div>
    </div>
  );
}
