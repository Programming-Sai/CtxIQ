/**
 * @jest-environment jsdom
 */

import { ConversationManager } from "../src/core/ConversationManager";
import { LocalStorageAdaptor } from "../src/core/storage/LocalStorageAdaptor";
import { attachStorageAdaptor } from "../src/core/storage/attachStorage";

describe("attachStorageAdaptor", () => {
  let manager: ConversationManager;
  let adaptor: LocalStorageAdaptor;

  beforeEach(() => {
    manager = new ConversationManager();
    adaptor = new LocalStorageAdaptor("test-key");
    localStorage.clear();
    attachStorageAdaptor(manager, adaptor);
  });

  it("persists session on creation", async () => {
    const id = manager.createSession("New Chat");
    await new Promise((r) => setTimeout(r, 0));
    const loaded = await adaptor.loadAll();
    expect(loaded.find((s) => s.id === id)).toBeTruthy();
  });

  it("removes session on deletion", async () => {
    const id = manager.createSession("Temp");
    await manager.deleteSession(id);
    await new Promise((r) => setTimeout(r, 0));
    const loaded = await adaptor.loadAll();
    expect(loaded.find((s) => s.id === id)).toBeFalsy();
  });

  it("clears storage when all sessions are cleared", async () => {
    manager.createSession("A");
    await adaptor.clearAll();
    manager.clearAllSessions();
    await new Promise((r) => setTimeout(r, 0));
    const loaded = await adaptor.loadAll();
    expect(loaded).toHaveLength(0);
  });
});
