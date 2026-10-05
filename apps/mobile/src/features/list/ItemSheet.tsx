import { useEffect, useState } from "react";
import { View } from "react-native";
import { useQuery } from "convex/react";
import { Basket, Trash } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { formatNaira, ITEM_LIMITS, itemProblem, type Kobo } from "@ojarun/shared";
import { Button, Chip, Input, MoneyInput, Pressable, Sheet, Sticker, Text, stickerFor, type SheetController } from "@/components";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import type { ListItem } from "./useListDraft";

/** What the sheet is editing: a catalogue match, a free-text name, or an item already on the list. */
export type ItemTarget = {
  name: string;
  catalogItemId?: Id<"catalogItems">;
  unitHint?: string | null;
  presetPreferences?: { group: string; options: string[] }[];
  suggestedBudgetsKobo?: number[] | null;
  /** Set when editing an item already on the list. */
  existing?: ListItem;
};

type Props = {
  sheet: SheetController;
  target: ItemTarget | null;
  onSave: (item: Omit<ListItem, "key">) => void;
  onRemove?: (key: string) => void;
};

export function ItemSheet({ sheet, target, onSave, onRemove }: Props) {
  const settings = useQuery(api.settings.publicSettings);
  const [budget, setBudget] = useState<Kobo | null>(null);
  const [other, setOther] = useState(false);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const chips = target?.suggestedBudgetsKobo?.length ? target.suggestedBudgetsKobo : (settings?.genericBudgetChipsKobo ?? []);
  const groups = target?.presetPreferences ?? [];

  // Reset whenever a different item opens.
  useEffect(() => {
    if (!target) return;
    const existing = target.existing;
    setBudget(existing?.budget ?? null);
    setOther(!!existing && !chips.includes(existing.budget));
    const prefs: Record<string, string> = {};
    for (const g of groups) {
      const hit = g.options.find((o) => existing?.preferences.includes(o));
      if (hit) prefs[g.group] = hit;
    }
    setPicked(prefs);
    setNote(existing?.note ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!target) return <Sheet sheet={sheet} title=" " variant="form">{null}</Sheet>;

  const kind = stickerFor(target.name);
  const editing = !!target.existing;
  const dirty = budget !== (target.existing?.budget ?? null) || note !== (target.existing?.note ?? "");

  const save = () => {
    const item = {
      name: target.name.trim(),
      catalogItemId: target.catalogItemId,
      budget: budget ?? 0,
      preferences: Object.values(picked),
      note: note.trim() || undefined,
    };
    const problem = itemProblem(item);
    if (problem) {
      haptic.error();
      setError(problem);
      return;
    }
    haptic.success();
    onSave(item);
    sheet.dismiss();
  };

  return (
    <Sheet
      sheet={sheet}
      variant="form"
      dirty={dirty}
      title={target.name}
      subtitle={target.unitHint ? `Sold by the ${target.unitHint}` : "Tell your shopper how much to spend"}
      leading={kind ? <Sticker kind={kind} size={56} /> : <FallbackTile />}
      footer={
        <>
          <Button
            label={budget ? `${editing ? "Save" : "Add to list"} · ${formatNaira(budget)}` : "Choose a budget"}
            disabled={!budget}
            onPress={save}
          />
          {editing && onRemove ? (
            <Button
              label="Remove from list"
              variant="ghost"
              icon={Trash}
              onPress={() => {
                onRemove(target.existing!.key);
                sheet.dismiss();
              }}
            />
          ) : null}
        </>
      }
    >
      <View className="gap-6">
        <View className="gap-2.5">
          <Text variant="smallStrong">How much should we spend?</Text>
          <View className="flex-row gap-2">
            {chips.map((amount) => (
              <BudgetChip
                key={amount}
                label={formatNaira(amount)}
                selected={!other && budget === amount}
                onPress={() => {
                  setOther(false);
                  setBudget(amount);
                  setError(null);
                }}
              />
            ))}
            <BudgetChip
              label="Other"
              selected={other}
              onPress={() => {
                setOther(true);
                setError(null);
              }}
            />
          </View>
          {other ? (
            <MoneyInput
              inSheet
              label="Your budget"
              value={budget}
              onChange={(v) => {
                setBudget(v);
                setError(null);
              }}
              quickAmounts={[]}
              autoFocus
              error={error}
            />
          ) : error ? (
            <Text variant="small" tone="error" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : (
            <Text variant="small" tone="faint">
              Your shopper never spends more without asking you first.
            </Text>
          )}
        </View>

        {groups.map((g) => (
          <View key={g.group} className="gap-2.5">
            <Text variant="smallStrong">{g.group}</Text>
            <View className="flex-row flex-wrap gap-2">
              {g.options.map((option) => (
                <Chip
                  key={option}
                  label={option}
                  selected={picked[g.group] === option}
                  onPress={() =>
                    setPicked((p) => {
                      const next = { ...p };
                      if (next[g.group] === option) delete next[g.group];
                      else next[g.group] = option;
                      return next;
                    })
                  }
                />
              ))}
            </View>
          </View>
        ))}

        <Input
          inSheet
          label="Anything else for your shopper? (optional)"
          placeholder={groups.length ? "e.g. no bruises, big size" : "e.g. brand, size or how many"}
          value={note}
          onChangeText={setNote}
          maxLength={ITEM_LIMITS.noteMax}
        />
      </View>
    </Sheet>
  );
}

function BudgetChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      className={`flex-1 items-center justify-center rounded-[12px] ${selected ? "bg-brand" : "bg-surface"}`}
      style={{ height: 48, borderWidth: selected ? 0 : 1.5, borderColor: colors.lineStrong }}
    >
      <Text variant="bodyStrong" tone={selected ? "onBrand" : "ink"} tabular style={{ fontSize: 15 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function FallbackTile({ size = 56 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      className="items-center justify-center bg-surface-sunken"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
      accessible={false}
    >
      <Basket size={Math.round(size * 0.46)} color={colors.inkFaint} weight="duotone" />
    </View>
  );
}
