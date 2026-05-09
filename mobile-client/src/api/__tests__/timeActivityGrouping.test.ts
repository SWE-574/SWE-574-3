import {
  activeAgreementParticipantLabel,
  completedTransactionParticipantLabel,
  groupActiveAgreements,
  groupTransactionRows,
  type TimeActivityAgreement,
  type TimeActivityTransaction,
} from "../../utils/timeActivityGrouping";

const groupOfferAgreement = {
  service_id: "service-1",
  service_title: "Neighborhood Manti Cooking Circle",
  service_type: "Offer",
  schedule_type: "One-Time",
  max_participants: 3,
  is_current_user_provider: true,
  status: "accepted",
  reserved_delta: 0,
  expected_delta: 3,
  note: "Time expected after completion",
} satisfies Omit<TimeActivityAgreement, "id" | "counterpart_name">;

const groupOfferTransaction = {
  transaction_type: "transfer",
  service_id: "service-1",
  service_title: "Neighborhood Manti Cooking Circle",
  service_type: "Offer",
  schedule_type: "One-Time",
  max_participants: 3,
  is_current_user_provider: true,
  amount: 3,
  balance_after: 10,
  created_at: "2026-05-09T10:00:00Z",
} satisfies Omit<TimeActivityTransaction, "id">;

describe("timeActivityGrouping", () => {
  it("groups active one-time group offer agreements into one visible row", () => {
    const grouped = groupActiveAgreements([
      { ...groupOfferAgreement, id: "hs-1", counterpart_name: "Can Sahin" },
      { ...groupOfferAgreement, id: "hs-2", counterpart_name: "Zeynep Arslan" },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].counterpart_name).toBe("2 members");
    expect(grouped[0].participant_count).toBe(2);
    expect(grouped[0].expected_delta).toBe(3);
    expect((grouped[0].participants ?? []).map((item) => item.counterpart_name)).toEqual([
      "Can Sahin",
      "Zeynep Arslan",
    ]);
  });

  it("keeps one-to-one active agreements separate", () => {
    const grouped = groupActiveAgreements([
      {
        ...groupOfferAgreement,
        id: "hs-1",
        service_id: "solo-1",
        max_participants: 1,
        counterpart_name: "Can Sahin",
      },
      {
        ...groupOfferAgreement,
        id: "hs-2",
        service_id: "solo-2",
        max_participants: 1,
        counterpart_name: "Zeynep Arslan",
      },
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped.every((item) => item.participant_count === 1)).toBe(true);
  });

  it("groups completed one-time group offer transfers without double-counting hours", () => {
    const grouped = groupTransactionRows([
      { ...groupOfferTransaction, id: "tx-1" },
      { ...groupOfferTransaction, id: "tx-2", created_at: "2026-05-09T11:00:00Z" },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].participantCount).toBe(2);
    expect(grouped[0].amount).toBe(3);
    expect(grouped[0].items).toHaveLength(2);
  });

  it("marks a single visible group offer transfer as grouped when participant count is known", () => {
    const grouped = groupTransactionRows(
      [{ ...groupOfferTransaction, id: "tx-1" }],
      {
        participantCount: () => 2,
        participants: () => [
          { ...groupOfferAgreement, id: "hs-1", counterpart_name: "Can Sahin", counterpart_avatar_url: "can.jpg" },
          { ...groupOfferAgreement, id: "hs-2", counterpart_name: "Zeynep Arslan", counterpart_avatar_url: "zeynep.jpg" },
        ],
      },
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0].counterpartLabel).toBe("2 members");
    expect(grouped[0].participantCount).toBe(2);
    expect(grouped[0].isMultiUse).toBe(true);
    expect(grouped[0].participants?.map((item) => item.counterpart_avatar_url)).toEqual([
      "can.jpg",
      "zeynep.jpg",
    ]);
  });

  it("labels grouped completed transaction participants as completed participants", () => {
    expect(completedTransactionParticipantLabel()).toBe("Completed participant");
  });

  it("labels active agreement participants as session confirmed", () => {
    expect(activeAgreementParticipantLabel("accepted")).toBe("Session confirmed");
  });
});
