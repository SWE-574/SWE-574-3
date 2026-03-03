import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import NotFoundPage from '@/pages/NotFoundPage'

describe('NotFoundPage', () => {
  it('renders without crashing', () => {
    render(<NotFoundPage />)
    expect(screen.getByRole('heading')).toBeInTheDocument()
  })

  it('displays a recognisable not-found heading', () => {
    render(<NotFoundPage />)
    expect(screen.getByRole('heading').textContent).toBeTruthy()
  })
})
