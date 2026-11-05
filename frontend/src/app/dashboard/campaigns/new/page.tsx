"use client";

// Keep one campaign-builder implementation while exposing it under the
// global campaigns route hierarchy.
import CreateCampaignPage from "../../create-campaign/page";

export default function NewCampaignRoute() {
  return <CreateCampaignPage />;
}
