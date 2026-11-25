# Apply Campaign Capability Registry — Phase 1

This is an overlay bundle for the supplied AdSyntra project ZIP. Extract it into the project root and allow it to replace only the files contained in this bundle.

## Included integration

- Express API registry definitions and lookup helpers.
- Authenticated Express endpoints mounted at `/api/campaign-capabilities`.
- Focused API registry tests and `api/package.json` test script.
- Authenticated Next.js proxy route and frontend API helper.
- Campaign Creation UI status summaries for selected Google campaign type and Meta Campaign.
- Registry implementation guide and updated pending-features backlog.

## Apply

1. Back up the current project folder or commit the current working tree.
2. Extract this ZIP at the root of the AdSyntra project, preserving paths.
3. From `api/`, run `npm install` if your dependencies are not installed, then run:

   ```bash
   npm run test:capabilities
   npm run typecheck
   ```

4. From `frontend/`, run your normal development/build checks:

   ```bash
   npm run build
   ```

5. Start the backend and frontend, open Campaign Creation, and confirm that the Google campaign type status and Meta campaign status cards load.
6. Verify `GET /api/campaign-capabilities` while authenticated.

## Important

This Phase 1 integration is informational. It does not yet disable unsupported campaign options or enforce capability checks in the campaign creation POST route. That is intentionally left for Phase 2 so we can add the backend guard and UI gating together after reviewing the status model.

The existing `frontend/src/app/dashboard/campaigns/new/campaign-capability-registry.ts` is preserved. It remains the creative asset/text requirements registry; the new registry has a different campaign-level responsibility.

No Google Ads or Meta live provider requests are made by the registry endpoints. `IMPLEMENTED_IN_SOURCE` means source coverage only, not provider validation or production readiness.
