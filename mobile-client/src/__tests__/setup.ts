import '@testing-library/jest-native/extend-expect'

// Expo modules that touch the native bridge — stub them so component tests
// can render without an Expo runtime. Each test file can override individual
// methods via jest.mock.

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        apiUrl: 'http://localhost:8000/api',
        mapboxToken: 'pk.test',
      },
    },
  },
}))

jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[test]' }),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}))

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))

jest.mock('expo-location', () => ({
  __esModule: true,
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: { latitude: 41.0082, longitude: 28.9784 },
  }),
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
}))
