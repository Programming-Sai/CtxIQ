// src/core/llm/MockLLMCaller.ts
import { BaseLLMCaller } from "./BaseLLMCaller";
import type { Message } from "../../types";
import type { CallOptions, LLMConfig, LLMStreamChunk } from "./LLMTypes";

/**
 * MockLLMCaller
 *
 * Deterministic, dependency-free mock LLM adapter meant for tests and local development.
 * Behaviour:
 * - `call()` returns a deterministic reply: `replyPrefix + <last relevant message content>`.
 * - The returned `LLMResponse` includes `text`, an approximate `tokensUsed`, `usage`, `model`
 *   (from options if provided), and a minimal `raw` payload for assertions.
 * - `stream()` yields the `text` response split into word tokens (one chunk per word),
 *   followed by a final "info" chunk `{ finished: true }`.
 *
 * Use this in unit and integration tests to avoid network calls and to get predictable outputs.
 */
export class MockLLMCaller extends BaseLLMCaller {
  /** Adapter name */
  name = "mock";

  /** Capabilities descriptor: this mock supports streaming (word chunks). */
  capabilities = { streaming: true };

  /**
   * Create a new MockLLMCaller.
   *
   * @param {string} [replyPrefix="Mock reply: "] - prefix used for the deterministic reply text.
   *
   * @example
   * const mock = new MockLLMCaller('TestPrefix: ');
   * const res = await mock.call([{role: 'user', content: 'hi'}]);
   * // res.text === 'TestPrefix: hi'
   */
  constructor(
    private replyPrefix: string = "Mock reply: ",
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    opts: LLMConfig,
  ) {
    super();
  }

  /**
   * call
   *
   * Produce a deterministic LLMResponse based on the last user/system/assistant message.
   *
   * @param {Message[]} messages - conversation messages to inspect
   * @param {CallOptions} [_options] - optional call options (model may be returned in response)
   * @returns {Promise<LLMResponse>} resolves to an object containing:
   *   - text: the reply string
   *   - tokensUsed: approximate token count
   *   - usage: { totalTokens: number }
   *   - model: forwarded from options (if present)
   *   - raw: a small object useful for assertions in tests
   */
  async call<TIn = unknown, TOut = unknown>(
    messages: TIn[],
    _options?: CallOptions,
  ): Promise<TOut> {
    // find last user-like content (user then system then assistant fallback)
    const msgs = messages as unknown as Message[];

    const last = [...msgs]
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
    } as unknown as TOut;
  }

  /**
   * stream
   *
   * Stream the deterministic reply by splitting on whitespace and yielding
   * each word as a separate chunk. After all words are yielded, emit an
   * "info" chunk indicating the stream finished.
   *
   * @param {Message[]} messages - messages to use when building the reply
   * @param {CallOptions} [_options] - optional call options
   * @yields {AsyncIterable<LLMStreamChunk>} word chunks, then final info chunk
   */
  async *stream<TIn = unknown, TOut = unknown>(
    messages: TIn[],
    _options?: CallOptions,
  ): AsyncIterable<LLMStreamChunk> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = (await this.call<TIn, TOut>(messages, _options)) as any;
    // split by words and yield each word as a chunk
    const parts = String(res?.text ?? "")
      .split(/\s+/)
      .filter(Boolean);
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

export function llmFormatter(messages: Message[]) {
  return messages;
}
