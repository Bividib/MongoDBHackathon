const fs = require("node:fs");
const path = require("node:path");
const { MongoClient } = require("mongodb");

const envPath = path.join(process.cwd(), ".env");

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

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

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function redactConnectionDetails(message) {
  return message
    .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[redacted MongoDB URI]")
    .replace(/\/\/[^:\s]+:[^@\s]+@/g, "//[redacted credentials]@");
}

async function main() {
  loadDotEnv(envPath);

  const uri = process.env.MONGODB_URI || process.env.MONGO_DB_CONNECTION;

  if (!uri) {
    throw new Error("Missing MONGODB_URI or MONGO_DB_CONNECTION in .env");
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  try {
    await client.connect();
    const result = await client.db("admin").command({ ping: 1 });

    if (result.ok !== 1) {
      throw new Error("MongoDB ping returned an unexpected response");
    }

    console.log("MongoDB connection OK");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MongoDB connection failed: ${redactConnectionDetails(message)}`);
  process.exit(1);
});
