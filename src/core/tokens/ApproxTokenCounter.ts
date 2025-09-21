import { Message } from "../../types";
import { BaseTokenManager } from "./BaseTokenManager";
import {
  TokenCountOptions,
  TokenMetadata,
} from "../../types/TokenManagerTypes";

/**
 * ApproxTokenCounter
 *
 * A lightweight token counter that estimates token counts using a simple heuristic.
 * - By default it estimates tokens as `Math.ceil(chars / 4)`.
 * - It supports counting from either a single string or an array of `Message` objects.
 * - If `options.tokenizerFn` is provided, that function will be used for tokenization
 *   and the returned metadata `method` will be `"custom"`.
 *
 * This implementation is intentionally fast and dependency-free for use in browsers,
 * CI, or environments where `@dqbd/tiktoken` is not available.
 */
export class ApproxTokenCounter extends BaseTokenManager {
  /**
   * computeTokens
   *
   * Compute token metadata for the provided input using a cheap approximation.
   *
   * @param {string | Message[]} input - The text or array of messages to count tokens for.
   *                                      When an array of `Message` is provided, `messages`
   *                                      metadata will also be included in the result.
   * @param {TokenCountOptions} [options] - Optional counting options:
   *   - includeRoles?: boolean — whether to include role labels when building the text (default true).
   *   - tokenizerFn?: (text: string) => Promise<number> — optional custom tokenizer function.
   *
   * @returns {Promise<TokenMetadata>} Resolves with token metadata:
   *   - tokens: estimated token count (number)
   *   - chars: total characters counted (number)
   *   - words: total words counted (number)
   *   - method: "approx" | "custom"
   *   - messages?: when `input` is Message[], an array describing per-message counts
   *
   * @example
   * const approx = new ApproxTokenCounter();
   * await approx.initialize();
   * const meta = await approx.count([{role: 'user', content: 'hello'}]);
   */
  protected async computeTokens(
    input: string | Message[],
    options?: TokenCountOptions,
  ): Promise<TokenMetadata> {
    const includeRoles = options?.includeRoles ?? true;

    const text = Array.isArray(input)
      ? input
          .map((msg) =>
            includeRoles
              ? `role:${msg?.role}: content: ${msg?.content}`
              : `${msg?.content}`,
          )
          .join("\n")
      : input;
    const chars = text.length;
    const words = text.trim().length ? text.trim().split(/\s+/).length : 0;
    const tokens = options?.tokenizerFn
      ? await options?.tokenizerFn(text)
      : Math.ceil(chars / 4);
    return {
      tokens,
      chars,
      words,
      method: options?.tokenizerFn ? "custom" : "approx",
      messages: Array.isArray(input)
        ? input.map((m) => ({
            role: m.role,
            tokens: Math.ceil(m.content.length / 4),
            chars: m.content.length,
            words: m.content.trim() ? m.content.trim().split(/\s+/).length : 0,
          }))
        : undefined,
    };
  }
}
