const fs = require("node:fs");
const path = require("node:path");

const envPath = path.join(process.cwd(), ".env");

const requiredForMvp = [
  {
    names: ["MONGODB_URI", "MONGO_DB_CONNECTION"],
    label: "MongoDB Atlas connection",
  },
  {
    names: ["MONGODB_DB"],
    label: "MongoDB database name",
    fallback: "runwayops_demo",
  },
  {
    names: ["FIREWORKS_API_KEY"],
    label: "Fireworks API key",
  },
  {
    names: ["FIREWORKS_MODEL"],
    label: "Fireworks model",
    fallback: "can be added later before AI drafting/classification",
  },
  {
    names: ["ELEVENLABS_API_KEY"],
    label: "ElevenLabs API key",
  },
  {
    names: ["ELEVENLABS_VOICE_ID"],
    label: "ElevenLabs voice ID",
    fallback: "can be added later before voice briefing",
  },
  {
    names: ["VOYAGE_API_KEY"],
    label: "Voyage API key",
    fallback: "can be skipped initially with keyword/cached retrieval",
  },
];

const optionalAws = [
  "AWS_REGION",
  "AWS_EVENT_BUS_NAME",
  "AWS_S3_BUCKET",
  "API_GATEWAY_BASE_URL",
];

const optionalTracing = [
  {
    names: ["LANGCHAIN_API_KEY", "LANG_CHAIN_API_KEY"],
    label: "LangSmith/LangChain API key",
  },
  {
    names: ["LANGCHAIN_TRACING_V2"],
    label: "LangSmith tracing flag",
  },
  {
    names: ["LANGCHAIN_PROJECT"],
    label: "LangSmith project",
  },
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

function hasValue(env, names) {
  return names.some((name) => Boolean(env[name]));
}

const env = loadDotEnv(envPath);

console.log("RunwayOps environment readiness");

for (const item of requiredForMvp) {
  const ready = hasValue(env, item.names);
  const status = ready ? "OK" : "MISSING";
  const suffix = ready ? "" : item.fallback ? ` (${item.fallback})` : "";

  console.log(`${status} ${item.label}: ${item.names.join(" or ")}${suffix}`);
}

console.log("");
console.log("Optional AWS/event artifact configuration");

for (const name of optionalAws) {
  console.log(`${env[name] ? "OK" : "MISSING"} ${name}`);
}

console.log("");
console.log("Optional LangSmith tracing configuration");

for (const item of optionalTracing) {
  const ready = hasValue(env, item.names);
  const status = ready ? "OK" : "MISSING";

  console.log(`${status} ${item.label}: ${item.names.join(" or ")}`);
}
