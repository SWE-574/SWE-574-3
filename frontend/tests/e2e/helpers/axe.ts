import { AxeBuilder } from '@axe-core/playwright'
import type { Page, TestInfo } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Accessibility helpers — built on `@axe-core/playwright`.
 *
 * Use `expectNoCriticalA11y(page)` after the page has rendered the area
 * you care about. The default ruleset is WCAG 2.1 A + AA. We allow
 * configurable ignore lists for known third-party violations (e.g. embedded
 * Mapbox controls).
 *
 * Tag tests with `@a11y` so the dedicated nightly job can target them:
 *
 *     test('@a11y dashboard has no critical violations', async ({ page }) => {
 *       await page.goto('/dashboard')
 *       await expectNoCriticalA11y(page)
 *     })
 */

const DEFAULT_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

export type A11yOptions = {
  /** Restrict scan to a CSS selector (e.g. `'main'`). Defaults to whole page. */
  selector?: string
  /** Axe rule IDs to skip. Use sparingly and document why in the test. */
  disableRules?: string[]
  /** Override the WCAG tag set. */
  tags?: string[]
  /** Where to attach the violations report when assertions fail. */
  attachToTestInfo?: TestInfo
}

export async function expectNoCriticalA11y(page: Page, options: A11yOptions = {}) {
  const builder = new AxeBuilder({ page })
    .withTags(options.tags ?? DEFAULT_TAGS)

  if (options.selector) {
    builder.include(options.selector)
  }
  if (options.disableRules?.length) {
    builder.disableRules(options.disableRules)
  }

  const result = await builder.analyze()
  const critical = result.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  )

  if (options.attachToTestInfo && critical.length > 0) {
    await options.attachToTestInfo.attach('axe-violations.json', {
      body: JSON.stringify(critical, null, 2),
      contentType: 'application/json',
    })
  }

  expect(
    critical,
    `Found ${critical.length} critical/serious a11y violations:\n${critical
      .map((v) => `- ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
      .join('\n')}`,
  ).toEqual([])
}

/**
 * Looser variant: only fails on `critical` impact. Useful when adopting
 * axe to a noisy page incrementally — gate on critical first, fix
 * serious afterwards.
 */
export async function expectNoBlockingA11y(page: Page, options: A11yOptions = {}) {
  const builder = new AxeBuilder({ page })
    .withTags(options.tags ?? DEFAULT_TAGS)
  if (options.selector) builder.include(options.selector)
  if (options.disableRules?.length) builder.disableRules(options.disableRules)

  const result = await builder.analyze()
  const blocking = result.violations.filter((v) => v.impact === 'critical')
  expect(blocking, `Critical a11y violations: ${blocking.map((v) => v.id).join(', ')}`).toEqual([])
}
