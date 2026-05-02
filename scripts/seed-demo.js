const { MongoClient } = require("mongodb");
const {
  asArray,
  demoCollections,
  fixtureLoads,
  readJson,
} = require("./lib/data-pack");
const { getMongoConfig } = require("./lib/env");

async function collectionExists(db, collectionName) {
  return db.listCollections({ name: collectionName }).hasNext();
}

async function dropIfExists(db, collectionName) {
  if (await collectionExists(db, collectionName)) {
    await db.collection(collectionName).drop();
  }
}

async function createCollections(db) {
  for (const collectionName of demoCollections) {
    if (collectionName === "bank_transactions_ts") {
      await db.createCollection(collectionName, {
        timeseries: {
          timeField: "posted_at",
          metaField: "company_id",
          granularity: "minutes",
        },
      });
      continue;
    }

    await db.createCollection(collectionName);
  }
}

async function createIndexes(db) {
  await db.collection("event_inbox").createIndex({ event_key: 1 }, { unique: true });
  await db.collection("events").createIndex({ event_key: 1 }, { unique: true });
  await db.collection("cases").createIndex({ company_id: 1, status: 1, updated_at: -1 });
  await db.collection("tasks").createIndex({ case_id: 1, status: 1, created_at: -1 });
  await db.collection("agent_runs").createIndex({ company_id: 1, case_id: 1, started_at: -1 });
  await db.collection("agent_runs").createIndex({ agent_id: 1, status: 1, started_at: -1 });
  await db.collection("retrieval_attempts").createIndex({ company_id: 1, case_id: 1, created_at: -1 });
  await db.collection("memory_chunks").createIndex({ company_id: 1, tags: 1 });
  await db.collection("cashflow_forecasts").createIndex({ case_id: 1, version: -1 });
  await db.collection("payment_run_plans").createIndex({ case_id: 1, version: -1 });
  await db.collection("decision_log").createIndex({ case_id: 1, created_at: -1 });
  await db.collection("founder_briefings").createIndex({ case_id: 1, created_at: -1 });
  await db.collection("memory_cards").createIndex({ company_id: 1, customer_id: 1, created_at: -1 });
  await db.collection("invoices").createIndex({ company_id: 1, customer_id: 1, status: 1 });
  await db.collection("supplier_bills").createIndex({ company_id: 1, due_date: 1, status: 1 });
}

function normalizeForCollection(collectionName, doc) {
  if (collectionName === "bank_transactions_ts" && typeof doc.posted_at === "string") {
    return { ...doc, posted_at: new Date(doc.posted_at) };
  }

  return doc;
}

async function loadFixtures(db) {
  const counts = new Map();

  for (const [file, collectionName] of fixtureLoads) {
    const docs = asArray(readJson(file)).map((doc) => normalizeForCollection(collectionName, doc));

    if (docs.length > 0) {
      await db.collection(collectionName).insertMany(docs, { ordered: true });
    }

    counts.set(collectionName, (counts.get(collectionName) || 0) + docs.length);
  }

  return counts;
}

async function seedDemo() {
  const { uri, dbName } = getMongoConfig();
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

  await client.connect();

  try {
    const db = client.db(dbName);

    for (const collectionName of demoCollections) {
      await dropIfExists(db, collectionName);
    }

    await createCollections(db);
    const counts = await loadFixtures(db);
    await createIndexes(db);

    console.log(`Seed complete: ${dbName}`);

    for (const collectionName of demoCollections) {
      const count = await db.collection(collectionName).countDocuments();

      if (count > 0 || counts.has(collectionName)) {
        console.log(`${collectionName}: ${count}`);
      }
    }
  } finally {
    await client.close();
  }
}

seedDemo().catch((error) => {
  console.error(`Demo seed failed: ${error.message}`);
  process.exit(1);
});
