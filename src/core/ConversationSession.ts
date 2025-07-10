/* eslint-disable @typescript-eslint/no-unused-vars */

import { EventEmitter } from "events";
import { ConversationSessionConfig, Message, SessionOptions } from "../types";
import { truncate } from "fs";

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
  public SUMMARY_RESERVE_RATIO; // 15% of window
  public summaryFn?: (msgs: Message[], reserve: number) => Message; // user‑injected summary hook
  public windowTokenLimit: number;

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
  }

  addSummary(summary: Message): void {
    if (summary.tokens > this.windowTokenLimit) {
      console.warn(
        `[CtxIQ] Skipping summary ${summary.id} — too large (${summary.tokens} > ${this.windowTokenLimit})`
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
        ...summaryIds.map((msgId) => this.messageOrder.indexOf(msgId))
      );

      if (lastIndex >= 0) {
        this.messageOrder.splice(lastIndex + 1, 0, id);
      } else {
        // Fallback: append if something went wrong
        this.messageOrder.push(id);
      }
    } else {
      // No summaryOf? Just append
      this.messageOrder.push(id);
    }

    this.emit("summaryAdded", id, summary);
  }

  getSummaries(): Message[] {
    return this.getCompactedMessages();
  }
  getSummaryById(id: string): Message | undefined {
    return;
  }
  deleteSummary(id: string): boolean {
    return false;
  }
  setSummaries(summaries: Message[]): void {}
  clearSummaries(): void {}

  // ─── Message Core ────────────────────────────────────────────────────────────────────

  /**
   * Adds a new message to the session.
   * Automatically generates a unique ID for the message.
   * Emits a `messageAdded` event with the message ID and full message object.
   *
   * @param message - The message to add (without an ID).
   */
  addMessage(message: Message): void {
    if (this.isSummaryMessage(message)) return this.addSummary(message);
    const id = this.generateMessageId();
    message.id = id;
    message.tokens =
      message.tokens || this.countTokensInMessage(message.content);
    this.messages.set(id, message);
    this.messageOrder.push(id);
    this.emit("messageAdded", id, message);
  }

  /**
   * Returns all messages in the session in order of insertion.
   * Each message includes its ID as part of the message object.
   */
  getMessages(): Message[] {
    return Array.from(this.messages.values());
  }

  /**
   * Retrieves a message from the session by its ID.
   *
   * @param id - The ID of the message to retrieve.
   * @returns The matching message object or `undefined` if not found.
   */
  getMessageById(id: string): Message | undefined {
    return this.messages.get(id);
  }

  /**
   * Deletes a message from the session by its ID.
   * Emits `messageDeleted` with the ID and status.
   *
   * @param id - The ID of the message to delete.
   * @returns `true` if the message was deleted, `false` if it did not exist.
   */
  deleteMessage(id: string): boolean {
    const deleteionStatus = this.messages.delete(id);
    this.emit("messageDeleted", id, deleteionStatus);
    return deleteionStatus;
  }

  /**
   * Replaces an existing message with a new one by ID.
   * Emits `messageEdited` with the ID and the new message.
   *
   * @param id - The ID of the message to replace.
   * @param newMsg - The new message object to insert.
   */
  editMessage(id: string, newMsg: Message): void {
    newMsg.id = id;
    this.messages.set(id, newMsg);
    this.emit("messageEditted", id, newMsg);
  }

  /**
   * Overwrites the entire message buffer.
   * Emits `messagesReplaced` with the new array of messages.
   */
  setMessages(messages: Message[]): void {
    this.messages.clear();
    for (const msg of messages) {
      this.messages.set(msg.id, msg);
    }
    this.lastModifiedAt = Date.now();
    this.emit("messagesReplaced", messages);
  }

  // ─── Prompt-Building Stubs ──────────────────────────────────────────────────

  public buildPrompt(
    windowTokenLimit: number = this.windowTokenLimit,
    fallbackToTruncation: boolean = true
  ): Message[] {
    if (!this.summaryFn) {
      // no summariser → pure truncation
      const { fitting } = this.getMessageWindow(
        windowTokenLimit,
        this.getCompactedMessages()
      );
      return fitting;
    }

    // 1) reserve summary tokens
    const reserve = Math.max(
      1,
      Math.floor(windowTokenLimit * this.SUMMARY_RESERVE_RATIO)
    );
    const usable = windowTokenLimit - reserve;

    // 2) compact all messages
    const baseList = this.getCompactedMessages();

    if (usable <= 0) {
      // No space left for summary, skip to raw window
      return this.getMessageWindow(windowTokenLimit, baseList).fitting;
    }
    // 3) initial fit
    const { fitting, overflow } = this.getMessageWindow(usable, baseList);

    // 4) no overflow
    if (overflow.length === 0) return fitting;

    const allCovered = overflow.every((msg) => this.isMessageSummarized(msg));

    if (allCovered) {
      // Find the latest summary that covers these
      const existingSummary = Array.from(this.summaries.values()).find((s) =>
        overflow.every((msg) => s.summaryOf?.has(msg.id))
      );
      // Inside if (allCovered)
      if (existingSummary) {
        if (existingSummary.tokens <= reserve) {
          return [existingSummary, ...fitting];
        } else if (fallbackToTruncation) {
          return this.getMessageWindow(windowTokenLimit, baseList).fitting;
        } else {
          throw new Error(
            `Existing summary (${existingSummary.tokens}) exceeds reserved budget (${reserve})`
          );
        }
      }
    }

    // 5) summarise overflow chunk
    const summaryMsg = this.summaryFn(overflow, reserve);
    summaryMsg.summaryOf = new Set(overflow.map((m) => m.id));
    summaryMsg.role = "summary";

    // 6) ensure summary fits
    if (summaryMsg.tokens > reserve) {
      if (fallbackToTruncation) {
        const { fitting } = this.getMessageWindow(windowTokenLimit);
        return fitting;
      } else {
        throw new Error(
          `Summary (${summaryMsg.tokens} tokens) exceeds reserved budget (${reserve})`
        );
      }
    }
    this.addSummary(summaryMsg);

    // 7) final prompt = [summary, ...fitting]
    return [summaryMsg, ...fitting];
  }

  getPromptTokenCount() {}
  truncatePrompt(windowTokenLimit: number = this.windowTokenLimit) {}
  summariseAndReplace() {}

  // ─── Serialization / Persistence ────────────────────────────────────────────

  toJSON() {}
  fromJSON(json: SessionOptions) {}

  // ─── Summary Helpers & System Prompt ───────────────────────────────────────

  isSummaryMessage(msg: Message) {
    return msg.role === "summary";
  }
  isMessageSummarized(msg: Message): boolean {
    for (const summary of this.summaries.values()) {
      if (summary.summaryOf?.has(msg.id)) return true;
    }
    return false;
  }

  getSummaryMessages() {}
  getVisibleMessages() {}
  getLLMMessages(windowSize?: number) {}
  getSystemPrompt() {}

  // ─── Utilities ──────────────────────────────────────────────────────────────

  generateMessageId(): string {
    if (this.useSequentialIds) {
      this.messageCounter += 1;
      return `msg-${this.messageCounter}`;
    } else {
      return crypto.randomUUID();
    }
  }

  countTokensInMessage(message: Message | string): number {
    return 0;
  }
  filterMessagesByRole(role: string) {}

  getMessageWindow(
    windowTokenLimit: number = this.windowTokenLimit,
    messages: Message[] = this.getMessages()
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

  hasSummaryOverflowed() {}
  hasMessages() {}
  getLastMessage() {
    {
    }
  }

  /**
   * Clears all messages from the session.
   * Emits a `messagesCleared` event.
   */
  clearMessages(): void {
    this.messages.clear();
    this.emit("messagesCleared");
  }

  /**
   * Creates a deep clone of the current session including its messages.
   * Emits a `sessionCloned` event with the new session.
   *
   * @param id - New session ID for the clone.
   * @param name - New session name (optional).
   * @returns A new ConversationSession instance with copied messages.
   */
  clone(id: string, name: string): ConversationSession {
    const cloned = new ConversationSession({
      id,
      createdAt: Date.now(),
      lastModifiedAt: Date.now(),
      sessionName: name || this.sessionName + " (Clone)",
    });

    for (const [msgId, msg] of this.messages.entries()) {
      // Deep copy message (shallow copy is enough unless nested structures exist)
      cloned.messages.set(msgId, { ...msg });
    }
    this.emit("sessionCloned", cloned);
    return cloned;
  }

  merge() {}
}

// Note that storage of the messages should be like a transfering jelly from one cup to another.
// when you pour from cup A, the top enters and stays in cup B while the bottom becomes B's top.
// and vice versa when you reverse that operation.

/**
 * Event Name	Emitted When
messageAdded	A message is added
messageDeleted	A message is removed
messagesReplaced	Entire message buffer is overwritten
sessionModified	Any significant update occurs
promptOverflowed
 */

// const session = new ConversationSession({
//   id: "sess-1",
//   createdAt: Date.now(),
//   lastModifiedAt: Date.now(),
//   sessionName: "TestSession",
// });
// session.useSequentialIds = true;

// const createSessionWithData = () => {
//   const data = [
//     { role: "system", content: "System prompt", tokens: 5 },
//     { role: "user", content: "Hi", tokens: 3 },
//     { role: "assistant", content: "Hello", tokens: 4 },
//     { role: "user", content: "Explain quantum physics", tokens: 15 },
//     {
//       role: "summary",
//       content: "Summary of intro",
//       tokens: 6,
//       summaryOf: new Set(["msg-1", "msg-2", "msg-3", "msg-4"]),
//     },
//     { role: "assistant", content: "Here’s a short version...", tokens: 8 },
//     { role: "user", content: "Follow-up on physics", tokens: 10 },
//     { role: "assistant", content: "Answering follow-up", tokens: 9 },
//     {
//       role: "summary",
//       content: "Physics discussion summary",
//       tokens: 5,
//       summaryOf: new Set(["msg-6", "msg-7", "msg-8"]),
//     },
//     { role: "user", content: "New unrelated topic", tokens: 6 },
//     { role: "assistant", content: "Response to new topic", tokens: 7 },
//     {
//       role: "summary",
//       content: "Third summary",
//       tokens: 4,
//       summaryOf: new Set(["msg-10", "msg-11"]),
//     },
//     { role: "user", content: "Final topic", tokens: 5 },
//   ];

//   let id = 0;
//   for (const item of data) {
//     const msg = {
//       id: `msg-${++id}`,
//       role: item.role as Message["role"],
//       content: item.content,
//       tokens: item.tokens,
//       summaryOf: item.summaryOf, // will be undefined for normal messages
//     } as Message;

//     session.addMessage(msg); // now uses addMessage for both types
//   }
// };

// createSessionWithData();
// // console.log(session.messages, session.summaries, session.messageOrder);
// // console.log(session.getCompactedMessages());
// console.log(
//   session.getMessageWindow(10, undefined, session.getCompactedMessages())
// );
