const { getEnvValue } = require("./lib/env");
const { maskPhoneNumber, normalizePhoneNumber } = require("./lib/phone");

function parseArgs(argv) {
  const args = {};

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

function buildCallPurpose({ purpose, customerName, invoiceNumber, amountGbp }) {
  const lines = [
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
  ];

  if (customerName || invoiceNumber || amountGbp) {
    lines.push("", "Context:");
  }

  if (customerName) {
    lines.push(`- Contact/customer: ${customerName}`);
  }

  if (invoiceNumber) {
    lines.push(`- Invoice: ${invoiceNumber}`);
  }

  if (amountGbp) {
    lines.push(`- Amount: GBP ${amountGbp}`);
  }

  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = getEnvValue("ELEVENLABS_API_KEY");
  const agentId = getEnvValue("ELEVENLABS_AGENT_ID", "ELEVEN_LABS_AGENT_ID");
  const agentPhoneNumberId = getEnvValue("ELEVENLABS_AGENT_PHONE_NUMBER_ID", "ELEVEN_LABS_AGENT_PHONE_NUMBER_ID");
  const toNumber = normalizePhoneNumber(args.to || getEnvValue("CALL_TEST_TO_NUMBER"));
  const purpose = args.purpose || "Confirm payment timing for an overdue invoice and identify whether any blocker exists.";
  const customerName = args.customer || "test recipient";
  const invoiceNumber = args.invoice || "INV-1042";
  const amountGbp = args.amount || "4800";
  const prompt = buildCallPurpose({ purpose, customerName, invoiceNumber, amountGbp });
  const firstMessage =
    args["first-message"] ||
    `Hello, this is a RunwayOps test call for ${customerName}. I am calling to confirm payment timing for ${invoiceNumber}. Is now an okay time for a brief call?`;

  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY in .env");
  }

  if (!agentId) {
    throw new Error("Missing ELEVENLABS_AGENT_ID or ELEVEN_LABS_AGENT_ID in .env");
  }

  if (!agentPhoneNumberId && args.send) {
    throw new Error("Missing ELEVENLABS_AGENT_PHONE_NUMBER_ID. Run npm run elevenlabs:phones after importing a Twilio number into ElevenLabs.");
  }

  const payload = {
    agent_id: agentId,
    agent_phone_number_id: agentPhoneNumberId || "missing_agent_phone_number_id",
    to_number: toNumber,
    conversation_initiation_client_data: {
      type: "conversation_initiation_client_data",
      dynamic_variables: {
        customer_name: customerName,
        invoice_number: invoiceNumber,
        amount_gbp: amountGbp,
        call_purpose: purpose,
      },
      conversation_config_override: {
        agent: {
          prompt: {
            prompt,
          },
          first_message: firstMessage,
          language: "en",
        },
      },
    },
    call_recording_enabled: false,
  };

  if (!args.send) {
    console.log("Dry run only. Re-run with --send to place the call.");
    console.log(`Would call: ${maskPhoneNumber(toNumber)}`);
    console.log(`Agent ID configured: ${agentId ? "yes" : "no"}`);
    console.log(`Agent phone number ID configured: ${agentPhoneNumberId ? "yes" : "no"}`);
    if (!agentPhoneNumberId) {
      console.log("Missing ELEVENLABS_AGENT_PHONE_NUMBER_ID. Import a Twilio phone number or verified caller ID into ElevenLabs first.");
    }
    console.log(`Purpose: ${purpose}`);
    return;
  }

  const response = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let body;

  try {
    body = JSON.parse(responseText);
  } catch {
    body = { message: responseText };
  }

  if (!response.ok) {
    const message = body.detail || body.message || `HTTP ${response.status}`;

    throw new Error(`ElevenLabs outbound call failed: ${JSON.stringify(message)}`);
  }

  console.log(`Call submitted to ${maskPhoneNumber(toNumber)}`);
  console.log(`conversation_id=${body.conversation_id || "none"}`);
  console.log(`callSid=${body.callSid || "none"}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
