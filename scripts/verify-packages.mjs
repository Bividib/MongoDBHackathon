import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runDir = tmpdir();

// -- Pre-flight: enforce npm-only convention -------------------------------
// We hit "local green, CI red" twice in Round 3 because parallel sessions
// reached for whichever package manager felt natural (pnpm `workspace:*`
// in one place, partial npm locks elsewhere). The whole repo standardizes
// on npm: each package owns its own package.json + package-lock.json,
// cross-package deps use `file:../<pkg>`. These guards make the next
// drift fail loudly instead of silently.

function preflight() {
  const violations = [];

  // 1. No pnpm/yarn lockfiles at root or in workspaces.
  const forbiddenLocks = ["pnpm-lock.yaml", "yarn.lock", "pnpm-workspace.yaml"];
  for (const name of forbiddenLocks) {
    if (existsSync(join(rootDir, name))) {
      violations.push(
        `${name} exists at repo root. The repo is npm-only; remove it.`,
      );
    }
  }
  for (const dir of ["packages", "apps"]) {
    const root = join(rootDir, dir);
    if (!existsSync(root)) continue;
    for (const sub of readdirSync(root)) {
      for (const name of forbiddenLocks) {
        const path = join(root, sub, name);
        if (existsSync(path)) {
          violations.push(
            `${dir}/${sub}/${name} exists. The repo is npm-only; remove it.`,
          );
        }
      }
    }
  }

  // 2. No `workspace:*` / `catalog:` / `portal:` protocols in any
  //    package.json — those are pnpm/Yarn syntax that npm rejects.
  const checkPkgJson = (path) => {
    if (!existsSync(path)) return;
    const raw = readFileSync(path, "utf8");
    if (/"\s*(workspace|catalog|portal)\s*:/.test(raw)) {
      violations.push(
        `${path} uses pnpm/Yarn dep syntax (workspace:/catalog:/portal:). Use \`file:../<pkg>\` for cross-package deps.`,
      );
    }
  };
  for (const dir of ["packages", "apps"]) {
    const root = join(rootDir, dir);
    if (!existsSync(root)) continue;
    for (const sub of readdirSync(root)) {
      checkPkgJson(join(root, sub, "package.json"));
    }
  }
  checkPkgJson(join(rootDir, "package.json"));

  if (violations.length > 0) {
    console.error("\nPre-flight failed:");
    for (const v of violations) console.error(`  ✗ ${v}`);
    console.error("\nSee README.md \"Conventions\" section.");
    process.exit(1);
  }
}

preflight();

const steps = [
  ["domain build", "npm", ["run", "build", "--prefix", resolve(rootDir, "packages/domain")]],
  ["domain typecheck", "npm", ["run", "typecheck", "--prefix", resolve(rootDir, "packages/domain")]],
  ["domain tests", "npm", ["test", "--prefix", resolve(rootDir, "packages/domain")]],
  ["cash-engine typecheck", "npm", ["run", "typecheck", "--prefix", resolve(rootDir, "packages/cash-engine")]],
  ["cash-engine build", "npm", ["run", "build", "--prefix", resolve(rootDir, "packages/cash-engine")]],
  ["cash-engine tests", "npm", ["test", "--prefix", resolve(rootDir, "packages/cash-engine")]],
  ["ai typecheck", "npm", ["run", "typecheck", "--prefix", resolve(rootDir, "packages/ai")]],
  ["ai build", "npm", ["run", "build", "--prefix", resolve(rootDir, "packages/ai")]],
  ["ai tests", "npm", ["test", "--prefix", resolve(rootDir, "packages/ai")]],
  ["db typecheck", "npm", ["run", "typecheck", "--prefix", resolve(rootDir, "packages/db")]],
  ["db build", "npm", ["run", "build", "--prefix", resolve(rootDir, "packages/db")]],
  ["db tests", "npm", ["test", "--prefix", resolve(rootDir, "packages/db")]],
  ["policy typecheck", "npm", ["run", "typecheck", "--prefix", resolve(rootDir, "packages/policy")]],
  ["policy build", "npm", ["run", "build", "--prefix", resolve(rootDir, "packages/policy")]],
  ["policy tests", "npm", ["test", "--prefix", resolve(rootDir, "packages/policy")]],
  ["workers typecheck", "npm", ["run", "typecheck", "--prefix", resolve(rootDir, "apps/workers")]],
  ["workers tests", "npm", ["test", "--prefix", resolve(rootDir, "apps/workers")]],
  ["api typecheck", "npm", ["run", "typecheck", "--prefix", resolve(rootDir, "apps/api")]],
  ["api build", "npm", ["run", "build", "--prefix", resolve(rootDir, "apps/api")]],
  ["api tests", "npm", ["test", "--prefix", resolve(rootDir, "apps/api")]],
  ["web typecheck", "npm", ["run", "typecheck", "--prefix", resolve(rootDir, "apps/web")]],
  ["web build", "npm", ["run", "build", "--prefix", resolve(rootDir, "apps/web")]],
  ["web tests", "npm", ["test", "--prefix", resolve(rootDir, "apps/web")]]
];

for (const [label, command, args] of steps) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: runDir,
    stdio: "inherit",
    shell: false
  });

  if (result.status !== 0) {
    console.error(`\nVerification failed at: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nAll package verification steps passed.");
