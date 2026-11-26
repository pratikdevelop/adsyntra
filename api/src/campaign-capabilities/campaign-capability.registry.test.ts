import assert from "node:assert/strict";
import test from "node:test";
import {
  findCampaignCapability,
  getCampaignCapabilities,
  getCampaignCapabilityRegistry,
  isCampaignOperationImplementedInSource,
  isCampaignProvider,
} from "./campaign-capability.registry.js";

test("registry exposes the two currently supported providers", () => {
  const registry = getCampaignCapabilityRegistry();
  assert.deepEqual(
    registry.providers.map((item) => item.provider).sort(),
    ["googleAds", "metaAds"],
  );
  assert.equal(registry.apiVersions.googleAds, "v26");
  assert.equal(registry.apiVersions.metaAds, "v26.0");
});

test("provider validation rejects unknown providers", () => {
  assert.equal(isCampaignProvider("googleAds"), true);
  assert.equal(isCampaignProvider("metaAds"), true);
  assert.equal(isCampaignProvider("tiktokAds"), false);
});

test("Google live campaign source coverage matches the connected global route", () => {
  for (const campaignType of ["SEARCH", "DISPLAY", "PERFORMANCE_MAX"]) {
    assert.equal(
      isCampaignOperationImplementedInSource("googleAds", campaignType, "create"),
      true,
      `${campaignType} should have a connected source creation flow`,
    );
  }

  for (const campaignType of ["DEMAND_GEN", "SHOPPING", "APP"]) {
    assert.equal(
      isCampaignOperationImplementedInSource("googleAds", campaignType, "create"),
      false,
      `${campaignType} must not be represented as a complete creation flow`,
    );
  }
});
test("Google Search exposes only bidding and performance options accepted by its current builder", () => {
  const search = findCampaignCapability("googleAds", "SEARCH");
  assert.deepEqual(
    search?.options?.performanceGoals?.map((option) => option.value),
    ["CONVERSIONS", "CONVERSION_VALUE", "CLICKS"],
  );
  assert.deepEqual(
    search?.options?.biddingStrategies?.map((option) => option.value),
    ["MANUAL_CPC", "MAXIMIZE_CLICKS", "MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE"],
  );
});


test("Hotel and classic Video are not represented as normal live creation flows", () => {
  const hotel = findCampaignCapability("googleAds", "HOTEL");
  const video = findCampaignCapability("googleAds", "VIDEO");

  assert.equal(hotel?.operations.create.status, "BLOCKED_EXTERNAL");
  assert.equal(video?.operations.create.status, "READ_ONLY");
});

test("Meta retains six provider objectives and marks current creation path partial", () => {
  const meta = findCampaignCapability("metaAds", "CAMPAIGN");
  assert.equal(meta?.operations.create.status, "PARTIAL");
  assert.deepEqual(
    meta?.options?.providerObjectives?.map((option) => option.value),
    [
      "OUTCOME_AWARENESS",
      "OUTCOME_TRAFFIC",
      "OUTCOME_ENGAGEMENT",
      "OUTCOME_LEADS",
      "OUTCOME_SALES",
      "OUTCOME_APP_PROMOTION",
    ],
  );
});

test("provider filtering and unknown campaign type lookup are safe", () => {
  assert.equal(getCampaignCapabilities("googleAds").every((item) => item.provider === "googleAds"), true);
  assert.equal(findCampaignCapability("googleAds", "UNKNOWN_TYPE"), undefined);
});
