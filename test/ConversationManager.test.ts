import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConversationManager } from '../src/core/ConversationManager'
import { ConversationSession } from '../src/core/ConversationSession'
import { createMockSession, createMockManager, tick, createMessage } from './utils'

// jest provides these globals automatically
const { describe, it, expect, beforeEach } = globalThis

describe('ConversationManager', () => {
  let manager: ConversationManager

  beforeEach(() => {
    manager = new ConversationManager()
  })

  describe('Session Creation', () => {
    it('creates a new session with a unique ID', () => {
      const id = manager.createSession('Test Chat')
      expect(id).toBeDefined()
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    })

    it('creates session with provided name', () => {
      const id = manager.createSession('My Session')
      const session = manager.getSession(id)
      expect(session?.sessionName).toBe('My Session')
    })

    it('sets new session as active by default', () => {
      const id = manager.createSession('Active Session')
      expect(manager.getActiveSession()).toBe(id)
    })

    it('does not set as active when setActive is false', () => {
      const firstId = manager.createSession('First')
      const secondId = manager.createSession('Second', false)
      expect(manager.getActiveSession()).toBe(firstId)
      expect(manager.getActiveSession()).not.toBe(secondId)
    })

    it('emits sessionCreated event', () => {
      const onCreated = vi.fn()
      manager.on('sessionCreated', onCreated)

      const id = manager.createSession('Test')

      expect(onCreated).toHaveBeenCalledOnce()
      expect(onCreated).toHaveBeenCalledWith(id, expect.any(ConversationSession))
    })
  })

  describe('Session Retrieval', () => {
    it('gets session by ID', () => {
      const id = manager.createSession('Test')
      const session = manager.getSession(id)
      expect(session).toBeInstanceOf(ConversationSession)
      expect(session?.id).toBe(id)
    })

    it('returns null for non-existent session', () => {
      const session = manager.getSession('non-existent')
      expect(session).toBeNull()
    })

    it('finds session by name', () => {
      const id = manager.createSession('Named Session')
      const session = manager.getSessionByName('Named Session')
      expect(session?.id).toBe(id)
    })

    it('returns null when name not found', () => {
      const session = manager.getSessionByName('Not Found')
      expect(session).toBeNull()
    })

    it('checks if session exists', () => {
      const id = manager.createSession('Test')
      expect(manager.hasSession(id)).toBe(true)
      expect(manager.hasSession('fake')).toBe(false)
    })
  })

  describe('Active Session Management', () => {
    it('sets active session by ID', () => {
      const id1 = manager.createSession('First')
      const id2 = manager.createSession('Second')

      const previous = manager.setActiveSession(id1)

      expect(manager.getActiveSession()).toBe(id1)
      expect(previous).toBe(id2)
    })

    it('clears active session when set to null', () => {
      manager.createSession('Test')
      expect(manager.getActiveSession()).not.toBeNull()

      const previous = manager.setActiveSession(null)
      expect(manager.getActiveSession()).toBeNull()
      expect(previous).not.toBeNull()
    })

    it('emits activeSessionReassigned event', () => {
      const onReassign = vi.fn()
      manager.on('activeSessionReassigned', onReassign)

      const id = manager.createSession('Test')
      manager.setActiveSession(null)

      expect(onReassign).toHaveBeenCalledWith(null, id)
    })
  })

  describe('Session Deletion', () => {
    it('deletes session by ID', () => {
      const id = manager.createSession('Test')
      const result = manager.deleteSession(id)

      expect(result).toBe(true)
      expect(manager.hasSession(id)).toBe(false)
    })

    it('returns false for non-existent session', () => {
      const result = manager.deleteSession('fake')
      expect(result).toBe(false)
    })

    it('emits sessionDeleted event', () => {
      const onDeleted = vi.fn()
      manager.on('sessionDeleted', onDeleted)

      const id = manager.createSession('Test')
      manager.deleteSession(id)

      expect(onDeleted).toHaveBeenCalledWith(id)
    })

    it('reassigns active session when deleted session was active', () => {
      const id1 = manager.createSession('First')
      const id2 = manager.createSession('Second')
      manager.setActiveSession(id2)

      manager.deleteSession(id2)

      expect(manager.getActiveSession()).toBe(id1)
    })

    it('clears active session when last session deleted', () => {
      const id = manager.createSession('Only')
      manager.deleteSession(id)

      expect(manager.getActiveSession()).toBeNull()
    })
  })

  describe('Session Listing', () => {
    it('lists all sessions with ID and name', () => {
      manager.createSession('First')
      manager.createSession('Second')
      manager.createSession('Third')

      const list = manager.listSessions()

      expect(list).toHaveLength(3)
      expect(list.map(s => s.sessionName).sort()).toEqual(['First', 'Second', 'Third'])
    })

    it('returns empty array when no sessions', () => {
      const list = manager.listSessions()
      expect(list).toEqual([])
    })
  })

  describe('Session Cloning', () => {
    it('clones a session with new ID', () => {
      const id = manager.createSession('Original')
      const original = manager.getSession(id)!
      original.addMessage(createMessage({ role: 'user', content: 'Hello' }))

      const cloneId = manager.cloneSession(id, 'Cloned')
      expect(cloneId).not.toBeNull()
      const clone = manager.getSession(cloneId!)
      expect(clone).not.toBeNull()
      expect(clone?.id).not.toBe(id)
      expect(clone?.sessionName).toBe('Cloned')
      expect(clone?.messages).toHaveLength(1)
    })

    it('returns null when cloning non-existent session', () => {
      const cloneId = manager.cloneSession('fake')
      expect(cloneId).toBeNull()
    })

    it('emits sessionCloned event', () => {
      const onCloned = vi.fn()
      manager.on('sessionCloned', onCloned)

      const id = manager.createSession('Test')
      const cloneId = manager.cloneSession(id)

      expect(onCloned).toHaveBeenCalledWith(cloneId, expect.any(ConversationSession))
    })
  })

  describe('Adding External Sessions', () => {
    it('adds an existing session', () => {
      const session = createMockSession({ id: 'external-id', sessionName: 'External' })
      const result = manager.addSession(session)

      expect(result).toBe(true)
      expect(manager.getSession('external-id')).toBe(session)
    })

    it('does not overwrite existing session', () => {
      const session1 = createMockSession({ id: 'same-id', sessionName: 'First' })
      const session2 = createMockSession({ id: 'same-id', sessionName: 'Second' })

      manager.addSession(session1)
      const result = manager.addSession(session2)

      expect(result).toBe(false)
      expect(manager.getSession('same-id')?.sessionName).toBe('First')
    })

    it('emits sessionAdded event', () => {
      const onAdded = vi.fn()
      manager.on('sessionAdded', onAdded)

      const session = createMockSession({ id: 'external', sessionName: 'External' })
      manager.addSession(session)

      expect(onAdded).toHaveBeenCalledWith('external', session)
    })
  })

  describe('Clearing All Sessions', () => {
    it('clears all sessions', () => {
      manager.createSession('First')
      manager.createSession('Second')
      manager.createSession('Third')

      manager.clearAllSessions()

      expect(manager.listSessions()).toHaveLength(0)
      expect(manager.getActiveSession()).toBeNull()
    })

    it('emits allSessionsCleared event', () => {
      const onCleared = vi.fn()
      manager.on('allSessionsCleared', onCleared)

      manager.createSession('Test')
      manager.clearAllSessions()

      expect(onCleared).toHaveBeenCalledOnce()
    })
  })

  describe('Finding Sessions by Time', () => {
    it('gets latest modified session', () => {
      const id1 = manager.createSession('First')
      const id2 = manager.createSession('Second')
      const id3 = manager.createSession('Third')

      const session2 = manager.getSession(id2)!
      session2.addMessage(createMessage({ role: 'user', content: 'Update' }))

      expect(manager.getLatestSession()?.id).toBe(id2)
    })

    it('gets oldest session by creation time', () => {
      const id1 = manager.createSession('First')
      tick()
      const id2 = manager.createSession('Second')
      tick()
      manager.createSession('Third')

      expect(manager.getOldestSession()?.id).toBe(id1)
    })

    it('returns null when no sessions', () => {
      expect(manager.getLatestSession()).toBeNull()
      expect(manager.getOldestSession()).toBeNull()
    })
  })
})