import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}", "tests/unit/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.int.test.{ts,tsx}"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts", "src/**/*.int.test.{ts,tsx}"],
          setupFiles: ["tests/integration/setup.ts"],
          fileParallelism: false,
          env: { DATABASE_URL: "postgres://postgres:postgres@localhost:54329/test" },
        },
      },
    ],
  },
});
