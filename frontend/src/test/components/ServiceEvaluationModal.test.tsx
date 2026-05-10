import { ChakraProvider } from '@chakra-ui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ServiceEvaluationModal from '@/components/ServiceEvaluationModal'
import system from '@/theme'

/**
 * NFR-14d — when a photo upload fails after the evaluation itself has
 * persisted, the modal must close with a non-blocking warning toast
 * (instead of stranding the user with a generic error and an open modal
 * that no longer needs their attention). These tests pin both the
 * generic-failure and the file-too-large (413) paths.
 */

const { submitCombinedMock, attachReviewImagesMock, toastSuccessMock, toastErrorMock } =
  vi.hoisted(() => ({
    submitCombinedMock: vi.fn(),
    attachReviewImagesMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }))

vi.mock('@/services/reputationAPI', () => ({
  reputationAPI: {
    submitCombined: submitCombinedMock,
    submitCombinedEvent: vi.fn(),
    attachReviewImages: attachReviewImagesMock,
  },
}))

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}))

function renderModal(props: Partial<React.ComponentProps<typeof ServiceEvaluationModal>> = {}) {
  const onClose = props.onClose ?? vi.fn()
  const onSubmitted = props.onSubmitted ?? vi.fn()
  const utils = render(
    <ChakraProvider value={system}>
      <ServiceEvaluationModal
        isOpen
        onClose={onClose}
        onSubmitted={onSubmitted}
        handshakeId="hs-1"
        counterpartName="Cem"
        {...props}
      />
    </ChakraProvider>,
  )
  return { ...utils, onClose, onSubmitted }
}

function attachOneImage(): void {
  // The modal renders an <input type="file"> hidden behind the "Add photos"
  // button. Drive it directly via fireEvent so we don't need user-event's
  // pointer simulation.
  const input = document.querySelector('input[type="file"]') as HTMLInputElement | null
  expect(input).not.toBeNull()
  const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
  fireEvent.change(input!, { target: { files: [file] } })
}

function selectFirstPositiveTrait(): void {
  // Trait toggles are buttons with their label text. "Punctual" is the
  // first positive service trait and is always rendered.
  fireEvent.click(screen.getByRole('button', { name: /Punctual/i }))
}

async function clickSubmit(): Promise<void> {
  const submit = await screen.findByRole('button', { name: /submit evaluation/i })
  fireEvent.click(submit)
}

describe('ServiceEvaluationModal — photo upload failure (NFR-14d)', () => {
  beforeEach(() => {
    submitCombinedMock.mockReset().mockResolvedValue(undefined)
    attachReviewImagesMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('closes the modal with a non-blocking warning when the upload fails generically', async () => {
    attachReviewImagesMock.mockRejectedValue(new Error('network'))
    const { onClose, onSubmitted } = renderModal()

    selectFirstPositiveTrait()
    attachOneImage()
    await clickSubmit()

    await waitFor(() => {
      expect(submitCombinedMock).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(attachReviewImagesMock).toHaveBeenCalledTimes(1)
    })

    // The warning toast must explicitly say the evaluation persisted so
    // the user knows the trait/comment they typed is not lost.
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled()
    })
    const errorMsg = toastErrorMock.mock.calls.at(-1)?.[0] as string
    expect(errorMsg).toMatch(/your evaluation was saved/i)

    // The success path still fires (close + onSubmitted) — that's the
    // behavioural contract NFR-14d asserts.
    expect(toastSuccessMock).toHaveBeenCalled()
    expect(onSubmitted).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('uses the file-too-large copy when the upload returns 413', async () => {
    attachReviewImagesMock.mockRejectedValue({ response: { status: 413 } })
    const { onClose } = renderModal()

    selectFirstPositiveTrait()
    attachOneImage()
    await clickSubmit()

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled()
    })
    const errorMsg = toastErrorMock.mock.calls.at(-1)?.[0] as string
    expect(errorMsg).toMatch(/files are too large/i)
    expect(errorMsg).toMatch(/your evaluation was saved without photos/i)

    // Close path still runs — same NFR-14d contract.
    expect(onClose).toHaveBeenCalled()
  })

  it('does not call attachReviewImages when no images are attached', async () => {
    const { onSubmitted, onClose } = renderModal()

    selectFirstPositiveTrait()
    await clickSubmit()

    await waitFor(() => {
      expect(submitCombinedMock).toHaveBeenCalledTimes(1)
    })
    expect(attachReviewImagesMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).toHaveBeenCalled()
    expect(onSubmitted).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
