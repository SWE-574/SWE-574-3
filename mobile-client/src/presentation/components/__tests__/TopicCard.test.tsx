import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import TopicCard from '../TopicCard'

const baseTopic = {
  id: 'topic-1',
  title: 'Where do I find the bee swarm next month?',
  body: 'Looking for nearby beekeepers who can host a small colony in March.',
  category_name: 'Hosting',
  category_id: 'cat-1',
  category_color: '#22c55e',
  author_name: 'Elif Demir',
  author_avatar_url: null,
  is_pinned: false,
  is_locked: false,
  reply_count: 4,
  view_count: 27,
  created_at: '2026-04-30T10:00:00Z',
  last_activity: '2026-05-01T10:00:00Z',
}

describe('TopicCard', () => {
  it('renders the title, excerpt, author and counts', () => {
    const { getByText } = render(
      <TopicCard topic={baseTopic as never} onPress={() => undefined} />,
    )
    expect(getByText(baseTopic.title)).toBeTruthy()
    expect(getByText(baseTopic.body)).toBeTruthy()
    expect(getByText('Elif Demir')).toBeTruthy()
    expect(getByText('4')).toBeTruthy()
    expect(getByText('27')).toBeTruthy()
  })

  it('shows pinned and locked badges when set', () => {
    const { getByText } = render(
      <TopicCard
        topic={{ ...baseTopic, is_pinned: true, is_locked: true } as never}
        onPress={() => undefined}
      />,
    )
    expect(getByText('Pinned')).toBeTruthy()
    expect(getByText('Locked')).toBeTruthy()
  })

  it('falls back to initials when there is no avatar URL', () => {
    const { getByText } = render(
      <TopicCard topic={baseTopic as never} onPress={() => undefined} />,
    )
    expect(getByText('ED')).toBeTruthy()
  })

  it('fires onPress when the card is tapped', () => {
    const onPress = jest.fn()
    const { getByText } = render(
      <TopicCard topic={baseTopic as never} onPress={onPress} />,
    )
    fireEvent.press(getByText(baseTopic.title))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
