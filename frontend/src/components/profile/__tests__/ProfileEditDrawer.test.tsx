// @vitest-environment happy-dom
import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import system from '@/theme'
import ProfileEditDrawer from '../ProfileEditDrawer'
import type { User, BadgeProgress } from '@/types'

// ── Mock modules ─────────────────────────────────────────────────────────────

const { updateMeMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  updateMeMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('@/services/userAPI', () => ({
  userAPI: {
    updateMe: updateMeMock,
  },
  dataURLtoBlob: vi.fn(),
}))

vi.mock('@/services/tagAPI', () => ({
  tagAPI: {
    ensureInDb: vi.fn((tag: { id: string }) => Promise.resolve(tag)),
  },
}))

vi.mock('@/services/api', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Unknown error'),
}))

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock('@/components/ImageCropModal', () => ({
  default: () => null,
}))

vi.mock('@/components/WikidataTagAutocomplete', () => ({
  default: () => <div data-testid="wikidata-autocomplete" />,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

// ── Test helpers ──────────────────────────────────────────────────────────────

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>
}

const baseUser: User = {
  id: 'user-1',
  email: 'alice@example.com',
  first_name: 'Alice',
  last_name: 'Smith',
  role: 'member',
  bio: 'Hello world',
  location: 'Istanbul',
  featured_badges: [],
  featured_badges_detail: [],
  skills: [],
  show_history: false,
}

const noBadges: BadgeProgress[] = []

function renderDrawer(isOpen = true, overrides?: Partial<User>) {
  const user: User = { ...baseUser, ...overrides }
  const onClose = vi.fn()
  const onSaved = vi.fn()

  render(
    <Wrapper>
      <ProfileEditDrawer
        isOpen={isOpen}
        onClose={onClose}
        user={user}
        badgeProgress={noBadges}
        onSaved={onSaved}
      />
    </Wrapper>,
  )

  return { onClose, onSaved }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProfileEditDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not show drawer content when isOpen=false', () => {
    render(
      <Wrapper>
        <ProfileEditDrawer
          isOpen={false}
          onClose={vi.fn()}
          user={baseUser}
          badgeProgress={noBadges}
          onSaved={vi.fn()}
        />
      </Wrapper>,
    )
    // With Chakra v3 Drawer.Root the portal content is not rendered when open=false
    expect(screen.queryByText('Edit profile')).toBeNull()
  })

  it('opens with user first name pre-filled', () => {
    renderDrawer()
    const input = screen.getByLabelText('First name') as HTMLInputElement
    expect(input.value).toBe('Alice')
  })

  it('opens with user bio pre-filled', () => {
    renderDrawer()
    const textarea = screen.getByLabelText('Bio') as HTMLTextAreaElement
    expect(textarea.value).toBe('Hello world')
  })

  it('save button is disabled when form is not dirty', () => {
    renderDrawer()
    const btnEl = screen.getByTestId('save-changes-btn')
    expect(btnEl.getAttribute('aria-disabled')).toBe('true')
  })

  it('save button becomes enabled when first name is changed', async () => {
    renderDrawer()
    const input = screen.getByLabelText('First name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Bob' } })
    const btnEl = screen.getByTestId('save-changes-btn')
    expect(btnEl.getAttribute('aria-disabled')).toBe('false')
  })

  it('PATCH sends changed fields and calls onSaved on success', async () => {
    const onSaved = vi.fn()
    const updatedUser = { ...baseUser, first_name: 'NewFirstName' }
    updateMeMock.mockResolvedValueOnce(updatedUser)

    render(
      <Wrapper>
        <ProfileEditDrawer
          isOpen
          onClose={vi.fn()}
          user={baseUser}
          badgeProgress={noBadges}
          onSaved={onSaved}
        />
      </Wrapper>,
    )

    const input = screen.getByLabelText('First name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'NewFirstName' } })

    const saveBtn = screen.getByTestId('save-changes-btn')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(updateMeMock).toHaveBeenCalledTimes(1)
      expect(onSaved).toHaveBeenCalledWith(updatedUser)
      expect(toastSuccessMock).toHaveBeenCalledWith('Profile updated')
    })

    // IMPORTANT 3: Assert diff — only changed fields are in the FormData payload
    const formData = updateMeMock.mock.calls[0][0] as FormData
    expect(formData).toBeInstanceOf(FormData)
    const entries = Object.fromEntries(formData.entries())
    expect(entries.first_name).toBe('NewFirstName')  // changed field present
    expect(entries.last_name).toBeUndefined()         // unchanged → not in diff
    expect(entries.bio).toBeUndefined()               // unchanged → not in diff
    expect(entries.location).toBeUndefined()          // unchanged → not in diff
  })

  it('shows discard confirmation when closing with unsaved changes', async () => {
    renderDrawer()
    const input = screen.getByLabelText('First name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Changed' } })

    // Click the X close button
    const closeBtn = screen.getByLabelText('Close')
    fireEvent.click(closeBtn)

    // Dialog renders via Portal — use waitFor
    await waitFor(() => {
      expect(screen.getByText('Discard changes?')).toBeInTheDocument()
    })
  })

  it('does not show discard dialog when closing without changes', async () => {
    const { onClose } = renderDrawer()
    const closeBtn = screen.getByLabelText('Close')
    fireEvent.click(closeBtn)

    await waitFor(() => {
      expect(screen.queryByText('Discard changes?')).toBeNull()
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('ESC key on dirty drawer shows discard dialog exactly once (regression for double-fire)', async () => {
    renderDrawer()

    // Make the form dirty
    const input = screen.getByLabelText('First name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Changed' } })

    // Press ESC from inside the focused modal field so the event bubbles through Dialog.Content.
    input.focus()
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' })

    // Dialog appears once
    await waitFor(() => {
      const dialogs = screen.getAllByText('Discard changes?')
      expect(dialogs).toHaveLength(1)
    })

    // onClose should NOT have been called yet (guarded by discard dialog)
  })

  it('surfaces featured_badges backend validation error', async () => {
    const axiosError = {
      response: {
        data: {
          featured_badges: ['Badge not earned by this user.'],
        },
      },
    }
    updateMeMock.mockRejectedValueOnce(axiosError)

    render(
      <Wrapper>
        <ProfileEditDrawer
          isOpen
          onClose={vi.fn()}
          user={baseUser}
          badgeProgress={noBadges}
          onSaved={vi.fn()}
        />
      </Wrapper>,
    )

    const input = screen.getByLabelText('First name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Changed' } })

    const saveBtn = screen.getByTestId('save-changes-btn')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(screen.getByText('Badge not earned by this user.')).toBeInTheDocument()
    })
  })
})
