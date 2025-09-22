export type Role = "user" | "assistant" | "summary" | "system";

export interface Message {
  id: string;
  role: Role;
  content: string;
  tokens: number;
  timestamp: number;
  summaryOf?: Set<string>;
}

export interface SessionOptions {
  id?: string; // optional if you generate
  title?: string;
  createdAt?: number;
}

export interface ConversationSessionData {
  id: string;
  title?: string;
  createdAt: number;
  messages: Message[];
  //   metadata?: Record<string, any>;
}

export type SessionEventHook = (sessionId: string) => void;

export interface ConversationSessionConfig {
  id: string;
  createdAt: number;
  lastModifiedAt: number;
  sessionName: string;
  reservePercentage?: number;
  summeriser?: (msgs: Message[], reserve: number) => Message | Promise<Message>;
  llmFormatter?: <T>(messages: Message[]) => T[] | Promise<T[]>;
  tokenCounterFn?: (text: string) => number | Promise<number>;
}

export interface SerializedSession {
  id: string;
  createdAt: number;
  lastModifiedAt: number;
  sessionName: string;
  reservePercentage: number;
  windowTokenLimit: number;
  useSequentialIds: boolean;
  messageOrder: string[];
  messages: SerializedMessage[];
  summaries: SerializedMessage[];
}

export interface SerializedMessage extends Omit<Message, "summaryOf"> {
  summaryOf?: string[]; // stored as array for DB compatibility
}

export * from "./LLMTypes";
export * from "./TokenManagerTypes";
