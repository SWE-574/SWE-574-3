import { ChakraProvider } from '@chakra-ui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TagChipsRow from '@/components/TagChipsRow'
import system from '@/theme'

const { getChipsMock } = vi.hoisted(() => ({
  getChipsMock: vi.fn(),
}))

vi.mock('@/services/featuredAPI', () => ({
  featuredAPI: { getChips: getChipsMock },
}))

function renderRow(props: Parameters<typeof TagChipsRow>[0]) {
  render(
    <ChakraProvider value={system}>
      <TagChipsRow {...props} />
    </ChakraProvider>,
  )
}

describe('TagChipsRow', () => {
  beforeEach(() => {
    getChipsMock.mockReset()
  })
  afterEach(() => vi.clearAllMocks())

  it('renders the All chip immediately', async () => {
    getChipsMock.mockResolvedValue({ chips: [] })
    renderRow({ activeQid: null, onSelect: vi.fn() })
    await waitFor(() => expect(getChipsMock).toHaveBeenCalled())
    expect(screen.getByText('All')).toBeInTheDocument()
  })

  it('renders chip labels from the endpoint', async () => {
    getChipsMock.mockResolvedValue({
      chips: [
        { qid: 'Q1', label: 'Cooking', count: 4 },
        { qid: 'Q2', label: 'Photography', count: 2 },
      ],
    })
    renderRow({ activeQid: null, onSelect: vi.fn() })
    await waitFor(() => expect(screen.getByText('Cooking')).toBeInTheDocument())
    expect(screen.getByText('Photography')).toBeInTheDocument()
  })

  it('calls onSelect with the qid on click and null on All', async () => {
    getChipsMock.mockResolvedValue({
      chips: [{ qid: 'Q1', label: 'Cooking', count: 1 }],
    })
    const onSelect = vi.fn()
    renderRow({ activeQid: null, onSelect })
    await waitFor(() => expect(screen.getByText('Cooking')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Cooking'))
    expect(onSelect).toHaveBeenLastCalledWith('Q1')
    fireEvent.click(screen.getByText('All'))
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })
})
