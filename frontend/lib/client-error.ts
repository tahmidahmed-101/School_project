// Browser errors reach the server log as one line, where `pmo logs` groups them with the container errors. No package, no dependency.
const ENDPOINT = "/api/client-error";
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
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.(ENDPOINT, blob)) {
      fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(
        () => {},
      );
    }
  } catch {
    // The reporter must never throw from the handler it runs in.
  }
}

export function installClientErrorListeners(): void {
  window.addEventListener("error", (ev) => reportClientError(ev.error ?? ev.message, "window.onerror"));
  window.addEventListener("unhandledrejection", (ev) => reportClientError(ev.reason, "unhandledrejection"));
}
