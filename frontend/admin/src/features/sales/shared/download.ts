import { api } from "@/lib/api/client"

function filenameFrom(disposition: string | undefined, fallback: string): string {
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  return match ? decodeURIComponent(match[1]) : fallback
}

/**
 * GETs a file endpoint (CSV export, PDF invoice) through the authenticated client and
 * saves it. Errors come back as a JSON blob, so they are parsed before rethrowing.
 */
export async function downloadFile(url: string, fallbackName: string, params?: Record<string, unknown>) {
  try {
    const res = await api.get(url, { params, responseType: "blob" })
    const blob = res.data as Blob
    const href = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = href
    a.download = filenameFrom(res.headers["content-disposition"] as string | undefined, fallbackName)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  } catch (err) {
    const data = (err as { response?: { data?: unknown } }).response?.data
    if (data instanceof Blob) {
      try {
        const parsed = JSON.parse(await data.text())
        ;(err as { response: { data: unknown } }).response.data = parsed
      } catch {
        // not JSON — leave the original error as-is
      }
    }
    throw err
  }
}
