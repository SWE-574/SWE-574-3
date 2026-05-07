import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import QuickFilters from '../QuickFilters'

describe('QuickFilters', () => {
  it('renders one pill per item', () => {
    const { getByText } = render(
      <QuickFilters
        items={[
          { id: 'all', label: 'All', icon: 'grid', onPress: () => undefined },
          { id: 'offers', label: 'Offers', icon: 'gift', onPress: () => undefined },
          { id: 'needs', label: 'Needs', icon: 'help-circle', onPress: () => undefined },
        ]}
      />,
    )
    expect(getByText('All')).toBeTruthy()
    expect(getByText('Offers')).toBeTruthy()
    expect(getByText('Needs')).toBeTruthy()
  })

  it('fires the onPress callback for the tapped pill only', () => {
    const onAll = jest.fn()
    const onOffers = jest.fn()
    const { getByText } = render(
      <QuickFilters
        items={[
          { id: 'all', label: 'All', icon: 'grid', onPress: onAll },
          { id: 'offers', label: 'Offers', icon: 'gift', onPress: onOffers },
        ]}
      />,
    )
    fireEvent.press(getByText('Offers'))
    expect(onOffers).toHaveBeenCalledTimes(1)
    expect(onAll).not.toHaveBeenCalled()
  })

  it('renders nothing when items is empty', () => {
    const { queryByText } = render(<QuickFilters items={[]} />)
    expect(queryByText('All')).toBeNull()
  })
})
