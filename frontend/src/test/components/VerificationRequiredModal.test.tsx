import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VerificationRequiredModal from '@/components/VerificationRequiredModal'
import system from '@/theme'

const { sendVerificationMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  sendVerificationMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('@/services/authAPI', () => ({
  authAPI: { sendVerification: sendVerificationMock },
}))

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}))

function renderModal(props: Partial<React.ComponentProps<typeof VerificationRequiredModal>> = {}) {
  const defaultOnClose = vi.fn()
  const utils = render(
    <ChakraProvider value={system}>
      <VerificationRequiredModal
        isOpen
        onClose={defaultOnClose}
        actionLabel="request this service"
        email="user@example.com"
        {...props}
      />
    </ChakraProvider>,
  )
  return { ...utils, onClose: props.onClose ?? defaultOnClose }
}

describe('VerificationRequiredModal', () => {
  beforeEach(() => {
    sendVerificationMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('does not render when closed', () => {
    render(
      <ChakraProvider value={system}>
        <VerificationRequiredModal
          isOpen={false}
          onClose={vi.fn()}
          actionLabel="request this service"
        />
      </ChakraProvider>,
    )

    expect(screen.queryByTestId('verification-required-modal')).not.toBeInTheDocument()
  })

  it('shows the action-specific heading and target email', () => {
    renderModal()

    expect(screen.getByText(/Verify your email to request this service/i)).toBeInTheDocument()
    expect(screen.getByText('user@example.com')).toBeInTheDocument()
  })

  it('calls onClose when the cancel button is clicked', async () => {
    const onClose = vi.fn()
    renderModal({ onClose })

    await userEvent.click(screen.getByTestId('verification-required-cancel'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the close (X) button is clicked', async () => {
    const onClose = vi.fn()
    renderModal({ onClose })

    await userEvent.click(screen.getByTestId('verification-required-close'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('resends verification email and shows confirmation', async () => {
    sendVerificationMock.mockResolvedValue({ data: { detail: 'sent' } })
    renderModal()

    await userEvent.click(screen.getByTestId('verification-required-resend'))

    await waitFor(() => {
      expect(sendVerificationMock).toHaveBeenCalledTimes(1)
    })
    expect(toastSuccessMock).toHaveBeenCalled()
    expect(await screen.findByText(/Email sent/i)).toBeInTheDocument()
  })

  it('shows an error toast when resend fails', async () => {
    sendVerificationMock.mockRejectedValue(new Error('network'))
    renderModal()

    await userEvent.click(screen.getByTestId('verification-required-resend'))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled()
    })
    expect(screen.getByTestId('verification-required-resend')).toBeEnabled()
  })
})
