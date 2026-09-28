/**
 * clobmap skill CLI entrypoint. Phase 0 ships the engine (`core.ts`) and node
 * addressing (`addressing.ts`); the command surface (doc/tree/notes/tags/…)
 * lands in Phases 1–5 per docs/clobmap-skill-implementation-plan.md.
 *
 * Run: `npm run clobmap -- <command> …`  (via tsx).
 */
function main(argv: string[]): number {
  const [command] = argv;
  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(
      "clobmap — headless clobmap document toolkit\n" +
        "Commands land in Phase 1 (doc/tree), Phase 2 (notes), Phase 3 (tags), …\n" +
        "See docs/clobmap-skill-implementation-plan.md.\n",
    );
    return 0;
  }
  process.stderr.write(`Unknown command: ${command} (not implemented yet)\n`);
  return 1;
}

process.exit(main(process.argv.slice(2)));
