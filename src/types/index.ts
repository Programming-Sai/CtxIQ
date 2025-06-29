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

export interface SessionOptions {
  id?: string; // Optional — auto-generate if missing
  title?: string;
  createdAt?: number;
  //   metadata?: Record<string, any>; // Optional arbitrary metadata
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
}
