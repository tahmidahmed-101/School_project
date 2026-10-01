import { useEffect } from "react"

const APP_NAME = "NestmartIT"

/**
 * Sets the browser tab/window title for a route. Passing an empty string
 * restores the bare app name.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} | ${APP_NAME}` : APP_NAME
  }, [title])
}
