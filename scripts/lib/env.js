const fs = require("node:fs");
const path = require("node:path");

function loadDotEnv(filePath = path.join(process.cwd(), ".env")) {
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

function loadLocalEnvFiles() {
  loadDotEnv(path.join(process.cwd(), ".env"));
  loadDotEnv(path.join(process.cwd(), ".env.local"));
}

function getMongoConfig() {
  loadLocalEnvFiles();

  const uri = process.env.MONGODB_URI || process.env.MONGO_DB_CONNECTION;
  const dbName = process.env.MONGODB_DB || "runwayops_demo";

  if (!uri) {
    throw new Error("Missing MONGODB_URI or MONGO_DB_CONNECTION in .env or .env.local");
  }

  return { uri, dbName };
}

function getEnvValue(...names) {
  loadDotEnv();

  for (const name of names) {
    if (process.env[name]) {
      return process.env[name];
    }
  }

  return undefined;
}

module.exports = {
  getEnvValue,
  getMongoConfig,
  loadDotEnv,
  loadLocalEnvFiles,
};
