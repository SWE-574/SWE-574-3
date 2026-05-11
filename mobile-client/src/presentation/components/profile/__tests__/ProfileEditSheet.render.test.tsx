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
// The stub also exposes the `onSelect` callback so tests can drive a
// skill-add without rendering the real autocomplete UI.
let skillOnSelect:
  | ((tag: { id: string; name: string }) => void)
  | undefined;
jest.mock("../SkillTagAutocomplete", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: (props: { onSelect?: (tag: { id: string; name: string }) => void }) => {
      skillOnSelect = props.onSelect;
      return React.createElement(View, null);
    },
  };
});

// BadgeShowcase has its own picker UI; in tests we just need to drive the
// `onSelectionChange` callback so we can verify how the diff is sent.
let badgeOnSelectionChange: ((ids: string[]) => void) | undefined;
jest.mock("../BadgeShowcase", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Mock = (props: { onSelectionChange?: (ids: string[]) => void }) => {
    badgeOnSelectionChange = props.onSelectionChange;
    return React.createElement(View, null);
  };
  return { __esModule: true, default: Mock };
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

/**
 * Regression: when a multipart save fires alongside an array-valued diff
 * (`featured_badges`, `skill_ids`), the values must be appended as repeated
 * keys rather than JSON-stringified blobs. DRF `ListField` only parses the
 * former out of `multipart/form-data` — the latter is rejected as a single
 * literal string and the backend fails validation with cryptic errors
 * ("badge has not been earned", "tag not found", etc.).
 *
 * The bug only fires when a photo pick is combined with a Showcase or Skills
 * change in the same edit session; JSON-only patches go through the JSON
 * branch and serialize correctly.
 */
describe("ProfileEditSheet multipart save with array diff", () => {
  beforeEach(() => {
    searchMapboxLocationsMock.mockReset();
    patchMeMock.mockReset();
    badgeOnSelectionChange = undefined;
    skillOnSelect = undefined;
  });

  const formDataEntries = (fd: FormData): Array<[string, unknown]> => {
    // React Native FormData stores parts on `_parts`; node FormData exposes
    // `entries()`. Try both so the test is portable across runners.
    const parts = (fd as unknown as { _parts?: Array<[string, unknown]> })
      ._parts;
    if (Array.isArray(parts)) return parts;
    return Array.from((fd as unknown as { entries(): IterableIterator<[string, unknown]> }).entries());
  };

  it("appends featured_badges as repeated keys, not a JSON-stringified array", async () => {
    const onPickAvatar = jest.fn(async () => ({
      uri: "file:///tmp/picked.jpg",
      name: "picked.jpg",
      mimeType: "image/jpeg",
    }));
    patchMeMock.mockResolvedValue({ ...baseUser });

    const userWithBadge = {
      ...baseUser,
      featured_badges: ["badge-a"],
    };

    const { findByLabelText, getByText } = render(
      <ProfileEditSheet
        visible
        presentation="screen"
        initialTab="showcase"
        user={userWithBadge}
        onClose={() => undefined}
        onSaveSuccess={() => undefined}
        onPickAvatar={onPickAvatar}
      />,
    );

    // BadgeShowcase mock captures the callback on mount; change selection
    // so featured_badges enters the diff.
    await waitFor(() => expect(badgeOnSelectionChange).toBeDefined());
    await act(async () => {
      badgeOnSelectionChange?.(["badge-b", "badge-c"]);
    });

    // Switch to the Photos tab and queue an avatar so the multipart branch
    // is exercised.
    await act(async () => {
      fireEvent.press(getByText("Photos"));
    });
    await act(async () => {
      fireEvent.press(await findByLabelText("Change avatar"));
    });

    await act(async () => {
      fireEvent.press(await findByLabelText("Save changes"));
    });

    await waitFor(() => expect(patchMeMock).toHaveBeenCalledTimes(1));
    const body = patchMeMock.mock.calls[0][0] as FormData;
    expect(body).toBeInstanceOf(FormData);

    const entries = formDataEntries(body);
    const badgeEntries = entries.filter(([key]) => key === "featured_badges");

    // Each id must be a separate entry; DRF rejects '["badge-b","badge-c"]'.
    expect(badgeEntries.map(([, value]) => value)).toEqual([
      "badge-b",
      "badge-c",
    ]);
    badgeEntries.forEach(([, value]) => {
      expect(typeof value).toBe("string");
      expect(value).not.toMatch(/^\[/);
    });
  });

  it("appends skill_ids as repeated keys, not a JSON-stringified array", async () => {
    const onPickAvatar = jest.fn(async () => ({
      uri: "file:///tmp/picked.jpg",
      name: "picked.jpg",
      mimeType: "image/jpeg",
    }));
    patchMeMock.mockResolvedValue({ ...baseUser });

    const { findByLabelText, getByText } = render(
      <ProfileEditSheet
        visible
        presentation="screen"
        initialTab="skills"
        user={baseUser}
        onClose={() => undefined}
        onSaveSuccess={() => undefined}
        onPickAvatar={onPickAvatar}
      />,
    );

    await waitFor(() => expect(skillOnSelect).toBeDefined());

    // Two UUID-shaped ids → ensureTagInDb is skipped and ids flow straight
    // into `skill_ids` on save.
    const uuid = (suffix: string) =>
      `11111111-2222-3333-4444-${suffix.padStart(12, "0")}`;
    await act(async () => {
      skillOnSelect?.({ id: uuid("aaa"), name: "React" });
    });
    await act(async () => {
      skillOnSelect?.({ id: uuid("bbb"), name: "TypeScript" });
    });

    await act(async () => {
      fireEvent.press(getByText("Photos"));
    });
    await act(async () => {
      fireEvent.press(await findByLabelText("Change avatar"));
    });

    await act(async () => {
      fireEvent.press(await findByLabelText("Save changes"));
    });

    await waitFor(() => expect(patchMeMock).toHaveBeenCalledTimes(1));
    const body = patchMeMock.mock.calls[0][0] as FormData;
    expect(body).toBeInstanceOf(FormData);

    const entries = formDataEntries(body);
    const skillEntries = entries.filter(([key]) => key === "skill_ids");
    expect(skillEntries.map(([, value]) => value)).toEqual([
      uuid("aaa"),
      uuid("bbb"),
    ]);
    skillEntries.forEach(([, value]) => {
      expect(typeof value).toBe("string");
      expect(value).not.toMatch(/^\[/);
    });
  });
});
