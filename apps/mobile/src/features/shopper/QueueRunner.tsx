import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useConvex, type ConvexReactClient } from "convex/react";
import { ConvexError } from "convex/values";
import { File, UploadType } from "expo-file-system";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { runnableJobs } from "@ojarun/shared";
import { friendlyError } from "@/lib/errors";
import { deleteQueuedPhoto } from "./photos";
import { useUploadQueue, type QueueJob } from "./useUploadQueue";

const TICK_MS = 15_000;

/** Codes that won't change on retry: the shopper has to look at it. Everything else retries. */
const PERMANENT = new Set(["INVALID_INPUT", "INVALID_TRANSITION", "NOT_FOUND", "FORBIDDEN"]);

class TransientError extends Error {}

async function perform(convex: ConvexReactClient, job: QueueJob): Promise<void> {
  const queue = useUploadQueue.getState();
  switch (job.type) {
    case "startShopping":
      await convex.mutation(api.shopper.startShopping, { batchId: job.batchId, lat: job.lat, lng: job.lng });
      return;
    case "setOutcome":
      await convex.mutation(api.items.setOutcome, {
        itemId: job.itemId,
        status: job.outcome,
        shopperNote: job.shopperNote,
        quantityNote: job.quantityNote,
      });
      return;
    case "uploadPhoto": {
      let storageId = job.storageId;
      if (!storageId) {
        const file = new File(job.fileUri);
        if (!file.exists) throw new ConvexError({ code: "INVALID_INPUT", message: "The photo is missing from this phone. Take it again." });
        const url = await convex.mutation(api.items.generateUploadUrl, {});
        const res = await file.upload(url, {
          httpMethod: "POST",
          uploadType: UploadType.BINARY_CONTENT,
          headers: { "Content-Type": "image/jpeg" },
        });
        if (res.status < 200 || res.status >= 300) throw new TransientError(`Upload failed (${res.status})`);
        storageId = (JSON.parse(res.body) as { storageId: Id<"_storage"> }).storageId;
        queue.patch(job.id, { storageId });
      }
      await convex.mutation(api.items.attachPhoto, { itemId: job.itemId, storageId });
      deleteQueuedPhoto(job.fileUri);
      return;
    }
  }
}

/**
 * Sends the shopper's queued work (05 §8): on start, when the network comes back, when the app
 * returns to the foreground, and every 15 s while anything is waiting. One job per market run at a
 * time, so a photo always lands before the outcome that needs it. Mounted once, in the shopper tabs.
 */
export function QueueRunner() {
  const convex = useConvex();
  const busy = useRef(false);

  useEffect(() => {
    useUploadQueue.getState().recover();

    const drain = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        for (;;) {
          const queue = useUploadQueue.getState();
          const ready = runnableJobs(queue.jobs, Date.now());
          if (ready.length === 0) break;
          const net = await NetInfo.fetch();
          if (net.isConnected === false) break;
          await Promise.all(
            ready.map(async (job) => {
              queue.start(job.id);
              try {
                await perform(convex, job);
                useUploadQueue.getState().succeed(job.id);
              } catch (e) {
                const code = e instanceof ConvexError ? (e.data as { code?: string } | undefined)?.code : undefined;
                if (code && PERMANENT.has(code)) useUploadQueue.getState().fail(job.id, friendlyError(e));
                else useUploadQueue.getState().retryLater(job.id, e instanceof Error ? e.message : "Couldn't send");
              }
            }),
          );
        }
      } finally {
        busy.current = false;
      }
    };

    void drain();
    const net = NetInfo.addEventListener((s) => {
      if (s.isConnected) void drain();
    });
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active") void drain();
    });
    const tick = setInterval(() => {
      if (useUploadQueue.getState().jobs.length) void drain();
    }, TICK_MS);
    // Wake promptly for new or retried work instead of waiting for the tick. Cheap while busy.
    const unsub = useUploadQueue.subscribe((s, prev) => {
      if (s.jobs !== prev.jobs) void drain();
    });
    return () => {
      net();
      app.remove();
      clearInterval(tick);
      unsub();
    };
  }, [convex]);

  return null;
}
