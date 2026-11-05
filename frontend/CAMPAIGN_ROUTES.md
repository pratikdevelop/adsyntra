# Global campaign routes

The campaign workspace is organized under `/dashboard/campaigns` so Google Ads and Meta Ads share one frontend route hierarchy.

| Route | Purpose |
|---|---|
| `/dashboard/campaigns` | Global campaign list with provider, status, search, and shared-initiative filters |
| `/dashboard/campaigns/new` | Unified Google Ads / Meta Ads campaign builder |
| `/dashboard/campaigns/drafts` | Same campaign list pre-filtered to local draft records |
| `/dashboard/campaigns/manage` | Compatibility alias that redirects to the global campaign list |
| `/dashboard/campaigns/[id]` | Provider-specific campaign details |
| `/dashboard/campaigns/[id]/edit` | Edit one provider-specific campaign record |

`/dashboard/create-campaign` remains available as a legacy path. New frontend links use `/dashboard/campaigns/new`.

The list and drafts routes reuse the existing campaign record store in browser local storage. Status changes, duplicate actions, and draft records are prototype-only; they do not call Google Ads or Meta Ads. Provider records remain separate even when they share one initiative ID.
