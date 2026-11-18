import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:8082",
      "/healthz": "http://localhost:8082",
      "/readyz": "http://localhost:8082",
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/tests/setup.ts",
  },
});
