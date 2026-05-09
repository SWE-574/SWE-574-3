import {
  activeAgreementParticipantLabel,
  completedGroupOfferParticipantCount,
  completedTransactionParticipantLabel,
  groupActiveAgreements,
  groupTransactionRows,
  isTimeActivityParticipantStatus,
  timeActivityAvatarPreview,
  timeActivityAvatarStackWidth,
  timeActivityVisibleParticipants,
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

  it("groups active event agreements into one visible row", () => {
    const grouped = groupActiveAgreements([
      {
        ...groupOfferAgreement,
        id: "event-hs-1",
        service_id: "event-1",
        service_title: "Community Mending and Repair Cafe",
        service_type: "Event",
        expected_delta: 0,
        counterpart_name: "Zeynep Arslan",
      },
      {
        ...groupOfferAgreement,
        id: "event-hs-2",
        service_id: "event-1",
        service_title: "Community Mending and Repair Cafe",
        service_type: "Event",
        expected_delta: 0,
        counterpart_name: "Selin Aksoy",
      },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].counterpart_name).toBe("2 members");
    expect(grouped[0].participant_count).toBe(2);
    expect(grouped[0].is_grouped_multi_use).toBe(true);
    expect((grouped[0].participants ?? []).map((item) => item.counterpart_name)).toEqual([
      "Zeynep Arslan",
      "Selin Aksoy",
    ]);
  });

  it("treats a single event agreement with loaded participants as grouped", () => {
    const grouped = groupActiveAgreements([
      {
        ...groupOfferAgreement,
        id: "event-hs-1",
        service_id: "event-1",
        service_title: "Community Mending and Repair Cafe",
        service_type: "Event",
        expected_delta: 0,
        counterpart_name: "Current Attendee",
        participants: [
          {
            ...groupOfferAgreement,
            id: "organizer",
            service_type: "Event",
            counterpart_name: "Organizer User",
            is_current_user_provider: true,
          },
          {
            ...groupOfferAgreement,
            id: "attendee",
            service_type: "Event",
            counterpart_name: "Current Attendee",
            is_current_user_provider: false,
          },
        ],
      },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      counterpart_name: "2 members",
      participant_count: 2,
      is_grouped_multi_use: true,
    });
    expect((grouped[0].participants ?? []).map((item) => item.counterpart_name)).toEqual([
      "Organizer User",
      "Current Attendee",
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

  it("uses completed participant count over active session count for completed group transfer rows", () => {
    expect(completedGroupOfferParticipantCount({ participantCount: 5, completedCount: 3 })).toBe(3);
    expect(completedGroupOfferParticipantCount({ participantCount: 2, completedCount: 0 })).toBe(2);
  });

  it("excludes inactive handshake statuses from group offer participant displays", () => {
    expect(isTimeActivityParticipantStatus("accepted")).toBe(true);
    expect(isTimeActivityParticipantStatus("completed")).toBe(true);
    expect(isTimeActivityParticipantStatus("declined")).toBe(false);
    expect(isTimeActivityParticipantStatus("cancelled")).toBe(false);
  });

  it("keeps all participant avatars visible instead of capping at two", () => {
    const participants = [
      { ...groupOfferAgreement, id: "hs-1", counterpart_name: "Can Sahin" },
      { ...groupOfferAgreement, id: "hs-2", counterpart_name: "Zeynep Arslan" },
      { ...groupOfferAgreement, id: "hs-3", counterpart_name: "Ayse Kaya" },
    ];

    expect(timeActivityVisibleParticipants(participants).map((item) => item.id)).toEqual([
      "hs-1",
      "hs-2",
      "hs-3",
    ]);
  });

  it("sizes stacked avatars for every visible participant", () => {
    expect(timeActivityAvatarStackWidth(1)).toBe(22);
    expect(timeActivityAvatarStackWidth(3)).toBe(46);
  });

  it("previews the first five avatars and reports overflow", () => {
    const participants = Array.from({ length: 7 }, (_, index) => ({
      ...groupOfferAgreement,
      id: `hs-${index + 1}`,
      counterpart_name: `Member ${index + 1}`,
    }));

    expect(timeActivityAvatarPreview(participants).overflowCount).toBe(2);
    expect(timeActivityAvatarPreview(participants).visibleParticipants.map((item) => item.id)).toEqual([
      "hs-1",
      "hs-2",
      "hs-3",
      "hs-4",
      "hs-5",
    ]);
  });
});
