import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { MagnifyingGlass, MapPin } from "phosphor-react-native";
import { Input, Pressable, Sheet, Text, type SheetController } from "@/components";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { useAddressSearch, type PickedPlace, type Suggestion } from "./useAddressSearch";

/** Search for a street, estate or landmark in Akure (05 §9 M1). */
export function AddressSearchSheet({ sheet, onPicked }: { sheet: SheetController; onPicked: (place: PickedPlace) => void }) {
  const { colors } = useTheme();
  const search = useAddressSearch();
  const [picking, setPicking] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const choose = async (s: Suggestion) => {
    setPicking(s.placeId);
    setPickError(null);
    try {
      const place = await search.pick(s);
      haptic.select();
      onPicked(place);
      sheet.dismiss();
    } catch (e) {
      setPickError(friendlyError(e, "We couldn't open that place. Try another result."));
    } finally {
      setPicking(null);
    }
  };

  const empty =
    search.query.trim().length < 2 ? (
      <Text variant="small" tone="muted" className="px-5 pt-2">
        Try a street, estate, school or well-known landmark.
      </Text>
    ) : search.loading ? null : search.error ? (
      <Text variant="small" tone="error" className="px-5 pt-2" accessibilityLiveRegion="polite">
        {search.error}
      </Text>
    ) : (
      <View className="px-5 pt-2 gap-1">
        <Text variant="bodyStrong">No matches in Akure</Text>
        <Text variant="small" tone="muted">
          Try a nearby landmark instead, then move the pin to your gate.
        </Text>
      </View>
    );

  return (
    <Sheet sheet={sheet} variant="list" title="Find your address" onDismiss={search.reset}>
      <View className="px-5 pb-3">
        <Input
          inSheet
          label="Search"
          placeholder="e.g. Alagbaka, FUTA South Gate"
          value={search.query}
          onChangeText={search.setQuery}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          leading={<MagnifyingGlass size={20} color={colors.inkFaint} />}
          trailing={search.loading ? <ActivityIndicator color={colors.brand} /> : undefined}
          error={pickError}
        />
      </View>
      <BottomSheetFlatList
        data={search.results}
        keyExtractor={(s: Suggestion) => s.placeId}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }: { item: Suggestion }) => (
          <Pressable
            onPress={() => void choose(item)}
            disabled={picking !== null}
            accessibilityRole="button"
            accessibilityLabel={`${item.primary}, ${item.secondary}`}
            className="flex-row items-center gap-3 px-5 py-3"
            style={{ minHeight: 60 }}
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-sunken">
              {picking === item.placeId ? <ActivityIndicator color={colors.brand} /> : <MapPin size={20} color={colors.ink} />}
            </View>
            <View className="flex-1">
              <Text variant="body" numberOfLines={1}>
                {item.primary}
              </Text>
              {item.secondary ? (
                <Text variant="small" tone="muted" numberOfLines={1}>
                  {item.secondary}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </Sheet>
  );
}
