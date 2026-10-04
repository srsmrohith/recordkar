import { describe, expect, it } from "vitest";
import { clampScroll } from "./scroll";

describe("problem 5: keep the scroll position after bulk actions", () => {
  it("restores the saved position when the page is still tall enough", () => {
    expect(clampScroll(1200, 5000, 800)).toBe(1200);
  });

  it("clamps to the new bottom when posted cards made the page shorter", () => {
    expect(clampScroll(4000, 3000, 800)).toBe(2200);
  });

  it("never goes negative on a short page", () => {
    expect(clampScroll(500, 600, 800)).toBe(0);
  });
});
