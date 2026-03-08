import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, '../../..', relativePath), 'utf-8')
}

describe('Event chat detail modal routing', () => {
  it('ServiceDetailPage no longer routes event chat into the global messages view', () => {
    const src = readSource('src/pages/ServiceDetailPage.tsx')

    expect(src).not.toContain('/messages?group=${service.id}')
    expect(src.match(/openEventDetailModal\('chat'\)/g)?.length ?? 0).toBeGreaterThan(0)
  })
})