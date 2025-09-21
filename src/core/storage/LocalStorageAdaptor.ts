import { StorageAdaptor } from "./StorageAdaptor";
import { ConversationSession } from "../ConversationSession";
import { SerializedSession } from "../../types";

/**
 * Browser implementation of {@link StorageAdaptor}
 * that persists sessions using the `window.localStorage` API.
 *
 * Sessions are stored under a single key as a JSON array.
 * The default key is `"ctxiq:sessions"`, but can be overridden
 * in the constructor.
 *
 * ⚠️ **Note**:
 * - Only suitable for client-side environments.
 * - Data is limited by the browser’s localStorage quota.
 */
export class LocalStorageAdaptor implements StorageAdaptor {
  /** LocalStorage key under which all sessions are stored. */
  private key: string;

  /**
   * Create a new adaptor.
   *
   * @param key - Optional storage key. Defaults to `"ctxiq:sessions"`.
   */
  constructor(key?: string) {
    this.key = key ?? "ctxiq:sessions";
  }

  /**
   * Load all saved sessions from LocalStorage.
   *
   * @returns A promise resolving to an array of
   * {@link ConversationSession} instances.
   * If no sessions are found or parsing fails, an empty array is returned.
   */
  async loadAll(): Promise<ConversationSession[]> {
    const raw = localStorage.getItem(this.key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return parsed.map((obj: SerializedSession) =>
        ConversationSession.fromJSON(obj),
      );
    } catch {
      return [];
    }
  }

  /**
   * Save or update a single session.
   *
   * If a session with the same ID already exists,
   * it is replaced; otherwise it is appended.
   *
   * @param session - The session to persist.
   */
  async saveSession(session: ConversationSession): Promise<void> {
    const sessions = await this.loadAll();
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) sessions[idx] = session;
    else sessions.push(session);

    localStorage.setItem(
      this.key,
      JSON.stringify(sessions.map((s) => s.toJSON())),
    );
  }

  /**
   * Delete a specific session by ID.
   *
   * @param id - The ID of the session to delete.
   */
  async deleteSession(id: string): Promise<void> {
    const sessions = await this.loadAll();
    const filtered = sessions.filter((s) => s.id !== id);
    localStorage.setItem(
      this.key,
      JSON.stringify(filtered.map((s) => s.toJSON())),
    );
  }

  /**
   * Remove **all** sessions from LocalStorage.
   */
  async clearAll(): Promise<void> {
    localStorage.removeItem(this.key);
  }
}
