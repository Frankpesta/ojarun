import { useEffect, useState } from "react";
import { View } from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useQuery } from "convex/react";
import { MagnifyingGlass, PencilSimpleLine } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import { ITEM_LIMITS } from "@ojarun/shared";
import { Input, Pressable, Sheet, Sticker, Text, stickerFor, type SheetController } from "@/components";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { FallbackTile, type ItemTarget } from "./ItemSheet";

type Row = { kind: "catalog"; target: ItemTarget; key: string } | { kind: "free"; name: string; key: string };

/** Step one of adding an item: find it in the catalogue, or keep exactly what was typed. */
export function ItemSearchSheet({ sheet, onPick }: { sheet: SheetController; onPick: (target: ItemTarget) => void }) {
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 180);
    return () => clearTimeout(t);
  }, [query]);

  const searching = debounced.length >= 2;
  const results = useQuery(api.catalog.searchItems, searching ? { query: debounced } : "skip");
  const popular = useQuery(api.catalog.featured, searching ? "skip" : {});

  const typed = query.trim();
  const exact = results?.some((r) => r.name.toLowerCase() === typed.toLowerCase());
  const source = searching ? (results ?? []) : (popular ?? []);
  const rows: Row[] = [
    ...(typed.length >= 2 && !exact ? [{ kind: "free" as const, name: typed, key: "free" }] : []),
    ...source.map((r) => ({
      kind: "catalog" as const,
      key: r._id,
      target: {
        name: r.name,
        catalogItemId: r._id,
        unitHint: r.unitHint,
        presetPreferences: r.presetPreferences,
        suggestedBudgetsKobo: r.suggestedBudgetsKobo,
      },
    })),
  ];

  const pick = (target: ItemTarget) => {
    haptic.select();
    sheet.dismiss();
    onPick(target);
  };

  return (
    <Sheet sheet={sheet} variant="list" title="Add an item" onDismiss={() => setQuery("")}>
      <View className="px-5 pb-2">
        <Input
          inSheet
          label="What do you need?"
          placeholder="e.g. rice, ugu, crayfish"
          value={query}
          onChangeText={setQuery}
          maxLength={ITEM_LIMITS.nameMax}
          autoFocus
          autoCorrect={false}
          leading={<MagnifyingGlass size={20} color={colors.inkFaint} />}
        />
      </View>
      <BottomSheetFlatList
        data={rows}
        keyExtractor={(r: Row) => r.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          !searching && rows.length ? (
            <Text variant="caption" tone="faint" className="px-5 pt-2 pb-1 uppercase" style={{ letterSpacing: 0.5 }}>
              Popular in Akure
            </Text>
          ) : null
        }
        ListEmptyComponent={
          searching && results === undefined ? null : (
            <Text variant="small" tone="muted" className="px-5 pt-2">
              Type anything. If it's sold in the market, your shopper can find it.
            </Text>
          )
        }
        renderItem={({ item }: { item: Row }) =>
          item.kind === "free" ? (
            <Pressable
              onPress={() => pick({ name: item.name })}
              accessibilityRole="button"
              accessibilityLabel={`Add ${item.name} as written`}
              className="flex-row items-center gap-3 px-5 py-2.5"
              style={{ minHeight: 64 }}
            >
              <View className="h-12 w-12 items-center justify-center rounded-[14px] bg-brand-tint">
                <PencilSimpleLine size={22} color={colors.brand} weight="bold" />
              </View>
              <View className="flex-1">
                <Text variant="bodyStrong" numberOfLines={1}>
                  Add “{item.name}”
                </Text>
                <Text variant="small" tone="faint">
                  Exactly as you typed it
                </Text>
              </View>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => pick(item.target)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${item.target.name}`}
              className="flex-row items-center gap-3 px-5 py-2.5"
              style={{ minHeight: 64 }}
            >
              {stickerFor(item.target.name) ? <Sticker kind={stickerFor(item.target.name)!} size={48} /> : <FallbackTile size={48} />}
              <View className="flex-1">
                <Text variant="bodyStrong" numberOfLines={1}>
                  {item.target.name}
                </Text>
                {item.target.unitHint ? (
                  <Text variant="small" tone="faint" numberOfLines={1}>
                    By the {item.target.unitHint}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          )
        }
      />
    </Sheet>
  );
}
