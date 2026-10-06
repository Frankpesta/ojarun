import { View } from "react-native";
import { Text } from "@/components";

/**
 * Each order in a run gets a letter and a tint so the shopper can tell whose tomatoes are whose.
 * Like the produce stickers these are illustrations, so they stay the same in dark mode.
 */
const TINTS = ["#FFD9C7", "#D7E9FF", "#E8DDFB", "#FCE7A8", "#CDEFD8", "#F9D2E4"] as const;

export function orderLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

export function OrderBadge({ index, size = 40 }: { index: number; size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: TINTS[index % TINTS.length], alignItems: "center", justifyContent: "center" }}
    >
      <Text variant="smallStrong" tone="inherit" style={{ color: "#1A1714", fontSize: size * 0.38 }} className="font-extrabold">
        {orderLetter(index)}
      </Text>
    </View>
  );
}
