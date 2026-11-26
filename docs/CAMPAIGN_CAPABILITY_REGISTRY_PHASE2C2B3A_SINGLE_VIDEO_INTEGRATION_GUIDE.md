# AdSyntra — Campaign Capability Registry Phase 2C2B3A
## Meta Single Video + Website Creative Pipeline

**Status:** Prepared incremental API + frontend overlay. Pending local integration.  
**Date:** 26 November 2026  
**Testing policy:** As requested, no tests, lint, typechecks, builds or live provider calls are included in this development pass. Consolidated verification remains deferred until AdSyntra reaches product readiness.

## 1. Scope

This pass adds the provider-native Meta **Single Video + Website** creative path. It is deliberately narrower than the full Meta creative roadmap. Carousel, Instant Form, Messaging and App creative execution remain blocked.

## 2. Files in this overlay

### New
- `api/src/metaadsAPI/services/meta-ads-video-upload.service.ts`

### Updated
- `api/src/routes/campaign.routes.ts`
- `api/src/metaadsAPI/services/campaign-creation.ts`
- `frontend/src/app/dashboard/campaigns/new/page.tsx`

## 3. What the code does

1. The user selects exactly one private `VIDEO` asset from the AdSyntra Asset Library. The UI no longer asks users to paste an externally supplied Meta Video ID.
2. The backend queries the asset by both `_id` and authenticated `ownerUserId`, confirms private `LOCAL` storage, checks MP4/MOV/WebM MIME type and file-container signature, and enforces the existing 100 MB Asset Library video limit.
3. On live execution, AdSyntra uploads the binary as multipart `source` to the selected Meta Ad Account's `/act_{ad_account_id}/advideos` edge. It does not send private storage URLs, storage keys or browser-provided provider IDs to Meta.
4. The upload result is persisted under the provider's existing `creativeAssetUploads` configuration with the AdSyntra asset ID, Meta account ID and returned `videoId` before waiting for processing.
5. AdSyntra polls the Meta Video status until it reaches `READY`, then resolves the preferred HTTPS thumbnail. A video that is still processing is not used to create an AdCreative.
6. The uploaded video ID and thumbnail are reused only when both the private asset ID and the Meta Ad Account match.
7. The creative service creates `object_story_spec.video_data` with `video_id`, preferred `image_url`, message, title, optional `link_description` and Website CTA.
8. The Creative retry route follows the same upload/readiness/reuse path.

## 4. Validation-only behaviour

Validation-only mode validates the selected private video file and campaign configuration but does **not** upload media to Meta, create a video, create a campaign, or create any other provider object. The live upload flow is separate.

## 5. Current limits and boundaries

- Formats: MP4, MOV and WebM only.
- Maximum video size in this integration: 100 MB, matching the existing Asset Library upload limit.
- Private storage: the current campaign upload helper supports `LOCAL` storage only.
- Destination: Website only.
- Exactly one private VIDEO asset per Single Video creative.
- Carousel, Instant Form, Messaging and App are not enabled by this pass.
- Full codec, duration, aspect-ratio and placement policy enforcement is still required as part of the creative compatibility work and consolidated final verification.
- The configured Meta Graph API version remains v26.0. No API upgrade is included.

## 6. Capability gate

The Campaign Capability Registry continues to mark Meta Campaign Create as `PARTIAL`. This source implementation does not enable Meta Live creation. Do not promote the capability to fully implemented or remove its Live gate until the final release phase completes validate-only, authorised paused live creation, persisted-resource readback, failure/retry and regression verification.

## 7. Integration

1. Back up the four target files in the current working tree.
2. Compare the overlay against the current project snapshot. The patch is based on the last available project snapshot plus the prepared Phase 2C2B2 source; do not overwrite newer local work without reconciliation.
3. Copy the new video upload service to `api/src/metaadsAPI/services/`.
4. Merge the three updated source files into their matching paths.
5. Keep the Phase 2A Meta `PARTIAL` capability status unchanged.
6. Continue feature development. Do not run the consolidated tests/builds/provider checks until the product-readiness stage, as agreed.

## 8. Next development slice

**Phase 2C2B3B — Meta Carousel:** replace the text-only card draft with structured Asset Library card selections, upload each private image to the selected Meta account, preserve card order, and build `link_data.child_attachments` with per-card URL/headline/CTA validation.

## 9. Official Meta references

- Ad Videos v26.0: https://developers.facebook.com/docs/marketing-api/reference/ad-account/advideos/v26.0
- Ad Creative Object Story Spec: https://developers.facebook.com/docs/marketing-api/reference/ad-creative-object-story-spec/
- Video creative example (`video_id`, `image_url`, `link_description`, CTA): https://developers.facebook.com/docs/marketing-api/guides/event-ads/
