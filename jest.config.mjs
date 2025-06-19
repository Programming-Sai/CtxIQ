import { createDefaultPreset } from "ts-jest";

const { transform } = createDefaultPreset();

export default {
  testEnvironment: "node",
  transform,
};
