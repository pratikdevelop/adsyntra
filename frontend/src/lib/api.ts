export async function authenticatedApiRequest(
    endpoint: string,
    token: string,
    options: RequestInit = {},
) {
    const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}${endpoint}`,
        {
            ...options,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                ...options.headers,
            },
        },
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.message || `API Error: ${response.status}`,
        );
    }

    return data;
}