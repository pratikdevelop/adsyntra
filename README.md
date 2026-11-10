Campaign Management: provider-separated version
Copy these files into the matching paths in your Next.js project:
- app/dashboard/campaigns/page.tsx
- app/dashboard/campaigns/[id]/page.tsx
- app/dashboard/campaigns/_lib/campaigns.ts
- app/dashboard/create-campaign/page.tsx

What changed:
- A campaign brief selected for Google + Meta now creates two separate provider campaign records.
- Both records share groupId, so they can be viewed together under Shared initiatives.
- Google and Meta have separate budgets, statuses, account labels, detail pages and action state.
- Existing older localStorage BOTH records are split into provider-specific rows when read.
- The dashboard has All platforms, Google Ads, Meta Ads and Shared initiatives views.

Important:
- This remains a browser-local prototype. Pause/resume/duplicate are not sent to Google or Meta APIs.
- Existing sample data is illustrative. Live analytics and provider resource IDs are not implemented here.
- Back up your current files before replacing them. Create Campaign page is carried forward from the latest integrated file supplied in this conversation, with only the record-splitting integration changed.
