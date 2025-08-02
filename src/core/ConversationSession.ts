// /* eslint-disable @typescript-eslint/no-unused-vars */

import { EventEmitter } from "events";
import {
  ConversationSessionConfig,
  Message,
  SerializedSession,
} from "../types";

/**
 * ConversationSession
 *
 * Manages a sequence of conversation messages and summaries in memory,
 * providing tools for:
 * - Adding, editing, deleting, and retrieving messages or summaries.
 * - Preserving and prioritizing system prompts.
 * - Building token-aware prompts for LLM calls with optional summarization.
 * - Serializing/deserializing session state for persistence or transfer.
 * - Tracking message order to maintain chronological or logical flow.
 * - Integrating with custom token counters and LLM-specific formatters.
 *
 * ### Key Features:
 * - **System Message Preservation**: Ensures system prompts are never summarized or omitted from prompts.
 * - **Summarization Support**: Integrates with a user-provided summarizer to handle token overflow while
 *   maintaining message context.
 * - **Flexible Prompt Output**: Supports custom LLM message formatting via `llmFormatter`.
 * - **Token-Aware Windowing**: Automatically selects messages that fit within a token limit.
 * - **Event Emission**: Emits events for key operations (`messageAdded`, `messageDeleted`, `summaryAdded`,
 *   `sessionCloned`, etc.) to enable reactive integrations.
 *
 * ### Extensibility:
 * - **Custom Token Counting**: Provide `tokenCounterFn` to match your LLM’s tokenizer behavior.
 * - **Custom LLM Formatting**: Provide `llmFormatter` to adapt messages to any LLM API shape (OpenAI, Claude, Mistral, etc.).
 * - **Custom Summarization**: Provide `summeriser` to generate summaries for overflow messages.
 *
 * ### Thread Safety & Data Integrity:
 * - All operations update `lastModifiedAt` to track changes.
 * - `messageOrder` array maintains display/processing sequence for both messages and summaries.
 * - Messages and summaries are stored in separate `Map`s for fast lookups.
 *
 * ### Usage:
 * ```ts
 * const session = new ConversationSession({
 *   id: "session1",
 *   createdAt: Date.now(),
 *   lastModifiedAt: Date.now(),
 *   sessionName: "Chat with Bot",
 *   reservePercentage: 0.15,
 *   summeriser: mySummariserFn,
 *   tokenCounterFn: myTokenCounter,
 *   llmFormatter: myLLMFormatter
 * });
 *
 * session.addMessage({ role: "user", content: "Hello!", tokens: 1, id: "", timestamp: Date.now() });
 * const llmInput = session.getLLMMessages();
 * ```
 */
export class ConversationSession extends EventEmitter {
  public id: string;
  public createdAt: number;
  public lastModifiedAt: number;
  public sessionName: string;
  public messages: Map<string, Message>;
  public summaries: Map<string, Message>;
  private messageCounter = 0;
  public useSequentialIds = false;
  public messageOrder: string[];
  public SUMMARY_RESERVE_RATIO: number; // 15% of window
  public summaryFn?: (msgs: Message[], reserve: number) => Message; // user‑injected summary hook
  public windowTokenLimit: number;
  public tokenCounterFn?: (text: string) => number;
  public llmFormatter?: <T>(messages: Message[]) => T[];

  /**
   * Creates a new conversation session instance.
   * Initializes metadata, configuration options, and in-memory message/summaries storage.
   *
   * @param config - Session configuration containing identifiers, timestamps, callbacks, and limits.
   */
  constructor(config: ConversationSessionConfig) {
    super();
    this.id = config.id;
    this.createdAt = config.createdAt;
    this.lastModifiedAt = config.lastModifiedAt;
    this.sessionName = config.sessionName;
    this.messages = new Map();
    this.summaries = new Map();
    this.messageOrder = [];
    this.SUMMARY_RESERVE_RATIO = config.reservePercentage || 0.15;
    this.summaryFn = config.summeriser;
    this.windowTokenLimit = 0;
    this.llmFormatter = config.llmFormatter;
    this.tokenCounterFn = config.tokenCounterFn;
  }

  // ─── Summary Core ────────────────────────────────────────────────────────────────────

  /**
   * Adds a summary message to the session.
   * Automatically assigns a unique ID, sets its role to "summary", and ensures it's inserted
   * into `messageOrder` right after the last message it summarizes (or appended if unknown).
   * Skips storage if the summary token count exceeds the session's token limit.
   *
   * @param summary - The summary message to add.
   * @emits summaryAdded - Emitted after successfully adding a summary.
   */
  addSummary(summary: Message): void {
    if (this.windowTokenLimit > 0 && summary.tokens > this.windowTokenLimit) {
      console.warn(
        `[CtxIQ] Skipping summary ${summary.id} — too large (${summary.tokens} > ${this.windowTokenLimit})`,
      );
      return; // Don't store unusable summary
    }

    const id = this.generateMessageId();
    summary.id = id;
    summary.role = "summary";
    summary.tokens =
      summary.tokens || this.countTokensInMessage(summary.content);
    if (summary.summaryOf && Array.isArray(summary.summaryOf)) {
      summary.summaryOf = new Set(summary.summaryOf);
    }
    this.summaries.set(id, summary);

    // ⬇️ NEW: Insert summary **after the last message it summarizes**
    if (summary.summaryOf && summary.summaryOf.size > 0) {
      const summaryIds = Array.from(summary.summaryOf);
      const lastIndex = Math.max(
        ...summaryIds.map((msgId) => this.messageOrder.indexOf(msgId)),
      );

      if (lastIndex >= 0) {
        const existingIndex = this.messageOrder.indexOf(id);
        if (existingIndex !== -1) {
          this.messageOrder.splice(existingIndex, 1);
        }
        this.messageOrder.splice(lastIndex + 1, 0, id);
      } else {
        // Fallback: append if something went wrong
        const existingIndex = this.messageOrder.indexOf(id);
        if (existingIndex !== -1) {
          this.messageOrder.splice(existingIndex, 1); // remove old position
        }
        this.messageOrder.push(id); // add at the new position
      }
    } else {
      // No summaryOf? Just append
      const existingIndex = this.messageOrder.indexOf(id);
      if (existingIndex !== -1) {
        this.messageOrder.splice(existingIndex, 1); // remove old position
      }
      this.messageOrder.push(id); // add at the new position
    }
    this.emit("summaryAdded", id, summary);
    this.bumpModified();
  }

  /**
   * Retrieves all summaries in the session in the current `messageOrder`.
   *
   * @returns An array of summary messages, ordered according to `messageOrder`.
   */
  getSummaries(): Message[] {
    return this.messageOrder
      .map((id) => this.summaries.get(id))
      .filter((s): s is Message => Boolean(s));
  }

  /**
   * Retrieves a specific summary message by its ID.
   *
   * @param id - The unique ID of the summary message.
   * @returns The matching summary message, or `undefined` if not found.
   */
  getSummaryById(id: string): Message | undefined {
    return this.summaries.get(id);
  }

  /**
   * Deletes a summary message by its ID.
   * Also removes its ID from `messageOrder` if present.
   *
   * @param id - The unique ID of the summary to delete.
   * @returns `true` if the summary existed and was deleted, otherwise `false`.
   * @emits summaryDeleted - Emitted after attempting to delete a summary, with the result.
   */
  deleteSummary(id: string): boolean {
    const existed = this.summaries.delete(id);

    if (existed) {
      // Remove from messageOrder
      const idx = this.messageOrder.indexOf(id);
      if (idx !== -1) {
        this.messageOrder.splice(idx, 1);
      }

      this.emit("summaryDeleted", id, true);
    } else {
      this.emit("summaryDeleted", id, false);
    }
    this.bumpModified();
    return existed;
  }

  /**
   * Replaces all current summaries in the session with a new set.
   * Removes existing summaries from both `summaries` and `messageOrder`,
   * then adds the provided summaries in the given order.
   *
   * @param summaries - Array of summary messages to set.
   * @emits summariesReplaced - Emitted after replacing all summaries.
   */
  setSummaries(summaries: Message[]): void {
    // Remove old summaries from order
    this.messageOrder = this.messageOrder.filter(
      (id) => !this.summaries.has(id),
    );
    this.summaries.clear();

    for (const summary of summaries) {
      const existingIndex = this.messageOrder.indexOf(summary.id);
      if (existingIndex !== -1) {
        this.messageOrder.splice(existingIndex, 1); // remove old position
      }
      this.summaries.set(summary.id, summary);
      this.messageOrder.push(summary.id); // append or insert at desired index
    }
    this.emit("summariesReplaced", summaries);
    this.bumpModified();
  }

  /**
   * Removes all summaries from the session.
   * Also removes their IDs from `messageOrder`.
   *
   * @emits summariesCleared - Emitted after all summaries have been cleared.
   */
  clearSummaries(): void {
    // Remove all summary IDs from messageOrder
    this.messageOrder = this.messageOrder.filter(
      (id) => !this.summaries.has(id),
    );

    this.summaries.clear();
    this.emit("summariesCleared");
    this.bumpModified();
  }

  // ─── Message Core ────────────────────────────────────────────────────────────────────

  /**
   * Adds a new message to the session.
   * Automatically assigns a unique ID, calculates token count if missing,
   * and appends it to `messageOrder`.
   * If the message is a summary, it is passed to `addSummary` instead.
   *
   * @param message - The message to add (without an ID).
   * @emits messageAdded - Emitted after successfully adding the message.
   */
  addMessage(message: Message): void {
    if (this.isSummaryMessage(message)) return this.addSummary(message);
    const id = this.generateMessageId();
    message.id = id;
    message.tokens =
      message.tokens || this.countTokensInMessage(message.content);
    this.messages.set(id, message);
    const existingIndex = this.messageOrder.indexOf(id);
    if (existingIndex !== -1) {
      this.messageOrder.splice(existingIndex, 1); // remove old position
    }
    this.messageOrder.push(id); // add at the new position
    this.emit("messageAdded", id, message);
    this.bumpModified();
  }

  /**
   * Retrieves all messages in the session in `messageOrder`.
   *
   * @returns An array of messages ordered by `messageOrder`.
   */
  getMessages(): Message[] {
    return this.messageOrder
      .map((id) => this.messages.get(id))
      .filter((m): m is Message => Boolean(m));
  }

  /**
   * Retrieves a message by its ID.
   *
   * @param id - The ID of the message to retrieve.
   * @returns The matching message, or `undefined` if not found.
   */
  getMessageById(id: string): Message | undefined {
    return this.messages.get(id);
  }

  /**
   * Deletes a message by its ID.
   * Also removes it from `messageOrder` and cleans up any summaries that reference it.
   * If a summary becomes empty after cleanup, it is also deleted.
   *
   * @param id - The ID of the message to delete.
   * @returns `true` if the message existed and was deleted, otherwise `false`.
   * @emits messageDeleted - Emitted after attempting to delete the message.
   */
  deleteMessage(id: string): boolean {
    const existed = this.messages.delete(id);

    if (existed) {
      // 1. Remove from messageOrder
      const idx = this.messageOrder.indexOf(id);
      if (idx !== -1) this.messageOrder.splice(idx, 1);

      // 2. Clean up summaries that reference this message
      for (const summary of this.summaries.values()) {
        summary.summaryOf?.delete(id);
        // 3. If a summary now covers nothing, remove it too
        if (summary.summaryOf?.size === 0) {
          this.deleteSummary(summary.id);
        }
      }
    }
    this.emit("messageDeleted", id, existed);
    this.bumpModified();
    return existed;
  }

  /**
   * Replaces an existing message with a new one while keeping the same ID.
   *
   * @param id - The ID of the message to replace.
   * @param newMsg - The new message object.
   * @emits messageEdited - Emitted after replacing the message.
   */
  editMessage(id: string, newMsg: Message): void {
    newMsg.id = id;
    this.messages.set(id, newMsg);
    this.emit("messageEdited", id, newMsg);
    this.bumpModified();
  }

  /**
   * Overwrites all messages in the session with a new array.
   * Old message IDs are removed from `messageOrder` before appending the new ones.
   *
   * @param messages - The new messages to set.
   * @emits messagesReplaced - Emitted after replacing all messages.
   */
  setMessages(messages: Message[]): void {
    const oldIds = new Set(this.messages.keys());
    this.messages.clear();
    for (const msg of messages) {
      this.messages.set(msg.id, msg);
    }
    // Remove old IDs, then append new ones
    this.messageOrder = this.messageOrder
      .filter((id) => !oldIds.has(id))
      .concat(messages.map((m) => m.id));
    this.emit("messagesReplaced", messages);
    this.bumpModified();
  }

  // ─── Prompt-Building Stubs ──────────────────────────────────────────────────

  /**
   * Builds a prompt of messages to send to an LLM while respecting the token window limit.
   * Ensures that all system messages are always included, optionally summarizing older
   * messages to fit within the available space.
   *
   * @param windowTokenLimit - Maximum allowed token count for the prompt. Defaults to the session's windowTokenLimit.
   * @param fallbackToTruncation - If true, falls back to truncating messages when a summary cannot fit.
   * @returns An ordered array of messages for the prompt.
   * @remarks
   * - System messages are never summarized or excluded.
   * - If a summarizer function is provided, overflow messages will be summarized to stay within the limit.
   * - If no summarizer is provided, older messages are simply truncated.
   * @throws {Error} If an existing summary or a newly created summary exceeds the reserved token budget and `fallbackToTruncation` is false.
   */
  public buildPrompt(
    windowTokenLimit: number = this.windowTokenLimit,
    fallbackToTruncation: boolean = true,
  ): Message[] {
    // 1. Extract all system messages from compacted list
    const allMessages = this.getCompactedMessages();
    const systemMessages = allMessages.filter((m) => m.role === "system");
    const nonSystemMessages = allMessages.filter((m) => m.role !== "system");

    // 2. Calculate token cost for system messages
    const systemTokenCount = systemMessages.reduce(
      (sum, m) => sum + m.tokens,
      0,
    );

    // 3. Adjust available token limit
    const remainingLimit = Math.max(1, windowTokenLimit - systemTokenCount);

    // 4. If no summariser, just truncate non-system messages
    if (!this.summaryFn) {
      const { fitting } = this.getMessageWindow(
        remainingLimit,
        nonSystemMessages,
      );
      return [...systemMessages, ...fitting];
    }

    // 5. Reserve space for summaries from the remaining limit
    const reserve = Math.max(
      1,
      Math.floor(remainingLimit * this.SUMMARY_RESERVE_RATIO),
    );
    const usable = remainingLimit - reserve;

    if (usable <= 0) {
      // Only space for system messages
      return [...systemMessages];
    }

    // 6. Fit as many non-system messages as possible
    const { fitting, overflow } = this.getMessageWindow(
      usable,
      nonSystemMessages,
    );

    // 7. If no overflow, we’re done
    if (overflow.length === 0) {
      return [...systemMessages, ...fitting];
    }

    // 8. Check if overflow already summarised
    const allCovered = overflow.every((msg) => this.isMessageSummarized(msg));
    if (allCovered) {
      const existingSummary = Array.from(this.summaries.values()).find((s) =>
        overflow.every((msg) => s.summaryOf?.has(msg.id)),
      );
      if (existingSummary) {
        if (existingSummary.tokens <= reserve) {
          return [...systemMessages, existingSummary, ...fitting];
        } else if (fallbackToTruncation) {
          return [
            ...systemMessages,
            ...this.getMessageWindow(remainingLimit, nonSystemMessages).fitting,
          ];
        } else {
          throw new Error(
            `Existing summary (${existingSummary.tokens}) exceeds reserved budget (${reserve})`,
          );
        }
      }
    }

    // 9. Summarise overflow without touching system messages
    const summaryMsg = this.summaryFn(
      overflow.filter((m) => m.role !== "system"),
      reserve,
    );
    summaryMsg.summaryOf = new Set(overflow.map((m) => m.id));
    summaryMsg.role = "summary";

    if (summaryMsg.tokens > reserve) {
      if (fallbackToTruncation) {
        const { fitting } = this.getMessageWindow(
          remainingLimit,
          nonSystemMessages,
        );
        return [...systemMessages, ...fitting];
      } else {
        throw new Error(
          `Summary (${summaryMsg.tokens} tokens) exceeds reserved budget (${reserve})`,
        );
      }
    }

    this.addSummary(summaryMsg);

    // 10. Final prompt = [system messages, summary, rest]
    return [...systemMessages, summaryMsg, ...fitting];
  }

  // ─── Serialization / Persistence ────────────────────────────────────────────

  /**
   * Serializes the current session state into a plain object for storage or transfer.
   *
   * @returns A `SerializedSession` object containing all session metadata,
   *          message order, messages, summaries, and settings.
   * @remarks
   * - `summaryOf` sets are converted to arrays for JSON compatibility.
   */
  toJSON(): SerializedSession {
    const serializeSet = (s?: Set<string>) => (s ? Array.from(s) : undefined);

    return {
      id: this.id,
      createdAt: this.createdAt,
      lastModifiedAt: this.lastModifiedAt,
      sessionName: this.sessionName,
      reservePercentage: this.SUMMARY_RESERVE_RATIO,
      windowTokenLimit: this.windowTokenLimit,
      useSequentialIds: this.useSequentialIds,
      messageOrder: [...this.messageOrder],
      messages: Array.from(this.messages.values()).map((m) => ({
        ...m,
        summaryOf: serializeSet(m.summaryOf),
      })),
      summaries: Array.from(this.summaries.values()).map((s) => ({
        ...s,
        summaryOf: serializeSet(s.summaryOf),
      })),
    };
  }

  /**
   * Loads a session from a serialized state.
   *
   * @param json - The serialized session data to load.
   * @emits sessionLoaded - Emitted after the session has been successfully loaded.
   * @remarks
   * - Existing messages, summaries, and message order are cleared before loading.
   * - `summaryOf` arrays are converted back into `Set<string>` instances.
   */
  fromJSON(json: SerializedSession): void {
    const deserializeSet = (arr?: string[]) => new Set(arr ?? []);
    this.id = json.id;
    this.createdAt = json.createdAt;
    this.lastModifiedAt = json.lastModifiedAt;
    this.sessionName = json.sessionName;
    this.SUMMARY_RESERVE_RATIO = json.reservePercentage;
    this.windowTokenLimit = json.windowTokenLimit;
    this.useSequentialIds = json.useSequentialIds;

    this.messageOrder = [...json.messageOrder];
    this.messages.clear();
    this.summaries.clear();

    for (const m of json.messages) {
      this.messages.set(m.id, {
        ...m,
        summaryOf: deserializeSet(m.summaryOf),
      });
    }
    for (const s of json.summaries) {
      this.summaries.set(s.id, {
        ...s,
        summaryOf: deserializeSet(s.summaryOf),
      });
    }
    this.emit("sessionLoaded", this.id);
  }

  // ─── Summary Helpers & System Prompt ───────────────────────────────────────

  /**
   * Checks if a given message is a summary message.
   *
   * @param msg - The message to check.
   * @returns `true` if the message's role is `"summary"`, otherwise `false`.
   */
  isSummaryMessage(msg: Message) {
    return msg.role === "summary";
  }

  /**
   * Determines whether a given message has already been summarized.
   *
   * @param msg - The message to check.
   * @returns `true` if at least one summary contains this message's ID in its `summaryOf` set.
   */
  isMessageSummarized(msg: Message): boolean {
    for (const summary of this.summaries.values()) {
      if (summary.summaryOf?.has(msg.id)) return true;
    }
    return false;
  }

  /**
   * Returns all user-visible messages in insertion order.
   *
   * @returns An array of visible `Message` objects.
   * @remarks
   * - This currently returns the same result as `getMessages()`, but is intended for UI filtering.
   */
  getVisibleMessages(): Message[] {
    return this.getMessages();
  }

  /**
   * Prepares the message list to be sent to an LLM, respecting the session's token window limit.
   * Formats the output using a custom LLM formatter if provided.
   *
   * @typeParam T - The output type expected by the LLM formatter. Defaults to `{ role: string; content: string }`.
   * @param windowSize - The token limit for the returned message set. Defaults to the session's windowTokenLimit.
   * @returns An array of messages formatted for LLM input.
   * @throws {Error} If `llmFormatter` returns a non-array value.
   */
  getLLMMessages<T = { role: string; content: string }>(
    windowSize: number = this.windowTokenLimit,
  ): T[] {
    const promptMessages = this.buildPrompt(windowSize);

    if (this.llmFormatter) {
      const out = this.llmFormatter<T>(promptMessages);
      if (!Array.isArray(out)) {
        throw new Error("llmFormatter must return an array of messages");
      }
      return out;
    }

    // Default = OpenAI-like shape
    return promptMessages.map((m) => ({
      role: m.role,
      content: m.content,
    })) as T[];
  }

  /**
   * Retrieves all system prompt messages in the session.
   *
   * @returns An array of `Message` objects with the role `"system"`.
   */
  getSystemPrompt(): Message[] {
    return this.filterMessagesByRole("system");
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  /**
   * Generates a unique message ID.
   *
   * @returns A unique ID string. If `useSequentialIds` is enabled, returns
   *          an incrementing ID in the form `"msg-N"`. Otherwise, returns a UUID.
   */
  generateMessageId(): string {
    if (this.useSequentialIds) {
      this.messageCounter += 1;
      return `msg-${this.messageCounter}`;
    } else {
      return crypto.randomUUID();
    }
  }

  /**
   * Counts the number of tokens in a message or string.
   *
   * @param message - The message object or raw string to analyze.
   * @returns The calculated token count. Uses `tokenCounterFn` if provided,
   *          otherwise falls back to a naïve whitespace-based count.
   * @remarks
   * - This method catches and ignores errors thrown by a custom `tokenCounterFn`.
   */
  countTokensInMessage(message: Message | string): number {
    const text = typeof message === "string" ? message : message.content;

    if (this.tokenCounterFn) {
      try {
        const count = this.tokenCounterFn(text);
        if (Number.isInteger(count) && count > 0) return count;
      } catch {
        // fall through to default
      }
    }

    // Naïve default: split on whitespace
    return text
      .replace(/[\r\n]+/g, " ")
      .split(/\s+/)
      .filter(Boolean).length;
  }

  /**
   * Retrieves all messages with a given role.
   *
   * @param role - The role to filter messages by (e.g., `"system"`, `"user"`, `"assistant"`, `"summary"`).
   * @returns An array of `Message` objects matching the specified role, in order.
   */
  filterMessagesByRole(role: string): Message[] {
    return this.messageOrder
      .map((id) => this.messages.get(id) || this.summaries.get(id))
      .filter((m): m is Message => Boolean(m))
      .filter((m) => m.role === role);
  }

  /**
   * Splits a list of messages into those that fit within a token window
   * and those that overflow it.
   *
   * @param windowTokenLimit - The maximum token capacity for the fitting set.
   * @param messages - The messages to evaluate. Defaults to all messages in the session.
   * @returns An object with:
   *   - `fitting`: Messages that fit within the token limit.
   *   - `overflow`: Messages that exceed the limit.
   */
  getMessageWindow(
    windowTokenLimit: number = this.windowTokenLimit,
    messages: Message[] = this.getMessages(),
  ): { overflow: Message[]; fitting: Message[] } {
    // let tokenCount = 0;
    // let l = messages.length; // pointer to the l of the fitting region

    // for (let i = messages.length - 1; i >= 0; i--) {
    //   const msg = messages[i];
    //   if (tokenCount + msg.tokens > this.windowTokenLimit) break;
    //   tokenCount += msg.tokens;
    //   l = i;
    // }

    let l = 0;
    let tokenCount = 0;
    for (let r = 0; r < messages.length; r++) {
      tokenCount += messages[r].tokens;
      while (tokenCount > windowTokenLimit) {
        tokenCount -= messages[l].tokens;
        l += 1;
      }
    }

    return {
      overflow: messages.slice(0, l),
      fitting: messages.slice(l),
    };
  }

  /**
   * Compacts the message history by removing messages that are already covered
   * by summaries, keeping summaries in their place.
   *
   * @returns A compacted, ordered list of messages and summaries ready for prompt building.
   * @remarks
   * - Summary messages are retained, and their referenced messages are excluded.
   */
  getCompactedMessages(): Message[] {
    const result: Message[] = [];
    const covered = new Set<string>();

    for (let i = this.messageOrder.length - 1; i >= 0; i--) {
      const id = this.messageOrder[i];
      const msg = this.messages.get(id) || this.summaries.get(id);
      if (!msg) continue;

      if (this.isSummaryMessage(msg)) {
        result.push(msg);
        msg.summaryOf?.forEach((coveredId) => covered.add(coveredId));
      } else if (!covered.has(id)) {
        result.push(msg);
      }
    }

    return result.reverse();
  }

  /**
   * Checks if any summaries exist in the session.
   *
   * @returns `true` if one or more summaries are present, otherwise `false`.
   */
  hasSummaryOverflowed(): boolean {
    return this.summaries.size > 0;
  }

  /**
   * Checks whether any messages exist in the session.
   *
   * @returns `true` if there is at least one message in `messageOrder`.
   */
  hasMessages(): boolean {
    return this.messageOrder.length > 0;
  }

  /**
   * Retrieves the last message in the session.
   *
   * @returns The last `Message` object, or `undefined` if there are no messages.
   */
  getLastMessage(): Message | undefined {
    if (this.messageOrder.length === 0) return undefined;
    const lastId = this.messageOrder[this.messageOrder.length - 1];
    return this.messages.get(lastId) || this.summaries.get(lastId);
  }

  /**
   * Retrieves the first message in the session.
   *
   * @returns The first `Message` object, or `undefined` if there are no messages.
   */
  getFirstMessage(): Message | undefined {
    if (this.messageOrder.length === 0) return undefined;
    const firstId = this.messageOrder[0];
    return this.messages.get(firstId) || this.summaries.get(firstId);
  }

  /**
   * Clears all non-summary messages from the session while retaining the message order
   * for any summaries still present.
   *
   * @remarks
   * - Updates `lastModifiedAt` to the current timestamp.
   * - Emits a `messagesCleared` event after clearing.
   */
  clearMessages(): void {
    const oldIds = new Set(this.messages.keys());
    this.messages.clear();
    this.messageOrder = this.messageOrder.filter((id) => !oldIds.has(id));
    this.emit("messagesCleared");
    this.bumpModified();
  }

  private bumpModified() {
    let now = Date.now();
    if (now <= this.lastModifiedAt) now = this.lastModifiedAt + 1;
    this.lastModifiedAt = now;
  }

  /**
   * Creates a deep copy of the current conversation session, including all messages,
   * summaries, and configuration.
   *
   * @param id - The new session ID for the clone.
   * @param name - Optional name for the cloned session. Defaults to the current session's name with "(Clone)" appended.
   * @returns A new `ConversationSession` instance with all state duplicated.
   *
   * @remarks
   * - Clones are independent: modifying the clone will not affect the original.
   * - Emits a `sessionCloned` event after creation.
   */
  clone(id: string, name?: string): ConversationSession {
    const cloned = new ConversationSession({
      id,
      createdAt: Date.now(),
      lastModifiedAt: Date.now(),
      sessionName: name || `${this.sessionName} (Clone)`,
      reservePercentage: this.SUMMARY_RESERVE_RATIO,
      summeriser: this.summaryFn,
    });

    for (const [msgId, msg] of this.messages.entries()) {
      cloned.messages.set(msgId, { ...msg });
    }
    for (const [sumId, sum] of this.summaries.entries()) {
      cloned.summaries.set(sumId, { ...sum });
    }
    cloned.messageOrder = [...this.messageOrder];
    cloned.useSequentialIds = this.useSequentialIds;
    cloned.windowTokenLimit = this.windowTokenLimit;

    this.emit("sessionCloned", cloned);
    return cloned;
  }

  /**
   * Placeholder for merging multiple sessions into the current one.
   *
   * @throws {Error} Always throws, as merging is not yet implemented.
   */
  merge(): void {
    throw new Error("Merge is not implemented in this version of CtxIQ.");
  }
}

// Note that storage of the messages should be like a transfering jelly from one cup to another.
// when you pour from cup A, the top enters and stays in cup B while the bottom becomes B's top.
// and vice versa when you reverse that operation.
