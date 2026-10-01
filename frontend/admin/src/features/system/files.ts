import { api } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"

interface UploadedMedia {
  url: string
  path: string
}

/**
 * Stores an image via POST /admin/media/uploads/ (multipart `file`) and returns the
 * absolute URL that records keep in their plain url fields (logo_url, profile_picture…).
 * Requires catalog.manage or settings.manage server-side. Throws the axios error on failure,
 * so callers can show it with getApiErrorMessage(extractApiError(err)).
 */
export async function uploadImage(file: File): Promise<string> {
  const body = new FormData()
  body.append("file", file)
  const res = await api.post("/admin/media/uploads/", body)
  return unwrapItem<UploadedMedia>(res.data).url
}

/** Downloads a CSV export endpoint (honouring the given query params) as a file. */
export async function downloadCsv(url: string, params: Record<string, unknown>, filename: string) {
  const res = await api.get(url, { params, responseType: "blob" })
  const href = URL.createObjectURL(res.data as Blob)
  const link = document.createElement("a")
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}
