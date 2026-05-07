#!/usr/bin/env node
/**
 * Reorganize the Vite web build so that:
 *   /              -> the static landing page (was public/landing.html)
 *   /app           -> the SPA editor (was the default Vite index.html)
 *
 * Why we can't just use Cloudflare _redirects rewrites:
 * Cloudflare Pages' asset auto-redirect strips ".html" extensions and
 * 308-redirects /index.html and /landing.html to /index and /landing
 * before _redirects rewrites are evaluated. That broke the rewrite to
 * /app, which sent visitors back to the landing in a loop.
 *
 * Moving the actual files around is more robust: there's only one
 * matching asset for each URL, no auto-redirect, no `_redirects` games.
 */
import fs from "node:fs";
import path from "node:path";

const out = path.resolve("dist-web");
const spaSrc = path.join(out, "index.html");
const landingSrc = path.join(out, "landing.html");
const spaDest = path.join(out, "app", "index.html");
const landingDest = path.join(out, "index.html");

if (!fs.existsSync(spaSrc)) {
  console.error("post-build: missing dist-web/index.html (Vite output)");
  process.exit(1);
}
if (!fs.existsSync(landingSrc)) {
  console.error("post-build: missing dist-web/landing.html (public/landing.html)");
  process.exit(1);
}

fs.mkdirSync(path.dirname(spaDest), { recursive: true });
fs.renameSync(spaSrc, spaDest);
fs.renameSync(landingSrc, landingDest);

console.log("post-build: landing at /, SPA at /app/");
