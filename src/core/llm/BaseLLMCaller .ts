// src/core/llm/LLMCaller.ts
import type { Message } from "../../types";
import type {
  LLMCaller as LLMCallerType,
  CallOptions,
  LLMResponse,
  LLMStreamChunk,
} from "./LLMTypes";

/**
 * BaseLLMCaller
 * Minimal base class for LLM callers/adapters.
 * Subclasses should implement `call`.
 * Subclasses may optionally override `stream`.
 */
export abstract class BaseLLMCaller implements LLMCallerType {
  abstract name: string;
  capabilities?: { streaming?: boolean; functionCalling?: boolean } = {};

  // Subclasses must implement this.
  abstract call(
    messages: Message[],
    options?: CallOptions,
  ): Promise<LLMResponse>;

  // Default streaming fallback: call() and yield a single chunk with text.
  async *stream(
    messages: Message[],
    options?: CallOptions,
  ): AsyncIterable<LLMStreamChunk> {
    const res = await this.call(messages, options);
    // yield full text as one chunk (adapters that support real streaming will override)
    yield { type: "chunk", text: res.text, raw: res.raw };
  }
}
