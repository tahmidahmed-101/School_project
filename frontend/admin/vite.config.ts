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
    build: {
      rolldownOptions: {
        output: {
          // A group also takes its modules' dependencies, so the groups the shell needs are claimed
          // first; otherwise shared helpers land in `charts` and it loads on every page.
          codeSplitting: {
            groups: [
              { name: "react", test: /node_modules\/(react|react-dom|scheduler)\//, priority: 4 },
              {
                name: "state",
                test: /node_modules\/(react-router|react-router-dom|react-redux|@reduxjs\/toolkit|redux|redux-thunk|reselect|immer|use-sync-external-store)\//,
                priority: 3,
              },
              {
                name: "ui",
                test: /node_modules\/(radix-ui|@radix-ui|@floating-ui|clsx|tailwind-merge|class-variance-authority)\//,
                tags: ["$initial"],
                priority: 2,
              },
              { name: "charts", test: /node_modules\/(recharts|d3-[a-z-]+|victory-vendor|decimal\.js-light)\//, priority: 1 },
            ],
          },
        },
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
