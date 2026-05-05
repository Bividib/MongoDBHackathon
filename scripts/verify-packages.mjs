import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runDir = tmpdir();

const steps = [
  ["domain build", "npm", ["run", "build", "--prefix", resolve(rootDir, "packages/domain")]],
  ["domain typecheck", "npm", ["run", "typecheck", "--prefix", resolve(rootDir, "packages/domain")]],
  ["domain tests", "npm", ["test", "--prefix", resolve(rootDir, "packages/domain")]],
  ["cash-engine typecheck", "npm", ["run", "typecheck", "--prefix", resolve(rootDir, "packages/cash-engine")]],
  ["cash-engine tests", "npm", ["test", "--prefix", resolve(rootDir, "packages/cash-engine")]],
  ["ai typecheck", "npm", ["run", "typecheck", "--prefix", resolve(rootDir, "packages/ai")]],
  ["ai build", "npm", ["run", "build", "--prefix", resolve(rootDir, "packages/ai")]],
  ["ai tests", "npm", ["test", "--prefix", resolve(rootDir, "packages/ai")]],
  ["db typecheck", "npm", ["run", "typecheck", "--prefix", resolve(rootDir, "packages/db")]],
  ["db build", "npm", ["run", "build", "--prefix", resolve(rootDir, "packages/db")]],
  ["db tests", "npm", ["test", "--prefix", resolve(rootDir, "packages/db")]],
  ["workers typecheck", "npm", ["run", "typecheck", "--prefix", resolve(rootDir, "apps/workers")]],
  ["workers tests", "npm", ["test", "--prefix", resolve(rootDir, "apps/workers")]]
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
