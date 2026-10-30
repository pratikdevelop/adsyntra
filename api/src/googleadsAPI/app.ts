
import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import accountRouter from "./routes/account.routes.js";
import budgetRouter from "./routes/budget.routes.js";
import campaignRouter from "./routes/campaign.routes.js";
import biddingRouter from "./routes/bidding.routes.js";
import adsGroupRouter from "./routes/adsGroup.routes.js";
import assetsRouter from './routes/assets.routes.js'
import searchTermRouter from './routes/searchTermNegativeKeywordReport.js';
import conversionRouter from './routes/conversionReport.routes.js';
import adRetrievalRouter from "./routes/adRetrieval.routes.js";

const app = express();


// Google Ads routes
app.use(biddingRouter);
app.use(adsGroupRouter);
app.use(assetsRouter);
app.use(adRetrievalRouter);

// Application routes
app.use(accountRouter);
app.use(campaignRouter);
app.use(budgetRouter);
app.use(searchTermRouter);
app.use(conversionRouter);



export default app;