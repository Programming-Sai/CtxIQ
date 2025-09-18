import { Message } from "../../types";
import {
  TokenManager,
  TokenManagerConfig,
  TokenCountOptions,
  TokenMetadata,
} from "./TokenManagerTypes";

export abstract class BaseTokenManager implements TokenManager {
  protected config?: TokenManagerConfig;
  protected lastMetadata: TokenMetadata | null = null;

  initialize(config?: TokenManagerConfig): void {
    this.config = config;
  }

  async count(
    input: string | Message[],
    options?: TokenCountOptions
  ): Promise<TokenMetadata> {
    const metadata = await this.computeTokens(input, options);
    this.lastMetadata = metadata;
    return metadata;
  }

  getMetadata(): TokenMetadata | null {
    return this.lastMetadata;
  }

  protected abstract computeTokens(
    input: string | Message[],
    options?: TokenCountOptions
  ): Promise<TokenMetadata>;
}
