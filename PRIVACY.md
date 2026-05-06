# clobmap privacy notice

_Last updated: 2026-05-06_

clobmap is a **local-first** application. Everything below is what the software actually does today; if any of this changes, this file changes with it.

## TL;DR

- Your mind maps stay on **your** disk (desktop) or in **your** browser (web).
- We don't run a server that sees your data. There's no account, no sync, no telemetry.
- The only network calls clobmap makes are: (a) loading the web app from `clobmap.com` if that's how you got here, and (b) checking GitHub Releases for desktop updates.

## What clobmap stores, and where

| Thing                                                         | Where it lives                                                                                         | Who can see it                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Your YAML files (the mind maps)                               | The path you save to on your machine, or — on the web — your browser's IndexedDB / a file you download | Only you, and anyone you share the file with |
| Recent files list                                             | `tauri-plugin-store`'s app data dir (desktop) or `localStorage` (web)                                  | Only you                                     |
| Settings (theme, font size, auto-save, split orientation)     | Same as above                                                                                          | Only you                                     |
| In-progress draft (auto-recovery if you close without saving) | `localStorage` (web)                                                                                   | Only you                                     |

clobmap **does not** transmit any of the above off your device.

## What clobmap sends over the network

There are exactly two outbound calls:

1. **Cloudflare Pages** serves the web build at https://clobmap.com. Standard HTTP request logs (IP, user-agent, path) are kept by Cloudflare per their [privacy policy](https://www.cloudflare.com/privacypolicy/). We do not run any analytics on top of those logs.
2. **GitHub Releases** is queried by the **desktop app** to check for updates: once 30s after launch, then every 24 hours. The request includes the current app version (so the server can tell us about anything newer) and standard HTTP metadata. GitHub's privacy policy applies.

That's it for the always-on path. No other domains are contacted. No analytics. No telemetry.

### Optional, opt-in: crash reporting

If your build was packaged with a Sentry DSN (off by default for self-hosted builds, off by default for the official build until we turn it on) **and** you flip **Send crash reports** on in `⚙ → Settings`, crashes are sent to Sentry. Before any event leaves your machine, it goes through a pure scrubbing pass (`src/lib/telemetry.ts → scrubEvent`) which:

- Replaces local home-directory paths with `<HOME>` in messages, exception values, and stack-frame filenames.
- Strips query strings, request bodies, cookies, and headers from any captured request.
- Drops every breadcrumb (clicks, console calls, navigation history). The breadcrumb integration is also disabled at SDK init.
- Drops Sentry's user identifier, server name, and device hostname.
- Never sends `yamlText`, `documentContents`, or `fileContents` if any of those names appear in event metadata.
- Truncates strings over 500 chars in the event's message and `extra` fields, in case anything user-pasted ended up there.

The scrubber is unit-tested (`src/lib/__tests__/telemetry.test.ts`). You can run those tests yourself to verify what does and doesn't make it through.

## What clobmap does **not** do

- No accounts, no sign-in.
- No cloud sync. Your maps don't go anywhere unless you explicitly share or back up the file yourself.
- No advertising.
- No tracking pixels, fingerprinting, or third-party scripts.
- No reading your other files. Only files you explicitly open through the picker are touched.

## Cookies

The web app **does not set cookies**. Cloudflare may set a small operational cookie (`__cf_bm`, bot-mitigation) on the edge for ~30 minutes; that's a Cloudflare-side thing, not ours, and it does not identify you across sessions.

## Children

clobmap is a general-purpose tool with no targeted audience. We don't knowingly collect anything from anyone, regardless of age.

## Source code

clobmap is open source under GPL-3.0 at https://github.com/clobrate/clobmap. You can verify every claim in this file by reading the code.

## Contact

Questions? Open a GitHub issue at https://github.com/clobrate/clobmap/issues.
