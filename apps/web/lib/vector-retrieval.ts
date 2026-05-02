import type { Db, Document } from "mongodb";

type ContactChannel = "email" | "phone";

type FireworksEmbeddingConfig = {
  apiKey: string;
  embeddingModel: string;
  dimensions?: number;
};

type FireworksEmbeddingResult = {
  embedding: number[];
  model?: string;
};

type EvidenceDocument = Document & { _id: string };

export type CustomerMemoryRetrievalContext = {
  companyId: string;
  caseId: string;
  eventId: string;
  customerId: string;
  invoiceId: string;
  message: string;
  receivedAt: string;
  expectedClassification?: string;
  expectedConfidence?: number;
  notGuaranteedCash?: boolean;
};

export type RetrievedEvidence = {
  id: string;
  snippet: string;
  score: number | null;
  tags: string[];
  entity_ids: string[];
  source_file_id?: string;
  source_collection?: string;
  source_document_id?: string;
  embedding_model?: string;
  embedding_dimension?: number;
};

export type CustomerMemoryEvidenceResult = {
  customerId: string;
  invoiceId: string;
  behaviourSummary: string;
  evidenceIds: string[];
  preferredChannels: ContactChannel[];
  phoneContactConsent: boolean;
  explicitConfirmationRequired: boolean;
  topEvidence: RetrievedEvidence[];
};

export type CustomerMemoryRetrievalResult = {
  query: string;
  strategy: typeof VECTOR_SEARCH_STRATEGY;
  status: "vector_search" | "fallback";
  fallbackReason?: string;
  collection: string;
  vectorIndex: string;
  vectorField: string;
  vectorDimension?: number;
  embeddingProvider?: "fireworks";
  embeddingModel?: string;
  embeddingModelResponse?: string;
  topEvidence: RetrievedEvidence[];
  topEvidenceIds: string[];
  expectedMatches: Record<string, boolean>;
  expectedMetadata: Record<string, unknown>;
  vectorSearchUsed: boolean;
  vectorSearchAttempted: boolean;
  sufficient: boolean;
  memoryEvidence: CustomerMemoryEvidenceResult;
};

const FIREWORKS_EMBEDDINGS_ENDPOINT = "https://api.fireworks.ai/inference/v1/embeddings";
const DEFAULT_FIREWORKS_EMBEDDING_MODEL = "fireworks/qwen3-embedding-8b";
const DEFAULT_EVIDENCE_COLLECTION = "memory_chunks";
const DEFAULT_VECTOR_FIELD = "embedding";
const DEFAULT_VECTOR_INDEX = "memory_chunks_embedding_vector_index";
const DEFAULT_LIMIT = 6;
const DEFAULT_NUM_CANDIDATES = 100;
const VECTOR_SEARCH_STRATEGY = "fireworks_embedding_atlas_vector_search";
const FALLBACK_EVIDENCE_IDS = [
  "chunk_northstar_po_memory",
  "thread_northstar_inv_1042",
  "chunk_inv_1042_evidence",
  "chunk_motionprint_grace"
];

const STATIC_FALLBACK_EVIDENCE: RetrievedEvidence[] = [
  {
    id: "chunk_northstar_po_memory",
    snippet:
      "Northstar Studio payment promises for INV-1042 are conditional unless PO approval and the Friday payment date are explicitly confirmed.",
    score: null,
    tags: ["customer_memory", "po_dependency", "collections"],
    entity_ids: ["cust_northstar", "inv_1042"],
    source_file_id: "src_inv_1042_pdf"
  },
  {
    id: "thread_northstar_inv_1042",
    snippet:
      "Northstar Studio email thread for INV-1042 says PO re-approval is pending and the reply should be treated as conditional until Friday release is confirmed.",
    score: null,
    tags: ["email_thread", "po_dependency", "collections"],
    entity_ids: ["cust_northstar", "inv_1042"],
    source_collection: "email_threads",
    source_document_id: "thread_northstar_inv_1042"
  },
  {
    id: "chunk_inv_1042_evidence",
    snippet:
      "INV-1042 is the Friday receipt dependency in the payroll case, but payment is not guaranteed until PO re-approval and release timing are confirmed.",
    score: null,
    tags: ["invoice_evidence", "po_dependency", "collections"],
    entity_ids: ["cust_northstar", "inv_1042"],
    source_file_id: "src_inv_1042_pdf"
  },
  {
    id: "chunk_motionprint_grace",
    snippet:
      "Supplier X, MotionPrint, has terms that allow a five-day no-penalty grace period while protecting Friday payroll runway.",
    score: null,
    tags: ["supplier_terms", "payment_run"],
    entity_ids: ["sup_motionprint"],
    source_file_id: "src_motionprint_terms"
  }
];

function parsePositiveInteger(value: string | undefined, fallback: number, label: string): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return parsed;
}

function parseOptionalPositiveInteger(value: string | undefined, label: string): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return parsed;
}

function collectionName(): string {
  return process.env.RUNWAYOPS_EVIDENCE_COLLECTION || DEFAULT_EVIDENCE_COLLECTION;
}

function vectorField(): string {
  return process.env.RUNWAYOPS_VECTOR_FIELD || DEFAULT_VECTOR_FIELD;
}

function vectorIndex(): string {
  return process.env.MONGODB_VECTOR_INDEX || DEFAULT_VECTOR_INDEX;
}

function getFireworksEmbeddingConfig(): FireworksEmbeddingConfig | null {
  if (!process.env.FIREWORKS_API_KEY) {
    return null;
  }

  return {
    apiKey: process.env.FIREWORKS_API_KEY,
    embeddingModel: process.env.FIREWORKS_EMBEDDING_MODEL || DEFAULT_FIREWORKS_EMBEDDING_MODEL,
    dimensions: parseOptionalPositiveInteger(
      process.env.FIREWORKS_EMBEDDING_DIMENSIONS,
      "FIREWORKS_EMBEDDING_DIMENSIONS"
    )
  };
}

async function readErrorDetail(response: Response): Promise<string> {
  const text = await response.text();

  if (!text) {
    return "";
  }

  try {
    const body = JSON.parse(text) as { error?: { message?: string }; message?: string; detail?: string };
    const message = body.error?.message || body.message || body.detail;

    return message ? String(message) : "";
  } catch {
    return text.slice(0, 240);
  }
}

function validateEmbedding(vector: unknown): number[] {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error("Fireworks embedding response was empty or malformed");
  }

  for (const value of vector) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("Fireworks embedding response contained a non-finite value");
    }
  }

  return vector;
}

async function embedQuery(query: string, config: FireworksEmbeddingConfig): Promise<FireworksEmbeddingResult> {
  const payload: Record<string, unknown> = {
    input: [query],
    model: config.embeddingModel
  };

  if (config.dimensions) {
    payload.dimensions = config.dimensions;
  }

  const response = await fetch(FIREWORKS_EMBEDDINGS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    const suffix = detail ? `: ${detail}` : "";

    throw new Error(`Fireworks embeddings request failed with HTTP ${response.status}${suffix}`);
  }

  const body = (await response.json()) as {
    data?: Array<{ embedding?: unknown; index?: number }>;
    model?: string;
  };
  const first = body.data?.sort((left, right) => (left.index ?? 0) - (right.index ?? 0))[0];

  return {
    embedding: validateEmbedding(first?.embedding),
    model: body.model
  };
}

function invoiceSearchLabel(invoiceId: string): string {
  return invoiceId.replace(/_/g, "-").toUpperCase();
}

function customerSearchLabel(customerId: string): string {
  if (customerId.toLowerCase().includes("northstar")) {
    return "Northstar";
  }

  return customerId;
}

function buildQuery(context: CustomerMemoryRetrievalContext): string {
  const customer = customerSearchLabel(context.customerId);
  const invoice = invoiceSearchLabel(context.invoiceId);
  const message = context.message.trim();

  return [
    `${customer} ${invoice} Friday PO re-approved payment promise`,
    message ? `Customer reply: ${message}` : "",
    "Find customer memory, invoice evidence, payment history, and supplier terms for payroll-safe outreach."
  ]
    .filter(Boolean)
    .join(". ");
}

function textSnippet(text: unknown): string {
  const value = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";

  if (value.length <= 260) {
    return value;
  }

  return `${value.slice(0, 257)}...`;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function maybeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function summarizeEvidence(document: Document): RetrievedEvidence {
  const score = maybeNumber(document.score);

  return {
    id: String(document._id),
    snippet: textSnippet(document.text),
    score: score === undefined ? null : Number(score.toFixed(6)),
    tags: stringArray(document.tags),
    entity_ids: stringArray(document.entity_ids),
    source_file_id: typeof document.source_file_id === "string" ? document.source_file_id : undefined,
    source_collection:
      typeof document.source_collection === "string" ? document.source_collection : undefined,
    source_document_id:
      typeof document.source_document_id === "string" ? document.source_document_id : undefined,
    embedding_model: typeof document.embedding_model === "string" ? document.embedding_model : undefined,
    embedding_dimension: maybeNumber(document.embedding_dimension)
  };
}

function evidenceIncludes(evidence: RetrievedEvidence, ...needles: string[]): boolean {
  const haystack = [
    evidence.id,
    evidence.snippet,
    evidence.source_file_id,
    evidence.source_collection,
    evidence.source_document_id,
    ...evidence.tags,
    ...evidence.entity_ids
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return needles.every((needle) => haystack.includes(needle.toLowerCase()));
}

function expectedMatches(evidence: RetrievedEvidence[]): Record<string, boolean> {
  return {
    northstar_payment_memory: evidence.some((item) => item.id === "chunk_northstar_po_memory"),
    northstar_email_thread: evidence.some((item) => {
      return item.id === "thread_northstar_inv_1042" || item.source_document_id === "thread_northstar_inv_1042";
    }),
    inv_1042_evidence: evidence.some((item) => {
      return item.id === "chunk_inv_1042_evidence" || evidenceIncludes(item, "inv-1042");
    }),
    supplier_x_grace_terms: evidence.some((item) => {
      return (
        item.id === "chunk_motionprint_grace" ||
        evidenceIncludes(item, "supplier x") ||
        evidenceIncludes(item, "motionprint", "grace")
      );
    })
  };
}

function hasMinimumNorthstarEvidence(matches: Record<string, boolean>): boolean {
  return Boolean(
    matches.northstar_payment_memory && matches.northstar_email_thread && matches.inv_1042_evidence
  );
}

async function runVectorSearch(db: Db, queryEmbedding: number[], companyId: string): Promise<Document[]> {
  const limit = parsePositiveInteger(process.env.RUNWAYOPS_VECTOR_LIMIT, DEFAULT_LIMIT, "RUNWAYOPS_VECTOR_LIMIT");
  const numCandidates = Math.max(
    parsePositiveInteger(
      process.env.RUNWAYOPS_VECTOR_NUM_CANDIDATES,
      DEFAULT_NUM_CANDIDATES,
      "RUNWAYOPS_VECTOR_NUM_CANDIDATES"
    ),
    limit
  );

  return db
    .collection(collectionName())
    .aggregate([
      {
        $vectorSearch: {
          index: vectorIndex(),
          path: vectorField(),
          queryVector: queryEmbedding,
          numCandidates,
          limit,
          filter: {
            company_id: companyId
          }
        }
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
          embedding_dimension: 1
        }
      }
    ])
    .toArray();
}

async function loadFallbackEvidence(db: Db, companyId: string): Promise<RetrievedEvidence[]> {
  try {
    const documents = await db
      .collection<EvidenceDocument>(collectionName())
      .find({
        _id: { $in: FALLBACK_EVIDENCE_IDS },
        company_id: companyId
      })
      .project({
        _id: 1,
        text: 1,
        tags: 1,
        entity_ids: 1,
        source_file_id: 1,
        source_collection: 1,
        source_document_id: 1,
        embedding_model: 1,
        embedding_dimension: 1
      })
      .toArray();
    const byId = new Map(documents.map((document) => [String(document._id), document]));
    const ordered = FALLBACK_EVIDENCE_IDS.map((id) => byId.get(id)).filter(Boolean) as Document[];

    if (ordered.length > 0) {
      return ordered.map((document) => ({
        ...summarizeEvidence(document),
        score: null
      }));
    }
  } catch {
    // Keep the demo path alive even when basic fallback reads are unavailable.
  }

  return STATIC_FALLBACK_EVIDENCE;
}

function fallbackMemoryEvidence(
  context: CustomerMemoryRetrievalContext,
  topEvidence: RetrievedEvidence[]
): CustomerMemoryEvidenceResult {
  return {
    customerId: context.customerId,
    invoiceId: context.invoiceId,
    behaviourSummary:
      "Retrieved customer memory shows Northstar PO-dependent payment promises need explicit finance-team confirmation before being counted as payroll cash.",
    evidenceIds: topEvidence.map((item) => item.id),
    preferredChannels: ["email", "phone"],
    phoneContactConsent: true,
    explicitConfirmationRequired: true,
    topEvidence
  };
}

function expectedMetadata(context: CustomerMemoryRetrievalContext): Record<string, unknown> {
  return {
    customer_id: context.customerId,
    invoice_id: context.invoiceId,
    expected_classification: context.expectedClassification,
    expected_confidence: context.expectedConfidence,
    not_guaranteed_cash: context.notGuaranteedCash
  };
}

function fallbackReasonMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function buildCustomerMemoryRetrievalContext(event: {
  _id: string;
  company_id: string;
  case_id: string;
  received_at?: string;
  payload?: Record<string, unknown>;
}): CustomerMemoryRetrievalContext {
  const payload = event.payload ?? {};

  return {
    companyId: event.company_id,
    caseId: event.case_id,
    eventId: event._id,
    customerId: String(payload.customer_id ?? "cust_northstar"),
    invoiceId: String(payload.invoice_id ?? "inv_1042"),
    message: String(payload.message ?? ""),
    receivedAt: event.received_at ?? new Date().toISOString(),
    expectedClassification:
      typeof payload.expected_classification === "string" ? payload.expected_classification : undefined,
    expectedConfidence:
      typeof payload.expected_confidence === "number" ? payload.expected_confidence : undefined,
    notGuaranteedCash:
      typeof payload.not_guaranteed_cash === "boolean" ? payload.not_guaranteed_cash : undefined
  };
}

export async function retrieveCustomerMemoryEvidence(
  db: Db,
  context: CustomerMemoryRetrievalContext
): Promise<CustomerMemoryRetrievalResult> {
  const query = buildQuery(context);
  const expected = expectedMetadata(context);
  const config = getFireworksEmbeddingConfig();
  let vectorSearchAttempted = false;
  let fallbackReason: string | undefined;
  let vectorDimension: number | undefined;
  let embeddingModel: string | undefined;
  let embeddingModelResponse: string | undefined;
  let vectorEvidence: RetrievedEvidence[] = [];

  if (!config) {
    fallbackReason = "Missing FIREWORKS_API_KEY; using deterministic customer-memory fallback.";
  } else {
    embeddingModel = config.embeddingModel;

    try {
      const embeddedCount = await db.collection(collectionName()).countDocuments({
        company_id: context.companyId,
        [vectorField()]: { $type: "array" },
        embedding_provider: "fireworks"
      });

      if (embeddedCount === 0) {
        fallbackReason = `No Fireworks embeddings found in ${collectionName()}.${vectorField()}; run npm run embed:evidence.`;
      } else {
        const queryEmbedding = await embedQuery(query, config);

        vectorSearchAttempted = true;
        vectorDimension = queryEmbedding.embedding.length;
        embeddingModelResponse =
          queryEmbedding.model && queryEmbedding.model !== config.embeddingModel ? queryEmbedding.model : undefined;

        const vectorDocuments = await runVectorSearch(db, queryEmbedding.embedding, context.companyId);

        vectorEvidence = vectorDocuments.map(summarizeEvidence);

        if (vectorEvidence.length === 0) {
          fallbackReason = "Atlas Vector Search returned no evidence matches.";
        } else if (!hasMinimumNorthstarEvidence(expectedMatches(vectorEvidence))) {
          fallbackReason = "Atlas Vector Search missed required Northstar INV-1042 memory evidence.";
        }
      }
    } catch (error) {
      fallbackReason = `Atlas Vector Search failed: ${fallbackReasonMessage(error)}`;
    }
  }

  const useVectorEvidence = vectorEvidence.length > 0 && !fallbackReason;
  const topEvidence = useVectorEvidence
    ? vectorEvidence
    : await loadFallbackEvidence(db, context.companyId);
  const matches = expectedMatches(topEvidence);

  return {
    query,
    strategy: VECTOR_SEARCH_STRATEGY,
    status: useVectorEvidence ? "vector_search" : "fallback",
    fallbackReason,
    collection: collectionName(),
    vectorIndex: vectorIndex(),
    vectorField: vectorField(),
    vectorDimension,
    embeddingProvider: embeddingModel ? "fireworks" : undefined,
    embeddingModel,
    embeddingModelResponse,
    topEvidence,
    topEvidenceIds: topEvidence.map((item) => item.id),
    expectedMatches: matches,
    expectedMetadata: expected,
    vectorSearchUsed: useVectorEvidence,
    vectorSearchAttempted,
    sufficient: hasMinimumNorthstarEvidence(matches),
    memoryEvidence: fallbackMemoryEvidence(context, topEvidence)
  };
}

export function buildDeterministicCustomerMemoryRetrieval(
  context: CustomerMemoryRetrievalContext,
  fallbackReason = "Customer Memory Agent ran without a database handle; using deterministic customer-memory fallback."
): CustomerMemoryRetrievalResult {
  const topEvidence = STATIC_FALLBACK_EVIDENCE;
  const matches = expectedMatches(topEvidence);

  return {
    query: buildQuery(context),
    strategy: VECTOR_SEARCH_STRATEGY,
    status: "fallback",
    fallbackReason,
    collection: collectionName(),
    vectorIndex: vectorIndex(),
    vectorField: vectorField(),
    topEvidence,
    topEvidenceIds: topEvidence.map((item) => item.id),
    expectedMatches: matches,
    expectedMetadata: expectedMetadata(context),
    vectorSearchUsed: false,
    vectorSearchAttempted: false,
    sufficient: hasMinimumNorthstarEvidence(matches),
    memoryEvidence: fallbackMemoryEvidence(context, topEvidence)
  };
}
