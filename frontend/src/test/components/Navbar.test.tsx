import { ChakraProvider } from '@chakra-ui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import Navbar from '@/components/Navbar'
import system from '@/theme'

const { navigateMock, logoutMock, startTourMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  logoutMock: vi.fn(),
  startTourMock: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({
    user: {
      id: 'u-1',
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      timebank_balance: 0,
      role: 'user',
      is_admin: false,
    },
    isAuthenticated: true,
    logout: logoutMock,
  }),
}))

vi.mock('@/store/useTourStore', () => ({
  useTourStore: (selector: (s: { startTour: () => void }) => unknown) =>
    selector({ startTour: startTourMock }),
}))

vi.mock('@/components/NotificationDropdown', () => ({
  NotificationDropdown: () => null,
}))

function renderNavbar() {
  render(
    <ChakraProvider value={system}>
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    </ChakraProvider>,
  )
}

describe('Navbar logout', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('awaits logout before navigating from the desktop user menu', async () => {
    let resolveLogout: () => void = () => {}
    logoutMock.mockImplementation(
      () => new Promise<void>((resolve) => { resolveLogout = resolve }),
    )

    renderNavbar()
    fireEvent.click(screen.getByTestId('user-menu-trigger'))
    fireEvent.click(await screen.findByText('Log Out'))

    // logout() is in flight; navigation MUST NOT have happened yet.
    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(navigateMock).not.toHaveBeenCalled()

    resolveLogout()
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true })
    })
    expect(navigateMock).toHaveBeenCalledTimes(1)
  })

  it('navigates to /login with replace once logout resolves', async () => {
    logoutMock.mockResolvedValue(undefined)

    renderNavbar()
    fireEvent.click(screen.getByTestId('user-menu-trigger'))
    fireEvent.click(await screen.findByText('Log Out'))

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true })
    })
  })

  it('awaits logout from the mobile drawer before navigating', async () => {
    let resolveLogout: () => void = () => {}
    logoutMock.mockImplementation(
      () => new Promise<void>((resolve) => { resolveLogout = resolve }),
    )

    renderNavbar()
    fireEvent.click(screen.getByLabelText('Open menu'))
    fireEvent.click(await screen.findByText('Log Out'))

    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(navigateMock).not.toHaveBeenCalled()

    resolveLogout()
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true })
    })
  })
})
