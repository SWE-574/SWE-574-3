import type { NotificationType, Notification } from '../api/notifications';

/** Maps each notification type to an Ionicons icon name. */
export const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  handshake_request: 'hand-left-outline',
  handshake_accepted: 'checkmark-circle-outline',
  handshake_denied: 'close-circle-outline',
  handshake_cancellation_requested: 'alert-circle-outline',
  handshake_cancellation_rejected: 'close-circle-outline',
  handshake_cancelled: 'ban-outline',
  service_updated: 'refresh-outline',
  chat_message: 'chatbubble-outline',
  service_reminder: 'alarm-outline',
  service_confirmation: 'checkmark-done-outline',
  positive_rep: 'star-outline',
  admin_warning: 'warning-outline',
  dispute_resolved: 'shield-checkmark-outline',
};

/**
 * Navigate to the relevant screen for a notification.
 * Uses nested navigation to cross tab boundaries.
 */
export function navigateToNotificationTarget(
  notification: Notification,
  navigation: { navigate: (screen: string, params?: object) => void },
): void {
  const { type, related_handshake, related_service } = notification;

  // Handshake-related and chat notifications → Chat screen
  if (
    (type.startsWith('handshake_') || type === 'chat_message') &&
    related_handshake
  ) {
    navigation.navigate('Messages', {
      screen: 'Chat',
      params: { handshakeId: related_handshake },
    });
    return;
  }

  // Service-related notifications → ServiceDetail screen
  if (
    (type === 'service_updated' ||
      type === 'service_reminder' ||
      type === 'service_confirmation') &&
    related_service
  ) {
    navigation.navigate('Home', {
      screen: 'ServiceDetail',
      params: { id: related_service },
    });
    return;
  }

  // Reputation with a linked service → ServiceDetail (e.g. "Leave Feedback" for events)
  if (type === 'positive_rep' && related_service) {
    navigation.navigate('Home', {
      screen: 'ServiceDetail',
      params: { id: related_service },
    });
    return;
  }

  // Reputation without a service link → Profile tab
  if (type === 'positive_rep') {
    navigation.navigate('Profile');
    return;
  }

  // admin_warning, dispute_resolved → stay in notification list (no navigation)
}
