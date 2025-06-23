// ConversationManager.test.ts

import { ConversationManager } from "../src/core/ConversationManager";
// import { ConversationSession } from "../src/core/ConversationSession";

describe("ConversationManager", () => {
  let manager: ConversationManager;

  beforeEach(() => {
    manager = new ConversationManager();
  });

  test("should create a session and store it", () => {
    const id = manager.createSession("Test Session");
    expect(manager.hasSession(id)).toBe(true);
    expect(manager.getActiveSession()).toBe(id);
  });

  test("should switch active session", () => {
    const id1 = manager.createSession("Session 1");
    const id2 = manager.createSession("Session 2");
    const prev = manager.setActiveSession(id1);
    expect(manager.getActiveSession()).toBe(id1);
    expect(prev).toBe(id2);
  });

  test("should delete session and reassign active if needed", () => {
    const id1 = manager.createSession("Session 1");
    const id2 = manager.createSession("Session 2");

    manager.setActiveSession(id1);
    manager.deleteSession(id1);

    const active = manager.getActiveSession();
    expect(active === id2 || active === null).toBe(true);
    expect(manager.hasSession(id1)).toBe(false);
  });

  test("should clear all sessions", () => {
    manager.createSession("One");
    manager.createSession("Two");

    manager.clearAllSessions();
    expect(manager.listSessions()).toHaveLength(0);
    expect(manager.getActiveSession()).toBeNull();
  });

  test("should clone a session", () => {
    const id = manager.createSession("Original");
    const cloneId = manager.cloneSession(id, "Copy");

    expect(cloneId).not.toBeNull();
    expect(manager.hasSession(cloneId!)).toBe(true);
  });

  test("should not clone nonexistent session", () => {
    const result = manager.cloneSession("non-existent-id");
    expect(result).toBeNull();
  });
});
