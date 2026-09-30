import { useEffect, useState } from "react";
import { isMobile, isTauri } from "../lib/env";
import { loadCliPromptDismissed, saveCliPromptDismissed } from "../lib/settings";
import type { SkillStatus } from "./ClaudeSkillSection";

interface CliStatus {
  installed: boolean;
  is_ours: boolean;
  path: string | null;
  target: string | null;
}

/**
 * First-run consent prompt (bundled-CLI Phase 3, D6): on desktop launch, if the
 * `clobmap` CLI isn't already installed and the user hasn't opted out, offer a
 * one-click install. Never installs silently; always dismissible; and always
 * available afterwards from Settings → Command-line tool.
 *
 * When Claude Code is on this machine and the skill isn't installed yet, it also
 * offers the Claude Code skill as a checkbox, checked by default (S6). The two
 * installs are independent: each reports its own result.
 */
export function CliInstallPrompt(): React.ReactElement | null {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);
  const [offerSkill, setOfferSkill] = useState(false);
  const [withSkill, setWithSkill] = useState(true);

  useEffect(() => {
    if (!isTauri() || isMobile()) return;
    let cancelled = false;
    void (async () => {
      // Respect a prior "Don't ask again", and only offer when there's a
      // bundled binary to install and nothing usable is on PATH yet.
      if (await loadCliPromptDismissed()) return;
      const { invoke } = await import("@tauri-apps/api/core");
      const status = await invoke<CliStatus>("cli_status");
      if (cancelled || !status.target || status.is_ours) return;
      // Offer the skill only when there's a Claude Code to install it into and
      // nothing is there yet (not even someone else's skill).
      const skill = await invoke<SkillStatus>("skill_status").catch(() => null);
      if (cancelled) return;
      setOfferSkill(Boolean(skill?.claude_detected && !skill.installed));
      setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  const install = async (): Promise<void> => {
    setBusy(true);
    const { invoke } = await import("@tauri-apps/api/core");
    const lines: string[] = [];
    let allOk = true;
    try {
      await invoke<string>("cli_install");
      lines.push("Installed. Run it from your terminal.");
    } catch (e) {
      allOk = false;
      lines.push(
        typeof e === "string" ? e : "Couldn't install — try Settings → Command-line tool.",
      );
    }
    if (offerSkill && withSkill) {
      try {
        await invoke<string>("skill_install");
        lines.push("Claude Code skill installed. Start a new Claude Code session to use it.");
      } catch (e) {
        allOk = false;
        lines.push(`Couldn't install the Claude Code skill: ${String(e)}`);
      }
    }
    setDone(lines);
    setBusy(false);
    if (allOk) setTimeout(() => setVisible(false), 2500);
  };

  const dismissForever = async (): Promise<void> => {
    await saveCliPromptDismissed(true);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Install command-line tool"
      className="fixed bottom-4 left-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
    >
      <p className="text-sm text-neutral-800 dark:text-neutral-100">
        Install the <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">clobmap</code>{" "}
        command-line tool?
      </p>
      <p className="mt-0.5 text-xs text-neutral-500">
        Edit your maps from the terminal — handy for scripts and AI agents.
      </p>
      {offerSkill && !done && (
        <label className="mt-2 flex items-center gap-1.5 text-xs text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            checked={withSkill}
            disabled={busy}
            onChange={(e) => setWithSkill(e.target.checked)}
          />
          Also teach Claude Code to use it (adds a skill to ~/.claude/skills)
        </label>
      )}
      {done ? (
        <div className="mt-2 space-y-0.5 text-xs text-neutral-500">
          {done.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void install()}
            className="rounded bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {busy ? "Installing…" : "Install now"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setVisible(false)}
            className="rounded px-2.5 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
          >
            Later
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void dismissForever()}
            className="ml-auto rounded px-2.5 py-1 text-xs text-neutral-500 hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
          >
            Don't ask again
          </button>
        </div>
      )}
    </div>
  );
}
