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

interface UseSessionOptions {
  /** Optional existing session to wrap. If omitted, a new one is created. */
  session?: ConversationSession;
  /** Optional settings passed if we need to create one. */
  settings?: ConversationSessionConfig;

  llm?: BaseLLMCaller | LLMConfig; // only about calling the model
  //   llmFormatter: opts?.llmFormatter;
}

/**
 * React hook that exposes a ConversationSession as reactive state.
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
    (msg: Parameters<ConversationSession["addMessage"]>[0]) =>
      session.addMessage(msg),
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

  async function sendMessage<TOut = unknown>(
    input: SendMessageInput,
    callOpts?: CallOptions,
  ): Promise<TOut> {
    if (!llmRef.current) throw new Error("No LLM configured");

    const tokens = session.tokenCounterFn
      ? session.tokenCounterFn(
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
    session.addMessage(userMsg);

    // 3️⃣ Prepare prompt for LLM
    const prompt = session.getLLMMessages();

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
