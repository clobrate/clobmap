/**
 * Build the standalone `clobmap` CLI binary (bundled-CLI plan, Phase 0–1).
 *
 * Pipeline: esbuild bundle (all pure-TS deps inlined) → Node SEA blob →
 * inject the blob into a target-arch node base → (macOS) re-sign ad-hoc.
 * Output: dist-cli/clobmap[.exe] plus the Tauri sidecar at
 * src-tauri/binaries/clobmap-<target-triple>[.exe].
 *
 * Usage: node scripts/build-cli.mjs [--target <rust-triple>]   (default: host)
 *
 * Cross-arch note: the SEA blob is architecture-independent, so it's generated
 * once with a runnable SEA-capable node and injected into the *target* arch's
 * official node — this lets the arm64 macOS runner also emit the x86_64 sidecar.
 *
 * Isolated here on purpose: swapping to Bun `--compile` (product doc D4
 * fallback) is a change to this one file.
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, statSync, chmodSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "dist-cli");
const SIDECAR_DIR = path.join(ROOT, "src-tauri", "binaries");
const BUNDLE = path.join(OUT_DIR, "clobmap.cjs");
const BLOB = path.join(OUT_DIR, "clobmap.blob");
const CACHE = path.join(ROOT, ".sea-node");
// The Node SEA fuse sentinel (fixed, documented constant).
const FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

// Rust triple ↔ Node dist (os-arch). Windows is only ever built on a Windows
// runner (host == target), so it never needs a cross download.
const TRIPLE_TO_DIST = {
  "aarch64-apple-darwin": "darwin-arm64",
  "x86_64-apple-darwin": "darwin-x64",
  "x86_64-unknown-linux-gnu": "linux-x64",
  "aarch64-unknown-linux-gnu": "linux-arm64",
  "x86_64-pc-windows-msvc": "win-x64",
};
const platMap = { win32: "win", darwin: "darwin", linux: "linux" };
const HOST_DIST = `${platMap[process.platform]}-${process.arch}`;
const HOST_TRIPLE = Object.keys(TRIPLE_TO_DIST).find((t) => TRIPLE_TO_DIST[t] === HOST_DIST);

// --- args ---
const targetArg = process.argv.indexOf("--target");
const TARGET = targetArg >= 0 ? process.argv[targetArg + 1] : HOST_TRIPLE;
if (!TRIPLE_TO_DIST[TARGET]) {
  throw new Error(`Unknown --target "${TARGET}". Known: ${Object.keys(TRIPLE_TO_DIST).join(", ")}`);
}
const targetDist = TRIPLE_TO_DIST[TARGET];
const isWinTarget = TARGET.includes("windows");
const isMacTarget = TARGET.includes("darwin");
const EXT = isWinTarget ? ".exe" : "";
const BIN = path.join(OUT_DIR, `clobmap${EXT}`);
// Bundled sidecar base name must differ from the Cargo crate name (`clobmap`);
// it's installed on PATH as the `clobmap` command via a symlink (see cli_tool.rs).
const SIDECAR = path.join(SIDECAR_DIR, `clobmap-cli-${TARGET}${EXT}`);

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...opts });
}
function log(msg) {
  process.stdout.write(`[build-cli] ${msg}\n`);
}

/** Download (and cache) an official Node build for the given dist (os-arch);
 * returns the path to its `node` binary. Only unix (tar.gz) — Windows never
 * cross-builds here. */
function officialNode(dist) {
  const ver = process.version;
  const name = `node-${ver}-${dist}`;
  const nodeBin = path.join(CACHE, name, "bin", "node");
  if (existsSync(nodeBin)) return nodeBin;
  log(`fetching official ${name}…`);
  mkdirSync(CACHE, { recursive: true });
  const url = `https://nodejs.org/dist/${ver}/${name}.tar.gz`;
  const tgz = path.join(CACHE, `${name}.tar.gz`);
  // fetch is sync-awaited by the caller via top-level await below.
  return fetch(url).then(async (res) => {
    if (!res.ok) throw new Error(`download failed (${res.status}): ${url}`);
    writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
    run("tar", ["-xzf", tgz, "-C", CACHE]);
    if (!existsSync(nodeBin)) throw new Error(`extracted node not found at ${nodeBin}`);
    return nodeBin;
  });
}

/** A runnable, SEA-capable node for generating the blob (must run on the host). */
async function seaConfigNode() {
  if (process.config?.variables?.single_executable_application) return process.execPath;
  // Host node lacks SEA (e.g. Homebrew) → use the official host build.
  return officialNode(HOST_DIST);
}

/** The base binary to inject into — the *target* arch's node (official builds
 * are SEA-capable). Host-target reuses the config node / current node. */
async function baseNode() {
  if (targetDist === HOST_DIST) return seaConfigNode();
  return officialNode(targetDist);
}

// --- build ---
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(SIDECAR_DIR, { recursive: true });

log(`target ${TARGET} (node dist ${targetDist}); host ${HOST_DIST}`);

// 1. Bundle cli.ts + pure-TS deps into one CJS file (package.json inlined).
log("bundling with esbuild…");
await build({
  entryPoints: [path.join(ROOT, "skills/clobmap/cli.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: BUNDLE,
  logLevel: "warning",
  // `import.meta.url` is only used in the source/ESM `docs` fallback; the SEA
  // binary always reads the embedded asset, so that branch is dead here.
  logOverride: { "empty-import-meta": "silent" },
});

// 2. Generate the (arch-independent) SEA blob using a runnable SEA node.
const configNode = await seaConfigNode();
log("generating SEA blob…");
run(configNode, ["--experimental-sea-config", "sea-config.json"]);

// 3. Copy the target-arch node as the base executable.
const base = await baseNode();
log(`base runtime: ${path.relative(ROOT, base)}`);
copyFileSync(base, BIN);
chmodSync(BIN, 0o755);

// 4. macOS: strip the existing signature before injecting.
if (isMacTarget) {
  log("removing macOS signature…");
  run("codesign", ["--remove-signature", BIN]);
}

// 5. Inject the blob (macho segment on macOS).
log("injecting blob with postject…");
const postject = path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "postject.cmd" : "postject");
const injectArgs = [BIN, "NODE_SEA_BLOB", BLOB, "--sentinel-fuse", FUSE];
if (isMacTarget) injectArgs.push("--macho-segment-name", "NODE_SEA");
run(postject, injectArgs);

// 6. macOS: ad-hoc re-sign for local runs (CI re-signs with the real identity
//    during app bundling / notarization).
if (isMacTarget) {
  log("ad-hoc re-signing…");
  run("codesign", ["--sign", "-", "--force", BIN]);
}

// 7. Stage the Tauri sidecar (triple-named).
copyFileSync(BIN, SIDECAR);
chmodSync(SIDECAR, 0o755);

const sizeMB = (statSync(BIN).size / 1024 / 1024).toFixed(1);
log(`done → ${path.relative(ROOT, BIN)} + ${path.relative(ROOT, SIDECAR)}  (${sizeMB} MB)`);
