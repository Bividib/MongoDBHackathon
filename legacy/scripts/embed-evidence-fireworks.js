const crypto = require("node:crypto");
const { MongoClient } = require("mongodb");
const { asArray, readJson } = require("./lib/data-pack");
const { getMongoConfig, loadLocalEnvFiles } = require("./lib/env");
const {
  embedTexts,
  getFireworksEmbeddingConfig,
} = require("./lib/fireworks-embeddings");

loadLocalEnvFiles();

const EVIDENCE_COLLECTION = process.env.RUNWAYOPS_EVIDENCE_COLLECTION || "memory_chunks";
const EVIDENCE_FIXTURE = "data/fixtures/evidence_chunks_seed.json";
const EMBEDDING_FIELD = process.env.RUNWAYOPS_VECTOR_FIELD || "embedding";
const TEXT_FIELD = "text";
const DEFAULT_BATCH_SIZE = 8;

function parseArgs(argv) {
  const args = {
    force: false,
    limit: undefined,
  };

  for (const arg of argv) {
    if (arg === "--force") {
      args.force = true;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length));

      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("--limit must be a positive integer");
      }

      args.limit = value;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function parseBatchSize() {
  const raw = process.env.FIREWORKS_EMBEDDING_BATCH_SIZE;

  if (!raw) {
    return DEFAULT_BATCH_SIZE;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("FIREWORKS_EMBEDDING_BATCH_SIZE must be a positive integer");
  }

  return value;
}

function textHash(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function readSeededEvidenceChunks() {
  return asArray(readJson(EVIDENCE_FIXTURE)).filter((doc) => {
    return typeof doc?._id === "string" && typeof doc?.[TEXT_FIELD] === "string";
  });
}

async function syncFixtureChunks(collection, chunks) {
  let synced = 0;

  for (const chunk of chunks) {
    const { _id, ...fields } = chunk;
    await collection.updateOne(
      { _id },
      {
        $set: fields,
        $setOnInsert: { _id },
      },
      { upsert: true }
    );
    synced += 1;
  }

  return synced;
}

function hasCurrentEmbedding(doc, model) {
  return (
    Array.isArray(doc[EMBEDDING_FIELD]) &&
    doc[EMBEDDING_FIELD].length > 0 &&
    doc.embedding_provider === "fireworks" &&
    doc.embedding_model === model &&
    doc.embedding_text_field === TEXT_FIELD &&
    doc.embedding_text_hash === textHash(doc[TEXT_FIELD])
  );
}

async function loadEvidenceDocs(collection, limit) {
  const cursor = collection
    .find({ [TEXT_FIELD]: { $type: "string", $ne: "" } })
    .sort({ _id: 1 });

  if (limit) {
    cursor.limit(limit);
  }

  return cursor.toArray();
}

async function embedPendingDocs(collection, pendingDocs, config, batchSize) {
  let embedded = 0;
  let vectorDimension = null;
  let modelUsed = config.embeddingModel;
  let modelResponse = null;

  for (let index = 0; index < pendingDocs.length; index += batchSize) {
    const batch = pendingDocs.slice(index, index + batchSize);
    const result = await embedTexts(
      batch.map((doc) => doc[TEXT_FIELD]),
      config
    );

    modelResponse = result.model;

    for (let offset = 0; offset < batch.length; offset += 1) {
      const doc = batch[offset];
      const embedding = result.embeddings[offset];
      const dimension = embedding.length;

      if (vectorDimension === null) {
        vectorDimension = dimension;
      } else if (vectorDimension !== dimension) {
        throw new Error(
          `Embedding dimension mismatch: saw ${dimension}, expected ${vectorDimension}`
        );
      }

      const setFields = {
        [EMBEDDING_FIELD]: embedding,
        embedding_provider: "fireworks",
        embedding_model: modelUsed,
        embedding_dimension: dimension,
        embedding_text_field: TEXT_FIELD,
        embedding_text_hash: textHash(doc[TEXT_FIELD]),
        embedded_at: new Date().toISOString(),
      };
      const update = { $set: setFields };

      if (modelResponse && modelResponse !== modelUsed) {
        update.$set.embedding_model_response = modelResponse;
      } else {
        update.$unset = { embedding_model_response: "" };
      }

      await collection.updateOne({ _id: doc._id }, update);
      embedded += 1;
    }
  }

  return { embedded, modelUsed, modelResponse, vectorDimension };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = getFireworksEmbeddingConfig();
  const { uri, dbName } = getMongoConfig();
  const batchSize = parseBatchSize();
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

  await client.connect();

  try {
    const db = client.db(dbName);
    const collection = db.collection(EVIDENCE_COLLECTION);
    const fixtureChunks = readSeededEvidenceChunks();
    const synced = await syncFixtureChunks(collection, fixtureChunks);
    const docs = await loadEvidenceDocs(collection, args.limit);
    const pendingDocs = args.force
      ? docs
      : docs.filter((doc) => !hasCurrentEmbedding(doc, config.embeddingModel));
    const existingDocWithEmbedding = docs.find((doc) => Array.isArray(doc[EMBEDDING_FIELD]));
    const existingDimension = existingDocWithEmbedding?.[EMBEDDING_FIELD]?.length;
    const result = await embedPendingDocs(collection, pendingDocs, config, batchSize);
    const vectorDimension = result.vectorDimension || existingDimension || null;

    console.log(
      JSON.stringify(
        {
          status: "ok",
          db: dbName,
          collection: EVIDENCE_COLLECTION,
          fixture_chunks_synced: synced,
          evidence_docs_seen: docs.length,
          evidence_docs_embedded: result.embedded,
          evidence_docs_skipped: docs.length - pendingDocs.length,
          embedding_provider: "fireworks",
          embedding_model: result.modelUsed,
          embedding_model_response:
            result.modelResponse && result.modelResponse !== result.modelUsed
              ? result.modelResponse
              : undefined,
          vector_field: EMBEDDING_FIELD,
          vector_dimension: vectorDimension,
          text_field_used: TEXT_FIELD,
        },
        null,
        2
      )
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`Fireworks evidence embedding failed: ${error.message}`);
  process.exit(1);
});
