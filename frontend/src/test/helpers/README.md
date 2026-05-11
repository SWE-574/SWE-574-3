# Test helpers

Shared utilities for vitest specs. Keep them tiny and dependency-free.

## `mockWebSocket.ts`

Replaces the global `WebSocket` constructor with a controllable double. Use for any hook or component that opens a socket.

```ts
import { installMockWebSocket, MockWebSocket } from '@/test/helpers/mockWebSocket'

let restore: () => void
beforeEach(() => { restore = installMockWebSocket() })
afterEach(() => { restore() })

it('parses chat_message frames', () => {
  renderHook(() => useWebSocket({ url: 'ws://x/', onMessage }))
  const ws = MockWebSocket.last()
  ws.triggerOpen()
  ws.triggerMessage({ type: 'chat_message', message: { id: 1 } })
  expect(onMessage).toHaveBeenCalledWith({ id: 1 })
})
```

`MockWebSocket.last()` returns the most recently constructed instance — useful when the hook opens a socket on mount. `MockWebSocket.instances` is the full list.

## `renderHook` pattern

Hooks live in `src/hooks/`. Tests go in `src/test/hooks/`. Use `@testing-library/react`'s `renderHook` and wrap any state-mutating call in `act`:

```ts
import { renderHook, act } from '@testing-library/react'

const { result, rerender, unmount } = renderHook(
  ({ url }) => useWebSocket({ url }),
  { initialProps: { url: 'ws://a/' } },
)
act(() => MockWebSocket.last().triggerOpen())
expect(result.current.isConnected).toBe(true)
```

## Fake timers for backoff / polling

Reconnect backoff and `usePolling` intervals need fake timers:

```ts
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

await act(async () => { vi.advanceTimersByTime(1000) })
```

Always pair `useFakeTimers` with `useRealTimers` in `afterEach` — leaking fake timers into other specs causes hard-to-debug hangs.

## API mocks

For hooks that hit `@/services/...`, mock the service module directly with `vi.hoisted` + `vi.mock` (see `src/test/services/userAPI.test.ts`). Don't go through axios.
