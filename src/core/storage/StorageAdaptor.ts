import { ConversationSession } from "../ConversationSession";

/**
 * Generic interface for a persistence layer that can
 * store and retrieve {@link ConversationSession} objects.
 *
 * Implementations can target any storage backend
 * (browser LocalStorage, IndexedDB, file system, cloud DB, etc.).
 */
export interface StorageAdaptor {
  /**
   * Load **all** saved sessions from the backend.
   *
   * @returns A promise that resolves to an array of
   * {@link ConversationSession} instances.
   * The array may be empty if no sessions exist.
   */
  loadAll(): Promise<ConversationSession[]>;

  /**
   * Save or update a single session.
   *
   * If a session with the same `id` already exists,
   * it should be replaced.
   *
   * @param session - The conversation session to persist.
   * @returns A promise that resolves when the operation completes.
   */
  saveSession(session: ConversationSession): Promise<void>;

  /**
   * Permanently delete a session by its unique identifier.
   *
   * @param id - The `ConversationSession.id` of the session to delete.
   * @returns A promise that resolves when the operation completes.
   */
  deleteSession(id: string): Promise<void>;

  /**
   * Remove **all** persisted sessions from the backend.
   *
   * @returns A promise that resolves when the operation completes.
   */
  clearAll(): Promise<void>;
}
