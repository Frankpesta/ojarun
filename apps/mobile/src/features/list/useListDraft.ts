import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Id } from "@ojarun/convex/dataModel";
import type { Kobo } from "@ojarun/shared";
import { zustandStorage } from "@/lib/storage";

export type ListItem = {
  /** Local key for rows and edits; never sent to the server. */
  key: string;
  name: string;
  catalogItemId?: Id<"catalogItems">;
  budget: Kobo;
  preferences: string[];
  note?: string;
  /** Catalogue details kept on the phone so editing shows the same chips. Not sent with the order. */
  meta?: {
    unitHint?: string | null;
    presetPreferences?: { group: string; options: string[] }[];
    suggestedBudgetsKobo?: number[] | null;
  };
};

type ListDraft = {
  items: ListItem[];
  marketId: Id<"markets"> | null;
  /** Delivery address for this list; null means the most recently saved one. */
  addressId: Id<"addresses"> | null;
  add: (item: Omit<ListItem, "key">) => void;
  update: (key: string, item: Omit<ListItem, "key">) => void;
  remove: (key: string) => ListItem | undefined;
  restore: (item: ListItem, index: number) => void;
  move: (key: string, by: -1 | 1) => void;
  setMarket: (marketId: Id<"markets">) => void;
  setAddress: (addressId: Id<"addresses">) => void;
  clear: () => void;
};

const newKey = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** The list being built, saved on the phone so it survives restarts (decided 2026-10-05). */
export const useListDraft = create<ListDraft>()(
  persist(
    (set, get) => ({
      items: [],
      marketId: null,
      addressId: null,
      add: (item) => set((s) => ({ items: [...s.items, { ...item, key: newKey() }] })),
      update: (key, item) => set((s) => ({ items: s.items.map((i) => (i.key === key ? { ...item, key } : i)) })),
      remove: (key) => {
        const item = get().items.find((i) => i.key === key);
        set((s) => ({ items: s.items.filter((i) => i.key !== key) }));
        return item;
      },
      restore: (item, index) =>
        set((s) => {
          const items = [...s.items];
          items.splice(Math.min(index, items.length), 0, item);
          return { items };
        }),
      move: (key, by) =>
        set((s) => {
          const from = s.items.findIndex((i) => i.key === key);
          const to = from + by;
          if (from < 0 || to < 0 || to >= s.items.length) return s;
          const items = [...s.items];
          const [moved] = items.splice(from, 1);
          items.splice(to, 0, moved!);
          return { items };
        }),
      setMarket: (marketId) => set({ marketId }),
      setAddress: (addressId) => set({ addressId }),
      clear: () => set({ items: [] }),
    }),
    { name: "list-draft", version: 1, storage: createJSONStorage(() => zustandStorage) },
  ),
);

export const draftBudgetTotal = (items: readonly ListItem[]) => items.reduce((sum, i) => sum + i.budget, 0);
