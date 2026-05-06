import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

const REPORT_BASE = "https://github.com/clobrate/clobmap/issues/new";

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(_error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? null });
  }

  private reset = () => {
    this.setState({ error: null, componentStack: null });
  };

  private reload = () => {
    window.location.reload();
  };

  private report = () => {
    const { error, componentStack } = this.state;
    if (!error) return;
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
    const body = [
      "## What happened",
      "",
      "_(briefly describe what you were doing when this happened)_",
      "",
      "## Error",
      "",
      "```",
      error.stack ?? error.message,
      "```",
      "",
      ...(componentStack
        ? ["## Component stack", "", "```", componentStack.trim(), "```", ""]
        : []),
      "## Environment",
      "",
      `- App: clobmap ${import.meta.env.VITE_APP_VERSION ?? "dev"}`,
      `- User-agent: ${ua}`,
    ].join("\n");
    const url = `${REPORT_BASE}?title=${encodeURIComponent(`Crash: ${error.message}`)}&labels=bug&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-8 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <div className="max-w-xl">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            clobmap hit an error and stopped rendering. Your draft was saved automatically — reload
            to recover, or report it so we can fix it.
          </p>
          <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
            {error.message}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.reload}
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={this.reset}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.report}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Report on GitHub ↗
            </button>
          </div>
        </div>
      </div>
    );
  }
}
