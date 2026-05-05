#!/usr/bin/env node
// Archive the legacy RunwayPilot prototype (Next + Mongo + LangGraph +
// ElevenLabs/Twilio voice + Fireworks vector search) to legacy/ so the
// new RunwayOps cash-management build under packages/ + apps/api +
// apps/web + apps/workers can land cleanly.
//
// Usage:
//   node scripts/archive-legacy.mjs            # dry run, prints plan
//   node scripts/archive-legacy.mjs --execute  # actually moves things
//
// Idempotent: re-running with --execute after a partial move is safe.
// Items already at the destination are skipped.
//
// Why this exists:
//   The new spec (see /New Spec.md and /IMPLEMENTATION_PLAN.md) replaces
//   the prototype's storage (Mongo → Postgres+Drizzle), orchestration
//   (LangGraph → Temporal), AI surface (free-form → structured outputs
//   with hard-refusal validators), and approval model (implicit → strict
//   gate). The legacy code is preserved (not deleted) because the
//   voice/embedding stack may be revived for Phase 11+ work.

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), "..");
const LEGACY_ROOT = join(REPO_ROOT, "legacy");

// === Move manifest =========================================================
// Each entry: source (relative to repo root) → destination (relative to legacy/).
// Whole directories are moved as units; named files individually.
const MOVES = [
  // Legacy Next.js web app
  { from: "apps/web", to: "apps/web" },

  // Voice / Twilio / ElevenLabs scripts
  { from: "scripts/assign-elevenlabs-phone-agent.js", to: "scripts/assign-elevenlabs-phone-agent.js" },
  { from: "scripts/diagnose-elevenlabs-call.js",       to: "scripts/diagnose-elevenlabs-call.js" },
  { from: "scripts/diagnose-twilio-ring.js",           to: "scripts/diagnose-twilio-ring.js" },
  { from: "scripts/import-elevenlabs-twilio-number.js",to: "scripts/import-elevenlabs-twilio-number.js" },
  { from: "scripts/inspect-elevenlabs-call-history.js",to: "scripts/inspect-elevenlabs-call-history.js" },
  { from: "scripts/list-elevenlabs-phone-numbers.js",  to: "scripts/list-elevenlabs-phone-numbers.js" },
  { from: "scripts/submit-elevenlabs-call.js",         to: "scripts/submit-elevenlabs-call.js" },

  // Mongo / Fireworks / prototype demo scripts
  { from: "scripts/check-data.js",                     to: "scripts/check-data.js" },
  { from: "scripts/check-env.js",                      to: "scripts/check-env.js" },
  { from: "scripts/check-fireworks-vector-search.js",  to: "scripts/check-fireworks-vector-search.js" },
  { from: "scripts/check-maths.ts",                    to: "scripts/check-maths.ts" },
  { from: "scripts/check-mongo-connection.js",         to: "scripts/check-mongo-connection.js" },
  { from: "scripts/check-providers.js",                to: "scripts/check-providers.js" },
  { from: "scripts/embed-evidence-fireworks.js",       to: "scripts/embed-evidence-fireworks.js" },
  { from: "scripts/lib",                               to: "scripts/lib" },
  { from: "scripts/reset-demo.js",                     to: "scripts/reset-demo.js" },
  { from: "scripts/seed-demo.js",                      to: "scripts/seed-demo.js" },

  // Legacy docs
  { from: "docs/fireworks_vector_search.md", to: "docs/fireworks_vector_search.md" },
  { from: "docs/langgraph_integration.md",   to: "docs/langgraph_integration.md" },
  { from: "docs/voice_agent_setup.md",       to: "docs/voice_agent_setup.md" },
  { from: "docs/implementation-plan.md",     to: "docs/implementation-plan.md" },

  // Prototype demo data + experiments
  { from: "data",        to: "data" },
  { from: "experiments", to: "experiments" },
];

// scripts/verify-packages.mjs STAYS at scripts/ — it is the canonical root verify.

// === package.json cleanup ==================================================
const DEPS_TO_REMOVE = [
  "@langchain/langgraph",
  "mongodb",
  "next",
  "react",
  "react-dom",
  "lucide-react",
  "clsx",
];

const DEV_DEPS_TO_REMOVE = [
  "@tailwindcss/postcss",
  "@types/react",
  "@types/react-dom",
  "tailwindcss",
];

const SCRIPTS_TO_REMOVE = [
  "dev",
  "build",
  "start",
  "typecheck",         // pointed at apps/web/tsconfig.json — new web app will declare its own
  "check-maths",
  "check:env",
  "check:db",
  "check:providers",
  "check:data",
  "embed:evidence",
  "check:vector",
  "elevenlabs:phones",
  "elevenlabs:import-twilio",
  "elevenlabs:assign-agent",
  "call:test",
  "seed",
  "reset",
];

const SCRIPTS_TO_ADD = {
  verify: "node scripts/verify-packages.mjs",
};

// === Runtime ===============================================================
const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");

const log = (msg) => console.log(msg);

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function tryGitMv(absFrom, absTo) {
  try {
    execSync(`git mv "${absFrom}" "${absTo}"`, { cwd: REPO_ROOT, stdio: "pipe" });
    return "git-mv";
  } catch {
    renameSync(absFrom, absTo);
    return "fs-rename";
  }
}

let plannedMoves = 0;
let executedMoves = 0;
let skippedMissing = 0;
let skippedAlready = 0;

log("=== Legacy Archive ===");
log(EXECUTE ? "MODE: EXECUTE — files WILL be moved" : "MODE: DRY RUN — pass --execute to apply");
log("");
log("--- Moves ---");

for (const { from, to } of MOVES) {
  const absFrom = join(REPO_ROOT, from);
  const absTo = join(LEGACY_ROOT, to);

  if (!existsSync(absFrom)) {
    log(`  skip (not found):       ${from}`);
    skippedMissing++;
    continue;
  }
  if (existsSync(absTo)) {
    log(`  skip (already in legacy): ${from}`);
    skippedAlready++;
    continue;
  }

  log(`  move: ${from}  →  legacy/${to}`);
  plannedMoves++;

  if (EXECUTE) {
    ensureDir(dirname(absTo));
    const method = tryGitMv(absFrom, absTo);
    log(`        ✓ ${method}`);
    executedMoves++;
  }
}

log("");
log("--- package.json ---");

const pkgPath = join(REPO_ROOT, "package.json");
const pkgRaw = readFileSync(pkgPath, "utf-8");
const pkg = JSON.parse(pkgRaw);

let depRemoved = 0;
let scriptRemoved = 0;
let scriptAdded = 0;

for (const dep of DEPS_TO_REMOVE) {
  if (pkg.dependencies?.[dep]) {
    log(`  remove dep:    ${dep}`);
    depRemoved++;
    if (EXECUTE) delete pkg.dependencies[dep];
  }
}
for (const dep of DEV_DEPS_TO_REMOVE) {
  if (pkg.devDependencies?.[dep]) {
    log(`  remove devDep: ${dep}`);
    depRemoved++;
    if (EXECUTE) delete pkg.devDependencies[dep];
  }
}
for (const s of SCRIPTS_TO_REMOVE) {
  if (pkg.scripts?.[s]) {
    log(`  remove script: ${s}`);
    scriptRemoved++;
    if (EXECUTE) delete pkg.scripts[s];
  }
}
for (const [name, body] of Object.entries(SCRIPTS_TO_ADD)) {
  if (!pkg.scripts?.[name]) {
    log(`  add script:    ${name}`);
    scriptAdded++;
    if (EXECUTE) {
      pkg.scripts = pkg.scripts || {};
      pkg.scripts[name] = body;
    }
  }
}

if (EXECUTE) {
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  log("  ✓ package.json written");
}

log("");
log("--- legacy/README.md ---");

const today = new Date().toISOString().slice(0, 10);
const legacyReadme = `# Legacy RunwayPilot prototype

Archived ${today}.

This folder contains the original RunwayPilot exploration:

- \`apps/web/\` — Next.js web app (App Router, Mongo-backed)
- \`scripts/\` — voice agent (ElevenLabs + Twilio), Mongo demo seed/reset,
  Fireworks vector search experiments
- \`docs/\` — implementation notes for the prototype stack
- \`data/\`, \`experiments/\` — fixtures and exploratory work

It is preserved (not deleted) because the voice + embedding stack may be
revived in Phase 11+ critical-obligation case work (collection actions
via voice channel, evidence retrieval over historical communications).

The active build is the RunwayOps cash-management product. Source of truth:

- \`/New Spec.md\`
- \`/IMPLEMENTATION_PLAN.md\`
- \`/packages/{domain,cash-engine,ai,db}\`
- \`/apps/{api,web,workers}\` (forthcoming)

**Do not import from \`legacy/\` in new code.** Treat it as read-only
reference. If a piece is needed in the active build, port it deliberately
into a real package with its own contracts and tests.
`;

if (EXECUTE) {
  ensureDir(LEGACY_ROOT);
  const legacyReadmePath = join(LEGACY_ROOT, "README.md");
  if (!existsSync(legacyReadmePath)) {
    writeFileSync(legacyReadmePath, legacyReadme);
    log("  ✓ legacy/README.md written");
  } else {
    log("  skip (already exists)");
  }
} else {
  log("  (would write legacy/README.md)");
}

log("");
log("=== Summary ===");
log(`  moves planned:  ${plannedMoves}`);
log(`  moves executed: ${executedMoves}`);
log(`  skipped (not found):       ${skippedMissing}`);
log(`  skipped (already archived): ${skippedAlready}`);
log(`  package.json deps removed:    ${depRemoved}`);
log(`  package.json scripts removed: ${scriptRemoved}`);
log(`  package.json scripts added:   ${scriptAdded}`);
log("");

if (EXECUTE) {
  log("=== Post-archive TODO ===");
  log("  1. rm -rf node_modules package-lock.json");
  log("  2. pnpm install   (or npm install)");
  log("  3. node scripts/verify-packages.mjs");
  log("  4. git status   # review the rename diff");
  log("  5. git commit -m \"chore: archive legacy RunwayPilot prototype\"");
} else {
  log("Run with --execute to apply.");
}
