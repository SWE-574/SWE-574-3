import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChakraProvider } from '@chakra-ui/react'
import { MemoryRouter } from 'react-router-dom'
import NotFoundPage from '../../pages/NotFoundPage'
import system from '../../theme'

describe('NotFoundPage', () => {
  it('renders without crashing', () => {
    render(
      <ChakraProvider value={system}>
        <MemoryRouter>
          <NotFoundPage />
        </MemoryRouter>
      </ChakraProvider>,
    )
    expect(screen.getByRole('heading')).toBeTruthy()
  })

  it('displays a recognisable not-found heading', () => {
    render(
      <ChakraProvider value={system}>
        <MemoryRouter>
          <NotFoundPage />
        </MemoryRouter>
      </ChakraProvider>,
    )
    expect(screen.getByRole('heading').textContent).toBeTruthy()
  })
})
