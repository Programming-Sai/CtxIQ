import { beforeEach, vi } from 'vitest'

// Mock crypto.randomUUID for consistent test IDs
let uuidCounter = 0
beforeEach(() => {
  uuidCounter = 0
  vi.stubGlobal('crypto', {
    randomUUID: () => `test-uuid-${++uuidCounter}`
  })
})