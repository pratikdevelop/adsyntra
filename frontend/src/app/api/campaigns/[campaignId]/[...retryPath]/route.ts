
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import axios from "axios";

const ALLOWED_RETRY_ACTIONS = new Set([
    "meta/ad-set/retry",
    "meta/creative/retry",
]);

type RouteContext = {
    params: Promise<{
        campaignId: string;
        retryPath: string[];
    }>;
};

export async function POST(
    request: NextRequest,
    context: RouteContext
) {
    try {
        // Validate the campaign ID and retry operation.
        const { campaignId, retryPath } = await context.params;

        if (!/^[a-fA-F0-9]{24}$/.test(campaignId)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Invalid campaign document ID.",
                },
                { status: 400 }
            );
        }

        const retryAction = retryPath.join("/");

        // Only proxy registered retry operations.
        if (!ALLOWED_RETRY_ACTIONS.has(retryAction)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Unsupported retry operation.",
                },
                { status: 404 }
            );
        }

        // Get authenticated Clerk session.
        const { userId, getToken } = await auth();

        if (!userId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Authentication required.",
                },
                { status: 401 }
            );
        }

        const token = await getToken();

        if (!token) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Unable to retrieve authentication token.",
                },
                { status: 401 }
            );
        }

        // Read and validate JSON payload.
        let payload: unknown;

        try {
            payload = await request.json();
        } catch {
            return NextResponse.json(
                {
                    success: false,
                    message: "Invalid JSON request body.",
                },
                { status: 400 }
            );
        }

        if (
            !payload ||
            typeof payload !== "object" ||
            Array.isArray(payload)
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Request payload must be a JSON object.",
                },
                { status: 400 }
            );
        }

        const backendUrl = (
            process.env.BACKEND_API_URL ||
            "http://localhost:5000"
        ).replace(/\/+$/, "");

        const backendEndpoint =
            `${backendUrl}/api/campaigns/${campaignId}/${retryAction}`;

        // Forward request to Express backend.
        const response = await axios.post(
            backendEndpoint,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                timeout: 60000,
            }
        );

        return NextResponse.json(response.data, {
            status: response.status,
        });

    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(
                "Campaign retry API error:",
                error.response?.data || error.message
            );

            return NextResponse.json(
                error.response?.data || {
                    success: false,
                    message: "Backend API request failed.",
                },
                {
                    status: error.response?.status || 502,
                }
            );
        }

        console.error("Retry proxy error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Internal server error.",
            },
            { status: 500 }
        );
    }
}
