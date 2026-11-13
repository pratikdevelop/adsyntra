import "dotenv/config";

import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
// import { clerkMiddleware } from "@clerk/express";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { connectToMongoDB, disconnectFromMongoDB } from "./config/db.js";

import providerAuthRoutes from "./routes/provider-auth.routes.js";
import connectionRouter from "./routes/connection.router.js";
import campaignRouter from "./routes/campaign.routes.js";

const app = express();

app.disable("x-powered-by");

// --------------------------------------------------
// Global middleware
// --------------------------------------------------
// app.use(clerkMiddleware());
app.use(clerkMiddleware({ debug: true }));


app.get("/api/auth/debug", (req, res) => {
  const auth = getAuth(req);

  return res.status(200).json({
    authorizationHeaderReceived: Boolean(
      req.headers.authorization
    ),

    authorizationScheme:
      req.headers.authorization?.split(" ")[0] ?? null,

    isAuthenticated: auth.isAuthenticated,
    userId: auth.userId ?? null,
    sessionId: auth.sessionId ?? null,
    tokenType: auth.tokenType ?? null,
  });
});
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Clerk authentication must run before protected routers.

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
app.use("/api/campaigns", campaignRouter);
app.use("/api/auth", providerAuthRoutes);

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
    // Connect to MongoDB through the existing Mongoose configuration.
    await connectToMongoDB();


    server = app.listen(5000, () => {
      console.log(`Server is running on http://localhost:5000`);
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