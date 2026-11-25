import type {
  CampaignCapabilityRegistry,
  CampaignCapabilityRegistryApiResponse,
} from "@/interfaces/campaign-capability.interface";

export async function fetchCampaignCapabilityRegistry(
  signal?: AbortSignal,
): Promise<CampaignCapabilityRegistry> {
  const response = await fetch("/api/campaign-capabilities", {
    method: "GET",
    cache: "no-store",
    signal,
    headers: {
      Accept: "application/json",
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | CampaignCapabilityRegistryApiResponse
    | null;

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(
      payload?.message ||
        `Campaign capability registry request failed (${response.status}).`,
    );
  }

  return payload.data;
}
