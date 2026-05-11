import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EventRosterPanel } from '@/components/EventRosterModal'
import type { Service } from '@/types'
import system from '@/theme'

const { toastErrorMock, generateQRTokenMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  generateQRTokenMock: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: vi.fn(), info: vi.fn() },
}))

vi.mock('@/services/serviceAPI', () => ({
  serviceAPI: { generateQRToken: generateQRTokenMock },
}))

function buildService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'svc-event-1',
    title: 'Saturday meetup',
    description: '',
    type: 'Event',
    status: 'Active',
    requires_qr_checkin: true,
    schedule_type: 'One-Time',
    duration: 1,
    max_participants: 10,
    user: { id: 'organizer-1', first_name: 'O', last_name: 'O' },
    ...overrides,
  } as unknown as Service
}

function renderPanel(service: Service) {
  return render(
    <ChakraProvider value={system}>
      <EventRosterPanel
        service={service}
        handshakes={[]}
        onComplete={vi.fn()}
        onMarkAttended={vi.fn()}
        completing={false}
      />
    </ChakraProvider>,
  )
}

describe('EventRosterPanel — QR generation error feedback', () => {
  beforeEach(() => {
    toastErrorMock.mockClear()
    generateQRTokenMock.mockReset()
  })

  it('surfaces the lockdown-window error via toast.error when generation fails', async () => {
    // Backend rejects QR generation outside the 24h lockdown window with a
    // ValueError that the DRF exception handler renders as a 400 carrying
    // {detail: '...'}. The FE used to swallow this in a silent catch and
    // leave the user without any feedback.
    const lockdownDetail = 'QR token can only be generated within 24 hours of the event start.'
    generateQRTokenMock.mockRejectedValueOnce({
      response: { data: { detail: lockdownDetail } },
    })

    renderPanel(buildService())
    const trigger = await screen.findByRole('button', { name: /show attendance qr/i })
    await userEvent.click(trigger)

    await waitFor(() => {
      expect(generateQRTokenMock).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(lockdownDetail)
    })
  })

  it('falls back to a generic toast message when the error has no detail', async () => {
    // Network blip / non-DRF-shape error: the toast still fires so the
    // user knows the click did something.
    generateQRTokenMock.mockRejectedValueOnce(new Error('boom'))

    renderPanel(buildService())
    await userEvent.click(await screen.findByRole('button', { name: /show attendance qr/i }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledTimes(1)
    })
    // Either the Error message or the generic fallback is acceptable, both
    // satisfy the contract "user sees feedback".
    const arg = toastErrorMock.mock.calls[0][0]
    expect(typeof arg).toBe('string')
    expect((arg as string).length).toBeGreaterThan(0)
  })
})
