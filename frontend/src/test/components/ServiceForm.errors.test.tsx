import { ChakraProvider } from '@chakra-ui/react'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ServiceForm from '@/components/ServiceForm'
import system from '@/theme'

/**
 * Regression spec for issue #456 — service creation forms reset their
 * state and bury per-field validation errors in a toast when the API
 * returns a 400. This spec drives the public component, intercepts
 * `serviceAPI.create`, and asserts that:
 *
 *   1. The user's title / description text is still in the inputs
 *      after a 400 round trip (no reset on the error path).
 *   2. The server's per-field messages render inline next to the
 *      offending input rather than being squashed into a banner.
 *
 * Heavy DOM deps (Mapbox GL, Wikidata autocomplete) are stubbed so the
 * test can run in jsdom without network access.
 */

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))

vi.mock('@/services/serviceAPI', () => ({
  serviceAPI: {
    create: createMock,
    update: vi.fn(),
  },
}))

vi.mock('@/components/WikidataTagAutocomplete', () => ({
  default: () => null,
}))

vi.mock('@/components/LocationPickerMap', () => ({
  LocationPickerMap: () => null,
}))

vi.mock('@/store/useAuthStore', () => {
  const fakeUser = { id: 'u-1', timebank_balance: '20.0' }
  const store = {
    user: fakeUser,
    refreshUser: vi.fn(),
    updateUserOptimistically: vi.fn(),
  }
  type Selector<T> = (s: typeof store) => T
  const useAuthStore = (<T,>(selector?: Selector<T>) =>
    selector ? selector(store) : store) as unknown as {
      <T>(selector: Selector<T>): T
      (): typeof store
    }
  return { useAuthStore }
})

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function renderForm() {
  return render(
    <ChakraProvider value={system}>
      <MemoryRouter>
        <ServiceForm type="Offer" />
      </MemoryRouter>
    </ChakraProvider>,
  )
}

describe('ServiceForm — error handling', () => {
  beforeEach(() => {
    createMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('preserves user input and renders inline field errors when the API returns a 400', async () => {
    const user = userEvent.setup()
    createMock.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          detail: 'Invalid input.',
          field_errors: {
            title: ['A service with that title already exists.'],
            duration: ['Time credit must be a whole number.'],
          },
        },
      },
    })

    renderForm()

    const titleInput = screen.getByPlaceholderText(/Guitar lessons for beginners/i) as HTMLInputElement
    const descriptionInput = screen.getByPlaceholderText(/Describe what you're offering/i) as HTMLTextAreaElement
    const durationInput = screen.getByPlaceholderText('e.g. 1') as HTMLInputElement

    await user.type(titleInput, 'My very own title')
    await user.type(descriptionInput, 'A long enough description for the form to accept.')
    await user.clear(durationInput)
    await user.type(durationInput, '2')

    // Switch to Online so we don't have to drive the map picker.
    const onlineToggle = screen.getByText('Online')
    await user.click(onlineToggle)

    const submit = screen.getByRole('button', { name: /Post Offer/i })
    await user.click(submit)

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(1)
    })

    // Server-side messages are pinned to the right inputs.
    await screen.findByText('A service with that title already exists.')
    await screen.findByText('Time credit must be a whole number.')

    // Form values are intact — nothing was wiped on the error branch.
    expect(titleInput.value).toBe('My very own title')
    expect(descriptionInput.value).toBe('A long enough description for the form to accept.')
    expect(durationInput.value).toBe('2')
  })
})
