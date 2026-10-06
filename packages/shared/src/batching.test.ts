import { describe, expect, it } from "vitest";
import { assignByLoad, bearingGap, clusterByBearing, compassPoint, meanBearing, nameTokens } from "./batching";

const o = (id: string, bearing: number) => ({ id, bearing });
const ids = (batches: { id: string }[][]) => batches.map((b) => b.map((x) => x.id));

describe("clusterByBearing", () => {
  it("returns nothing for no orders and one batch when they fit", () => {
    expect(clusterByBearing([], 4)).toEqual([]);
    expect(ids(clusterByBearing([o("a", 90), o("b", 10)], 4))).toEqual([["b", "a"]]);
  });

  it("keeps orders either side of north together", () => {
    const orders = [o("n1", 350), o("e", 90), o("n2", 10), o("s", 180), o("n3", 5), o("se", 135)];
    const batches = ids(clusterByBearing(orders, 3));
    expect(batches).toHaveLength(2);
    expect(batches.find((b) => b.includes("n1"))!.sort()).toEqual(["n1", "n2", "n3"]);
  });

  it("uses the fewest batches and balances their sizes", () => {
    const orders = Array.from({ length: 9 }, (_, i) => o(`o${i}`, i * 40));
    const sizes = clusterByBearing(orders, 4).map((b) => b.length);
    expect(sizes).toEqual([3, 3, 3]);
    expect(clusterByBearing(orders.slice(0, 5), 4).map((b) => b.length)).toEqual([3, 2]);
  });

  it("never loses or duplicates an order", () => {
    const orders = Array.from({ length: 17 }, (_, i) => o(`o${i}`, (i * 137) % 360));
    const flat = clusterByBearing(orders, 4)
      .flat()
      .map((x) => x.id)
      .sort();
    expect(flat).toEqual(orders.map((x) => x.id).sort());
  });

  it("rejects a non-positive batch size", () => {
    expect(() => clusterByBearing([o("a", 1)], 0)).toThrow();
  });
});

describe("assignByLoad", () => {
  it("gives each batch to the least-loaded shopper, round robin on ties", () => {
    expect(
      assignByLoad(3, [
        { id: "ada", load: 0 },
        { id: "bayo", load: 0 },
      ]),
    ).toEqual(["ada", "bayo", "ada"]);
    expect(
      assignByLoad(2, [
        { id: "ada", load: 2 },
        { id: "bayo", load: 0 },
      ]),
    ).toEqual(["bayo", "bayo"]);
  });

  it("leaves batches unassigned when nobody is on shift", () => {
    expect(assignByLoad(2, [])).toEqual([undefined, undefined]);
  });
});

describe("bearing helpers", () => {
  it("measures the short way round", () => {
    expect(bearingGap(350, 10)).toBe(20);
    expect(bearingGap(90, 270)).toBe(180);
  });

  it("averages across north", () => {
    expect(Math.round(meanBearing([350, 10]))).toBe(0);
    expect(Math.round(meanBearing([80, 100]))).toBe(90);
  });

  it("names compass points", () => {
    expect([0, 44, 91, 180, 315, 359].map(compassPoint)).toEqual(["N", "NE", "E", "S", "NW", "N"]);
  });
});

describe("nameTokens", () => {
  it("normalises accents, case and punctuation, and drops initials", () => {
    expect(nameTokens("Adé-Bólá  OKON")).toEqual(["ade", "bola", "okon"]);
    expect(nameTokens("Chidi O. Eze")).toEqual(["chidi", "eze"]);
  });
});
