import { describe, expect, it } from "vitest";
import { isNoticeKind } from "./notice";

describe("isNoticeKind", () => {
  it("accepts only the known confirmations", () => {
    expect(["posted", "saved", "deleted"].every(isNoticeKind)).toBe(true);
    expect(isNoticeKind("toString")).toBe(false);
    expect(isNoticeKind(["posted"])).toBe(false);
    expect(isNoticeKind(undefined)).toBe(false);
  });
});
