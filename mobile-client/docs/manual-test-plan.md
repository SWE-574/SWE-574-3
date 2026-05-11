# Mobile manual test plan

For screens and flows that the Maestro flows in `.maestro/` don't cover. An AI agent or a human tester should be able to follow this top-to-bottom on a fresh install and produce a checked-off pass/fail report.

The critical happy-paths (auth, browse, post, handshake, QR) are automated, and **most navigational / read-only sub-steps below are also automated** — see `.maestro/README.md` for the table mapping each plan section to its Maestro flow. The steps that remain manual are the ones Maestro fundamentally cannot drive (camera, push, gallery picker, airplane mode, deep links).

> ⚙️ A section header tagged **`[automated: <flow>]`** means the happy-path is covered by Maestro; you only need to manually test the sub-steps that the flow does not assert (e.g. infinite scroll, the read-time of a payload, visual polish).

## Setup

1. `make setup-demo` from the repo root (seeds the demo data).
2. `cd mobile-client && npm run android` or `npm run ios`.
3. Log in as `elif@demo.com` / `demo123` unless a step says otherwise.

Note any **bugs** as you go with a screenshot and a one-line repro. Don't try to fix anything in-flight.

---

## 1. Forum tab

### 1.1 Forum feed loads `[automated: forum/feed.yaml]`

- Tap the **Forum** tab.
- Expect: list of topics, each showing title, author, last activity timestamp.
- Pull-to-refresh works.
- Infinite scroll loads more topics past the first page.

### 1.2 Topic detail

- Tap any topic.
- Expect: title, body, comment list (chronological), comment composer at the bottom.
- The composer behaves correctly with the keyboard (no overlap, send button reachable).

### 1.3 Create a topic `[automated: forum/create-topic.yaml]`

- From Forum feed, tap the create-topic button (FAB or header action).
- Fill title + body, submit.
- Expect: returns to forum feed with the new topic at the top.

### 1.4 Comment on a topic

- Open any topic, type a comment, tap send.
- Expect: comment appears at the end of the list immediately.

### 1.5 Edit / delete own comment

- Long-press on a comment you authored.
- Expect: edit and delete actions appear.
- Edit changes the body in place. Delete removes it without a page reload.

### 1.6 Report a comment

- Long-press on a comment authored by someone else.
- Expect: report action appears, opens the report modal.
- Submit a report with a reason — modal closes, no error.

---

## 2. Messages tab

### 2.1 Conversation list `[automated: messages/conversation-list.yaml]`

- Tap the **Messages** tab.
- Expect: list of conversations sorted by most-recent activity.
- Unread conversations show a badge.

### 2.2 P2P chat `[automated: messages/p2p-chat.yaml]`

- Open a P2P conversation.
- Expect: message bubbles in chronological order (own messages on the right).
- Composer + send works.
- Outgoing messages show a sending → sent transition.
- Receiving a message (via a second account on web) updates the thread without reload.

### 2.3 Group chat (multi-participant handshake)

- Open a group chat (a handshake with more than 2 participants — e.g. an event).
- Expect: each message shows the sender's name + avatar.
- Roster is visible somewhere (header tap, or sheet).

### 2.4 Public event chat

- Open an event service detail → tap public chat / discussion.
- Expect: anyone signed in can read; only registered participants can write.
- Try sending a message — works if registered, blocked if not, with a clear message.

### 2.5 Image attachment in chat

- In a P2P chat, tap the attach icon, pick an image from the gallery, send.
- Expect: image renders inline, tap to open lightbox.

### 2.6 Offline behaviour

- Toggle airplane mode on the device.
- Send a message. Expect: queued state shown, no crash.
- Toggle airplane mode off. Expect: message flushes to "sent".

### 2.7 Notification on incoming message

- Background the app.
- Trigger a new message from a second account (web or another device).
- Expect: push notification arrives; tapping it lands directly in the right thread.

---

## 3. Map tab

### 3.1 Map renders `[automated: map/map-loads.yaml — boot only, markers inside WebView are manual]`

- Tap the **Map** tab.
- Expect: Mapbox map renders centered on the user's location (after permission grant) or a sensible default.

### 3.2 Markers + clusters

- Pan the map.
- Expect: service markers appear; clusters at low zoom expand on tap.

### 3.3 Marker detail bottom sheet

- Tap a single marker.
- Expect: bottom sheet shows service title, owner, "View details" CTA.
- "View details" navigates to ServiceDetail.

### 3.4 Location permission denied

- Settings → privacy → revoke location permission for the app, reopen Map tab.
- Expect: graceful fallback (centered on default region, banner explaining why), not a crash.

---

## 4. Profile tab

### 4.1 Profile home `[automated: profile/profile-home.yaml]`

- Tap the **Profile** tab.
- Expect: avatar, display name, time-credit balance, achievement showcase, "My listings" section.

### 4.2 Profile edit `[automated: profile/edit-profile.yaml]`

- Tap edit (pencil/sheet).
- Change display name. Save.
- Expect: returns to profile, name is updated, no extra fetch shimmer.

### 4.3 Achievements list `[automated: profile/achievements.yaml]`

- Tap "Achievements" or a badge in the showcase.
- Expect: full grid of badges, earned ones full-color, unearned ones grayed.

### 4.4 Follow list (followers / following) `[automated: profile/follow-list.yaml]`

- From profile, tap "Followers" or "Following".
- Expect: list of users with avatar + display name. Tap a row → public profile.

### 4.5 Notifications list `[automated: profile/notifications.yaml]`

- From profile, tap the notifications icon.
- Expect: chronological notifications. Each notification:
  - Has the correct icon for its type
  - Routes to the right screen on tap (handshake → chat, badge → achievement detail, etc.)
- Unread notifications show a dot.

### 4.6 Notification preferences

- From profile, settings → notification preferences.
- Toggle a category off, kill the app, reopen — toggle is still off (persisted).

### 4.7 Calendar `[automated: profile/calendar.yaml]`

- From profile, tap Calendar.
- Expect: month view with dots on days that have events/commitments.
- Tap a day → list of items for that day.
- "Upcoming" filter shows the next 14 days.

### 4.8 My commitments `[automated: profile/my-commitments.yaml]`

- From profile, tap "My commitments".
- Expect: services you've requested or accepted, sorted by upcoming time.
- Tap one → service detail.

### 4.9 Time activity `[automated: profile/time-activity.yaml]`

- From profile, tap "Time activity".
- Expect: chronological list of time-credit transactions (earned, spent, refunded).
- Each row shows ±hours and the counterparty.

### 4.10 Public profile

- From any chat or comment, tap a user's avatar.
- Expect: their public profile — display name, achievements, listings, follow button.
- Tap "Follow" — button changes to "Following" without a page reload.

---

## 5. Cross-cutting

### 5.1 Cold start performance `[automated: cross/cold-start.yaml — assertion is reach, not timing]`

- Force-stop the app, time the relaunch.
- Expect: usable home feed within ~3 seconds on a recent device.

### 5.2 Backgrounding mid-flow

- Start writing a comment / chat message. Background the app for 30 seconds. Foreground.
- Expect: draft is preserved, no crash.

### 5.3 Network-loss banner

- During any active screen, toggle airplane mode.
- Expect: an offline banner appears. Toggle off, banner dismisses.

### 5.4 Logout `[automated: cross/logout.yaml]`

- Profile → settings → log out.
- Expect: lands on Login screen, no flicker through Home, no preserved auth state.

### 5.5 Deep links

- From a browser on the device, open `thehive://service/<id>` (or whatever the configured scheme is).
- Expect: app opens directly on that service detail (after login if needed).

---

## Reporting bugs

Open issues under #579 with the prefix `[mobile QA]` and these fields:

- **Where**: tab → screen → step number from this doc.
- **Device**: iOS / Android, model, OS version.
- **Build**: app version + EAS build number from Settings → About.
- **Expected vs actual**: one line each.
- **Repro**: numbered steps if it's not obvious.
- **Screenshot or recording**.

If a step in this doc is *wrong* (label changed, flow moved), edit the doc in the same PR as the fix.
