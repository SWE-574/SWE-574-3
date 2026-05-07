import React from 'react'
import { render } from '@testing-library/react-native'
import ProfileListingStatsRow from '../ProfileListingStatsRow'

describe('ProfileListingStatsRow', () => {
  it('renders all three counters', () => {
    const { getByText } = render(
      <ProfileListingStatsRow offersCount={5} needsCount={2} exchangesCount={11} />,
    )
    expect(getByText('Offers')).toBeTruthy()
    expect(getByText('Needs')).toBeTruthy()
    expect(getByText('Exchanges')).toBeTruthy()
    expect(getByText('5')).toBeTruthy()
    expect(getByText('2')).toBeTruthy()
    expect(getByText('11')).toBeTruthy()
  })

  it('renders zeros without crashing', () => {
    const { getAllByText } = render(
      <ProfileListingStatsRow offersCount={0} needsCount={0} exchangesCount={0} />,
    )
    expect(getAllByText('0')).toHaveLength(3)
  })
})
