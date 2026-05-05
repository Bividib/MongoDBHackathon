import { defineConfig } from "vitest/config";

export default defineConfig({
  css: {
    postcss: {}
  },
  test: {
    globals: false,
    include: ["tests/**/*.test.ts"]
  }
});
