import { useCallback, useEffect } from "react"
import type { AsyncThunk } from "@reduxjs/toolkit"
import { useAppDispatch } from "@/app/hooks"

/** Fetches a detail page's record when `id` changes, aborting the request it replaces; returns a reload. */
export function useDetailLoad<T>(fetchOne: AsyncThunk<T, string, object>, id: string | undefined) {
  const dispatch = useAppDispatch()
  const load = useCallback(() => (id ? dispatch(fetchOne(id)) : undefined), [dispatch, fetchOne, id])
  useEffect(() => {
    const request = load()
    return () => request?.abort()
  }, [load])
  return useCallback(() => {
    load()
  }, [load])
}
