const fs = require("node:fs");
const path = require("node:path");

const envPaths = [
  path.join(process.cwd(), ".env"),
  path.join(process.cwd(), ".env.local"),
];

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values = {};
  const contents = fs.readFileSync(filePath, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function loadLocalEnvFiles() {
  return envPaths.reduce((merged, filePath) => {
    return { ...merged, ...loadDotEnv(filePath) };
  }, {});
}

async function checkElevenLabs(env) {
  if (!env.ELEVENLABS_API_KEY) {
    return { name: "ElevenLabs", ok: false, detail: "missing ELEVENLABS_API_KEY" };
  }

  const response = await fetch("https://api.elevenlabs.io/v1/user", {
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY,
    },
  });

  return {
    name: "ElevenLabs",
    ok: response.ok,
    detail: response.ok ? "authenticated" : `HTTP ${response.status}`,
  };
}

async function checkFireworks(env) {
  if (!env.FIREWORKS_API_KEY) {
    return { name: "Fireworks", ok: false, detail: "missing FIREWORKS_API_KEY" };
  }

  const baseUrl = env.FIREWORKS_BASE_URL || "https://api.fireworks.ai/inference/v1";

  if (env.FIREWORKS_MODEL) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.FIREWORKS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.FIREWORKS_MODEL,
        messages: [{ role: "user", content: "Reply with OK." }],
        max_tokens: 4,
      }),
    });

    return {
      name: "Fireworks",
      ok: response.ok,
      detail: response.ok ? "chat completion OK" : `HTTP ${response.status}`,
    };
  }

  const response = await fetch(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${env.FIREWORKS_API_KEY}`,
    },
  });

  return {
    name: "Fireworks",
    ok: response.ok,
    detail: response.ok
      ? "authenticated; add FIREWORKS_MODEL for generation test"
      : `HTTP ${response.status}`,
  };
}

async function main() {
  const env = loadLocalEnvFiles();
  const checks = await Promise.allSettled([
    checkElevenLabs(env),
    checkFireworks(env),
  ]);

  for (const check of checks) {
    if (check.status === "rejected") {
      console.log(`FAIL provider check error: ${check.reason.message}`);
      continue;
    }

    const status = check.value.ok ? "OK" : "FAIL";

    console.log(`${status} ${check.value.name}: ${check.value.detail}`);
  }

  if (checks.some((check) => check.status === "fulfilled" && !check.value.ok)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Provider checks failed: ${error.message}`);
  process.exit(1);
});
