# Global Campaign API

## Endpoint

`GET /api/campaigns`

The endpoint is Clerk-authenticated and returns campaigns from the signed-in user's selected Google Ads and Meta Ads accounts. It reads selected accounts from MongoDB (`ad_accounts`) and provider connection status from `provider_connections`. It does not write campaign or provider data.

### Optional pagination parameters

- `googlePageToken`: opaque Google Ads `nextToken` from the previous response.
- `metaPageToken`: opaque Meta Ads `nextToken` from the previous response.

The tokens are independent. Pass a token only for the provider whose next page is needed.

## Response

```json
{
  "success": true,
  "providers": {
    "googleAds": {
      "connected": true,
      "status": "ready",
      "account": {
        "id": "customers/1234567890",
        "name": "Example Google account",
        "currency": "USD",
        "timezone": "America/New_York"
      },
      "campaigns": [],
      "pagination": { "hasMore": false, "nextToken": null },
      "error": null
    },
    "metaAds": {
      "connected": true,
      "status": "ready",
      "account": {
        "id": "act_123456789",
        "name": "Example Meta account",
        "currency": "USD",
        "timezone": "America/New_York"
      },
      "campaigns": [],
      "pagination": { "hasMore": false, "nextToken": null },
      "error": null
    }
  },
  "campaigns": [],
  "meta": {
    "total": 0,
    "providersSucceeded": 2,
    "providersFailed": 0
  }
}
```

The top-level `campaigns` array is normalized across providers. Each item contains `id`, `provider`, `accountId`, `name`, `status`, `effectiveStatus`, `objective`, `campaignType`, `createdAt`, `updatedAt`, and `source` (the provider's campaign object).

Provider `status` is one of:

- `ready`: connected and an active selected account is available.
- `not_selected`: connected, but no active account is selected; no provider request is made.
- `not_connected`: no connected provider connection exists; no provider request is made.
- `error`: the provider request failed; the other provider's data is still returned.

`meta.providersSucceeded` and `meta.providersFailed` count provider API requests that were attempted, not providers that were skipped because they were disconnected or had no selected account. A provider error does not turn the overall aggregate request into a failure.

## Authentication and data access

- `req.auth()?.userId` provides the Clerk user ID.
- Account lookup is always scoped by `userId`, `isSelected: true`, and `status: "active"`.
- Connection lookup is always scoped by `userId`.
- Only account display fields and connection status are selected; token credentials are never loaded or serialized by this route.
- Google and Meta campaign services continue to retrieve the authenticated user's own provider tokens through the existing token utility.
