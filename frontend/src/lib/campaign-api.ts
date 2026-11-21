import axios, {
    type AxiosError,
} from "axios";



/* -------------------------------------------------------------------------- */
/* Error payload                                                              */
/* -------------------------------------------------------------------------- */

interface ApiErrorPayload {
    message?: string;
    error?: string;
}


const getAuthToken = async () => {
    try {
        const response = await axios.get("/api/token");

        if (!response.data) {
            console.error("User Was not Authorized");
        }

        const { token, userId } = response.data;
        return { token, userId }

    } catch (error: any) {
        return new Error(error?.message)
    }

}

/**
 * Normalize an axios failure into a readable Error.
 */
function toApiError(error: unknown): Error {
    if (axios.isAxiosError<ApiErrorPayload>(error)) {
        const axiosError = error as AxiosError<ApiErrorPayload>;
        const payload = axiosError.response?.data;

        return new Error(
            payload?.message ||
            payload?.error ||
            `Asset API request failed (${axiosError.response?.status ?? "network error"
            }).`,
        );
    }

    return error instanceof Error
        ? error
        : new Error(String(error));
}

export async function getCampaigns() {
    try {
        // Get the authenticated Clerk session
        const data: any = await getAuthToken()



        // Forward the Clerk token to your backend
        const backendUrl =
            process.env.BACKEND_API_URL || "http://localhost:5000";


        const response = await axios.get(
            `${backendUrl}/api/campaigns`,
            {
                headers: {
                    Authorization: `Bearer ${data.token}`,
                },
            }
        );

        return { data: response.data };
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(
                "Backend campaigns API error:",
                error.response?.data || error.message
            );

            return toApiError(
                error.response?.data || {
                    success: false,
                    message: "Failed to fetch campaigns",
                    status: error.response?.status || 502
                }
            );
        }

        console.error("Campaign route error:", error);

        return toApiError(
            { success: false, message: "Internal server error", status: 500 },
        );
    }
}


// export async function POST(request: Request) {
//     try {
//         const { userId, getToken } = await auth();

//         if (!userId) {
//             return NextResponse.json(
//                 { success: false, message: "Authentication required." },
//                 { status: 401 }
//             );
//         }

//         const token = await getToken();

//         if (!token) {
//             return NextResponse.json(
//                 {
//                     success: false,
//                     message: "Unable to retrieve authentication token.",
//                 },
//                 { status: 401 }
//             );
//         }

//         const payload = await request.json();

//         const backendUrl =
//             process.env.BACKEND_API_URL || "http://localhost:5000";

//         const response = await axios.post(
//             `${backendUrl}/api/campaigns`,
//             payload,
//             {
//                 headers: {
//                     Authorization: `Bearer ${token}`,
//                     "Content-Type": "application/json",
//                 },
//             }
//         );

//         return NextResponse.json(response.data, {
//             status: response.status,
//         });
//     } catch (error) {
//         if (axios.isAxiosError(error)) {
//             console.error(
//                 "Backend campaign creation error:",
//                 error.response?.data || error.message
//             );

//             return NextResponse.json(
//                 error.response?.data || {
//                     success: false,
//                     message: "Failed to create campaign.",
//                 },
//                 { status: error.response?.status || 502 }
//             );
//         }

//         console.error("Campaign creation route error:", error);

//         return NextResponse.json(
//             {
//                 success: false,
//                 message:
//                     error instanceof Error
//                         ? error.message
//                         : "Internal server error",
//             },
//             { status: 500 }
//         );
//     }
// }