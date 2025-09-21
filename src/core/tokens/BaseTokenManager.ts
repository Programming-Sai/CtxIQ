import { Message } from "../../types";
import {
  TokenManager,
  TokenManagerConfig,
  TokenCountOptions,
  TokenMetadata,
} from "./TokenManagerTypes";

/**
 * BaseTokenManager
 *
 * Abstract base implementing common TokenManager behaviour.
 * Subclasses must implement `computeTokens`.
 *
 * Provides:
 * - `initialize(config?)` — store config for the instance
 * - `count(input, options?)` — wrapper that calls `computeTokens`, caches last metadata
 * - `getMetadata()` — returns the last computed TokenMetadata or null
 *
 * The class stores `lastMetadata` after each `count()` call for inspection by callers.
 */
export abstract class BaseTokenManager implements TokenManager {
  protected config?: TokenManagerConfig;
  protected lastMetadata: TokenMetadata | null = null;

  /**
   * initialize
   *
   * Save optional configuration for the token manager instance.
   * Subclasses can override to perform async initialization (e.g. warm-up or dynamic imports),
   * but should call `super.initialize(config)` to preserve basic behavior.
   *
   * @param {TokenManagerConfig} [config] - optional configuration object (model, any other settings).
   */
  initialize(config?: TokenManagerConfig): void {
    this.config = config;
  }

  /**
   * count
   *
   * Public API: compute token metadata for `input`.
   * Caches the computed metadata in `lastMetadata` and returns it.
   *
   * @param {string | Message[]} input - string or array of messages to count
   * @param {TokenCountOptions} [options] - options forwarded to `computeTokens`
   * @returns {Promise<TokenMetadata>} computed token metadata
   */
  async count(
    input: string | Message[],
    options?: TokenCountOptions,
  ): Promise<TokenMetadata> {
    const metadata = await this.computeTokens(input, options);
    this.lastMetadata = metadata;
    return metadata;
  }

  /**
   * getMetadata
   *
   * Return the most recently computed TokenMetadata, or `null` if none computed yet.
   *
   * @returns {TokenMetadata | null}
   */
  getMetadata(): TokenMetadata | null {
    return this.lastMetadata;
  }

  /**
   * computeTokens
   *
   * Abstract method that concrete token managers must implement.
   * Should compute and return a `TokenMetadata` object for the provided input.
   *
   * @param {string | Message[]} input - the text or messages to analyze
   * @param {TokenCountOptions} [options] - counting options
   * @returns {Promise<TokenMetadata>}
   *
   * @abstract
   */
  protected abstract computeTokens(
    input: string | Message[],
    options?: TokenCountOptions,
  ): Promise<TokenMetadata>;
}
