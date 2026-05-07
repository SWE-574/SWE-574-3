import {
  getChatParticipantDisplay,
  getChatParticipantInitial,
  getChatParticipantLabel,
  shouldShowChatParticipantLoading,
} from "../chatParticipant";

describe("chat participant display helpers", () => {
  it("falls back when the participant name is missing", () => {
    expect(getChatParticipantLabel(undefined)).toBe("Unknown");
    expect(getChatParticipantInitial(undefined)).toBe("?");
  });

  it("uses the first visible character from a provided name", () => {
    expect(getChatParticipantLabel(" Elif Yılmaz ")).toBe("Elif Yılmaz");
    expect(getChatParticipantInitial(" Elif Yılmaz ")).toBe("E");
  });

  it("prefers live handshake counterpart details over placeholder route params", () => {
    expect(
      getChatParticipantDisplay({
        routeName: undefined,
        routeUserId: undefined,
        routeAvatarUrl: undefined,
        handshake: {
          id: "hs-1",
          service: "svc-1",
          status: "pending",
          created_at: "",
          counterpart: {
            id: "u2",
            first_name: "Zeynep",
            last_name: "Arslan",
            email: "zeynep@example.com",
            avatar_url: "https://example.com/zeynep.png",
          },
        },
      }),
    ).toEqual({
      name: "Zeynep Arslan",
      userId: "u2",
      avatarUrl: "https://example.com/zeynep.png",
    });
  });

  it("shows a loading state while notification-opened chats wait for handshake details", () => {
    expect(
      shouldShowChatParticipantLoading({
        handshakeId: "hs-1",
        routeName: undefined,
        handshake: null,
      }),
    ).toBe(true);

    expect(
      shouldShowChatParticipantLoading({
        handshakeId: "hs-1",
        routeName: "Elif Yılmaz",
        handshake: null,
      }),
    ).toBe(false);
  });
});
