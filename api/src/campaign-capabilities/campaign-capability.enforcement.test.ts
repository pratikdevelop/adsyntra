import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCampaignCreateGate,
  getCapabilityConfigurationError,
} from "./campaign-capability.enforcement.js";
import { findCampaignCapabilityByProviderType } from "./campaign-capability.registry.js";

test("provider-native campaign types resolve to registry entries", () => {
  assert.equal(findCampaignCapabilityByProviderType("googleAds", "SEARCH")?.builderCampaignType, "SEARCH");
  assert.equal(findCampaignCapabilityByProviderType("googleAds", "MULTI_CHANNEL")?.builderCampaignType, "APP");
  assert.equal(findCampaignCapabilityByProviderType("metaAds", "CAMPAIGN")?.builderCampaignType, "CAMPAIGN");
  assert.equal(findCampaignCapabilityByProviderType("googleAds", "UNKNOWN"), undefined);
});

test("implemented Google create workflows allow validation and live execution", () => {
  for (const providerType of ["SEARCH", "DISPLAY", "PERFORMANCE_MAX"]) {
    assert.equal(evaluateCampaignCreateGate("googleAds", providerType, true).allowed, true);
    assert.equal(evaluateCampaignCreateGate("googleAds", providerType, false).allowed, true);
  }
});

test("unimplemented and external-blocked Google workflows are rejected", () => {
  for (const providerType of ["DEMAND_GEN", "SHOPPING", "HOTEL", "MULTI_CHANNEL", "VIDEO"]) {
    assert.equal(evaluateCampaignCreateGate("googleAds", providerType, true).allowed, false, providerType);
    assert.equal(evaluateCampaignCreateGate("googleAds", providerType, false).allowed, false, providerType);
  }
});

test("partial Meta creation is validate-only until its limitation is fixed", () => {
  const validationGate = evaluateCampaignCreateGate("metaAds", "CAMPAIGN", true);
  const liveGate = evaluateCampaignCreateGate("metaAds", "CAMPAIGN", false);
  assert.equal(validationGate.allowed, true);
  assert.match(validationGate.warning ?? "", /validation-only/i);
  assert.equal(liveGate.allowed, false);
  assert.match(liveGate.reason ?? "", /PARTIAL/);
});

test("unknown provider campaign types fail closed", () => {
  const result = evaluateCampaignCreateGate("googleAds", "UNREGISTERED_TYPE", true);
  assert.equal(result.allowed, false);
  assert.match(result.reason ?? "", /not registered/i);
});

test("Meta objective, buying type, optimization goal and bid strategy use registry options", () => {
  const validConfiguration = {
    campaign: {
      objective: "OUTCOME_SALES",
      buyingType: "AUCTION",
      bidStrategy: "LOWEST_COST_WITHOUT_CAP",
    },
    adSet: {
      optimization_goal: "OFFSITE_CONVERSIONS",
    },
  };
  assert.equal(
    getCapabilityConfigurationError("metaAds", "CAMPAIGN", "OUTCOME_SALES", validConfiguration),
    null,
  );

  assert.match(
    getCapabilityConfigurationError("metaAds", "CAMPAIGN", "OUTCOME_SALES", {
      ...validConfiguration, campaign: { ...validConfiguration.campaign, buyingType: "INVALID" },
    }) ?? "",
    /buying type/i,
  );

  assert.match(
    getCapabilityConfigurationError("metaAds", "CAMPAIGN", "OUTCOME_SALES", {
      ...validConfiguration, campaign: { ...validConfiguration.campaign, buyingType: "RESERVED" },
    }) ?? "",
    /not enabled/i,
  );

  assert.match(
    getCapabilityConfigurationError("metaAds", "CAMPAIGN", "OUTCOME_SALES", {
      ...validConfiguration, adSet: { optimization_goal: "REACH" },
    }) ?? "",
    /optimization goal/i,
  );

  assert.match(
    getCapabilityConfigurationError("metaAds", "CAMPAIGN", "OUTCOME_SALES", {
      ...validConfiguration, campaign: { ...validConfiguration.campaign, bidStrategy: "INVALID" },
    }) ?? "",
    /bid strategy/i,
  );
});


test("Google performance goals are checked against the selected campaign type", () => {
  assert.equal(
    getCapabilityConfigurationError("googleAds", "SEARCH", "SALES", {
      campaign: {
        performanceGoalPreset: "CONVERSIONS",
        biddingStrategy: "MAXIMIZE_CONVERSIONS",
      },
    }),
    null,
  );
  assert.match(
    getCapabilityConfigurationError("googleAds", "SEARCH", "SALES", {
      campaign: {
        performanceGoalPreset: "IMPRESSION_SHARE",
        biddingStrategy: "MAXIMIZE_CONVERSIONS",
      },
    }) ?? "",
    /performance goal/i,
  );
  assert.equal(
    getCapabilityConfigurationError("googleAds", "DISPLAY", "AWARENESS", {
      campaign: {
        performanceGoalPreset: "IMPRESSIONS",
        biddingStrategy: "MANUAL_CPM",
      },
    }),
    null,
  );
});

test("Google campaign bidding strategy is checked against the selected type", () => {
  assert.equal(
    getCapabilityConfigurationError("googleAds", "SEARCH", "SALES", {
      campaign: { biddingStrategy: "MAXIMIZE_CONVERSIONS" },
    }),
    null,
  );
  assert.match(
    getCapabilityConfigurationError("googleAds", "SEARCH", "SALES", {
      campaign: { biddingStrategy: "INVALID_STRATEGY" },
    }) ?? "",
    /not listed as supported/i,
  );
});

