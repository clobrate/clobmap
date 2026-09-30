import { useEffect, useState } from "react";

/** Mirrors `SkillStatus` in src-tauri/src/skill_tool.rs. */
export interface SkillStatus {
  claude_detected: boolean;
  installed: boolean;
  is_ours: boolean;
  path: string;
  version: string | null;
}

const BUTTON =
  "rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";

/**
 * Settings section: install/remove clobmap's Claude Code skill in
 * `~/.claude/skills/clobmap` (S4). Independent of the CLI row — it works
 * whether or not the `clobmap` command is installed.
 */
export function ClaudeSkillSection(): React.ReactElement {
  const [status, setStatus] = useState<SkillStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      setStatus(await invoke<SkillStatus>("skill_status"));
    } catch (e) {
      setMessage(String(e));
    }
  };
  useEffect(() => {
    // One-shot async load of the current install status on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

  const act = async (
    command: "skill_install" | "skill_uninstall",
    pending: string,
  ): Promise<void> => {
    setBusy(true);
    setMessage(pending);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke(command);
      setMessage(
        command === "skill_install"
          ? "Installed. Start a new Claude Code session to use it."
          : "Removed.",
      );
      await refresh();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  };

  let body: React.ReactNode = null;
  if (status && !status.claude_detected) {
    body = <p className="text-xs text-neutral-500">Claude Code not found on this computer.</p>;
  } else if (status?.is_ours) {
    body = (
      <>
        <p className="mb-1 break-all text-xs text-neutral-500">Installed at {status.path}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void act("skill_uninstall", "Removing…")}
          className={BUTTON}
        >
          Remove
        </button>
      </>
    );
  } else if (status?.installed) {
    body = (
      <p className="break-all text-xs text-neutral-500">
        A different “clobmap” skill is already installed at {status.path} (not created by clobmap).
      </p>
    );
  } else if (status) {
    body = (
      <button
        type="button"
        disabled={busy}
        onClick={() => void act("skill_install", "Installing…")}
        className={BUTTON}
      >
        Install Claude Code skill
      </button>
    );
  }

  return (
    <div className="px-3 py-1.5">
      <div className="mb-1 text-xs font-medium text-neutral-500">Claude Code skill</div>
      {status?.claude_detected && (
        <p className="mb-1 text-xs text-neutral-500">
          Lets Claude Code use the clobmap command. Same as the{" "}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">clobmap@clobmap</code>{" "}
          plugin — install one or the other.
        </p>
      )}
      {body}
      {message && <p className="mt-1 break-all text-xs text-neutral-500">{message}</p>}
    </div>
  );
}
