import { NextResponse } from "next/server";
import axios from "axios";
import { auth } from "@clerk/nextjs/server";

export async function GET(request: Request) {
  try {
    const { userId, getToken } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Authentication required." },
        { status: 401 },
      );
    }

    const token = await getToken();
    if (!token) {
      return NextResponse.json(
        { success: false, message: "Unable to retrieve authentication token." },
        { status: 401 },
      );
    }

    const backendUrl = process.env.BACKEND_API_URL || "http://localhost:5000";
    const requestUrl = new URL(request.url);
    const provider = requestUrl.searchParams.get("provider");

    const response = await axios.get(
      `${backendUrl}/api/campaign-capabilities`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: provider ? { provider } : undefined,
        timeout: 15000,
      },
    );

    return NextResponse.json(response.data, { status: response.status });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return NextResponse.json(
        error.response?.data || {
          success: false,
          message: "Unable to load campaign capability registry from the API.",
        },
        { status: error.response?.status || 502 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Internal server error.",
      },
      { status: 500 },
    );
  }
}
