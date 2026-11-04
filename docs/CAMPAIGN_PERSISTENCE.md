# Campaign persistence foundation

This foundation follows the existing frontend `campaign-builder.v1` payload. That payload is normalized provider intent, not a raw Google Ads or Meta Marketing API request body.

## Collections

### `campaigns`

One document per selected provider. A Google Ads campaign and a Meta Ads campaign created from the same form share an `initiativeId`, but remain separate records with their own:

- provider and advertising account ID;
- full normalized provider configuration from `providerConfigurations[provider]`;
- provider campaign ID/resource name;
- provider resource references (budget, ad group, asset group, ad set, ad/creative, etc.);
- creation state, delivery state, provider status and last error;
- owner Clerk user ID and timestamps.

The `configuration` field intentionally retains the complete provider object so edit forms can be restored even when a provider read response omits settings originally supplied by the builder.

### `campaign_operations`

One document per creation attempt, keyed by an `Idempotency-Key` scoped to the Clerk user. It records the shared `initiativeId`, a request fingerprint, overall status and independent provider results/attempt counts. A reused key with a different request fingerprint must be rejected by the future API layer.

## Important rules

- Never merge the Google and Meta campaign configurations into one provider configuration.
- `apiExecutionPlan` from the frontend is descriptive metadata only; backend services must decide and validate the actual API calls.
- Frontend API-version labels are stored only for diagnostics. Backend configuration controls which API version is used.
- Store provider IDs/resource names and sanitized errors, never access tokens or refresh tokens in campaign documents.
- New campaigns start with `deliveryStatus: "PAUSED"` for review.
- External provider calls are not part of a MongoDB transaction. Partial provider success and timeout/unknown outcomes must be tracked and reconciled independently.

## MongoDB configuration

Set `MONGO_URI` in the backend environment. `MONGODB_DB_NAME` is optional; when omitted, the database name is read from the URI path, falling back to `ads_management`.

MongoDB is connected during API startup and the campaign collection indexes are ensured before Express begins listening. If MongoDB is unavailable or `MONGO_URI` is missing, the API does not start.

## Scope of this change

This adds the typed contract, request validation/document factory, repository helpers and MongoDB startup/index initialization. It does not yet expose the unified campaign HTTP endpoint or call Google Ads/Meta APIs. Those are the next integration phase. Existing provider routes and JSON-based encrypted connection-token storage are otherwise left in place.
