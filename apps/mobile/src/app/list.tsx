import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { ArrowDown, ArrowRight, ArrowUp, CaretDown, Plus, Storefront } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import { formatNaira } from "@ojarun/shared";
import { BackButton, Button, Pressable, Sticker, Text, stickerFor, useSheet, useToast } from "@/components";
import { RoleGuard } from "@/features/auth/RoleGuard";
import { ItemSearchSheet } from "@/features/list/ItemSearchSheet";
import { FallbackTile, ItemSheet, type ItemTarget } from "@/features/list/ItemSheet";
import { MarketSheet } from "@/features/list/MarketSheet";
import { draftBudgetTotal, useListDraft, type ListItem } from "@/features/list/useListDraft";
import { useOrderSetup } from "@/features/list/useOrderSetup";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

export default function ListScreen() {
  return (
    <RoleGuard role="customer">
      <ListBuilder />
    </RoleGuard>
  );
}

function ListBuilder() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const params = useLocalSearchParams<{ add?: string; search?: string }>();
  const { items, add, update, remove, restore, move, setMarket } = useListDraft();
  const setup = useOrderSetup();
  const settings = useQuery(api.settings.publicSettings);
  const featured = useQuery(api.catalog.featured);

  const search = useSheet();
  const itemSheet = useSheet();
  const marketSheet = useSheet();
  const [target, setTarget] = useState<ItemTarget | null>(null);
  const [reordering, setReordering] = useState(false);

  const openItem = (t: ItemTarget) => {
    setTarget(t);
    // Let the sheet render the new item before it rises.
    requestAnimationFrame(() => itemSheet.present());
  };

  const edit = (item: ListItem) => openItem({ name: item.name, catalogItemId: item.catalogItemId, ...item.meta, existing: item });

  // Deep links from Home: open search, or go straight to one catalogue item.
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    if (params.search) {
      handled.current = true;
      requestAnimationFrame(() => search.present());
    } else if (params.add && featured) {
      handled.current = true;
      const f = featured.find((x) => x._id === params.add);
      if (f) openItem({ ...f, catalogItemId: f._id });
      else requestAnimationFrame(() => search.present());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.search, params.add, featured]);

  useEffect(() => {
    if (items.length < 2) setReordering(false);
  }, [items.length]);

  const max = settings?.maxItemsPerOrder ?? 25;
  const full = items.length >= max;
  const total = draftBudgetTotal(items);
  const suggestions = (featured ?? []).filter((f) => !items.some((i) => i.catalogItemId === f._id)).slice(0, 6);

  const startAdd = () => {
    if (full) {
      toast.show({ message: `One order can have up to ${max} items. Start another order for the rest.`, tone: "error" });
      return;
    }
    search.present();
  };

  const removeItem = (key: string) => {
    const index = items.findIndex((i) => i.key === key);
    const removed = remove(key);
    if (removed) toast.show({ message: `${removed.name} removed`, action: { label: "Undo", onPress: () => restore(removed, index) } });
  };

  return (
    <View className="flex-1 bg-bg">
      <SafeAreaView edges={["top"]} className="flex-1">
        <View className="flex-row items-center justify-between px-gutter pt-2">
          <BackButton />
          {setup.hasAddress ? (
            <Pressable
              onPress={() => marketSheet.present()}
              accessibilityRole="button"
              accessibilityLabel={setup.market ? `Shopping at ${setup.market.name}. Change market` : "Choose a market"}
              className="h-10 flex-row items-center gap-1.5 rounded-full border border-line bg-surface px-3"
            >
              <Storefront size={17} color={colors.brand} weight="bold" />
              <Text variant="smallStrong" numberOfLines={1} style={{ maxWidth: 180 }}>
                {setup.market?.name ?? (setup.quotesError ? "Choose market" : "Finding markets…")}
              </Text>
              <CaretDown size={14} color={colors.ink} weight="bold" />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-gutter gap-4"
          contentContainerStyle={{ paddingBottom: 32, paddingTop: 12 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row items-end justify-between">
            <Text variant="title" accessibilityRole="header">
              Your list
            </Text>
            {items.length > 1 ? (
              <Pressable
                onPress={() => {
                  haptic.select();
                  setReordering((r) => !r);
                }}
                accessibilityRole="button"
                className="justify-center px-1"
                style={{ minHeight: 44 }}
              >
                <Text variant="smallStrong" tone="brand">
                  {reordering ? "Done" : "Reorder"}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={startAdd}
            accessibilityRole="button"
            accessibilityLabel="Add an item"
            className="flex-row items-center gap-2.5 rounded-button bg-surface px-4"
            style={{ height: 54, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.lineStrong }}
          >
            <Plus size={20} color={colors.brand} weight="bold" />
            <Text variant="body" tone="faint" numberOfLines={1} className="flex-1">
              Add an item, e.g. rice, ugu, crayfish
            </Text>
          </Pressable>

          {items.length === 0 ? (
            <EmptyList />
          ) : (
            <View className="overflow-hidden rounded-card border border-line bg-surface">
              {items.map((item, i) => (
                <ItemRow
                  key={item.key}
                  item={item}
                  last={i === items.length - 1}
                  reordering={reordering}
                  canUp={i > 0}
                  canDown={i < items.length - 1}
                  onPress={() => edit(item)}
                  onMove={(by) => {
                    haptic.select();
                    move(item.key, by);
                  }}
                />
              ))}
            </View>
          )}

          {suggestions.length && !full ? (
            <View className="gap-2.5 pt-1">
              <Text variant="smallStrong" tone="muted">
                {items.length ? "People often add" : "Popular in Akure"}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {suggestions.map((s) => {
                  const kind = stickerFor(s.name);
                  return (
                    <Pressable
                      key={s._id}
                      onPress={() => openItem({ ...s, catalogItemId: s._id })}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${s.name}`}
                      className="flex-row items-center gap-1.5 rounded-full border border-line bg-surface pl-1.5 pr-3"
                      style={{ height: 40 }}
                    >
                      {kind ? <Sticker kind={kind} size={28} /> : <FallbackTile size={28} />}
                      <Text variant="smallStrong">
                        {s.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View
          className="gap-3 border-t border-line bg-surface px-gutter pt-3.5"
          style={{
            paddingBottom: Math.max(insets.bottom, 12) + 14,
            shadowColor: "#3C2D14",
            shadowOpacity: 0.06,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: -8 },
            elevation: 8,
          }}
        >
          <View className="flex-row items-baseline justify-between">
            <Text variant="small" tone="muted">
              {items.length} {items.length === 1 ? "item" : "items"} · budget total
            </Text>
            <Text variant="heading" tabular style={{ fontSize: 20 }}>
              {formatNaira(total)}
            </Text>
          </View>
          <Button
            label="Choose delivery time"
            trailingIcon={ArrowRight}
            disabled={items.length === 0}
            onPress={() => {
              if (setup.hasAddress === false) router.push("/address");
              else router.push("/checkout");
            }}
          />
        </View>
      </SafeAreaView>

      <ItemSearchSheet sheet={search} onPick={openItem} />
      <ItemSheet
        sheet={itemSheet}
        target={target}
        onSave={(item) => {
          if (!target) return;
          const meta = {
            unitHint: target.unitHint,
            presetPreferences: target.presetPreferences,
            suggestedBudgetsKobo: target.suggestedBudgetsKobo,
          };
          if (target.existing) update(target.existing.key, { ...item, meta });
          else add({ ...item, meta });
        }}
        onRemove={removeItem}
      />
      <MarketSheet
        sheet={marketSheet}
        quotes={setup.quotes}
        error={setup.quotesError}
        onRetry={setup.retryQuotes}
        selected={setup.market?.marketId ?? null}
        onSelect={setMarket}
      />
    </View>
  );
}

function ItemRow({
  item,
  last,
  reordering,
  canUp,
  canDown,
  onPress,
  onMove,
}: {
  item: ListItem;
  last: boolean;
  reordering: boolean;
  canUp: boolean;
  canDown: boolean;
  onPress: () => void;
  onMove: (by: -1 | 1) => void;
}) {
  const { colors } = useTheme();
  const kind = stickerFor(item.name);
  const details = [...item.preferences, item.note].filter(Boolean).join(" · ");
  return (
    <Pressable
      scale={false}
      onPress={reordering ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, budget ${formatNaira(item.budget)}${details ? `, ${details}` : ""}`}
      accessibilityHint="Edit or remove"
      accessibilityActions={[
        ...(canUp ? [{ name: "moveUp", label: "Move up" }] : []),
        ...(canDown ? [{ name: "moveDown", label: "Move down" }] : []),
      ]}
      onAccessibilityAction={(e) => onMove(e.nativeEvent.actionName === "moveUp" ? -1 : 1)}
      className={`flex-row items-center gap-3 px-3.5 py-3 ${last ? "" : "border-b border-line-soft"}`}
    >
      {kind ? <Sticker kind={kind} size={52} /> : <FallbackTile size={52} />}
      <View className="flex-1 gap-0.5">
        <Text variant="bodyStrong" numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="small" tone="faint" numberOfLines={1}>
          {details || "Any is fine"}
        </Text>
      </View>
      {reordering ? (
        <View className="flex-row gap-1.5">
          <MoveButton label={`Move ${item.name} up`} disabled={!canUp} onPress={() => onMove(-1)}>
            <ArrowUp size={18} color={canUp ? colors.ink : colors.inkFaint} weight="bold" />
          </MoveButton>
          <MoveButton label={`Move ${item.name} down`} disabled={!canDown} onPress={() => onMove(1)}>
            <ArrowDown size={18} color={canDown ? colors.ink : colors.inkFaint} weight="bold" />
          </MoveButton>
        </View>
      ) : (
        <View className="items-end gap-0.5 pl-2">
          <Text variant="bodyStrong" tabular>
            {formatNaira(item.budget)}
          </Text>
          <Text variant="caption" tone="brand">
            Edit
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function MoveButton({ label, disabled, onPress, children }: { label: string; disabled: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`items-center justify-center rounded-full bg-surface-sunken ${disabled ? "opacity-40" : ""}`}
      style={{ width: 44, height: 44 }}
    >
      {children}
    </Pressable>
  );
}

function EmptyList() {
  return (
    <View className="items-center gap-4 rounded-card border border-line bg-surface px-6 py-8">
      <View className="flex-row" accessible={false} importantForAccessibility="no-hide-descendants">
        <View style={{ transform: [{ rotate: "-8deg" }] }}>
          <Sticker kind="tomato" size={56} />
        </View>
        <View style={{ marginLeft: -12, marginTop: -6, transform: [{ rotate: "6deg" }] }}>
          <Sticker kind="onion" size={56} />
        </View>
        <View style={{ marginLeft: -12, transform: [{ rotate: "-4deg" }] }}>
          <Sticker kind="pepper" size={56} />
        </View>
      </View>
      <View className="items-center gap-1.5">
        <Text variant="heading" className="text-center">
          What's for the pot?
        </Text>
        <Text variant="body" tone="muted" className="text-center">
          Add each item with a budget. Your shopper buys the best they can for that amount.
        </Text>
      </View>
    </View>
  );
}
