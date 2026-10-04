import { describe, expect, it } from "vitest";
import { detailsOpenByDefault, detailsSummary } from "./txn-details";

const imported = {
  description: "Auto ride",
  eventId: null,
  valueDate: null,
  reference: "REF101",
  notes: "Case 1: misspelled account",
};

describe("problem 4: More details collapsed on Queue cards", () => {
  it("starts collapsed on Queue cards even when the row has a reference and notes", () => {
    expect(detailsOpenByDefault("queue", imported)).toBe(false);
  });

  it("opens when a field inside needs fixing, so no error is hidden", () => {
    expect(detailsOpenByDefault("queue", imported, { event: 'No event named "Diwal"' })).toBe(true);
  });

  it("keeps the manual edit form open when the transaction already has details", () => {
    expect(detailsOpenByDefault("manual", imported)).toBe(true);
    expect(detailsOpenByDefault("manual", { ...imported, reference: null, notes: null })).toBe(false);
  });

  it("summarises the collapsed details on one line", () => {
    expect(detailsSummary(imported, { events: [] })).toBe("Auto ride · Ref REF101 · Case 1: misspelled account");
    expect(
      detailsSummary({ description: null, eventId: "e1", valueDate: "2026-10-02", reference: null, notes: null }, { events: [{ id: "e1", name: "Diwali" }] }),
    ).toBe("Event: Diwali · Value date 02 Oct 2026");
    expect(detailsSummary({ description: " ", eventId: null, valueDate: null, reference: null, notes: null }, { events: [] })).toBeNull();
  });
});
