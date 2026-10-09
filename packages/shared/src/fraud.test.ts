import { describe, expect, it } from "vitest";
import { isNuban, maskAccount, nameMatch } from "./fraud";
import { nameTokens } from "./batching";

describe("nameMatch", () => {
  const tolu = nameTokens("Tolu Adeyemi");
  it("blocks two or more shared name parts, in any order or case", () => {
    expect(nameMatch("ADEYEMI TOLU BISI", tolu, 2)).toBe("block");
    expect(nameMatch("adeyemi, tolu", tolu, 2)).toBe("block");
  });
  it("only flags a single shared part, like a common surname", () => {
    expect(nameMatch("ADEYEMI GRACE", tolu, 2)).toBe("flag");
  });
  it("ignores unrelated names and initials", () => {
    expect(nameMatch("OKON EFFIONG T.", tolu, 2)).toBe("none");
  });
  it("treats a threshold below one as one", () => {
    expect(nameMatch("ADEYEMI GRACE", tolu, 0)).toBe("block");
  });
});

describe("accounts", () => {
  it("accepts only 10-digit NUBANs", () => {
    expect(isNuban("0123456789")).toBe(true);
    expect(isNuban("012345678")).toBe(false);
    expect(isNuban("01234567890")).toBe(false);
    expect(isNuban("01234 6789")).toBe(false);
  });
  it("masks all but the last four digits", () => {
    expect(maskAccount("0123456789")).toBe("•••• 6789");
  });
});
