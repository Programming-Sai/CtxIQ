// jest.config.mjs
import { createDefaultPreset } from "ts-jest";
const { transform } = createDefaultPreset();

export default {
  // Keep a fast node project for non-DOM tests, and a jsdom "browser" project for react tests.
  projects: [
    {
      displayName: "node",
      testEnvironment: "node",
      transform,
      moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
      testMatch: [
        "<rootDir>/test/**/*.node.test.(ts|tsx|js)",
        "<rootDir>/test/**/*.test.(ts|js)", // generic node tests (adjust if needed)
      ],
    },
    {
      displayName: "browser",
      testEnvironment: "jsdom",
      transform,
      moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
      // Explicitly run the useConversation test (and any other browser tests you add)
      testMatch: [
        "<rootDir>/test/useConversation.test.tsx",
        "<rootDir>/test/**/*.browser.test.(ts|tsx|js)",
      ],
      setupFilesAfterEnv: ["<rootDir>/test/setupTests.ts"],
      moduleNameMapper: {
        // Force resolution of react/react-dom to the single copy in root node_modules
        "^react$": "<rootDir>/node_modules/react",
        "^react-dom$": "<rootDir>/node_modules/react-dom",
        "^react/jsx-runtime$": "<rootDir>/node_modules/react/jsx-runtime",
      },
    },
  ],
};
