# Push Notifications — Backend Guide

This document explains how the backend sends push notifications to the mobile client and what data must be included in each message so the app can navigate to the correct screen when the user taps the notification.

---

## How It Works

```
Backend (Django)
  └─ create_notification()        ← persist + broadcast
       ├─ WebSocket (real-time, app in foreground)
       └─ _send_push_notification()  ← Expo Push API (background / killed)
```

1. Call `create_notification()` (in `api/utils.py`) whenever you need to notify a user.
2. The function persists the `Notification` row, then — after the DB transaction commits — broadcasts over WebSocket **and** sends a push message through the [Expo Push API](https://docs.expo.dev/push-notifications/sending-notifications/).
3. The push message carries a `data` payload that the mobile app reads to decide which screen to open.

---

## Sending a Notification

### `create_notification()` signature

```python
# api/utils.py
def create_notification(
    user: User,
    notification_type: str,   # one of the NOTIFICATION_TYPE_CHOICES below
    title: str,                # notification banner title
    message: str,              # notification banner body
    handshake: Handshake | None = None,   # required for handshake_* and chat_message types
    service: Service | None = None,       # required for service_* types
) -> Notification:
```

### Minimal example

```python
from api.utils import create_notification

create_notification(
    user=requester,
    notification_type='handshake_request',
    title='New handshake request',
    message=f'{service_owner.first_name} wants to book your service.',
    handshake=handshake,
    service=handshake.service,
)
```

---

## Notification Types

| `type` value | When to use | Required FK | App navigation target |
|---|---|---|---|
| `handshake_request` | A user requests a handshake | `handshake` | Messages → Chat |
| `handshake_accepted` | Provider accepts | `handshake` | Messages → Chat |
| `handshake_denied` | Provider denies | `handshake` | Messages → Chat |
| `handshake_cancellation_requested` | Either party requests cancellation | `handshake` | Messages → Chat |
| `handshake_cancellation_rejected` | Cancellation rejected | `handshake` | Messages → Chat |
| `handshake_cancelled` | Handshake fully cancelled | `handshake` | Messages → Chat |
| `chat_message` | New private chat message | `handshake` | Messages → Chat |
| `service_updated` | A booked service's details changed | `service` | Home → ServiceDetail |
| `service_reminder` | Upcoming service reminder | `service` | Home → ServiceDetail |
| `service_confirmation` | Service confirmed after completion | `service` | Home → ServiceDetail |
| `positive_rep` | User received a positive reputation score | _(none)_ | Profile tab |
| `admin_warning` | Moderator warning issued | _(none)_ | Notifications list (no deep-link) |
| `dispute_resolved` | A dispute was resolved | _(none)_ | Notifications list (no deep-link) |

---

## Push Data Payload

The `data` field attached to every Expo `PushMessage` is what drives in-app navigation. The backend builds it automatically in `_send_push_notification()`:

```python
push_data = {
    'type': notification.type,                          # str  — notification type
    'notification_id': str(notification.id),            # UUID — used to mark as read
    'related_handshake': str(notification.related_handshake_id) or None,  # UUID | null
    'related_service':   str(notification.related_service_id)   or None,  # UUID | null
}
```

### Field rules

| Field | Type | Required for |
|---|---|---|
| `type` | `string` | **all** types |
| `notification_id` | `string` (UUID) | **all** types |
| `related_handshake` | `string` (UUID) \| `null` | `handshake_*`, `chat_message` |
| `related_service` | `string` (UUID) \| `null` | `service_updated`, `service_reminder`, `service_confirmation` |

> **Important:** If `related_handshake` is `null` for a `handshake_*` or `chat_message` notification, the mobile app cannot navigate to the chat and will fall back to the Notifications list. Always pass the `handshake` argument for these types.

---

## Navigation Mapping (mobile side)

The mobile app reads `data` from the tapped notification and calls `navigateToNotificationTarget()` (`src/constants/notificationMappings.ts`):

```
type starts with "handshake_"  AND  related_handshake present
    → Messages tab  →  Chat screen  { handshakeId }

type === "chat_message"        AND  related_handshake present
    → Messages tab  →  Chat screen  { handshakeId }

type === "service_updated"
  | "service_reminder"
  | "service_confirmation"     AND  related_service present
    → Home tab  →  ServiceDetail screen  { id }

type === "positive_rep"
    → Profile tab

type === "admin_warning"
  | "dispute_resolved"
    → (stay in notification list, no deep-link)
```

---

## Adding a New Notification Type

1. **Add the choice** to `Notification.NOTIFICATION_TYPE_CHOICES` in `api/models.py` and create a migration.
2. **Add the push_data fields** — extend `_send_push_notification()` in `api/utils.py` if the new type needs a new FK reference.
3. **Call `create_notification()`** from the appropriate view, service, or signal.
4. **Update the mobile app:**
   - Add the new `type` string to `NotificationType` in `src/api/notifications.ts`.
   - Add an icon entry to `NOTIFICATION_ICONS` in `src/constants/notificationMappings.ts`.
   - Add a navigation case to `navigateToNotificationTarget()` in the same file.

---

## Prerequisites / Dependencies

| Package | Purpose |
|---|---|
| `exponent-server-sdk` (Python) | Sends push messages to the Expo Push API |
| `channels` + `channels_redis` | WebSocket broadcast for real-time delivery |

Install the SDK if it is not present:

```bash
pip install exponent-server-sdk
```

Add it to `requirements.txt`:

```
exponent-server-sdk>=2.0.0
```

---

## Testing Push Delivery Locally

Use the [Expo Push Notification Tool](https://expo.dev/notifications) to send a test message directly to a device token without going through the backend:

1. Retrieve the device's Expo push token from the `DevicePushToken` table (Django admin or shell):

```python
from api.models import DevicePushToken
DevicePushToken.objects.filter(user__email='user@example.com', is_active=True).values_list('token', flat=True)
```

2. Paste the token into the Expo tool.
3. Add the `data` payload manually to verify navigation:

```json
{
  "type": "handshake_request",
  "notification_id": "00000000-0000-0000-0000-000000000001",
  "related_handshake": "<handshake-uuid>",
  "related_service": null
}
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Push not delivered | `exponent-server-sdk` not installed | `pip install exponent-server-sdk` |
| Token auto-deactivated | Device unregistered (app re-installed / permissions revoked) | Normal — `is_active=False` prevents future attempts; user will re-register on next login |
| Tapping notification does not navigate | Missing `related_handshake` or `related_service` in `push_data` | Ensure the FK is passed to `create_notification()` |
| App navigates to wrong screen after cold start | Cold-start response not handled in mobile app | See `usePushNotifications` — `getLastNotificationResponseAsync` call |
