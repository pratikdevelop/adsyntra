import "dotenv/config";

import express, {
  type ErrorRequestHandler,
} from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";


// import googleAdsApp from "./googleadsAPI/app.js";
// import metaAdsApp from "./metaadsAPI/app.js";

import connectionRouter from "./routes/connection.router.js";
import providerAuthRoutes from "./routes/provider-auth.routes.js";

import {
  connectToMongoDB,
  disconnectFromMongoDB,
} from "./config/db.js";

import campaignRouter from "./routes/campgin.router.js";
// import {
//   ensureCampaignIndexes,
// } from "./campaigns/campaign.repository.js";

const app = express();

app.disable("x-powered-by");

// --------------------------------------------------
// Environment configuration
// --------------------------------------------------

const {
  PORT = "5000",
  SESSION_SECRET,
  META_APP_ID,
  META_APP_SECRET,
  META_LOGIN_CONFIG_ID,
  META_REDIRECT_URI,
  GOOGLE_ADS_DEVELOPER_TOKEN,
} = process.env;

if (
  !SESSION_SECRET ||
  !META_APP_ID ||
  !META_APP_SECRET ||
  !META_LOGIN_CONFIG_ID ||
  !META_REDIRECT_URI ||
  !GOOGLE_ADS_DEVELOPER_TOKEN
) {
  throw new Error("Missing required settings in .env");
}

// --------------------------------------------------
// Global middleware
// --------------------------------------------------

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Clerk authentication must run before protected routers.
app.use(clerkMiddleware());

// --------------------------------------------------
// Health and home routes
// --------------------------------------------------

app.get("/", (_req, res) => {
  res.status(200).json({
    message: "Server is running",
  });
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
  });
});

// --------------------------------------------------
// Common application routes
// --------------------------------------------------

// User connections and advertising account selection.
app.use("/api/connections", connectionRouter);

// Other common feature routers will be mounted here:
// app.use("/api/accounts", accountRouter);
app.use("/api/campaigns", campaignRouter);
app.use("/api/auth", providerAuthRoutes);

// app.use("/api/reports", reportRouter);

// --------------------------------------------------
// Provider-specific API applications
// --------------------------------------------------

// app.use("/api/google-ads", googleAdsApp);
// app.use("/api/meta-ads", metaAdsApp);

// --------------------------------------------------
// 404 handler
// --------------------------------------------------

app.use((_req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

// --------------------------------------------------
// Global error handler
// --------------------------------------------------

const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
) => {
  console.error("Unhandled API error:", error);

  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    message: "Internal server error",
  });
};

app.use(errorHandler);

// --------------------------------------------------
// Server startup and shutdown
// --------------------------------------------------

async function startServer(): Promise<void> {
  let server:
    | ReturnType<typeof app.listen>
    | undefined;

  try {
    // Connect to MongoDB through the existing Mongoose
    // connection configuration.
    const database = await connectToMongoDB();

    // Temporary compatibility with the existing native
    // campaign index implementation.
    // This will move into the Campaign Mongoose model.
    // await ensureCampaignIndexes(database);

    server = app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });

    let isShuttingDown = false;

    const shutdown = (signal: string): void => {
      if (isShuttingDown) {
        return;
      }

      isShuttingDown = true;

      console.log(`${signal} received. Shutting down API server...`);

      server?.close(async (error) => {
        try {
          if (error) {
            console.error("HTTP server shutdown error:", error);
          }

          await disconnectFromMongoDB();

          console.log("API server shutdown completed.");

          if (error) {
            process.exitCode = 1;
          }
        } catch (shutdownError) {
          console.error(
            "Failed to close MongoDB connection:",
            shutdownError,
          );

          process.exitCode = 1;
        }
      });
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));

  } catch (error) {
    console.error("API startup failed:", error);

    if (server) {
      server.close();
    }

    await disconnectFromMongoDB().catch((disconnectError) => {
      console.error(
        "Failed to disconnect MongoDB after startup failure:",
        disconnectError,
      );
    });

    process.exitCode = 1;
  }
}

void startServer();