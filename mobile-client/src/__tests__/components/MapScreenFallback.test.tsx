/**
 * Issue #453b: when the Mapbox token is missing or the HTML asset fails to
 * load, the map screen used to render an empty WebView — a featureless,
 * unexplained surface. Now it renders a labelled placeholder with a Retry CTA.
 */

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'

// Mock the env module BEFORE importing the screen so getMapboxToken() returns
// undefined for the no-token test path.
jest.mock('../../constants/env', () => ({
  getMapboxToken: jest.fn(() => undefined),
  getApiUrl: () => 'http://localhost/api',
  normalizeRuntimeUrl: (v: string | null | undefined) => v,
}))

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    canGoBack: () => false,
    goBack: jest.fn(),
    navigate: jest.fn(),
  }),
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons')
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('expo-asset', () => ({
  Asset: { fromModule: () => ({ downloadAsync: jest.fn(), localUri: '' }) },
}))

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    text: jest.fn().mockResolvedValue('<html></html>'),
  })),
}))

jest.mock('expo-location', () => ({
  __esModule: true,
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 0 },
}))

jest.mock('react-native-webview', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: React.forwardRef(({ testID }: { testID?: string }, _ref: unknown) =>
      React.createElement(View, { testID: testID ?? 'mocked-webview' }),
    ),
  }
})

jest.mock('@react-native-community/slider', () => 'Slider')

jest.mock('../../api/services', () => ({
  listServices: jest.fn().mockResolvedValue({ results: [] }),
}))

import MapScreen from '../../presentation/screens/MapScreen'
import * as env from '../../constants/env'

describe('MapScreen fallback', () => {
  beforeEach(() => {
    ;(env.getMapboxToken as jest.Mock).mockReset()
  })

  it('shows the unavailable placeholder when no Mapbox token is configured', () => {
    ;(env.getMapboxToken as jest.Mock).mockReturnValue(undefined)
    const { getByText, getByLabelText, queryByTestId } = render(<MapScreen />)
    expect(getByText('Map unavailable')).toBeTruthy()
    expect(getByLabelText('Retry loading the map')).toBeTruthy()
    // The WebView itself should not be on screen in the placeholder branch.
    expect(queryByTestId('mocked-webview')).toBeNull()
  })

  it('exposes a retry CTA the user can tap', () => {
    ;(env.getMapboxToken as jest.Mock).mockReturnValue(undefined)
    const { getByLabelText } = render(<MapScreen />)
    const retry = getByLabelText('Retry loading the map')
    // No throw on press: the handler is wired and idempotent — re-running
    // the fallback branch is safe because the token is still missing.
    fireEvent.press(retry)
    expect(getByLabelText('Retry loading the map')).toBeTruthy()
  })
})
