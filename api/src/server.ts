import "dotenv/config";
import express from "express";
import googleAdsAPP from './googleadsAPI/app.js'
import metaAdsAPP from './metaadsAPI/app.js'
import cors from 'cors';
import { clerkMiddleware } from "@clerk/express";
import { getUserConnection, selectProviderAccount } from "./services/connection-storage.service.js";
const app = express();
app.disable("x-powered-by");
app.use(cors())
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(clerkMiddleware());


app.use("/api/google-ads", googleAdsAPP)
app.use("/api/meta-ads", metaAdsAPP)

const {
    PORT = "5000",
    SESSION_SECRET,
    META_APP_ID,
    META_APP_SECRET,
    META_LOGIN_CONFIG_ID,
    META_REDIRECT_URI,
} = process.env;

if (
    !SESSION_SECRET ||
    !META_APP_ID ||
    !META_APP_SECRET ||
    !META_LOGIN_CONFIG_ID ||
    !META_REDIRECT_URI
) {
    throw new Error("Missing required settings in .env");
}

// Home route
app.get("/", (_req, res) => {
    res.status(200).json({
        message: "Server is running"
    })
});

// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});


// app.get("/api/connections/me", async (req, res) => {
//     try {
//         const userId = req.auth()?.userId;
//         if (!userId) {
//             return res.status(401).json({
//                 message: "Unauthorized",
//             });
//         }

//         const connection = await getUserConnection(userId);

//         if (!connection) {
//             return res.json({
//                 userId,
//                 providers: {
//                     googleAds: { connected: false, accounts: [] },
//                     metaAds: { connected: false, accounts: [] },
//                 },
//             });
//         }

//         return res.json({
//             userId,
//             providers: {
//                 googleAds: {
//                     connected: connection.providers.googleAds.connected,
//                     accounts: connection.providers.googleAds.accounts,
//                 },
//                 metaAds: {
//                     connected: connection.providers.metaAds.connected,
//                     accounts: connection.providers.metaAds.accounts,
//                 },
//             },
//         });
//     } catch (error) {
//         console.error("Connection status error:", error);

//         return res.status(500).json({
//             message: "Unable to retrieve connection status",
//         });
//     }
// });


type ProviderName = "googleAds" | "metaAds";

// GET /api/connections/me
app.get("/api/connections/me", async (req, res) => {
    try {
        const userId = req.auth()?.userId;

        if (!userId) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }

        const connection = await getUserConnection(userId);

        if (!connection) {
            return res.json({
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

        return res.json({
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
app.post("/api/connections/:provider/select-account", async (req, res) => {
    try {
        const userId = req.auth()?.userId;

        if (!userId) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }

        const { provider } = req.params;
        const { accountId } = req.body;

        if (provider !== "googleAds" && provider !== "metaAds") {
            return res.status(400).json({
                message: "Invalid provider",
            });
        }

        if (
            typeof accountId !== "string" ||
            !accountId.trim()
        ) {
            return res.status(400).json({
                message: "A valid accountId is required",
            });
        }

        await selectProviderAccount(
            userId,
            provider as ProviderName,
            accountId.trim(),

        );

        return res.json({
            message: "Account selected successfully",
            provider,
            selectedAccountId: accountId.trim(),
        });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to select account";

        console.error("Error selecting provider account:", error);

        return res.status(400).json({
            message,
        });
    }
});
// Unknown routes
app.use((_req, res) => {
    res.status(404).json({ message: "Route not found." });
});

// Last-resort error handler: never leak internals to the client.


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
})
