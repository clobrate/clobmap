import { test as base, expect } from "@playwright/test";

// Retained "Wedding planning" example — was clobmap's original first-paint
// seed (see docs/default-sample-*.md). It is no longer the app default, but
// the e2e suite has no fixture-loading and ~17 specs drive this exact tree
// ("Our wedding" / "Venue" / "Guests" / ...). Rather than rewrite them all,
// they import `test` from here, which seeds this document as the working doc.
// Keep this in sync with examples/wedding-planning.clobmap.yaml.
export const WEDDING_YAML = `title: Wedding planning
version: 1
root:
  id: n1
  text: Our wedding
  children:
    - id: n2
      text: Venue
      children:
        - id: n3
          text: Ceremony
          children: []
        - id: n4
          text: Reception
          children: []
    - id: n5
      text: Guests
      children:
        - id: n6
          text: Family
          children: []
        - id: n7
          text: Friends
          children: []
    - id: n8
      text: Vendors
      children:
        - id: n9
          text: Catering
          children: []
        - id: n10
          text: Photographer
          children: []
        - id: n11
          text: Florist
          children: []
    - id: n12
      text: Schedule
      children:
        - id: n13
          text: Save the date
          children: []
        - id: n14
          text: Send invites
          children: []
`;

// Playwright's draft key/shape — mirrors src/lib/draft.ts (KEY, VERSION,
// Draft { v, yamlText, savedAt }). Must stay in lockstep with that file.
const DRAFT_KEY = "clobmap-draft";
const DRAFT_VERSION = 1;

/**
 * A `test` that seeds the retained Wedding sample as the working document,
 * so specs written against that tree keep passing now that the app's own
 * first-paint seed is the techie daily-driver.
 *
 * Seeds via an init-script that writes the localStorage draft BEFORE the app
 * boots (the draft takes precedence over the default seed). Crucially it only
 * writes when no draft exists yet — so a test that edits and reloads keeps
 * its own draft (drift-free with draft-persistence specs).
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(
      ({ key, version, yaml }) => {
        try {
          if (!window.localStorage.getItem(key)) {
            window.localStorage.setItem(
              key,
              JSON.stringify({ v: version, yamlText: yaml, savedAt: Date.now() }),
            );
          }
        } catch {
          // localStorage may be unavailable (private mode); non-fatal.
        }
      },
      { key: DRAFT_KEY, version: DRAFT_VERSION, yaml: WEDDING_YAML },
    );
    await use(page);
  },
});

export { expect };
