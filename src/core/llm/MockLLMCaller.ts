// src/core/llm/MockLLMCaller.ts
import { BaseLLMCaller } from "./BaseLLMCaller ";
import type { Message } from "../../types";
import type { CallOptions, LLMResponse, LLMStreamChunk } from "./LLMTypes";

/**
 * MockLLMCaller
 * Deterministic mock for tests and local development.
 * - call() returns a simple deterministic reply (prefix + last user content).
 * - stream() yields the reply in small chunks (words).
 *
 * Use this in unit/integration tests to avoid real network calls.
 */
export class MockLLMCaller extends BaseLLMCaller {
  name = "mock";
  capabilities = { streaming: true };

  // replyPrefix is configurable for tests
  constructor(private replyPrefix = "Mock reply: ") {
    super();
  }

  async call(
    messages: Message[],
    _options?: CallOptions,
  ): Promise<LLMResponse> {
    // find last user-like content (user then system then assistant fallback)
    const last = [...messages]
      .reverse()
      .find(
        (m) =>
          m.role === "user" || m.role === "system" || m.role === "assistant",
      );
    const content = last?.content ?? "";
    const text = `${this.replyPrefix}${content}`;

    const tokensUsed = Math.ceil(text.length / 4);
    const usage = { totalTokens: tokensUsed };

    return {
      text,
      tokensUsed,
      usage,
      model: _options?.model,
      raw: { messagesLength: messages.length },
    };
  }

  async *stream(
    messages: Message[],
    _options?: CallOptions,
  ): AsyncIterable<LLMStreamChunk> {
    const res = await this.call(messages, _options);
    // split by words and yield each word as a chunk
    const parts = res.text.split(/\s+/).filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      yield {
        type: "token",
        text: parts[i] + (i < parts.length - 1 ? " " : ""),
        raw: null,
      };
    }
    // final info chunk
    yield { type: "info", text: "", raw: { finished: true } };
  }
}
