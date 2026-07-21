import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const githubPagesDemo = process.env.HAPA_GITHUB_PAGES === "1";

export default defineConfig({
  plugins: [react()],
  base: githubPagesDemo ? "/hapa-avatar-builder/" : "/",
  // Only curated, source-controlled demo assets belong in the application
  // bundle. Generated/runtime media is served from the external media root.
  // The Pages build copies only public-static/demo in its preparation step so
  // unrelated public references never enter the deployed artifact.
  publicDir: githubPagesDemo ? false : "public-static",
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
