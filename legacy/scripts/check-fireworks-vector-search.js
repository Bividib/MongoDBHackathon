const { MongoClient } = require("mongodb");
const { embedText, getFireworksEmbeddingConfig } = require("./lib/fireworks-embeddings");
const { getMongoConfig, loadLocalEnvFiles } = require("./lib/env");

loadLocalEnvFiles();

const QUERY = "Northstar INV-1042 Friday PO re-approved payment promise";
const COMPANY_ID = process.env.RUNWAYOPS_COMPANY_ID || "cmp_marlow_finch";
const CASE_ID = process.env.RUNWAYOPS_CASE_ID || "case_payroll_2026_05_08";
const EVIDENCE_COLLECTION = process.env.RUNWAYOPS_EVIDENCE_COLLECTION || "memory_chunks";
const VECTOR_FIELD = process.env.RUNWAYOPS_VECTOR_FIELD || "embedding";
const VECTOR_INDEX = process.env.MONGODB_VECTOR_INDEX || "memory_chunks_embedding_vector_index";
const DEFAULT_LIMIT = 6;
const DEFAULT_NUM_CANDIDATES = 100;

function parseArgs(argv) {
  const args = {
    storeAttempt: false,
  };

  for (const arg of argv) {
    if (arg === "--store-attempt") {
      args.storeAttempt = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function parsePositiveInteger(value, fallback, label) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return parsed;
}

function atlasIndexDefinition(vectorDimension) {
  return {
    fields: [
      {
        type: "vector",
        path: VECTOR_FIELD,
        numDimensions: vectorDimension,
        similarity: "cosine",
      },
      {
        type: "filter",
        path: "company_id",
      },
    ],
  };
}

function summarizeMatch(result) {
  return {
    id: String(result._id),
    score:
      typeof result.score === "number" ? Number(result.score.toFixed(6)) : result.score,
    tags: result.tags || [],
    source_file_id: result.source_file_id,
    source_collection: result.source_collection,
    source_document_id: result.source_document_id,
    embedding_model: result.embedding_model,
    embedding_dimension: result.embedding_dimension,
    text_preview:
      typeof result.text === "string" && result.text.length > 220
        ? `${result.text.slice(0, 217)}...`
        : result.text,
  };
}

function includesText(result, ...needles) {
  const text = [
    result._id,
    result.text,
    result.source_file_id,
    result.source_collection,
    result.source_document_id,
    ...(Array.isArray(result.tags) ? result.tags : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return needles.every((needle) => text.includes(needle.toLowerCase()));
}

function expectedMatches(results) {
  return {
    northstar_payment_memory: results.some((result) => {
      return String(result._id) === "chunk_northstar_po_memory";
    }),
    northstar_email_thread: results.some((result) => {
      return (
        String(result._id) === "thread_northstar_inv_1042" ||
        result.source_document_id === "thread_northstar_inv_1042"
      );
    }),
    inv_1042_evidence: results.some((result) => {
      return String(result._id) === "chunk_inv_1042_evidence" || includesText(result, "inv-1042");
    }),
    supplier_x_grace_terms: results.some((result) => {
      return (
        String(result._id) === "chunk_motionprint_grace" ||
        includesText(result, "supplier x") ||
        includesText(result, "motionprint", "grace")
      );
    }),
  };
}

function isVectorSearchSetupError(error) {
  const message = String(error?.message || "").toLowerCase();

  return (
    message.includes("$vectorsearch") ||
    message.includes("vector search") ||
    message.includes("search index") ||
    message.includes("index") ||
    message.includes("embedding") ||
    message.includes("mongot") ||
    message.includes("localhost:28000")
  );
}

async function runVectorSearch(collection, queryEmbedding, limit, numCandidates) {
  return collection
    .aggregate([
      {
        $vectorSearch: {
          index: VECTOR_INDEX,
          path: VECTOR_FIELD,
          queryVector: queryEmbedding,
          numCandidates,
          limit,
          filter: {
            company_id: COMPANY_ID,
          },
        },
      },
      {
        $project: {
          _id: 1,
          score: { $meta: "vectorSearchScore" },
          company_id: 1,
          text: 1,
          tags: 1,
          entity_ids: 1,
          source_file_id: 1,
          source_collection: 1,
          source_document_id: 1,
          embedding_provider: 1,
          embedding_model: 1,
          embedding_dimension: 1,
        },
      },
    ])
    .toArray();
}

async function maybeStoreAttempt(db, summary) {
  const insert = {
    company_id: COMPANY_ID,
    case_id: CASE_ID,
    query: summary.query,
    strategy: summary.strategy,
    embedding_provider: summary.embedding_provider,
    embedding_model: summary.embedding_model,
    vector_index: summary.vector_index,
    vector_field: summary.vector_field,
    vector_dimension: summary.vector_dimension,
    top_evidence_ids: summary.top_evidence_ids,
    expected_matches: summary.expected_matches,
    sufficient: summary.sufficient,
    created_at: new Date().toISOString(),
  };

  if (summary.embedding_model_response) {
    insert.embedding_model_response = summary.embedding_model_response;
  }

  const result = await db.collection("retrieval_attempts").insertOne(insert);

  return String(result.insertedId);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = getFireworksEmbeddingConfig();
  const { uri, dbName } = getMongoConfig();
  const limit = parsePositiveInteger(process.env.RUNWAYOPS_VECTOR_LIMIT, DEFAULT_LIMIT, "RUNWAYOPS_VECTOR_LIMIT");
  const numCandidates = Math.max(
    parsePositiveInteger(
      process.env.RUNWAYOPS_VECTOR_NUM_CANDIDATES,
      DEFAULT_NUM_CANDIDATES,
      "RUNWAYOPS_VECTOR_NUM_CANDIDATES"
    ),
    limit
  );
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

  const queryEmbeddingResult = await embedText(QUERY, config);
  const queryEmbedding = queryEmbeddingResult.embedding;

  await client.connect();

  try {
    const db = client.db(dbName);
    const collection = db.collection(EVIDENCE_COLLECTION);
    const embeddedCount = await collection.countDocuments({
      [VECTOR_FIELD]: { $type: "array" },
      embedding_provider: "fireworks",
    });

    if (embeddedCount === 0) {
      throw new Error(
        `No Fireworks embeddings found in ${dbName}.${EVIDENCE_COLLECTION}.${VECTOR_FIELD}. Run npm run embed:evidence first.`
      );
    }

    let results;

    try {
      results = await runVectorSearch(collection, queryEmbedding, limit, numCandidates);
    } catch (error) {
      if (isVectorSearchSetupError(error)) {
        throw new Error(
          [
            "MongoDB Atlas Vector Search query failed.",
            `Create an Atlas Vector Search index named "${VECTOR_INDEX}" on ${dbName}.${EVIDENCE_COLLECTION}.`,
            "Use this index definition with the detected Fireworks embedding dimension:",
            JSON.stringify(atlasIndexDefinition(queryEmbedding.length), null, 2),
            `Original error: ${error.message}`,
          ].join("\n")
        );
      }

      throw error;
    }

    const matches = expectedMatches(results);
    const summary = {
      query: QUERY,
      strategy: "fireworks_embedding_atlas_vector_search",
      embedding_provider: "fireworks",
      embedding_model: config.embeddingModel,
      embedding_model_response:
        queryEmbeddingResult.model && queryEmbeddingResult.model !== config.embeddingModel
          ? queryEmbeddingResult.model
          : undefined,
      vector_index: VECTOR_INDEX,
      vector_field: VECTOR_FIELD,
      vector_dimension: queryEmbedding.length,
      top_evidence_ids: results.map((result) => String(result._id)),
      expected_matches: matches,
      sufficient: Object.values(matches).every(Boolean),
    };

    if (args.storeAttempt) {
      summary.stored_retrieval_attempt_id = await maybeStoreAttempt(db, summary);
    }

    console.log(
      JSON.stringify(
        {
          status: summary.sufficient ? "ok" : "missing_expected_evidence",
          db: dbName,
          collection: EVIDENCE_COLLECTION,
          retrieval_attempt: summary,
          top_matches: results.map(summarizeMatch),
        },
        null,
        2
      )
    );

    if (!summary.sufficient) {
      process.exit(1);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`Fireworks vector search check failed: ${error.message}`);
  process.exit(1);
});
