import React from "react";
import { render } from "@testing-library/react-native";
import ReviewCard from "../ReviewCard";
import type { ProfileReview } from "../../../../api/users";

const baseReview: ProfileReview = {
  id: "rev-1",
  service: "svc-9",
  service_title: "Tea ceremony intro",
  user_id: "user-3",
  user_name: "Mert Aksoy",
  body: "Was a really thoughtful host — would join again any weekend.",
  is_verified_review: true,
  handshake_hours: 1.5,
  reviewed_user_role: "receiver",
  reply_count: 2,
  replies: [],
  created_at: "2026-04-12T15:00:00Z",
  updated_at: "2026-04-12T15:00:00Z",
};

describe("ReviewCard", () => {
  it("renders author name, body and meta", () => {
    const { getByText } = render(<ReviewCard review={baseReview} />);
    expect(getByText("Mert Aksoy")).toBeTruthy();
    expect(getByText(baseReview.body)).toBeTruthy();
    expect(getByText(/^Tea ceremony intro/)).toBeTruthy();
  });

  it("shows the Verified pill when the review is verified", () => {
    const { getByText } = render(<ReviewCard review={baseReview} />);
    expect(getByText("Verified")).toBeTruthy();
  });

  it("hides the Verified pill when the review is not verified", () => {
    const { queryByText } = render(
      <ReviewCard review={{ ...baseReview, is_verified_review: false }} />,
    );
    expect(queryByText("Verified")).toBeNull();
  });

  it("renders the handshake hours and reply count chips", () => {
    const { getByText } = render(<ReviewCard review={baseReview} />);
    expect(getByText("1.5h")).toBeTruthy();
    expect(getByText("2 replies")).toBeTruthy();
  });

  it("falls back to 'Community member' when user name is empty", () => {
    const { getByText } = render(
      <ReviewCard review={{ ...baseReview, user_name: "" }} />,
    );
    expect(getByText("Community member")).toBeTruthy();
  });
});
