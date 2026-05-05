const { getEnvValue } = require("./lib/env");

async function main() {
  const apiKey = getEnvValue("ELEVENLABS_API_KEY");
  const agentId = getEnvValue("ELEVENLABS_AGENT_ID", "ELEVEN_LABS_AGENT_ID");
  const phoneNumberId = getEnvValue("ELEVENLABS_AGENT_PHONE_NUMBER_ID", "ELEVEN_LABS_AGENT_PHONE_NUMBER_ID");

  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY in .env");
  }

  if (!agentId) {
    throw new Error("Missing ELEVENLABS_AGENT_ID or ELEVEN_LABS_AGENT_ID in .env");
  }

  if (!phoneNumberId) {
    throw new Error("Missing ELEVENLABS_AGENT_PHONE_NUMBER_ID or ELEVEN_LABS_AGENT_PHONE_NUMBER_ID in .env");
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/convai/phone-numbers/${phoneNumberId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      agent_id: agentId,
    }),
  });

  const responseText = await response.text();
  let body;

  try {
    body = JSON.parse(responseText);
  } catch {
    body = { message: responseText };
  }

  if (!response.ok) {
    throw new Error(`ElevenLabs phone assignment failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  }

  const assignedAgent = body.assigned_agent?.agent_id || "unknown";

  console.log(`Assigned ElevenLabs phone number to agent: ${assignedAgent}`);
  console.log(`Phone number outbound support: ${body.supports_outbound}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
