// eslint.config.mjs
import globals from "globals";
import parser from "@typescript-eslint/parser";
import plugin from "@typescript-eslint/eslint-plugin";
import { defineConfig } from "eslint/config";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use tsconfig that includes test files (you should have tsconfig.eslint.json)
const tsconfigForEslint = path.join(__dirname, "tsconfig.eslint.json");

export default defineConfig([
  // Core rules for source files
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: tsconfigForEslint,
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      "@typescript-eslint": plugin,
    },
    rules: {
      ...plugin.configs.recommended.rules,
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-require-imports": "off",
      // keep strictness in src
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
    ignores: ["dist/**"],
  },

  // Relaxed rules for tests (allow any, looser unused-vars)
  {
    files: ["test/**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: tsconfigForEslint,
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        jest: true,
      },
    },
    plugins: {
      "@typescript-eslint": plugin,
    },
    rules: {
      // Allow these patterns in tests to reduce friction
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-var-requires": "off",
    },
  },
]);
