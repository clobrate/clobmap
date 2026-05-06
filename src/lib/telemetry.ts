/**
 * Opt-in crash reporting via Sentry.
 *
 * Three things must align before any data leaves the device:
 *   1. A build-time DSN is provided via `VITE_SENTRY_DSN` (otherwise we never
 *      load the SDK).
 *   2. The user has flipped the "Crash reports" toggle in Settings — persisted
 *      separately from this module's view of the world.
 *   3. The browser/Tauri webview actually has network connectivity. Sentry
 *      handles offline silently.
 *
 * If any of those is false, the module is a no-op and Sentry is never imported,
 * so the SDK doesn't even land in the bundle's hot path.
 */
const DSN: string | undefined = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let initialized = false;
type SentryClient = { close(): PromiseLike<boolean> };
let lastClient: SentryClient | null = null;

/**
 * Returns true if a DSN is configured at build time. Used by the Settings UI
 * to decide whether to even surface the toggle (no DSN ⇒ no point).
 */
export function isTelemetryAvailable(): boolean {
  return Boolean(DSN);
}

export async function enableTelemetry(): Promise<void> {
  if (!DSN || initialized) return;
  const Sentry = await import("@sentry/react");
  Sentry.init({
    dsn: DSN,
    integrations: [],
    sendDefaultPii: false,
    // Reasonable defaults for a local-first app: capture errors only, no
    // performance traces (no business case yet, more privacy-preserving).
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event) {
      // Strip anything resembling document contents from the payload.
      // The app shouldn't include yamlText in errors, but defense in depth.
      if (event.extra && "yamlText" in event.extra) {
        delete event.extra.yamlText;
      }
      return event;
    },
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
