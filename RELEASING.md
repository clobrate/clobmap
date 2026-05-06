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
      "signature": "<base64 of clobmap.app.tar.gz.sig from the aarch64 build>",
      "url": "https://github.com/clobrate/clobmap/releases/download/v0.2.0/clobmap_0.2.0_aarch64.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "<base64 of clobmap.app.tar.gz.sig from the x86_64 build>",
      "url": "https://github.com/clobrate/clobmap/releases/download/v0.2.0/clobmap_0.2.0_x64.app.tar.gz"
    },
    "windows-x86_64": { "signature": "...", "url": "..." },
    "linux-x86_64": { "signature": "...", "url": "..." }
  }
}
```

**Important:** the two macOS `.app.tar.gz` files have the same name in their respective build directories. When you upload to GitHub Releases, rename one (e.g. add `_aarch64` / `_x64` suffix) so they don't collide.

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

On macOS — build **both** architectures:

```bash
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/clobmap-updater.key)" \
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<your passphrase>" \
  npm run tauri:build:mac:both
```

On Windows / Linux:

```bash
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/clobmap-updater.key)" \
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<your passphrase>" \
  npm run tauri build
```

Outputs land in `src-tauri/target/<target-triple-or-release>/bundle/<format>/` along with their `.sig` files.

### 5. Assemble `latest.json`

Pick one signature line per platform (they're emitted next to the bundle as `<bundle>.sig`). Fill the URL with the soon-to-exist GitHub Releases asset URL.

### 6. Create the GitHub Release

```bash
# Stage macOS updater bundles with arch-suffixed names so both can live in the
# same release without colliding.
cp src-tauri/target/aarch64-apple-darwin/release/bundle/macos/clobmap.app.tar.gz \
   ./clobmap_aarch64.app.tar.gz
cp src-tauri/target/aarch64-apple-darwin/release/bundle/macos/clobmap.app.tar.gz.sig \
   ./clobmap_aarch64.app.tar.gz.sig
cp src-tauri/target/x86_64-apple-darwin/release/bundle/macos/clobmap.app.tar.gz \
   ./clobmap_x64.app.tar.gz
cp src-tauri/target/x86_64-apple-darwin/release/bundle/macos/clobmap.app.tar.gz.sig \
   ./clobmap_x64.app.tar.gz.sig

gh release create v0.2.0 \
  --title "v0.2.0" \
  --notes-file CHANGELOG-v0.2.0.md \
  src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/clobmap_*_aarch64.dmg \
  src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/clobmap_*_x64.dmg \
  ./clobmap_aarch64.app.tar.gz ./clobmap_aarch64.app.tar.gz.sig \
  ./clobmap_x64.app.tar.gz ./clobmap_x64.app.tar.gz.sig \
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

## macOS signing & notarization

Set up once, by whoever holds the Apple Developer membership.

### Find your signing identity

In Keychain Access (or `security find-identity -p codesigning -v`) look for an entry of the form:

```
Developer ID Application: Your Name (TEAMID12)
```

That whole string (including the parentheses with the Team ID) is your **`APPLE_SIGNING_IDENTITY`**.

### Generate an app-specific password

Apple notarization needs a password that's different from your Apple ID login password.

1. https://appleid.apple.com → Sign in.
2. **Sign-in and Security** → **App-Specific Passwords** → **+** → label it `clobmap-notarization`.
3. Copy the generated `xxxx-xxxx-xxxx-xxxx` value.

### Find your Team ID

https://developer.apple.com/account → **Membership** → 10-character "Team ID."

### Set the env vars locally

Append to `~/.zshrc` (or `.bashrc`):

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID12)"
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="TEAMID12"
```

Reload (`source ~/.zshrc`) before building.

### Add the Intel target once

`tauri build` defaults to your host architecture. To ship to Intel Macs as well, install the cross-compile target once:

```bash
rustup target add x86_64-apple-darwin
```

(~50 MB download. Apple Silicon target `aarch64-apple-darwin` was installed automatically when you set Rust up.)

### Build signed + notarized `.dmg` for both architectures

```bash
# Apple Silicon (M1+)
npm run tauri:build:mac:arm

# Intel
npm run tauri:build:mac:intel

# Or both back-to-back
npm run tauri:build:mac:both
```

Outputs:

| Architecture  | DMG                                                                                  | Updater bundle                     |
| ------------- | ------------------------------------------------------------------------------------ | ---------------------------------- |
| Apple Silicon | `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/clobmap_<ver>_aarch64.dmg` | `…/macos/clobmap.app.tar.gz(.sig)` |
| Intel         | `src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/clobmap_<ver>_x64.dmg`      | `…/macos/clobmap.app.tar.gz(.sig)` |

When the env vars above are set, Tauri does each of these for **each** architecture:

1. Code-signs the `.app` with your Developer ID + hardened runtime.
2. Submits the bundle to Apple's notarization service via `notarytool`.
3. Staples the notarization ticket to the `.dmg`.

Per-arch wall-clock time: ~5–10 minutes. Plan ~15 min total for both.

### Verify locally

```bash
# Should print: source=Notarized Developer ID
spctl --assess --type execute --verbose \
  src-tauri/target/release/bundle/macos/clobmap.app

# Should print: The validate action worked!
xcrun stapler validate \
  src-tauri/target/release/bundle/dmg/clobmap_*.dmg
```

If a stranger downloads the `.dmg` and double-clicks the `.app`, **no** "unidentified developer" warning should appear — only the standard "downloaded from the internet" prompt that any signed app gets.

### Verify file association

After install:

1. Open Finder. Right-click any `.clobmap.yaml` file → **Get Info**.
2. **Open with:** should default to **clobmap.app**.
3. Double-click the file → clobmap launches and opens it.
4. A plain `.yaml` file should **not** be associated with clobmap.

If either is wrong, run `lsregister` to refresh:

```bash
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister \
  -kill -r -domain local -domain user
```

## CI secrets for macOS signing

In the GitHub repo's Actions secrets, mirror the local env vars:

| Secret                       | Value                                                                |
| ---------------------------- | -------------------------------------------------------------------- |
| `APPLE_SIGNING_IDENTITY`     | full string, e.g. `Developer ID Application: Your Name (TEAMID12)`   |
| `APPLE_CERTIFICATE`          | base64-encoded `.p12` export of your Developer ID cert + private key |
| `APPLE_CERTIFICATE_PASSWORD` | password you used when exporting the `.p12`                          |
| `APPLE_ID`                   | your Apple ID email                                                  |
| `APPLE_PASSWORD`             | the app-specific password                                            |
| `APPLE_TEAM_ID`              | your Team ID                                                         |

To produce the base64 `.p12`:

```bash
# In Keychain Access, export the cert + private key as cert.p12 with a password.
base64 -i ~/cert.p12 -o ~/cert.p12.b64
# Paste the contents of ~/cert.p12.b64 as the secret value.
```

Phase 11's CI workflow will base64-decode this into a temporary keychain on each runner.

## Windows signing

Deferred — see `implementation-plan.md` Phase 10 alternatives. Builds currently emit unsigned `.msi` / `.exe`. Users see a SmartScreen "unrecognized app" warning that they can dismiss with **More info → Run anyway**. This is acceptable until clobmap has a Windows user base big enough to warrant a code-signing cert.

When ready, the cleanest path is **Azure Trusted Signing** — no USB token, ~$10/month, integrates with `signtool`. Add the Azure plugin to Tauri's Windows bundle config and the corresponding env vars to CI.

## Linux signing

AppImage is unsigned by convention. The `.deb` package can be GPG-signed if we ever publish via apt; for direct downloads it isn't necessary.

## Deferred to later phases

- **Update channels (stable / beta).** Point the beta endpoint at a different `latest.json` artifact. Add when there's something to ship as beta.
- **Automated CI release pipeline.** Phase 11 turns the manual signing/notarization steps into a GitHub Actions matrix triggered by a tag.
- **Windows code-signing.** See above.
