#!/usr/bin/env node

/**
 * Reproducible, non-destructive SOW audit for TrustLeaf.
 *
 * Default mode is offline and does not contact databases, Stellar, wallets,
 * Testnet, production, or any application endpoint. Secret candidates are
 * reported by file, line and rule only; matched values are never printed.
 *
 * Optional flags:
 *   --verify  run local typecheck and unit tests when node_modules exists
 *   --build   run isolated Next.js build (implies --verify; writes .next/sow-build-*; Google Fonts network)
 *   --contracts run all four contract tests plus E2E offline
 *   --scan    optional redacted scan of tracked source; never prints values
 *   --online  query the npm registry with npm audit
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, dirname, join } from "node:path";

const args = new Set(process.argv.slice(2));
const runVerify = args.has("--verify") || args.has("--build");
const runBuild = args.has("--build");
const runOnline = args.has("--online");
const evidenceDir = "docs/evidence/sow-2026-09-05";
mkdirSync(evidenceDir, { recursive: true });
const checks = [];
let failed = false;
for (const arg of args) if (!["--verify", "--build", "--online", "--contracts", "--scan"].includes(arg)) throw new Error("Unknown flag: " + arg);

function run(label, command, commandArgs, options = {}) {
  console.log(`\n## ${label}`);
  const isWindowsShim =
    process.platform === "win32" && ["npm", "npx"].includes(command);
  const executable = isWindowsShim ? process.execPath : command;
  const argsForProcess = isWindowsShim
    ? [join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"), ...commandArgs]
    : commandArgs;
  const result = spawnSync(executable, argsForProcess, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });
  const output = (result.stdout ?? "") + (result.stderr ?? "");
  process.stdout.write(output);
  const log = label.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".txt";
  writeFileSync(evidenceDir + "/" + log, output);
  checks.push({ label, command, args: commandArgs, exitCode: result.status, error: result.error?.message, log });
  if (result.status !== 0) failed = true;
  console.log(`result: ${result.status === 0 ? "PASS" : `FAIL (${result.status ?? "no exit code"})`}`);
  return result.status ?? 1;
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function secretScan() {
  console.log("\n## Redacted secret-candidate scan");
  const rules = [
    ["private-key-pem", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ["stellar-secret-seed", /(?:^|[^A-Z2-7])S[A-Z2-7]{55}(?:$|[^A-Z2-7])/],
    ["database-url-with-credentials", /(?:postgres|postgresql):\/\/[^\s:@]+:[^\s@]+@/i],
    ["assigned-secret", /(?:api[_-]?key|secret|token|password|private[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/i],
  ];
  const binaryExtensions = new Set([".ico", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".glb", ".woff", ".woff2"]);
  let candidates = 0;

  for (const file of trackedFiles()) {
    if (!existsSync(file) || binaryExtensions.has(extname(file).toLowerCase())) continue;
    if (file.endsWith("package-lock.json") || file.endsWith("Cargo.lock")) continue;
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      for (const [name, pattern] of rules) {
        if (pattern.test(line)) {
          candidates += 1;
          console.log(`${file}:${index + 1}\t${name}\t[value redacted]`);
        }
      }
    }
  }
  console.log(`candidates: ${candidates} (review required; a match is not proof of a live secret)`);
}

console.log("TrustLeaf SOW audit");
console.log(`cwd: ${process.cwd()}`);
run("Git state", "git", ["status", "--short", "--branch"]);
run("Dependency tree", "npm", ["ls", "--depth=0"]);
if (args.has("--scan")) secretScan();

if (runOnline) run("npm audit (registry access)", "npm", ["audit"]);

if (runVerify) {
  if (!existsSync("node_modules/.bin")) {
    failed = true;
    console.log("\n## Local verification\nSKIP: node_modules is absent; install dependencies explicitly before retrying.");
  } else {
    run("Typecheck", process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"]);
    run("Unit tests", "npm", ["test"]);
    if (runBuild) run("Next.js build", process.execPath, ["scripts/build-sow-local.mjs"]);
  }
}

console.log("\nExcluded by design: test:onchain, test:flow, test:phases, smoke:sandbox, migrations, seeds and deploy commands.");

if (args.has("--contracts")) run("Rust contracts", "cargo", ["test", "--offline", "--locked", "--manifest-path", "contracts/Cargo.toml", "-p", "doctor-registry", "-p", "prescription-soulbound", "-p", "clinical-record", "-p", "document-soulbound", "-p", "trustleaf-e2e"]);
writeFileSync(evidenceDir + "/results.json", JSON.stringify({ timestamp: new Date().toISOString(), baseCommit: execFileSync("git", ["rev-parse", "HEAD"], {encoding:"utf8"}).trim(), workingTree: true, checks, passed: !failed }, null, 2) + "\n");
process.exitCode = failed ? 1 : 0;
