import { api, extractApiError } from "@/lib/api/client"

/** Saves a Blob as a file via a temporary link. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A failed `responseType: "blob"` request carries its JSON error body as a Blob; parse it back in place. */
export async function blobErrorToJson(err: unknown): Promise<unknown> {
  const e = err as { response?: { data?: unknown } }
  if (e?.response?.data instanceof Blob) {
    try {
      e.response.data = JSON.parse(await e.response.data.text())
    } catch {
      // Not JSON — leave the original error as-is.
    }
  }
  return err
}

function filenameFrom(disposition: string | undefined, fallback: string): string {
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  return match ? decodeURIComponent(match[1]) : fallback
}

/**
 * GETs a file endpoint (CSV export, PDF invoice) through the authenticated client and saves it,
 * named by the response's Content-Disposition when present. Throws a normalised ApiError
 * (the JSON error body is parsed out of the blob first).
 */
export async function downloadFile(url: string, fallbackName: string, params?: Record<string, unknown>) {
  try {
    const res = await api.get(url, { params, responseType: "blob" })
    saveBlob(res.data as Blob, filenameFrom(res.headers["content-disposition"] as string | undefined, fallbackName))
  } catch (err) {
    throw extractApiError(await blobErrorToJson(err))
  }
}

/** Fetches a backend-rendered file (e.g. a PDF) with auth and opens it in a new tab. Throws an ApiError. */
export async function openFileInTab(url: string) {
  try {
    const res = await api.get(url, { responseType: "blob" })
    const objectUrl = URL.createObjectURL(res.data as Blob)
    window.open(objectUrl, "_blank", "noopener")
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  } catch (err) {
    throw extractApiError(await blobErrorToJson(err))
  }
}
