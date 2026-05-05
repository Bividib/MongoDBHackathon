const { loadLocalEnvFiles } = require("./env");

const FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1";
const FIREWORKS_EMBEDDINGS_ENDPOINT = `${FIREWORKS_BASE_URL}/embeddings`;
const FIREWORKS_RERANK_ENDPOINT = `${FIREWORKS_BASE_URL}/rerank`;
const DEFAULT_FIREWORKS_EMBEDDING_MODEL = "fireworks/qwen3-embedding-8b";
const DEFAULT_FIREWORKS_RERANK_MODEL = "fireworks/qwen3-reranker-8b";

function parsePositiveInteger(value, label) {
  if (value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return parsed;
}

function getFireworksEmbeddingConfig() {
  loadLocalEnvFiles();

  if (!process.env.FIREWORKS_API_KEY) {
    throw new Error("Missing FIREWORKS_API_KEY in .env or .env.local");
  }

  return {
    apiKey: process.env.FIREWORKS_API_KEY,
    embeddingModel:
      process.env.FIREWORKS_EMBEDDING_MODEL || DEFAULT_FIREWORKS_EMBEDDING_MODEL,
    rerankModel: process.env.FIREWORKS_RERANK_MODEL || DEFAULT_FIREWORKS_RERANK_MODEL,
    dimensions: parsePositiveInteger(
      process.env.FIREWORKS_EMBEDDING_DIMENSIONS,
      "FIREWORKS_EMBEDDING_DIMENSIONS"
    ),
  };
}

async function readErrorDetail(response) {
  const text = await response.text();

  if (!text) {
    return "";
  }

  try {
    const body = JSON.parse(text);
    const message = body.error?.message || body.message || body.detail;

    return message ? String(message) : "";
  } catch {
    return text.slice(0, 240);
  }
}

function validateEmbedding(vector, index) {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error(`Fireworks embedding ${index} was empty or malformed`);
  }

  for (const value of vector) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Fireworks embedding ${index} contained a non-finite value`);
    }
  }

  return vector;
}

async function embedTexts(texts, config = getFireworksEmbeddingConfig()) {
  const input = texts.map((text, index) => {
    if (typeof text !== "string" || text.trim() === "") {
      throw new Error(`Embedding input ${index} must be a non-empty string`);
    }

    return text;
  });

  if (input.length === 0) {
    return { embeddings: [], model: config.embeddingModel, usage: null };
  }

  const payload = {
    input,
    model: config.embeddingModel,
  };

  if (config.dimensions) {
    payload.dimensions = config.dimensions;
  }

  const response = await fetch(FIREWORKS_EMBEDDINGS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`Fireworks embeddings request failed with HTTP ${response.status}${suffix}`);
  }

  const body = await response.json();

  if (!Array.isArray(body.data)) {
    throw new Error("Fireworks embeddings response did not include a data array");
  }

  const sorted = [...body.data].sort((left, right) => {
    const leftIndex = Number.isInteger(left.index) ? left.index : 0;
    const rightIndex = Number.isInteger(right.index) ? right.index : 0;

    return leftIndex - rightIndex;
  });
  const embeddings = sorted.map((item, index) => validateEmbedding(item.embedding, index));

  if (embeddings.length !== input.length) {
    throw new Error(
      `Fireworks returned ${embeddings.length} embeddings for ${input.length} inputs`
    );
  }

  return {
    embeddings,
    model: body.model || config.embeddingModel,
    usage: body.usage || null,
  };
}

async function embedText(text, config = getFireworksEmbeddingConfig()) {
  const result = await embedTexts([text], config);

  return {
    embedding: result.embeddings[0],
    model: result.model,
    usage: result.usage,
  };
}

async function rerankDocuments(query, documents, config = getFireworksEmbeddingConfig()) {
  if (typeof query !== "string" || query.trim() === "") {
    throw new Error("Rerank query must be a non-empty string");
  }

  if (!Array.isArray(documents) || documents.length === 0) {
    return [];
  }

  const response = await fetch(FIREWORKS_RERANK_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.rerankModel,
      query,
      documents,
      top_n: documents.length,
      return_documents: false,
    }),
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`Fireworks rerank request failed with HTTP ${response.status}${suffix}`);
  }

  const body = await response.json();
  const results = Array.isArray(body.results) ? body.results : Array.isArray(body.data) ? body.data : [];

  return results.map((item) => ({
    index: item.index,
    score: item.relevance_score ?? item.score,
  }));
}

module.exports = {
  DEFAULT_FIREWORKS_EMBEDDING_MODEL,
  DEFAULT_FIREWORKS_RERANK_MODEL,
  FIREWORKS_EMBEDDINGS_ENDPOINT,
  FIREWORKS_RERANK_ENDPOINT,
  embedText,
  embedTexts,
  getFireworksEmbeddingConfig,
  rerankDocuments,
};
