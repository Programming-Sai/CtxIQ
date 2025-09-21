/**
 * @jest-environment jsdom
 */

import { ConversationSession } from "../src/core/ConversationSession";
import { LocalStorageAdaptor } from "../src/core/storage/LocalStorageAdaptor";

function createDummySession(): ConversationSession {
  const s = new ConversationSession({
    id: "s1",
    createdAt: Date.now(),
    lastModifiedAt: Date.now(),
    sessionName: "Test",
  });
  s.addMessage({
    id: "m1",
    role: "user",
    content: "hello",
    tokens: 1,
    timestamp: Date.now(),
  });
  return s;
}

describe("LocalStorageAdaptor", () => {
  let adaptor: LocalStorageAdaptor;

  beforeEach(() => {
    adaptor = new LocalStorageAdaptor("test-key");
    localStorage.clear();
  });

  it("saves and loads a session", async () => {
    const s = createDummySession();
    await adaptor.saveSession(s);
    const loaded = await adaptor.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(s.id);
    expect(loaded[0].sessionName).toBe("Test");
  });

  it("updates an existing session instead of duplicating", async () => {
    const s = createDummySession();
    await adaptor.saveSession(s);
    s.sessionName = "Updated";
    await adaptor.saveSession(s);
    const loaded = await adaptor.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].sessionName).toBe("Updated");
  });

  it("deletes a session by id", async () => {
    const s = createDummySession();
    await adaptor.saveSession(s);
    await adaptor.deleteSession(s.id);
    const loaded = await adaptor.loadAll();
    expect(loaded).toHaveLength(0);
  });

  it("clears all sessions", async () => {
    const s = createDummySession();
    await adaptor.saveSession(s);
    await adaptor.clearAll();
    const loaded = await adaptor.loadAll();
    expect(loaded).toHaveLength(0);
  });

  it("handles missing key gracefully", async () => {
    const loaded = await adaptor.loadAll();
    expect(Array.isArray(loaded)).toBe(true);
    expect(loaded).toHaveLength(0);
  });
});
