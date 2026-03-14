/**
 * Test helpers: mock fetch and assert request shape.
 */

export function mockFetchResolve<T>(data: T): void {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    headers: new Headers({ "content-type": "application/json" }),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

export function mockFetchReject(message: string, status = 400): void {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    text: () => Promise.resolve(JSON.stringify({ detail: message })),
  });
}

export function getLastFetchCall(): { url: string; init: RequestInit } {
  const calls = (global.fetch as jest.Mock).mock.calls;
  const last = calls[calls.length - 1];
  return { url: last[0], init: last[1] };
}

export function getLastFetchBody(): unknown {
  const { init } = getLastFetchCall();
  const body = init?.body;
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
