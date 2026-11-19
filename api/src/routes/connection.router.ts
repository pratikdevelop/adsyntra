import { Router, type Request, type Response } from "express";

import {
  getUserConnection,
  selectProviderAccount,
} from "../utils/connection-storage.utils.js";

const router = Router();

type ProviderName = "googleAds" | "metaAds";

function getAuthenticatedUserId(req: Request): string | undefined {
  const clerkRequest = req as Request & {
    auth?: () => { userId?: string };
  };

  return clerkRequest.auth?.()?.userId;
}

// GET /api/connections/me
router.get("/me", async (req: Request, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const connection = await getUserConnection(userId);

    if (!connection) {
      return res.status(200).json({
        userId,
        providers: {
          googleAds: {
            connected: false,
            accounts: [],
            selectedAccountId: null,
          },
          metaAds: {
            connected: false,
            accounts: [],
            selectedAccountId: null,
          },
        },
      });
    }

    return res.status(200).json({
      userId,
      providers: {
        googleAds: {
          connected: connection.providers.googleAds.connected,
          accounts: connection.providers.googleAds.accounts,
          selectedAccountId:
            connection.providers.googleAds.selectedAccountId,
        },
        metaAds: {
          connected: connection.providers.metaAds.connected,
          accounts: connection.providers.metaAds.accounts,
          selectedAccountId:
            connection.providers.metaAds.selectedAccountId,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching user connections:", error);

    return res.status(500).json({
      message: "Failed to fetch user connections",
    });
  }
});

// POST /api/connections/:provider/select-account
router.post(
  "/:provider/select-account",
  async (req: Request, res: Response) => {
    try {
      const userId = getAuthenticatedUserId(req);

      if (!userId) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      const { provider } = req.params;
      const { accountId } = req.body ?? {};

      if (provider !== "googleAds" && provider !== "metaAds") {
        return res.status(400).json({
          message: "Invalid provider",
        });
      }

      if (typeof accountId !== "string" || !accountId.trim()) {
        return res.status(400).json({
          message: "A valid accountId is required",
        });
      }

      const selectedAccountId = accountId.trim();

      await selectProviderAccount(
        userId,
        provider as ProviderName,
        selectedAccountId,
      );

      return res.status(200).json({
        message: "Account selected successfully",
        provider,
        selectedAccountId,
      });
    } catch (error) {
      console.error("Error selecting provider account:", error);

      const message =
        error instanceof Error ? error.message : "";

      if (/not found/i.test(message)) {
        return res.status(404).json({
          message: "The selected advertising account was not found.",
        });
      }

      if (
        message === "A valid accountId is required." ||
        message === "Account ID is required."
      ) {
        return res.status(400).json({
          message: "A valid accountId is required",
        });
      }

      return res.status(500).json({
        message: "Failed to select advertising account",
      });
    }
  },
);

export default router;