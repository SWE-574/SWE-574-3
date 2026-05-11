import { pillIdentity, SIGNAL_CHIPS } from "../../utils/pillIdentity";
import type { Service } from "../types";

function makeService(partial: Partial<Service>): Service {
  return {
    id: "x",
    title: "t",
    description: "",
    type: "Offer",
    duration: "1",
    location_type: "In-Person",
    location_area: null,
    status: "Active",
    max_participants: 1,
    created_at: "",
    tags: [],
    user: { id: "u", first_name: "A", last_name: "B" },
    ...partial,
  } as Service;
}

describe("pillIdentity", () => {
  it("returns default when no signals and no newcomer flag", () => {
    expect(pillIdentity(makeService({}))).toBe("default");
  });

  it("returns newcomer when only is_newcomer_owner is set", () => {
    expect(pillIdentity(makeService({ is_newcomer_owner: true }))).toBe(
      "newcomer",
    );
  });

  it("picks tag over follow when weighted tag wins", () => {
    // tag 0.4 * 0.5 = 0.20  vs  follow 0.5 * 0.3 = 0.15
    const s = makeService({
      for_you_signals: { tag: 0.4, follow: 0.5, cooccur: 0, recency_penalty: 0 },
    });
    expect(pillIdentity(s)).toBe("tag");
  });

  it("picks follow when follow's weighted value beats tag", () => {
    // follow 1.0 * 0.3 = 0.30  vs  tag 0.4 * 0.5 = 0.20
    const s = makeService({
      for_you_signals: { tag: 0.4, follow: 1.0, cooccur: 0, recency_penalty: 0 },
    });
    expect(pillIdentity(s)).toBe("follow");
  });

  it("picks engagement when only engagement is set", () => {
    const s = makeService({
      for_you_signals: {
        tag: 0,
        follow: 0,
        cooccur: 0,
        recency_penalty: 0,
        engagement: 0.9,
      },
    });
    expect(pillIdentity(s)).toBe("engagement");
  });

  it("picks cooccur when it dominates after weighting", () => {
    const s = makeService({
      for_you_signals: { tag: 0, follow: 0, cooccur: 0.9, recency_penalty: 0 },
    });
    expect(pillIdentity(s)).toBe("cooccur");
  });

  it("for_you signal beats newcomer fallback", () => {
    const s = makeService({
      is_newcomer_owner: true,
      for_you_signals: { tag: 0.4, follow: 0, cooccur: 0, recency_penalty: 0 },
    });
    expect(pillIdentity(s)).toBe("tag");
  });

  it("treats all-zero signals as default when newcomer flag is unset", () => {
    const zero = makeService({
      for_you_signals: { tag: 0, follow: 0, cooccur: 0, recency_penalty: 0 },
    });
    expect(pillIdentity(zero)).toBe("default");
  });

  it("falls through to newcomer when all signals are zero but newcomer flag is set", () => {
    const zero = makeService({
      is_newcomer_owner: true,
      for_you_signals: { tag: 0, follow: 0, cooccur: 0, recency_penalty: 0 },
    });
    expect(pillIdentity(zero)).toBe("newcomer");
  });
});

describe("SIGNAL_CHIPS", () => {
  it("exposes the four user-selectable chip identities with their signature colors", () => {
    const byId = Object.fromEntries(SIGNAL_CHIPS.map((c) => [c.id, c]));
    expect(byId.follow.color).toBe("#F59E0B");
    expect(byId.tag.color).toBe("#A855F7");
    expect(byId.newcomer.color).toBe("#F472B6");
    expect(byId.engagement.color).toBe("#14B8A6");
  });
});
