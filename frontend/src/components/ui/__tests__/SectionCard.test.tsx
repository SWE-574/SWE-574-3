// @vitest-environment happy-dom
import { ChakraProvider } from '@chakra-ui/react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import system from '@/theme'
import SectionCard from '../SectionCard'
import { FiStar } from 'react-icons/fi'

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>
}

describe('SectionCard', () => {
  it('renders children', () => {
    render(
      <Wrapper>
        <SectionCard>Hello from children</SectionCard>
      </Wrapper>,
    )
    expect(screen.getByText('Hello from children')).toBeInTheDocument()
  })

  it('renders label when provided', () => {
    render(
      <Wrapper>
        <SectionCard label="My Section">Content</SectionCard>
      </Wrapper>,
    )
    expect(screen.getByText('My Section')).toBeInTheDocument()
  })

  it('renders icon slot when provided', () => {
    render(
      <Wrapper>
        <SectionCard label="Stars" icon={<FiStar data-testid="icon-star" />}>Content</SectionCard>
      </Wrapper>,
    )
    expect(screen.getByTestId('icon-star')).toBeInTheDocument()
  })

  it('renders right slot when provided', () => {
    render(
      <Wrapper>
        <SectionCard label="Test" right={<span>Right slot</span>}>Content</SectionCard>
      </Wrapper>,
    )
    expect(screen.getByText('Right slot')).toBeInTheDocument()
  })

  it('does not render header row when no label and no right', () => {
    render(
      <Wrapper>
        <SectionCard>Just content</SectionCard>
      </Wrapper>,
    )
    // Should not have the header flex — no EyebrowLabel rendered
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.getByText('Just content')).toBeInTheDocument()
  })
})
