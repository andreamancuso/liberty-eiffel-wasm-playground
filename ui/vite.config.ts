import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { examples } from "./src/examples.ts";

export default defineConfig({
  base: "./",
  server: {
    proxy: {
      "^/runtime/":
        "http://127.0.0.1:8084",
    },
  },
  plugins: [
    react(),
    {
      name: "example-catalogue",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "examples.json",
          source: JSON.stringify(examples),
        });
      },
    },
  ],
});
