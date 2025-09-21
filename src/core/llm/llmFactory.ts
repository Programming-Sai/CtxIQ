import { BaseLLMCaller, MockLLMCaller, LLMConfig } from "../llm";
// import { OpenAICaller } from "../core/llm/OpenAICaller"; etc.

type CreatorFn = (cfg: LLMConfig) => BaseLLMCaller;

const registry: Record<string, CreatorFn> = {
  mock: (cfg) => new MockLLMCaller("", cfg),
  // openai: (cfg) => new OpenAICaller(cfg),
  // groq:   (cfg) => new GroqCaller(cfg),
};

export function createLLM(config: LLMConfig): BaseLLMCaller {
  const key = config.provider.toLowerCase();
  const creator = registry[key];
  if (!creator) {
    throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
  return creator(config);
}
