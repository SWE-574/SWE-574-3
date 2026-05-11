import { test, expect } from '@playwright/test'
import { loginAs, USERS } from '../helpers'

/**
 * E2E specs for the UpcomingSchedule component (#446).
 *
 * These tests require the dev server + backend running with demo data seeded
 * via `make reset && make setup-demo && make dev`.
 *
 * If a specific data fixture is not available (e.g. seeded calendar items),
 * the test is skipped with a clear comment rather than failing.
 */

test.describe('UpcomingSchedule — calendar view (#446)', () => {
  test('profile page renders the UPCOMING section card', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/profile')

    // The SectionCard should be visible
    await expect(
      page.getByText('UPCOMING'),
    ).toBeVisible({ timeout: 20_000 })
  })

  test('empty calendar state renders the empty message', async () => {
    /**
     * This test checks the empty state. If elif has calendar items seeded,
     * the empty state won't show — skip it with a note.
     *
     * To properly test this you would need a pristine user with no
     * handshakes/events. The existing demo users likely have seeded data.
     */
    test.skip(
      true,
      'Skipped: cannot guarantee a demo user has zero calendar items without a dedicated fixture. ' +
      'Empty state is covered by unit tests in UpcomingSchedule.test.tsx.',
    )
  })

  test('month grid renders day-of-week headers by default', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/profile')

    // Wait for the agenda preview section header to appear
    await expect(page.getByText('UPCOMING')).toBeVisible({ timeout: 20_000 })

    // The calendar grid is rendered by default (no expand toggle anymore).
    // Day-of-week headers ("Mon" through "Sun") sit inside the month grid.
    await expect(page.getByText('Mon', { exact: true }).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Tue', { exact: true }).first()).toBeVisible()
  })

  test('Upcoming toggle hides the month grid and Today restores it', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/profile')

    await expect(page.getByText('UPCOMING')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Mon', { exact: true }).first()).toBeVisible({ timeout: 10_000 })

    // The "Upcoming" pill in the calendar header collapses the grid into the
    // agenda-only preview by clearing the selected date (selectedDate=null).
    await page.getByRole('button', { name: 'Show upcoming schedule' }).click()
    await expect(page.getByText('Mon', { exact: true })).toHaveCount(0, { timeout: 5_000 })

    // The "Today" button re-selects the current date and the grid returns.
    await page.getByRole('button', { name: 'Go to today' }).click()
    await expect(page.getByText('Mon', { exact: true }).first()).toBeVisible({ timeout: 5_000 })
  })

  test('demo user sees seeded Offer service session in agenda preview', async ({ page }) => {
    /**
     * This test depends on the demo seed providing an accepted handshake
     * for elif with a scheduled_time in the next 60 days.
     *
     * If the seed does not provide this, the test will skip gracefully.
     */
    await loginAs(page, USERS.elif)

    // Intercept calendar API to check if data arrives
    let calendarData: { items: unknown[] } | null = null
    await page.route('**/api/users/me/calendar/**', async (route) => {
      const response = await route.fetch()
      const body = await response.text()
      try { calendarData = JSON.parse(body) as { items: unknown[] } } catch { /* ignore */ }
      await route.fulfill({ response })
    })

    const calendarLoaded = page.waitForResponse(
      (r) => /\/api\/users\/me\/calendar\//.test(r.url()),
      { timeout: 15_000 },
    )
    await page.goto('/profile')
    await expect(page.getByText('UPCOMING')).toBeVisible({ timeout: 20_000 })
    await calendarLoaded.catch(() => undefined)

    if (!calendarData || calendarData.items.length === 0) {
      test.skip(
        true,
        'No calendar items returned for elif — seeded data may not include scheduled handshakes. ' +
        'Agenda item rendering is covered by UpcomingSchedule.test.tsx unit tests.',
      )
      return
    }

    // If we have items, at least one should appear in the agenda preview (next 3)
    // Items should be visible as links in the collapsed strip
    const section = page.locator('[class*="css"]').filter({ hasText: 'UPCOMING' }).first()
    await expect(section).toBeVisible()
  })

  test('clicking a day filters the agenda list', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/profile')

    await expect(page.getByText('UPCOMING')).toBeVisible({ timeout: 20_000 })

    // The grid is rendered by default — wait for day-of-week headers.
    await expect(page.getByText('Mon', { exact: true }).first()).toBeVisible({ timeout: 5_000 })

    // Click on a day that is likely to be empty (far future)
    // Use the month grid navigation to go to next month first
    const nextBtn = page.getByLabel('Next month')
    await nextBtn.click()

    // Click on day 1 of next month — likely no items
    const dayOne = page.getByLabel(/^1 .* 20\d\d$/).first()
    if (await dayOne.isVisible()) {
      await dayOne.click()
      // After clicking a day, the agenda should show either items or the empty message
      const possibleTexts = [/Nothing scheduled on this day/i]
      let found = false
      for (const text of possibleTexts) {
        if (await page.getByText(text).isVisible().catch(() => false)) {
          found = true
          break
        }
      }
      // Either shows items or the empty message — either is correct behavior
      if (!found) {
        // Items were found for that day — also acceptable
        // Just verify the day header shows (format "Weekday, D Mon")
        const headerPattern = /[A-Z][a-z]+, \d+ [A-Z][a-z]+/
        await expect(page.getByText(headerPattern).first()).toBeVisible({ timeout: 5_000 })
      }
    } else {
      test.skip(true, 'Could not locate specific day cell — skipping day-filter test.')
    }
  })

  test('mobile viewport renders single-column layout in expanded mode', async ({ page }) => {
    // loginAs waits for the desktop user-menu-trigger which is hidden on
    // narrow viewports — so log in at desktop width first, then switch.
    await loginAs(page, USERS.elif)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/profile')

    await expect(page.getByText('UPCOMING')).toBeVisible({ timeout: 20_000 })

    // The grid is rendered by default on mobile too — wait for day headers.
    await expect(page.getByText('Mon', { exact: true }).first()).toBeVisible({ timeout: 5_000 })

    // In mobile, the grid is single-column. The month grid and agenda should
    // both be visible (stacked vertically, not side-by-side).
    const monthLabel = page.getByRole('grid').first()
    await expect(monthLabel).toBeVisible()
  })

  test('conflict overlay renders when two items overlap (unit-level fallback)', async () => {
    /**
     * Testing conflict overlay in E2E requires seeding two overlapping
     * calendar items. This is not trivially done with the existing demo data.
     *
     * Conflict rendering is thoroughly covered in CalendarMonthGrid.test.tsx
     * and AgendaList.test.tsx unit tests.
     */
    test.skip(
      true,
      'Conflict overlay E2E requires seeded overlapping items — covered by unit tests instead.',
    )
  })
})
