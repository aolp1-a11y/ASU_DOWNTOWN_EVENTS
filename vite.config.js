import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward /ics-proxy/* to Sun Devil Central (fixes browser CORS)
      "/ics-proxy": {
        target: "https://sundevilcentral.eoss.asu.edu",
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/ics-proxy/, ""),
        headers: { Accept: "text/calendar, text/plain;q=0.9,*/*;q=0.8" },
      },
    },
  },
});
