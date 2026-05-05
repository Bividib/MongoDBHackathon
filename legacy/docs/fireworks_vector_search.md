# Fireworks Vector Search Setup

This branch proves the retrieval loop only:

Fireworks embeddings -> `memory_chunks.embedding` -> MongoDB Atlas Vector Search.

It does not wire retrieval into LangGraph or app runtime code.

## Fireworks References

- [Fireworks overview](https://docs.fireworks.ai/getting-started/introduction)
- [Fireworks embeddings and reranking](https://docs.fireworks.ai/guides/querying-embeddings-models)

The Fireworks embeddings API is OpenAI-compatible. These scripts call:

- `https://api.fireworks.ai/inference/v1/embeddings`
- Optional future reranking endpoint: `https://api.fireworks.ai/inference/v1/rerank`

## Environment

Required:

```sh
FIREWORKS_API_KEY=...
MONGODB_URI=...
```

Optional:

```sh
MONGODB_DB=runwayops_demo
FIREWORKS_EMBEDDING_MODEL=fireworks/qwen3-embedding-8b
FIREWORKS_RERANK_MODEL=fireworks/qwen3-reranker-8b
FIREWORKS_EMBEDDING_DIMENSIONS=4096
MONGODB_VECTOR_INDEX=memory_chunks_embedding_vector_index
RUNWAYOPS_EVIDENCE_COLLECTION=memory_chunks
RUNWAYOPS_VECTOR_FIELD=embedding
```

If `FIREWORKS_EMBEDDING_MODEL` is omitted, the scripts use `fireworks/qwen3-embedding-8b`.
If `FIREWORKS_RERANK_MODEL` is omitted, helpers default to `fireworks/qwen3-reranker-8b` for future use.

## Evidence Store

The repo already loads `data/fixtures/evidence_chunks_seed.json` into `memory_chunks`, so the vector path extends that collection instead of introducing `evidence_chunks`.

The embedding script stores these fields on each evidence document:

- `embedding`
- `embedding_provider: "fireworks"`
- `embedding_model`
- `embedding_dimension`
- `embedding_text_field: "text"`
- `embedding_text_hash`
- `embedded_at`

## Atlas Vector Search Index

Create an Atlas Vector Search index on `memory_chunks`.

Index name:

```text
memory_chunks_embedding_vector_index
```

Index JSON for the default Fireworks model:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 4096,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "company_id"
    }
  ]
}
```

The scripts detect and print the actual vector dimension from the first Fireworks embedding response. If `npm run embed:evidence` or `npm run check:vector` prints a different `vector_dimension`, use that value for `numDimensions`.

## Commands

Seed or reseed the demo data if needed:

```sh
npm run seed
```

Embed the evidence chunks:

```sh
npm run embed:evidence
```

Expected embedding summary:

```json
{
  "status": "ok",
  "collection": "memory_chunks",
  "embedding_provider": "fireworks",
  "embedding_model": "fireworks/qwen3-embedding-8b",
  "vector_field": "embedding",
  "vector_dimension": 4096,
  "text_field_used": "text"
}
```

Then run the vector retrieval check:

```sh
npm run check:vector
```

The check embeds this query:

```text
Northstar INV-1042 Friday PO re-approved payment promise
```

Expected top evidence includes:

- `chunk_northstar_po_memory`
- `thread_northstar_inv_1042`
- `chunk_inv_1042_evidence`
- `chunk_motionprint_grace`

The script prints a retrieval-attempt-like JSON summary with `top_evidence_ids`, `expected_matches`, model, vector field, and vector dimension. It does not print API keys.

To also store a retrieval attempt:

```sh
npm run check:vector -- --store-attempt
```

## Missing Index Behavior

If the Atlas Vector Search index has not been created, `npm run check:vector` fails clearly after generating the query embedding. It prints:

- the required index name
- the collection
- an index JSON definition using the detected vector dimension
- the original MongoDB error

The same clear failure is expected when running against a local MongoDB server without Atlas Search/vector-search support.

There is no keyword fallback in this proof branch; the check must prove Atlas Vector Search is working.

## Validation

```sh
npm run check:data
npm run typecheck
npm run build
```
