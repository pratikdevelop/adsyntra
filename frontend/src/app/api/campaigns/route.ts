import { NextResponse } from 'next/server';

export async function GET() {

    try {
        return NextResponse.json({ message: "Hello from the App Router API!" });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
    }
}
