import { ChakraProvider } from '@chakra-ui/react'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RequireVerifiedEmail from '@/components/RequireVerifiedEmail'
import system from '@/theme'

/* ─── Mocks ──────────────────────────────────────────────────────────── */

type FakeUser = { id: string; email: string; is_verified?: boolean } | null

const { useAuthStoreMock, sendVerificationMock, toastSuccessMock, toastErrorMock } =
  vi.hoisted(() => ({
    useAuthStoreMock: vi.fn(),
    sendVerificationMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }))

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: (s: { user: FakeUser }) => unknown) =>
    selector(useAuthStoreMock()),
}))

vi.mock('@/services/authAPI', () => ({
  authAPI: { sendVerification: sendVerificationMock },
}))

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}))

function setUser(user: FakeUser) {
  useAuthStoreMock.mockReturnValue({ user })
}

function renderGuard() {
  return render(
    <ChakraProvider value={system}>
      <MemoryRouter>
        <RequireVerifiedEmail actionLabel="post an Offer">
          <div data-testid="protected-child">offer form</div>
        </RequireVerifiedEmail>
      </MemoryRouter>
    </ChakraProvider>,
  )
}

/* ─── Tests ──────────────────────────────────────────────────────────── */

describe('RequireVerifiedEmail', () => {
  beforeEach(() => {
    sendVerificationMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    useAuthStoreMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders children for verified users', () => {
    setUser({ id: 'u1', email: 'verified@example.com', is_verified: true })

    renderGuard()

    expect(screen.getByTestId('protected-child')).toBeInTheDocument()
    expect(screen.queryByTestId('require-verified-email')).not.toBeInTheDocument()
  })

  it('renders children when verification status is unknown (loading)', () => {
    // is_verified undefined → defer to backend, do not block prematurely.
    setUser({ id: 'u1', email: 'loading@example.com' })

    renderGuard()

    expect(screen.getByTestId('protected-child')).toBeInTheDocument()
  })

  it('blocks unverified users with the verification-required message', () => {
    setUser({ id: 'u1', email: 'unverified@example.com', is_verified: false })

    renderGuard()

    expect(screen.getByTestId('require-verified-email')).toBeInTheDocument()
    expect(screen.getByText(/Verify your email to post an Offer/i)).toBeInTheDocument()
    expect(screen.getByText('unverified@example.com')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-child')).not.toBeInTheDocument()
  })

  it('resends the verification email and shows a confirmation state', async () => {
    setUser({ id: 'u1', email: 'unverified@example.com', is_verified: false })
    sendVerificationMock.mockResolvedValue({ data: { detail: 'sent' } })

    renderGuard()

    const button = screen.getByTestId('resend-verification-button')
    await userEvent.click(button)

    await waitFor(() => {
      expect(sendVerificationMock).toHaveBeenCalledTimes(1)
    })
    expect(toastSuccessMock).toHaveBeenCalled()
    expect(await screen.findByText(/Email sent/i)).toBeInTheDocument()
  })

  it('shows an error toast when resend fails', async () => {
    setUser({ id: 'u1', email: 'unverified@example.com', is_verified: false })
    sendVerificationMock.mockRejectedValue(new Error('network'))

    renderGuard()

    await userEvent.click(screen.getByTestId('resend-verification-button'))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled()
    })
    // After failure the button should be enabled again (not stuck in "Sending…")
    expect(screen.getByTestId('resend-verification-button')).toBeEnabled()
  })
})
