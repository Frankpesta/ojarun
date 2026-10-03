import { describe, expect, it } from "vitest";
import {
  addDays,
  bookableDates,
  formatLagosDay,
  formatLagosTime,
  formatMinutes,
  lagosAt,
  lagosDate,
  lagosDayOfWeek,
  lagosMidnight,
  parseMinutes,
  slotInstants,
  slotTemplateProblems,
} from "./time";

describe("Lagos dates", () => {
  it("rolls over at Lagos midnight, not UTC midnight", () => {
    // 23:30 UTC on 2 Oct is 00:30 WAT on 3 Oct.
    expect(lagosDate(Date.UTC(2026, 9, 2, 23, 30))).toBe("2026-10-03");
    expect(lagosDate(Date.UTC(2026, 9, 2, 22, 59))).toBe("2026-10-02");
  });

  it("finds Lagos midnight and minute offsets", () => {
    expect(lagosMidnight("2026-10-03")).toBe(Date.UTC(2026, 9, 2, 23, 0));
    expect(lagosAt("2026-10-03", 13 * 60)).toBe(Date.UTC(2026, 9, 3, 12, 0));
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("gives the Lagos day of week", () => {
    expect(lagosDayOfWeek("2026-10-03")).toBe(6); // Saturday
    expect(lagosDayOfWeek("2026-10-04")).toBe(0); // Sunday
  });

  it("lists today plus the days ahead", () => {
    const lateNight = Date.UTC(2026, 9, 2, 23, 30); // 00:30 WAT, 3 Oct
    expect(bookableDates(lateNight, 1)).toEqual(["2026-10-03", "2026-10-04"]);
  });

  it("rejects malformed dates", () => {
    expect(() => lagosMidnight("3/10/2026")).toThrow();
  });
});

describe("minutes", () => {
  it("formats and parses", () => {
    expect(formatMinutes(13 * 60)).toBe("13:00");
    expect(formatMinutes(9 * 60 + 5)).toBe("09:05");
    expect(parseMinutes("9:30")).toBe(570);
    expect(parseMinutes("24:00")).toBeNull();
    expect(parseMinutes("noon")).toBeNull();
  });
});

describe("slot templates", () => {
  const ok = { cutoffMin: 600, windowStartMin: 780, windowEndMin: 900, daysOfWeek: [1, 2, 3] };

  it("accepts a valid template", () => {
    expect(slotTemplateProblems(ok)).toEqual([]);
  });

  it("rejects a cutoff after the window start and an inverted window", () => {
    expect(slotTemplateProblems({ ...ok, cutoffMin: 800 })).toContain("The cutoff must be before the window starts.");
    expect(slotTemplateProblems({ ...ok, windowEndMin: 700 })).toContain("The window must end after it starts.");
    expect(slotTemplateProblems({ ...ok, daysOfWeek: [] })).toContain("Pick at least one day.");
  });

  it("computes instants on a date", () => {
    expect(slotInstants(ok, "2026-10-03")).toEqual({
      cutoffAt: Date.UTC(2026, 9, 3, 9, 0),
      windowStart: Date.UTC(2026, 9, 3, 12, 0),
      windowEnd: Date.UTC(2026, 9, 3, 14, 0),
    });
  });
});

describe("display", () => {
  const now = Date.UTC(2026, 9, 3, 7, 0); // Sat 08:00 WAT
  it("formats Lagos times and days", () => {
    expect(formatLagosTime(Date.UTC(2026, 9, 3, 12, 0))).toBe("13:00");
    expect(formatLagosDay("2026-10-03", now)).toBe("Today");
    expect(formatLagosDay("2026-10-04", now)).toBe("Tomorrow");
    expect(formatLagosDay("2026-10-05", now)).toBe("Mon 5 Oct");
  });
});
