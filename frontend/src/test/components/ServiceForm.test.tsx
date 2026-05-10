/**
 * Tests for ServiceForm submit-rejection feedback.
 *
 * The form previously dropped zod validation failures on the floor — the
 * submit button stayed responsive but onSubmit never ran, leaving users (and
 * E2E specs) staring at an unchanged screen. The onInvalid handler ensures a
 * toast surfaces and the offending field receives focus.
 */

// @vitest-environment happy-dom

import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import system from '@/theme'
import ServiceForm from '@/components/ServiceForm'

const { toastErrorMock, toastSuccessMock, navigateMock, serviceUpdateMock, serviceCreateMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  navigateMock: vi.fn(),
  serviceUpdateMock: vi.fn(),
  serviceCreateMock: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('@/services/serviceAPI', () => ({
  serviceAPI: {
    update: serviceUpdateMock,
    create: serviceCreateMock,
  },
}))

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({
    user: { id: 'user-1', timebank_balance: 10 },
    refreshUser: vi.fn(),
    updateUserOptimistically: vi.fn(),
  }),
}))

vi.mock('@/components/WikidataTagAutocomplete', () => ({
  default: () => <div data-testid="wikidata-autocomplete" />,
}))

vi.mock('@/components/LocationPickerMap', () => ({
  LocationPickerMap: () => <div data-testid="location-picker-map" />,
}))

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>
}

describe('ServiceForm onInvalid handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('toasts a clear message when zod rejects on submit', async () => {
    render(
      <Wrapper>
        <ServiceForm type="Need" />
      </Wrapper>,
    )

    // Title is empty (required min 3 chars). Submitting must surface a visible
    // error rather than no-op.
    const submitBtn = screen.getByRole('button', { name: /Post Need/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Please check the highlighted fields and try again.',
      )
    })

    // The mocked serviceAPI.create must NOT have been invoked — the submit
    // handler short-circuited at the validation step.
    expect(serviceCreateMock).not.toHaveBeenCalled()
  })
})
