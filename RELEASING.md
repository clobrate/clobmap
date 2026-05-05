# Releasing clobmap

How to cut a desktop release that delivers via the in-app auto-updater.

The auto-updater (Phase 9) verifies a signed `latest.json` against an embedded public key. The signing private key never lives in the repo — it lives only in CI secrets and (optionally) on a backup machine.

## One-time setup

Done once, by whoever holds release authority.

### 1. Generate the signing keypair

```bash
npx @tauri-apps/cli signer generate -w ~/clobmap-updater.key
```

This produces:

- `~/clobmap-updater.key` — **private key**. Treat like an SSH private key. Never commit. Optionally encrypt with a passphrase.
- `~/clobmap-updater.key.pub` — **public key** (a single base64 line).

### 2. Embed the public key in the app

Open `src-tauri/tauri.conf.json` and replace the placeholder:

```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/clobrate/clobmap/releases/latest/download/latest.json"
    ],
    "pubkey": "<paste contents of ~/clobmap-updater.key.pub here>"
  }
}
```

Commit this change. The pubkey is safe to commit; the private one is not.

### 3. Store the private key + password as GitHub secrets

In the GitHub repo settings → Secrets and variables → Actions, add:

| Secret name                          | Value                                    |
| ------------------------------------ | ---------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | full contents of `~/clobmap-updater.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the passphrase you set, or empty if none |

CI uses these to sign the bundles + emit `*.sig` files.

### 4. Verify the endpoint format

Tauri expects `latest.json` to look like:

```json
{
  "version": "0.2.0",
  "pub_date": "2026-06-01T12:00:00Z",
  "notes": "## What's new\n- ...",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<base64 of clobmap.app.tar.gz.sig>",
      "url": "https://github.com/clobrate/clobmap/releases/download/v0.2.0/clobmap_0.2.0_aarch64.app.tar.gz"
    },
    "darwin-x86_64": { "signature": "...", "url": "..." },
    "windows-x86_64": { "signature": "...", "url": "..." },
    "linux-x86_64": { "signature": "...", "url": "..." }
  }
}
```

GitHub Releases serves any uploaded artifact at a stable URL; `latest.json` is just another artifact.

## Cutting a release

This is what you do per release. Phase 11 will automate steps 4–8 with GitHub Actions; until then they're manual.

### 1. Bump the version in three places (must match)

```
package.json           "version": "0.2.0"
src-tauri/Cargo.toml   version = "0.2.0"
src-tauri/tauri.conf.json   "version": "0.2.0"
```

### 2. Sanity-check locally

```bash
npm run lint
npm run typecheck
npm run test
npm run build:web
```

### 3. Tag and push

```bash
git commit -am "Release v0.2.0"
git tag v0.2.0
git push origin main --tags
```

### 4. Build signed installers (one platform at a time, on each platform)

On each of macOS / Windows / Linux:

```bash
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/clobmap-updater.key)" \
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<your passphrase>" \
  npm run tauri build
```

Outputs land in `src-tauri/target/release/bundle/<format>/` along with their `.sig` files.

### 5. Assemble `latest.json`

Pick one signature line per platform (they're emitted next to the bundle as `<bundle>.sig`). Fill the URL with the soon-to-exist GitHub Releases asset URL.

### 6. Create the GitHub Release

```bash
gh release create v0.2.0 \
  --title "v0.2.0" \
  --notes-file CHANGELOG-v0.2.0.md \
  src-tauri/target/release/bundle/dmg/clobmap_*.dmg \
  src-tauri/target/release/bundle/macos/clobmap.app.tar.gz \
  src-tauri/target/release/bundle/macos/clobmap.app.tar.gz.sig \
  src-tauri/target/release/bundle/msi/clobmap_*_x64_en-US.msi \
  src-tauri/target/release/bundle/nsis/clobmap_*_x64-setup.exe \
  src-tauri/target/release/bundle/appimage/clobmap_*.AppImage \
  src-tauri/target/release/bundle/appimage/clobmap_*.AppImage.sig \
  latest.json
```

### 7. Smoke-test the auto-update

1. Install the **previous** version on a fresh machine.
2. Launch it. Within 30 seconds the in-app banner should announce v0.2.0.
3. Click **Install & Relaunch**. The app downloads, signature-verifies, installs, and relaunches into v0.2.0.

### 8. If something is wrong

Roll back by deleting the GitHub Release (and its `latest.json`). Cloudflare-Pages-style rollback isn't applicable to desktop releases — installed users stay on the version they installed; new auto-update checks see only what `latest.json` says.

```bash
gh release delete v0.2.0 --cleanup-tag --yes
```

## Sanity checks

| Check                                                                                       | Expected |
| ------------------------------------------------------------------------------------------- | -------- |
| `pubkey` in `tauri.conf.json` is the long base64 line, not the placeholder                  | yes      |
| `~/clobmap-updater.key` is ignored from git (`*.key` is gitignored)                         | yes      |
| `latest.json` URL matches `tauri.conf.json` `endpoints[0]` exactly                          | yes      |
| Each platform entry's `signature` matches the bundle's `.sig` file contents                 | yes      |
| App version in `package.json`, `Cargo.toml`, `tauri.conf.json`, and `latest.json` all match | yes      |

## Deferred to later phases

- **Update channels (stable / beta).** The plumbing is straightforward — point the beta endpoint at a different `latest.json` artifact. Will be added when we genuinely have something to ship as beta.
- **Automated CI release pipeline.** Phase 11 turns step 4–8 into a GitHub Actions matrix that runs from a tag.
- **Notarization for macOS.** Phase 10 wires up Apple notarization so Gatekeeper accepts the signed `.dmg` without warnings.
