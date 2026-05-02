import { NextResponse } from "next/server";

import { getCaseState } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function GET() {
  try {
    const state = await getCaseState();

    return NextResponse.json(state, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: errorMessage(error)
      },
      { status: 500 }
    );
  }
}
