import React from 'react'
import { render } from '@testing-library/react-native'
import NotificationBadge from '../NotificationBadge'

describe('NotificationBadge', () => {
  it('renders the count when positive', () => {
    const { getByText } = render(<NotificationBadge count={3} />)
    expect(getByText('3')).toBeTruthy()
  })

  it('renders 9+ when count exceeds 9', () => {
    const { getByText } = render(<NotificationBadge count={42} />)
    expect(getByText('9+')).toBeTruthy()
  })

  it('renders nothing when count is zero', () => {
    const { queryByText } = render(<NotificationBadge count={0} />)
    expect(queryByText('0')).toBeNull()
  })

  it('renders nothing for negative counts (defensive)', () => {
    const { toJSON } = render(<NotificationBadge count={-1} />)
    expect(toJSON()).toBeNull()
  })
})
