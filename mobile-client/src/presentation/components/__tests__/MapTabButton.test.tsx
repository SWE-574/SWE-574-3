import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import MapTabButton from '../MapTabButton'

// React Navigation's BottomTabBarButtonProps requires `children` (the icon
// slot), so satisfy the contract with an empty fragment for the test.
const baseProps = {
  href: '/map',
  testID: 'map-tab-button',
  children: null,
} as const

describe('MapTabButton', () => {
  it('renders the Map label and stays clickable when not focused', () => {
    const onPress = jest.fn()
    const { getByText } = render(
      <MapTabButton
        {...baseProps}
        onPress={onPress}
        accessibilityState={{ selected: false }}
        accessibilityLabel="Map tab"
      />,
    )
    fireEvent.press(getByText('Map'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('renders the Map label when focused', () => {
    const { getByText } = render(
      <MapTabButton
        {...baseProps}
        accessibilityState={{ selected: true }}
        accessibilityLabel="Map tab"
        onPress={() => undefined}
      />,
    )
    expect(getByText('Map')).toBeTruthy()
  })
})
