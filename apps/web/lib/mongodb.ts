import { MongoClient, type Db } from "mongodb";

type MongoGlobal = typeof globalThis & {
  __runwayOpsMongoClientPromise?: Promise<MongoClient>;
};

function getMongoConfig() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;

  if (!uri) {
    throw new Error("Missing MONGODB_URI");
  }

  if (!dbName) {
    throw new Error("Missing MONGODB_DB");
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
