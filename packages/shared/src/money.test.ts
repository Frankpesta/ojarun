import { describe, expect, it } from "vitest";
import { assertKobo, formatNaira, parseNairaInput, roundUpTo } from "./money";
import { formatNigerianPhone, normalizeNigerianPhone } from "./phone";

describe("formatNaira", () => {
  it.each([
    [0, "₦0"],
    [300_000, "₦3,000"],
    [300_050, "₦3,000.50"],
    [100_000_000, "₦1,000,000"],
    [-150_000, "−₦1,500"],
    [5, "₦0.05"],
  ])("%i kobo → %s", (kobo, expected) => {
    expect(formatNaira(kobo)).toBe(expected);
  });
});

describe("parseNairaInput", () => {
  it.each([
    ["3,000", 300_000],
    ["₦3000", 300_000],
    [" 3 000 ", 300_000],
    ["3000.5", 300_050],
    ["3000.05", 300_005],
    ["0", 0],
  ])("%s → %i", (input, expected) => {
    expect(parseNairaInput(input)).toBe(expected);
  });

  it.each(["", "abc", "3.005", "-200", "1e5"])("rejects %s", (input) => {
    expect(parseNairaInput(input)).toBeNull();
  });
});

describe("kobo helpers", () => {
  it("rounds up to a step", () => {
    expect(roundUpTo(12_001, 5_000)).toBe(15_000);
    expect(roundUpTo(15_000, 5_000)).toBe(15_000);
  });
  it("rejects non-integer kobo", () => {
    expect(() => assertKobo(10.5)).toThrow();
    expect(assertKobo(10)).toBe(10);
  });
});

describe("Nigerian phone numbers", () => {
  it.each([
    ["08031234567", "+2348031234567"],
    ["8031234567", "+2348031234567"],
    ["+234 803 123 4567", "+2348031234567"],
    ["2349061234567", "+2349061234567"],
    ["07011234567", "+2347011234567"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeNigerianPhone(input)).toBe(expected);
  });

  it.each(["0803123456", "06031234567", "+447911123456", ""])("rejects %s", (input) => {
    expect(normalizeNigerianPhone(input)).toBeNull();
  });

  it("formats for display", () => {
    expect(formatNigerianPhone("+2348031234567")).toBe("0803 123 4567");
  });
});
