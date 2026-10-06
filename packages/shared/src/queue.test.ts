import { describe, expect, it } from "vitest";
import { backoffMs, nextDueAt, runnableJobs, type QueueJobBase } from "./queue";

const job = (id: string, lane: string, createdAt: number, extra: Partial<QueueJobBase> = {}): QueueJobBase => ({
  id,
  lane,
  createdAt,
  attempts: 0,
  nextAttemptAt: 0,
  status: "pending",
  ...extra,
});

describe("backoffMs", () => {
  it("doubles from 2 s and caps at 5 min", () => {
    expect([1, 2, 3, 4].map(backoffMs)).toEqual([2_000, 4_000, 8_000, 16_000]);
    expect(backoffMs(20)).toBe(300_000);
  });
});

describe("runnableJobs", () => {
  it("runs only the oldest job in each lane", () => {
    const jobs = [job("b2", "B", 4), job("a1", "A", 1), job("a2", "A", 2), job("b1", "B", 3)];
    expect(runnableJobs(jobs, 10).map((j) => j.id)).toEqual(["a1", "b1"]);
  });

  it("waits for a backoff to pass", () => {
    expect(runnableJobs([job("a", "A", 1, { nextAttemptAt: 50 })], 10)).toEqual([]);
    expect(runnableJobs([job("a", "A", 1, { nextAttemptAt: 50 })], 50)).toHaveLength(1);
  });

  it("lets a failed or running head block the rest of its lane", () => {
    const jobs = [job("a1", "A", 1, { status: "failed" }), job("a2", "A", 2), job("b1", "B", 3, { status: "running" }), job("b2", "B", 4)];
    expect(runnableJobs(jobs, 10)).toEqual([]);
  });
});

describe("nextDueAt", () => {
  it("finds the soonest pending job", () => {
    expect(nextDueAt([job("a", "A", 1, { nextAttemptAt: 30 }), job("b", "B", 1, { nextAttemptAt: 20, status: "failed" }), job("c", "C", 1, { nextAttemptAt: 25 })])).toBe(25);
    expect(nextDueAt([])).toBeNull();
  });
});
