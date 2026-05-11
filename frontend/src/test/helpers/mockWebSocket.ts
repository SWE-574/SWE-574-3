import { vi } from 'vitest'

type CloseInit = { code?: number; reason?: string }

export class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  static instances: MockWebSocket[] = []
  static last(): MockWebSocket {
    const i = MockWebSocket.instances[MockWebSocket.instances.length - 1]
    if (!i) throw new Error('MockWebSocket: no instance has been created yet')
    return i
  }

  url: string
  readyState = MockWebSocket.CONNECTING
  sent: string[] = []
  closed: { code: number; reason?: string } | null = null

  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose: ((ev: { code: number; reason?: string }) => void) | null = null
  onerror: ((ev: Event) => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close(code = 1000, reason?: string) {
    if (this.readyState === MockWebSocket.CLOSED) return
    this.readyState = MockWebSocket.CLOSED
    this.closed = { code, reason }
    this.onclose?.({ code, reason })
  }

  triggerOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  triggerMessage(data: unknown) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data)
    this.onmessage?.({ data: payload })
  }

  triggerClose({ code = 1006, reason }: CloseInit = {}) {
    if (this.readyState === MockWebSocket.CLOSED) return
    this.readyState = MockWebSocket.CLOSED
    this.closed = { code, reason }
    this.onclose?.({ code, reason })
  }

  triggerError() {
    this.onerror?.(new Event('error'))
  }
}

export function installMockWebSocket() {
  MockWebSocket.instances = []
  const ctor = vi.fn(function (this: unknown, url: string) {
    return new MockWebSocket(url)
  })
  ;(ctor as unknown as { OPEN: number }).OPEN = MockWebSocket.OPEN
  ;(ctor as unknown as { CLOSED: number }).CLOSED = MockWebSocket.CLOSED
  const original = globalThis.WebSocket
  ;(globalThis as unknown as { WebSocket: unknown }).WebSocket = ctor
  return () => {
    ;(globalThis as unknown as { WebSocket: unknown }).WebSocket = original
    MockWebSocket.instances = []
  }
}
