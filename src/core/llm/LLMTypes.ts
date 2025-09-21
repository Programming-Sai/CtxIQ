// src/core/llm/types.ts
import { Message } from "../../types";

/**
 * Options passed to an LLM adapter call.
 * Keep this provider-agnostic; use providerOptions for provider-specific knobs.
 */
export type CallOptions = {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[]; // stop sequences
  stream?: boolean;
  // Cancellation + timeout
  signal?: AbortSignal;
  timeoutMs?: number;
  // Retry hints (adapter may or may not honor)
  retry?: { attempts: number; initialDelayMs?: number };
  // Generic metadata for callers (not sent to provider automatically)
  metadata?: Record<string, unknown>;
  // Provider-specific options (escape hatch)
  providerOptions?: Record<string, unknown>;
};

/**
 * Usage/consumption information returned by some providers.
 */
export type LLMUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  // unknown provider-specific usage fields can live in raw/response
};

/**
 * Unified response returned by adapters after a non-streaming call.
 */
export type LLMResponse = {
  text: string; // final concatenated text
  tokensUsed?: number; // convenience alias (prefer usage.totalTokens)
  usage?: LLMUsage;
  id?: string; // provider request id
  model?: string; // model actually used
  finishReason?: string; // provider finish reason (e.g. "stop", "length")
  latencyMs?: number; // optional measured latency
  raw?: unknown; // raw provider response
};

/**
 * Chunk shape for streaming responses.
 * Adapters yield small envelopes; the consumer assembles them into final text if desired.
 */
export type LLMStreamChunk = {
  type: "chunk" | "delta" | "token" | "info";
  text?: string;
  token?: string | number;
  partial?: boolean;
  metadata?: unknown;
  raw?: unknown;
};

/**
 * Normalized error wrapping adapter/provider errors.
 */
export type LLMError = {
  code?: string | number;
  message: string;
  retriable?: boolean;
  statusCode?: number;
  raw?: unknown;
};

export type SendMessageInput = string | Message;

/**
 * Minimal LLM caller interface. Implementations (adapters) should conform to this.
 */
export interface LLMCaller {
  name: string;
  // Some adapters may advertise capabilities
  capabilities?: {
    streaming?: boolean;
    functionCalling?: boolean;
    // add others as you need them
  };
  // non-streaming call
  call(messages: Message[], options?: CallOptions): Promise<LLMResponse>;
  // optional streaming API
  stream?(
    messages: Message[],
    options?: CallOptions,
  ): AsyncIterable<LLMStreamChunk>;
}

export interface LLMConfig {
  provider: "mock" | "openai" | "groq";
  model?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // <— allows future params (top_p, presencePenalty, etc.)
}
