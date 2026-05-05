import fs from "node:fs";
import path from "node:path";
import { MongoClient, type Db } from "mongodb";

type MongoGlobal = typeof globalThis & {
  __runwayOpsMongoClientPromise?: Promise<MongoClient>;
  __runwayOpsEnvLoaded?: boolean;
};

function loadEnvFile(filePath: string) {
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

function candidateEnvDirs() {
  const dirs = new Set<string>();
  let current = process.cwd();

  for (let depth = 0; depth < 4; depth += 1) {
    dirs.add(current);
    current = path.dirname(current);
  }

  return [...dirs];
}

function loadLocalEnv() {
  const mongoGlobal = globalThis as MongoGlobal;

  if (mongoGlobal.__runwayOpsEnvLoaded) {
    return;
  }

  for (const dir of candidateEnvDirs()) {
    loadEnvFile(path.join(dir, ".env"));
    loadEnvFile(path.join(dir, ".env.local"));
  }

  mongoGlobal.__runwayOpsEnvLoaded = true;
}

function getMongoConfig() {
  loadLocalEnv();

  const uri = process.env.MONGODB_URI || process.env.MONGO_DB_CONNECTION;
  const dbName = process.env.MONGODB_DB || "runwayops_demo";

  if (!uri) {
    throw new Error("Missing MONGODB_URI or MONGO_DB_CONNECTION");
  }

  return { uri, dbName };
}

export async function getMongoClient(): Promise<MongoClient> {
  const { uri } = getMongoConfig();
  const mongoGlobal = globalThis as MongoGlobal;

  if (!mongoGlobal.__runwayOpsMongoClientPromise) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000
    });

    mongoGlobal.__runwayOpsMongoClientPromise = client.connect();
  }

  return mongoGlobal.__runwayOpsMongoClientPromise;
}

export async function getMongoDb(): Promise<Db> {
  const { dbName } = getMongoConfig();
  const client = await getMongoClient();

  return client.db(dbName);
}
