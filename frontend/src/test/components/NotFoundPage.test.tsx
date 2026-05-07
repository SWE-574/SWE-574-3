import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChakraProvider } from '@chakra-ui/react'
import { MemoryRouter } from 'react-router-dom'
import NotFoundPage from '../../pages/NotFoundPage'
import system from '../../theme'

function renderPage() {
  return render(
    <ChakraProvider value={system}>
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    </ChakraProvider>,
  )
}

describe('NotFoundPage', () => {
  it('shows the 404 status and recognisable heading', () => {
    renderPage()
    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByText(/Page Not Found/i)).toBeInTheDocument()
  })

  it('sets the document title so browser tabs are not blank', () => {
    renderPage()
    expect(document.title).toMatch(/404/)
    expect(document.title).toMatch(/Page Not Found/i)
  })

  it('renders navigation back to the home and services pages', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /go to home/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /browse services/i })).toBeInTheDocument()
  })
})
