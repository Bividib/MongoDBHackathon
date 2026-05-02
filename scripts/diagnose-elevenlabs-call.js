const { getEnvValue, loadLocalEnvFiles } = require("./lib/env");
const { maskPhoneNumber, normalizePhoneNumber } = require("./lib/phone");

loadLocalEnvFiles();

function parseArgs(argv) {
  const args = {
    mode: "minimal",
    wait: 35,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--send") {
      args.send = true;
      continue;
    }

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[index + 1];

      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for --${key}`);
      }

      args[key] = value;
      index += 1;
    }
  }

  return args;
}

function redactPayload(payload) {
  return {
    ...payload,
    to_number: payload.to_number ? maskPhoneNumber(payload.to_number) : payload.to_number,
  };
}

function buildPrompt({ purpose, customerName, invoiceNumber, amountGbp }) {
  return [
    "You are calling on behalf of RunwayOps for a controlled hackathon demo.",
    "Purpose of the call:",
    purpose,
    "",
    "Important boundaries:",
    "- Identify this as a demo/test call if asked.",
    "- Do not claim to be a lawyer, debt collector, accountant, bank, or regulated financial adviser.",
    "- Do not threaten penalties, legal action, credit consequences, or service suspension.",
    "- Do not take card details, bank details, or payments.",
    "- Ask only for payment timing confirmation and whether any blocker exists.",
    "- If the person says this is inconvenient, apologise and end the call.",
    "",
    "Context:",
    `- Contact/customer: ${customerName}`,
    `- Invoice: ${invoiceNumber}`,
    `- Amount: GBP ${amountGbp}`,
  ].join("\n");
}

function buildPayload(args) {
  const agentId = getEnvValue("ELEVENLABS_AGENT_ID", "ELEVEN_LABS_AGENT_ID");
  const agentPhoneNumberId = getEnvValue(
    "ELEVENLABS_AGENT_PHONE_NUMBER_ID",
    "ELEVEN_LABS_AGENT_PHONE_NUMBER_ID"
  );
  const toNumber = normalizePhoneNumber(args.to || getEnvValue("CALL_TEST_TO_NUMBER"));
  const customerName = args.customer || "Test recipient";
  const invoiceNumber = args.invoice || "INV-1042";
  const amountGbp = args.amount || "4800";
  const purpose =
    args.purpose ||
    "RunwayOps outbound call test. This confirms the payment-timing call flow and should proceed after any Twilio trial prompt.";
  const firstMessage =
    args["first-message"] ||
    `Hello, this is a RunwayOps test call for ${customerName}. I am calling to confirm payment timing for ${invoiceNumber}. Is now an okay time for a brief call?`;

  if (!agentId) {
    throw new Error("Missing ELEVENLABS_AGENT_ID or ELEVEN_LABS_AGENT_ID");
  }

  if (!agentPhoneNumberId) {
    throw new Error("Missing ELEVENLABS_AGENT_PHONE_NUMBER_ID or ELEVEN_LABS_AGENT_PHONE_NUMBER_ID");
  }

  const payload = {
    agent_id: agentId,
    agent_phone_number_id: agentPhoneNumberId,
    to_number: toNumber,
  };

  if (args.mode === "minimal") {
    return payload;
  }

  if (args.mode === "recording-minimal") {
    return {
      ...payload,
      call_recording_enabled: false,
    };
  }

  const clientData = {
    dynamic_variables: {
      customer_name: customerName,
      invoice_number: invoiceNumber,
      amount_gbp: amountGbp,
      call_purpose: purpose,
    },
  };

  if (args.mode !== "medible-shape" && args.mode !== "prompt-no-type") {
    clientData.type = "conversation_initiation_client_data";
  }

  if (args.branch) {
    clientData.branch_id = args.branch;
  }

  if (args.version) {
    clientData.version_id = args.version;
  }

  if (args.mode === "dynamic-only") {
    return {
      ...payload,
      conversation_initiation_client_data: clientData,
      call_recording_enabled: false,
    };
  }

  if (args.mode === "prompt-no-type" || args.mode === "medible-shape") {
    return {
      ...payload,
      conversation_initiation_client_data: {
        ...clientData,
        conversation_config_override: {
          agent: {
            first_message: firstMessage,
            language: "en",
            prompt: {
              prompt: buildPrompt({ purpose, customerName, invoiceNumber, amountGbp }),
            },
          },
        },
      },
      call_recording_enabled: false,
    };
  }

  if (args.mode === "first-message-only") {
    return {
      ...payload,
      conversation_initiation_client_data: {
        ...clientData,
        conversation_config_override: {
          agent: {
            first_message: firstMessage,
            language: "en",
          },
        },
      },
      call_recording_enabled: false,
    };
  }

  if (args.mode === "legacy" || args.mode === "override") {
    return {
      ...payload,
      conversation_initiation_client_data: {
        ...clientData,
        conversation_config_override: {
          agent: {
            prompt: {
              prompt: buildPrompt({ purpose, customerName, invoiceNumber, amountGbp }),
            },
            first_message: firstMessage,
            language: "en",
          },
        },
      },
      call_recording_enabled: false,
    };
  }

  throw new Error(
    "Unknown --mode. Use minimal, recording-minimal, dynamic-only, first-message-only, legacy, override, prompt-no-type, or medible-shape."
  );
}

async function postOutboundCall(apiKey, payload) {
  const response = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body;

  try {
    body = JSON.parse(text);
  } catch {
    body = { message: text };
  }

  if (!response.ok) {
    throw new Error(`ElevenLabs outbound call failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  }

  return body;
}

async function getConversation(apiKey, conversationId) {
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    return { lookup_status: response.status };
  }

  const body = await response.json();

  return {
    lookup_status: response.status,
    status: body.status,
    branch_id: body.branch_id,
    version_id: body.version_id,
    accepted_time_unix_secs: body.metadata?.accepted_time_unix_secs ?? null,
    call_duration_secs: body.metadata?.call_duration_secs ?? null,
    termination_reason: body.metadata?.termination_reason ?? "",
    has_audio: body.has_audio,
    has_user_audio: body.has_user_audio,
    has_response_audio: body.has_response_audio,
    transcript_turns: Array.isArray(body.transcript) ? body.transcript.length : null,
    call_sid: body.metadata?.phone_call?.call_sid,
  };
}

async function getTwilioCall(callSid) {
  const accountSid = getEnvValue("TWILIO_ACCOUNT_SID");
  const authToken = getEnvValue("TWILIO_AUTH_TOKEN");

  if (!accountSid || !authToken || !callSid) {
    return null;
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    }
  );

  if (!response.ok) {
    return { lookup_status: response.status };
  }

  const body = await response.json();

  return {
    lookup_status: response.status,
    status: body.status,
    duration: body.duration,
    start_time: body.start_time,
    end_time: body.end_time,
    error_code: body.error_code,
    error_message: body.error_message,
    answered_by: body.answered_by,
  };
}

async function sleep(seconds) {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = getEnvValue("ELEVENLABS_API_KEY");
  const payload = buildPayload(args);

  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY");
  }

  console.log(`Mode: ${args.mode}`);
  console.log(`Dry run: ${args.send ? "no" : "yes"}`);
  console.log("Payload preview:");
  console.log(JSON.stringify(redactPayload(payload), null, 2));

  if (!args.send) {
    console.log("No call placed. Re-run with --send when the test phone is ready.");
    return;
  }

  const submitted = await postOutboundCall(apiKey, payload);
  const conversationId = submitted.conversation_id;
  const callSid = submitted.callSid || submitted.call_sid || submitted.twilio_call_sid;

  console.log("Submitted:");
  console.log(
    JSON.stringify(
      {
        conversation_id: conversationId,
        callSid,
        to_number: maskPhoneNumber(payload.to_number),
      },
      null,
      2
    )
  );

  if (args.wait !== "0" && conversationId) {
    await sleep(Number(args.wait));
    const conversation = await getConversation(apiKey, conversationId);
    const twilio = await getTwilioCall(callSid || conversation.call_sid);

    console.log("Post-call status:");
    console.log(JSON.stringify({ conversation, twilio }, null, 2));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
