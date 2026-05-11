/**
 * Rendering tests for ProfileEditSheet — focuses on the recent UX changes:
 *   - Identity tab no longer shows a Username field.
 *   - City / Location only fetches autocomplete suggestions once the input
 *     is focused (i.e. user explicitly tapped it).
 *   - Photo tab waits for the user to tap "Save changes" before uploading,
 *     so picking an asset only stores it in pending state + shows a preview.
 *
 * Network calls (Mapbox, ensureTagInDb, patchMe) are mocked so we exercise
 * the component's UI contract without hitting real endpoints.
 */

import React from "react";
import { fireEvent, render, waitFor, act } from "@testing-library/react-native";

jest.mock("../../../../utils/mapboxLocation", () => ({
  searchMapboxLocations: jest.fn(),
  getMapboxToken: jest.fn(() => "test-token"),
}));

jest.mock("../../../../api/users", () => ({
  patchMe: jest.fn(),
}));

jest.mock("../../../../api/tags", () => ({
  ensureTagInDb: jest.fn(async (tag: { id: string; name: string }) => tag),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  return {
    Ionicons: (props: { name: string }) =>
      React.createElement("Ionicons", {
        ...props,
        testID: `icon-${props.name}`,
      }),
  };
});

jest.mock("@expo/vector-icons/Ionicons", () => {
  const React = require("react");
  const Ionicons = (props: { name: string }) =>
    React.createElement("Ionicons", {
      ...props,
      testID: `icon-${props.name}`,
    });
  Ionicons.glyphMap = {};
  return Ionicons;
});

// SkillTagAutocomplete fans out into network calls of its own; replace with
// a stub so it doesn't blow up rendering during these tests.
jest.mock("../SkillTagAutocomplete", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: () => React.createElement(View, null),
  };
});

import ProfileEditSheet from "../ProfileEditSheet";
import { searchMapboxLocations } from "../../../../utils/mapboxLocation";
import { patchMe } from "../../../../api/users";

const searchMapboxLocationsMock = searchMapboxLocations as jest.Mock;
const patchMeMock = patchMe as jest.Mock;

const baseUser = {
  id: "user-1",
  email: "selin@example.com",
  first_name: "Selin",
  last_name: "Kaya",
  bio: "",
  location: "Istanbul / Beşiktaş",
  avatar_url: null,
  banner_url: null,
  profession: "",
  featured_badges: [] as string[],
  featured_badges_detail: [] as never[],
  skills: [] as Array<{ id: string; name: string }>,
};

describe("ProfileEditSheet identity tab", () => {
  beforeEach(() => {
    searchMapboxLocationsMock.mockReset();
    patchMeMock.mockReset();
  });

  it("does not render a Username field", () => {
    const { queryByText } = render(
      <ProfileEditSheet
        visible
        presentation="screen"
        initialTab="identity"
        user={baseUser}
        onClose={() => undefined}
        onSaveSuccess={() => undefined}
      />,
    );
    expect(queryByText("Username")).toBeNull();
    expect(queryByText("Username cannot be changed.")).toBeNull();
  });

  it("does not call the mapbox search before the location input is focused", async () => {
    searchMapboxLocationsMock.mockResolvedValue([]);
    render(
      <ProfileEditSheet
        visible
        presentation="screen"
        initialTab="identity"
        user={baseUser}
        onClose={() => undefined}
        onSaveSuccess={() => undefined}
      />,
    );

    // Give the debounce timer plenty of time — no focus, no search.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(searchMapboxLocationsMock).not.toHaveBeenCalled();
  });

  it("triggers mapbox search only after the location input is focused and a query of 2+ chars is typed", async () => {
    searchMapboxLocationsMock.mockResolvedValue([]);
    const { getByPlaceholderText } = render(
      <ProfileEditSheet
        visible
        presentation="screen"
        initialTab="identity"
        user={{ ...baseUser, location: "" }}
        onClose={() => undefined}
        onSaveSuccess={() => undefined}
      />,
    );

    const input = getByPlaceholderText(
      "Tap to search a city, district, or address",
    );
    fireEvent(input, "focus");
    fireEvent.changeText(input, "Ist");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(searchMapboxLocationsMock).toHaveBeenCalled();
    expect(searchMapboxLocationsMock.mock.calls[0][0]).toBe("Ist");
  });
});

describe("ProfileEditSheet photos tab", () => {
  beforeEach(() => {
    searchMapboxLocationsMock.mockReset();
    patchMeMock.mockReset();
  });

  it("does not upload immediately when an asset is picked — only previews it", async () => {
    const onPickAvatar = jest.fn(async () => ({
      uri: "file:///tmp/picked.jpg",
      name: "picked.jpg",
      mimeType: "image/jpeg",
    }));
    const onSaveSuccess = jest.fn();

    const { findByLabelText } = render(
      <ProfileEditSheet
        visible
        presentation="screen"
        initialTab="photos"
        user={baseUser}
        onClose={() => undefined}
        onSaveSuccess={onSaveSuccess}
        onPickAvatar={onPickAvatar}
      />,
    );

    const button = await findByLabelText("Change avatar");
    await act(async () => {
      fireEvent.press(button);
    });

    expect(onPickAvatar).toHaveBeenCalledTimes(1);
    expect(patchMeMock).not.toHaveBeenCalled();
    expect(onSaveSuccess).not.toHaveBeenCalled();
  });

  it("uploads via FormData on Save once an avatar has been picked", async () => {
    const onPickAvatar = jest.fn(async () => ({
      uri: "file:///tmp/picked.jpg",
      name: "picked.jpg",
      mimeType: "image/jpeg",
    }));
    const onSaveSuccess = jest.fn();
    patchMeMock.mockResolvedValue({ ...baseUser, avatar_url: "/m/a.jpg" });

    const { findByLabelText } = render(
      <ProfileEditSheet
        visible
        presentation="screen"
        initialTab="photos"
        user={baseUser}
        onClose={() => undefined}
        onSaveSuccess={onSaveSuccess}
        onPickAvatar={onPickAvatar}
      />,
    );

    await act(async () => {
      fireEvent.press(await findByLabelText("Change avatar"));
    });

    await act(async () => {
      fireEvent.press(await findByLabelText("Save changes"));
    });

    await waitFor(() => {
      expect(patchMeMock).toHaveBeenCalledTimes(1);
    });
    const body = patchMeMock.mock.calls[0][0];
    expect(body).toBeInstanceOf(FormData);
    expect(onSaveSuccess).toHaveBeenCalledTimes(1);
  });
});
