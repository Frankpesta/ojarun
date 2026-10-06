/**
 * Scheduling rules for the shopper app's offline queue (05 §8). The store and the runner live in
 * the app; these pure parts decide what runs next and when a failed job retries.
 */

export type QueueJobStatus = "pending" | "running" | "failed";

export type QueueJobBase = {
  id: string;
  /** Jobs for the same order run one at a time, oldest first (a photo before its transfer). */
  lane: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  status: QueueJobStatus;
  lastError?: string;
};

const BASE_MS = 2_000;
const CAP_MS = 5 * 60_000;

/** 2 s, 4 s, 8 s … capped at 5 min. `attempts` counts failures so far (1 after the first). */
export function backoffMs(attempts: number): number {
  return Math.min(CAP_MS, BASE_MS * 2 ** Math.max(0, attempts - 1));
}

/**
 * The jobs that may start now: the head of each lane, if it's pending and due. A failed head
 * blocks its lane until the shopper retries or discards it, so later steps never run out of order.
 */
export function runnableJobs<J extends QueueJobBase>(jobs: readonly J[], now: number): J[] {
  const heads = new Map<string, J>();
  for (const job of [...jobs].sort((a, b) => a.createdAt - b.createdAt)) {
    if (!heads.has(job.lane)) heads.set(job.lane, job);
  }
  return [...heads.values()].filter((j) => j.status === "pending" && j.nextAttemptAt <= now);
}

/** When the next pending job is due, for scheduling a wake-up; null when nothing is waiting. */
export function nextDueAt(jobs: readonly QueueJobBase[]): number | null {
  let next: number | null = null;
  for (const j of jobs) if (j.status === "pending" && (next === null || j.nextAttemptAt < next)) next = j.nextAttemptAt;
  return next;
}
