import type { Message } from "../../types";
import { BaseTokenManager } from "./BaseTokenManager";
import {
  TokenCountOptions,
  TokenMetadata,
  TokenManagerConfig,
} from "./TokenManagerTypes";
import { ApproxTokenCounter } from "./ApproxTokenCounter";
import type { TiktokenModel } from "@dqbd/tiktoken";

export class OpenAiTokenCounter extends BaseTokenManager {
  async initialize(config?: TokenManagerConfig): Promise<void> {
    super.initialize(config);
  }

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
