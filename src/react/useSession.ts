import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ConversationSession } from "../core/ConversationSession"; // your class
import { ConversationSessionConfig, Message } from "../types";
import {
  BaseLLMCaller,
  CallOptions,
  LLMConfig,
  SendMessageInput,
} from "../core/llm";
import { createLLM } from "../core/llm/llmFactory";

/**
 * Options used by the useSession hook.
 *
 * @typedef {Object} UseSessionOptions
 * @property {ConversationSession} [session] - Existing session instance to wrap. If omitted, the hook creates one.
 * @property {ConversationSessionConfig} [settings] - Settings used when creating an internal ConversationSession.
 * @property {BaseLLMCaller | LLMConfig} [llm] - Either an instance of an LLM caller (duck-typed) or a config object used to lazily create one.
 */
interface UseSessionOptions {
  /** Optional existing session to wrap. If omitted, a new one is created. */
  session?: ConversationSession;
  /** Optional settings passed if we need to create one. */
  settings?: ConversationSessionConfig;

  llm?: BaseLLMCaller | LLMConfig; // only about calling the model
  //   llmFormatter: opts?.llmFormatter;
}

/**
 * React hook that exposes a single ConversationSession with reactive lists and convenient actions.
 *
 * Behaviour:
 * - Wraps an existing `ConversationSession` or constructs one from `settings`.
 * - Mirrors session messages/summaries to React state and subscribes to session events.
 * - Optionally accepts an LLM caller instance or an LLM config to lazily create a caller.
 * - Provides `sendMessage()` which persists the user's message and calls the configured LLM.
 *
 * @param {UseSessionOptions} [opts] - Hook options.
 * @returns {{
 *   session: ConversationSession,
 *   messages: Message[],
 *   summaries: Message[],
 *   addMessage: (msg: Message) => void,
 *   editMessage: (id: string, updates: Message) => void,
 *   deleteMessage: (id: string) => boolean,
 *   clearMessages: () => void,
 *   buildPrompt: (windowSize?: number) => Message[],
 *   sendMessage: <TOut = unknown>(input: SendMessageInput, callOpts?: CallOptions) => Promise<TOut>
 * }}
 *
 * @remarks
 * - `sendMessage`:
 *   - Accepts either a raw string or a `Message`-shaped object (SendMessageInput).
 *   - If string is passed: it will be converted into a user message, token-count is computed (via session.tokenCounterFn if present),
 *     persisted to the session and then the session's `getLLMMessages()` (which runs the session's llmFormatter if provided)
 *     is passed to `llm.call(...)`.
 *   - If a Message object is passed: it is persisted as-is (assumed to already contain required fields).
 *   - `sendMessage` returns whatever the underlying LLM caller returns (generic `TOut`), so consumers can handle provider-specific shapes.
 *
 * @example
 * const { messages, addMessage, sendMessage } = useSession({
 *   settings: { sessionName: "Demo", id: "demo" },
 *   llm: { provider: "mock" } // or pass a BaseLLMCaller instance
 * });
 *
 * // send raw text and persist it into session
 * await sendMessage("Hello world", { model: "x" });
 */
export function useSession(opts: UseSessionOptions = {}) {
  const { session: externalSession, settings } = opts;

  const defaultConfig: ConversationSessionConfig = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    lastModifiedAt: Date.now(),
    sessionName: "Untitled",
  };

  const sessionRef = useRef(
    externalSession ??
      new ConversationSession({ ...defaultConfig, ...settings }),
  );

  const session = sessionRef.current;
  const llmRef = useRef<BaseLLMCaller | null>(null);

  if (!llmRef.current && opts.llm) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (opts.llm as any).call === "function") {
      // It's already a BaseLLMCaller instance (duck-type)
      llmRef.current = opts.llm as BaseLLMCaller;
    } else {
      llmRef.current = createLLM(opts.llm as LLMConfig);
    }
  }

  // Local state mirrors what the UI cares about
  const [messages, setMessages] = useState(() => session.getMessages());
  const [summaries, setSummaries] = useState(() => session.getSummaries());

  // Subscribe to session events
  useEffect(() => {
    function updateMessages() {
      setMessages(session.getMessages());
    }
    function updateSummaries() {
      setSummaries(session.getSummaries());
    }

    session.on("messageAdded", updateMessages);
    session.on("messageEdited", updateMessages);
    session.on("messageDeleted", updateMessages);
    session.on("messagesReplaced", updateMessages);
    session.on("messagesCleared", updateMessages);
    session.on("summaryAdded", updateSummaries);
    session.on("summariesReplaced", updateSummaries);

    return () => {
      session.off("messageAdded", updateMessages);
      session.off("messageEdited", updateMessages);
      session.off("messageDeleted", updateMessages);
      session.off("messagesReplaced", updateMessages);
      session.off("summaryAdded", updateSummaries);
      session.off("summariesReplaced", updateSummaries);

      // If we created the session internally, we may want to destroy it
      if (!externalSession) session.close();
    };
  }, [session, externalSession]);

  // Convenience actions
  const addMessage = useCallback(
    async (msg: Parameters<ConversationSession["addMessage"]>[0]) =>
      await session.addMessage(msg),
    [session],
  );

  const editMessage = useCallback(
    (id: string, updates: Message) => session.editMessage(id, updates),
    [session],
  );

  const deleteMessage = useCallback(
    (id: string) => session.deleteMessage(id),
    [session],
  );

  const clearMessages = useCallback(() => session.clearMessages(), [session]);

  const buildPrompt = useCallback(
    (opts?: Parameters<ConversationSession["buildPrompt"]>[0]) =>
      session.buildPrompt(opts),
    [session],
  );

  /**
   * sendMessage generic explanation
   *
   * @template TOut
   * @param {SendMessageInput} input - Either a raw string (user content) or a Message object.
   * @param {CallOptions} [callOpts] - Optional call-time options forwarded to the LLM caller.
   * @returns {Promise<TOut>} - Resolves with whatever the configured LLM caller returns (adapter-specific).
   *
   * @throws {Error} When no LLM caller is configured (llm param missing).
   */
  async function sendMessage<TOut = unknown>(
    input: SendMessageInput,
    callOpts?: CallOptions,
  ): Promise<TOut> {
    if (!llmRef.current) throw new Error("No LLM configured");

    const tokens = session.tokenCounterFn
      ? await session.tokenCounterFn(
          typeof input === "string" ? input : input?.content,
        )
      : 0;

    // 1️⃣ Normalize to Message
    const userMsg: Message =
      typeof input === "string"
        ? {
            id: session.generateMessageId(),
            role: "user",
            content: input,
            tokens: tokens,
            timestamp: Date.now(),
          }
        : input;

    // 2️⃣ Persist user message
    await session.addMessage(userMsg);

    // 3️⃣ Prepare prompt for LLM
    const prompt = await session.getLLMMessages();

    // 4️⃣ Call the model
    // const rawRes = await llmRef.current?.call(prompt, callOpts);

    return await llmRef.current?.call(prompt, callOpts);
  }

  // Return a stable API
  return useMemo(
    () => ({
      session, // the raw ConversationSession instance
      get messages() {
        return messages;
      }, // reactive list of messages
      summaries, // reactive list of summaries
      addMessage,
      editMessage,
      deleteMessage,
      clearMessages,
      buildPrompt,
      sendMessage,
    }),
    [
      messages,
      summaries,
      addMessage,
      editMessage,
      deleteMessage,
      clearMessages,
      buildPrompt,
      sendMessage,
      session,
    ],
  );
}
