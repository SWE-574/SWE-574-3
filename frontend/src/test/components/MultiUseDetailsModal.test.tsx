import { ChakraProvider } from '@chakra-ui/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MultiUseDetailsModal from '@/components/MultiUseDetailsModal'
import system from '@/theme'

/**
 * State coverage for the modal that backs follow lists, attendee rosters,
 * and event member lists. Three branches: loading spinner, empty placeholder,
 * populated rows.
 */

function renderModal(props: Partial<Parameters<typeof MultiUseDetailsModal>[0]> = {}) {
  return render(
    <ChakraProvider value={system}>
      <MultiUseDetailsModal
        isOpen
        title="Followers"
        items={[]}
        onClose={vi.fn()}
        {...props}
      />
    </ChakraProvider>,
  )
}

describe('MultiUseDetailsModal — observable states', () => {
  it('shows the loading spinner while data is in flight', () => {
    renderModal({ loading: true })
    expect(document.querySelector('.chakra-spinner, [class*="Spinner"]')).toBeTruthy()
  })

  it('renders the empty message when items resolve to an empty list', () => {
    renderModal({ loading: false, emptyMessage: 'No followers yet.' })
    expect(screen.getByText('No followers yet.')).toBeInTheDocument()
  })

  it('falls back to a default empty message when none is supplied', () => {
    renderModal({ loading: false })
    expect(screen.getByText(/nothing to show/i)).toBeInTheDocument()
  })

  it('renders one row per item when populated', () => {
    renderModal({
      loading: false,
      items: [
        { id: 'u-1', title: 'Elif Demir' },
        { id: 'u-2', title: 'Cem Yilmaz' },
      ],
    })
    expect(screen.getByText('Elif Demir')).toBeInTheDocument()
    expect(screen.getByText('Cem Yilmaz')).toBeInTheDocument()
  })
})
