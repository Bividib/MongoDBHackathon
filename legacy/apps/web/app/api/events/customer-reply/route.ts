import { NextResponse } from "next/server";

import { insertCustomerReplyEvent, processPendingEventInbox } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function POST() {
  try {
    const eventInsert = await insertCustomerReplyEvent();
    const orchestration = await processPendingEventInbox();

    return NextResponse.json({
      ok: true,
      inserted: eventInsert.inserted,
      event: eventInsert.event,
      orchestration
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
