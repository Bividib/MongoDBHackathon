const { getEnvValue } = require("./lib/env");
const { parseEnvLines, readEnvLines, upsertEnvValue } = require("./lib/env-file");
const { maskPhoneNumber } = require("./lib/phone");

async function listPhoneNumbers(apiKey) {
  const response = await fetch("https://api.elevenlabs.io/v1/convai/phone-numbers", {
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs phone number list failed: HTTP ${response.status}`);
  }

  const body = await response.json();

  return Array.isArray(body) ? body : body.phone_numbers || body.data || [];
}

function findMatchingPhoneNumber(phoneNumbers, twilioPhoneNumber) {
  return phoneNumbers.find((phoneNumber) => phoneNumber.phone_number === twilioPhoneNumber);
}

async function importPhoneNumber({ apiKey, twilioPhoneNumber, label, sid, token }) {
  const response = await fetch("https://api.elevenlabs.io/v1/convai/phone-numbers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      phone_number: twilioPhoneNumber,
      label,
      sid,
      token,
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
    throw new Error(`ElevenLabs Twilio import failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  }

  return body.phone_number_id;
}

async function main() {
  const env = parseEnvLines(readEnvLines());
  const apiKey = getEnvValue("ELEVENLABS_API_KEY");
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = env.TWILIO_PHONE_NUMBER;
  const label = env.TWILIO_PHONE_LABEL || "RunwayOps Demo";

  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY in .env");
  }

  if (!sid || !token || !twilioPhoneNumber) {
    throw new Error("Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER in .env");
  }

  const existingPhoneNumbers = await listPhoneNumbers(apiKey);
  const existing = findMatchingPhoneNumber(existingPhoneNumbers, twilioPhoneNumber);

  if (existing?.phone_number_id) {
    upsertEnvValue("ELEVENLABS_AGENT_PHONE_NUMBER_ID", existing.phone_number_id);
    console.log(`ElevenLabs phone number already imported: ${maskPhoneNumber(twilioPhoneNumber)}`);
    console.log("Updated ELEVENLABS_AGENT_PHONE_NUMBER_ID in .env");
    return;
  }

  const phoneNumberId = await importPhoneNumber({
    apiKey,
    twilioPhoneNumber,
    label,
    sid,
    token,
  });

  upsertEnvValue("ELEVENLABS_AGENT_PHONE_NUMBER_ID", phoneNumberId);

  console.log(`Imported Twilio number into ElevenLabs: ${maskPhoneNumber(twilioPhoneNumber)}`);
  console.log("Updated ELEVENLABS_AGENT_PHONE_NUMBER_ID in .env");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
