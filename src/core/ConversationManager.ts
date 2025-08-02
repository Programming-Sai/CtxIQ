import { ConversationSession } from "./ConversationSession";
import { EventEmitter } from "events";

/**
 * ConversationManager
 *
 * Orchestrates multiple ConversationSession instances, providing in-memory
 * lifecycle management, quick lookup, and active-session tracking.
 *
 * ### Key Responsibilities
 * - **Session Creation & Deletion**
 *   Create new chat sessions or remove existing ones, emitting events for UI or persistence layers.
 * - **Active Session Management**
 *   Maintain a “current” session context, automatically reassigning when the active session is deleted.
 * - **Session Enumeration**
 *   List, search by name, and retrieve oldest/newest sessions for administrative or UI workflows.
 * - **Cloning & Bulk Operations**
 *   Deep-clone individual sessions and clear all sessions with a single call.
 *
 * ### Events
 * - `sessionAdded(id: string, session: ConversationSession)`
 *   Emitted when an existing session is registered.
 * - `sessionCreated(id: string, session: ConversationSession)`
 *   Emitted when a new session is spun up.
 * - `activeSessionReassigned(newId: string|null, oldId: string|null)`
 *   Fired whenever the active session is changed or cleared.
 * - `sessionDeleted(id: string)`
 *   Emitted after a session is removed.
 * - `allSessionsCleared()`
 *   Emitted when every session is purged.
 * - `sessionCloned(newId: string, clonedSession: ConversationSession)`
 *   Emitted when a session is deep-cloned.
 *
 * ### Extensibility
 * - Hook into events to synchronize with storage, UI state, or logging systems.
 * - Swap out the ID generation strategy by overriding `crypto.randomUUID()` at runtime.
 *
 * ### Usage
 * ```ts
 * const manager = new ConversationManager();
 *
 * // Create two sessions
 * const firstId  = manager.createSession("Support Chat");
 * const secondId = manager.createSession("Sales Inquiry");
 *
 * // Listen for session switches
 * manager.on("activeSessionReassigned", (newId, oldId) => {
 *   console.log(`Switched from ${oldId} to ${newId}`);
 * });
 *
 * // Set active by name
 * const sales = manager.getSessionByName("Sales Inquiry");
 * if (sales) manager.setActiveSession(sales.id);
 *
 * // Clone a session for testing
 * const cloneId = manager.cloneSession(firstId, "Support Chat (Copy)");
 *
 * // Delete the oldest session
 * const oldest = manager.getOldestSession();
 * if (oldest) manager.deleteSession(oldest.id);
 * ```
 *
 * @see ConversationSession for per-session message management and prompt building.
 */
export class ConversationManager extends EventEmitter {
  private sessions = new Map<string, ConversationSession>();
  private activeSessionId: string | null = null;

  /**
   * Adds an existing ConversationSession instance to the manager.
   * Dows not overwrites any session with the same ID.
   * Emits `sessionAdded` with (id, session).
   *
   * @param session - The session to add.
   * @returns `true` is the addition was successful and `false` if the id already exists
   */
  addSession(session: ConversationSession): boolean {
    if (this.hasSession(session.id)) return false;
    this.sessions.set(session.id, session);
    this.emit("sessionAdded", session.id, session);
    return true;
  }

  /**
   * Creates a new conversation session and stores it.
   * Optionally sets it as active.
   * Emits `sessionCreated` with (id, session).
   *
   * @param sessionName - Human-readable name.
   * @param setActive - Whether to select it immediately.
   * @returns The new session’s ID.
   */
  createSession(sessionName: string, setActive = true): string {
    const now = Date.now();
    const id = crypto.randomUUID();
    const session = new ConversationSession({
      id,
      createdAt: now,
      lastModifiedAt: now,
      sessionName,
    });

    this.sessions.set(id, session);
    this.emit("sessionCreated", id, session);

    if (setActive) this.setActiveSession(id);
    return id;
  }

  /**
   * Sets the active session by ID.
   * Emits `activeSessionReassigned` with (newId, previousId).
   *
   * @param id - ID to activate (or null to clear).
   * @returns The previous active ID, or null.
   */
  setActiveSession(id: string | null): string | null {
    const previous = this.activeSessionId;
    this.activeSessionId = id;
    this.emit("activeSessionReassigned", id, previous);
    return previous;
  }

  /**
   * Returns all sessions as an array of `{ id, sessionName }`.
   */
  listSessions(): { id: string; sessionName: string }[] {
    return Array.from(this.sessions.entries()).map(([id, s]) => ({
      id,
      sessionName: s.sessionName,
    }));
  }

  /**
   * Returns the active session’s ID, or null if none.
   */
  getActiveSession(): string | null {
    return this.activeSessionId;
  }

  /**
   * Deletes a session by ID.
   * Emits `sessionDeleted` with (id).
   * If that session was active and the user didn’t reassign, reassigns to the most recently modified.
   *
   * @param id - ID of session to delete.
   * @returns True if deleted, false if not found.
   */
  deleteSession(id: string): boolean {
    if (!this.hasSession(id)) return false;

    const wasActive = this.activeSessionId === id;
    this.sessions.delete(id);
    this.emit("sessionDeleted", id);

    if (wasActive && this.activeSessionId === id) {
      this.setActiveSession(this.getLatestSession()?.id ?? null);
    }
    return true;
  }

  /**
   * Clears all sessions and resets active selection.
   * Emits `allSessionsCleared`.
   */
  clearAllSessions(): void {
    this.sessions.clear();
    this.setActiveSession(null);
    this.emit("allSessionsCleared");
  }

  /**
   * Finds a session by its name.
   *
   * @param name - Name to search for.
   * @returns The first matching session or null.
   */
  getSessionByName(name: string): ConversationSession | null {
    for (const s of this.sessions.values()) {
      if (s.sessionName === name) return s;
    }
    return null;
  }

  /**
   * Checks whether a session exists.
   *
   * @param id - Session ID.
   * @returns True if present.
   */
  hasSession(id: string): boolean {
    return this.sessions.has(id);
  }

  /**
   * Returns the most recently modified session.
   */
  getLatestSession(): ConversationSession | null {
    let latest: ConversationSession | null = null;
    let time = -Infinity;
    for (const s of this.sessions.values()) {
      if (s.lastModifiedAt > time) {
        time = s.lastModifiedAt;
        latest = s;
      }
    }
    return latest;
  }

  /**
   * Returns the oldest session by creation time.
   */
  getOldestSession(): ConversationSession | null {
    let oldest: ConversationSession | null = null;
    let time = Infinity;
    for (const s of this.sessions.values()) {
      if (s.createdAt < time) {
        time = s.createdAt;
        oldest = s;
      }
    }
    return oldest;
  }

  /**
   * Creates a deep clone of an existing session.
   * Emits `sessionCloned` with (newId, clonedSession).
   *
   * @param id - ID of the session to clone.
   * @param newName - Optional name for the clone.
   * @returns The new clone’s ID or null if not found.
   */
  cloneSession(id: string, newName = ""): string | null {
    const original = this.sessions.get(id);
    if (!original) return null;

    const newId = crypto.randomUUID();
    const cloned = original.clone(newId, newName);
    this.sessions.set(newId, cloned);
    this.emit("sessionCloned", newId, cloned);
    return newId;
  }
}
