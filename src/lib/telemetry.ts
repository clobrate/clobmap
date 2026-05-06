/**
 * Opt-in crash reporting via Sentry.
 *
 * Three things must align before any data leaves the device:
 *   1. A build-time DSN is provided via `VITE_SENTRY_DSN` (otherwise we never
 *      load the SDK).
 *   2. The user has flipped the "Send crash reports" toggle in Settings.
 *   3. The browser/Tauri webview actually has network connectivity.
 *
 * If any of those is false, the module is a no-op and Sentry is never imported.
 *
 * On the way out, every event is run through `scrubEvent` to redact local
 * paths, strip query strings, drop breadcrumbs, and remove anything that
 * resembles a user identifier or hostname.
 */
const DSN: string | undefined = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let initialized = false;
type SentryClient = { close(): PromiseLike<boolean> };
let lastClient: SentryClient | null = null;

export function isTelemetryAvailable(): boolean {
  return Boolean(DSN);
}

export async function enableTelemetry(): Promise<void> {
  if (!DSN || initialized) return;
  const Sentry = await import("@sentry/react");
  Sentry.init({
    dsn: DSN,
    // Skip every default integration that captures contextual data that could
    // contain user content (Breadcrumbs is the big one — captures console.*,
    // DOM clicks, fetch, history). We re-add only the safe ones.
    defaultIntegrations: false,
    integrations: [Sentry.dedupeIntegration(), Sentry.linkedErrorsIntegration()],
    sendDefaultPii: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: () => null,
  });
  initialized = true;
  lastClient = (Sentry.getClient() as SentryClient | undefined) ?? null;
}

export async function disableTelemetry(): Promise<void> {
  if (!initialized) return;
  if (lastClient) {
    await lastClient.close();
    lastClient = null;
  }
  initialized = false;
}

// ---------------------------------------------------------------------------
// Scrubbing — pure, exported for unit tests.
// ---------------------------------------------------------------------------

/**
 * Anything that looks like a path under a user's home directory is redacted to
 * `<HOME>` so we don't leak usernames or local layout.
 */
const HOME_PATTERNS: ReadonlyArray<RegExp> = [
  /\/Users\/[^/\s"']+/g, // macOS
  /\/home\/[^/\s"']+/g, // Linux
  /[A-Z]:\\Users\\[^\\\s"']+/g, // Windows
];

/**
 * Long single-line strings (e.g. >500 chars) are likely user-pasted content
 * rather than intentional error metadata. We truncate them in error messages.
 */
const MAX_MESSAGE_LEN = 500;

export function redactHome(input: string): string {
  let out = input;
  for (const pattern of HOME_PATTERNS) {
    out = out.replace(pattern, (match) =>
      match.startsWith("/Users/")
        ? "/Users/<HOME>"
        : match.startsWith("/home/")
          ? "/home/<HOME>"
          : match.replace(/\\Users\\[^\\]+/, "\\Users\\<HOME>"),
    );
  }
  return out;
}

export function truncateForPrivacy(input: string, max = MAX_MESSAGE_LEN): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max)}… (truncated for privacy)`;
}

interface MaybeFrame {
  filename?: string | null;
  abs_path?: string | null;
  module?: string | null;
}

interface MaybeStacktrace {
  frames?: MaybeFrame[];
}

interface MaybeException {
  value?: string;
  stacktrace?: MaybeStacktrace;
}

interface MaybeRequest {
  url?: string;
  query_string?: unknown;
  data?: unknown;
  cookies?: unknown;
  headers?: unknown;
}

interface ScrubbableEvent {
  message?: string;
  exception?: { values?: MaybeException[] };
  breadcrumbs?: unknown;
  user?: unknown;
  server_name?: unknown;
  request?: MaybeRequest;
  contexts?: { device?: { name?: unknown } } & Record<string, unknown>;
  extra?: Record<string, unknown>;
  tags?: Record<string, unknown>;
}

/**
 * Run an outgoing event through every privacy filter we care about.
 * Returning `null` would tell Sentry to drop the event entirely.
 */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  const cleaned: E = { ...event };

  if (typeof cleaned.message === "string") {
    cleaned.message = truncateForPrivacy(redactHome(cleaned.message));
  }

  if (cleaned.exception?.values) {
    cleaned.exception = {
      ...cleaned.exception,
      values: cleaned.exception.values.map((ex) => ({
        ...ex,
        value: ex.value ? truncateForPrivacy(redactHome(ex.value)) : ex.value,
        stacktrace: ex.stacktrace
          ? {
              ...ex.stacktrace,
              frames: ex.stacktrace.frames?.map((frame) => ({
                ...frame,
                filename:
                  typeof frame.filename === "string" ? redactHome(frame.filename) : frame.filename,
                abs_path:
                  typeof frame.abs_path === "string" ? redactHome(frame.abs_path) : frame.abs_path,
              })),
            }
          : ex.stacktrace,
      })),
    };
  }

  // Breadcrumbs: drop entirely. We disable the integration anyway, but defense
  // in depth — anything anyone pushed via Sentry.addBreadcrumb is gone.
  cleaned.breadcrumbs = [];

  // Identifiers we never set, but if anything else does, strip them.
  delete cleaned.user;
  delete cleaned.server_name;

  // Strip query strings + bodies + cookies from any captured request.
  if (cleaned.request) {
    const url = cleaned.request.url;
    cleaned.request = {
      ...cleaned.request,
      url: typeof url === "string" ? redactHome(url.split("?")[0]!) : url,
      query_string: undefined,
      data: undefined,
      cookies: undefined,
      headers: undefined,
    };
  }

  // Device.name on Tauri may be the user's machine hostname.
  if (cleaned.contexts?.device && typeof cleaned.contexts.device.name === "string") {
    cleaned.contexts = {
      ...cleaned.contexts,
      device: { ...cleaned.contexts.device, name: undefined },
    };
  }

  // Strip any document-content-shaped fields we accidentally attached.
  if (cleaned.extra) {
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cleaned.extra)) {
      if (k === "yamlText" || k === "documentContents" || k === "fileContents") continue;
      filtered[k] = typeof v === "string" ? truncateForPrivacy(redactHome(v)) : v;
    }
    cleaned.extra = filtered;
  }

  return cleaned;
}
