import { ConversationManager } from '../src/core/ConversationManager'
import { ConversationSession } from '../src/core/ConversationSession'
import { Message } from '../src/types'

/**
 * Creates a mock ConversationSession with optional initial messages
 */
export function createMockSession(overrides: Partial<{
  id: string
  sessionName: string
  messages: Message[]
  createdAt: number
  lastModifiedAt: number
  systemPrompt: string
  summary: string
  maxTokens: number
  reserveTokens: number
}> = {}) {
  const now = Date.now()
  return new ConversationSession({
    id: overrides.id || `session-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: overrides.createdAt || now,
    lastModifiedAt: overrides.lastModifiedAt || now,
    sessionName: overrides.sessionName || 'Test Session',
    messages: overrides.messages || [],
    systemPrompt: overrides.systemPrompt,
    summary: overrides.summary,
    maxTokens: overrides.maxTokens || 4000,
    reserveTokens: overrides.reserveTokens || 500
  })
}

/**
 * Creates a mock ConversationManager with optional pre-populated sessions
 */
export function createMockManager(sessions: ConversationSession[] = []) {
  const manager = new ConversationManager()

  for (const session of sessions) {
    manager.addSession(session)
  }

  return manager
}

/**
 * Creates a test message
 */
export function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: overrides.id || `msg-${Math.random().toString(36).slice(2, 9)}`,
    role: overrides.role || 'user',
    content: overrides.content || 'Test message',
    timestamp: overrides.timestamp || Date.now(),
    metadata: overrides.metadata
  }
}

/**
 * Creates a user message
 */
export function createUserMessage(content: string, metadata?: Record<string, unknown>): Message {
  return createMessage({ role: 'user', content, metadata })
}

/**
 * Creates an assistant message
 */
export function createAssistantMessage(content: string, metadata?: Record<string, unknown>): Message {
  return createMessage({ role: 'assistant', content, metadata })
}

/**
 * Creates a system message
 */
export function createSystemMessage(content: string, metadata?: Record<string, unknown>): Message {
  return createMessage({ role: 'system', content, metadata })
}

/**
 * Wait for a tick (useful for async event emission)
 */
export function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * Creates multiple messages for testing token windowing
 */
export function createMessageHistory(count: number, baseContent = 'Message'): Message[] {
  return Array.from({ length: count }, (_, i) =>
    createMessage({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `${baseContent} ${i + 1}`,
      timestamp: Date.now() - (count - i) * 1000
    })
  )
}