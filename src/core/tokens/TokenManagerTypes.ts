import { Message } from "../../types";

export type TokenMetadata = {
  tokens: number;
  chars: number;
  words: number;
  model?: string;
  method: "approx" | "tiktoken" | string;
  messages?: Array<{
    role: string;
    tokens: number;
    chars: number;
    words: number;
  }>;
};

export type TokenManagerConfig = {
  model?: string;
  encoding?: string;
};

export type TokenCountOptions = {
  tokenizerFn?: (text: string) => number | Promise<number>;
  includeRoles?: boolean;
};

export interface TokenManager {
  initialize?(config?: TokenManagerConfig): void;
  count(
    input: string | Message[],
    options?: TokenCountOptions,
  ): Promise<TokenMetadata>;
  getMetadata?(): TokenMetadata | null;
}
