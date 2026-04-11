import { useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useAuth } from '../context/AuthContext';
import { useNotificationStore } from '../store/useNotificationStore';
import { registerPushToken, deregisterPushToken } from '../api/notifications';
import { navigateToNotificationTarget } from '../constants/notificationMappings';

// Configure how notifications are presented when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const PROJECT_ID =
  Constants.expoConfig?.extra?.eas?.projectId ??
  'fe44c03c-a9d1-48aa-ac32-06115f5cab21';

export function usePushNotifications(
  navigationRef?: { navigate: (screen: string, params?: object) => void },
) {
  const { isAuthenticated } = useAuth();
  const tokenRef = useRef<string | null>(null);
  const notificationListenerRef = useRef<Notifications.Subscription | null>(null);
  const responseListenerRef = useRef<Notifications.Subscription | null>(null);

  const registerForPushNotifications = useCallback(async () => {
    if (!Device.isDevice) {
      // Push notifications only work on physical devices
      return null;
    }

    // Set up Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2D5C4E',
      });
    }

    // Check / request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return null;
    }

    // Get Expo push token
    const pushToken = await Notifications.getExpoPushTokenAsync({
      projectId: PROJECT_ID,
    });

    return pushToken.data;
  }, []);

  // Register on login, deregister on logout
  useEffect(() => {
    if (!isAuthenticated) {
      // Deregister token on logout
      if (tokenRef.current) {
        deregisterPushToken(tokenRef.current).catch(() => {});
        tokenRef.current = null;
      }
      return;
    }

    let cancelled = false;

    (async () => {
      const token = await registerForPushNotifications();
      if (cancelled || !token) return;

      tokenRef.current = token;
      try {
        await registerPushToken(token);
      } catch {
        // Token registration failed — will retry on next app launch
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, registerForPushNotifications]);

  // Listen for incoming notifications (app in foreground)
  useEffect(() => {
    if (!isAuthenticated) return;

    notificationListenerRef.current =
      Notifications.addNotificationReceivedListener(() => {
        // Sync unread count when a push arrives while app is open
        useNotificationStore.getState().fetchUnreadCount();
      });

    return () => {
      notificationListenerRef.current?.remove();
    };
  }, [isAuthenticated]);

  // Listen for notification taps (user interacted with a notification)
  useEffect(() => {
    if (!isAuthenticated) return;

    responseListenerRef.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        if (!data?.type || !navigationRef) return;

        useNotificationStore.getState().fetchUnreadCount();

        // Navigate to the relevant screen
        navigateToNotificationTarget(
          {
            id: data.notification_id as string,
            type: data.type as any,
            title: '',
            message: '',
            is_read: false,
            related_handshake: (data.related_handshake as string) ?? null,
            related_service: (data.related_service as string) ?? null,
            created_at: '',
          },
          navigationRef,
        );
      });

    return () => {
      responseListenerRef.current?.remove();
    };
  }, [isAuthenticated, navigationRef]);

  /** Call this on logout to deregister the token from the backend. */
  const deregister = useCallback(async () => {
    if (tokenRef.current) {
      try {
        await deregisterPushToken(tokenRef.current);
      } catch {
        // best effort
      }
      tokenRef.current = null;
    }
  }, []);

  return { deregister };
}
