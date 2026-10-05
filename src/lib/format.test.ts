import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, inrWhole, monthLabel } from "./format";

describe("dates and months", () => {
  it("writes September as Sep, not Sept", () => {
    expect(monthLabel("2026-09-01")).toBe("Sep 2026");
    expect(formatDate("2026-09-04")).toBe("04 Sep 2026");
    expect(formatDateTime("2026-09-04T10:00:00Z")).toMatch(/^04 Sep 2026, 3:30\s*pm$/i);
  });

  it("keeps the long month for headings", () => {
    expect(monthLabel("2026-09-01", "long")).toBe("September 2026");
  });

  it("formats every short month with three letters", () => {
    const months = Array.from({ length: 12 }, (_, i) => monthLabel(`2026-${String(i + 1).padStart(2, "0")}-01`).split(" ")[0]);
    expect(months).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
  });
});

describe("whole rupees", () => {
  it("drops paise for dashboard figures", () => {
    expect(inrWhole(85100)).toBe("₹85,100");
    expect(inrWhole(3810.4)).toBe("₹3,810");
  });
});
