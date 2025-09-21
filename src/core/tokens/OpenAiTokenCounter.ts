import type { Message } from "../../types";
import { BaseTokenManager } from "./BaseTokenManager";
import {
  TokenCountOptions,
  TokenMetadata,
  TokenManagerConfig,
} from "../../types/TokenManagerTypes";
import { ApproxTokenCounter } from "./ApproxTokenCounter";
import type { TiktokenModel } from "@dqbd/tiktoken";

/**
 * OpenAiTokenCounter
 *
 * Token counter that attempts to use `@dqbd/tiktoken` for precise counts.
 * - Uses dynamic import to avoid bundling the native dependency in browser builds.
 * - If tiktoken is unavailable or an error occurs, it falls back to `ApproxTokenCounter`.
 *
 * NOTE: this class expects that `TokenManagerConfig.model` (optional) may contain a
 * model identifier used by the tiktoken API (e.g. "gpt-4"). If tiktoken is not installed,
 * the fallback will be used automatically.
 */
export class OpenAiTokenCounter extends BaseTokenManager {
  /**
   * initialize
   *
   * Optionally perform asynchronous initialization. Currently this forwards to the base
   * initializer but is `async` to allow subclasses or future changes to perform async
   * warm-up (e.g. preloading an encoding).
   *
   * @param {TokenManagerConfig} [config] - optional configuration (e.g. model)
   * @returns {Promise<void>}
   */
  async initialize(config?: TokenManagerConfig): Promise<void> {
    super.initialize(config);
  }

  /**
   * computeTokens
   *
   * Attempt to compute token counts using `@dqbd/tiktoken`.
   * - Builds a single text string from either the input string or Message[].
   * - Dynamically imports tiktoken and calls `encoding_for_model` / `get_encoding`.
   * - If tiktoken succeeds, returns `TokenMetadata` with method `"tiktoken"`.
   * - On any error, logs a warning and delegates to `ApproxTokenCounter` as fallback.
   *
   * @param {string | Message[]} input - text or messages to count
   * @param {TokenCountOptions} [options] - counting options (includeRoles etc.)
   * @returns {Promise<TokenMetadata>}
   *
   * @example
   * const t = new OpenAiTokenCounter();
   * await t.initialize({ model: 'gpt-4' });
   * const meta = await t.count('hello world');
   */
  protected async computeTokens(
    input: string | Message[],
    options?: TokenCountOptions,
  ): Promise<TokenMetadata> {
    const includeRoles = options?.includeRoles ?? true;

    const text = Array.isArray(input)
      ? input
          .map((m) => (includeRoles ? `${m.role}: ${m.content}` : m.content))
          .join("\n")
      : input;

    try {
      // dynamic import - avoids bundling the heavy dep
      const mod = await import("@dqbd/tiktoken"); // ensure you installed @dqbd/tiktoken
      // use snake_case export
      const encoding_for_model =
        mod.encoding_for_model ?? mod.get_encoding ?? undefined;
      if (!encoding_for_model)
        throw new Error("tiktoken: encoding_for_model not available");

      // package expects a specific model type; cast if needed
      const modelArg = (this.config?.model ?? "gpt-4") as TiktokenModel;
      const enc = encoding_for_model(modelArg);
      const tokens = enc.encode(text).length;

      return {
        tokens,
        chars: text.length,
        words: text.trim() ? text.trim().split(/\s+/).length : 0,
        method: "tiktoken",
      };
    } catch (err) {
      // log error and fallback to approx
      console.warn(
        "OpenAiTokenCounter: fallback to approximate counter due to:",
        err,
      );

      const approx = new ApproxTokenCounter();
      // approx can be configured if needed: approx.initialize(this.config)
      return approx.count(input, options); // use public async API
    }
  }
}
