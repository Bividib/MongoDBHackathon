import { NextResponse } from "next/server";

import { insertBankTransactionEvent, processPendingEventInbox } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LiveFeedState = {
  timer?: ReturnType<typeof setTimeout>;
  delayMs?: number;
  scheduledAt?: string;
  dueAt?: string;
};

type LiveFeedGlobal = typeof globalThis & {
  __runwayOpsLiveFeedState?: LiveFeedState;
};

function getLiveFeedState(): LiveFeedState {
  const liveFeedGlobal = globalThis as LiveFeedGlobal;

  if (!liveFeedGlobal.__runwayOpsLiveFeedState) {
    liveFeedGlobal.__runwayOpsLiveFeedState = {};
  }

  return liveFeedGlobal.__runwayOpsLiveFeedState;
}

function randomDelayMs(): number {
  const min = 30_000;
  const max = 45_000;

  return Math.floor(min + Math.random() * (max - min + 1));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function POST() {
  try {
    const state = getLiveFeedState();

    if (state.timer) {
      return NextResponse.json({
        ok: true,
        status: "already_scheduled",
        delayMs: state.delayMs,
        scheduledAt: state.scheduledAt,
        dueAt: state.dueAt
      });
    }

    const delayMs = randomDelayMs();
    const scheduledAt = new Date();
    const dueAt = new Date(scheduledAt.getTime() + delayMs);

    state.delayMs = delayMs;
    state.scheduledAt = scheduledAt.toISOString();
    state.dueAt = dueAt.toISOString();
    state.timer = setTimeout(() => {
      state.timer = undefined;

      void insertBankTransactionEvent()
        .then(() => processPendingEventInbox())
        .catch((error) => {
          console.error("Live feed bank transaction failed", error);
        });
    }, delayMs);
    state.timer.unref?.();

    return NextResponse.json({
      ok: true,
      status: "scheduled_local_timer",
      delayMs,
      scheduledAt: state.scheduledAt,
      dueAt: state.dueAt
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
