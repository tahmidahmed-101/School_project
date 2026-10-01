import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist/index.css'
import './index.css'
import { RouterProvider } from 'react-router-dom'
import { Provider } from 'react-redux'
import {router} from './routes/AppRouter.tsx'
import { store } from './app/store.ts'
import { Toaster } from '@/components/ui/sonner'
import { SESSION_EXPIRED_EVENT } from '@/lib/api/client'
import { LOGOUT_BROADCAST_KEY, clearTokens } from '@/lib/api/tokenStore'
import { bootstrapAuth, devBypassLogin, sessionExpired } from '@/features/authentication/slices/authSlice'
import { DEV_AUTH_BYPASS } from '@/features/authentication/devAuth'

// Attempt to restore a session from a persisted refresh token before the app renders.
if (DEV_AUTH_BYPASS) {
  store.dispatch(devBypassLogin())
} else {
  store.dispatch(bootstrapAuth())
}

// The axios client (src/lib/api/client.ts) can't import the store directly without
// risking a circular import, so it signals unrecoverable auth failures via a DOM event.
window.addEventListener(SESSION_EXPIRED_EVENT, () => {
  store.dispatch(sessionExpired())
})

// Keep tabs in sync: when another tab logs out, sign this tab out too instead of
// waiting for its next request to 401.
window.addEventListener('storage', (event) => {
  if (event.key === LOGOUT_BROADCAST_KEY) {
    clearTokens()
    store.dispatch(sessionExpired())
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <RouterProvider router={router} />
      <Toaster />
    </Provider>
  </StrictMode>,
)
