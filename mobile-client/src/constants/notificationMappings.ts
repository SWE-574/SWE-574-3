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
  user_followed: 'person-add-outline',
};

/**
 * Navigate to the relevant screen for a notification.
 * Uses nested navigation to cross tab boundaries.
 */
export function navigateToNotificationTarget(
  notification: Notification,
  navigation: { navigate: (screen: string, params?: object) => void },
): void {
  const { type, related_handshake, related_service, related_service_type, related_user } = notification;

  // New follower → follower's public profile
  if (type === 'user_followed' && related_user) {
    navigation.navigate('Home', {
      screen: 'PublicProfile',
      params: { userId: related_user },
    });
    return;
  }

  // Event notifications → ServiceDetail (even if related_handshake is present)
  if (related_service_type === 'Event' && related_service) {
    navigation.navigate('Home', {
      screen: 'ServiceDetail',
      params: { id: related_service },
    });
    return;
  }

  // Handshake-related and chat notifications → Chat screen.
  // service_confirmation also lands here when related_service is absent
  // (i.e. only a handshake link is available) so the user can confirm
  // completion directly from the conversation.
  if (
    (type.startsWith('handshake_') || type === 'chat_message' || type === 'service_confirmation') &&
    related_handshake
  ) {
    navigation.navigate('Messages', {
      screen: 'Chat',
      params: { handshakeId: related_handshake, notificationId: notification.id },
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
