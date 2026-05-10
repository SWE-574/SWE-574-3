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

describe('ServiceForm submit feedback', () => {
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

  it('runs the success path when the minimum valid fields are filled', async () => {
    serviceCreateMock.mockResolvedValueOnce({ id: 'svc-123' })

    const { container } = render(
      <Wrapper>
        <ServiceForm type="Need" />
      </Wrapper>,
    )

    const titleInput = container.querySelector('input[name="title"]') as HTMLInputElement
    const descriptionInput = container.querySelector('textarea[name="description"]') as HTMLTextAreaElement
    const durationInput = container.querySelector('input[name="duration"]') as HTMLInputElement

    fireEvent.change(titleInput, { target: { value: 'Need help moving boxes' } })
    fireEvent.change(descriptionInput, { target: { value: 'A short description that satisfies the 10-char minimum.' } })
    fireEvent.change(durationInput, { target: { value: '1' } })

    // Default location_type is 'In-Person', which requires a Mapbox-confirmed
    // address. Switch to 'Online' to bypass that branch and let the submit
    // proceed straight to serviceAPI.create.
    fireEvent.click(screen.getByRole('button', { name: 'Online' }))

    fireEvent.click(screen.getByRole('button', { name: /Post Need/i }))

    await waitFor(() => {
      expect(serviceCreateMock).toHaveBeenCalledTimes(1)
    })

    // The success flow runs after create resolves: success toast and navigate
    // to the new service's detail page.
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('Need posted successfully!')
    })
    expect(navigateMock).toHaveBeenCalledWith('/service-detail/svc-123')
    expect(toastErrorMock).not.toHaveBeenCalled()
  })
})
