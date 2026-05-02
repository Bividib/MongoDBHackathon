const { getEnvValue, loadLocalEnvFiles } = require("./lib/env");
const { maskPhoneNumber } = require("./lib/phone");

loadLocalEnvFiles();

function parseArgs(argv) {
  const args = {
    limit: "10",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

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
    status: body.status,
    duration: body.duration,
    error_code: body.error_code,
    error_message: body.error_message,
    answered_by: body.answered_by,
  };
}

async function getConversationDetails(apiKey, conversationId) {
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    return {};
  }

  const body = await response.json();
  const externalNumber = body.metadata?.phone_call?.external_number;

  return {
    accepted_time_unix_secs: body.metadata?.accepted_time_unix_secs ?? null,
    termination_reason: body.metadata?.termination_reason ?? "",
    call_sid: body.metadata?.phone_call?.call_sid,
    external_number: externalNumber ? maskPhoneNumber(externalNumber) : undefined,
    transcript_preview: Array.isArray(body.transcript)
      ? body.transcript.slice(0, 3).map((turn) => ({
          role: turn.role,
          message: turn.message,
        }))
      : [],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = getEnvValue("ELEVENLABS_API_KEY");
  const agentId = args.agent || getEnvValue("ELEVENLABS_AGENT_ID", "ELEVEN_LABS_AGENT_ID");

  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY");
  }

  if (!agentId) {
    throw new Error("Missing ELEVENLABS_AGENT_ID or ELEVEN_LABS_AGENT_ID");
  }

  const params = new URLSearchParams({
    agent_id: agentId,
    page_size: String(args.limit),
    summary_mode: "exclude",
  });
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversations?${params}`, {
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs conversation list failed: HTTP ${response.status}`);
  }

  const body = await response.json();
  const conversations = body.conversations || [];
  const rows = [];

  for (const conversation of conversations) {
    const details = await getConversationDetails(apiKey, conversation.conversation_id);
    const twilio = await getTwilioCall(details.call_sid);

    rows.push({
      conversation_id: conversation.conversation_id,
      status: conversation.status,
      call_successful: conversation.call_successful,
      duration: conversation.call_duration_secs,
      message_count: conversation.message_count,
      branch_id: conversation.branch_id,
      version_id: conversation.version_id,
      source: conversation.conversation_initiation_source,
      accepted_time_unix_secs: details.accepted_time_unix_secs,
      termination_reason: details.termination_reason,
      external_number: details.external_number,
      twilio,
      transcript_preview: details.transcript_preview,
    });
  }

  console.log(JSON.stringify(rows, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
