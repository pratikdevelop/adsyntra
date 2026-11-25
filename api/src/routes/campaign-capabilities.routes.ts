import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import {
  findCampaignCapability,
  getCampaignCapabilityRegistry,
  isCampaignProvider,
} from "../campaign-capabilities/campaign-capability.registry.js";

const router = Router();

function requireAuthenticatedUser(req: Request, res: Response): boolean {
  const { userId } = getAuth(req);
  if (userId) return true;

  res.status(401).json({
    success: false,
    message: "Authentication required.",
  });
  return false;
}

/** Returns the full registry or a provider-filtered subset. */
router.get("/", (req: Request, res: Response) => {
  if (!requireAuthenticatedUser(req, res)) return;

  const providerParam = typeof req.query.provider === "string"
    ? req.query.provider
    : undefined;

  if (providerParam && !isCampaignProvider(providerParam)) {
    return res.status(400).json({
      success: false,
      message: "provider must be googleAds or metaAds.",
    });
  }

  const registry = getCampaignCapabilityRegistry();
  if (!providerParam) {
    return res.status(200).json({ success: true, data: registry });
  }

  return res.status(200).json({
    success: true,
    data: {
      registryVersion: registry.registryVersion,
      sourceSnapshotDate: registry.sourceSnapshotDate,
      verificationNotice: registry.verificationNotice,
      apiVersions: registry.apiVersions,
      providers: registry.providers.filter((item) => item.provider === providerParam),
    },
  });
});

/** Returns one provider campaign type using its AdSyntra builder type key. */
router.get("/:provider/:campaignType", (req: Request, res: Response) => {
  if (!requireAuthenticatedUser(req, res)) return;

  const { provider, campaignType } = req.params;
  if (!isCampaignProvider(provider)) {
    return res.status(400).json({
      success: false,
      message: "provider must be googleAds or metaAds.",
    });
  }

  const capability = findCampaignCapability(provider, campaignType);
  if (!capability) {
    return res.status(404).json({
      success: false,
      message: `No campaign capability definition was found for ${provider}/${campaignType}.`,
    });
  }

  return res.status(200).json({
    success: true,
    data: capability,
  });
});

export default router;
