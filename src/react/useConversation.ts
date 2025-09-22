import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConversationManager } from "../core/ConversationManager";
import type { ConversationSession } from "../core/ConversationSession";

/**
 * Config options for the hook
 *
 * @typedef {Object} UseConversationOptions
 * @property {ConversationManager} [manager] - Supply your own manager instance (useful for tests or SSR).
 * @property {string|null} [initialActiveSessionId] - Initial active session id to seed the hook state.
 * @property {boolean} [enableBroadcast=true] - Whether to enable cross-tab syncing (BroadcastChannel/localStorage).
 * @property {string} [broadcastChannelName='ctxiq:sessions'] - Broadcast channel/localStorage key prefix.
 * @property {(id: string, session?: ConversationSession) => void} [onSessionCreated] - Callback invoked when a session is created.
 * @property {(id: string) => void} [onSessionDeleted] - Callback invoked when a session is deleted.
 */
export type UseConversationOptions = {
  // allow the consumer to supply their own manager (useful for tests / SSR)
  manager?: ConversationManager;
  // initial active session id
  initialActiveSessionId?: string | null;
  // whether to enable cross-tab broadcasting (default: true)
  enableBroadcast?: boolean;
  // channel name for BroadcastChannel/localStorage sync
  broadcastChannelName?: string;
  // callbacks
  onSessionCreated?: (id: string, session?: ConversationSession) => void;
  onSessionDeleted?: (id: string) => void;
};

/**
 * Minimal session metadata shape returned by the hook.
 * Kept intentionally small so it is serializable and cheap to store/display in UI lists.
 *
 * @typedef {Object} SessionMeta
 * @property {string} id - session id
 * @property {string} sessionName - human-readable name
 * @property {number} [createdAt] - optional creation timestamp
 * @property {number} [lastModifiedAt] - optional last modified timestamp
 */
export type SessionMeta = {
  id: string;
  sessionName: string;
  createdAt?: number;
  lastModifiedAt?: number;
};

/**
 * Tab-local unique id (used to avoid processing our own broadcast messages).
 * We generate this even on server but only use it in browser contexts.
 */
const TAB_ID = (() => {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    )
      return crypto.randomUUID();
  } catch {}
  return `tab-${Math.random().toString(36).slice(2, 9)}`;
})();

/**
 * Returns the global singleton ConversationManager.
 *
 * @remarks
 * - The manager is created lazily and stored in module scope so multiple hook instances share it by default.
 * - Passing a custom `manager` to the hook allows isolation (e.g. tests or SSR).
 *
 * @returns {ConversationManager} the global manager instance
 */
let _globalManager: ConversationManager | null = null;
export function getGlobalManager() {
  if (!_globalManager) _globalManager = new ConversationManager();
  return _globalManager;
}

/**
 * Helper: small payloads we send on broadcast so other tabs can update UI quickly.
 */
type BroadcastPayload =
  | { type: "sessionCreated"; id: string; sessionName: string; tabId: string }
  | { type: "sessionAdded"; id: string; sessionName: string; tabId: string }
  | { type: "sessionDeleted"; id: string; tabId: string }
  | { type: "activeSessionReassigned"; newId: string | null; tabId: string }
  | { type: "allSessionsCleared"; tabId: string }
  | { type: "sessionCloned"; id: string; sessionName: string; tabId: string };

/**
 * React hook that exposes a ConversationManager view suitable for UI components.
 *
 * Features:
 * - Uses a provided manager or a shared global manager.
 * - Keeps a small, serializable list of sessions (`sessions`) and the `activeSessionId`.
 * - Subscribes to manager events and applies efficient incremental updates (no full list refresh on every event).
 * - (Optional) broadcasts local changes to other tabs via BroadcastChannel or a localStorage fallback.
 *
 * @param {UseConversationOptions} [opts] - Hook configuration.
 * @returns {{
 *   manager: ConversationManager,
 *   sessions: SessionMeta[],
 *   activeSessionId: string | null,
 *   createSession: (sessionName?: string, setActive?: boolean) => string,
 *   addSession: (session: ConversationSession) => boolean,
 *   setActiveSession: (id: string | null) => string | null,
 *   deleteSession: (id: string) => boolean,
 *   clearAllSessions: () => void,
 *   cloneSession: (id: string, newName?: string) => string | null,
 *   getSessionByName: (name: string) => ConversationSession | null
 * }}
 *
 * @example
 * const {
 *   sessions, activeSessionId, createSession, setActiveSession
 * } = useConversation({ enableBroadcast: true });
 *
 * // create a new session and set active
 * const id = createSession("Support chat");
 * setActiveSession(id);
 */
export function useConversation(opts?: UseConversationOptions) {
  const {
    manager: externalManager,
    initialActiveSessionId = null,
    enableBroadcast = true,
    broadcastChannelName = "ctxiq:sessions",
    onSessionCreated,
    onSessionDeleted,
  } = opts ?? {};

  // Manager reference (stable)
  const managerRef = useRef<ConversationManager | null>(
    externalManager ?? null,
  );
  if (!managerRef.current) {
    // Lazily create the global manager if none provided
    managerRef.current = externalManager ?? getGlobalManager();
  }
  const manager = managerRef.current;

  // Local state for UI (small, serializable)
  const [sessions, setSessions] = useState<SessionMeta[]>(() => {
    try {
      return manager?.listSessions() ?? [];
    } catch {
      return [];
    }
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    return initialActiveSessionId ?? manager?.getActiveSession() ?? null;
  });

  // Keep a ref to avoid stale closures in event handlers
  const callbacksRef = useRef({ onSessionCreated, onSessionDeleted });
  callbacksRef.current = { onSessionCreated, onSessionDeleted };

  // ---------- Performance optimization ----------
  // Instead of always calling manager.listSessions() on every event, we apply
  // incremental updates using the event payload (manager emits id + session),
  // which keeps updates cheap for UIs with many sessions.
  const applySessionAdded = useCallback((id: string, sessionName: string) => {
    setSessions((prev) => {
      // if exists, update name; otherwise push
      const idx = prev.findIndex((s) => s.id === id);
      if (idx >= 0) {
        const copy = prev.slice();
        copy[idx] = { ...copy[idx], sessionName };
        return copy;
      }
      return [...prev, { id, sessionName }];
    });
  }, []);

  const applySessionDeleted = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const applySessionCloned = useCallback((id: string, sessionName: string) => {
    setSessions((prev) => [...prev, { id, sessionName }]);
  }, []);

  const applyActiveReassigned = useCallback((newId: string | null) => {
    setActiveSessionId(newId);
  }, []);

  // ---------- Broadcast channel / localStorage fallback ----------
  // NOTE: we only create BC or install storage listener in browser contexts.
  useEffect(() => {
    if (!enableBroadcast) return;
    if (typeof window === "undefined") return; // SSR: skip

    const storageKey = `${broadcastChannelName}:ls`;

    const onRemote = (raw: BroadcastPayload | unknown) => {
      try {
        const msg = raw as BroadcastPayload;
        if (!msg || msg.tabId === TAB_ID) return; // ignore our own messages
        switch (msg.type) {
          case "sessionCreated":
          case "sessionAdded":
            applySessionAdded(msg.id, msg.sessionName);
            break;
          case "sessionDeleted":
            applySessionDeleted(msg.id);
            break;
          case "activeSessionReassigned":
            applyActiveReassigned(msg.newId ?? null);
            break;
          case "allSessionsCleared":
            setSessions([]);
            setActiveSessionId(null);
            break;
          case "sessionCloned":
            applySessionCloned(msg.id, msg.sessionName);
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    // Prefer BroadcastChannel if available
    let bcInstance: BroadcastChannel | null = null;
    const BCConstructor = globalThis.BroadcastChannel as
      | typeof BroadcastChannel
      | undefined;
    if (BCConstructor) {
      try {
        bcInstance = new BCConstructor(broadcastChannelName);
        bcInstance.onmessage = (ev: MessageEvent) => onRemote(ev.data);
      } catch {
        bcInstance = null;
      }
    }

    // fallback to localStorage events if BroadcastChannel unavailable
    const storageHandler = (ev: StorageEvent) => {
      if (ev.key !== storageKey || !ev.newValue) return;
      try {
        const payload = JSON.parse(ev.newValue);
        onRemote(payload);
      } catch {}
    };
    if (!bcInstance) window.addEventListener("storage", storageHandler);

    return () => {
      bcInstance?.close();
      if (!bcInstance) window.removeEventListener("storage", storageHandler);
    };
  }, [
    applySessionAdded,
    applySessionDeleted,
    applyActiveReassigned,
    applySessionCloned,
    enableBroadcast,
    broadcastChannelName,
  ]);

  // Helper: broadcast a payload to other tabs
  const broadcast = useCallback(
    (payload: BroadcastPayload) => {
      if (!enableBroadcast) return;
      if (typeof window === "undefined") return;

      // prefer BroadcastChannel
      const BCConstructor = globalThis.BroadcastChannel as
        | typeof BroadcastChannel
        | undefined;
      if (BCConstructor) {
        try {
          const bc = new BCConstructor(broadcastChannelName);
          bc.postMessage(payload);
          bc.close();
          return;
        } catch {
          // fallthrough to localStorage fallback
        }
      }

      // fallback
      try {
        const storageKey = `${broadcastChannelName}:ls`;
        localStorage.setItem(storageKey, JSON.stringify(payload));
        setTimeout(() => {
          try {
            localStorage.removeItem(storageKey);
          } catch {
            /* ignore */
          }
        }, 500);
      } catch {
        /* ignore */
      }
    },
    [enableBroadcast, broadcastChannelName],
  );

  // ---------- Manager event subscriptions ----------
  useEffect(() => {
    // Event handlers — use lightweight payloads to update UI instead of full refresh
    const onCreated = (id: string, session: ConversationSession) => {
      applySessionAdded(id, session.sessionName);
      setActiveSessionId(manager.getActiveSession());
      // inform other tabs
      broadcast({
        type: "sessionCreated",
        id,
        sessionName: session.sessionName,
        tabId: TAB_ID,
      });
      callbacksRef.current.onSessionCreated?.(id, session);
    };

    const onAdded = (id: string, session: ConversationSession) => {
      applySessionAdded(id, session.sessionName);
      broadcast({
        type: "sessionAdded",
        id,
        sessionName: session.sessionName,
        tabId: TAB_ID,
      });
    };

    const onDeleted = (id: string) => {
      applySessionDeleted(id);
      // if we deleted active, manager.setActiveSession will reassign - we listen for that too
      broadcast({ type: "sessionDeleted", id, tabId: TAB_ID });
      callbacksRef.current.onSessionDeleted?.(id);
    };

    const onActive = (newId: string | null) => {
      applyActiveReassigned(newId);
      broadcast({ type: "activeSessionReassigned", newId, tabId: TAB_ID });
      // console.log("setting active session from"
    };

    const onCleared = () => {
      setSessions([]);
      setActiveSessionId(manager.getActiveSession());
      broadcast({ type: "allSessionsCleared", tabId: TAB_ID });
    };

    const onCloned = (newId: string, clonedSession: ConversationSession) => {
      applySessionCloned(newId, clonedSession.sessionName);
      broadcast({
        type: "sessionCloned",
        id: newId,
        sessionName: clonedSession.sessionName,
        tabId: TAB_ID,
      });
    };

    // subscribe
    manager.on("sessionCreated", onCreated);
    manager.on("sessionAdded", onAdded);
    manager.on("sessionDeleted", onDeleted);
    manager.on("activeSessionReassigned", onActive);
    manager.on("allSessionsCleared", onCleared);
    manager.on("sessionCloned", onCloned);

    // initial sync (best-effort): derive initial sessions from manager (cheapish)
    try {
      const initial = manager.listSessions();
      setSessions(initial);
      setActiveSessionId((prev) => prev ?? manager.getActiveSession() ?? null);
    } catch {
      // ignore
    }

    // cleanup
    return () => {
      manager.off("sessionCreated", onCreated);
      manager.off("sessionAdded", onAdded);
      manager.off("sessionDeleted", onDeleted);
      manager.off("activeSessionReassigned", onActive);
      manager.off("allSessionsCleared", onCleared);
      manager.off("sessionCloned", onCloned);
    };
    // We intentionally do not include `broadcast` in deps to avoid re-subscribing
    // unnecessarily; it is stable because it is memoized by useCallback above.
  }, [
    manager,
    applySessionAdded,
    applySessionDeleted,
    applyActiveReassigned,
    applySessionCloned,
    broadcast,
  ]);

  // ---------- Actions exposed to consumers ----------
  // createSession returns the id
  const createSession = useCallback(
    (sessionName = "New Chat", setActive = true) =>
      manager.createSession(sessionName, setActive),
    [manager],
  );

  const addSession = useCallback(
    (session: ConversationSession) => {
      const added = manager.addSession(session);
      if (added) {
        // manager emits sessionAdded and we will handle it in event handler
      }
      return added;
    },
    [manager],
  );

  const setActive = useCallback(
    (id: string | null) => {
      manager.setActiveSession(id);
    },
    [manager],
  );

  const deleteSession = useCallback(
    (id: string) => manager.deleteSession(id),
    [manager],
  );

  const clearAllSessions = useCallback(
    () => manager.clearAllSessions(),
    [manager],
  );

  const cloneSession = useCallback(
    (id: string, newName = "") => manager.cloneSession(id, newName),
    [manager],
  );

  const getSessionByName = useCallback(
    (name: string) => manager.getSessionByName(name),
    [manager],
  );

  // Memoize return to avoid re-renders when not necessary
  const api = useMemo(
    () => ({
      manager,
      sessions,
      activeSessionId,
      createSession,
      addSession,
      setActiveSession: setActive,
      deleteSession,
      clearAllSessions,
      cloneSession,
      getSessionByName,
    }),
    [
      manager,
      sessions,
      activeSessionId,
      createSession,
      addSession,
      setActive,
      deleteSession,
      clearAllSessions,
      cloneSession,
      getSessionByName,
    ],
  );

  return api;
}
