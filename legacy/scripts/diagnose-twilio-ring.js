const { getEnvValue, loadLocalEnvFiles } = require("./lib/env");
const { maskPhoneNumber, normalizePhoneNumber } = require("./lib/phone");

loadLocalEnvFiles();

function parseArgs(argv) {
  const args = {
    wait: "30",
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

function formEncode(value) {
  return new URLSearchParams(value).toString();
}

async function sleep(seconds) {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function getCall(accountSid, authToken, callSid) {
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
    start_time: body.start_time,
    end_time: body.end_time,
    error_code: body.error_code,
    error_message: body.error_message,
    answered_by: body.answered_by,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const accountSid = getEnvValue("TWILIO_ACCOUNT_SID");
  const authToken = getEnvValue("TWILIO_AUTH_TOKEN");
  const from = normalizePhoneNumber(args.from || getEnvValue("TWILIO_PHONE_NUMBER"));
  const to = normalizePhoneNumber(args.to || getEnvValue("CALL_TEST_TO_NUMBER"));

  if (!accountSid || !authToken) {
    throw new Error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
  }

  const twiml = args.twiml || "<Response><Say voice=\"alice\">RunwayOps Twilio ring test. This call is not using ElevenLabs.</Say><Pause length=\"5\"/></Response>";
  const payload = {
    From: from,
    To: to,
    Twiml: twiml,
  };

  console.log(`Dry run: ${args.send ? "no" : "yes"}`);
  console.log(
    JSON.stringify(
      {
        ...payload,
        From: maskPhoneNumber(from),
        To: maskPhoneNumber(to),
      },
      null,
      2
    )
  );

  if (!args.send) {
    console.log("No call placed. Re-run with --send to test Twilio-only ringing.");
    return;
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formEncode(payload),
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`Twilio call failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  }

  console.log(
    JSON.stringify(
      {
        sid: body.sid,
        status: body.status,
        from: maskPhoneNumber(from),
        to: maskPhoneNumber(to),
      },
      null,
      2
    )
  );

  await sleep(Number(args.wait));
  console.log(JSON.stringify(await getCall(accountSid, authToken, body.sid), null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
