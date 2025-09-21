import { ConversationManager } from "../ConversationManager";
import { StorageAdaptor } from "./StorageAdaptor";

/**
 * Attach a {@link StorageAdaptor} to a {@link ConversationManager}
 * so that session changes are automatically persisted.
 *
 * The adaptor is notified whenever the manager emits key lifecycle events.
 *
 * @example
 * ```ts
 * const manager = new ConversationManager();
 * const storage = new LocalStorageAdaptor();
 * attachStorageAdaptor(manager, storage);
 * ```
 *
 * @param manager - The active conversation manager instance.
 * @param adaptor - A storage adaptor implementation
 * (e.g. {@link LocalStorageAdaptor}).
 */
export function attachStorageAdaptor(
  manager: ConversationManager,
  adaptor: StorageAdaptor,
): void {
  manager.on("sessionCreated", (_, s) => adaptor.saveSession(s));
  manager.on("sessionCloned", (_, s) => adaptor.saveSession(s));
  manager.on("sessionDeleted", (id) => adaptor.deleteSession(id));
  manager.on("allSessionsCleared", () => adaptor.clearAll());
  manager.on("activeSessionReassigned", () => {
    const latest = manager.getLatestSession();
    if (latest) adaptor.saveSession(latest);
  });
}
