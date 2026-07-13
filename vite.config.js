import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Linked Hapa packages must share the Builder's React dispatcher in production.
    // Without this, the Overcard workspace can contribute a second React instance
    // and fail before mount with a null hook dispatcher.
    dedupe: ["react", "react-dom"]
  },
  server: {
    port: 5178,
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true
      },
      "/media": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true
      },
      "/CardAppPrototype": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 4178,
    host: "127.0.0.1"
  }
});
