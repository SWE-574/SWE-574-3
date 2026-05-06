import { getChatNotificationReadIds } from "../chatNotificationRead";
import type { Notification } from "../../api/notifications";

function makeNotification(overrides: Partial<Notification>): Notification {
  return {
    id: "n1",
    type: "chat_message",
    title: "",
    message: "",
    is_read: false,
    related_handshake: "hs-1",
    related_service: null,
    created_at: "",
    ...overrides,
  };
}

describe("chat notification read targeting", () => {
  it("marks the explicit tapped notification plus unread notifications for the same handshake", () => {
    expect(
      getChatNotificationReadIds({
        handshakeId: "hs-1",
        explicitNotificationId: "n0",
        notifications: [
          makeNotification({ id: "n1", type: "chat_message" }),
          makeNotification({ id: "n2", type: "handshake_accepted" }),
          makeNotification({ id: "n3", related_handshake: "hs-2" }),
          makeNotification({ id: "n4", is_read: true }),
        ],
      }),
    ).toEqual(["n0", "n1", "n2"]);
  });

  it("matches related handshake when the API returns an object instead of a plain id", () => {
    expect(
      getChatNotificationReadIds({
        handshakeId: "hs-1",
        notifications: [
          makeNotification({
            id: "n-object",
            related_handshake: { id: "hs-1" } as never,
          }),
        ],
      }),
    ).toEqual(["n-object"]);
  });
});
