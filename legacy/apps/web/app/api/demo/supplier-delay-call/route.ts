import { NextResponse } from "next/server";

import {
  outboundCallErrorMessage,
  outboundCallErrorStatus,
  recordVoiceCallOutcome,
  submitApprovedOutboundCall
} from "@/lib/elevenlabs-outbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const toNumber = process.env.CALL_TEST_TO_NUMBER || "+447379443524";
    const result = await submitApprovedOutboundCall({
      send: true,
      approvedBy: "usr_emma_marlow",
      toNumber,
      customerName: "MotionPrint Ltd",
      invoiceNumber: "MotionPrint GBP 2,400 supplier invoice",
      amountGbp: 2400,
      purpose:
        "You are calling Alex at MotionPrint Ltd. Marlow & Finch wants to use the written five-day no-penalty grace period on this week's GBP 2,400 supplier invoice so Friday payroll remains protected. Ask whether a five-day delay can be lined up, confirm the next payment timing, and keep the tone relationship-preserving. Do not claim legal authority, threaten, or take card, bank, or payment details."
    });
    const mockOutcome =
      result.conversationId && result.callSid
        ? await recordVoiceCallOutcome({
            conversationId: result.conversationId,
            callSid: result.callSid,
            customerName: "MotionPrint Ltd",
            invoiceNumber: "MotionPrint GBP 2,400 supplier invoice",
            amountGbp: 2400,
            callAnswered: true,
            outcomeStatus: "simulated_supplier_agreed_delay",
            paymentTiming: "MotionPrint agreed to use the five-day grace period and expects payment after Friday payroll clears.",
            blockers: "No blocker raised; supplier asked for written confirmation by email.",
            summary:
              "Mock outcome for demo: Alex at MotionPrint agreed to a five-day payment delay inside existing grace terms and asked for written confirmation."
          })
        : null;

    return NextResponse.json({
      ...result,
      mockOutcome
    });
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
