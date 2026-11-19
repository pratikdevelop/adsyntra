# Provider API Mapping — correction notes

**Baseline checked:** 3 November 2026  
**Google:** Google Ads API v26  
**Meta:** Meta Marketing API v26.0 / Meta Business SDK v26.0.x

This is a corrected reference module, not a live API client. It deliberately separates internal platform labels from provider-native fields. Always validate objective, campaign subtype, account eligibility, region, placements and current endpoint requirements before mutating an account.

## Major corrections applied

### Meta

- Corrected the six modern campaign objectives to `OUTCOME_AWARENESS`, `OUTCOME_ENGAGEMENT`, `OUTCOME_LEADS`, `OUTCOME_SALES`, `OUTCOME_TRAFFIC`, and `OUTCOME_APP_PROMOTION`.
- Corrected buying type `RF` to `RESERVED`; retained `AUCTION`.
- Corrected bid strategies to `LOWEST_COST_WITHOUT_CAP`, `LOWEST_COST_WITH_BID_CAP`, `COST_CAP`, and `LOWEST_COST_WITH_MIN_ROAS`.
- Removed invalid `COST_MIN` and `ROI_MIN` labels.
- Corrected `smart_promotion_type`: current SDK values include `GUIDED_CREATION` and `SMART_APP_PROMOTION`. Advantage+ Shopping/Leads are not enum values for that field; they require their relevant product-specific campaign workflows.
- Separated Campaign and AdSet fields. Campaign has campaign-level budgets and some campaign-level bid settings; AdSet has its own budget and bid/optimization/billing/targeting fields. Choose the intended budget owner and only use supported sharing features deliberately.
- Added current SDK-listed AdSet billing-event and optimization-goal values, with a warning that compatibility depends on the campaign objective and account setup.
- Corrected the resource model: Campaign → AdSet → Ad, while media uploads and AdCreative are separate resources. Ad references a creative rather than owning every creative content field.
- Made special ad category handling explicit. Send `special_ad_categories: []` when none apply; do not use a string `NONE` array element.
- Budget integers use the ad account currency's smallest unit, not Google's micros scale.

### Google Ads

- Removed `APP` as a native `AdvertisingChannelType`. App Campaigns use `MULTI_CHANNEL` with an App Campaign subtype and AppCampaignSetting.
- Added current channel enum types: `DEMAND_GEN`, `DISPLAY`, `HOTEL`, `LOCAL`, `LOCAL_SERVICES`, `MULTI_CHANNEL`, `PERFORMANCE_MAX`, `SEARCH`, `SHOPPING`, `SMART`, `TRAVEL`, and `VIDEO`.
- Removed invalid/unsupported UI-like subtype assumptions such as generic `STANDARD`; kept only documented subtype examples needed for App and Performance Max for Travel Goals.
- Clarified that builder objectives (AWARENESS, LEADS, SALES, etc.) are not a generic native `Campaign.objective` field.
- Corrected Maximize Clicks mapping: Google API uses the `target_spend` bidding scheme; the CPC ceiling is `campaign.target_spend.cpc_bid_ceiling_micros`. There is no `campaign.maximize_clicks` field.
- Corrected standard target CPA and target ROAS mapping to `maximize_conversions.target_cpa_micros` and `maximize_conversion_value.target_roas`.
- Corrected Search Partners field to `campaign.network_settings.target_search_network`; removed `target_search_partners`.
- Distinguished standard campaign bidding (`campaign_bidding_strategy` oneof) from portfolio bidding (`BiddingStrategy` resource attached by `campaign.bidding_strategy`). Do not populate both for one campaign.
- Added the EU political-advertising declaration field required in the current create-campaign guide.
- Clarified CampaignBudget amount units: average daily `amount_micros`; campaign-total `total_amount_micros` with `CUSTOM_PERIOD`, no sharing, and required campaign start/end dates for supported channel types.
- Added a corrected GAQL campaign audit query builder with the Search Partners field corrected.
- Kept Video and Hotel as channel families with variant/eligibility checks rather than blanket disabling them. Hotel Ads requires a linked Hotel Center account and allowlisted account access; feed/pricing management remains in Hotel Center.
- Corrected the Hotel Ad structure: Hotel uses an `AdGroup` with type `HOTEL_ADS`, an `Ad` containing `HotelAdInfo`, and an `AdGroupAd` that associates the ad with the group. The Hotel `AdGroupAd` must be `ENABLED`; pause its parent Campaign or AdGroup during construction instead.
- Added an explicit distinction between Meta's campaign budget sharing fields (such as `is_adset_budget_sharing_enabled` / `adset_budgets`) and the simple CBO/ABO UI patterns.

## Implementation notes

1. Keep this file as a capability/reference module, not as a direct payload generator.
2. A provider adapter should take validated normalized input and build provider-native resources.
3. For Google, use `CampaignBudgetService` for campaign budgets, `CampaignService` for Campaign, and `BiddingStrategyService` only for portfolio strategies.
4. For Meta, create Campaign, AdSet, any required image/video assets, AdCreative and Ad as separate resource operations.
5. The API execution monitor should persist every returned provider ID and error. A retry must reconcile timeouts before recreating a resource.
6. Current project integrations may still explicitly use Meta Graph API v25.0. The reference module documents the current v26.0 baseline; when implementing the adapter, upgrade the project version intentionally and run integration tests rather than silently changing the existing API version.

## Primary references

### Google Ads API v26

- Campaign creation: https://developers.google.com/google-ads/api/docs/campaigns/create-campaigns
- Campaign overview: https://developers.google.com/google-ads/api/docs/campaigns/overview
- Bidding strategy types: https://developers.google.com/google-ads/api/docs/campaigns/bidding/strategy-types
- Campaign budget overview: https://developers.google.com/google-ads/api/docs/campaigns/budgets/overview
- Create campaign budgets: https://developers.google.com/google-ads/api/docs/campaigns/budgets/create-budgets
- App campaigns: https://developers.google.com/google-ads/api/docs/app-campaigns/create-campaign
- Hotel Ads overview: https://developers.google.com/google-ads/api/docs/hotel-ads/overview
- Create Hotel AdGroup: https://developers.google.com/google-ads/api/docs/hotel-ads/create-ad-group
- Create Hotel AdGroupAd: https://developers.google.com/google-ads/api/docs/hotel-ads/create-ad-group-ad
- Campaign field reference v26: https://developers.google.com/google-ads/api/fields/v26/campaign
- Advertising channel subtype enum v26: https://developers.google.com/google-ads/api/reference/rpc/v26/AdvertisingChannelSubTypeEnum.AdvertisingChannelSubType

### Meta Marketing API v26.0

Meta's generated Business SDK object definitions are used as a versioned, machine-readable cross-check for current object fields and enum definitions:

- Business SDK: https://github.com/facebook/facebook-python-business-sdk
- API version config: https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/apiconfig.py
- Campaign object: https://github.com/meta/facebook-python-business-sdk/blob/main/facebook_business/adobjects/campaign.py
- AdSet object: https://github.com/meta/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adset.py
- Ad object: https://github.com/meta/facebook-python-business-sdk/blob/main/facebook_business/adobjects/ad.py
- AdCreative object: https://github.com/meta/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adcreative.py

Meta Business SDK main currently declares API_VERSION `v26.0`. If your deployed application intentionally remains on v25.0, verify each feature against v25.0 before sending it; do not assume every v26 field or enum exists in v25.0.
