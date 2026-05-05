type FireworksCompletionRequest = {
  cacheKey?: string;
  prompt: string;
  system?: string;
};

type FireworksCompletion = {
  text: string;
  provider: "fixture-cache" | "fireworks";
  cached: boolean;
};

const cachedCompletions: Record<string, string> = {
  northstar_reply_classification: JSON.stringify({
    classification: "conditional_promise",
    confidence: 0.48,
    is_guaranteed_cash: false,
    reason: "Payment depends on PO re-approval."
  }),
  founder_briefing_case_0508_v3:
    "Payroll remains under watch. Cash is now GBP 9,600 after the Harbour Labs retainer. If Northstar pays Friday and MotionPrint is held until after payroll, the case ends with GBP 800 remaining. If Northstar slips, Friday remains short by GBP 1,600. Approval is required before customer messages or supplier timing changes."
};

export function getCachedFireworksCompletion(cacheKey: string): FireworksCompletion | null {
  const text = cachedCompletions[cacheKey];

  if (!text) {
    return null;
  }

  return {
    text,
    provider: "fixture-cache",
    cached: true
  };
}

export function liveFireworksEnabled(): boolean {
  return (
    process.env.RUNWAYOPS_ENABLE_LIVE_LLM === "1" &&
    Boolean(process.env.FIREWORKS_API_KEY) &&
    Boolean(process.env.FIREWORKS_MODEL)
  );
}

export async function completeWithFireworks(
  request: FireworksCompletionRequest
): Promise<FireworksCompletion | null> {
  if (request.cacheKey) {
    const cached = getCachedFireworksCompletion(request.cacheKey);

    if (cached) {
      return cached;
    }
  }

  if (!liveFireworksEnabled()) {
    return null;
  }

  const response = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.FIREWORKS_MODEL,
      messages: [
        ...(request.system ? [{ role: "system", content: request.system }] : []),
        { role: "user", content: request.prompt }
      ],
      temperature: 0.1
    })
  });

  if (!response.ok) {
    throw new Error(`Fireworks request failed with status ${response.status}`);
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = body.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("Fireworks response did not include text");
  }

  return {
    text,
    provider: "fireworks",
    cached: false
  };
}
