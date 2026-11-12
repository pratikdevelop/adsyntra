import { NextResponse } from "next/server";
import axios from "axios";
import { auth } from "@clerk/nextjs/server";


export async function GET(request: Request) {
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



        return NextResponse.json({
            token, userId
        });
    } catch (error) {

        console.error("Token Fetch API Failed:", error);

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