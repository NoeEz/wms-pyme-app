import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The portal calls the API at /api. In development Vite proxies it to the
// backend (docker compose, :4000), so no CORS setup or URL config is needed;
// a production build is served next to the API (or set VITE_API_URL).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": process.env.API_PROXY_TARGET ?? "http://localhost:4000",
    },
  },
});
