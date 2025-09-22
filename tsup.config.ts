// tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      "core/index": "src/core/index.ts",
      "core/llm/index": "src/core/llm/index.ts",
      "core/storage/index": "src/core/storage/index.ts",
      "core/tokens/index": "src/core/tokens/index.ts",
      "react/index": "src/react/index.ts",
      "types/index": "src/types/index.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    outDir: "dist",
  },
]);
