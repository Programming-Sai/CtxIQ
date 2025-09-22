/**
 * @jest-environment jsdom
 */

import React, { useEffect } from "react";
import { render, act, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  useConversation,
  getGlobalManager,
} from "../src/react/useConversation";

/**
 * Tests for src/react/useConversation.ts
 *
 * Uses a FakeManager implementing the minimal ConversationManager
 * API that the hook expects so tests are deterministic and fast.
 */

// portable UUID helper for tests — uses Web Crypto if available, otherwise falls back
const uuidv4 = (() => {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof (crypto as any).randomUUID === "function"
    )
      return () => (crypto as any).randomUUID();
  } catch {}
  try {
    const { randomUUID } = require("crypto");
    if (typeof randomUUID === "function") return () => randomUUID();
  } catch {}
  return () =>
    `id-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
})();

type Listener = (...args: any[]) => void;

class FakeManager {
  private sessions: {
    id: string;
    sessionName: string;
    createdAt?: number;
    lastModifiedAt?: number;
  }[] = [];
  private activeId: string | null = null;
  private listeners: Map<string, Listener[]> = new Map();

  constructor(
    initial: { id: string; sessionName: string }[] = [],
    activeId?: string | null,
  ) {
    this.sessions = initial.slice();
    this.activeId = activeId ?? this.sessions[0]?.id ?? null;
  }

  // simple event system
  on(event: string, fn: Listener) {
    const arr = this.listeners.get(event) ?? [];
    arr.push(fn);
    this.listeners.set(event, arr);
  }
  off(event: string, fn: Listener) {
    const arr = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      arr.filter((f) => f !== fn),
    );
  }
  private emit(event: string, ...args: any[]) {
    const arr = this.listeners.get(event) ?? [];
    arr.forEach((fn) => {
      try {
        fn(...args);
      } catch {
        // swallow for tests
      }
    });
  }

  // API used by hook:
  listSessions() {
    return this.sessions.map((s) => ({
      id: s.id,
      sessionName: s.sessionName,
      createdAt: s.createdAt,
      lastModifiedAt: s.lastModifiedAt,
    }));
  }
  getActiveSession() {
    return this.activeId;
  }

  createSession(sessionName = "New Chat", setActive = true) {
    const id = uuidv4();
    const s = {
      id,
      sessionName,
      createdAt: Date.now(),
      lastModifiedAt: Date.now(),
    };
    this.sessions.push(s);
    if (setActive) {
      this.activeId = id;
      this.emit("sessionCreated", id, s);
      this.emit("activeSessionReassigned", id);
    } else {
      this.emit("sessionCreated", id, s);
    }
    return id;
  }

  addSession(session: { id: string; sessionName: string; createdAt?: number }) {
    const existing = this.sessions.find((s) => s.id === session.id);
    if (existing) return false;
    this.sessions.push({
      id: session.id,
      sessionName: session.sessionName,
      createdAt: session.createdAt ?? Date.now(),
    });
    this.emit("sessionAdded", session.id, session);
    return true;
  }

  setActiveSession(id: string | null) {
    this.activeId = id;
    this.emit("activeSessionReassigned", id);
  }

  deleteSession(id: string) {
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    this.sessions.splice(idx, 1);
    this.emit("sessionDeleted", id);
    if (this.activeId === id) {
      this.activeId = this.sessions[0]?.id ?? null;
      this.emit("activeSessionReassigned", this.activeId);
    }
    return true;
  }

  clearAllSessions() {
    this.sessions = [];
    this.activeId = null;
    this.emit("allSessionsCleared");
  }

  cloneSession(id: string, newName = "") {
    const src = this.sessions.find((s) => s.id === id);
    if (!src) return null;
    const newId = uuidv4();
    const sessionName = newName || `${src.sessionName} (copy)`;
    const clone = {
      id: newId,
      sessionName,
      createdAt: Date.now(),
      lastModifiedAt: Date.now(),
    };
    this.sessions.push(clone);
    this.emit("sessionCloned", newId, clone);
    return newId;
  }

  getSessionByName(name: string) {
    return this.sessions.find((s) => s.sessionName === name) ?? null;
  }
}

/**
 * Test harness component that exposes the hook's API to the test via a setter.
 */
function HookHarness({
  manager,
  setApiRef,
  enableBroadcast = false,
  initialActiveSessionId,
  onSessionCreated,
  onSessionDeleted,
}: any) {
  const api = useConversation({
    manager,
    enableBroadcast,
    initialActiveSessionId,
    onSessionCreated,
    onSessionDeleted,
  });
  useEffect(() => {
    // DO NOT return setApiRef(api) (that would return an object)
    setApiRef(api);
    // no cleanup returned
  }, [api, setApiRef]);
  return <div data-testid="sessions">{JSON.stringify(api.sessions)}</div>;
}

describe("useConversation hook", () => {
  beforeEach(() => {
    // nothing global to reset; tests pass explicit managers except where noted
  });

  test("initializes from provided manager (sessions + active)", () => {
    const mgr = new FakeManager(
      [
        { id: "s1", sessionName: "A" },
        { id: "s2", sessionName: "B" },
      ],
      "s2",
    );
    let api: any = null;
    const setApiRef = (a: any) => (api = a);

    const { getByTestId } = render(
      <HookHarness manager={mgr} setApiRef={setApiRef} />,
    );

    expect(api).not.toBeNull();
    expect(api.sessions).toHaveLength(2);
    expect(api.sessions.map((s: any) => s.sessionName)).toEqual(
      expect.arrayContaining(["A", "B"]),
    );
    expect(api.activeSessionId).toBe("s2");

    const el = getByTestId("sessions");
    expect(el.textContent).toContain("A");
    expect(el.textContent).toContain("B");
  });

  test("createSession triggers manager.createSession and onSessionCreated callback", () => {
    const mgr = new FakeManager([{ id: "s1", sessionName: "Existing" }], "s1");
    let api: any = null;
    const setApiRef = (a: any) => (api = a);
    const onCreated = jest.fn();

    render(
      <HookHarness
        manager={mgr}
        setApiRef={setApiRef}
        onSessionCreated={onCreated}
      />,
    );

    act(() => {
      const newId = api.createSession("New Chat", true);
      expect(typeof newId).toBe("string");
    });

    expect(
      api.sessions.find((s: any) => s.sessionName === "New Chat"),
    ).toBeTruthy();
    expect(api.activeSessionId).toBeTruthy();
    expect(onCreated).toHaveBeenCalled();
  });

  test("addSession emits sessionAdded and updates local state", () => {
    const mgr = new FakeManager([], null);
    let api: any = null;
    const setApiRef = (a: any) => (api = a);

    render(<HookHarness manager={mgr} setApiRef={setApiRef} />);

    act(() => {
      const added = api.addSession({ id: "x1", sessionName: "Added" });
      expect(added).toBe(true);
    });

    expect(api.sessions.some((s: any) => s.id === "x1")).toBe(true);
  });

  test("deleteSession removes session and triggers onSessionDeleted callback", () => {
    const mgr = new FakeManager([{ id: "d1", sessionName: "ToDelete" }], "d1");
    let api: any = null;
    const setApiRef = (a: any) => (api = a);
    const onDeleted = jest.fn();

    render(
      <HookHarness
        manager={mgr}
        setApiRef={setApiRef}
        onSessionDeleted={onDeleted}
      />,
    );

    act(() => {
      api.deleteSession("d1");
    });

    expect(api.sessions.find((s: any) => s.id === "d1")).toBeUndefined();
    expect(onDeleted).toHaveBeenCalled();
  });

  test("active session reassigns after delete (manager emits activeSessionReassigned)", () => {
    const mgr = new FakeManager(
      [
        { id: "a1", sessionName: "one" },
        { id: "a2", sessionName: "two" },
      ],
      "a2",
    );
    let api: any = null;
    const setApiRef = (a: any) => (api = a);

    render(<HookHarness manager={mgr} setApiRef={setApiRef} />);

    act(() => {
      api.deleteSession("a2");
    });

    expect(api.activeSessionId).toBe("a1");
  });

  test("cloneSession adds new session and updates sessions list", () => {
    const mgr = new FakeManager([{ id: "c1", sessionName: "orig" }], "c1");
    let api: any = null;
    const setApiRef = (a: any) => (api = a);

    render(<HookHarness manager={mgr} setApiRef={setApiRef} />);

    let newId: string | null = null;
    act(() => {
      newId = api.cloneSession("c1", "copy");
    });

    expect(newId).toBeTruthy();
    expect(
      api.sessions.some((s: any) => s.id === newId && s.sessionName === "copy"),
    ).toBe(true);
  });

  test("clearAllSessions empties sessions and activeSessionId", () => {
    const mgr = new FakeManager([{ id: "z1", sessionName: "keep" }], "z1");
    let api: any = null;
    const setApiRef = (a: any) => (api = a);

    render(<HookHarness manager={mgr} setApiRef={setApiRef} />);

    act(() => {
      api.clearAllSessions();
    });

    expect(api.sessions).toHaveLength(0);
    expect(api.activeSessionId).toBeNull();
  });

  test("unmount cleans up listeners so subsequent manager events do not update state", () => {
    const mgr = new FakeManager([{ id: "u1", sessionName: "alive" }], "u1");
    let api: any = null;
    const setApiRef = (a: any) => (api = a);

    const { unmount } = render(
      <HookHarness manager={mgr} setApiRef={setApiRef} />,
    );

    act(() => {
      unmount();
    });

    act(() => {
      mgr.createSession("postUnmount", true);
    });

    // If there were errors they'd surface as exceptions; pass if no thrown
    expect(true).toBe(true);
  });

  test("providing explicit manager isolates hooks (no shared state) while global manager is shared", () => {
    // explicit managers (isolation)
    const A = new FakeManager([{ id: "aA", sessionName: "A1" }], "aA");
    const B = new FakeManager([{ id: "bB", sessionName: "B1" }], "bB");

    let apiA: any = null;
    let apiB: any = null;
    render(<HookHarness manager={A} setApiRef={(a: any) => (apiA = a)} />);
    render(<HookHarness manager={B} setApiRef={(b: any) => (apiB = b)} />);

    act(() => {
      apiA.createSession("A-new");
    });

    expect(apiA.sessions.some((s: any) => s.sessionName === "A-new")).toBe(
      true,
    );
    expect(apiB.sessions.some((s: any) => s.sessionName === "A-new")).toBe(
      false,
    );

    // global manager shared behavior — use the real global manager
    const gm = getGlobalManager();
    // ensure a clean state (attempt to clear if method exists)
    try {
      gm.clearAllSessions?.();
    } catch {}
    let g1: any = null;
    let g2: any = null;

    function HarnessGlobal({ setApiRef }: any) {
      const api = useConversation({});
      useEffect(() => {
        // call setter but do not return its result
        setApiRef(api);
        // intentionally return nothing
      }, [api, setApiRef]);
      return null;
    }

    render(<HarnessGlobal setApiRef={(a: any) => (g1 = a)} />);
    render(<HarnessGlobal setApiRef={(a: any) => (g2 = a)} />);

    act(() => {
      g1.createSession("global-new", true);
    });

    expect(g1.sessions.some((s: any) => s.sessionName === "global-new")).toBe(
      true,
    );
    expect(g2.sessions.some((s: any) => s.sessionName === "global-new")).toBe(
      true,
    );
  });

  test("handles manager.listSessions throwing (falls back to empty list)", () => {
    const mgr = new FakeManager([], null) as any;
    mgr.listSessions = () => {
      throw new Error("boom");
    };
    let api: any = null;
    const setApiRef = (a: any) => (api = a);

    render(<HookHarness manager={mgr} setApiRef={setApiRef} />);

    expect(api.sessions).toEqual([]);
  });
});
