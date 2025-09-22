// src/core/llm/llmFactory.ts
import type { LLMConfig } from "../../types/LLMTypes";
import { BaseLLMCaller } from "./BaseLLMCaller";

/**
 * ProviderMaker: given a config produce a BaseLLMCaller
 */
export type ProviderMaker = (cfg: LLMConfig) => BaseLLMCaller;

/**
 * Internal registry (not exported). Consumers use registerProvider/getRegisteredProviders/createLLM
 */
const registry = new Map<string, ProviderMaker>();

/** Register a provider maker under a name. Overwrites if existing. */
export function registerProvider(name: string, maker: ProviderMaker) {
  if (!name || typeof maker !== "function") {
    throw new TypeError(
      "registerProvider(name, maker) expects a name and a factory function",
    );
  }
  registry.set(name, maker);
}

/** Returns a snapshot array of registered provider names (read-only view). */
export function getRegisteredProviders(): string[] {
  return Array.from(registry.keys());
}

/** Create an LLM instance by looking up the provider in the registry. */
export function createLLM(cfg: LLMConfig): BaseLLMCaller {
  if (!cfg || !cfg.provider) throw new Error("LLMConfig.provider is required");
  const maker = registry.get(cfg.provider);
  if (!maker) {
    throw new Error(
      `Unknown LLM provider: ${cfg.provider}. Registered: ${getRegisteredProviders().join(", ")}`,
    );
  }
  return maker(cfg);
}

/** Convenience: register built-in providers at import time */
// e.g. import and register the MockLLMCaller
import { MockLLMCaller } from "./MockLLMCaller";
registerProvider("mock", (cfg) => new MockLLMCaller("", cfg));
