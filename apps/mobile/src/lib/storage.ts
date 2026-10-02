import { createMMKV } from "react-native-mmkv";
import type { StateStorage } from "zustand/middleware";

/** App-wide MMKV instance. Synchronous, so persisted state is ready before first paint. */
export const storage = createMMKV({ id: "ojarun" });

export const zustandStorage: StateStorage = {
  getItem: (key) => storage.getString(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => {
    storage.remove(key);
  },
};
