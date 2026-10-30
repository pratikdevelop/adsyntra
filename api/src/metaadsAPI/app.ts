import "dotenv/config";
import express from "express";

import readAccessToken, { metaUserContextMiddleware } from "./config.js";

import authRoutes from "./routes/auth.routes.js";
import metaRoutes from "./routes/meta.routes.js";
import campaignRoutes from "./routes/campaign.routes.js";
import adSetRoutes from "./routes/adset.routes.js";
import biddingRoutes from "./routes/bidding.routes.js";
import performanceGoalRoutes from "./routes/performance-goal.routes.js";
import billingEventRoutes from "./routes/billing-event.routes.js";
import adsetConfigurationRoutes from "./routes/adset-configuration.routes.js";
import adImagesRouter from "./routes/adimages.routes.js";
import adCreativesRouter from "./routes/adcreatives.routes.js";
import videoUploadRoutes from "./routes/video-upload.routes.js";
import adsRouter from "./routes/ad.routes.js";
import insightsRoutes from "./routes/insights.routes.js";
import { createAudienceModuleRouter } from "./routes/audience-module.routes.js";
import metaPixelRoutes from "./routes/pixels.routes.js";
import conversionsRoutes from "./routes/conversions.routes.js";

const app = express();

// OAuth routes must be mounted before the user-context middleware because
// Meta's callback arrives without a Clerk Authorization header. The signed
// OAuth state identifies the user who started the connection.
app.use(authRoutes);

// Every remaining Meta API route is user-scoped. The middleware reads the
// verified Clerk req.auth()?.userId and creates an async request context used by
// legacy routes that still call `await readAccessToken()`.
app.use(metaUserContextMiddleware);

app.use(metaRoutes);
app.use(campaignRoutes);
app.use(adSetRoutes);
app.use(biddingRoutes);
app.use(performanceGoalRoutes);
app.use(billingEventRoutes);
app.use(adsetConfigurationRoutes);
app.use(adImagesRouter);
app.use(adCreativesRouter);
app.use(videoUploadRoutes);
app.use(adsRouter);
app.use(insightsRoutes);
app.use(metaPixelRoutes);
app.use(conversionsRoutes);
app.use(createAudienceModuleRouter(readAccessToken));

export default app;
