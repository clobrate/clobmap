#!/usr/bin/env node
/**
 * Atomic version bump across the three places clobmap tracks its version:
 *   • package.json
 *   • src-tauri/Cargo.toml
 *   • src-tauri/tauri.conf.json
 *
 * Usage:
 *   node scripts/bump-version.mjs 0.2.0
 *   npm run version:bump -- 0.2.0
 *
 * Refuses to overwrite if any file is already at a higher version, to avoid
 * accidental regressions.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];

if (!target || !/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(target)) {
  console.error("Usage: node scripts/bump-version.mjs <semver>");
  process.exit(1);
}

const PKG = path.join(repoRoot, "package.json");
const CARGO = path.join(repoRoot, "src-tauri/Cargo.toml");
const TAURI = path.join(repoRoot, "src-tauri/tauri.conf.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

function compareSemver(a, b) {
  const [aMain] = a.split(/[-+]/, 1);
  const [bMain] = b.split(/[-+]/, 1);
  const ap = aMain.split(".").map(Number);
  const bp = bMain.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (ap[i] > bp[i]) return 1;
    if (ap[i] < bp[i]) return -1;
  }
  return 0;
}

const pkg = readJson(PKG);
const conf = readJson(TAURI);
const cargoText = fs.readFileSync(CARGO, "utf8");
const cargoMatch = cargoText.match(/^version = "(.+)"$/m);
if (!cargoMatch) {
  console.error("Could not find a top-level `version = ...` line in Cargo.toml");
  process.exit(1);
}

const current = {
  package: pkg.version,
  cargo: cargoMatch[1],
  tauri: conf.version,
};

for (const [name, version] of Object.entries(current)) {
  if (compareSemver(version, target) > 0) {
    console.error(`${name} is already at ${version}, refusing to downgrade to ${target}`);
    process.exit(1);
  }
}

pkg.version = target;
writeJson(PKG, pkg);

const cargoUpdated = cargoText.replace(/^version = ".+"$/m, `version = "${target}"`);
fs.writeFileSync(CARGO, cargoUpdated);

conf.version = target;
writeJson(TAURI, conf);

console.log(`Bumped to ${target}:`);
console.log(`  package.json     ${current.package}  →  ${target}`);
console.log(`  Cargo.toml       ${current.cargo}  →  ${target}`);
console.log(`  tauri.conf.json  ${current.tauri}  →  ${target}`);
