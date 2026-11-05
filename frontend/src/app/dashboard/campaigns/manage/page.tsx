import { redirect } from "next/navigation";

/** The global campaign list is the canonical manage screen. */
export default function ManageCampaignsRoute() {
  redirect("/dashboard/campaigns");
}
