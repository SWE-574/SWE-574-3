/**
 * Regression tests for frontend performance constants.
 *
 * These tests verify that polling intervals and performance-related
 * constants remain at their intended values. If someone changes them,
 * these tests will catch the regression.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, '../../..', relativePath), 'utf-8')
}

describe('Polling constants', () => {
  it('ChatPage: MSG_POLL_MS should be >= 30 seconds', () => {
    const src = readSource('src/pages/ChatPage.tsx')
    const match = src.match(/const MSG_POLL_MS\s*=\s*(\d[\d_]*)/)
    expect(match).not.toBeNull()
    const value = Number(match![1].replace(/_/g, ''))
    expect(value).toBeGreaterThanOrEqual(30_000)
  })

  it('ChatPage: CONV_POLL_MS should be >= 30 seconds', () => {
    const src = readSource('src/pages/ChatPage.tsx')
    const match = src.match(/const CONV_POLL_MS\s*=\s*(\d[\d_]*)/)
    expect(match).not.toBeNull()
    const value = Number(match![1].replace(/_/g, ''))
    expect(value).toBeGreaterThanOrEqual(30_000)
  })

  it('DashboardPage: POLL_INTERVAL should be >= 60 seconds', () => {
    const src = readSource('src/pages/DashboardPage.tsx')
    const match = src.match(/const POLL_INTERVAL\s*=\s*(\d[\d_]*)/)
    expect(match).not.toBeNull()
    const value = Number(match![1].replace(/_/g, ''))
    expect(value).toBeGreaterThanOrEqual(60_000)
  })
})

describe('Image lazy loading', () => {
  it('DashboardPage: card images use loading="lazy"', () => {
    const src = readSource('src/pages/DashboardPage.tsx')
    // All <img> tags in the Dashboard card area should have loading="lazy"
    const imgTags = src.match(/<img\s[^>]*>/g) || []
    const withoutLazy = imgTags.filter(
      (tag) => !tag.includes('loading="lazy"') && !tag.includes("loading='lazy'"),
    )
    expect(withoutLazy).toHaveLength(0)
  })

  it('ServiceDetailPage: gallery images use loading="lazy"', () => {
    const src = readSource('src/pages/ServiceDetailPage.tsx')
    const imgTags = src.match(/<img\s[^>]*>/g) || []
    // The main lightbox image doesn't need lazy (it's always visible),
    // but gallery thumbnails and cover images should be lazy
    const lazyCount = imgTags.filter((tag) => tag.includes('loading="lazy"')).length
    expect(lazyCount).toBeGreaterThanOrEqual(3)
  })
})

describe('AdminDashboard constants', () => {
  it('AVATAR_PALETTE is defined at module scope (not inside a function)', () => {
    const src = readSource('src/pages/AdminDashboard.tsx')
    const lines = src.split('\n')
    const constLine = lines.findIndex((l) => l.includes('const AVATAR_PALETTE'))
    expect(constLine).toBeGreaterThanOrEqual(0)
    // Module scope means it's not deeply indented (less than 4 spaces / 1 tab)
    const indent = lines[constLine].match(/^(\s*)/)?.[1].length ?? 0
    expect(indent).toBe(0)
  })
})
