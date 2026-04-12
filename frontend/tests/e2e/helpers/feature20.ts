import { expect, type Page } from '@playwright/test'

/** Join an Event via the join-event API endpoint. Returns the new handshake id. */
export async function joinEventViaApi(page: Page, serviceId: string): Promise<string> {
  const result = await page.evaluate(async (serviceId) => {
    const response = await fetch(`/api/handshakes/services/${serviceId}/join-event/`, {
      method: 'POST',
      credentials: 'include',
    })
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
    }
  }, serviceId)

  expect(result.ok, `join-event failed: ${result.status} ${result.body}`).toBeTruthy()
  const data = JSON.parse(result.body) as { id: string }
  return data.id
}
