/* eslint-disable @typescript-eslint/no-unused-vars */

import { EventEmitter } from "events";
import { ConversationSessionConfig, Message, SessionOptions } from "../types";

export class ConversationSession extends EventEmitter {
  public id: string;
  public createdAt: number;
  public lastModifiedAt: number;
  public sessionName: string;
  public messages: Map<string, Message>;

  constructor(config: ConversationSessionConfig) {
    super();
    this.id = config.id;
    this.createdAt = config.createdAt;
    this.lastModifiedAt = config.lastModifiedAt;
    this.sessionName = config.sessionName;
    this.messages = new Map();
  }

  // ─── Core ────────────────────────────────────────────────────────────────────

  /**
   * Adds a new message to the session.
   * Automatically generates a unique ID for the message.
   * Emits a `messageAdded` event with the message ID and full message object.
   *
   * @param message - The message to add (without an ID).
   */
  addMessage(message: Message): void {
    const id = this.generateMessageId();
    message.id = id;
    this.messages.set(id, message);
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

  buildPrompt(windowTokenLimit?: number) {
    // get message window
    // check if number of tokens exceeds token limit
    // if it does find and follow overflow stategy
    // Strat 1 (summarisation)
    // check if there is an existing summary
    // if there is, replace current window that is not a summary with the new summary, or add the summary to an existing summary
    // is there is none, then summarise window, add that summary to the messages map, and then use that summary
    // Strat 2 (truncation)
    // cut of parts that exceed the window limit and continue, basically simple sliding window apprach, where we are looking for sum k
    // look into how the `think for longer` feature works on chatgpt, since that seems to be able to take in longer prompts.
    // or based on user's choice do not cut excess off and just chunk it up and send them in one by one.
    // after implementing overflow strat, add system prompt if any and send all that to the llm.
  }
  getPromptTokenCount() {}
  truncatePrompt(windowTokenLimit?: number) {}
  summariseAndReplace() {}

  // ─── Serialization / Persistence ────────────────────────────────────────────

  toJSON() {}
  fromJSON(json: SessionOptions) {}

  // ─── Summary Helpers & System Prompt ───────────────────────────────────────

  isSummaryMessage(msg: Message) {}
  getSummaryMessages() {}
  getVisibleMessages() {}
  getLLMMessages(windowSize?: number) {}
  getSystemPrompt() {}

  // ─── Utilities ──────────────────────────────────────────────────────────────

  generateMessageId(): string {
    return crypto.randomUUID();
  }
  countTokensInMessage(message: Message) {}
  filterMessagesByRole(role: string) {}
  getMessagesInRange(startId: string, endId: string) {}
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
