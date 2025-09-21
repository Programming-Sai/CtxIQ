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
 *
 * Minimal base class for LLM caller adapters. Subclasses should implement `call`.
 * Optionally they can override `stream` to provide true streaming behavior.
 *
 * Fields:
 * - name: a human-friendly adapter name (e.g. "openai", "mock")
 * - capabilities: object describing supported features (e.g. { streaming: true })
 *
 * The default `stream` implementation simply calls `call()` and yields a single chunk
 * containing the final text. Adapters that provide streaming should override `stream`.
 */
export abstract class BaseLLMCaller implements LLMCallerType {
  /** Adapter name (override in subclasses) */
  abstract name: string;

  /** Optional capability descriptor (streaming, functionCalling, etc.) */
  capabilities?: { streaming?: boolean; functionCalling?: boolean } = {};

  /**
   * call
   *
   * Core method to synchronously request a completion from the LLM adapter.
   * Subclasses MUST implement this method.
   *
   * @param {Message[]} messages - conversation messages to send to the LLM
   * @param {CallOptions} [options] - optional call-time options (e.g. model, temperature)
   * @returns {Promise<LLMResponse>} resolved LLM result including `text`, `usage`, and `raw`.
   *
   * @abstract
   */
  abstract call(
    messages: Message[],
    options?: CallOptions,
  ): Promise<LLMResponse>;

  /**
   * stream
   *
   * Async iterable that yields streaming chunks. Default behavior:
   * - Calls `call()` (non-streaming) and yields a single "chunk" containing
   *   the final text and raw response.
   *
   * Adapters that support streaming should override this method and yield
   * multiple `LLMStreamChunk` items (for example, token-by-token or partial text).
   *
   * @param {Message[]} messages - messages to send
   * @param {CallOptions} [options] - call options
   * @yields {AsyncIterable<LLMStreamChunk>}
   */
  async *stream(
    messages: Message[],
    options?: CallOptions,
  ): AsyncIterable<LLMStreamChunk> {
    const res = await this.call(messages, options);
    // yield full text as one chunk (adapters that support real streaming will override)
    yield { type: "chunk", text: res.text, raw: res.raw };
  }
}
