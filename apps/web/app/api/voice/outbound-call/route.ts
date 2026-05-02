import { NextResponse } from "next/server";

import {
  outboundCallErrorMessage,
  outboundCallErrorStatus,
  submitApprovedOutboundCall
} from "@/lib/elevenlabs-outbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await submitApprovedOutboundCall(body);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: outboundCallErrorMessage(error)
      },
      { status: outboundCallErrorStatus(error) }
    );
  }
}
