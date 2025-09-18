import { Message } from "../../types";
import { BaseTokenManager } from "./BaseTokenManager";
import { TokenCountOptions, TokenMetadata } from "./TokenManagerTypes";

export class ApproxTokenCounter extends BaseTokenManager {
  protected async computeTokens(
    input: string | Message[],
    options?: TokenCountOptions
  ): Promise<TokenMetadata> {
    const includeRoles = options?.includeRoles ?? true;

    const text = Array.isArray(input)
      ? input
          .map((msg) =>
            includeRoles
              ? `role:${msg?.role}: content: ${msg?.content}`
              : `${msg?.content}`
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
