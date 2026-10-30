import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

import { getProviderAccessToken } from "../services/provider-token.service.js";

/**
 * Compatibility bridge for the existing Meta route modules.
 *
 * Clerk's verified req.auth.userId is used to load this user's Meta token once
 * per request. AsyncLocalStorage keeps the token isolated between concurrent
 * requests, so legacy route handlers can continue using `await readAccessToken()`.
 * Never populate this context from a userId supplied in the request body/query.
 */
type MetaRequestContext = {
    userId: string;
    accessToken: string;
};

const metaRequestContext = new AsyncLocalStorage<MetaRequestContext>();

type ClerkRequest = Request & {
    auth?: { userId?: string };
};

export async function metaUserContextMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    const userId = (req as ClerkRequest).auth?.userId;

    if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    try {
        // Load/refresh only this authenticated user's Meta token.
        const accessToken = await getProviderAccessToken(userId, "metaAds");

        metaRequestContext.run({ userId, accessToken }, () => next());
    } catch (error) {
        res.status(401).json({
            message:
                error instanceof Error
                    ? error.message
                    : "Meta Ads is not connected. Please connect Meta Ads first.",
        });
    }
}

/**
 * Async compatibility helper used by the existing Meta routes.
 * Always await this function; it returns the token for the current request's
 * authenticated user, never a token read from a shared JSON file.
 */
export default async function readAccessToken(): Promise<string> {
    const context = metaRequestContext.getStore();

    if (!context?.accessToken) {
        throw new Error(
            "Meta access token requested outside the authenticated Meta request context.",
        );
    }

    return context.accessToken;
}
