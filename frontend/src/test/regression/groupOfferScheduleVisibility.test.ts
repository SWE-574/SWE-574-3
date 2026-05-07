/// <reference types="node" />

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, '../../..', relativePath), 'utf-8')
}

describe('group offer schedule visibility', () => {
  it('DashboardPage shows fixed group offer dates on browse cards', () => {
    const src = readSource('src/pages/DashboardPage.tsx')

    expect(src).toContain('isFixedGroupOffer')
    expect(src).toContain('isFixedGroupOffer && service.scheduled_time')
    expect(src).toContain('formatGroupOfferDateTime(service.scheduled_time)')
  })

  it('ServiceDetailPage shows fixed group offer dates inside the existing schedule tile', () => {
    const src = readSource('src/pages/ServiceDetailPage.tsx')
    const dateLabelCount = (src.match(/formatGroupOfferDateTime\(service\.scheduled_time\)/g) ?? []).length

    expect(src).toContain('isFixedGroupOffer')
    expect(src).toContain('label="Schedule"')
    expect(dateLabelCount).toBeGreaterThanOrEqual(1)
  })
})
