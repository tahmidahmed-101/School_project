// Browser errors reach the server log as one line, where `pmo logs` groups them with the container errors. No package, no dependency.
// The API lives on api.kullmart.com in production, so the address follows VITE_API_BASE_URL (".../api/v1").
const ENDPOINT = `${(import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/v1\/?$/, "")}/client-error/`;
const PER_PAGE_LIMIT = 5;

let sent = 0;
const seen = new Set<string>();

export function reportClientError(error: unknown, where?: string): void {
  try {
    const e = error instanceof Error ? error : new Error(String(error));
    const key = `${e.message}|${where ?? ""}`;
    if (sent >= PER_PAGE_LIMIT || seen.has(key)) return;
    seen.add(key);
    sent++;
    const body = JSON.stringify({
      message: e.message.slice(0, 300),
      stack: e.stack?.slice(0, 2000),
      digest: (e as { digest?: string }).digest,
      where,
      path: location.pathname,
    });
    const blob = new Blob([body], { type: "text/plain" });
    if (!navigator.sendBeacon?.(ENDPOINT, blob)) {
      fetch(ENDPOINT, { method: "POST", headers: { "content-type": "text/plain" }, body, keepalive: true }).catch(() => {});
    }
  } catch {
    // The reporter must never throw from the handler it runs in.
  }
}

export function installClientErrorListeners(): void {
  window.addEventListener("error", (ev) => reportClientError(ev.error ?? ev.message, "window.onerror"));
  window.addEventListener("unhandledrejection", (ev) => reportClientError(ev.reason, "unhandledrejection"));
}
