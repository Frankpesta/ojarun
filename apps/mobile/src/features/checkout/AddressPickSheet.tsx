import { View } from "react-native";
import { router } from "expo-router";
import type { FunctionReturnType } from "convex/server";
import { Check, MapPin, Plus } from "phosphor-react-native";
import type { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { Button, Pressable, Sheet, Text, type SheetController } from "@/components";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

type Address = FunctionReturnType<typeof api.addresses.list>[number];

export function AddressPickSheet({
  sheet,
  addresses,
  selected,
  onSelect,
}: {
  sheet: SheetController;
  addresses: Address[];
  selected: Id<"addresses"> | undefined;
  onSelect: (id: Id<"addresses">) => void;
}) {
  const { colors } = useTheme();
  return (
    <Sheet
      sheet={sheet}
      title="Deliver to"
      footer={
        <Button
          label="Add a new address"
          variant="secondary"
          icon={Plus}
          onPress={() => {
            sheet.dismiss();
            router.push("/address");
          }}
        />
      }
    >
      <View className="overflow-hidden rounded-card border border-line bg-surface">
        {addresses.map((a, i) => {
          const on = a._id === selected;
          return (
            <Pressable
              key={a._id}
              scale={false}
              onPress={() => {
                haptic.select();
                onSelect(a._id);
                sheet.dismiss();
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${a.label}, ${a.formatted}`}
              className={`flex-row items-center gap-3 px-4 py-3.5 ${on ? "bg-brand-tint" : ""} ${i < addresses.length - 1 ? "border-b border-line-soft" : ""}`}
            >
              <View className={`h-10 w-10 items-center justify-center rounded-full ${on ? "bg-brand" : "bg-surface-sunken"}`}>
                {on ? <Check size={20} color={colors.onBrand} weight="bold" /> : <MapPin size={20} color={colors.ink} />}
              </View>
              <View className="flex-1">
                <Text variant="bodyStrong" style={{ fontSize: 15 }}>
                  {a.label}
                </Text>
                <Text variant="small" tone="faint" numberOfLines={1}>
                  {a.formatted}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
