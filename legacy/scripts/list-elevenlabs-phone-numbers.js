const { getEnvValue } = require("./lib/env");
const { maskPhoneNumber } = require("./lib/phone");

async function main() {
  const apiKey = getEnvValue("ELEVENLABS_API_KEY");

  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY in .env");
  }

  const response = await fetch("https://api.elevenlabs.io/v1/convai/phone-numbers", {
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs phone number list failed: HTTP ${response.status}`);
  }

  const body = await response.json();
  const phoneNumbers = Array.isArray(body) ? body : body.phone_numbers || body.data || [];

  if (phoneNumbers.length === 0) {
    console.log("No ElevenLabs phone numbers found.");
    console.log("Import a Twilio number or verified caller ID into ElevenLabs, then set ELEVENLABS_AGENT_PHONE_NUMBER_ID.");
    return;
  }

  for (const phoneNumber of phoneNumbers) {
    const id = phoneNumber.phone_number_id || phoneNumber.id;
    const provider = phoneNumber.provider || "unknown";
    const number = phoneNumber.phone_number ? maskPhoneNumber(phoneNumber.phone_number) : "unknown";
    const outbound = phoneNumber.supports_outbound ?? "unknown";
    const inbound = phoneNumber.supports_inbound ?? "unknown";
    const assignedAgent = phoneNumber.assigned_agent?.agent_id || "unassigned";

    console.log(`id=${id} provider=${provider} phone=${number} outbound=${outbound} inbound=${inbound} agent=${assignedAgent}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
