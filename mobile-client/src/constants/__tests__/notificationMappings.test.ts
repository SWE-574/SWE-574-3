/**
 * Unit tests for notification deep-link routing.
 */

import { navigateToNotificationTarget, NOTIFICATION_ICONS } from "../notificationMappings";
import type { Notification } from "../../api/notifications";

function makeNotification(overrides: Partial<Notification>): Notification {
  return {
    id: "n1",
    type: "positive_rep",
    title: "",
    message: "",
    is_read: false,
    related_handshake: null,
    related_service: null,
    created_at: "",
    ...overrides,
  };
}

describe("navigateToNotificationTarget", () => {
  let navigate: jest.Mock;

  beforeEach(() => {
    navigate = jest.fn();
  });

  it("routes positive_rep with related_service to ServiceDetail", () => {
    navigateToNotificationTarget(
      makeNotification({ type: "positive_rep", related_service: "svc-42" }),
      { navigate },
    );
    expect(navigate).toHaveBeenCalledWith("Home", {
      screen: "ServiceDetail",
      params: { id: "svc-42" },
    });
  });

  it("routes positive_rep without related_service to Profile", () => {
    navigateToNotificationTarget(
      makeNotification({ type: "positive_rep", related_service: null }),
      { navigate },
    );
    expect(navigate).toHaveBeenCalledWith("Profile");
  });

  it("routes handshake_request with related_handshake to Chat", () => {
    navigateToNotificationTarget(
      makeNotification({ type: "handshake_request", related_handshake: "hs-1" }),
      { navigate },
    );
    expect(navigate).toHaveBeenCalledWith("Messages", {
      screen: "Chat",
      params: { handshakeId: "hs-1" },
    });
  });

  it("routes chat_message with related_handshake to Chat", () => {
    navigateToNotificationTarget(
      makeNotification({ type: "chat_message", related_handshake: "hs-2" }),
      { navigate },
    );
    expect(navigate).toHaveBeenCalledWith("Messages", {
      screen: "Chat",
      params: { handshakeId: "hs-2" },
    });
  });

  it("routes service_updated with related_service to ServiceDetail", () => {
    navigateToNotificationTarget(
      makeNotification({ type: "service_updated", related_service: "svc-1" }),
      { navigate },
    );
    expect(navigate).toHaveBeenCalledWith("Home", {
      screen: "ServiceDetail",
      params: { id: "svc-1" },
    });
  });

  it("routes service_reminder to ServiceDetail", () => {
    navigateToNotificationTarget(
      makeNotification({ type: "service_reminder", related_service: "svc-2" }),
      { navigate },
    );
    expect(navigate).toHaveBeenCalledWith("Home", {
      screen: "ServiceDetail",
      params: { id: "svc-2" },
    });
  });

  it("does not navigate for admin_warning", () => {
    navigateToNotificationTarget(
      makeNotification({ type: "admin_warning" }),
      { navigate },
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not navigate for dispute_resolved", () => {
    navigateToNotificationTarget(
      makeNotification({ type: "dispute_resolved" }),
      { navigate },
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("prefers handshake route over service route for handshake types", () => {
    navigateToNotificationTarget(
      makeNotification({
        type: "handshake_accepted",
        related_handshake: "hs-3",
        related_service: "svc-5",
      }),
      { navigate },
    );
    expect(navigate).toHaveBeenCalledWith("Messages", {
      screen: "Chat",
      params: { handshakeId: "hs-3" },
    });
  });
});

describe("NOTIFICATION_ICONS", () => {
  it("has an icon for every notification type", () => {
    const expectedTypes = [
      "handshake_request",
      "handshake_accepted",
      "handshake_denied",
      "handshake_cancellation_requested",
      "handshake_cancellation_rejected",
      "handshake_cancelled",
      "service_updated",
      "chat_message",
      "service_reminder",
      "service_confirmation",
      "positive_rep",
      "admin_warning",
      "dispute_resolved",
    ];
    for (const type of expectedTypes) {
      expect(NOTIFICATION_ICONS[type as keyof typeof NOTIFICATION_ICONS]).toBeDefined();
    }
  });

  it("maps positive_rep to star-outline", () => {
    expect(NOTIFICATION_ICONS.positive_rep).toBe("star-outline");
  });
});
