const { MongoClient } = require("mongodb");
const { demoCollections } = require("./lib/data-pack");
const { getMongoConfig } = require("./lib/env");

async function dropIfExists(db, collectionName) {
  const exists = await db.listCollections({ name: collectionName }).hasNext();

  if (exists) {
    await db.collection(collectionName).drop();
  }
}

async function resetDemo() {
  const { uri, dbName } = getMongoConfig();
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

  await client.connect();

  try {
    const db = client.db(dbName);

    for (const collectionName of demoCollections) {
      await dropIfExists(db, collectionName);
    }

    console.log(`Reset complete: dropped ${demoCollections.length} demo collections from ${dbName}`);
  } finally {
    await client.close();
  }
}

resetDemo().catch((error) => {
  console.error(`Demo reset failed: ${error.message}`);
  process.exit(1);
});
