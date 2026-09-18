import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  server: {
    proxy: {
      "/api": {
        target: "http://13.126.251.193:8000",
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/api/, ""),
      },
    },
  },
}) 