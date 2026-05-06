import type { Notification } from "../api/notifications";

function isChatRelatedNotification(notification: Notification): boolean {
  return (
    notification.type === "chat_message" ||
    notification.type.startsWith("handshake_")
  );
}

function getRelatedHandshakeId(value: Notification["related_handshake"]): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

export function getChatNotificationReadIds({
  handshakeId,
  explicitNotificationId,
  notifications,
}: {
  handshakeId: string;
  explicitNotificationId?: string | null;
  notifications: Notification[];
}): string[] {
  const ids = new Set<string>();
  if (explicitNotificationId) ids.add(explicitNotificationId);

  for (const notification of notifications) {
    if (notification.is_read) continue;
    if (getRelatedHandshakeId(notification.related_handshake) !== handshakeId) continue;
    if (!isChatRelatedNotification(notification)) continue;
    ids.add(notification.id);
  }

  return Array.from(ids);
}
