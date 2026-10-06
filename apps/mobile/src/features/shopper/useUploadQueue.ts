import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { randomUUID } from "expo-crypto";
import type { Id } from "@ojarun/convex/dataModel";
import { backoffMs, type QueueJobBase } from "@ojarun/shared";
import { zustandStorage } from "@/lib/storage";
import { deleteQueuedPhoto } from "./photos";

export type ItemOutcome = "bought" | "adjusted" | "skipped";

export type QueueJob = QueueJobBase &
  (
    | { type: "startShopping"; batchId: Id<"batches">; lat?: number; lng?: number }
    | {
        type: "uploadPhoto";
        itemId: Id<"orderItems">;
        itemName: string;
        /** Local JPEG in the document directory. */
        fileUri: string;
        /** Set once the upload succeeds, so a retry only re-attaches. */
        storageId?: Id<"_storage">;
      }
    | {
        type: "setOutcome";
        itemId: Id<"orderItems">;
        itemName: string;
        outcome: ItemOutcome;
        shopperNote?: string;
        quantityNote?: string;
      }
  );

type NewJob = QueueJob extends infer J ? (J extends QueueJob ? Omit<J, keyof QueueJobBase> : never) : never;

type UploadQueue = {
  jobs: QueueJob[];
  /** Adds a job to a batch's lane. Every job in one market run runs in order. */
  enqueue: (batchId: Id<"batches">, job: NewJob, id?: string) => string;
  /** Marks a job as started, so a second runner tick can't pick it up too. */
  start: (id: string) => void;
  /** Saves progress inside a job, e.g. the storageId after an upload. */
  patch: (id: string, patch: Partial<QueueJob>) => void;
  succeed: (id: string) => void;
  /** Network trouble: try again later with backoff. */
  retryLater: (id: string, error: string) => void;
  /** The server said no: stop and wait for the shopper. Blocks the rest of the lane. */
  fail: (id: string, error: string) => void;
  retryNow: (id: string) => void;
  discard: (id: string) => void;
  /** After an app kill mid-job, put "running" jobs back to pending. */
  recover: () => void;
};

export const useUploadQueue = create<UploadQueue>()(
  persist(
    (set) => ({
      jobs: [],
      enqueue: (batchId, job, id = randomUUID()) => {
        const now = Date.now();
        set((s) => ({
          jobs: [...s.jobs, { ...job, id, lane: batchId, createdAt: now, attempts: 0, nextAttemptAt: now, status: "pending" } as QueueJob],
        }));
        return id;
      },
      start: (id) => set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, status: "running" } : j)) })),
      patch: (id, patch) => set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? ({ ...j, ...patch } as QueueJob) : j)) })),
      succeed: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),
      retryLater: (id, error) =>
        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === id
              ? { ...j, status: "pending", attempts: j.attempts + 1, nextAttemptAt: Date.now() + backoffMs(j.attempts + 1), lastError: error }
              : j,
          ),
        })),
      fail: (id, error) =>
        set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, status: "failed", attempts: j.attempts + 1, lastError: error } : j)) })),
      retryNow: (id) =>
        set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, status: "pending", nextAttemptAt: Date.now(), lastError: undefined } : j)) })),
      discard: (id) =>
        set((s) => {
          const job = s.jobs.find((j) => j.id === id);
          if (job?.type === "uploadPhoto") deleteQueuedPhoto(job.fileUri);
          return { jobs: s.jobs.filter((j) => j.id !== id) };
        }),
      recover: () => set((s) => ({ jobs: s.jobs.map((j) => (j.status === "running" ? { ...j, status: "pending" } : j)) })),
    }),
    { name: "upload-queue", version: 1, storage: createJSONStorage(() => zustandStorage) },
  ),
);

/** Jobs still to send for a batch: the shopper can't head out while any remain (05 §8). */
export const pendingForBatch = (jobs: readonly QueueJob[], batchId: string) => jobs.filter((j) => j.lane === batchId);
