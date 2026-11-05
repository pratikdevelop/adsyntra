import CampaignsPage from "../page";

export default function CampaignDraftsRoute() {
  return (
    <CampaignsPage
      initialStatusFilter="DRAFT"
      pageTitle="Campaign Drafts"
      pageDescription="Continue preparing saved Google Ads and Meta Ads campaigns. Drafts are stored locally in this prototype; no provider changes are made until a live integration is connected."
    />
  );
}
