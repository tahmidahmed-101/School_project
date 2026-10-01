import { api, apiCall } from "@/lib/api/client"

interface UploadedMedia {
  url: string
  path: string
}

/**
 * Stores an image via POST /admin/media/uploads/ (multipart `file`) and returns the
 * absolute URL that records keep in their plain url fields (logo_url, profile_picture…).
 * Requires catalog.manage or settings.manage server-side. Throws a normalised ApiError on
 * failure, so callers can show it with getApiErrorMessage(err).
 */
export async function uploadImage(file: File): Promise<string> {
  const body = new FormData()
  body.append("file", file)
  const data = await apiCall<UploadedMedia>(() => api.post("/admin/media/uploads/", body))
  return data.url
}
