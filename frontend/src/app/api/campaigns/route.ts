import { NextResponse } from "next/server";
import axios from "axios";
import { auth } from "@clerk/nextjs/server";

export async function GET(request: Request) {
    try {
        // Get the authenticated Clerk session
        const { userId, getToken } = await auth();

        if (!userId) {
            return NextResponse.json(
                { success: false, message: "Authentication required." },
                { status: 401 }
            );
        }

        const token = await getToken();

        if (!token) {
            return NextResponse.json(
                { success: false, message: "Unable to retrieve authentication token." },
                { status: 401 }
            );
        }

        console.log({
            tokenGenerated: Boolean(token),
            tokenStartsWithBearer: token?.startsWith("Bearer "),
            jwtParts: token?.split(".").length,
        });

        // if (token) {
        //     await navigator.clipboard.writeText(token);
        //     console.log("Fresh token copied.");
        // }


        // Forward the Clerk token to your backend
        const backendUrl =
            process.env.BACKEND_API_URL || "http://localhost:5000";

        const url = new URL(request.url);

        const response = await axios.get(
            `${backendUrl}/api/campaigns`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                params: {
                    googlePageToken:
                        url.searchParams.get("googlePageToken") || undefined,
                    metaPageToken:
                        url.searchParams.get("metaPageToken") || undefined,
                    datePreset:
                        url.searchParams.get("datePreset") || "LAST_30_DAYS",
                },
            }
        );

        return NextResponse.json(response.data);
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(
                "Backend campaigns API error:",
                error.response?.data || error.message
            );

            return NextResponse.json(
                error.response?.data || {
                    success: false,
                    message: "Failed to fetch campaigns",
                },
                { status: error.response?.status || 502 }
            );
        }

        console.error("Campaign route error:", error);

        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}


export async function POST(request: Request) {
    try {
        const { userId, getToken } = await auth();

        if (!userId) {
            return NextResponse.json(
                { success: false, message: "Authentication required." },
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

        const payload = await request.json();

        const backendUrl =
            process.env.BACKEND_API_URL || "http://localhost:5000";

        const response = await axios.post(
            `${backendUrl}/api/campaigns`,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            }
        );

        return NextResponse.json(response.data, {
            status: response.status,
        });
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(
                "Backend campaign creation error:",
                error.response?.data || error.message
            );

            return NextResponse.json(
                error.response?.data || {
                    success: false,
                    message: "Failed to create campaign.",
                },
                { status: error.response?.status || 502 }
            );
        }

        console.error("Campaign creation route error:", error);

        return NextResponse.json(
            {
                success: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "Internal server error",
            },
            { status: 500 }
        );
    }
}