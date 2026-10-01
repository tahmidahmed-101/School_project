import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const backendOrigin = env.VITE_BACKEND_ORIGIN || "http://127.0.0.1:8000"

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      // Proxies API calls to the kull-mart backend so the browser sees same-origin requests:
      // the HttpOnly refresh cookie (path /api/v1/customer/auth/) then just works.
      proxy: {
        "/api": {
          target: backendOrigin,
          changeOrigin: true,
          secure: backendOrigin.startsWith("https"),
        },
      },
    },
  }
})
